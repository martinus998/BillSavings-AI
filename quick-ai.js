import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://bkyuyqicybqqifenhhux.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_o-RgVfTUjzfne4DC9QcGfQ_4QGg5CVr';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const $ = (sel, root = document) => root.querySelector(sel);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'\"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[ch]));
}

function installStyles() {
  if ($('#bs-quick-ai-styles')) return;
  const style = document.createElement('style');
  style.id = 'bs-quick-ai-styles';
  style.textContent = `
    .quick-ai{margin:18px auto 26px;max-width:1180px;padding:0 20px}.quick-ai-card{border:1px solid rgba(95,167,255,.25);border-radius:22px;background:linear-gradient(145deg,rgba(8,29,54,.98),rgba(5,17,32,.98));box-shadow:0 22px 60px rgba(0,0,0,.30);padding:22px}.quick-ai-grid{display:grid;grid-template-columns:.85fr 1.15fr;gap:22px;align-items:start}.quick-ai-kicker{font-size:10px;font-weight:900;letter-spacing:1.7px;color:#59b7ff}.quick-ai h2{margin:7px 0 9px;font-size:28px;line-height:1.08}.quick-ai p{margin:0;color:#9fb8d4;line-height:1.55}.quick-ai-note{font-size:10px;margin-top:12px!important;color:#7f9dbb!important}.quick-ai-form{display:grid;gap:10px}.quick-ai textarea{min-height:150px;resize:vertical;width:100%;box-sizing:border-box;padding:14px;border-radius:14px;border:1px solid rgba(120,185,255,.24);background:#061427;color:#fff;outline:none;font:inherit;line-height:1.45}.quick-ai-consent{display:flex;gap:9px;align-items:flex-start;font-size:11px;color:#b7cbe0;line-height:1.45}.quick-ai button{border:0;border-radius:13px;padding:13px 16px;font-weight:900;cursor:pointer;background:linear-gradient(135deg,#2f85ff,#3c6aff);color:#fff}.quick-ai button:disabled{opacity:.55;cursor:not-allowed}.quick-ai-status{display:none;padding:11px 12px;border-radius:12px;border:1px solid rgba(73,198,255,.20);background:rgba(47,133,255,.08);font-size:12px;color:#cae6ff;line-height:1.45}.quick-ai-status.show{display:block}.quick-ai-status.err{border-color:rgba(255,92,92,.25);background:rgba(255,92,92,.08);color:#ffd5d5}.quick-ai-result{display:none;margin-top:12px;padding:15px;border-radius:14px;border:1px solid rgba(105,239,200,.18);background:rgba(10,36,50,.72);white-space:pre-wrap;color:#eaf4ff;line-height:1.55;font-size:13px}.quick-ai-result.show{display:block}.quick-ai-auth{font-size:11px;color:#88a9c9;margin-top:10px}.quick-ai-auth strong{color:#dcecff}.quick-ai-signin{display:inline-flex!important;width:auto!important;margin-top:10px;padding:10px 14px!important;font-size:12px!important}.quick-ai-auth-text{display:block}
    @media(max-width:760px){.quick-ai{padding:0 10px}.quick-ai-card{padding:16px}.quick-ai-grid{grid-template-columns:1fr}.quick-ai h2{font-size:22px}.quick-ai textarea{min-height:130px}.quick-ai-signin{width:100%!important}}
  `;
  document.head.appendChild(style);
}

