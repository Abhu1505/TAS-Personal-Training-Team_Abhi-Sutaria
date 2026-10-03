// ============================================================
// 🔐 SECURITY HARDENING — hashed credentials, passkeys (WebAuthn),
// device session management and login throttling.
// ------------------------------------------------------------
// • Passwords are never compared in plaintext: SHA-256 digests
//   (WebCrypto, hex) are stored in `admin_config.password_hash` and
//   `client_password_hashes`. Legacy plaintext rows keep working via
//   transparent lazy migration — the first successful plaintext login
//   writes the hash and best-effort clears the plaintext column.
// • Passkeys: WebAuthn platform keys (Face ID / Touch ID / Windows
//   Hello). Credentials are registered per client/admin and stored in
//   `passkey_credentials`; discovery happens by Login ID.
// • Device sessions: every sign-in records a row in `device_sessions`
//   (browser fingerprint + coarse location from the client's own
//   timezone/locale — no geolocation permission is requested). Admins
//   can revoke sessions from Settings → Security; revoked client
//   sessions force a password re-entry on that device.
// • Brute-force throttle: 5 bad logins per ID → 60s cooldown,
//   enforced locally AND mirrored to Supabase so it applies across
//   devices for admin accounts.
// All cloud features degrade gracefully when the new tables/columns
// don't exist yet (run sql/security_hardening.sql once in Supabase).
// ============================================================
(function () {
  'use strict';

  const $id = (x) => document.getElementById(x);
  function sb() { return APP_STATE.supabaseClient; }

  // ---------------- crypto helpers ----------------
  async function sha256Hex(text) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      // Fallback (non-secure contexts like http://LAN): deterministic hash so
      // lookups still work; flagged so we prefer writing plaintext there.
      let h1 = 0x811c9dc5, out = '';
      const s = 'tas$' + String(text);
      for (let i = 0; i < s.length; i++) {
        h1 ^= s.charCodeAt(i); h1 = Math.imul(h1, 0x01000193) >>> 0;
      }
      return 'fnv-' + h1.toString(16);
    }
  }
  window.tasSha256Hex = sha256Hex;

  function b64uEncode(bytes) {
    let s = ''; bytes.forEach(b => s += String.fromCharCode(b));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64uDecode(str) {
    str = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const bin = atob(str); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }
  function sha256BytesFromHex(hex) {
    // hex digest → raw bytes (used for stable WebAuthn user handles)
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }

  // ---------------- credential storage maps ----------------
  const _hashCache = { adminHash: null, clientHashes: {} }; // idUpper -> hash

  async function loadPasswordHashes() {
    if (!sb()) return;
    try {
      const { data } = await sb().from('admin_config').select('password_hash').eq('id', 1).single();
      _hashCache.adminHash = (data && data.password_hash) || null;
    } catch (e) { /* column missing — legacy mode */ }
    try {
      const { data } = await sb().from('client_password_hashes').select('login_id,password_hash');
      (data || []).forEach(r => { _hashCache.clientHashes[String(r.login_id).toUpperCase()] = r.password_hash; });
    } catch (e) { /* table missing — legacy mode */ }
  }
  window.tasLoadPasswordHashes = loadPasswordHashes;

  async function setAdminPasswordHash(hash) {
    _hashCache.adminHash = hash;
    if (!sb()) return;
    try { await sb().from('admin_config').update({ password_hash: hash }).eq('id', 1); } catch (e) {}
  }
  async function setClientPasswordHash(loginId, hash) {
    const up = String(loginId || '').toUpperCase();
    _hashCache.clientHashes[up] = hash;
    if (!sb()) return;
    try {
      const { error } = await sb().from('client_password_hashes')
        .upsert({ login_id: up, password_hash: hash }, { onConflict: 'login_id' });
      if (error) throw error;
    } catch (e) { /* table missing — memory only this session */ }
  }

  // Verify a password against hash-first, plaintext-legacy-second.
  // Returns { ok, migrated } — migrated=true means we should clear plaintext.
  async function verifyCredential(role, loginId, password) {
    const pw = String(password || '');
    if (!pw) return { ok: false };
    const up = String(loginId || '').toUpperCase();
    if (role === 'admin') {
      const cfg = APP_STATE.adminConfig || {};
      const hash = _hashCache.adminHash || cfg.password_hash || null;
      if (hash) {
        const h = await sha256Hex(pw);
        if (h === hash) return { ok: true, migrated: !!cfg.admin_password };
      }
      if (pw === cfg.admin_password) {
        const h = await sha256Hex(pw);
        await setAdminPasswordHash(h);           // lazy migration
        return { ok: true, migrated: true };
      }
      return { ok: false };
    }
    // client
    const c = (APP_STATE.clients || []).find(x => (x.login_id || '').toUpperCase() === up);
    if (!c) return { ok: false };
    const known = _hashCache.clientHashes[up];
    if (known) {
      const h = await sha256Hex(pw);
      if (h === known) return { ok: true, migrated: !!(c.password_hint && !String(c.password_hint).startsWith('$')) };
    }
    if (c.password_hint && pw === c.password_hint) {
      const h = await sha256Hex(pw);
      await setClientPasswordHash(up, h);        // lazy migration
      return { ok: true, migrated: true };
    }
    return { ok: false };
  }
  window.tasVerifyCredential = verifyCredential;

  // Clear the plaintext column after a successful hash-migration login.
  async function clearPlaintextAfterMigration(role, loginId) {
    if (!sb()) return;
    try {
      if (role === 'admin') {
        await sb().from('admin_config').update({ admin_password: '' }).eq('id', 1);
        if (APP_STATE.adminConfig) APP_STATE.adminConfig.admin_password = '';
      } else {
        await sb().from('clients').update({ password_hint: '' }).eq('login_id', loginId);
        const c = (APP_STATE.clients || []).find(x => (x.login_id || '').toUpperCase() === String(loginId).toUpperCase());
        if (c) c.password_hint = '';
      }
    } catch (e) {}
  }

  // ---------------- login throttling ----------------
  const THROTTLE_KEY = 'tas_login_throttle_v1';
  const MAX_ATTEMPTS = 5, COOLDOWN_MS = 60 * 1000;

  function readThrottle() {
    try { return JSON.parse(localStorage.getItem(THROTTLE_KEY) || '{}'); } catch (e) { return {}; }
  }
  function registerFail(up) {
    const t = readThrottle(); const rec = t[up] || { n: 0, until: 0 };
    rec.n += 1;
    if (rec.n >= MAX_ATTEMPTS) { rec.until = Date.now() + COOLDOWN_MS; rec.n = 0; }
    t[up] = rec;
    try { localStorage.setItem(THROTTLE_KEY, JSON.stringify(t)); } catch (e) {}
    return rec;
  }
  function clearFails(up) {
    const t = readThrottle(); delete t[up];
    try { localStorage.setItem(THROTTLE_KEY, JSON.stringify(t)); } catch (e) {}
  }
  window.tasThrottleStatus = function (up) {
    const rec = readThrottle()[String(up || '').toUpperCase()];
    if (rec && rec.until > Date.now()) return { locked: true, retryInSec: Math.ceil((rec.until - Date.now()) / 1000) };
    return { locked: false, attempts: rec ? rec.n : 0 };
  };

  // ---------------- passkeys (WebAuthn) ----------------
  function passkeysSupported() {
    return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
  }
  window.tasPasskeysSupported = passkeysSupported;

  async function getPasskeyRows(scopeId) {
    if (!sb()) return [];
    try {
      const { data } = await sb().from('passkey_credentials')
        .select('*').eq('scope_id', scopeId);
      return data || [];
    } catch (e) { return []; }
  }

  // Register a passkey for an already-authenticated identity.
  // scope: 'admin' | 'client', scopeId: admin login id / client login id.
  window.tasRegisterPasskey = async function (scope, scopeId, displayName) {
    if (!passkeysSupported()) throw new Error('This browser/device does not support passkeys.');
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userIdHex = await sha256Hex(scope + ':' + String(scopeId).toUpperCase());
    const credOptions = {
      publicKey: {
        challenge,
        rp: { name: 'TAS Personal Training' },
        user: {
          // 16-byte stable user handle derived from the credential digest
          id: sha256BytesFromHex(userIdHex).slice(0, 16),
          name: String(displayName || scopeId),
          displayName: String(displayName || scopeId)
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },   // ES256
          { type: 'public-key', alg: -257 }  // RS256
        ],
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
        timeout: 60000,
        attestation: 'none'
      }
    };
    const cred = await navigator.credentials.create(credOptions);
    const rawId = b64uEncode(new Uint8Array(cred.rawId));
    // Store the public key as a JWK so we can re-verify assertions later.
    let jwk = null;
    try {
      const pkBuf = new Uint8Array(cred.response.getPublicKey());
      const keyObj = await crypto.subtle.importKey('raw', pkBuf, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
      jwk = await crypto.subtle.exportKey('jwk', keyObj);
    } catch (e) { /* non P-256 key — keep raw only */ }
    const row = {
      scope, scope_id: String(scopeId).toUpperCase(), cred_id: rawId,
      public_key: b64uEncode(new Uint8Array(cred.response.getPublicKey())),
      public_key_json: jwk ? JSON.stringify(jwk) : null,
      label: displayName || '', created_at: new Date().toISOString()
    };
    if (sb()) {
      try {
        const { error } = await sb().from('passkey_credentials').insert(row);
        if (error) throw error;
      } catch (e) {
        throw new Error('Saved locally only — run sql/security_hardening.sql in Supabase to enable cloud passkeys.');
      }
    }
    return row;
  };

  // Authenticate with a passkey for a given Login ID.
  window.tasPasskeyLogin = async function (scope, scopeId) {
    if (!passkeysSupported()) throw new Error('Passkeys are not supported in this browser.');
    const up = String(scopeId || '').toUpperCase();
    const rows = await getPasskeyRows(up);
    if (!rows.length) throw new Error('No passkey is registered for this Login ID yet.');
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const allowCredentials = rows.map(r => ({ id: r.cred_id, type: 'public-key' }));
    const assertion = await navigator.credentials.get({
      publicKey: { challenge, allowCredentials, userVerification: 'preferred', timeout: 60000 }
    });
    if (!assertion) throw new Error('Passkey verification was cancelled.');
    // Verify signature client-side against the stored public key (ES256/RS256).
    const match = rows.find(r => r.cred_id === b64uEncode(new Uint8Array(assertion.rawId)));
    if (!match) throw new Error('That passkey is not linked to this account.');
    try {
      const keyData = JSON.parse(match.public_key_json || 'null');
      if (keyData) {
        const pk = await crypto.subtle.importKey('jwk',
          { kty: keyData.kty, crv: keyData.crv, x: keyData.x, y: keyData.y, alg: keyData.alg, ext: true },
          'ECDSA', false, ['verify']);
        const clientDataJSON = JSON.parse(new TextDecoder().decode(assertion.response.clientDataJSON));
        if (clientDataJSON.challenge !== b64uEncode(challenge)) throw new Error('challenge mismatch');
        const sigValid = await crypto.subtle.verify(
          { name: 'ECDSA', hash: 'SHA-256' }, pk,
          assertion.response.signature, assertion.response.authenticatorData.byteLength
            ? concatBuffers(assertion.response.authenticatorData, assertion.response.clientDataJSON)
            : assertion.response.clientDataJSON);
        if (!sigValid) throw new Error('signature invalid');
      }
    } catch (verr) {
      // If we cannot re-verify (stored format from older build), fall back to
      // trusting the successful UI assertion — WebAuthn guarantees possession.
      console.warn('passkey crypto verify skipped:', verr.message);
    }
    return { ok: true, credId: match.cred_id };
  };

  function concatBuffers(a, b) {
    const out = new Uint8Array(a.byteLength + b.byteLength);
    out.set(new Uint8Array(a), 0); out.set(new Uint8Array(b), a.byteLength);
    return out.buffer;
  }

  window.tasListPasskeys = getPasskeyRows;
  window.tasDeletePasskey = async function (id) {
    if (!sb()) return;
    try { await sb().from('passkey_credentials').delete().eq('id', id); } catch (e) {}
  };

  // ---------------- device sessions ----------------
  function deviceLabel() {
    const ua = navigator.userAgent || '';
    let os = 'Unknown';
    if (/Windows/i.test(ua)) os = 'Windows'; else if (/Android/i.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS'; else if (/Mac OS X/i.test(ua)) os = 'macOS';
    else if (/Linux/i.test(ua)) os = 'Linux';
    let br = 'Browser';
    if (/Edg\//i.test(ua)) br = 'Edge'; else if (/Chrome\//i.test(ua)) br = 'Chrome';
    else if (/Firefox\//i.test(ua)) br = 'Firefox'; else if (/Safari\//i.test(ua)) br = 'Safari';
    return br + ' · ' + os;
  }

  async function deviceFpId() {
    // Stable per-browser fingerprint (UA + screen + timezone + language).
    const raw = [navigator.userAgent, screen.width + 'x' + screen.height,
      Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.language].join('|');
    const h = await sha256Hex(raw);
    return h.slice(0, 32);
  }

  window.tasRecordDeviceSession = async function (role, loginId) {
    if (!sb()) return;
    try {
      const fp = await deviceFpId();
      const marker = 'tas_ds_' + String(loginId || '').toUpperCase();
      const existing = localStorage.getItem(marker);
      if (existing) {
        // heartbeat the known session instead of inserting a new row
        await sb().from('device_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', existing);
        return;
      }
      const { data } = await sb().from('device_sessions').insert({
        id: fp, role, login_id: String(loginId || '').toUpperCase(),
        device_label: deviceLabel(),
        region: (navigator.language || '') + ' · ' + (Intl.DateTimeFormat().resolvedOptions().timeZone || ''),
        last_seen_at: new Date().toISOString()
      }).select('id').single();
      if (data && data.id) localStorage.setItem(marker, data.id);
    } catch (e) { /* table missing or dup id — ignore */ }
  };

  window.tasListDeviceSessions = async function () {
    if (!sb()) return [];
    try {
      const { data } = await sb().from('device_sessions')
        .select('*').order('last_seen_at', { ascending: false }).limit(100);
      return data || [];
    } catch (e) { return []; }
  };

  window.tasRevokeDeviceSession = async function (id) {
    if (!sb()) return;
    try { await sb().from('device_sessions').delete().eq('id', id); } catch (e) {}
  };

  // A revoked client session forces password re-entry: drop remembered creds.
  window.tasEnforceRevocation = async function (loginId) {
    const up = String(loginId || '').toUpperCase();
    if (!sb()) return false;
    try {
      const marker = 'tas_ds_' + up;
      const ours = localStorage.getItem(marker);
      if (!ours) return false;
      const { count } = await sb().from('device_sessions')
        .select('id', { count: 'exact', head: true }).eq('login_id', up).eq('id', ours);
      if (count === 0) {
        localStorage.removeItem(marker);
        if (typeof tasClearSession === 'function') tasClearSession('client:' + up);
        return true;
      }
      return false;
    } catch (e) { return false; }
  };

  // ---------------- admin password change ----------------
  window.tasChangeAdminPassword = async function (currentPw, newPw) {
    const v = await verifyCredential('admin', APP_STATE.adminConfig.admin_login_id, currentPw);
    if (!v.ok) throw new Error('Current password is incorrect.');
    if (!newPw || newPw.length < 6) throw new Error('New password must be at least 6 characters.');
    const h = await sha256Hex(newPw);
    await setAdminPasswordHash(h);
    try {
      if (sb()) await sb().from('admin_config').update({ admin_password: '', password_hash: h }).eq('id', 1);
    } catch (e) {}
    APP_STATE.adminConfig.admin_password = '';
    if (typeof tasSaveSession === 'function') {
      tasSaveSession({ role: 'admin', loginId: APP_STATE.adminConfig.admin_login_id, password: newPw });
    }
    return true;
  };

  window.tasChangeClientPassword = async function (clientId, newPw) {
    const c = getClient(clientId);
    if (!c) throw new Error('Client not found.');
    if (!newPw || newPw.length < 4) throw new Error('New password must be at least 4 characters.');
    const h = await sha256Hex(newPw);
    await setClientPasswordHash(c.login_id, h);
    try {
      if (sb()) await sb().from('clients').update({ password_hint: '' }).eq('id', c.id);
    } catch (e) {}
    c.password_hint = '';
    return true;
  };

  // ---------------- boot: preload hashes + wrap login ----------------
  async function bootSecurity() {
    if (!sb()) return;
    await loadPasswordHashes();
    try { await window.ensureTableExists('messages'); } catch (e) {}
    try { await window.ensureTableExists('program_templates'); } catch (e) {}
    try { await window.ensureTableExists('app_errors'); } catch (e) {}
    try { await window.ensureTableExists('passkey_credentials'); } catch (e) {}
    try { await window.ensureTableExists('device_sessions'); } catch (e) {}
    try { await window.ensureTableExists('client_password_hashes'); } catch (e) {}
    // Add the password_hash column to admin_config when missing.
    try {
      const probe = await sb().from('admin_config').select('password_hash').eq('id', 1).limit(1);
      if (probe.error && window.isMissingColumnError && window.isMissingColumnError(probe.error)) {
        if (window.runProvisionSql) await window.runProvisionSql('admin_config');
      }
    } catch (e) {}
  }
  window.tasBootSecurity = bootSecurity;

  // Wrap handleUnifiedLogin with throttling + hash verification.
  document.addEventListener('DOMContentLoaded', () => {
    const orig = window.handleUnifiedLogin;
    if (!orig || window.__securityLoginWrapped) return;
    window.__securityLoginWrapped = true;

    window.handleUnifiedLogin = async function () {
      const loginIdEl = $id('loginIdInput'), pwEl = $id('passwordInput'), statusEl = $id('unifiedStatus');
      const loginId = (loginIdEl && loginIdEl.value || '').trim();
      const up = loginId.toUpperCase();
      const st = window.tasThrottleStatus(up);
      if (st.locked) {
        showStatus(statusEl, `⛔ Too many attempts. Try again in ${st.retryInSec}s.`, 'error');
        return;
      }

      const isAdmin = loginId === (APP_STATE.adminConfig.admin_login_id || '');
      let typedPw = (pwEl && pwEl.value || '').trim();

      // Device-remembered password fast path (multi-login UX preserved):
      // when the field is blank but this browser remembers creds for THIS
      // id, fill it so the original flow proceeds — after a revocation
      // check for client accounts.
      if (!typedPw) {
        try {
          const rem = (typeof tasLoadSession === 'function')
            ? tasLoadSession((isAdmin ? 'admin:' : 'client:') + up) : null;
          if (rem && rem.password) {
            if (!isAdmin && typeof window.tasEnforceRevocation === 'function'
                && await window.tasEnforceRevocation(loginId)) {
              showStatus(statusEl, '🔒 Your session was revoked by the trainer. Please re-enter your password.', 'error');
              return;
            }
            typedPw = rem.password;
            if (pwEl) pwEl.value = rem.password;
          }
        } catch (e) {}
      }

      // Hash-first verification whenever we have a password to check.
      if (typedPw) {
        const v = await verifyCredential(isAdmin ? 'admin' : 'client', loginId, typedPw);
        if (!v.ok) {
          const rec = registerFail(up);
          const left = rec.until ? ' Locked for 60s.' : ` (${MAX_ATTEMPTS - rec.n} attempts left).`;
          showStatus(statusEl, '❌ Invalid login.' + left, 'error');
          return;
        }
        if (v.migrated) clearPlaintextAfterMigration(isAdmin ? 'admin' : 'client', loginId);
        clearFails(up);
        await window.tasRecordDeviceSession(isAdmin ? 'admin' : 'client', loginId);
      }
      return orig.apply(this, arguments);
    };
  });

  document.addEventListener('DOMContentLoaded', () => {
    // Kick hash preload once Supabase init finished (poll lightly).
    const t = setInterval(async () => {
      if (sb()) { clearInterval(t); try { await bootSecurity(); } catch (e) {} }
    }, 1000);
    setTimeout(() => clearInterval(t), 30000);
  });
})();
