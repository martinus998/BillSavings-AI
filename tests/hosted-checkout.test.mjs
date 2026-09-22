import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../checkout.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
const originSource = readFileSync(new URL('../account-origin.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../checkout.html', import.meta.url), 'utf8');
const authSource = readFileSync(new URL('../password-auth.js', import.meta.url), 'utf8');
const {createPasswordAuth} = await import(`data:text/javascript;base64,${Buffer.from(authSource).toString('base64')}`);
const confirmed = (email = 'Owner@Example.invalid') => ({id: 'verified-owner', email, email_confirmed_at: '2026-09-17T00:00:00Z'});
const checkoutUrl = 'https://checkout.stripe.com/c/pay/cs_live_example';
function deferred() {
  let resolve;
  const promise = new Promise(r => {resolve = r;});
  return {promise, resolve};
}
async function openCheckout(options = {}) {
  const elements = new Map(), navigations = [], replaced = [], authCalls = [], claims = [], requests = [];
  const storage = new Map();
  let activeUser = options.user ?? null, authEvent, passwordOptions, authController;
  let getUserResult = () => ({data: {user: activeUser}, error: null});
  let rpcResult = () => ({data: options.entitlement ?? {plan: 'free', status: 'inactive'}, error: null});
  const location = {origin: 'https://billsavingsai.com', hostname: 'billsavingsai.com', pathname: '/checkout.html',
    search: options.search ?? '?plan=premium', hash: options.hash ?? '', assign: path => navigations.push(path)};
  function element(id) {
    if (!elements.has(id)) {
      const handlers = new Map(), classes = new Set();
      async function dispatch(name) {
        const event = {
          defaultPrevented: false,
          immediateStopped: false,
          preventDefault() {this.defaultPrevented = true;},
          stopImmediatePropagation() {this.immediateStopped = true;}
        };
        const listeners = [...(handlers.get(name) || [])].sort((a, b) => Number(b.capture) - Number(a.capture));
        for (const listener of listeners) {
          await listener.callback(event);
          if (event.immediateStopped) break;
        }
        return event;
      }
      elements.set(id, {
        value: '', textContent: '', hidden: ['accountReady', 'checkoutStatus', 'authConfirmField'].includes(id),
        disabled: false, type: id === 'authPassword' ? 'password' : 'text', required: false,
        classList: {toggle(name, value) {value ? classes.add(name) : classes.delete(name);}, contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name)},
        querySelector: selector => element(selector.slice(1)), closest: () => null, setAttribute() {},
        addEventListener(name, callback, opts) {
          const list = handlers.get(name) || [];
          list.push({callback, capture: opts === true || !!opts?.capture});
          handlers.set(name, list);
        },
        removeEventListener(name, callback) {
          handlers.set(name, (handlers.get(name) || []).filter(item => item.callback !== callback));
        },
        click: () => dispatch('click'),
        submit: () => dispatch('submit')
      });
    }
    return elements.get(id);
  }
  const supabase = {
    auth: {
      async getUser() {authCalls.push('getUser'); return getUserResult();},
      onAuthStateChange(callback) {authEvent = callback;},
      async signOut(args) {
        authCalls.push('signOut'); assert.equal(args.scope, 'local');
        activeUser = null; authEvent('SIGNED_OUT', null); return {error: null};
      },
      async signUp() {authCalls.push('signUp'); return {data: {user: {id: 'pending-owner'}, session: null}, error: null};},
      async signInWithPassword() {
        authCalls.push('signInWithPassword'); activeUser = options.signedInUser ?? confirmed();
        return {data: {session: {user: activeUser}}, error: null};
      },
      async getSession() {authCalls.push('getSession'); return {data: {session: activeUser ? {user: activeUser, access_token: 'verified-access-token'} : null}, error: null};},
      async resetPasswordForEmail() {authCalls.push('resetPasswordForEmail'); return {data: {}, error: null};},
      async updateUser() {authCalls.push('updateUser'); return {data: {user: activeUser}, error: null};}
    },
    async rpc(name) {claims.push(name); assert.equal(name, 'claim_billing_entitlement'); return rpcResult();}
  };
  const hash = new URLSearchParams(location.hash.slice(1));
  await vm.runInNewContext(`(async () => {${source}\n})()`, {
    URL, URLSearchParams, location, document: {getElementById: element},
    history: {replaceState: (_state, _title, path) => replaced.push(path)},
    localStorage: {setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)},
    initialAuthReturn: {failed: hash.has('error') || hash.has('error_code'), type: hash.get('type') === 'recovery' ? 'recovery' : null},
    supabase,
    createPasswordAuth: config => {passwordOptions = config; authController = createPasswordAuth(config); return authController;},
    fetch: async (...args) => {
      requests.push(args);
      const [url] = args;
      if (/\/functions\/v1\/password-signup$/.test(String(url))) {
        if (options.signupFetchError) throw options.signupFetchError;
        return {ok: options.signupOk ?? true, json: async () => options.signupPayload ?? {ok: true}};
      }
      if (/\/functions\/v1\/billsavings-checkout$/.test(String(url))) {
        return {ok:true, json:async()=>({ok:true, checkout_url:checkoutUrl})};
      }
      throw new Error('unexpected fetch');
    }
  });
  return {element, navigations, replaced, authCalls, claims, requests, storage, location,
    get passwordOptions() {return passwordOptions;}, get authController() {return authController;},
    setUser: user => {activeUser = user;}, setGetUser: fn => {getUserResult = fn;}, setRPC: fn => {rpcResult = fn;},
    emit: (event, session = null) => authEvent(event, session),
    credentials() {element('authEmail').value = 'typed@example.invalid'; element('authPassword').value = 'Secretpass1';},
    continue: () => element('continuePayment').click(),
    submit: () => element('authForm').submit()
  };
}

