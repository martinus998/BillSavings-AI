// A return URL is only a lookup hint. The server verifies the Stripe payment
// and its authenticated owner before the existing entitlement check runs.
export function createAccountReturn({supabase, endpoint, publicKey, claimPaidAccess}) {
  const $ = id => document.getElementById(id);
  const storageKey = 'billsavings.account-checkout-return';
  const params = new URLSearchParams(location.search);
  let returned = params.get('account_checkout') === 'return';
  const valid = value => /^cs_live_[A-Za-z0-9]{20,240}$/.test(value || '');
  let sessionId = returned ? params.get('session_id') || '' : '';
  let busy = false, generation = 0;
  try {
    if (returned && valid(sessionId)) sessionStorage.setItem(storageKey, JSON.stringify({id: sessionId, expires: Date.now() + 86400000}));
    else if (!returned) {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      if (saved?.expires > Date.now() && valid(saved.id)) sessionId = saved.id;
    }
  } catch {}
  if (returned) {
    params.delete('session_id'); params.delete('account_checkout'); params.delete('plan');
    history.replaceState(null, '', `${location.pathname}${params.size ? '?' + params : ''}${location.hash}`);
  }
  function panel(title, message, retry = false) {
    $('checkoutAccess').hidden = false;
    $('accessTitle').textContent = title;
    $('accessMessage').textContent = message;
    $('accessRetryBtn').hidden = !retry;
    $('accessRetryBtn').textContent = 'Check payment';
    $('accessManualBtn').hidden = true;
  }
  function reset() {
    generation++; sessionId = ''; returned = false;
    try { sessionStorage.removeItem(storageKey); } catch {}
    $('checkoutAccess').hidden = true;
  }
  async function start() {
    if (busy || (!returned && !sessionId)) return;
    if (!valid(sessionId)) {
      panel('Your account', 'Sign in to see your plan. A return link alone does not confirm payment.');
      return;
    }
    busy = true;
    $('accessRetryBtn').disabled = true;
    const version = generation;
    try {
      const {data, error} = await supabase.auth.getSession();
      if (error || !data?.session?.access_token) {
        panel('Sign in to your account', 'Use the email and password you chose before payment. Your purchase stays with your account.');
        $('loginBox').classList.remove('hidden');
        return;
      }
      panel('Confirming your payment', 'Your account will open as soon as Stripe confirms the payment.');
      for (let i = 0; i < 6; i++) {
        const response = await fetch(endpoint, {method: 'POST', referrerPolicy: 'no-referrer',
          headers: {'content-type': 'application/json', apikey: publicKey, authorization: `Bearer ${data.session.access_token}`},
          body: JSON.stringify({action: 'status', session_id: sessionId}), signal: AbortSignal.timeout(15000)});
        const result = await response.json();
        if (version !== generation) return;
        if (response.ok && result.state === 'paid') {
          const active = await claimPaidAccess();
          if (version !== generation) return;
          if (active) { reset(); return; }
          break;
        }
        if (!response.ok || result.state !== 'pending') break;
        if (i < 5) await new Promise(resolve => setTimeout(resolve, 2000));
      }
      panel('Your payment is being checked', 'We cannot confirm active access yet. Check again shortly. If you already paid, do not pay again.', true);
    } catch {
      if (version === generation) panel('Connection interrupted', 'Please check your payment again. You do not need to pay again.', true);
    } finally { busy = false; $('accessRetryBtn').disabled = false; }
  }
  $('accessRetryBtn').addEventListener('click', start);
  return {
    hasCheckout: () => !!sessionId || returned,
    start,
    async onSignIn() {
      if (sessionId || returned) await start();
      else await claimPaidAccess();
    },
    reset
  };
}

export function hasAccountReturn() {
  if (new URLSearchParams(location.search).get('account_checkout') === 'return') return true;
  try {
    const saved = JSON.parse(sessionStorage.getItem('billsavings.account-checkout-return') || 'null');
    return !!saved && saved.expires > Date.now() && /^cs_live_[A-Za-z0-9]{20,240}$/.test(saved.id || '');
  } catch { return false; }
}
