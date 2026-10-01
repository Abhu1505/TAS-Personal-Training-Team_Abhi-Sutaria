// ============================================================
// 📲 PWA — service-worker registration + install prompt
// ------------------------------------------------------------
// • Registers /sw.js (network-first app shell → offline support).
// • When a new SW is waiting, it activates immediately and lets
//   js/update-site.js handle the user-facing reload flow.
// • Captures `beforeinstallprompt` so an "Install app" chip can
//   appear in the login card on supporting browsers.
// ============================================================
(function () {
  'use strict';

  if (!('serviceWorker' in navigator)) return;
  // file:// has no SW support and would only log errors.
  if (location.protocol !== 'https:' && !/^localhost$|^127\.|\[::1\]/.test(location.hostname)) return;

  function registerSW() {
    const scope = location.pathname.replace(/\/[^/]*$/, '/'); // folder containing index.html
    const swUrl = (scope.endsWith('/') ? scope : scope + '/') + 'sw.js';
    navigator.serviceWorker.register(swUrl, { scope: scope })
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            // A fresh deploy's SW is ready — hand over control silently.
            // update-site.js already offers the visible "🔄 Update Site" button.
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              try { nw.postMessage('SKIP_WAITING'); } catch (e) {}
            }
          });
        });
      })
      .catch(() => { /* offline / unsupported — the app keeps working normally */ });
  }

  if ('requestIdleCallback' in window) requestIdleCallback(registerSW, { timeout: 4000 });
  else window.addEventListener('load', registerSW, { once: true });

  /* ---------- Install chip on the login card ---------- */
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallChip();
  });

  function showInstallChip() {
    if (document.getElementById('pwaInstallBtn')) return;
    const card = document.getElementById('loginCard');
    if (!card) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'pwaInstallBtn';
    btn.className = 'btn-secondary btn-small pwa-install-btn';
    btn.title = 'Add this portal to your home screen for one-tap access';
    btn.innerHTML = '📲 Install app';
    btn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
      if (choice.outcome === 'accepted') btn.remove();
      deferredPrompt = null;
    });
    const status = document.getElementById('unifiedStatus');
    card.insertBefore(btn, status || null);
  }

  window.addEventListener('appinstalled', () => {
    const b = document.getElementById('pwaInstallBtn');
    if (b) b.remove();
    if (typeof showToast === 'function') showToast('✅ TAS Training installed to your device.', 'success');
  });

  // If running *in* standalone mode there is nothing to install.
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (!standalone && deferredPrompt) showInstallChip();
})();
