import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../start.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
const confirmed = (id = 'owner') => ({id, email: `${id}@example.invalid`, email_confirmed_at: '2026-09-17T12:00:00Z'});
async function openAccount({hash = '', search = '?access=ready', user = null, sessionError = null,
  entitlement = {plan: 'free', status: 'inactive'}, hasCheckout = false, purchasePreference = null, storageBlocked = false} = {}) {
  const elements = new Map(), requests = [], claims = [], replaced = [], inserts = [];
  const preferences = new Map(purchasePreference === null ? [] : [['billsavings.purchase-plan', purchasePreference]]);
  let resets = 0, flowStarts = 0, flowSignIns = 0, recoveryStarts = 0;
  let activeUser = user, passwordOptions, authEvent, internals, flowOptions;
  let pendingCheckout = hasCheckout, rpcResult = () => ({data: entitlement, error: null});
  let analysisResult = () => ({data: {ok: true, result: {summary: 'Sample result'}}, error: null});
  const location = {hash, search, pathname: '/start.html', origin: 'https://example.invalid'};
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set(), handlers = new Map();
      elements.set(id, {textContent: '', disabled: false, hidden: false, value: '', checked: false,
        classList: {add: c => classes.add(c), remove: c => classes.delete(c),
          toggle(c, enabled) {enabled ? classes.add(c) : classes.delete(c);}, contains: c => classes.has(c)},
        closest: () => element('accountCard'), querySelector: () => null,
        insertBefore() {}, scrollIntoView() {}, addEventListener(name, callback) {handlers.set(name, callback);},
        click: () => handlers.get('click')?.()
      });
    }
    return elements.get(id);
  }
  const hashParams = new URLSearchParams(hash.slice(1));
  const initialAuthReturn = {received: !!hash, failed: hashParams.has('error') || hashParams.has('error_code'),
    expired: hashParams.get('error_code') === 'otp_expired', type: hashParams.get('type') === 'recovery' ? 'recovery' : null};
  const supabase = {
    auth: {
      onAuthStateChange(callback) {authEvent = callback;},
      async getUser() { return {data: {user: activeUser}, error: sessionError}; },
      async getSession() {
        location.hash = '';
        return {data: {session: activeUser ? {user: activeUser} : null}, error: sessionError};
      },
      async signOut() {activeUser = null; authEvent('SIGNED_OUT', null); return {error: null};}
    },
    async rpc(name) {claims.push(name); return rpcResult();},
    storage: {from: () => ({upload: async () => ({error: null}), remove: async () => ({error: null})})},
    from: () => ({insert: row => {inserts.push(row); return {select: () => ({single: async () => ({data: {id: 'uploaded-document'}, error: null})})};}}),
    functions: {invoke: async () => analysisResult()}
  };
  await vm.runInNewContext(`(async () => {${source}\nexpose({claimPaidAccess, uploadBill, analyzeBill});})()`, {
    URLSearchParams, location, document: {getElementById: element},
    history: {replaceState: (_state, _title, path) => replaced.push(path)},
    crypto: {randomUUID: () => 'synthetic-id'},
    localStorage: {
      getItem(key) {if (storageBlocked) throw new Error('Storage blocked'); return preferences.get(key) ?? null;},
      removeItem(key) {if (storageBlocked) throw new Error('Storage blocked'); preferences.delete(key);}
    },
    supabase, initialAuthReturn, SUPABASE_URL: 'https://example.invalid', SUPABASE_PUBLISHABLE_KEY: 'public',
    createPasswordAuth: options => {
      passwordOptions = options;
      return {busy: false, handleAuthEvent() {}, showRecovery: async () => {recoveryStarts++; await options.onRecovery();}};
    },
    createCheckoutAccess: options => {
      flowOptions = options;
      return {reset() {resets++; pendingCheckout = false;}, start: async () => {flowStarts++;},
        onSignIn: async () => {flowSignIns++;}, hasCheckout: () => pendingCheckout};
    },
    fetch: async (...args) => {requests.push(args); return {json: async () => ({})};},
    setTimeout, clearTimeout, expose: value => {internals = value;}
  });
  return {element, requests, claims, replaced, location, inserts, internals, flowOptions, preferences,
    get resets() {return resets;}, get flowStarts() {return flowStarts;}, get flowSignIns() {return flowSignIns;},
    get recoveryStarts() {return recoveryStarts;}, get passwordOptions() {return passwordOptions;},
    setRPC: callback => {rpcResult = callback;}, setAnalysis: callback => {analysisResult = callback;},
    signIn: async newUser => {activeUser = newUser; await passwordOptions.onAuthenticated();},
    signOut: () => element('signOutBtn').click(),
    emit: (event, session = null) => authEvent(event, session)
  };
}

