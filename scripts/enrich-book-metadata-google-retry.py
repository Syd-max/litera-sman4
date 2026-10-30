from __future__ import annotations

import concurrent.futures
import html
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
CHECKPOINT_PATH = ROOT / "tmp" / "litera-google-retry-checkpoint.json"
REPORT_PATH = ROOT / "tmp" / "litera-google-retry-final-report.json"
HEADERS = {"Accept": "application/json", "User-Agent": "LITERA-Smart-Library (library@sman4.sch.id)"}
lock = threading.Lock()
rate_lock = threading.Lock()
last_request = 0.0

normalize = BASE["normalize"]
authors_match = BASE["authors_match"]
SupabaseSession = BASE["SupabaseSession"]
load_database_books = BASE["load_database_books"]

BIOGRAPHY_MARKERS = (
    "tentang penulis", "biografi penulis", "about the author", "author biography",
    "is the author of", "adalah penulis novel", "adalah seorang penulis",
)
INVALID_DESCRIPTION_MARKERS = (
    "book digitized", "digitized by", "bibliographical references", "location/holding institution",
    "front cover", "back cover",
)


def clean_synopsis(value: object) -> str:
    text = html.unescape(re.sub(r"<[^>]+>", " ", str(value or "")))
    text = re.sub(r"\s+", " ", text).strip(" .")
    lowered = text.casefold()
    if any(marker in lowered for marker in INVALID_DESCRIPTION_MARKERS):
        return ""
    if is_ocr_catalog_text(text):
        return ""
    cut_at = min((lowered.find(marker) for marker in BIOGRAPHY_MARKERS if marker in lowered), default=-1)
    if cut_at >= 0:
        text = text[:cut_at].strip(" .")
    text = re.split(
        r"\s*(?:Buku\s+persembahan\s+penerbit|Didigitalisasi\s+dan\s+didistribusikan\s+oleh)\b",
        text,
        maxsplit=1,
        flags=re.I,
    )[0].strip(" .")
    text = text.replace("\u2014", ", ").replace("\u2013", "-")
    if is_truncated_synopsis(text):
        return ""
    return text if len(text.split()) >= 12 and len(text) >= 80 else ""


def suspicious_synopsis(value: object) -> bool:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if not text:
        return False
    lowered = text.casefold()
    return (
        len(text) < 80
        or len(text.split()) < 12
        or any(marker in lowered for marker in BIOGRAPHY_MARKERS + INVALID_DESCRIPTION_MARKERS)
        or is_ocr_catalog_text(text)
        or is_truncated_synopsis(text)
        or is_metadata_synopsis(text)
    )


def is_metadata_synopsis(value: object) -> bool:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if not text:
        return False
    lowered = text.casefold()
    if len(text) <= 650 and re.search(r"\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b", text, re.I):
        return True
    if len(text) <= 650 and re.search(r"\b\d+(?:[,.]\d+)?\s*[x×]\s*\d+(?:[,.]\d+)?\s*cm\b", text, re.I):
        return True
    if re.search(r"\b(?:ibid|op\.?\s*cit|daftar pustaka)\b", lowered):
        return True
    if re.search(r"\bseminar paper\b|\bterm paper\b|\bsubject american studies\b", lowered):
        return True

    score = 0
    if re.search(r"(?:https?://|www\.)", text, re.I):
        score += 2
    if re.search(r"(?:\+?62|\(?0\d{2,3}\)?)[\s.-]?\d{5,}", text):
        score += 3
    if re.search(r"\b(?:telp\.?|telepon|fax\.?|alamat|e-?mail|jl\.?)\b", lowered):
        score += 2
    if re.search(r"\b(?:penulis|penyunting|editor|proofreader|pracetak|desain\s+(?:sampul|cover)|penata\s+letak|ilustrator)\s*[:.]", lowered):
        score += 2
    if re.search(r"\b(?:penerbit|publisher|cetakan|anggota ikapi|hak penerbitan)\b", lowered):
        score += 1
    if re.search(r"\b(?:\d+\s*(?:hlm|hal|pages?)|(?:hlm|hal)\.?\s*\d+)\b", lowered):
        score += 2
    if re.search(r"\b(?:bab|chapter)\s+[ivxlcdm\d]+\b", lowered):
        score += 1
    return len(text) <= 500 and score >= 3


