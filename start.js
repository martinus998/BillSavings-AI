import './live-tracker.js?v=20260917-live1';
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, initialAuthReturn } from './account-session.js';
import { createCheckoutAccess } from './checkout-access.js?v=20260917-password';
import { createPasswordAuth } from './password-auth.js?v=20260918-simplelogin2';

const authReturnState = initialAuthReturn;
const qs = new URLSearchParams(location.search);
let recoveryMode = initialAuthReturn.type === 'recovery';
let accountViewRequested = qs.get('signin') === '1' ||
  qs.get('access') === 'ready' || qs.has('checkout') || authReturnState.received;
const $ = id => document.getElementById(id);
let currentUser = null;
let lastDocumentId = null;
let sessionLoadFailed = false;
let accountGeneration = 0;
let activePaidPlan = false;
let planChecked = false;
const purchasePreferenceKey = 'billsavings.purchase-plan';
const SIGNUP_ENDPOINT = `${SUPABASE_URL}/functions/v1/password-signup`;
async function signInCompatibleLocal(email, password) {
  const direct = await supabase.auth.signInWithPassword({email, password});
  if (!direct?.error && direct?.data?.session?.user?.id) return direct;
  const code = String(direct?.error?.code || '');
  if (code && !['invalid_credentials','weak_password'].includes(code)) return direct;
  return supabase.auth.signInWithPassword({email, password: password + '!Bs9'});
}

