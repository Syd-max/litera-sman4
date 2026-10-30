from __future__ import annotations

import copy
import json
import runpy
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASE = runpy.run_path(str(ROOT / "scripts" / "enrich-book-metadata-from-web.py"))
GOOGLE = runpy.run_path(str(ROOT / "scripts" / "enrich-book-metadata-google-retry.py"))
REPORT_PATH = ROOT / "tmp" / "litera-fragmented-synopsis-repair-report.json"


VERIFIED_OVERRIDES = {
    3203: {
        "isbn": "9789792267662",
        "synopsis": (
            "Di kaki Gunung Panderman, dalam rumah berukuran 6 x 7 meter, Iwan "
            "Setyawan tumbuh bersama ayahnya yang bekerja sebagai sopir angkot, "
            "ibunya yang tidak tamat sekolah dasar, dan empat saudara perempuannya. "
            "Keterbatasan membuat buku pelajaran menjadi teman bermain mereka, "
            "sementara keluarga itu mencari tambahan penghasilan dengan berjualan, "
            "mengecat boneka kayu, dan membantu pedagang di pasar. Berbekal pendidikan, "
            "kegigihan, serta cinta keluarga, anak dari Kota Batu itu akhirnya mampu "
            "mengubah nasib dan membangun karier hingga menjadi direktur di New York."
        ),
        "source": "Gramedia Pustaka Utama",
        "source_url": "https://gpu.id/book/84329/9-summers-10-autumns",
    },
}


def save(session: object, book: dict, synopsis: str | None) -> None:
    repaired = copy.deepcopy(book)
    repaired["synopsis"] = synopsis
    BASE["save_book"](session, repaired, repaired.get("cover_url") or "", synopsis or "")


def main() -> None:
    session = BASE["SupabaseSession"]()
    books = BASE["load_database_books"](session)
    replaced: list[dict] = []

    for source_row, override in VERIFIED_OVERRIDES.items():
        book = books.get(source_row)
        if not book:
            continue
        repaired = copy.deepcopy(book)
        repaired["isbn"] = override["isbn"]
        repaired["synopsis"] = override["synopsis"]
        BASE["save_book"](
            session,
            repaired,
            repaired.get("cover_url") or "",
            override["synopsis"],
        )
        books[source_row] = repaired
        replaced.append({
            "source_row": source_row,
            "title": repaired["title"],
            "source": override["source"],
            "source_url": override["source_url"],
        })

    cleared: list[dict] = []
    for book in books.values():
        if not GOOGLE["is_truncated_synopsis"](book.get("synopsis")):
            continue
        save(session, book, None)
        cleared.append({"source_row": int(book["source_row"]), "title": book["title"]})

    fresh = BASE["load_database_books"](session)
    remaining = [
        {"source_row": int(book["source_row"]), "title": book["title"]}
        for book in fresh.values()
        if GOOGLE["is_truncated_synopsis"](book.get("synopsis"))
    ]
    target = fresh.get(3203) or {}
    report = {
        "verified_replacements": replaced,
        "cleared_unverified_fragments_count": len(cleared),
        "cleared_unverified_fragments": cleared,
        "remaining_fragmented_count": len(remaining),
        "remaining_fragmented": remaining,
        "book_9_summers_10_autumns": {
            "isbn": target.get("isbn"),
            "title": target.get("title"),
            "authors": target.get("authors"),
            "synopsis": target.get("synopsis"),
            "cover_url": target.get("cover_url"),
        },
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
