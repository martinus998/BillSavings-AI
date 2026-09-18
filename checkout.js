import './live-tracker.js?v=20260917-live1';
import {supabase, initialAuthReturn} from './account-session.js';
import {createPasswordAuth} from './password-auth.js?v=20260917-auth-errors';

const $ = id => document.getElementById(id);
const LINKS = {
  premium: 'https://buy.stripe.com/fZu6oG9lE65B2Pa9oi1sQ01',
  family: 'https://buy.stripe.com/eVqbJ055o65B3Te8ke1sQ02'
};
const SIGNUP_ENDPOINT = 'https://bkyuyqicybqqifenhhux.supabase.co/functions/v1/password-signup';
const query = new URLSearchParams(location.search);
const requestedPlan = query.get('plan');
const plan = Object.hasOwn(LINKS, requestedPlan) ? requestedPlan : null;
let busy = false, generation = 0, recovering = initialAuthReturn.type === 'recovery';
let callbackFailed = initialAuthReturn.failed;

function status(message, error = false) {
  $('checkoutStatus').textContent = message;
  $('checkoutStatus').hidden = !message;
  $('checkoutStatus').classList.toggle('err', error);
}
function rememberPlan() {
  if (!plan) return;
  try { localStorage.setItem('billsavings.purchase-plan', JSON.stringify({plan, expires: Date.now() + 3600000})); } catch {}
}
function forgetPlan() {
  try { localStorage.removeItem('billsavings.purchase-plan'); } catch {}
}
const auth = createPasswordAuth({supabase, root: $('checkoutAuth'), initialMode: 'signup',
  requirePasswordConfirmation: false,
  redirectTo: 'https://billsavingsai.com/start.html?access=ready',
  onStatus: (message, kind) => { rememberPlan(); status(message, kind === 'error'); },
  onAuthenticated: async () => { callbackFailed = false; recovering = false; await refreshAccount(); await continueToPayment(); },
  onRecovery: () => { recovering = true; $('checkoutAuth').hidden = false; $('accountReady').hidden = true; }
});

$('authForm').addEventListener('submit', async (event) => {
  if (auth.mode !== 'signup') return;
  event.preventDefault();
  if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
  if (busy || auth.busy) return;

  const email = $('authEmail').value.trim();
  const password = $('authPassword').value;
  if (!/^\S+@\S+\.\S+$/.test(email)) { status('Enter a valid email address.', true); return; }
  const strong = password.length >= 10 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password);
  if (!strong) { status('Use at least 10 characters with uppercase, lowercase and a number.', true); return; }

  busy = true;
  auth.setBusy(true);
  status('Creating your account…');
  try {
    const response = await fetch(SIGNUP_ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email, password})
    });
    let payload = {};
    try { payload = await response.json(); } catch {}
    if (!response.ok) {
      const messages = {
        invalid_email: 'Enter a valid email address.',
        invalid_password: 'Use at least 10 characters with uppercase, lowercase and a number.',
        too_many_attempts: 'Too many attempts. Wait a little and try again.'
      };
      throw new Error(messages[payload?.error] || 'Could not create the account. Please try again.');
    }

    const {data, error} = await supabase.auth.signInWithPassword({email, password});
    if (error || !data?.session?.user?.id) {
      busy = false;
      auth.setBusy(false);
      auth.setMode('signin');
      $('authEmail').value = email;
      status('This email may already have an account. Sign in with your password or use Reset password.', true);
      return;
    }
    status('Account created. Opening secure payment…');
    callbackFailed = false;
    recovering = false;
    await refreshAccount();
    busy = false;
    auth.setBusy(false);
    await continueToPayment();
  } catch (error) {
    status(error?.message || 'Could not create the account. Please try again.', true);
  } finally {
    $('authPassword').value = '';
    busy = false;
    auth.setBusy(false);
  }
}, true);

async function refreshAccount() {
  const version = ++generation;
  const {data, error} = await supabase.auth.getUser();
  if (version !== generation) return;
  const user = !error && data?.user?.email_confirmed_at && !data.user.is_anonymous ? data.user : null;
  $('checkoutAuth').hidden = !!user && !recovering && !callbackFailed;
  $('accountReady').hidden = !user || recovering || callbackFailed;
  $('checkoutEmail').textContent = user?.email || '';
  return user;
}

async function continueToPayment() {
  if (busy || !plan || recovering || callbackFailed) return;
  busy = true;
  const version = generation;
  $('continuePayment').disabled = true;
  $('changeAccount').disabled = true;
  status('Opening secure payment…');
  try {
    const {data, error} = await supabase.auth.getUser();
    if (version !== generation) return;
    const user = data?.user;
    if (error || !user?.id || !user.email_confirmed_at || user.is_anonymous || !user.email) {
      $('checkoutAuth').hidden = false; $('accountReady').hidden = true;
      status('Sign in to continue.', true);
      return;
    }
    const entitlement = await supabase.rpc('claim_billing_entitlement');
    if (version !== generation) return;
    if (entitlement.error || typeof entitlement.data?.plan !== 'string' ||
        typeof entitlement.data?.status !== 'string') throw new Error('Account check unavailable');
    if (['premium', 'family'].includes(entitlement.data?.plan) &&
        ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'].includes(entitlement.data?.status)) {
      forgetPlan();
      location.assign('/start.html');
      return;
    }
    const link = new URL(LINKS[plan]);
    link.searchParams.set('locked_prefilled_email', user.email.trim().toLowerCase());
    rememberPlan();
    location.assign(link.href);
  } catch {
    if (version === generation) status('We could not check your account. Try again before making a payment.', true);
  } finally {
    busy = false;
    $('continuePayment').disabled = false;
    $('changeAccount').disabled = false;
  }
}

$('continuePayment').addEventListener('click', continueToPayment);
$('changeAccount').addEventListener('click', async () => {
  if (busy) return;
  generation++;
  const {error} = await supabase.auth.signOut({scope: 'local'});
  if (error) { status('Could not sign out. Please try again.', true); return; }
  $('checkoutAuth').hidden = false; $('accountReady').hidden = true;
  auth.setMode('signin');
});
$('showPassword').addEventListener('click', () => {
  const visible = $('authPassword').type === 'password';
  $('authPassword').type = visible ? 'text' : 'password';
  $('showPassword').textContent = visible ? 'Hide password' : 'Show password';
  $('showPassword').setAttribute('aria-pressed', String(visible));
});
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') recovering = true;
  auth.handleAuthEvent(event, session);
  if (event === 'SIGNED_OUT') {
    generation++; $('checkoutAuth').hidden = false; $('accountReady').hidden = true;
  }
});

if (!plan) {
  auth.setBusy(true);
  $('continuePayment').disabled = true;
  status('Choose a plan to continue.', true);
} else {
  $('selectedPlan').textContent = plan === 'family' ? 'Family' : 'Premium';
  $('selectedPrice').textContent = plan === 'family' ? '$13.99' : '$8.99';
  rememberPlan();
  try {
    await refreshAccount();
    if (recovering && !callbackFailed) await auth.showRecovery();
    if (callbackFailed) {
      history.replaceState(null, '', `/checkout.html?plan=${plan}`);
      status('This email link has expired. Sign in or request a new password reset.', true);
    }
  } catch {
    status('Your account could not load. Please refresh and try again.', true);
  }
}
