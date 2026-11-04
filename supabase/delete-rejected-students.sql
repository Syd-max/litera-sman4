-- Adds an admin-only deletion function. Running this file does not delete accounts.
begin;
create or replace function public.delete_rejected_student_account(p_student_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.student_profiles; photos jsonb;
begin
  select * into target from public.student_profiles where id = p_student_id for update;
  if found then
    if target.status <> 'REJECTED' then raise exception 'student is not rejected'; end if;
    if exists (select 1 from public.librarian_profiles where id = p_student_id) then
      raise exception 'cannot delete librarian';
    end if;
    if exists (select 1 from public.loans where student_id = p_student_id
      and status in ('PENDING', 'APPROVED', 'BORROWED', 'RETURN_REQUESTED')) then
      raise exception 'student has active loans';
    end if;
    -- Keep the file cleanup queue until Storage confirms binary deletion.
    update public.registration_selfies set expires_at = least(expires_at, now()) where student_id = p_student_id;
    delete from public.reading_history where student_id = p_student_id;
    delete from public.loans where student_id = p_student_id;
    update public.loan_status_history set changed_by = null where changed_by = p_student_id;
    delete from auth.users where id = p_student_id;
    -- Auth/profile FKs cascade sessions, identities, favorites, and the profile.
  end if;
  -- Idempotent retry can finish an orphaned photo after the account was deleted.
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'object_path', object_path)), '[]'::jsonb)
  into photos from public.registration_selfies
  where student_id is null and object_path like p_student_id::text || '/%';
  return jsonb_build_object('photos', photos);
end;
$$;
revoke all on function public.delete_rejected_student_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_rejected_student_account(uuid) to service_role;
commit;

select has_function_privilege('service_role', 'public.delete_rejected_student_account(uuid)', 'execute') as server_can_delete,
  not has_function_privilege('authenticated', 'public.delete_rejected_student_account(uuid)', 'execute') as browser_cannot_delete;
-- Rollback (disables this feature, does not restore accounts already deleted):
-- drop function public.delete_rejected_student_account(uuid);
