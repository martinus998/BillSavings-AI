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

The owner saved the following portal details on September 17, 2026. The return
URL was verified through the Stripe API; screenshots show the legal links inherited
from public business information (null configuration overrides do not mean missing links):

- Return URL: `https://billsavingsai.com/start.html`
- Privacy policy: `https://billsavingsai.com/privacy.html`
- Terms of service: `https://billsavingsai.com/terms.html`

With an authorized test customer, verify email delivery and cancellation at period end. Confirm the subscription webhook preserves access until the paid period ends and revokes access when Stripe cancels it. A new complete signup, upload, AI analysis and purchase flow is not yet verified.

Dashboard screenshots show EUR -0.10 available and -0.53 incoming, matching a
0.53 processing fee plus 0.05 Radar and 0.05 Billing fees after a full refund.
The owner deferred a 0.63 SEPA top-up; no transfer or receipt of funds is confirmed.
The selected top-up screen was the refunds/disputes reserve, so it has not been
verified that this route clears the existing fee balance. The connected API
denied `GetBalance`; no alternate credential was used. Monday automatic payouts
to Revolut describe outgoing payouts, not confirmation of a bank debit.

Official setup: https://docs.stripe.com/customer-management/activate-no-code-customer-portal

Do not change tax, prices, payment methods, or payment-link destinations as part of activation.
