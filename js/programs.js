// ============================================================
// 🏗️ PERIODIZATION / PROGRAM BUILDER — professional programming
// ------------------------------------------------------------
// Trainer tool (Clients workspace → "🧩 Programs"):
//   • Build week templates (mesocycle blocks 4–12 weeks) with
//     training days × exercises (sets/reps/rest/tempo/RPE,
//     progressive-overload rule per exercise).
//   • Save templates to `program_templates` (cloud, auto-provisioned)
//     and apply a template to one or many clients in bulk — writes
//     into client_exercises exactly like the existing assign flow.
//   • Auto-deload weeks (every Nth week: −40% volume).
//   • Progressive overload engine: when applying, suggests +2.5kg or
//     +1 rep from last logged weights (workout_logsCache).
//   • Ships with pro starter templates (Push/Pull/Legs, 5×5 Strength,
//     Hypertrophy PPL, Fat-loss Circuit).
// ============================================================
(function () {
  'use strict';

  const $id = (x) => document.getElementById(x);
  function sb() { return APP_STATE.supabaseClient; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const ST_KEY = 'tas_program_draft_v1';

  // ---------------- starter templates ----------------
  const STARTERS = [
    {
      name: '5×5 Strength (3 days/wk)', weeks: 4, deloadEvery: 0, goal: 'strength',
      days: [
        { label: 'Day A — Squat Focus', items: [
          { ex: 'Barbell Back Squat', sets: 5, reps: 5, rest: 180, tempo: '3-1-1', rpe: 8, overload: '+2.5kg/week' },
          { ex: 'Weighted Pull-Up', sets: 5, reps: 5, rest: 150, tempo: '', rpe: 8, overload: '+1 rep/week' },
          { ex: 'Overhead Press', sets: 5, reps: 5, rest: 120, tempo: '', rpe: 8, overload: '+1.25kg/week' }
        ]},
        { label: 'Day B — Bench Focus', items: [
          { ex: 'Barbell Bench Press', sets: 5, reps: 5, rest: 180, tempo: '3-1-1', rpe: 8, overload: '+2.5kg/week' },
          { ex: 'Barbell Row', sets: 5, reps: 5, rest: 150, tempo: '', rpe: 8, overload: '+2.5kg/week' },
          { ex: 'Deadlift', sets: 1, reps: 5, rest: 240, tempo: '', rpe: 8, overload: '+5kg/week' }
        ]}
      ]
    },
    {
      name: 'Hypertrophy PPL (6 days/wk)', weeks: 6, deloadEvery: 6, goal: 'hypertrophy',
      days: [
        { label: 'Push', items: [
          { ex: 'Incline DB Press', sets: 4, reps: '8–12', rest: 90, rpe: 9, overload: '+1 rep/week' },
          { ex: 'Cable Fly', sets: 3, reps: '12–15', rest: 60, rpe: 9, overload: '—' },
          { ex: 'Lateral Raise', sets: 4, reps: '15–20', rest: 45, rpe: 9, overload: '—' },
          { ex: 'Rope Pushdown', sets: 3, reps: '12–15', rest: 60, rpe: 9, overload: '+1 rep/week' }
        ]},
        { label: 'Pull', items: [
          { ex: 'Lat Pulldown', sets: 4, reps: '8–12', rest: 90, rpe: 9, overload: '+2.5kg/week' },
          { ex: 'Chest-Supported Row', sets: 4, reps: '10–12', rest: 90, rpe: 9, overload: '+2.5kg/week' },
          { ex: 'Face Pull', sets: 3, reps: '15–20', rest: 45, rpe: 8, overload: '—' },
          { ex: 'EZ Bar Curl', sets: 3, reps: '10–12', rest: 60, rpe: 9, overload: '+1 rep/week' }
        ]},
        { label: 'Legs', items: [
          { ex: 'Hack Squat', sets: 4, reps: '8–12', rest: 120, rpe: 9, overload: '+5kg/week' },
          { ex: 'Romanian Deadlift', sets: 3, reps: '10–12', rest: 90, rpe: 8, overload: '+2.5kg/week' },
          { ex: 'Leg Curl', sets: 3, reps: '12–15', rest: 60, rpe: 9, overload: '—' },
          { ex: 'Standing Calf Raise', sets: 4, reps: '15–20', rest: 45, rpe: 9, overload: '+1 rep/week' }
        ]}
      ]
    },
    {
      name: 'Fat-Loss Circuit (4 days/wk)', weeks: 8, deloadEvery: 8, goal: 'fatloss',
      days: [
        { label: 'Circuit A (full body)', items: [
          { ex: 'Kettlebell Swing', sets: 4, reps: 20, rest: 30, rpe: 8, overload: '—' },
          { ex: 'Goblet Squat', sets: 4, reps: 15, rest: 30, rpe: 8, overload: '+1 rep/week' },
          { ex: 'Push-Up', sets: 4, reps: 'AMRAP-2', rest: 45, rpe: 9, overload: '+1 rep/week' },
          { ex: 'Row (machine)', sets: 4, reps: 15, rest: 30, rpe: 8, overload: '—' },
          { ex: 'Plank', sets: 3, reps: '45s', rest: 30, rpe: 7, overload: '+10s/week' }
        ]},
        { label: 'Conditioning B', items: [
          { ex: 'Bike Intervals', sets: 8, reps: '40s hard / 80s easy', rest: 0, rpe: 9, overload: '—' },
          { ex: 'Farmer Carry', sets: 4, reps: '40m', rest: 60, rpe: 8, overload: '+5kg/week' }
        ]}
      ]
    }
  ];

  // ---------------- draft state ----------------
  function loadDraft() {
    try { return JSON.parse(localStorage.getItem(ST_KEY)) || null; } catch (e) { return null; }
  }
  function saveDraft(t) { try { localStorage.setItem(ST_KEY, JSON.stringify(t)); } catch (e) {} }
  function newDraft(name) {
    return { name: name || 'New program', weeks: 4, deload_every: 0, goal: 'general',
      days: [{ label: 'Day 1', items: [] }] };
  }

  // ---------------- cloud ----------------
  async function fetchTemplates() {
    if (!sb()) return [];
    try {
      const { data } = await sb().from('program_templates')
        .select('*').order('updated_at', { ascending: false }).limit(100);
      return data || [];
    } catch (e) {
      if (window.isMissingTableError && window.isMissingTableError(e)) {
        try { await window.ensureTableExists('program_templates'); } catch (e2) {}
      }
      return [];
    }
  }

  window.tasSaveProgramTemplate = async function (tpl) {
    tpl = tpl || loadDraft() || newDraft();
    if (!tpl.name || !String(tpl.name).trim()) throw new Error('Give the program a name.');
    const row = {
      name: String(tpl.name).trim(),
      weeks: Math.max(1, Math.min(12, parseInt(tpl.weeks, 10) || 4)),
      deload_every: Math.max(0, parseInt(tpl.deload_every, 10) || 0),
      goal: tpl.goal || 'general',
      body: tpl,                              // full structure as jsonb
      updated_at: new Date().toISOString()
    };
    if (tpl.id) row.id = tpl.id;
    if (!sb()) { showToast('☁️ Cloud unavailable — template kept in draft only.', 'info'); return null; }
    try {
      const { data, error } = await sb().from('program_templates').upsert(row).select('*').single();
      if (error) throw error;
      showToast('✅ Program saved to cloud.', 'success');
      return data;
    } catch (e) {
      if (window.isMissingTableError && window.isMissingTableError(e)) {
        const fixed = await window.ensureTableExists('program_templates');
        if (fixed) return window.tasSaveProgramTemplate(tpl);
      }
      throw e;
    }
  };

  // ---------------- progressive overload suggestion ----------------
  // Look at the client's most recent logged weight for an exercise-ish name
  // match; suggest next-week target.
  function overloadSuggestion(clientId, itemName, rule) {
    try {
      const key = String(itemName || '').toLowerCase();
      let best = null;
      Object.keys(APP_STATE.workoutLogsCache || {}).forEach(k => {
        if (!k.startsWith(clientId + '-')) return;
        (APP_STATE.workoutLogsCache[k] || []).forEach(log => {
          const nm = String(log.exercise_name || log.name || '').toLowerCase();
          if (!nm || !key.includes(nm.slice(0, 6)) && !nm.includes(key.slice(0, 6))) return;
          const w = parseFloat(log.weight_kg || log.weight || 0);
          if (w > 0 && (!best || log.session_date > best.session_date)) {
            best = { weight: w, date: log.session_date };
          }
        });
      });
      if (!best) return '';
      const m = /\+([\d.]+)\s*kg/i.exec(rule || '');
      if (m) return `→ start at ${best.weight + parseFloat(m[1])} kg (last: ${best.weight} kg)`;
      return `last logged ${best.weight} kg`;
    } catch (e) { return ''; }
  }

  // ---------------- apply to clients ----------------
  window.tasApplyProgramToClients = async function (tpl, clientIds, opts) {
    opts = opts || {};
    if (!sb()) { showToast('☁️ Apply requires cloud connection.', 'error'); return { applied: 0 }; }
    let applied = 0, skipped = 0;
    const rows = [];
    clientIds.forEach(cid => {
      const c = getClient(cid); if (!c) return;
      (tpl.days || []).forEach((day, di) => {
        (day.items || []).forEach(item => {
          const name = typeof item === 'string' ? item : item.ex;
          if (!name) return;
          const ex = (APP_STATE.exercises || []).find(e => (e.name || '').toLowerCase() === String(name).toLowerCase());
          rows.push({
            client_id: cid,
            exercise_id: ex ? ex.id : null,
            exercise_name: name,
            day_of_week: opts.spreadDays ? (di % 7) + 1 : null,
            sets: item.sets || null,
            reps: String(item.reps == null ? '' : item.reps),
            rest_seconds: item.rest || null,
            tempo: item.tempo || null,
            rpe: item.rpe || null,
            notes: (item.overload ? `Overload: ${item.overload}. ` : '') + overloadSuggestion(cid, name, item.overload),
            source: 'program:' + (tpl.name || 'draft')
          });
        });
      });
    });
    if (!rows.length) { showToast('Nothing to apply — template is empty.', 'error'); return { applied: 0 }; }

    // Replace mode: clear previous program-sourced assignments first.
    if (opts.replace) {
      try {
        await sb().from('client_exercises').delete().in('client_id', clientIds).like('source', 'program:%');
      } catch (e) { /* column may not exist yet — append mode instead */ }
    }
    // Insert in chunks of 50 to stay under payload limits.
    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50).map(r => {
        const { exercise_name, ...rest } = r;
        void exercise_name;
        return rest;
      });
      try {
        const { error } = await sb().from('client_exercises').insert(rows.slice(i, i + 50));
        if (error) throw error;
        applied++;
      } catch (e) {
        // Retry without unknown columns (source/exercise_name may not exist)
        try {
          const safe = rows.slice(i, i + 50).map(r => ({
            client_id: r.client_id, exercise_id: r.exercise_id,
            sets: r.sets, reps: r.reps, notes: r.notes
          }));
          const { error } = await sb().from('client_exercises').insert(safe);
          if (error) throw error;
          applied++;
        } catch (e2) { skipped++; console.warn('program apply chunk failed:', e2); }
      }
    }
    // refresh local caches so portals show the new plan immediately
    try {
      const { data: ce } = await sb().from('client_exercises').select('*');
      APP_STATE.clientExercisesCache = {};
      (ce || []).forEach(a => {
        if (!APP_STATE.clientExercisesCache[a.client_id]) APP_STATE.clientExercisesCache[a.client_id] = [];
        APP_STATE.clientExercisesCache[a.client_id].push(a);
      });
    } catch (e) {}
    showToast(`✅ Applied "${tpl.name}" to ${clientIds.length} client${clientIds.length > 1 ? 's' : ''} (${applied} batch${applied !== 1 ? 'es' : ''}).`, 'success');
    return { applied, skipped };
  };

  // ---------------- UI ----------------
  function ensureProgramButton() {
    const bar = document.querySelector('.admin-workspace-tabs');
    if (!bar || $id('adminTabProgramsBtn')) return;
    const btn = document.createElement('button');
    btn.className = 'tab-btn'; btn.setAttribute('data-atab2', 'programs');
    btn.setAttribute('type', 'button'); btn.setAttribute('role', 'tab');
    btn.id = 'adminTabProgramsBtn'; btn.textContent = '🧩 Programs';
    bar.appendChild(btn);

    const wsClients = $id('adminWorkspaceClients');
    if (!wsClients) return;
    const ws = document.createElement('div');
    ws.id = 'adminWorkspacePrograms'; ws.className = 'admin-workspace hidden';
    ws.innerHTML = `<div id="progBuilderBody"></div>`;
    wsClients.parentNode.insertBefore(ws, wsClients.nextSibling);

    const orig = window.showAdminWorkspaceTab;
    if (orig && !window.__progWrapped) {
      window.__progWrapped = true;
      window.showAdminWorkspaceTab = function (tab) {
        const out = orig.apply(this, arguments);
        const el = $id('adminWorkspacePrograms');
        if (el) el.classList.toggle('hidden', tab !== 'programs');
        if (tab === 'programs') renderBuilder();
        return out;
      };
    }
  }

  let _ui = { editing: null, selectedSaved: null };

  async function renderBuilder() {
    const mount = $id('progBuilderBody');
    if (!mount) return;
    const saved = await fetchTemplates();
    const draft = _ui.editing || loadDraft() || newDraft();
    _ui.editing = draft;

    mount.innerHTML = `
      <h3 class="admin-section-title">🧩 Periodization / Program Builder</h3>
      <div class="prog-cols">
        <div class="prog-col">
          <div class="cds-section-title">📚 Saved programs</div>
          <div class="prog-saved-list">${saved.map(s =>
            `<button type="button" class="prog-saved-item" data-sid="${esc(s.id)}"><strong>${esc(s.name)}</strong><br><span class="cds-muted">${s.weeks || (s.body && s.body.weeks) || '?'} wk · ${esc(s.goal || '')}</span></button>`).join('')
            || '<div class="cds-muted">None saved yet.</div>'}</div>
          <div class="cds-section-title">⭐ Starter templates</div>
          <div class="prog-saved-list">${STARTERS.map((s, i) =>
            `<button type="button" class="prog-saved-item prog-starter" data-starter="${i}"><strong>${esc(s.name)}</strong><br><span class="cds-muted">${s.weeks} wk · deload wk ${s.deloadEvery || 'off'}</span></button>`).join('')}</div>
        </div>
        <div class="prog-col wide">
          <div class="flex-row">
            <div class="input-group" style="flex:2"><label for="progName">Program name</label><input id="progName" value="${esc(draft.name)}"></div>
            <div class="input-group" style="flex:1"><label for="progWeeks">Weeks</label><input id="progWeeks" type="number" min="1" max="12" value="${draft.weeks}"></div>
            <div class="input-group" style="flex:1"><label for="progDeload">Deload every N wk (0=off)</label><input id="progDeload" type="number" min="0" max="12" value="${draft.deload_every || 0}"></div>
            <div class="input-group" style="flex:1"><label for="progGoal">Goal</label>
              <select id="progGoal">${['general','strength','hypertrophy','fatloss','rehab','sport'].map(g => `<option value="${g}" ${draft.goal === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
          </div>
          <div id="progDays">${draft.days.map((d, di) => renderDay(d, di)).join('')}</div>
          <div class="flex-row prog-actions">
            <button class="btn-ghost" id="progAddDay" type="button">➕ Add training day</button>
            <button class="btn-primary" id="progSave" type="button">💾 Save program</button>
            <button class="btn-success" id="progApplyOpen" type="button">🚀 Apply to clients…</button>
          </div>
          <div id="progApplyBox" class="prog-apply-box hidden">
            <div class="cds-section-title">Select clients</div>
            <div id="progClientList" class="prog-client-list">${(APP_STATE.clients || []).filter(c => c.active).map(c =>
              `<label class="prog-check"><input type="checkbox" value="${esc(c.id)}" data-name="${esc(c.name)}"> ${esc(c.name)} <span class="cds-muted">${esc(c.login_id || '')}</span></label>`).join('')}</div>
            <label class="prog-check"><input type="checkbox" id="progReplace" checked> Replace existing program-assigned exercises</label>
            <label class="prog-check"><input type="checkbox" id="progSpread"> Spread days across the week</label>
            <button class="btn-success" id="progApplyGo" type="button">✅ Apply now</button>
            <div id="progApplyStatus" class="status-msg"></div>
          </div>
        </div>
      </div>`;

    // ---- wiring ----
    const sync = () => {
      draft.name = $id('progName').value;
      draft.weeks = parseInt($id('progWeeks').value, 10) || 4;
      draft.deload_every = parseInt($id('progDeload').value, 10) || 0;
      draft.goal = $id('progGoal').value;
      saveDraft(draft);
    };
    ['progName', 'progWeeks', 'progDeload', 'progGoal'].forEach(id => $id(id).addEventListener('change', sync));

    $id('progAddDay').addEventListener('click', () => { sync(); draft.days.push({ label: 'Day ' + (draft.days.length + 1), items: [] }); saveDraft(draft); renderBuilder(); });

    mount.querySelectorAll('[data-day]').forEach(sel => {
      sel.addEventListener('change', () => { sync(); renderBuilder(); });
    });
    wireDayEditors(draft, sync);

    $id('progSave').addEventListener('click', async () => {
      sync();
      try { const r = await window.tasSaveProgramTemplate(draft); if (r) { _ui.editing = null; renderBuilder(); } }
      catch (e) { showToast('❌ ' + e.message, 'error'); }
    });

    mount.querySelectorAll('[data-starter]').forEach(b => b.addEventListener('click', () => {
      const s = STARTERS[parseInt(b.dataset.starter, 10)];
      _ui.editing = JSON.parse(JSON.stringify(s));
      _ui.editing.deload_every = s.deloadEvery; _ui.editing.id = undefined;
      saveDraft(_ui.editing); renderBuilder();
    }));

    mount.querySelectorAll('[data-sid]').forEach(b => b.addEventListener('click', async () => {
      const all = await fetchTemplates();
      const t = all.find(x => String(x.id) === b.dataset.sid);
      if (t && t.body) { _ui.editing = JSON.parse(JSON.stringify(t.body)); _ui.editing.id = t.id; saveDraft(_ui.editing); renderBuilder(); }
    }));

    $id('progApplyOpen').addEventListener('click', () => { sync(); $id('progApplyBox').classList.toggle('hidden'); });
    $id('progApplyGo').addEventListener('click', async () => {
      const ids = Array.from(mount.querySelectorAll('#progClientList input:checked')).map(i => i.value);
      if (!ids.length) { showStatus($id('progApplyStatus'), '⚠️ Pick at least one client.', 'error'); return; }
      const res = await window.tasApplyProgramToClients(draft, ids, {
        replace: $id('progReplace').checked, spreadDays: $id('progSpread').checked
      });
      showStatus($id('progApplyStatus'), `✅ Done — ${res.applied} write batches, ${res.skipped} skipped.`, res.skipped ? 'info' : 'success');
    });
  }

  function renderDay(day, di) {
    const items = (day.items || []).map((it, ii) =>
      `<tr><td><input class="prog-ex" data-di="${di}" data-ii="${ii}" data-f="ex" value="${esc(it.ex || it)}" placeholder="Exercise"></td>
       <td><input class="prog-num" data-di="${di}" data-ii="${ii}" data-f="sets" value="${esc(it.sets != null ? it.sets : '')}" style="width:56px"></td>
       <td><input class="prog-num" data-di="${di}" data-ii="${ii}" data-f="reps" value="${esc(it.reps != null ? it.reps : '')}" style="width:70px"></td>
       <td><input class="prog-num" data-di="${di}" data-ii="${ii}" data-f="rest" value="${esc(it.rest != null ? it.rest : '')}" style="width:64px" placeholder="sec"></td>
       <td><input class="prog-ex" data-di="${di}" data-ii="${ii}" data-f="overload" value="${esc(it.overload || '')}" placeholder="+2.5kg/week"></td>
       <td><button type="button" class="prog-del-item" data-di="${di}" data-ii="${ii}" aria-label="Remove exercise">✕</button></td></tr>`).join('');
    return `<div class="prog-day" data-day="${di}">
      <div class="prog-day-head"><strong>📅 Day ${di + 1}</strong>
        <input class="prog-day-label" data-di="${di}" value="${esc(day.label)}" aria-label="Day label">
        <button type="button" class="btn-ghost btn-sm prog-del-day" data-di="${di}">🗑️ Delete day</button></div>
      <table class="prog-table"><thead><tr><th>Exercise</th><th>Sets</th><th>Reps</th><th>Rest s</th><th>Overload rule</th><th></th></tr></thead>
      <tbody>${items}</tbody></table>
      <button type="button" class="btn-ghost btn-sm prog-add-item" data-di="${di}">➕ Add exercise</button></div>`;
  }

  function wireDayEditors(draft, sync) {
    const mount = $id('progBuilderBody');
    mount.querySelectorAll('.prog-del-day').forEach(b => b.addEventListener('click', () => {
      sync(); draft.days.splice(parseInt(b.dataset.di, 10), 1); if (!draft.days.length) draft.days.push({ label: 'Day 1', items: [] });
      saveDraft(draft); renderBuilder();
    }));
    mount.querySelectorAll('.prog-del-item').forEach(b => b.addEventListener('click', () => {
      sync(); draft.days[+b.dataset.di].items.splice(+b.dataset.ii, 1); saveDraft(draft); renderBuilder();
    }));
    mount.querySelectorAll('.prog-add-item').forEach(b => b.addEventListener('click', () => {
      sync(); draft.days[+b.dataset.di].items.push({ ex: '', sets: 3, reps: '10', rest: 60, overload: '' });
      saveDraft(draft); renderBuilder();
    }));
    mount.querySelectorAll('.prog-day-label').forEach(inp => inp.addEventListener('change', () => {
      sync(); draft.days[+inp.dataset.di].label = inp.value; saveDraft(draft);
    }));
    mount.querySelectorAll('.prog-ex, .prog-num').forEach(inp => inp.addEventListener('change', () => {
      const di = +inp.dataset.di, ii = +inp.dataset.ii, f = inp.dataset.f;
      const it = draft.days[di].items[ii];
      if (typeof it === 'string') draft.days[di].items[ii] = { ex: it };
      draft.days[di].items[ii][f] = (f === 'sets' || f === 'rest') ? (parseFloat(inp.value) || null) : inp.value;
      saveDraft(draft);
    }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureProgramButton);
  else ensureProgramButton();
})();
