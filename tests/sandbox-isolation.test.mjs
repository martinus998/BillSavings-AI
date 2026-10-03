import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,createHmac,webcrypto} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
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

// Substitute a synthetic mailbox hash only inside the isolated test runtime.
// No real owner email, provider connection or outgoing email is used by these tests.
const approvedHash='89d68cd1ee5b015c6698ca143c8a698ac56b018d4690b56a61eff0041878d83d';
const fixtureEmail='owner@example.invalid';
const fixtureHash=createHash('sha256').update(fixtureEmail).digest('hex');
const signingSecret='synthetic-sandbox-secret';
const sandboxRedirect='https://billsavingsai.com/sandbox-checkout.html?access=ready';
const proof='cs_test_syntheticCheckoutSession123456789';

function handlerHarness(kind,{email=fixtureEmail,expired=false}={}){
  const source=read(`supabase/functions/sandbox-${kind}/index.ts`);
  assert.ok(source.includes(`const SANDBOX_OWNER_EMAIL_HASH = "${approvedHash}"`));
  const code=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'').replace(approvedHash,fixtureHash),{mode:'strip'});
  const now=Date.parse(expired?'2026-09-19T18:00:00Z':'2026-09-17T19:00:00Z');
  class TestDate extends Date { static now(){return now;} }
  let handler;
  const writes=[],sent=[];
  const receipt={session_hash:createHash('sha256').update(proof).digest('hex'),email,
    expires_at:'2026-09-20T00:00:00Z',attempts:0,next_attempt_at:'2026-09-17T00:00:00Z',email_sent_at:null};
  const client={
    rpc:async name=>{
      assert.ok(['billing_sandbox_webhook_secret','find_auth_user_id_by_email'].includes(name));
      return {data:name==='billing_sandbox_webhook_secret'?signingSecret:null,error:null};
    },
    auth:{
      getUser:async()=>({data:{user:null},error:null}),
      signInWithOtp:async args=>{sent.push(args);return {error:null};}
    },
    from(table){
      assert.match(table,/^billing_sandbox_/);
      let operation='select',value;
      const builder={
        select(){return this;},eq(){return this;},maybeSingle(){return this;},
        update(v){operation='update';value=v;return this;},
        upsert(v){operation='upsert';value=v;return this;},
        insert(v){operation='insert';value=v;return this;},
        delete(){operation='delete';return this;},
        then(resolve,reject){
          if(operation!=='select')writes.push({table,operation,value});
          if(kind==='billing-access'&&operation==='update')Object.assign(receipt,value);
          return Promise.resolve({data:kind==='billing-access'?{...receipt}:null,error:null}).then(resolve,reject);
        }
      };
      return builder;
    }
  };
  vm.runInNewContext(code,{crypto:webcrypto,TextEncoder,Response,Request,Date:TestDate,AbortSignal,
    console:{error(){}},createClient:()=>client,
    Deno:{env:{get:()=> 'synthetic'},serve:fn=>{handler=fn;}}
  });
  async function send(event,{signed=true}={}){
    const body=JSON.stringify(kind==='billing-access'?{session_id:proof,action:'send_link'}:event);
    const timestamp=String(Math.floor(now/1000));
    const signature=createHmac('sha256',signingSecret).update(timestamp+'.'+body).digest('hex');
    const headers=kind==='billing-access'?{origin:'https://billsavingsai.com'}:
      signed?{'stripe-signature':`t=${timestamp},v1=${signature}`} : {};
    const response=await handler(new Request('https://example.invalid/sandbox',{method:'POST',headers,body}));
    return {status:response.status,data:await response.json()};
  }
  return {send,writes,sent};
}

function testCheckout(email=fixtureEmail){
  return {id:'evt_synthetic_checkout',type:'checkout.session.completed',livemode:false,data:{object:{
    id:proof,customer_details:{email},customer:'cus_synthetic',subscription:'sub_synthetic',
    metadata:{plan:'premium'},payment_status:'paid'
  }}};
}

test('sandbox webhook creates receipts only for the approved mailbox before test expiry',async()=>{
  const allowed=handlerHarness('stripe-webhook');
  assert.equal((await allowed.send(testCheckout(' OWNER@example.invalid '))).status,200);
  assert.ok(allowed.writes.some(w=>w.table==='billing_sandbox_checkout_access'));
  for(const [options,event] of [
    [{},testCheckout('other@example.invalid')],
    [{expired:true},testCheckout()]
  ]){
    const blocked=handlerHarness('stripe-webhook',options);
    assert.equal((await blocked.send(event)).status,403);
    assert.equal(blocked.writes.length,0);
  }
  for(const [event,options] of [[testCheckout(),{signed:false}],[{...testCheckout(),livemode:true},{}]]){
    const blocked=handlerHarness('stripe-webhook');
    assert.equal((await blocked.send(event,options)).status,400);
    assert.equal(blocked.writes.length,0);
  }
});

test('sandbox sender refuses unapproved or expired receipts and uses only the sandbox callback',async()=>{
  for(const options of [{email:'other@example.invalid'},{expired:true}]){
    const blocked=handlerHarness('billing-access',options);
    assert.equal((await blocked.send()).status,403);
    assert.equal(blocked.sent.length,0);
    assert.equal(blocked.writes.length,0);
  }
  const allowed=handlerHarness('billing-access');
  assert.equal((await allowed.send()).data.state,'sent');
  assert.equal(allowed.sent.length,1);
  assert.equal(allowed.sent[0].email,fixtureEmail);
  assert.equal(allowed.sent[0].options.emailRedirectTo,sandboxRedirect);
});

test('sandbox page offers no direct OTP sender or manual sign-in bypass',()=>{
  const script=read('sandbox-checkout.js'),controller=read('sandbox-checkout-access.js');
  assert.doesNotMatch(script,/signInWithOtp|start\.html\?access=ready|signInBtn/);
  assert.doesNotMatch(controller,/\$\('email'\)|classList\.remove\('hidden'\)/);
  assert.match(controller,/\$\('accessManualBtn'\)\.hidden = true/);
  assert.match(read('sandbox-checkout.html'),/id="loginBox" class="hidden" hidden/);
});
