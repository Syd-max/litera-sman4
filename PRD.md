# PRODUCT REQUIREMENTS DOCUMENT (PRD)

# 1. Identitas Produk

Nama Produk: Litera
Jenis Produk: Sistem Informasi Perpustakaan Sekolah Berbasis Web
Platform: Web
Target Pengguna: Siswa dan Pengelola Perpustakaan

# 2. Deskripsi Produk

Litera merupakan sistem informasi perpustakaan sekolah berbasis web yang digunakan untuk mempermudah proses pengelolaan perpustakaan dan akses layanan perpustakaan bagi siswa.



Sistem menggunakan mekanisme validasi akun agar siswa yang dapat menggunakan layanan Litera adalah siswa yang telah diverifikasi oleh pengelola perpustakaan.

# 3. Latar Belakang dan Permasalahan

Pengelolaan perpustakaan sekolah membutuhkan pencatatan data buku, data siswa, peminjaman, pengembalian, serta informasi ketersediaan buku yang terorganisasi.

Pada proses konvensional, siswa perlu mencari informasi buku secara langsung di perpustakaan dan pengelola harus melakukan pencatatan transaksi secara manual. Kondisi tersebut dapat menyebabkan proses pencarian buku menjadi kurang efisien serta menyulitkan pengelola dalam memantau status buku dan transaksi peminjaman.


# 4. Tujuan Produk

## 4.1 Tujuan Umum

Membangun sistem informasi perpustakaan sekolah berbasis web yang dapat membantu siswa menggunakan layanan perpustakaan secara lebih mudah dan membantu pengelola mengelola data serta transaksi perpustakaan secara terstruktur.

## 4.2 Tujuan Khusus

1. Mempermudah siswa melakukan registrasi akun.
2. Memastikan akun siswa divalidasi oleh pengelola sebelum dapat digunakan.
3. Mempermudah siswa mencari dan melihat informasi buku.
4. Mempermudah proses pengajuan peminjaman buku fisik.
5. Membantu siswa memantau status peminjaman.
7. Menyediakan fitur favorit dan riwayat bacaan.
8. Membantu pengelola mengelola data buku fisik.
10. Membantu pengelola mengelola transaksi peminjaman dan pengembalian.

# 5. Pengguna Sistem

Litera memiliki dua jenis pengguna utama.

## 5.1 Siswa

Siswa merupakan pengguna yang menggunakan layanan perpustakaan melalui sisi pengguna.

Siswa dapat:

* Melakukan registrasi.
* Menunggu validasi akun.
* Login setelah akun disetujui.
* Melihat beranda.
* Melihat katalog buku.
* Mencari buku.
* Melihat detail buku.
* Mengajukan peminjaman buku fisik.
* Melihat status peminjaman.
* Melihat bacaan saya.
* Melihat riwayat bacaan.
* Menambahkan buku ke favorit.
* Mengajukan pengembalian buku.

## 5.2 Pengelola Perpustakaan

Pengelola perpustakaan merupakan pengguna yang bertanggung jawab terhadap pengelolaan sistem perpustakaan.

Pengelola dapat:

* Login sebagai petugas.
* Memvalidasi registrasi siswa.
* Mengelola data buku fisik.
* Mengelola transaksi peminjaman.
* Melihat data peminjaman.
* Mengonfirmasi pengembalian buku.

# 6. Fitur Siswa

## 6.1 Registrasi Siswa

Siswa dapat membuat akun dengan mengisi data yang diperlukan.

Data registrasi:

* Nama lengkap.
* Kelas.
* Tahun masuk.
* Jurusan.
* Email atau username.
* Password.

Setelah registrasi berhasil, akun tidak langsung aktif.

Status akun menjadi:

**MENUNGGU VALIDASI**

Data registrasi kemudian masuk ke dashboard pengelola untuk diperiksa.

## 6.2 Validasi Akun Siswa

Setelah melakukan registrasi, siswa menunggu pengelola memeriksa data.

Pengelola dapat melihat:

