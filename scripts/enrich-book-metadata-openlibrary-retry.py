from __future__ import annotations

import concurrent.futures
import json
import re
import runpy
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GOOGLE = runpy.run_path(str(ROOT / "scripts" / "enrich-book-metadata-google-retry.py"))
BASE = runpy.run_path(str(ROOT / "scripts" / "enrich-book-metadata-from-web.py"))
ROWS_PATH = ROOT / "tmp" / "litera-book-collection-enriched.json"
CHECKPOINT_PATH = ROOT / "tmp" / "litera-openlibrary-retry-checkpoint.json"
REPORT_PATH = ROOT / "tmp" / "litera-openlibrary-retry-final-report.json"
HEADERS = {"Accept": "application/json", "User-Agent": "LITERA-Smart-Library (library@sman4.sch.id)"}
rate_lock = threading.Lock()
write_lock = threading.Lock()
last_request = 0.0

normalize = BASE["normalize"]
authors_match = BASE["authors_match"]
SupabaseSession = BASE["SupabaseSession"]
load_database_books = BASE["load_database_books"]
clean_synopsis = GOOGLE["clean_synopsis"]
suspicious_synopsis = GOOGLE["suspicious_synopsis"]
save_book = GOOGLE["save_book"]


def request_json(url: str, attempts: int = 3) -> dict:
    global last_request
    for attempt in range(attempts):
        try:
            with rate_lock:
                time.sleep(max(0, 0.18 - (time.monotonic() - last_request)))
                last_request = time.monotonic()
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=25) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code not in {429, 500, 502, 503, 504} or attempt == attempts - 1:
                raise
        except (TimeoutError, urllib.error.URLError):
            if attempt == attempts - 1:
                raise
        time.sleep(1.5 * (attempt + 1))
    return {}


def match_candidate(row: dict, docs: list[dict]) -> dict | None:
    wanted_title = normalize(row.get("judul"))
    ranked = []
    for doc in docs:
        title = str(doc.get("title") or "")
        found_title = normalize(title)
        exact = found_title == wanted_title
        subtitle = found_title.startswith(wanted_title + " ") or wanted_title.startswith(found_title + " ")
        if not exact and not subtitle:
            continue
        authors = ", ".join(doc.get("author_name") or [])
        author_ok = authors_match(row.get("pengarang"), authors)
        publishers = doc.get("publisher") or []
        publisher_ok = bool(row.get("penerbit") and any(normalize(row.get("penerbit")) in normalize(value) for value in publishers))
        year_ok = bool(row.get("tahun terbit") and str(row.get("tahun terbit")) == str(doc.get("first_publish_year") or ""))
        if row.get("pengarang") and not author_ok and not (exact and not authors and (publisher_ok or year_ok)):
            continue
        first_sentence = doc.get("first_sentence") or []
        if isinstance(first_sentence, str):
            first_sentence = [first_sentence]
        synopsis = clean_synopsis(" ".join(map(str, first_sentence)))
        cover_id = doc.get("cover_i")
        cover = f"https://covers.openlibrary.org/b/id/{cover_id}-L.jpg?default=false" if cover_id else ""
        score = (100 if exact else 70) + (35 if author_ok else 0) + (8 if publisher_ok else 0) + (5 if year_ok else 0) + (3 if cover else 0) + (3 if synopsis else 0)
        ranked.append((score, {"title": title, "authors": authors, "cover": cover, "synopsis": synopsis, "work_key": doc.get("key") or ""}))
    ranked.sort(key=lambda value: value[0], reverse=True)
    return dict(ranked[0][1]) if ranked else None


def candidate(row: dict) -> dict | None:
    payload = request_json("https://openlibrary.org/search.json?" + urllib.parse.urlencode({
        "title": row.get("judul") or "", "fields": "key,title,author_name,first_publish_year,publisher,cover_i,first_sentence", "limit": "20",
    }))
    book = match_candidate(row, payload.get("docs") or [])
    if not book:
        return None
    if not book["synopsis"] and str(book["work_key"]).startswith("/works/"):
        work = request_json(f"https://openlibrary.org{book['work_key']}.json")
        description = work.get("description")
        if isinstance(description, dict):
            description = description.get("value")
        book["synopsis"] = clean_synopsis(description)
    return book


