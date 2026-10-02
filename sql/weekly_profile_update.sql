-- ============================================================
-- sql/weekly_profile_update.sql — Weekly profile-update flow migration
-- ------------------------------------------------------------
-- Run this ONCE in the Supabase SQL Editor (safe to re-run: every
-- statement is idempotent).
--
-- What it does for the new "📌 Shared Inputs + 👤 Basic Details →
-- approval gate → weekly popup → snapshot into 📈 Progress" flow:
--
--   1. client_profiles.approved_at / approved_by
--      The weekly popup ("it has been a week since your profile was
--      last approved") and the ✅ Approved chip read these columns.
--      Without them the trainer's approval still works, but the
--      approval timestamp falls back to updated_at on other devices.
--
--   2. profile_approvals.admin_note / decided_at (+ pending default)
--      The admin's approve/reject decision writes these. Needed so
--      getLastProfileApprovalTime() can find when a profile was
--      approved and reset the weekly cycle correctly.
--
--   3. progress_entries.added_by
--      On the SECOND (and every later) approval, the previously
--      approved profile is archived as a snapshot row in
--      progress_entries with added_by = 'profile-snapshot'. This
--      column must exist or the archival insert silently fails and
--      history never builds up in 📈 Progress.
--
--   4. fitness_inputs table + RLS policies
--      The shared-inputs cache that approved values are synced into
--      (syncFitnessInputsFromProfile). Also deletes any LEGACY draft
--      rows containing UNAPPROVED values — from now on the only path
--      into this table is post-approval sync, so calculators can
--      never show unapproved numbers again.
--
--   5. Realtime publication
--      Adds profile_approvals / progress_approvals / fitness_inputs /
--      progress_entries to supabase_realtime so the client's device
--      refreshes the moment the trainer approves (calculators light
--      up without reopening the app).
--
-- NOTE: if you have NEVER run sql/schema_complete.sql, run that first
-- (it creates all base tables), then run this file. If you already ran
-- schema_complete.sql + fix_approvals.sql + fitness_calculator.sql,
-- this file simply tops everything up — no harm in re-running.
-- ============================================================

-- ------------------------------------------------------------
-- 1. client_profiles approval metadata
-- ------------------------------------------------------------
alter table public.client_profiles
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by text;

-- ------------------------------------------------------------
-- 2. Approval queue workflow columns
-- ------------------------------------------------------------
alter table public.profile_approvals
  add column if not exists admin_note text,
  add column if not exists decided_at timestamptz;
alter table public.profile_approvals alter column status set default 'pending';

alter table public.progress_approvals
  add column if not exists admin_note text,
  add column if not exists decided_at timestamptz;
alter table public.progress_approvals alter column status set default 'pending';

create index if not exists profap_status_idx    on public.profile_approvals  (status);
create index if not exists profap_client_idx    on public.profile_approvals  (client_id, submitted_at desc);
create index if not exists progap_status_idx    on public.progress_approvals (status);

-- ------------------------------------------------------------
-- 3. Snapshot archival target (progress_entries)
-- ------------------------------------------------------------
alter table public.progress_entries
  add column if not exists added_by text not null default 'admin';

create index if not exists pe_client_idx on public.progress_entries (client_id);
create index if not exists pe_date_idx   on public.progress_entries (entry_date desc);

-- ------------------------------------------------------------
-- 4. Shared calculator inputs (approved-values cache)
-- ------------------------------------------------------------
create table if not exists public.fitness_inputs (
  id         uuid primary key default gen_random_uuid(),
  client_id  text not null unique,
  inputs     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.fitness_inputs add column if not exists updated_at timestamptz not null default now();
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

-- 🔒 Approval-gate cleanup: delete fitness_inputs rows belonging to
-- clients that no longer exist (ghost rows), and drop any rows whose
-- client has NO approved profile yet — those can only be unapproved
-- drafts autosaved by older builds. After this, the only writer of
-- fitness_inputs is the post-approval sync in js/approvals.js.
delete from public.fitness_inputs fi
where not exists (
  select 1 from public.clients c
  where c.id::text = fi.client_id
     or c.login_id::text = fi.client_id
)
   or not exists (
  select 1 from public.client_profiles p
  join public.clients c2 on c2.id::text = p.client_id::text
  where coalesce(c2.login_id::text, c2.id::text) = fi.client_id
    and (   p.fit_weight_kg is not null
         or p.fit_height_cm is not null
         or p.fit_age       is not null
         or p.fit_gender    is not null
         or p.fit_goal      is not null)
);

-- ------------------------------------------------------------
-- 5. Realtime — live refresh when the trainer approves
-- ------------------------------------------------------------
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array[
    'profile_approvals','progress_approvals','fitness_inputs','progress_entries'
  ] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 6. Refresh PostgREST schema cache so new columns are visible
-- ------------------------------------------------------------
notify pgrst, 'reload schema';
