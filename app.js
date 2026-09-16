// BillSavings AI lightweight public shell.
// Keep homepage interactions simple and mobile-safe. Account/upload behavior is handled by auth.js.
window.BILLSAVINGS_CONFIG = {
  status: 'live',
  market: 'US',
  currency: 'USD',
  checkout: {
    premium: '',
    family: '',
    actionPlan: '',
    launch: ''
  }
};

// Keep the brand logo lightweight: use the normal image asset instead of an embedded base64 image.
const logoBox = document.querySelector('.brand .logo');
if (logoBox) {
  logoBox.textContent = '';
  logoBox.style.overflow = 'hidden';
  logoBox.style.background = '#041126';
  const logoImg = document.createElement('img');
  logoImg.src = '/logo.svg';
  logoImg.alt = 'BillSavings AI';
  logoImg.width = 40;
  logoImg.height = 40;
  logoImg.decoding = 'async';
  logoImg.style.width = '100%';
  logoImg.style.height = '100%';
  logoImg.style.objectFit = 'cover';
  logoImg.style.borderRadius = 'inherit';
  logoBox.appendChild(logoImg);
}

let favicon = document.querySelector('link[rel="icon"]');
if (!favicon) {
  favicon = document.createElement('link');
  favicon.rel = 'icon';
  document.head.appendChild(favicon);
}
favicon.type = 'image/svg+xml';
favicon.href = '/logo.svg';

// Never leave a legacy full-screen payment overlay active. Those overlays caused poor behavior on some Android browsers.
const legacyOverlay = document.getElementById('paymentOverlay');
if (legacyOverlay) {
  legacyOverlay.classList.remove('show');
  legacyOverlay.setAttribute('aria-hidden', 'true');
  legacyOverlay.style.display = 'none';
}
