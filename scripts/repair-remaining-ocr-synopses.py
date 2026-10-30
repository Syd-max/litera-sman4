from __future__ import annotations

import copy
import json
import runpy
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASE = runpy.run_path(str(ROOT / "scripts" / "enrich-book-metadata-from-web.py"))
GOOGLE = runpy.run_path(str(ROOT / "scripts" / "enrich-book-metadata-google-retry.py"))
REPORT_PATH = ROOT / "tmp" / "litera-remaining-ocr-synopsis-repair-report.json"


# These summaries were manually checked against publisher, national-library,
# Google Books, author, or reputable catalogue descriptions. They intentionally
# describe book contents only and exclude front matter, author biographies, and
# promotional boilerplate.
SYNOPSIS_BY_SOURCE_ROW: dict[int, str | None] = {
    519: (
        "Buku ini membahas perjalanan manusia setelah meninggal, keadaan ruh, "
        "serta kenikmatan dan siksa yang dapat dialami di alam kubur. Uraiannya "
        "mengajak pembaca memahami tujuh malam pertama setelah kematian dan "
        "mempersiapkan diri agar memperoleh akhir kehidupan yang baik berdasarkan "
        "Al-Qur'an dan hadis."
    ),
    1317: (
        "Buku ini menghimpun pembahasan tentang perencanaan bahasa pada abad ke-21, "
        "termasuk perencanaan status dan korpus, pengembangan bahasa, pembentukan "
        "istilah, serta tantangan kebahasaan dalam situasi nasional yang terus "
        "berubah. Berbagai tulisan di dalamnya menelaah kebijakan dan langkah yang "
        "diperlukan agar bahasa tetap mampu melayani kebutuhan masyarakat modern."
    ),
    1318: (
        "Buku ini membahas upaya memperkuat kedudukan dan fungsi bahasa Indonesia "
        "di tengah globalisasi. Pembahasannya mencakup perkembangan bahasa dan "
        "sastra, peran media massa, hubungan dengan bahasa daerah, pengajaran bahasa "
        "Indonesia bagi penutur asing, serta pengaruh teknologi dan perubahan sosial "
        "terhadap penggunaan bahasa Indonesia."
    ),
    1740: (
        "Buku ini menawarkan inspirasi memadukan busana batik untuk berbagai suasana, "
        "mulai dari acara santai, semi-formal, hingga formal. Pembaca diperkenalkan "
        "pada pilihan model, warna, aksesori, dan cara menata penampilan agar kain "
        "batik dapat digunakan secara praktis, serasi, dan tetap menarik."
    ),
    1927: (
        "Buku panduan menggambar ini mengajarkan dasar ilustrasi dengan pensil secara "
        "bertahap. Materinya mencakup bentuk wajah dan tubuh, anatomi, proporsi, "
        "ekspresi, pencahayaan, arsiran, dan perspektif, sehingga pembaca dapat "
        "mengembangkan karakter serta gambar yang lebih hidup dan meyakinkan."
    ),
    2013: (
        "Buku ini memperkenalkan proses membatik secara mudah dan bertahap, mulai "
        "dari mengenali alat dan bahan, membuat pola, mencanting, memberi warna, "
        "hingga melorod kain. Contoh proyek dan petunjuk praktisnya membantu pembaca "
        "mempelajari teknik dasar batik serta menghasilkan karya sendiri."
    ),
    2377: (
        "Berdasarkan kisah nyata, novel ini mengikuti perjalanan Surya, pemuda "
        "Indonesia yang mencoba menaklukkan Amerika pada 1998 sebagai pendatang "
        "tanpa dokumen. Di tengah kerasnya hidup, pekerjaan, dan persoalan hukum, ia "
        "berusaha bertahan sekaligus mengejar harapan yang membawanya jauh dari rumah."
    ),
    2407: (
        "Lengkara tidak pernah diberi kekuatan untuk melawan segala masalah yang "
        "menimpanya. Ia hanya mampu mengubur penderitaan seorang diri, terutama "
        "setelah Masnaka, kekasih yang menjadi tempatnya bersandar, pergi meninggalkan "
        "dirinya demi Nilam. Tepat pukul 00.00, Lengkara harus menentukan pilihan "
        "antara menyerah pada kematian atau bangkit untuk membalas luka yang diterimanya."
    ),
    2434: (
        "Jumena Martawangsa adalah pengusaha pabrik yang berhasil mengumpulkan harta, "
        "tetapi kekayaan tidak menghapus kesepian dan ketakutannya terhadap kematian. "
        "Perkawinannya dengan Euis yang jauh lebih muda, ketiadaan keturunan, serta "
        "kecurigaan akan pengkhianatan membuat hidupnya terasa seperti sumur tanpa "
        "dasar yang tidak pernah dapat dipenuhi."
    ),
    2720: (
        "Asnah dan Asri tumbuh bersama dalam lingkungan adat Minangkabau dan diam-diam "
        "menyimpan perasaan satu sama lain. Karena ikatan keluarga dan tuntutan adat, "
        "Asri memilih menikahi Saniah. Pilihan itu membawa pertentangan, penderitaan, "
        "dan penyesalan yang membuat mereka harus menghadapi akibat dari keputusan yang salah."
    ),
    # No reliable public plot description was found for this exact V. Lestari title.
    # Clearing the OCR front matter is safer than inventing a story summary.
    2783: None,
    2906: (
        "Audy kembali ke rumah keluarga 4R dan menjalani hari-hari yang tidak pernah "
        "benar-benar tenang. Ia mulai dianggap sebagai bagian dari keluarga, lalu "
        "seseorang menyatakan perasaannya. Ketika sebuah kejadian tak terduga muncul, "
        "kehidupan Audy dan para penghuni rumah itu kembali menjadi semakin rumit."
    ),
    3012: (
        "Rasmani dan Masrul bersahabat sejak kecil dan tumbuh dengan perasaan cinta "
        "yang tidak mudah mereka ungkapkan. Keadaan memisahkan keduanya dan membawa "
        "Masrul menempuh jalan hidup lain. Ketika ia kembali, penantian Rasmani telah "
        "berakhir dalam kematian, menyisakan penyesalan atas cinta yang tidak beruntung."
    ),
    3105: (
        "Shalom kehilangan Harmein, tunangannya, menjelang hari pernikahan mereka. "
        "Rasa bersalah membuatnya terus menyimpan telepon dan cincin sebagai kenangan, "
        "sementara peristiwa berbahaya memaksanya meninggalkan kota. Di tempat baru, "
        "Shalom berusaha memahami kematian Harmein dan melepaskan masa lalu yang terus membayanginya."
    ),
    3181: (
        "Modernisasi membuat banyak hantu kehilangan rumah mereka. Keluarga Humphrey "
        "pun terpaksa mencari tempat tinggal baru dan bertemu Rick di Norton Castle "
        "School. Bersama-sama mereka menjalankan operasi penyelamatan agar para hantu "
        "yang terusir dapat memperoleh perlindungan dan tempat yang aman."
    ),
    3431: (
        "Buku ini merupakan kumpulan cerpen pilihan yang pernah terbit di Kompas "
        "sepanjang tahun 2000. Cerita-cerita di dalamnya menghadirkan beragam tokoh, "
        "konflik keluarga, persoalan sosial, dan potret kehidupan masyarakat Indonesia "
        "melalui gaya penceritaan para pengarang yang berbeda."
    ),
    3435: (
        "Jumena Martawangsa adalah pengusaha pabrik yang berhasil mengumpulkan harta, "
        "tetapi kekayaan tidak menghapus kesepian dan ketakutannya terhadap kematian. "
        "Perkawinannya dengan Euis yang jauh lebih muda, ketiadaan keturunan, serta "
        "kecurigaan akan pengkhianatan membuat hidupnya terasa seperti sumur tanpa "
        "dasar yang tidak pernah dapat dipenuhi."
    ),
    3437: (
        "Tujuh cerita dalam buku ini menggambarkan kehidupan orang-orang di Bloomington, "
        "Indiana. Melalui para perantau, tetangga, dan individu yang kesepian, Budi Darma "
        "menelusuri pertemuan manusia yang canggung, prasangka, keterasingan, dan dorongan "
        "tersembunyi dalam keseharian yang tampak biasa."
    ),
    3469: (
        "Kumpulan tiga belas cerita dan prosa ini menyoroti kesedihan, keputusasaan, "
        "ingatan, dan luka yang kerap tersembunyi dalam kehidupan sehari-hari. Sejumlah "
        "kisahnya menghadirkan persoalan perempuan, ketidakadilan, kekerasan, dan tekanan "
        "patriarki melalui tokoh-tokoh yang berusaha bertahan dalam keadaan yang gelap."
    ),
}


