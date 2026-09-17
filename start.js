import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createCheckoutAccess } from './checkout-access.js';

// Capture only callback state before the SDK consumes and clears the fragment.
const authReturnState = (() => {
  const params = new URLSearchParams(location.hash.slice(1));
  const failed = params.has('error') || params.has('error_code');
  return {
    failed,
    expired: params.get('error_code') === 'otp_expired',
    received: failed || params.has('access_token') || params.has('refresh_token') ||
      new URLSearchParams(location.search).get('access') === 'ready'
  };
})();

const SUPABASE_URL = 'https://bkyuyqicybqqifenhhux.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_o-RgVfTUjzfne4DC9QcGfQ_4QGg5CVr';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const CHECKOUT_ENDPOINT = `${SUPABASE_URL}/functions/v1/billsavings-checkout`;
const HOSTED_FALLBACK = {
  premium: 'https://buy.stripe.com/fZu6oG9lE65B2Pa9oi1sQ01',
  family: 'https://buy.stripe.com/eVqbJ055o65B3Te8ke1sQ02'
};

const $ = id => document.getElementById(id);
let currentUser = null;
let lastDocumentId = null;
let checkoutStarting = false;
let sessionLoadFailed = false;

function showStatus(text, isError = false) {
  const el = $('status');
  el.textContent = text;
  el.classList.add('show');
  el.classList.toggle('err', isError);
}

function clearStatus() {
  const el = $('status');
  el.textContent = '';
  el.classList.remove('show', 'err');
}

function configurePurchaseFirstLayout() {
  const pricing = $('pricing');
  const accountCard = $('loginBox')?.closest('.card');
  const grid = $('start');

  if (pricing && accountCard && grid && pricing.nextElementSibling !== accountCard) {
    grid.insertBefore(pricing, accountCard);
  }

  const pricingTitle = pricing?.querySelector('h2');
  const pricingCopy = pricing?.querySelector('h2 + p');
  if (pricingTitle) pricingTitle.textContent = 'Choose your plan';
  if (pricingCopy) pricingCopy.textContent = 'Choose Premium or Family and continue directly to secure payment. You do not need to sign in before buying.';

  if ($('premiumBtn')) $('premiumBtn').textContent = 'Choose Premium →';
  if ($('familyBtn')) $('familyBtn').textContent = 'Choose Family →';

  const loginTitle = $('loginBox')?.querySelector('h2');
  const loginCopy = $('loginBox')?.querySelector('h2 + p');
  if (loginTitle) loginTitle.textContent = 'Already purchased or returning?';
  if (loginCopy) loginCopy.textContent = 'Sign in here to access a plan you already bought, or to use the Free Preview. Buying Premium or Family does not require signing in first.';
  if ($('signInBtn')) $('signInBtn').textContent = 'Send secure access link';
}

function renderSession(user) {
  currentUser = user || null;
  $('loginBox').classList.toggle('hidden', !!user);
  $('signedBox').classList.toggle('show', !!user);
  if (user) $('userEmail').textContent = user.email || 'your account';
}

async function refreshSession() {
  sessionLoadFailed = false;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    renderSession(data?.session?.user || null);
  } catch (error) {
    sessionLoadFailed = true;
    renderSession(null);
    showStatus('Could not load the secure account session. Please refresh and try again.', true);
  }
}

async function signIn() {
  clearStatus();
  const email = $('email').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return showStatus('Enter a valid email address.', true);
  $('signInBtn').disabled = true;
  showStatus('Sending your secure access link…');
  try {
    const redirectTo = `${location.origin}/start.html?access=ready`;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    if (error) throw error;
    showStatus('Check your inbox for the secure access link. If you just paid, use the same email address you entered at checkout.');
  } catch (error) {
    showStatus(error?.message || 'Could not send the access link.', true);
  } finally {
    $('signInBtn').disabled = false;
  }
}

async function signOut() {
  clearStatus();
  try {
    await supabase.auth.signOut();
  } finally {
    accessFlow.reset();
    lastDocumentId = null;
    $('analyzeBtn').disabled = true;
    $('result').hidden = true;
    renderSession(null);
    configurePurchaseFirstLayout();
  }
}

async function uploadBill() {
  clearStatus();
  if (!currentUser) return showStatus('Sign in first.', true);
  const file = $('file').files?.[0];
  const category = $('category').value;
  if (!file) return showStatus('Choose a PDF or image first.', true);
  const allowed = ['application/pdf','image/jpeg','image/png','image/webp'];
  if (!allowed.includes(file.type)) return showStatus('Unsupported file type.', true);
  if (file.size > 10 * 1024 * 1024) return showStatus('File is larger than 10 MB.', true);

  $('uploadBtn').disabled = true;
  showStatus('Uploading securely…');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-100);
  const objectPath = `${currentUser.id}/${crypto.randomUUID()}-${safeName}`;

  try {
    const { error: uploadError } = await supabase.storage.from('user-bills').upload(objectPath, file, { upsert: false, contentType: file.type });
    if (uploadError) throw uploadError;

    const { data: row, error: rowError } = await supabase.from('documents').insert({
      user_id: currentUser.id,
      storage_path: objectPath,
      original_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      category,
      status: 'uploaded'
    }).select('id').single();

    if (rowError || !row?.id) {
      await supabase.storage.from('user-bills').remove([objectPath]);
      throw rowError || new Error('Could not save the upload record.');
    }

    lastDocumentId = row.id;
    $('file').value = '';
    $('analyzeBtn').disabled = false;
    showStatus('Upload complete. You can now analyze the bill.');
  } catch (error) {
    showStatus(error?.message || 'Upload failed.', true);
  } finally {
    $('uploadBtn').disabled = false;
  }
}

