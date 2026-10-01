// Mock Supabase SDK — injected BEFORE app scripts so no network is needed.
window.__mockDb = {
  clients: [
    { id:'c1', name:'Alex Rivera', phone:'919876543210', email:'alex@x.com', active:true, created_at:'2026-01-05T10:00:00Z' },
    { id:'c2', name:'Sam Patel', phone:'918888888888', email:'', active:false, created_at:'2026-02-05T10:00:00Z' }
  ],
  client_settings: [
    { client_id:'c1', rate_per_session:250, gym_name:'FitZone Dubai Marina', gym_branch:'Marina Walk', gym_note:'Member 441' },
    { client_id:'c2', rate_per_session:200 }
  ],
  client_profiles: [],
  progress_entries: [
    { client_id:'c1', entry_date:'2026-07-05', weight_kg:'88.0', body_fat_pct:'24.0', chest_cm:'100', waist_cm:'92', hips_cm:'100', arms_cm:'35', thighs_cm:'55' },
    { client_id:'c1', entry_date:'2026-08-05', weight_kg:'85.5', body_fat_pct:'22.5', chest_cm:'101', waist_cm:'89', hips_cm:'99', arms_cm:'36', thighs_cm:'56' }
  ],
  progress_approvals: [],
  sessions: [
    { client_id:'c1', session_date:'2026-09-03', checked_at:'2026-09-03T08:00:00Z' },
    { client_id:'c1', session_date:'2026-09-10', checked_at:'2026-09-10T08:00:00Z' }
  ],
  exercises: [], client_exercises: [], workout_logs: [], daily_times: [],
  fitness_entries: [], profile_approvals: [], workout_edit_requests: [],
  progress_reports: [],
  admin_config: [{ id:1, admin_login_id:'TAS-Abhi', admin_password:'Abhu@1818', archive_email:'' }]
};
window.supabase = {
  createClient: function () {
    return {
      from: function (table) {
        var builder = {
          _eq: null,
          select: function () { return builder; },
          order: function () { return builder; },
          gte: function () { return builder; },
          lte: function () { return builder; },
          limit: function () { return builder; },
          eq: function (col, v) { builder._eq = [col, v]; return builder; },
          single: function () {
            var rows = window.__mockDb[table] || [];
            if (builder._eq) rows = rows.filter(function (r) { return r[builder._eq[0]] === builder._eq[1]; });
            return Promise.resolve({ data: rows[0] || null, error: rows[0] ? null : { message: 'no row' } });
          },
          insert: function (row) {
            var arr = window.__mockDb[table] = window.__mockDb[table] || [];
            (Array.isArray(row) ? row : [row]).forEach(function (r) { arr.unshift(Object.assign({ id: 'gen-' + Date.now(), created_at: new Date().toISOString() }, r)); });
            return Promise.resolve({ data: arr, error: null });
          },
          update: function () { return { eq: function () { return Promise.resolve({ error: null }); } }; },
          then: function (res) {
            var rows = window.__mockDb[table] || [];
            if (builder._eq) rows = rows.filter(function (r) { return r[builder._eq[0]] === builder._eq[1]; });
            return Promise.resolve({ data: rows, error: null }).then(res);
          }
        };
        return builder;
      },
      on: function () { return { subscribe: function () { return { unsubscribe: function () {} }; } }; },
      auth: { onAuthStateChange: function () { return { data: { subscription: null } }; } }
    };
  }
};
