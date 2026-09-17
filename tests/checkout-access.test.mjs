import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../checkout-access.js', import.meta.url), 'utf8').replace('export function', 'function');
const proof = 'cs_live_syntheticCheckoutSession123456789';
const signedIn = {access_token: 'synthetic-account-token'};
function setup({search = `?checkout=success&session_id=${proof}`, results = [], stored = null, session = null, active = true} = {}) {
  const elements = new Map(), requests = [], headers = [], timers = new Map(), storage = new Map();
  let flow, claims = 0, replaced = '', timerId = 0, currentSession = session;
  if (stored) storage.set('billsavings.checkout-access', JSON.stringify(stored));
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {hidden: true, textContent: '', disabled: false, focused: false,
        classList: {add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c)},
        closest: () => element('card'), scrollIntoView() {}, insertBefore() {}, focus() {this.focused = true;},
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
    setTimeout(fn, delay) {
      const id = ++timerId;
      if (delay === 2000) queueMicrotask(fn);
      else timers.set(id, {fn, delay});
      return id;
    },
    clearTimeout: id => timers.delete(id),
    fetch: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      headers.push(options.headers);
      const queued = results.shift();
      const value = typeof queued === 'function' ? await queued() : queued;
      if (value instanceof Error) throw value;
      return {json: async () => value || {state: 'pending'}};
    },
    capture: value => {flow = value;},
    deps: {supabase: {auth: {getSession: async () => ({data: {session: currentSession}})}},
      endpoint: 'https://example.invalid/access', publicKey: 'public',
      claimPaidAccess: async () => {claims++; return active;}}
  };
  vm.runInNewContext(code + '\ncapture(createCheckoutAccess(deps));', context);
  async function flushDeferred() {
    for (const [id, timer] of timers) if (timer.delay === 0) {timers.delete(id); timer.fn();}
    await new Promise(setImmediate);
  }
  return {flow, requests, headers, storage, timers, element, flushDeferred,
    setSession: value => {currentSession = value;},
    get claims() {return claims;}, get replaced() {return replaced;}};
}

test('signed-out and mismatched buyers get password sign-in without sending email', async () => {
  for (const session of [null, signedIn]) {
    for (const state of ['ready', 'sent']) {
      const x = setup({session, results: [{state, account_matches: false}]});
      await x.flow.start();
      assert.deepEqual(x.requests.map(r => r.action), ['status']);
      assert.equal(x.element('accessTitle').textContent, 'Sign in to use your plan');
      assert.equal(x.element('loginBox').classList.contains('hidden'), false);
      assert.match(x.element('accessMessage').textContent, /password/);
      if (session) assert.match(x.element('accessMessage').textContent, /does not match/);
      x.element('accessManualBtn').click();
      assert.equal(x.element('authEmail').focused, true);
      assert.equal(x.claims, 0);
      assert.ok(!x.replaced.includes(proof));
    }
  }
});

test('a restored checkout receipt also uses password sign-in', async () => {
  const x = setup({search: '', stored: {id: proof, expires: Date.now() + 60000}, results: [{state: 'sent'}]});
  await x.flow.start();
  assert.deepEqual(x.requests.map(r => r.action), ['status']);
  assert.equal(x.element('accessTitle').textContent, 'Sign in to use your plan');
});

test('matching authenticated buyer activates through the server claim and clears all checkout flags', async () => {
  const x = setup({session: signedIn, results: [{state: 'account_ready', account_matches: true}]});
  await x.flow.start();
  assert.equal(x.headers[0].authorization, 'Bearer synthetic-account-token');
  assert.equal(x.claims, 1);
  assert.deepEqual(x.requests.map(r => r.action), ['status']);
  assert.equal(x.element('checkoutAccess').hidden, true);
  assert.equal(x.storage.size, 0);
  assert.equal(x.flow.hasCheckout(), false);
  await x.flow.start();
  assert.equal(x.requests.length, 1);
});

test('success query, invalid proof and unmatched account never grant purchased access', async () => {
  for (const search of ['?checkout=success', '?checkout=success&session_id=cs_live_invalid']) {
    const x = setup({search});
    await x.flow.start();
    assert.equal(x.requests.length, 0);
    assert.equal(x.claims, 0);
    assert.equal(x.element('accessTitle').textContent, 'Sign in to use your plan');
  }
  const x = setup({session: signedIn, results: [{state: 'ready', account_matches: true}]});
  await x.flow.start();
  assert.equal(x.claims, 0);
});

