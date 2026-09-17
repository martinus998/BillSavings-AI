import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const analytics = fs.readFileSync(new URL('../analytics.js', import.meta.url), 'utf8');
const help = fs.readFileSync(new URL('../customer-help.js', import.meta.url), 'utf8');

test('homepage explains the live Premium action workflow', () => {
  assert.match(app, /FIND → FIX → TRACK/);
  assert.match(app, /Fix-it call and email scripts/);
  assert.match(app, /Track contacted items on the next bill/);
  assert.match(app, /resolved, is still there, or the amount changed/i);
  assert.match(app, /illustration, not a savings guarantee/i);
});

test('start page copy stays aligned with Premium action features', () => {
  assert.match(help, /Fix-it call and email scripts/);
  assert.match(help, /Next-bill follow-up tracking/);
  assert.match(help, /analytics\.js\?v=20260917-funnel1/);
});

test('funnel analytics measure actions without reading user content', () => {
  for (const event of ['bs_plan_select','bs_upload_start','bs_analysis_start','bs_fixit_provider_contact','bs_followup_outcome']) {
    assert.match(analytics, new RegExp(event));
  }
  assert.doesNotMatch(analytics, /authEmail|userEmail|checkoutEmail|file\.name|result\.textContent|provider name/i);
});
