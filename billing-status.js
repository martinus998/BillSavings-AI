import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://bkyuyqicybqqifenhhux.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_o-RgVfTUjzfne4DC9QcGfQ_4QGg5CVr';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const LIVE_CHECKOUT = {
  premium: 'https://buy.stripe.com/fZu6oG9lE65B2Pa9oi1sQ01',
  family: 'https://buy.stripe.com/eVqbJ055o65B3Te8ke1sQ02'
};

let currentEntitlement = { plan: 'free', status: 'inactive', paid: false, current_period_end: null };
let checkoutBound = false;

function ensureStyles() {
  if (document.getElementById('bs-billing-styles')) return;
  const style = document.createElement('style');
  style.id = 'bs-billing-styles';
  style.textContent = `
    .bs-plan-badge{display:inline-flex;align-items:center;gap:6px;margin:8px 0 12px;padding:6px 10px;border-radius:999px;border:1px solid rgba(107,241,201,.25);background:#0c3a36;color:#78f2cd;font-size:11px;font-weight:900;letter-spacing:.5px;text-transform:uppercase}
    .bs-plan-badge.free{border-color:rgba(128,188,255,.22);background:#0b203b;color:#b9d9ff}
    .bs-billing-toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:100000;width:min(560px,calc(100% - 28px));padding:13px 16px;border:1px solid rgba(107,241,201,.28);border-radius:14px;background:#071b35;color:#eafff8;font-size:13px;text-align:center}
  `;
  document.head.appendChild(style);
}

function showToast(text, ms = 4500) {
  document.querySelectorAll('.bs-billing-toast').forEach(el => el.remove());
  const toast = document.createElement('div');
  toast.className = 'bs-billing-toast';
  toast.textContent = text;
  document.body.appendChild(toast);
  if (ms > 0) setTimeout(() => toast.remove(), ms);
  return toast;
}

function isPaidRow(row) {
  return Boolean(row && ['premium','family'].includes(row.plan) && ['active','trialing'].includes(row.status));
}

async function getSessionUser() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user || null;
  } catch {
    return null;
  }
}

async function loadEntitlement() {
  const user = await getSessionUser();
  if (!user) {
    currentEntitlement = { plan: 'free', status: 'inactive', paid: false, current_period_end: null };
    window.BILLSAVINGS_ENTITLEMENT = currentEntitlement;
    renderEntitlement();
    return currentEntitlement;
  }

  try {
    const { data } = await supabase
      .from('billing_subscriptions')
      .select('plan,status,current_period_end')
      .eq('user_id', user.id)
      .maybeSingle();

    currentEntitlement = {
      plan: isPaidRow(data) ? data.plan : 'free',
      status: data?.status || 'inactive',
      paid: isPaidRow(data),
      current_period_end: data?.current_period_end || null
    };
  } catch {
    currentEntitlement = { plan: 'free', status: 'inactive', paid: false, current_period_end: null };
  }

  window.BILLSAVINGS_ENTITLEMENT = currentEntitlement;
  renderEntitlement();
  return currentEntitlement;
}

function renderEntitlement() {
  const panel = document.getElementById('bsAccountPanel');
  if (panel) {
    const userLine = panel.querySelector('.bs-userline');
    if (userLine) {
      let badge = panel.querySelector('.bs-plan-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'bs-plan-badge';
        userLine.insertAdjacentElement('afterend', badge);
      }
      const wanted = currentEntitlement.paid
        ? `${currentEntitlement.plan === 'family' ? 'Family' : 'Premium'} plan · active`
        : 'Free preview';
      badge.classList.toggle('free', !currentEntitlement.paid);
      if (badge.textContent !== wanted) badge.textContent = wanted;
    }
  }

  document.querySelectorAll('#pricing .plan').forEach(plan => {
    const heading = plan.querySelector('h3')?.textContent?.trim().toLowerCase();
    const button = plan.querySelector('.paidBtn');
    if (!button) return;

    const targetText = currentEntitlement.paid && heading === currentEntitlement.plan
      ? 'Current Plan ✓'
      : heading === 'family' ? 'Get Family' : heading === 'premium' ? 'Get Premium' : button.textContent;
    const shouldDisable = Boolean(currentEntitlement.paid && heading === currentEntitlement.plan);

    if (button.textContent !== targetText) button.textContent = targetText;
    if (button.disabled !== shouldDisable) button.disabled = shouldDisable;
  });
}

