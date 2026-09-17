import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const followUp = readFileSync(new URL('../follow-up.js', import.meta.url), 'utf8');
const loader = readFileSync(new URL('../customer-help.js', import.meta.url), 'utf8');
const start = readFileSync(new URL('../start.js', import.meta.url), 'utf8');

test('next-bill follow-up offers explicit user-confirmed outcomes', () => {
  assert.match(followUp, /Still there/);
  assert.match(followUp, /Resolved/);
  assert.match(followUp, /Amount changed/);
  assert.match(followUp, /confirmed_outcome/);
  assert.match(followUp, /confirmed_amount/);
  assert.match(followUp, /Your confirmation always wins over the automated review/);
});

test('follow-up updates stay scoped to the signed-in user', () => {
  assert.match(followUp, /\.eq\('user_id', user\.id\)/);
  assert.match(followUp, /onConflict: 'user_id,finding_key'/);
});

test('a bill with no flagged findings can still close the follow-up loop', () => {
  assert.match(followUp, /if \(syncing \|\| !analysisReady\(\)\) return;/);
  assert.doesNotMatch(followUp, /if \(!findings\.length\) return;/);
  assert.match(followUp, /status: 'appears_resolved'/);
});

test('follow-up remains isolated from checkout and auth core', () => {
  assert.match(loader, /follow-up\.js\?v=20260917-follow2/);
  assert.doesNotMatch(start, /follow-up\.js/);
  assert.doesNotMatch(followUp, /checkout\.html|buy\.stripe\.com|billing-access/);
});
