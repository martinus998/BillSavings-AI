import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';

const source = readFileSync(new URL('../supabase/functions/account-checkout/index.ts', import.meta.url), 'utf8');
const code = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, ''), {mode: 'strip'});
const userId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const sessionId = 'cs_live_syntheticCheckoutSession123456789';
const customerId = 'cus_syntheticcustomer';
const subscriptionId = 'sub_syntheticsubscription';
// Generate unmistakable dummy credentials for the mocked provider. No real
// Stripe key is stored in this test or used in a network request.
const mockKey = (kind, mode) => [kind, mode, 'syntheticTestValue123456789'].join('_');
const secretKey = mockKey('rk', 'live');
const publicKey = mockKey('pk', 'live');
const prices = {premium: 'price_1UFUoGBVUFmkZjNkG7vyLCFo', family: 'price_1UFUoUBVUFmkZjNk18GxhWCs'};
function fixture(plan = 'premium') {
  const metadata = {account_checkout: 'v1', user_id: userId, plan};
  const items = {has_more: false, data: [{quantity: 1,
    current_period_end: Math.floor(Date.now() / 1000) + 86400,
    price: {id: prices[plan], unit_amount: plan === 'family' ? 1399 : 899,
      currency: 'usd', livemode: true, recurring: {interval: 'month', interval_count: 1}}}]};
  return {id: sessionId, livemode: true, mode: 'subscription', ui_mode: 'embedded_page',
    client_reference_id: userId, metadata: {...metadata}, status: 'complete', payment_status: 'paid',
    customer: customerId, client_secret: `${sessionId}_secret_synthetic`, line_items: structuredClone(items),
    subscription: {id: subscriptionId, livemode: true, customer: customerId, metadata: {...metadata},
      status: 'active', items: structuredClone(items)}};
}
function setup(options = {}) {
  let handler;
  const calls = [], writes = [], writeAttempts = [], users = [], reads = [];
  const config = {SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-role',
    BILLSAVINGS_ACCOUNT_STRIPE_LIVE_KEY: secretKey, BILLSAVINGS_ACCOUNT_STRIPE_LIVE_PUBLISHABLE_KEY: publicKey,
    ...options.env};
  const user = {id: userId, email: 'verified@example.invalid', email_confirmed_at: '2026-09-17T00:00:00Z', ...options.user};
  const client = {
    auth: {getUser: async token => {users.push(token); return {data: {user: token === 'valid-synthetic-jwt' ? user : null}, error: options.authError || null};}},
    from(table) {
      assert.equal(table, 'billing_subscriptions');
      const filters = [];
      let operation = 'read', row, settings;
      return {
        select(columns) {reads.push(columns); return this;},
        eq(key, value) {filters.push([key, value]); return this;},
        is(key, value) {filters.push([key, value]); return this;},
        update(value) {operation = 'update'; row = structuredClone(value); return this;},
        upsert(value, options) {operation = 'upsert'; row = structuredClone(value); settings = options; return this;},
        async maybeSingle() {
          if (operation === 'read') {
            assert.deepEqual(filters, [['user_id', userId]]);
            return {data: options.existing ? {updated_at: '2026-09-17T00:00:00Z', ...options.existing} : null,
              error: options.readError ? {code: 'XX000'} : null};
          }
          writeAttempts.push({operation, filters, settings});
          if (operation === 'upsert') {
            assert.equal(settings.onConflict, 'user_id');
            assert.equal(settings.ignoreDuplicates, true);
          } else {
            assert.deepEqual(filters, [['user_id', userId], ['updated_at', options.existing.updated_at || '2026-09-17T00:00:00Z'],
              ['stripe_subscription_id', options.existing.stripe_subscription_id]]);
          }
          if (options.writeError) return {data: null, error: {code: 'XX000'}};
          if (options.raceOnWrite) return {data: null, error: null};
          writes.push(row);
          return {data: {user_id: userId}, error: null};
        }
      };
    }
  };
  vm.runInNewContext(code, {TextDecoder, Response, URLSearchParams, AbortSignal, Date,
    createClient: (url, key) => {assert.equal(key, 'synthetic-service-role'); return client;},
    fetch: async (url, init) => {
      calls.push({url, init});
      assert.ok(url.startsWith('https://api.stripe.com/v1/checkout/sessions'));
      assert.equal(init.headers.Authorization, `Bearer ${config.BILLSAVINGS_ACCOUNT_STRIPE_LIVE_KEY}`);
      assert.equal(init.headers['Stripe-Version'], '2026-07-29.dahlia');
      return new Response(JSON.stringify(options.session || fixture()), {status: options.stripeFailure ? 500 : 200});
    },
    Deno: {env: {get: key => config[key]}, serve: fn => {handler = fn;}}
  });
  async function send(body = {}, options = {}) {
    const method = options.method || 'POST';
    const r = await handler(new Request('https://example.invalid/account-checkout', {
      method, headers: {origin: 'https://billsavingsai.com', authorization: 'Bearer valid-synthetic-jwt',
        'content-type': 'application/json', ...options.headers},
      ...(['GET', 'OPTIONS'].includes(method) ? {} : {body: options.raw ?? JSON.stringify({action: 'status', session_id: sessionId, ...body})})
    }));
    return {status: r.status, data: r.status === 204 ? null : await r.json(), headers: r.headers};
  }
  return {send, calls, writes, writeAttempts, users, reads};
}

