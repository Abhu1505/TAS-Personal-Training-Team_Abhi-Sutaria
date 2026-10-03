// ============================================================
// 🏆 COACH DASHBOARD PRO — business KPIs for the trainer
// ------------------------------------------------------------
// A dedicated admin workspace tab (📊 Insights) that turns the raw
// cloud data into decisions:
//   • Retention rate (rolling 90-day cohorts of active clients)
//   • Session frequency & consistency per client
//   • No-show / missed-class rate (planned days vs completed)
//   • Revenue this month + forecast (rate × avg weekly sessions)
//   • At-risk clients (no session in 10+ days, stale progress,
//     low adherence) with a 0–100 risk score and suggested action
//   • SVG sparklines & bars hand-drawn (no chart library, offline-safe)
//   • CSV export of the roster analytics
// Everything reads from APP_STATE caches, so it works offline too.
// ============================================================
(function () {
  'use strict';

  const $id = (x) => document.getElementById(x);
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmt(n, d) { return Number.isFinite(n) ? n.toFixed(d == null ? 0 : d) : '—'; }
  function money(n) { return Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '—'; }
  function dayKey(d) { return d.toISOString().slice(0, 10); }
  function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
  function parseDate(s) {
    const p = String(s || '').slice(0, 10).split('-').map(Number);
    if (!p[0] || !p[1] || !p[2]) return null;
    return new Date(p[0], p[1] - 1, p[2]);
  }

  // ---------------- core analytics ----------------
  // Collect every completed session date (YYYY-MM-DD) for one client.
  function sessionDatesFor(cid) {
    const out = [];
    Object.keys(APP_STATE.sessionCache || {}).forEach(k => {
      if (String(k).split('-')[0] !== String(cid)) return;
      const parts = String(k).match(/^(\d+)-(\d{4})-(\d{1,2})$/);
      if (!parts) return; // key format: cid-YYYY-M
      const y = parseInt(parts[2], 10), m = parseInt(parts[3], 10);
      (APP_STATE.sessionCache[k] || []).forEach(s => {
        out.push(`${y}-${String(m + 1).padStart(2, '0')}-${String(s.day).padStart(2, '0')}`);
      });
    });
    return out.sort();
  }

  function lastNDays(n) {
    const set = {};
    for (let i = 0; i < n; i++) set[dayKey(daysAgo(i))] = true;
    return set;
  }

  // Build the full analytics model for all active clients.
  window.tasBuildCoachAnalytics = function () {
    const today = new Date();
    const win30 = lastNDays(30), win60 = lastNDays(60), win90 = lastNDays(90);
    const rows = [];
    let monthSessions = 0, monthRevenue = 0, forecastMonthly = 0;

    (APP_STATE.clients || []).filter(c => c.active).forEach(c => {
      const dates = sessionDatesFor(c.id);
      const set = {}; dates.forEach(d => set[d] = true);
      const in30 = dates.filter(d => win30[d]).length;
      const in60 = dates.filter(d => win60[d]).length;
      const in90 = dates.filter(d => win90[d]).length;
      const wkly30 = in30 / (30 / 7);
      const rate = getRate(c.id);
      // current-month totals
      const mk = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const monthCount = dates.filter(d => d.slice(0, 7) === mk).length;
      monthSessions += monthCount; monthRevenue += monthCount * rate;
      forecastMonthly += wkly30 * 4.345 * rate;

      // last session + staleness
      const last = dates.length ? parseDate(dates[dates.length - 1]) : null;
      const daysSince = last ? Math.floor((today - last) / 86400000) : Infinity;

      // planned days from class times (dailyTimesCache + weekly default)
      const settings = clientMapGet(APP_STATE.clientSettings, c.id) || {};
      const plannedPerWeek = parseFloat(settings.planned_sessions_per_week) || 0;

      // progress staleness
      const entries = clientMapGet(APP_STATE.progressEntries, c.id) || [];
      const lastEntry = entries.length ? entries[0].entry_date : null;
      const entryDays = lastEntry ? Math.floor((today - parseDate(lastEntry)) / 86400000) : Infinity;

      // ---- risk score 0..100 ----
      let risk = 0;
      if (daysSince >= 30) risk += 45; else if (daysSince >= 14) risk += 30; else if (daysSince >= 10) risk += 15;
      if (entryDays >= 45) risk += 20; else if (entryDays >= 30) risk += 10;
      if (in90 === 0) risk += 25;
      if (plannedPerWeek > 0 && wkly30 < plannedPerWeek * 0.5) risk += 15;
      if (!c.phone) risk += 5;
      risk = Math.min(100, risk);

      const status = risk >= 60 ? 'high' : risk >= 30 ? 'watch' : 'healthy';
      const action = risk >= 60
        ? 'Call/WhatsApp today — check in & rebook'
        : risk >= 30
          ? 'Send motivation message + set next class time'
          : 'On track — keep cadence';

      rows.push({
        client: c, name: c.name, loginId: c.login_id, rate,
        in30, in60, in90, wkly30, monthCount, monthRev: monthCount * rate,
        projectedMonth: wkly30 * 4.345 * rate,
        lastSession: dates.length ? dates[dates.length - 1] : null,
        daysSince: Number.isFinite(daysSince) ? daysSince : null,
        lastEntry: lastEntry, entryDays: Number.isFinite(entryDays) ? entryDays : null,
        plannedPerWeek, adherence: plannedPerWeek > 0 ? Math.min(1.5, wkly30 / plannedPerWeek) : null,
        risk, status, action, dates
      });
    });

    rows.sort((a, b) => b.risk - a.risk);

    // retention: % of clients active 90d ago still training now
    const trainedRecently = rows.filter(r => r.in90 > 0).length;
    const retentionPct = rows.length ? (trainedRecently / rows.length) * 100 : 0;
    const atRisk = rows.filter(r => r.status !== 'healthy');

    return {
      rows, monthSessions, monthRevenue, forecastMonthly,
      retentionPct, totalActive: rows.length, retained: trainedRecently,
      atRisk, healthy: rows.length - atRisk.length,
      avgWeekly: rows.length ? rows.reduce((s, r) => s + r.wkly30, 0) / rows.length : 0,
      noShowEstimate: (() => {
        // planned minus actual over last 30 days across roster
        const planned = rows.reduce((s, r) => s + (r.plannedPerWeek || 0) * (30 / 7), 0);
        const done = rows.reduce((s, r) => s + r.in30, 0);
        return planned > 0 ? Math.max(0, ((planned - done) / planned) * 100) : null;
      })()
    };
  };

  // ---------------- tiny SVG widgets ----------------
  function sparkline(dates, opts) {
    opts = opts || {};
    const W = 120, H = 28;
    const days = (opts.days || 60);
    const buckets = new Array(days).fill(0);
    const today = new Date();
    dates.forEach(dstr => {
      const d = parseDate(dstr); if (!d) return;
      const idx = days - 1 - Math.floor((today - d) / 86400000);
      if (idx >= 0 && idx < days) buckets[idx] += 1;
    });
    const max = Math.max(1, ...buckets);
    const pts = buckets.map((v, i) => `${(i / (days - 1) * (W - 4) + 2).toFixed(1)},${(H - 3 - (v / max) * (H - 6)).toFixed(1)}`).join(' ');
    const area = `2,${H - 2} ${pts} ${W - 2},${H - 2}`;
    const color = opts.color || '#22c55e';
    return `<svg viewBox="0 0 ${W} ${H}" class="cds-spark" aria-hidden="true">` +
      `<polygon points="${area}" fill="${color}" opacity="0.12"/>` +
      `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  }

  function barRow(label, value, max, color, suffix) {
    const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    return `<div class="cds-bar-row"><span class="cds-bar-label">${esc(label)}</span>` +
      `<span class="cds-bar-track"><span class="cds-bar-fill" style="width:${pct.toFixed(0)}%;background:${color}"></span></span>` +
      `<span class="cds-bar-val">${fmt(value, value < 10 ? 1 : 0)}${suffix || ''}</span></div>`;
  }

  function kpiTile(icon, value, label, sub, tone) {
    return `<div class="cds-kpi ${tone || ''}"><span class="cds-kpi-icon">${icon}</span>` +
      `<span class="cds-kpi-value">${value}</span><span class="cds-kpi-label">${esc(label)}</span>` +
      (sub ? `<span class="cds-kpi-sub">${esc(sub)}</span>` : '') + `</div>`;
  }

  // ---------------- render ----------------
  let _lastModel = null;

  window.renderCoachDashboard = async function () {
    const mount = $id('coachDashBody');
    if (!mount) return;
    const model = window.tasBuildCoachAnalytics();
    _lastModel = model;

    const top = [
      kpiTile('🔁', fmt(model.retentionPct, 0) + '%', '90-day retention', `${model.retained}/${model.totalActive} active clients trained`, model.retentionPct >= 80 ? 'good' : model.retentionPct >= 60 ? 'warn' : 'bad'),
      kpiTile('💵', 'AED ' + money(model.monthRevenue), 'Revenue this month', `${model.monthSessions} sessions logged`, ''),
      kpiTile('📈', 'AED ' + money(model.forecastMonthly), 'Projected monthly revenue', 'based on trailing 30-day pace', ''),
      kpiTile('⚠️', String(model.atRisk.length), 'Clients needing attention', model.atRisk.length ? 'see risk board below' : 'all healthy 🎉', model.atRisk.length ? 'warn' : 'good'),
      kpiTile('📅', fmt(model.avgWeekly, 1), 'Avg sessions / week', 'per active client', ''),
      kpiTile('🚫', model.noShowEstimate == null ? '—' : fmt(model.noShowEstimate, 0) + '%', 'Planned-vs-done gap', model.noShowEstimate == null ? 'set planned/week in client settings' : 'last 30 days', model.noShowEstimate != null && model.noShowEstimate > 30 ? 'bad' : '')
    ].join('');

    // Risk board
    const maxSess = Math.max(1, ...model.rows.map(r => r.in30));
    const riskRows = model.rows.map(r => {
      const badge = r.status === 'high' ? '🔴 High' : r.status === 'watch' ? '🟡 Watch' : '🟢 Healthy';
      return `<tr class="cds-row-${r.status}">
        <td><button type="button" class="cds-name-btn" data-open-client="${esc(r.client.id)}">${esc(r.name)}</button><br><span class="cds-muted">${esc(r.loginId || '')}</span></td>
        <td>${sparkline(r.dates, { color: r.status === 'high' ? '#ef4444' : r.status === 'watch' ? '#f59e0b' : '#22c55e' })}</td>
        <td>${fmt(r.wkly30, 1)}</td>
        <td>${r.daysSince == null ? '—' : r.daysSince + 'd'}</td>
        <td>${r.entryDays == null ? '—' : r.entryDays + 'd'}</td>
        <td>AED ${money(r.projectedMonth)}</td>
        <td><span class="cds-badge cds-badge-${r.status}">${badge} ${r.risk}</span></td>
        <td class="cds-action">${esc(r.action)}</td>
      </tr>`;
    }).join('');

    const engagementTop = [...model.rows].sort((a, b) => b.in30 - a.in30).slice(0, 6)
      .map(r => barRow(r.name, r.in30, maxSess, '#22c55e', ' sess')).join('') || '<div class="cds-muted">No session data yet.</div>';

    const revenueTop = [...model.rows].sort((a, b) => b.projectedMonth - a.projectedMonth).slice(0, 6)
      .map(r => barRow(r.name, r.projectedMonth, Math.max(1, ...model.rows.map(x => x.projectedMonth)), '#3b82f6', ' AED')).join('') || '<div class="cds-muted">No data.</div>';

    mount.innerHTML = `
      <div class="cds-kpis">${top}</div>
      <div class="cds-section-title">🚨 Client risk board <button class="btn-ghost btn-sm" id="cdsExportCsv" type="button">⬇️ Export CSV</button></div>
      <div class="cds-table-wrap"><table class="cds-table">
        <thead><tr><th>Client</th><th>Last 60 days</th><th>Sess/wk</th><th>Since class</th><th>Since weigh-in</th><th>Proj. revenue/mo</th><th>Risk</th><th>Suggested action</th></tr></thead>
        <tbody>${riskRows || '<tr><td colspan="8" class="cds-muted">No active clients yet.</td></tr>'}</tbody>
      </table></div>
      <div class="cds-cols">
        <div class="cds-col"><div class="cds-section-title">🏅 Most engaged (30d)</div>${engagementTop}</div>
        <div class="cds-col"><div class="cds-section-title">💰 Top projected revenue</div>${revenueTop}</div>
      </div>`;

    // wire events
    mount.querySelectorAll('[data-open-client]').forEach(b =>
      b.addEventListener('click', () => {
        if (typeof window.openClientFromAnywhere === 'function') window.openClientFromAnywhere(b.dataset.openClient);
      }));
    const ex = $id('cdsExportCsv');
    if (ex) ex.addEventListener('click', exportCsv);
  };

  function exportCsv() {
    if (!_lastModel) return;
    const head = ['Name', 'Login ID', 'Rate AED', 'Sessions 30d', 'Sessions 90d', 'Avg/week', 'Last session', 'Days since class', 'Last weigh-in', 'Risk', 'Status'];
    const lines = [head.join(',')].concat(_lastModel.rows.map(r => [
      `"${(r.name || '').replace(/"/g, '""')}"`, r.loginId, r.rate, r.in30, r.in90,
      r.wkly30.toFixed(2), r.lastSession || '', r.daysSince == null ? '' : r.daysSince,
      r.lastEntry || '', r.risk, r.status
    ].join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tas-coach-analytics-' + dayKey(new Date()) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---------------- workspace wiring ----------------
  // Add the 📊 Insights button to the admin workspace tab bar once, and
  // hook showAdminWorkspaceTab to render on open.
  function ensureTabButton() {
    const bar = document.querySelector('.admin-workspace-tabs');
    if (!bar || $id('adminTabInsightsBtn')) return;
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.setAttribute('data-atab2', 'insights');
    btn.setAttribute('type', 'button');
    btn.setAttribute('role', 'tab');
    btn.id = 'adminTabInsightsBtn';
    btn.textContent = '📊 Insights';
    bar.appendChild(btn);

    const wsClients = $id('adminWorkspaceClients');
    if (!wsClients) return;
    const ws = document.createElement('div');
    ws.id = 'adminWorkspaceInsights';
    ws.className = 'admin-workspace hidden';
    ws.innerHTML = `<div class="cds-header"><h3 class="admin-section-title" style="margin:0">🏆 Coach Dashboard Pro</h3>
        <button class="btn-ghost btn-sm" id="cdsRefresh" type="button">↻ Recalculate</button></div>
      <div id="coachDashBody"><div class="cds-muted">Open this tab to compute KPIs…</div></div>`;
    wsClients.parentNode.insertBefore(ws, wsClients.nextSibling);

    const orig = window.showAdminWorkspaceTab;
    if (orig && !window.__coachDashWrapped) {
      window.__coachDashWrapped = true;
      window.showAdminWorkspaceTab = function (tab) {
        const out = orig.apply(this, arguments);
        const ins = $id('adminWorkspaceInsights');
        if (ins) ins.classList.toggle('hidden', tab !== 'insights');
        if (tab === 'insights') {
          try { window.renderCoachDashboard(); } catch (e) { console.warn(e); }
        }
        return out;
      };
    }
    const rf = $id('cdsRefresh');
    if (rf) rf.addEventListener('click', () => {
      if (typeof refreshAllData === 'function') {
        refreshAllData().then(() => window.renderCoachDashboard()).catch(() => window.renderCoachDashboard());
      } else window.renderCoachDashboard();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureTabButton);
  } else ensureTabButton();
})();
