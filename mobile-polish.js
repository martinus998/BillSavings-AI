// Mobile-first polish for BillSavings AI.
// Keeps the desktop experience unchanged while making the phone layout faster,
// cleaner and easier to scan above the fold.
(function () {
  const style = document.createElement('style');
  style.id = 'bs-mobile-polish';
  style.textContent = `
  @media (max-width:760px){
    html,body{overflow-x:hidden!important}
    .wrap{width:calc(100% - 12px)!important}
    .hero{border-radius:22px!important;overflow:hidden!important}
    .live-status{width:calc(100% - 18px)!important;margin-top:8px!important;padding:9px 10px!important;font-size:11px!important;line-height:1.35!important}

    /* Put the useful action first on phones. Decorative demo metrics stay on desktop. */
    .hero-intel,.top-savings{display:none!important}

    .nav{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:8px!important;padding:12px!important;align-items:center!important}
    .brand{min-width:0!important;font-size:17px!important;line-height:1.05!important;gap:9px!important}
    .logo{width:34px!important;height:34px!important;border-radius:10px!important;flex:none!important}
    .nav-actions{min-width:0!important;display:block!important}
    .nav-actions .btn{width:auto!important;min-width:0!important;padding:10px 12px!important;border-radius:12px!important;font-size:12px!important;line-height:1.15!important;white-space:nowrap!important}

    .hero-main{padding:6px 12px 12px!important;gap:10px!important}
    .left{padding:10px 0 0!important}
    .kicker{font-size:9px!important;letter-spacing:3px!important;margin-bottom:9px!important}
    .left h1{font-size:clamp(38px,12vw,48px)!important;line-height:.94!important;letter-spacing:-1.7px!important;margin-bottom:12px!important}
    .left p{font-size:13px!important;line-height:1.48!important;margin-bottom:12px!important}

    /* One strong primary action + two compact secondary actions. */
    .cta{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important;margin-bottom:11px!important}
    .cta .btn{width:100%!important;min-width:0!important;padding:10px 8px!important;border-radius:12px!important;font-size:11px!important;line-height:1.2!important;text-align:center!important}
    .cta .btn:first-child{grid-column:1/-1!important;padding:13px 12px!important;font-size:14px!important}

    /* Compact trust row: keep the important labels, remove repeated explanatory copy. */
    .facts{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:7px!important;margin:4px 0 10px!important}
    .fact{display:grid!important;justify-items:center!important;align-content:start!important;gap:5px!important;max-width:none!important;min-width:0!important;padding:8px 5px!important;border:1px solid rgba(110,176,255,.14)!important;border-radius:12px!important;background:rgba(7,25,46,.58)!important;text-align:center!important}
    .fact i{width:25px!important;height:25px!important;font-size:12px!important}
    .fact>div{font-size:0!important;line-height:1.1!important}
    .fact strong{display:block!important;font-size:9.5px!important;line-height:1.15!important}

    /* Shrink the illustrative dashboard so it supports the page instead of dominating it. */
    .dashboard{padding:9px!important;border-radius:18px!important}
    .dash-head{padding:4px 3px 9px!important}
    .dash-head .tit{font-size:13px!important}
    .dash-head .sub{font-size:9px!important;line-height:1.3!important}
    .user{gap:6px!important}.avatar{width:30px!important;height:30px!important}.notif{font-size:15px!important}
    .dash-body{display:block!important}
    .mainDash{gap:6px!important}
    .mainDash>div[style]{font-size:8px!important;margin-bottom:4px!important}
    .stats{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:6px!important}
    .card{min-width:0!important;padding:8px!important;border-radius:12px!important}
    .card small{font-size:8px!important;line-height:1.15!important;margin-bottom:3px!important}
    .card b{font-size:19px!important;line-height:1!important;letter-spacing:-.5px!important}
    .card em{display:none!important}
    .lower{display:none!important}

    .trustbar{padding:10px 12px 12px!important;gap:8px!important}
    .trustbar .title{font-size:9px!important;letter-spacing:1.5px!important}
    .logos{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:7px!important;font-size:10px!important}

    .grid4,.stepGrid,.pricingGrid,.faqGrid{gap:8px!important}
    .grid4>* ,.stepGrid>* ,.pricingGrid>* ,.faqGrid>*{min-width:0!important}
    .fcard,.step,.plan,.faqItem{padding:13px!important;border-radius:16px!important}

    .quick-ai{padding:0 7px!important;margin-top:10px!important}
    .quick-ai-card{padding:14px!important;border-radius:18px!important}
    .quick-ai h2{font-size:20px!important}
    .quick-ai textarea{min-height:115px!important}
  }

  @media (max-width:390px){
    .brand{font-size:16px!important}
    .nav-actions .btn{font-size:11px!important;padding:9px 10px!important}
    .left h1{font-size:40px!important}
    .cta .btn{font-size:10.5px!important}
    .fact strong{font-size:9px!important}
    .card b{font-size:17px!important}
  }
  `;
  document.head.appendChild(style);
})();
