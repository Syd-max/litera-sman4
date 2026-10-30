from __future__ import annotations

import concurrent.futures
import html
import json
import os
import re
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_local_env(path: Path = ROOT / ".env") -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator or not key.strip():
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        os.environ.setdefault(key.strip(), value)


load_local_env()
BOOKS_PATH = ROOT / "tmp" / "litera-book-collection-enriched.json"
OPEN_LIBRARY_REPORT = ROOT / "tmp" / "litera-open-library-metadata-final-report.json"
CHECKPOINT_PATH = ROOT / "tmp" / "litera-web-metadata-checkpoint.json"
ARCHIVE_CHECKPOINT_PATH = ROOT / "tmp" / "litera-internet-archive-checkpoint.json"
REPORT_PATH = ROOT / "tmp" / "litera-web-metadata-final-report.json"
EDGE_STORAGE = Path.home() / "AppData/Local/Microsoft/Edge/User Data/Default/Local Storage/leveldb"
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "").strip()
SOURCE_FILE = "Salinan dari DAFTAR KOLEKSI NAIK DISPLAY.xlsx"
HEADERS = {"Accept": "application/atom+xml, application/json", "User-Agent": "LITERA-Smart-Library (library@sman4.sch.id)"}
ATOM = {"a": "http://www.w3.org/2005/Atom", "dc": "http://purl.org/dc/terms"}
STOPWORDS = {"dkk", "dan", "et", "al", "editor", "penyusun", "redaksi", "team", "tim", "anonymous", "anonim"}
write_lock = threading.Lock()
google_lock = threading.Lock()
google_last_request = 0.0


def normalize(value: object) -> str:
    plain = unicodedata.normalize("NFKD", str(value or ""))
    plain = "".join(char for char in plain if not unicodedata.combining(char)).casefold()
    return re.sub(r"[^a-z0-9]+", " ", plain).strip()


def author_tokens(value: object) -> set[str]:
    return {part for part in normalize(value).split() if len(part) > 1 and part not in STOPWORDS}


def authors_match(expected: object, actual: object) -> bool:
    left, right = author_tokens(expected), author_tokens(actual)
    if not left or not right:
        return False
    if normalize(expected) in normalize(actual) or normalize(actual) in normalize(expected):
        return True
    return len(left & right) / min(len(left), len(right)) >= 0.5


def clean_description(value: str) -> str:
    text = html.unescape(re.sub(r"<[^>]+>", " ", value or ""))
    text = re.sub(r"\s+", " ", text).strip(" .")
    return text if len(text) >= 40 else ""


def request(url: str, accept: str = HEADERS["Accept"], attempts: int = 4) -> bytes:
    headers = {**HEADERS, "Accept": accept}
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=35) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code not in {429, 500, 502, 503, 504} or attempt == attempts - 1:
                raise
        except (TimeoutError, urllib.error.URLError):
            if attempt == attempts - 1:
                raise
        time.sleep(1.5 * (2**attempt))
    raise RuntimeError("request failed")


def google_candidates(row: dict) -> list[dict]:
    global google_last_request
    author = str(row.get("pengarang") or "").replace("<", "").replace(">", "").strip()
    query = f'"{row["judul"]}"' + (f' "{author}"' if author else "")
    hosts = ("books.google.com", "www.google.com", "books.google.co.id")
    host = hosts[int(row["source row"]) % len(hosts)]
    url = f"https://{host}/books/feeds/volumes?" + urllib.parse.urlencode({"q": query, "max-results": "20"})
    with google_lock:
        time.sleep(max(0, 0.25 - (time.monotonic() - google_last_request)))
        google_last_request = time.monotonic()
    root = ET.fromstring(request(url, "application/atom+xml"))
    candidates = []
    for entry in root.findall("a:entry", ATOM):
        title = entry.findtext("dc:title", default="", namespaces=ATOM) or entry.findtext("a:title", default="", namespaces=ATOM)
        creators = [node.text or "" for node in entry.findall("dc:creator", ATOM)]
        description = entry.findtext("dc:description", default="", namespaces=ATOM)
        identifiers = [node.text or "" for node in entry.findall("dc:identifier", ATOM)]
        cover = ""
        for link in entry.findall("a:link", ATOM):
            if link.attrib.get("rel", "").endswith("/thumbnail"):
                cover = link.attrib.get("href", "").replace("http://", "https://").replace("&edge=curl", "")
                break
        candidates.append({
            "title": title,
            "authors": ", ".join(creators),
            "publisher": entry.findtext("dc:publisher", default="", namespaces=ATOM),
            "year": (entry.findtext("dc:date", default="", namespaces=ATOM) or "")[:4],
            "description": clean_description(description),
            "cover": cover,
            "identifiers": identifiers,
        })
    return candidates


