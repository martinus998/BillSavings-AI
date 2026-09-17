import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const PREMIUM_PAYMENT_LINK = "plink_1UFUpgBVUFmkZjNklE0nIKnS";
const FAMILY_PAYMENT_LINK = "plink_1UFUprBVUFmkZjNk4wfvTX5i";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BLOCKING_STATUSES = new Set(["active","trialing","past_due","unpaid","incomplete","paused"]);

const encoder = new TextEncoder();
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
function hex(bytes: ArrayBuffer) { return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join(""); }
function safeEqual(a: string, b: string) { if (a.length !== b.length) return false; let out=0; for(let i=0;i<a.length;i++) out |= a.charCodeAt(i)^b.charCodeAt(i); return out===0; }
async function verifyStripeSignature(rawBody:string, header:string, secret:string){
  const parts=header.split(",").map(v=>v.trim());
  const timestamp=parts.find(v=>v.startsWith("t="))?.slice(2);
  const signatures=parts.filter(v=>v.startsWith("v1=")).map(v=>v.slice(3));
  if(!timestamp||!signatures.length)return false;
  const age=Math.abs(Math.floor(Date.now()/1000)-Number(timestamp)); if(!Number.isFinite(age)||age>300)return false;
  const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const digest=await crypto.subtle.sign("HMAC",key,encoder.encode(`${timestamp}.${rawBody}`));
  const expected=hex(digest); return signatures.some(sig=>safeEqual(sig,expected));
}
function idOf(v:any){ return typeof v==="string"?v:v?.id||null; }
function planFromObject(obj:any){
  const p=String(obj?.metadata?.plan||"").toLowerCase();
  if(p==="family") return "family";
  if(p==="premium") return "premium";

  // Hosted Payment Links are the production checkout surface. Fall back to the
  // immutable Payment Link id so a missing/changed metadata field can never
  // result in a successful charge that fails to unlock the customer's plan.
  const paymentLink=idOf(obj?.payment_link);
  if(paymentLink===FAMILY_PAYMENT_LINK) return "family";
  if(paymentLink===PREMIUM_PAYMENT_LINK) return "premium";
  return "free";
}

async function checked<T>(operation: PromiseLike<{data: T; error: any}>, label: string): Promise<T> {
  const {data, error} = await operation;
  if (error) {
    console.error("billing database operation failed", label, error.code || "unknown");
    throw new Error(label);
  }
  return data;
}

async function accountCheckoutOwner(admin:any, obj:any): Promise<{userId:string; email:string; subscription:any}|null> {
  const metadata=obj?.metadata;
  if(!metadata||!Object.prototype.hasOwnProperty.call(metadata,"account_checkout"))return null;
  const userId=metadata.user_id;
  // This marker is written only by the authenticated account-checkout endpoint.
  // Malformed tagged sessions must never fall back to the editable Stripe email.
  if(metadata.account_checkout!=="v1"||typeof userId!=="string"||!UUID.test(userId)||
     obj.client_reference_id!==userId||!["premium","family"].includes(metadata.plan)){
    throw new Error("Invalid account checkout identity");
  }
  // Capture before the Auth lookup so a concurrent billing lifecycle event cannot
  // be replaced by a checkout result based on an older account snapshot.
  const subscription=await checked(admin.from("billing_subscriptions")
    .select("stripe_subscription_id,status,livemode,updated_at").eq("user_id",userId).maybeSingle(),"read account subscription");
  const data:any=await checked(admin.auth.admin.getUserById(userId),"verify checkout account");
  const user=data?.user;
  const email=typeof user?.email==="string"?user.email.trim().toLowerCase():"";
  if(!user||user.id!==userId||user.is_anonymous||!user.email_confirmed_at||!email){
    throw new Error("Account checkout requires a confirmed account");
  }
  return {userId,email,subscription};
}

