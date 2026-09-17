// BillSavings AI lightweight analytics only.
// Interactive account/upload/billing modules are intentionally not loaded on the homepage.
(function () {
  if (window.BILLSAVINGS_AUTH_RETURN === true) {
    window.BILLSAVINGS_ANALYTICS = { active: false, authReturn: true };
    return;
  }
  const MEASUREMENT_ID = 'G-DKCVZZVG2W';
  const params = new URLSearchParams(window.location.search);
  try {
    if (params.get('owner') === '1') localStorage.setItem('billsavings_owner_device', '1');
    if (params.get('owner') === '0') localStorage.removeItem('billsavings_owner_device');
  } catch {}

  let isOwner = false;
  try { isOwner = localStorage.getItem('billsavings_owner_device') === '1'; } catch {}

  const validId = /^G-[A-Z0-9]+$/i.test(MEASUREMENT_ID);
  window.BILLSAVINGS_ANALYTICS = { active: validId && !isOwner, ownerDevice: isOwner, measurementIdConfigured: validId };

  if (!validId || isOwner) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID, { send_page_view: true });

  window.addEventListener('load', function () {
    setTimeout(function () {
      if (document.querySelector?.(`script[src*="googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}"]`)) return;
      const tag = document.createElement('script');
      tag.async = true;
      tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(MEASUREMENT_ID);
      document.head.appendChild(tag);
    }, 1200);
  }, { once: true });
})();

// Private near-real-time owner dashboard tracking.
(function () {
  if (window.BILLSAVINGS_AUTH_RETURN === true) return;
  const currentPath = typeof location !== 'undefined' ? location.pathname : window.location?.pathname;
  if (currentPath === '/live-dashboard.html') return;
  try { if (localStorage.getItem('billsavings_owner_device') === '1') return; } catch {}
  const s = document.createElement('script');
  s.src = '/live-tracker.js?v=20260917-live1';
  s.defer = true;
  document.head.appendChild(s);
})();

// Keep launch pricing visible and static on every device.
(function () {
  const plans = Array.from(document.querySelectorAll?.('#pricing .plan') || []);
  const premium = plans.find(plan => (plan.querySelector('h3')?.textContent || '').trim() === 'Premium');
  const family = plans.find(plan => (plan.querySelector('h3')?.textContent || '').trim() === 'Family');
  if (premium?.querySelector('.price')) premium.querySelector('.price').innerHTML = '$8.99 <span>/ month</span>';
  if (family?.querySelector('.price')) family.querySelector('.price').innerHTML = '$13.99 <span>/ month</span>';
})();

// Conversion funnel events. No user-entered values are sent.
(function () {
  if (window.BILLSAVINGS_AUTH_RETURN === true) return;
  if (!window.BILLSAVINGS_ANALYTICS?.active || typeof window.gtag !== 'function') return;

  const send = (name, params = {}) => {
    const safe = { ...params, page_path: window.location?.pathname || '' };
    try { window.gtag('event', name, safe); } catch {}
  };

  const once = (key, fn) => {
    try {
      if (sessionStorage.getItem(key) === '1') return;
      sessionStorage.setItem(key, '1');
    } catch {}
    fn();
  };

  const path = window.location?.pathname || '';
  if (path === '/' || path.endsWith('/index.html')) {
    once('bs_home_view_v1', () => send('bs_home_view'));
    const pricing = typeof document.getElementById === 'function' ? document.getElementById('pricing') : null;
    if (pricing && typeof IntersectionObserver === 'function') {
      const io = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        once('bs_pricing_view_v1', () => send('bs_pricing_view'));
        io.disconnect();
      }, { threshold: 0.25 });
      io.observe(pricing);
    }
  }

  if (path.endsWith('/start.html')) {
    once('bs_start_view_v1', () => {
      const startParams = new URLSearchParams(window.location?.search || '');
      send('bs_start_view', {
        entry_mode: startParams.has('signin') ? 'signin' : (startParams.has('free') ? 'free' : 'plans')
      });
    });
  }

  if (typeof document.addEventListener !== 'function') return;
  document.addEventListener('click', event => {
    const target = event.target?.closest?.('button,a');
    if (!target) return;
    const text = (target.textContent || '').trim();

    let plan = '';
    if (target.dataset?.plan === 'family' || target.id === 'familyBtn') plan = 'family';
    else if (target.dataset?.plan === 'premium' || target.id === 'premiumBtn') plan = 'premium';
    else if (target.id === 'freeBtn' || /get started free|use free preview/i.test(text)) plan = 'free';
    if (plan) send('bs_plan_select', { plan });

    if (target.id === 'uploadBtn') send('bs_upload_start');
    if (target.id === 'analyzeBtn') send('bs_analysis_start');

    if (target.classList?.contains('fixit-btn')) {
      if (/mark provider contacted/i.test(text)) send('bs_fixit_provider_contact');
      else if (/copy call script/i.test(text)) send('bs_fixit_call_script');
      else if (/copy email/i.test(text)) send('bs_fixit_email');
      else if (/still there/i.test(text)) send('bs_followup_outcome', { outcome: 'still_there' });
      else if (/resolved/i.test(text)) send('bs_followup_outcome', { outcome: 'resolved' });
      else if (/amount changed/i.test(text)) send('bs_followup_outcome', { outcome: 'amount_changed' });
    }
  }, true);
})();
