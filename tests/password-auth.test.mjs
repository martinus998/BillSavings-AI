import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const authSource = await readFile(new URL('../password-auth.js', import.meta.url), 'utf8');
const sessionSource = await readFile(new URL('../account-session.js', import.meta.url), 'utf8');
const { createPasswordAuth } = await import(`data:text/javascript;base64,${Buffer.from(authSource).toString('base64')}`);

function field() {
  const handlers = new Map();
  return {
    value: '', hidden: false, disabled: false, textContent: '',
    classList: { toggle() {} },
    setAttribute() {},
    closest() { return null; },
    addEventListener(name, fn) { handlers.set(name, fn); },
    removeEventListener(name) { handlers.delete(name); },
    dispatch(name) { return handlers.get(name)?.({ preventDefault() {} }); }
  };
}
function setup(overrides = {}, options = {}) {
  const fields = Object.fromEntries(['authForm', 'authEmail', 'authPassword', 'authConfirm', 'authConfirmField',
    'authSubmit', 'authModeBtn', 'authForgotBtn', 'authTitle', 'authCopy'].map(id => [id, field()]));
  const calls = [];
  const notices = [];
  const authenticated = [];
  const recovered = [];
  const user = { id: 'verified-owner', email: 'owner@example.com' };
  const session = { access_token: 'synthetic-token', user };
  const auth = Object.fromEntries(['signUp', 'signInWithPassword', 'resetPasswordForEmail', 'updateUser', 'getUser', 'getSession'].map(name => [name, async (...args) => {
    calls.push({ name, args });
    if (overrides[name]) return overrides[name](...args);
    if (name === 'getUser' || name === 'updateUser') return { data: { user }, error: null };
    return { data: { session, user }, error: null };
  }]));
  const controller = createPasswordAuth({
    supabase: { auth },
    root: { querySelector: selector => fields[selector.slice(1)] },
    redirectTo: 'https://billsavingsai.com/start.html?access=ready',
    onStatus: (text, kind) => notices.push({ text, kind }),
    onAuthenticated: value => authenticated.push(value),
    onRecovery: value => recovered.push(value),
    ...options
  });
  const credentials = (password = 'long-example-password') => {
    fields.authEmail.value = 'owner@example.com';
    fields.authPassword.value = password;
    fields.authConfirm.value = password;
  };
  return { fields, controller, calls, notices, authenticated, recovered, session, credentials, submit: () => fields.authForm.dispatch('submit') };
}

test('signup requiring email confirmation does not authenticate or start payment', async () => {
  const ui = setup({ signUp: async () => ({ data: { user: { id: 'pending' }, session: null }, error: null }) }, { initialMode: 'signup' });
  ui.credentials();
  await ui.submit();
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.calls[0].name, 'signUp');
  assert.equal(ui.calls[0].args[0].options.emailRedirectTo, 'https://billsavingsai.com/start.html?access=ready');
  assert.equal(ui.authenticated.length, 0);
  assert.match(ui.notices.at(-1).text, /confirm your account/);
  assert.equal(ui.fields.authPassword.value, '');
  assert.equal(ui.fields.authConfirm.value, '');
});

test('simple signup needs only email and password but still waits for email confirmation', async () => {
  const ui = setup({ signUp: async () => ({ data: { user: { id: 'pending' }, session: null }, error: null }) },
    { initialMode: 'signup', requirePasswordConfirmation: false });
  ui.credentials();
  ui.fields.authConfirm.value = '';
  assert.equal(ui.fields.authConfirmField.hidden, true);
  assert.equal(ui.fields.authConfirm.required, false);
  await ui.submit();
  assert.equal(ui.calls[0].name, 'signUp');
  assert.equal(ui.authenticated.length, 0);
  assert.match(ui.notices.at(-1).text, /confirm your account/);
});

test('email and password login accepts a valid existing shorter password', async () => {
  const ui = setup();
  ui.credentials('legacy1');
  await ui.submit();
  assert.equal(ui.calls[0].name, 'signInWithPassword');
  assert.equal(ui.authenticated[0].user.id, 'verified-owner');
  assert.equal(ui.fields.authPassword.value, '');
  assert.equal(ui.controller.busy, false);
});

test('new account password validation rejects short or mismatched passwords before Auth calls', async () => {
  const ui = setup({}, { initialMode: 'signup' });
  ui.credentials('short');
  await ui.submit();
  assert.equal(ui.calls.length, 0);
  assert.match(ui.notices.at(-1).text, /10 characters/);
  ui.credentials();
  ui.fields.authConfirm.value = 'different-password';
  await ui.submit();
  assert.equal(ui.calls.length, 0);
  assert.match(ui.notices.at(-1).text, /do not match/);
});

test('provider login details are not disclosed and missing sessions cannot authenticate', async () => {
  const ui = setup({ signInWithPassword: async () => ({ data: {}, error: { message: 'Secret provider detail owner@example.com' } }) });
  ui.credentials();
  await ui.submit();
  assert.equal(ui.authenticated.length, 0);
  assert.doesNotMatch(JSON.stringify(ui.notices), /Secret provider|owner@example/);
  assert.equal(ui.notices.at(-1).kind, 'error');
  const missing = setup({ signInWithPassword: async () => ({ data: { user: { id: 'untrusted' } }, error: null }) });
  missing.credentials();
  await missing.submit();
  assert.equal(missing.authenticated.length, 0);
});

