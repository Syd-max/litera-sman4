# Masa aktif dan pembersihan akun alumni

Jalankan `student-lifecycle.sql` di SQL Editor Supabase sebelum deploy kode masa aktif. SQL ini menambahkan tanggal kedaluwarsa serta satu job Cron harian. Tidak membutuhkan API key baru, polling browser, atau pengiriman email.

- Angkatan 2024 berakhir **1 Juli 2027 pukul 00.00 WIB**, 2025 berakhir 1 Juli 2028, dan seterusnya. Database menolak akses setelah batas tersebut, termasuk token lama. Halaman siswa juga memasang timer keluar dan memeriksa saat tab/koneksi kembali aktif.
- Dropdown menyediakan tahun 2024 sampai tahun berjalan. Trigger pendaftaran memvalidasi batas yang sama di server. Data tahun masuk tidak bisa diubah siswa setelah pendaftaran.
- Akun lama dengan tahun masuk sebelum 2024 dipertahankan untuk diperiksa, tanpa menebak tahun yang benar. Tanggal kedaluwarsanya kosong sehingga tidak ikut penghapusan otomatis. Hasil SQL menampilkan kelompok tersebut untuk audit.
- Sesuai pilihan pemilik proyek, akun alumni dan **seluruh riwayatnya dihapus permanen** setelah habis masa aktif. Job berjalan pukul 00.15 WIB, maksimal 500 akun per hari; sisanya dilanjutkan esok hari. Akses berakhir tepat pada tenggat, meskipun pembersihan masih antre.
- Pengajuan yang belum diambil (`PENDING`, `APPROVED`) ditutup karena belum mengurangi stok. Buku yang sudah diambil (`BORROWED`) masuk `RETURN_REQUESTED` agar petugas bisa memakai tombol Konfirmasi Kembali yang sudah ada, tanpa perlu login siswa. Stok tidak dinaikkan otomatis. Akun dengan buku belum dikembalikan tetap diblokir tetapi belum dihapus sampai petugas menerima buku fisik. Job berikutnya akan membersihkannya. Akun pustakawan selalu dikecualikan.
- Penghapusan per akun atomik. Jika ada relasi tambahan yang masih menghalangi penghapusan, seluruh penghapusan akun tersebut dibatalkan. Tidak ada perubahan jumlah stok buku.

Verifikasi hasil query di akhir migrasi: tanggal 2024 harus `2027-06-30 17:00:00+00`, setara 1 Juli 2027 00.00 WIB, dan job `litera-cleanup-alumni` harus aktif. Jangan menjalankan fungsi cleanup manual untuk menguji pada akun siswa nyata. Gunakan backup sebelum perubahan kebijakan retensi.

Untuk menghentikan penghapusan berikutnya:
```sql
select cron.unschedule('litera-cleanup-alumni');
```
Menghentikan job tidak mengembalikan data yang sudah dihapus. Penonaktifan berdasarkan tanggal tetap berlaku sampai fungsi `private.is_active_student()` serta pemeriksaan aplikasi dikembalikan secara konsisten. Jangan menghapus kolom saat kode aplikasi masih memakainya.

Dokumentasi penyedia: [Supabase Cron](https://supabase.com/docs/guides/cron), [SQL job quickstart](https://supabase.com/docs/guides/cron/quickstart).
