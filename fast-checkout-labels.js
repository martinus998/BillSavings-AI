// Payment acceptance labels only. Real wallet buttons stay on Stripe Checkout.
// No payment requests, account changes, tracking or storage access in this file.
(() => {
  'use strict';
  if (window.__fastCheckoutLabelsV1) return;
  window.__fastCheckoutLabelsV1 = true;
  function mount() {
    const q = selector => document.querySelector(selector);
    const bill = !!q('body.dashboard-home, #premiumBtn');
    const auto = !!q('#reviewPay');
    const safe = !!q('#checkBtn') && !!q('#modalBody');
    const repair = !!q('#pro-package');
    if (!bill && !auto && !safe && !repair) return;
    // RepairCostMatch uses a separate account: Google Pay is not enabled there.
    const methods = repair ? ['Apple Pay', 'Link'] : ['Apple Pay', 'Google Pay'];
    const style = document.createElement('style');
    style.id = 'fast-checkout-labels-style';
    style.textContent = `
      .fx-wallets{box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:7px 18px;width:100%;max-width:1280px;margin:12px auto;padding:16px 20px;border:2px solid #43caff;border-radius:14px;background:linear-gradient(120deg,#082b51,#06172e);box-shadow:0 8px 26px rgba(0,130,255,.16);color:#f5fbff;font-family:inherit;line-height:1.35;text-align:left;position:relative;z-index:1;isolation:isolate}
      .fx-wallets *{box-sizing:border-box}
      .fx-wallets .fx-copy{min-width:0}
      .fx-wallets .fx-title{display:block;margin:0;color:#fff;font-size:18px;font-weight:800;letter-spacing:-.2px}
      .fx-wallets .fx-subtitle{display:block;margin-top:3px;color:#bce9ff;font-size:13px}
      .fx-wallets .fx-methods{display:flex;align-items:center;justify-content:flex-end;gap:10px;min-width:0}
      .fx-wallets .fx-method{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:9px 18px;border:1px solid #dce7f3;border-radius:9px;background:#fff;color:#101828;font-size:20px;font-weight:700;letter-spacing:-.3px;line-height:1.2;white-space:nowrap;cursor:default}
      .fx-wallets .fx-note{grid-column:1 / -1;display:block;margin:1px 0 0;color:#b5c9dd;font-size:11px;line-height:1.45}
      .fx-wallets.fx-compact{grid-template-columns:1fr;padding:12px 14px;margin:10px 0;border-width:1px;gap:7px}
      .fx-wallets.fx-compact .fx-title{font-size:15px}
      .fx-wallets.fx-compact .fx-subtitle{display:none}
      .fx-wallets.fx-compact .fx-methods{justify-content:flex-start;flex-wrap:wrap}
      .fx-wallets.fx-compact .fx-method{min-height:39px;font-size:18px;padding:7px 15px}
      body.dashboard-home .hero>.fx-wallets{width:calc(100% - 24px);margin:12px}
      .fx-wallets.fx-page-top{width:calc(100% - 28px)}
      @media(max-width:640px){
        .fx-wallets{grid-template-columns:1fr;padding:12px 14px;gap:8px;margin:10px auto}
        .fx-wallets .fx-title{font-size:16px}
        .fx-wallets .fx-subtitle{font-size:12px}
        .fx-wallets .fx-methods{justify-content:flex-start;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
        .fx-wallets .fx-method{font-size:20px;min-height:43px;padding:8px 10px}
        .fx-wallets .fx-note{font-size:11px}
        .fx-wallets.fx-compact .fx-methods{display:flex}
      }
      @media print{.fx-wallets{display:none!important}}
    `;
    document.head.append(style);
    function add(target, position, id, compact = false, pageTop = false) {
      if (!target || document.getElementById(id)) return;
      const box = document.createElement('aside');
      box.id = id;
      box.className = 'fx-wallets' + (compact ? ' fx-compact' : '') + (pageTop ? ' fx-page-top' : '');
      box.setAttribute('aria-label', 'Fast payment options at Stripe checkout');
      const copy = document.createElement('div'); copy.className = 'fx-copy';
      const title = document.createElement('strong'); title.className = 'fx-title'; title.textContent = 'Pay faster with your wallet';
      const subtitle = document.createElement('span'); subtitle.className = 'fx-subtitle'; subtitle.textContent = 'Use your saved payment details at checkout.';
      copy.append(title, subtitle);
      const row = document.createElement('div'); row.className = 'fx-methods';
      methods.forEach(name => { const badge = document.createElement('span'); badge.className = 'fx-method'; badge.textContent = name; row.append(badge); });
      const note = document.createElement('small'); note.className = 'fx-note';
      note.textContent = 'Choose a supported wallet on Stripe. Availability depends on your device and setup. Cards also accepted.';
      box.append(copy, row, note);
      target.insertAdjacentElement(position, box);
    }
    if (bill) {
      add(q('body.dashboard-home .hero>.nav'), 'afterend', 'fx-wallets-home');
      const pricing = q('#pricing');
      if (pricing) add(pricing.querySelector('.pricingGrid') || pricing.firstElementChild, 'beforebegin', 'fx-wallets-plans');
    }
    if (auto) {
      add(q('.review-layout'), 'beforebegin', 'fx-wallets-home');
      add(q('#reviewPay'), 'afterend', 'fx-wallets-checkout', true);
    }
    if (safe) {
      add(q('.topnav') || q('.hero'), 'afterend', 'fx-wallets-home', false, true);
      const modal = q('#modalBody');
      const pricingNotice = () => add(modal.querySelector('.pricing-grid'), 'beforebegin', 'fx-wallets-plans', true);
      pricingNotice();
      new MutationObserver(pricingNotice).observe(modal, {childList:true});
    }
    if (repair) {
      add(q('header'), 'afterend', 'fx-wallets-home', false, true);
      const pro = q('#pro-package');
      add(pro.querySelector('.pro-secure-access') || pro.lastElementChild, 'beforebegin', 'fx-wallets-plans', true);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true});
  else mount();
})();
