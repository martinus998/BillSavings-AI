// Choose a plan -> Stripe. No registration form is shown before payment.
(() => {
  'use strict';
  const endpoint = 'https://bkyuyqicybqqifenhhux.supabase.co/functions/v1/billsavings-checkout';
  const query = new URLSearchParams(location.search);
  const plan = query.get('plan');
  const status = document.getElementById('checkoutStatus');
  const retry = document.getElementById('checkoutRetry');
  const manual = document.getElementById('checkoutContinue');
  let busy = false;
  const message = text => { status.textContent = text; };
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.has('access_token') || hash.has('refresh_token') || hash.has('error') || hash.has('error_code') || query.has('session_id')) {
    const target = new URL('/start.html', location.origin);
    if (query.has('session_id')) { target.searchParams.set('checkout', 'return'); target.searchParams.set('session_id', query.get('session_id')); }
    else target.searchParams.set('access', 'ready');
    target.hash = location.hash;
    location.replace(target.href);
    return;
  }
  if (plan !== 'premium' && plan !== 'family') { location.replace('/start.html'); return; }
  document.getElementById('selectedPlan').textContent = plan === 'family' ? 'Family' : 'Premium';
  document.getElementById('selectedPrice').textContent = plan === 'family' ? '$9.99 / month' : '$4.99 / month';
  function attemptId() {
    const key = 'billsavings.checkout-attempt.' + plan;
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (saved?.expires > Date.now() && /^[0-9a-f-]{36}$/i.test(saved.id)) return saved.id;
    } catch {}
    const id = crypto.randomUUID();
    try { sessionStorage.setItem(key, JSON.stringify({ id, expires: Date.now() + 1800000 })); } catch {}
    return id;
  }
  const attempt = attemptId();
  const timeout = promise => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('account_check_unavailable')), 12000))]);
  async function checkout() {
    if (busy) return;
    busy = true; retry.hidden = true; manual.hidden = true;
    message('Opening secure Stripe checkout…');
    try {
      const headers = { 'Content-Type': 'application/json' };
      let savedSession = false;
      try { savedSession = !!sessionStorage.getItem('billsavings.account.v1'); } catch {}
      // Existing signed-in subscribers retain duplicate-payment protection.
      // New customers do not enter account details or load the auth SDK here.
      if (savedSession) {
        const { supabase } = await timeout(import('./account-session.js'));
        const { data, error } = await timeout(supabase.auth.getSession());
        if (error) throw new Error('account_check_unavailable');
        if (data?.session?.access_token) headers.Authorization = 'Bearer ' + data.session.access_token;
      }
      const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ plan, attempt }), signal: AbortSignal.timeout(30000), cache: 'no-store', referrerPolicy: 'no-referrer' });
      const data = await response.json().catch(() => ({}));
      if (response.status === 409 && data.error === 'already_subscribed') {
        message('Your plan already exists. Opening your account instead of charging again…');
        location.replace('/start.html?access=ready'); return;
      }
      if (!response.ok) throw new Error(data.error || 'checkout_unavailable');
      const target = new URL(data.checkout_url);
      if (target.origin !== 'https://checkout.stripe.com') throw new Error('checkout_unavailable');
      try { localStorage.setItem('billsavings.purchase-plan', JSON.stringify({ plan, expires: Date.now() + 3600000 })); } catch {}
      manual.href = target.href; manual.hidden = false;
      try { if (typeof window.bsLiveEvent === 'function') void window.bsLiveEvent('checkout_start'); } catch {}
      location.assign(target.href);
    } catch (error) {
      message(error.message === 'rate_limited' ? 'Please wait a minute, then try again.' : ['sign_in_required', 'account_check_unavailable'].includes(error.message) ? 'We could not check your saved account. Refresh or use the sign-in link below before paying again.' : 'Checkout could not open. No payment was taken by this attempt. Please try again.');
      retry.hidden = false;
    } finally { busy = false; }
  }
  retry.addEventListener('click', checkout);
  void checkout();
})();
