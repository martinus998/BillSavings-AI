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

    // Put the strongest value proposition and demo dashboard first.
    // Final order: nav -> main hero/demo -> compact metrics -> savings preview -> trust bar.
    if (hero && nav && heroMain) {
      nav.insertAdjacentElement('afterend', heroMain);
      if (intel) heroMain.insertAdjacentElement('afterend', intel);
      if (topSavings && intel) intel.insertAdjacentElement('afterend', topSavings);
    }

    // Remove stale launch messaging now that checkout is live.
    const liveStatus = document.querySelector('.live-status');
    if (liveStatus) {
      liveStatus.innerHTML = '<span class="live-dot"></span><strong>BillSavings AI is live.</strong><span>Secure Premium and Family checkout is available now.</span>';
    }

    // Deeper premium navy treatment without changing the existing layout/components.
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
  bind(navSignIn, '/start.html');

  const navStart = document.querySelector('.nav-actions .paidBtn');
  if (navStart) navStart.textContent = 'Get Started →';
  bind(navStart, '/start.html');

  const heroUpload = Array.from(document.querySelectorAll('.cta .btn')).find(el => /upload a bill/i.test(el.textContent || ''));
  bind(heroUpload, '/start.html');

  const bannerStart = Array.from(document.querySelectorAll('.banner .btn')).find(el => /get started today/i.test(el.textContent || ''));
  bind(bannerStart, '/start.html');

  const freeBtn = Array.from(document.querySelectorAll('#pricing .plan .btn')).find(el => /get started free/i.test(el.textContent || ''));
  bind(freeBtn, '/start.html');

  document.querySelectorAll('#pricing .paidBtn').forEach(btn => {
    const plan = btn.dataset.plan === 'family' ? 'family' : 'premium';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      go('/start.html?plan=' + plan);
    });
  });
})();
