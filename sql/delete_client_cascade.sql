-- sql/delete_client_cascade.sql — one-time cleanup of leftover cloud data.
--
-- WHY: the old "Delete client" only removed the row from `clients`. Every
-- related table kept its rows, so deleted clients' data appeared to "come
-- back" after a refresh / reopen on another device. The app now deletes all
-- tables itself; run this once in the Supabase SQL editor to clear any ghost
-- rows left behind by earlier deletions.
--
-- It removes child rows whose client_id matches NO existing client — by uuid
-- or by legacy login_id badge (e.g. 'ALI-9786'). Safe to re-run anytime.

with alive as (
  select id::text as k from public.clients
  union all
  select upper(login_id) from public.clients
),
ghosts as (
  select distinct x.client_id
  from (
    select client_id from public.progress_entries
    union all select client_id from public.sessions
    union all select client_id from public.workout_logs
    union all select client_id from public.daily_times
    union all select client_id from public.client_exercises
    union all select client_id from public.profile_approvals
    union all select client_id from public.progress_approvals
    union all select client_id from public.client_requests
    union all select client_id from public.workout_edit_requests
    union all select client_id from public.progress_reports
    union all select client_id from public.client_profiles
    union all select client_id from public.client_settings
    union all select client_id from public.fitness_inputs
  ) x
  where x.client_id is not null
    and lower(x.client_id) <> all (array(select lower(k) from alive))
)
delete from public.progress_entries e using ghosts g where e.client_id = g.client_id;

with alive as (
  select id::text as k from public.clients
  union all
  select upper(login_id) from public.clients
),
ghosts as (
  select distinct x.client_id
  from (
    select client_id from public.progress_entries
    union all select client_id from public.sessions
    union all select client_id from public.workout_logs
    union all select client_id from public.daily_times
    union all select client_id from public.client_exercises
    union all select client_id from public.profile_approvals
    union all select client_id from public.progress_approvals
    union all select client_id from public.client_requests
    union all select client_id from public.workout_edit_requests
    union all select client_id from public.progress_reports
    union all select client_id from public.client_profiles
    union all select client_id from public.client_settings
    union all select client_id from public.fitness_inputs
  ) x
  where x.client_id is not null
    and lower(x.client_id) <> all (array(select lower(k) from alive))
)
delete from public.sessions s using ghosts g where s.client_id = g.client_id;

with alive as (
  select id::text as k from public.clients
  union all
  select upper(login_id) from public.clients
),
ghosts as (
  select distinct x.client_id
  from (
    select client_id from public.progress_entries
    union all select client_id from public.sessions
    union all select client_id from public.workout_logs
    union all select client_id from public.daily_times
    union all select client_id from public.client_exercises
    union all select client_id from public.profile_approvals
    union all select client_id from public.progress_approvals
    union all select client_id from public.client_requests
    union all select client_id from public.workout_edit_requests
    union all select client_id from public.progress_reports
    union all select client_id from public.client_profiles
    union all select client_id from public.client_settings
    union all select client_id from public.fitness_inputs
  ) x
  where x.client_id is not null
    and lower(x.client_id) <> all (array(select lower(k) from alive))
)
delete from public.workout_logs w using ghosts g where w.client_id = g.client_id;

with alive as (
  select id::text as k from public.clients
  union all
  select upper(login_id) from public.clients
),
ghosts as (
  select distinct x.client_id
  from (
    select client_id from public.progress_entries
    union all select client_id from public.sessions
    union all select client_id from public.workout_logs
    union all select client_id from public.daily_times
    union all select client_id from public.client_exercises
    union all select client_id from public.profile_approvals
    union all select client_id from public.progress_approvals
    union all select client_id from public.client_requests
    union all select client_id from public.workout_edit_requests
    union all select client_id from public.progress_reports
    union all select client_id from public.client_profiles
    union all select client_id from public.client_settings
    union all select client_id from public.fitness_inputs
  ) x
  where x.client_id is not null
    and lower(x.client_id) <> all (array(select lower(k) from alive))
)
delete from public.daily_times d using ghosts g where d.client_id = g.client_id;

with alive as (
  select id::text as k from public.clients
  union all
  select upper(login_id) from public.clients
),
ghosts as (
  select distinct x.client_id
  from (
    select client_id from public.progress_entries
    union all select client_id from public.sessions
    union all select client_id from public.workout_logs
    union all select client_id from public.daily_times
    union all select client_id from public.client_exercises
    union all select client_id from public.profile_approvals
    union all select client_id from public.progress_approvals
    union all select client_id from public.client_requests
    union all select client_id from public.workout_edit_requests
    union all select client_id from public.progress_reports
    union all select client_id from public.client_profiles
    union all select client_id from public.client_settings
    union all select client_id from public.fitness_inputs
  ) x
  where x.client_id is not null
    and lower(x.client_id) <> all (array(select lower(k) from alive))
)
delete from public.client_exercises ce using ghosts g where ce.client_id = g.client_id;

with alive as (
  select id::text as k from public.clients
  union all
  select upper(login_id) from public.clients
),
ghosts as (
  select distinct x.client_id
  from (
    select client_id from public.progress_entries
    union all select client_id from public.sessions
    union all select client_id from public.workout_logs
    union all select client_id from public.daily_times
    union all select client_id from public.client_exercises
    union all select client_id from public.profile_approvals
    union all select client_id from public.progress_approvals
    union all select client_id from public.client_requests
    union all select client_id from public.workout_edit_requests
    union all select client_id from public.progress_reports
    union all select client_id from public.client_profiles
    union all select client_id from public.client_settings
    union all select client_id from public.fitness_inputs
  ) x
  where x.client_id is not null
    and lower(x.client_id) <> all (array(select lower(k) from alive))
)
delete from public.profile_approvals pa using ghosts g where pa.client_id = g.client_id;

