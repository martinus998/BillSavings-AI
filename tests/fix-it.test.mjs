import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../fix-it.js', import.meta.url), 'utf8');

function loadHelpers() {
  const context = {globalThis: {}, setTimeout() {}, navigator: {}};
  vm.runInNewContext(source, context, {filename: 'fix-it.js'});
  return context.globalThis.BillSavingsFixIt;
}

test('parses rendered bill findings without depending on auth or billing code', () => {
  const api = loadHelpers();
  const findings = api.parseFindingsFromResult(`Analysis complete.\n\nPotential monthly savings: $5.00–$16.99\n\n1. Recurring equipment rental\nA monthly hardware fee appears separately.\nNext step: Ask whether customer-owned equipment is supported.\n\n2. Paper statement fee\nA recurring paper billing fee appears.\nNext step: Ask whether paperless billing removes it.`);
  assert.equal(findings.length, 2);
  assert.equal(findings[0].title, 'Recurring equipment rental');
  assert.match(findings[0].explanation, /monthly hardware fee/i);
  assert.match(findings[0].action, /customer-owned equipment/i);
  assert.equal(findings[1].title, 'Paper statement fee');
});

test('builds a safe user-controlled call script, email, and checklist', () => {
  const api = loadHelpers();
  const plan = api.buildActionPlan({
    title: 'Service fee worth reviewing',
    explanation: 'The fee is separate from the advertised service price.',
    action: 'Ask the provider what the fee covers.'
  });
  assert.match(plan.callScript, /Please do not make changes until I confirm them\./);
  assert.match(plan.emailBody, /Please do not make account changes until I confirm them\./);
  assert.match(plan.emailSubject, /Service fee worth reviewing/);
  assert.ok(plan.checklist.some(item => /next bill/i.test(item)));
});
