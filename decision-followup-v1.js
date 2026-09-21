/* Independent planning tools. No billing, authentication, storage or document-network APIs. */
(() => {
  'use strict';
  const categories = ['Engineering / inspections', 'Permits', 'Excavation / restoration', 'Drainage / water control', 'Other extras / taxes'];
  const allowed = ['unknown', 'included', 'extra', 'not-needed'];
  const modes = ['bill', 'repair'];
  function text(v, max = 100) { if (typeof v !== 'string' || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) throw Error('Invalid or oversized text field.'); return v.trim(); }
  function money(v, required = true) {
    const s = text(v, 30).replace(/^\$\s*/, '');
    if (!s) { if (required) throw Error('Enter every required amount; blank is not zero.'); return null; }
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(s)) throw Error('Use a non-negative USD amount, for example 1,250.50.');
    const [w, f = ''] = s.replace(/,/g, '').split('.'), n = Number(w) * 100 + Number(f.padEnd(2, '0'));
    if (!Number.isSafeInteger(n) || n > 1000000000) throw Error('Amount exceeds the $10,000,000 limit.');
    return n;
  }
  function date(v) {
    const s = text(v, 10); if (!s) return '';
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(s)) throw Error('Use a valid date from 2000 through 2099.');
    const d = new Date(s + 'T00:00:00Z'); if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw Error('This calendar date does not exist.'); return s;
  }
  function amount(v) { const s = text(v, 30); money(s, false); return s; }
  function fresh(mode) {
    if (!modes.includes(mode)) throw Error('Unknown tool.');
    const common = { version: 1, mode, name: '', reviewDate: '', promoDate: '' };
    return mode === 'bill' ? { ...common, baseline: '', agreed: '', actual: '', credit: '0', fee: '0' } : { ...common, quotes: [0, 1].map(() => ({ base: '', items: categories.map(() => ({ status: 'unknown', low: '', high: '' })) })) };
  }
  function validate(p, mode) {
    if (!p || typeof p !== 'object' || Array.isArray(p) || p.version !== 1 || p.mode !== mode || !modes.includes(mode)) throw Error('Open a version 1 workspace file from this same tool.');
    const out = { version: 1, mode, name: text(p.name), reviewDate: date(p.reviewDate), promoDate: mode === 'bill' ? date(p.promoDate) : '' };
    if (mode === 'bill') for (const k of ['baseline', 'agreed', 'actual', 'credit', 'fee']) out[k] = amount(p[k]);
    else {
      if (!Array.isArray(p.quotes) || p.quotes.length !== 2) throw Error('Expected two quotes.');
      out.quotes = p.quotes.map(q => {
        if (!q || !Array.isArray(q.items) || q.items.length !== categories.length) throw Error('Invalid quote scope rows.');
        return { base: amount(q.base), items: q.items.map(i => {
          if (!i || !allowed.includes(i.status)) throw Error('Invalid cost status.');
          const low = i.status === 'extra' ? amount(i.low) : '', high = i.status === 'extra' ? amount(i.high) : '';
          if (i.status === 'extra' && low && high && money(low) > money(high)) throw Error('The extra-cost lower amount cannot exceed the upper amount.');
          return { status: i.status, low: i.status === 'extra' ? low : '', high: i.status === 'extra' ? high : '' };
        }) };
      });
    }
    return out;
  }
  const fmt = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n / 100);
  function bill(p) {
    p = validate(p, 'bill');
    const baseline = money(p.baseline), agreed = money(p.agreed), actual = money(p.actual), credit = money(p.credit), fee = money(p.fee);
    return { promised: baseline - agreed, observed: baseline - actual, gap: actual - agreed, firstCycle: baseline - actual + credit - fee, credit, fee };
  }
  function repair(p) {
    p = validate(p, 'repair');
    return p.quotes.map(q => {
      const base = money(q.base); let low = base, high = base;
      const unknown = [], extras = [];
      q.items.forEach((i, ix) => {
        if (i.status === 'unknown') unknown.push(categories[ix]);
        if (i.status === 'extra') { const a = money(i.low), b = money(i.high); if (a > b) throw Error('An extra-cost lower amount exceeds its upper amount.'); low += a; high += b; extras.push({ name: categories[ix], low: a, high: b }); }
      });
      return { base, low, high, unknown, extras };
    });
  }
  function parseFile(s, mode) { if (typeof s !== 'string' || new TextEncoder().encode(s).length > 32000) throw Error('Workspace file exceeds 32 KB.'); return validate(JSON.parse(s.replace(/^\uFEFF/, '')), mode); }
  function shift(s, days) { if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isInteger(days) || Math.abs(days) > 366) throw Error('Invalid date offset.'); const d = new Date(s + 'T00:00:00Z'); if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== s) throw Error('Invalid date offset.'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
  function calendar(p, uid, now = new Date()) {
    p = validate(p, p.mode);
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(uid)) throw Error('Invalid calendar identifier.');
    const events = [];
    if (p.reviewDate) events.push({ key: 'review', day: p.reviewDate, title: p.mode === 'bill' ? 'Review the next bill against the agreed rate' : 'Review repair quote scope and extra costs' });
    if (p.mode === 'bill' && p.promoDate) events.push({ key: 'promotion', day: shift(p.promoDate, -7), title: 'Review promotion terms before the end date' });
    if (!events.length) throw Error('Enter a review date or promotion end date first.');
    const url = p.mode === 'bill' ? 'https://billsavingsai.com/savings-follow-up.html' : 'https://repaircostmatch.com/repair-quote-budget.html';
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Decision Followup//Private worksheet//EN', 'CALSCALE:GREGORIAN'];
    for (const e of events) lines.push('BEGIN:VEVENT', 'UID:' + uid + '-' + e.key + '@decision-followup', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + e.day.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + shift(e.day, 1).replace(/-/g, ''), 'SUMMARY:' + e.title, 'DESCRIPTION:Open your saved worksheet and verify the original documents.', 'URL:' + url, 'CLASS:PRIVATE', 'TRANSP:TRANSPARENT', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-P1D', 'DESCRIPTION:Review your worksheet and original documents.', 'END:VALARM', 'END:VEVENT');
    lines.push('END:VCALENDAR');
    // All generated values are ASCII, so byte-safe RFC 5545 folding is deterministic.
    return lines.map(s => { let out = ''; while (s.length > 75) { out += s.slice(0, 75) + '\r\n'; s = ' ' + s.slice(75); } return out + s; }).join('\r\n') + '\r\n';
  }
  const E = Object.freeze({ categories, fresh, validate, money, bill, repair, fmt, date, shift, parseFile, calendar });
  globalThis.DecisionFollowup = E;
  if (typeof document === 'undefined') return;
  const $ = id => document.getElementById(id), mode = document.body.dataset.tool;
  if (!modes.includes(mode)) return;
  let result = '', revision = 0, touched = false, uid = crypto.randomUUID();
  const say = s => { $('status').textContent = s; };
  const node = (tag, s, cls) => { const n = document.createElement(tag); if (s !== undefined) n.textContent = s; if (cls) n.className = cls; return n; };
  function input(id, label, value = '') { const l = node('label', label), x = node('input'); x.id = id; x.type = 'text'; x.inputMode = 'decimal'; x.maxLength = 30; x.autocomplete = 'off'; x.value = value; l.htmlFor = id; l.append(x); return l; }
  function render(p) {
    $('caseName').value = p.name; $('reviewDate').value = p.reviewDate;
    if (mode === 'bill') { $('promoDate').value = p.promoDate; for (const k of ['baseline', 'agreed', 'actual', 'credit', 'fee']) $(k).value = p[k]; }
    else {
      $('quoteFields').replaceChildren();
      p.quotes.forEach((q, qi) => {
        const block = node('section', undefined, 'panel'), name = 'Quote ' + (qi ? 'B' : 'A'); block.append(node('h2', name), input('base' + qi, name + ' written total ($)', q.base));
        q.items.forEach((it, ix) => {
          const row = node('div', undefined, 'scope'), label = node('label', categories[ix] + ' — ' + name), select = node('select'); select.id = 'state' + qi + ix; label.htmlFor = select.id;
          for (const [value, s] of [['unknown', 'Not confirmed / not priced'], ['included', 'Already included in quote'], ['extra', 'Extra cost above quote'], ['not-needed', 'Confirmed not needed']]) { const o = node('option', s); o.value = value; select.append(o); }
          select.value = it.status; label.append(select); row.append(label);
          const amounts = node('div', undefined, 'pair'); amounts.id = 'amounts' + qi + ix;
          amounts.append(input('low' + qi + ix, 'Extra lower amount ($)', it.low), input('high' + qi + ix, 'Extra upper amount ($)', it.high)); row.append(amounts); block.append(row);
          const toggle = () => { amounts.hidden = select.value !== 'extra'; for (const x of amounts.querySelectorAll('input')) x.disabled = amounts.hidden; }; select.addEventListener('change', toggle); toggle();
        }); $('quoteFields').append(block);
      });
    }
  }
  function collect() {
    const p = fresh(mode); p.name = $('caseName').value; p.reviewDate = $('reviewDate').value;
    if (mode === 'bill') { p.promoDate = $('promoDate').value; for (const k of ['baseline', 'agreed', 'actual', 'credit', 'fee']) p[k] = $(k).value; }
    else p.quotes = [0, 1].map(q => ({ base: $('base' + q).value, items: categories.map((_, i) => ({ status: $('state' + q + i).value, low: $('low' + q + i).value, high: $('high' + q + i).value })) }));
    return validate(p, mode);
  }
  function invalidate() { revision++; touched = true; result = ''; $('verified').checked = false; $('results').hidden = true; $('fallback').hidden = true; $('fallback').value = ''; $('cards').replaceChildren(); $('report').textContent = ''; }
  $('fields').addEventListener('input', invalidate); $('fields').addEventListener('change', invalidate);
  $('verified').addEventListener('change', () => { if (!$('verified').checked) { result = ''; $('results').hidden = true; $('fallback').hidden = true; } });
  function card(label, value, note) { const n = node('div', undefined, 'metric'); n.append(node('span', label), node('strong', value), node('small', note)); $('cards').append(n); }
  $('calculate').addEventListener('click', () => { try {
    if (!$('verified').checked) throw Error('Review the original documents and confirm the checkbox first.');
    const p = collect(); $('cards').replaceChildren(); const lines = [mode === 'bill' ? 'BillSavings AI — savings follow-up' : 'RepairCostMatch — quote budget gaps', p.name ? 'Worksheet: ' + p.name : '', 'Prepared ' + new Date().toISOString(), ''];
    if (mode === 'bill') {
      const d = bill(p);
      card('Promised recurring reduction', fmt(d.promised), 'Previous recurring amount minus agreed recurring amount.');
      card('Observed recurring reduction', fmt(d.observed), 'Previous recurring amount minus actual recurring amount.');
      card('Actual vs agreed rate', fmt(d.gap), 'Positive means above the entered agreement, not proof of an error.');
      const state = d.gap > 0 ? 'The entered actual recurring charge is ' + fmt(d.gap) + ' ABOVE the agreed recurring charge. Confirm timing, scope, fees and adjustments with the provider.' : d.gap < 0 ? 'The entered actual recurring charge is ' + fmt(-d.gap) + ' BELOW the agreed recurring charge. Verify that this is recurring, not a temporary credit.' : 'The entered recurring amounts match. This does not verify any other bill items.';
      lines.push(state, '', 'Promised recurring reduction: ' + fmt(d.promised), 'Observed recurring reduction: ' + fmt(d.observed), 'One-time credit received: ' + fmt(d.credit), 'Service / negotiation fees actually paid for this check: ' + fmt(d.fee), 'Illustrative first-cycle net effect versus the previous recurring baseline: ' + fmt(d.firstCycle), 'One-time credits are not ongoing savings. No annual savings are projected.', '', 'Provider follow-up draft:', 'Please help me check my new rate. I recorded an agreed recurring amount of ' + fmt(money(p.agreed)) + ' and an actual recurring amount of ' + fmt(money(p.actual)) + '. Please explain the effective date, any excluded taxes or equipment charges, and any one-time adjustments. Please confirm the recurring total and promotion end date in writing.');
    } else {
      const ds = repair(p);
      ds.forEach((d, i) => {
        const label = 'Quote ' + (i ? 'B' : 'A'); card(label + ' + entered extras', fmt(d.low) + '–' + fmt(d.high), d.unknown.length ? d.unknown.length + ' unpriced topics excluded. This upper figure is NOT a final-price cap.' : 'All listed topics classified by you; not a complete-scope guarantee.');
        lines.push(label + ': quoted ' + fmt(d.base) + '; entered extras ' + fmt(d.low - d.base) + '–' + fmt(d.high - d.base) + '; modelled subtotal ' + fmt(d.low) + '–' + fmt(d.high));
        for (const x of d.extras) lines.push('  ' + x.name + ': ' + fmt(x.low) + '–' + fmt(x.high) + ' above the written quote.');
        lines.push(d.unknown.length ? 'Unpriced / unconfirmed: ' + d.unknown.join('; ') + '. These are NOT assumed free.' : 'No unpriced rows among the five topics you reviewed.');
        lines.push('Questions for ' + label + ':');
        for (const x of d.unknown) lines.push('Please confirm whether ' + x.toLowerCase() + ' is included, needed or extra, and provide the incremental cost in writing.');
        for (const x of d.extras) lines.push('Please confirm the ' + x.name.toLowerCase() + ' extra range and whether it replaces an allowance already counted.');
        if (!d.unknown.length && !d.extras.length) lines.push('Please confirm that the agreed scope, quantities, taxes and exclusions match the written total.'); lines.push('');
      });
      lines.push('No contractor is ranked. These are user-entered cost scenarios, not equivalent engineering scopes or final bids. Costs not covered by the listed rows may still exist.');
    }
    lines.push('', 'User-verified input only. No bank connection, document extraction, provider verification or legal assessment.');
    result = lines.join('\n'); $('report').textContent = result; $('results').hidden = false; say('Worksheet ready. Save a private workspace file to resume later.');
  } catch (e) { result = ''; $('results').hidden = true; say(e.message); } });
  function download(data, type, name) { const u = URL.createObjectURL(new Blob([data], { type })), a = node('a'); a.href = u; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1500); }
  $('save').addEventListener('click', () => { try { const p = collect(); download(JSON.stringify(p, null, 2), 'application/json', mode + '-followup-workspace.json'); say('Workspace saved as an UNENCRYPTED file. Keep it private. It includes entered values, not your verification checkbox.'); } catch (e) { say(e.message); } });
  $('import').addEventListener('change', async () => {
    const file = $('import').files[0]; if (!file) return; const start = revision;
    try {
      if (file.size > 32000 || !/\.json$/i.test(file.name)) throw Error('Choose a .json workspace file no larger than 32 KB.');
      const content = await file.text(); if (revision !== start) throw Error('Your inputs changed while the file was loading. Import again to avoid overwriting them.');
      const p = parseFile(content, mode); if (touched && !confirm('Replace this workspace with the imported file?')) return;
      render(p); invalidate(); uid = crypto.randomUUID(); say('Workspace restored locally. Review values again before calculating.');
    } catch (e) { say('Import failed: ' + e.message); } finally { $('import').value = ''; }
  });
  $('calendar').addEventListener('click', () => { try { const p = collect(); download(calendar(p, uid), 'text/calendar;charset=utf-8', mode + '-review-dates.ics'); say('Calendar file prepared. Import it into your calendar and check its alerts. No email, push service or automatic monitoring was enabled. Past dates remain past dates.'); } catch (e) { say(e.message); } });
  $('copy').addEventListener('click', async () => { if (!result) return; const value = result, start = revision; try { await navigator.clipboard.writeText(value); if (start === revision) say('Summary copied. Keep your information private.'); } catch { if (start !== revision) return; $('fallback').value = value; $('fallback').hidden = false; $('fallback').focus(); $('fallback').select(); say('Copy the selected summary manually.'); } });
  $('export').addEventListener('click', () => { if (result) download(result, 'text/plain;charset=utf-8', mode + '-followup-summary.txt'); });
  $('print').addEventListener('click', () => { if (result) window.print(); });
  $('sample').addEventListener('click', () => {
    if (touched && !confirm('Replace your inputs with a fictional example?')) return; const p = fresh(mode);
    p.name = 'Fictional example — not a customer outcome';
    if (mode === 'bill') Object.assign(p, { baseline: '95', agreed: '70', actual: '82', credit: '15', fee: '20' });
    else { p.quotes[0].base = '12000'; p.quotes[1].base = '13500'; p.quotes[0].items[0] = { status: 'extra', low: '900', high: '1400' }; p.quotes[0].items[2] = { status: 'extra', low: '1500', high: '2000' }; p.quotes[1].items[0].status = 'included'; p.quotes[1].items[2].status = 'included'; }
    render(p); invalidate(); say('Fictional sample loaded. Check the values before confirming.');
  });
  $('clear').addEventListener('click', () => { if (touched && !confirm('Clear this workspace? Saved files and calendar events are not deleted.')) return; render(fresh(mode)); invalidate(); uid = crypto.randomUUID(); touched = false; say('Workspace cleared. Saved files and calendar events are unchanged.'); });
  render(fresh(mode));
})();
