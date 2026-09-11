// BillSavings AI analytics layer.
// Public GA4 Measurement ID for central traffic and purchase-intent tracking.
// No passwords, API secrets, bank details or private credentials belong in this file.
(function () {
  const MEASUREMENT_ID = 'G-DKCVZZVG2W';

  // Visiting once with ?owner=1 marks this browser as the owner's test device.
  // Owner/test traffic is then excluded from analytics on this browser.
  const params = new URLSearchParams(window.location.search);
  if (params.get('owner') === '1') {
    localStorage.setItem('billsavings_owner_device', '1');
  }
  if (params.get('owner') === '0') {
    localStorage.removeItem('billsavings_owner_device');
  }

  const isOwner = localStorage.getItem('billsavings_owner_device') === '1';
  const validId = /^G-[A-Z0-9]+$/i.test(MEASUREMENT_ID) && MEASUREMENT_ID !== 'G-REPLACE_ME';

  window.BILLSAVINGS_ANALYTICS = {
    active: validId && !isOwner,
    ownerDevice: isOwner,
    measurementIdConfigured: validId
  };

  if (!validId || isOwner) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function(){ dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID, { send_page_view: false });

  const tag = document.createElement('script');
  tag.async = true;
  tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(MEASUREMENT_ID);
  document.head.appendChild(tag);

  // Count a real visit once per page load.
  window.gtag('event', 'page_view', {
    page_title: document.title,
    page_location: window.location.href,
    page_path: window.location.pathname
  });

  // Purchase-intent tracking: records every click on paid plan buttons,
  // even while checkout is intentionally disabled during preview.
  document.addEventListener('click', function (event) {
    const btn = event.target.closest('.paidBtn');
    if (!btn) return;

    window.gtag('event', 'purchase_intent', {
      plan: btn.dataset.plan || 'unknown',
      button_text: (btn.textContent || '').trim().slice(0, 80),
      page_path: window.location.pathname,
      value: 1
    });
  }, true);
})();
