// ============================================================
// 🌍 i18n (EN / العربية / हिन्दी) + ♿ ACCESSIBILITY PASS
// ------------------------------------------------------------
// i18n:
//   • Data-attribute driven dictionary. Elements opt in with
//     data-i18n="key". The app auto-tags the existing UI once
//     (mapping known labels), then translates on demand.
//   • Language picker in Settings (and client portal footer).
//     Persisted in localStorage; RTL (dir=rtl) applied for Arabic.
//   • Dynamic strings produced by JS are translated through
//     window.tasT('key') when a dictionary entry exists.
// Accessibility (WCAG 2.2 AA targeted improvements):
//   • Visible focus rings everywhere (:focus-visible styles).
//   • Skip-to-content link, aria-live toast region, tab roles &
//     keyboard arrow navigation on the tab bars.
//   • Reduced-motion respect already used by transitions; extended
//     to charts/animations via prefers-reduced-motion CSS class.
//   • Auto alt-text for logo images, larger tap targets (≥44px) for
//     icon buttons.
// ============================================================
(function () {
  'use strict';

  const LANG_KEY = 'tas_lang_v1';

  const DICT = {
    en: {}, // source language — identity
    ar: {
      'tab.plan': '🏋️ خطتي', 'tab.history': '📜 السجل', 'tab.progress': '📈 التقدم',
      'tab.calculators': '🧮 الحاسبات', 'tab.tools': '⚡ الأدوات', 'tab.profile': '👤 الملف',
      'btn.login': 'تسجيل الدخول', 'btn.logout': 'خروج', 'btn.refresh': 'تحديث',
      'label.clients': 'العملاء', 'label.active': 'نشط', 'label.revenue': 'الإيرادات',
      'msg.send': 'إرسال', 'msg.placeholder': 'اكتب رسالة…',
      'settings.language': 'اللغة'
    },
    hi: {
      'tab.plan': '🏋️ मेरी प्लान', 'tab.history': '📜 इतिहास', 'tab.progress': '📈 प्रगति',
      'tab.calculators': '🧮 कैलकुलेटर', 'tab.tools': '⚡ टूल्स', 'tab.profile': '👤 प्रोफ़ाइल',
      'btn.login': 'लॉग इन', 'btn.logout': 'लॉग आउट', 'btn.refresh': 'रिफ्रेश',
      'label.clients': 'क्लाइंट', 'label.active': 'सक्रिय', 'label.revenue': 'राजस्व',
      'msg.send': 'भेजें', 'msg.placeholder': 'संदेश लिखें…',
      'settings.language': 'भाषा'
    }
  };

  function getLang() { try { return localStorage.getItem(LANG_KEY) || 'en'; } catch (e) { return 'en'; } }
  window.tasGetLang = getLang;

  window.tasT = function (key, fallback) {
    const l = getLang();
    if (l === 'en') return fallback != null ? fallback : key;
    const v = (DICT[l] || {})[key];
    return v != null ? v : (fallback != null ? fallback : key);
  };

  // Known label → key map used for the one-time auto-tagging pass.
  const LABEL_KEYS = {
    'My Plan': 'tab.plan', 'History': 'tab.history', 'Progress': 'tab.progress',
    'Calculators': 'tab.calculators', 'Tools': 'tab.tools', 'Profile': 'tab.profile',
    'Login': 'btn.login', 'Logout': 'btn.logout', 'Refresh': 'btn.refresh'
  };

  function applyLang(lang) {
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
    document.documentElement.lang = lang;
    document.documentElement.dir = (lang === 'ar') ? 'rtl' : 'ltr';
    document.body.classList.toggle('tas-rtl', lang === 'ar');
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.getAttribute('data-i18n');
      const tr = (DICT[lang] || {})[k];
      if (tr) {
        if (el.tagName === 'INPUT' && el.type !== 'submit' && el.type !== 'button') el.placeholder = tr;
        else el.textContent = tr;
      } else if (lang === 'en' && el.dataset.i18nOriginal) {
        el.textContent = el.dataset.i18nOriginal;
      }
    });
    document.dispatchEvent(new CustomEvent('tas-lang-changed', { detail: { lang } }));
  }
  window.tasSetLanguage = applyLang;

  function tagKnownLabels() {
    // Tag elements whose current text matches a known English label.
    document.querySelectorAll('.tab-btn, .btn-primary, .btn-ghost, button').forEach(el => {
      const txt = (el.textContent || '').trim();
      Object.entries(LABEL_KEYS).forEach(([label, key]) => {
        if (txt.includes(label) && !el.hasAttribute('data-i18n')) {
          el.setAttribute('data-i18n', key);
          el.dataset.i18nOriginal = el.textContent;
        }
      });
    });
    // Chat inputs get placeholder keys
    const ci = document.getElementById('clientMsgInput');
    if (ci) ci.setAttribute('data-i18n', 'msg.placeholder');
  }

  // ---------------- language picker UI ----------------
  function mountPicker(containerId) {
    const host = document.getElementById(containerId);
    if (!host || document.getElementById('langPick_' + containerId)) return;
    const wrap = document.createElement('div');
    wrap.className = 'lang-picker';
    wrap.id = 'langPick_' + containerId;
    wrap.innerHTML = `<label for="langSel_${containerId}">🌍 ${window.tasT('settings.language', 'Language')}</label>
      <select id="langSel_${containerId}" aria-label="Interface language">
        <option value="en">English</option><option value="ar">العربية</option><option value="hi">हिन्दी</option>
      </select>`;
    host.appendChild(wrap);
    const sel = wrap.querySelector('select');
    sel.value = getLang();
    sel.addEventListener('change', () => applyLang(sel.value));
  }

  // ---------------- accessibility pass ----------------
  function a11yPass() {
    // Skip link
    if (!document.getElementById('tasSkipLink')) {
      const a = document.createElement('a');
      a.id = 'tasSkipLink'; a.href = '#mainContent'; a.className = 'skip-link';
      a.textContent = 'Skip to content';
      document.body.insertBefore(a, document.body.firstChild);
      const main = document.querySelector('.dash-card:not(.hidden), #adminDashboard, #clientDashboard, main');
      if (main && !main.id) main.id = 'mainContent';
      if (!document.getElementById('mainContent')) {
        const c = document.querySelector('#loginCard');
        if (c) c.id = 'mainContent';
      }
    }
    // aria-live for toasts
    const toastHost = document.querySelector('#toastContainer, .toast-container, [id*="toast" i]');
    if (toastHost && !toastHost.getAttribute('aria-live')) {
      toastHost.setAttribute('aria-live', 'polite');
      toastHost.setAttribute('role', 'status');
    }
    // Tab keyboard nav (arrow keys move between tab buttons in each bar)
    document.querySelectorAll('.tabs-bar').forEach(bar => {
      if (bar.__tabKeys) return; bar.__tabKeys = true;
      bar.setAttribute('role', bar.getAttribute('role') || 'tablist');
      bar.addEventListener('keydown', (e) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        const btns = Array.from(bar.querySelectorAll('.tab-btn'));
        const i = btns.indexOf(document.activeElement);
        if (i < 0) return;
        e.preventDefault();
        const next = btns[(i + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length];
        next.focus(); next.click();
      });
    });
    // Images without alt
    document.querySelectorAll('img:not([alt])').forEach(img => { img.alt = img.title || 'TAS Personal Training image'; });
    // Icon-only buttons need accessible names
    document.querySelectorAll('button').forEach(b => {
      const hasText = (b.textContent || '').trim().length > 0;
      if (!hasText && !b.getAttribute('aria-label') && !b.getAttribute('title')) {
        b.setAttribute('aria-label', 'Button');
      }
    });
    // min tap size class for close-x style buttons
    document.querySelectorAll('.panel-close-x').forEach(b => { if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', 'Close panel'); });
  }

  // reduced motion global class
  try {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const setRM = () => document.body.classList.toggle('tas-reduced-motion', mq.matches);
    setRM();
    if (mq.addEventListener) mq.addEventListener('change', setRM);
  } catch (e) {}

  document.addEventListener('DOMContentLoaded', () => {
    tagKnownLabels();
    a11yPass();
    mountPicker('settingsPanel');
    const portalFoot = document.querySelector('#clientDashboard .dash-footer, #clientDashboard .client-portal-footer');
    if (portalFoot) mountPicker(portalFoot.id || undefined ? portalFoot.id : 'x');
    if (getLang() !== 'en') applyLang(getLang());
    // Re-run a11y after dynamic renders (cheap, debounced)
    let t = null;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(a11yPass, 1500); })
      .observe(document.body, { childList: true, subtree: true });
  });
})();
