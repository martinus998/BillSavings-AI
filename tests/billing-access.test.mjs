import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto, createHash} from 'node:crypto';
import vm from 'node:vm';

const source = readFileSync(new URL('../supabase/functions/billing-access/index.ts', import.meta.url), 'utf8');
const code = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, ''), {mode: 'strip'});
const proof = 'cs_live_syntheticCheckoutSession123456789';
const hash = createHash('sha256').update(proof).digest('hex');
function setup(options = {}) {
  let handler, failure = options.failure;
  const sent = [], rows = new Map();
  if (!options.missing) rows.set(hash, {session_hash: hash, email: 'buyer@example.invalid',
    expires_at: new Date(Date.now() + 86400000).toISOString(), attempts: 0,
    next_attempt_at: new Date(0).toISOString(), email_sent_at: null, ...options.receipt});
  const client = {
    auth: {
      getUser: async token => ({data: {user: token === 'valid-synthetic-jwt' ? options.user : null}, error: null}),
      signInWithOtp: async params => {sent.push(params); return {error: options.sendFailure ? {message: 'synthetic-provider-error'} : null};}
    },
    from(table) {
      assert.equal(table, 'billing_checkout_access');
      let operation = 'select', patch, filters = [];
      const builder = {
        select() {return this;}, maybeSingle() {return this;},
        eq(k, v) {filters.push([k,v]); return this;},
        update(v) {operation = 'update'; patch = v; return this;},
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (failure === operation) return {data: null, error: {code: 'XX000'}};
            const row = [...rows.values()].find(r => filters.every(([k,v]) => r[k] === v));
            if (row && operation === 'update') Object.assign(row, patch);
            return {data: row ? {...row} : null, error: null};
          }).then(resolve, reject);
        }
      };
      return builder;
    }
  };
  vm.runInNewContext(code, {crypto: webcrypto, TextEncoder, Response, Date, AbortSignal,
    createClient: () => client,
    Deno: {env: {get: () => 'synthetic'}, serve: fn => {handler = fn;}}
  });
  async function send(body = {}, headers = {}) {
    const r = await handler(new Request('https://example.invalid/access', {method: 'POST',
      headers: {origin: 'https://billsavingsai.com', ...headers},
      body: JSON.stringify({session_id: proof, action: 'send_link', ...body})}));
    return {status: r.status, data: await r.json(), headers: r.headers};
  }
  return {send, sent, rows, recover: () => {failure = null;}};
}

test('only webhook receipts can request an email; missing proof stays pending', async () => {
  const x = setup({missing: true});
  assert.equal((await x.send()).data.state, 'pending');
  assert.equal((await x.send({session_id: 'cs_live_invalid'})).status, 400);
  assert.equal((await x.send({}, {origin: 'https://attacker.invalid'})).status, 403);
  assert.equal(x.sent.length, 0);
});
test('sends only to checkout email; ignores supplied email and redirect; exposes no auth tokens', async () => {
  const x = setup();
  const r = await x.send({email: 'attacker@example.invalid', redirect: 'https://attacker.invalid'});
  assert.equal(r.status, 200);
  assert.equal(r.data.state, 'sent');
  assert.equal(x.sent[0].email, 'buyer@example.invalid');
  assert.equal(x.sent[0].options.emailRedirectTo, 'https://billsavingsai.com/start.html?access=ready');
  assert.ok(!JSON.stringify(r.data).includes('buyer@example.invalid'));
  assert.ok(!JSON.stringify(r.data).includes(proof));
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Object.keys(r.data).sort(), ['account_matches','email_hint','retry_after','state']);
});
test('refreshes and concurrent requests send one email; explicit resends obey cooldown', async () => {
  const x = setup();
  await Promise.all([x.send(), x.send(), x.send()]);
  assert.equal(x.sent.length, 1);
  assert.equal((await x.send()).data.state, 'sent');
  assert.equal(x.sent.length, 1);
  assert.equal((await x.send({resend: true})).status, 429);
  x.rows.get(hash).next_attempt_at = new Date(0).toISOString();
  assert.equal((await x.send({resend: true})).data.state, 'sent');
  assert.equal(x.sent.length, 2);
});
test('expired and exhausted receipts cannot send emails', async () => {
  for (const [receipt, state] of [
    [{expires_at: new Date(0).toISOString()}, 'expired'], [{attempts: 5}, 'limit_reached']
  ]) {
    const x = setup({receipt});
    assert.equal((await x.send()).data.state, state);
    assert.equal(x.sent.length, 0);
  }
});
test('only a verified matching account skips email; forged and other accounts cannot', async () => {
  const x = setup({user: {email: 'buyer@example.invalid', email_confirmed_at: 'synthetic-confirmed'}});
  assert.equal((await x.send({}, {authorization: 'Bearer valid-synthetic-jwt'})).data.state, 'account_ready');
  assert.equal(x.sent.length, 0);
  assert.equal((await x.send({}, {authorization: 'Bearer forged'})).data.account_matches, false);
  const other = setup({user: {email: 'other@example.invalid', email_confirmed_at: 'synthetic-confirmed'}});
  assert.equal((await other.send({}, {authorization: 'Bearer valid-synthetic-jwt'})).data.account_matches, false);
  const unconfirmed = setup({user: {email: 'buyer@example.invalid'}});
  assert.equal((await unconfirmed.send({}, {authorization: 'Bearer valid-synthetic-jwt'})).data.account_matches, false);
});
test('provider failure is not reported as sent and cannot create a retry storm', async () => {
  const x = setup({sendFailure: true});
  assert.equal((await x.send()).data.state, 'delivery_unavailable');
  assert.equal(x.rows.get(hash).email_sent_at, null);
  assert.equal((await x.send()).status, 429);
  assert.equal(x.sent.length, 1);
});
test('database failures never send before acquiring a durable delivery slot', async () => {
  for (const failure of ['select','update']) {
    const x = setup({failure});
    assert.equal((await x.send()).status, 503);
    assert.equal(x.sent.length, 0);
    x.recover();
    assert.equal((await x.send()).data.state, 'sent');
  }
});
