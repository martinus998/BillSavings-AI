import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://bkyuyqicybqqifenhhux.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_o-RgVfTUjzfne4DC9QcGfQ_4QGg5CVr';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
let lastUploadedDocumentId = null;
let requestedMode = 'account';

function addStyles() {
  if ($('#bs-auth-styles')) return;
  const s = document.createElement('style');
  s.id = 'bs-auth-styles';
  s.textContent = `
    .bs-inline{display:none;margin:16px 0;border:1px solid rgba(108,170,246,.25);border-radius:22px;background:#061426;color:#f4f8ff;box-shadow:none;overflow:hidden}
    .bs-inline.show{display:block}
    .bs-panel{padding:20px;max-width:760px;margin:0 auto}
    .bs-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
    .bs-head h2{margin:4px 0 6px;font-size:24px}
    .bs-close{border:1px solid rgba(128,188,255,.22);background:#0b203b;color:#fff;min-width:42px;height:42px;border-radius:12px;font-size:20px;cursor:pointer;touch-action:manipulation}
    .bs-muted{color:#9fb8d4;font-size:13px;line-height:1.55}
    .bs-field{display:grid;gap:7px;margin:15px 0}
    .bs-field label{font-size:12px;font-weight:800;color:#cfe4fb}
    .bs-field input,.bs-field select{box-sizing:border-box;width:100%;padding:13px 14px;border-radius:13px;border:1px solid rgba(128,188,255,.25);background:#061427;color:#fff;outline:none;font-size:16px}
    .bs-action{width:100%;padding:13px 16px;border:0;border-radius:13px;background:#2f85ff;color:#fff;font-weight:800;cursor:pointer;touch-action:manipulation}
    .bs-action:disabled{opacity:.55;cursor:not-allowed}
    .bs-secondary{background:#0b203b;border:1px solid rgba(128,188,255,.25);margin-top:10px}
    .bs-status{margin-top:13px;padding:11px 12px;border-radius:12px;background:#0a2844;border:1px solid rgba(49,208,255,.18);font-size:12px;line-height:1.45;color:#cfe9ff}
    .bs-status.err{background:#33151c;border-color:rgba(255,92,92,.22);color:#ffd4d4}
    .bs-account,.bs-upload,.bs-analysis{display:none}
    .bs-account.show,.bs-upload.show,.bs-analysis.show{display:block}
    .bs-userline{margin:10px 0 12px;font-size:13px;color:#cfe4fb}
    .bs-chip{display:inline-block;padding:4px 8px;border-radius:999px;background:#0c3a36;color:#6bf1c9;font-size:10px;font-weight:900;letter-spacing:.5px}
    .bs-note{font-size:10px;color:#86a6c4;line-height:1.45;margin-top:9px}
    .bs-consent{display:flex;gap:9px;align-items:flex-start;margin:13px 0;padding:12px;border-radius:12px;border:1px solid rgba(128,188,255,.16);background:#07182c;font-size:11px;line-height:1.45;color:#b9cee3}
    .bs-consent input{margin-top:2px}
    .bs-result{display:grid;gap:10px;margin-top:14px}
    .bs-result-card{padding:13px;border:1px solid rgba(128,188,255,.18);border-radius:14px;background:#07182c}
    .bs-result-card strong{display:block;font-size:12px;margin-bottom:5px}
    .bs-result-card p{margin:0;color:#b6cbe0;font-size:12px;line-height:1.5}
    .bs-savings{font-size:22px;font-weight:900;color:#6bf1c9}
    .bs-finding{padding:11px 0;border-top:1px solid rgba(128,188,255,.12)}
    .bs-finding:first-child{border-top:0}
    .bs-finding b{font-size:12px}
    .bs-finding small{display:block;color:#9fb8d4;line-height:1.45;margin-top:4px}
    @media(max-width:760px){.bs-inline{margin:10px 0;border-radius:16px}.bs-panel{padding:14px}.bs-head h2{font-size:21px}.bs-muted{font-size:12px}}
  `;
  document.head.appendChild(s);
}

