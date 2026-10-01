/* ============================================================
   TAS PERSONAL TRAINING — Service Worker (PWA)
   ------------------------------------------------------------
   Caching strategy (keeps the app offline-capable but NEVER
   stale after a deploy):
    • App shell (HTML/CSS/JS/icons/manifest) → network-first,
      cache fallback. When the network responds, the fresh copy
      is written back to the cache, so a later offline load uses
      the newest version.
    • Google Fonts → stale-while-revalidate (they are immutable).
    • Supabase API calls & Drive images → pass through untouched
      (data must always be live; auth headers are preserved).
   Version bump below forces a clean cache on the next deploy.
   ============================================================ */
'use strict';

const VERSION = 'tas-pwa-v2';
const SHELL_CACHE   = VERSION + '-shell';
const RUNTIME_CACHE = VERSION + '-runtime';

const PRECACHE = [
  './',
  './index.html',
  './css/styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './js/config.js', './js/drive-images.js', './js/utils.js', './js/toast.js',
  './js/state.js', './js/exercise-library.js', './js/supabase-client.js',
  './js/realtime.js', './js/report.js', './js/contacts.js', './js/auth.js',
  './js/sessions.js', './js/exercises.js', './js/progress.js',
  './js/class-times.js', './js/approvals.js', './js/notifications.js',
  './js/reminders.js', './js/clients.js', './js/settings.js', './js/reports.js',
  './js/workspace.js', './js/wipe.js', './js/update-site.js', './js/pwa.js',
  './js/main.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isPassthrough(url) {
  // Live data / third-party assets must never be intercepted by our caches.
  return url.hostname.includes('supabase.co') ||
         url.hostname.endsWith('googleapis.com') && url.pathname.includes('/storage/') ||
         url.hostname.includes('googleusercontent.com') ||
         url.hostname.includes('drive.google.com');
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (isPassthrough(url)) return;

  // Cross-origin fonts: stale-while-revalidate in runtime cache.
  if (url.origin !== location.origin) {
    if (!url.hostname.includes('fonts.g')) return;
    e.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const net = fetch(req).then((res) => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || net;
      })
    );
    return;
  }

  // Same-origin app shell: network-first with cache fallback.
  e.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        const cached = await cache.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') {
          const shell = await cache.match('./index.html');
          if (shell) return shell;
        }
        throw err;
      }
    })()
  );
});

// Let js/pwa.js trigger an immediate refresh once a new SW is waiting.
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
