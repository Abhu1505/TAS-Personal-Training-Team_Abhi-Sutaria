// ============================================================
// 🧬 BODY-COMPOSITION ANALYTICS — pro-level progress science
// ------------------------------------------------------------
// Extends the Progress data with derived composition metrics:
//   • Lean mass & fat mass time series (from weight + body-fat %)
//   • Fat Loss Rate / Lean Change per week (linear regression slope)
//   • Phase detection: cutting / maintaining / recomp segments
//   • SMART goal projection: weeks to target weight at current pace,
//     and healthy-pace feasibility check (≤1% BW/week)
//   • Water-weight noise filter (7-day moving average trend line)
// Mounted in BOTH places:
//   – Admin: client detail → "📈 Progress" tab header (composition card)
//   – Client portal: injected above the entry list in 📈 Progress
// White-label PDF export via jsPDF (already vendored).
// ============================================================
(function () {
  'use strict';

  const $id = (x) => document.getElementById(x);
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : NaN; }
  function parseDate(s) {
    const p = String(s || '').slice(0, 10).split('-').map(Number);
    if (!p[0] || !p[1] || !p[2]) return null;
    return new Date(p[0], p[1] - 1, p[2]);
  }

  // ---------------- math ----------------
  function linreg(points) { // [{t:ms, y:number}]
    const n = points.length;
    if (n < 2) return null;
    const t0 = points[0].t;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    points.forEach(p => { const x = (p.t - t0) / 86400000; sx += x; sy += p.y; sxx += x * x; sxy += x * p.y; });
    const d = n * sxx - sx * sx;
    if (!d) return null;
    const slope = (n * sxy - sx * sy) / d;
    const intercept = (sy - slope * sx) / n;
    return { slopePerDay: slope, valueAt: (days) => intercept + slope * days };
  }
  function movingAvg(arr, win) {
    return arr.map((p, i) => {
      const from = Math.max(0, i - win + 1);
      const slice = arr.slice(from, i + 1);
      return { t: p.t, y: slice.reduce((s, q) => s + q.y, 0) / slice.length };
    });
  }

  // ---------------- model ----------------
  window.tasBuildCompositionModel = function (clientId) {
    const entries = (clientMapGet(APP_STATE.progressEntries, clientId) || [])
      .slice()
      .map(e => ({ date: e.entry_date, w: num(e.weight_kg != null ? e.weight_kg : e.weight), bf: num(e.body_fat_pct != null ? e.body_fat_pct : e.body_fat) }))
      .filter(e => e.date && !isNaN(e.w))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (entries.length < 2) return { ok: false, reason: 'Need at least 2 weigh-ins with weight.', entries };

    const withBF = entries.filter(e => !isNaN(e.bf));
    const series = entries.map(e => {
      const lean = !isNaN(e.bf) ? e.w * (1 - e.bf / 100) : null;
      return { date: e.date, t: parseDate(e.date).getTime(), w: e.w, bf: e.bf, lean, fat: lean == null ? null : e.w - lean };
    });

    const first = series[0], last = series[series.length - 1];
    const spanDays = Math.max(1, (last.t - first.t) / 86400000);
    const weightReg = linreg(series.map(s => ({ t: s.t, y: s.w })));
    const leanSeries = series.filter(s => s.lean != null);
    const leanReg = leanSeries.length >= 2 ? linreg(leanSeries.map(s => ({ t: s.t, y: s.lean }))) : null;
    const fatSeries = series.filter(s => s.fat != null);
    const fatReg = fatSeries.length >= 2 ? linreg(fatSeries.map(s => ({ t: s.t, y: s.fat }))) : null;

    // phase classification
    const wkRate = weightReg ? weightReg.slopePerDay * 7 : 0;
    const leanWk = leanReg ? leanReg.slopePerDay * 7 : 0;
    let phase = 'Maintaining';
    if (wkRate < -0.15) phase = leanWk >= 0.05 ? 'Recomp (losing fat, gaining lean)' : 'Cutting';
    else if (wkRate > 0.15) phase = leanWk > 0.1 ? 'Lean bulk' : 'Gaining (watch fat rate)';

    // goal projection — use latest profile target_weight if present
    let target = null;
    try {
      const prof = clientMapGet(APP_STATE.clientProfiles, clientId) || {};
      target = num(prof.target_weight);
    } catch (e) {}
    let projection = null;
    if (target != null && weightReg && Math.abs(target - last.w) > 0.3) {
      const daysToTarget = (target - (weightReg.valueAt((last.t - first.t) / 86400000))) / (weightReg.slopePerDay || 0.0001);
      const feasible = Math.abs(wkRate) <= last.w * 0.01; // ≤1%BW/wk
      projection = {
        target,
        weeksAway: daysToTarget > 0 ? daysToTarget / 7 : null,
        paceHealthy: feasible,
        note: daysToTarget <= 0
          ? 'Trend is moving away from target — adjust calories/programming.'
          : `At current pace (~${Math.abs(wkRate).toFixed(2)} kg/wk): ~${Math.ceil(daysToTarget / 7)} weeks.`
      };
    }

    // smoothed trend for chart
    const smooth = movingAvg(series.map(s => ({ t: s.t, y: s.w })), 3);

    return {
      ok: true, series, spanDays,
      startWeight: first.w, endWeight: last.w,
      deltaW: last.w - first.w,
      deltaBF: (!isNaN(first.bf) && !isNaN(last.bf)) ? last.bf - first.bf : null,
      deltaLean: (leanSeries.length >= 2) ? leanSeries[leanSeries.length - 1].lean - leanSeries[0].lean : null,
      deltaFat: (fatSeries.length >= 2) ? fatSeries[fatSeries.length - 1].fat - fatSeries[0].fat : null,
      weeklyRate: wkRate, leanWeekly: leanReg ? leanReg.slopePerDay * 7 : null,
      phase, projection, smooth
    };
  };

  // ---------------- tiny SVG dual-line chart ----------------
  function compChart(model) {
    const W = 560, H = 200, P = { l: 38, r: 12, t: 14, b: 24 };
    const all = model.series;
    const xs = all.map(s => s.t);
    const tMin = Math.min(...xs), tMax = Math.max(...xs);
    const yAll = [].concat(all.map(s => s.w), all.filter(s => s.lean != null).map(s => s.lean));
    const yMin = Math.min(...yAll) - 1, yMax = Math.max(...yAll) + 1;
    const X = t => P.l + ((t - tMin) / Math.max(1, tMax - tMin)) * (W - P.l - P.r);
    const Y = v => H - P.b - ((v - yMin) / Math.max(0.1, yMax - yMin)) * (H - P.t - P.b);
    const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
    const wPts = all.map(s => ({ t: s.t, y: s.w }));
    const lPts = all.filter(s => s.lean != null).map(s => ({ t: s.t, y: s.lean }));
    const smPts = model.smooth;
    let grid = '';
    for (let g = 0; g <= 4; g++) {
      const v = yMin + (g / 4) * (yMax - yMin);
      grid += `<line x1="${P.l}" y1="${Y(v)}" x2="${W - P.r}" y2="${Y(v)}" stroke="currentColor" opacity="0.08"/>` +
        `<text x="4" y="${Y(v) + 3}" font-size="9" fill="currentColor" opacity="0.5">${v.toFixed(0)}</text>`;
    }
    const dots = all.map(s => `<circle cx="${X(s.t)}" cy="${Y(s.w)}" r="2.6" fill="#3b82f6"><title>${esc(s.date)} · ${s.w.toFixed(1)} kg${!isNaN(s.bf) ? ' · ' + s.bf.toFixed(1) + '%' : ''}</title></circle>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="comp-chart" role="img" aria-label="Weight vs lean mass chart">
      ${grid}
      <path d="${path(wPts)}" fill="none" stroke="#3b82f6" stroke-width="2"/>
      ${lPts.length >= 2 ? `<path d="${path(lPts)}" fill="none" stroke="#22c55e" stroke-width="2" stroke-dasharray="5 3"/>` : ''}
      <path d="${path(smPts)}" fill="none" stroke="#f59e0b" stroke-width="1.4" opacity="0.8"/>
      ${dots}
      <text x="${P.l}" y="${H - 6}" font-size="9" fill="currentColor" opacity="0.55">${esc(all[0].date)}</text>
      <text x="${W - P.r}" y="${H - 6}" font-size="9" text-anchor="end" fill="currentColor" opacity="0.55">${esc(all[all.length - 1].date)}</text>
    </svg>
    <div class="comp-legend"><span><i style="background:#3b82f6"></i> Weight</span><span><i style="background:#22c55e"></i> Lean mass</span><span><i style="background:#f59e0b"></i> 3-pt trend</span></div>`;
  }

  function stat(label, value, tone) {
    return `<div class="comp-stat ${tone || ''}"><span class="comp-stat-v">${value}</span><span class="comp-stat-l">${esc(label)}</span></div>`;
  }

  window.tasRenderCompositionCard = function (clientId, mountEl) {
    if (!mountEl) return;
    const m = window.tasBuildCompositionModel(clientId);
    if (!m.ok) { mountEl.innerHTML = ''; return; }
    const sgn = (v, unit) => (v > 0 ? '+' : '') + v.toFixed(1) + (unit || '');
    mountEl.innerHTML = `
      <div class="comp-card">
        <div class="comp-head"><strong>🧬 Body Composition Analysis</strong>
          <span class="cds-muted">${m.spanDays} days · ${m.series.length} weigh-ins</span>
          <button type="button" class="btn-ghost btn-sm" id="compPdfBtn">📄 Export PDF</button></div>
        <div class="comp-stats">
          ${stat('Weight change', sgn(m.deltaW, ' kg'), m.deltaW < 0 ? 'good' : m.deltaW > 0 ? 'warn' : '')}
          ${stat('Body fat Δ', m.deltaBF == null ? '—' : sgn(m.deltaBF, ' pt'), m.deltaBF < 0 ? 'good' : '')}
          ${stat('Lean mass Δ', m.deltaLean == null ? '—' : sgn(m.deltaLean, ' kg'), m.deltaLean > 0 ? 'good' : m.deltaLean < -0.3 ? 'bad' : '')}
          ${stat('Fat mass Δ', m.deltaFat == null ? '—' : sgn(m.deltaFat, ' kg'), m.deltaFat < 0 ? 'good' : m.deltaFat > 0.3 ? 'bad' : '')}
          ${stat('Weekly pace', sgn(m.weeklyRate, ' kg/wk'), Math.abs(m.weeklyRate) <= (m.endWeight * 0.01) ? 'good' : 'warn')}
          ${stat('Phase', m.phase.split('(')[0].trim(), '')}
        </div>
        ${compChart(m)}
        ${m.projection ? `<div class="comp-proj">🎯 Target ${m.projection.target} kg — ${esc(m.projection.note)} ${m.projection.paceHealthy ? '✅ Healthy pace.' : '⚠️ Faster than the recommended ≤1% body-weight/week.'}</div>` : ''}
      </div>`;
    const pdf = mountEl.querySelector('#compPdfBtn');
    if (pdf) pdf.addEventListener('click', () => window.tasExportCompositionPdf(clientId));
  };

  // ---------------- white-label PDF ----------------
  window.tasExportCompositionPdf = function (clientId) {
    const m = window.tasBuildCompositionModel(clientId);
    if (!m.ok) { showToast('Not enough data for a report.', 'error'); return; }
    if (!window.jspdf || !window.jspdf.jsPDF) { showToast('PDF library not loaded.', 'error'); return; }
    const c = getClient(clientId) || {};
    const doc = new window.jspdf.jsPDF();
    doc.setFontSize(18); doc.setTextColor(30, 41, 59);
    doc.text('Body Composition Report', 14, 20);
    doc.setFontSize(11); doc.setTextColor(100);
    doc.text(`${c.name || ''}  ·  ${new Date().toLocaleDateString()}`, 14, 28);
    doc.setDrawColor(59, 130, 246); doc.line(14, 32, 196, 32);

    let y = 42;
    const rows = [
      ['Period covered', `${m.series[0].date} → ${m.series[m.series.length - 1].date} (${m.spanDays} days)`],
      ['Weigh-ins', String(m.series.length)],
      ['Weight change', `${m.deltaW.toFixed(1)} kg  (${m.startWeight.toFixed(1)} → ${m.endWeight.toFixed(1)})`],
      ['Body-fat change', m.deltaBF == null ? 'n/a' : `${m.deltaBF.toFixed(1)} points`],
      ['Lean mass change', m.deltaLean == null ? 'n/a' : `${m.deltaLean.toFixed(2)} kg`],
      ['Fat mass change', m.deltaFat == null ? 'n/a' : `${m.deltaFat.toFixed(2)} kg`],
      ['Average weekly pace', `${m.weeklyRate.toFixed(2)} kg/week`],
      ['Current phase', m.phase]
    ];
    doc.setFontSize(12);
    rows.forEach(r => { doc.setTextColor(60); doc.text(r[0] + ':', 14, y); doc.setTextColor(20); doc.text(String(r[1]), 75, y); y += 8; });

    if (m.projection) {
      y += 4; doc.setTextColor(37, 99, 235);
      doc.text(`Goal projection — target ${m.projection.target} kg: ${m.projection.note}`, 14, y, { maxWidth: 180 }); y += 12;
    }

    y += 4; doc.setTextColor(60); doc.setFontSize(11); doc.text('All measurements', 14, y); y += 6;
    doc.setFontSize(9);
    doc.text('Date          Weight kg   Body fat %   Lean kg   Fat kg', 14, y); y += 5;
    m.series.slice(-30).forEach(s => {
      doc.text(`${s.date}     ${(s.w).toFixed(1).padStart(5)}      ${isNaN(s.bf) ? '  —  ' : s.bf.toFixed(1) + ' '}     ${s.lean == null ? ' — ' : s.lean.toFixed(1)}   ${s.fat == null ? ' — ' : s.fat.toFixed(1)}`, 14, y);
      y += 4.6;
      if (y > 280) { doc.addPage(); y = 20; }
    });
    doc.setFontSize(8); doc.setTextColor(150);
    doc.text('Generated by TAS Personal Training', 14, 292);
    doc.save(`tas-composition-${(c.name || 'client').replace(/\W+/g, '-')}.pdf`);
  };

  // ---------------- mounting ----------------
  function mountIntoAdminProgress() {
    const tab = $id('tab-progress');
    if (!tab || $id('adminCompCard')) return;
    const holder = document.createElement('div');
    holder.id = 'adminCompCard';
    tab.insertBefore(holder, tab.firstChild);
  }
  function mountIntoClientProgress() {
    const tab = $id('ctab-progress') || document.querySelector('#clientDashboard #tab-progress');
    if (!tab || $id('clientCompCard')) return;
    const holder = document.createElement('div');
    holder.id = 'clientCompCard';
    tab.insertBefore(holder, tab.firstChild);
  }

  function refreshCards() {
    if (APP_STATE.selectedClientId && $id('adminCompCard')) {
      tasRenderCompositionCard(APP_STATE.selectedClientId, $id('adminCompCard'));
    }
    if (APP_STATE.loggedInClient && $id('clientCompCard')) {
      tasRenderCompositionCard(APP_STATE.loggedInClient.id, $id('clientCompCard'));
    }
  }

  // Wrap the existing renderers so cards update whenever progress UI redraws.
  function wrapHooks() {
    ['renderClientDetail', 'selectClient'].forEach(fn => {
      const orig = window[fn];
      if (typeof orig === 'function' && !orig.__compWrapped) {
        orig.__compWrapped = true;
        window[fn] = function () {
          const out = orig.apply(this, arguments);
          setTimeout(refreshCards, 120);
          return out;
        };
      }
    });
    const origDash = window.renderClientDashboard;
    if (typeof origDash === 'function' && !origDash.__compWrapped) {
      origDash.__compWrapped = true;
      window.renderClientDashboard = function () {
        const out = origDash.apply(this, arguments);
        setTimeout(() => { mountIntoClientProgress(); refreshCards(); }, 150);
        return out;
      };
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    mountIntoAdminProgress();
    wrapHooks();
    setInterval(refreshCards, 8000); // cheap self-heal after async renders
  });
})();