function buildPanel() {
  if ($('#bsAccountPanel')) return $('#bsAccountPanel');
  const panel = document.createElement('section');
  panel.className = 'bs-inline';
  panel.id = 'bsAccountPanel';
  panel.setAttribute('aria-label', 'BillSavings account and bill upload');
  panel.innerHTML = `
    <div class="bs-panel">
      <div class="bs-head">
        <div><div class="bs-chip">SECURE ACCOUNT</div><h2>BillSavings AI</h2><p class="bs-muted">Sign in with your email to securely upload and analyze your bill.</p></div>
        <button class="bs-close" type="button" aria-label="Close account panel">×</button>
      </div>
      <div class="bs-login">
        <div class="bs-field"><label for="bsEmail">Email</label><input id="bsEmail" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com"></div>
        <button class="bs-action" type="button" id="bsMagic">Email me a secure sign-in link</button>
        <div class="bs-status" id="bsLoginStatus" hidden></div>
      </div>
      <div class="bs-account">
        <div class="bs-userline">Signed in as <strong id="bsUserEmail"></strong></div>
        <button class="bs-action" type="button" id="bsOpenUpload">Upload a bill securely</button>
        <button class="bs-action bs-secondary" type="button" id="bsSignOut">Sign out</button>
      </div>
      <div class="bs-upload">
        <div class="bs-field"><label for="bsCategory">Bill type</label><select id="bsCategory"><option value="general">General bill</option><option value="subscription">Subscription</option><option value="utility">Utility</option><option value="bank_fee">Bank fee</option><option value="insurance">Insurance</option><option value="medical" disabled>Medical bill — coming later</option></select></div>
        <div class="bs-field"><label for="bsFile">PDF or image · max 10 MB</label><input id="bsFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"></div>
        <button class="bs-action" type="button" id="bsUploadBtn">Upload securely</button>
        <button class="bs-action bs-secondary" type="button" id="bsBack">Back to account</button>
        <div class="bs-status" id="bsUploadStatus" hidden></div>
        <div class="bs-note">Files are stored in private account storage. Medical documents are not supported yet.</div>
      </div>
      <div class="bs-analysis">
        <div class="bs-chip">AI BILL REVIEW</div>
        <h3 style="margin:10px 0 4px">Analyze this bill</h3>
        <p class="bs-muted">BillSavings AI looks for recurring charges, fees, billing issues and possible savings opportunities.</p>
        <label class="bs-consent"><input id="bsAiConsent" type="checkbox"><span>I agree that this non-medical document may be securely sent to the AI processing provider for analysis.</span></label>
        <button class="bs-action" type="button" id="bsAnalyzeBtn">Analyze my bill</button>
        <button class="bs-action bs-secondary" type="button" id="bsAnalyzeLater">Analyze later</button>
        <div class="bs-status" id="bsAnalyzeStatus" hidden></div>
        <div class="bs-result" id="bsAnalysisResult" hidden></div>
      </div>
    </div>`;

  const wrap = $('.wrap') || document.body;
  const pricing = $('#pricing', wrap);
  if (pricing) wrap.insertBefore(panel, pricing);
  else wrap.appendChild(panel);
  return panel;
}

function setStatus(el, text, isError = false) {
  if (!el) return;
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle('err', isError);
}

function resetViews(panel) {
  $('.bs-account', panel)?.classList.remove('show');
  $('.bs-upload', panel)?.classList.remove('show');
  $('.bs-analysis', panel)?.classList.remove('show');
}

async function getSignedInUser() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user || null;
  } catch {
    return null;
  }
}

async function refreshUI(panel) {
  const login = $('.bs-login', panel);
  resetViews(panel);
  const user = await getSignedInUser();
  if (user) {
    login.style.display = 'none';
    $('#bsUserEmail', panel).textContent = user.email || 'your account';
    if (requestedMode === 'upload') $('.bs-upload', panel).classList.add('show');
    else $('.bs-account', panel).classList.add('show');
  } else {
    login.style.display = '';
  }
  return user;
}

function showPanel(mode = 'account') {
  requestedMode = mode;
  const panel = buildPanel();
  panel.classList.add('show');
  panel.scrollIntoView({ behavior: 'auto', block: 'start' });
  refreshUI(panel);
}

function hidePanel() {
  const panel = $('#bsAccountPanel');
  if (panel) panel.classList.remove('show');
}

function money(n, currency = 'USD') {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(Number(n || 0)); }
  catch { return `$${Number(n || 0).toFixed(2)}`; }
}

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function renderAnalysis(panel, result) {
  const box = $('#bsAnalysisResult', panel);
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

function wireButtons() {
  const signIn = $$('.nav-actions .btn').find(el => /sign in/i.test(el.textContent || ''));
  if (signIn) {
    signIn.href = '#bsAccountPanel';
    signIn.addEventListener('click', e => { e.preventDefault(); showPanel('account'); });
  }

  const uploadHero = $$('.cta .btn').find(el => /upload a bill/i.test(el.textContent || ''));
  if (uploadHero) {
    uploadHero.href = '#bsAccountPanel';
    uploadHero.addEventListener('click', e => { e.preventDefault(); showPanel('upload'); });
  }

  const bannerStart = $$('.banner .btn').find(el => /get started today|analyze my bill/i.test(el.textContent || ''));
  if (bannerStart) {
    bannerStart.textContent = 'Analyze My Bill →';
    bannerStart.href = '#bsAccountPanel';
    bannerStart.addEventListener('click', e => { e.preventDefault(); showPanel('upload'); });
  }

  const freeBtn = $$('#pricing .plan .btn').find(el => /get started free|analyze my bill free/i.test(el.textContent || ''));
  if (freeBtn) {
    freeBtn.textContent = 'Analyze My Bill Free';
    freeBtn.href = '#bsAccountPanel';
    freeBtn.addEventListener('click', e => { e.preventDefault(); showPanel('upload'); });
  }

  $$('.paidBtn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      showPanel('upload');
    });
  });
}

