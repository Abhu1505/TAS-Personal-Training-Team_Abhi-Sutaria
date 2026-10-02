-- ============================================================
-- sql/progress_reports.sql — Saved monthly progress reports
-- Run this once in Supabase → SQL Editor → New query → Run.
-- The app also auto-creates this table on first use when a
-- service role key is configured (see ensureTableExists).
-- ============================================================

create table if not exists public.progress_reports (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  month_key text not null,            -- "YYYY-MM" the report covers
  period_from text,                   -- comparison start month
  period_to text,                     -- comparison end month
  snapshot jsonb not null default '{}'::jsonb,
  comparison jsonb not null default '{}'::jsonb,
  generated_by text,                  -- 'admin' or 'client'
  created_at timestamptz not null default now()
);

create index if not exists pr_client_month_idx
  on public.progress_reports (client_id, month_key);

alter table public.progress_reports enable row level security;

drop policy if exists pr_select on public.progress_reports;
create policy pr_select on public.progress_reports for select using (true);

drop policy if exists pr_insert on public.progress_reports;
create policy pr_insert on public.progress_reports for insert with check (true);

drop policy if exists pr_delete on public.progress_reports;
create policy pr_delete on public.progress_reports for delete using (true);
