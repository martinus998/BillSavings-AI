import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const ORIGINS = new Set(["https://billsavingsai.com", "https://www.billsavingsai.com"]);
const STRIPE_VERSION = "2026-07-29.dahlia";
const RETURN_URL = "https://billsavingsai.com/start.html?account_checkout=return&session_id={CHECKOUT_SESSION_ID}";
const PRICES = {
  premium: {id: "price_1UFUoGBVUFmkZjNkG7vyLCFo", amount: 899},
  family: {id: "price_1UFUoUBVUFmkZjNk18GxhWCs", amount: 1399}
};
const BLOCKING_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]);
const SESSION_ID = /^cs_live_[A-Za-z0-9]{20,240}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Identifies this integration, not an individual buyer. Keep stable for retries.
const INTEGRATION_IDENTIFIER = "billsavings_account_kzryatpw";

function idOf(value: any): string | null {
  return typeof value === "string" ? value : value?.id || null;
}
function validPlan(value: unknown): value is keyof typeof PRICES {
  return value === "premium" || value === "family";
}
function ownedMetadata(value: any, userId: string, plan: string): boolean {
  return value?.metadata?.account_checkout === "v1" &&
    value.metadata.user_id === userId && value.metadata.plan === plan;
}
function validItems(items: any, plan: keyof typeof PRICES): boolean {
  const item = items?.data?.[0];
  const price = item?.price;
  return items?.has_more === false && items.data.length === 1 && item.quantity === 1 &&
    price?.id === PRICES[plan].id && price.livemode === true && price.currency === "usd" &&
    price.unit_amount === PRICES[plan].amount && price.recurring?.interval === "month" &&
    price.recurring.interval_count === 1;
}
async function readBody(req: Request): Promise<any> {
  if (!req.body) throw new Error("Missing body");
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let raw = "", bytes = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2048) { await reader.cancel(); throw new Error("Oversized body"); }
      raw += decoder.decode(value, {stream: true});
    }
    raw += decoder.decode();
    return JSON.parse(raw);
  } finally { reader.releaseLock(); }
}

