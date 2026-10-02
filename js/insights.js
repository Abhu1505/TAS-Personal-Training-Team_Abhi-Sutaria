// ============================================================
// 📈 PROGRESS INSIGHTS — weekly & monthly charts + approved KPIs
// ------------------------------------------------------------
// Mounted inside the client portal's 📈 Progress tab (above the
// entry list). Everything is derived from APPROVED data only:
//   • progress_entries  → weight / body-fat trend lines
//   • workout logs + finished sessions → weekly & monthly activity bars
//   • approved profile (client_profiles fit_*) → BMI, BMR, TDEE, calorie
//     goal, macros, water target, 1RM, HR zones … i.e. ALL results that
//     the 🧮 Calculators tab reflects are summarised here too.
// Charts are hand-drawn SVG (no external library) and animate in with a
// grow effect; tooltips appear on hover/tap. Fully offline-safe: if the
// cloud profile row isn't cached the panel simply shows fewer tiles.
// ============================================================
(function () {
  'use strict';

  const $id = (x) => document.getElementById(x);
  function num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : NaN; }
  function f1(v) { return Number.isFinite(v) ? v.toFixed(1) : '—'; }
  function f0(v) { return Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : '—'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // Monday-based week key: "2026-W40"
  function isoWeekKey(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d)) return '';
    const day = (d.getDay() + 6) % 7;            // Mon=0 … Sun=6
    d.setDate(d.getDate() - day + 3);            // Thursday of this ISO week
    const firstThu = new Date(d.getFullYear(), 0, 4);
    const fDay = (firstThu.getDay() + 6) % 7;
    firstThu.setDate(firstThu.getDate() - fDay + 3);
    const wk = 1 + Math.round((d - firstThu) / 604800000);
    return d.getFullYear() + '-W' + String(wk).padStart(2, '0');
  }
  function monthKey(dateStr) { return (dateStr || '').slice(0, 7); } // YYYY-MM
  function monthShort(key) {
    const parts = String(key).split('-');
    const mi = parseInt(parts[1], 10) - 1;
    return (typeof getMonthName === 'function' ? getMonthName(mi).slice(0, 3) : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mi] || key)
      + ' ' + String(parts[0]).slice(2);
  }
  function weekLabel(key) { return 'wk ' + String(key).split('-W')[1]; }

  // ---------------- SVG line chart (weight / body fat) ----------------
  // points: [{ x:'YYYY-MM-DD', y:Number }] sorted ascending. Renders a
  // smooth-ish polyline + dots + min/max labels over a soft grid.
  function lineChart(points, opts) {
    opts = opts || {};
    const W = 560, H = 190, P = { l: 34, r: 12, t: 14, b: 26 };
    if (!points || points.length < 2) {
      return `<div class="chart-wrap"><div class="chart-empty">${opts.fewMsg || 'Need at least 2 entries to draw a trend.'}</div></div>`;
    }
    const ys = points.map(p => p.y);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    const pad = Math.max((hi - lo) * 0.18, opts.unitPad || 0.5);
    lo -= pad; hi += pad;
    const iw = W - P.l - P.r, ih = H - P.t - P.b;
    const X = (i) => P.l + (i / (points.length - 1)) * iw;
    const Y = (v) => P.t + ih - ((v - lo) / (hi - lo)) * ih;
    const color = opts.color || '#2ecc71';
    const gid = 'cg' + Math.random().toString(36).slice(2, 8);

    // horizontal gridlines (4)
    let grid = '';
    for (let g = 0; g <= 4; g++) {
      const v = lo + (hi - lo) * g / 4;
      const yy = Y(v).toFixed(1);
      grid += `<line x1="${P.l}" y1="${yy}" x2="${W - P.r}" y2="${yy}" stroke="rgba(127,127,127,.18)" stroke-width="1"/>` +
        `<text x="${P.l - 6}" y="${Number(yy) + 3.5}" text-anchor="end" font-size="10" fill="#9aa">${f1(v)}</text>`;
    }
    const pts = points.map((p, i) => [X(i), Y(p.y)]);
    const poly = pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const area = `M${P.l},${(H - P.b)} L${poly.split(' ').join(' L')} L${(W - P.r)},${(H - P.b)} Z`;
    let dots = '';
    pts.forEach((p, i) => {
      dots += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" fill="${color}" stroke="#fff" stroke-width="1.5">` +
        `<title>${esc(points[i].x)} · ${f1(points[i].y)}${esc(opts.suffix || '')}</title></circle>`;
    });
    // first & last date labels
    const fx = pts[0][0].toFixed(1), lx = pts[pts.length - 1][0].toFixed(1);
    const labels = `<text x="${fx}" y="${H - 8}" text-anchor="start" font-size="10" fill="#9aa">${esc(points[0].x.slice(5))}</text>` +
      `<text x="${lx}" y="${H - 8}" text-anchor="end" font-size="10" fill="#9aa">${esc(points[points.length - 1].x.slice(5))}</text>`;
    const mn = Math.min(...ys), mx = Math.max(...ys);
    const delta = ys[ys.length - 1] - ys[0];
    const dTxt = (delta > 0 ? '+' : '') + f1(delta) + (opts.suffix || '');
    const dCol = delta === 0 ? '#9aa' : (opts.invertDeltaGoodDown ? (delta < 0 ? '#2ecc71' : '#e74c3c') : (delta > 0 ? '#2ecc71' : '#e74c3c'));
    const head = `<div class="chart-head"><span class="chart-title">${opts.title || 'Trend'}</span>` +
      `<span class="chart-meta">min ${f1(mn)} · max ${f1(mx)} · <strong style="color:${dCol}">${esc(dTxt)}</strong> since first</span></div>`;
    return `<div class="chart-wrap">${head}<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="${esc(opts.title || 'trend chart')}">` +
      `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>` +
      grid +
      `<path d="${area}" fill="url(#${gid})"/>` +
      `<polyline points="${poly}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="chart-line"/>` +
      dots + labels + `</svg></div>`;
  }

  // ---------------- SVG bar chart (weekly / monthly activity) ----------------
  // buckets: [{ label, value, tip }]
  function barChart(buckets, opts) {
    opts = opts || {};
    const W = 560, H = 170, P = { l: 26, r: 10, t: 16, b: 26 };
    const hasAny = buckets.some(b => b.value > 0);
    if (!buckets.length || !hasAny) {
      return `<div class="chart-wrap"><div class="chart-empty">${opts.emptyMsg || 'No activity logged yet — your training days will appear here.'}</div></div>`;
    }
    const max = Math.max(...buckets.map(b => b.value), 1);
    const iw = W - P.l - P.r, ih = H - P.t - P.b;
    const n = buckets.length;
    const bw = Math.min(46, (iw / n) * 0.62);
    const gap = (iw - bw * n) / Math.max(1, n);
    const color = opts.color || '#1f4e3d';
    let bars = '';
    buckets.forEach((b, i) => {
      const x = P.l + gap / 2 + i * (bw + gap);
      const h = (b.value / max) * ih;
      const y = P.t + ih - h;
      const top = b.value === max && b.value > 0;
      bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h, b.value > 0 ? 3 : 0).toFixed(1)}" rx="5"` +
        ` fill="${top ? opts.maxColor || color : color}" opacity="${b.value > 0 ? 1 : 0.22}" class="chart-bar">` +
        `<title>${esc(b.tip || b.label)}: ${b.value}${esc(opts.suffix || '')}</title></rect>` +
        (b.value > 0 ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="${top ? opts.maxColor || color : '#7a8'}">${b.value}</text>` : '') +
        `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="9.5" fill="#9aa">${esc(b.label)}</text>`;
    });
    const total = buckets.reduce((s, b) => s + b.value, 0);
    const head = `<div class="chart-head"><span class="chart-title">${opts.title || 'Activity'}</span>` +
      `<span class="chart-meta">${total}${esc(opts.suffix || ' sessions')} in view</span></div>`;
    return `<div class="chart-wrap">${head}<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="${esc(opts.title || 'activity chart')}">${bars}</svg></div>`;
  }

  // ---------------- data builders ----------------
  function getApprovedEntries(clientId) {
    const arr = (typeof clientMapGet === 'function' && clientMapGet(APP_STATE.progressEntries, clientId)) || [];
    return arr.slice().sort((a, b) => String(a.entry_date || '').localeCompare(String(b.entry_date || '')));
  }

  function getActivityDates(clientId) {
    // All dates with a finished session or a workout log (approved state —
    // client logs become part of a finished session; edits require approval).
    if (typeof getAllWorkoutDates === 'function') {
      return getAllWorkoutDates(clientId).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
    }
    return [];
  }

  function localDateStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function buildWeeklyBuckets(dates, weeks) {
    const map = {};
    dates.forEach(d => { const k = isoWeekKey(d); if (k) map[k] = (map[k] || 0) + 1; });
    // Walk back `weeks` Mondays from this week's Monday → unique, ordered.
    const cur = new Date();
    cur.setDate(cur.getDate() - ((cur.getDay() + 6) % 7));   // this Monday
    const keys = [];
    for (let i = 0; i < weeks; i++) {
      keys.unshift(isoWeekKey(localDateStr(cur)));
      cur.setDate(cur.getDate() - 7);
    }
    return keys.map(k => ({ label: weekLabel(k), value: map[k] || 0, tip: k }));
  }

  function buildMonthlyBuckets(dates, months) {
    const map = {};
    dates.forEach(d => { const k = monthKey(d); if (k) map[k] = (map[k] || 0) + 1; });
    const out = [];
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
      out.push({ label: monthShort(k), value: map[k] || 0, tip: k });
    }
    return out;
  }

  // ---------------- KPI tiles from approved calculator results ----------------
  function kpiTile(icon, label, value, sub, color) {
    return `<div class="kpi-tile"${color ? ` style="--kpi:${color}"` : ''}>` +
      `<div class="kpi-icon">${icon}</div>` +
      `<div class="kpi-label">${esc(label)}</div>` +
      `<div class="kpi-value"${color ? ` style="color:${color}"` : ''}>${value}</div>` +
      (sub ? `<div class="kpi-sub">${sub}</div>` : '') +
      `</div>`;
  }

  function renderKpis(clientId) {
    const box = $('clientInsightKpis');
    if (!box) return;
    const S = window.APP_STATE || {};
    const p = (typeof clientMapGet === 'function' && clientMapGet(S.clientProfiles, clientId)) || null;
    const hasStats = p && typeof window.profileHasCalcStats === 'function' && window.profileHasCalcStats(p);
    if (!hasStats || typeof window.profileCalcStats !== 'function' || typeof window.computeFitnessResults !== 'function') {
      box.innerHTML = `<div class="insights-note">⏳ <strong>No approved profile numbers yet.</strong> Once your trainer approves your 👤 Profile, all calculator results (BMI, TDEE, macros…) appear here automatically.</div>`;
      return;
    }
    const inputs = window.profileCalcStats(p);
    const r = window.computeFitnessResults(inputs) || {};
    let html = '';
    if (Number.isFinite(r.bmi)) html += kpiTile('⚖️', 'BMI', f1(r.bmi), `<span class="pill" style="background:${r.bmiColor}22;color:${r.bmiColor};border:1px solid ${r.bmiColor}55;">${r.bmiCat}</span>`, r.bmiColor);
    if (Number.isFinite(r.bfShown)) html += kpiTile('📊', 'Body Fat %', f1(r.bfShown) + '%', esc(r.bfSource), '#8e44ad');
    if (Number.isFinite(r.leanMass)) html += kpiTile('💪', 'Lean Mass', f1(r.leanMass) + ' kg', 'Fat mass ' + f1(r.fatMass) + ' kg', '#16a085');
    if (Number.isFinite(r.ideal)) html += kpiTile('🎯', 'Ideal Weight', f1(r.ideal) + ' kg', (r.idealDiff >= 0 ? '+' : '') + f1(r.idealDiff) + ' kg from current', '#2980b9');
    if (Number.isFinite(r.bmr)) html += kpiTile('🔥', 'BMR', f0(r.bmr) + ' kcal', 'Calories at rest', '#e67e22');
    if (Number.isFinite(r.tdee)) html += kpiTile('⚡', 'TDEE', f0(r.tdee) + ' kcal', esc(r.actMult + '× · ' + (inputs.activity || '')), '#d35400');
    if (Number.isFinite(r.calGoal)) html += kpiTile('🍽️', 'Calorie Goal', f0(r.calGoal) + ' kcal', esc((inputs.goal || 'Maintain') + ' (' + (r.calDelta >= 0 ? '+' : '') + f0(r.calDelta) + ')'), '#27ae60');
    if (Number.isFinite(r.pG)) html += kpiTile('🥩', 'Macros P/C/F', `${f0(r.pG)} / ${f0(r.cG)} / ${f0(r.fG)}`, 'grams per day', '#c0392b');
    if (Number.isFinite(r.proteinG)) html += kpiTile('🍗', 'Protein Target', f0(r.proteinG) + ' g', f0(r.proteinPerMeal) + ' g × 4 meals', '#f39c12');
    if (Number.isFinite(r.waterL)) html += kpiTile('💧', 'Water Target', f1(r.waterL) + ' L', Math.round(r.waterGlasses) + ' glasses/day', '#3498db');
    if (Number.isFinite(r.orm)) html += kpiTile('🏋️', 'Est. 1RM', f0(r.orm) + ' kg', esc(r.strLevel + ' · ' + f1(r.ratio) + '× BW'), r.strColor);
    if (Number.isFinite(r.maxHr)) html += kpiTile('❤️', 'Max HR', Math.round(r.maxHr) + ' bpm', 'Fat burn ' + (r.zones && r.zones[1] ? r.zones[1][1] + '–' + r.zones[1][2] : '—') + ' bpm', '#e74c3c');
    box.innerHTML = html || `<div class="insights-note">Enter more details (height, age, measurements) in your profile to unlock all metrics.</div>`;
  }

  // ---------------- main render ----------------
  window.renderClientInsights = function (clientId) {
    try {
      const wrap = $('clientInsightsPanel');
      if (!wrap) return;                       // markup not present → skip
      clientId = clientId != null ? clientId : (APP_STATE.loggedInClient && APP_STATE.loggedInClient.id);
      if (clientId == null) { wrap.classList.add('hidden'); return; }
      wrap.classList.remove('hidden');

      // 1 · Approved measurement trends (till date)
      const entries = getApprovedEntries(clientId);
      const wPts = entries.filter(e => num(e.weight_kg) > 0).map(e => ({ x: e.entry_date, y: num(e.weight_kg) }));
      const bPts = entries.filter(e => num(e.body_fat_pct) > 0).map(e => ({ x: e.entry_date, y: num(e.body_fat_pct) }));
      const wEl = $('insightWeightChart'), bEl = $('insightBodyfatChart');
      if (wEl) wEl.innerHTML = lineChart(wPts, { title: '⚖️ Weight trend (kg)', color: '#2ecc71', suffix: ' kg', invertDeltaGoodDown: true, fewMsg: 'Need 2+ approved weight entries to draw the trend.' });
      if (bEl) bEl.innerHTML = lineChart(bPts, { title: '🫀 Body Fat trend (%)', color: '#8e44ad', suffix: '%', invertDeltaGoodDown: true, fewMsg: 'Need 2+ approved body-fat entries to draw the trend.' });

      // 2 · Activity charts (from every logged/trained day till date)
      const dates = getActivityDates(clientId);
      const wEl2 = $('insightWeeklyChart'), mEl = $('insightMonthlyChart');
      if (wEl2) wEl2.innerHTML = barChart(buildWeeklyBuckets(dates, 8), { title: '🗓️ Weekly training days (last 8 weeks)', suffix: ' days', color: '#1f4e3d', maxColor: '#2ecc71', emptyMsg: 'No training days logged yet.' });
      if (mEl) mEl.innerHTML = barChart(buildMonthlyBuckets(dates, 6), { title: '📆 Monthly sessions (last 6 months)', suffix: ' sessions', color: '#2980b9', maxColor: '#2ecc71', emptyMsg: 'No sessions recorded yet.' });

      // 3 · Summary chips + streak
      const sum = $('insightSummary');
      if (sum) {
        const monthsActive = new Set(dates.map(monthKey)).size;
        // Streak: consecutive calendar weeks (Mon–Sun) containing ≥1 training day,
        // counting back from the current week (current week may be 0 without breaking).
        const wkSet = new Set(dates.map(isoWeekKey));
        let streak = 0;
        const cur = new Date();
        cur.setDate(cur.getDate() - ((cur.getDay() + 6) % 7));   // this Monday
        for (let i = 0; i < 260; i++) {
          const k = isoWeekKey(localDateStr(cur));
          if (wkSet.has(k)) streak++;
          else if (i > 0) break;           // gap in past weeks ends the streak
          cur.setDate(cur.getDate() - 7);
        }
        sum.innerHTML =
          `<span class="insight-chip">✅ ${dates.length} training days till date</span>` +
          `<span class="insight-chip">📈 ${monthsActive} active months</span>` +
          `<span class="insight-chip">🔥 ${streak}-week streak</span>` +
          `<span class="insight-chip">📏 ${entries.length} approved progress entries</span>`;
      }

      // 4 · Calculator KPIs reflected from the APPROVED profile
      renderKpis(clientId);
    } catch (err) {
      console.warn('[insights] render failed:', err);
    }
  };

  // Re-render whenever the 📈 Progress tab is opened (delegated capture
  // listener — safe even if tabs are re-rendered).
  document.addEventListener('click', function (e) {
    const btn = e.target && e.target.closest ? e.target.closest('.tab-btn[data-ctab="progress"]') : null;
    if (btn && window.APP_STATE && window.APP_STATE.loggedInClient) {
      setTimeout(() => window.renderClientInsights(window.APP_STATE.loggedInClient.id), 30);
    }
  }, true);
})();
