// DOM + formatting helpers + UI status helpers
window.$ = (id) => document.getElementById(id);

window.escapeHtml = (t) => {
  const d = document.createElement('div');
  d.textContent = t ?? '';
  return d.innerHTML;
};

window.showStatus = function (el, msg, type = 'error') {
  // Inline status element (kept for context-sensitive panels)…
  if (el) {
    el.textContent = msg;
    el.className = 'status-msg';
    if (type === 'success') el.classList.add('status-success');
    else if (type === 'error') el.classList.add('status-error');
    else if (type === 'info') el.classList.add('status-info');
    else if (type === 'warning') el.classList.add('status-warning');
    if (type !== 'info') setTimeout(() => {
      if (el.textContent === msg) { el.textContent = ''; el.className = 'status-msg'; }
    }, 5000);
  }
  // …plus a professional floating toast so feedback is always visible.
  if (typeof window.showToast === 'function' && msg) {
    window.showToast(String(msg).replace(/^[✅❌⚠️ℹ️📧⏳🗑️💾📩]+\s*/, ''), type);
  }
};

// ============================================================
// Trainer WhatsApp alerts — whenever a client sends any request
// (edit a finished day, profile change, progress entry) the app
// opens a WhatsApp chat to the trainer with the details so they
// can do the needful. Number lives in APP_CONFIG.TRAINER_WHATSAPP.
// ============================================================
window.notifyTrainerWhatsApp = function (message) {
  try {
    const raw = String((APP_CONFIG && APP_CONFIG.TRAINER_WHATSAPP) || '').replace(/\D/g, '');
    if (!raw) return false;
    const enc = encodeURIComponent(message);
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const url = isMobile
      ? `whatsapp://send?phone=${raw}&text=${enc}`
      : `https://wa.me/${raw}?text=${enc}`;
    window.open(url, '_blank');
    return true;
  } catch (e) { console.warn('trainer whatsapp alert failed', e); return false; }
};

window.isTrainerSession = function () {
  try { return sessionStorage.getItem('tas_trainer_session') === '1'; } catch (e) { return false; }
};

window.clearStatus = function (el) {
  if (el) { el.textContent = ''; el.className = 'status-msg'; }
};

window.setCloudStatus = function (online) {
  const el = $('cloudStatus'); if (!el) return;
  el.classList.toggle('online', online);
  const t = $('cloudStatusText');
  if (t) t.textContent = online ? '☁️ Connected' : '⚠️ Offline';
};

/* ============================================================
   THEME ENGINE — automatic light/dark based on SUNRISE & SUNSET
   ------------------------------------------------------------
   Modes stored in localStorage under 'tas_theme_mode':
     'auto'   (default) → 🌙 dark between sunset and sunrise,
                          ☀️ light between sunrise and sunset.
     'light'  → manual override, always light.
     'dark'   → manual override, always dark.

   Sunrise/sunset are computed locally with a NOAA solar-position
   algorithm (no external API needed) using the browser geolocation
   when available. If the user denies location, we fall back to a
   sensible default: Dubai (25.2°N, 55.3°E), then system preference.

   The toggle button cycles: auto → light → dark → auto.
   A timer re-checks every minute so the page flips exactly at the
   sun event without a reload.
   ============================================================ */

// --- NOAA sunrise/sunset calculation (accurate to ~1 minute) ---
window.computeSunTimes = function (date, lat, lon) {
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  // Day of year (UTC-based is fine for our purposes)
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86400000);
  const zen = 90.833 * rad; // official zenith incl. refraction + sun radius
  const calc = (isRise) => {
    const lngHour = lon / 15;
    const t = isRise
      ? dayOfYear + ((6 - lngHour) / 24)
      : dayOfYear + ((18 - lngHour) / 24);
    // Sun's mean anomaly
    const M = (0.9856 * t) - 3.289;
    // Sun's true longitude
    let L = M + (1.916 * Math.sin(M * rad)) + (0.020 * Math.sin(2 * M * rad)) + 283.0;
    L = ((L % 360) + 360) % 360;
    // Sun's right ascension
    let RA = (deg * Math.atan(0.91764 * Math.tan(L * rad)));
    RA = ((RA % 360) + 360) % 360;
    RA += Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90;
    RA /= 15;
    // Local sidereal time at Greenwich
    const T = 6.656 + 0.06571 * t + 1.0027 * lngHour;
    // Sun's local hour angle
    let H = (T - RA) * 15;
    H = ((H + 180) % 360 + 360) % 360 - 180;
    const cosH = (Math.cos(zen * rad) - Math.sin(lat * rad) * Math.sin(L * rad)) /
                 (Math.cos(lat * rad) * Math.cos(L * rad));
    if (cosH > 1 || cosH < -1) return null; // sun never rises/sets (polar)
    H = deg * Math.acos(isRise ? Math.cos(((360 - H) * rad)) : H * rad) / 15;
    // Adjust for longitude and fix rounding
    let ut = H + lngHour;
    ut = ((ut % 24) + 24) % 24;
    return ut; // hours UTC
  };
  const build = (utHours) => {
    if (utHours == null) return null;
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    d.setUTCHours(Math.floor(utHours), Math.round((utHours % 1) * 60), 0, 0);
    return d;
  };
  return { sunrise: build(calc(true)), sunset: build(calc(false)) };
};

