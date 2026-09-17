import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
test('generated sandbox handlers track the exact production sources',()=>{
  for(const [src,dest] of [['supabase/functions/stripe-webhook/index.ts','supabase/functions/sandbox-stripe-webhook/index.ts'],['supabase/functions/billing-access/index.ts','supabase/functions/sandbox-billing-access/index.ts'],['checkout-access.js','sandbox-checkout-access.js']]){
    assert.ok(read(dest).includes('sha256:'+createHash('sha256').update(read(src)).digest('hex')));
  }
});
test('sandbox handlers cannot write a production billing ledger or accept live proofs',()=>{
  const hook=read('supabase/functions/sandbox-stripe-webhook/index.ts');
  const access=read('supabase/functions/sandbox-billing-access/index.ts');
  for(const source of [hook,access]){
    assert.doesNotMatch(source,/\.from\("billing_(?!sandbox_)/);
    assert.doesNotMatch(source,/cs_live_|STRIPE_LIVE_WEBHOOK_SECRET|livemode:true/);
  }
  assert.match(hook,/event\?\.livemode!==false/);
  assert.match(hook,/verifyStripeSignature/);
  assert.match(hook,/billing_sandbox_webhook_secret/);
  assert.doesNotMatch(read('sandbox-checkout-access.js'),/cs_live_|'billsavings\.checkout-access'/);
});
test('sandbox ledger and secret are private and claims require confirmed mailbox ownership',()=>{
  const sql=read('supabase/migrations/20260917145528_stripe_sandbox_checkout_test.sql');
  assert.match(sql,/revoke all on function public\.billing_sandbox_webhook_secret\(\) from public, anon, authenticated/);
  assert.match(sql,/email_confirmed_at is not null/);
  assert.match(sql,/auth\.uid\(\)/);
  assert.equal((sql.match(/check \(livemode = false\)/g)||[]).length,2);
  assert.doesNotMatch(sql,/insert into public\.billing_subscriptions|update public\.billing_subscriptions/);
});
