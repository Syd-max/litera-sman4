from __future__ import annotations

import concurrent.futures
import json
import os
import re
import runpy
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASE = runpy.run_path(str(ROOT / "scripts" / "enrich-book-metadata-from-web.py"))
ROWS_PATH = ROOT / "tmp" / "litera-book-collection-enriched.json"
CHECKPOINT_PATH = ROOT / "tmp" / "litera-secondary-metadata-checkpoint.json"
REPORT_PATH = ROOT / "tmp" / "litera-secondary-metadata-final-report.json"
HEADERS = {"Accept": "application/json", "User-Agent": "LITERA-Smart-Library (library@sman4.sch.id)"}
lock = threading.Lock()
google_feed_lock = threading.Lock()
google_feed_last_request = 0.0

normalize = BASE["normalize"]
authors_match = BASE["authors_match"]
clean_description = BASE["clean_description"]
select_google = BASE["select_google"]
SupabaseSession = BASE["SupabaseSession"]
load_database_books = BASE["load_database_books"]
save_book = BASE["save_book"]


def request_json(url: str, *, timeout: int = 25, attempts: int = 3) -> dict:
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code not in {429, 500, 502, 503, 504} or attempt == attempts - 1:
                raise
        except (TimeoutError, urllib.error.URLError):
            if attempt == attempts - 1:
                raise
        time.sleep(1.5 * (attempt + 1))
    return {}


def google_candidate(row: dict, api_key: str) -> dict | None:
    author = str(row.get("pengarang") or "").replace("<", "").replace(">", "").strip()
    query = f'"{row["judul"]}"' + (f' "{author}"' if author else "")
    url = "https://www.googleapis.com/books/v1/volumes?" + urllib.parse.urlencode({
        "q": query, "maxResults": "40", "printType": "books", "projection": "full", "key": api_key,
    })
    payload = request_json(url)
    candidates = []
    for item in payload.get("items") or []:
        info = item.get("volumeInfo") or {}
        images = info.get("imageLinks") or {}
        candidates.append({
            "title": info.get("title") or "",
            "authors": ", ".join(info.get("authors") or []),
            "publisher": info.get("publisher") or "",
            "year": str(info.get("publishedDate") or "")[:4],
            "description": clean_description(info.get("description") or ""),
            "cover": (images.get("extraLarge") or images.get("large") or images.get("medium") or images.get("thumbnail") or "").replace("http://", "https://"),
            "identifiers": [entry.get("identifier", "") for entry in info.get("industryIdentifiers") or []],
        })
    return select_google(row, candidates)


def google_feed_candidate(row: dict) -> dict | None:
    global google_feed_last_request
    author = str(row.get("pengarang") or "").replace("<", "").replace(">", "").strip()
    query = f'"{row["judul"]}"' + (f' "{author}"' if author else "")
    url = "https://books.google.com/books/feeds/volumes?" + urllib.parse.urlencode({
        "q": query, "alt": "json", "max-results": "20",
    })
    with google_feed_lock:
        time.sleep(max(0, 0.3 - (time.monotonic() - google_feed_last_request)))
        google_feed_last_request = time.monotonic()
    payload = request_json(url, timeout=15, attempts=2)
    candidates = []
    for entry in payload.get("feed", {}).get("entry") or []:
        values = lambda name: [item.get("$t", "") for item in entry.get(name) or []]
        links = entry.get("link") or []
        images = [link.get("href", "") for link in links if link.get("rel", "").endswith("/thumbnail")]
        identifiers = [value.removeprefix("ISBN:") for value in values("dc$identifier") if value.startswith("ISBN:")]
        description = clean_description((values("dc$description") or [""])[0])
        candidates.append({
            "title": (values("dc$title") or [""])[0],
            "authors": ", ".join(values("dc$creator")),
            "publisher": (values("dc$publisher") or [""])[0],
            "year": ((values("dc$date") or [""])[0])[:4],
            "description": description,
            "cover": (images[0] if images else "").replace("http://", "https://").replace("&edge=curl", ""),
            "identifiers": identifiers,
        })
    book = select_google(row, candidates)
    if book and "front cover" in book.get("description", "").casefold():
        book["description"] = ""
    return book


