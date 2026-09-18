// BillSavings AI stable public-shell interactions.
// The homepage stays static and lightweight; account/upload actions use a dedicated page.
window.BILLSAVINGS_CONFIG = { status: 'live', market: 'US', currency: 'USD' };

(function () {
  function polishHomepage() {
    const hero = document.querySelector('.hero');
    const nav = hero?.querySelector('.nav');
    const heroMain = hero?.querySelector('.hero-main');
    const intel = hero?.querySelector('.hero-intel');
    const topSavings = hero?.querySelector('.top-savings');

    if (hero && nav && heroMain) {
      nav.insertAdjacentElement('afterend', heroMain);
      if (intel) heroMain.insertAdjacentElement('afterend', intel);
      if (topSavings && intel) intel.insertAdjacentElement('afterend', topSavings);
    }

    const liveStatus = document.querySelector('.live-status');
    if (liveStatus) {
      liveStatus.innerHTML = '<span class="live-dot"></span><strong>BillSavings AI is live.</strong><span>Secure Premium and Family checkout is available now.</span>';
    }

    if (!document.getElementById('homepage-polish-style')) {
      const style = document.createElement('style');
      style.id = 'homepage-polish-style';
      style.textContent = `
        :root{--bg:#031126;--bg2:#08264a;--panel:#071a35;--panel2:#0b2b52}
        body{
          background:
            radial-gradient(circle at 12% 8%, rgba(45,121,255,.18), transparent 24%),
            radial-gradient(circle at 86% 12%, rgba(42,156,255,.13), transparent 21%),
            radial-gradient(circle at 76% 68%, rgba(64,87,210,.10), transparent 25%),
            linear-gradient(145deg,#020b1c 0%,#04162f 28%,#072347 58%,#04162e 100%) !important;
          background-color:#04162e !important;
        }
        body:before{opacity:.10 !important}
        body:after{opacity:.055 !important;mix-blend-mode:screen}
        .hero{
          background:
            radial-gradient(circle at 78% 12%,rgba(56,120,255,.16),transparent 25%),
            radial-gradient(circle at 18% 82%,rgba(31,103,210,.10),transparent 24%),
            linear-gradient(180deg,rgba(5,28,58,.985),rgba(3,17,36,.99)) !important;
        }
        .hero-main{padding-top:14px !important}
        .hero-intel{margin-top:4px}
        .top-savings{background:linear-gradient(145deg,rgba(7,33,65,.97),rgba(4,20,43,.96)) !important}
        .dashboard,.fcard,.card,.activity,.break,.side{
          box-shadow:inset 0 1px 0 rgba(255,255,255,.025),0 12px 34px rgba(0,7,22,.24);
        }
        @media(max-width:760px){
          body{background:linear-gradient(180deg,#031126 0%,#062041 52%,#04162e 100%) !important}
          .hero-main{padding-top:8px !important}
        }
      `;
      document.head.appendChild(style);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', polishHomepage, { once: true });
  } else {
    polishHomepage();
  }

  const logoBox = document.querySelector('.brand .logo');
  if (logoBox) {
    logoBox.textContent = '';
    logoBox.style.overflow = 'hidden';
    logoBox.style.background = '#041126';
    const img = document.createElement('img');
    img.src = '/logo.svg';
    img.alt = 'BillSavings AI';
    img.width = 40;
    img.height = 40;
    img.decoding = 'async';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit';
    logoBox.appendChild(img);
  }

  const overlay = document.getElementById('paymentOverlay');
  if (overlay) {
    overlay.classList.remove('show');
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden', 'true');
  }

  function go(url) { window.location.href = url; }
  function bind(el, url) {
    if (!el) return;
    if (el.tagName === 'A') el.href = url;
    else el.addEventListener('click', function (e) { e.preventDefault(); go(url); });
  }

  const navSignIn = Array.from(document.querySelectorAll('.nav-actions .btn')).find(el => /sign in/i.test(el.textContent || ''));
  bind(navSignIn, '/start.html?signin=1');

  const navStart = document.querySelector('.nav-actions .paidBtn');
  if (navStart) navStart.textContent = 'Get Started →';
  bind(navStart, '/start.html');

  const heroUpload = Array.from(document.querySelectorAll('.cta .btn')).find(el => /upload a bill/i.test(el.textContent || ''));
  bind(heroUpload, '/start.html?free=1');

  const bannerStart = Array.from(document.querySelectorAll('.banner .btn')).find(el => /get started today/i.test(el.textContent || ''));
  bind(bannerStart, '/start.html');

  const freeBtn = Array.from(document.querySelectorAll('#pricing .plan .btn')).find(el => /get started free/i.test(el.textContent || ''));
  bind(freeBtn, '/start.html?free=1');

  bind(document.querySelector('.launchRow .paidBtn'), '/start.html');

  document.querySelectorAll('#pricing .paidBtn').forEach(btn => {
    const plan = btn.dataset.plan === 'family' ? 'family' : 'premium';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      go('/checkout.html?plan=' + plan);
    });
  });
})();