* Nama lengkap.
* Kelas.
* Tahun masuk.
* Jurusan.
* Email/username.
* Tanggal registrasi.
* Status akun.

Pengelola dapat memilih:

**Setujui**

atau

**Tolak**

Jika disetujui:

> Status akun > Aktif

Jika ditolak:

> Status akun > Ditolak

Siswa hanya dapat menggunakan menu Login setelah akun berstatus **AKTIF**.

### Alur

Siswa Register
       ↓
Menunggu Validasi
       ↓
Dashboard Pengelola
       ↓
Pemeriksaan Data
       ↓
   ┌───┴────┐
   ↓        ↓
Sesuai   Tidak Sesuai
   ↓        ↓
Setujui    Tolak
   ↓        ↓
Aktif     Ditolak
   ↓
Login


# 7. Login Siswa

Siswa yang telah mendapatkan status **Aktif** dapat melakukan login menggunakan email/username dan password.

Jika akun masih berstatus **Menunggu Validasi**, sistem menampilkan informasi bahwa akun belum dapat digunakan.

Jika akun berstatus **Ditolak**, siswa tidak dapat masuk ke sistem.


# 8. Beranda Siswa

Beranda merupakan halaman utama setelah siswa berhasil login.

Beranda dapat menampilkan:

* Sapaan pengguna.
* Pencarian buku.
* Rekomendasi buku.
* Buku terbaru.
* Kategori buku.
* Status peminjaman.
* Akses cepat menuju katalog.
* Akses menuju bacaan saya.


# 9. Katalog Buku

Katalog menampilkan daftar buku yang tersedia dalam sistem.

Informasi yang ditampilkan dapat berupa:

* Sampul buku.
* Judul.
* Penulis.
* Kategori.
* Tahun terbit.
* Status ketersediaan.

Status buku dapat berupa:

* Tersedia.
* Tidak tersedia.

Buku yang tidak tersedia tetap dapat ditampilkan di katalog sehingga siswa dapat mengetahui bahwa buku tersebut terdaftar dalam koleksi perpustakaan.

# 10. Pencarian Buku

Siswa dapat mencari buku melalui fitur pencarian.

Pencarian dapat dilakukan berdasarkan:

* Judul.
* Penulis.
* Kategori.
* ISBN.

Jika tidak terdapat hasil pencarian, sistem menampilkan informasi bahwa buku yang dicari tidak ditemukan.

# 11. Detail Buku

Halaman detail buku menampilkan informasi lengkap mengenai buku.

Informasi yang dapat ditampilkan:

* Sampul.
* Judul.
* Penulis.
* Penerbit.
* Tahun terbit.
* ISBN.
* Kategori.
* Sinopsis.
* Jumlah buku.
* Jumlah buku tersedia.
* Lokasi rak.
* Status ketersediaan.

Aksi yang dapat tersedia:

* Pinjam Buku.
* Tambah Favorit.

Tombol **Pinjam Buku** hanya tersedia apabila buku dapat dipinjam oleh siswa.


# 12. Peminjaman Buku Fisik

Siswa dapat mengajukan peminjaman buku fisik melalui halaman detail buku.

Alur peminjaman:

Siswa memilih buku
        ↓
Melihat detail buku
        ↓
Cek ketersediaan
        ↓
Buku tersedia?
   ┌────┴────┐
  Tidak     Ya
   ↓         ↓
Tidak dapat  Ajukan
meminjam     peminjaman
             ↓
      Menunggu Persetujuan
             ↓
       Pengelola memeriksa
             ↓
       ┌─────┴─────┐
    Disetujui     Ditolak
       ↓             ↓
    Stok -1       Selesai
       ↓
   Buku diambil
       ↓
     Dipinjam

Sistem harus memastikan jumlah buku tersedia tidak menjadi kurang dari 0.

# 13. Status Peminjaman

Siswa dapat melihat status transaksi peminjaman.

Status yang digunakan:

1. Menunggu Persetujuan
2. Disetujui
3. Ditolak
4. Dipinjam
5. Menunggu Pengembalian
6. Dikembalikan

