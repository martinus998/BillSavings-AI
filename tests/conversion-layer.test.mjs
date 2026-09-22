import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const analytics = fs.readFileSync(new URL('../analytics.js', import.meta.url), 'utf8');
const help = fs.readFileSync(new URL('../customer-help.js', import.meta.url), 'utf8');
const onboarding = fs.readFileSync(new URL('../paid-onboarding.js', import.meta.url), 'utf8');

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
  assert.match(help, /analytics\\.js\\?v=20260922-pricefix1/);
});

test('paid onboarding is guidance-only and follows the savings workflow', () => {
  assert.match(help, /paid-onboarding\.js\?v=20260917-onboard1/);
  assert.match(onboarding, /Premium\|Family/);
  assert.match(onboarding, /Upload/);
  assert.match(onboarding, /Review/);
  assert.match(onboarding, /Fix it/);
  assert.match(onboarding, /Track/);
  assert.doesNotMatch(onboarding, /stripe|checkout|claim_billing_entitlement|supabase/i);
});

test('analytics does not overwrite live plan prices', () => {
  assert.doesNotMatch(analytics, /\$8\.99|\$13\.99/);
  assert.doesNotMatch(analytics, /querySelector\('\.price'\).*innerHTML/);
});

test('funnel analytics measure actions without reading user content', () => {
  for (const event of ['bs_plan_select','bs_upload_start','bs_analysis_start','bs_fixit_provider_contact','bs_followup_outcome']) {
    assert.match(analytics, new RegExp(event));
  }
  assert.doesNotMatch(analytics, /authEmail|userEmail|checkoutEmail|file\.name|result\.textContent|provider name/i);
});


test('conversion-focused homepage routes real analysis through paid plans without touching billing core', () => {
  assert.match(app, /CONVERSION FOCUS LAYER/);
  assert.match(app, /Choose Your Plan/);
  assert.match(app, /Choose Premium or Family/);
  assert.match(app, /View Sample Analysis/);
  assert.match(app, /Analyze your own bill after secure checkout/);
  assert.match(analytics, /bs_cta_click/);
  assert.doesNotMatch(app, /claim_billing_entitlement|stripe-webhook|password-signup/);
});


test('keep-more marketing explains the price model without overclaiming competitor pricing', () => {
  assert.match(app, /KEEP MORE OF WHAT YOU SAVE/);
  assert.match(app, /No cut of your savings/);
  assert.match(app, /NO SUCCESS FEE/);
  assert.match(app, /KEEP 100% OF YOUR SAVINGS/);
  assert.match(app, /Different services include different features/);
  assert.match(app, /you contact the provider yourself/);
  assert.doesNotMatch(app, /cheapest|cheaper than all|lowest price|guaranteed savings/i);
});
