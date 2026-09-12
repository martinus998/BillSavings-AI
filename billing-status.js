import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://bkyuyqicybqqifenhhux.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_o-RgVfTUjzfne4DC9QcGfQ_4QGg5CVr';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let currentEntitlement = { plan: 'free', status: 'inactive', paid: false, current_period_end: null };

function ensureStyles() {
  if (document.getElementById('bs-billing-styles')) return;
  const style = document.createElement('style');
  style.id = 'bs-billing-styles';
  style.textContent = `
    .bs-plan-badge{display:inline-flex;align-items:center;gap:6px;margin:8px 0 12px;padding:6px 10px;border-radius:999px;border:1px solid rgba(107,241,201,.25);background:rgba(30,220,171,.09);color:#78f2cd;font-size:11px;font-weight:900;letter-spacing:.5px;text-transform:uppercase}
    .bs-plan-badge.free{border-color:rgba(128,188,255,.22);background:rgba(60,120,210,.10);color:#b9d9ff}
    .bs-upgrade-note{margin-top:12px;padding:12px;border-radius:12px;border:1px solid rgba(86,151,255,.25);background:rgba(44,101,200,.10);color:#d8e8ff;font-size:12px;line-height:1.5}
    .bs-upgrade-note a{color:#7fc0ff;font-weight:800}
    .bs-billing-toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:100000;width:min(560px,calc(100% - 28px));padding:13px 16px;border:1px solid rgba(107,241,201,.28);border-radius:14px;background:#071b35;color:#eafff8;box-shadow:0 18px 50px rgba(0,0,0,.45);font-size:13px;text-align:center}
  `;
  document.head.appendChild(style);
}

function isPaidRow(row) {
  return Boolean(row && ['premium','family'].includes(row.plan) && ['active','trialing'].includes(row.status));
}

async function loadEntitlement() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    currentEntitlement = { plan: 'free', status: 'inactive', paid: false, current_period_end: null };
    window.BILLSAVINGS_ENTITLEMENT = currentEntitlement;
    renderEntitlement();
    return currentEntitlement;
  }

  const { data } = await supabase
    .from('billing_subscriptions')
    .select('plan,status,current_period_end')
    .eq('user_id', user.id)
    .maybeSingle();

  currentEntitlement = {
    plan: isPaidRow(data) ? data.plan : 'free',
    status: data?.status || 'inactive',
    paid: isPaidRow(data),
    current_period_end: data?.current_period_end || null,
  };
  window.BILLSAVINGS_ENTITLEMENT = currentEntitlement;
  renderEntitlement();
  return currentEntitlement;
}

function renderEntitlement() {
  const modal = document.getElementById('bsAuthModal');
  if (modal) {
    const account = modal.querySelector('.bs-account');
    const userLine = modal.querySelector('.bs-userline');
    if (account && userLine) {
      let badge = modal.querySelector('.bs-plan-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'bs-plan-badge';
        userLine.insertAdjacentElement('afterend', badge);
      }
      badge.classList.toggle('free', !currentEntitlement.paid);
      badge.textContent = currentEntitlement.paid
        ? `${currentEntitlement.plan === 'family' ? 'Family' : 'Premium'} plan · active`
        : 'Free preview';
    }
  }

  document.querySelectorAll('#pricing .plan').forEach(plan => {
    const heading = plan.querySelector('h3')?.textContent?.trim().toLowerCase();
    const button = plan.querySelector('.paidBtn');
    if (!button) return;
    if (currentEntitlement.paid && heading === currentEntitlement.plan) {
      button.textContent = 'Current Plan ✓';
      button.disabled = true;
    }
  });
}

function attachFreePreviewNotice() {
  const modal = document.getElementById('bsAuthModal');
  if (!modal) return;
  const status = modal.querySelector('#bsAnalyzeStatus');
  const result = modal.querySelector('#bsAnalysisResult');
  if (!status || !result) return;

  const observer = new MutationObserver(() => {
    if (!currentEntitlement.paid && status.textContent?.includes('Analysis complete') && !result.querySelector('.bs-upgrade-note')) {
      const note = document.createElement('div');
      note.className = 'bs-upgrade-note';
      note.innerHTML = 'You are viewing the Free Preview. Premium unlocks all detected savings opportunities and complete recommendations. <a href="#pricing">View Premium</a>';
      result.appendChild(note);
    }
  });
  observer.observe(status, { childList: true, characterData: true, subtree: true });
}

async function handleCheckoutReturn() {
  const params = new URLSearchParams(location.search);
  if (params.get('checkout') !== 'success') return;

  const toast = document.createElement('div');
  toast.className = 'bs-billing-toast';
  toast.textContent = 'Payment received. Confirming your plan…';
  document.body.appendChild(toast);

  for (let i = 0; i < 6; i++) {
    const entitlement = await loadEntitlement();
    if (entitlement.paid) {
      toast.textContent = `${entitlement.plan === 'family' ? 'Family' : 'Premium'} is active on your account. ✓`;
      break;
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  setTimeout(() => toast.remove(), 6500);
  history.replaceState({}, '', `${location.pathname}${location.hash || ''}`);
}

async function bootBilling() {
  ensureStyles();
  await loadEntitlement();
  attachFreePreviewNotice();
  await handleCheckoutReturn();

  supabase.auth.onAuthStateChange(async () => {
    await loadEntitlement();
    setTimeout(() => { renderEntitlement(); attachFreePreviewNotice(); }, 100);
  });

  const domObserver = new MutationObserver(() => {
    renderEntitlement();
    attachFreePreviewNotice();
  });
  domObserver.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootBilling, { once: true });
} else {
  bootBilling();
}