Informasi peminjaman meliputi:

* Judul buku.
* Tanggal pengajuan.
* Tanggal peminjaman.
* Tanggal jatuh tempo.
* Status peminjaman.
* Tanggal pengembalian apabila sudah dikembalikan.

# 14. Bacaan Saya dan Riwayat Bacaan

Menu Bacaan Saya digunakan untuk menampilkan buku yang sedang atau pernah digunakan oleh siswa.

Bagian ini dapat terdiri dari:

### Buku yang Sedang Dipinjam

Menampilkan buku yang masih berada dalam status aktif.

### Riwayat Bacaan

Menampilkan buku yang pernah:

* Dipinjam.
* Dikembalikan.

Buku yang telah dikembalikan tidak lagi ditampilkan sebagai buku aktif, tetapi tetap tersimpan dalam riwayat.

# 15. Favorit Buku

Siswa dapat menambahkan buku ke daftar favorit.

Fitur:

* Menambah favorit.
* Menghapus favorit.
* Melihat daftar buku favorit.

Satu siswa tidak dapat menambahkan buku yang sama ke favorit lebih dari satu kali.

Data favorit bersifat personal sehingga daftar favorit setiap siswa berbeda.

# 16. Pengembalian Buku

Siswa dapat mengajukan pengembalian buku melalui menu Bacaan Saya.

Alur:

Siswa membuka Bacaan Saya
        ↓
Memilih buku yang dipinjam
        ↓
Ajukan Pengembalian
        ↓
Menunggu Konfirmasi Pengelola
        ↓
Siswa menyerahkan buku fisik
        ↓
Pengelola menerima buku
        ↓
Pengelola mengonfirmasi
        ↓
Status = Dikembalikan
        ↓
Stok buku +1

Stok buku tidak langsung bertambah ketika siswa mengajukan pengembalian.

Stok baru bertambah setelah pengelola mengonfirmasi bahwa buku fisik telah diterima.

# 17. Fitur Pengelola

## 18.1 Login Petugas

Pengelola memiliki akses login khusus.

Akun pengelola memiliki role yang berbeda dengan akun siswa.

Pengelola tidak menggunakan halaman siswa untuk mengakses dashboard administrasi.

# 18. Validasi Registrasi Siswa

Pengelola memiliki halaman khusus untuk memvalidasi akun siswa.

Data yang dapat dilihat:

* Nama lengkap.
* Kelas.
* Tahun masuk.
* Jurusan.
* Email/username.
* Tanggal registrasi.
* Status akun.

Status awal:

**Menunggu Validasi**

Pengelola melakukan pemeriksaan berdasarkan data siswa yang diberikan.

### Jika sesuai

Menunggu Validasi
        ↓
Setujui
        ↓
Aktif
        ↓
Siswa dapat Login


### Jika tidak sesuai

Menunggu Validasi
        ↓
Tolak
        ↓
Ditolak
        ↓
Siswa tidak dapat Login

# 19. Pengelolaan Data Buku Fisik

Pengelola dapat melakukan operasi CRUD terhadap data buku.

CRUD meliputi:

* Create / Tambah.
* Read / Lihat.
* Update / Ubah.
* Delete / Hapus.

Data buku:

* ISBN.
* Judul.
* Penulis.
* Penerbit.
* Tahun terbit.
* Kategori.
* Jumlah buku.
* Jumlah tersedia.
* Lokasi rak.
* Sampul buku.

Sistem harus memastikan:

0 ≤ Jumlah Tersedia ≤ Jumlah Buku

# 20. Pengelolaan Peminjaman

Pengelola dapat melihat dan memproses pengajuan peminjaman siswa.

Pengelola dapat:

* Melihat pengajuan.
* Melihat data siswa.
* Melihat data buku.
* Menyetujui peminjaman.
* Menolak peminjaman.
* Memproses status peminjaman.

Jika pengajuan ditolak:

> Status = Ditolak

dan stok buku tidak berkurang.

