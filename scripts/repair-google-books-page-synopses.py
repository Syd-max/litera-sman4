import concurrent.futures
import copy
import html
import json
import re
import runpy
import urllib.request


base = runpy.run_path("scripts/enrich-book-metadata-from-web.py")
google = runpy.run_path("scripts/enrich-book-metadata-google-retry.py")


OVERRIDES = {
    203: "Buku ini membahas pengolahan gambar hitam putih menggunakan Photoshop, termasuk teknik memperbaiki gambar yang terlalu gelap atau terlalu terang.",
    335: "Buku ini mengajarkan cara mengubah perselisihan dan konflik menjadi kesempatan untuk bertumbuh, berbelas kasih, dan berdamai. Melalui meditasi singkat, Thich Nhat Hanh membahas akar kemarahan, frustrasi, keputusasaan, dan persepsi keliru agar pembaca dapat merawat penderitaan serta membangun rekonsiliasi.",
    2168: "Kaneki mulai menerima jati dirinya sebagai ghoul dan kembali berhadapan dengan Touka serta Ayato. Masa lalu kedua saudara itu mengungkap keluarga yang tercerai-berai. Pada saat yang sama, Ghoul Bermata Satu menyerang pasukan penyelidik anti-ghoul dan memunculkan senjata-senjata mengerikan yang menyimpan misteri baru.",
    2169: "Kaneki dan CCG memiliki tujuan yang sama, yaitu menemukan Dokter Kano dan mengungkap alasan sang dokter mencampurkan unsur manusia dengan ghoul. Penyelidikan itu membawa mereka kepada eksperimen yang menciptakan makhluk kuat seperti Kaneki serta dua saudari kembar yang melindungi Kano.",
    2120: "Misi Gojo dan Geto untuk melindungi Wadah Plasma Bintang berantakan setelah Fushiguro, seorang pembunuh penyihir, menyerang. Kekalahan yang mereka alami menjadi titik penting yang membawa Gojo menuju puncak kekuatannya sekaligus memicu perubahan besar dalam diri Geto.",
    2219: "Jim, pemuda miskin yang mencintai Nayla, harus kehilangan gadis itu karena hubungan mereka ditentang oleh perbedaan status. Dalam dukanya, Jim bertemu Sang Penandai dan bergabung dengan pelayaran menuju Tanah Harapan. Perjalanan penuh bahaya itu perlahan mengajarinya berdamai dengan masa lalu serta memahami harga dari sebuah kepercayaan.",
    2500: "Setelah ayah tirinya meninggal, Zara dikirim untuk tinggal bersama neneknya di Maine. Ia merasa tidak sedang terancam, sampai seorang laki-laki menyeramkan terus muncul dan mengikutinya. Sosok itu ternyata pixie berbahaya, dan makhluk-makhluk ganjil di kota tersebut menginginkan sesuatu dari Zara.",
    2914: "Novel ini menceritakan kembali hubungan Dilan dan Milea dari sudut pandang Dilan. Setelah kematian Akew, Milea meminta Dilan menjauh dari geng motor karena takut akan keselamatannya. Gertakan untuk berpisah berubah menjadi perpisahan panjang, sementara Dilan mengenang kembali kisah mereka sampai keduanya tumbuh dewasa.",
    3311: "Dalam Heart of Darkness, Charles Marlow menceritakan pengalamannya sebagai kapten kapal sungai di Kongo Belgia dan pertemuannya dengan Kurtz, pedagang gading yang membangun kekuasaan menakutkan. Edisi ini juga memuat Youth serta The End of the Tether, dua cerita tentang perjalanan hidup, ambisi, dan kemerosotan nasib.",
    3411: "Mahendra, dosen sekaligus arkeolog dari Yogyakarta, pergi ke Banuaha di pedalaman Nias dan berusaha menjadi bagian dari masyarakat setempat. Perjalanannya mempertemukan pengetahuan akademis dengan adat, upacara, mitos, dan kehidupan masyarakat Nias, sekaligus membawa persoalan cinta serta pengalaman mistis.",
    3067: "Aaron adalah putra seorang manusia dan malaikat yang dipilih untuk menebus para malaikat jatuh. Ketika perang antara Surga dan Neraka semakin sengit, ia harus menguasai kekuatan besar dalam dirinya untuk menyelamatkan dirinya, orang yang dicintainya, dan dunia dari kekuatan jahat yang terus bertambah kuat.",
    2165: "Ken Kaneki adalah mahasiswa yang tanpa sengaja bertemu ghoul, makhluk pemakan daging manusia yang hidup tersembunyi di Tokyo. Pertemuan itu mengubah tubuh dan takdirnya untuk selamanya, memaksanya hidup di antara dunia manusia dan ghoul sambil berusaha memahami kekuatan serta naluri barunya.",
    2166: "Kaneki berusaha bertahan setelah kehidupannya berubah menjadi setengah manusia dan setengah ghoul. Di tengah konflik antar-ghoul serta penyelidikan CCG yang semakin dekat, ia harus belajar mengendalikan tubuh barunya dan menentukan pihak mana yang dapat ia percaya.",
    2167: "Anggota Anteiku berangkat ke Distrik Sebelas untuk menyelamatkan Kaneki setelah konflik antara Aogiri Tree dan CCG semakin memanas. Sementara itu, Kaneki jatuh ke tangan Yamori dan mengalami siksaan berat yang memaksanya menghadapi sisi paling gelap dalam dirinya.",
    3034: "Aaron Corbet, putra seorang manusia dan malaikat, harus menghadapi Verchiel, pemimpin malaikat jatuh yang ingin menggagalkan ramalan tentang kekuatan Aaron. Setelah kehilangan orang-orang yang berarti baginya, Aaron berlatih mengendalikan kekuatannya untuk pertarungan terakhir, sampai Verchiel mempertemukannya dengan ayah yang lama hilang.",
    3438: "Margio terjerumus dalam sebuah pembunuhan brutal di tengah kehidupan desa yang dipenuhi cinta, pengkhianatan, ketakutan, dan hasrat. Ketika dituduh membunuh, ia menyangkal dan mengatakan bahwa ada harimau di dalam tubuhnya. Kisah ini menelusuri tragedi keluarga serta dorongan gelap yang membawa Margio menuju kekerasan.",
    3625: "Buku geografi ini disusun untuk silabus International Baccalaureate Diploma dan pelajaran geografi tingkat sekolah menengah atas. Isinya membahas pola serta perubahan, tema-tema geografi, interaksi global, penduduk, sumber daya, pembangunan, lingkungan fisik, urbanisasi, pariwisata, dan globalisasi dengan dukungan peta, diagram, serta foto.",
}