with alive as (
  select id::text as k from public.clients
  union all
  select upper(login_id) from public.clients
),
ghosts as (
  select distinct x.client_id
  from (
    select client_id from public.progress_entries
    union all select client_id from public.sessions
    union all select client_id from public.workout_logs
    union all select client_id from public.daily_times
    union all select client_id from public.client_exercises
    union all select client_id from public.profile_approvals
    union all select client_id from public.progress_approvals
    union all select client_id from public.client_requests
    union all select client_id from public.workout_edit_requests
    union all select client_id from public.progress_reports
    union all select client_id from public.client_profiles
    union all select client_id from public.client_settings
    union all select client_id from public.fitness_inputs
  ) x
  where x.client_id is not null
    and lower(x.client_id) <> all (array(select lower(k) from alive))
)
delete from public.progress_approvals pra using ghosts g where pra.client_id = g.client_id;

with alive as (
  select id::text as k from public.clients
  union all
  select upper(login_id) from public.clients
),
ghosts as (
  select distinct x.client_id
  from (
    select client_id from public.progress_entries
    union all select client_id from public.sessions
    union all select client_id from public.workout_logs
    union all select client_id from public.daily_times
    union all select client_id from public.client_exercises
    union all select client_id from public.profile_approvals
    union all select client_id from public.progress_approvals
    union all select client_id from public.client_requests
    union all select client_id from public.workout_edit_requests
    union all select client_id from public.progress_reports
    union all select client_id from public.client_profiles
    union all select client_id from public.client_settings
    union all select client_id from public.fitness_inputs
  ) x
  where x.client_id is not null
    and lower(x.client_id) <> all (array(select lower(k) from alive))
)
delete from public.client_requests cr using ghosts g where cr.client_id = g.client_id;

with alive as (
  select id::text as k from public.clients
  union all
  select upper(login_id) from public.clients
),
ghosts as (
  select distinct x.client_id
  from (
    select client_id from public.progress_entries
    union all select client_id from public.sessions
    union all select client_id from public.workout_logs
    union all select client_id from public.daily_times
    union all select client_id from public.client_exercises
    union all select client_id from public.profile_approvals
    union all select client_id from public.progress_approvals
    union all select client_id from public.client_requests
    union all select client_id from public.workout_edit_requests
    union all select client_id from public.progress_reports
    union all select client_id from public.client_profiles
    union all select client_id from public.client_settings
    union all select client_id from public.fitness_inputs
  ) x
  where x.client_id is not null
    and lower(x.client_id) <> all (array(select lower(k) from alive))
)
delete from public.workout_edit_requests wer using ghosts g where wer.client_id = g.client_id;

with alive as (
  select id::text as k from public.clients
  union all
  select upper(login_id) from public.clients
),
ghosts as (
  select distinct x.client_id
  from (
    select client_id from public.progress_entries
    union all select client_id from public.sessions
    union all select client_id from public.workout_logs
    union all select client_id from public.daily_times
    union all select client_id from public.client_exercises
    union all select client_id from public.profile_approvals
    union all select client_id from public.progress_approvals
    union all select client_id from public.client_requests
    union all select client_id from public.workout_edit_requests
    union all select client_id from public.progress_reports
    union all select client_id from public.client_profiles
    union all select client_id from public.client_settings
    union all select client_id from public.fitness_inputs
  ) x
  where x.client_id is not null
    and lower(x.client_id) <> all (array(select lower(k) from alive))
)
delete from public.progress_reports pr using ghosts g where pr.client_id = g.client_id;

with alive as (
  select id::text as k from public.clients
  union all
  select upper(login_id) from public.clients
),
ghosts as (
  select distinct x.client_id
  from (
    select client_id from public.progress_entries
    union all select client_id from public.sessions
    union all select client_id from public.workout_logs
    union all select client_id from public.daily_times
    union all select client_id from public.client_exercises
    union all select client_id from public.profile_approvals
    union all select client_id from public.progress_approvals
    union all select client_id from public.client_requests
    union all select client_id from public.workout_edit_requests
    union all select client_id from public.progress_reports
    union all select client_id from public.client_profiles
    union all select client_id from public.client_settings
    union all select client_id from public.fitness_inputs
  ) x
  where x.client_id is not null
    and lower(x.client_id) <> all (array(select lower(k) from alive))
)
delete from public.client_profiles cp using ghosts g where cp.client_id = g.client_id;

with alive as (
  select id::text as k from public.clients
  union all
  select upper(login_id) from public.clients
),
ghosts as (
  select distinct x.client_id
  from (
    select client_id from public.progress_entries
    union all select client_id from public.sessions
    union all select client_id from public.workout_logs
    union all select client_id from public.daily_times
    union all select client_id from public.client_exercises
    union all select client_id from public.profile_approvals
    union all select client_id from public.progress_approvals
    union all select client_id from public.client_requests
    union all select client_id from public.workout_edit_requests
    union all select client_id from public.progress_reports
    union all select client_id from public.client_profiles
    union all select client_id from public.client_settings
    union all select client_id from public.fitness_inputs
  ) x
  where x.client_id is not null
    and lower(x.client_id) <> all (array(select lower(k) from alive))
)
delete from public.client_settings cs using ghosts g where cs.client_id = g.client_id;