function buildSection() {
  if ($('#quickAiSection')) return;
  const section = document.createElement('section');
  section.className = 'quick-ai';
  section.id = 'quickAiSection';
  section.innerHTML = `
    <div class="quick-ai-card">
      <div class="quick-ai-grid">
        <div>
          <div class="quick-ai-kicker">LIVE AI REVIEW</div>
          <h2>Describe a bill. Get a real AI savings review.</h2>
          <p>Paste the bill amount, provider, plan and any fees you see. BillSavings AI will look for realistic ways to reduce the cost and explain the next best action.</p>
          <p class="quick-ai-note">Do not paste account numbers, card numbers, SSNs, passwords or medical information. Savings are estimates, not guarantees.</p>
          <div class="quick-ai-auth" id="quickAiAuth"></div>
        </div>
        <div class="quick-ai-form">
          <textarea id="quickAiInput" maxlength="8000" placeholder="Example: My internet bill is $95/month with a $15 equipment fee. I have had the same plan for 3 years. What should I ask my provider to lower?"></textarea>
          <label class="quick-ai-consent"><input type="checkbox" id="quickAiConsent"><span>I confirm this is a non-medical bill and does not contain health information or highly sensitive identifiers.</span></label>
          <button id="quickAiButton">Analyze my bill with AI</button>
          <div class="quick-ai-status" id="quickAiStatus"></div>
          <div class="quick-ai-result" id="quickAiResult"></div>
        </div>
      </div>
    </div>`;

  const pricing = $('#pricing');
  if (pricing) pricing.parentNode.insertBefore(section, pricing);
  else document.body.appendChild(section);
}

function setStatus(text, isError = false) {
  const el = $('#quickAiStatus');
  el.textContent = text;
  el.classList.add('show');
  el.classList.toggle('err', isError);
}

function openSignIn() {
  const signIn = [...document.querySelectorAll('.nav-actions .btn')].find(el => /sign in/i.test(el.textContent || ''));
  if (signIn) {
    signIn.click();
    return;
  }
  setStatus('Sign-in is temporarily unavailable. Please refresh the page and try again.', true);
}

async function refreshAuthHint() {
  const el = $('#quickAiAuth');
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    el.innerHTML = `<span class="quick-ai-auth-text">Signed in as <strong>${escapeHtml(user.email || 'your account')}</strong>. Free quick-review limit: 5 per 24 hours.</span>`;
  } else {
    el.innerHTML = `<span class="quick-ai-auth-text">Sign in to run the live AI review.</span><button type="button" class="quick-ai-signin" id="quickAiSignIn">Sign In</button>`;
    $('#quickAiSignIn')?.addEventListener('click', openSignIn);
  }
}

async function analyze() {
  const button = $('#quickAiButton');
  const input = $('#quickAiInput');
  const consent = $('#quickAiConsent');
  const result = $('#quickAiResult');
  const message = input.value.trim();

  result.classList.remove('show');
  result.textContent = '';

  if (message.length < 8) return setStatus('Add a few more details about the bill.', true);
  if (!consent.checked) return setStatus('Confirm that this is a non-medical bill without sensitive identifiers.', true);

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return setStatus('Please sign in first using the Sign In button in this section.', true);

  button.disabled = true;
  setStatus('Analyzing your bill…');

  try {
    const { data, error } = await supabase.functions.invoke('quick-analyze', {
      body: { message, confirm_non_medical: true }
    });
    if (error) throw error;
    if (!data?.ok || !data?.answer) throw new Error(data?.error || 'AI analysis failed.');

    setStatus(`Analysis complete. ${typeof data.remaining_24h === 'number' ? `${data.remaining_24h} free quick reviews remaining in the next 24 hours.` : ''}`);
    result.textContent = data.answer;
    result.classList.add('show');

    if (window.gtag) {
      window.gtag('event', 'quick_ai_analysis_completed', { page_path: location.pathname });
    }
  } catch (error) {
    setStatus(error?.message || 'AI analysis is temporarily unavailable.', true);
  } finally {
    button.disabled = false;
  }
}

function wire() {
  $('#quickAiButton')?.addEventListener('click', analyze);
  supabase.auth.onAuthStateChange(() => refreshAuthHint());
  refreshAuthHint();

  const heroUpload = [...document.querySelectorAll('.cta .btn')].find(el => /upload a bill/i.test(el.textContent || ''));
  if (heroUpload) {
    const quickLink = document.createElement('a');
    quickLink.className = 'btn';
    quickLink.href = '#quickAiSection';
    quickLink.textContent = 'Try Live AI Review →';
    heroUpload.parentNode?.appendChild(quickLink);
  }
}

installStyles();
buildSection();
wire();