// Explain the paid value after a finding without changing auth, analysis or billing.
(function () {
  function mountPremiumValue() {
    const pricing = document.getElementById('pricing');
    if (!pricing || document.getElementById('premium-action-value')) return;

    const plans = Array.from(pricing.querySelectorAll('.plan'));
    const premium = plans.find(plan => (plan.querySelector('h3')?.textContent || '').trim() === 'Premium');
    const family = plans.find(plan => (plan.querySelector('h3')?.textContent || '').trim() === 'Family');
    if (premium?.querySelector('ul')) {
      premium.querySelector('ul').innerHTML = '<li>Everything in Free</li><li>Unlock all supported savings findings</li><li>Detailed bill-review results</li><li>Fix-it call and email scripts for flagged items</li><li>Track contacted items on the next bill</li><li>Confirm resolved, still there, or amount changed</li><li>Priority support</li>';
    }
    if (family?.querySelector('ul')) {
      family.querySelector('ul').innerHTML = '<li>Everything in Premium</li><li>Expanded household bill review</li><li>Shared household savings workflow</li><li>More supported uploads</li><li>Fix-it scripts and next-bill follow-up</li><li>Premium support</li>';
    }

    if (!document.getElementById('premium-action-value-style')) {
      const style = document.createElement('style');
      style.id = 'premium-action-value-style';
      style.textContent = `
        .premium-action-value{margin:18px 20px 0;padding:20px;border:1px solid rgba(91,190,255,.25);border-radius:20px;background:linear-gradient(145deg,rgba(7,35,69,.96),rgba(4,20,41,.97));box-shadow:0 14px 36px rgba(0,7,22,.23)}
        .premium-action-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.premium-action-head h2{margin:5px 0 7px;font-size:24px}.premium-action-head p{margin:0;color:#a7bdd5;max-width:760px;line-height:1.55}.premium-action-badge{padding:7px 10px;border:1px solid rgba(83,223,184,.28);border-radius:999px;background:rgba(25,101,82,.18);color:#7af0cf;font-size:9px;font-weight:900;white-space:nowrap}
        .premium-action-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:15px}.premium-action-card{padding:13px;border:1px solid rgba(120,188,255,.15);border-radius:14px;background:rgba(5,24,48,.78)}.premium-action-card span{display:grid;place-items:center;width:27px;height:27px;border-radius:9px;background:#0d3560;color:#82c9ff;font-size:11px;font-weight:950}.premium-action-card b{display:block;margin-top:9px;font-size:13px}.premium-action-card small{display:block;margin-top:4px;color:#9bb4cd;font-size:10px;line-height:1.45}.premium-action-footer{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:14px;padding-top:13px;border-top:1px solid rgba(90,150,210,.16)}.premium-action-footer p{margin:0;color:#9db8d0;font-size:10px;line-height:1.45}.premium-action-footer .btn{white-space:nowrap}
        @media(max-width:760px){.premium-action-value{margin:10px;padding:14px}.premium-action-head{display:block}.premium-action-badge{display:inline-block;margin-top:9px}.premium-action-head h2{font-size:18px}.premium-action-head p{font-size:11px}.premium-action-grid{grid-template-columns:1fr 1fr}.premium-action-footer{display:block}.premium-action-footer .btn{margin-top:10px;width:100%}}
        @media(max-width:460px){.premium-action-grid{grid-template-columns:1fr}}
      `;
      document.head.appendChild(style);
    }

    const section = document.createElement('section');
    section.id = 'premium-action-value';
    section.className = 'premium-action-value';
    section.innerHTML = `
      <div class="premium-action-head"><div><div class="kicker">PREMIUM ACTION LAYER</div><h2>Finding the charge is only step one.</h2><p>Premium is built to help you move from a flagged line item to a real provider conversation, then check what happened on the next bill.</p></div><span class="premium-action-badge">FIND → FIX → TRACK</span></div>
      <div class="premium-action-grid">
        <article class="premium-action-card"><span>1</span><b>Find it</b><small>See the complete supported findings, recurring charges and fees worth reviewing.</small></article>
        <article class="premium-action-card"><span>2</span><b>Fix it</b><small>Open a ready-to-use provider call script, email draft and questions for the flagged item.</small></article>
        <article class="premium-action-card"><span>3</span><b>Track it</b><small>Mark the provider contacted and let BillSavings compare the item with your next bill review.</small></article>
        <article class="premium-action-card"><span>4</span><b>Confirm it</b><small>Tell BillSavings whether it was resolved, is still there, or the amount changed.</small></article>
      </div>
      <div class="premium-action-footer"><p>If one removable monthly charge of $9 is actually removed, that charge alone is roughly the same as the $8.99 Premium monthly price. This is an illustration, not a savings guarantee.</p><a class="btn primary" href="/start.html">Start with BillSavings AI →</a></div>`;
    pricing.insertAdjacentElement('afterend', section);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountPremiumValue, { once: true });
  else mountPremiumValue();
})();