test('a confirmed account opens only an authenticated Stripe Checkout Session for the selected plan', async () => {
  for (const plan of ['premium', 'family']) {
    const x = await openCheckout({user: confirmed(), search: `?plan=${plan}&email=attacker%40example.invalid&user_id=attacker&redirect=https://attacker.invalid`});
    assert.equal(x.navigations.length, 0);
    assert.equal(x.element('accountReady').hidden, false);
    await x.continue();
    assert.equal(x.navigations.length, 1);
    const target = new URL(x.navigations[0]);
    assert.equal(target.origin, 'https://checkout.stripe.com');
    
    assert.deepEqual(x.claims, ['claim_billing_entitlement']);
    assert.deepEqual(x.authCalls, ['getUser', 'getUser', 'getSession']);
    assert.equal(x.requests.length, 1);
    assert.match(String(x.requests[0][0]), /\/functions\/v1\/billsavings-checkout$/);
    const requestInit = x.requests[0][1];
    assert.equal(requestInit.headers.Authorization, 'Bearer verified-access-token');
    assert.deepEqual(JSON.parse(requestInit.body), {plan});
  }
});

test('signed-out, unconfirmed, anonymous and malformed account identities cannot open payment', async () => {
  for (const user of [null, {...confirmed(), email_confirmed_at: null}, {...confirmed(), is_anonymous: true},
    {...confirmed(), id: null}, {...confirmed(), email: null}]) {
    const x = await openCheckout({user});
    await x.continue();
    assert.equal(x.navigations.length + x.claims.length, 0);
    assert.match(x.element('checkoutStatus').textContent, /Sign in to continue/);
    assert.equal(x.element('checkoutAuth').hidden, false);
  }
});

