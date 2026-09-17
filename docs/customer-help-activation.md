# Remaining customer support activation

The reliability fixes are independent of these activation steps. Do not claim that support or cancellation is ready until both values below are confirmed.

## Public support inbox

Obtain the owner's chosen public, monitored support email. Do not publish the owner's private login or Git commit email by assumption. Set `BILL_SUPPORT_EMAIL` in `customer-help.js` and `REPAIR_SUPPORT_EMAIL` in the RepairCostMatch repository. Check both contact pages and the BillSavings account page after deploying.

## Stripe-hosted customer portal

The connected Stripe app refused `PostBillingPortalConfigurations` because its API key lacks the required permission. No alternative credential was used to bypass that restriction.

For the **BillSavings AI** live account (`acct_1UEPjdBVUFmkZjNk`), open https://dashboard.stripe.com/settings/billing/portal.

1. Enable subscription cancellation at the end of the current paid period.
2. Enable payment-method updates and invoice history. Leave plan switching disabled to preserve the existing product choices and prices.
3. Set return URL to `https://billsavingsai.com/start.html`, privacy URL to `https://billsavingsai.com/privacy.html`, and terms URL to `https://billsavingsai.com/terms.html`.
4. Activate the hosted login link. Send back that public `https://billing.stripe.com/p/login/...` link; no API secret or password is needed.
5. Set `BILL_PORTAL_URL` in `customer-help.js`. The existing hooks then expose the link on the account, contact and cancellation-policy pages. Stripe verifies ownership by emailing the customer; the website does not accept a customer ID from the browser.
6. Verify the live login page and, with an authorized test customer, cancellation at period end. Confirm the subscription webhook preserves access until the paid period ends and revokes access when Stripe cancels it.

Official setup: https://docs.stripe.com/customer-management/activate-no-code-customer-portal

Customer-facing placeholders remain hidden. Current pages must not promise an active portal before this step is complete. Do not change tax, prices, payment methods, or payment-link destinations as part of activation.