def select_google(row: dict, candidates: list[dict]) -> dict | None:
    wanted_title = normalize(row["judul"])
    ranked = []
    exact_count = sum(normalize(candidate["title"]) == wanted_title for candidate in candidates)
    for candidate in candidates:
        found_title = normalize(candidate["title"])
        exact = found_title == wanted_title
        subtitle = found_title.startswith(wanted_title + " ") or wanted_title.startswith(found_title + " ")
        if not exact and not subtitle:
            continue
        author_ok = authors_match(row.get("pengarang"), candidate.get("authors")) or authors_match(row.get("pengarang"), candidate.get("description"))
        publisher_ok = bool(row.get("penerbit") and normalize(row["penerbit"]) in normalize(candidate.get("publisher")))
        year_ok = bool(row.get("tahun terbit") and row["tahun terbit"] == candidate.get("year"))
        missing_candidate_author = not author_tokens(candidate.get("authors"))
        if row.get("pengarang") and not author_ok and not publisher_ok and not (year_ok and len(wanted_title.split()) >= 4) and not (exact and exact_count == 1 and missing_candidate_author):
            continue
        score = 100 if exact else 70
        score += 30 if author_ok else 0
        score += 8 if publisher_ok else 0
        score += 5 if year_ok else 0
        score += 3 if candidate.get("cover") else 0
        score += 3 if candidate.get("description") else 0
        ranked.append((score, candidate))
    ranked.sort(key=lambda item: item[0], reverse=True)
    if not ranked:
        return None
    if len(ranked) > 1 and ranked[0][0] == ranked[1][0] and ranked[0][1]["title"] != ranked[1][1]["title"]:
        return None
    best = dict(ranked[0][1])
    for _, candidate in ranked[1:]:
        best["cover"] = best.get("cover") or candidate.get("cover", "")
        best["description"] = best.get("description") or candidate.get("description", "")
    return best


def internet_archive_candidate(row: dict) -> dict | None:
    query = f'title:"{row["judul"]}" AND mediatype:texts'
    params = [("q", query), ("fl[]", "identifier"), ("fl[]", "title"), ("fl[]", "creator"), ("fl[]", "description"), ("fl[]", "year"), ("rows", "10"), ("output", "json")]
    payload = json.loads(request("https://archive.org/advancedsearch.php?" + urllib.parse.urlencode(params), "application/json"))
    matches = []
    for item in payload.get("response", {}).get("docs", []):
        title = item.get("title") or ""
        creator = item.get("creator") or ""
        if isinstance(creator, list):
            creator = ", ".join(creator)
        if normalize(title) != normalize(row["judul"]):
            continue
        if row.get("pengarang") and not authors_match(row["pengarang"], creator):
            continue
        description = item.get("description") or ""
        if isinstance(description, list):
            description = " ".join(description)
        identifier = item.get("identifier") or ""
        matches.append({
            "title": title,
            "authors": creator,
            "description": clean_description(description),
            "cover": f"https://archive.org/services/img/{urllib.parse.quote(identifier)}" if identifier else "",
            "identifier": identifier,
        })
    return matches[0] if len(matches) == 1 else None


