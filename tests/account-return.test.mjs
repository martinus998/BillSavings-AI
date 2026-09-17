import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../account-return.js', import.meta.url), 'utf8').replaceAll('export function', 'function');
function setup({search = '?account_checkout=return&session_id=cs_live_syntheticAccountCheckout12345', signedIn = true, state = 'paid', claim = true} = {}) {
  const nodes = new Map(), calls = [], storage = new Map();
  let flow, claimed = 0, path = '';
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {hidden: false, textContent: '', disabled: false,
      classList: {remove() {}}, addEventListener(name, fn) {this[name] = fn;}});
    return nodes.get(id);
  };
  vm.runInNewContext(source + '\nflowOut(createAccountReturn(deps));', {
    URLSearchParams, Date, AbortSignal, document: {getElementById: node},
    location: {search, pathname:'/start.html', hash:''}, history: {replaceState(_a,_b,value) {path = value;}},
    sessionStorage: {getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    setTimeout:fn=>{queueMicrotask(fn);return 1;},
    fetch: async (_url, options) => {calls.push(JSON.parse(options.body)); return {ok:true,json:async()=>({state})};},
    deps: {supabase:{auth:{getSession:async()=>({data:{session:signedIn?{access_token:'synthetic'}:null}})}},
      publicKey:'public',endpoint:'https://example.invalid/status',claimPaidAccess:async()=>{claimed++;return claim;}},
    flowOut:value=>{flow=value;}
  });
  return {flow,calls,node,storage,get claimed(){return claimed;},get path(){return path;}};
}
test('paid return verifies the server and existing entitlement, without sending an email', async()=>{
  const x=setup(); await x.flow.start();
  assert.equal(x.claimed,1); assert.equal(x.calls.length,1); assert.equal(x.calls[0].action,'status');
  assert.equal(x.node('checkoutAccess').hidden,true); assert.equal(x.storage.size,0);
  assert.equal(x.path,'/start.html');
});
test('signed-out return asks for password login and never treats the return proof as identity', async()=>{
  const x=setup({signedIn:false}); await x.flow.start();
  assert.equal(x.calls.length,0); assert.equal(x.claimed,0);
  assert.match(x.node('accessMessage').textContent,/email and password/);
});
test('query flag alone and pending payment cannot unlock paid access', async()=>{
  for (const options of [{search:'?account_checkout=return'},{state:'pending'}]) {
    const x=setup(options); await x.flow.start(); assert.equal(x.claimed,0);
    assert.equal(x.node('checkoutAccess').hidden,false);
  }
});
test('successful Stripe status alone is insufficient if account entitlement is not active', async()=>{
  const x=setup({claim:false}); await x.flow.start();
  assert.equal(x.claimed,1); assert.equal(x.node('checkoutAccess').hidden,false);
  assert.match(x.node('accessMessage').textContent,/cannot confirm active access/);
});
test('completed return then signout and signin checks the account without reviving a stale return panel', async()=>{
  const x=setup();
  await x.flow.start();
  assert.equal(x.claimed,1);
  assert.equal(x.flow.hasCheckout(),false);
  // start.js resets pending checkout state when the user signs out.
  x.flow.reset();
  await x.flow.onSignIn();
  assert.equal(x.claimed,2);
  assert.equal(x.calls.length,1);
  assert.equal(x.flow.hasCheckout(),false);
  assert.equal(x.node('checkoutAccess').hidden,true);
});
