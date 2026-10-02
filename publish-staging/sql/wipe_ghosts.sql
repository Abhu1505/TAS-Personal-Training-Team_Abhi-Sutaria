-- sql/wipe_ghosts.sql — one-time cleanup of ghost rows left behind by the old
-- incomplete "Wipe All Data" (client_requests / workout_edit_requests /
-- progress_reports were never deleted). Run once in the Supabase SQL editor.
delete from public.client_requests;
delete from public.workout_edit_requests;
delete from public.progress_reports;

-- Make sure the hardcoded admin credentials exist in the cloud (never wiped).
insert into public.admin_config (id, admin_login_id, admin_password, archive_email, updated_at)
values (1, 'TAS-Abhi', 'Abhu@1818', 'trainer@example.com', now())
on conflict (id) do update
  set admin_login_id = excluded.admin_login_id,
      admin_password = excluded.admin_password,
      updated_at     = now();