function rememberedPlan() {
  try {
    const saved = JSON.parse(localStorage.getItem(purchasePreferenceKey) || 'null');
    const now = Date.now();
    if (saved && ['premium', 'family'].includes(saved.plan) && Number.isFinite(saved.expires) &&
        saved.expires > now && saved.expires <= now + 3600000) return saved.plan;
    localStorage.removeItem(purchasePreferenceKey);
  } catch {}
  return null;
}
function refreshPurchaseButton() {
  const plan = currentUser && planChecked && !recoveryMode && !activePaidPlan ? rememberedPlan() : null;
  $('continuePurchaseBtn').hidden = !plan;
  if (plan) $('continuePurchaseBtn').textContent = `Continue to ${plan === 'family' ? 'Family' : 'Premium'} →`;
}
function showStatus(text, isError = false) { const el=$('status'); el.textContent=text; el.classList.add('show'); el.classList.toggle('err',isError); }
function clearStatus() { const el=$('status'); el.textContent=''; el.classList.remove('show','err'); }
function configureAccountLayout() {
  const card=$('accountCard'); const showAccount=!!currentUser||accountViewRequested||recoveryMode;
  card.hidden=!showAccount; $('pricing').hidden=activePaidPlan||recoveryMode||(!currentUser&&showAccount); $('entrySignIn').hidden=!!currentUser||showAccount;
  const demo=$('demoSection'); if(demo) demo.hidden=activePaidPlan;
  $('startTitle').textContent=showAccount?'Your BillSavings AI account':'Choose your plan';
  $('startCopy').textContent=showAccount
    ? (activePaidPlan?'Upload a supported bill and review your real analysis below.':'Use your email and password to access your account.')
    :'Choose a plan, create your account, then pay securely. Your selected plan stays with your account.';
}
function clearAccountView() {
  accountGeneration++; activePaidPlan=false; planChecked=false; lastDocumentId=null; $('activePlan').textContent='Payment required'; $('pricing').hidden=recoveryMode;
  $('result').hidden=true; $('result').textContent=''; $('file').value=''; $('category').value='general'; $('consent').checked=false; $('analyzeBtn').disabled=true; $('uploadBtn').disabled=false; $('userEmail').textContent=''; $('continuePurchaseBtn').hidden=true; clearStatus();
}
function isCurrentAccount(version,userId){return version===accountGeneration&&currentUser?.id===userId;}
function renderSession(user){if(currentUser?.id!==user?.id)clearAccountView();currentUser=user||null;$('loginBox').classList.toggle('hidden',!!user);$('signedBox').classList.toggle('show',!!user&&activePaidPlan&&!recoveryMode);if(recoveryMode)$('loginBox').classList.remove('hidden');if(user)$('userEmail').textContent=user.email||'your account';configureAccountLayout();refreshPurchaseButton();}
async function refreshSession(){sessionLoadFailed=false;const version=accountGeneration;try{const{data,error}=await supabase.auth.getSession();if(version!==accountGeneration)return;if(error)throw error;if(!data?.session){renderSession(null);return;}const verified=await supabase.auth.getUser();if(version!==accountGeneration)return;if(verified.error||!verified.data?.user?.id||!verified.data.user.email_confirmed_at||verified.data.user.is_anonymous)throw new Error('A confirmed account is required.');renderSession(verified.data.user);}catch(error){if(version!==accountGeneration)return;sessionLoadFailed=true;accountViewRequested=true;renderSession(null);showStatus('Could not load the secure account session. Please refresh and try again.',true);}}
async function signOut(){clearStatus();try{const result=await supabase.auth.signOut({scope:'local'});if(result?.error)throw result.error;accessFlow.reset();recoveryMode=false;accountViewRequested=false;clearAccountView();renderSession(null);configureAccountLayout();}catch{showStatus('Could not sign out. Please try again.',true);}}
async function uploadBill(){clearStatus();if(!currentUser)return showStatus('Sign in first.',true);if(!activePaidPlan)return showStatus('Choose Premium or Family and complete payment before uploading a bill.',true);const file=$('file').files?.[0];const category=$('category').value;if(!file)return showStatus('Choose a PDF or image first.',true);const allowed=['application/pdf','image/jpeg','image/png','image/webp'];if(!allowed.includes(file.type))return showStatus('Unsupported file type.',true);if(file.size>10*1024*1024)return showStatus('File is larger than 10 MB.',true);$('uploadBtn').disabled=true;showStatus('Uploading securely…');const safeName=file.name.replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-100);const userId=currentUser.id;const version=accountGeneration;const objectPath=`${userId}/${crypto.randomUUID()}-${safeName}`;try{const{error:uploadError}=await supabase.storage.from('user-bills').upload(objectPath,file,{upsert:false,contentType:file.type});if(!isCurrentAccount(version,userId))return;if(uploadError)throw uploadError;const{data:row,error:rowError}=await supabase.from('documents').insert({user_id:userId,storage_path:objectPath,original_name:file.name,mime_type:file.type,size_bytes:file.size,category,status:'uploaded'}).select('id').single();if(!isCurrentAccount(version,userId))return;if(rowError||!row?.id){await supabase.storage.from('user-bills').remove([objectPath]);throw rowError||new Error('Could not save the upload record.');}lastDocumentId=row.id;$('file').value='';$('analyzeBtn').disabled=false;showStatus('Upload complete. You can now analyze the bill.');}catch(error){if(isCurrentAccount(version,userId))showStatus(error?.message||'Upload failed.',true);}finally{if(isCurrentAccount(version,userId))$('uploadBtn').disabled=false;}}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function money(value,currency='USD'){
  const n=Number(value); if(!Number.isFinite(n))return '';
  const code=/^[A-Z]{3}$/.test(String(currency||'').toUpperCase())?String(currency).toUpperCase():'USD';
  const symbol=code==='USD'?'{if(!currentUser)return false;planChecked=false;refreshPurchaseButton();const userId=currentUser.id;const version=accountGeneration;try{const{data,error}=await supabase.rpc('claim_billing_entitlement');if(!isCurrentAccount(version,userId))return false;if(error||typeof data?.plan!=='string'||typeof data?.status!=='string')throw new Error('Account check unavailable');planChecked=true;const plan=data?.plan||'free';const status=data?.status||'inactive';if((plan==='premium'||plan==='family')&&['active','trialing','past_due'].includes(status)){const name=plan==='family'?'Family':'Premium';activePaidPlan=true;try{localStorage.removeItem(purchasePreferenceKey);}catch{}refreshPurchaseButton();$('activePlan').textContent=`${name} · Active`;$('pricing').hidden=true;$('signedBox').classList.toggle('show',!!currentUser&&!recoveryMode);configureAccountLayout();showStatus(`${name} is active. Upload your bill to get started.`);return true;}}catch{}if(isCurrentAccount(version,userId)){activePaidPlan=false;$('activePlan').textContent='Payment required';$('signedBox').classList.remove('show');$('pricing').hidden=recoveryMode;configureAccountLayout();refreshPurchaseButton();if(currentUser&&!recoveryMode)showStatus('Choose Premium or Family to analyze your own bill.');}return false;}
function checkout(plan){if(!['premium','family'].includes(plan)||recoveryMode)return;location.href=`/checkout.html?plan=${plan}`;}
configureAccountLayout();
const accessFlow=createCheckoutAccess({supabase,publicKey:SUPABASE_PUBLISHABLE_KEY,endpoint:`${SUPABASE_URL}/functions/v1/billing-access`,claimPaidAccess});
const passwordAuth=createPasswordAuth({supabase,root:$('loginBox'),requirePasswordConfirmation:false,initialMode:'signin',redirectTo:`${location.origin}/start.html?access=ready`,onStatus:(message,kind)=>message?showStatus(message,kind==='error'):clearStatus(),onRecovery:()=>{recoveryMode=true;renderSession(currentUser);$('pricing').hidden=true;},onAuthenticated:async()=>{recoveryMode=false;$('pricing').hidden=false;await refreshSession();if(currentUser){if(accessFlow.hasCheckout())await accessFlow.onSignIn();else await claimPaidAccess();$('accountCard').scrollIntoView({behavior:'smooth',block:'start'});}}});

$('authForm').addEventListener('submit', async (event) => {
  if (passwordAuth.mode !== 'signup') return;
  event.preventDefault();
  if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
  if (passwordAuth.busy) return;

  const email = $('authEmail').value.trim();
  const password = $('authPassword').value;
  const strong = password.length >= 12 && password.length <= 128 &&
    /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password) &&
    /[!@#$%^&*()_+\-=\[\]{};'\\:"|<>?,.\/\`~]/.test(password);

  if (!/^\S+@\S+\.\S+$/.test(email)) return showStatus('Enter a valid email address.', true);
  if (!strong) return showStatus('Use at least 10 characters with at least one letter and one number.', true);

  passwordAuth.setBusy(true);
  showStatus('Creating your account…');
  try {
    const response = await fetch(SIGNUP_ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({email,password})
    });
    let payload = {};
    try { payload = await response.json(); } catch {}

    if (!response.ok) {
      const messages = {
        invalid_email: 'Enter a valid email address.',
        invalid_password: 'Use at least 10 characters with at least one letter and one number.',
        too_many_attempts: 'Too many attempts. Wait a little and try again.'
      };
      throw new Error(messages[payload?.error] || 'Could not create the account. Please try again.');
    }

    const {data,error} = await signInCompatibleLocal(email,password);
    if (error || !data?.session?.user?.id) {
      passwordAuth.setBusy(false);
      passwordAuth.setMode('signin');
      $('authEmail').value = email;
      showStatus('This email already has an account. Sign in with your existing password, or use Reset password.', true);
      return;
    }

    showStatus('Account ready. Loading your BillSavings account…');
    recoveryMode=false;
    await refreshSession();
    if(currentUser){
      if(accessFlow.hasCheckout()) await accessFlow.onSignIn();
      else await claimPaidAccess();
      $('accountCard').scrollIntoView({behavior:'smooth',block:'start'});
    }
  } catch (error) {
    showStatus(error?.message || 'Could not create the account. Please try again.', true);
  } finally {
    $('authPassword').value='';
    passwordAuth.setBusy(false);
  }
}, true);

