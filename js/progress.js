window.renderProgressEntries = function (containerId, clientId, adminMode) {
  const entries = clientMapGet(APP_STATE.progressEntries, clientId) || [];
  const pending = APP_STATE.progressApprovals
    .filter(a => sameId(a.client_id, clientId) && a.status === 'pending' && a.action === 'add');
  const container = $(containerId);
  if (!container) return;
  if (entries.length === 0 && pending.length === 0) {
    container.innerHTML = `<div class="empty-message">No progress entries yet.</div>`;
    return;
  }
  let html = '';
  if (!adminMode) {
    pending.forEach(a => {
      const d = a.proposed_data || {};
      const parts = [];
      if (d.weight_kg) parts.push(`<div class="item"><div class="label">Weight</div><div class="value">${d.weight_kg} kg</div></div>`);
      if (d.body_fat_pct) parts.push(`<div class="item"><div class="label">Body Fat</div><div class="value">${d.body_fat_pct}%</div></div>`);
      if (d.chest_cm) parts.push(`<div class="item"><div class="label">Chest</div><div class="value">${d.chest_cm} cm</div></div>`);
      if (d.waist_cm) parts.push(`<div class="item"><div class="label">Waist</div><div class="value">${d.waist_cm} cm</div></div>`);
      if (d.hips_cm) parts.push(`<div class="item"><div class="label">Hips</div><div class="value">${d.hips_cm} cm</div></div>`);
      if (d.arms_cm) parts.push(`<div class="item"><div class="label">Arms</div><div class="value">${d.arms_cm} cm</div></div>`);
      if (d.thighs_cm) parts.push(`<div class="item"><div class="label">Thighs</div><div class="value">${d.thighs_cm} cm</div></div>`);
      html += `<div class="progress-entry pending"><div class="progress-entry-header"><span class="progress-entry-date">📅 ${d.entry_date || '—'}</span><span class="progress-entry-pending-badge">⏳ Pending approval</span></div><div class="progress-entry-grid">${parts.join('')}</div>${d.notes ? `<div class="progress-entry-note">📝 ${escapeHtml(d.notes)}</div>` : ''}</div>`;
    });
  }
  entries.forEach(e => {
    const byLabel = e.added_by === 'admin' ? '👨‍🏫 Admin' : '🙋 Client';
    const parts = [];
    if (e.weight_kg) parts.push(`<div class="item"><div class="label">Weight</div><div class="value">${e.weight_kg} kg</div></div>`);
    if (e.body_fat_pct) parts.push(`<div class="item"><div class="label">Body Fat</div><div class="value">${e.body_fat_pct}%</div></div>`);
    if (e.chest_cm) parts.push(`<div class="item"><div class="label">Chest</div><div class="value">${e.chest_cm} cm</div></div>`);
    if (e.waist_cm) parts.push(`<div class="item"><div class="label">Waist</div><div class="value">${e.waist_cm} cm</div></div>`);
    if (e.hips_cm) parts.push(`<div class="item"><div class="label">Hips</div><div class="value">${e.hips_cm} cm</div></div>`);
    if (e.arms_cm) parts.push(`<div class="item"><div class="label">Arms</div><div class="value">${e.arms_cm} cm</div></div>`);
    if (e.thighs_cm) parts.push(`<div class="item"><div class="label">Thighs</div><div class="value">${e.thighs_cm} cm</div></div>`);
    let photoHtml = '';
    if (e.photo_url) {
      if (/^https?:\/\//.test(e.photo_url))
        photoHtml = `<div style="margin-top:0.4rem;font-size:0.75rem;"><a href="${escapeHtml(e.photo_url)}" target="_blank" style="color:#1976d2;">📷 View photo</a></div>`;
      else
        photoHtml = `<div class="progress-photo-wrap"><img data-gdrive-id="${escapeHtml(e.photo_url)}" alt="Progress photo"></div>`;
    }
    html += `<div class="progress-entry"><div class="progress-entry-header"><span class="progress-entry-date">📅 ${e.entry_date}</span><span class="progress-entry-by">${byLabel}</span></div><div class="progress-entry-grid">${parts.join('')}</div>${e.notes ? `<div class="progress-entry-note">📝 ${escapeHtml(e.notes)}</div>` : ''}${photoHtml}${adminMode ? `<div style="margin-top:0.5rem;text-align:right;"><button class="btn-danger-small btn-small delete-progress-btn" data-id="${e.id}" data-client="${clientId}">🗑️</button></div>` : ''}</div>`;
  });
  container.innerHTML = html;
  if (window.DriveImages) window.DriveImages.init(container);
  if (adminMode) {
    container.querySelectorAll('.delete-progress-btn').forEach(b => {
      b.addEventListener('click', async () => {
        if (!await uiConfirm({ title: 'Delete Progress Entry', message: 'Delete this progress entry permanently?', confirmText: '🗑️ Delete', danger: true })) return;
        await APP_STATE.supabaseClient.from('progress_entries').delete().eq('id', b.dataset.id);
        clientMapSet(APP_STATE.progressEntries, b.dataset.client, (clientMapGet(APP_STATE.progressEntries, b.dataset.client) || [])
          .filter(x => String(x.id) !== String(b.dataset.id)));
        renderProgressEntries(containerId, b.dataset.client, true);
      });
    });
  }
};

window.renderAdminProgress = function () {
  if (APP_STATE.selectedClientId) renderProgressEntries('adminProgressList', APP_STATE.selectedClientId, true);
  if (typeof window.renderProgressDashboard === 'function') window.renderProgressDashboard();
};

// ============================================================
// MONTHLY PROGRESS DASHBOARD — every client must add at least one
// progress entry per calendar month. Green tick = submitted,
// red cross = missing. Rendered in the admin "Progress" tab.
// ============================================================
window.renderProgressDashboard = function () {
  const box = $('progressDashboardContainer');
  if (!box) return;
  const clients = APP_STATE.clients.filter(c => c.active);
  if (clients.length === 0) { box.innerHTML = '<div class="empty-message">No active clients yet.</div>'; return; }
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  let compliantCount = 0;
  let html = `<table class="compliance-table"><thead><tr><th>Client</th>${
    months.map(mk => `<th>${getMonthName(parseInt(mk.slice(5, 7), 10) - 1).slice(0, 3)} ${mk.slice(2, 4)}</th>`).join('')
  }</tr></thead><tbody>`;
  clients.forEach(c => {
    const comp = getProgressCompliance(c, months[months.length - 1]);
    // A month counts as required only from the month the client joined.
    const joinKey = getClientMonthsSinceJoin(c, months[months.length - 1])[0] || '9999-99';
    const cells = months.map(mk => {
      if (mk < joinKey) return '<td class="comp-na">·</td>';
      return comp.covered.has(mk)
        ? '<td class="comp-ok" title="Progress submitted">✔</td>'
        : '<td class="comp-missing" title="Missing this month">✘</td>';
    }).join('');
    const missingRecent = months.filter(mk => mk >= joinKey && !comp.covered.has(mk));
    if (missingRecent.length === 0) compliantCount++;
    html += `<tr><td class="comp-name">${escapeHtml(c.name)}</td>${cells}</tr>`;
  });
  html += '</tbody></table>';
  const summary = `${compliantCount}/${clients.length} clients fully up to date`
    + (clients.length - compliantCount > 0 ? ' — send them a reminder 📩' : ' 🎉');
  box.innerHTML = `<div class="compliance-summary ${compliantCount === clients.length ? 'ok' : 'warn'}">${summary}</div>` + html;
};

window.renderClientProgress = function (c) { renderProgressEntries('clientProgressList', c.id, false); };

window.renderClientHistory = function (c) {
  const container = $('clientHistoryList');
  if (!container) return;
  // 🔒 Client's own history merges their pending edit proposals (draft view);
  // the admin/trainer views keep showing only approved values.
  const merge = !!APP_STATE.loggedInClient && typeof getPendingLogEditsFor === 'function';
  // Includes BOTH days with logged exercises AND finished sessions (even if
  // no exercises were logged), so completed classes are never hidden.
  const dates = getAllWorkoutDates(c.id);
  if (dates.length === 0) {
    container.innerHTML = `<div class="empty-message">No workouts logged yet.<br>Your finished sessions will appear here automatically.</div>`;
    return;
  }
  let html = '';
  dates.forEach(dateStr => {
    let logs = getWorkoutLogs(c.id, dateStr);
    let pendCount = 0;
    if (merge) {
      const pend = getPendingLogEditsFor(c.id, dateStr);
      const map = {};
      pend.forEach(r => { if (r.proposed_data && r.entry_log_id != null) map[String(r.entry_log_id)] = r; });
      pendCount = pend.length;
      logs = logs
        .filter(log => (map[String(log.id)] || {}).proposed_action !== 'delete')
        .map(log => {
          const pr = map[String(log.id)];
          return (pr && pr.proposed_action === 'edit') ? { ...log, ...pr.proposed_data } : log;
        })
        .concat(pend.filter(r => r.proposed_action === 'add' && r.proposed_data)
          .map(r => ({ id: 'proposed-' + r.id, exercise_name: (r.proposed_data || {}).exercise_name || 'New exercise', _proposed: true })));
    }
    const finished = isSessionCheckedForDate(c.id, dateStr);
    const dParts = dateStr.split('-');
    const dateLabel = formatDateReadable(parseInt(dParts[0]), parseInt(dParts[1]) - 1, parseInt(dParts[2]));
    let exercisesHtml = '';
    logs.forEach(log => {
      const name = getWorkoutDisplayName(log);
      const details = [];
      if (log.sets_done) details.push(`${log.sets_done}×`);
      if (log.reps_done) details.push(log.reps_done);
      if (log.weight_done) details.push(`@ ${log.weight_done}`);
      exercisesHtml += `<div class="history-exercise"><span class="history-exercise-name">${escapeHtml(name)}${log._proposed ? ' <span class="lock-status-chip" style="font-size:0.6rem;">🕓 pending approval</span>' : ''}</span><span class="history-exercise-details">${escapeHtml(details.join(' ') || '—')}</span></div>`;
    });
    if (logs.length === 0 && finished) {
      exercisesHtml = `<div class="history-exercise"><span class="history-exercise-name" style="font-style:italic;color:var(--muted);">Session finished — no exercises were logged for this day.</span></div>`;
    }
    const countLabel = logs.length > 0
      ? `${logs.length} exercise${logs.length > 1 ? 's' : ''}`
      : 'no log';
    // Clients edit via ✏️ (staged proposals, applied on trainer approval);
    // class cancellations are 🚫 staged requests, applied on approval.
    const chips = [];
    if (pendCount > 0) chips.push(`<span class="lock-status-chip" title="Waiting for trainer approval">🕓 ${pendCount} change${pendCount > 1 ? 's' : ''} pending</span>`);
    // No 📨 Request button any more — schedule changes go through ✏️ Edit
    // (exercise proposals) or the per-day controls in the upcoming card.
    const extraHtml = chips.length ? `<span class="lock-status-chip-wrap">${chips.join(' ')}</span>` : '';
    html += `<div class="history-item ${finished ? 'finished' : 'open'}" data-date="${dateStr}">
      <div class="history-item-header">
        <span class="history-item-date">📅 ${dateLabel}</span>
        <span class="history-item-meta">
          ${extraHtml}
          <span class="history-item-count">${countLabel}</span>
        </span>
      </div>
      <div class="history-item-exercises hidden">${exercisesHtml}</div>
    </div>`;
  });
  container.innerHTML = html;
  container.querySelectorAll('.history-item').forEach(item =>
    item.addEventListener('click', () => {
      const expanded = item.classList.toggle('expanded');
      item.querySelector('.history-item-exercises').classList.toggle('hidden', !expanded);
    }));
};

window.initClientLogViewer = function () {
  const list = $('clientHistoryList');
  if (!list || list.dataset.viewerBound === '1') return;
  list.dataset.viewerBound = '1';
  list.addEventListener('dblclick', (e) => {
    const c = APP_STATE.loggedInClient;
    if (!c) return;
    const item = e.target.closest('.history-item');
    if (!item) return;
    openClientDayLog(item.dataset.date);
  });
};

// Open the day-log modal for a specific ISO date from the client portal.
// Works across month boundaries (the admin grid is single-month, so we set
// selectedMonth/selectedDay accordingly before reusing the same modal).
// NEW FLOW: clients get an ✏️ Edit option — while editing, their changes are
// staged as proposals and only reach the official log after trainer approval.
window.openClientDayLog = function (dateStr) {
  const c = APP_STATE.loggedInClient;
  if (!c || !dateStr) return;
  const parts = dateStr.split('-').map(Number);
  APP_STATE.selectedClientId = c.id;
  APP_STATE.selectedYear = parts[0];
  APP_STATE.selectedMonth = parts[1] - 1;
  APP_STATE.selectedDay = parts[2];
  openDayLogModal(parts[2]);
  if (!APP_STATE.loggedInClient) return;
  const editing = APP_STATE.clientEditingDay === dateStr;

  const body = $('addExerciseBody');
  if (body) body.classList.add('hidden');
  const toggle = $('addExerciseToggleBtn');
  if (toggle) toggle.style.display = 'none';

  document.querySelectorAll('#dayLogModal input, #dayLogModal select, #dayLogModal textarea')
    .forEach(el => { el.disabled = true; });
  document.querySelectorAll('#dayLogModal .remove-log-btn, #dayLogModal .library-chip')
    .forEach(el => el.remove());

  // ✏️ Edit mode: unlock the merged proposal fields and expose a compact
  // "➕ Propose add" row (reusing the custom-exercise name input).
  if (editing) {
    document.querySelectorAll('#dayLogExisting .log-field').forEach(el => { el.disabled = false; });
    const freeRow = $('freeExName') ? $('freeExName').closest('.free-add-row') : null;
    if (freeRow) {
      freeRow.style.display = '';
      if (!$('clientProposeAddRow')) {
        const wrap = document.createElement('div');
        wrap.id = 'clientProposeAddRow';
        wrap.className = 'day-open-banner';
        wrap.style.cssText = 'display:flex;gap:0.5rem;align-items:center;margin-top:0.4rem;flex-wrap:wrap;';
        wrap.innerHTML = `<input type="text" id="clientProposeExName" placeholder="New exercise name…" style="flex:1;min-width:160px;">
          <button class="btn-primary btn-small" id="clientProposeAddBtn">➕ Propose add</button>`;
        freeRow.after(wrap);
        $('clientProposeAddBtn').addEventListener('click', () => {
          const nm = ($('clientProposeExName').value || '').trim();
          if (nm) addClientExerciseProposal(nm);
        });
      }
    }
  } else {
    const freeRow = $('freeExName') ? $('freeExName').closest('.free-add-row') : null;
    if (freeRow) freeRow.style.display = 'none';
    const oldWrap = $('clientProposeAddRow');
    if (oldWrap) oldWrap.remove();
  }

  const banner = $('dayLogLockBanner');
  if (banner) {
    const d = document.createElement('div');
    d.className = 'day-open-banner';
    d.style.cssText = 'display:flex;gap:0.6rem;align-items:center;flex-wrap:wrap;margin-top:0.4rem;';
    if (editing) {
      d.innerHTML = `✏️ Editing ${escapeHtml(formatDateReadable(parts[0], parts[1] - 1, parts[2]))} — your changes are saved as proposals and appear in the official log only after your trainer approves them.` +
        `<button class="btn-secondary btn-small" id="clientEditDoneBtn">✔ Done editing</button>`;
    } else {
      d.innerHTML = `👁 Read-only view of your approved log.` +
        `<button class="btn-request-edit btn-small" id="clientEditDayBtn">✏️ Edit exercises</button>`;
    }
    banner.appendChild(d);
    const eb = $('clientEditDayBtn');
    if (eb) eb.addEventListener('click', () => openClientDayLogEdit(dateStr));
    const db = $('clientEditDoneBtn');
    if (db) db.addEventListener('click', () => cancelClientDayLogEdit(dateStr));
  }
};

window.renderClientPlan = function (c, assignedOverride) {
  const container = $('clientPlanList');
  if (!container) return;

  // First paint while data is still loading: show a skeleton, not the empty
  // state — otherwise clients briefly see "No template exercises assigned".
  if (assignedOverride === undefined && APP_STATE.clientExercisesCache === null) {
    container.innerHTML = `<div class="plan-empty"><div class="plan-empty-icon">⏳</div><div>Loading your plan…</div></div>`;
    return;
  }

  const assigned = (assignedOverride !== undefined ? assignedOverride
    : (clientMapGet(APP_STATE.clientExercisesCache, c.id) || []))
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  // Which exercises were already performed in at least one finished session?
  const doneNames = new Set();
  getAllWorkoutDates(c.id).forEach(dateStr => {
    if (!isSessionCheckedForDate(c.id, dateStr)) return;
    getWorkoutLogs(c.id, dateStr).forEach(log => {
      const n = (getWorkoutDisplayName(log) || '').trim().toLowerCase();
      if (n) doneNames.add(n);
      if (log.exercise_id) {
        const ex = getExercise(log.exercise_id);
        if (ex) doneNames.add((ex.name || '').trim().toLowerCase());
      }
    });
  });

  if (assigned.length === 0) {
    // No template assigned yet — but if the client/trainer has been logging
    // exercises directly on days, show those as the working plan so the tab
    // is never misleadingly empty.
    const loggedNames = [];
    const seen = new Set();
    getAllWorkoutDates(c.id).forEach(dateStr => {
      getWorkoutLogs(c.id, dateStr).forEach(log => {
        const n = (getWorkoutDisplayName(log) || '').trim();
        if (n && !seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); loggedNames.push(n); }
      });
    });
    if (loggedNames.length > 0) {
      let lhtml = '';
      loggedNames.forEach(n => {
        const done = doneNames.has(n.toLowerCase());
        lhtml += `<div class="plan-card ${done ? 'done' : ''}">
          <div class="plan-card-main"><div class="plan-card-name">${escapeHtml(n)}</div>
          <div class="plan-card-meta"><span class="plan-chip subtle">Logged in sessions</span></div></div>
          <div class="plan-card-status">${done ? '<span class="history-pill done">✅ Done in a finished session</span>' : '<span class="history-pill open">⏳ Not completed yet</span>'}</div>
        </div>`;
      });
      container.innerHTML = `<div class="plan-progress-head"><span><strong>${loggedNames.length}</strong> exercises logged so far (no trainer template assigned yet)</span></div>${lhtml}`;
    } else {
      container.innerHTML = `<div class="plan-empty">
        <div class="plan-empty-icon">🏋️</div>
        <div><strong>No template exercises assigned yet.</strong><br>
        Your trainer sets your plan here — meanwhile you can still log any exercise
        on an open (not finished) session day from the History tab.</div></div>`;
    }
    // Still try to refresh from the server in case the bulk cache missed rows.
    if (typeof window.fetchClientPlan === 'function' && APP_STATE.supabaseClient) {
      window.fetchClientPlan(c.id).then(list => {
        if (list && list.length) renderClientPlan(c, list);
      }).catch(() => {});
    }
    return;
  }

  let html = '';
  let doneCount = 0;
  assigned.forEach(a => {
    const ex = getExercise(a.exercise_id); if (!ex) return;
    const done = doneNames.has((ex.name || '').trim().toLowerCase());
    if (done) doneCount++;
    const meta = [];
    const sets = a.custom_sets || ex.default_sets;
    const reps = a.custom_reps || ex.default_reps;
    const weight = a.custom_weight || ex.default_weight;
    const rest = a.custom_rest || ex.default_rest;
    if (sets && reps) meta.push(`${sets} × ${reps}`);
    if (weight) meta.push(`Weight: ${weight}`);
    if (rest) meta.push(`Rest: ${rest}`);
    html += `<div class="plan-card ${done ? 'done' : ''}">
      <div class="plan-card-main">
        <div class="plan-card-name">${escapeHtml(ex.name)}</div>
        <div class="plan-card-meta">
          ${meta.map(m => `<span class="plan-chip">${escapeHtml(String(m))}</span>`).join('')}
          ${ex.category ? `<span class="plan-chip subtle">${escapeHtml(ex.category)}</span>` : ''}
          ${ex.muscle_group ? `<span class="plan-chip subtle">${escapeHtml(ex.muscle_group)}</span>` : ''}
        </div>
        ${a.custom_notes ? `<div class="plan-card-note">📝 ${escapeHtml(a.custom_notes)}</div>` : ''}
      </div>
      <div class="plan-card-status">${done ? '<span class="history-pill done">✅ Done in a finished session</span>' : '<span class="history-pill open">⏳ Not completed yet</span>'}</div>
    </div>`;
  });
  const pct = assigned.length ? Math.round((doneCount / assigned.length) * 100) : 0;
  container.innerHTML = `
    <div class="plan-progress-head">
      <span><strong>${doneCount}</strong> of <strong>${assigned.length}</strong> plan exercises completed in finished sessions</span>
      <button class="btn-secondary btn-small" id="clientViewScheduleBtn">📅 View my schedule</button>
    </div>
    <div class="plan-progress-bar"><div class="plan-progress-fill" style="width:${pct}%"></div></div>
    ${html}`;
  const vs = $('clientViewScheduleBtn');
  if (vs) vs.addEventListener('click', () => {
    const first = document.querySelector('#clientUpcomingList .client-upcoming-item[data-date]');
    if (first) openClientDayLog(first.dataset.date);
    else showToast('📅 No scheduled days yet — your trainer will set them soon.', 'info');
  });
};

