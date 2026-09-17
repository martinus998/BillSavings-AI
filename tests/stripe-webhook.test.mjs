import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto, createHmac} from 'node:crypto';
import vm from 'node:vm';

const source = readFileSync(new URL('../supabase/functions/stripe-webhook/index.ts', import.meta.url), 'utf8');
const code = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, ''), {mode: 'strip'});
const signingSecret = 'synthetic-webhook-secret';
const accountUserId = '11111111-2222-4333-8444-555555555555';

function setup(options = {}) {
  const events = new Map(), subscriptions = new Map(), pending = new Map(), receipts = new Map();
  const writes = [], accountLookups = [], emailLookups = [];
  let fail = options.fail || '', handler;
  const client = {
    rpc: async (name, args) => {
      emailLookups.push({name, args});
      return {data: options.newUser ? null : 'synthetic-user', error: fail === 'rpc' ? {code: 'XX000'} : null};
    },
    auth: {admin: {getUserById: async userId => {
      accountLookups.push(userId);
      if(options.onAccountLookup)options.onAccountLookup(subscriptions);
      return {data: {user: Object.hasOwn(options, 'accountUser') ? options.accountUser : {
        id: accountUserId, email: 'Account@Example.invalid', email_confirmed_at: '2026-09-17T12:00:00Z', is_anonymous: false
      }}, error: fail === 'auth.getUserById' ? {code: 'auth_unavailable'} : null};
    }}},
    from(table) {
      let operation = 'select', value, filters = [], ignoreDuplicates = false, returning = false;
      const builder = {
        select() {if(operation !== 'select')returning = true; return this;},
        eq(key, val) {filters.push([key, val]); return this;},
        is(key, val) {filters.push([key, val]); return this;},
        maybeSingle() {return this;},
        upsert(v, options = {}) {operation = 'upsert'; value = v; ignoreDuplicates = options.ignoreDuplicates; return this;},
        update(v) {operation = 'update'; value = v; return this;},
        delete() {operation = 'delete'; return this;},
        insert(v) {operation = 'insert'; value = v; return this;},
        then(resolve, reject) {
          const key = table + '.' + operation;
          const run = async () => {
            if(fail === key) return {data: null, error: {code: 'XX000'}};
            const records = table === 'billing_webhook_events' ? events : table === 'billing_subscriptions' ? subscriptions : table === 'billing_checkout_access' ? receipts : pending;
            if(operation === 'select') {
              const row = [...records.values()].find(r => filters.every(([k,v]) => r[k] === v));
              return {data: row ? {...row} : null, error: null};
            }
            writes.push(key);
            const recordKey = value?.id || value?.user_id || value?.stripe_subscription_id || value?.session_hash;
            let writtenRow = null;
            if((operation === 'upsert' || operation === 'insert') && !(ignoreDuplicates && records.has(recordKey))) {
              records.set(recordKey, {...value});
              writtenRow = records.get(recordKey);
            }
            if(operation === 'update') for(const row of records.values()) if(filters.every(([k,v]) => row[k] === v)) {
              Object.assign(row, value);
              writtenRow = row;
            }
            if(operation === 'delete') for(const [k,row] of records) if(filters.every(([f,v]) => row[f] === v)) records.delete(k);
            return {data: returning && writtenRow ? {...writtenRow} : null, error: null};
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
  return {send, handler, events, subscriptions, pending, receipts, writes, accountLookups, emailLookups, recover: () => {fail = '';}};
}

function checkout(id = 'synthetic-event') {
  return {id, livemode: true, type: 'checkout.session.completed', data: {object: {
    id: 'cs_live_syntheticCheckoutSession123456789',
    customer_details: {email: 'audit@example.invalid'}, customer: 'synthetic-customer', subscription: 'synthetic-subscription',
    payment_link: 'plink_1UFUpgBVUFmkZjNklE0nIKnS', payment_status: 'paid', status: 'complete'
  }}};
}

function accountCheckout(id = 'synthetic-account-event') {
  const event = checkout(id);
  Object.assign(event.data.object, {
    payment_link: null, client_reference_id: accountUserId,
    metadata: {account_checkout: 'v1', user_id: accountUserId, plan: 'premium'}
  });
  return event;
}

test('account checkout grants the confirmed metadata user and uses their Auth email even if Stripe email differs', async () => {
  const x = setup({newUser: true}), event = accountCheckout();
  event.data.object.customer_details.email = 'another-customer@example.invalid';
  event.data.object.customer_email = 'also-not-the-owner@example.invalid';
  assert.equal((await x.send(event)).status, 200);
  assert.equal(x.subscriptions.get(accountUserId).status, 'active');
  assert.equal(x.subscriptions.get(accountUserId).plan, 'premium');
  assert.equal(x.subscriptions.size, 1);
  assert.equal(x.pending.size, 0);
  assert.deepEqual(x.accountLookups, [accountUserId]);
  assert.equal(x.emailLookups.length, 0);
  assert.equal([...x.receipts.values()][0].email, 'account@example.invalid');
});

test('account checkout does not require an editable Stripe email for account ownership', async () => {
  const x = setup(), event = accountCheckout();
  delete event.data.object.customer_details;
  delete event.data.object.customer_email;
  event.data.object.metadata.plan = 'family';
  assert.equal((await x.send(event)).status, 200);
  assert.equal(x.subscriptions.get(accountUserId).plan, 'family');
  assert.equal(x.emailLookups.length, 0);
  assert.equal([...x.receipts.values()][0].email, 'account@example.invalid');
});

test('malformed account checkout markers, user IDs, plans and client references fail before all writes', async () => {
  for (const modify of [
    obj => { obj.metadata.account_checkout = 'v2'; },
    obj => { obj.metadata.account_checkout = ''; },
    obj => { obj.metadata.account_checkout = null; },
    obj => { delete obj.metadata.user_id; },
    obj => { obj.metadata.user_id = 'not-a-user-id'; },
    obj => { delete obj.client_reference_id; },
    obj => { obj.client_reference_id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'; },
    obj => { obj.metadata.plan = 'free'; },
    obj => { delete obj.metadata.plan; }
  ]) {
    const x = setup(), event = accountCheckout();
    // Even a known legacy payment link must not make malformed tagged data fall back.
    event.data.object.payment_link = 'plink_1UFUpgBVUFmkZjNklE0nIKnS';
    modify(event.data.object);
    assert.equal((await x.send(event)).status, 500);
    assert.equal(x.writes.length, 0);
    assert.equal(x.events.size, 0);
    assert.equal(x.emailLookups.length, 0);
    assert.equal(x.accountLookups.length, 0);
  }
});

test('unconfirmed, anonymous, missing and mismatched Auth accounts cannot receive account checkout access', async () => {
  for (const accountUser of [
    null,
    {id: accountUserId, email: 'account@example.invalid', email_confirmed_at: null},
    {id: accountUserId, email: 'account@example.invalid', email_confirmed_at: 'synthetic', is_anonymous: true},
    {id: accountUserId, email: '', email_confirmed_at: 'synthetic'},
    {id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', email: 'account@example.invalid', email_confirmed_at: 'synthetic'}
  ]) {
    const x = setup({accountUser});
    assert.equal((await x.send(accountCheckout())).status, 500);
    assert.equal(x.writes.length, 0);
    assert.equal(x.events.size, 0);
    assert.equal(x.emailLookups.length, 0);
  }
});

test('account lookup failure retries without falling back to checkout email', async () => {
  const x = setup({fail: 'auth.getUserById'}), event = accountCheckout();
  assert.equal((await x.send(event)).status, 500);
  assert.equal(x.writes.length, 0);
  assert.equal(x.emailLookups.length, 0);
  x.recover();
  assert.equal((await x.send(event)).status, 200);
  assert.equal(x.subscriptions.get(accountUserId).status, 'active');
  assert.equal(x.events.size, 1);
});

test('tagged checkout cannot replace a different active subscription', async () => {
  const x = setup();
  const existing = {user_id: accountUserId, stripe_subscription_id: 'newer-subscription',
    plan: 'family', status: 'active', livemode: true, updated_at: '2026-09-17T15:00:00Z'};
  x.subscriptions.set(accountUserId, {...existing});
  assert.equal((await x.send(accountCheckout())).status, 500);
  assert.deepEqual(x.subscriptions.get(accountUserId), existing);
  assert.equal(x.writes.length, 0);
  assert.equal(x.events.size, 0);
});

test('delayed tagged checkout preserves recorded cancellation and failed-payment status for the same subscription', async () => {
  for (const status of ['canceled', 'past_due', 'unpaid', 'paused', 'trialing', 'active']) {
    const x = setup();
    const existing = {user_id: accountUserId, stripe_subscription_id: 'synthetic-subscription',
      plan: status === 'canceled' ? 'free' : 'premium', status, livemode: true, updated_at: '2026-09-17T15:00:00Z'};
    x.subscriptions.set(accountUserId, {...existing});
    assert.equal((await x.send(accountCheckout())).status, 200);
    assert.deepEqual(x.subscriptions.get(accountUserId), existing);
    assert.equal(x.writes.includes('billing_subscriptions.update'), false);
    assert.equal(x.events.size, 1);
  }
});

test('tagged async payment can activate an incomplete subscription with the unchanged snapshot', async () => {
  const x = setup();
  x.subscriptions.set(accountUserId, {user_id: accountUserId, stripe_subscription_id: 'synthetic-subscription',
    plan: 'premium', status: 'incomplete', livemode: true, updated_at: '2026-09-17T15:00:00Z'});
  const event = accountCheckout();
  event.type = 'checkout.session.async_payment_succeeded';
  assert.equal((await x.send(event)).status, 200);
  assert.equal(x.subscriptions.get(accountUserId).status, 'active');
});

test('tagged checkout cannot overwrite a concurrent cancellation after its subscription snapshot', async () => {
  const x = setup({onAccountLookup(subscriptions) {
    Object.assign(subscriptions.get(accountUserId), {status: 'canceled', plan: 'free', updated_at: '2026-09-17T15:01:00Z'});
  }});
  x.subscriptions.set(accountUserId, {user_id: accountUserId, stripe_subscription_id: 'synthetic-subscription',
    plan: 'premium', status: 'incomplete', livemode: true, updated_at: '2026-09-17T15:00:00Z'});
  assert.equal((await x.send(accountCheckout())).status, 500);
  assert.equal(x.subscriptions.get(accountUserId).status, 'canceled');
  assert.equal(x.subscriptions.get(accountUserId).plan, 'free');
  assert.equal(x.events.size, 0);
  assert.equal(x.receipts.size, 0);
});

test('tagged checkout insert cannot replace another subscription created after its empty snapshot', async () => {
  const newer = {user_id: accountUserId, stripe_subscription_id: 'newer-subscription',
    plan: 'family', status: 'active', livemode: true, updated_at: '2026-09-17T15:01:00Z'};
  const x = setup({onAccountLookup(subscriptions) { subscriptions.set(accountUserId, {...newer}); }});
  assert.equal((await x.send(accountCheckout())).status, 500);
  assert.deepEqual(x.subscriptions.get(accountUserId), newer);
  assert.equal(x.events.size, 0);
  assert.equal(x.receipts.size, 0);
});

test('legacy Payment Link checkout without the account marker retains email lookup and pending entitlement behavior', async () => {
  const x = setup({newUser: true});
  assert.equal((await x.send(checkout())).status, 200);
  assert.equal(x.accountLookups.length, 0);
  assert.equal(x.emailLookups.length, 1);
  assert.equal(x.emailLookups[0].args.p_email, 'audit@example.invalid');
  assert.equal(x.pending.get('synthetic-subscription').email, 'audit@example.invalid');
  assert.equal(x.subscriptions.size, 0);
});

for(const [failure, newUser] of [
  ['billing_webhook_events.select', false], ['rpc', false], ['billing_subscriptions.upsert', false],
  ['billing_pending_entitlements.delete', false], ['billing_pending_entitlements.upsert', true],
  ['billing_checkout_access.upsert', false],
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
  assert.equal(x.receipts.size, 0);
});

test('receipt contains only hashed proof and verified email; retries preserve delivery state', async () => {
  const x = setup();
  await x.send(checkout());
  const [hash, receipt] = [...x.receipts][0];
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(receipt.email, 'audit@example.invalid');
  assert.ok(!JSON.stringify(receipt).includes('cs_live_'));
  receipt.attempts = 3;
  receipt.email_sent_at = 'synthetic-sent';
  await x.send(checkout('another-event-for-same-session'));
  assert.equal(x.receipts.size, 1);
  assert.equal(x.receipts.get(hash).attempts, 3);
  assert.equal(x.receipts.get(hash).email_sent_at, 'synthetic-sent');
});

test('delayed successful payment produces the access receipt', async () => {
  const x = setup(), event = checkout();
  event.data.object.payment_status = 'unpaid';
  await x.send(event);
  event.id = 'async-payment'; event.type = 'checkout.session.async_payment_succeeded';
  event.data.object.payment_status = 'paid';
  await x.send(event);
  assert.equal(x.subscriptions.get('synthetic-user').status, 'active');
  assert.equal(x.receipts.size, 1);
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
