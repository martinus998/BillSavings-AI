import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.116.0';
import {createCheckoutAccess} from './sandbox-checkout-access.js';
const url='https://bkyuyqicybqqifenhhux.supabase.co';
const publicKey='sb_publishable_o-RgVfTUjzfne4DC9QcGfQ_4QGg5CVr';
const testLink='https://buy.stripe.com/test_7sYbJ0fGb7Kk1YHbkt7ss00';
const supabase=createClient(url,publicKey);
const $=id=>document.getElementById(id);
let claiming=false;
async function claimPaidAccess(){
  if(claiming)return false;
  claiming=true;
  try{
    const {data:auth}=await supabase.auth.getSession();
    if(!auth.session){$('testResult').textContent='Open the secure email link, then return here to check your sandbox plan.';return false;}
    const {data,error}=await supabase.rpc('claim_sandbox_billing_entitlement');
    if(error||data?.sandbox!==true)throw new Error('Sandbox plan could not be checked.');
    const active=['premium','family'].includes(data.plan)&&['active','trialing','past_due'].includes(data.status);
    $('testResult').textContent=active?`Sandbox access verified: ${data.plan} · ${data.status}.\nSigned in as ${auth.session.user.email}.`:'Signed in. No active sandbox plan has been confirmed yet.';
    $('testResult').classList.toggle('success',active);
    return active;
  }catch(error){$('testResult').textContent=error.message;return false;}
  finally{claiming=false;}
}
const flow=createCheckoutAccess({supabase,endpoint:`${url}/functions/v1/sandbox-billing-access`,publicKey,claimPaidAccess});
supabase.auth.onAuthStateChange(event=>{
  if(event==='SIGNED_IN')setTimeout(()=>void flow.onSignIn(),0);
});
$('checkPlanBtn').addEventListener('click',()=>void claimPaidAccess());
$('startTestBtn').addEventListener('click',async()=>{
  $('startTestBtn').disabled=true;
  try{
    const {data}=await supabase.auth.getSession();
    if(data.session){
      const {error}=await supabase.auth.signOut({scope:'local'});
      if(error)throw error;
    }
    flow.reset();location.assign(testLink);
  }catch{$('testResult').textContent='Could not start a signed-out test. Please try again.';$('startTestBtn').disabled=false;}
});
$('startTestBtn').textContent='Start test checkout →';$('startTestBtn').disabled=false;
await flow.start();
if(!flow.hasCheckout())await claimPaidAccess();