test('public readiness exposes only the live publishable key and never contacts Stripe or Auth', async () => {
  const x = setup();
  const result = await x.send({}, {method: 'GET', headers: {authorization: ''}});
  assert.deepEqual(result.data, {configured: true, publishable_key: publicKey});
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(x.calls.length + x.users.length + x.writes.length, 0);
  for (const env of [
    {BILLSAVINGS_ACCOUNT_STRIPE_LIVE_KEY: ''}, {BILLSAVINGS_ACCOUNT_STRIPE_LIVE_PUBLISHABLE_KEY: ''},
    {BILLSAVINGS_ACCOUNT_STRIPE_LIVE_KEY: mockKey('sk', 'test')},
    {BILLSAVINGS_ACCOUNT_STRIPE_LIVE_PUBLISHABLE_KEY: mockKey('pk', 'test')},
    {SUPABASE_SERVICE_ROLE_KEY: ''}
  ]) {
    const y = setup({env});
    assert.deepEqual((await y.send({}, {method: 'GET'})).data, {configured: false});
    assert.equal((await y.send({action: 'create', plan: 'premium', request_id: requestId})).status, 503);
    assert.equal(y.calls.length + y.writes.length, 0);
  }
});

test('legacy Stripe variables cannot enable the isolated account checkout', async () => {
  const legacy = {BILLSAVINGS_STRIPE_LIVE_SECRET_KEY: secretKey,
    STRIPE_LIVE_SECRET_KEY: secretKey, STRIPE_SECRET_KEY: secretKey,
    BILLSAVINGS_STRIPE_LIVE_PUBLISHABLE_KEY: publicKey, STRIPE_PUBLISHABLE_KEY: publicKey};
  for (const missing of [
    {BILLSAVINGS_ACCOUNT_STRIPE_LIVE_KEY: '', BILLSAVINGS_ACCOUNT_STRIPE_LIVE_PUBLISHABLE_KEY: ''},
    {BILLSAVINGS_ACCOUNT_STRIPE_LIVE_KEY: ''}, {BILLSAVINGS_ACCOUNT_STRIPE_LIVE_PUBLISHABLE_KEY: ''}
  ]) {
    const x = setup({env: {...legacy, ...missing}});
    assert.deepEqual((await x.send({}, {method: 'GET'})).data, {configured: false});
    assert.equal((await x.send({action: 'create', plan: 'premium', request_id: requestId})).status, 503);
    assert.equal(x.calls.length + x.writes.length, 0);
  }
  for (const key of [secretKey, mockKey('sk', 'live')]) {
    const x = setup({env: {BILLSAVINGS_ACCOUNT_STRIPE_LIVE_KEY: key}});
    assert.deepEqual((await x.send({}, {method: 'GET'})).data, {configured: true, publishable_key: publicKey});
  }
});

