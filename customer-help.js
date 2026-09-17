// Set only confirmed public support details and the live Stripe-hosted portal link.
// Empty values deliberately render no unconfigured links.
const BILL_SUPPORT_EMAIL = 'Martinus998@azet.sk';
const BILL_PORTAL_URL = 'https://billing.stripe.com/p/login/bJedR869sfGbdtOeIC1sQ00';

(() => {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(BILL_SUPPORT_EMAIL)) {
    document.querySelectorAll('[data-customer-support]').forEach(container => {
      const link = document.createElement('a');
      link.href = 'mailto:' + BILL_SUPPORT_EMAIL;
      link.textContent = BILL_SUPPORT_EMAIL;
      container.replaceChildren(document.createTextNode('Customer support: '), link);
      container.hidden = false;
    });
  }
  if (/^https:\/\/billing\.stripe\.com\/p\/login\/(?!test_)[A-Za-z0-9]+$/.test(BILL_PORTAL_URL)) {
    document.querySelectorAll('[data-portal-pending]').forEach(container => {
      container.textContent = 'Use the subscription management link below to cancel before the next renewal.';
    });
    document.querySelectorAll('[data-customer-portal]').forEach(container => {
      const link = document.createElement('a');
      link.href = BILL_PORTAL_URL;
      link.textContent = 'Manage or cancel your subscription';
      container.replaceChildren(link);
      container.hidden = false;
    });
  }

  // Keep the action layer isolated from auth, billing and analysis code.
  // Load persistent follow-up tracking only after the Fix it parser is ready.
  if (location.pathname.endsWith('/start.html') && !document.querySelector('script[data-fix-it]')) {
    const script = document.createElement('script');
    script.src = '/fix-it.js?v=20260917-fix1';
    script.dataset.fixIt = '1';
    script.defer = true;
    script.addEventListener('load', () => {
      if (document.querySelector('script[data-follow-up]')) return;
      const followUp = document.createElement('script');
      followUp.type = 'module';
      followUp.src = '/follow-up.js?v=20260917-follow2';
      followUp.dataset.followUp = '1';
      document.head.appendChild(followUp);
    }, { once: true });
    document.head.appendChild(script);
  }
})();
