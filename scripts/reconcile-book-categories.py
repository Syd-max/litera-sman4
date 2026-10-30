from __future__ import annotations

import argparse
import concurrent.futures
import csv
import json
import re
import runpy
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tmp" / "litera-book-collection-import.tsv"
ROLLBACK = ROOT / "tmp" / "litera-book-category-rollback.json"
HELPERS = runpy.run_path(str(ROOT / "scripts" / "enrich-book-metadata-from-web.py"))
SupabaseSession = HELPERS["SupabaseSession"]
load_database_books = HELPERS["load_database_books"]
save_book = HELPERS["save_book"]
FICTION_CLASSIFICATION = re.compile(r"^8[1-9]3(?:\D|$)")


def source_rows() -> dict[int, dict[str, str]]:
    with SOURCE.open(encoding="utf-8-sig", newline="") as handle:
        rows = {int(row["source row"]): row for row in csv.DictReader(handle, dialect="excel-tab")}
    assert len(rows) == 3543
    return rows


def desired_category(row: dict[str, str]) -> str:
    classification = row["klasifikasi"].strip()
    if row["kategori"] == "Literatur" and FICTION_CLASSIFICATION.match(classification):
        return "Fiksi"
    return row["kategori"]


def update_books(session, changes: list[dict], key: str, books: dict[int, dict]) -> None:
    def update(change: dict) -> None:
        book = books[change["source_row"]].copy()
        book["category_id"] = change[key]
        save_book(session, book, "", "")

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(update, changes))


def main() -> None:
    assert desired_category({"kategori": "Literatur", "klasifikasi": "813 TER b"}) == "Fiksi"
    assert desired_category({"kategori": "Literatur", "klasifikasi": "811 CHA p"}) == "Literatur"
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--rollback", action="store_true")
    args = parser.parse_args()
    if args.apply and args.rollback:
        parser.error("Pilih --apply atau --rollback")

    session = SupabaseSession()
    categories = session.api("/rest/v1/categories?select=id,name,slug")
    category_ids = {item["name"]: item["id"] for item in categories}

    if args.rollback:
        changes = json.loads(ROLLBACK.read_text(encoding="utf-8"))["changes"]
        update_books(session, changes, "before_category_id", load_database_books(session))
        print(json.dumps({"rolled_back": len(changes)}))
        return

    rows = source_rows()
    books = load_database_books(session)
    missing_categories = sorted({desired_category(rows[number]) for number in books} - category_ids.keys())
    if missing_categories:
        raise RuntimeError(f"Kategori tujuan belum ada: {missing_categories}")

    changes = []
    for number, book in books.items():
        wanted = desired_category(rows[number])
        wanted_id = category_ids[wanted]
        if book["category_id"] != wanted_id:
            changes.append({
                "id": book["id"], "source_row": number, "title": book["title"],
                "classification": rows[number]["klasifikasi"], "source_category": rows[number]["kategori"],
                "before_category_id": book["category_id"], "after_category_id": wanted_id,
                "after_category": wanted,
            })

    summary = {
        "database_books": len(books),
        "source_categories": dict(Counter(rows[number]["kategori"] for number in books)),
        "desired_categories": dict(Counter(desired_category(rows[number]) for number in books)),
        "changes": len(changes),
        "fiction_changes": sum(change["after_category"] == "Fiksi" for change in changes),
    }
    if args.apply and changes:
        ROLLBACK.write_text(json.dumps({"summary": summary, "changes": changes}, ensure_ascii=False, indent=2), encoding="utf-8")
        update_books(session, changes, "after_category_id", books)
        refreshed = load_database_books(session)
        mismatches = [number for number, book in refreshed.items() if book["category_id"] != category_ids[desired_category(rows[number])]]
        if mismatches:
            raise RuntimeError(f"Verifikasi gagal untuk {len(mismatches)} buku")
        summary["verified_books"] = len(refreshed)
        summary["remaining_mismatches"] = 0
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