Jika pengajuan disetujui:

> Status = Disetujui

dan proses peminjaman dapat dilanjutkan sampai buku benar-benar diberikan kepada siswa.

# 21. Melihat Data Peminjaman

Pengelola dapat melihat seluruh data transaksi peminjaman.

Data dapat mencakup:

* Nama siswa.
* Kelas.
* Judul buku.
* Tanggal pengajuan.
* Tanggal peminjaman.
* Tanggal jatuh tempo.
* Tanggal pengembalian.
* Status transaksi.

Data transaksi yang telah selesai tetap disimpan sebagai riwayat.

# 22. Konfirmasi Pengembalian

Pengelola dapat melihat pengajuan pengembalian dari siswa.

Proses:

Siswa Mengajukan Pengembalian
            ↓
Menunggu Pengembalian
            ↓
Siswa Menyerahkan Buku
            ↓
Pengelola Menerima Buku
            ↓
Konfirmasi Pengembalian
            ↓
Status = Dikembalikan
            ↓
Stok Buku +1

Pengelola hanya mengonfirmasi pengembalian setelah buku fisik diterima.

# 23. Alur Utama Sistem

## 25.1 Alur Registrasi dan Login

Siswa
  ↓
Register
  ↓
Mengisi Data
  ↓
Data Tersimpan
  ↓
Menunggu Validasi
  ↓
Pengelola Memeriksa
  ↓
Data Valid?
 ┌──────┴──────┐
Ya            Tidak
 ↓              ↓
Setujui        Tolak
 ↓              ↓
Aktif          Ditolak
 ↓
Login
 ↓
Beranda

# 24. Alur Utama Peminjaman

Login
 ↓
Beranda
 ↓
Katalog
 ↓
Cari Buku
 ↓
Pilih Buku
 ↓
Detail Buku
 ↓
Cek Ketersediaan
 ↓
Tersedia?
 ┌──────┴──────┐
Tidak         Ya
 ↓             ↓
Tidak dapat   Ajukan
meminjam      peminjaman
                ↓
       Menunggu Persetujuan
                ↓
        Pengelola Memeriksa
                ↓
          ┌─────┴─────┐
       Setujui       Tolak
          ↓             ↓
       Disetujui      Ditolak
          ↓
      Buku Diambil
          ↓
       Dipinjam

# 25. Alur Utama Pengembalian

Bacaan Saya
     ↓
Pilih Buku
     ↓
Ajukan Pengembalian
     ↓
Menunggu Konfirmasi
     ↓
Buku Diserahkan
     ↓
Pengelola Menerima
     ↓
Konfirmasi
     ↓
Dikembalikan
     ↓
Stok +1

# 26. Aturan Bisnis

1. Siswa harus melakukan registrasi sebelum dapat menggunakan akun.
2. Data registrasi siswa tidak langsung aktif.
3. Setiap registrasi baru memiliki status **Menunggu Validasi**.
4. Pengelola harus memvalidasi data siswa sebelum akun dapat digunakan.
5. Siswa hanya dapat login apabila status akun **Aktif**.
6. Akun berstatus **Ditolak** tidak dapat digunakan untuk login.
7. Siswa tidak dapat mengakses halaman pengelola.
8. Pengelola tidak menggunakan akun siswa untuk mengakses dashboard pengelola.
9. Buku hanya dapat dipinjam apabila jumlah tersedia lebih dari 0.
10. Pengajuan peminjaman harus melalui proses persetujuan pengelola.
11. Pengajuan yang ditolak tidak mengurangi stok buku.
12. Buku yang telah disetujui dan diberikan kepada siswa memiliki status **Dipinjam**.
13. Pengembalian harus diajukan oleh siswa.
14. Pengembalian harus dikonfirmasi oleh pengelola.
15. Stok buku hanya bertambah setelah pengembalian dikonfirmasi.
16. Satu siswa tidak dapat memiliki data favorit yang sama secara duplikat.
18. Data transaksi peminjaman yang telah selesai tetap disimpan sebagai riwayat.
19. Jumlah buku tersedia tidak boleh lebih besar dari jumlah total buku.
20. Jumlah buku tersedia tidak boleh bernilai negatif.


