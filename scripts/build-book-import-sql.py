from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "tmp" / "litera-book-collection-enriched.json"
OUTPUT = ROOT / "tmp" / "litera-book-collection-import.sql"


def main() -> None:
    rows = json.loads(INPUT.read_text(encoding="utf-8"))
    assert len(rows) == 3543
    payload = json.dumps(rows, ensure_ascii=False).replace("$litera$", "$ litera $")
    sql = f"""begin;

with source_rows as (
  select *
  from jsonb_to_recordset($litera${payload}$litera$::jsonb) as source(
    \"source file\" text, \"source sheet\" text, \"source row\" text, \"no\" text,
    \"nomor induk\" text, judul text, pengarang text, klasifikasi text, penerbit text,
    \"tahun terbit\" text, eksemplar text, sumber text, keterangan text, rak text,
    kategori text, open_library_key text, cover_url text, synopsis text, metadata_source text
  )
), prepared as (
  select
    null::text as isbn,
    trim(source.judul) as title,
    trim(coalesce(source.pengarang, '')) as authors,
    nullif(trim(source.penerbit), '') as publisher,
    case when source.\"tahun terbit\" ~ '^\\d{{4}}$'
           and source.\"tahun terbit\"::integer between 1000 and 2100
      then source.\"tahun terbit\"::smallint end as publish_year,
    categories.id as category_id,
    nullif(trim(source.synopsis), '') as synopsis,
    case when source.eksemplar ~ '^\\d+$' then source.eksemplar::integer else 0 end as total_stock,
    ''::text as shelf_location,
    nullif(trim(source.cover_url), '') as cover_url,
    nullif(trim(source.open_library_key), '') as open_library_key,
    nullif(trim(source.\"nomor induk\"), '') as inventory_number,
    nullif(trim(source.klasifikasi), '') as classification,
    nullif(trim(source.sumber), '') as acquisition_source,
    nullif(trim(source.keterangan), '') as source_note,
    source.\"source file\" as source_file,
    source.\"source sheet\" as source_sheet,
    source.\"source row\"::integer as source_row,
    jsonb_build_object(
      'sequenceNumber', nullif(source.\"no\", ''),
      'sourceCategory', nullif(source.kategori, ''),
      'sourcePublishYear', nullif(source.\"tahun terbit\", ''),
      'sourceCopies', nullif(source.eksemplar, ''),
      'metadataSource', source.metadata_source
    ) as source_data
  from source_rows as source
  left join public.categories on lower(categories.name) = lower(source.kategori)
), existing_exact as (
  select prepared.source_row
  from prepared
  where exists (
    select 1 from public.books
    where lower(trim(books.title)) = lower(trim(prepared.title))
      and lower(trim(books.authors)) = lower(trim(prepared.authors))
      and books.source_file is null
  )
), inserted as (
  insert into public.books (
    isbn, title, authors, publisher, publish_year, category_id, synopsis, total_stock, available_stock,
    shelf_location, cover_url, open_library_key, inventory_number, classification, acquisition_source,
    source_note, source_file, source_sheet, source_row, source_data
  )
  select
    isbn, title, authors, publisher, publish_year, category_id, synopsis, total_stock, total_stock,
    shelf_location, cover_url, open_library_key, inventory_number, classification, acquisition_source,
    source_note, source_file, source_sheet, source_row, source_data
  from prepared
  where not exists (select 1 from existing_exact where existing_exact.source_row = prepared.source_row)
  on conflict (source_file, source_sheet, source_row)
    where source_file is not null and source_sheet is not null and source_row is not null
  do nothing
  returning source_row
)
select
  (select count(*) from source_rows) as source_rows,
  (select count(*) from inserted) as inserted_rows,
  (select count(*) from existing_exact) as skipped_existing_duplicates;

commit;
"""
    OUTPUT.write_text(sql, encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT), "rows": len(rows), "bytes": OUTPUT.stat().st_size}))


if __name__ == "__main__":
    main()
