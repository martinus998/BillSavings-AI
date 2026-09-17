import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../checkout-access.js', import.meta.url), 'utf8').replace('export function', 'function');
const proof = 'cs_live_syntheticCheckoutSession123456789';
function setup({search = `?checkout=success&session_id=${proof}`, results = [], stored = null} = {}) {
  const elements = new Map(), requests = [], timers = new Map(), storage = new Map();
  let flow, claims = 0, replaced = '';
  if (stored) storage.set('billsavings.checkout-access', JSON.stringify(stored));
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {hidden: true, textContent: '', disabled: false,
        classList: {add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c)},
        closest: () => element('card'), scrollIntoView() {}, insertBefore() {}, focus() {},
        addEventListener(name, fn) {this[name] = fn;}
      });
    }
    return elements.get(id);
  }
  const context = {URLSearchParams, Date, AbortSignal,
    location: {search, pathname: '/start.html', hash: ''},
    history: {replaceState: (_a,_b,path) => {replaced = path;}},
    document: {getElementById: element},
    sessionStorage: {getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k)},
    setTimeout(fn, delay) { if (delay === 2000) {queueMicrotask(fn); return 1;} const id = timers.size + 1; timers.set(id,fn); return id;},
    clearTimeout: id => timers.delete(id),
    fetch: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      const value = results.shift();
      if (value instanceof Error) throw value;
      return {json: async () => value || {state: 'pending'}};
    },
    capture: value => {flow = value;},
    deps: {supabase: {auth: {getSession: async () => ({data: {session: null}})}},
      endpoint: 'https://example.invalid/access', publicKey: 'public', showStatus() {},
      claimPaidAccess: async () => {claims++; return true;}}
  };
  vm.runInNewContext(code + '\ncapture(createCheckoutAccess(deps));', context);
  return {flow, requests, storage, timers, element, get claims() {return claims;}, get replaced() {return replaced;}};
}
test('new buyer gets automatic access email without entering email again', async () => {
  const x = setup({results: [{state: 'pending'}, {state: 'ready'}, {state: 'sent', email_hint: 'b***@e***', retry_after: 60}]});
  await x.flow.start();
  assert.deepEqual(x.requests.map(r => r.action), ['status','status','send_link']);
  assert.equal(x.element('accessTitle').textContent, 'Check your email');
  assert.ok(x.element('loginBox').classList.contains('hidden'));
  assert.equal(x.claims, 0);
  assert.ok(!x.replaced.includes(proof));
});
test('page refresh shows sent state without another email', async () => {
  const x = setup({search: '', stored: {id: proof, expires: Date.now() + 60000}, results: [{state: 'sent', email_hint: 'b***@e***'}]});
  await x.flow.start();
  assert.deepEqual(x.requests.map(r => r.action), ['status']);
  assert.equal(x.element('accessTitle').textContent, 'Check your email');
});
test('matching signed-in buyer claims the plan without sending email', async () => {
  const x = setup({results: [{state: 'account_ready', account_matches: true}]});
  await x.flow.start();
  assert.equal(x.claims, 1);
  assert.deepEqual(x.requests.map(r => r.action), ['status']);
  assert.equal(x.element('checkoutAccess').hidden, true);
  assert.equal(x.storage.size, 0);
});
test('success query alone never claims payment or sends email', async () => {
  const x = setup({search: '?checkout=success'});
  await x.flow.start();
  assert.equal(x.requests.length, 0);
  assert.equal(x.claims, 0);
  assert.equal(x.element('accessTitle').textContent, 'Access your purchase');
});
test('delayed webhook, delivery failure and offline state have a retry and manual fallback', async () => {
  for (const [results, title] of [
    [[], 'Waiting for payment confirmation'],
    [[{state: 'ready'}, {state: 'delivery_unavailable', retry_after: 60}], 'Your access link needs another try'],
    [[new Error('offline')], 'Connection interrupted']
  ]) {
    const x = setup({results}); await x.flow.start();
    assert.equal(x.element('accessTitle').textContent, title);
    assert.equal(x.claims, 0);
    assert.equal(x.element('accessRetryBtn').hidden, false);
    x.element('accessManualBtn').click();
    assert.equal(x.element('loginBox').classList.contains('hidden'), false);
  }
});
test('email callback discards checkout proof and does not send another email', async () => {
  const x = setup({search: '?access=ready', stored: {id: proof, expires: Date.now() + 60000}});
  await x.flow.start();
  assert.equal(x.requests.length, 0);
  assert.equal(x.storage.size, 0);
  await x.flow.onSignIn();
  assert.equal(x.claims, 1);
});

test('explicit resend remains available after one failed resend', async () => {
  const x = setup({results: [
    {state: 'sent', email_hint: 'b***@e***'},
    {state: 'sent'}, {state: 'delivery_unavailable'},
    {state: 'sent'}, {state: 'sent', email_hint: 'b***@e***'}
  ]});
  await x.flow.start();
  await x.element('accessRetryBtn').click();
  await x.element('accessRetryBtn').click();
  assert.equal(x.requests.filter(r => r.action === 'send_link' && r.resend).length, 2);
  assert.equal(x.element('accessTitle').textContent, 'Check your email');
});

test('sign-in callback releases the Supabase auth lock before claiming billing access', async () => {
  const start = readFileSync(new URL('../start.js', import.meta.url), 'utf8');
  const callbackCode = start.slice(start.indexOf('supabase.auth.onAuthStateChange('), start.indexOf('await refreshSession();'));
  let callback, locked = true, claimed = false;
  const deferred = [];
  vm.runInNewContext(callbackCode, {
    pageReady: true, renderSession() {},
    supabase: {auth: {onAuthStateChange: fn => {callback = fn;}}},
    setTimeout: fn => deferred.push(fn),
    accessFlow: {onSignIn: async () => {assert.equal(locked, false); claimed = true;}}
  });
  assert.equal(callback('SIGNED_IN', {user: {id: 'synthetic'}}), undefined);
  assert.equal(claimed, false);
  locked = false;
  deferred.forEach(fn => fn());
  assert.equal(claimed, true);
});
