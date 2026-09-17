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

  if (location.pathname.endsWith('/start.html')) {
    // Keep the value shown on the plan page aligned with the live Premium action layer.
    const plans = Array.from(document.querySelectorAll('#pricing .plan'));
    const premium = plans.find(plan => (plan.querySelector('h3')?.textContent || '').trim() === 'Premium');
    const family = plans.find(plan => (plan.querySelector('h3')?.textContent || '').trim() === 'Family');
    if (premium?.querySelector('ul')) {
      premium.querySelector('ul').innerHTML = '<li>Complete supported findings</li><li>Detailed recommendations</li><li>Fix-it call and email scripts</li><li>Next-bill follow-up tracking</li><li>Confirm resolved, still there, or amount changed</li><li>Priority support</li>';
    }
    if (family?.querySelector('ul')) {
      family.querySelector('ul').innerHTML = '<li>Everything in Premium</li><li>Expanded household workflow</li><li>More supported uploads</li><li>Fix-it scripts and next-bill follow-up</li><li>Premium support</li>';
    }

    // Load the same non-PII funnel measurement used on the homepage.
    if (!document.querySelector('script[data-billsavings-analytics]')) {
      const analytics = document.createElement('script');
      analytics.src = '/analytics.js?v=20260917-funnel1';
      analytics.dataset.billsavingsAnalytics = '1';
      analytics.defer = true;
      document.head.appendChild(analytics);
    }
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
