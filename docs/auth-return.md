# Email return to the homepage

The owner confirmed receipt of a sign-in email (in spam) and then showed the public homepage after opening its link. That screenshot does not confirm an authenticated session or expose the callback parameters. The current email template and Auth redirect allowlist were not accessible; the precise reason for the homepage destination remains unverified.

The code review found a definite gap: the homepage did not process Supabase implicit callbacks, and its Sign In link discarded the original fragment when opening the account page.

## Change

- An early, synchronous `auth-return.js` routes implicit token pairs and Auth errors to the fixed same-origin `/start.html?access=ready` destination.
- Only required implicit fields are retained in the fragment. No tokens are converted into query parameters, written to storage by the router, logged or sent to analytics.
- Missing, blank or duplicate token pairs produce a safe error. Auth errors take precedence over tokens.
- `plan`, checkout proofs, arbitrary return URLs and provider tokens are not forwarded.
- The homepage skips analytics and sets no-referrer for this callback only. Ordinary visits and anchors behave as before.
- The account page checks returned SDK errors, explains expired or invalid links using fixed text, and never opens checkout automatically following an Auth callback.
- Existing session verification and entitlement checks remain authoritative. A callback flag or token-shaped string does not grant a paid plan.

This changes no database schema, permissions, Supabase Auth configuration, Stripe prices or Payment Links. The separate sandbox migration remains unapproved and undeployed. PKCE and custom token-hash email templates are outside this change.

## Verification

Run `node --test tests/*.test.mjs`. Routing tests use synthetic fragments; account-page tests cover expired links, returned SDK errors, verified-session handling and preserved purchase-first behavior.

After publishing, verify the synthetic error return in the browser and complete a fresh owner-assisted sign-in. A screenshot of the homepage alone is not a passed login test. If the email link contains no Auth callback parameters, its template or configured redirect needs correction separately.
