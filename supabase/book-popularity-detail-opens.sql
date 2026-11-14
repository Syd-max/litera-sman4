begin;

alter table public.book_search_stats
  add column if not exists detail_open_count bigint not null default 0 check (detail_open_count >= 0),
  add column if not exists last_detail_opened_at timestamptz;

create or replace function public.record_book_search_detail_open(p_book_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_student() then raise exception 'active student account required'; end if;

  insert into public.book_search_stats (book_id, detail_open_count, last_detail_opened_at)
  select id, 1, now()
  from public.books
  where id = p_book_id and archived_at is null
  on conflict (book_id) do update
  set detail_open_count = public.book_search_stats.detail_open_count + 1,
      last_detail_opened_at = excluded.last_detail_opened_at;
end;
$$;

revoke execute on function public.record_book_search_detail_open(uuid) from public, anon, authenticated;
grant execute on function public.record_book_search_detail_open(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