window.renderClientProfile = function (c) {
  const p = clientMapGet(APP_STATE.clientProfiles, c.id) || {};
  const fields = [
    ['Height', p.height_cm ? p.height_cm + ' cm' : '—'],
    ['Gender', p.gender || '—'],
    ['Birth date', p.birth_date || '—'],
    ['Goal', p.goal || '—'],
    ['Medical notes', p.medical_notes || '—'],
    ['Emergency contact', p.emergency_contact || '—']
  ];
  let html = '<div class="profile-grid">';
  fields.forEach(([k, v]) => {
    html += `<div class="profile-field"><div class="label">${escapeHtml(k)}</div><div class="value">${escapeHtml(v)}</div></div>`;
  });
  html += '</div>';
  $('clientProfileView').innerHTML = html;
};

window.renderClientUpcoming = function (c) {
  const container = $('clientUpcomingList');
  if (!container) return;
  // Show every scheduled class for the next 14 days — including days whose
  // time the trainer has set AND sessions that were already marked finished,
  // so nothing the trainer scheduled ever disappears from the client view.
  // Days with an APPROVED cancellation are skipped entirely (class gone).
  const items = getScheduledDaysAhead(c.id, 14);
  const today = new Date();
  const todayStr = formatDateISO(today.getFullYear(), today.getMonth(), today.getDate());
  const decidedCancels = {};
  (APP_STATE.clientRequests || []).forEach(r => {
    // BUG FIX: previously ANY non-pending status (approved | rejected) was
    // recorded here, and 'rejected' rows kept rendering stale "Cancel
    // declined" / 🚫 chips on days that no longer exist after a wipe —
    // producing phantom future dates (e.g. "9 October") in every client
    // portal. Only APPROVED cancellations suppress a day; rejected/withdrawn
    // requests are ignored entirely.
    if (sameId(r.client_id, c.id) && r.request_type === 'cancel' && r.session_date && r.status === 'approved') {
      decidedCancels[r.session_date] = 'approved';
    }
  });
  let html = '';
  const visible = items.filter(it => decidedCancels[it.dateStr] !== 'approved');
  if (visible.length === 0) {
    html = `<div class="client-upcoming-empty">📭 No classes scheduled in the next few days yet.<br>
      <span>Your trainer will set your upcoming session times here.</span></div>`;
  } else {
    visible.forEach(it => {
      const isToday = it.dateStr === todayStr;
      const timeHtml = it.time
        ? `<span class="client-upcoming-time">⏰ ${formatClassTime12(it.time)}</span>`
        : `<span class="client-upcoming-time-not-set">Time not set yet</span>`;
      let statusHtml = it.done
        ? '<span class="history-pill done">✅ Finished</span>'
        : (isToday ? '<span class="history-pill today">🔥 Today</span>' : '<span class="history-pill open">⏳ Pending</span>');
      const pendEdits = typeof getPendingLogEditsFor === 'function'
        ? getPendingLogEditsFor(c.id, it.dateStr) : [];
      // NEW FLOW: no 📨 "request a change" button. The client edits their
      // exercises directly (staged proposals, applied on trainer approval).
      // Times stay trainer-controlled.
      let actionBtn = `<button class="btn-request-edit btn-small client-edit-btn" data-date="${it.dateStr}" title="Edit your exercises for this day — changes need trainer approval">✏️ Edit</button>`;
      if (pendEdits.length > 0) actionBtn += `<span class="lock-status-chip">🕓 ${pendEdits.length} pending</span>`;
      html += `<div class="client-upcoming-item ${it.done ? 'done' : 'open'}" data-date="${it.dateStr}">
        <span class="client-upcoming-icon">${it.done ? '✅' : '📅'}</span>
        <div class="client-upcoming-body">
          <div class="client-upcoming-title-row"><strong>${isToday ? 'Today' : formatDateReadable(it.y, it.m, it.day)}</strong>${statusHtml}</div>
          <div class="client-upcoming-sub">${timeHtml}${it.note ? ` · 📝 ${escapeHtml(it.note)}` : ''}</div>
        </div>
        <div class="client-upcoming-actions">
          <button class="btn-secondary btn-small client-upcoming-open" data-date="${it.dateStr}" title="Read-only view of this day's plan & log">👁 View</button>
          ${actionBtn}
        </div>
      </div>`;
    });
  }
  container.innerHTML = html;
  container.querySelectorAll('.client-upcoming-open').forEach(btn =>
    btn.addEventListener('click', (e) => { e.stopPropagation(); openClientDayLog(btn.dataset.date); }));
  container.querySelectorAll('.client-edit-btn').forEach(btn =>
    btn.addEventListener('click', (e) => { e.stopPropagation(); openClientDayLogEdit(btn.dataset.date); }));
  container.querySelectorAll('.client-upcoming-item[data-date]').forEach(item =>
    item.addEventListener('dblclick', () => openClientDayLog(item.dataset.date)));

  const rs = clientMapGet(APP_STATE.clientSettings, c.id) || {};
  if (rs.note) {
    $('clientUpcomingNote').textContent = `📝 Note from trainer: ${rs.note}`;
    $('clientUpcomingNote').classList.remove('hidden');
  } else {
    $('clientUpcomingNote').classList.add('hidden');
  }
  $('clientUpcomingBlock').classList.remove('hidden');
};

