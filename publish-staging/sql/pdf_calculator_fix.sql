-- ============================================================
-- sql/pdf_calculator_fix.sql — 📄 FIX for "Generate PDF" + ✏️ EDIT PROFILE
-- ------------------------------------------------------------
-- ERROR SEEN:  ❌ PDF failed: Invalid argument passed to jsPDF.f2
-- ROOT CAUSE (code, not network): jsPDF throws "Invalid argument passed to
--   jsPDF.f2/f3" whenever a NaN coordinate/color reaches it. The PDF code was
--   reading Shared Inputs from element ids that don't exist ("pcx-*"), so
--   empty/NaN values leaked into the report geometry. FIXED in
--   js/client-portal.js (reads the real pcWeight/pcAge/… inputs + clamps
--   every number). NO new tables are required for the PDF itself.
--
-- ALSO FIXES:  👤 My Profile → "✏️ Edit Profile button is not working".
--   The opener aborted on any prefill hiccup (e.g. a profile row whose
--   birth_date came back as the string 'null', or a stale inline
--   display:none left by an older cached script) and the delegated click
--   handler used stopPropagation(), which swallowed the modal's own
--   backdrop listeners. js/client-portal.js now shows the modal first,
--   guards every step, wires Cancel/backdrop/Submit itself, and inserts a
--   pending row into public.profile_approvals (proposed_data/current_data
--   jsonb — exactly what this script provisions below, including repairing
--   legacy tables that only had a generic "payload" column).
--
-- THIS FILE guarantees the DATABASE side has everything these features read:
--   • client_profiles.fit_* columns  → "Your Inputs" chips on page 1 +
--     the Shared Inputs section of the Edit Profile form
--   • profile_approvals (proposed_data/current_data) → where ✏️ Edit
--     Profile submits its pending changes for trainer approval
--   • progress_entries (+ approvals) → "Progress Trend" table & weight chart
--   • realtime publication refresh   → live updates on other devices
-- It is 100% idempotent — safe to run any number of times in Supabase SQL.
-- ============================================================

-- ------------------------------------------------------------
-- 1. CLIENT_PROFILES — base table + approval metadata
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
alter table public.client_profiles add column if not exists updated_at  timestamptz not null default now();

-- 🧮 Calculator Body Stats — the 11 shared inputs shown in the PDF cover's
--    "YOUR INPUTS" section (weight, height, age, gender, activity, goal,
--    waist, neck, hip, bench, body-fat %).
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
-- 2. PROGRESS ENTRIES — feeds the PDF "PROGRESS TREND" table + weight chart
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
-- 3. APPROVAL QUEUES — ✏️ Edit Profile inserts into profile_approvals
--    (columns MUST be proposed_data/current_data jsonb — the exact names
--     js/progress.js, js/client-portal.js and js/approvals.js read/write),
--    and the PDF only lists APPROVED entries/profiles.
-- ------------------------------------------------------------
create table if not exists public.profile_approvals (
  id          uuid primary key default gen_random_uuid(),
  client_id   text not null,
  proposed_data jsonb not null default '{}'::jsonb,   -- staged values, applied on approval
  current_data  jsonb not null default '{}'::jsonb,   -- snapshot at submit time
  status      text not null default 'pending',  -- pending | approved | rejected
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text
);
-- Repair legacy tables that were created with a generic "payload" column:
alter table public.profile_approvals add column if not exists proposed_data jsonb not null default '{}'::jsonb;
alter table public.profile_approvals add column if not exists current_data  jsonb not null default '{}'::jsonb;
do $$ begin
  update public.profile_approvals set proposed_data = payload where proposed_data = '{}'::jsonb and payload is not null;
