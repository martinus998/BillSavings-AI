import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://bkyuyqicybqqifenhhux.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_o-RgVfTUjzfne4DC9QcGfQ_4QGg5CVr';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
let lastUploadedDocumentId = null;

function addStyles() {
  if ($('#bs-auth-styles')) return;
  const s = document.createElement('style');
  s.id = 'bs-auth-styles';
  s.textContent = `
  .bs-modal{position:fixed;inset:0;z-index:99999;background:rgba(0,6,14,.78);backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;padding:18px}.bs-modal.show{display:flex}.bs-panel{width:min(560px,100%);max-height:90vh;overflow:auto;border:1px solid rgba(108,170,246,.30);border-radius:24px;padding:22px;background:linear-gradient(160deg,#071b35,#061324);box-shadow:0 30px 90px rgba(0,0,0,.55);color:#f4f8ff}.bs-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.bs-head h2{margin:0;font-size:25px}.bs-close{border:1px solid rgba(128,188,255,.25);background:#0b203b;color:#fff;width:38px;height:38px;border-radius:12px;font-size:20px;cursor:pointer}.bs-muted{color:#9fb8d4;font-size:13px;line-height:1.55}.bs-field{display:grid;gap:7px;margin:15px 0}.bs-field label{font-size:12px;font-weight:800;color:#cfe4fb}.bs-field input,.bs-field select{width:100%;padding:13px 14px;border-radius:13px;border:1px solid rgba(128,188,255,.25);background:#061427;color:#fff;outline:none}.bs-action{width:100%;padding:13px 16px;border:0;border-radius:13px;background:linear-gradient(135deg,#2f85ff,#3c6aff);color:#fff;font-weight:800;cursor:pointer}.bs-action:disabled{opacity:.55;cursor:not-allowed}.bs-secondary{background:#0b203b;border:1px solid rgba(128,188,255,.25);margin-top:10px}.bs-status{margin-top:13px;padding:11px 12px;border-radius:12px;background:rgba(49,208,255,.08);border:1px solid rgba(49,208,255,.18);font-size:12px;line-height:1.45;color:#cfe9ff}.bs-status.err{background:rgba(255,92,92,.08);border-color:rgba(255,92,92,.22);color:#ffd4d4}.bs-account{display:none}.bs-account.show{display:block}.bs-upload{display:none}.bs-upload.show{display:block}.bs-analysis{display:none}.bs-analysis.show{display:block}.bs-userline{margin:10px 0 4px;font-size:13px;color:#cfe4fb}.bs-chip{display:inline-block;padding:4px 8px;border-radius:999px;background:rgba(30,220,171,.12);color:#6bf1c9;font-size:10px;font-weight:900;letter-spacing:.5px}.bs-note{font-size:10px;color:#86a6c4;line-height:1.45;margin-top:9px}.bs-consent{display:flex;gap:9px;align-items:flex-start;margin:13px 0;padding:12px;border-radius:12px;border:1px solid rgba(128,188,255,.16);background:rgba(6,20,39,.55);font-size:11px;line-height:1.45;color:#b9cee3}.bs-consent input{margin-top:2px}.bs-result{display:grid;gap:10px;margin-top:14px}.bs-result-card{padding:13px;border:1px solid rgba(128,188,255,.18);border-radius:14px;background:#07182c}.bs-result-card strong{display:block;font-size:12px;margin-bottom:5px}.bs-result-card p{margin:0;color:#b6cbe0;font-size:12px;line-height:1.5}.bs-savings{font-size:22px;font-weight:900;color:#6bf1c9}.bs-finding{padding:11px 0;border-top:1px solid rgba(128,188,255,.12)}.bs-finding:first-child{border-top:0}.bs-finding b{font-size:12px}.bs-finding small{display:block;color:#9fb8d4;line-height:1.45;margin-top:4px}`;
  document.head.appendChild(s);
}