// Passwords and card data never reach this endpoint. Supabase Auth verifies the
// account; Stripe owns the embedded card fields and confirms payment server-side.
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey"
  };
  if (ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers});
  if (!ORIGINS.has(origin)) return json({error: "Origin not allowed"}, 403);
  if (req.method === "OPTIONS") return new Response(null, {status: 204, headers});
  if (req.method !== "GET" && req.method !== "POST") return json({error: "Method not allowed"}, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  // Separate configuration prevents enabling the legacy checkout endpoint when
  // this authenticated account checkout is provisioned.
  const secret = Deno.env.get("BILLSAVINGS_ACCOUNT_STRIPE_LIVE_KEY") || "";
  const publishableKey = Deno.env.get("BILLSAVINGS_ACCOUNT_STRIPE_LIVE_PUBLISHABLE_KEY") || "";
  const configured = !!url && !!serviceKey && /^(?:rk|sk)_live_[A-Za-z0-9]{16,}$/.test(secret) &&
    /^pk_live_[A-Za-z0-9]{16,}$/.test(publishableKey);
  if (req.method === "GET") return json(configured ? {configured, publishable_key: publishableKey} : {configured});
  if (!configured) return json({state: "unavailable"}, 503);

  const token = req.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) return json({error: "Sign in required"}, 401);
  const admin = createClient(url!, serviceKey!, {
    auth: {persistSession: false, autoRefreshToken: false},
    global: {fetch: (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, {...init, signal: AbortSignal.timeout(10_000)})}
  });
  try {
    const {data, error} = await admin.auth.getUser(token);
    const user = data?.user;
    if (error || !user || !UUID.test(user.id) || user.is_anonymous || !user.email)
      return json({error: "Sign in required"}, 401);
    if (!user.email_confirmed_at) return json({error: "Confirm your email first"}, 403);

    let body: any;
    try { body = await readBody(req); } catch { return json({error: "Invalid request"}, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        !["create", "status"].includes(body.action)) return json({error: "Invalid request"}, 400);

    async function stripe(path: string, params?: URLSearchParams, idempotencyKey?: string): Promise<any> {
      const response = await fetch(`https://api.stripe.com/v1/${path}`, {
        method: params ? "POST" : "GET",
        headers: {Authorization: `Bearer ${secret}`, "Stripe-Version": STRIPE_VERSION,
          ...(params ? {"Content-Type": "application/x-www-form-urlencoded"} : {}),
          ...(idempotencyKey ? {"Idempotency-Key": idempotencyKey} : {})},
        body: params?.toString(), signal: AbortSignal.timeout(15_000)
      });
      if (!response.ok) throw new Error("Stripe unavailable");
      return response.json();
    }

    if (body.action === "create") {
      if (!validPlan(body.plan) || typeof body.request_id !== "string" || !UUID.test(body.request_id))
        return json({error: "Invalid request"}, 400);
      const {data: existing, error: readError} = await admin.from("billing_subscriptions")
        .select("status,livemode").eq("user_id", user.id).maybeSingle();
      if (readError) throw new Error("Subscription lookup unavailable");
      if (existing?.livemode === true && BLOCKING_STATUSES.has(existing.status))
        return json({state: "already_subscribed"}, 409);

      const plan = body.plan;
      const params = new URLSearchParams({
        mode: "subscription", ui_mode: "embedded_page", locale: "auto",
        redirect_on_completion: "always", return_url: RETURN_URL,
        "line_items[0][price]": PRICES[plan].id, "line_items[0][quantity]": "1",
        client_reference_id: user.id, customer_email: user.email,
        integration_identifier: INTEGRATION_IDENTIFIER
      });
      for (const prefix of ["metadata", "subscription_data[metadata]"]) {
        params.set(`${prefix}[user_id]`, user.id);
        params.set(`${prefix}[account_checkout]`, "v1");
        params.set(`${prefix}[plan]`, plan);
      }
      const session = await stripe("checkout/sessions", params,
        `account-checkout:${user.id}:${body.request_id.toLowerCase()}:${plan}`);
      if (session?.livemode !== true || !SESSION_ID.test(session.id || "") ||
          session.mode !== "subscription" || session.ui_mode !== "embedded_page" ||
          session.client_reference_id !== user.id || !ownedMetadata(session, user.id, plan) ||
          typeof session.client_secret !== "string" || !session.client_secret.startsWith(`${session.id}_secret_`))
        throw new Error("Invalid checkout response");
      return json({client_secret: session.client_secret, session_id: session.id});
    }

    if (typeof body.session_id !== "string" || !SESSION_ID.test(body.session_id))
      return json({error: "Invalid request"}, 400);
    // Capture before the Stripe read so a concurrent webhook cannot be overwritten
    // by this request's older snapshot of the subscription.
    const {data: existing, error: readError} = await admin.from("billing_subscriptions")
      .select("stripe_subscription_id,status,livemode,updated_at").eq("user_id", user.id).maybeSingle();
    if (readError) throw new Error("Subscription lookup unavailable");
    const session = await stripe(`checkout/sessions/${encodeURIComponent(body.session_id)}?expand[]=subscription&expand[]=line_items`);
    const plan = session?.metadata?.plan;
    if (session?.id !== body.session_id || session.livemode !== true || session.mode !== "subscription" ||
        session.ui_mode !== "embedded_page" || session.client_reference_id !== user.id ||
        !validPlan(plan) || !ownedMetadata(session, user.id, plan))
      return json({state: "unavailable"}, 404);
    if (session.status === "expired") return json({state: "expired"}, 410);
    if (session.status !== "complete" || session.payment_status !== "paid")
      return json({state: "pending"}, 202);

    const subscription = session.subscription;
    if (!subscription || typeof subscription !== "object" || subscription.livemode !== true ||
        !/^sub_[A-Za-z0-9]+$/.test(subscription.id || "") ||
        !ownedMetadata(subscription, user.id, plan) ||
        !validItems(session.line_items, plan) || !validItems(subscription.items, plan) ||
        !/^cus_[A-Za-z0-9]+$/.test(idOf(session.customer) || "") ||
        idOf(subscription.customer) !== idOf(session.customer))
      return json({state: "unavailable"}, 404);
    if (!["active", "trialing"].includes(subscription.status)) return json({state: "pending"}, 202);
    const periodEnd = subscription.items.data[0].current_period_end || subscription.current_period_end;
    if (!Number.isSafeInteger(periodEnd) || periodEnd <= Math.floor(Date.now() / 1000))
      return json({state: "pending"}, 202);

    // An old paid-session URL must not replace a newer subscription on this account.
    if (existing?.livemode === true && existing.stripe_subscription_id !== subscription.id &&
        BLOCKING_STATUSES.has(existing.status)) return json({state: "already_subscribed"}, 409);
    const row = {
      user_id: user.id, stripe_customer_id: idOf(session.customer),
      stripe_subscription_id: subscription.id, plan, status: subscription.status,
      current_period_end: new Date(periodEnd * 1000).toISOString(), livemode: true,
      updated_at: new Date().toISOString()
    };
    let write;
    if (existing) {
      if (typeof existing.updated_at !== "string") throw new Error("Invalid subscription snapshot");
      write = admin.from("billing_subscriptions").update(row).eq("user_id", user.id)
        .eq("updated_at", existing.updated_at);
      write = existing.stripe_subscription_id === null ? write.is("stripe_subscription_id", null) :
        write.eq("stripe_subscription_id", existing.stripe_subscription_id);
    } else {
      // A row inserted since our read belongs to a newer request/webhook. Preserve it.
      write = admin.from("billing_subscriptions").upsert(row, {onConflict: "user_id", ignoreDuplicates: true});
    }
    const {data: saved, error: writeError} = await write.select("user_id").maybeSingle();
    if (writeError || !saved) throw new Error("Subscription update unavailable");
    return json({state: "paid", plan});
  } catch {
    // No JWTs, emails, checkout secrets, session IDs or provider bodies in logs.
    return json({state: "unavailable"}, 503);
  }
});