test('payment uses a fresh verified identity, not the previously displayed account or form email', async () => {
  const x = await openCheckout({user: confirmed('old@example.invalid')});
  x.element('authEmail').value = 'forged@example.invalid';
  x.setUser({...confirmed('current@example.invalid'), id: 'current-owner'});
  await x.continue();
  assert.equal(new URL(x.navigations[0]).origin, 'https://checkout.stripe.com');
  const checkoutRequest = x.requests.find(([url]) => /\/functions\/v1\/billsavings-checkout$/.test(String(url)));
  assert.ok(checkoutRequest);
  assert.deepEqual(JSON.parse(checkoutRequest[1].body), {plan:'premium'});
  assert.doesNotMatch(JSON.stringify(checkoutRequest), /forged@example\.invalid|old@example\.invalid|current@example\.invalid/);
  const expired = await openCheckout({user: confirmed()});
  expired.setGetUser(() => ({data: {user: confirmed()}, error: {message: 'AUTH_INTERNAL_DETAIL'}}));
  await expired.continue();
  assert.equal(expired.navigations.length + expired.claims.length, 0);
  assert.doesNotMatch(expired.element('checkoutStatus').textContent, /AUTH_INTERNAL_DETAIL/);
});

test('paid and unresolved existing subscriptions return to the account rather than another checkout', async () => {
  for (const plan of ['premium', 'family']) {
    for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']) {
      const x = await openCheckout({user: confirmed(), entitlement: {plan, status}});
      await x.continue();
      assert.deepEqual(x.navigations, ['/start.html']);
      assert.equal(x.storage.has('billsavings.purchase-plan'), false);
    }
  }
});

test('canceled subscription can purchase again with a fresh checkout session', async () => {
  const x = await openCheckout({user: confirmed(), search: '?plan=family', entitlement: {plan: 'premium', status: 'canceled'}});
  await x.continue();
  const target = new URL(x.navigations[0]);
  assert.equal(target.origin, 'https://checkout.stripe.com');
});

test('RPC failures and thrown Auth or RPC requests block payment and show a safe retry message', async () => {
  for (const provider of ['auth', 'rpc-error', 'rpc-throw']) {
    const x = await openCheckout({user: confirmed()});
    if (provider === 'auth') x.setGetUser(() => {throw new Error('PROVIDER_SECRET_DETAIL');});
    else if (provider === 'rpc-error') x.setRPC(() => ({data: {plan: 'free'}, error: {message: 'PROVIDER_SECRET_DETAIL'}}));
    else x.setRPC(() => {throw new Error('PROVIDER_SECRET_DETAIL');});
    await x.continue();
    assert.equal(x.navigations.length, 0);
    assert.match(x.element('checkoutStatus').textContent, /could not check your account/);
    assert.doesNotMatch(x.element('checkoutStatus').textContent, /PROVIDER_SECRET_DETAIL/);
    assert.equal(x.element('continuePayment').disabled, false);
  }
});

test('malformed entitlement responses fail closed instead of treating an unknown account as free', async () => {
  for (const data of [null, {}, {plan: 'free'}, {status: 'inactive'},
    {plan: null, status: 'inactive'}, {plan: 'free', status: null}]) {
    const x = await openCheckout({user: confirmed()});
    x.setRPC(() => ({data, error: null}));
    await x.continue();
    assert.equal(x.navigations.length, 0);
    assert.match(x.element('checkoutStatus').textContent, /could not check your account/);
    assert.equal(x.element('continuePayment').disabled, false);
  }
});

test('invalid plans cannot start payment even with a verified account', async () => {
  for (const search of ['', '?plan=free', '?plan=__proto__', '?plan=constructor', '?plan=https://attacker.invalid']) {
    const x = await openCheckout({user: confirmed(), search});
    await x.continue();
    assert.equal(x.navigations.length + x.claims.length + x.authCalls.length, 0);
    assert.equal(x.element('continuePayment').disabled, true);
    assert.equal(x.authController.busy, true);
    assert.match(x.element('checkoutStatus').textContent, /Choose a plan/);
  }
});

test('expired auth callbacks cannot open checkout until a successful explicit password sign-in', async () => {
  const x = await openCheckout({user: confirmed(), hash: '#error=access_denied&error_code=otp_expired&error_description=UNTRUSTED'});
  await x.continue();
  assert.equal(x.navigations.length + x.claims.length, 0);
  assert.equal(x.element('checkoutAuth').hidden, false);
  assert.equal(x.element('accountReady').hidden, true);
  assert.match(x.element('checkoutStatus').textContent, /expired/);
  assert.doesNotMatch(x.element('checkoutStatus').textContent, /UNTRUSTED/);
  assert.deepEqual(x.replaced, ['/checkout.html?plan=premium']);
  x.authController.setMode('signin'); x.credentials();
  await x.submit();
  assert.equal(x.navigations.length, 1);
  assert.equal(new URL(x.navigations[0]).origin, 'https://checkout.stripe.com');
});