test('origin, method, malformed and oversized input checks run without billing mutations', async () => {
  const x = setup();
  assert.equal((await x.send({}, {headers: {origin: 'https://attacker.invalid'}})).status, 403);
  assert.equal((await x.send({}, {headers: {origin: ''}})).status, 403);
  assert.equal((await x.send({}, {method: 'PUT'})).status, 405);
  assert.equal((await x.send({}, {method: 'OPTIONS'})).status, 204);
  for (const raw of ['{', 'null', '[]', JSON.stringify({action: 'status', session_id: sessionId, extra: 'x'.repeat(2100)})])
    assert.equal((await x.send({}, {raw})).status, 400);
  assert.equal((await x.send({session_id: 'cs_test_syntheticCheckoutSession123456789'})).status, 400);
  assert.equal(x.calls.length + x.writes.length, 0);
});

test('every operation requires a verified, nonanonymous Supabase account', async () => {
  for (const body of [{action: 'status'}, {action: 'create', plan: 'premium', request_id: requestId}]) {
    for (const authorization of ['', 'Bearer forged', 'Bearer invalid with spaces']) {
      const x = setup();
      assert.equal((await x.send(body, {headers: {authorization}})).status, 401);
      assert.equal(x.calls.length + x.writes.length, 0);
    }
    for (const [user, status] of [[{email_confirmed_at: null}, 403], [{is_anonymous: true}, 401], [{email: null}, 401]]) {
      const x = setup({user});
      assert.equal((await x.send(body)).status, status);
      assert.equal(x.calls.length + x.writes.length, 0);
    }
  }
});

test('creates the selected fixed-price embedded checkout for verified identity with stable idempotency', async () => {
  for (const plan of ['premium', 'family']) {
    const x = setup({session: fixture(plan)});
    const body = {action: 'create', plan, request_id: requestId, user_id: otherId,
      email: 'attacker@example.invalid', price: 'price_forged', amount: 1,
      return_url: 'https://attacker.invalid', password: 'never-forward-this'};
    const r = await x.send(body);
    assert.equal(r.status, 200);
    assert.deepEqual(r.data, {client_secret: `${sessionId}_secret_synthetic`, session_id: sessionId});
    await x.send(body);
    assert.equal(x.calls[0].init.body, x.calls[1].init.body);
    assert.equal(x.calls[0].init.headers['Idempotency-Key'], x.calls[1].init.headers['Idempotency-Key']);
    assert.equal(x.calls[0].init.headers['Idempotency-Key'], `account-checkout:${userId}:${requestId}:${plan}`);
    const params = new URLSearchParams(x.calls[0].init.body);
    assert.equal(params.get('ui_mode'), 'embedded_page');
    assert.equal(params.get('line_items[0][price]'), prices[plan]);
    assert.equal(params.get('line_items[0][quantity]'), '1');
    assert.equal(params.get('client_reference_id'), userId);
    assert.equal(params.get('customer_email'), 'verified@example.invalid');
    assert.equal(params.get('return_url'), 'https://billsavingsai.com/start.html?account_checkout=return&session_id={CHECKOUT_SESSION_ID}');
    assert.equal(params.get('redirect_on_completion'), 'always');
    assert.equal(params.get('locale'), 'auto');
    for (const prefix of ['metadata', 'subscription_data[metadata]']) {
      assert.equal(params.get(`${prefix}[user_id]`), userId);
      assert.equal(params.get(`${prefix}[account_checkout]`), 'v1');
      assert.equal(params.get(`${prefix}[plan]`), plan);
    }
    assert.match(params.get('integration_identifier'), /^billsavings_account_[a-z]{8}$/);
    assert.ok(!x.calls[0].init.body.includes('attacker'));
    assert.ok(!x.calls[0].init.body.includes('never-forward-this'));
    assert.ok(![...params.keys()].some(key => /payment_method_types|custom_fields|password|success_url/.test(key)));
    assert.equal(x.writes.length, 0);
  }
});

