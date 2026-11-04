-- Expire access immediately, retain account data for seven days, then clean daily.
-- Apply after student-lifecycle.sql. This migration does not delete accounts.
begin;

create or replace function private.mark_expired_students()
returns integer language plpgsql security definer set search_path = '' as $$
declare changed_count integer;
begin
  update public.student_profiles set status = 'EXPIRED'
  where access_expires_at <= now() and status <> 'EXPIRED'
    and not exists (select 1 from public.librarian_profiles where id = student_profiles.id);
  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;
revoke all on function private.mark_expired_students() from public, anon, authenticated, service_role;

create or replace function public.refresh_student_access_status()
returns integer language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_librarian() then raise exception 'not authorized'; end if;
  return private.mark_expired_students();
end;
$$;
revoke all on function public.refresh_student_access_status() from public, anon;
grant execute on function public.refresh_student_access_status() to authenticated;

create or replace function private.cleanup_expired_students()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target record; deleted_count integer := 0; blocked_count integer := 0;
begin
  if not pg_try_advisory_xact_lock(20240701, 3) then return jsonb_build_object('skipped', true); end if;
  perform private.mark_expired_students();
  -- Close reservations without changing stock. Physical books still need receipt.
  update public.loans set status = 'REJECTED', rejection_reason = 'Masa aktif akun telah berakhir.'
  where status in ('PENDING', 'APPROVED') and student_id in (
    select id from public.student_profiles where access_expires_at <= now()
      and not exists (select 1 from public.librarian_profiles where id = student_profiles.id)
  );
  update public.loans set status = 'RETURN_REQUESTED', return_requested_at = now(),
    extension_status = case when extension_status = 'PENDING' then 'CANCELLED' else extension_status end,
    extension_reviewed_at = case when extension_status = 'PENDING' then now() else extension_reviewed_at end
  where status = 'BORROWED' and student_id in (
    select id from public.student_profiles where access_expires_at <= now()
      and not exists (select 1 from public.librarian_profiles where id = student_profiles.id)
  );
  for target in
    select students.id from public.student_profiles students
    where students.status = 'EXPIRED' and students.access_expires_at <= now() - interval '7 days'
      and not exists (select 1 from public.librarian_profiles where id = students.id)
      and not exists (select 1 from public.loans where student_id = students.id
        and status in ('PENDING', 'APPROVED', 'BORROWED', 'RETURN_REQUESTED'))
    order by students.access_expires_at, students.id limit 500 for update of students skip locked
  loop
    begin
      -- The account stays intact if any remaining FK prevents deletion.
      delete from public.reading_history where student_id = target.id;
      delete from public.loans where student_id = target.id;
      update public.loan_status_history set changed_by = null where changed_by = target.id;
      delete from auth.users where id = target.id;
      -- Auth/profile FKs cascade sessions, identities, favorites, and the profile.
    exception when foreign_key_violation then
      blocked_count := blocked_count + 1;
      continue;
    end;
    deleted_count := deleted_count + 1;
  end loop;
  return jsonb_build_object('deleted_accounts', deleted_count, 'blocked_accounts', blocked_count);
end;
$$;
revoke all on function private.cleanup_expired_students() from public, anon, authenticated, service_role;

-- Small indexed status update every minute, even when no dashboard is open.
select cron.schedule('litera-expire-students', '* * * * *', 'select private.mark_expired_students();');
-- Daily deletion remains at 00:15 WIB, and now respects seven full days of retention.
select cron.schedule('litera-cleanup-alumni', '15 17 * * *', 'select private.cleanup_expired_students();');
select private.mark_expired_students();
commit;

select jobname, schedule, active from cron.job
where jobname in ('litera-expire-students', 'litera-cleanup-alumni') order by jobname;
-- Verification: no account is deleted here.
select id, status, access_expires_at at time zone 'Asia/Jakarta' as akses_berakhir_wib,
  (access_expires_at + interval '7 days') at time zone 'Asia/Jakarta' as paling_awal_dihapus_wib
from public.student_profiles where status = 'EXPIRED' order by access_expires_at;
-- Rollback: unschedule litera-expire-students and stop calling refresh_student_access_status.
-- Keep the retention rule while investigating; restoring immediate deletion loses the grace period.
