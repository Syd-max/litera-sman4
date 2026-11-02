-- Run once in the Supabase SQL Editor. Safe to run again.
-- First: Authentication > Sign In / Providers > Email > Confirm email OFF.
-- Keep the Email provider and email/password sign-in enabled.
-- No passwords, profile statuses, loan data, or RLS policies are changed here.
begin;

create or replace function public.review_student_registration(p_student_id uuid, p_decision text)
returns public.student_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare result public.student_profiles;
begin
  if not private.is_librarian() then raise exception 'not authorized'; end if;
  if p_decision not in ('ACTIVE', 'REJECTED') then raise exception 'invalid decision'; end if;
  update public.student_profiles
  set status = p_decision, reviewed_by = (select auth.uid()), reviewed_at = now()
  where id = p_student_id and status = 'PENDING'
  returning * into result;
  if result.id is null then raise exception 'registration is not pending'; end if;
  if p_decision = 'ACTIVE' then
    update auth.users
    set email_confirmed_at = coalesce(email_confirmed_at, now()),
        confirmation_token = '', confirmation_sent_at = null, updated_at = now()
    where id = result.id;
  end if;
  return result;
end;
$$;

-- Existing approved students should not have to register again or receive mail.
update auth.users as users
set email_confirmed_at = now(), confirmation_token = '',
    confirmation_sent_at = null, updated_at = now()
from public.student_profiles as students
where students.id = users.id
  and students.status = 'ACTIVE'
  and users.email_confirmed_at is null;

commit;

-- This must return 0. Pending/rejected students are intentionally not migrated.
select count(*) as approved_students_still_unconfirmed
from auth.users as users
join public.student_profiles as students on students.id = users.id
where students.status = 'ACTIVE' and users.email_confirmed_at is null;
