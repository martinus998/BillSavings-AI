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

  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'followUpPanel';
    panel.className = 'fixit-panel';
    panel.hidden = true;
    panel.setAttribute('aria-live', 'polite');
    const anchor = document.getElementById('fixItPanel') || result;
    anchor.insertAdjacentElement('afterend', panel);
    return panel;
  }

  function render(rows, findings) {
    const box = ensurePanel();
    const active = new Map(findings.map(f => [normalize(f.title), f]));
    const tracked = rows.filter(row => row.status === 'contacted' || row.status === 'appears_resolved');
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
    p.textContent = 'BillSavings compares previously contacted items with the current bill category. Treat this as a review cue, not proof that a provider removed a charge.';
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
      status.style.margin = '6px 0 0';
      status.style.color = stillSeen ? '#ffd489' : '#7cf2d0';
      status.textContent = stillSeen
        ? 'Still appears in this bill review — check whether the amount or terms changed.'
        : 'Not detected in this bill review — verify the actual statement before treating it as resolved.';
      card.append(title, status);
      box.appendChild(card);
    });
  }

  async function getUser() {
    if (currentUser?.id) return currentUser;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user?.id) return null;
    currentUser = data.user;
    return currentUser;
  }

  async function syncFindings() {
    if (syncing) return;
    const findings = getFindings();
    if (!findings.length) return;
    const user = await getUser();
    if (!user) return;
    syncing = true;
    try {
      const category = currentCategory();
      const { data: existing, error } = await supabase
        .from('bill_followups')
        .select('id,finding_key,title,status,contacted_at,resolved_at')
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
            patch.status = 'open';
            patch.resolved_at = null;
          }
          await supabase.from('bill_followups').update(patch).eq('id', row.id);
        }
      }

      for (const row of existing || []) {
        if (row.status === 'contacted' && !seenKeys.has(row.finding_key)) {
          await supabase.from('bill_followups').update({
            status: 'appears_resolved',
            resolved_at: now,
            updated_at: now
          }).eq('id', row.id);
        }
      }

      const { data: refreshed } = await supabase
        .from('bill_followups')
        .select('finding_key,title,status,contacted_at,resolved_at')
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