async function saveAccountSubscription(admin:any, owner:any, row:any): Promise<void> {
  const existing=owner.subscription;
  if(existing?.livemode===true&&existing.stripe_subscription_id!==row.stripe_subscription_id&&
     BLOCKING_STATUSES.has(existing.status))throw new Error("Account already has another subscription");
  // A late checkout event is not authority to undo a later renewal, failed
  // invoice or cancellation for a subscription already recorded on the account.
  if(existing?.livemode===true&&existing.stripe_subscription_id===row.stripe_subscription_id&&
     existing.status!=="incomplete")return;
  let operation;
  if(existing){
    if(!existing.updated_at)throw new Error("Missing subscription version");
    operation=admin.from("billing_subscriptions").update(row)
      .eq("user_id",owner.userId).eq("updated_at",existing.updated_at);
    operation=existing.stripe_subscription_id
      ?operation.eq("stripe_subscription_id",existing.stripe_subscription_id)
      :operation.is("stripe_subscription_id",null);
  }else{
    operation=admin.from("billing_subscriptions").upsert(row,{onConflict:"user_id",ignoreDuplicates:true});
  }
  const saved=await checked(operation.select("user_id").maybeSingle(),"save account subscription");
  if(!saved)throw new Error("Account subscription changed during checkout");
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const supabaseUrl=Deno.env.get("SUPABASE_URL");
  const serviceRoleKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const webhookSecret=Deno.env.get("STRIPE_LIVE_WEBHOOK_SECRET");
  if(!supabaseUrl||!serviceRoleKey||!webhookSecret)return json({error:"Backend configuration error"},500);
  const rawBody=await req.text();
  const valid=await verifyStripeSignature(rawBody,req.headers.get("stripe-signature")||"",webhookSecret);
  if(!valid)return json({error:"Invalid signature"},400);
  let event:any; try{event=JSON.parse(rawBody)}catch{return json({error:"Invalid payload"},400)}
  if(event?.livemode!==true)return json({error:"Live events only"},400);
  const eventId=String(event?.id||""); const type=String(event?.type||""); if(!eventId||!type)return json({error:"Invalid event"},400);
  const admin=createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const obj=event?.data?.object||{};
  try{
    const already=await checked(admin.from("billing_webhook_events").select("id").eq("id",eventId).maybeSingle(),"read webhook receipt");
    if(already)return json({ok:true,duplicate:true});
    if(type==="checkout.session.completed"||type==="checkout.session.async_payment_succeeded"){
      const accountOwner=await accountCheckoutOwner(admin,obj);
      const email=accountOwner?.email||String(obj?.customer_details?.email||obj?.customer_email||"").trim().toLowerCase();
      const subscriptionId=idOf(obj?.subscription); const customerId=idOf(obj?.customer); const plan=planFromObject(obj);
      const activeStatus=(obj?.payment_status==="paid"||obj?.payment_status==="no_payment_required")?"active":"incomplete";
      if(plan==="premium"||plan==="family"){
        if(!email||!subscriptionId||!customerId)throw new Error("Paid checkout is missing customer identity");
        const userId=accountOwner?.userId||await checked(admin.rpc("find_auth_user_id_by_email",{p_email:email}),"find checkout user");
        if(userId){
          const row={user_id:userId,stripe_customer_id:customerId,stripe_subscription_id:subscriptionId,plan,status:activeStatus,livemode:true,updated_at:new Date().toISOString()};
          if(accountOwner)await saveAccountSubscription(admin,accountOwner,row);
          else await checked(admin.from("billing_subscriptions").upsert(row,{onConflict:"user_id"}),"save subscription");
          await checked(admin.from("billing_pending_entitlements").delete().eq("stripe_subscription_id",subscriptionId),"remove claimed entitlement");
        }else{
          await checked(admin.from("billing_pending_entitlements").upsert({email,stripe_customer_id:customerId,stripe_subscription_id:subscriptionId,plan,status:activeStatus,livemode:true,updated_at:new Date().toISOString()},{onConflict:"stripe_subscription_id"}),"save pending entitlement");
        }
        // A verified paid session may request an email, never an authenticated
        // session. Keep only its hash and preserve delivery state across retries.
        if(activeStatus==="active"){
          const sessionId=String(obj?.id||"");
          if(!/^cs_live_[A-Za-z0-9]{20,240}$/.test(sessionId))throw new Error("Missing checkout session identity");
          const sessionHash=hex(await crypto.subtle.digest("SHA-256",encoder.encode(sessionId)));
          await checked(admin.from("billing_checkout_access").upsert({session_hash:sessionHash,email},{onConflict:"session_hash",ignoreDuplicates:true}),"save checkout access receipt");
        }
      }
    }

    if(type.startsWith("customer.subscription.")){
      const subId=String(obj?.id||""); const customerId=idOf(obj?.customer); const plan=planFromObject(obj);
      const status=type==="customer.subscription.deleted"?"canceled":String(obj?.status||"inactive");
      const endUnix=obj?.items?.data?.[0]?.current_period_end||obj?.current_period_end||null;
      const currentPeriodEnd=endUnix?new Date(Number(endUnix)*1000).toISOString():null;
      let existing:any=null;
      if(subId){ existing=await checked(admin.from("billing_subscriptions").select("user_id").eq("stripe_subscription_id",subId).maybeSingle(),"find subscription"); }
      if(!existing&&customerId){ existing=await checked(admin.from("billing_subscriptions").select("user_id").eq("stripe_customer_id",customerId).maybeSingle(),"find customer subscription"); }
      if(existing?.user_id){
        const patch:any={stripe_customer_id:customerId,stripe_subscription_id:subId||null,status,current_period_end:currentPeriodEnd,livemode:true,updated_at:new Date().toISOString()};
        if(status==="canceled")patch.plan="free"; else if(plan==="premium"||plan==="family")patch.plan=plan;
        await checked(admin.from("billing_subscriptions").update(patch).eq("user_id",existing.user_id),"update subscription");
      }else if(subId||customerId){
        const patch:any={status,current_period_end:currentPeriodEnd,updated_at:new Date().toISOString()};
        if(status==="canceled")patch.status="canceled"; if(plan==="premium"||plan==="family")patch.plan=plan;
        let q=admin.from("billing_pending_entitlements").update(patch);
        q=subId?q.eq("stripe_subscription_id",subId):q.eq("stripe_customer_id",customerId);
        await checked(q,"update pending subscription");
      }
    }

    if(type==="invoice.payment_failed"||type==="invoice.paid"){
      const subId=idOf(obj?.subscription)||obj?.parent?.subscription_details?.subscription||obj?.subscription_details?.subscription||null;
      if(subId){
        const status=type==="invoice.paid"?"active":"past_due";
        await checked(admin.from("billing_subscriptions").update({status,updated_at:new Date().toISOString()}).eq("stripe_subscription_id",subId),"update invoice subscription");
        await checked(admin.from("billing_pending_entitlements").update({status,updated_at:new Date().toISOString()}).eq("stripe_subscription_id",subId),"update invoice pending entitlement");
      }
    }

    await checked(admin.from("billing_webhook_events").insert({id:eventId,type}),"record completed webhook");
    return json({ok:true});
  }catch(err){ console.error("stripe-webhook processing failed",err); return json({error:"Webhook processing failed"},500); }
});