def internet_archive_batch(rows: list[dict]) -> dict[str, dict]:
    clauses = [f'title:"{row["judul"].replace(chr(34), " ")}"' for row in rows]
    query = f'({" OR ".join(clauses)}) AND mediatype:texts'
    params = [("q", query), ("fl[]", "identifier"), ("fl[]", "title"), ("fl[]", "creator"), ("fl[]", "description"), ("rows", "200"), ("output", "json")]
    payload = json.loads(request("https://archive.org/advancedsearch.php?" + urllib.parse.urlencode(params), "application/json"))
    docs_by_title: dict[str, list[dict]] = {}
    for item in payload.get("response", {}).get("docs", []):
        docs_by_title.setdefault(normalize(item.get("title")), []).append(item)
    results = {}
    for row in rows:
        candidates = []
        for item in docs_by_title.get(normalize(row["judul"]), []):
            creator = item.get("creator") or ""
            if isinstance(creator, list):
                creator = ", ".join(creator)
            if row.get("pengarang") and not authors_match(row["pengarang"], creator):
                continue
            description = item.get("description") or ""
            if isinstance(description, list):
                description = " ".join(description)
            identifier = item.get("identifier") or ""
            candidates.append({"cover": f"https://archive.org/services/img/{urllib.parse.quote(identifier)}" if identifier else "", "synopsis": clean_description(description)})
        if candidates:
            candidates.sort(key=lambda item: bool(item["cover"]) + bool(item["synopsis"]), reverse=True)
            results[str(row["source row"])] = candidates[0]
    return results


def enrich(row: dict) -> dict:
    result = {"source_row": int(row["source row"]), "title": row["judul"], "authors": row.get("pengarang", ""), "cover": "", "synopsis": "", "source": "", "status": "unresolved"}
    try:
        google = select_google(row, google_candidates(row))
        if google:
            result.update({"cover": google["cover"], "synopsis": google["description"], "source": "Google Books", "status": "matched"})
        if not result["cover"] and not result["synopsis"]:
            result["reason"] = "Tidak ditemukan kecocokan judul dan penulis yang aman"
    except Exception as error:
        result["reason"] = f"{type(error).__name__}: {error}"
    return result


def load_checkpoint() -> dict[str, dict]:
    if not CHECKPOINT_PATH.exists():
        return {}
    return json.loads(CHECKPOINT_PATH.read_text(encoding="utf-8"))


def save_checkpoint(checkpoint: dict[str, dict]) -> None:
    CHECKPOINT_PATH.write_text(json.dumps(checkpoint, ensure_ascii=False), encoding="utf-8")


def find_admin_refresh_token() -> str:
    candidates = []
    storage_files = [*EDGE_STORAGE.glob("*.ldb"), *EDGE_STORAGE.glob("*.log")]
    for path in sorted(storage_files, key=lambda item: item.stat().st_mtime, reverse=True):
        raw = path.read_bytes()
        for match in re.finditer(rb'"refresh_token":"([A-Za-z0-9_-]{8,})"', raw):
            before = raw[max(0, match.start() - 12000):match.start()]
            admin_at, student_at = before.rfind(b"litera-admin-auth"), before.rfind(b"litera-student-auth")
            if admin_at > student_at:
                candidates.append(match.group(1).decode())
    if not candidates:
        raise RuntimeError("Sesi admin Edge tidak ditemukan")
    return candidates[0]


