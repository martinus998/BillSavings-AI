# Sandbox checkout test awaiting deployment approval

Goal: verify checkout → automatic email request → mailbox sign-in → Premium assignment without moving real money.

Stripe authorization was verified for **Martin Lesko sandbox**, `acct_1UEPjxBCCwnohYGY`, with test access only. The production accounts are not used by the test CLI.

## Prepared application changes

- Four separate `billing_sandbox_*` tables, with row-level security and access limited to the service role. Subscription rows enforce `livemode = false`.
- A service-only function that retrieves the sandbox webhook signing secret from Supabase Vault.
- An authenticated `claim_sandbox_billing_entitlement` function that only reads and writes sandbox billing records. It verifies the signed-in user's confirmed email.
- Two separate Edge Functions, `sandbox-stripe-webhook` and `sandbox-billing-access`.
- A non-indexed `sandbox-checkout.html` test page. No existing public page, live checkout URL, price, analyzer or production handler is changed.

The webhook, delivery handler and checkout controller are generated from the production sources by `node scripts/build-sandbox-checkout.mjs`. Generated files record their source SHA-256. The documented differences are test Session IDs, test-only event checks, isolated tables, isolated browser receipt storage, a sandbox secret lookup, test Payment Link metadata, the owner-email gate and the test callback. SDK imports in test functions are pinned.

Checkout receipt creation and email sending require the approved owner's normalized email to match the committed SHA-256 hash. These operations expire at **2026-09-19 18:00 UTC**. The standalone page has no direct email sign-in form, so it cannot bypass the receipt delivery restrictions. The hash is an allowlist identifier, not an authentication secret.

The email callback is `https://billsavingsai.com/sandbox-checkout.html?access=ready`. It must be verified in the Supabase Auth redirect allowlist before any test email is requested. Do not fall back to `start.html`: that production page automatically claims live pending entitlements. The test callback claims only sandbox entitlements and does not unlock the production analyzer. Supabase Auth itself is shared, so signing in creates or refreshes a normal Auth session even though the billing ledger is separate.

## Deployment gate

Automatic approval review rejected the shared Supabase migration on 2026-09-17 because authorization to run a no-payment test was not considered authorization for persistent schema and permission changes. A second review also rejected the owner's general delegation ("you know what is best") as insufficiently specific for persistent DDL, security-definer functions and access changes in this shared project. The migration was **not applied**. No attempt will use another route to apply those changes before explicit approval.

Approval scope: add the listed test tables and their access rules, two SQL functions (including security-definer execution), two Edge Functions and the standalone test page; store the new test webhook secret in Vault; allow the sandbox Auth callback if it is not already allowed; connect the test Payment Link return and enable its sandbox webhook. Existing production billing records, functions, prices and Payment Links remain unchanged.

Stripe resources prepared: test price `price_1UGgiiBCCwnohYGYxRVfu8dW`, test Payment Link `plink_1UGgm7BCCwnohYGYOCh4Tydi`, test webhook `we_1UGglSBCCwnohYGY2emGoNpj`. Managed Payments is explicitly disabled on the test Payment Link to match ordinary Checkout. No credential or webhook secret belongs in git.

## Verification

Run `node --test tests/*.test.mjs`. Sandbox isolation checks must pass in addition to existing billing tests.

Observed on 2026-09-17: all **34** Node checks passed (28 existing billing checks and 6 sandbox isolation checks). The added behavioral checks verify rejection of unapproved emails and expired test requests before writes or email sends, plus use of the sandbox callback. Regeneration is byte-for-byte reproducible, and production files remain byte-identical to the current main commit.

Stripe hosted Checkout was completed using synthetic email `billsavings-sandbox-test@example.com` and Stripe's 4242 test card. The Stripe API returned `livemode: false`, `status: complete`, `payment_status: paid`, `amount_total: 899`, `currency: usd` and metadata `plan: premium`. The browser displayed the hosted sandbox confirmation. This was a Stripe-only test: the test webhook was disabled and no application receipt, email or entitlement was created. The temporary hosted confirmation must be changed back to the proposed test page return URL before the full test. The full application test will use the approved owner mailbox.

After approval, verify actual database grants, both handlers, the Auth callback allowlist, signed test webhook processing and retries, then perform the owner-assisted email round trip. If the expiry has passed, review and extend the test window before enabling the test. A passed mock test or a Stripe-only checkout is not proof that mail delivery or application access works.

The Stripe-only test has already been cleaned up: its subscription is canceled, the test Payment Link is inactive and the sandbox webhook is disabled. Keep these disabled until the application test is ready. After any further test, repeat this cleanup so test renewals do not continue. Keep the production configuration intact.