def is_truncated_synopsis(value: object) -> bool:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if not text:
        return False
    first_alpha = next((char for char in text if char.isalpha()), "")
    if first_alpha and first_alpha.islower():
        return True
    if len(text) <= 320 and text[-1:] not in ".!?…\"'”’)]}":
        return True
    metadata_markers = (
        "digital publishing", "penerbit pt", "penyunting :", "penyunting:",
        "editor :", "editor:", "penulis :", "penulis:", "daftar pustaka",
        "table of contents", "contents.", "pages ;", "pages :", ". cover",
        "cover art", "desain sampul", "tata letak", "perpustakaan nasional",
    )
    if len(text) <= 320 and any(marker in text.casefold() for marker in metadata_markers):
        return True
    if len(text) <= 120 and re.fullmatch(
        r"[\w\s,.;:+\-()\[\]]*(?:pages?|volume|hlm|cm)[\w\s,.;:+\-()\[\]]*",
        text,
        flags=re.I,
    ):
        return True
    return False


def is_ocr_catalog_text(value: object) -> bool:
    text = str(value or "")
    lowered = text.casefold()
    strong_markers = (
        "isbn", "katalog dalam terbitan", "hak cipta dilindungi",
        "all rights reserved", "tanpa izin tertulis", "copyright ©",
        "didigitalisasi dan didistribusikan oleh",
    )
    if any(marker in lowered for marker in strong_markers):
        return True
    score = 0
    if re.search(r"\b(penulis|penyunting|editor)\b", lowered) and re.search(r"\b(isbn|hlm|judul|cet\.?\s*\d)\b", lowered):
        score += 2
    if re.search(r"\bI\.\s*Judul\b|\bJudul\s+II\b", text, re.I):
        score += 2
    if "e-book ini didistribusikan oleh" in lowered:
        score += 1
    if re.search(r"\b(cetakan pertama|penerbit pt)\b", lowered):
        score += 1
    if re.search(r"\b\d+\s*(?:hlm|halaman)\b", lowered) and re.search(r"\b(?:cet\.?|ed\.?|penerbit|jakarta|bandung|yogyakarta)\b", lowered):
        score += 2
    return score >= 2


def request_json(url: str, attempts: int = 3) -> dict:
    global last_request
    for attempt in range(attempts):
        try:
            with rate_lock:
                time.sleep(max(0, 0.25 - (time.monotonic() - last_request)))
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


def google_candidate(row: dict, api_key: str) -> dict | None:
    query = str(row.get("judul") or "").strip()
    payload = request_json("https://www.googleapis.com/books/v1/volumes?" + urllib.parse.urlencode({
        "q": query, "maxResults": "40", "printType": "books", "projection": "full", "key": api_key,
    }))
    wanted_title = normalize(row.get("judul"))
    ranked = []
    for item in payload.get("items") or []:
        info = item.get("volumeInfo") or {}
        title = str(info.get("title") or "")
        found_title = normalize(title)
        exact = found_title == wanted_title
        subtitle = found_title.startswith(wanted_title + " ") or wanted_title.startswith(found_title + " ")
        if not exact and not subtitle:
            continue
        authors = ", ".join(info.get("authors") or [])
        author_ok = authors_match(row.get("pengarang"), authors)
        publisher_ok = bool(row.get("penerbit") and normalize(row.get("penerbit")) in normalize(info.get("publisher")))
        year = str(info.get("publishedDate") or "")[:4]
        year_ok = bool(row.get("tahun terbit") and str(row.get("tahun terbit")) == year)
        if row.get("pengarang") and not author_ok and not (exact and not authors and (publisher_ok or year_ok)):
            continue
        images = info.get("imageLinks") or {}
        cover = images.get("extraLarge") or images.get("large") or images.get("medium") or images.get("small") or images.get("thumbnail") or images.get("smallThumbnail") or ""
        cover = cover.replace("http://", "https://").replace("&edge=curl", "")
        synopsis = clean_synopsis(info.get("description"))
        score = (100 if exact else 70) + (35 if author_ok else 0) + (8 if publisher_ok else 0) + (5 if year_ok else 0) + (3 if cover else 0) + (3 if synopsis else 0)
        ranked.append((score, {"title": title, "authors": authors, "cover": cover, "synopsis": synopsis, "google_id": item.get("id") or ""}))
    ranked.sort(key=lambda value: value[0], reverse=True)
    if not ranked:
        return None
    best = dict(ranked[0][1])
    for _, candidate in ranked[1:]:
        if normalize(candidate["title"]) != normalize(best["title"]):
            continue
        best["cover"] = best["cover"] or candidate["cover"]
        best["synopsis"] = best["synopsis"] or candidate["synopsis"]
    return best