test('expired callback shows a safe retry message without claiming access or opening checkout', async () => {
  const x = await openAccount({hash: '#error=access_denied&error_code=otp_expired&error_description=UNTRUSTED_TEXT',
    search: '?access=ready&plan=premium', user: confirmed()});
  assert.match(x.element('status').textContent, /expired or has already been used/);
  assert.doesNotMatch(x.element('status').textContent, /UNTRUSTED_TEXT/);
  assert.equal(x.element('status').classList.contains('err'), true);
  assert.equal(x.claims.length, 0);
  assert.equal(x.requests.length, 0);
  assert.equal(x.resets, 1);
  assert.equal(x.flowStarts, 0);
  assert.equal(x.location.href, undefined);
  assert.ok(x.replaced.every(path => !path.includes('#')));
});

test('returned SDK errors and unconfirmed sessions cannot open the signed-in account', async () => {
  for (const options of [{sessionError: {message: 'INTERNAL_SECRET_DETAIL'}}, {user: {...confirmed(), email_confirmed_at: null}}]) {
    const x = await openAccount({hash: '#access_token=synthetic&refresh_token=synthetic',
      search: '?access=ready&plan=family', ...options});
    assert.equal(x.element('signedBox').classList.contains('show'), false);
    assert.match(x.element('status').textContent, /could not complete sign-in/i);
    assert.doesNotMatch(x.element('status').textContent, /INTERNAL_SECRET_DETAIL/);
    assert.equal(x.claims.length, 0);
    assert.equal(x.location.href, undefined);
  }
});

test('verified callback claims the existing plan and ignores a checkout plan query', async () => {
  const x = await openAccount({hash: '#access_token=synthetic&refresh_token=synthetic',
    search: '?plan=premium', user: confirmed(), entitlement: {plan: 'family', status: 'active'}});
  assert.equal(x.element('signedBox').classList.contains('show'), true);
  assert.equal(x.element('userEmail').textContent, 'owner@example.invalid');
  assert.deepEqual(x.claims, ['claim_billing_entitlement']);
  assert.equal(x.element('activePlan').textContent, 'Family · Active');
  assert.equal(x.element('pricing').hidden, true);
  assert.equal(x.requests.length, 0);
  assert.equal(x.flowStarts, 1);
  assert.equal(x.location.href, undefined);
  assert.match(x.flowOptions.endpoint, /\/functions\/v1\/billing-access$/);
});

test('normal plan entry opens the account step before hosted Stripe payment', async () => {
  const x = await openAccount({search: '?plan=premium'});
  assert.equal(x.requests.length, 0);
  assert.equal(x.location.href, '/checkout.html?plan=premium');
  assert.equal(x.claims.length, 0);
  assert.equal(x.passwordOptions.requirePasswordConfirmation, false);
});

test('an already active account stays open instead of starting another purchase', async () => {
  const x = await openAccount({search: '?plan=premium', user: confirmed(), entitlement: {plan: 'premium', status: 'active'}});
  assert.equal(x.element('activePlan').textContent, 'Premium · Active');
  assert.equal(x.element('pricing').hidden, true);
  assert.equal(x.location.href, undefined);
});

test('recovery opens password form without buying; successful password save restores free pricing', async () => {
  const x = await openAccount({hash: '#access_token=synthetic&refresh_token=synthetic&type=recovery',
    search: '?plan=family', user: confirmed()});
  assert.equal(x.recoveryStarts, 1);
  assert.equal(x.location.href, undefined);
  assert.equal(x.claims.length, 0);
  assert.equal(x.element('signedBox').classList.contains('show'), false);
  assert.equal(x.element('pricing').hidden, true);
  await x.signIn(confirmed());
  assert.equal(x.element('signedBox').classList.contains('show'), true);
  assert.equal(x.element('pricing').hidden, false);
  assert.equal(x.location.href, undefined);
});

