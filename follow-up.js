import { supabase } from './account-session.js';

const result = document.getElementById('result');
const categoryEl = document.getElementById('category');
if (!result || !categoryEl) {
  // This module is only meaningful on the signed-in bill analysis page.
} else {
  let currentUser = null;
  let syncing = false;
  let panel = null;

  const normalize = value => String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-').slice(0, 120);

  function currentCategory() {
    return String(categoryEl.value || 'general').slice(0, 40);
  }

  function getFindings() {
    const parser = globalThis.BillSavingsFixIt?.parseFindingsFromResult;
    if (typeof parser !== 'function' || result.hidden || !result.textContent?.trim()) return [];
    return parser(result.textContent).filter(item => item?.title).slice(0, 8);
  }

  function analysisReady() {
    return !result.hidden && !!result.textContent?.trim();
  }

  function ensureStyles() {
    if (document.getElementById('followUpStyles')) return;
    const style = document.createElement('style');
    style.id = 'followUpStyles';
    style.textContent = `
      .followup-confirm{margin-top:12px;padding-top:12px;border-top:1px solid rgba(44,85,126,.55)}
      .followup-confirm-label{display:block;color:#8fc9ff;font-size:11px;font-weight:850;margin-bottom:8px}
      .followup-choice-row{display:flex;flex-wrap:wrap;gap:8px}
      .followup-choice-row .fixit-btn.active{background:#0d4038;border-color:#2a806f;color:#89f5d6}
      .followup-amount-wrap{display:flex;gap:8px;align-items:center;margin-top:9px;max-width:330px}
      .followup-amount{min-width:0;flex:1;padding:9px 10px;border:1px solid #2b6090;border-radius:10px;background:#06172b;color:#fff;font:inherit;font-size:12px}
      .followup-user-status{margin:9px 0 0;color:#9fc6be;font-size:10px;line-height:1.45}
      .followup-ai-cue{margin:6px 0 0;font-size:11px;line-height:1.45}
      @media(max-width:760px){.followup-choice-row{display:grid;grid-template-columns:1fr}.followup-amount-wrap{max-width:none}}
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    if (panel) return panel;
    ensureStyles();
    panel = document.createElement('section');
    panel.id = 'followUpPanel';
    panel.className = 'fixit-panel';
    panel.hidden = true;
    panel.setAttribute('aria-live', 'polite');
    const anchor = document.getElementById('fixItPanel') || result;
    anchor.insertAdjacentElement('afterend', panel);
    return panel;
  }

  function outcomeCopy(row) {
    if (row.confirmed_outcome === 'resolved') return 'You confirmed this item was resolved.';
    if (row.confirmed_outcome === 'still_there') return 'You confirmed this item is still on the bill.';
    if (row.confirmed_outcome === 'amount_changed') {
      const amount = Number(row.confirmed_amount);
      return Number.isFinite(amount)
        ? `You confirmed the amount changed to $${amount.toFixed(2)}.`
        : 'You confirmed the amount changed.';
    }
    return '';
  }

  async function getUser() {
    if (currentUser?.id) return currentUser;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user?.id) return null;
    currentUser = data.user;
    return currentUser;
  }

  async function saveOutcome(rowId, outcome, amount = null) {
    const user = await getUser();
    if (!user) return false;
    const now = new Date().toISOString();
    const { error } = await supabase.from('bill_followups')
      .update({
        confirmed_outcome: outcome,
        confirmed_amount: outcome === 'amount_changed' ? amount : null,
        confirmed_at: now,
        updated_at: now
      })
      .eq('id', rowId)
      .eq('user_id', user.id);
    if (error) return false;
    await syncFindings();
    return true;
  }

  function render(rows, findings) {
    const box = ensurePanel();
    const active = new Map(findings.map(f => [normalize(f.title), f]));
    const tracked = rows.filter(row => row.status === 'contacted' || row.status === 'appears_resolved' || row.confirmed_outcome);
    if (!tracked.length) {
      box.hidden = true;
      box.replaceChildren();
      return;
    }
    box.hidden = false;
    box.replaceChildren();

    const head = document.createElement('div');
    head.className = 'fixit-head';
    const copy = document.createElement('div');
    const h3 = document.createElement('h3');
    h3.textContent = 'Next-bill follow-up';
    const p = document.createElement('p');
    p.textContent = 'Compare what BillSavings detects with what actually happened after you contacted the provider. Your confirmation always wins over the automated review.';
    copy.append(h3, p);
    const badge = document.createElement('span');
    badge.className = 'fixit-badge';
    badge.textContent = 'TRACKING';
    head.append(copy, badge);
    box.appendChild(head);

    tracked.forEach(row => {
      const key = row.finding_key.split(':').slice(1).join(':');
      const stillSeen = active.has(key);
      const card = document.createElement('div');
      card.className = 'fixit-card';

      const title = document.createElement('b');
      title.textContent = row.title;
      const status = document.createElement('p');
      status.className = 'followup-ai-cue';
      status.style.color = stillSeen ? '#ffd489' : '#7cf2d0';
      status.textContent = stillSeen
        ? 'Current AI review: this item still appears. Check whether the amount, terms, or name changed.'
        : 'Current AI review: this item was not detected. Verify the actual statement before treating it as resolved.';
      card.append(title, status);

      const confirmation = document.createElement('div');
      confirmation.className = 'followup-confirm';
      const label = document.createElement('span');
      label.className = 'followup-confirm-label';
      label.textContent = 'What actually happened?';
      confirmation.appendChild(label);

      const rowButtons = document.createElement('div');
      rowButtons.className = 'followup-choice-row';
      const stillBtn = document.createElement('button');
      const resolvedBtn = document.createElement('button');
      const changedBtn = document.createElement('button');
      stillBtn.type = resolvedBtn.type = changedBtn.type = 'button';
      stillBtn.className = 'fixit-btn';
      resolvedBtn.className = 'fixit-btn';
      changedBtn.className = 'fixit-btn';
      stillBtn.textContent = 'Still there';
      resolvedBtn.textContent = 'Resolved';
      changedBtn.textContent = 'Amount changed';
      if (row.confirmed_outcome === 'still_there') stillBtn.classList.add('active');
      if (row.confirmed_outcome === 'resolved') resolvedBtn.classList.add('active');
      if (row.confirmed_outcome === 'amount_changed') changedBtn.classList.add('active');
      rowButtons.append(stillBtn, resolvedBtn, changedBtn);
      confirmation.appendChild(rowButtons);

      const amountWrap = document.createElement('div');
      amountWrap.className = 'followup-amount-wrap';
      amountWrap.hidden = row.confirmed_outcome !== 'amount_changed';
      const amountInput = document.createElement('input');
      amountInput.className = 'followup-amount';
      amountInput.type = 'number';
      amountInput.min = '0';
      amountInput.step = '0.01';
      amountInput.inputMode = 'decimal';
      amountInput.placeholder = 'New monthly amount';
      if (row.confirmed_amount !== null && row.confirmed_amount !== undefined) amountInput.value = String(row.confirmed_amount);
      const amountSave = document.createElement('button');
      amountSave.type = 'button';
      amountSave.className = 'fixit-btn primary';
      amountSave.textContent = 'Save amount';
      amountWrap.append(amountInput, amountSave);
      confirmation.appendChild(amountWrap);

      const userStatus = document.createElement('p');
      userStatus.className = 'followup-user-status';
      userStatus.textContent = outcomeCopy(row);
      userStatus.hidden = !userStatus.textContent;
      confirmation.appendChild(userStatus);

      stillBtn.addEventListener('click', async () => {
        stillBtn.disabled = true;
        await saveOutcome(row.id, 'still_there');
        stillBtn.disabled = false;
      });
      resolvedBtn.addEventListener('click', async () => {
        resolvedBtn.disabled = true;
        await saveOutcome(row.id, 'resolved');
        resolvedBtn.disabled = false;
      });
      changedBtn.addEventListener('click', () => {
        amountWrap.hidden = false;
        amountInput.focus();
      });
      amountSave.addEventListener('click', async () => {
        const amount = Number(amountInput.value);
        if (!Number.isFinite(amount) || amount < 0) {
          userStatus.textContent = 'Enter a valid amount of $0 or more.';
          userStatus.hidden = false;
          return;
        }
        amountSave.disabled = true;
        await saveOutcome(row.id, 'amount_changed', Math.round(amount * 100) / 100);
        amountSave.disabled = false;
      });

      card.appendChild(confirmation);
      box.appendChild(card);
    });
  }

  async function syncFindings() {
    if (syncing || !analysisReady()) return;
    const findings = getFindings();
    const user = await getUser();
    if (!user) return;
    syncing = true;
    try {
      const category = currentCategory();
      const { data: existing, error } = await supabase
        .from('bill_followups')
        .select('id,finding_key,title,status,contacted_at,resolved_at,confirmed_outcome,confirmed_amount,confirmed_at')
        .eq('user_id', user.id)
        .eq('category', category);
      if (error) return;

      const byKey = new Map((existing || []).map(row => [row.finding_key, row]));
      const now = new Date().toISOString();
      const seenKeys = new Set();

      for (const finding of findings) {
        const key = `${category}:${normalize(finding.title)}`;
        seenKeys.add(key);
        const row = byKey.get(key);
        if (!row) {
          await supabase.from('bill_followups').insert({
            user_id: user.id,
            finding_key: key,
            title: String(finding.title).slice(0, 240),
            category,
            status: 'open',
            updated_at: now
          });
        } else {
          const patch = { title: String(finding.title).slice(0, 240), updated_at: now };
          if (row.status === 'appears_resolved') {
            patch.status = row.contacted_at ? 'contacted' : 'open';
            patch.resolved_at = null;
          }
          await supabase.from('bill_followups').update(patch).eq('id', row.id).eq('user_id', user.id);
        }
      }

      for (const row of existing || []) {
        if (row.status === 'contacted' && !seenKeys.has(row.finding_key)) {
          await supabase.from('bill_followups').update({
            status: 'appears_resolved',
            resolved_at: now,
            updated_at: now
          }).eq('id', row.id).eq('user_id', user.id);
        }
      }

      const { data: refreshed } = await supabase
        .from('bill_followups')
        .select('id,finding_key,title,status,contacted_at,resolved_at,confirmed_outcome,confirmed_amount,confirmed_at')
        .eq('user_id', user.id)
        .eq('category', category)
        .order('updated_at', { ascending: false });
      render(refreshed || [], findings);
    } finally {
      syncing = false;
    }
  }

  async function markContacted(detail) {
    const user = await getUser();
    if (!user || !detail?.title) return;
    const category = currentCategory();
    const key = `${category}:${normalize(detail.title)}`;
    const now = new Date().toISOString();
    await supabase.from('bill_followups').upsert({
      user_id: user.id,
      finding_key: key,
      title: String(detail.title).slice(0, 240),
      category,
      status: 'contacted',
      contacted_at: now,
      resolved_at: null,
      updated_at: now
    }, { onConflict: 'user_id,finding_key' });
    await syncFindings();
  }

  document.addEventListener('billsavings:followup-contact', event => {
    void markContacted(event.detail || {});
  });

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('.fixit-btn');
    if (!button || !/^Mark provider contacted/i.test(button.textContent || '')) return;
    const card = button.closest('.fixit-card');
    const title = card?.querySelector('.fixit-copy b')?.textContent?.trim();
    if (title) void markContacted({ title });
  }, true);

  const observer = new MutationObserver(() => { void syncFindings(); });
  observer.observe(result, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
  categoryEl.addEventListener('change', () => { if (!result.hidden) void syncFindings(); });
  supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    if (!currentUser) {
      ensurePanel().hidden = true;
      ensurePanel().replaceChildren();
    }
  });

  setTimeout(() => { void syncFindings(); }, 0);
}
