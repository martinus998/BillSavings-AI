import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, initialAuthReturn } from './account-session.js';
import { createCheckoutAccess } from './checkout-access.js?v=20260917-password';
import { createPasswordAuth } from './password-auth.js';

const authReturnState = initialAuthReturn;
let recoveryMode = initialAuthReturn.type === 'recovery';
const $ = id => document.getElementById(id);
let currentUser = null;
let lastDocumentId = null;
let sessionLoadFailed = false;
let accountGeneration = 0;
let activePaidPlan = false;
let planChecked = false;
const purchasePreferenceKey = 'billsavings.purchase-plan';

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
  if (copy) copy.textContent = 'Choose a plan, set up your account, then pay securely with Stripe. Return with your email and password.';
}

function clearAccountView() {
  accountGeneration++;
  activePaidPlan = false;
  planChecked = false;
  lastDocumentId = null;
  $('activePlan').textContent = 'Free Preview';
  $('pricing').hidden = recoveryMode;
  $('result').hidden = true;
  $('result').textContent = '';
  $('file').value = '';
  $('category').value = 'general';
  $('consent').checked = false;
  $('analyzeBtn').disabled = true;
  $('uploadBtn').disabled = false;
  $('userEmail').textContent = '';
  $('continuePurchaseBtn').hidden = true;
  clearStatus();
}

function isCurrentAccount(version, userId) {
  return version === accountGeneration && currentUser?.id === userId;
}

function renderSession(user) {
  if (currentUser?.id !== user?.id) clearAccountView();
  currentUser = user || null;
  $('loginBox').classList.toggle('hidden', !!user);
  $('signedBox').classList.toggle('show', !!user && !recoveryMode);
  if (recoveryMode) $('loginBox').classList.remove('hidden');
  if (user) $('userEmail').textContent = user.email || 'your account';
  refreshPurchaseButton();
}

async function refreshSession() {
  sessionLoadFailed = false;
  const version = accountGeneration;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (version !== accountGeneration) return;
    if (error) throw error;
    if (!data?.session) { renderSession(null); return; }
    const verified = await supabase.auth.getUser();
    if (version !== accountGeneration) return;
    if (verified.error || !verified.data?.user?.id || !verified.data.user.email_confirmed_at || verified.data.user.is_anonymous) {
      throw new Error('A confirmed account is required.');
    }
    renderSession(verified.data.user);
  } catch (error) {
    if (version !== accountGeneration) return;
    sessionLoadFailed = true;
    renderSession(null);
    showStatus('Could not load the secure account session. Please refresh and try again.', true);
  }
}