# 27. Data dan Entitas Sistem

## 27.1 User

Menyimpan informasi dasar akun pengguna.

Atribut:

* idUser
* nama
* email
* password
* role
* statusAkun

Role:

* Siswa
* Pengelola

Status akun siswa:

* Menunggu Validasi
* Aktif
* Ditolak

## 27.2 Siswa

Menyimpan informasi khusus siswa.

Atribut:

* idUser
* nama
* kelas
* tahunMasuk
* jurusan

## 27.3 Pengelola

Menyimpan informasi pengelola perpustakaan.

Atribut:

* idPetugas
* nama
* email
* password
* jabatan

## 27.4 Buku

Atribut:

* idBuku
* ISBN
* judul
* penulis
* penerbit
* tahunTerbit
* kategori
* jumlah
* jumlahTersedia
* lokasiRak

## 27.5 Peminjaman

Atribut:

* idPeminjaman
* idSiswa
* idBuku
* tanggalPinjam
* tanggalJatuhTempo
* tanggalKembali
* status

## 27.6 Favorit

Atribut:

* idFavorit
* idSiswa
* idBuku
* tanggalDitambahkan

## 27.7 Riwayat Bacaan

Atribut:

* idRiwayat
* idSiswa
* idBuku
* tanggalAkses
* status

# 28. Persyaratan Fungsional

| ID    | Persyaratan                                                  |
| ----- | ------------------------------------------------------------ |
| FR-01 | Sistem dapat menerima registrasi siswa.                      |
| FR-02 | Sistem menyimpan status akun baru sebagai Menunggu Validasi. |
| FR-03 | Sistem menampilkan data registrasi pada dashboard pengelola. |
| FR-04 | Pengelola dapat menyetujui registrasi siswa.                 |
| FR-05 | Pengelola dapat menolak registrasi siswa.                    |
| FR-06 | Sistem mengubah status akun menjadi Aktif setelah disetujui. |
| FR-07 | Sistem mengizinkan login hanya untuk akun aktif.             |
| FR-08 | Sistem menyediakan beranda siswa.                            |
| FR-09 | Sistem menampilkan katalog buku.                             |
| FR-10 | Sistem menyediakan pencarian buku.                           |
| FR-11 | Sistem menampilkan detail buku.                              |
| FR-12 | Sistem dapat memeriksa ketersediaan buku.                    |
| FR-13 | Siswa dapat mengajukan peminjaman buku.                      |
| FR-14 | Pengelola dapat menyetujui atau menolak peminjaman.          |
| FR-15 | Sistem dapat memperbarui stok buku.                          |
| FR-16 | Sistem menampilkan status peminjaman.                        |
| FR-17 | Siswa dapat melihat Bacaan Saya.                             |
| FR-18 | Siswa dapat melihat riwayat bacaan.                          |
| FR-19 | Siswa dapat menambahkan buku ke favorit.                     |
| FR-20 | Siswa dapat menghapus buku dari favorit.                     |
| FR-21 | Siswa dapat mengajukan pengembalian buku.                    |
| FR-22 | Pengelola dapat mengonfirmasi pengembalian.                  |
| FR-23 | Sistem menyimpan riwayat transaksi.                          |
| FR-24 | Pengelola dapat melakukan CRUD data buku.                    |
| FR-25 | Pengelola dapat melihat data peminjaman.                     |

# 29. Persyaratan Non-Fungsional

## 31.1 Usability

Antarmuka harus mudah dipahami oleh siswa dan pengelola.

Navigasi harus jelas dan konsisten.

## 31.2 Responsiveness

Sistem harus dapat digunakan pada:

* Smartphone.
* Tablet.
* Laptop/Desktop.

## 31.3 Performance

Halaman katalog dan data buku harus dapat ditampilkan secara efisien.

## 31.4 Security

