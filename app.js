// Keep every existing homepage interaction and the approved logo/theme unchanged.
// Only align checkout reassurance with the restored pay-first flow.
(() => {
  const source = document.createElement('script');
  source.src = '/homepage-app-preserved-86548c7.js';
  source.onload = () => {
    const alignCopy = () => {
      document.querySelectorAll('#conversion-proof span').forEach(el => {
        if (el.textContent === '✓ Create your account before payment') el.textContent = '✓ Go straight to secure Stripe checkout';
      });
      const intro = document.querySelector('.launchRow .launchCard p');
      if (intro && intro.textContent.includes('create your account')) intro.textContent = 'Choose Premium or Family and go straight to Stripe. Activate or sign in to your account after payment to analyze your own bill.';
    };
    alignCopy();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', alignCopy, { once: true });
    // Acceptance information only; existing buttons still use Stripe checkout.
    if (!document.querySelector('script[data-fast-checkout-labels]')) {
      const wallets = document.createElement('script');
      wallets.src = '/fast-checkout-labels.js?v=20260925-wallets1';
      wallets.dataset.fastCheckoutLabels = '1';
      document.head.append(wallets);
    }
  };
  document.head.append(source);
})();
