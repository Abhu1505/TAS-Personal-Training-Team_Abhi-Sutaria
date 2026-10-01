// Minimal in-browser mock of the Supabase JS client (window.supabase) so the
// portal can be tested offline. Stores rows in memory per table.
(function () {
  const DB = {
    clients: [
      { id: 'c1', login_id: 'ALI-9786', name: 'Ali Khan', email: 'ali@example.com', phone: '971527739786', password_hint: 'AK@1234', active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    ],
    client_settings: [{ id: 1, client_id: 'c1', rate_aed: 200, note: '' }],
    client_profiles: [],
    progress_entries: [],
    progress_approvals: [],
    profile_approvals: [],
    sessions: [],
    exercises: [{ id: 'e1', name: 'Bench Press', category: 'Chest', muscle_group: 'Chest', default_sets: 3, default_reps: '10', default_weight: '40', default_rest: '60', notes: '' }],
    client_exercises: [],
    workout_logs: [],
    daily_times: [],
    fitness_entries: [],
    fitness_audit_log: [],
    workout_edit_requests: [],
    admin_config: [{ id: 1, admin_login_id: 'TAS-Abhi', admin_password: 'Abhu@1818', archive_email: 'trainer@example.com' }],
    progress_reports: []
  };
  window.__MOCK_DB = DB;

  function runQuery(table, op) {
    return {
      _filters: [], _order: null, _limit: null, _single: false,
      select(cols) { this._op = 'select'; return this; },
      insert(row) { this._op = 'insert'; this._row = row; return this; },
      update(row) { this._op = 'update'; this._row = row; return this; },
      delete() { this._op = 'delete'; return this; },
      upsert(row) { this._op = 'upsert'; this._row = row; return this; },
      eq(col, val) { this._filters.push([col, String(val)]); return this; },
      gte(col, v) { this._gte = [col, v]; return this; },
      lte(col, v) { this._lte = [col, v]; return this; },
      order(col, o) { this._order = [col, (o && o.ascending) !== false]; return this; },
      limit(n) { this._limit = n; return this; },
      single() { this._single = true; return this; },
      then(resolve, reject) {
        return this._exec().then(resolve, reject);
      },
      async _exec() {
        await new Promise(r => setTimeout(r, 5));
        const rows = DB[table];
        if (!rows) return { data: null, error: { code: '42P01', message: `Could not find the table 'public.${table}'` } };
        const match = (r) => this._filters.every(([c, v]) => String(r[c]) === v);
        if (this._op === 'insert') {
          const row = { id: 'x' + Math.random().toString(36).slice(2, 8), created_at: new Date().toISOString(), ...this._row };
          rows.push(row);
          return { data: row, error: null };
        }
        if (this._op === 'upsert') {
          const found = rows.find(match);
          if (found) Object.assign(found, this._row);
          else rows.push({ id: 'x' + Math.random().toString(36).slice(2, 8), ...this._row });
          return { data: this._row, error: null };
        }
        if (this._op === 'update') {
          rows.filter(match).forEach(r => Object.assign(r, this._row));
          return { data: null, error: null };
        }
        if (this._op === 'delete') {
          for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i])) rows.splice(i, 1);
          return { data: null, error: null };
        }
        let out = rows.filter(match).slice();
        if (this._gte) out = out.filter(r => String(r[this._gte[0]]) >= this._gte[1]);
        if (this._lte) out = out.filter(r => String(r[this._lte[0]]) <= this._lte[1]);
        if (this._order) {
          const [col, asc] = this._order;
          out.sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')) * (asc ? 1 : -1));
        }
        if (this._limit != null) out = out.slice(0, this._limit);
        if (this._single) return { data: out[0] || null, error: out[0] ? null : { message: 'no rows' } };
        return { data: out, error: null };
      }
    };
  }

  window.supabase = {
    createClient: () => ({
      from: (t) => ({ select: (...a) => runQuery(t, 'select').select(...a),
                       insert: (r) => runQuery(t, 'insert').insert(r),
                       update: (r) => runQuery(t, 'update').update(r),
                       delete: () => runQuery(t, 'delete').delete(),
                       upsert: (r) => runQuery(t, 'upsert').upsert(r) }),
      channel: () => ({ on: () => ({ subscribe: () => {} }) }),
      removeChannel: () => {},
      functions: { invoke: async () => ({ data: null, error: null }) }
    })
  };
})();
