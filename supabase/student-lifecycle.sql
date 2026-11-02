-- Policy: cohorts 2024 onward expire on 1 July, entry year + 3, Asia/Jakarta.
-- Cleanup permanently deletes graduated accounts AND their completed history.
-- Accounts with any ongoing loan or librarian role are never deleted.
-- Legacy entry years before 2024 remain unchanged pending data review.
begin;

alter table public.student_profiles add column if not exists access_expires_at timestamptz;
alter table public.student_profiles drop constraint if exists student_profiles_status_check;
alter table public.student_profiles add constraint student_profiles_status_check
  check (status in ('PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'EXPIRED'));

create or replace function private.set_student_access_expiry()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.access_expires_at = case when new.enrollment_year >= 2024
    then make_timestamptz(new.enrollment_year + 3, 7, 1, 0, 0, 0, 'Asia/Jakarta') else null end;
  return new;
end;
$$;
drop trigger if exists student_profiles_access_expiry on public.student_profiles;
create trigger student_profiles_access_expiry before insert or update of enrollment_year, access_expires_at
on public.student_profiles for each row execute function private.set_student_access_expiry();

update public.student_profiles
set access_expires_at = case when enrollment_year >= 2024
  then make_timestamptz(enrollment_year + 3, 7, 1, 0, 0, 0, 'Asia/Jakarta') else null end
where access_expires_at is distinct from case when enrollment_year >= 2024
  then make_timestamptz(enrollment_year + 3, 7, 1, 0, 0, 0, 'Asia/Jakarta') else null end;
create index if not exists student_profiles_access_expires_idx on public.student_profiles(access_expires_at)
where access_expires_at is not null;

create or replace function private.validate_student_registration_year()
returns trigger language plpgsql set search_path = '' as $$
declare entry_year text;
begin
  if new.raw_user_meta_data ->> 'registration_source' = 'LITERA_STUDENT' then
    entry_year = new.raw_user_meta_data ->> 'enrollment_year';
    if entry_year is null or entry_year !~ '^\d{4}$' then raise exception 'invalid enrollment year'; end if;
    if entry_year::integer < 2024 or entry_year::integer > extract(year from now() at time zone 'Asia/Jakarta') then
      raise exception 'invalid enrollment year';
    end if;
    if make_timestamptz(entry_year::integer + 3, 7, 1, 0, 0, 0, 'Asia/Jakarta') <= now() then
      raise exception 'student access expired';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists validate_litera_registration_year on auth.users;
create trigger validate_litera_registration_year before insert on auth.users
for each row execute function private.validate_student_registration_year();

create or replace function private.is_active_student()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.student_profiles
    where id = (select auth.uid()) and status = 'ACTIVE'
      and (access_expires_at is null or access_expires_at > now()));
$$;

-- Keep the registration and suspension RPCs compatible while refusing expired cohorts.
create or replace function public.review_student_registration(p_student_id uuid, p_decision text)
returns public.student_profiles language plpgsql security definer set search_path = '' as $$
declare result public.student_profiles;
begin
  if not private.is_librarian() then raise exception 'not authorized'; end if;
  if exists (select 1 from public.student_profiles where id = p_student_id and access_expires_at <= now()) then
    raise exception 'student access expired';
  end if;
  if p_decision not in ('ACTIVE', 'REJECTED') then raise exception 'invalid decision'; end if;
  update public.student_profiles
  set status = p_decision, reviewed_by = (select auth.uid()), reviewed_at = now()
  where id = p_student_id and status = 'PENDING' returning * into result;
  if result.id is null then raise exception 'registration is not pending'; end if;
  if p_decision = 'ACTIVE' then
    update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()),
      confirmation_token = '', confirmation_sent_at = null, updated_at = now() where id = result.id;
  end if;
  return result;
end;
$$;

create or replace function public.set_student_suspension(p_student_id uuid, p_suspend boolean)
returns public.student_profiles language plpgsql security definer set search_path = '' as $$
declare result public.student_profiles;
begin
  if not private.is_librarian() then raise exception 'not authorized'; end if;
  if exists (select 1 from public.student_profiles where id = p_student_id and access_expires_at <= now()) then
    raise exception 'student access expired';
  end if;
  if p_suspend is null then raise exception 'invalid suspension decision'; end if;
  update public.student_profiles
  set status = case when p_suspend then 'SUSPENDED' else 'ACTIVE' end
  where id = p_student_id and status = case when p_suspend then 'ACTIVE' else 'SUSPENDED' end
    and not exists (select 1 from public.librarian_profiles where id = p_student_id)
  returning * into result;
  if result.id is null then raise exception 'invalid suspension transition'; end if;
  return result;
end;
$$;
revoke all on function public.set_student_suspension(uuid, boolean) from public, anon;
grant execute on function public.set_student_suspension(uuid, boolean) to authenticated;

create or replace function private.cleanup_expired_students()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target record; deleted_count integer := 0; blocked_count integer := 0;
begin
  if not pg_try_advisory_xact_lock(20240701, 3) then return jsonb_build_object('skipped', true); end if;
  update public.student_profiles set status = 'EXPIRED'
  where access_expires_at <= now() and status <> 'EXPIRED'
    and not exists (select 1 from public.librarian_profiles where id = student_profiles.id);
  -- Close reservations that never consumed stock; physical loans still need receipt.
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
    where students.access_expires_at <= now()
      and not exists (select 1 from public.librarian_profiles where id = students.id)
      and not exists (select 1 from public.loans where student_id = students.id
        and status in ('PENDING', 'APPROVED', 'BORROWED', 'RETURN_REQUESTED'))
    order by students.access_expires_at, students.id limit 500 for update of students skip locked
  loop
    begin
      -- Each account is an atomic subtransaction. Any remaining FK restores its data.
      delete from public.reading_history where student_id = target.id;
      delete from public.loans where student_id = target.id;
      -- Completed loan history cascades from loans; retain unrelated actors anonymously.
      update public.loan_status_history set changed_by = null where changed_by = target.id;
      delete from auth.users where id = target.id;
      -- Auth/profile FKs cascade favorites, sessions and the student profile.
      deleted_count := deleted_count + 1;
    exception when foreign_key_violation then
      blocked_count := blocked_count + 1;
    end;
  end loop;
  return jsonb_build_object('deleted_accounts', deleted_count, 'blocked_accounts', blocked_count);
end;
$$;
revoke all on function private.cleanup_expired_students() from public, anon, authenticated, service_role;

-- One database job per day. 17:15 UTC is 00:15 WIB the following day.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('litera-cleanup-alumni', '15 17 * * *', 'select private.cleanup_expired_students();');

commit;

-- Read-only verification. No cleanup is invoked by this migration itself.
select enrollment_year, min(access_expires_at) as access_expires_at, count(*) as accounts
from public.student_profiles group by enrollment_year order by enrollment_year;
select jobname, schedule, active from cron.job where jobname = 'litera-cleanup-alumni';
