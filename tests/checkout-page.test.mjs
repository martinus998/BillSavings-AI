import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../checkout.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
async function setup({configured=true,user={id:'owner',email:'owner@example.invalid',email_confirmed_at:'now'},failed=false,recovery=false,duplicate=false}={}) {
  const nodes=new Map(),calls=[];let authOptions,authEvent,mounted=0,lookups=0;
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',classList:{toggle(){}},addEventListener(name,fn){this[name]=fn;}});
    return nodes.get(id);
  };
  const supabase={auth:{getUser:async()=>{lookups++;return {data:{user}};},
    getSession:async()=>({data:{session:user?{access_token:'synthetic'}:null}}),
    onAuthStateChange:fn=>{authEvent=fn;},signOut:async()=>{user=null;authEvent('SIGNED_OUT',null);}}};
  const auth={setBusy(){},setMode(){},handleAuthEvent(){},showRecovery:async()=>authOptions.onRecovery()};
  await vm.runInNewContext(`(async()=>{${source}\n})()`,{
    URLSearchParams,AbortSignal,crypto:{randomUUID:()=> 'synthetic-request'},
    document:{getElementById:node},location:{search:'?plan=premium',origin:'https://example.invalid'},history:{replaceState(){}},
    supabase,SUPABASE_URL:'https://example.invalid',SUPABASE_PUBLISHABLE_KEY:'public',
    initialAuthReturn:{failed,type:recovery?'recovery':null},
    createPasswordAuth:options=>{authOptions=options;return auth;},
    fetch:async(_url,options={})=>{
      if(!options.method)return {ok:true,json:async()=>({configured,publishable_key:'pk_live_synthetic'})};
      calls.push(JSON.parse(options.body));return {ok:!duplicate,status:duplicate?409:200,
        json:async()=>duplicate?{state:'already_subscribed'}:{client_secret:'synthetic-client-secret'}};
    },
    Stripe:()=>({createEmbeddedCheckoutPage:async()=>({mount:()=>{mounted++;},destroy(){}})})
  });
  return {node,calls,authOptions,get mounted(){return mounted;},get lookups(){return lookups;}};
}
test('unconfigured checkout blocks payment and never creates a Stripe session',async()=>{
  const x=await setup({configured:false}); assert.equal(x.calls.length,0); assert.equal(x.mounted,0);
  assert.match(x.node('checkoutStatus').textContent,/not available yet/);
});
test('signed-in customer gets embedded payment and credentials are absent from checkout request',async()=>{
  const x=await setup(); assert.equal(x.mounted,1);
  assert.deepEqual(Object.keys(x.calls[0]).sort(),['action','plan','request_id']);
  assert.equal(x.node('checkoutAuth').hidden,true);
});
test('signed-out customer cannot start payment',async()=>{
  const x=await setup({user:null});assert.equal(x.calls.length,0);assert.equal(x.mounted,0);
});
test('recovery link cannot start checkout before password is updated',async()=>{
  const x=await setup({recovery:true});assert.equal(x.calls.length,0);assert.equal(x.mounted,0);
  assert.equal(x.node('checkoutAuth').hidden,false);
  await x.authOptions.onAuthenticated();assert.equal(x.mounted,1);
});
test('an invalid callback can recover through successful password login without reloading',async()=>{
  const x=await setup({failed:true});assert.equal(x.calls.length,0);
  await x.authOptions.onAuthenticated();assert.equal(x.mounted,1);
});
test('an existing subscription opens account guidance instead of another payment form',async()=>{
  const x=await setup({duplicate:true});assert.equal(x.mounted,0);
  assert.equal(x.node('accountLink').hidden,false);
});
