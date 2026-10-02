-- ============================================================
-- TAS FITNESS — COMPLETE DATABASE SCHEMA (final, single file)
-- ------------------------------------------------------------
-- This is the ONE script to run in Supabase:
--   Dashboard → SQL Editor → New query → paste everything → Run
--
-- It stores ALL data the site needs:
--   clients, client_settings, client_profiles,
--   progress_entries, profile_approvals, progress_approvals,
--   sessions, daily_times,
--   exercises, client_exercises, workout_logs,
--   client_requests  (editable request system: client edits a request,
--                     saves it, admin approves → change is reflected),
--   workout_edit_requests (locked-day edit requests with staged data),
--   progress_reports, admin_config
--
-- The old fitness-calculator tables (fitness_entries, fitness_audit_log)
-- are NO LONGER used by the app. Optional cleanup for existing projects
-- is at the very bottom of this file (commented out).
--
-- Safe on a fresh project AND an existing one:
--   • every CREATE uses IF NOT EXISTS
--   • every ALTER uses ADD COLUMN IF NOT EXISTS / guarded blocks
--   • every POLICY is dropped & recreated
-- No data is deleted by this script.
-- ============================================================

-- ------------------------------------------------------------
-- 1. CLIENTS (login_id + password_hint are how both portals auth)
-- ------------------------------------------------------------
create table if not exists public.clients (
  id            uuid primary key default gen_random_uuid(),
  login_id      text unique not null,        -- e.g. "ALI-9786"
  name          text not null,
  email         text,
  phone         text,                        -- WhatsApp number
  password_hint text,                        -- client login password
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. CLIENT_SETTINGS (one row per client; rate + gym info)
-- ------------------------------------------------------------
create table if not exists public.client_settings (
  id          uuid primary key default gen_random_uuid(),
  client_id   text not null unique,
  rate_aed    numeric,
  note        text,
  gym_name    text,
  gym_branch  text,
  gym_note    text,
  updated_at  timestamptz not null default now()
);
alter table public.client_settings add column if not exists gym_name   text;
alter table public.client_settings add column if not exists gym_branch text;
alter table public.client_settings add column if not exists gym_note   text;

-- ------------------------------------------------------------
-- 3. CLIENT_PROFILES (approved profile) + approval metadata
-- ------------------------------------------------------------
create table if not exists public.client_profiles (
  id                uuid primary key default gen_random_uuid(),
  client_id         text not null unique,
  height_cm         numeric,
  gender            text,
  birth_date        date,
  goal              text,
  medical_notes     text,
  emergency_contact text,
  approved_at       timestamptz,
  approved_by       text,
  updated_at        timestamptz not null default now()
);
alter table public.client_profiles add column if not exists approved_at timestamptz;
alter table public.client_profiles add column if not exists approved_by text;

-- 🧮 Calculator Body Stats (sql/fitness_calculator.sql) — the 11 shared
-- inputs of the Calculators tab, editable under 👤 Profile → ✏️ Edit Profile.
alter table public.client_profiles add column if not exists fit_weight_kg       numeric;
alter table public.client_profiles add column if not exists fit_height_cm       numeric;
alter table public.client_profiles add column if not exists fit_age             numeric;
alter table public.client_profiles add column if not exists fit_gender          text;
alter table public.client_profiles add column if not exists fit_activity_level  text;
alter table public.client_profiles add column if not exists fit_goal            text;
alter table public.client_profiles add column if not exists fit_waist_cm        numeric;
alter table public.client_profiles add column if not exists fit_neck_cm         numeric;
alter table public.client_profiles add column if not exists fit_hip_cm          numeric;
alter table public.client_profiles add column if not exists fit_bench_kg        numeric;
alter table public.client_profiles add column if not exists fit_body_fat_pct    numeric;

-- ------------------------------------------------------------
-- 3b. FITNESS INPUTS — saved state of the 🧮 Calculator Hub's shared panel
--     (one jsonb row per client; autosaved by js/calculators.js).
-- ------------------------------------------------------------
create table if not exists public.fitness_inputs (
  id         uuid primary key default gen_random_uuid(),
  client_id  text not null unique,
  inputs     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists fi_client_idx on public.fitness_inputs (client_id);
alter table public.fitness_inputs enable row level security;
drop policy if exists "fitness_inputs_select" on public.fitness_inputs;
create policy "fitness_inputs_select" on public.fitness_inputs for select using (true);
drop policy if exists "fitness_inputs_insert" on public.fitness_inputs;
create policy "fitness_inputs_insert" on public.fitness_inputs for insert with check (true);
drop policy if exists "fitness_inputs_update" on public.fitness_inputs;
create policy "fitness_inputs_update" on public.fitness_inputs for update using (true) with check (true);
drop policy if exists "fitness_inputs_delete" on public.fitness_inputs;
create policy "fitness_inputs_delete" on public.fitness_inputs for delete using (true);

-- ------------------------------------------------------------
-- 4. PROGRESS ENTRIES (official measurements, admin-saved)
-- ------------------------------------------------------------
create table if not exists public.progress_entries (
  id           uuid primary key default gen_random_uuid(),
  client_id    text not null,
  entry_date   date not null,
  weight_kg    numeric,
  body_fat_pct numeric,
  chest_cm     numeric,
  waist_cm     numeric,
  hips_cm      numeric,
  arms_cm      numeric,
  thighs_cm    numeric,
  notes        text,
  photo_url    text,
  added_by     text not null default 'admin',   -- admin | client
  created_at   timestamptz not null default now()
);
create index if not exists pe_client_idx on public.progress_entries (client_id);
create index if not exists pe_date_idx   on public.progress_entries (entry_date desc);

-- ------------------------------------------------------------
-- 5. APPROVAL QUEUES (profile + progress change requests)
--    Client proposes → admin approves → official row is written.
-- ------------------------------------------------------------
create table if not exists public.profile_approvals (
  id            uuid primary key default gen_random_uuid(),
  client_id     text not null,
  proposed_data jsonb not null default '{}'::jsonb,
  current_data  jsonb,
  status        text not null default 'pending',  -- pending | approved | rejected
  admin_note    text,
  submitted_at  timestamptz not null default now(),
  decided_at    timestamptz
);
create table if not exists public.progress_approvals (
  id            uuid primary key default gen_random_uuid(),
  client_id     text not null,
  action        text not null default 'add',      -- add | edit | delete
  entry_id      uuid,
  proposed_data jsonb not null default '{}'::jsonb,
  current_data  jsonb,
  status        text not null default 'pending',
  admin_note    text,
  submitted_at  timestamptz not null default now(),
  decided_at    timestamptz
);
alter table public.profile_approvals  add column if not exists admin_note text;
alter table public.profile_approvals  add column if not exists decided_at timestamptz;
alter table public.progress_approvals add column if not exists admin_note text;
alter table public.progress_approvals add column if not exists decided_at timestamptz;
alter table public.profile_approvals  alter column status set default 'pending';
alter table public.progress_approvals alter column status set default 'pending';
create index if not exists profap_status_idx on public.profile_approvals  (status);
create index if not exists progap_status_idx on public.progress_approvals (status);

-- ------------------------------------------------------------
-- 6. SESSIONS (attendance ticks) & DAILY_TIMES (class time per day)
-- ------------------------------------------------------------
create table if not exists public.sessions (
  id           uuid primary key default gen_random_uuid(),
  client_id    text not null,
  session_date date not null,
  checked_at   timestamptz,
  unique (client_id, session_date)
);
create table if not exists public.daily_times (
  id         uuid primary key default gen_random_uuid(),
  client_id  text not null,
  day_date   date not null,
  class_time text,
  note       text,
  unique (client_id, day_date)
);
create index if not exists sess_client_idx on public.sessions (client_id, session_date);
create index if not exists dt_client_idx   on public.daily_times (client_id);

-- ------------------------------------------------------------
-- 7. EXERCISE LIBRARY + per-client assignments + workout logs
-- ------------------------------------------------------------
create table if not exists public.exercises (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  category       text,
  muscle_group   text,
  default_sets   integer,
  default_reps   text,
  default_weight text,
  default_rest   text,
  notes          text,
  created_at     timestamptz not null default now()
);

create table if not exists public.client_exercises (
  id            uuid primary key default gen_random_uuid(),
  client_id     text not null,
  exercise_id   uuid not null,
  sort_order    integer not null default 0,
  custom_sets   integer,
  custom_reps   text,
  custom_weight text,
  custom_rest   text,
  custom_notes  text,
  unique (client_id, exercise_id)
);

create table if not exists public.workout_logs (
  id            uuid primary key default gen_random_uuid(),
  client_id     text not null,
  session_date  date not null,
  exercise_id   uuid,
  exercise_name text,
  sets_done     integer,
  reps_done     text,
  weight_done   text,
  rest_done     text,
  notes         text,
  logged_at     timestamptz not null default now()
);
create index if not exists wl_client_date_idx on public.workout_logs (client_id, session_date);

-- ------------------------------------------------------------
-- 8. CLIENT REQUESTS — the editable request system
--    Flow: client creates a request → can EDIT it while pending →
--    SAVES it (stays pending) → ADMIN approves/rejects → only then
--    is the change reflected (daily_times / sessions updated).
-- ------------------------------------------------------------
create table if not exists public.client_requests (
  id                 uuid primary key default gen_random_uuid(),
  client_id          text not null,
  session_date       date,                                  -- the day concerned
  request_type       text not null default 'time',          -- time | cancel | date | reschedule | general
  message            text,                                  -- free-text note from the client
  requested_time     text,                                  -- new class time asked for
  requested_new_date date,                                  -- new day asked for
  status             text not null default 'pending',       -- pending | approved | rejected | withdrawn
  edited_count       integer not null default 0,            -- how many times the client edited it
  last_edited_at     timestamptz,                           -- when the client last saved an edit
  admin_note         text,                                  -- trainer's reply shown to the client
  requested_at       timestamptz not null default now(),
  decided_at         timestamptz
);
-- upgrade path for older installs (safe to re-run)
alter table public.client_requests add column if not exists requested_time     text;
alter table public.client_requests add column if not exists edited_count       integer not null default 0;
alter table public.client_requests add column if not exists last_edited_at     timestamptz;
alter table public.client_requests add column if not exists admin_note         text;
alter table public.client_requests add column if not exists requested_at       timestamptz not null default now();
alter table public.client_requests add column if not exists decided_at         timestamptz;
alter table public.client_requests add column if not exists requested_new_date date;
alter table public.client_requests add column if not exists message            text;
alter table public.client_requests add column if not exists session_date       date;
alter table public.client_requests add column if not exists request_type       text not null default 'time';
create index if not exists cr_status_idx on public.client_requests (status);
create index if not exists cr_client_idx on public.client_requests (client_id);

-- ------------------------------------------------------------
-- 9. WORKOUT EDIT REQUESTS — locked finished days
--    Client proposes an edit/add/delete on a finished day; the values
--    are STAGED here and applied to workout_logs ONLY after approval.
-- ------------------------------------------------------------
create table if not exists public.workout_edit_requests (
  id              uuid primary key default gen_random_uuid(),
  client_id       text not null,
  session_date    date not null,
  status          text not null default 'pending',   -- pending | approved | rejected | withdrawn
  admin_unlocked  boolean not null default false,    -- direct trainer unlock switch
  proposed_action text,                              -- edit | add | delete | unlock
  entry_log_id    text,                              -- workout_logs row the proposal targets
  proposed_data   jsonb,                             -- staged values — applied ONLY on approval
  requested_at    timestamptz not null default now(),
  decided_at      timestamptz,
  unique (client_id, session_date)
);
alter table public.workout_edit_requests add column if not exists requested_at    timestamptz not null default now();
alter table public.workout_edit_requests add column if not exists decided_at      timestamptz;
alter table public.workout_edit_requests add column if not exists admin_unlocked  boolean not null default false;
alter table public.workout_edit_requests add column if not exists proposed_action text;
alter table public.workout_edit_requests add column if not exists entry_log_id    text;
alter table public.workout_edit_requests add column if not exists proposed_data   jsonb;
create index if not exists wer_status_idx on public.workout_edit_requests (status);

-- ------------------------------------------------------------
-- 10. SAVED MONTHLY REPORTS
-- ------------------------------------------------------------
create table if not exists public.progress_reports (
  id           uuid primary key default gen_random_uuid(),
  client_id    text not null,
  month_key    text not null,               -- "YYYY-MM"
  period_from  text,
  period_to    text,
  snapshot     jsonb not null default '{}'::jsonb,
  comparison   jsonb not null default '{}'::jsonb,
  generated_by text,                        -- 'admin' or 'client'
  created_at   timestamptz not null default now()
);
create index if not exists pr_client_month_idx on public.progress_reports (client_id, month_key);

-- ------------------------------------------------------------
-- 11. ADMIN CONFIG (single row, id = 1) — seeded with defaults
--     ⚠ Change the password after first login (Settings panel).
-- ------------------------------------------------------------
create table if not exists public.admin_config (
  id             integer primary key default 1,
  admin_login_id text not null default 'TAS-Abhi',
  admin_password text not null default 'Abhu@1818',
  archive_email  text default 'trainer@example.com'
);
insert into public.admin_config (id, admin_login_id, admin_password, archive_email)
values (1, 'TAS-Abhi', 'Abhu@1818', 'trainer@example.com')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 12. UNIQUE CONSTRAINTS required by the app's .upsert() calls
--     (guarded so re-running never errors)
-- ------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'uq_daily_times_client_day') then
    alter table public.daily_times     add constraint uq_daily_times_client_day unique (client_id, day_date); end if;
  if not exists (select 1 from pg_constraint where conname = 'uq_sessions_client_date') then
    alter table public.sessions        add constraint uq_sessions_client_date  unique (client_id, session_date); end if;
  if not exists (select 1 from pg_constraint where conname = 'uq_client_profiles_client') then
    alter table public.client_profiles add constraint uq_client_profiles_client unique (client_id); end if;
  if not exists (select 1 from pg_constraint where conname = 'uq_client_settings_client') then
    alter table public.client_settings add constraint uq_client_settings_client unique (client_id); end if;
  if not exists (select 1 from pg_constraint where conname = 'uq_client_exercises_pair') then
    alter table public.client_exercises add constraint uq_client_exercises_pair unique (client_id, exercise_id); end if;
end $$;

-- ------------------------------------------------------------
-- 13. ROW LEVEL SECURITY — anon-key policies, consistent across
--     every table (role guards are enforced in the app layer).
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'clients','client_settings','client_profiles','progress_entries',
    'progress_approvals','profile_approvals','sessions','daily_times',
    'exercises','client_exercises','workout_logs',
    'client_requests','workout_edit_requests',
    'progress_reports','admin_config'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%s_select" on public.%I;', t, t);
    execute format('create policy "%s_select" on public.%I for select using (true);', t, t);
    execute format('drop policy if exists "%s_insert" on public.%I;', t, t);
    execute format('create policy "%s_insert" on public.%I for insert with check (true);', t, t);
    execute format('drop policy if exists "%s_update" on public.%I;', t, t);
    execute format('create policy "%s_update" on public.%I for update using (true) with check (true);', t, t);
    execute format('drop policy if exists "%s_delete" on public.%I;', t, t);
    execute format('create policy "%s_delete" on public.%I for delete using (true);', t, t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 14. REALTIME — stream changes to every open tab
--      (client dashboard updates instantly when admin approves, etc.)
-- ------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'sessions','workout_logs','daily_times','client_exercises','exercises',
    'workout_edit_requests','profile_approvals','progress_approvals',
    'progress_entries','client_settings','client_profiles','clients',
    'client_requests','progress_reports','fitness_inputs'
  ] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 15. Reload PostgREST schema cache immediately
-- ------------------------------------------------------------
select pg_notify('pgrst', 'reload schema');

-- ------------------------------------------------------------
-- 16. Sanity check — should list all 15 tables
-- ------------------------------------------------------------
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;

-- ------------------------------------------------------------
-- 17. OPTIONAL CLEANUP — fitness calculator tables (no longer used)
--     Uncomment and run ONLY if you want to permanently delete the
--     old fitness-calculator data. The app ignores these tables now.
-- ------------------------------------------------------------
-- drop table if exists public.fitness_audit_log;
-- drop table if exists public.fitness_entries;