async function signOut() {
  clearStatus();
  try {
    const result = await supabase.auth.signOut({scope: 'local'});
    if (result?.error) throw result.error;
    accessFlow.reset();
    recoveryMode = false;
    clearAccountView();
    renderSession(null);
    configureAccountLayout();
  } catch {
    showStatus('Could not sign out. Please try again.', true);
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
  const userId = currentUser.id;
  const version = accountGeneration;
  const objectPath = `${userId}/${crypto.randomUUID()}-${safeName}`;

  try {
    const { error: uploadError } = await supabase.storage.from('user-bills').upload(objectPath, file, { upsert: false, contentType: file.type });
    if (!isCurrentAccount(version, userId)) return;
    if (uploadError) throw uploadError;

    const { data: row, error: rowError } = await supabase.from('documents').insert({
      user_id: userId,
      storage_path: objectPath,
      original_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      category,
      status: 'uploaded'
    }).select('id').single();
    if (!isCurrentAccount(version, userId)) return;

    if (rowError || !row?.id) {
      await supabase.storage.from('user-bills').remove([objectPath]);
      throw rowError || new Error('Could not save the upload record.');
    }

    lastDocumentId = row.id;
    $('file').value = '';
    $('analyzeBtn').disabled = false;
    showStatus('Upload complete. You can now analyze the bill.');
  } catch (error) {
    if (isCurrentAccount(version, userId)) showStatus(error?.message || 'Upload failed.', true);
  } finally {
    if (isCurrentAccount(version, userId)) $('uploadBtn').disabled = false;
  }
}

async function analyzeBill() {
  clearStatus();
  if (!currentUser) return showStatus('Sign in first.', true);
  if (!lastDocumentId) return showStatus('Upload a bill first.', true);
  if (!$('consent').checked) return showStatus('Confirm AI-processing consent first.', true);

  $('analyzeBtn').disabled = true;
  $('result').hidden = true;
  showStatus('Analyzing your bill…');
  const userId = currentUser.id;
  const version = accountGeneration;
  try {
    const { data, error } = await supabase.functions.invoke('analyze-bill', { body: { document_id: lastDocumentId, consent: true } });
    if (!isCurrentAccount(version, userId)) return;
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
    if (isCurrentAccount(version, userId)) showStatus(error?.message || 'Analysis is temporarily unavailable.', true);
  } finally {
    if (isCurrentAccount(version, userId)) $('analyzeBtn').disabled = false;
  }
}

async function claimPaidAccess() {
  if (!currentUser) return false;
  planChecked = false;
  refreshPurchaseButton();
  const userId = currentUser.id;
  const version = accountGeneration;
  try {
    const { data, error } = await supabase.rpc('claim_billing_entitlement');
    if (!isCurrentAccount(version, userId)) return false;
    if (error || typeof data?.plan !== 'string' || typeof data?.status !== 'string') {
      throw new Error('Account check unavailable');
    }
    planChecked = true;
    const plan = data?.plan || 'free';
    const status = data?.status || 'inactive';
    if ((plan === 'premium' || plan === 'family') && ['active','trialing','past_due'].includes(status)) {
      const name = plan === 'family' ? 'Family' : 'Premium';
      activePaidPlan = true;
      try { localStorage.removeItem(purchasePreferenceKey); } catch {}
      refreshPurchaseButton();
      $('activePlan').textContent = `${name} · Active`;
      $('pricing').hidden = true;
      showStatus(`${name} is active. Upload your bill to get started.`);
      return true;
    }
  } catch {}
  if (isCurrentAccount(version, userId)) {
    activePaidPlan = false;
    $('activePlan').textContent = 'Free Preview';
    $('pricing').hidden = recoveryMode;
    refreshPurchaseButton();
  }
  return false;
}

function checkout(plan) {
  if (!['premium', 'family'].includes(plan) || recoveryMode) return;
  // The account step keeps credentials separate from Stripe's payment fields.
  location.href = `/checkout.html?plan=${plan}`;
}

configureAccountLayout();
const accessFlow = createCheckoutAccess({
  supabase, publicKey: SUPABASE_PUBLISHABLE_KEY,
  endpoint: `${SUPABASE_URL}/functions/v1/billing-access`,
  claimPaidAccess
});
const passwordAuth = createPasswordAuth({supabase, root: $('loginBox'),
  requirePasswordConfirmation: false,
  redirectTo: `${location.origin}/start.html?access=ready`,
  onStatus: (message, kind) => message ? showStatus(message, kind === 'error') : clearStatus(),
  onRecovery: () => { recoveryMode = true; renderSession(currentUser); $('pricing').hidden = true; },
  onAuthenticated: async () => {
    recoveryMode = false;
    $('pricing').hidden = false;
    await refreshSession();
    if (currentUser) {
      if (accessFlow.hasCheckout()) await accessFlow.onSignIn();
      else await claimPaidAccess();
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
$('continuePurchaseBtn').addEventListener('click', () => {
  if (!currentUser || !planChecked || activePaidPlan || recoveryMode) return;
  const plan = rememberedPlan();
  if (plan) checkout(plan);
  else refreshPurchaseButton();
});

let pageReady = false;
supabase.auth.onAuthStateChange((_event, session) => {
  passwordAuth.handleAuthEvent(_event, session);
  if (_event === 'PASSWORD_RECOVERY') recoveryMode = true;
  // Cross-tab SDK events do not establish this tab's identity.
  if (_event === 'SIGNED_OUT') {
    recoveryMode = false;
    accessFlow.reset();
    clearAccountView();
    renderSession(null);
  }
  if (pageReady && session?.user && _event === 'SIGNED_IN' && !passwordAuth.busy && !recoveryMode) {
    setTimeout(() => { void refreshSession().then(() => {
      if (currentUser) return accessFlow.hasCheckout() ? accessFlow.onSignIn() : claimPaidAccess();
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
  const paidAccess = currentUser && !accessFlow.hasCheckout() ? await claimPaidAccess() : false;
  if (!paidAccess && !accessFlow.hasCheckout() && qs.get('access') !== 'ready' && !authReturnState.received) {
    const requestedPlan = qs.get('plan');
    if (requestedPlan === 'premium' || requestedPlan === 'family') checkout(requestedPlan);
  }
}
