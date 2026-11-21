-- Rating dan ulasan hanya dari siswa yang sudah selesai mengembalikan buku.
begin;
create or replace function private.review_text_allowed(p_body text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare normalized text; leet text; word text; pattern text;
begin
  if p_body is null then return false; end if;
  normalized := lower(normalize(p_body, NFKD));
  normalized := regexp_replace(normalized, U&'[\0300-\036f\200b-\200f\202a-\202e\2060-\206f\feff]', '', 'g');
  leet := translate(normalized, '013457@$!', 'oieastasi');
  -- Daftar lokal; teks siswa tidak dikirim ke layanan moderasi pihak ketiga.
  foreach word in array array['anjing','anjir','anjrit','bangsat','bajingan','goblok','tolol',
    'kontol','memek','ngentot','ngewe','jancok','jancuk','asu','perek','lonte','bokep',
    'porno','fuck','shit','bitch','asshole','motherfucker','cunt','dick','pussy'] loop
    pattern := '(^|[^a-z])' || regexp_replace(word, '(.)', '\1+[^a-z]*', 'g') || '(nya|mu|lu|ku)?([^a-z]|$)';
    if normalized ~ pattern or leet ~ pattern then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function private.review_text_allowed(text) from public, anon, authenticated;

create table if not exists public.book_reviews (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  reading_history_id uuid not null references public.reading_history(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(btrim(body)) between 1 and 250),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, book_id),
  constraint book_reviews_clean_text check (private.review_text_allowed(body))
);
create index if not exists book_reviews_book_idx on public.book_reviews(book_id, updated_at desc, id desc);
alter table public.book_reviews enable row level security;
revoke all on public.book_reviews from public, anon, authenticated;
grant select (book_id, rating, body) on public.book_reviews to authenticated;
drop policy if exists book_reviews_own on public.book_reviews;
create policy book_reviews_own on public.book_reviews for select to authenticated
  using (student_id = (select auth.uid()) and private.is_active_student());

create or replace function public.submit_book_review(p_reading_history_id uuid, p_rating integer, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare history public.reading_history; cleaned text;
begin
  if not private.is_active_student() or private.is_librarian() then
    raise exception 'review requires active student' using errcode = '42501';
  end if;
  -- Lock against account/history cleanup while verifying the confirmed return.
  select h.* into history from public.reading_history h join public.loans l on l.id = h.loan_id
    where h.id = p_reading_history_id and h.student_id = auth.uid()
      and l.student_id = auth.uid() and l.book_id = h.book_id and l.status = 'RETURNED'
      and l.returned_at is not null
    for share of h, l;
  if not found then raise exception 'review requires confirmed return' using errcode = '42501'; end if;
  cleaned := btrim(p_body);
  if p_rating is null or p_rating not between 1 and 5 or cleaned is null
    or char_length(cleaned) not between 1 and 250 or cleaned !~ '[^[:space:]]' then
    raise exception 'invalid book review' using errcode = '22023';
  end if;
  if not private.review_text_allowed(cleaned) then
    raise exception 'review contains inappropriate words' using errcode = '22023';
  end if;
  insert into public.book_reviews(student_id, book_id, reading_history_id, rating, body)
    values (auth.uid(), history.book_id, history.id, p_rating, cleaned)
    on conflict (student_id, book_id) do update set
      reading_history_id = excluded.reading_history_id, rating = excluded.rating,
      body = excluded.body, updated_at = now();
end;
$$;
revoke all on function public.submit_book_review(uuid, integer, text) from public, anon;
grant execute on function public.submit_book_review(uuid, integer, text) to authenticated;

-- Only display names and reviews are shared; emails and other profile data stay private.
create or replace function public.get_book_reviews(p_book_id uuid, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare total bigint; average numeric; reviews jsonb;
begin
  if not (private.is_active_student() or private.is_librarian()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_offset is null or p_offset < 0 then raise exception 'invalid review offset' using errcode = '22023'; end if;
  select count(*), round(avg(r.rating), 1) into total, average
    from public.book_reviews r where r.book_id = p_book_id;
  select coalesce(jsonb_agg(row_to_json(page) order by page.updated_at desc, page.id desc), '[]'::jsonb)
    into reviews from (
      select r.id, s.full_name as reviewer_name, r.rating, r.body, r.updated_at,
        r.student_id = auth.uid() as is_mine
      from public.book_reviews r join public.student_profiles s on s.id = r.student_id
      where r.book_id = p_book_id order by r.updated_at desc, r.id desc limit 10 offset p_offset
    ) page;
  return jsonb_build_object('total', total, 'average', average, 'reviews', reviews);
end;
$$;
revoke all on function public.get_book_reviews(uuid, integer) from public, anon;
grant execute on function public.get_book_reviews(uuid, integer) to authenticated;
commit;

select not has_table_privilege('authenticated', 'public.book_reviews', 'INSERT') as direct_writes_blocked,
  has_function_privilege('authenticated', 'public.submit_book_review(uuid,integer,text)', 'EXECUTE') as review_submission_ready,
  not has_function_privilege('anon', 'public.get_book_reviews(uuid,integer)', 'EXECUTE') as anonymous_access_blocked;

-- Rollback fitur tanpa menghapus data: revoke execute on function
-- public.submit_book_review(uuid,integer,text), public.get_book_reviews(uuid,integer) from authenticated;
