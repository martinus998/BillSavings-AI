import {supabase, initialAuthReturn} from './account-session.js';
import {createPasswordAuth} from './password-auth.js?v=20260917-auth-errors';

const $ = id => document.getElementById(id);
const LINKS = {
  premium: 'https://buy.stripe.com/fZu6oG9lE65B2Pa9oi1sQ01',
  family: 'https://buy.stripe.com/eVqbJ055o65B3Te8ke1sQ02'
};
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
  // Navigation preference only. Never evidence of identity or paid entitlement.
  if (!plan) return;
  try { localStorage.setItem('billsavings.purchase-plan', JSON.stringify({plan, expires: Date.now() + 3600000})); } catch {}
}
function forgetPlan() {
  try { localStorage.removeItem('billsavings.purchase-plan'); } catch {}
}
const auth = createPasswordAuth({supabase, root: $('checkoutAuth'), initialMode: 'signup',
  requirePasswordConfirmation: false,
  // Reuse the already-configured email return; no provider change is required.
  redirectTo: 'https://billsavingsai.com/start.html?access=ready',
  onStatus: (message, kind) => { rememberPlan(); status(message, kind === 'error'); },
  onAuthenticated: async () => { callbackFailed = false; recovering = false; await refreshAccount(); await continueToPayment(); },
  onRecovery: () => { recovering = true; $('checkoutAuth').hidden = false; $('accountReady').hidden = true; }
});

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
    // Read the verified current identity again at the moment payment is opened.
    const {data, error} = await supabase.auth.getUser();
    if (version !== generation) return;
    const user = data?.user;
    if (error || !user?.id || !user.email_confirmed_at || user.is_anonymous || !user.email) {
      $('checkoutAuth').hidden = false; $('accountReady').hidden = true;
      status('Sign in with your confirmed email to continue.', true);
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
    // Convenience only: the signed webhook + verified account/email match still
    // determine ownership. Never use a browser-supplied user ID as proof.
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
