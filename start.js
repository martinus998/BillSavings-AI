import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, initialAuthReturn } from './account-session.js';
import { createCheckoutAccess } from './checkout-access.js';
import { createAccountReturn, hasAccountReturn } from './account-return.js';
import { createPasswordAuth } from './password-auth.js';

const authReturnState = initialAuthReturn;
const accountReturn = hasAccountReturn();
let recoveryMode = initialAuthReturn.type === 'recovery';
const $ = id => document.getElementById(id);
let currentUser = null;
let lastDocumentId = null;
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

function configureAccountLayout() {
  const card = $('accountCard');
  if (card && $('start').firstElementChild !== card) $('start').insertBefore(card, $('pricing'));
  const title = $('pricing')?.querySelector('h2');
  const copy = $('pricing')?.querySelector('h2 + p');
  if (title) title.textContent = 'Choose your plan';
  if (copy) copy.textContent = 'Create your account and pay securely on one page. Return with your email and password.';
}

function renderSession(user) {
  currentUser = user || null;
  $('loginBox').classList.toggle('hidden', !!user);
  $('signedBox').classList.toggle('show', !!user && !recoveryMode);
  if (recoveryMode) $('loginBox').classList.remove('hidden');
  if (user) $('userEmail').textContent = user.email || 'your account';
}

async function refreshSession() {
  sessionLoadFailed = false;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data?.session) { renderSession(null); return; }
    const verified = await supabase.auth.getUser();
    if (verified.error) throw verified.error;
    renderSession(verified.data?.user || null);
  } catch (error) {
    sessionLoadFailed = true;
    renderSession(null);
    showStatus('Could not load the secure account session. Please refresh and try again.', true);
  }
}

async function signOut() {
  clearStatus();
  try {
    await supabase.auth.signOut({scope: 'local'});
  } finally {
    accessFlow.reset();
    lastDocumentId = null;
    $('analyzeBtn').disabled = true;
    $('result').hidden = true;
    recoveryMode = false; renderSession(null);
    $('pricing').hidden = false; $('activePlan').textContent = 'Free Preview';
    configureAccountLayout();
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
      const name = plan === 'family' ? 'Family' : 'Premium';
      $('activePlan').textContent = `${name} · Active`;
      $('pricing').hidden = true;
      showStatus(`${name} is active. Upload your bill to get started.`);
      return true;
    }
  } catch {}
  return false;
}

function checkout(plan) {
  if (!['premium', 'family'].includes(plan) || recoveryMode) return;
  // Account creation and the Stripe form share the same checkout page.
  location.href = `/checkout.html?plan=${plan}`;
}

configureAccountLayout();
const accessFlow = (accountReturn ? createAccountReturn : createCheckoutAccess)({
  supabase, publicKey: SUPABASE_PUBLISHABLE_KEY,
  endpoint: `${SUPABASE_URL}/functions/v1/${accountReturn ? 'account-checkout' : 'billing-access'}`,
  claimPaidAccess
});
const passwordAuth = createPasswordAuth({supabase, root: $('loginBox'),
  redirectTo: `${location.origin}/start.html?access=ready`,
  onStatus: (message, kind) => message ? showStatus(message, kind === 'error') : clearStatus(),
  onRecovery: () => { recoveryMode = true; renderSession(currentUser); $('pricing').hidden = true; },
  onAuthenticated: async () => {
    recoveryMode = false;
    await refreshSession();
    if (currentUser) {
      await accessFlow.onSignIn();
      if (!accessFlow.hasCheckout()) await claimPaidAccess();
      $('accountCard').scrollIntoView({behavior: 'smooth', block: 'start'});
    }
  }
});

$('signOutBtn').addEventListener('click', signOut);
$('uploadBtn').addEventListener('click', uploadBill);
$('analyzeBtn').addEventListener('click', analyzeBill);
$('freeBtn').addEventListener('click', () => {
  if (currentUser) showStatus('Free Preview is ready. Upload a supported bill below.');
  else {
    showStatus('Sign in or create your account to use Free Preview.');
    $('loginBox')?.closest('.card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});
$('premiumBtn').addEventListener('click', () => checkout('premium'));
$('familyBtn').addEventListener('click', () => checkout('family'));

let pageReady = false;
supabase.auth.onAuthStateChange((_event, session) => {
  passwordAuth.handleAuthEvent(_event, session);
  if (_event === 'PASSWORD_RECOVERY') recoveryMode = true;
  // Cross-tab SDK events do not establish this tab's identity.
  if (_event === 'SIGNED_OUT') renderSession(null);
  if (pageReady && session?.user && _event === 'SIGNED_IN' && !passwordAuth.busy && !recoveryMode) {
    setTimeout(() => { void refreshSession().then(() => {
      if (currentUser) return accessFlow.onSignIn();
    }); }, 0);
  }
});
await refreshSession();
pageReady = true;

const qs = new URLSearchParams(location.search);
if (authReturnState.failed || sessionLoadFailed) {
  accessFlow.reset();
  if (authReturnState.failed) history.replaceState(null, '', `${location.pathname}${location.search}`);
  const message = authReturnState.expired
    ? 'This email link has expired or has already been used. Sign in with your password or request a new reset link.'
    : 'We could not complete sign-in. Sign in with your password or request a new reset link.';
  showStatus(message, true);
} else if (recoveryMode) {
  await passwordAuth.showRecovery();
} else {
  await accessFlow.start();
  if (currentUser && !accessFlow.hasCheckout()) await claimPaidAccess();
  if (!accessFlow.hasCheckout() && qs.get('access') !== 'ready' && !authReturnState.received) {
    const requestedPlan = qs.get('plan');
    if (requestedPlan === 'premium' || requestedPlan === 'family') checkout(requestedPlan);
  }
}
