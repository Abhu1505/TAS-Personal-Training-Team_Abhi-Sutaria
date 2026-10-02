-- ============================================================
-- fix_approvals.sql  —  run this ONCE in the Supabase SQL Editor
-- Fixes:
--   ❌ Could not find the 'admin_note' column of 'profile_approvals'
--      (and the same for progress_approvals / decided_at)
-- Also adds the unique constraints the app's upserts require.
-- All statements are idempotent — safe to re-run.
-- ============================================================

-- 1) Approval workflow columns ---------------------------------
ALTER TABLE public.profile_approvals
  ADD COLUMN IF NOT EXISTS admin_note  TEXT,
  ADD COLUMN IF NOT EXISTS decided_at  TIMESTAMPTZ;

ALTER TABLE public.progress_approvals
  ADD COLUMN IF NOT EXISTS admin_note  TEXT,
  ADD COLUMN IF NOT EXISTS decided_at  TIMESTAMPTZ;

-- Make sure status has a sane default
ALTER TABLE public.profile_approvals  ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.progress_approvals ALTER COLUMN status SET DEFAULT 'pending';

-- 2) client_profiles approval metadata -------------------------
ALTER TABLE public.client_profiles
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by TEXT;

-- 3) Unique constraints required by the app's .upsert() calls ---
--    main.js         upserts daily_times     ON (client_id, day_date)
--    sessions.js     upserts sessions        ON (client_id, session_date)
--    approvals.js    upserts client_profiles ON (client_id)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_daily_times_client_day') THEN
    ALTER TABLE public.daily_times
      ADD CONSTRAINT uq_daily_times_client_day UNIQUE (client_id, day_date);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_sessions_client_date') THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT uq_sessions_client_date UNIQUE (client_id, session_date);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_client_profiles_client') THEN
    ALTER TABLE public.client_profiles
      ADD CONSTRAINT uq_client_profiles_client UNIQUE (client_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_client_settings_client') THEN
    ALTER TABLE public.client_settings
      ADD CONSTRAINT uq_client_settings_client UNIQUE (client_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_client_exercises_pair') THEN
    ALTER TABLE public.client_exercises
      ADD CONSTRAINT uq_client_exercises_pair UNIQUE (client_id, exercise_id);
  END IF;
END $$;

-- 4) Refresh PostgREST schema cache so the new columns are seen
--    immediately (otherwise "schema cache" errors can linger).
NOTIFY pgrst, 'reload schema';

-- 5) Sanity check — should list both new columns on both tables
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('profile_approvals', 'progress_approvals')
  AND column_name IN ('admin_note', 'decided_at', 'status');
