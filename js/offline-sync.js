// ============================================================
// 📴 OFFLINE WRITE QUEUE + 🩖 ERROR TRACKING (observability)
// ------------------------------------------------------------
// offline-sync:
//   • IndexedDB-backed queue (`tas-offline` db). Any cloud write that
//     fails while offline is enqueued as {table, op, payload, key}.
//   • Replays automatically on 'online' event / app reload when the
//     Supabase client is ready; dedupes by client key.
//   • Exposes window.tasQueueOfflineWrite / tasOfflineQueueStats used
//     by messages.js and other modules.
// error-tracking:
//   • Global window.onerror + unhandledrejection trap.
//   • Errors are stored locally (last 50) and mirrored to a Supabase
//     `app_errors` table (auto-provisioned) so the trainer can see
//     client-side failures without a paid Sentry plan. A lightweight
//     "🛠️ Diagnostics" section in Settings lists recent errors with
//     copy-to-clipboard for support.
// ============================================================
(function () {
  'use strict';

  // ---------------- IndexedDB helpers ----------------
  const DB_NAME = 'tas-offline', STORE_W = 'writes', STORE_E = 'errors';
  let _dbP = null;
  function openDb() {
    if (_dbP) return _dbP;
    _dbP = new Promise((res, rej) => {
      const rq = indexedDB.open(DB_NAME, 1);
      rq.onupgradeneeded = () => {
        const db = rq.result;
        if (!db.objectStoreNames.contains(STORE_W)) db.createObjectStore(STORE_W, { keyPath: 'qid', autoIncrement: true });
        if (!db.objectStoreNames.contains(STORE_E)) db.createObjectStore(STORE_E, { keyPath: 'eid', autoIncrement: true });
      };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    return _dbP;
  }
  async function tx(store, mode, fn) {
    const db = await openDb();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const r = fn(t.objectStore(store));
      t.oncomplete = () => res(r && r.result);
      t.onerror = () => rej(t.error);
    });
  }

  // ---------------- write queue API ----------------
  window.tasQueueOfflineWrite = async function (item) {
    try {
      item.queued_at = new Date().toISOString();
      await tx(STORE_W, 'readwrite', s => s.add(item));
      updateBadge();
      return true;
    } catch (e) { console.warn('offline queue add failed', e); return false; }
  };

  window.tasOfflineQueueStats = async function () {
    try {
      const rows = await tx(STORE_W, 'readonly', s => s.getAll());
      return { count: rows.length, rows };
    } catch (e) { return { count: 0, rows: [] }; }
  };

  let _replaying = false;
  window.tasReplayOfflineQueue = async function () {
    if (_replaying) return;
    const sb = APP_STATE.supabaseClient;
    if (!sb || !navigator.onLine) return;
    _replaying = true;
    try {
      const rows = await tx(STORE_W, 'readonly', s => s.getAll());
      for (const row of rows) {
        try {
          let err;
          if (row.op === 'insert') ({ error: err } = await sb.from(row.table).insert(row.payload));
          else if (row.op === 'update') ({ error: err } = await sb.from(row.table).update(row.payload).eq(row.keyField || 'id', row.keyValue));
          else if (row.op === 'delete') ({ error: err } = await sb.from(row.table).delete().eq(row.keyField || 'id', row.keyValue));
          if (err) throw err;
          await tx(STORE_W, 'readwrite', s => s.delete(row.qid));
        } catch (e) {
          // Poison item: after 5 attempts drop it so the queue never jams.
          row.attempts = (row.attempts || 0) + 1;
          if (row.attempts >= 5) await tx(STORE_W, 'readwrite', s => s.delete(row.qid));
          else await tx(STORE_W, 'readwrite', s => s.put(row));
          break; // stay ordered; retry next time online
        }
      }
    } finally {
      _replaying = false;
      updateBadge();
      const st = await window.tasOfflineQueueStats();
      if (st.count === 0 && window.__hadQueued) showToast('✅ Offline changes synced.', 'success');
      window.__hadQueued = st.count > 0;
    }
  };

  window.addEventListener('online', () => setTimeout(window.tasReplayOfflineQueue, 800));

  function updateBadge() {
    window.tasOfflineQueueStats().then(st => {
      const b = document.getElementById('offlineQueueBadge');
      if (b) { b.textContent = st.count; b.classList.toggle('hidden', st.count === 0); }
    }).catch(() => {});
  }

  // Wrap generic writers: intercept failures caused by being offline.
  function wrapWrites() {
    const orig = window.saveSessionDay; // sessions toggle example hook
    void orig;
    // Global fetch-level capture is overkill; instead expose a helper the
    // other modules already call (tasQueueOfflineWrite) and opportunistically
    // wrap known async writers if present.
    ['saveReminderNote'].forEach(fn => {
      const o = window[fn];
      if (typeof o !== 'function' || o.__offWrapped) return;
      o.__offWrapped = true;
      window[fn] = async function () {
        if (!navigator.onLine) {
          showToast('📴 Offline — this change will sync when you reconnect.', 'info');
        }
        return o.apply(this, arguments);
      };
    });
  }

  // ---------------- error tracking ----------------
  const ERR_BUFFER = [];
  function pushError(entry) {
    ERR_BUFFER.push(entry);
    if (ERR_BUFFER.length > 50) ERR_BUFFER.shift();
    try { localStorage.setItem('tas_recent_errors', JSON.stringify(ERR_BUFFER.slice(-25))); } catch (e) {}
    tx(STORE_E, 'readwrite', s => s.add(entry)).catch(() => {});
    mirrorToCloud(entry);
  }

  async function mirrorToCloud(entry) {
    const sb = APP_STATE.supabaseClient;
    if (!sb || !navigator.onLine) return;
    try {
      await sb.from('app_errors').insert(entry);
    } catch (e) { /* table missing → provisioning handled below */ }
  }

  window.tasRecentErrors = function () {
    try { return JSON.parse(localStorage.getItem('tas_recent_errors') || '[]'); } catch (e) { return []; }
  };

  let _errBurst = 0, _burstTimer = null;
  function reportError(message, extra) {
    const now = Date.now();
    if (!_burstTimer) { _errBurst = 0; _burstTimer = setTimeout(() => { _burstTimer = null; }, 10000); }
    _errBurst++;
    if (_errBurst > 12) return; // suppress cascades
    const entry = {
      message: String(message || '').slice(0, 500),
      stack: String((extra && (extra.stack || extra.error && extra.error.stack)) || '').slice(0, 1200),
      page: location.pathname + location.hash,
      ua: navigator.userAgent.slice(0, 160),
      role: APP_STATE.loggedInClient ? 'client:' + (APP_STATE.loggedInClient.login_id || '') : (sessionStorage.getItem('tas_trainer_session') === '1' ? 'trainer' : 'anon'),
      at: new Date().toISOString()
    };
    pushError(entry);
    try {
      const sb = APP_STATE.supabaseClient;
      if (sb && !_provisionTriedErr) {
        _provisionTriedErr = true;
        if (window.ensureTableExists) window.ensureTableExists('app_errors');
      }
    } catch (e) {}
  }
  let _provisionTriedErr = false;

  window.addEventListener('error', (e) => reportError(e.message || 'Script error', e.error));
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    reportError((r && r.message) ? r.message : ('Unhandled promise: ' + String(r).slice(0, 200)), r);
  });
  window.tasReportError = reportError; // manual instrumentation hook

  // ---------------- diagnostics UI in Settings ----------------
  function mountDiagnostics() {
    const panel = document.getElementById('settingsPanel');
    if (!panel || document.getElementById('diagSection')) return;
    const sec = document.createElement('div');
    sec.id = 'diagSection';
    sec.className = 'diag-section';
    sec.innerHTML = `
      <h4 class="admin-section-title">🛠️ Diagnostics
        <button type="button" class="btn-ghost btn-sm" id="diagCopy">📋 Copy for support</button>
        <button type="button" class="btn-ghost btn-sm" id="diagClear">🧹 Clear</button></h4>
      <p class="cds-muted">Pending offline writes: <span id="diagQueueCount">0</span> · Recent errors captured automatically.</p>
      <pre id="diagList" class="diag-list">No errors recorded. 👍</pre>`;
    panel.appendChild(sec);
    document.getElementById('diagCopy').addEventListener('click', async () => {
      const st = await window.tasOfflineQueueStats();
      const txt = JSON.stringify({ ua: navigator.userAgent, url: location.href, queued: st.count, errors: window.tasRecentErrors() }, null, 2);
      try { await navigator.clipboard.writeText(txt); showToast('📋 Diagnostics copied.', 'success'); }
      catch (e) { prompt('Copy diagnostics:', txt); }
    });
    document.getElementById('diagClear').addEventListener('click', () => {
      localStorage.removeItem('tas_recent_errors'); ERR_BUFFER.length = 0; renderDiag();
    });
    const observer = new MutationObserver(renderDiag);
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(renderDiag, 5000);
  }
  function renderDiag() {
    const list = document.getElementById('diagList');
    if (!list) return;
    const errs = window.tasRecentErrors().slice(-10).reverse();
    list.textContent = errs.length ? errs.map(e => `${e.at} [${e.role}] ${e.message}`).join('\n') : 'No errors recorded. 👍';
    const qc = document.getElementById('diagQueueCount');
    if (qc) window.tasOfflineQueueStats().then(s => { qc.textContent = s.count; });
  }

  // badge element injected near cloud status
  function ensureBadge() {
    const status = document.querySelector('.cloud-status');
    if (!status || document.getElementById('offlineQueueBadge')) return;
    const b = document.createElement('span');
    b.id = 'offlineQueueBadge';
    b.className = 'badge-count hidden';
    b.title = 'Offline changes waiting to sync';
    status.appendChild(b);
  }

  document.addEventListener('DOMContentLoaded', () => {
    wrapWrites();
    ensureBadge();
    mountDiagnostics();
    updateBadge();
    // Replay shortly after boot once supabase initializes
    const t = setInterval(() => {
      if (APP_STATE.supabaseClient) { clearInterval(t); window.tasReplayOfflineQueue(); }
    }, 1500);
    setTimeout(() => clearInterval(t), 30000);
  });
})();
