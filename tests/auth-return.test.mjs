import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const router = read('auth-return.js');
const accessToken = 'synthetic.access.token';
const refreshToken = 'synthetic_refresh_token';

function setup(path, origin = 'https://billsavingsai.com') {
  const url = new URL(path, origin);
  const redirects = [], elements = [], listeners = [], storageCalls = [];
  const location = {origin: url.origin, pathname: url.pathname, search: url.search, hash: url.hash,
    replace(value) {redirects.push(value);}};
  const window = {location, addEventListener(...args) {listeners.push(args);}};
  const context = {
    URL, URLSearchParams, window,
    document: {createElement: name => ({tagName: name}), head: {appendChild: element => elements.push(element)},
      querySelectorAll: () => []},
    localStorage: {getItem(key) {storageCalls.push(['get', key]); return null;},
      setItem(...args) {storageCalls.push(['set', ...args]);}, removeItem(key) {storageCalls.push(['remove', key]);}},
    setTimeout() {throw new Error('Unexpected delayed work');},
    console: {log() {throw new Error('Unexpected logging');}, error() {throw new Error('Unexpected logging');}}
  };
  vm.runInNewContext(router, context);
  return {context, redirects, elements, listeners, storageCalls, window,
    analytics() {vm.runInNewContext(read('analytics.js'), context);}};
}

test('homepage auth callback preserves implicit credentials only in a same-origin fragment', () => {
  const x = setup(`/?plan=family&next=https://attacker.invalid&redirect_to=https://attacker.invalid&checkout=success#access_token=${accessToken}&refresh_token=${refreshToken}&expires_in=3600&token_type=bearer&type=magiclink&next=https://attacker.invalid&provider_token=do-not-forward`);
  assert.equal(x.redirects.length, 1);
  const target = new URL(x.redirects[0]);
  assert.equal(target.origin, 'https://billsavingsai.com');
  assert.equal(target.pathname, '/start.html');
  assert.equal(target.search, '?access=ready');
  const fragment = new URLSearchParams(target.hash.slice(1));
  assert.equal(fragment.get('access_token'), accessToken);
  assert.equal(fragment.get('refresh_token'), refreshToken);
  assert.equal(fragment.get('expires_in'), '3600');
  assert.equal(fragment.get('token_type'), 'bearer');
  assert.equal(fragment.get('type'), 'magiclink');
  assert.equal(fragment.has('provider_token'), false);
  assert.equal(fragment.has('next'), false);
  assert.ok(!target.search.includes(accessToken));
  assert.ok(!target.search.includes(refreshToken));
  assert.equal(x.window.BILLSAVINGS_AUTH_RETURN, true);
  assert.deepEqual(x.elements, [{tagName: 'meta', name: 'referrer', content: 'no-referrer'}]);
  assert.equal(x.storageCalls.length, 0);
});

test('homepage anchors and ordinary visits are unchanged; PKCE-only and token-hash URLs are not rerouted', () => {
  for (const path of ['/', '/#pricing', '/#works', '/?plan=premium#features', '/?code=synthetic_code', '/?token_hash=synthetic&type=email']) {
    const x = setup(path);
    assert.equal(x.redirects.length, 0, path);
    assert.equal(x.elements.length, 0, path);
    assert.equal(x.window.BILLSAVINGS_AUTH_RETURN, undefined, path);
  }
});

test('incomplete, empty and duplicate token pairs become a safe error without forwarding credentials', () => {
  for (const fragment of [
    `access_token=${accessToken}`, `refresh_token=${refreshToken}`,
    `access_token=${accessToken}&refresh_token=`,
    `access_token=%20%20&refresh_token=${refreshToken}`,
    `access_token=${accessToken}&access_token=duplicate&refresh_token=${refreshToken}`
  ]) {
    const x = setup('/#' + fragment);
    assert.equal(x.redirects.length, 1);
    const target = new URL(x.redirects[0]);
    const params = new URLSearchParams(target.hash.slice(1));
    assert.equal(params.get('error_code'), 'invalid_auth_callback');
    assert.equal(params.has('access_token'), false);
    assert.equal(params.has('refresh_token'), false);
    assert.equal(target.search, '?access=ready');
  }
});

test('auth errors reach the account page without conflicting tokens or arbitrary destinations', () => {
  const x = setup(`/#error=access_denied&error_code=otp_expired&error_description=Expired%20link&access_token=${accessToken}&refresh_token=${refreshToken}&redirect_to=https://attacker.invalid`);
  const target = new URL(x.redirects[0]);
  const params = new URLSearchParams(target.hash.slice(1));
  assert.equal(params.get('error'), 'access_denied');
  assert.equal(params.get('error_code'), 'otp_expired');
  assert.equal(params.get('error_description'), 'Expired link');
  assert.equal(params.has('access_token'), false);
  assert.equal(params.has('refresh_token'), false);
  assert.equal(params.has('redirect_to'), false);
  assert.equal(new URL(setup('/#error_code=').redirects[0]).hash.includes('invalid_auth_callback'), true);
});

test('callback routing preserves the current trusted site origin', () => {
  const x = setup(`/#access_token=${accessToken}&refresh_token=${refreshToken}`, 'https://www.billsavingsai.com');
  assert.equal(new URL(x.redirects[0]).origin, 'https://www.billsavingsai.com');
});

test('analytics never registers tracking or touches storage while a callback is routing', () => {
  const x = setup(`/?owner=0#access_token=${accessToken}&refresh_token=${refreshToken}`);
  x.analytics();
  assert.equal(x.window.BILLSAVINGS_ANALYTICS.active, false);
  assert.equal(x.window.gtag, undefined);
  assert.equal(x.window.dataLayer, undefined);
  assert.equal(x.listeners.length, 0);
  assert.equal(x.storageCalls.length, 0);
  assert.equal(x.elements.length, 1);
  const normal = setup('/');
  normal.analytics();
  assert.equal(normal.window.BILLSAVINGS_ANALYTICS.active, true);
  assert.equal(normal.listeners.length, 1);
});

test('callback router loads synchronously before homepage resources', () => {
  const html = read('index.html');
  const match = html.match(/<script src="\/auth-return\.js[^\"]*"><\/script>/);
  assert.ok(match);
  assert.ok(html.indexOf(match[0]) < html.indexOf('<link'));
  const analytics = html.match(/<script\b[^>]*src="analytics\.js(?:\?[^\"]*)?"[^>]*>/);
  assert.ok(analytics);
  assert.ok(html.indexOf(match[0]) < html.indexOf(analytics[0]));
});