test('switching accounts clears previous plan, selected file, consent and private analysis', async () => {
  const x = await openAccount({user: confirmed(), entitlement: {plan: 'premium', status: 'active'}});
  x.element('result').textContent = 'PRIVATE_PREVIOUS_RESULT';
  x.element('result').hidden = false;
  x.element('file').value = 'previous.pdf';
  x.element('consent').checked = true;
  x.element('analyzeBtn').disabled = false;
  x.setRPC(() => ({data: {plan: 'free', status: 'inactive'}, error: null}));
  await x.signIn(confirmed('different-owner'));
  assert.equal(x.element('userEmail').textContent, 'different-owner@example.invalid');
  assert.equal(x.element('activePlan').textContent, 'Free Preview');
  assert.equal(x.element('pricing').hidden, false);
  assert.equal(x.element('file').value, '');
  assert.equal(x.element('consent').checked, false);
  assert.equal(x.element('result').textContent, '');
  assert.equal(x.element('result').hidden, true);
  assert.equal(x.element('analyzeBtn').disabled, true);
});

test('signout clears private account view and a delayed old claim cannot restore Premium', async () => {
  const x = await openAccount({user: confirmed(), entitlement: {plan: 'premium', status: 'active'}});
  let resolveClaim;
  x.setRPC(() => new Promise(resolve => {resolveClaim = resolve;}));
  const pending = x.internals.claimPaidAccess();
  await x.signOut();
  resolveClaim({data: {plan: 'premium', status: 'active'}, error: null});
  await pending;
  assert.equal(x.element('activePlan').textContent, 'Free Preview');
  assert.equal(x.element('pricing').hidden, false);
  assert.equal(x.element('signedBox').classList.contains('show'), false);
  assert.equal(x.element('userEmail').textContent, '');
});

test('old analysis response cannot appear after another account signs in', async () => {
  const x = await openAccount({user: confirmed()});
  x.element('file').files = [{name: 'bill.pdf', type: 'application/pdf', size: 100}];
  await x.internals.uploadBill();
  x.element('consent').checked = true;
  let resolveAnalysis;
  x.setAnalysis(() => new Promise(resolve => {resolveAnalysis = resolve;}));
  const pending = x.internals.analyzeBill();
  await x.signIn(confirmed('different-owner'));
  resolveAnalysis({data: {ok: true, result: {summary: 'PRIVATE_OLD_ANALYSIS'}}, error: null});
  await pending;
  assert.equal(x.element('result').textContent, '');
  assert.equal(x.element('result').hidden, true);
  assert.equal(x.element('analyzeBtn').disabled, true);
  assert.equal(x.inserts[0].user_id, 'owner');
});

test('a hosted checkout return resumes billing proof instead of duplicating the entitlement request', async () => {
  const x = await openAccount({hasCheckout: true});
  await x.signIn(confirmed());
  assert.equal(x.flowSignIns, 1);
  assert.equal(x.claims.length, 0);
});

test('a confirmed account resumes a remembered plan only after an explicit click', async () => {
  const x = await openAccount({user: confirmed(), hash: '#access_token=synthetic&refresh_token=synthetic',
    purchasePreference: JSON.stringify({plan: 'family', expires: Date.now() + 300000})});
  assert.equal(x.element('continuePurchaseBtn').hidden, false);
  assert.equal(x.element('continuePurchaseBtn').textContent, 'Continue to Family →');
  assert.equal(x.location.href, undefined);
  x.element('continuePurchaseBtn').click();
  assert.equal(x.location.href, '/checkout.html?plan=family');
});

test('invalid, expired, overly long, blocked and signed-out preferences cannot resume a purchase', async () => {
  for (const options of [
    {purchasePreference: 'not-json'},
    {purchasePreference: JSON.stringify({plan: 'evil', expires: Date.now() + 300000})},
    {purchasePreference: JSON.stringify({plan: 'premium', expires: Date.now() - 1000})},
    {purchasePreference: JSON.stringify({plan: 'premium', expires: Date.now() + 7200000})},
    {purchasePreference: JSON.stringify({plan: 'premium', expires: String(Date.now() + 300000)})},
    {storageBlocked: true},
    {user: null, purchasePreference: JSON.stringify({plan: 'premium', expires: Date.now() + 300000})}
  ]) {
    const x = await openAccount({user: confirmed(), ...options});
    assert.equal(x.element('continuePurchaseBtn').hidden, true);
    x.element('continuePurchaseBtn').click();
    assert.equal(x.location.href, undefined);
  }
});

test('an active paid plan clears the remembered purchase and hides its button', async () => {
  const x = await openAccount({user: confirmed(), entitlement: {plan: 'premium', status: 'active'},
    purchasePreference: JSON.stringify({plan: 'family', expires: Date.now() + 300000})});
  assert.equal(x.element('continuePurchaseBtn').hidden, true);
  assert.equal(x.preferences.has('billsavings.purchase-plan'), false);
  x.element('continuePurchaseBtn').click();
  assert.equal(x.location.href, undefined);
});
