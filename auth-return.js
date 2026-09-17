// Route implicit Supabase email callbacks before homepage resources and analytics.
// The account page verifies the session; URL parameters never grant paid access.
(function () {
  const incoming = new URLSearchParams(window.location.hash.slice(1));
  const hasToken = incoming.has('access_token') || incoming.has('refresh_token');
  const hasError = incoming.has('error') || incoming.has('error_code');
  if (!hasToken && !hasError) return;

  window.BILLSAVINGS_AUTH_RETURN = true;
  const referrer = document.createElement('meta');
  referrer.name = 'referrer';
  referrer.content = 'no-referrer';
  document.head.appendChild(referrer);

  const outgoing = new URLSearchParams();
  const invalidReturn = () => {
    outgoing.set('error', 'invalid_request');
    outgoing.set('error_code', 'invalid_auth_callback');
    outgoing.set('error_description', 'This sign-in link is incomplete. Request a new link.');
  };
  if (hasError) {
    // An error takes precedence over any tokens supplied alongside it.
    for (const key of ['error', 'error_code', 'error_description']) {
      const value = incoming.get(key);
      if (value) outgoing.set(key, value);
    }
    if (!outgoing.has('error') && !outgoing.has('error_code')) invalidReturn();
  } else {
    const completePair = ['access_token', 'refresh_token'].every(key =>
      incoming.getAll(key).length === 1 && incoming.get(key).trim().length > 0);
    if (!completePair) {
      // Do not carry partial or ambiguous credentials to the account page.
      invalidReturn();
    } else {
      for (const key of ['access_token', 'refresh_token', 'expires_in', 'expires_at', 'token_type', 'type']) {
        const value = incoming.get(key);
        if (value) outgoing.set(key, value);
      }
    }
  }

  const destination = new URL('/start.html', window.location.origin);
  destination.searchParams.set('access', 'ready');
  destination.hash = outgoing.toString();
  window.location.replace(destination.href);
})();