$('signOutBtn').addEventListener('click',signOut);$('uploadBtn').addEventListener('click',uploadBill);$('analyzeBtn').addEventListener('click',analyzeBill);
$('premiumBtn').addEventListener('click',()=>checkout('premium'));$('familyBtn').addEventListener('click',()=>checkout('family'));$('continuePurchaseBtn').addEventListener('click',()=>{if(!currentUser||!planChecked||activePaidPlan||recoveryMode)return;const plan=rememberedPlan();if(plan)checkout(plan);else refreshPurchaseButton();});
let pageReady=false;supabase.auth.onAuthStateChange((_event,session)=>{passwordAuth.handleAuthEvent(_event,session);if(_event==='PASSWORD_RECOVERY')recoveryMode=true;if(_event==='SIGNED_OUT'){recoveryMode=false;accountViewRequested=false;accessFlow.reset();clearAccountView();renderSession(null);}if(pageReady&&session?.user&&_event==='SIGNED_IN'&&!passwordAuth.busy&&!recoveryMode){setTimeout(()=>{void refreshSession().then(()=>{if(currentUser)return accessFlow.hasCheckout()?accessFlow.onSignIn():claimPaidAccess();});},0);}});
await refreshSession();pageReady=true;
if(authReturnState.failed||sessionLoadFailed){accessFlow.reset();accountViewRequested=true;configureAccountLayout();if(authReturnState.failed)history.replaceState(null,'',`${location.pathname}${location.search}`);const message=authReturnState.expired?'This email link has expired or has already been used. Sign in with your password or request a new reset link.':'We could not complete sign-in. Sign in with your password or request a new reset link.';showStatus(message,true);}else if(recoveryMode){await passwordAuth.showRecovery();}else{await accessFlow.start();const paidAccess=currentUser&&!accessFlow.hasCheckout()?await claimPaidAccess():false;if(!paidAccess&&!accessFlow.hasCheckout()&&qs.get('access')!=='ready'&&!authReturnState.received){const requestedPlan=qs.get('plan');if(requestedPlan==='premium'||requestedPlan==='family')checkout(requestedPlan);}}
:code==='EUR'?'€':code==='GBP'?'£':code+' ';
  return symbol+n.toFixed(2);
}
function savingsLabel(low,high,currency,suffix=''){
  const lo=Math.max(0,Number(low)||0), hi=Math.max(lo,Number(high)||0);
  if(hi<=0)return '';
  return lo===hi?money(hi,currency)+suffix:`${money(lo,currency)}–${money(hi,currency)}${suffix}`;
}
function renderAnalysis(r){
  const result=$('result');
  const findings=Array.isArray(r?.findings)?r.findings:[];
  const currency=String(r?.currency||'USD').toUpperCase();
  const low=Math.max(0,Number(r?.potential_monthly_savings_low)||0);
  const high=Math.max(low,Number(r?.potential_monthly_savings_high)||0);
  const provider=String(r?.bill_provider||'Bill');
  const total=Number(r?.bill_total);
  const totalText=Number.isFinite(total)?money(total,currency):'—';
  const monthly=savingsLabel(low,high,currency,' / month')||'No supported recurring savings estimate';
  const annual=high>0?money(high*12,currency)+' / year max':'—';
  const summary=String(r?.summary||'Analysis complete.');
  const machineText=[
    summary,
    high>0?`Potential monthly savings: ${money(low,currency)}–${money(high,currency)}`:'',
    ...findings.flatMap((finding,index)=>[
      `${index+1}. ${finding?.title||'Finding'}`,
      String(finding?.explanation||''),
      `Next step: ${finding?.action||''}`
    ])
  ].filter(Boolean).join('\n\n');

  const cards=findings.map((finding,index)=>{
    const monthlySaving=savingsLabel(finding?.estimated_monthly_savings_low,finding?.estimated_monthly_savings_high,currency,' / month');
    const oneTime=savingsLabel(finding?.estimated_one_time_savings_low,finding?.estimated_one_time_savings_high,currency,' one-time');
    const chips=[monthlySaving&&`<span class="real-result-chip saving">${escapeHtml(monthlySaving)}</span>`,oneTime&&`<span class="real-result-chip">${escapeHtml(oneTime)}</span>`].filter(Boolean).join('');
    return `<article class="real-finding">
      <div class="real-finding-num">${String(index+1).padStart(2,'0')}</div>
      <div class="real-finding-body">
        <div class="real-finding-top"><h4>${escapeHtml(finding?.title||'Finding')}</h4><span>${escapeHtml(String(finding?.type||'review').replaceAll('_',' '))}</span></div>
        <p>${escapeHtml(finding?.explanation||'')}</p>
        ${chips?`<div class="real-result-chips">${chips}</div>`:''}
        <div class="real-next"><strong>Next step</strong><span>${escapeHtml(finding?.action||'Review this item with the provider before making changes.')}</span></div>
      </div>
    </article>`;
  }).join('');

  result.innerHTML=`<section class="real-analysis">
    <div class="real-analysis-head"><div><span class="real-eyebrow">YOUR BILL ANALYSIS</span><h3>${escapeHtml(provider)}</h3><p>${escapeHtml(summary)}</p></div><span class="real-paid-badge">PREMIUM RESULT</span></div>
    <div class="real-metrics">
      <div><small>Bill total</small><strong>${escapeHtml(totalText)}</strong></div>
      <div><small>Potential monthly range</small><strong>${escapeHtml(monthly)}</strong></div>
      <div><small>Potential annual impact</small><strong>${escapeHtml(annual)}</strong></div>
      <div><small>Items flagged</small><strong>${findings.length}</strong></div>
    </div>
    <div class="real-findings">${cards||'<p class="real-empty">No supported savings findings were identified in this bill.</p>'}</div>
    <button type="button" class="btn real-another" id="analyzeAnotherBtn">Analyze another bill →</button>
    <div class="analysis-machine-text" hidden>${escapeHtml(machineText)}</div>
    <p class="real-disclaimer">Estimates are informational. Verify charges, eligibility and provider terms before making changes.</p>
  </section>`;
  result.hidden=false;
}
function resetForAnotherBill(){
  lastDocumentId=null;
  $('file').value='';
  $('consent').checked=false;
  $('analyzeBtn').disabled=true;
  $('result').hidden=true;
  $('result').textContent='';
  const fix=$('fixItPanel'); if(fix){fix.hidden=true;fix.replaceChildren?.();}
  const follow=$('followUpPanel'); if(follow){follow.hidden=true;follow.replaceChildren?.();}
  clearStatus();
  showStatus('Ready for another bill. Choose a file and upload it securely.');
  $('file').scrollIntoView?.({behavior:'smooth',block:'center'});
}
$('result').addEventListener('click',event=>{if(event.target?.closest?.('#analyzeAnotherBtn'))resetForAnotherBill();});