function applyLiveLaunchUI() {
  window.BILLSAVINGS_CONFIG = window.BILLSAVINGS_CONFIG || {};
  window.BILLSAVINGS_CONFIG.status = 'live';
  window.BILLSAVINGS_CONFIG.checkoutEnabled = true;
  window.BILLSAVINGS_CONFIG.checkout = {
    premium: LIVE_CHECKOUT.premium,
    family: LIVE_CHECKOUT.family,
    actionPlan: '',
    launch: LIVE_CHECKOUT.premium
  };

  const live = document.querySelector('.live-status');
  if (live) {
    const strong = live.querySelector('strong');
    const span = live.querySelector('span:last-child');
    if (strong) strong.textContent = 'BillSavings AI is live.';
    if (span) span.textContent = 'Premium and Family checkout are available now.';
  }

  const launch = document.querySelector('.launchRow .launchCard');
  if (launch) {
    const h3 = launch.querySelector('h3');
    const p = launch.querySelector('p');
    const btn = launch.querySelector('.paidBtn');
    if (h3) h3.textContent = 'BillSavings AI is officially live';
    if (p) p.textContent = 'Create your secure account, analyze supported bills, and upgrade whenever you want Premium or Family access.';
    if (btn) {
      btn.dataset.plan = 'premium';
      btn.textContent = 'Start Premium →';
    }
  }

  const overlay = document.getElementById('paymentOverlay');
  if (overlay) {
    overlay.classList.remove('show');
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden', 'true');
  }
}

async function openLiveCheckout(plan) {
  const normalized = plan === 'family' ? 'family' : 'premium';
  const user = await getSessionUser();

  if (!user?.email) {
    showToast('Sign in first, then choose your paid plan.');
    const signIn = [...document.querySelectorAll('.nav-actions .btn')].find(el => /sign in/i.test(el.textContent || ''));
    if (signIn) signIn.click();
    return;
  }

  if (currentEntitlement.paid && currentEntitlement.plan === normalized) {
    showToast(`${normalized === 'family' ? 'Family' : 'Premium'} is already active on your account.`);
    return;
  }

  const url = new URL(LIVE_CHECKOUT[normalized]);
  url.searchParams.set('prefilled_email', user.email);
  window.location.href = url.toString();
}

function attachLiveCheckoutRouting() {
  if (checkoutBound) return;
  checkoutBound = true;
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('.paidBtn') : null;
    if (!target || target.disabled) return;
    const plan = target.dataset.plan;
    if (!['premium','family','launch'].includes(plan)) return;
    event.preventDefault();
    openLiveCheckout(plan);
  }, true);
}

async function handleCheckoutReturn() {
  const params = new URLSearchParams(location.search);
  if (params.get('checkout') !== 'success') return;

  const toast = showToast('Payment received. Confirming your plan…', 0);
  for (let i = 0; i < 6; i++) {
    const entitlement = await loadEntitlement();
    if (entitlement.paid) {
      toast.textContent = `${entitlement.plan === 'family' ? 'Family' : 'Premium'} is active on your account. ✓`;
      break;
    }
    await new Promise(r => setTimeout(r, 1200));
  }
  setTimeout(() => toast.remove(), 5000);
  history.replaceState({}, '', `${location.pathname}${location.hash || ''}`);
}

async function bootBilling() {
  ensureStyles();
  applyLiveLaunchUI();
  attachLiveCheckoutRouting();
  await loadEntitlement();
  await handleCheckoutReturn();

  supabase.auth.onAuthStateChange(() => {
    setTimeout(loadEntitlement, 0);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootBilling, { once: true });
} else {
  bootBilling();
}