def archive_description(value: object) -> str:
    if isinstance(value, list):
        value = " ".join(map(str, value))
    text = clean_description(str(value or ""))
    lowered = text.casefold()
    blocked = ("location/holding institution", "digitized by", "book digitized", "bibliographical references")
    return "" if any(marker in lowered for marker in blocked) or len(text.split()) < 20 else text


def archive_candidate(row: dict) -> dict | None:
    query = f'title:"{row["judul"]}" AND mediatype:texts'
    url = "https://archive.org/services/search/v1/scrape?" + urllib.parse.urlencode({
        "q": query, "fields": "identifier,title,creator,description", "count": "100",
    })
    payload = request_json(url, timeout=8, attempts=1)
    matches = []
    wanted = normalize(row["judul"])
    for item in payload.get("items") or []:
        title = str(item.get("title") or "")
        found = normalize(title)
        if found != wanted and not found.startswith(wanted + " "):
            continue
        creator = item.get("creator") or ""
        if isinstance(creator, list):
            creator = ", ".join(creator)
        if row.get("pengarang") and not authors_match(row["pengarang"], creator):
            continue
        identifier = item.get("identifier") or ""
        matches.append({
            "cover": f"https://archive.org/services/img/{urllib.parse.quote(identifier)}" if identifier else "",
            "synopsis": archive_description(item.get("description")),
        })
    matches.sort(key=lambda item: bool(item["cover"]) + bool(item["synopsis"]), reverse=True)
    return matches[0] if matches else None


def gutendex_candidate(row: dict) -> dict | None:
    query = f'{row["judul"]} {row.get("pengarang") or ""}'.strip()
    payload = request_json("https://gutendex.com/books?" + urllib.parse.urlencode({"search": query}), timeout=4, attempts=1)
    matches = []
    for item in payload.get("results") or []:
        if normalize(item.get("title")) != normalize(row["judul"]):
            continue
        authors = ", ".join(author.get("name", "") for author in item.get("authors") or [])
        if row.get("pengarang") and not authors_match(row["pengarang"], authors):
            continue
        matches.append({"cover": (item.get("formats") or {}).get("image/jpeg") or ""})
    return matches[0] if len(matches) == 1 else None


def gutendex_is_available() -> bool:
    try:
        return bool(request_json("https://gutendex.com/books?search=Oliver%20Twist%20Dickens", timeout=4, attempts=1).get("results"))
    except Exception:
        return False


def google_is_available(api_key: str) -> bool:
    try:
        request_json("https://www.googleapis.com/books/v1/volumes?" + urllib.parse.urlencode({"q": "library", "maxResults": "1", "key": api_key}), timeout=10, attempts=1)
        return True
    except Exception:
        return False


def likely_public_catalog(row: dict) -> bool:
    title = str(row.get("judul") or "")
    old_edition = str(row.get("tahun terbit") or "").isdigit() and int(row["tahun terbit"]) <= 1950
    english_title = bool(re.search(r"\b(the|of|and|an|to|in|on|for|with|my|your)\b", title.casefold()))
    return old_edition or english_title


def enrich(row: dict, api_key: str, use_google: bool, use_gutendex: bool) -> dict:
    result = {"source_row": int(row["source row"]), "title": row["judul"], "cover": "", "synopsis": "", "sources": [], "errors": [], "feed_checked": False}
    if use_google:
        try:
            book = google_candidate(row, api_key)
            if book:
                result["cover"], result["synopsis"] = book.get("cover", ""), book.get("description", "")
                result["sources"].append("Google Books API")
        except Exception as error:
            result["errors"].append(f"Google Books: {type(error).__name__}: {error}")
    if not result["cover"] or not result["synopsis"]:
        try:
            book = google_feed_candidate(row)
            if book:
                result["cover"] = result["cover"] or book.get("cover", "")
                result["synopsis"] = result["synopsis"] or book.get("description", "")
                result["sources"].append("Google Books Feed")
        except Exception as error:
            result["errors"].append(f"Google Books Feed: {type(error).__name__}: {error}")
        result["feed_checked"] = True
    if (not result["cover"] or not result["synopsis"]) and likely_public_catalog(row):
        try:
            book = archive_candidate(row)
            if book:
                result["cover"] = result["cover"] or book.get("cover", "")
                result["synopsis"] = result["synopsis"] or book.get("synopsis", "")
                result["sources"].append("Internet Archive")
        except Exception as error:
            result["errors"].append(f"Internet Archive: {type(error).__name__}: {error}")
    if use_gutendex and not result["cover"] and likely_public_catalog(row):
        try:
            book = gutendex_candidate(row)
            if book:
                result["cover"] = book["cover"]
                result["sources"].append("Gutendex")
        except Exception as error:
            result["errors"].append(f"Gutendex: {type(error).__name__}: {error}")
    return result


