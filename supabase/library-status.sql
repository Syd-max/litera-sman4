-- Status layanan fisik bersama. Jalankan satu kali di SQL Editor.
begin;
create table if not exists public.library_status (
  id integer primary key default 1 check (id = 1),
  is_open boolean,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.librarian_profiles(id)
);
insert into public.library_status (id) values (1) on conflict (id) do nothing;
alter table public.library_status enable row level security;
revoke all on public.library_status from public, anon, authenticated;
grant select on public.library_status to authenticated;
drop policy if exists library_status_read on public.library_status;
create policy library_status_read on public.library_status for select to authenticated using (true);

create or replace function public.set_library_open(p_is_open boolean)
returns public.library_status language plpgsql security definer set search_path = '' as $$
declare result public.library_status;
begin
  if not private.is_librarian() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_is_open is null then raise exception 'status is required' using errcode = '22023'; end if;
  update public.library_status set is_open = p_is_open, updated_at = now(), updated_by = auth.uid()
  where id = 1 returning * into result;
  if not found then raise exception 'library status is missing'; end if;
  return result;
end;
$$;
revoke all on function public.set_library_open(boolean) from public, anon;
grant execute on function public.set_library_open(boolean) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'library_status') then
    alter publication supabase_realtime add table public.library_status;
  end if;
end $$;
commit;

select id, is_open,
  has_table_privilege('authenticated', 'public.library_status', 'SELECT') as users_can_read,
  not has_table_privilege('authenticated', 'public.library_status', 'UPDATE') as direct_changes_blocked
from public.library_status;