test('password recovery cannot open payment before the password is saved', async () => {
  const x = await openCheckout({user: confirmed(), hash: '#type=recovery'});
  await x.continue();
  assert.equal(x.authController.mode, 'recovery');
  assert.equal(x.element('accountReady').hidden, true);
  assert.equal(x.navigations.length + x.claims.length, 0);
  x.credentials(); x.element('authConfirm').value = 'Secretpass1';
  await x.submit();
  assert.equal(x.authCalls.includes('updateUser'), true);
  assert.equal(x.navigations.length, 1);
});

test('new signup creates a confirmed account server-side and proceeds directly to payment', async () => {
  const x = await openCheckout();
  x.credentials();
  await x.submit();
  assert.equal(x.requests.length, 2);
  assert.match(String(x.requests[0][0]), /\/functions\/v1\/password-signup$/);
  assert.match(String(x.requests[1][0]), /\/functions\/v1\/billsavings-checkout$/);
  assert.equal(x.authCalls.includes('signUp'), false);
  assert.equal(x.authCalls.includes('signInWithPassword'), true);
  assert.equal(x.navigations.length, 1);
  assert.equal(new URL(x.navigations[0]).origin, 'https://checkout.stripe.com');
  assert.equal(x.element('authPassword').value, '');
});

test('confirmed password login proceeds without an extra email-link request', async () => {
  const x = await openCheckout();
  x.authController.setMode('signin'); x.credentials();
  await x.submit();
  assert.equal(x.authCalls.includes('signInWithPassword'), true);
  assert.equal(x.navigations.length, 1);
  assert.equal(x.requests.length, 1);
  assert.equal(x.element('authPassword').value, '');
  const preference = JSON.parse(x.storage.get('billsavings.purchase-plan'));
  assert.deepEqual(Object.keys(preference).sort(), ['expires', 'plan']);
  assert.equal(preference.plan, 'premium');
  assert.ok(preference.expires > Date.now());
  assert.doesNotMatch(JSON.stringify([...x.storage.entries()]) + x.navigations.join(''), /Secretpass1|verified-owner|typed@example/);
});

test('a single in-flight checkout request suppresses duplicate clicks and sign-out interrupts pending RPC', async () => {
  const x = await openCheckout({user: confirmed()});
  const pending = deferred();
  x.setRPC(() => pending.promise);
  const first = x.continue();
  await Promise.resolve();
  await x.continue();
  assert.equal(x.claims.length, 1);
  assert.equal(x.element('continuePayment').disabled, true);
  x.emit('SIGNED_OUT');
  pending.resolve({data: {plan: 'free', status: 'inactive'}, error: null});
  await first;
  assert.equal(x.navigations.length, 0);
  assert.equal(x.element('accountReady').hidden, true);
});

test('canonical account redirect preserves route and auth fragment only on the fixed apex origin', () => {
  for (const hostname of ['www.billsavingsai.com', 'billsavingsai.com', 'attacker.invalid']) {
    const redirects = [];
    vm.runInNewContext(originSource, {location: {hostname, pathname: '/checkout.html',
      search: '?plan=family&redirect=https://attacker.invalid', hash: '#type=recovery&synthetic=value',
      replace: value => redirects.push(value)}});
    if (hostname === 'www.billsavingsai.com') assert.deepEqual(redirects,
      ['https://billsavingsai.com/checkout.html?plan=family&redirect=https://attacker.invalid#type=recovery&synthetic=value']);
    else assert.equal(redirects.length, 0);
  }
  assert.ok(html.indexOf('src="/account-origin.js') < html.indexOf('src="/checkout.js'));
  assert.match(html, /name="referrer" content="no-referrer"/);
});
