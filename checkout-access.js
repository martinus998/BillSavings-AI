// Checkout proof only checks payment. Account sign-in uses email and password.
export function createCheckoutAccess({supabase, endpoint, publicKey, claimPaidAccess}) {
  const $ = id => document.getElementById(id);
  const key = 'billsavings.checkout-access';
  const qs = new URLSearchParams(location.search);
  let sessionId = qs.get('session_id') || '';
  let returned = ['success', 'return'].includes(qs.get('checkout'));
  let busy = false, timer, generation = 0, manual = false, signInPending = false;
  const valid = value => /^cs_live_[A-Za-z0-9]{20,240}$/.test(value || '');
  try {
    if (valid(sessionId)) sessionStorage.setItem(key, JSON.stringify({id: sessionId, expires: Date.now() + 86400000}));
    else if (!returned) {
      const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (saved?.expires > Date.now() && valid(saved.id)) sessionId = saved.id;
    }
  } catch { /* Storage can be disabled; the current return still works. */ }
  if (!valid(sessionId)) sessionId = '';
  // Strip the proof before further navigation. The page also has no-referrer.
  if (qs.has('session_id')) {
    qs.delete('session_id'); qs.delete('checkout');
    history.replaceState(null, '', `${location.pathname}${qs.size ? '?' + qs : ''}${location.hash}`);
  }

  function reset() {
    sessionId = ''; returned = false; generation++; signInPending = false; manual = false;
    clearTimeout(timer); timer = null;
    try { sessionStorage.removeItem(key); } catch {}
    $('checkoutAccess').hidden = true;
  }
  function panel(title, message, retryLabel, delay = 0) {
    $('checkoutAccess').hidden = false;
    $('accessTitle').textContent = title;
    $('accessMessage').textContent = message;
    const retry = $('accessRetryBtn');
    retry.hidden = !retryLabel;
    retry.textContent = retryLabel || 'Try again';
    retry.disabled = busy || delay > 0;
    clearTimeout(timer); timer = null;
    const version = generation;
    if (delay > 0) timer = setTimeout(() => {
      timer = null;
      if (version === generation && !busy) retry.disabled = false;
    }, delay * 1000);
    // Keep manual sign-in available, without repeating its form by default.
    if (!manual) $('loginBox').classList.add('hidden');
  }
  function showPasswordForm() {
    manual = true;
    $('loginBox').classList.remove('hidden');
    $('accessManualBtn').hidden = false;
    $('accessManualBtn').textContent = 'Sign in';
  }
  function promptSignIn(signedIn = false) {
    panel('Sign in to use your plan', signedIn
      ? 'Use the email and password for the account you paid with. The current account does not match this purchase.'
      : 'Use the email and password you chose before payment. You do not need to pay again.');
    showPasswordForm();
  }
  async function request(version) {
    const {data, error} = await supabase.auth.getSession();
    if (version !== generation) return null;
    if (error) throw new Error('Account temporarily unavailable');
    const headers = {'content-type': 'application/json', apikey: publicKey};
    if (data?.session?.access_token) headers.authorization = `Bearer ${data.session.access_token}`;
    const response = await fetch(endpoint, {method: 'POST', headers,
      body: JSON.stringify({session_id: sessionId, action: 'status'}),
      signal: AbortSignal.timeout(15000), referrerPolicy: 'no-referrer'});
    const result = await response.json();
    if (!result?.state) throw new Error('Access temporarily unavailable');
    return {result, signedIn: !!data?.session?.access_token};
  }
  async function run() {
    if (busy || !sessionId) return;
    busy = true;
    const version = generation;
    try {
      panel('Finishing your purchase', 'Confirming your payment. Keep this page open for a moment.');
      let result, signedIn;
      for (let i = 0; i < 6; i++) {
        if (version !== generation) return;
        const response = await request(version);
        if (version !== generation) return;
        ({result, signedIn} = response);
        if (result.state !== 'pending') break;
        if (i < 5) await new Promise(resolve => setTimeout(resolve, 2000));
      }
      if (result.state === 'account_ready' && result.account_matches === true) {
        const active = await claimPaidAccess();
        if (version !== generation) return;
        if (active) { reset(); return; }
        panel('Checking your plan', 'You are signed in with your checkout email. Your plan is still being checked. Please try again shortly; you do not need to pay again.', 'Check my plan', 5);
        return;
      }
      if (result.state === 'ready' || result.state === 'sent') {
        promptSignIn(signedIn);
      } else if (result.state === 'pending') {
        panel('Waiting for payment confirmation', 'We are still waiting for confirmation from Stripe. Please check again shortly. If you already paid, do not make another payment.', 'Check payment again', 5);
      } else if (result.state === 'expired' || result.state === 'limit_reached') {
        // Receipt expiry does not remove a subscription. A signed-in account can
        // still ask the existing server RPC for its own entitlement.
        if (signedIn) {
          const active = await claimPaidAccess();
          if (version !== generation) return;
          if (active) { reset(); return; }
        }
        panel('Access your account', 'Sign in with your checkout email and password to check your plan. If you already paid, you do not need to pay again.', 'Check my plan', 5);
        showPasswordForm();
      } else {
        panel('Your payment needs another check', 'We could not confirm your plan yet. Please try again shortly. If you already paid, you do not need to pay again.', 'Check payment again', 5);
      }
    } catch {
      if (version === generation) panel('Connection interrupted', 'Please try again. You can also sign in with your email and password below. If you paid, you do not need to pay again.', 'Try again', 5);
    } finally {
      busy = false;
      // panel() owns cooldowns; immediate retries are only enabled without one.
      if (version === generation && !timer) $('accessRetryBtn').disabled = false;
      if (signInPending) {
        signInPending = false;
        const pendingVersion = generation;
        setTimeout(() => {
          if (pendingVersion === generation) void (sessionId ? run() : claimPaidAccess());
        }, 0);
      }
    }
  }
  $('accessRetryBtn').addEventListener('click', () => run());
  $('accessManualBtn').addEventListener('click', () => {
    showPasswordForm(); $('authEmail').focus();
  });
  return {
    hasCheckout: () => !!sessionId || returned,
    reset,
    async start() {
      if (qs.get('access') === 'ready') { reset(); return; }
      if (!sessionId && !returned) return;
      const card = $('checkoutAccess').closest('.card');
      $('start').insertBefore(card, $('pricing'));
      card.scrollIntoView({behavior: 'smooth', block: 'start'});
      if (!valid(sessionId)) {
        promptSignIn();
        return;
      }
      await run();
    },
    async onSignIn() {
      if (busy) { signInPending = true; return; }
      if (sessionId) await run();
      else {
        const version = generation;
        const active = await claimPaidAccess();
        if (version === generation && active) reset();
      }
    }
  };
}