exception when others then null; end $$;
create table if not exists public.progress_approvals (
  id          uuid primary key default gen_random_uuid(),
  client_id   text not null,
  entry_id    text,
  proposed_data jsonb not null default '{}'::jsonb,
  current_data  jsonb not null default '{}'::jsonb,
  status      text not null default 'pending',  -- pending | approved | rejected
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text
);
alter table public.progress_approvals add column if not exists proposed_data jsonb not null default '{}'::jsonb;
alter table public.progress_approvals add column if not exists current_data  jsonb not null default '{}'::jsonb;
create index if not exists pa_client_idx on public.profile_approvals (client_id);
create index if not exists pa_status_idx on public.profile_approvals (status);
create index if not exists pra_client_idx on public.progress_approvals (client_id);
create index if not exists pra_status_idx on public.progress_approvals (status);

-- ------------------------------------------------------------
-- 4. ROW LEVEL SECURITY — anon key = single-trainer access model
--    (matches every other table in this project)
-- ------------------------------------------------------------
alter table public.client_profiles enable row level security;
drop policy if exists "cp_select" on public.client_profiles;
create policy "cp_select" on public.client_profiles for select using (true);
drop policy if exists "cp_insert" on public.client_profiles;
create policy "cp_insert" on public.client_profiles for insert with check (true);
drop policy if exists "cp_update" on public.client_profiles;
create policy "cp_update" on public.client_profiles for update using (true) with check (true);
drop policy if exists "cp_delete" on public.client_profiles;
create policy "cp_delete" on public.client_profiles for delete using (true);

alter table public.progress_entries enable row level security;
drop policy if exists "pe_select" on public.progress_entries;
create policy "pe_select" on public.progress_entries for select using (true);
drop policy if exists "pe_insert" on public.progress_entries;
create policy "pe_insert" on public.progress_entries for insert with check (true);
drop policy if exists "pe_update" on public.progress_entries;
create policy "pe_update" on public.progress_entries for update using (true) with check (true);
drop policy if exists "pe_delete" on public.progress_entries;
create policy "pe_delete" on public.progress_entries for delete using (true);

alter table public.profile_approvals enable row level security;
drop policy if exists "pa_select" on public.profile_approvals;
create policy "pa_select" on public.profile_approvals for select using (true);
drop policy if exists "pa_insert" on public.profile_approvals;
create policy "pa_insert" on public.profile_approvals for insert with check (true);
drop policy if exists "pa_update" on public.profile_approvals;
create policy "pa_update" on public.profile_approvals for update using (true) with check (true);
drop policy if exists "pa_delete" on public.profile_approvals;
create policy "pa_delete" on public.profile_approvals for delete using (true);

alter table public.progress_approvals enable row level security;
drop policy if exists "pra_select" on public.progress_approvals;
create policy "pra_select" on public.progress_approvals for select using (true);
drop policy if exists "pra_insert" on public.progress_approvals;
create policy "pra_insert" on public.progress_approvals for insert with check (true);
drop policy if exists "pra_update" on public.progress_approvals;
create policy "pra_update" on public.progress_approvals for update using (true) with check (true);
drop policy if exists "pra_delete" on public.progress_approvals;
create policy "pra_delete" on public.progress_approvals for delete using (true);

-- ------------------------------------------------------------
-- 5. REALTIME — keep other open devices in sync (same pattern as the app)
-- ------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.client_profiles;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.progress_entries;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.profile_approvals;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.progress_approvals;
  exception when duplicate_object then null; end;
end $$;

-- ------------------------------------------------------------
-- 6. VERIFY — run these selects afterwards; all should return rows/values
-- ------------------------------------------------------------
-- select column_name from information_schema.columns
--   where table_name='client_profiles' and column_name like 'fit_%' order by 1;
-- select count(*) from public.progress_entries;
-- select count(*) from public.client_profiles;

-- DONE. Now hard-refresh the portal once (Ctrl+Shift+R / clear site data —
-- the service worker was bumped to tas-pwa-v26 so the fixed JS loads) and
-- press 📄 Generate PDF again.
-- ============================================================