function wirePanel() {
  const panel = buildPanel();
  $('.bs-close', panel).addEventListener('click', hidePanel);

  $('#bsMagic', panel).addEventListener('click', async () => {
    const email = $('#bsEmail', panel).value.trim();
    const status = $('#bsLoginStatus', panel);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setStatus(status, 'Enter a valid email address.', true);
    setStatus(status, 'Sending secure sign-in link…');
    const redirectTo = `${location.origin}${location.pathname}`;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    if (error) return setStatus(status, error.message, true);
    setStatus(status, 'Check your email and open the secure sign-in link.');
  });

  $('#bsSignOut', panel).addEventListener('click', async () => {
    await supabase.auth.signOut();
    requestedMode = 'account';
    await refreshUI(panel);
  });

  $('#bsOpenUpload', panel).addEventListener('click', () => {
    requestedMode = 'upload';
    resetViews(panel);
    $('.bs-upload', panel).classList.add('show');
  });

  $('#bsBack', panel).addEventListener('click', () => {
    requestedMode = 'account';
    resetViews(panel);
    $('.bs-account', panel).classList.add('show');
  });

  $('#bsAnalyzeLater', panel).addEventListener('click', () => {
    requestedMode = 'account';
    resetViews(panel);
    $('.bs-account', panel).classList.add('show');
  });

  $('#bsUploadBtn', panel).addEventListener('click', async () => {
    const status = $('#bsUploadStatus', panel);
    const file = $('#bsFile', panel).files?.[0];
    const category = $('#bsCategory', panel).value;
    const user = await getSignedInUser();
    if (!user) return setStatus(status, 'Please sign in first.', true);
    if (!file) return setStatus(status, 'Choose a PDF or image first.', true);
    const allowed = ['application/pdf','image/jpeg','image/png','image/webp'];
    if (!allowed.includes(file.type)) return setStatus(status, 'Unsupported file type.', true);
    if (file.size > 10 * 1024 * 1024) return setStatus(status, 'File is larger than 10 MB.', true);
    if (category === 'medical') return setStatus(status, 'Medical uploads are disabled for now.', true);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-100);
    const objectPath = `${user.id}/${crypto.randomUUID()}-${safeName}`;
    setStatus(status, 'Uploading securely…');

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
    $('#bsFile', panel).value = '';
    setStatus(status, 'Uploaded securely. Ready for AI review.');
    if (window.gtag) window.gtag('event', 'secure_bill_upload', { category });

    resetViews(panel);
    $('#bsAiConsent', panel).checked = false;
    $('#bsAnalysisResult', panel).hidden = true;
    $('#bsAnalyzeStatus', panel).hidden = true;
    $('.bs-analysis', panel).classList.add('show');
  });

  $('#bsAnalyzeBtn', panel).addEventListener('click', async () => {
    const status = $('#bsAnalyzeStatus', panel);
    const btn = $('#bsAnalyzeBtn', panel);
    if (!lastUploadedDocumentId) return setStatus(status, 'Upload a bill first.', true);
    if (!$('#bsAiConsent', panel).checked) return setStatus(status, 'Please confirm AI-processing consent first.', true);

    btn.disabled = true;
    setStatus(status, 'Analyzing your bill securely…');
    $('#bsAnalysisResult', panel).hidden = true;

    const { data, error } = await supabase.functions.invoke('analyze-bill', {
      body: { document_id: lastUploadedDocumentId, consent: true }
    });

    btn.disabled = false;
    if (error) return setStatus(status, error.message || 'Analysis failed.', true);
    if (data?.code === 'AI_NOT_CONFIGURED') return setStatus(status, 'AI analysis connection still needs to be activated.', true);
    if (!data?.ok || !data?.result) return setStatus(status, data?.error || 'Analysis failed.', true);

    setStatus(status, 'Analysis complete.');
    renderAnalysis(panel, data.result);
    if (window.gtag) window.gtag('event', 'bill_analysis_complete', { document_id: lastUploadedDocumentId });
  });

  supabase.auth.onAuthStateChange(() => refreshUI(panel));
}

addStyles();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { wireButtons(); wirePanel(); });
} else {
  wireButtons();
  wirePanel();
}

window.BILLSAVINGS_SUPABASE_READY = true;