async function analyzeBill(){
  clearStatus();
  if(!currentUser)return showStatus('Sign in first.',true);
  if(!activePaidPlan)return showStatus('Payment is required before analyzing your own bill.',true);
  if(!lastDocumentId)return showStatus('Upload a bill first.',true);
  if(!$('consent').checked)return showStatus('Confirm AI-processing consent first.',true);
  $('analyzeBtn').disabled=true;$('result').hidden=true;showStatus('Analyzing your bill…');
  const userId=currentUser.id;const version=accountGeneration;
  try{
    const{data,error}=await supabase.functions.invoke('analyze-bill',{body:{document_id:lastDocumentId,consent:true}});
    if(!isCurrentAccount(version,userId))return;
    if(error)throw error;
    if(data?.code==='AI_NOT_CONFIGURED')throw new Error('AI analysis is not configured yet.');
    if(data?.code==='PAYMENT_REQUIRED')throw new Error('Payment is required before analyzing your own bill.');
    if(!data?.ok||!data?.result)throw new Error(data?.error||'Analysis failed.');
    renderAnalysis(data.result);
    showStatus('Analysis complete. Review your findings below.');
    $('result').scrollIntoView?.({behavior:'smooth',block:'start'});
  }catch(error){
    if(isCurrentAccount(version,userId))showStatus(error?.message||'Analysis is temporarily unavailable.',true);
  }finally{
    if(isCurrentAccount(version,userId))$('analyzeBtn').disabled=false;
  }
}
async function claimPaidAccess(){if(!currentUser)return false;planChecked=false;refreshPurchaseButton();const userId=currentUser.id;const version=accountGeneration;try{const{data,error}=await supabase.rpc('claim_billing_entitlement');if(!isCurrentAccount(version,userId))return false;if(error||typeof data?.plan!=='string'||typeof data?.status!=='string')throw new Error('Account check unavailable');planChecked=true;const plan=data?.plan||'free';const status=data?.status||'inactive';if((plan==='premium'||plan==='family')&&['active','trialing','past_due'].includes(status)){const name=plan==='family'?'Family':'Premium';activePaidPlan=true;try{localStorage.removeItem(purchasePreferenceKey);}catch{}refreshPurchaseButton();$('activePlan').textContent=`${name} · Active`;$('pricing').hidden=true;$('signedBox').classList.toggle('show',!!currentUser&&!recoveryMode);configureAccountLayout();showStatus(`${name} is active. Upload your bill to get started.`);return true;}}catch{}if(isCurrentAccount(version,userId)){activePaidPlan=false;$('activePlan').textContent='Payment required';$('signedBox').classList.remove('show');$('pricing').hidden=recoveryMode;configureAccountLayout();refreshPurchaseButton();if(currentUser&&!recoveryMode)showStatus('Choose Premium or Family to analyze your own bill.');}return false;}
function checkout(plan){if(!['premium','family'].includes(plan)||recoveryMode)return;location.href=`/checkout.html?plan=${plan}`;}
configureAccountLayout();
const accessFlow=createCheckoutAccess({supabase,publicKey:SUPABASE_PUBLISHABLE_KEY,endpoint:`${SUPABASE_URL}/functions/v1/billing-access`,claimPaidAccess});
const passwordAuth=createPasswordAuth({supabase,root:$('loginBox'),requirePasswordConfirmation:false,initialMode:'signin',redirectTo:`${location.origin}/start.html?access=ready`,onStatus:(message,kind)=>message?showStatus(message,kind==='error'):clearStatus(),onRecovery:()=>{recoveryMode=true;renderSession(currentUser);$('pricing').hidden=true;},onAuthenticated:async()=>{recoveryMode=false;$('pricing').hidden=false;await refreshSession();if(currentUser){if(accessFlow.hasCheckout())await accessFlow.onSignIn();else await claimPaidAccess();$('accountCard').scrollIntoView({behavior:'smooth',block:'start'});}}});