Sistem harus menerapkan pembatasan akses berdasarkan role.

Siswa tidak dapat mengakses fitur administrasi.

Password pengguna tidak boleh ditampilkan kepada pengguna lain.

## 31.5 Data Integrity

Sistem harus menjaga konsistensi:

* Data akun.
* Data buku.
* Stok buku.
* Data peminjaman.
* Data pengembalian.

# 30. Struktur Navigasi Siswa

Login
 │
 └── Beranda
      │
      ├── Katalog
      │    ├── Cari Buku
      │    └── Detail Buku
      │         ├── Pinjam Buku
      │         └── Favorit
      │
      ├── Bacaan Saya
      │    ├── Sedang Dipinjam
      │    └── Riwayat Bacaan
      │
      ├── Favorit
      │
      └── Profil


# 31. Struktur Navigasi Pengelola

Login Petugas
      │
      └── Dashboard
           │
           ├── Validasi Siswa
           │
           ├── Data Buku
           │    ├── Tambah
           │    ├── Ubah
           │    └── Hapus
           │
           │    ├── Tambah
           │    ├── Ubah
           │    └── Hapus
           │
           ├── Data Peminjaman
           │    ├── Pengajuan
           │    ├── Persetujuan
           │    └── Pengembalian
           │
           └── Data Transaksi

# 32. Ruang Lingkup MVP

Fitur minimum yang harus tersedia pada versi pertama Litera:

### Siswa

* Register.
* Validasi akun oleh pengelola.
* Login.
* Beranda.
* Katalog buku.
* Pencarian buku.
* Detail buku.
* Peminjaman buku fisik.
* Status peminjaman.
* Bacaan Saya.
* Riwayat bacaan.
* Favorit.
* Pengajuan pengembalian.

### Pengelola

* Login petugas.
* Validasi siswa.
* CRUD buku.
* Pengelolaan peminjaman.
* Pengelolaan pengembalian.
* Melihat data transaksi.

# 33. Kriteria Penerimaan Setiap Fitur

## 33.1 Register Siswa

Fitur dinyatakan berhasil apabila:

* Siswa dapat mengisi nama lengkap.
* Siswa dapat mengisi kelas.
* Siswa dapat mengisi tahun masuk.
* Siswa dapat mengisi jurusan.
* Siswa dapat mengisi email/username.
* Siswa dapat membuat password.
* Sistem menolak data wajib yang kosong.
* Sistem menolak email/username yang sudah digunakan.
* Data registrasi berhasil tersimpan.
* Status awal akun menjadi **Menunggu Validasi**.
* Akun belum dapat digunakan untuk login sebelum divalidasi.

## 33.2 Validasi Siswa

Fitur dinyatakan berhasil apabila:

* Pengelola dapat melihat daftar siswa yang menunggu validasi.
* Data siswa dapat dilihat dengan jelas.
* Pengelola dapat memilih Setujui.
* Pengelola dapat memilih Tolak.
* Status berubah menjadi Aktif setelah disetujui.
* Status berubah menjadi Ditolak setelah ditolak.
* Akun aktif dapat digunakan untuk login.
* Akun yang ditolak tidak dapat login.

## 33.3 Login Siswa

Fitur dinyatakan berhasil apabila:

* Akun aktif dapat login.
* Akun Menunggu Validasi mendapatkan pemberitahuan bahwa akun belum aktif.
* Akun Ditolak tidak dapat login.
* Username/email dan password yang salah menghasilkan pesan kesalahan.
* Siswa diarahkan ke beranda setelah login berhasil.
* Siswa tidak dapat mengakses halaman pengelola.

## 33.4 Beranda

* Beranda dapat dibuka setelah login.
* Informasi utama perpustakaan ditampilkan.
* Katalog dapat diakses.
* Pencarian dapat diakses.
* Bacaan Saya dapat diakses.

## 33.5 Katalog Buku

* Sistem menampilkan buku dari database.
* Informasi judul, penulis, kategori, dan ketersediaan ditampilkan.
* Buku tidak tersedia tetap dapat ditampilkan.
* Status ketersediaan ditampilkan dengan jelas.

