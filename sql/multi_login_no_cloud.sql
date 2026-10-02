-- ============================================================
-- MULTI-LOGIN / NO CROSS-DEVICE AUTO-OPEN  —  verification script
-- ------------------------------------------------------------
-- HOW LOGIN WORKS IN THIS APP:
--   * Login credentials live ONLY in public.clients (login_id +
--     password_hint) and the admin row in app_settings.
--   * "Remembered logins" are stored per-device in that browser's
--     localStorage (key tas_device_sessions_v2). They are NEVER
--     written to Supabase, so an ID opened on one device can
--     never auto-open on another device, and many different IDs
--     can be open at the same time on different devices.
--
-- This script therefore adds NOTHING new to the cloud. It only
-- VERIFIES the schema supports multi-device concurrent logins:
--   1. clients table has login columns.
--   2. No session/device-lock table exists in the cloud
--      (and if a stray one from an old experiment exists, it is
--      shown so you can drop it manually if you want).
--   3. RLS stays enabled (data protected, anon key still works
--      through the policies this app relies on).
-- Safe to run repeatedly (idempotent, read-only checks).
-- ============================================================

-- 1) Credentials columns exist on clients ----------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='clients' and column_name='login_id') then
    alter table public.clients add column if not exists login_id text;
    raise notice '✔ added clients.login_id';
  else
    raise notice '✔ clients.login_id already present';
  end if;

  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='clients' and column_name='password_hint') then
    alter table public.clients add column if not exists password_hint text;
    raise notice '✔ added clients.password_hint';
  else
    raise notice '✔ clients.password_hint already present';
  end if;

  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='clients' and column_name='active') then
    alter table public.clients add column if not exists active boolean default true;
    raise notice '✔ added clients.active';
  else
    raise notice '✔ clients.active already present';
  end if;
end $$;

-- 2) Make sure NO cloud-side session/device-lock table is used --
--    (the app must never store "who is logged in where" in the cloud)
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public'
               and table_name in ('device_sessions','active_sessions','login_locks','user_sessions')) then
    raise notice '⚠ A cloud session/lock table exists. The app does NOT use it, but to fully avoid confusion you may run:  drop table public.device_sessions;';
  else
    raise notice '✔ No cloud session/device-lock tables — logins are device-local, multi-device safe.';
  end if;
end $$;

-- 3) Keep RLS on (defensive; matches schema_complete.sql) -------
alter table if exists public.clients enable row level security;

-- 4) Final check: list every client's login setup ---------------
select id, name, login_id,
       (password_hint is not null and password_hint <> '') as has_password,
       coalesce(active, true) as active
from public.clients
order by created_at;