def google_feed_candidate(row: dict) -> dict | None:
    query = str(row.get("judul") or "").strip()
    payload = request_json("https://books.google.com/books/feeds/volumes?" + urllib.parse.urlencode({
        "q": query, "alt": "json", "max-results": "40",
    }), attempts=2)
    candidates = []
    for entry in payload.get("feed", {}).get("entry") or []:
        values = lambda name: [item.get("$t", "") for item in entry.get(name) or []]
        links = entry.get("link") or []
        images = [link.get("href", "") for link in links if link.get("rel", "").endswith("/thumbnail")]
        candidates.append({
            "title": (values("dc$title") or [""])[0], "authors": ", ".join(values("dc$creator")),
            "publisher": (values("dc$publisher") or [""])[0], "year": ((values("dc$date") or [""])[0])[:4],
            "synopsis": clean_synopsis((values("dc$description") or [""])[0]),
            "cover": (images[0] if images else "").replace("http://", "https://").replace("&edge=curl", ""),
            "google_id": str((entry.get("id") or {}).get("$t") or "").rsplit("/", 1)[-1],
        })
    wanted_title = normalize(row.get("judul"))
    ranked = []
    for candidate in candidates:
        found_title = normalize(candidate["title"])
        exact = found_title == wanted_title
        subtitle = found_title.startswith(wanted_title + " ") or wanted_title.startswith(found_title + " ")
        if not exact and not subtitle:
            continue
        author_ok = authors_match(row.get("pengarang"), candidate["authors"])
        publisher_ok = bool(row.get("penerbit") and normalize(row.get("penerbit")) in normalize(candidate["publisher"]))
        year_ok = bool(row.get("tahun terbit") and str(row.get("tahun terbit")) == candidate["year"])
        if row.get("pengarang") and not author_ok and not (exact and not candidate["authors"] and (publisher_ok or year_ok)):
            continue
        score = (100 if exact else 70) + (35 if author_ok else 0) + (8 if publisher_ok else 0) + (5 if year_ok else 0) + (3 if candidate["cover"] else 0) + (3 if candidate["synopsis"] else 0)
        ranked.append((score, candidate))
    ranked.sort(key=lambda value: value[0], reverse=True)
    if not ranked:
        return None
    best = dict(ranked[0][1])
    for _, candidate in ranked[1:]:
        if normalize(candidate["title"]) == normalize(best["title"]):
            best["cover"] = best["cover"] or candidate["cover"]
            best["synopsis"] = best["synopsis"] or candidate["synopsis"]
    return best


def enrich(row: dict, api_key: str) -> dict:
    result = {"source_row": int(row["source row"]), "title": row["judul"], "authors": row.get("pengarang", ""), "cover": "", "synopsis": "", "google_id": "", "api_checked": True, "error": ""}
    try:
        candidate = google_candidate(row, api_key)
        if candidate:
            result.update({"cover": candidate["cover"], "synopsis": candidate["synopsis"], "google_id": candidate["google_id"]})
    except Exception as error:
        result["error"] = f"{type(error).__name__}: {error}"
    return result


def enrich_feed(row: dict) -> dict:
    result = {"source_row": int(row["source row"]), "title": row["judul"], "authors": row.get("pengarang", ""), "cover": "", "synopsis": "", "google_id": "", "feed_checked": True, "feed_error": ""}
    try:
        candidate = google_feed_candidate(row)
        if candidate:
            result.update({"cover": candidate["cover"], "synopsis": candidate["synopsis"], "google_id": candidate["google_id"]})
    except Exception as error:
        result["feed_error"] = f"{type(error).__name__}: {error}"
    return result


def save_book(session: object, book: dict, *, cover: str, synopsis: str, replace_synopsis: bool) -> None:
    session.api("/rest/v1/rpc/save_book_details", method="POST", body={
        "p_book_id": book["id"], "p_isbn": book["isbn"], "p_title": book["title"], "p_authors": book["authors"],
        "p_publisher": book["publisher"], "p_publish_year": book["publish_year"], "p_category_id": book["category_id"],
        "p_synopsis": synopsis if replace_synopsis else (book["synopsis"] or synopsis or None), "p_total_stock": book["total_stock"],
        "p_shelf_location": book["shelf_location"], "p_cover_url": book["cover_url"] or cover or None,
        "p_open_library_key": book["open_library_key"], "p_inventory_number": book["inventory_number"],
        "p_classification": book["classification"], "p_acquisition_source": book["acquisition_source"],
        "p_source_note": book["source_note"], "p_source_file": book["source_file"], "p_source_sheet": book["source_sheet"],
        "p_source_row": book["source_row"], "p_source_data": book["source_data"],
    })


