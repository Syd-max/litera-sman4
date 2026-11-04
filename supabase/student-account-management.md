# Aktivasi pengelolaan akun siswa

1. Jalankan `student-account-management.sql` di SQL Editor Supabase. Skrip aman dijalankan ulang dan tidak menghapus akun atau data pinjaman. Jangan menjalankan ulang seluruh schema hanya untuk fitur ini.
   Jalankan juga `student-password-permissions.sql` untuk memberi key server akses baca kolom ID profil yang diperlukan pemeriksaan reset password. Dua hasil verifikasinya harus `true`.
2. Di Vercel, isi environment variables server: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, dan `SUPABASE_SERVICE_ROLE_KEY`. URL dan publishable key harus berasal dari proyek Supabase yang sama dengan konfigurasi browser. Service role key harus tetap rahasia dan tidak dimasukkan ke `js/config/supabase-config.js`.
3. Deploy ulang setelah environment variables disimpan. Endpoint reset adalah `POST /api/student-password`, hanya menerima token login pustakawan yang diverifikasi ulang oleh server.

Variabel `SUPABASE_SERVICE_ROLE_KEY` menerima key `service_role` JWT lama maupun secret key baru (`sb_secret_...`). Publishable/anon key tidak memiliki hak reset password. Secret key baru dikirim melalui header `apikey` saja; token sesi admin yang menjalankan tindakan tetap diverifikasi terpisah.

Detail Siswa menyediakan **Tangguhkan Akun**, **Pulihkan Akun**, dan **Reset Password**. Penangguhan hanya berlaku untuk akun aktif; pemulihan hanya untuk akun ditangguhkan. Persetujuan registrasi tetap memakai flow sebelumnya. Reset password tidak mengaktifkan atau memulihkan akun dan tidak mengirim email. Password tidak disimpan dalam profil, log aplikasi, atau respons API. Password yang tersimpan pada password manager milik siswa perlu diperbarui oleh siswa sendiri.

RLS yang sudah ada membatasi katalog, favorit, dan peminjaman ke status `ACTIVE`. Halaman siswa juga memantau perubahan status sendiri lewat Realtime, dan memeriksa ulang saat tab dibuka kembali atau koneksi pulih. Tidak ada polling berkala.

Untuk pengembangan lokal, isi `.env` yang diabaikan Git lalu jalankan `npm run dev`. Server lokal menangani endpoint API dan tidak menyajikan source folder `api` sebagai file statis.

Rollback: pulihkan akun berstatus `SUSPENDED` terlebih dahulu melalui tombol atau RPC yang sama, kemudian kembalikan kode aplikasi dan hapus fungsi `set_student_suspension`. Constraint lama boleh dipulihkan setelah dipastikan tidak ada status `SUSPENDED`. Jangan menghapus profil atau riwayat pinjaman.
