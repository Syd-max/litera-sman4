-- Server-only password reset target checks. Does not change any account or password.
begin;
grant usage on schema public to service_role;
grant select (id) on public.student_profiles, public.librarian_profiles to service_role;
commit;

-- Both results must be true. RLS and authenticated/anonymous permissions are unchanged.
select
  has_column_privilege('service_role', 'public.student_profiles', 'id', 'SELECT') as can_check_students,
  has_column_privilege('service_role', 'public.librarian_profiles', 'id', 'SELECT') as can_protect_librarian_accounts;