window.openProgressModal = function (entry, clientId, addedBy) {
  APP_STATE.selectedClientForProgress = { clientId, addedBy };
  if (entry) {
    $('editProgressId').value = entry.id;
    $('progressModalTitle').textContent = '✏️ Edit';
    $('pgDate').value = entry.entry_date || '';
    $('pgWeight').value = entry.weight_kg || '';
    $('pgBodyFat').value = entry.body_fat_pct || '';
    $('pgChest').value = entry.chest_cm || '';
    $('pgWaist').value = entry.waist_cm || '';
    $('pgHips').value = entry.hips_cm || '';
    $('pgArms').value = entry.arms_cm || '';
    $('pgThighs').value = entry.thighs_cm || '';
    $('pgNotes').value = entry.notes || '';
    $('pgPhoto').value = entry.photo_url || '';
  } else {
    $('editProgressId').value = '';
    $('progressModalTitle').textContent = addedBy === 'admin' ? '➕ Add (as Admin)' : '➕ Add My Progress';
    $('pgDate').value = new Date().toISOString().split('T')[0];
    ['pgWeight', 'pgBodyFat', 'pgChest', 'pgWaist', 'pgHips', 'pgArms', 'pgThighs', 'pgNotes', 'pgPhoto']
      .forEach(i => $(i).value = '');
  }
  $('progressModal').classList.remove('hidden');
  clearStatus($('progressModalStatus'));
};