// CONVERSION FOCUS LAYER
// Clarifies the value before checkout without touching auth, billing, uploads or AI analysis.
(function () {
  function mountConversionFocus() {
    const path = window.location?.pathname || '';
    if (!(path === '/' || path.endsWith('/index.html'))) return;
    if (document.getElementById('conversion-focus-style')) return;

    const hero = document.querySelector('.hero-main .left');
    const dashboard = document.querySelector('.dashboard');
    const pricing = document.getElementById('pricing');
    if (!hero || !dashboard || !pricing) return;

    dashboard.id = dashboard.id || 'sample-result';

    const kicker = hero.querySelector('.kicker');
    const title = hero.querySelector('h1');
    const copy = hero.querySelector(':scope > p');
    const cta = hero.querySelector('.cta');
    const ctaButtons = cta ? Array.from(cta.querySelectorAll('.btn')) : [];

    if (kicker) kicker.textContent = 'AI BILL REVIEW • FREE PREVIEW • NO CARD REQUIRED';
    if (title) title.innerHTML = 'Upload Your Bill. <span class="grad">See What to Fix.</span>';
    if (copy) copy.textContent = 'Start with a free preview of a supported bill. See possible fees and recurring charges first, then upgrade only if you want the complete findings, ready-to-use provider scripts and next-bill tracking.';

    if (ctaButtons[0]) {
      ctaButtons[0].textContent = 'Check My Bill Free →';
      ctaButtons[0].setAttribute('href', '/start.html?free=1');
      ctaButtons[0].dataset.bsCta = 'free_preview';
    }
    if (ctaButtons[1]) {
      ctaButtons[1].textContent = 'See Sample Result ↓';
      ctaButtons[1].setAttribute('href', '#sample-result');
      ctaButtons[1].dataset.bsCta = 'sample_result';
    }

    if (!document.getElementById('conversion-proof')) {
      const proof = document.createElement('div');
      proof.id = 'conversion-proof';
      proof.className = 'conversion-proof';
      proof.innerHTML = '<span>✓ Free Preview — no card required</span><span>✓ Secure supported bill upload</span><span>✓ Premium adds Fix it + next-bill tracking</span>';
      cta?.insertAdjacentElement('afterend', proof);
    }

    const premium = Array.from(pricing.querySelectorAll('.plan')).find(plan => (plan.querySelector('h3')?.textContent || '').trim() === 'Premium');
    const family = Array.from(pricing.querySelectorAll('.plan')).find(plan => (plan.querySelector('h3')?.textContent || '').trim() === 'Family');
    const premiumBtn = premium?.querySelector('.paidBtn');
    const familyBtn = family?.querySelector('.paidBtn');
    if (premiumBtn) premiumBtn.textContent = 'Unlock Premium — $8.99/mo';
    if (familyBtn) familyBtn.textContent = 'Choose Family — $13.99/mo';

    if (!document.getElementById('mobile-conversion-cta')) {
      const sticky = document.createElement('div');
      sticky.id = 'mobile-conversion-cta';
      sticky.className = 'mobile-conversion-cta';
      sticky.innerHTML = '<div><b>Check your bill free</b><span>No card required for the Free Preview</span></div><a class="btn primary" data-bs-cta="mobile_free_preview" href="/start.html?free=1">Start →</a>';
      document.body.appendChild(sticky);
    }

    const style = document.createElement('style');
    style.id = 'conversion-focus-style';
    style.textContent = `
      .conversion-proof{display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:13px;color:#a9c4dd;font-size:10px;line-height:1.45}
      .conversion-proof span{display:inline-flex;align-items:center;gap:5px}
      .mobile-conversion-cta{display:none}
      @media(max-width:760px){
        body{padding-bottom:78px}
        .conversion-proof{display:grid;grid-template-columns:1fr;gap:6px;font-size:9px}
        .mobile-conversion-cta{position:fixed;z-index:9998;left:8px;right:8px;bottom:8px;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:10px 10px 10px 13px;border:1px solid rgba(91,190,255,.34);border-radius:15px;background:rgba(3,17,38,.96);box-shadow:0 14px 38px rgba(0,0,0,.38);backdrop-filter:blur(12px)}
        .mobile-conversion-cta b{display:block;font-size:11px;color:#fff}
        .mobile-conversion-cta span{display:block;margin-top:2px;font-size:8px;color:#9fb8d4}
        .mobile-conversion-cta .btn{padding:10px 13px;font-size:10px;white-space:nowrap}
      }
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountConversionFocus, { once: true });
  else mountConversionFocus();
})();
