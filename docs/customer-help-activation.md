# Customer support and portal activation

## Public support inbox

The owner explicitly chose `Martinus998@azet.sk` for both websites on September 17, 2026. It is configured in both customer-help scripts and included as a static mailto link on the relevant pages, so visitors can find it even without JavaScript. The owner needs to monitor this inbox and enable notifications; no message was sent and email delivery was not tested during this change.

## Active Stripe-hosted customer portal

The owner activated the portal in the Stripe Dashboard on September 17, 2026. Read-only Stripe API verification confirmed the following for the **BillSavings AI** live account (`acct_1UEPjdBVUFmkZjNk`):

- Configuration: `bpc_1UGel5BVUFmkZjNkcRqV3MRa`; active, default and live.
- Public login URL: `https://billing.stripe.com/p/login/bJedR869sfGbdtOeIC1sQ00`.
- Subscription cancellation enabled at the end of the paid period (`at_period_end`); no proration.
- Invoice history and payment-method updates enabled.
- Subscription plan switching and pausing disabled.

`BILL_PORTAL_URL` is configured in `customer-help.js`. The account, contact and cancellation-policy pages contain the same static link, so public support pages also work without JavaScript. The script is versioned as `20260917-portal` on those pages. A browser check confirmed the public login form shows BillSavings AI and asks for the customer's email. No email was submitted, payment initiated, or subscription cancelled.

The connected Stripe app refused portal creation due to its API-key permissions; the owner performed activation manually. No alternative credential was used to bypass that restriction.

## Remaining checks

The portal configuration currently has no default return URL, privacy URL or terms URL. In **Business information**, set:

- Return URL: `https://billsavingsai.com/start.html`
- Privacy policy: `https://billsavingsai.com/privacy.html`
- Terms of service: `https://billsavingsai.com/terms.html`

With an authorized test customer, verify email delivery and cancellation at period end. Confirm the subscription webhook preserves access until the paid period ends and revokes access when Stripe cancels it. A new complete signup, upload, AI analysis and purchase flow is not yet verified.

A Dashboard screenshot also showed a negative-EUR-balance warning. The connected API denied `GetBalance`; the balance and cause remain unverified and need checking in the owner's Dashboard. No balance or payout settings were changed.

Official setup: https://docs.stripe.com/customer-management/activate-no-code-customer-portal

Do not change tax, prices, payment methods, or payment-link destinations as part of activation.