window.saveProgress = async function () {
  if (!APP_STATE.selectedClientForProgress) return;
  const { clientId, addedBy } = APP_STATE.selectedClientForProgress;
  const proposed = {
    entry_date: $('pgDate').value || new Date().toISOString().split('T')[0],
    weight_kg: parseFloat($('pgWeight').value) || null,
    body_fat_pct: parseFloat($('pgBodyFat').value) || null,
    chest_cm: parseFloat($('pgChest').value) || null,
    waist_cm: parseFloat($('pgWaist').value) || null,
    hips_cm: parseFloat($('pgHips').value) || null,
    arms_cm: parseFloat($('pgArms').value) || null,
    thighs_cm: parseFloat($('pgThighs').value) || null,
    notes: $('pgNotes').value.trim() || null,
    photo_url: $('pgPhoto').value.trim() || null
  };
  const editId = $('editProgressId').value;
  try {
    $('saveProgressBtn').disabled = true;
    if (addedBy === 'client') {
      const action = editId ? 'edit' : 'add';
      let currentData = null;
      if (editId) currentData = (clientMapGet(APP_STATE.progressEntries, clientId) || []).find(x => String(x.id) === String(editId)) || null;
      const payload = {
        client_id: clientId, action, entry_id: editId || null,
        proposed_data: { ...proposed, added_by: 'client' },
        current_data: currentData, status: 'pending'
      };
      const { data, error } = await APP_STATE.supabaseClient.from('progress_approvals').insert(payload).select().single();
      if (error) throw error;
      APP_STATE.progressApprovals.unshift(data);
      $('progressModal').classList.add('hidden');
      updateApprovalsBadge();
      if (APP_STATE.loggedInClient && sameId(APP_STATE.loggedInClient.id, clientId)) {
        renderClientProgress(APP_STATE.loggedInClient);
        $('clientPendingBanner').classList.remove('hidden');
      }
      showStatus($('progressModalStatus'), '✅ Submitted for admin approval!', 'success');
    } else {
      const payload = { client_id: clientId, added_by: 'admin', ...proposed };
      if (editId) {
        const { error } = await APP_STATE.supabaseClient.from('progress_entries').update(payload).eq('id', editId);
        if (error) throw error;
        const arr = clientMapGet(APP_STATE.progressEntries, clientId) || [];
        const idx = arr.findIndex(x => String(x.id) === String(editId));
        if (idx >= 0) arr[idx] = { ...arr[idx], ...payload };
      } else {
        const { data, error } = await APP_STATE.supabaseClient.from('progress_entries').insert(payload).select().single();
        if (error) throw error;
        const list = clientMapGet(APP_STATE.progressEntries, clientId) || [];
        list.unshift(data);
        clientMapSet(APP_STATE.progressEntries, clientId, list);
      }
      (clientMapGet(APP_STATE.progressEntries, clientId) || []).sort((a, b) => (b.entry_date || '').localeCompare(a.entry_date || ''));
      $('progressModal').classList.add('hidden');
      if (sameId(APP_STATE.selectedClientId, clientId)) renderAdminProgress();
    }
  } catch (err) {
    showStatus($('progressModalStatus'), '❌ ' + err.message, 'error');
  } finally {
    $('saveProgressBtn').disabled = false;
  }
};

