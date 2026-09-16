// BillSavings AI public interaction layer.
// Keep this file lightweight: it runs on every homepage visit, including older Android phones.
window.BILLSAVINGS_CONFIG = window.BILLSAVINGS_CONFIG || {
  status: 'preview-live',
  market: 'US',
  currency: 'USD',
  paidLaunch: 'Monday',
  checkout: {
    premium: '',
    family: '',
    actionPlan: '',
    launch: ''
  }
};

(function () {
  // Full-screen backdrop blur was causing severe touch/compositor lag on some mobile browsers.
  // Use a simple translucent background instead so taps remain responsive.
  const style = document.createElement('style');
  style.id = 'bs-interaction-fix';
  style.textContent = `
    .payment-overlay,.bs-modal{
      backdrop-filter:none!important;
      -webkit-backdrop-filter:none!important;
    }
    button,a,.btn{touch-action:manipulation}
    @media (max-width:900px){
      .payment-overlay,.bs-modal{background:rgba(0,7,16,.94)!important}
      .payment-modal,.bs-panel{box-shadow:0 18px 44px rgba(0,0,0,.48)!important}
    }
  `;
  document.head.appendChild(style);

  const payOverlay = document.getElementById('paymentOverlay');
  const paymentClose = document.getElementById('paymentClose');

  function closePaymentOverlay() {
    if (!payOverlay) return;
    payOverlay.classList.remove('show');
    payOverlay.setAttribute('aria-hidden', 'true');
  }

  function openPaymentOverlay() {
    if (!payOverlay) return;
    payOverlay.classList.add('show');
    payOverlay.setAttribute('aria-hidden', 'false');
  }

  document.querySelectorAll('.paidBtn').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      const plan = btn.dataset.plan || '';
      const checkout = window.BILLSAVINGS_CONFIG?.checkout || {};
      const url = checkout[plan];
      if (url) {
        window.location.assign(url);
        return;
      }
      openPaymentOverlay();
    });
  });

  if (paymentClose) paymentClose.addEventListener('click', closePaymentOverlay);
  if (payOverlay) {
    payOverlay.addEventListener('click', (event) => {
      if (event.target === payOverlay) closePaymentOverlay();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePaymentOverlay();
  });

  // Use the site's normal logo file instead of embedding a large base64 image in JavaScript.
  const logoBox = document.querySelector('.brand .logo');
  if (logoBox && !logoBox.querySelector('img')) {
    logoBox.textContent = '';
    logoBox.style.overflow = 'hidden';
    logoBox.style.background = '#041126';
    const logoImg = document.createElement('img');
    logoImg.src = '/logo.svg';
    logoImg.alt = 'BillSavings AI';
    logoImg.width = 64;
    logoImg.height = 64;
    logoImg.decoding = 'async';
    logoImg.style.width = '100%';
    logoImg.style.height = '100%';
    logoImg.style.objectFit = 'cover';
    logoImg.style.borderRadius = 'inherit';
    logoBox.appendChild(logoImg);
  }
})();
