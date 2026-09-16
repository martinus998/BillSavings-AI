// BillSavings AI stable public-shell interactions.
// The homepage stays static and lightweight; account/upload actions use a dedicated page.
window.BILLSAVINGS_CONFIG = { status: 'live', market: 'US', currency: 'USD' };

(function () {
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
