-- ============================================================
-- sql/fitness_calculator.sql — 🧮 FITNESS CALCULATOR HUB migration
-- ------------------------------------------------------------
-- Run this ONCE in the Supabase SQL editor before deploying.
-- It is 100% idempotent (safe to re-run any number of times).
--
-- What it creates:
--   1. fitness_inputs table — one row per client storing the 11 shared
--      calculator inputs as jsonb (client_id unique → upsert target).
--   2. fit_* columns on client_profiles — the same 11 values as proper
--      columns, so the CLIENT PROFILE tab ("✏️ Edit Profile → Calculator
--      Body Stats") can store approved body stats. On approval the app
--      copies them into fitness_inputs (js/approvals.js + js/calculators.js).
--   3. Row Level Security policies matching every other table in this
--      project (anon key = single-trainer access model).
--   4. Adds fitness_inputs to the supabase_realtime publication so other
--      devices refresh live.
--   5. Ghost cleanup: deletes fitness_inputs rows belonging to clients that
--      no longer exist (same pattern as delete_client_cascade.sql).
--
-- WIPE / DELETE INTEGRATION (nothing survives a wipe):
--   • "Email & Wipe All Data" (js/wipe.js) clears fitness_inputs AND all
--     local localStorage caches (tas_fitness_inputs_*) — see
--     window.wipeFitnessInputs() in js/calculators.js.
--   • "Delete client" (js/clients.js) removes that client's fitness_inputs
--     row + local cache via window.deleteFitnessInputsFor().
--   • Section 6 below deletes the table entirely if you ever want to remove
--     the feature from the database too (manual, commented out).
-- ============================================================

-- ------------------------------------------------------------
-- 1. SHARED CALCULATOR INPUTS (live hub state, autosaved jsonb)
-- ------------------------------------------------------------
create table if not exists public.fitness_inputs (
  id         uuid primary key default gen_random_uuid(),
  client_id  text not null unique,          -- matches clients.id (or legacy login_id)
  inputs     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.fitness_inputs add column if not exists updated_at timestamptz not null default now();
create index if not exists fi_client_idx on public.fitness_inputs (client_id);

-- ------------------------------------------------------------
-- 2. CALCULATOR BODY STATS ON THE PROFILE (client_profiles columns)
--    These are what the client edits under 👤 Profile → ✏️ Edit Profile
--    ("Calculator Body Stats"). Approved values sync into fitness_inputs.
-- ------------------------------------------------------------
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
-- 3. ROW LEVEL SECURITY (same open policy style as the rest of the app;
--    the anon publishable key is the only credential the portal uses)
-- ------------------------------------------------------------
alter table public.fitness_inputs enable row level security;

drop policy if exists "fitness_inputs_select" on public.fitness_inputs;
create policy "fitness_inputs_select" on public.fitness_inputs
  for select using (true);

drop policy if exists "fitness_inputs_insert" on public.fitness_inputs;
create policy "fitness_inputs_insert" on public.fitness_inputs
  for insert with check (true);

drop policy if exists "fitness_inputs_update" on public.fitness_inputs;
create policy "fitness_inputs_update" on public.fitness_inputs
  for update using (true) with check (true);

drop policy if exists "fitness_inputs_delete" on public.fitness_inputs;
create policy "fitness_inputs_delete" on public.fitness_inputs
  for delete using (true);

-- ------------------------------------------------------------
-- 4. REALTIME — let other logged-in devices see calculator saves live
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'fitness_inputs') then
    alter publication supabase_realtime add table public.fitness_inputs;
  end if;
end $$;

-- ------------------------------------------------------------
-- 5. GHOST CLEANUP — drop saved inputs whose client no longer exists
--    (mirrors sql/delete_client_cascade.sql; safe to re-run anytime)
-- ------------------------------------------------------------
with alive as (
  select id::text as k from public.clients
  union all
  select upper(login_id) from public.clients
)
delete from public.fitness_inputs f
where f.client_id is not null
  and lower(f.client_id) <> all (array(select lower(k) from alive));

-- ------------------------------------------------------------
-- 6. FULL FEATURE REMOVAL (manual only — uncomment to run)
--    The in-app wipe already clears all DATA; this drops the objects.
-- ------------------------------------------------------------
-- alter publication supabase_realtime drop table public.fitness_inputs;
-- drop table if exists public.fitness_inputs;
-- alter table public.client_profiles
--   drop column if exists fit_weight_kg, drop column if exists fit_height_cm,
--   drop column if exists fit_age, drop column if exists fit_gender,
--   drop column if exists fit_activity_level, drop column if exists fit_goal,
--   drop column if exists fit_waist_cm, drop column if exists fit_neck_cm,
--   drop column if exists fit_hip_cm, drop column if exists fit_bench_kg,
--   drop column if exists fit_body_fat_pct;

-- ------------------------------------------------------------
-- 7. Reload PostgREST schema cache immediately
-- ------------------------------------------------------------
select pg_notify('pgrst', 'reload schema');

-- Sanity check — should list fitness_inputs + the 11 new fit_ columns:
select column_name from information_schema.columns
where table_schema = 'public'
  and (table_name = 'fitness_inputs'
       or (table_name = 'client_profiles' and column_name like 'fit_%'))
order by table_name, column_name;