test('invalid plans and idempotency request IDs never create checkout', async () => {
  const x = setup();
  for (const body of [{plan: 'free', request_id: requestId}, {plan: 'premium'},
    {plan: 'premium', request_id: 'bad'}, {plan: 'family', request_id: 1}])
    assert.equal((await x.send({action: 'create', ...body})).status, 400);
  assert.equal(x.calls.length, 0);
});

test('an existing live subscription blocks another checkout including delinquent and incomplete subscriptions', async () => {
  for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']) {
    const x = setup({existing: {status, livemode: true}});
    const r = await x.send({action: 'create', plan: 'premium', request_id: requestId});
    assert.equal(r.status, 409);
    assert.deepEqual(r.data, {state: 'already_subscribed'});
    assert.equal(x.calls.length, 0);
  }
  const ended = setup({existing: {status: 'canceled', livemode: true}});
  assert.equal((await ended.send({action: 'create', plan: 'premium', request_id: requestId})).status, 200);
});

test('paid checkout for the signed-in user persists only Stripe-confirmed entitlement', async () => {
  for (const plan of ['premium', 'family']) {
    const x = setup({session: fixture(plan)});
    const r = await x.send({user_id: otherId, plan: plan === 'premium' ? 'family' : 'premium', paid: true});
    assert.deepEqual(r.data, {state: 'paid', plan});
    assert.equal(r.status, 200);
    assert.equal(x.writes.length, 1);
    assert.equal(x.writes[0].user_id, userId);
    assert.equal(x.writes[0].plan, plan);
    assert.equal(x.writes[0].stripe_subscription_id, subscriptionId);
    assert.equal(x.writes[0].stripe_customer_id, customerId);
    assert.equal(x.writes[0].livemode, true);
    assert.equal(x.writes[0].status, 'active');
    assert.ok(Date.parse(x.writes[0].current_period_end) > Date.now());
    assert.ok(!JSON.stringify(r.data).includes('verified@example.invalid'));
    assert.ok(!JSON.stringify(r.data).includes(sessionId));
    assert.ok(x.calls[0].url.endsWith('?expand[]=subscription&expand[]=line_items'));
  }
});

test('another account, legacy hosted session, test mode or inconsistent ownership cannot activate access', async () => {
  for (const mutate of [
    s => {s.client_reference_id = otherId;}, s => {s.metadata.user_id = otherId;},
    s => {s.metadata.account_checkout = undefined;}, s => {s.subscription.metadata.user_id = otherId;},
    s => {s.subscription.metadata.account_checkout = undefined;}, s => {s.subscription.metadata.plan = 'family';},
    s => {s.livemode = false;}, s => {s.subscription.livemode = false;},
    s => {s.id = 'cs_live_someOtherSession12345678901';}, s => {s.ui_mode = 'hosted_page';},
    s => {s.mode = 'payment';}, s => {s.subscription.customer = 'cus_other';},
    s => {s.subscription = subscriptionId;}
  ]) {
    const session = fixture(); mutate(session);
    const x = setup({session});
    assert.equal((await x.send()).status, 404);
    assert.equal(x.writes.length, 0);
  }
});

test('unpaid, incomplete and expired checkout never unlocks a plan despite a paid query value', async () => {
  for (const [status, payment_status, state, code] of [
    ['open', 'unpaid', 'pending', 202], ['complete', 'unpaid', 'pending', 202],
    ['complete', 'no_payment_required', 'pending', 202], ['open', 'paid', 'pending', 202],
    ['expired', 'unpaid', 'expired', 410]
  ]) {
    const x = setup({session: {...fixture(), status, payment_status}});
    const r = await x.send({paid: true, status: 'complete'});
    assert.equal(r.status, code);
    assert.deepEqual(r.data, {state});
    assert.equal(x.writes.length, 0);
  }
});

