import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const ORIGINS = new Set(["https://billsavingsai.com", "https://www.billsavingsai.com"]);
const REDIRECT = "https://billsavingsai.com/start.html?access=ready";
const MAX_ATTEMPTS = 5;
const COOLDOWN_MS = 60_000;

// Custom authentication: an unguessable Checkout Session ID must match a
// service-only receipt written by the signed, live Stripe webhook. This proof
// can send a link ONLY to the verified checkout email; it cannot sign in a user.
// Supabase Auth verifies mailbox ownership and normal entitlement checks apply.
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json", "Cache-Control": "no-store",
    "Vary": "Origin", "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey"
  };
  if (ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers});
  if (!ORIGINS.has(origin)) return json({error: "Origin not allowed"}, 403);
  if (req.method === "OPTIONS") return new Response(null, {status: 204, headers});
  if (req.method !== "POST") return json({error: "Method not allowed"}, 405);

  let body: any;
  try {
    const raw = await req.text();
    if (raw.length > 1024) return json({error: "Invalid request"}, 400);
    body = JSON.parse(raw);
  } catch { return json({error: "Invalid request"}, 400); }
  if (!/^cs_live_[A-Za-z0-9]{20,240}$/.test(body?.session_id || "") ||
      !["status", "send_link"].includes(body?.action)) return json({error: "Invalid request"}, 400);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !serviceKey || !anonKey) return json({error: "Access temporarily unavailable"}, 503);
  const options = {auth: {persistSession: false, autoRefreshToken: false}, global: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, {...init, signal: AbortSignal.timeout(10_000)})
  }};
  const admin = createClient(url, serviceKey, options);
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body.session_id)))].map(b => b.toString(16).padStart(2, "0")).join("");
  try {
    const {data: receipt, error} = await admin.from("billing_checkout_access")
      .select("email,expires_at,attempts,next_attempt_at,email_sent_at").eq("session_hash", hash).maybeSingle();
    if (error) throw new Error("receipt read failed");
    // Missing receipts can also mean that the paid webhook is still on its way.
    if (!receipt) return json({state: "pending"}, 202);
    if (Date.parse(receipt.expires_at) <= Date.now()) return json({state: "expired"}, 410);
    const [local, domain] = receipt.email.split("@");
    const emailHint = `${local.slice(0, 1)}***@${domain.slice(0, 1)}***`;
    let accountMatches = false;
    const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
    if (token) {
      const {data, error: userError} = await admin.auth.getUser(token);
      accountMatches = !userError && !!data.user?.email_confirmed_at && data.user.email?.toLowerCase() === receipt.email;
    }
    const info = {email_hint: emailHint, account_matches: accountMatches};
    if (accountMatches) return json({...info, state: "account_ready"});
    if (body.action === "status") return json({...info, state: receipt.email_sent_at ? "sent" : "ready"});
    // Refreshes and parallel tabs do not trigger another email automatically.
    if (receipt.email_sent_at && body.resend !== true) return json({...info, state: "sent"});
    if (receipt.attempts >= MAX_ATTEMPTS) return json({...info, state: "limit_reached"}, 429);
    const wait = Math.ceil((Date.parse(receipt.next_attempt_at) - Date.now()) / 1000);
    if (wait > 0) return json({...info, state: "cooldown", retry_after: wait}, 429);

    // Compare-and-set prevents concurrent requests from spending the same slot.
    const attempt = receipt.attempts + 1;
    const {data: locked, error: lockError} = await admin.from("billing_checkout_access")
      .update({attempts: attempt, next_attempt_at: new Date(Date.now() + COOLDOWN_MS).toISOString()})
      .eq("session_hash", hash).eq("attempts", receipt.attempts).select("session_hash").maybeSingle();
    if (lockError) throw new Error("delivery lock failed");
    if (!locked) return json({...info, state: "cooldown", retry_after: 60}, 429);
    const auth = createClient(url, anonKey, options);
    const {error: sendError} = await auth.auth.signInWithOtp({email: receipt.email, options: {emailRedirectTo: REDIRECT}});
    if (sendError) return json({...info, state: "delivery_unavailable", retry_after: 60}, 503);
    const {error: saveError} = await admin.from("billing_checkout_access")
      .update({email_sent_at: new Date().toISOString()}).eq("session_hash", hash).eq("attempts", attempt);
    if (saveError) throw new Error("delivery status write failed");
    return json({...info, state: "sent", retry_after: 60});
  } catch {
    // Do not log the checkout proof, email, JWT or provider response.
    return json({state: "unavailable", retry_after: 60}, 503);
  }
});
