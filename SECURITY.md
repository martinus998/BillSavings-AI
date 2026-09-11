# BillSavings AI Security Policy

## Non-negotiable rules

- Never commit passwords, bank details, card data, API secrets, merchant secret keys, private keys, service-account files, session tokens or customer documents to this repository.
- Only public client-side identifiers and public checkout URLs may appear in the GitHub Pages source.
- Production customer uploads, billing data and medical documents must be handled by a secured backend with authentication, encryption, access controls, retention/deletion rules and audit logging. They must never be stored in GitHub Pages or browser source code.
- Merchant payout and banking information belongs only inside the payment provider.
- Keep the Google Search Console verification file in place so ownership verification remains valid.
- All production changes should be reviewed against the automated Security Audit workflow before deployment.

## Recovery

A dated backup branch is maintained so the public site can be restored if the main branch is damaged or changed accidentally.
