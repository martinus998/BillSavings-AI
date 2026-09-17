# Simple account and payment flow

This supersedes the experimental embedded-checkout draft. It reuses the deployed
Stripe Payment Links, signed live webhook, `billing-access`, and
`claim_billing_entitlement`. No new Stripe keys, schema changes or provider
configuration are required.

## Customer experience

1. Choose Premium or Family; enter email and password on `checkout.html`.
2. New accounts confirm their email once. The existing confirmation return opens
   `start.html`; an explicit Continue button resumes the selected plan for up to
   one hour. That browser preference cannot grant access.
3. A confirmed signed-in account continues to the existing Stripe payment page.
   Its verified email is prefilled and locked by Stripe's link parameter.
4. Stripe returns to the account. Server-verified payment receipt and account
   ownership checks restore the purchased plan. Delayed confirmation offers retry.
5. Returning customers use email and password. Existing email-link users can use
   “Forgot password or need to set one?” once to choose their password.

Passwords go only to Supabase Auth, never to Stripe, query strings, logs or app
storage. Confirmation stays enabled. The editable payment URL is not proof of
account ownership; the existing server's verified email checks remain decisive.
Frontend checkout return handling no longer requests sign-in emails.

The account session uses tab-scoped sessionStorage, not persistent localStorage.
Browser tab restore can preserve that storage; use Sign out to end a session
explicitly. Account and checkout pages normalize `www` to the apex domain so a
normal same-tab Stripe return can retain the account session.

## Verification

Run `node --test tests/*.test.mjs`. The suite covers password signup and recovery,
confirmed account checks, callback errors, mismatched purchases, pending payment
retries, stale responses after signout, existing subscription checks, fixed price
links and malformed server responses. Existing webhook reliability tests remain.

Manual release checks: the public account form and both plan pages load; new
signup asks for email and password only; invalid plans cannot continue; no new
backend endpoint is needed. No real payment is made by automated tests. A complete
live purchase and private inbox delivery are not verified by these checks.