test('unrecognized prices, wrong amounts, mixed items and mismatched plans cannot grant entitlement', async () => {
  for (const location of ['session', 'subscription']) {
    for (const mutate of [
      i => {i.data[0].price.id = 'price_other';}, i => {i.data[0].price.id = prices.family;},
      i => {i.data[0].price.unit_amount = 1;}, i => {i.data[0].price.currency = 'eur';},
      i => {i.data[0].price.livemode = false;}, i => {i.data[0].quantity = 2;},
      i => {i.data[0].price.recurring.interval = 'year';}, i => {i.data.push({...i.data[0]});},
      i => {i.has_more = true;}
    ]) {
      const session = fixture();
      mutate(location === 'session' ? session.line_items : session.subscription.items);
      const x = setup({session});
      assert.equal((await x.send()).status, 404);
      assert.equal(x.writes.length, 0);
    }
  }
});

test('inactive or ended subscriptions do not revive from an old completed checkout', async () => {
  for (const status of ['canceled', 'past_due', 'incomplete', 'unpaid', 'paused']) {
    const session = fixture(); session.subscription.status = status;
    const x = setup({session});
    assert.equal((await x.send()).data.state, 'pending');
    assert.equal(x.writes.length, 0);
  }
  const session = fixture(); session.subscription.items.data[0].current_period_end = 1;
  const x = setup({session});
  assert.equal((await x.send()).data.state, 'pending');
  assert.equal(x.writes.length, 0);
});

test('an older paid session cannot replace another current subscription', async () => {
  const x = setup({existing: {stripe_subscription_id: 'sub_newer', livemode: true, status: 'active'}});
  assert.equal((await x.send()).status, 409);
  assert.equal(x.writes.length, 0);
  const same = setup({existing: {stripe_subscription_id: subscriptionId, livemode: true, status: 'active'}});
  assert.equal((await same.send()).data.state, 'paid');
});

test('a concurrent webhook update or inserted subscription cannot be overwritten by the status result', async () => {
  for (const existing of [null, {stripe_subscription_id: subscriptionId, status: 'active', livemode: true},
    {stripe_subscription_id: 'sub_older', status: 'canceled', livemode: true}]) {
    const x = setup({existing, raceOnWrite: true});
    const result = await x.send();
    assert.equal(result.status, 503);
    assert.deepEqual(result.data, {state: 'unavailable'});
    assert.equal(x.writeAttempts.length, 1);
    assert.equal(x.writes.length, 0);
  }
});

test('provider and database errors fail closed without exposing credentials or error bodies', async () => {
  for (const options of [{stripeFailure: true}, {readError: true}, {writeError: true}]) {
    const x = setup(options);
    const result = await x.send();
    assert.equal(result.status, 503);
    assert.deepEqual(result.data, {state: 'unavailable'});
    assert.ok(!JSON.stringify(result.data).includes(secretKey));
  }
  const x = setup({readError: true});
  assert.equal((await x.send({action: 'create', plan: 'premium', request_id: requestId})).status, 503);
  assert.equal(x.calls.length, 0);
});

test('invalid create responses never expose a hosted fallback or unrelated client secret', async () => {
  for (const mutate of [s => {s.livemode = false;}, s => {s.client_reference_id = otherId;},
    s => {s.client_secret = 'unrelated_secret';}, s => {s.ui_mode = 'hosted_page';}]) {
    const session = fixture(); mutate(session);
    const x = setup({session});
    const r = await x.send({action: 'create', plan: 'premium', request_id: requestId});
    assert.equal(r.status, 503);
    assert.deepEqual(r.data, {state: 'unavailable'});
  }
});
