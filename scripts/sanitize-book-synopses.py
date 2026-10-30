from __future__ import annotations

import copy
import json
import re
import runpy
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASE = runpy.run_path(str(ROOT / "scripts" / "enrich-book-metadata-from-web.py"))
GOOGLE = runpy.run_path(str(ROOT / "scripts" / "enrich-book-metadata-google-retry.py"))
REPORT_PATH = ROOT / "tmp" / "litera-synopsis-sanitization-report.json"


def clean_valid_synopsis(value: str) -> str:
    text = re.split(
        r"\s*(?:Buku\s+persembahan\s+penerbit|Didigitalisasi\s+dan\s+didistribusikan\s+oleh)\b",
        value,
        maxsplit=1,
        flags=re.I,
    )[0]
    text = re.split(
        r"-{3,}\s*(?:Also contained in|Books?\s+in\s+the\s+.+?\s+series|#{1,6}\s*[A-Za-z-]+-language description)",
        text,
        maxsplit=1,
        flags=re.I,
    )[0]
    text = re.split(r"\s+\[[0-9]+\]:\s*https?://", text, maxsplit=1, flags=re.I)[0]
    text = re.sub(r"\(\s*(?:Source|Sumber)\s*:\s*\[[^\]]+\]\(https?://[^)]+\)\s*\)", "", text, flags=re.I)
    text = re.sub(r"\[([^\]]+)\]\(https?://[^)]+\)", r"\1", text)
    text = text.replace("**", "")
    text = text.replace("\u2014", ", ").replace("\u2013", "-")
    return re.sub(r"\s+", " ", text).strip()


def main() -> None:
    session = BASE["SupabaseSession"]()
    books = BASE["load_database_books"](session)
    cleared: list[dict] = []
    normalized: list[dict] = []

    for book in books.values():
        original = str(book.get("synopsis") or "").strip()
        if not original:
            continue
        if GOOGLE["suspicious_synopsis"](original):
            repaired = copy.deepcopy(book)
            repaired["synopsis"] = None
            BASE["save_book"](session, repaired, repaired.get("cover_url") or "", "")
            cleared.append({"source_row": int(book["source_row"]), "title": book["title"]})
            continue

        cleaned = clean_valid_synopsis(original)
        if cleaned == original:
            continue
        repaired = copy.deepcopy(book)
        repaired["synopsis"] = cleaned or None
        BASE["save_book"](session, repaired, repaired.get("cover_url") or "", cleaned)
        normalized.append({"source_row": int(book["source_row"]), "title": book["title"]})

    fresh = BASE["load_database_books"](session)
    synopsis_count = sum(bool(str(book.get("synopsis") or "").strip()) for book in fresh.values())
    remaining = [
        {"source_row": int(book["source_row"]), "title": book["title"]}
        for book in fresh.values()
        if GOOGLE["suspicious_synopsis"](book.get("synopsis"))
    ]
    dash_rows = [
        {"source_row": int(book["source_row"]), "title": book["title"]}
        for book in fresh.values()
        if any(mark in str(book.get("synopsis") or "") for mark in ("\u2014", "\u2013"))
    ]
    report = {
        "total_books": len(fresh),
        "synopsis_count": synopsis_count,
        "missing_synopsis_count": len(fresh) - synopsis_count,
        "cleared_unverified_count": len(cleared),
        "cleared_unverified": cleared,
        "normalized_count": len(normalized),
        "normalized": normalized,
        "remaining_suspicious_count": len(remaining),
        "remaining_suspicious": remaining,
        "remaining_dash_count": len(dash_rows),
        "remaining_dash": dash_rows,
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