$('authForm').addEventListener('submit', async (event) => {
  if (passwordAuth.mode !== 'signup') return;
  event.preventDefault();
  if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
  if (passwordAuth.busy) return;

  const email = $('authEmail').value.trim();
  const password = $('authPassword').value;
  const strong = password.length >= 12 && password.length <= 128 &&
    /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password) &&
    /[!@#$%^&*()_+\-=\[\]{};'\\:"|<>?,.\/\`~]/.test(password);

  if (!/^\S+@\S+\.\S+$/.test(email)) return showStatus('Enter a valid email address.', true);
  if (!strong) return showStatus('Use at least 10 characters with at least one letter and one number.', true);

  passwordAuth.setBusy(true);
  showStatus('Creating your account…');
  try {
    const response = await fetch(SIGNUP_ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({email,password})
    });
    let payload = {};
    try { payload = await response.json(); } catch {}

    if (!response.ok) {
      const messages = {
        invalid_email: 'Enter a valid email address.',
        invalid_password: 'Use at least 10 characters with at least one letter and one number.',
        too_many_attempts: 'Too many attempts. Wait a little and try again.'
      };
      throw new Error(messages[payload?.error] || 'Could not create the account. Please try again.');
    }

    const {data,error} = await signInCompatibleLocal(email,password);
    if (error || !data?.session?.user?.id) {
      passwordAuth.setBusy(false);
      passwordAuth.setMode('signin');
      $('authEmail').value = email;
      showStatus('This email already has an account. Sign in with your existing password, or use Reset password.', true);
      return;
    }

    showStatus('Account ready. Loading your BillSavings account…');
    recoveryMode=false;
    await refreshSession();
    if(currentUser){
      if(accessFlow.hasCheckout()) await accessFlow.onSignIn();
      else await claimPaidAccess();
      $('accountCard').scrollIntoView({behavior:'smooth',block:'start'});
    }
  } catch (error) {
    showStatus(error?.message || 'Could not create the account. Please try again.', true);
  } finally {
    $('authPassword').value='';
    passwordAuth.setBusy(false);
  }
}, true);

