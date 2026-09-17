import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto, createHmac} from 'node:crypto';
import vm from 'node:vm';

const source = readFileSync(new URL('../supabase/functions/stripe-webhook/index.ts', import.meta.url), 'utf8');
const code = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, ''), {mode: 'strip'});
const signingSecret = 'synthetic-webhook-secret';

function setup(options = {}) {
  const events = new Map(), subscriptions = new Map(), pending = new Map();
  const writes = [];
  let fail = options.fail || '', handler;
  const client = {
    rpc: async () => ({data: options.newUser ? null : 'synthetic-user', error: fail === 'rpc' ? {code: 'XX000'} : null}),
    from(table) {
      let operation = 'select', value, filters = [];
      const builder = {
        select() {return this;},
        eq(key, val) {filters.push([key, val]); return this;},
        maybeSingle() {return this;},
        upsert(v) {operation = 'upsert'; value = v; return this;},
        update(v) {operation = 'update'; value = v; return this;},
        delete() {operation = 'delete'; return this;},
        insert(v) {operation = 'insert'; value = v; return this;},
        then(resolve, reject) {
          const key = table + '.' + operation;
          const run = async () => {
            if(fail === key) return {data: null, error: {code: 'XX000'}};
            const records = table === 'billing_webhook_events' ? events : table === 'billing_subscriptions' ? subscriptions : pending;
            if(operation === 'select') return {data: [...records.values()].find(r => filters.every(([k,v]) => r[k] === v)) || null, error: null};
            writes.push(key);
            if(operation === 'upsert' || operation === 'insert') records.set(value.id || value.user_id || value.stripe_subscription_id, {...value});
            if(operation === 'update') for(const row of records.values()) if(filters.every(([k,v]) => row[k] === v)) Object.assign(row, value);
            if(operation === 'delete') for(const [k,row] of records) if(filters.every(([f,v]) => row[f] === v)) records.delete(k);
            return {data: null, error: null};
          };
          return run().then(resolve, reject);
        }
      };
      return builder;
    }
  };
  const context = {
    crypto: webcrypto, TextEncoder, Response, Request, Date,
    console: {error() {}}, createClient: () => client,
    Deno: {env: {get: key => key === 'STRIPE_LIVE_WEBHOOK_SECRET' ? signingSecret : 'synthetic'}, serve: callback => {handler = callback;}}
  };
  vm.runInNewContext(code, context);
  const send = async event => {
    const body = JSON.stringify(event), timestamp = String(Math.floor(Date.now()/1000));
    const signature = createHmac('sha256', signingSecret).update(timestamp + '.' + body).digest('hex');
    return handler(new Request('https://example.invalid/webhook', {method: 'POST', body, headers: {'stripe-signature': 't=' + timestamp + ',v1=' + signature}}));
  };
  return {send, handler, events, subscriptions, pending, writes, recover: () => {fail = '';}};
}

function checkout(id = 'synthetic-event') {
  return {id, livemode: true, type: 'checkout.session.completed', data: {object: {
    customer_details: {email: 'audit@example.invalid'}, customer: 'synthetic-customer', subscription: 'synthetic-subscription',
    payment_link: 'plink_1UFUpgBVUFmkZjNklE0nIKnS', payment_status: 'paid', status: 'complete'
  }}};
}

for(const [failure, newUser] of [
  ['billing_webhook_events.select', false], ['rpc', false], ['billing_subscriptions.upsert', false],
  ['billing_pending_entitlements.delete', false], ['billing_pending_entitlements.upsert', true],
  ['billing_webhook_events.insert', false]
]) {
  test('retry safely after ' + failure, async () => {
    const x = setup({fail: failure, newUser});
    assert.equal((await x.send(checkout())).status, 500);
    assert.equal(x.events.size, 0);
    x.recover();
    assert.equal((await x.send(checkout())).status, 200);
    assert.equal(x.events.size, 1);
    assert.equal((newUser ? x.pending : x.subscriptions).size, 1);
    const writes = x.writes.length;
    const duplicate = await x.send(checkout());
    assert.equal((await duplicate.json()).duplicate, true);
    assert.equal(x.writes.length, writes);
  });
}

test('unpaid completed session does not activate a plan', async () => {
  const x = setup(), event = checkout();
  event.data.object.payment_status = 'unpaid';
  assert.equal((await x.send(event)).status, 200);
  assert.equal(x.subscriptions.get('synthetic-user').status, 'incomplete');
});

test('invalid signature is rejected before database processing', async () => {
  const x = setup();
  assert.equal((await x.handler(new Request('https://example.invalid', {method: 'POST', body: '{}'}))).status, 400);
  assert.equal(x.writes.length, 0);
});

test('subscription deletion revokes access; failed lifecycle writes are retried', async () => {
  const x = setup();
  await x.send(checkout());
  const event = {id: 'synthetic-cancel', livemode: true, type: 'customer.subscription.deleted', data: {object: {id: 'synthetic-subscription', customer: 'synthetic-customer'}}};
  assert.equal((await x.send(event)).status, 200);
  assert.equal(x.subscriptions.get('synthetic-user').status, 'canceled');
  assert.equal(x.subscriptions.get('synthetic-user').plan, 'free');
  for(const failure of ['billing_subscriptions.select', 'billing_pending_entitlements.update']) {
    const broken = setup({fail: failure});
    assert.equal((await broken.send(event)).status, 500);
    assert.equal(broken.events.size, 0);
  }
});

test('invoice write failures do not acknowledge successful processing', async () => {
  for(const fail of ['billing_subscriptions.update', 'billing_pending_entitlements.update']) {
    const x = setup({fail});
    const event = {id: 'synthetic-invoice', livemode: true, type: 'invoice.paid', data: {object: {subscription: 'synthetic-subscription'}}};
    assert.equal((await x.send(event)).status, 500);
    assert.equal(x.events.size, 0);
  }
});