def main() -> None:
    api_key = os.environ.get("GOOGLE_BOOKS_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GOOGLE_BOOKS_API_KEY belum diatur")

    session = SupabaseSession()
    books = load_database_books(session)
    rows = {int(row["source row"]): row for row in json.loads(ROWS_PATH.read_text(encoding="utf-8"))}
    checkpoint = json.loads(CHECKPOINT_PATH.read_text(encoding="utf-8")) if CHECKPOINT_PATH.exists() else {}
    targets = [rows[number] for number, book in books.items() if number in rows and (not book.get("cover_url") or not book.get("synopsis"))]
    pending = [row for row in targets if not checkpoint.get(str(row["source row"]), {}).get("feed_checked")]
    use_google = google_is_available(api_key)
    use_gutendex = gutendex_is_available()
    print(json.dumps({"phase": "secondary_sources", "targets": len(targets), "pending": len(pending), "google_available": use_google, "gutendex_available": use_gutendex}), flush=True)

    completed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(enrich, row, api_key, use_google, use_gutendex): row for row in pending}
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            with lock:
                checkpoint[str(result["source_row"])] = result
                completed += 1
                if completed % 20 == 0:
                    CHECKPOINT_PATH.write_text(json.dumps(checkpoint, ensure_ascii=False), encoding="utf-8")
                    print(json.dumps({"checked": len(checkpoint), "matched": sum(bool(item.get("cover") or item.get("synopsis")) for item in checkpoint.values())}), flush=True)
    CHECKPOINT_PATH.write_text(json.dumps(checkpoint, ensure_ascii=False), encoding="utf-8")

    updated, errors = [], []
    for result in checkpoint.values():
        book = books.get(int(result["source_row"]))
        if not book:
            continue
        cover = result.get("cover", "") if not book.get("cover_url") else ""
        synopsis = result.get("synopsis", "") if not book.get("synopsis") else ""
        if not cover and not synopsis:
            continue
        try:
            save_book(session, book, cover, synopsis)
            book["cover_url"] = book.get("cover_url") or cover
            book["synopsis"] = book.get("synopsis") or synopsis
            updated.append({"source_row": result["source_row"], "title": result["title"], "cover": bool(cover), "synopsis": bool(synopsis), "sources": result["sources"]})
        except Exception as error:
            errors.append({"source_row": result["source_row"], "title": result["title"], "error": str(error)})

    remaining = []
    for number, book in books.items():
        missing = [field for field, value in (("cover", book.get("cover_url")), ("sinopsis", book.get("synopsis"))) if not value]
        if missing:
            remaining.append({"source_row": number, "title": book["title"], "authors": book["authors"], "missing": missing})
    matched_candidates = [result for result in checkpoint.values() if result.get("cover") or result.get("synopsis")]
    report = {
        "checked": len(checkpoint), "google_available": use_google, "gutendex_available": use_gutendex,
        "matched_candidates": len(matched_candidates),
        "candidate_sources": sorted({source for result in matched_candidates for source in result.get("sources", [])}),
        "updated_books": len(updated), "covers_added": sum(item["cover"] for item in updated), "synopses_added": sum(item["synopsis"] for item in updated),
        "updates": updated, "errors": errors, "remaining": remaining,
        "verification": {"database_rows": len(books), "missing_cover": sum("cover" in item["missing"] for item in remaining), "missing_synopsis": sum("sinopsis" in item["missing"] for item in remaining), "missing_both": sum(len(item["missing"]) == 2 for item in remaining)},
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("checked", "google_available", "gutendex_available", "updated_books", "covers_added", "synopses_added", "verification")}), flush=True)


if __name__ == "__main__":
    main()
