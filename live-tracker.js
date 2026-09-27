(() => {
  if (location.pathname === '/live-dashboard.html') return;
  let owner = false;
  try { owner = localStorage.getItem('billsavings_owner_device') === '1'; } catch {}
  if (owner) return;

  const endpoint = 'https://bkyuyqicybqqifenhhux.supabase.co/functions/v1/live-analytics/collect';
  const host = location.hostname.toLowerCase();
  const site = host.includes('billsavingsai.com') ? 'billsavings' : null;
  if (!site || !crypto?.randomUUID) return;

  const getId = (storage, key) => {
    try {
      let v = storage.getItem(key);
      if (!v) { v = crypto.randomUUID(); storage.setItem(key, v); }
      return v;
    } catch { return crypto.randomUUID(); }
  };
  const visitorId = getId(localStorage, 'bs_live_visitor_v1');
  const sessionId = getId(sessionStorage, 'bs_live_session_v1');
  let sentView = false;
  let lastActivity = Date.now();
  let lastPing = 0;

  function sourcePayload() {
    let referrer_host = '';
    try {
      if (document.referrer) {
        const u = new URL(document.referrer);
        if (u.hostname && u.hostname !== location.hostname) referrer_host = u.hostname.toLowerCase();
      }
    } catch {}
    const qs = new URLSearchParams(location.search);
    return {
      referrer_host,
      utm_source: (qs.get('utm_source') || '').slice(0,120),
      utm_medium: (qs.get('utm_medium') || '').slice(0,120),
      utm_campaign: (qs.get('utm_campaign') || '').slice(0,160)
    };
  }

  window.bsLiveEvent = async function(event) {
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          site,
          visitor_id: visitorId,
          session_id: sessionId,
          path: location.pathname,
          event
        })
      });
    } catch {}
  };

  async function ping(pageview = false) {
    if (document.visibilityState === 'hidden' && !pageview) return;
    if (!pageview && Date.now() - lastActivity > 60_000) return;
    lastPing = Date.now();
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          site,
          visitor_id: visitorId,
          session_id: sessionId,
          path: location.pathname,
          pageview,
          active_at: new Date(lastActivity).toISOString(),
          ...sourcePayload()
        })
      });
    } catch {}
  }

  function markActive() {
    lastActivity = Date.now();
    if (document.visibilityState === 'visible' && Date.now() - lastPing > 25_000) void ping(false);
  }

  function first() { if (!sentView) { sentView = true; lastActivity = Date.now(); void ping(true); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', first, {once:true}); else first();

  ['pointerdown','keydown','touchstart','scroll'].forEach(type =>
    window.addEventListener(type, markActive, {passive:true})
  );
  setInterval(() => void ping(false), 30_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { lastActivity = Date.now(); void ping(false); }
  });
})();

/* SmallHelpNow cross-site promo. Presentation only; no payment or core-flow changes. */
(() => {
  if (document.querySelector('[data-smallhelpnow-promo]')) return;
  if (location.pathname === '/live-dashboard.html') return;
  const KEY='smallhelpnow_promo_seen_v1';
  try {
    const last=Number(localStorage.getItem(KEY)||0);
    if (last && Date.now()-last < 24*60*60*1000) return;
  } catch {}
  const show=()=>{
    if (document.querySelector('[data-smallhelpnow-promo]')) return;
    const box=document.createElement('aside');
    box.dataset.smallhelpnowPromo='1';
    box.setAttribute('aria-label','SmallHelpNow support');
    box.innerHTML='<button type="button" aria-label="Close" class="shn-x">×</button><div class="shn-heart">♥</div><div class="shn-copy"><strong>A little help goes a long way.</strong><span>Support projects that help people. Even $1 helps.</span></div><a class="shn-cta" href="https://smallhelpnow.vercel.app/?utm_source=billsavings&utm_medium=cross_site_popup&utm_campaign=smallhelpnow_launch">Support from $1</a>';
    Object.assign(box.style,{
      position:'fixed',left:'12px',right:'12px',bottom:'14px',zIndex:'2147483000',
      display:'grid',gridTemplateColumns:'36px minmax(0,1fr) auto',alignItems:'center',gap:'10px',
      maxWidth:'720px',margin:'0 auto',padding:'12px 12px',
      border:'1px solid rgba(255,110,120,.38)',borderRadius:'16px',
      background:'rgba(25,11,17,.97)',color:'#fff',
      boxShadow:'0 18px 50px rgba(0,0,0,.45)',backdropFilter:'blur(12px)',
      fontFamily:'system-ui,-apple-system,Segoe UI,Roboto,sans-serif'
    });
    const heart=box.querySelector('.shn-heart');
    if(heart) Object.assign(heart.style,{fontSize:'27px',color:'#ff626f',textAlign:'center'});
    const copy=box.querySelector('.shn-copy');
    if(copy) Object.assign(copy.style,{display:'grid',gap:'2px',minWidth:'0'});
    const strong=box.querySelector('.shn-copy strong');
    if(strong) Object.assign(strong.style,{fontSize:'13px',lineHeight:'1.2'});
    const span=box.querySelector('.shn-copy span');
    if(span) Object.assign(span.style,{fontSize:'11px',lineHeight:'1.3',color:'#d8c8cc'});
    const cta=box.querySelector('.shn-cta');
    if(cta) Object.assign(cta.style,{
      padding:'10px 12px',borderRadius:'11px',background:'#ff626f',color:'#fff',
      textDecoration:'none',fontSize:'11px',fontWeight:'900',whiteSpace:'nowrap'
    });
    const close=box.querySelector('.shn-x');
    if(close) Object.assign(close.style,{
      position:'absolute',right:'5px',top:'3px',border:'0',background:'transparent',
      color:'#cbbbc0',fontSize:'18px',lineHeight:'1',padding:'3px 5px',cursor:'pointer'
    });
    close?.addEventListener('click',()=>{
      try{localStorage.setItem(KEY,String(Date.now()));}catch{}
      box.remove();
    });
    cta?.addEventListener('click',()=>{try{localStorage.setItem(KEY,String(Date.now()));}catch{}});
    document.body.appendChild(box);
  };
  const start=()=>setTimeout(show,5000);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
