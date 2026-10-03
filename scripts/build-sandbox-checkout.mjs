// Reproduce the production checkout handlers against an isolated sandbox ledger.
// This generates separate files; production code and live Stripe links stay intact.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root = new URL('../', import.meta.url);
const sandboxGuard = `const SANDBOX_OWNER_EMAIL_HASH = "89d68cd1ee5b015c6698ca143c8a698ac56b018d4690b56a61eff0041878d83d";
const SANDBOX_TEST_EXPIRES_AT = Date.parse("2026-09-19T18:00:00Z");
const SANDBOX_REDIRECT = "https://billsavingsai.com/sandbox-checkout.html?access=ready";
async function sandboxEmailAllowed(email: unknown) {
  if (Date.now() >= SANDBOX_TEST_EXPIRES_AT || typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
  return hash === SANDBOX_OWNER_EMAIL_HASH;
}
`;
const sources = [
  ['supabase/functions/stripe-webhook/index.ts','supabase/functions/sandbox-stripe-webhook/index.ts'],
  ['supabase/functions/billing-access/index.ts','supabase/functions/sandbox-billing-access/index.ts'],
  ['checkout-access.js','sandbox-checkout-access.js']
];
for (const [src,dest] of sources) {
  const original=readFileSync(new URL(src,root),'utf8');
  let code=original.replaceAll('cs_live_','cs_test_')
    .replaceAll('billing_webhook_events','billing_sandbox_webhook_events')
    .replaceAll('billing_subscriptions','billing_sandbox_subscriptions')
    .replaceAll('billing_pending_entitlements','billing_sandbox_pending_entitlements')
    .replaceAll('billing_checkout_access','billing_sandbox_checkout_access')
    .replaceAll('billsavings.checkout-access','billsavings.sandbox.checkout-access');
  if(src.includes('stripe-webhook/')) {
    code=code.replace('npm:@supabase/supabase-js@2"','npm:@supabase/supabase-js@2.116.0"')
      .replace('const PREMIUM_PAYMENT_LINK', sandboxGuard+'\nconst PREMIUM_PAYMENT_LINK')
      .replace('const webhookSecret=Deno.env.get("STRIPE_LIVE_WEBHOOK_SECRET");',
        'if(!supabaseUrl||!serviceRoleKey)return json({error:"Backend configuration error"},500);\n  const {data:webhookSecret,error:secretError}=await createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}}).rpc("billing_sandbox_webhook_secret");\n  if(secretError)return json({error:"Backend configuration error"},500);')
      .replace('event?.livemode!==true','event?.livemode!==false')
      .replaceAll('livemode:true','livemode:false')
      .replace('Live events only','Sandbox events only')
      .replace('const PREMIUM_PAYMENT_LINK = "plink_1UFUpgBVUFmkZjNklE0nIKnS";','const PREMIUM_PAYMENT_LINK = "SANDBOX_METADATA_PLAN_REQUIRED";')
      .replace('const FAMILY_PAYMENT_LINK = "plink_1UFUprBVUFmkZjNk4wfvTX5i";','const FAMILY_PAYMENT_LINK = "SANDBOX_FAMILY_METADATA_PLAN_REQUIRED";');
    code=code.replace('      const subscriptionId=idOf(obj?.subscription);',
        '      if(!await sandboxEmailAllowed(email))return json({error:"Sandbox test unavailable"},403);\n      const subscriptionId=idOf(obj?.subscription);');
  } else if(src.includes('billing-access/')) {
    code=code.replace('const ORIGINS',sandboxGuard+'\nconst ORIGINS')
      .replace('const REDIRECT = "https://billsavingsai.com/start.html?access=ready";', 'const REDIRECT = SANDBOX_REDIRECT;')
      .replace('    if (Date.parse(receipt.expires_at)',
        '    if (!await sandboxEmailAllowed(receipt.email)) return json({state: "unavailable"}, 403);\n    if (Date.parse(receipt.expires_at)')
      .replace('signed, live Stripe webhook', 'signed sandbox Stripe webhook');
  } else {
    code=code.replace(`  $('accessManualBtn').addEventListener('click', () => {
    manual = true; $('loginBox').classList.remove('hidden'); $('email').focus();
  });`, "  $('accessManualBtn').hidden = true;")
      .replaceAll("manual = true; $('loginBox').classList.remove('hidden');", "$('loginBox').classList.add('hidden');")
      .replace('Use the email from checkout in the sign-in form below. Your purchase is still linked to that email. For help, contact support.',
        'This test access link is unavailable. Ask the test operator to check the sandbox.')
      .replace('Check your inbox, then try again in a minute or use email sign-in below.',
        'Check your inbox, then try again in a minute or ask the test operator for help.')
      .replace('You can also sign in with your checkout email below.',
        'The test operator can check this session if the problem continues.')
      .replace('Sign in below with the email used at checkout. If you paid, you do not need to pay again.',
        'Start a new sandbox checkout with the approved test email. No real payment is needed.')
      .replace('Keep manual sign-in available, without repeating its form by default.',
        'Direct email sign-in is disabled on this owner-only test page.');
  }
  const hash=createHash('sha256').update(original).digest('hex');
  code=`// GENERATED by scripts/build-sandbox-checkout.mjs from ${src} sha256:${hash}\n`+code;
  const url=new URL(dest,root); mkdirSync(new URL('./',url),{recursive:true}); writeFileSync(url,code);
}
