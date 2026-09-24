(() => {
  const endpoint='https://bkyuyqicybqqifenhhux.supabase.co/functions/v1/live-analytics/summary';
  const repairEndpoint='https://vmtbydmhccmztnfedwpi.supabase.co/functions/v1/owner-sales-summary';
  const $=id=>document.getElementById(id);
  const money=c=>'$'+(Number(c||0)/100).toFixed(2);
  async function loadSales(){
    let key='';
    try{key=sessionStorage.getItem('bs_live_dashboard_key')||'';}catch{}
    if(!key)return;
    try{
      const [r,rr]=await Promise.all([
        fetch(endpoint,{headers:{Authorization:'Bearer '+key},cache:'no-store'}),
        fetch(repairEndpoint,{headers:{Authorization:'Bearer '+key},cache:'no-store'})
      ]);
      if(!r.ok)return;
      const d=await r.json();
      const repair=rr.ok?await rr.json().catch(()=>({})):{};
      const b=d.sales?.billsavings||{}, s=d.sales?.safeorscamcheck||{}, rp=repair?.ok?repair:{};
      if($('bSales'))$('bSales').textContent=String(b.purchases_today||0)+' paid · '+money(b.gross_cents_today);
      if($('rSales'))$('rSales').textContent=String(rp.purchases_today||0)+' paid · '+money(rp.gross_cents_today);
      if($('sSales'))$('sSales').textContent=String(s.purchases_today||0)+' paid · '+money(s.gross_cents_today);
      if($('tSales'))$('tSales').textContent=String((b.purchases_today||0)+(rp.purchases_today||0)+(s.purchases_today||0))+' paid · '+money((b.gross_cents_today||0)+(rp.gross_cents_today||0)+(s.gross_cents_today||0));
    }catch{}
  }
  window.addEventListener('load',()=>{void loadSales();setInterval(loadSales,15000);},{once:true});
})();