test('delayed webhook, unavailable service and offline states offer status retry and password fallback', async () => {
  for (const [results, title] of [
    [[], 'Waiting for payment confirmation'],
    [[{state: 'unavailable'}], 'Your payment needs another check'],
    [[new Error('offline')], 'Connection interrupted']
  ]) {
    const x = setup({results}); await x.flow.start();
    assert.equal(x.element('accessTitle').textContent, title);
    assert.equal(x.claims, 0);
    assert.equal(x.element('accessRetryBtn').hidden, false);
    assert.ok(x.requests.every(r => r.action === 'status'));
    x.element('accessManualBtn').click();
    assert.equal(x.element('loginBox').classList.contains('hidden'), false);
    assert.equal(x.element('authEmail').focused, true);
  }
});

test('retry can complete a delayed payment without email delivery', async () => {
  const results = [...Array(6)].map(() => ({state: 'pending'}));
  results.push({state: 'account_ready', account_matches: true});
  const x = setup({session: signedIn, results});
  await x.flow.start();
  assert.equal(x.claims, 0);
  await x.element('accessRetryBtn').click();
  assert.equal(x.claims, 1);
  assert.equal(x.flow.hasCheckout(), false);
  assert.ok(x.requests.every(r => r.action === 'status'));
});

test('a signed-in account can recover its own subscription after receipt expiry', async () => {
  const x = setup({session: signedIn, results: [{state: 'expired'}]});
  await x.flow.start();
  assert.equal(x.claims, 1);
  assert.equal(x.flow.hasCheckout(), false);
  const other = setup({results: [{state: 'expired'}]});
  await other.flow.start();
  assert.equal(other.claims, 0);
  assert.equal(other.element('loginBox').classList.contains('hidden'), false);
});

test('email confirmation callback discards stale payment proof and leaves normal account claiming available', async () => {
  const x = setup({search: '?access=ready', stored: {id: proof, expires: Date.now() + 60000}});
  await x.flow.start();
  assert.equal(x.requests.length, 0);
  assert.equal(x.storage.size, 0);
  assert.equal(x.flow.hasCheckout(), false);
  await x.flow.onSignIn();
  assert.equal(x.claims, 1);
});

test('sign-out reset cancels an in-flight response and any already queued sign-in retry', async () => {
  let release;
  const response = new Promise(resolve => {release = resolve;});
  const x = setup({session: signedIn, results: [() => response]});
  const running = x.flow.start();
  await new Promise(setImmediate);
  await x.flow.onSignIn();
  x.flow.reset();
  release({state: 'account_ready', account_matches: true});
  await running;
  await x.flushDeferred();
  assert.equal(x.claims, 0);
  assert.equal(x.requests.length, 1);
  assert.equal(x.flow.hasCheckout(), false);
  assert.equal(x.element('checkoutAccess').hidden, true);
});

test('a sign-in arriving during payment checking resumes once with the new account token', async () => {
  let release;
  const response = new Promise(resolve => {release = resolve;});
  const x = setup({results: [() => response, {state: 'account_ready', account_matches: true}]});
  const running = x.flow.start();
  await new Promise(setImmediate);
  x.setSession(signedIn);
  await x.flow.onSignIn();
  release({state: 'ready', account_matches: false});
  await running;
  await x.flushDeferred();
  assert.equal(x.claims, 1);
  assert.deepEqual(x.requests.map(r => r.action), ['status', 'status']);
  assert.equal(x.headers[0].authorization, undefined);
  assert.equal(x.headers[1].authorization, 'Bearer synthetic-account-token');
  assert.equal(x.flow.hasCheckout(), false);
});

test('sign-in callback releases the Supabase auth lock before payment or account checks', async () => {
  const start = readFileSync(new URL('../start.js', import.meta.url), 'utf8');
  const callbackCode = start.slice(start.indexOf('supabase.auth.onAuthStateChange('), start.indexOf('await refreshSession();\npageReady'));
  let callback, locked = true, claimed = false;
  const deferred = [];
  vm.runInNewContext(callbackCode, {
    pageReady: true, currentUser: {id: 'synthetic'}, recoveryMode: false,
    passwordAuth: {busy: false, handleAuthEvent() {}},
    refreshSession: async () => {assert.equal(locked, false);},
    supabase: {auth: {onAuthStateChange: fn => {callback = fn;}}},
    setTimeout: fn => deferred.push(fn),
    accessFlow: {hasCheckout: () => true, onSignIn: async () => {assert.equal(locked, false); claimed = true;}}
  });
  assert.equal(callback('SIGNED_IN', {user: {id: 'synthetic'}}), undefined);
  assert.equal(claimed, false);
  locked = false;
  deferred.forEach(fn => fn());
  await new Promise(setImmediate);
  assert.equal(claimed, true);
});