## 33.6 Pencarian Buku

* Pencarian berdasarkan judul dapat dilakukan.
* Pencarian berdasarkan penulis dapat dilakukan.
* Pencarian berdasarkan kategori dapat dilakukan.
* Pencarian berdasarkan ISBN dapat dilakukan.
* Hasil yang sesuai ditampilkan.
* Jika tidak ada hasil, sistem memberikan informasi yang sesuai.

## 33.7 Detail Buku

* Detail buku dapat dibuka.
* Informasi buku ditampilkan lengkap.
* Jumlah tersedia ditampilkan.
* Status ketersediaan ditampilkan.
* Tombol Pinjam tersedia apabila buku dapat dipinjam.
* Buku dapat ditambahkan ke favorit.

## 33.8 Peminjaman Buku

* Sistem memeriksa ketersediaan buku.
* Buku yang tidak tersedia tidak dapat diajukan.
* Buku yang tersedia dapat diajukan.
* Pengajuan disimpan.
* Status awal menjadi Menunggu Persetujuan.
* Pengelola dapat melihat pengajuan.
* Siswa dapat melihat status pengajuan.

## 33.9 Status Peminjaman

* Siswa dapat melihat transaksi aktif.
* Status transaksi ditampilkan.
* Tanggal peminjaman ditampilkan.
* Tanggal jatuh tempo ditampilkan.
* Status berubah sesuai proses transaksi.

## 33.10 Bacaan Saya

* Buku yang sedang dipinjam ditampilkan.
* Buku yang telah dikembalikan tidak lagi muncul sebagai pinjaman aktif.
* Riwayat transaksi tetap tersimpan.
* Siswa dapat mengajukan pengembalian dari buku yang sedang dipinjam.

## 33.11 Favorit

* Siswa dapat menambahkan buku ke favorit.
* Buku yang sama tidak dapat ditambahkan dua kali.
* Siswa dapat melihat daftar favorit.
* Siswa dapat menghapus favorit.
* Data favorit setiap siswa bersifat personal.

## 33.12 Pengembalian Buku

* Siswa hanya dapat mengajukan pengembalian buku yang sedang dipinjam.
* Status berubah menjadi Menunggu Pengembalian.
* Pengelola dapat melihat pengajuan pengembalian.
* Pengelola dapat mengonfirmasi pengembalian.
* Status berubah menjadi Dikembalikan.
* Tanggal pengembalian tersimpan.
* Stok bertambah satu setelah pengembalian dikonfirmasi.

## 33.13 Login Petugas

* Pengelola dapat login menggunakan akun petugas.
* Akun siswa tidak dapat digunakan untuk mengakses dashboard pengelola.
* Pengelola diarahkan ke dashboard setelah login.
* Halaman administrasi hanya dapat diakses oleh role pengelola.

## 33.14 Pengelolaan Buku

* Pengelola dapat menambah buku.
* Pengelola dapat melihat data buku.
* Pengelola dapat mengubah data buku.
* Pengelola dapat menghapus buku.
* Data buku yang diubah diperbarui pada katalog siswa.
* Jumlah tersedia tidak boleh lebih besar dari jumlah total.
* Jumlah tersedia tidak boleh kurang dari 0.

## 33.15 Pengelolaan Peminjaman

* Pengelola dapat melihat pengajuan.
* Pengelola dapat melihat data siswa dan buku.
* Pengelola dapat menyetujui pengajuan.
* Pengelola dapat menolak pengajuan.
* Pengajuan yang ditolak tidak mengurangi stok.
* Pengajuan yang disetujui memperbarui status transaksi.
* Siswa dapat melihat perubahan status.

## 33.16 Data Peminjaman

* Pengelola dapat melihat seluruh transaksi.
* Data siswa ditampilkan.
* Data buku ditampilkan.
* Tanggal transaksi ditampilkan.
* Status transaksi ditampilkan.
* Transaksi yang selesai tetap tersimpan sebagai riwayat.

