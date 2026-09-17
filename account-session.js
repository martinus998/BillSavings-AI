import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';

export const SUPABASE_URL = 'https://bkyuyqicybqqifenhhux.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_o-RgVfTUjzfne4DC9QcGfQ_4QGg5CVr';

// Capture only routing flags before the SDK consumes an email callback fragment.
// These flags are presentation hints, never evidence of a valid account session.
export const initialAuthReturn = (() => {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const failed = params.has('error') || params.has('error_code');
  return Object.freeze({
    received: failed || params.has('access_token') || params.has('refresh_token'),
    failed,
    expired: params.get('error_code') === 'otp_expired',
    type: params.get('type') === 'recovery' ? 'recovery' : null
  });
})();

// A new storage key deliberately does not adopt older persistent browser sessions.
// sessionStorage normally ends with the tab. Browser session/tab restoration can
// preserve it; an explicit Sign out is the reliable way to end access immediately.
const memory = new Map();
let storage;
try { storage = window.sessionStorage; } catch { storage = null; }
const tabStorage = {
  getItem(key) {
    if (storage) {
      try {
        const value = storage.getItem(key);
        if (value === null) memory.delete(key);
        else memory.set(key, value);
        return value;
      } catch { storage = null; }
    }
    return memory.get(key) ?? null;
  },
  setItem(key, value) {
    memory.set(key, value);
    if (storage) {
      try { storage.setItem(key, value); } catch { storage = null; }
    }
  },
  removeItem(key) {
    memory.delete(key);
    if (storage) {
      try { storage.removeItem(key); } catch { storage = null; }
    }
  }
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: tabStorage,
    storageKey: 'billsavings.account.v1',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit'
  }
});
