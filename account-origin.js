// Keep the account session on the same origin as the existing Stripe return.
// Preserve auth fragments only on this fixed, trusted canonical destination.
if (location.hostname === 'www.billsavingsai.com') {
  location.replace(`https://billsavingsai.com${location.pathname}${location.search}${location.hash}`);
}

// Optional visual enhancement on plan selection only. No effect on auth,
// payment creation, login callbacks or entitlement verification.
if (location.pathname === '/start.html' && !document.querySelector('script[data-fast-checkout-labels]')) {
  const wallets = document.createElement('script');
  wallets.src = '/fast-checkout-labels.js?v=20260925-wallets1';
  wallets.dataset.fastCheckoutLabels = '1';
  wallets.async = true;
  document.head.append(wallets);
}