test('reset sends only on form submit and returns indistinguishable feedback', async () => {
  const messages = [];
  for (const result of [{ data: {}, error: null }, { data: {}, error: { message: 'Unknown email' } }, new Error('Network error')]) {
    const ui = setup({ resetPasswordForEmail: async () => { if (result instanceof Error) throw result; return result; } });
    ui.fields.authForgotBtn.dispatch('click');
    assert.equal(ui.calls.length, 0);
    assert.equal(ui.controller.mode, 'reset');
    ui.fields.authEmail.value = 'owner@example.com';
    await ui.submit();
    assert.equal(ui.calls[0].name, 'resetPasswordForEmail');
    assert.equal(ui.calls[0].args[0], 'owner@example.com');
    assert.equal(ui.authenticated.length, 0);
    assert.equal(ui.notices.at(-1).kind, 'info');
    messages.push(ui.notices.at(-1).text);
  }
  assert.equal(new Set(messages).size, 1);
});

test('caller-supplied session cannot enable password recovery without server verification', async () => {
  const ui = setup({ getUser: async () => ({ data: { user: null }, error: { message: 'Invalid JWT' } }) });
  assert.equal(ui.controller.setMode('recovery'), false);
  assert.equal(await ui.controller.showRecovery(ui.session), false);
  assert.equal(ui.recovered.length, 0);
  assert.equal(ui.controller.mode, 'reset');
  assert.equal(ui.calls.some(call => call.name === 'updateUser'), false);
  assert.match(ui.notices.at(-1).text, /invalid or expired/);
});

test('verified recovery updates only the verified current account and clears credentials', async () => {
  const ui = setup();
  assert.equal(await ui.controller.showRecovery(ui.session), true);
  assert.equal(ui.controller.mode, 'recovery');
  assert.equal(ui.fields.authEmail.disabled, true);
  ui.credentials();
  await ui.submit();
  assert.deepEqual(ui.calls.map(call => call.name), ['getUser', 'getUser', 'updateUser', 'getSession']);
  assert.deepEqual(Object.keys(ui.calls[2].args[0]), ['password']);
  assert.equal(ui.authenticated[0].user.id, 'verified-owner');
  assert.equal(ui.fields.authPassword.value, '');
  assert.equal(ui.fields.authConfirm.value, '');
});

test('changed account during recovery is rejected before any password update', async () => {
  let reads = 0;
  const ui = setup({ getUser: async () => ({ data: { user: { id: ++reads === 1 ? 'verified-owner' : 'different-user' } }, error: null }) });
  await ui.controller.showRecovery(ui.session);
  ui.credentials();
  await ui.submit();
  assert.equal(ui.calls.some(call => call.name === 'updateUser'), false);
  assert.equal(ui.authenticated.length, 0);
  assert.equal(ui.notices.at(-1).kind, 'error');
});

test('PASSWORD_RECOVERY defers Auth methods outside event callback; signout cancels recovery', async () => {
  const ui = setup();
  ui.controller.handleAuthEvent('PASSWORD_RECOVERY', ui.session);
  assert.equal(ui.calls.length, 0);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(ui.controller.mode, 'recovery');
  ui.controller.handleAuthEvent('SIGNED_OUT', null);
  assert.equal(ui.controller.mode, 'signin');
  ui.controller.handleAuthEvent('PASSWORD_RECOVERY', ui.session);
  ui.controller.handleAuthEvent('SIGNED_OUT', null);
  const count = ui.calls.length;
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(ui.calls.length, count);
});

test('duplicate form submission does not issue a second auth request', async () => {
  let complete;
  const ui = setup({ signInWithPassword: () => new Promise(resolve => { complete = resolve; }) });
  ui.credentials();
  const pending = ui.submit();
  await ui.submit();
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.fields.authSubmit.disabled, true);
  complete({ data: { session: ui.session }, error: null });
  await pending;
  assert.equal(ui.authenticated.length, 1);
});

test('account client uses tab storage, ignores persistent sessions, and captures only callback flags', () => {
  const values = new Map();
  let options;
  const context = {
    URLSearchParams, Map, Object,
    createClient(_url, _key, config) { options = config; return {}; },
    window: {
      location: { hash: '#access_token=synthetic-secret&type=recovery' },
      sessionStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) },
      get localStorage() { throw new Error('Persistent session read is forbidden'); }
    }
  };
  vm.runInNewContext(sessionSource.replace(/^import .*;\n/, '').replaceAll('export const ', 'var '), context);
  assert.equal(options.auth.storageKey, 'billsavings.account.v1');
  assert.equal(options.auth.flowType, 'implicit');
  assert.equal(context.initialAuthReturn.received, true);
  assert.equal(context.initialAuthReturn.type, 'recovery');
  assert.doesNotMatch(JSON.stringify(context.initialAuthReturn), /synthetic-secret/);
  options.auth.storage.setItem('session-key', 'synthetic-session');
  assert.equal(values.get('session-key'), 'synthetic-session');
  options.auth.storage.removeItem('session-key');
  assert.equal(options.auth.storage.getItem('session-key'), null);
});

test('account client uses memory when browser tab storage is unavailable', () => {
  let options;
  vm.runInNewContext(sessionSource.replace(/^import .*;\n/, '').replaceAll('export const ', 'var '), {
    URLSearchParams, Map, Object,
    createClient(_url, _key, config) { options = config; return {}; },
    window: {
      location: { hash: '' },
      get sessionStorage() { throw new Error('Storage blocked'); },
      get localStorage() { throw new Error('Persistent session read is forbidden'); }
    }
  });
  options.auth.storage.setItem('session-key', 'synthetic-session');
  assert.equal(options.auth.storage.getItem('session-key'), 'synthetic-session');
  options.auth.storage.removeItem('session-key');
  assert.equal(options.auth.storage.getItem('session-key'), null);
});

test('auth controller has no credential logging, URL writing, or application storage', () => {
  assert.doesNotMatch(authSource, /console\.|localStorage|sessionStorage|location\.|fetch\(/);
  assert.match(sessionSource, /supabase-js@2\.116\.0/);
});
