-- ============================================================
-- fix_uuid_ids.sql  —  run this ONCE in the Supabase SQL Editor
--   Dashboard → SQL Editor → New query → paste everything → Run
-- ------------------------------------------------------------
-- WHY: some older installs created these tables with a NUMERIC
-- (bigint/serial) primary key instead of UUID:
--     clients, client_settings, client_profiles, progress_entries,
--     sessions, daily_times, exercises, client_exercises,
--     workout_logs, client_requests, workout_edit_requests,
--     progress_reports, profile_approvals, progress_approvals
-- The app now always uses clients.id as the one client id EVERYWHERE
-- (UUID), so numeric ids cause errors like:
--     "invalid input syntax for type uuid"
-- This script converts any numeric-id table to proper UUID ids and
-- rewrites every client_id / exercise_id / entry_id reference to the
-- new UUIDs. It KEEPS ALL YOUR DATA and is safe to re-run:
--   • if the ids are already UUIDs it does nothing at all
--   • deterministic UUIDs (uuid_generate_v5) mean rows that were
--     already converted stay identical
-- Run sql/schema_complete.sql first if you have never run it.
-- After this, press 🔄 Refresh in the app.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Generic converter: makes public.<table>.id a uuid primary key
-- and stores a mapping old_numeric_id -> new_uuid in _idmap.
-- ------------------------------------------------------------
create schema if not exists tas_fix;
create table if not exists tas_fix._idmap (
  tbl      text not null,
  old_pk   text not null,          -- previous id as text
  new_pk   uuid not null,
  primary key (tbl, old_pk)
);

do $$
declare
  t        text;
  tables   text[] := array[
    'clients','client_settings','client_profiles','progress_entries',
    'sessions','daily_times','exercises','client_exercises','workout_logs',
    'client_requests','workout_edit_requests','progress_reports',
    'profile_approvals','progress_approvals'
  ];
begin
  -- clear previous bookkeeping so re-runs stay consistent
  truncate tas_fix._idmap;

  foreach t in array tables loop
    continue when not exists (select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t);

    -- skip tables whose id is already uuid
    if exists (select 1 from pg_attribute a
               join pg_type ty on ty.oid = a.atttypid
               where a.attrelid = format('public.%I', t)::regclass
                 and a.attname = 'id' and ty.typname = 'uuid') then
      continue;
    end if;

    -- 1) record the mapping old id -> deterministic uuid
    execute format(
      'insert into tas_fix._idmap (tbl, old_pk, new_pk)
       select %L, x.id::text, uuid_generate_v5(uuid_ns_dns(), %L || x.id::text)
       from public.%I x', t, t || ':', quote_ident(t));

    -- 2) add a temporary uuid column, fill it, swap it in as the PK
    execute format('alter table public.%I add column _new_id uuid', quote_ident(t));
    execute format(
      'update public.%I x set _new_id = m.new_pk
       from tas_fix._idmap m where m.tbl = %L and m.old_pk = x.id::text',
      quote_ident(t), t);
    execute format('alter table public.%I drop constraint %I cascade',
      quote_ident(t), t || '_pkey');
    execute format('alter table public.%I drop column id', quote_ident(t));
    execute format('alter table public.%I rename column _new_id to id', quote_ident(t));
    execute format('alter table public.%I alter column id set not null', quote_ident(t));
    execute format('alter table public.%I add primary key (id)', quote_ident(t));
    raise notice 'converted public.% to uuid ids', t;
  end loop;
end $$;

-- ------------------------------------------------------------
-- Remap every reference column that stores a CLIENT id.
-- Values already in UUID form are left untouched; numeric values
-- (and legacy login_id strings) are mapped to clients.id.
-- ------------------------------------------------------------
do $$
declare
  r        record;
  v        text;
  target   uuid;
begin
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'client_id'
      and tb.table_type = 'BASE TABLE'
      and c.data_type in ('text','character varying','integer','bigint','numeric')
  loop
    -- a) same-table conversion: old numeric client id -> new uuid
    execute format(
      'update public.%I x set client_id = m.new_pk::text
       from tas_fix._idmap m
       where m.tbl = %L and x.client_id ~ ''^[0-9]+$''
         and m.old_pk = x.client_id',
      quote_ident(r.table_name), 'clients');

    -- b) still-numeric leftovers → look them up by login_id badge
    for v in execute format(
        'select distinct client_id from public.%I
         where client_id ~ ''^[0-9]+$''', quote_ident(r.table_name))
    loop
      select id into target from public.clients
       where upper(login_id) = upper(v) or id::text = v;
      if target is not null then
        execute format(
          'update public.%I set client_id = %L::text where client_id = %L',
          quote_ident(r.table_name), target, v);
      end if;
      target := null;
    end loop;

    raise notice 'remapped client_id references in public.%', r.table_name;
  end loop;
end $$;

-- ------------------------------------------------------------
-- Remap other cross-table uuid references that may hold numbers:
--   client_exercises.exercise_id / workout_logs.exercise_id ← exercises
--   progress_approvals.entry_id                            ← progress_entries
--   workout_edit_requests.entry_log_id                     ← workout_logs
-- ------------------------------------------------------------
do $$
declare
  pair record;
begin
  for pair in select * from (values
      ('client_exercises','exercise_id','exercises'),
      ('workout_logs','exercise_id','exercises'),
      ('progress_approvals','entry_id','progress_entries'),
      ('workout_edit_requests','entry_log_id','workout_logs')
  ) v(tbl, col, reftbl)
  loop
    continue when not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name = pair.tbl and column_name = pair.col);
    execute format(
      'update public.%I x set %I = m.new_pk
       from tas_fix._idmap m
       where m.tbl = %L and x.%I::text ~ ''^[0-9]+$'' and m.old_pk = x.%I::text',
      quote_ident(pair.tbl), quote_ident(pair.col), pair.reftbl,
      quote_ident(pair.col), quote_ident(pair.col));
    raise notice 'remapped %.% via %', pair.tbl, pair.col, pair.reftbl;
  end loop;
end $$;

-- ------------------------------------------------------------
-- Done. Keep tas_fix._idmap for reference; drop it if you like:
--   drop schema tas_fix cascade;
-- Then press 🔄 Refresh in the app.
-- ------------------------------------------------------------
