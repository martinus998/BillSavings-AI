(() => {
  const api = {};

  function parseFindingsFromResult(text) {
    const lines = String(text || '').split(/\r?\n/).map(line => line.trim());
    const findings = [];
    let current = null;
    for (const line of lines) {
      const match = line.match(/^\d+\.\s+(.+)$/);
      if (match) {
        if (current) findings.push(current);
        current = { title: match[1], explanation: '', action: '' };
        continue;
      }
      if (!current || !line) continue;
      if (/^Next step:/i.test(line)) {
        current.action = line.replace(/^Next step:\s*/i, '').trim();
      } else if (!/^Potential monthly savings:/i.test(line)) {
        current.explanation = current.explanation ? `${current.explanation} ${line}` : line;
      }
    }
    if (current) findings.push(current);
    return findings;
  }

  function buildActionPlan(finding) {
    const title = String(finding?.title || 'billing item').trim();
    const explanation = String(finding?.explanation || '').trim();
    const action = String(finding?.action || '').trim();
    const callScript = [
      `Hi, I am reviewing my current bill and I noticed “${title}.”`,
      explanation ? `The bill review noted: ${explanation}` : '',
      'Can you confirm what this charge or change is for, whether it is required for my current service, and whether there is a lower-cost option or a way to remove it?',
      'Before making any change, please tell me the full recurring monthly total, any one-time fees, any contract impact, and whether I would lose another discount or benefit.',
      'Please do not make changes until I confirm them.'
    ].filter(Boolean).join(' ');
    const emailSubject = `Billing question: ${title}`;
    const emailBody = [
      'Hello,',
      '',
      `I am reviewing my current bill and noticed the following item: ${title}.`,
      explanation ? `The bill review noted: ${explanation}` : '',
      '',
      'Could you please confirm:',
      '1. What this charge or change is for.',
      '2. Whether it is required for my current service.',
      '3. Whether there is a lower-cost option or a way to remove it.',
      '4. What my full recurring monthly total would be after any change.',
      '5. Whether any one-time fee, contract change, or lost discount would apply.',
      '',
      'Please do not make account changes until I confirm them.',
      '',
      'Thank you.'
    ].join('\n');
    const checklist = [
      action || `Ask the provider to explain “${title}” and whether it is required.`,
      'Confirm the recurring monthly price before accepting a change.',
      'Ask about one-time fees, contract effects, equipment requirements, and lost discounts.',
      'Save the provider response or confirmation number.',
      'Compare the next bill to confirm whether the charge or price actually changed.'
    ];
    return { callScript, emailSubject, emailBody, checklist };
  }

  function copyText(text, button) {
    const done = () => {
      const old = button.textContent;
      button.textContent = 'Copied ✓';
      setTimeout(() => { button.textContent = old; }, 1400);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => {});
      return;
    }
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      done();
    } catch {}
  }

  function make(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function injectStyles() {
    if (document.getElementById('fixItStyles')) return;
    const style = document.createElement('style');
    style.id = 'fixItStyles';
    style.textContent = `
      .fixit-panel{margin-top:14px;padding:18px;border:1px solid #28659a;border-radius:18px;background:linear-gradient(150deg,#08233f,#06182c);color:#f4f8ff}
      .fixit-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.fixit-head h3{margin:0 0 5px;font-size:20px}.fixit-head p{margin:0;color:#a9c2db;font-size:12px;line-height:1.5}.fixit-badge{padding:6px 9px;border-radius:999px;background:#0d4038;color:#7cf2d0;font-size:10px;font-weight:900;white-space:nowrap}
      .fixit-card{margin-top:10px;padding:14px;border:1px solid #214f78;border-radius:14px;background:#06172b}.fixit-title{display:flex;gap:10px;align-items:flex-start}.fixit-num{width:30px;height:30px;display:grid;place-items:center;border-radius:9px;background:#12365d;color:#87caff;font-size:11px;font-weight:950;flex:0 0 auto}.fixit-copy{min-width:0}.fixit-copy b{display:block;font-size:13px}.fixit-copy p{margin:4px 0 0;color:#9fb8d4;font-size:11px;line-height:1.45}.fixit-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:11px}.fixit-btn{border:1px solid #2b6090;border-radius:10px;background:#0a2947;color:#eaf4ff;padding:9px 11px;font:inherit;font-size:11px;font-weight:850;cursor:pointer}.fixit-btn.primary{background:linear-gradient(135deg,#2f85ff,#536dff);border-color:transparent}.fixit-btn.done{background:#0d4038;border-color:#1f6a5d;color:#85f2d2}.fixit-details{margin-top:12px;padding-top:12px;border-top:1px solid rgba(44,85,126,.55)}.fixit-section{margin-top:11px}.fixit-section:first-child{margin-top:0}.fixit-section strong{display:block;font-size:11px;color:#8fc9ff;margin-bottom:6px}.fixit-script{padding:11px;border-radius:11px;background:#071f37;color:#d7e8f8;font-size:11px;line-height:1.55;white-space:pre-wrap}.fixit-list{margin:7px 0 0;padding-left:18px;color:#c7daeb;font-size:11px;line-height:1.55}.fixit-note{margin:12px 0 0;color:#7898b7;font-size:9px;line-height:1.45}
      .demo-fixit{margin-top:14px;padding:16px;border-radius:15px;border:1px solid #285f8e;background:linear-gradient(135deg,#092744,#071b31)}.demo-fixit-top{display:flex;align-items:center;justify-content:space-between;gap:12px}.demo-fixit h4{margin:0;font-size:16px}.demo-fixit p{margin:5px 0 0;color:#9fb8d4;font-size:11px;line-height:1.45}.demo-fixit-tags{display:flex;flex-wrap:wrap;gap:7px;margin-top:11px}.demo-fixit-tags span{padding:7px 9px;border-radius:999px;background:#0b3557;border:1px solid #245a86;color:#bfe0ff;font-size:10px;font-weight:800}.demo-fixit .new-badge{padding:5px 8px;border-radius:999px;background:#0d4038;color:#7cf2d0;font-size:9px;font-weight:950}
      @media(max-width:760px){.fixit-panel{padding:14px}.fixit-head{flex-direction:column}.fixit-head h3{font-size:17px}.fixit-actions{display:grid;grid-template-columns:1fr 1fr}.fixit-btn{width:100%}.demo-fixit{padding:13px}}
    `;
    document.head.appendChild(style);
  }

  function renderPanel(container, findings) {
    container.replaceChildren();
    if (!findings.length) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    const head = make('div', 'fixit-head');
    const headingCopy = make('div');
    headingCopy.append(make('h3', '', 'Fix it for me'), make('p', '', 'Turn each flagged item into a ready-to-use call script, email, and checklist. You stay in control of every account change.'));
    head.append(headingCopy, make('span', 'fixit-badge', 'ACTION PLANS'));
    container.appendChild(head);

    findings.slice(0, 8).forEach((finding, index) => {
      const plan = buildActionPlan(finding);
      const card = make('div', 'fixit-card');
      const title = make('div', 'fixit-title');
      title.append(make('div', 'fixit-num', String(index + 1).padStart(2, '0')));
      const copy = make('div', 'fixit-copy');
      copy.append(make('b', '', finding.title || 'Billing item'));
      if (finding.explanation) copy.append(make('p', '', finding.explanation));
      title.appendChild(copy);
      card.appendChild(title);

      const actions = make('div', 'fixit-actions');
      const openBtn = make('button', 'fixit-btn primary', 'Build action plan');
      const contactBtn = make('button', 'fixit-btn', 'Mark provider contacted');
      openBtn.type = contactBtn.type = 'button';
      actions.append(openBtn, contactBtn);
      card.appendChild(actions);

      const details = make('div', 'fixit-details');
      details.hidden = true;
      const callSection = make('div', 'fixit-section');
      callSection.append(make('strong', '', 'Phone script'), make('div', 'fixit-script', plan.callScript));
      const callCopy = make('button', 'fixit-btn', 'Copy call script');
      callCopy.type = 'button';
      callCopy.addEventListener('click', () => copyText(plan.callScript, callCopy));
      callSection.appendChild(callCopy);

      const emailSection = make('div', 'fixit-section');
      emailSection.append(make('strong', '', `Email template · ${plan.emailSubject}`), make('div', 'fixit-script', plan.emailBody));
      const emailCopy = make('button', 'fixit-btn', 'Copy email');
      emailCopy.type = 'button';
      emailCopy.addEventListener('click', () => copyText(`Subject: ${plan.emailSubject}\n\n${plan.emailBody}`, emailCopy));
      emailSection.appendChild(emailCopy);

      const checkSection = make('div', 'fixit-section');
      checkSection.appendChild(make('strong', '', 'Checklist'));
      const list = make('ol', 'fixit-list');
      plan.checklist.forEach(item => list.appendChild(make('li', '', item)));
      checkSection.appendChild(list);
      details.append(callSection, emailSection, checkSection, make('p', 'fixit-note', 'BillSavings AI prepares questions and templates only. It does not contact the provider, cancel service, or change your account automatically. Verify provider terms before accepting any change.'));
      card.appendChild(details);

      openBtn.addEventListener('click', () => {
        details.hidden = !details.hidden;
        openBtn.textContent = details.hidden ? 'Build action plan' : 'Hide action plan';
      });
      contactBtn.addEventListener('click', () => {
        const done = contactBtn.classList.toggle('done');
        contactBtn.textContent = done ? 'Provider contacted ✓' : 'Mark provider contacted';
      });
      container.appendChild(card);
    });
  }

  function installDemoPreview() {
    if (document.getElementById('demoFixIt')) return;
    const savings = document.querySelector('.demo .analysis .savings');
    if (!savings) return;
    const box = make('div', 'demo-fixit');
    box.id = 'demoFixIt';
    const top = make('div', 'demo-fixit-top');
    top.append(make('h4', '', 'Fix it for me'), make('span', 'new-badge', 'NEW ACTION LAYER'));
    box.append(top, make('p', '', 'Example: turn “Recurring equipment rental · $12/mo” into a ready-to-use provider call script, email template, and checklist—without changing the account automatically.'));
    const tags = make('div', 'demo-fixit-tags');
    ['Call script', 'Email template', 'What to ask', 'Check the next bill'].forEach(label => tags.appendChild(make('span', '', label)));
    box.appendChild(tags);
    savings.insertAdjacentElement('afterend', box);
  }

  function installResultPanel() {
    const result = document.getElementById('result');
    if (!result || document.getElementById('fixItPanel')) return;
    const panel = make('section', 'fixit-panel');
    panel.id = 'fixItPanel';
    panel.hidden = true;
    panel.setAttribute('aria-live', 'polite');
    result.insertAdjacentElement('afterend', panel);
    const refresh = () => {
      const text = result.textContent || '';
      if (result.hidden || !text.trim()) {
        panel.hidden = true;
        panel.replaceChildren();
        return;
      }
      renderPanel(panel, parseFindingsFromResult(text));
    };
    refresh();
    if (typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(refresh);
      observer.observe(result, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
    }
  }

  function boot() {
    injectStyles();
    installDemoPreview();
    installResultPanel();
  }

  api.parseFindingsFromResult = parseFindingsFromResult;
  api.buildActionPlan = buildActionPlan;
  globalThis.BillSavingsFixIt = api;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
  }
})();