## 33.17 Konfirmasi Pengembalian

* Pengelola dapat melihat daftar pengajuan pengembalian.
* Pengelola dapat melihat buku yang harus dikembalikan.
* Pengelola dapat mengonfirmasi setelah buku diterima.
* Status berubah menjadi Dikembalikan.
* Tanggal pengembalian tersimpan.
* Stok buku bertambah satu.
* Buku tidak lagi tercatat sebagai pinjaman aktif siswa.


# 34. Acceptance Criteria Sistem

Sistem Litera dinyatakan memenuhi kebutuhan MVP apabila:

1. Siswa dapat melakukan registrasi.
2. Data siswa masuk ke dashboard pengelola dengan status Menunggu Validasi.
3. Pengelola dapat melakukan validasi siswa.
4. Siswa yang disetujui dapat login.
5. Siswa yang belum disetujui tidak dapat login.
6. Siswa dapat melihat katalog buku.
7. Siswa dapat mencari buku.
8. Siswa dapat melihat detail buku.
9. Siswa dapat mengajukan peminjaman.
10. Pengelola dapat memproses peminjaman.
11. Status peminjaman dapat dipantau siswa.
12. Stok buku diperbarui berdasarkan transaksi.
13. Siswa dapat mengajukan pengembalian.
14. Pengelola dapat mengonfirmasi pengembalian.
15. Stok bertambah setelah pengembalian dikonfirmasi.
17. Siswa dapat menggunakan fitur favorit.
18. Siswa dapat melihat riwayat bacaan.
19. Pengelola dapat mengelola data buku.
21. Pengelola dapat melihat data transaksi.
22. Hak akses siswa dan pengelola berjalan sesuai role.

# 35. Definition of Done

Sebuah fitur dianggap selesai apabila:

* Fitur telah diimplementasikan.
* Fitur dapat digunakan sesuai alur yang telah ditentukan.
* Data berhasil disimpan dan ditampilkan dengan benar.
* Validasi input telah diterapkan.
* Hak akses telah diterapkan sesuai role.
* Kondisi berhasil dan gagal telah memiliki feedback yang jelas.
* Tidak terdapat error yang menghambat penggunaan fitur.
* Tampilan dapat digunakan pada perangkat mobile dan desktop.
* Fitur telah diuji berdasarkan acceptance criteria.
* Fitur tidak merusak fungsi lain yang telah selesai.

# 36. Indikator Keberhasilan Produk

Litera dianggap berhasil apabila:

1. Siswa dapat membuat akun tanpa memasukkan NIS.
2. Pengelola dapat memverifikasi calon pengguna berdasarkan data identitas siswa yang tersedia.
3. Hanya siswa yang telah divalidasi yang dapat menggunakan layanan sistem.
4. Siswa dapat menemukan informasi buku dengan mudah.
5. Proses pengajuan peminjaman dapat dilakukan melalui sistem.
6. Pengelola dapat memantau dan memproses peminjaman.
7. Informasi stok buku tetap konsisten dengan transaksi.
8. Proses pengembalian dapat dicatat secara terstruktur.
10. Pengelola dapat mengelola data perpustakaan melalui dashboard.

# 37. Kesimpulan

Litera merupakan sistem informasi perpustakaan sekolah berbasis web yang mengintegrasikan layanan siswa dan pengelolaan perpustakaan dalam satu sistem.

Sistem menggunakan mekanisme registrasi dan validasi untuk memastikan bahwa akun yang menggunakan layanan merupakan siswa yang telah diverifikasi oleh pengelola perpustakaan. Data registrasi terdiri dari nama lengkap, kelas, tahun masuk, jurusan, email/username, dan password, tanpa menggunakan NIS sebagai data registrasi.


Dengan alur tersebut, Litera diharapkan dapat memberikan proses layanan perpustakaan yang lebih terstruktur, mudah digunakan, dan sesuai dengan kebutuhan siswa serta pengelola perpustakaan sekolah.
