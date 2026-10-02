// ============================================================
// 🔄 UPDATE SITE — deployment watcher (client + admin portal)
// ------------------------------------------------------------
// How it works:
//  • This page itself is a fingerprint of the deployed version.
//    Every deploy changes index.html, so we hash the raw HTML
//    (no-store fetch) and compare it with the copy that produced
//    the currently-running page (saved in localStorage).
//  • On boot: if the saved fingerprint differs from what the
//    browser served us, an even NEWER deploy already happened →
//    show the popup immediately.
//  • Then we re-check every 60s while the tab is open. When a new
//    deployment is detected the "🔄 Update Site" button appears
//    and a popup tells the user their content is still the old
//    cached version until they update.
//  • Clicking the button stores the new fingerprint and does a
//    cache-busting reload, so the browser loads the latest
//    deployment. Until then the site keeps working on the old
//    (cached) page — nothing else breaks.
// ============================================================
(function () {
  'use strict';

  const KEY = 'tas_site_fingerprint_v1';
  const CHECK_MS = 60 * 1000; // poll once a minute
  let currentFp = null;       // fingerprint of the page actually running
  let updateReady = false;

  async function hashText(str) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      // Fallback for non-secure contexts: simple djb2 hash.
      let h = 5381;
      for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
      return 'djb2-' + (h >>> 0).toString(16);
    }
  }

  async function fetchLiveFingerprint() {
    const url = location.pathname.split('?')[0].split('#')[0] + '?_up=' + Date.now();
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return hashText(await res.text());
  }

  /* ---------- UI ---------- */
  function showUpdateButton() {
    ['adminUpdateSiteBtn', 'clientUpdateSiteBtn'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.classList.remove('hidden');
    });
  }

  function ensurePopup() {
    let p = document.getElementById('updateSitePopup');
    if (p) return p;
    p = document.createElement('div');
    p.id = 'updateSitePopup';
    p.className = 'update-site-popup';
    p.innerHTML = `
      <div class="usp-icon">🆕</div>
      <div class="usp-text"><strong>A new update is available!</strong><br>
        A newer version of this site is live on the server. You are still viewing
        the old cached page — you won't see the updated content until you press
        <em>🔄 Update Site</em>.</div>
      <div class="usp-actions">
        <button class="btn-secondary btn-small" id="uspLaterBtn" type="button">⏳ Later</button>
        <button class="btn-update-site btn-small" id="uspUpdateBtn" type="button">🔄 Update Site now</button>
      </div>`;
    document.body.appendChild(p);
    document.getElementById('uspLaterBtn').addEventListener('click', () => {
      p.classList.add('hidden');
    });
    document.getElementById('uspUpdateBtn').addEventListener('click', doUpdate);
    return p;
  }

  function doUpdate() {
    try { localStorage.setItem(KEY, currentFp || ''); } catch (e) {}
    // Cache-busting reload so the browser must fetch the newest deployment.
    const base = location.href.split('#')[0];
    const clean = base.replace(/[?&]_r=[^&]*/, '');
    location.assign(clean + (clean.includes('?') ? '&' : '?') + '_r=' + Date.now());
  }

  function markUpdateAvailable(liveFp) {
    currentFp = liveFp;
    if (updateReady) return;
    updateReady = true;
    showUpdateButton();
    ensurePopup().classList.remove('hidden');
    ['adminUpdateSiteBtn', 'clientUpdateSiteBtn'].forEach(id => {
      const b = document.getElementById(id);
      if (b && !b.dataset.usBound) {
        b.dataset.usBound = '1';
        b.addEventListener('click', doUpdate);
      }
    });
    if (typeof showToast === 'function') showToast('🆕 New site update available — press 🔄 Update Site.', 'info', 6000);
  }

  /* ---------- detection ---------- */
  async function checkForUpdate(firstRun) {
    try {
      const liveFp = await fetchLiveFingerprint();
      const saved = localStorage.getItem(KEY);
      if (firstRun) {
        // Bind click handlers even before an update exists (cheap safety).
        ['adminUpdateSiteBtn', 'clientUpdateSiteBtn'].forEach(id => {
          const b = document.getElementById(id);
          if (b && !b.dataset.usBound) { b.dataset.usBound = '1'; b.addEventListener('click', doUpdate); }
        });
        if (saved && saved !== liveFp) {
          // The server already has something newer than the page we're running.
          markUpdateAvailable(liveFp);
        } else if (!saved) {
          try { localStorage.setItem(KEY, liveFp); } catch (e) {}
        }
        return;
      }
      if (liveFp !== (currentFp || saved || localStorage.getItem(KEY))) {
        markUpdateAvailable(liveFp);
      }
    } catch (e) { /* offline / file:// — silently keep working */ }
  }

  window.initUpdateSiteWatcher = function () {
    if (window.__usWatchInit) return;
    window.__usWatchInit = true;
    checkForUpdate(true);
    setInterval(() => {
      if (!document.hidden && !updateReady) checkForUpdate(false);
    }, CHECK_MS);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !updateReady) checkForUpdate(updateReady);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.initUpdateSiteWatcher());
  } else {
    window.initUpdateSiteWatcher();
  }
})();
