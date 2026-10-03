import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';

const source=readFileSync(new URL('../checkout.js',import.meta.url),'utf8').replace("await timeout(import('./account-session.js'))",'({supabase: testSupabase})');
const sessionId='cs_live_syntheticCheckoutSession123456789';
const checkoutUrl='https://checkout.stripe.com/c/pay/'+sessionId;
const storage=()=>{const map=new Map();return {map,getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
async function setup({search='?plan=premium',hash='',signedIn=false,authError=false,response,offline=false,sessionStore,localStore}={}) {
 const elements=new Map(),requests=[],assigned=[],replaced=[],authCalls=[];const ss=sessionStore||storage(),ls=localStore||storage();
 if(signedIn)ss.setItem('billsavings.account.v1','synthetic-account');
 const element=id=>{if(!elements.has(id)){const handlers=new Map();elements.set(id,{textContent:'',hidden:true,addEventListener:(e,f)=>handlers.set(e,f),click:()=>handlers.get('click')?.()});}return elements.get(id);};
 const qr={};class PaymentQr{constructor(c){Object.assign(qr,c);this.hasPending=false;}prepare(option){return qr.create({option,attempt:'9b891fbc-400f-49a1-a8a7-5f9453fa9d3b',token:'a'.repeat(64)});}resume(){return this.prepare('premium');}}
 const supabase={auth:{getSession:async()=>{authCalls.push('getSession');return {data:{session:{access_token:'synthetic-account-token'}},error:authError?{}:null};}}};
 const location={origin:'https://billsavingsai.com',search,hash,replace:u=>replaced.push(u),assign:u=>assigned.push(u)};
 vm.runInNewContext(source,{crypto:webcrypto,URL,URLSearchParams,Date,AbortSignal,location,sessionStorage:ss,localStorage:ls,document:{getElementById:element},PaymentQr,testSupabase:supabase,setTimeout:()=>1,
 fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body),headers:options.headers});if(offline)throw new Error('offline');return response||{ok:true,json:async()=>({ok:true,url:checkoutUrl,session_id:sessionId,expires_at:Math.floor(Date.now()/1000)+86400,amount:search.includes('family')?499:199})};}});
 await new Promise(setImmediate);await new Promise(setImmediate);
 return {element,requests,assigned,replaced,authCalls,qr,ss,ls};
}
test('guest Premium and Family go directly to the genuine Stripe checkout at the advertised monthly prices',async()=>{
 for(const plan of ['premium','family']){const x=await setup({search:'?plan='+plan});assert.deepEqual(x.assigned,[checkoutUrl]);assert.equal(x.requests.length,1);assert.equal(x.requests[0].body.plan,plan);assert.equal(x.requests[0].headers.Authorization,undefined);assert.equal(x.authCalls.length,0);assert.match(x.element('selectedPrice').textContent,plan==='premium'?/1\.99 \/ month/:/4\.99 \/ month/);assert.equal(x.ls.map.has('billsavings.purchase-plan'),true);}
});
test('saved accounts send their current access token for server-side duplicate-subscription checks',async()=>{const x=await setup({signedIn:true});assert.deepEqual(x.authCalls,['getSession']);assert.equal(x.requests[0].headers.Authorization,'Bearer synthetic-account-token');assert.doesNotMatch(JSON.stringify(x.requests[0].body),/user_id|email|access_token/);});
test('an unresolved saved account blocks payment; an existing subscription opens the account',async()=>{const x=await setup({signedIn:true,authError:true});assert.equal(x.requests.length+x.assigned.length,0);const y=await setup({signedIn:true,response:{ok:false,json:async()=>({error:'already_subscribed'})}});assert.equal(y.assigned.length,0);assert.deepEqual(y.replaced,['/start.html?access=ready']);});
test('invalid plans and authentication/payment returns never start another checkout',async()=>{for(const search of ['','?plan=free','?plan=__proto__','?session_id='+sessionId]){const x=await setup({search});assert.equal(x.requests.length,0);assert.equal(x.replaced.length,1);}for(const hash of ['#access_token=synthetic','#error=access_denied','#refresh_token=synthetic']){const x=await setup({hash});assert.equal(x.requests.length,0);assert.match(x.replaced[0],/\/start\.html/);}});
test('QR route creates a bound hosted session without redirecting before the QR is shown',async()=>{const x=await setup({search:'?plan=premium&method=qr'});assert.equal(x.assigned.length,0);assert.equal(x.requests[0].body.checkout_channel,'qr');assert.match(x.requests[0].body.token,/^[a-f0-9]{64}$/);assert.match(x.qr.note,/email.*checkout/);const result=await x.qr.status('checkout_status',{session_id:sessionId,token:'a'.repeat(64)});assert.equal(result.ok,true);assert.equal(x.requests[1].body.session_id,sessionId);});
test('retry after a lost response reuses the same request and owner rather than a second order',async()=>{const x=await setup({offline:true});await x.element('checkoutRetry').click();assert.equal(x.requests.length,2);assert.equal(x.requests[0].body.attempt,x.requests[1].body.attempt);assert.equal(x.requests[0].body.token,x.requests[1].body.token);const y=await setup({offline:true,sessionStore:x.ss});assert.equal(x.requests[0].body.attempt,y.requests[0].body.attempt);});
test('malicious checkout targets are rejected before navigation',async()=>{for(const url of ['https://evil.invalid/c/pay/'+sessionId,'https://user@checkout.stripe.com/c/pay/'+sessionId,'https://checkout.stripe.com/c/pay/cs_live_differentSessionId']){const x=await setup({response:{ok:true,json:async()=>({url,session_id:sessionId})}});assert.equal(x.assigned.length,0);assert.equal(x.element('checkoutRetry').hidden,false);}});
