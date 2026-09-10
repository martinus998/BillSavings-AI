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