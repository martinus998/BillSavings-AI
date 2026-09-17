# Account and embedded payment draft

## Customer journey

The new `/checkout.html?plan=premium` (or `family`) page places the account form and Stripe payment form on one page. Passwords go to Supabase Auth; card details stay inside Stripe's embedded form. The prices remain $8.99/month and $13.99/month.

New customers choose an email and password and confirm their email once. The confirmation returns to their selected checkout. Existing customers sign in with their password. Customers who previously used email links can use the password-reset option to set a password.

After payment, the return page verifies the Checkout Session and its authenticated owner on the server. It then opens the account with the paid plan and upload controls. A return URL alone never activates access. Future visits use email/password; no routine sign-in email is sent.

Sessions use tab-scoped session storage rather than persistent local storage. Closing a tab normally clears that storage, but browser session restoration can preserve it. Explicit **Sign out** is the reliable way to end a session.

## Current status

This is a draft, not a deployed checkout. The new provider endpoint, webhook changes, frontend, auth redirect configuration and Stripe credentials have not been published or changed. Existing live Payment Links remain in use.

The code uses the existing `billing_subscriptions` table and entitlement RPC. There are no database migrations, RLS changes, grants, signup autoconfirm changes or SMTP changes. The earlier sandbox migration was blocked by automatic approval review and has not been retried or included here.

## Server configuration required before activation

Deploy `supabase/functions/account-checkout/index.ts` to the existing BillSavings project with gateway JWT verification disabled for its public readiness GET. Every POST independently verifies its bearer token with Supabase Auth and requires a confirmed, non-anonymous user. CORS allows only the two production BillSavings origins.

Configure these values securely in the provider dashboard, never in source, screenshots or chat:

| Variable | Purpose |
| --- | --- |
| `BILLSAVINGS_ACCOUNT_STRIPE_LIVE_KEY` | Dedicated Stripe server key for this account's live Checkout integration; prefer a restricted key. |
| `BILLSAVINGS_ACCOUNT_STRIPE_LIVE_PUBLISHABLE_KEY` | Matching live publishable key, safe to expose to Stripe.js. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Existing function runtime configuration. |

The new Stripe variables are deliberately isolated from the older checkout function. Do not put the new key into legacy `BILLSAVINGS_STRIPE_LIVE_SECRET_KEY`, `STRIPE_LIVE_SECRET_KEY` or `STRIPE_SECRET_KEY` variables as a shortcut: that can change readiness in an older integration. No legacy-variable fallback exists in the new endpoint.

The server makes `POST /v1/checkout/sessions` and `GET /v1/checkout/sessions/:id` calls, including expanded subscription and line-item data. Configure the restricted key for those operations and validate its dependent permissions in Stripe before activation. It does not need refund, payout or balance-transfer permissions. No secret was retrieved or created for this draft.

The fixed live prices are `price_1UFUoGBVUFmkZjNkG7vyLCFo` and `price_1UFUoUBVUFmkZjNk18GxhWCs`. The backend rejects test keys and test sessions. Stripe REST and Stripe.js use the matching `2026-07-29.dahlia` / `dahlia` interface, `ui_mode: embedded_page` and `createEmbeddedCheckoutPage`.

Keep email confirmation enabled. Add narrowly scoped Supabase Auth redirect allowlist entries for these paths on the canonical domain and, if served directly, its `www` alias:

- `/checkout.html?plan=premium&access=ready`
- `/checkout.html?plan=family&access=ready`
- `/start.html?access=ready`

The fixed Stripe return URL is `https://billsavingsai.com/start.html?account_checkout=return&session_id={CHECKOUT_SESSION_ID}`. Password reset uses the same allowlisted account URLs; no arbitrary redirect target is accepted.

## Payment ownership and lifecycle

Checkout is bound to the verified Auth user ID in its client reference and session/subscription metadata. Edited Stripe billing email cannot select another app account. The return endpoint checks live mode, exact price, amount, currency, quantity, payment status, subscription status and current billing period before writing the entitlement.

The webhook recognizes the new `account_checkout: v1` marker, rejects malformed ownership data, verifies the confirmed Auth owner and preserves newer subscription lifecycle changes. Untagged existing Payment Link events keep the legacy behavior. Both new writers use conditional writes to avoid overwriting concurrent changes. The existing billing entitlement RPC remains the app's access check.

Retries reuse one creation idempotency key on the page, and an already-recorded subscription blocks another checkout. Multiple tabs with different request IDs can still create multiple unpaid sessions before the first subscription is recorded; this draft does not claim a global one-session-per-user guarantee.

## Verification and rollout gate

Run the repository suite with Node 24: `node --test tests/*.test.mjs`.

Automated tests cover password login/signup/recovery, missing provider configuration, ownership mismatch, unpaid and canceled states, fixed plan validation, retries, concurrent billing writes, preserved legacy behavior and callback routing. They use synthetic provider responses and do not prove that the live provider integration works.

Interactive preview was attempted through the supported browser, but the local preview URL was blocked (`ERR_BLOCKED_BY_CLIENT`). Responsive visual checks and real embedded Stripe mounting remain unverified.

Before merging or switching customer traffic:

1. Provide an isolated test deployment and test-mode counterpart using separate test prices/credentials and isolated billing data. Do not change production checks to accept test sessions or write test entitlements into live accounts. This draft has no deployed test counterpart.
2. Verify signup confirmation, returning password login, password reset, payment success/decline/cancel, account ownership, webhook/return ordering, mobile layout and Stripe/Link/3DS behavior without charging a real card.
3. Configure the production endpoint and its exact auth redirects securely. Deploy the tagged webhook handler before creating tagged live sessions. Verify legacy Payment Link handling still works.
4. Publish the frontend only after those checks pass. Retain the existing live frontend as the rollback target; keep the legacy return handler and existing links available for purchases already in progress.

Email delivery to spam and the older sender display name remain a separate provider-configuration issue. This draft does not inspect or modify anyone's mailbox and does not claim to fix deliverability.

## References

- [Stripe embedded Checkout](https://docs.stripe.com/payments/accept-a-payment?payment-ui=checkout&ui=embedded-page)
- [Stripe security and CSP](https://docs.stripe.com/security/guide)
- [Payment Link custom-field restrictions](https://docs.stripe.com/payment-links/customize)
- [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords)
