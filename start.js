import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

function renderSession(user) {
  currentUser = user || null;
  $('loginBox').classList.toggle('hidden', !!user);
  $('signedBox').classList.toggle('show', !!user);
  if (user) $('userEmail').textContent = user.email || 'your account';
}

async function refreshSession() {
  try {
    const { data } = await supabase.auth.getSession();
    renderSession(data?.session?.user || null);
  } catch (error) {
    renderSession(null);
    showStatus('Could not load the secure account session. Please refresh and try again.', true);
  }
}

async function signIn() {
  clearStatus();
  const email = $('email').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return showStatus('Enter a valid email address.', true);
  $('signInBtn').disabled = true;
  showStatus('Sending secure sign-in link…');
  try {
    const redirectTo = `${location.origin}/start.html${location.search || ''}`;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    if (error) throw error;
    showStatus('Check your email and open the secure sign-in link.');
  } catch (error) {
    showStatus(error?.message || 'Could not send the sign-in link.', true);
  } finally {
    $('signInBtn').disabled = false;
  }
}

async function signOut() {
  clearStatus();
  try {
    await supabase.auth.signOut();
  } finally {
    lastDocumentId = null;
    $('analyzeBtn').disabled = true;
    $('result').hidden = true;
    renderSession(null);
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

$('signInBtn').addEventListener('click', signIn);
$('signOutBtn').addEventListener('click', signOut);
$('uploadBtn').addEventListener('click', uploadBill);
$('analyzeBtn').addEventListener('click', analyzeBill);
$('freeBtn').addEventListener('click', () => {
  if (currentUser) showStatus('Free Preview is ready. Upload a supported bill on the left.');
  else showStatus('Sign in to use the Free Preview.');
});
$('premiumBtn').addEventListener('click', () => checkout('premium'));
$('familyBtn').addEventListener('click', () => checkout('family'));

supabase.auth.onAuthStateChange(async (_event, session) => {
  renderSession(session?.user || null);
  if (session?.user) await claimPaidAccess();
});
await refreshSession();

const qs = new URLSearchParams(location.search);
const checkoutState = qs.get('checkout');
if (checkoutState === 'success' || checkoutState === 'return') {
  if (currentUser) {
    showStatus('Payment received. Activating your plan…');
    let activated = await claimPaidAccess();
    if (!activated) {
      await new Promise(r => setTimeout(r, 1800));
      activated = await claimPaidAccess();
    }
    if (!activated) showStatus('Payment received. Your plan is being activated. Refresh in a moment if it is not visible yet.');
  } else {
    showStatus('Payment received. Sign in with the same email used at checkout to attach Premium or Family to your account.');
  }
} else {
  const requestedPlan = qs.get('plan');
  if (requestedPlan === 'premium' || requestedPlan === 'family') {
    checkout(requestedPlan);
  }
}