// --- Decide which theme should be active right now ---
window.isDarkBySun = function (now, lat, lon) {
  const times = window.computeSunTimes(now, lat, lon);
  if (!times.sunrise || !times.sunset) {
    // Polar edge cases — fall back to clock heuristic (18:00–06:00 dark)
    const h = now.getHours();
    return h >= 18 || h < 6;
  }
  // Compare in LOCAL wall-clock time. computeSunTimes returns UTC Date
  // objects; local hours = UTC sun-hours + the browser's timezone offset.
  // (Using raw UTC hours made the theme flip ~4h early/late outside the
  // Dubai fallback longitude — this fixes auto mode worldwide.)
  const off = -now.getTimezoneOffset() / 60;
  const srH = (times.sunrise.getUTCHours() + times.sunrise.getUTCMinutes() / 60 + off + 24) % 24;
  const ssH = (times.sunset.getUTCHours()  + times.sunset.getUTCMinutes()  / 60 + off + 24) % 24;
  const cur = now.getHours() + now.getMinutes() / 60;
  // Dark from sunset until sunrise (handles crossing midnight)
  return ssH <= srH ? (cur >= ssH || cur < srH) : (cur >= ssH && cur < srH);
};

window.getCurrentLocation = function () {
  return new Promise((resolve) => {
    try {
      const cached = JSON.parse(localStorage.getItem('tas_geo') || 'null');
      if (cached && Date.now() - cached.ts < 12 * 3600 * 1000) {
        return resolve({ lat: cached.lat, lon: cached.lon });
      }
    } catch (e) {}
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const g = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        try { localStorage.setItem('tas_geo', JSON.stringify({ ...g, ts: Date.now() })); } catch (e) {}
        resolve(g);
      },
      () => resolve(null),
      { timeout: 6000, maximumAge: 6 * 3600 * 1000 }
    );
  });
};

let _sunWatchTimer = null;
let _themeFirstApply = false;
let _sunGeoRequested = false;
let _sunGeo = { lat: 25.2, lon: 55.3 }; // fallback: Dubai (site locale)

window.applyAutoTheme = async function () {
  const mode = (() => { try { return localStorage.getItem('tas_theme_mode') || 'auto'; } catch (e) { return 'auto'; } })();
  let theme;
  if (mode === 'light' || mode === 'dark') {
    theme = mode; // manual override wins
  } else {
    if (mode === 'auto' && !_sunGeoRequested) {
      _sunGeoRequested = true;
      const geo = await window.getCurrentLocation();
      if (geo) _sunGeo = geo;
    }
    theme = window.isDarkBySun(new Date(), _sunGeo.lat, _sunGeo.lon) ? 'dark' : 'light';
  }
  const prev = document.documentElement.getAttribute('data-theme');
  // Only touch the attribute when it actually changes — avoids needless
  // repaints every minute while the sun state is stable.
  const changed = (prev || 'light') !== theme;
  if (changed) {
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
  }
  // Enable the smooth cross-fade CSS (html.theme-anim) after first paint
  if (!_themeFirstApply) { _themeFirstApply = true; setTimeout(() => document.documentElement.classList.add('theme-anim'), 120); }
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    const label = mode === 'auto' ? 'Auto (sunrise/sunset)' : (mode === 'dark' ? 'Dark' : 'Light');
    btn.textContent = mode === 'auto' ? '🌅' : (theme === 'dark' ? '☀️' : '🌙');
    btn.title = `Theme: ${label} — click to change`;
    btn.classList.toggle('theme-auto-badge', mode === 'auto');
  }
  // Toast only when the auto engine actually flipped the theme
  if (changed && prev && mode === 'auto' && typeof window.showToast === 'function') {
    window.showToast(theme === 'dark' ? '🌙 Sunset — switched to dark mode' : '☀️ Sunrise — switched to light mode', 'info', 2500);
  }
  return theme;
};

window.initThemeToggle = function () {
  const btn = document.getElementById('themeToggleBtn');
  window.applyAutoTheme();
  // Re-evaluate every minute so the flip happens at sunrise/sunset live.
  if (!_sunWatchTimer) _sunWatchTimer = setInterval(() => window.applyAutoTheme(), 60 * 1000);
  // Also re-check the moment the tab becomes visible again (user returns at dusk).
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) window.applyAutoTheme();
  });
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = '1';
  btn.addEventListener('click', () => {
    let mode;
    try { mode = localStorage.getItem('tas_theme_mode') || 'auto'; } catch (e) { mode = 'auto'; }
    // Cycle: auto → light → dark → auto
    const next = mode === 'auto' ? 'light' : mode === 'light' ? 'dark' : 'auto';
    try { localStorage.setItem('tas_theme_mode', next); } catch (e) {}
    _sunGeoRequested = next === 'auto' ? _sunGeoRequested : _sunGeoRequested; // keep geo warm
    window.applyAutoTheme();
    if (typeof window.showToast === 'function') {
      const msg = next === 'auto' ? '🌅 Auto mode: theme follows your local sunrise & sunset'
                : next === 'light' ? '☀️ Light mode locked'
                : '🌙 Dark mode locked';
      window.showToast(msg, 'info', 2000);
    }
  });
};

window.getMonthName = (i) =>
  ['January','February','March','April','May','June','July','August','September','October','November','December'][i];

window.formatClassTime12 = function (t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h, 10);
  const ap = hr >= 12 ? 'PM' : 'AM';
  return `${hr % 12 || 12}:${m} ${ap}`;
};

window.formatTime12 = (iso) => iso
  ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  : '';

window.formatDateReadable = (y, m, d) =>
  new Date(y, m, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

window.formatDateISO = (y, m, d) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

window.getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();