def main() -> None:
    provider = os.environ.get("METADATA_PROVIDER", "api").strip().casefold()
    api_key = os.environ.get("GOOGLE_BOOKS_API_KEY", "").strip()
    if provider == "api" and not api_key:
        raise RuntimeError("GOOGLE_BOOKS_API_KEY belum diatur")
    session = SupabaseSession()
    books = load_database_books(session)
    source_rows = {int(row["source row"]): row for row in json.loads(ROWS_PATH.read_text(encoding="utf-8"))}
    checkpoint = json.loads(CHECKPOINT_PATH.read_text(encoding="utf-8")) if CHECKPOINT_PATH.exists() else {}
    target_numbers = [number for number, book in books.items() if number in source_rows and (not book.get("cover_url") or not book.get("synopsis") or suspicious_synopsis(book.get("synopsis")))]
    check_field, error_field = ("feed_checked", "feed_error") if provider == "feed" else ("api_checked", "error")
    pending_numbers = [number for number in target_numbers if not checkpoint.get(str(number), {}).get(check_field) or checkpoint.get(str(number), {}).get(error_field)]
    if provider == "feed":
        pending_numbers.sort(reverse=True)
    pending = [source_rows[number] for number in pending_numbers]
    print(json.dumps({"phase": f"google_{provider}_retry", "database_rows": len(books), "targets": len(target_numbers), "already_checked": len(target_numbers) - len(pending), "pending": len(pending)}), flush=True)

    completed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(enrich_feed, row) if provider == "feed" else executor.submit(enrich, row, api_key): row for row in pending}
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            with lock:
                key = str(result["source_row"])
                current = checkpoint.get(key, {})
                current.update({field: value for field, value in result.items() if field not in {"cover", "synopsis", "google_id"}})
                current["cover"] = current.get("cover") or result.get("cover", "")
                current["synopsis"] = current.get("synopsis") or result.get("synopsis", "")
                current["google_id"] = current.get("google_id") or result.get("google_id", "")
                checkpoint[key] = current
                completed += 1
                if completed % 25 == 0:
                    CHECKPOINT_PATH.write_text(json.dumps(checkpoint, ensure_ascii=False), encoding="utf-8")
                    print(json.dumps({"checked": completed, "matched_cover": sum(bool(item.get("cover")) for item in checkpoint.values()), "matched_synopsis": sum(bool(item.get("synopsis")) for item in checkpoint.values()), "errors": sum(bool(item.get(error_field)) for item in checkpoint.values())}), flush=True)
    CHECKPOINT_PATH.write_text(json.dumps(checkpoint, ensure_ascii=False), encoding="utf-8")

    updated, errors = [], []
    for number in target_numbers:
        result = checkpoint.get(str(number), {})
        book = books[number]
        cover = result.get("cover", "") if not book.get("cover_url") else ""
        replace_synopsis = suspicious_synopsis(book.get("synopsis")) and bool(result.get("synopsis"))
        synopsis = result.get("synopsis", "") if not book.get("synopsis") or replace_synopsis else ""
        if not cover and not synopsis:
            continue
        try:
            save_book(session, book, cover=cover, synopsis=synopsis, replace_synopsis=replace_synopsis)
            if cover:
                book["cover_url"] = cover
            if synopsis:
                book["synopsis"] = synopsis
            updated.append({"source_row": number, "title": book["title"], "cover": bool(cover), "synopsis": bool(synopsis), "replaced_bad_synopsis": replace_synopsis, "google_id": result.get("google_id", "")})
        except Exception as error:
            errors.append({"source_row": number, "title": book["title"], "error": f"{type(error).__name__}: {error}"})

    remaining = []
    for number, book in books.items():
        missing = [field for field, value in (("cover", book.get("cover_url")), ("sinopsis", book.get("synopsis"))) if not value]
        bad_synopsis = suspicious_synopsis(book.get("synopsis"))
        if missing or bad_synopsis:
            remaining.append({"source_row": number, "title": book["title"], "authors": book["authors"], "missing": missing, "sinopsis_tidak_sesuai": bad_synopsis, "google_error": checkpoint.get(str(number), {}).get("error", "")})
    report = {
        "checked": len([number for number in target_numbers if checkpoint.get(str(number), {}).get("api_checked")]),
        "updated_books": len(updated), "covers_added": sum(item["cover"] for item in updated), "synopses_added": sum(item["synopsis"] for item in updated),
        "bad_synopses_replaced": sum(item["replaced_bad_synopsis"] for item in updated), "updates": updated, "errors": errors, "remaining": remaining,
        "verification": {"database_rows": len(books), "missing_cover": sum("cover" in item["missing"] for item in remaining), "missing_synopsis": sum("sinopsis" in item["missing"] for item in remaining), "missing_both": sum(len(item["missing"]) == 2 for item in remaining), "bad_synopsis": sum(item["sinopsis_tidak_sesuai"] for item in remaining)},
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("checked", "updated_books", "covers_added", "synopses_added", "bad_synopses_replaced", "verification")}), flush=True)


if __name__ == "__main__":
    main()
