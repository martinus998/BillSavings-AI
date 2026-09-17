# Purchase-first access

Premium and Family keep their existing prices and hosted Stripe Payment Links.
Both links already redirect to `start.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`.

After a verified live paid checkout, the webhook saves the entitlement and a
service-only receipt containing a SHA-256 session hash and checkout email.
The return page requests an access email without asking the buyer to type it again.
Supabase Auth sends the existing passwordless sign-in email. The buyer must open
that email to prove mailbox ownership. The checkout proof never creates an
authenticated browser session or bypasses paid-analysis authorization.

An already signed-in buyer whose confirmed email matches the receipt skips the
email and uses the existing `claim_billing_entitlement` RPC. Other signed-in
accounts cannot claim this purchase. A missing receipt is shown as waiting for
Stripe confirmation, never as proof of a successful payment.

## Delivery and recovery

- New `billing-access` Edge Function uses a webhook-backed checkout proof as
  custom authentication; deploy with `verify_jwt: false`. It separately verifies
  any optional user JWT through `getUser` before comparing confirmed emails.
- The browser cannot choose the recipient, redirect URL, plan or account ID.
  Only a masked email is returned, with `Cache-Control: no-store` and exact
  production-origin CORS. Never log the request proof or authorization header.
- The checkout proof expires after 24 hours. Refreshes reuse the sent state.
  Explicit retries have a 60-second durable compare-and-set lock and a maximum
  of five attempts. Provider rate limits continue to apply. An interrupted send
  may require another attempt; email delivery is not an exactly-once operation.
- The receipt's expiry limits use, not physical database retention. Receipts are
  service-only; include expired records in routine billing-data retention cleanup.
- `start.html` uses `no-referrer`; the session ID is removed from the address bar
  and kept only in this tab's session storage until sign-in or expiry.
- Manual email sign-in and the existing support inbox remain available for old
  purchases, expired receipts, disabled storage, provider errors and rate limits.
- Email callbacks use the fixed production `start.html?access=ready` redirect;
  this URL must be allowed in Supabase Auth. Existing templates and SMTP are used.
- Paid access remains subject to the current subscription/entitlement rules,
  including cancellation. An emailed login link alone does not grant a paid plan.

## Deployment and verification

Apply the `checkout_access_delivery` migration before deploying the webhook and
`billing-access`, then publish the frontend. No Stripe key or payment-link change
is required. To roll back the frontend, restore the previous `start.js` and
`start.html`; the additional receipt table and endpoint do not affect manual sign-in.

Run `node --test tests/*.test.mjs`. Tests cover signed webhook failure/retry,
receipt idempotency, unpaid sessions, delayed success, recipient binding, verified
account matching, concurrency, refresh, expiry, cooldowns, email failure, browser
recovery and releasing the auth callback lock before entitlement RPCs.
Run `supabase/tests/checkout-access.sql` in a transaction; it rolls back all
synthetic rows and checks grants, RLS, expiry and the compare-and-set condition.

These isolated checks do not prove live email delivery. A complete purchase,
inbox delivery and activation test requires an authorized customer/payment test.
No real emails or payments are sent by the automated tests.

Primary references:
- https://docs.stripe.com/payment-links/post-payment
- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://supabase.com/docs/reference/javascript/auth-onauthstatechange