async function analyzeBill() {
  clearStatus();
  if (!lastDocumentId) return showStatus('Upload a bill first.', true);
  if (!$('consent').checked) return showStatus('Confirm AI-processing consent first.', true);

  $('analyzeBtn').disabled = true;
  $('result').hidden = true;
  showStatus('Analyzing your bill…');
  try {
    const { data, error } = await supabase.functions.invoke('analyze-bill', { body: { document_id: lastDocumentId, consent: true } });
    if (error) throw error;
    if (data?.code === 'AI_NOT_CONFIGURED') throw new Error('AI analysis is not configured yet.');
    if (!data?.ok || !data?.result) throw new Error(data?.error || 'Analysis failed.');

    const r = data.result;
    const findings = Array.isArray(r.findings) ? r.findings : [];
    const low = Number(r.potential_monthly_savings_low || 0);
    const high = Number(r.potential_monthly_savings_high || 0);
    let text = `${r.summary || 'Analysis complete.'}`;
    if (high > 0) text += `\n\nPotential monthly savings: $${low.toFixed(2)}–$${high.toFixed(2)}`;
    if (findings.length) text += '\n\n' + findings.map((f, i) => `${i + 1}. ${f.title || 'Finding'}\n${f.explanation || ''}\nNext step: ${f.action || ''}`).join('\n\n');
    $('result').textContent = text;
    $('result').hidden = false;
    showStatus('Analysis complete.');
  } catch (error) {
    showStatus(error?.message || 'Analysis is temporarily unavailable.', true);
  } finally {
    $('analyzeBtn').disabled = false;
  }
}

async function claimPaidAccess() {
  if (!currentUser) return false;
  try {
    const { data, error } = await supabase.rpc('claim_billing_entitlement');
    if (error) throw error;
    const plan = data?.plan || 'free';
    const status = data?.status || 'inactive';
    if ((plan === 'premium' || plan === 'family') && ['active','trialing','past_due'].includes(status)) {
      showStatus(`${plan === 'family' ? 'Family' : 'Premium'} is active on your account.`);
      return true;
    }
  } catch {}
  return false;
}

async function checkout(plan) {
  if (checkoutStarting) return;
  if (!HOSTED_FALLBACK[plan]) return;
  checkoutStarting = true;
  clearStatus();
  $('premiumBtn').disabled = true;
  $('familyBtn').disabled = true;
  showStatus(`Opening secure ${plan === 'family' ? 'Family' : 'Premium'} checkout…`);

  try {
    const response = await fetch(CHECKOUT_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plan })
    });
    const data = await response.json().catch(() => ({}));
    const checkoutUrl = data?.checkout_url || data?.fallback_url || HOSTED_FALLBACK[plan];
    if (!checkoutUrl) throw new Error('Checkout is unavailable.');
    location.href = checkoutUrl;
  } catch (error) {
    location.href = HOSTED_FALLBACK[plan];
  }
}

configurePurchaseFirstLayout();
const accessFlow = createCheckoutAccess({supabase, publicKey: SUPABASE_PUBLISHABLE_KEY,
  endpoint: `${SUPABASE_URL}/functions/v1/billing-access`, claimPaidAccess});

$('signInBtn').addEventListener('click', signIn);
$('signOutBtn').addEventListener('click', signOut);
$('uploadBtn').addEventListener('click', uploadBill);
$('analyzeBtn').addEventListener('click', analyzeBill);
$('freeBtn').addEventListener('click', () => {
  if (currentUser) showStatus('Free Preview is ready. Upload a supported bill below.');
  else {
    showStatus('Free Preview requires a secure sign-in. Paid plans can be purchased first without signing in.');
    $('loginBox')?.closest('.card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});
$('premiumBtn').addEventListener('click', () => checkout('premium'));
$('familyBtn').addEventListener('click', () => checkout('family'));

let pageReady = false;
supabase.auth.onAuthStateChange((_event, session) => {
  renderSession(session?.user || null);
  // Supabase holds an auth lock during this callback. RPCs run after it exits.
  if (pageReady && session?.user && _event === 'SIGNED_IN') {
    setTimeout(() => { void accessFlow.onSignIn(); }, 0);
  }
});
await refreshSession();
pageReady = true;

const qs = new URLSearchParams(location.search);
if (authReturnState.failed || sessionLoadFailed) {
  accessFlow.reset();
  if (authReturnState.failed) {
    // The SDK has finished. Remove error details without showing untrusted text.
    history.replaceState(null, '', `${location.pathname}${location.search}`);
  }
  const message = authReturnState.expired
    ? 'This sign-in link has expired or has already been used. Request a new secure link below.'
    : authReturnState.received
      ? 'We could not complete sign-in. Request a new secure link below.'
      : 'Could not load the secure account session. Please refresh and try again.';
  showStatus(message, true);
} else {
  await accessFlow.start();
  if (currentUser && !accessFlow.hasCheckout()) await claimPaidAccess();
  if (accessFlow.hasCheckout() || qs.get('access') === 'ready' || authReturnState.received) {
    // A return flag alone never confirms payment or unlocks paid functionality.
  } else {
    const requestedPlan = qs.get('plan');
    if (requestedPlan === 'premium' || requestedPlan === 'family') {
      checkout(requestedPlan);
    }
  }
}