SKIP_ROWS = set()


def fetch_description(book):
    match = re.search(r"[?&]id=([^&]+)", book.get("cover_url") or "")
    if not match:
        return book["source_row"], None
    request = urllib.request.Request(
        f"https://books.google.com/books?id={match.group(1)}",
        headers={"User-Agent": "Mozilla/5.0"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        page = response.read().decode("utf-8", errors="replace")
    description_match = re.search(r'<meta name="description" content="([^"]+)', page, re.I)
    if not description_match:
        return book["source_row"], None
    description = html.unescape(description_match.group(1)).strip()
    description = re.split(r"\[(?:Mizan|Bentang|Fiction|Gagas|Novel|Buku)", description, maxsplit=1, flags=re.I)[0]
    description = re.split(r"(?:-{6,}|\*{3,}|#(?:[A-Za-z]))", description, maxsplit=1)[0]
    description = google["clean_synopsis"](description)
    return book["source_row"], description


def main():
    session = base["SupabaseSession"]()
    books = base["load_database_books"](session)
    targets = [
        book
        for book in books.values()
        if (
            not book.get("synopsis")
            or google["suspicious_synopsis"](book.get("synopsis"))
        )
        and "books.google.com/books/content?id=" in (book.get("cover_url") or "")
        and int(book["source_row"]) not in SKIP_ROWS
    ]
    fetched = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(fetch_description, book): book for book in targets}
        for future in concurrent.futures.as_completed(futures):
            source_row, description = future.result()
            fetched[int(source_row)] = description

    updated = []
    skipped = []
    for book in targets:
        source_row = int(book["source_row"])
        synopsis = OVERRIDES.get(source_row) or fetched.get(source_row)
        if not synopsis:
            skipped.append({"source_row": source_row, "title": book["title"], "reason": "description_not_found"})
            continue
        repaired = copy.deepcopy(book)
        repaired["synopsis"] = synopsis
        base["save_book"](session, repaired, repaired.get("cover_url") or "", synopsis)
        updated.append({"source_row": source_row, "title": book["title"], "length": len(synopsis)})

    fresh = base["load_database_books"](session)
    remaining_bad = [
        {"source_row": int(book["source_row"]), "title": book["title"], "authors": book.get("authors")}
        for book in fresh.values()
        if google["suspicious_synopsis"](book.get("synopsis"))
    ]
    report = {
        "updated_count": len(updated),
        "updated": updated,
        "skipped": skipped,
        "remaining_bad_count": len(remaining_bad),
        "remaining_bad": remaining_bad,
    }
    with open("tmp/litera-google-page-synopsis-repair-report.json", "w", encoding="utf-8") as file:
        json.dump(report, file, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
