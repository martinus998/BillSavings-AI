import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../start.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
async function openAccount({hash = '', search = '?access=ready', user = null, sessionError = null} = {}) {
  const elements = new Map(), requests = [], claims = [], replaced = [];
  let resets = 0, flowStarts = 0;
  const location = {hash, search, pathname: '/start.html', origin: 'https://example.invalid'};
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {textContent: '', disabled: false,
        classList: {add: c => classes.add(c), remove: c => classes.delete(c),
          toggle(c, enabled) {enabled ? classes.add(c) : classes.delete(c);}, contains: c => classes.has(c)},
        closest: () => element('accountCard'), querySelector: () => null,
        insertBefore() {}, scrollIntoView() {}, addEventListener() {}
      });
    }
    return elements.get(id);
  }
  const supabase = {
    auth: {
      onAuthStateChange() {},
      async getSession() {
        // The SDK may clear the fragment before getSession resolves.
        location.hash = '';
        return {data: {session: user ? {user} : null}, error: sessionError};
      }
    },
    async rpc(name) {claims.push(name); return {data: {plan: 'free', status: 'inactive'}, error: null};}
  };
  await vm.runInNewContext(`(async () => {${source}\n})()`, {
    URLSearchParams, location, document: {getElementById: element},
    history: {replaceState: (_state, _title, path) => replaced.push(path)},
    createClient: () => supabase,
    createCheckoutAccess: () => ({
      reset() {resets++;}, start: async () => {flowStarts++;}, hasCheckout: () => false
    }),
    fetch: async (...args) => {requests.push(args); return {json: async () => ({})};},
    setTimeout, clearTimeout
  });
  await Promise.resolve();
  return {element, requests, claims, replaced, resets, flowStarts};
}

test('expired callback shows a safe retry message without claiming access or starting checkout', async () => {
  const x = await openAccount({hash: '#error=access_denied&error_code=otp_expired&error_description=UNTRUSTED_TEXT',
    search: '?access=ready&plan=premium', user: {email: 'fixture@example.invalid'}});
  assert.match(x.element('status').textContent, /expired or has already been used/);
  assert.doesNotMatch(x.element('status').textContent, /UNTRUSTED_TEXT/);
  assert.equal(x.element('status').classList.contains('err'), true);
  assert.equal(x.claims.length, 0);
  assert.equal(x.requests.length, 0);
  assert.equal(x.resets, 1);
  assert.equal(x.flowStarts, 0);
  assert.ok(x.replaced.every(path => !path.includes('#')));
});

test('returned SDK errors are failures even when the promise resolves normally', async () => {
  const x = await openAccount({hash: '#access_token=synthetic&refresh_token=synthetic',
    search: '?access=ready&plan=family', sessionError: {message: 'INTERNAL_SECRET_DETAIL'}});
  assert.equal(x.element('signedBox').classList.contains('show'), false);
  assert.match(x.element('status').textContent, /could not complete sign-in/i);
  assert.doesNotMatch(x.element('status').textContent, /INTERNAL_SECRET_DETAIL/);
  assert.equal(x.claims.length, 0);
  assert.equal(x.requests.length, 0);
});

test('verified callback uses the existing entitlement check and never opens checkout from a plan query', async () => {
  const x = await openAccount({hash: '#access_token=synthetic&refresh_token=synthetic',
    search: '?plan=premium', user: {email: 'fixture@example.invalid'}});
  assert.equal(x.element('signedBox').classList.contains('show'), true);
  assert.equal(x.element('userEmail').textContent, 'fixture@example.invalid');
  assert.deepEqual(x.claims, ['claim_billing_entitlement']);
  assert.equal(x.requests.length, 0);
  assert.equal(x.flowStarts, 1);
});

test('normal plan entry retains the existing purchase-first checkout', async () => {
  const x = await openAccount({search: '?plan=premium'});
  assert.equal(x.requests.length, 1);
  assert.equal(JSON.parse(x.requests[0][1].body).plan, 'premium');
  assert.equal(x.claims.length, 0);
});