function buildModal() {
  if ($('#bsAuthModal')) return $('#bsAuthModal');
  const modal = document.createElement('div');
  modal.className = 'bs-modal';
  modal.id = 'bsAuthModal';
  modal.innerHTML = `
    <div class="bs-panel" role="dialog" aria-modal="true" aria-labelledby="bsTitle">
      <div class="bs-head"><div><div class="bs-chip">SECURE ACCOUNT</div><h2 id="bsTitle">BillSavings AI</h2><p class="bs-muted">Sign in with your email to securely upload, analyze and manage your own bills.</p></div><button class="bs-close" aria-label="Close">×</button></div>
      <div class="bs-login">
        <div class="bs-field"><label for="bsEmail">Email</label><input id="bsEmail" type="email" autocomplete="email" placeholder="you@example.com"></div>
        <button class="bs-action" id="bsMagic">Email me a secure sign-in link</button>
        <div class="bs-status" id="bsLoginStatus" hidden></div>
      </div>
      <div class="bs-account">
        <div class="bs-userline">Signed in as <strong id="bsUserEmail"></strong></div>
        <button class="bs-action" id="bsOpenUpload">Upload a bill securely</button>
        <button class="bs-action bs-secondary" id="bsSignOut">Sign out</button>
      </div>
      <div class="bs-upload">
        <div class="bs-field"><label for="bsCategory">Bill type</label><select id="bsCategory"><option value="general">General bill</option><option value="subscription">Subscription</option><option value="utility">Utility</option><option value="bank_fee">Bank fee</option><option value="insurance">Insurance</option><option value="medical" disabled>Medical bill — coming after health-data review</option></select></div>
        <div class="bs-field"><label for="bsFile">PDF or image · max 10 MB</label><input id="bsFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"></div>
        <button class="bs-action" id="bsUploadBtn">Upload securely</button>
        <button class="bs-action bs-secondary" id="bsBack">Back to account</button>
        <div class="bs-status" id="bsUploadStatus" hidden></div>
        <div class="bs-note">Files are stored in a private bucket. Access is restricted by account-level database policies so signed-in users can only access their own uploads.</div>
      </div>
      <div class="bs-analysis">
        <div class="bs-chip">AI BILL REVIEW</div>
        <h3 style="margin:10px 0 4px">Analyze this bill</h3>
        <p class="bs-muted">BillSavings AI will look for fees, recurring charges, billing issues and possible savings opportunities. Estimates are informational and not guaranteed.</p>
        <label class="bs-consent"><input id="bsAiConsent" type="checkbox"><span>I agree that this non-medical document may be securely sent to the AI processing provider for analysis. I understand medical bills are not supported yet.</span></label>
        <button class="bs-action" id="bsAnalyzeBtn">Analyze my bill</button>
        <button class="bs-action bs-secondary" id="bsAnalyzeLater">Analyze later</button>
        <div class="bs-status" id="bsAnalyzeStatus" hidden></div>
        <div class="bs-result" id="bsAnalysisResult" hidden></div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

function setStatus(el, text, isError = false) {
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle('err', isError);
}

function resetViews(modal) {
  $('.bs-account', modal).classList.remove('show');
  $('.bs-upload', modal).classList.remove('show');
  $('.bs-analysis', modal).classList.remove('show');
}

async function refreshUI(modal) {
  const { data: { user } } = await supabase.auth.getUser();
  const login = $('.bs-login', modal);
  resetViews(modal);
  if (user) {
    login.style.display = 'none';
    $('.bs-account', modal).classList.add('show');
    $('#bsUserEmail', modal).textContent = user.email || 'your account';
  } else {
    login.style.display = '';
  }
  return user;
}

function openModal(mode = 'account') {
  const modal = buildModal();
  modal.classList.add('show');
  refreshUI(modal).then(user => {
    if (mode === 'upload' && user) {
      resetViews(modal);
      $('.bs-upload', modal).classList.add('show');
    }
  });
}

function money(n, currency = 'USD') {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(Number(n || 0)); }
  catch { return `$${Number(n || 0).toFixed(2)}`; }
}

function renderAnalysis(modal, result) {
  const box = $('#bsAnalysisResult', modal);
  const low = Number(result?.potential_monthly_savings_low || 0);
  const high = Number(result?.potential_monthly_savings_high || 0);
  const currency = result?.currency || 'USD';
  const savingsText = high > 0 ? `${money(low, currency)}–${money(high, currency)} / month` : 'No supported monthly estimate found';
  const findings = Array.isArray(result?.findings) ? result.findings : [];
  box.innerHTML = `
    <div class="bs-result-card"><strong>Potential monthly savings</strong><div class="bs-savings">${savingsText}</div><p>Estimate only. Actual savings depend on provider terms, eligibility and action taken.</p></div>
    <div class="bs-result-card"><strong>AI summary</strong><p>${escapeHtml(result?.summary || 'Analysis completed.')}</p></div>
    ${result?.bill_provider || result?.bill_total ? `<div class="bs-result-card"><strong>Bill snapshot</strong><p>${result?.bill_provider ? `Provider: ${escapeHtml(result.bill_provider)}<br>` : ''}${result?.bill_total != null ? `Total: ${money(result.bill_total, currency)}<br>` : ''}${result?.due_date ? `Due date: ${escapeHtml(result.due_date)}` : ''}</p></div>` : ''}
    ${findings.length ? `<div class="bs-result-card"><strong>Findings</strong>${findings.map(f => `<div class="bs-finding"><b>${escapeHtml(f.title || 'Finding')}</b><small>${escapeHtml(f.explanation || '')}</small><small><strong>Next step:</strong> ${escapeHtml(f.action || '')}</small></div>`).join('')}</div>` : ''}`;
  box.hidden = false;
}

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function wireButtons() {
  const signIn = $$('.nav-actions .btn').find(el => /sign in/i.test(el.textContent || ''));
  if (signIn) {
    signIn.href = '#';
    signIn.addEventListener('click', e => { e.preventDefault(); openModal('account'); });
  }

  const primaryStart = $('.nav-actions .paidBtn');
  if (primaryStart) {
    primaryStart.textContent = 'Analyze My Bill →';
    document.addEventListener('click', e => {
      const target = e.target instanceof Element ? e.target.closest('.nav-actions .paidBtn') : null;
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      openModal('upload');
    }, true);
  }

  const uploadHero = $$('.cta .btn').find(el => /upload a bill/i.test(el.textContent || ''));
  if (uploadHero) {
    uploadHero.href = '#';
    uploadHero.addEventListener('click', e => { e.preventDefault(); openModal('upload'); });
  }

  const bannerStart = $$('.banner .btn').find(el => /get started today/i.test(el.textContent || ''));
  if (bannerStart) {
    bannerStart.textContent = 'Analyze My Bill →';
    bannerStart.href = '#';
    bannerStart.addEventListener('click', e => { e.preventDefault(); openModal('upload'); });
  }

  const freeBtn = $$('#pricing .plan .btn').find(el => /get started free/i.test(el.textContent || ''));
  if (freeBtn) {
    freeBtn.textContent = 'Analyze My Bill Free';
    freeBtn.href = '#';
    freeBtn.addEventListener('click', e => { e.preventDefault(); openModal('upload'); });
  }
}

function wireModal() {
  const modal = buildModal();
  $('.bs-close', modal).addEventListener('click', () => modal.classList.remove('show'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('show'); });

  $('#bsMagic', modal).addEventListener('click', async () => {
    const email = $('#bsEmail', modal).value.trim();
    const status = $('#bsLoginStatus', modal);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setStatus(status, 'Enter a valid email address.', true);
    setStatus(status, 'Sending secure sign-in link…');
    const redirectTo = `${location.origin}${location.pathname}`;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    if (error) return setStatus(status, error.message, true);
    setStatus(status, 'Check your email. Open the secure link to sign in.');
  });

  $('#bsSignOut', modal).addEventListener('click', async () => {
    await supabase.auth.signOut();
    await refreshUI(modal);
  });

  $('#bsOpenUpload', modal).addEventListener('click', () => {
    resetViews(modal);
    $('.bs-upload', modal).classList.add('show');
  });

  $('#bsBack', modal).addEventListener('click', () => {
    resetViews(modal);
    $('.bs-account', modal).classList.add('show');
  });

  $('#bsAnalyzeLater', modal).addEventListener('click', () => {
    resetViews(modal);
    $('.bs-account', modal).classList.add('show');
  });

  $('#bsUploadBtn', modal).addEventListener('click', async () => {
    const status = $('#bsUploadStatus', modal);
    const file = $('#bsFile', modal).files?.[0];
    const category = $('#bsCategory', modal).value;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setStatus(status, 'Please sign in first.', true);
    if (!file) return setStatus(status, 'Choose a PDF or image first.', true);
    const allowed = ['application/pdf','image/jpeg','image/png','image/webp'];
    if (!allowed.includes(file.type)) return setStatus(status, 'Unsupported file type.', true);
    if (file.size > 10 * 1024 * 1024) return setStatus(status, 'File is larger than 10 MB.', true);
    if (category === 'medical') return setStatus(status, 'Medical uploads are disabled until the health-data compliance review is complete.', true);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-100);
    const objectPath = `${user.id}/${crypto.randomUUID()}-${safeName}`;
    setStatus(status, 'Uploading to your private storage…');

    const { error: uploadError } = await supabase.storage.from('user-bills').upload(objectPath, file, { upsert: false, contentType: file.type });
    if (uploadError) return setStatus(status, uploadError.message, true);

    const { data: row, error: rowError } = await supabase.from('documents').insert({
      user_id: user.id,
      storage_path: objectPath,
      original_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      category,
      status: 'uploaded'
    }).select('id').single();

    if (rowError || !row?.id) {
      await supabase.storage.from('user-bills').remove([objectPath]);
      return setStatus(status, rowError?.message || 'Could not save upload record.', true);
    }

    lastUploadedDocumentId = row.id;
    $('#bsFile', modal).value = '';
    setStatus(status, 'Uploaded securely. Ready for AI review.');
    if (window.gtag) window.gtag('event', 'secure_bill_upload', { category });

    resetViews(modal);
    $('#bsAiConsent', modal).checked = false;
    $('#bsAnalysisResult', modal).hidden = true;
    $('#bsAnalyzeStatus', modal).hidden = true;
    $('.bs-analysis', modal).classList.add('show');
  });

  $('#bsAnalyzeBtn', modal).addEventListener('click', async () => {
    const status = $('#bsAnalyzeStatus', modal);
    const btn = $('#bsAnalyzeBtn', modal);
    if (!lastUploadedDocumentId) return setStatus(status, 'Upload a bill first.', true);
    if (!$('#bsAiConsent', modal).checked) return setStatus(status, 'Please confirm AI-processing consent first.', true);

    btn.disabled = true;
    setStatus(status, 'Analyzing your bill securely… This may take a moment.');
    $('#bsAnalysisResult', modal).hidden = true;

    const { data, error } = await supabase.functions.invoke('analyze-bill', {
      body: { document_id: lastUploadedDocumentId, consent: true }
    });

    btn.disabled = false;
    if (error) return setStatus(status, error.message || 'Analysis failed.', true);
    if (data?.code === 'AI_NOT_CONFIGURED') return setStatus(status, 'AI analysis is almost ready. The model connection still needs to be activated by the site owner.', true);
    if (!data?.ok || !data?.result) return setStatus(status, data?.error || 'Analysis failed.', true);

    setStatus(status, 'Analysis complete.');
    renderAnalysis(modal, data.result);
    if (window.gtag) window.gtag('event', 'bill_analysis_complete', { document_id: lastUploadedDocumentId });
  });

  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      lastUploadedDocumentId = null;
      refreshUI(modal);
      return;
    }

    if (event === 'SIGNED_IN') {
      const uploadInProgress = $('.bs-upload', modal).classList.contains('show');
      const analysisInProgress = $('.bs-analysis', modal).classList.contains('show');
      if (!uploadInProgress && !analysisInProgress) refreshUI(modal);
    }
  });
}

addStyles();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { wireButtons(); wireModal(); });
} else {
  wireButtons(); wireModal();
}

window.BILLSAVINGS_SUPABASE_READY = true;
