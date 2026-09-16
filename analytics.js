// BillSavings AI lightweight analytics only.
// Interactive account/upload/billing modules are intentionally not loaded on the homepage.
(function () {
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
      const tag = document.createElement('script');
      tag.async = true;
      tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(MEASUREMENT_ID);
      document.head.appendChild(tag);
    }, 1200);
  }, { once: true });
})();

// Keep launch pricing visible and static on every device.
(function () {
  const plans = Array.from(document.querySelectorAll('#pricing .plan'));
  const premium = plans.find(plan => (plan.querySelector('h3')?.textContent || '').trim() === 'Premium');
  const family = plans.find(plan => (plan.querySelector('h3')?.textContent || '').trim() === 'Family');
  if (premium?.querySelector('.price')) premium.querySelector('.price').innerHTML = '$8.99 <span>/ month</span>';
  if (family?.querySelector('.price')) family.querySelector('.price').innerHTML = '$13.99 <span>/ month</span>';
})();
