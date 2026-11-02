-- Run in Supabase SQL Editor before using suspension in Detail Siswa.
-- Additive migration: existing accounts, passwords and loans are preserved.
begin;

alter table public.student_profiles drop constraint if exists student_profiles_status_check;
alter table public.student_profiles add constraint student_profiles_status_check
  check (status in ('PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED'));

create or replace function public.set_student_suspension(p_student_id uuid, p_suspend boolean)
returns public.student_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare result public.student_profiles;
begin
  if not private.is_librarian() then raise exception 'not authorized'; end if;
  if p_suspend is null then raise exception 'invalid suspension decision'; end if;
  update public.student_profiles
  set status = case when p_suspend then 'SUSPENDED' else 'ACTIVE' end
  where id = p_student_id
    and status = case when p_suspend then 'ACTIVE' else 'SUSPENDED' end
    and not exists (select 1 from public.librarian_profiles where id = p_student_id)
  returning * into result;
  if result.id is null then raise exception 'invalid suspension transition'; end if;
  return result;
end;
$$;

revoke all on function public.set_student_suspension(uuid, boolean) from public, anon;
grant execute on function public.set_student_suspension(uuid, boolean) to authenticated;

-- Existing RLS policies use private.is_active_student(), so suspension also
-- blocks catalog, favorites and borrowing for already-issued access tokens.
commit;

-- Rollback (only if retiring this feature): first restore SUSPENDED accounts
-- with set_student_suspension(id, false), then drop the function and restore
-- the original constraint. Never delete profiles or loan history.
