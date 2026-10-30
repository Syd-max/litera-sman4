import concurrent.futures
import json
import runpy
import time
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
base = runpy.run_path(str(ROOT / "scripts" / "enrich-book-metadata-from-web.py"))
secondary = runpy.run_path(str(ROOT / "scripts" / "enrich-book-metadata-secondary.py"))
ROWS_PATH = ROOT / "tmp" / "litera-book-collection-enriched.json"
CHECKPOINT_PATH = ROOT / "tmp" / "litera-archive-retry-checkpoint.json"
REPORT_PATH = ROOT / "tmp" / "litera-archive-retry-final-report.json"
HEADERS = {"Accept": "application/json", "User-Agent": "LITERA-Smart-Library (library@sman4.sch.id)"}


def request_json(url):
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=25) as response:
        return json.load(response)


def title_matches(wanted, found):
    wanted = base["normalize"](wanted)
    found = base["normalize"](found)
    if not wanted or not found:
        return False
    return wanted == found or (len(wanted) >= 12 and (found.startswith(wanted + " ") or wanted.startswith(found + " ")))


def search_archive(row):
    query = f'title:"{row["judul"]}" AND mediatype:texts'
    parameters = [
        ("q", query),
        ("fl[]", "identifier"),
        ("fl[]", "title"),
        ("fl[]", "creator"),
        ("fl[]", "description"),
        ("rows", "30"),
        ("page", "1"),
        ("output", "json"),
    ]
    url = "https://archive.org/advancedsearch.php?" + urllib.parse.urlencode(parameters)
    try:
        payload = request_json(url)
    except Exception as error:
        return {"source_row": int(row["source row"]), "status": "error", "error": f"{type(error).__name__}: {error}"}

    matches = []
    for item in payload.get("response", {}).get("docs") or []:
        if not title_matches(row["judul"], item.get("title")):
            continue
        creator = item.get("creator") or ""
        if isinstance(creator, list):
            creator = ", ".join(map(str, creator))
        if row.get("pengarang") and not base["authors_match"](row["pengarang"], creator):
            continue
        identifier = str(item.get("identifier") or "")
        description = secondary["archive_description"](item.get("description"))
        matches.append({
            "identifier": identifier,
            "title": item.get("title") or "",
            "creator": creator,
            "cover": f"https://archive.org/services/img/{urllib.parse.quote(identifier)}" if identifier else "",
            "synopsis": description,
        })
    matches.sort(key=lambda item: (bool(item["synopsis"]), len(item["synopsis"]), bool(item["cover"])), reverse=True)
    if not matches:
        return {"source_row": int(row["source row"]), "status": "not_found"}
    return {"source_row": int(row["source row"]), "status": "matched", **matches[0]}


def main():
    session = base["SupabaseSession"]()
    books = base["load_database_books"](session)
    rows = {int(row["source row"]): row for row in json.loads(ROWS_PATH.read_text(encoding="utf-8"))}
    checkpoint = json.loads(CHECKPOINT_PATH.read_text(encoding="utf-8")) if CHECKPOINT_PATH.exists() else {}
    targets = [
        rows[number]
        for number, book in books.items()
        if number in rows
        and (not book.get("cover_url") or not book.get("synopsis"))
        and secondary["likely_public_catalog"](rows[number])
    ]
    pending = [row for row in targets if str(row["source row"]) not in checkpoint]
    print(json.dumps({"phase": "archive_retry", "targets": len(targets), "pending": len(pending)}), flush=True)

    completed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(search_archive, row): row for row in pending}
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            checkpoint[str(result["source_row"])] = result
            completed += 1
            if completed % 20 == 0:
                CHECKPOINT_PATH.write_text(json.dumps(checkpoint, ensure_ascii=False), encoding="utf-8")
                print(json.dumps({"checked": len(checkpoint), "matched": sum(item.get("status") == "matched" for item in checkpoint.values())}), flush=True)
    CHECKPOINT_PATH.write_text(json.dumps(checkpoint, ensure_ascii=False), encoding="utf-8")

    updates = []
    books = base["load_database_books"](session)
    for key, result in checkpoint.items():
        source_row = int(key)
        book = books.get(source_row)
        if not book or result.get("status") != "matched":
            continue
        cover = result.get("cover") if not book.get("cover_url") else ""
        synopsis = result.get("synopsis") if not book.get("synopsis") else ""
        if not cover and not synopsis:
            continue
        base["save_book"](session, book, cover or "", synopsis or "")
        updates.append({"source_row": source_row, "title": book["title"], "cover": bool(cover), "synopsis": bool(synopsis)})

    fresh = base["load_database_books"](session)
    report = {
        "checked": len(checkpoint),
        "matched": sum(item.get("status") == "matched" for item in checkpoint.values()),
        "updated_books": len(updates),
        "covers_added": sum(item["cover"] for item in updates),
        "synopses_added": sum(item["synopsis"] for item in updates),
        "updates": updates,
        "verification": {
            "database_rows": len(fresh),
            "missing_cover": sum(not book.get("cover_url") for book in fresh.values()),
            "missing_synopsis": sum(not book.get("synopsis") for book in fresh.values()),
            "missing_both": sum(not book.get("cover_url") and not book.get("synopsis") for book in fresh.values()),
        },
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
