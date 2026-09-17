import {supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, initialAuthReturn} from './account-session.js';
import {createPasswordAuth} from './password-auth.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const plan = params.get('plan') === 'family' ? 'family' : params.get('plan') === 'premium' ? 'premium' : null;
const endpoint = `${SUPABASE_URL}/functions/v1/account-checkout`;
let embedded, mounting = false, ready = false, currentUserId = null, generation = 0;
let publishableKey = '', requestId = crypto.randomUUID();
let callbackFailed = initialAuthReturn.failed, recovering = initialAuthReturn.type === 'recovery';

function status(message, kind = 'info') {
  $('checkoutStatus').textContent = message;
  $('checkoutStatus').classList.toggle('err', kind === 'error');
  $('checkoutStatus').hidden = !message;
}

function destroyCheckout() {
  generation++;
  embedded?.destroy(); embedded = null;
  $('paymentSection').hidden = true;
  $('paymentPlaceholder').hidden = false;
}

const auth = createPasswordAuth({supabase, root: $('checkoutAuth'), initialMode: 'signup',
  redirectTo: `${location.origin}/checkout.html?plan=${plan || 'premium'}&access=ready`,
  onStatus: status,
  onAuthenticated: async () => { callbackFailed = false; recovering = false; await refreshAccount(); },
  onRecovery: () => { recovering = true; destroyCheckout(); $('checkoutAuth').hidden = false; $('accountReady').hidden = true; }
});
auth.setBusy(true);

async function refreshAccount() {
  const {data, error} = await supabase.auth.getUser();
  const user = !error && data?.user?.email_confirmed_at ? data.user : null;
  if (user?.id !== currentUserId) { destroyCheckout(); requestId = crypto.randomUUID(); }
  currentUserId = user?.id || null;
  $('checkoutAuth').hidden = !!user && !recovering;
  $('accountReady').hidden = !user || recovering;
  $('checkoutEmail').textContent = user?.email || '';
  if (user && ready && !callbackFailed && !recovering) await mountCheckout();
}

async function mountCheckout() {
  if (!plan || !ready || !currentUserId || mounting || embedded || recovering || callbackFailed) return;
  mounting = true;
  const version = generation;
  status('Loading your secure payment form…');
  try {
    const {data, error} = await supabase.auth.getSession();
    if (error || !data?.session?.access_token) throw new Error('Sign in again to continue.');
    const response = await fetch(endpoint, {method: 'POST',
      headers: {'content-type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${data.session.access_token}`},
      body: JSON.stringify({action: 'create', plan, request_id: requestId}),
      signal: AbortSignal.timeout(20000), referrerPolicy: 'no-referrer'});
    const result = await response.json();
    if (version !== generation) return;
    if (response.status === 409 && result.state === 'already_subscribed') {
      $('accountLink').hidden = false;
      status('You already have a subscription. Open your account to use or manage your plan.');
      return;
    }
    if (!response.ok || typeof result.client_secret !== 'string') throw new Error('The payment form could not load. Please try again.');
    const stripe = Stripe(publishableKey);
    const checkout = await stripe.createEmbeddedCheckoutPage({fetchClientSecret: async () => result.client_secret});
    if (version !== generation) { checkout.destroy(); return; }
    embedded = checkout;
    $('paymentSection').hidden = false;
    $('paymentPlaceholder').hidden = true;
    checkout.mount('#stripeCheckout');
    status('');
    $('retryPayment').hidden = true;
  } catch {
    if (version !== generation) return;
    status('The secure payment form is temporarily unavailable. Please try again. If you already paid, open your account before making another payment.', 'error');
    $('retryPayment').hidden = false;
  } finally {
    mounting = false;
    if (version !== generation && currentUserId && ready && !recovering && !callbackFailed) void mountCheckout();
  }
}

$('retryPayment').addEventListener('click', () => { void mountCheckout(); });
$('changeAccount').addEventListener('click', async () => {
  destroyCheckout();
  await supabase.auth.signOut({scope: 'local'});
  currentUserId = null;
  $('checkoutAuth').hidden = false; $('accountReady').hidden = true;
  auth.setMode('signin');
});
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') recovering = true;
  auth.handleAuthEvent(event, session);
  if (event === 'SIGNED_OUT') { destroyCheckout(); currentUserId = null; $('checkoutAuth').hidden = false; $('accountReady').hidden = true; }
  // Never call another Auth method while Supabase holds its callback lock.
});

if (!plan) {
  auth.setBusy(true);
  status('Choose Premium or Family from the pricing page to continue.', 'error');
} else {
  $('selectedPlan').textContent = plan === 'family' ? 'Family' : 'Premium';
  $('selectedPrice').textContent = plan === 'family' ? '$13.99' : '$8.99';
  try {
    const response = await fetch(endpoint, {headers: {apikey: SUPABASE_PUBLISHABLE_KEY}, signal: AbortSignal.timeout(15000)});
    const result = await response.json();
    if (!response.ok || result.configured !== true || !/^pk_live_[A-Za-z0-9]+$/.test(result.publishable_key || '')) throw new Error();
    publishableKey = result.publishable_key; ready = true; auth.setBusy(false);
    await refreshAccount();
    if (initialAuthReturn.type === 'recovery' && !initialAuthReturn.failed) await auth.showRecovery();
    if (initialAuthReturn.failed) {
      status('This email link is invalid or has expired. Sign in or request a new password reset.', 'error');
      history.replaceState(null, '', `/checkout.html?plan=${plan}`);
    }
  } catch {
    auth.setBusy(true);
    status('This checkout is not available yet. Please return to the pricing page or contact support.', 'error');
  }
}
