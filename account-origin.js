// Keep the account session on the same origin as the existing Stripe return.
// Preserve auth fragments only on this fixed, trusted canonical destination.
if (location.hostname === 'www.billsavingsai.com') {
  location.replace(`https://billsavingsai.com${location.pathname}${location.search}${location.hash}`);
}