$('signOutBtn').addEventListener('click',signOut);$('uploadBtn').addEventListener('click',uploadBill);$('analyzeBtn').addEventListener('click',analyzeBill);
$('premiumBtn').addEventListener('click',()=>checkout('premium'));$('familyBtn').addEventListener('click',()=>checkout('family'));$('continuePurchaseBtn').addEventListener('click',()=>{if(!currentUser||!planChecked||activePaidPlan||recoveryMode)return;const plan=rememberedPlan();if(plan)checkout(plan);else refreshPurchaseButton();});
let pageReady=false;supabase.auth.onAuthStateChange((_event,session)=>{passwordAuth.handleAuthEvent(_event,session);if(_event==='PASSWORD_RECOVERY')recoveryMode=true;if(_event==='SIGNED_OUT'){recoveryMode=false;accountViewRequested=false;accessFlow.reset();clearAccountView();renderSession(null);}if(pageReady&&session?.user&&_event==='SIGNED_IN'&&!passwordAuth.busy&&!recoveryMode){setTimeout(()=>{void refreshSession().then(()=>{if(currentUser)return accessFlow.hasCheckout()?accessFlow.onSignIn():claimPaidAccess();});},0);}});
await refreshSession();pageReady=true;
if(authReturnState.failed||sessionLoadFailed){accessFlow.reset();accountViewRequested=true;configureAccountLayout();if(authReturnState.failed)history.replaceState(null,'',`${location.pathname}${location.search}`);const message=authReturnState.expired?'This email link has expired or has already been used. Sign in with your password or request a new reset link.':'We could not complete sign-in. Sign in with your password or request a new reset link.';showStatus(message,true);}else if(recoveryMode){await passwordAuth.showRecovery();}else{await accessFlow.start();const paidAccess=currentUser&&!accessFlow.hasCheckout()?await claimPaidAccess():false;if(!paidAccess&&!accessFlow.hasCheckout()&&qs.get('access')!=='ready'&&!authReturnState.received){const requestedPlan=qs.get('plan');if(requestedPlan==='premium'||requestedPlan==='family')checkout(requestedPlan);}}
