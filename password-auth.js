// Account credentials are sent only to Supabase Auth, never to Stripe or a URL.
export function createPasswordAuth({
  supabase,
  root,
  redirectTo,
  initialMode = 'signin',
  onAuthenticated = () => {},
  onRecovery = () => {},
  onStatus = () => {}
}) {
  const ids = ['authForm', 'authEmail', 'authPassword', 'authConfirm', 'authConfirmField',
    'authSubmit', 'authModeBtn', 'authForgotBtn', 'authTitle', 'authCopy'];
  const elements = Object.fromEntries(ids.map(id => [id, root.querySelector(`#${id}`)]));
  if (ids.some(id => !elements[id])) throw new Error('The account form is incomplete.');
  const el = elements;
  let mode = 'signin';
  let busy = false;
  let destroyed = false;
  let recoveryUserId = null;
  let generation = 0;
  let recoveryTimer = null;
  const resetNotice = 'If an account uses this email, a password reset link will arrive shortly. Check your inbox and spam folder.';

  const status = (message, kind = 'info') => {
    if (!destroyed) onStatus(message, kind);
  };
  const clearPasswords = () => {
    el.authPassword.value = '';
    el.authConfirm.value = '';
  };
  function setBusy(value) {
    busy = !!value;
    for (const id of ['authSubmit', 'authModeBtn', 'authForgotBtn', 'authPassword', 'authConfirm']) {
      el[id].disabled = busy;
    }
    el.authEmail.disabled = busy || mode === 'recovery';
    el.authForm.setAttribute('aria-busy', String(busy));
  }
  function renderMode() {
    const isNewPassword = mode === 'signup' || mode === 'recovery';
    el.authEmail.required = mode !== 'recovery';
    el.authPassword.required = mode !== 'reset';
    el.authPassword.hidden = mode === 'reset';
    const passwordField = el.authPassword.closest('.field') || el.authPassword.closest('label');
    if (passwordField) passwordField.hidden = mode === 'reset';
    el.authPassword.autocomplete = isNewPassword ? 'new-password' : 'current-password';
    el.authPassword.minLength = isNewPassword ? 10 : 1;
    el.authConfirm.required = isNewPassword;
    el.authConfirmField.hidden = !isNewPassword;
    el.authConfirmField.classList.toggle('hidden', !isNewPassword);
    el.authForgotBtn.hidden = mode === 'reset' || mode === 'recovery';
    el.authModeBtn.hidden = mode === 'recovery';
    const copy = {
      signin: ['Sign in', 'Use your email and password to access your account.', 'Sign in', 'Create an account'],
      signup: ['Create your account', 'Choose a password for future visits. Confirm your email once to secure your account.', 'Create account', 'Already have an account? Sign in'],
      reset: ['Reset your password', 'Use this if you forgot your password or previously signed in using an email link.', 'Send reset link', 'Back to sign in'],
      recovery: ['Set your password', 'Choose a new password for this verified account.', 'Save password', 'Back to sign in']
    }[mode];
    [el.authTitle.textContent, el.authCopy.textContent, el.authSubmit.textContent, el.authModeBtn.textContent] = copy;
    setBusy(busy);
  }
  function setMode(nextMode) {
    if (destroyed || busy || !['signin', 'signup', 'reset'].includes(nextMode)) return false;
    generation += 1;
    recoveryUserId = null;
    mode = nextMode;
    clearPasswords();
    renderMode();
    status('');
    return true;
  }
  async function showRecovery(session) {
    if (destroyed || busy) return false;
    const requestGeneration = ++generation;
    recoveryUserId = null;
    clearPasswords();
    setBusy(true);
    try {
      // Neither a callback type flag nor a caller-supplied session authorizes an update.
      const { data, error } = await supabase.auth.getUser();
      if (destroyed || requestGeneration !== generation) return false;
      if (error || !data?.user?.id || (session?.user?.id && session.user.id !== data.user.id)) {
        throw new Error('Unverified account');
      }
      recoveryUserId = data.user.id;
      mode = 'recovery';
      el.authEmail.value = data.user.email || '';
      renderMode();
      status('Choose your new password below.');
      await onRecovery(session || { user: data.user });
      return true;
    } catch {
      if (destroyed || requestGeneration !== generation) return false;
      mode = 'reset';
      renderMode();
      status('This password reset link is invalid or expired. Request a new link.', 'error');
      return false;
    } finally {
      if (!destroyed && requestGeneration === generation) setBusy(false);
    }
  }
  function handleAuthEvent(event, session) {
    if (destroyed) return;
    if (event === 'SIGNED_OUT') {
      generation += 1;
      recoveryUserId = null;
      clearTimeout(recoveryTimer);
      recoveryTimer = null;
      clearPasswords();
      mode = 'signin';
      setBusy(false);
      renderMode();
      return;
    }
    if (event === 'PASSWORD_RECOVERY') {
      clearTimeout(recoveryTimer);
      // Auth callbacks run under the SDK lock. Call Auth methods after it is released.
      recoveryTimer = setTimeout(() => { recoveryTimer = null; void showRecovery(session); }, 0);
    }
  }
  async function submit(event) {
    event.preventDefault();
    if (busy || destroyed) return;
    const email = el.authEmail.value.trim();
    const password = el.authPassword.value;
    if (mode !== 'recovery' && !/^\S+@\S+\.\S+$/.test(email)) {
      status('Enter a valid email address.', 'error');
      return;
    }
    if (mode !== 'reset' && !password) {
      status('Enter your password.', 'error');
      return;
    }
    if ((mode === 'signup' || mode === 'recovery') && password.length < 10) {
      status('Use a password with at least 10 characters.', 'error');
      return;
    }
    if ((mode === 'signup' || mode === 'recovery') && password !== el.authConfirm.value) {
      status('The passwords do not match.', 'error');
      return;
    }
    const submittedMode = mode;
    const requestGeneration = generation;
    setBusy(true);
    status(mode === 'reset' ? 'Requesting your reset link…' : 'Securing your account…');
    try {
      if (submittedMode === 'reset') {
        // Use identical feedback for unknown and existing addresses, including provider errors.
        await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (!destroyed && requestGeneration === generation) status(resetNotice);
        return;
      }
      if (submittedMode === 'recovery') {
        const { data: current, error: currentError } = await supabase.auth.getUser();
        if (destroyed || requestGeneration !== generation) return;
        if (!recoveryUserId || currentError || current?.user?.id !== recoveryUserId) {
          throw new Error('Unverified account');
        }
        const { data: updated, error } = await supabase.auth.updateUser({ password });
        if (error || updated?.user?.id !== recoveryUserId) throw new Error('Password update failed');
        if (destroyed || requestGeneration !== generation) return;
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || data?.session?.user?.id !== recoveryUserId) throw new Error('Session unavailable');
        recoveryUserId = null;
        status('Your password is saved.');
        await onAuthenticated(data.session);
        return;
      }
      const result = submittedMode === 'signup'
        ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } })
        : await supabase.auth.signInWithPassword({ email, password });
      if (destroyed || requestGeneration !== generation) return;
      if (result.error) throw new Error('Authentication failed');
      if (result.data?.session?.user?.id) {
        status('Signed in.');
        await onAuthenticated(result.data.session);
      } else if (submittedMode === 'signup') {
        // With email confirmation enabled, a user response alone is not a login.
        status('Check your email to confirm your account, then return here to sign in. Already registered? Sign in or use Reset password.');
      } else {
        throw new Error('Session unavailable');
      }
    } catch {
      if (destroyed || requestGeneration !== generation) return;
      const messages = {
        signin: 'Could not sign in. Check your email and password, confirm your email if needed, or use Reset password.',
        signup: 'Could not create the account. Try again later, or sign in or reset your password if you already have an account.',
        reset: resetNotice,
        recovery: 'Could not save your password. Request a new reset link and try again.'
      };
      status(messages[submittedMode], submittedMode === 'reset' ? 'info' : 'error');
    } finally {
      clearPasswords();
      if (!destroyed && requestGeneration === generation) setBusy(false);
    }
  }
  const toggleMode = () => setMode(mode === 'signin' ? 'signup' : 'signin');
  const forgot = () => setMode('reset');
  el.authForm.addEventListener('submit', submit);
  el.authModeBtn.addEventListener('click', toggleMode);
  el.authForgotBtn.addEventListener('click', forgot);
  setMode(initialMode === 'signup' ? 'signup' : 'signin');
  return {
    setMode,
    showRecovery,
    handleAuthEvent,
    setBusy,
    get mode() { return mode; },
    get busy() { return busy; },
    destroy() {
      destroyed = true;
      generation += 1;
      clearTimeout(recoveryTimer);
      clearPasswords();
      el.authForm.removeEventListener('submit', submit);
      el.authModeBtn.removeEventListener('click', toggleMode);
      el.authForgotBtn.removeEventListener('click', forgot);
    }
  };
}
