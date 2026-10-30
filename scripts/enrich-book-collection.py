from __future__ import annotations

import csv
import json
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "tmp" / "litera-book-collection-import.tsv"
OUTPUT = ROOT / "tmp" / "litera-book-collection-enriched.json"
REPORT = ROOT / "tmp" / "litera-open-library-report.json"
HEADERS = {"Accept": "application/json", "User-Agent": "LITERA-Smart-Library (library@sman4.sch.id)"}
MIN_INTERVAL = 0.36
last_request = 0.0


def normalize(value: object) -> str:
    plain = unicodedata.normalize("NFKD", str(value or ""))
    plain = "".join(char for char in plain if not unicodedata.combining(char)).casefold()
    return re.sub(r"[^\w]+", " ", plain).strip()


def author_forms(value: object) -> set[str]:
    plain = str(value or "").replace("<", "").replace(">", "").strip()
    forms = {normalize(plain)} if plain else set()
    if "," in plain:
        last, *first = [part.strip() for part in plain.split(",") if part.strip()]
        if last and first:
            forms.add(normalize(f"{' '.join(first)} {last}"))
    return forms


def request_json(url: str) -> dict:
    global last_request
    time.sleep(max(0, MIN_INTERVAL - (time.monotonic() - last_request)))
    request = urllib.request.Request(url, headers=HEADERS)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                last_request = time.monotonic()
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code != 429 or attempt == 3:
                raise
            time.sleep(2 ** attempt)
    return {}


def select_match(results: list[dict], row: dict[str, str]) -> dict | None:
    matches = [book for book in results if normalize(book.get("title")) == normalize(row["judul"])]
    if row["pengarang"]:
        requested = author_forms(row["pengarang"])
        matches = [
            book for book in matches
            if any(form in requested for form in author_forms(", ".join(book.get("author_name") or [])))
        ]
    if len(matches) == 1:
        match = matches[0]
        if not row["pengarang"]:
            comparable = []
            if row["penerbit"] and match.get("publisher"):
                comparable.append(normalize(row["penerbit"]) in {normalize(value) for value in match["publisher"]})
            if row["tahun terbit"] and match.get("first_publish_year"):
                comparable.append(row["tahun terbit"] == str(match["first_publish_year"]))
            if comparable and not any(comparable):
                return None
        return match
    return None


def search(row: dict[str, str]) -> dict | None:
    params = {
        "title": row["judul"],
        "fields": "key,title,author_name,first_publish_year,publisher,cover_i,isbn",
        "limit": "10",
        "lang": "id",
    }
    if row["pengarang"]:
        params["author"] = row["pengarang"].replace("<", "").replace(">", "")
    payload = request_json(f"https://openlibrary.org/search.json?{urllib.parse.urlencode(params)}")
    return select_match(payload.get("docs") or [], row)


def main() -> None:
    with INPUT.open(encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle, delimiter="\t"))

    matched = []
    unmatched = []
    conflicts = []
    for row in rows:
        needs_lookup = not row["pengarang"] or not row["penerbit"] or not row["tahun terbit"]
        row["open_library_key"] = ""
        row["cover_url"] = ""
        row["synopsis"] = ""
        row["metadata_source"] = "excel"
        if not needs_lookup:
            continue
        try:
            book = search(row)
        except Exception as error:
            unmatched.append({"row": int(row["source row"]), "title": row["judul"], "reason": str(error)})
            continue
        if not book:
            unmatched.append({"row": int(row["source row"]), "title": row["judul"], "reason": "no strict match"})
            continue

        authors = ", ".join(book.get("author_name") or [])
        publisher = (book.get("publisher") or [""])[0]
        year = str(book.get("first_publish_year") or "")
        for field, excel_value, library_value in [
            ("pengarang", row["pengarang"], authors),
            ("penerbit", row["penerbit"], publisher),
            ("tahun terbit", row["tahun terbit"], year),
        ]:
            if excel_value and library_value and normalize(excel_value) != normalize(library_value):
                conflicts.append({
                    "row": int(row["source row"]), "title": row["judul"], "field": field,
                    "excel": excel_value, "open_library": library_value,
                })

        row["pengarang"] = row["pengarang"] or authors
        row["penerbit"] = row["penerbit"] or publisher
        row["tahun terbit"] = row["tahun terbit"] or year
        row["open_library_key"] = book.get("key") or ""
        if book.get("cover_i"):
            row["cover_url"] = f"https://covers.openlibrary.org/b/id/{book['cover_i']}-M.jpg?default=false"
        if row["open_library_key"].startswith("/works/"):
            try:
                work = request_json(f"https://openlibrary.org{row['open_library_key']}.json")
                description = work.get("description")
                row["synopsis"] = description if isinstance(description, str) else (description or {}).get("value", "")
            except Exception:
                pass
        row["metadata_source"] = "open_library"
        matched.append({"row": int(row["source row"]), "title": row["judul"], "key": row["open_library_key"]})

    OUTPUT.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    REPORT.write_text(json.dumps({
        "searched": len(matched) + len(unmatched), "matched": matched, "unmatched": unmatched,
        "conflicts": conflicts, "excel_only": len(rows) - len(matched),
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"rows": len(rows), "searched": len(matched) + len(unmatched), "matched": len(matched), "unmatched": len(unmatched), "conflicts": len(conflicts)}))


if __name__ == "__main__":
    main()
