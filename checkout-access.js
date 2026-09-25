// Payment receipts do not grant login. Mailbox authentication and the existing
// signed-webhook/entitlement checks still protect the customer's bill data.
export function createCheckoutAccess({supabase, endpoint, publicKey, claimPaidAccess}) {
  const $ = id => document.getElementById(id);
  const key = 'billsavings.checkout-access';
  const qs = new URLSearchParams(location.search);
  const valid = value => /^cs_live_[A-Za-z0-9]{20,240}$/.test(value || '');
  let sessionId = qs.get('session_id') || '';
  let returned = ['success', 'return'].includes(qs.get('checkout')) || qs.get('access') === 'ready';
  let busy = false, timer, mailTimer, generation = 0, manual = false, signInPending = false, sent = false;
  try {
    if (valid(sessionId)) sessionStorage.setItem(key, JSON.stringify({id:sessionId,expires:Date.now()+86400000}));
    else { const saved=JSON.parse(sessionStorage.getItem(key)||'null'); if(saved?.expires>Date.now()&&valid(saved.id))sessionId=saved.id; }
  } catch {}
  if(!valid(sessionId))sessionId='';
  if(qs.has('session_id')){qs.delete('session_id');qs.delete('checkout');history.replaceState(null,'',`${location.pathname}${qs.size?'?'+qs:''}${location.hash}`);}
  const mail=document.createElement('button');mail.id='accessEmailBtn';mail.type='button';mail.className='btn';mail.hidden=true;mail.textContent='Email my secure access link';
  $('accessRetryBtn').insertAdjacentElement('afterend',mail);
  const planCopy=$('startCopy');
  if(planCopy){
    const alignCopy=()=>{if(planCopy.textContent==='Choose a plan, create your account, then pay securely. Your selected plan stays with your account.')planCopy.textContent='Choose your plan and go straight to Stripe. Activate or sign in to your account after payment.';};
    alignCopy();new MutationObserver(alignCopy).observe(planCopy,{childList:true,subtree:true,characterData:true});
  }
  function reset(){sessionId='';returned=false;generation++;signInPending=false;manual=false;clearTimeout(timer);clearTimeout(mailTimer);timer=mailTimer=null;try{sessionStorage.removeItem(key)}catch{}$('checkoutAccess').hidden=true;mail.hidden=true;}
  function panel(title,message,retryLabel='',delay=0){
    $('checkoutAccess').hidden=false;$('accessTitle').textContent=title;$('accessMessage').textContent=message;
    const retry=$('accessRetryBtn');retry.hidden=!retryLabel;retry.textContent=retryLabel||'Try again';retry.disabled=busy||delay>0;
    clearTimeout(timer);timer=null;const version=generation;
    if(delay>0)timer=setTimeout(()=>{timer=null;if(version===generation&&!busy)retry.disabled=false},delay*1000);
    if(!manual)$('loginBox').classList.add('hidden');mail.hidden=true;
  }
  function showPasswordForm(){manual=true;$('loginBox').classList.remove('hidden');$('accessManualBtn').hidden=false;$('accessManualBtn').textContent='Sign in with password';}
  function offerEmail(result,delay=0){
    sent=result.state==='sent'||sent;
    panel(sent?'Check your checkout email':'Payment confirmed — activate your account',sent
      ?'Open the secure link sent to your checkout email. It signs you in safely. You do not need to pay again. You can set a password later using the password reset option.'
      :'No account was needed before payment. Request a secure link to the email used on Stripe, or sign in with your existing password below. Do not make another payment.','Check my access',5);
    mail.hidden=!sessionId;mail.disabled=busy||delay>0;mail.textContent=sent?'Resend access email':'Email my secure access link';
    clearTimeout(mailTimer);mailTimer=null;
    if(delay>0){const version=generation;mailTimer=setTimeout(()=>{mailTimer=null;if(version===generation&&!busy)mail.disabled=false},delay*1000);}
    $('accessManualBtn').hidden=false;$('accessManualBtn').textContent='Already have a password? Sign in';
  }
  async function request(version,action='status',extra={}){
    const {data,error}=await supabase.auth.getSession();if(version!==generation)return null;if(error)throw new Error('Account temporarily unavailable');
    const headers={'content-type':'application/json',apikey:publicKey};if(data?.session?.access_token)headers.authorization='Bearer '+data.session.access_token;
    const response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({...(sessionId?{session_id:sessionId}:{}),action,...extra}),signal:AbortSignal.timeout(15000),referrerPolicy:'no-referrer'});
    const result=await response.json();if(!result?.state)throw new Error('Access temporarily unavailable');return {result,signedIn:!!data?.session?.access_token};
  }
  async function finish(result,version){
    if(result.state!=='account_ready'||result.account_matches!==true)return false;
    const active=await claimPaidAccess();if(version!==generation)return true;
    if(active){reset();return true;}
    panel('Checking your plan','Your email is verified. Your paid plan is still being synchronized. Check again shortly; do not pay again.','Check my plan',5);return true;
  }
  function settle(version){
    busy=false;if(version===generation){if(!timer)$('accessRetryBtn').disabled=false;if(!mailTimer)mail.disabled=false;}
    if(signInPending){signInPending=false;const v=generation;setTimeout(()=>{if(v===generation)void(sessionId||returned?run():claimPaidAccess())},0);}
  }
  async function run(){
    if(busy||(!sessionId&&!returned))return;busy=true;const version=generation;
    try{
      panel('Finishing your purchase','Confirming your payment and secure account access…');
      let response;
      for(let i=0;i<(sessionId?6:1);i++){
        response=await request(version,sessionId?'status':'confirm_email');if(version!==generation||!response)return;
        if(response.result.state!=='pending')break;if(i<5)await new Promise(resolve=>setTimeout(resolve,2000));
      }
      const result=response.result;if(await finish(result,version))return;
      if(result.state==='ready'||result.state==='sent')offerEmail(result);
      else if(result.state==='pending')panel('Waiting for payment confirmation','Stripe confirmation has not arrived yet. Check again shortly. If you paid, do not pay again.','Check payment again',5);
      else if(['expired','limit_reached','sign_in_required','verification_required'].includes(result.state)){
        panel('Access your paid account','Sign in with your checkout email and password, or use the password reset option to receive a secure email link. Contact support if needed. You do not need to pay again.','Check my plan',5);showPasswordForm();
      }else panel('Your payment needs another check','We could not confirm access yet. Retry or contact support. Do not pay again.','Check payment again',5);
    }catch{if(version===generation)panel('Connection interrupted','Retry or sign in with your checkout email and password. If you paid, do not pay again.','Try again',5);}
    finally{settle(version);}
  }
  mail.addEventListener('click',async()=>{
    if(busy||!sessionId||mail.disabled)return;busy=true;mail.disabled=true;const version=generation;
    try{
      const response=await request(version,'send_link',{resend:sent});if(version!==generation||!response)return;
      const result=response.result;if(await finish(result,version))return;
      if(result.state==='sent'){sent=true;offerEmail(result,result.retry_after||60);}
      else if(result.state==='cooldown'){offerEmail({state:sent?'sent':'ready'},result.retry_after||60);$('accessMessage').textContent='Wait briefly before requesting another email. Check your inbox and spam folder. Do not pay again.';}
      else panel('Email delivery needs another try','Your payment is not lost. Retry shortly, sign in with your checkout email, or contact support. Do not pay again.','Check my access',10);
    }catch{if(version===generation)panel('Email temporarily unavailable','Retry or contact support. Do not make another payment.','Try again',10);}
    finally{settle(version);}
  });
  $('accessRetryBtn').addEventListener('click',()=>run());
  $('accessManualBtn').addEventListener('click',()=>{showPasswordForm();$('authEmail').focus();});
  return {
    hasCheckout:()=>!!sessionId||returned,reset,
    async start(){
      if(qs.get('access')==='ready'){
        returned=true;
        try{const response=await request(generation,'confirm_email');if(response?.result.state==='account_ready'){reset();return;}await run();}
        catch{panel('Connection interrupted','Your purchase is saved. Check access again; do not pay again.','Check my access',5);}
        return;
      }
      if(!sessionId&&!returned)return;
      const card=$('checkoutAccess').closest('.card');if(card){$('start').insertBefore(card,$('pricing'));card.scrollIntoView?.({behavior:'smooth',block:'start'});}
      if(!sessionId){panel('Access your paid account','Sign in using your checkout email, or use the password reset option to receive a secure link. You do not need to pay again.');showPasswordForm();return;}
      await run();
    },
    async onSignIn(){if(busy){signInPending=true;return;}if(sessionId||returned)await run();else{const version=generation;const active=await claimPaidAccess();if(version===generation&&active)reset();}}
  };
}