def enrich(row: dict) -> dict:
    result = {"source_row": int(row["source row"]), "title": row["judul"], "authors": row.get("pengarang", ""), "cover": "", "synopsis": "", "work_key": "", "checked": True, "error": ""}
    try:
        book = candidate(row)
        if book:
            result.update({"cover": book["cover"], "synopsis": book["synopsis"], "work_key": book["work_key"]})
    except Exception as error:
        result["error"] = f"{type(error).__name__}: {error}"
    return result


def main() -> None:
    session = SupabaseSession()
    books = load_database_books(session)
    rows = {int(row["source row"]): row for row in json.loads(ROWS_PATH.read_text(encoding="utf-8"))}
    checkpoint = json.loads(CHECKPOINT_PATH.read_text(encoding="utf-8")) if CHECKPOINT_PATH.exists() else {}
    targets = [number for number, book in books.items() if number in rows and (not book.get("cover_url") or not book.get("synopsis") or suspicious_synopsis(book.get("synopsis")))]
    pending_numbers = [number for number in targets if not checkpoint.get(str(number), {}).get("checked") or checkpoint.get(str(number), {}).get("error")]
    pending_numbers.sort(reverse=True)
    print(json.dumps({"phase": "openlibrary_retry", "database_rows": len(books), "targets": len(targets), "already_checked": len(targets) - len(pending_numbers), "pending": len(pending_numbers)}), flush=True)

    completed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(enrich, rows[number]): number for number in pending_numbers}
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            with write_lock:
                checkpoint[str(result["source_row"])] = result
                completed += 1
                if completed % 25 == 0:
                    CHECKPOINT_PATH.write_text(json.dumps(checkpoint, ensure_ascii=False), encoding="utf-8")
                    print(json.dumps({"checked": completed, "matched_cover": sum(bool(item.get("cover")) for item in checkpoint.values()), "matched_synopsis": sum(bool(item.get("synopsis")) for item in checkpoint.values()), "errors": sum(bool(item.get("error")) for item in checkpoint.values())}), flush=True)
    CHECKPOINT_PATH.write_text(json.dumps(checkpoint, ensure_ascii=False), encoding="utf-8")

    updated, errors = [], []
    for number in targets:
        result = checkpoint.get(str(number), {})
        book = books[number]
        cover = result.get("cover", "") if not book.get("cover_url") else ""
        replace_synopsis = suspicious_synopsis(book.get("synopsis")) and bool(result.get("synopsis"))
        synopsis = result.get("synopsis", "") if not book.get("synopsis") or replace_synopsis else ""
        if not cover and not synopsis:
            continue
        try:
            save_book(session, book, cover=cover, synopsis=synopsis, replace_synopsis=replace_synopsis)
            if cover: book["cover_url"] = cover
            if synopsis: book["synopsis"] = synopsis
            updated.append({"source_row": number, "title": book["title"], "cover": bool(cover), "synopsis": bool(synopsis), "replaced_bad_synopsis": replace_synopsis, "work_key": result.get("work_key", "")})
        except Exception as error:
            errors.append({"source_row": number, "title": book["title"], "error": f"{type(error).__name__}: {error}"})

    remaining = []
    for number, book in books.items():
        missing = [field for field, value in (("cover", book.get("cover_url")), ("sinopsis", book.get("synopsis"))) if not value]
        bad = suspicious_synopsis(book.get("synopsis"))
        if missing or bad:
            remaining.append({"source_row": number, "title": book["title"], "authors": book["authors"], "missing": missing, "sinopsis_tidak_sesuai": bad})
    report = {"checked": len([number for number in targets if checkpoint.get(str(number), {}).get("checked")]), "updated_books": len(updated), "covers_added": sum(item["cover"] for item in updated), "synopses_added": sum(item["synopsis"] for item in updated), "bad_synopses_replaced": sum(item["replaced_bad_synopsis"] for item in updated), "updates": updated, "errors": errors, "remaining": remaining, "verification": {"database_rows": len(books), "missing_cover": sum("cover" in item["missing"] for item in remaining), "missing_synopsis": sum("sinopsis" in item["missing"] for item in remaining), "missing_both": sum(len(item["missing"]) == 2 for item in remaining), "bad_synopsis": sum(item["sinopsis_tidak_sesuai"] for item in remaining)}}
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("checked", "updated_books", "covers_added", "synopses_added", "bad_synopses_replaced", "verification")}), flush=True)


if __name__ == "__main__":
    main()