def normalize_punctuation(value: str | None) -> str | None:
    if value is None:
        return None
    return value.replace("\u2014", ", ").replace("\u2013", "-").strip()


def main() -> None:
    session = BASE["SupabaseSession"]()
    books = BASE["load_database_books"](session)
    updated: list[dict] = []
    missing_rows: list[int] = []

    for source_row, synopsis in SYNOPSIS_BY_SOURCE_ROW.items():
        book = books.get(source_row)
        if not book:
            missing_rows.append(source_row)
            continue
        repaired = copy.deepcopy(book)
        clean_value = normalize_punctuation(synopsis)
        repaired["synopsis"] = clean_value
        BASE["save_book"](
            session,
            repaired,
            repaired.get("cover_url") or "",
            clean_value or "",
        )
        updated.append({
            "source_row": source_row,
            "title": repaired["title"],
            "synopsis_status": "replaced" if clean_value else "cleared_unverified",
        })

    fresh = BASE["load_database_books"](session)
    remaining_bad = [
        {
            "source_row": int(book["source_row"]),
            "title": book["title"],
            "synopsis": book.get("synopsis"),
        }
        for book in fresh.values()
        if GOOGLE["suspicious_synopsis"](book.get("synopsis"))
    ]
    exact = fresh.get(2407) or {}
    report = {
        "updated_count": len(updated),
        "replaced_count": sum(item["synopsis_status"] == "replaced" for item in updated),
        "cleared_unverified_count": sum(item["synopsis_status"] == "cleared_unverified" for item in updated),
        "updated": updated,
        "missing_source_rows": missing_rows,
        "remaining_suspicious_count": len(remaining_bad),
        "remaining_suspicious": remaining_bad,
        "book_00_00": {
            "title": exact.get("title"),
            "authors": exact.get("authors"),
            "synopsis": exact.get("synopsis"),
        },
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
