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

  if (validId && !isOwner) {
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
  }
})();

// Launch pricing display. Kept close to major U.S. premium alternatives without
// positioning BillSavings AI as a bargain-only product.
(function () {
  const plans = [...document.querySelectorAll('#pricing .plan')];

  const premium = plans.find(plan => (plan.querySelector('h3')?.textContent || '').trim() === 'Premium');
  const family = plans.find(plan => (plan.querySelector('h3')?.textContent || '').trim() === 'Family');

  if (premium) {
    const price = premium.querySelector('.price');
    if (price) price.innerHTML = '$8.99 <span>/ month</span>';
  }

  if (family) {
    const price = family.querySelector('.price');
    if (price) price.innerHTML = '$13.99 <span>/ month</span>';
  }
})();

// Public-launch UI hardening. This keeps legal navigation clickable and avoids
// stronger security/result claims than the current preview architecture supports.
(function () {
  function hardenPublicUI() {
    const footer = document.querySelector('.foot');
    if (footer && footer.children[1]) {
      footer.children[1].innerHTML = [
        '<a href="security.html">Security</a>',
        '<a href="privacy.html">Privacy</a>',
        '<a href="terms.html">Terms</a>',
        '<a href="refund.html">Refunds</a>',
        '<a href="contact.html">Contact</a>'
      ].join(' · ');
    }

    const facts = document.querySelectorAll('.facts .fact > div');
    if (facts[0]) facts[0].innerHTML = '<strong>Privacy-first</strong><br>Private authenticated document storage is now connected for standard bills.';
    if (facts[1]) facts[1].innerHTML = '<strong>Fast Review</strong><br>Designed to turn bills into clear findings and next steps quickly.';

    const mini = document.querySelectorAll('.mini-cols > div');
    if (mini[1]) mini[1].innerHTML = '<strong>Security by Design</strong>Accounts and standard bill uploads use private authenticated storage with per-user access rules.';
    if (mini[2]) mini[2].innerHTML = '<strong>Clear Results</strong>See organized findings, potential savings and practical next steps without guaranteed-savings claims.';

    const medicalCard = Array.from(document.querySelectorAll('.fcard')).find(card => /Medical Bill/i.test(card.textContent || ''));
    if (medicalCard && !medicalCard.querySelector('.preview-safety-note')) {
      const note = document.createElement('div');
      note.className = 'preview-safety-note';
      note.textContent = 'Medical-document upload remains disabled until the health-data compliance review is complete.';
      note.style.cssText = 'margin-top:10px;font-size:10px;line-height:1.4;color:#9fb8d4;';
      medicalCard.appendChild(note);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hardenPublicUI);
  } else {
    hardenPublicUI();
  }
})();

// Load the secure account and private-upload layer after the public shell.
import('./auth.js').catch((error) => console.error('BillSavings secure layer failed to load:', error));