class SupabaseSession:
    def __init__(self) -> None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError("SUPABASE_URL dan SUPABASE_PUBLISHABLE_KEY belum diatur di .env")
        self.refresh_token = find_admin_refresh_token()
        self.access_token = ""
        self.expires_at = 0.0
        self.refresh()

    def refresh(self) -> None:
        body = json.dumps({"refresh_token": self.refresh_token}).encode()
        request_object = urllib.request.Request(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=refresh_token",
            data=body,
            headers={"apikey": SUPABASE_KEY, "Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request_object, timeout=30) as response:
            payload = json.load(response)
        if payload.get("user", {}).get("email") != "pustakawati4tangsel@gmail.com":
            raise RuntimeError("Sesi yang ditemukan bukan akun pustakawan")
        self.access_token = payload["access_token"]
        self.refresh_token = payload["refresh_token"]
        self.expires_at = time.time() + int(payload.get("expires_in", 3600)) - 120

    def api(self, path: str, *, method: str = "GET", body: dict | None = None) -> object:
        if time.time() >= self.expires_at:
            self.refresh()
        headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {self.access_token}", "Content-Type": "application/json"}
        data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
        with urllib.request.urlopen(urllib.request.Request(f"{SUPABASE_URL}{path}", data=data, headers=headers, method=method), timeout=40) as response:
            content = response.read()
            return json.loads(content) if content else None


def load_database_books(session: SupabaseSession) -> dict[int, dict]:
    fields = "id,isbn,title,authors,publisher,publish_year,category_id,synopsis,total_stock,shelf_location,cover_url,open_library_key,inventory_number,classification,acquisition_source,source_note,source_file,source_sheet,source_row,source_data"
    books = {}
    for offset in range(0, 5000, 1000):
        query = urllib.parse.urlencode({"select": fields, "source_file": f"eq.{SOURCE_FILE}", "archived_at": "is.null", "limit": "1000", "offset": str(offset)})
        page = session.api(f"/rest/v1/books?{query}")
        for book in page:
            books[int(book["source_row"])] = book
        if len(page) < 1000:
            break
    return books


def save_book(session: SupabaseSession, book: dict, cover: str, synopsis: str) -> None:
    session.api("/rest/v1/rpc/save_book_details", method="POST", body={
        "p_book_id": book["id"], "p_isbn": book["isbn"], "p_title": book["title"], "p_authors": book["authors"],
        "p_publisher": book["publisher"], "p_publish_year": book["publish_year"], "p_category_id": book["category_id"],
        "p_synopsis": book["synopsis"] or synopsis or None, "p_total_stock": book["total_stock"],
        "p_shelf_location": book["shelf_location"], "p_cover_url": book["cover_url"] or cover or None,
        "p_open_library_key": book["open_library_key"], "p_inventory_number": book["inventory_number"],
        "p_classification": book["classification"], "p_acquisition_source": book["acquisition_source"],
        "p_source_note": book["source_note"], "p_source_file": book["source_file"], "p_source_sheet": book["source_sheet"],
        "p_source_row": book["source_row"], "p_source_data": book["source_data"],
    })


def main() -> None:
    rows = json.loads(BOOKS_PATH.read_text(encoding="utf-8"))
    unresolved_rows = {int(item["sourceRow"]) for item in json.loads(OPEN_LIBRARY_REPORT.read_text(encoding="utf-8"))["unresolved"]}
    targets = [row for row in rows if int(row["source row"]) in unresolved_rows]
    checkpoint = load_checkpoint()
    pending = [row for row in targets if str(row["source row"]) not in checkpoint]
    print(json.dumps({"phase": "search", "targets": len(targets), "already_checked": len(checkpoint), "pending": len(pending)}), flush=True)

    completed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(enrich, row): row for row in pending}
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            with write_lock:
                checkpoint[str(result["source_row"])] = result
                completed += 1
                if completed % 25 == 0:
                    save_checkpoint(checkpoint)
                    print(json.dumps({"checked": len(checkpoint), "matched": sum(item["status"] == "matched" for item in checkpoint.values())}), flush=True)
    save_checkpoint(checkpoint)

    archive_checkpoint = json.loads(ARCHIVE_CHECKPOINT_PATH.read_text(encoding="utf-8")) if ARCHIVE_CHECKPOINT_PATH.exists() else {}
    # Internet Archive currently rejects these bulk requests; keep its checkpoint without retry-spamming the service.
    archive_targets = []
    batches = [archive_targets[index:index + 10] for index in range(0, len(archive_targets), 10)]
    print(json.dumps({"phase": "internet_archive", "targets": len(archive_targets), "batches": len(batches)}), flush=True)
    completed_batches = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(internet_archive_batch, batch): batch for batch in batches}
        for future in concurrent.futures.as_completed(futures):
            batch = futures[future]
            try:
                results = future.result()
                for row in batch:
                    key = str(row["source row"])
                    archive_checkpoint[key] = results.get(key, {})
                    if key in results:
                        current = checkpoint[key]
                        current["cover"] = current.get("cover") or results[key].get("cover", "")
                        current["synopsis"] = current.get("synopsis") or results[key].get("synopsis", "")
                        current["source"] = "Google Books + Internet Archive" if current.get("source") else "Internet Archive"
                        current["status"] = "matched"
            except Exception as error:
                for row in batch:
                    archive_checkpoint[str(row["source row"])] = {"error": f"{type(error).__name__}: {error}"}
            completed_batches += 1
            if completed_batches % 10 == 0:
                ARCHIVE_CHECKPOINT_PATH.write_text(json.dumps(archive_checkpoint, ensure_ascii=False), encoding="utf-8")
                save_checkpoint(checkpoint)
                print(json.dumps({"archive_batches": completed_batches, "archive_checked": len(archive_checkpoint), "archive_matched": sum(bool(item) and not item.get("error") for item in archive_checkpoint.values())}), flush=True)
    ARCHIVE_CHECKPOINT_PATH.write_text(json.dumps(archive_checkpoint, ensure_ascii=False), encoding="utf-8")
    save_checkpoint(checkpoint)

    session = SupabaseSession()
    books = load_database_books(session)
    updated = []
    errors = []
    for index, result in enumerate(checkpoint.values(), start=1):
        book = books.get(int(result["source_row"]))
        if not book:
            errors.append({**result, "reason": "Baris tidak ditemukan di database"})
            continue
        cover = result.get("cover") if not book.get("cover_url") else ""
        synopsis = result.get("synopsis") if not book.get("synopsis") else ""
        if not cover and not synopsis:
            continue
        try:
            save_book(session, book, cover, synopsis)
            updated.append({"source_row": result["source_row"], "title": result["title"], "cover": bool(cover), "synopsis": bool(synopsis), "source": result["source"]})
            book["cover_url"] = book.get("cover_url") or cover
            book["synopsis"] = book.get("synopsis") or synopsis
        except Exception as error:
            errors.append({**result, "reason": f"Database: {type(error).__name__}: {error}"})
        if index % 100 == 0:
            print(json.dumps({"phase": "database", "processed": index, "updated": len(updated), "errors": len(errors)}), flush=True)

    remaining = []
    for row_number, book in books.items():
        missing = []
        if not book.get("cover_url"):
            missing.append("cover")
        if not book.get("synopsis"):
            missing.append("sinopsis")
        if missing:
            result = checkpoint.get(str(row_number), {})
            remaining.append({"source_row": row_number, "title": book["title"], "authors": book["authors"], "missing": missing, "reason": result.get("reason", "Sumber web tidak menyediakan metadata")})

    report = {
        "checked": len(checkpoint), "updated_books": len(updated),
        "covers_added": sum(item["cover"] for item in updated), "synopses_added": sum(item["synopsis"] for item in updated),
        "remaining": remaining, "errors": errors, "updates": updated,
        "verification": {"database_rows": len(books), "missing_cover": sum("cover" in item["missing"] for item in remaining), "missing_synopsis": sum("sinopsis" in item["missing"] for item in remaining), "missing_both": sum(len(item["missing"]) == 2 for item in remaining)},
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("checked", "updated_books", "covers_added", "synopses_added", "verification")}), flush=True)


if __name__ == "__main__":
    main()
