// Monday launch configuration. Only public checkout URLs belong here.
// NEVER place bank account numbers, card numbers, API secrets or private merchant credentials in GitHub Pages.
window.BILLSAVINGS_CONFIG = {
  status: 'preview-live',
  market: 'US',
  currency: 'USD',
  paidLaunch: 'Monday',
  checkout: {
    premium: '',
    family: '',
    actionPlan: ''
  }
};
const payOverlay=document.getElementById('paymentOverlay');
document.querySelectorAll('.paidBtn').forEach(btn=>btn.addEventListener('click',e=>{
  e.preventDefault();
  const plan=btn.dataset.plan;
  const url=window.BILLSAVINGS_CONFIG.checkout[plan];
  if(url){ window.location.href=url; return; }
  payOverlay.classList.add('show');
  payOverlay.setAttribute('aria-hidden','false');
}));
document.getElementById('paymentClose').addEventListener('click',()=>{payOverlay.classList.remove('show');payOverlay.setAttribute('aria-hidden','true')});
payOverlay.addEventListener('click',e=>{if(e.target===payOverlay){payOverlay.classList.remove('show');payOverlay.setAttribute('aria-hidden','true')}});

// BillSavings AI brand logo selected by the owner.
const BILL_LOGO = 'data:image/webp;base64,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';
const logoBox = document.querySelector('.brand .logo');
if (logoBox) {
  logoBox.textContent = '';
  logoBox.style.overflow = 'hidden';
  logoBox.style.background = '#041126';
  const logoImg = document.createElement('img');
  logoImg.src = BILL_LOGO;
  logoImg.alt = 'BillSavings AI';
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
favicon.type = 'image/webp';
favicon.href = BILL_LOGO;
