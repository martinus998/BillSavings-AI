(() => {
  const form = document.getElementById('authForm');
  const password = document.getElementById('authPassword');
  const title = document.getElementById('authTitle');
  const submit = document.getElementById('authSubmit');
  const status = document.getElementById('checkoutStatus');
  if (!form || !password || !title || !submit || !status) return;

  const allowedSymbol = /[!@#$%^&*()_+\-=\[\]{};'\\:"|<>?,.\/`~]/;
  const policy = value => ({
    length: value.length >= 10,
    lower: /[a-z]/.test(value),
    upper: /[A-Z]/.test(value),
    number: /[0-9]/.test(value)
  });
  const meetsPolicy = checks => Object.values(checks).every(Boolean);
  const isSignup = () => /create your account/i.test(title.textContent || '') || /create account/i.test(submit.textContent || '');

  const help = document.createElement('p');
  help.id = 'passwordPolicyHelp';
  help.className = 'small';
  help.style.margin = '-2px 0 12px';
  help.style.lineHeight = '1.55';
  password.setAttribute('aria-describedby', help.id);
  const toggle = document.getElementById('showPassword');
  (toggle?.parentNode || password.parentNode)?.insertBefore(help, toggle ? toggle.nextSibling : null);

  let lastSubmissionMetPolicy = false;

  function renderHelp() {
    if (!isSignup()) {
      help.hidden = true;
      return;
    }
    help.hidden = false;
    password.minLength = 10;
    const c = policy(password.value);
    if (!password.value) {
      help.textContent = 'Password: 10+ characters with uppercase, lowercase and a number. Symbols are optional.';
      help.style.color = '#9ab6d1';
      return;
    }
    help.textContent = `${c.length ? '✓' : '•'} 10+ characters · ${c.lower && c.upper ? '✓' : '•'} upper & lowercase · ${c.number ? '✓' : '•'} number`;
    help.style.color = meetsPolicy(c) ? '#79efc9' : '#ffd08a';
  }

  function showError(message) {
    status.textContent = message;
    status.hidden = false;
    status.classList.add('err');
  }

  password.addEventListener('input', renderHelp);
  form.addEventListener('submit', event => {
    if (!isSignup()) return;
    const checks = policy(password.value);
    lastSubmissionMetPolicy = meetsPolicy(checks);
    if (lastSubmissionMetPolicy) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showError('Use at least 10 characters with uppercase and lowercase letters and a number.');
    password.focus();
    renderHelp();
  }, true);

  const observer = new MutationObserver(() => {
    renderHelp();
    if (lastSubmissionMetPolicy && status.classList.contains('err') && /at least 10 characters/i.test(status.textContent || '')) {
      status.textContent = 'Please choose a different unique password. This password was rejected by the account security check.';
    }
  });
  observer.observe(title, { childList: true, characterData: true, subtree: true });
  observer.observe(submit, { childList: true, characterData: true, subtree: true });
  observer.observe(status, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });

  renderHelp();
})();
