-- New registrations require a camera selfie. Existing accounts are preserved.
begin;
alter table public.student_profiles add column if not exists selfie_required boolean not null default false;
alter table public.student_profiles add column if not exists selfie_submitted_at timestamptz;

create table if not exists public.registration_selfies (
  id uuid primary key default gen_random_uuid(),
  student_id uuid unique references public.student_profiles(id) on delete set null,
  object_path text not null unique check (object_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'),
  state text not null default 'UPLOADING' check (state in ('UPLOADING', 'READY')),
  captured_at timestamptz,
  received_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  size_bytes integer check (size_bytes between 1 and 204800)
);
create index if not exists registration_selfies_expiry_idx on public.registration_selfies(expires_at);
alter table public.registration_selfies enable row level security;
revoke all on public.registration_selfies from public, anon, authenticated;
grant select, insert, update, delete on public.registration_selfies to service_role;
grant usage on schema public to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('registration-selfies', 'registration-selfies', false, 204800, array['image/webp'])
on conflict (id) do update set public = false, file_size_limit = 204800, allowed_mime_types = array['image/webp'];

create or replace function public.handle_new_student()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.raw_user_meta_data ->> 'registration_source' = 'LITERA_STUDENT' then
    insert into public.student_profiles (id, full_name, class_name, enrollment_year, major, email, selfie_required)
    values (new.id, trim(new.raw_user_meta_data ->> 'full_name'), trim(new.raw_user_meta_data ->> 'class_name'),
      (new.raw_user_meta_data ->> 'enrollment_year')::smallint, trim(new.raw_user_meta_data ->> 'major'), new.email, true)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.complete_registration_selfie(p_id uuid, p_student_id uuid, p_captured_at timestamptz, p_size integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) is distinct from 'service_role' then raise exception 'not authorized'; end if;
  if p_captured_at is null or abs(extract(epoch from (now() - p_captured_at))) > 300
    or p_size is null or p_size not between 1 and 204800 then raise exception 'invalid registration selfie'; end if;
  if not exists (select 1 from public.student_profiles where id = p_student_id and status = 'PENDING')
    or exists (select 1 from public.librarian_profiles where id = p_student_id) then raise exception 'not authorized'; end if;
  update public.registration_selfies
  set state = 'READY', captured_at = p_captured_at, received_at = now(), expires_at = now() + interval '7 days', size_bytes = p_size
  where id = p_id and student_id = p_student_id and state = 'UPLOADING' and expires_at > now();
  if not found then raise exception 'registration selfie is not pending'; end if;
  update public.student_profiles set selfie_submitted_at = now() where id = p_student_id;
end;
$$;
revoke all on function public.complete_registration_selfie(uuid, uuid, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.complete_registration_selfie(uuid, uuid, timestamptz, integer) to service_role;

create or replace function private.require_registration_selfie()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'PENDING' and new.status = 'ACTIVE' and new.selfie_required then
    if not exists (select 1 from public.registration_selfies
      where student_id = new.id and state = 'READY' and expires_at > now()) then
      raise exception 'registration selfie required';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists student_profiles_require_selfie on public.student_profiles;
create trigger student_profiles_require_selfie before update of status on public.student_profiles
for each row execute function private.require_registration_selfie();
commit;

select id, public, file_size_limit from storage.buckets where id = 'registration-selfies';
-- Must return public=false, file_size_limit=204800. Cleanup uses Storage API, never SQL file deletion.
