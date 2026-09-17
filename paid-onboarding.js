(() => {
  'use strict';
  if (!location.pathname.endsWith('/start.html')) return;

  const activePlan = document.getElementById('activePlan');
  const signedBox = document.getElementById('signedBox');
  const result = document.getElementById('result');
  const analyzeBtn = document.getElementById('analyzeBtn');
  if (!activePlan || !signedBox) return;

  let panel = null;
  const session = { fixUsed: false };

  function paidActive() {
    return /^(Premium|Family)\s*·\s*Active$/i.test((activePlan.textContent || '').trim());
  }

  function ensureStyle() {
    if (document.getElementById('paidOnboardingStyle')) return;
    const style = document.createElement('style');
    style.id = 'paidOnboardingStyle';
    style.textContent = `
      .paid-onboarding{margin:0 0 18px;padding:17px;border:1px solid #285a84;border-radius:18px;background:linear-gradient(145deg,#092644,#071b31);box-shadow:0 12px 30px rgba(0,0,0,.16)}
      .paid-onboarding-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.paid-onboarding-head h3{margin:3px 0 5px;font-size:18px}.paid-onboarding-head p{margin:0;color:#a7c0d9;font-size:11px;line-height:1.45}.paid-onboarding-badge{padding:5px 8px;border-radius:999px;border:1px solid rgba(82,231,190,.3);background:rgba(28,111,90,.2);color:#7cf2d0;font-size:8px;font-weight:900;white-space:nowrap}
      .paid-onboarding-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:12px}.paid-onboarding-step{padding:10px;border:1px solid #214d74;border-radius:12px;background:#06172b;min-height:104px}.paid-onboarding-step .n{display:grid;place-items:center;width:24px;height:24px;border-radius:8px;background:#123b65;color:#8bcbff;font-size:10px;font-weight:950}.paid-onboarding-step b{display:block;margin-top:7px;font-size:11px}.paid-onboarding-step small{display:block;margin-top:3px;color:#91adc7;font-size:8.5px;line-height:1.4}.paid-onboarding-step.done{border-color:#247765;background:#092c2c}.paid-onboarding-step.done .n{background:#155f51;color:#92f8db}.paid-onboarding-step.current{border-color:#3d83c1;box-shadow:inset 0 0 0 1px rgba(80,164,240,.12)}
      .paid-onboarding-next{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:11px;padding-top:10px;border-top:1px solid rgba(45,90,130,.45);color:#b3cbe0;font-size:9px}.paid-onboarding-next button{border:1px solid #315f8b;border-radius:9px;background:#0b2b4b;color:#e9f5ff;padding:7px 9px;font-weight:850;cursor:pointer}
      @media(max-width:760px){.paid-onboarding-grid{grid-template-columns:1fr 1fr}.paid-onboarding-head{display:block}.paid-onboarding-badge{display:inline-block;margin-top:7px}}@media(max-width:440px){.paid-onboarding-grid{grid-template-columns:1fr}.paid-onboarding-step{min-height:0}}
    `;
    document.head.appendChild(style);
  }

  function state() {
    const uploaded = !!analyzeBtn && !analyzeBtn.disabled;
    const analyzed = !!result && !result.hidden && !!result.textContent?.trim();
    const followPanel = document.getElementById('followUpPanel');
    const followSeen = !!followPanel && !followPanel.hidden && !!followPanel.textContent?.trim();
    return { uploaded, analyzed, fixUsed: session.fixUsed, followSeen };
  }

  function nextAction(s) {
    if (!s.uploaded) return ['Upload your first supported bill.', () => document.getElementById('file')?.click()];
    if (!s.analyzed) return ['Analyze the uploaded bill and review the complete findings.', () => document.getElementById('analyzeBtn')?.scrollIntoView({behavior:'smooth',block:'center'})];
    if (!s.fixUsed) return ['Open a Fix it action for a flagged item and use the script or email.', () => document.getElementById('fixItPanel')?.scrollIntoView({behavior:'smooth',block:'start'})];
    if (!s.followSeen) return ['Mark the provider contacted. BillSavings will remember the item for the next bill.', () => document.getElementById('fixItPanel')?.scrollIntoView({behavior:'smooth',block:'start'})];
    return ['Your workflow is active. On the next bill, confirm what actually changed.', () => document.getElementById('followUpPanel')?.scrollIntoView({behavior:'smooth',block:'start'})];
  }

  function ensurePanel() {
    if (panel) return panel;
    ensureStyle();
    panel = document.createElement('section');
    panel.id = 'paidOnboarding';
    panel.className = 'paid-onboarding';
    panel.hidden = true;
    const firstDivider = signedBox.querySelector('.divider');
    if (firstDivider) firstDivider.insertAdjacentElement('afterend', panel);
    else signedBox.prepend(panel);
    return panel;
  }

  function render() {
    const box = ensurePanel();
    box.hidden = !paidActive();
    if (box.hidden) return;
    const s = state();
    const steps = [
      {done:s.uploaded,title:'Upload',copy:'Add a supported bill or statement securely.'},
      {done:s.analyzed,title:'Review',copy:'Read the complete findings and potential opportunities.'},
      {done:s.fixUsed,title:'Fix it',copy:'Use a ready call script, email draft and provider questions.'},
      {done:s.followSeen,title:'Track',copy:'Recheck the next bill and confirm the real outcome.'}
    ];
    let currentIndex = steps.findIndex(step => !step.done);
    if (currentIndex < 0) currentIndex = 3;
    const [nextText, action] = nextAction(s);
    box.replaceChildren();
    const head = document.createElement('div'); head.className='paid-onboarding-head';
    head.innerHTML='<div><span class="small">YOUR PAID WORKFLOW</span><h3>Turn a finding into a verified result.</h3><p>Follow this simple order so Premium or Family gives you more than a one-time bill scan.</p></div><span class="paid-onboarding-badge">FIND → FIX → TRACK</span>';
    const grid = document.createElement('div'); grid.className='paid-onboarding-grid';
    steps.forEach((step,i)=>{
      const card=document.createElement('article');
      card.className='paid-onboarding-step'+(step.done?' done':'')+(i===currentIndex&&!step.done?' current':'');
      card.innerHTML=`<span class="n">${step.done?'✓':i+1}</span><b>${step.title}</b><small>${step.copy}</small>`;
      grid.appendChild(card);
    });
    const next=document.createElement('div'); next.className='paid-onboarding-next';
    const copy=document.createElement('span'); copy.textContent=nextText;
    const btn=document.createElement('button'); btn.type='button'; btn.textContent='Go to next step →'; btn.addEventListener('click',action);
    next.append(copy,btn);
    box.append(head,grid,next);
  }

  const observer = new MutationObserver(render);
  observer.observe(activePlan,{childList:true,subtree:true,characterData:true});
  if (result) observer.observe(result,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden']});
  if (analyzeBtn) observer.observe(analyzeBtn,{attributes:true,attributeFilter:['disabled']});
  document.addEventListener('click', e => {
    const b=e.target?.closest?.('.fixit-btn');
    if (!b) return;
    if (/copy call script|copy email|mark provider contacted/i.test(b.textContent||'')) {
      session.fixUsed=true;
      render();
    }
  },true);
  document.addEventListener('billsavings:followup-contact',()=>{session.fixUsed=true;render();});
  setTimeout(render,0);
})();
