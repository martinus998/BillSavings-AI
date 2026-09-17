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

  async function ping(pageview = false) {
    if (document.visibilityState === 'hidden' && !pageview) return;
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({site, visitor_id: visitorId, session_id: sessionId, path: location.pathname, pageview})
      });
    } catch {}
  }
  function first() { if (!sentView) { sentView = true; void ping(true); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', first, {once:true}); else first();
  setInterval(() => void ping(false), 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void ping(false); });
})();