window.submitProfileEdit = async function () {
  if (!APP_STATE.loggedInClient) return;
  const proposed = {
    height_cm: parseFloat($('peHeight').value) || null,
    gender: $('peGender').value.trim() || null,
    birth_date: $('peBirth').value || null,
    goal: $('peGoal').value.trim() || null,
    medical_notes: $('peMedical').value.trim() || null,
    emergency_contact: $('peEmergency').value.trim() || null
  };
  const current = clientMapGet(APP_STATE.clientProfiles, APP_STATE.loggedInClient.id) || {};
  try {
    $('submitProfileBtn').disabled = true;
    const { data, error } = await APP_STATE.supabaseClient.from('profile_approvals')
      .insert({ client_id: APP_STATE.loggedInClient.id, proposed_data: proposed, current_data: current, status: 'pending' })
      .select().single();
    if (error) throw error;
    APP_STATE.profileApprovals.unshift(data);
    $('profileEditModal').classList.add('hidden');
    $('clientPendingBanner').classList.remove('hidden');
    updateApprovalsBadge();
    showStatus($('profileEditStatus'), '✅ Submitted for approval!', 'success');
  } catch (err) {
    showStatus($('profileEditStatus'), '❌ ' + err.message, 'error');
  } finally {
    $('submitProfileBtn').disabled = false;
  }
};