Role & Permission Matrix

Litera menggunakan pendekatan Role-Based Access Control (RBAC) dengan dua role utama, yaitu Siswa dan Pustakawan. Setiap role memiliki hak akses yang berbeda berdasarkan fungsi dan tanggung jawabnya. Permission harus divalidasi oleh sistem berdasarkan role pengguna yang sedang login, bukan hanya berdasarkan tampilan menu pada frontend.

## 1. Role: Siswa

1.1 Authentication & Account

1. Register
   
   - Diizinkan.
   - Siswa dapat membuat akun baru dengan mengisi nama lengkap, kelas, tahun masuk, jurusan, email/username, dan password.
   - Setelah registrasi berhasil, status akun otomatis menjadi "PENDING".
   - Siswa tidak dapat mengaktifkan akun sendiri.

2. Login
   
   - Diizinkan hanya jika "statusAkun = ACTIVE".
   - Tidak diizinkan jika status akun "PENDING" atau "REJECTED".
   - Sistem harus melakukan validasi credential sebelum membuat session.

3. Logout
   
   - Diizinkan.
   - Session/token pengguna harus dihapus atau dibuat tidak berlaku setelah logout.

4. Melihat profil sendiri
   
   - Diizinkan.
   - Siswa hanya dapat melihat data profil miliknya sendiri.

5. Mengubah profil sendiri
   
   - Diizinkan secara terbatas.
   - Siswa dapat mengubah data yang memang diperbolehkan sistem.
   - Siswa tidak diizinkan mengubah "role", "statusAkun", atau data validasi.

6. Mengubah role
   
   - Tidak diizinkan.

7. Mengubah status akun
   
   - Tidak diizinkan.

8. Menghapus akun pengguna lain
   
   - Tidak diizinkan.


## 2. Role: Pustakawan

2.1 Authentication & Account

1. Login Pustakawan
   
   - Diizinkan.
   - Hanya akun dengan role "LIBRARIAN" yang dapat mengakses dashboard pustakawan.

2. Logout
   
   - Diizinkan.

3. Melihat profil sendiri
   
   - Diizinkan.

4. Mengubah profil sendiri
   
   - Diizinkan secara terbatas.

5. Mengubah role pengguna
   
   - Tidak diizinkan melalui fitur umum.
   - Perubahan role harus dilakukan melalui mekanisme administrasi khusus apabila memang diperlukan.

6. Mengubah status akun dirinya sendiri
   
   - Tidak diizinkan.


## 3. Registrasi dan Validasi Siswa

3.1 Siswa

1. Mengirim registrasi
   
   - Diizinkan.

2. Melihat status registrasi sendiri
   
   - Diizinkan.
   - Status dapat berupa:
     - "PENDING"
     - "ACTIVE"
     - "REJECTED"

3. Menyetujui registrasi sendiri
   
   - Tidak diizinkan.

4. Menolak registrasi sendiri
   
   - Tidak diizinkan.

5. Melihat data registrasi siswa lain
   
   - Tidak diizinkan.

6. Mengubah status validasi
   
   - Tidak diizinkan.

3.2 Pustakawan

1. Melihat daftar registrasi yang menunggu validasi
   
   - Diizinkan.

2. Melihat detail data siswa yang mendaftar
   
   - Diizinkan.

3. Menyetujui registrasi siswa
   
   - Diizinkan.

4. Menolak registrasi siswa
   
   - Diizinkan.

5. Mengubah status "PENDING" menjadi "ACTIVE"
   
   - Diizinkan.

6. Mengubah status "PENDING" menjadi "REJECTED"
   
   - Diizinkan.

7. Mengubah status siswa menjadi "ACTIVE" tanpa proses validasi
   
   - Tidak diizinkan jika sistem mewajibkan proses validasi.

8. Menghapus data registrasi
   
   - Diizinkan secara terbatas apabila fitur tersebut memang disediakan.
   - Penghapusan tidak boleh menghilangkan data audit yang diperlukan.

9. Mengubah password siswa
   
   - Tidak diizinkan secara langsung.
   - Reset password sebaiknya menggunakan mekanisme reset password.


## 4. Beranda dan Katalog Buku

4.1 Siswa

1. Melihat beranda
   
   - Diizinkan.

2. Melihat katalog buku
   
   - Diizinkan.

3. Mencari buku
   
   - Diizinkan.

4. Memfilter buku
   
   - Diizinkan.

5. Melihat detail buku
   
   - Diizinkan.

6. Melihat jumlah buku tersedia
   
   - Diizinkan.

7. Melihat lokasi rak
   
   - Diizinkan apabila informasi tersebut tersedia untuk siswa.

8. Menambah buku
   
   - Tidak diizinkan.

9. Mengubah data buku
   
   - Tidak diizinkan.

10. Menghapus buku
    
    - Tidak diizinkan.

11. Mengubah jumlah stok
    
    - Tidak diizinkan.

4.2 Pustakawan

1. Melihat katalog buku
   
   - Diizinkan.

2. Mencari buku
   
   - Diizinkan.

3. Melihat detail buku
   
   - Diizinkan.

4. Menambah buku
   
   - Diizinkan.

5. Mengubah data buku
   
   - Diizinkan.

6. Menghapus buku
   
   - Diizinkan sesuai aturan sistem.

7. Mengelola stok
   
   - Diizinkan.

8. Mengubah lokasi rak
   
   - Diizinkan.


## 5. Pengelolaan Buku Fisik

5.1 Siswa

1. Melihat data buku
   
   - Diizinkan.

2. Menambah buku
   
   - Tidak diizinkan.

3. Mengubah judul buku
   
   - Tidak diizinkan.

4. Mengubah penulis
   
   - Tidak diizinkan.

5. Mengubah penerbit
   
   - Tidak diizinkan.

6. Mengubah kategori
   
   - Tidak diizinkan.

7. Mengubah jumlah buku
   
   - Tidak diizinkan.

8. Mengubah jumlah tersedia
   
   - Tidak diizinkan.

9. Menghapus buku
   
   - Tidak diizinkan.

5.2 Pustakawan

1. Menambah buku
   
   - Diizinkan.

2. Melihat buku
   
   - Diizinkan.

3. Mengubah buku
   
   - Diizinkan.

4. Menghapus buku
   
   - Diizinkan dengan validasi.

5. Mengubah stok total
   
   - Diizinkan.

6. Mengubah stok tersedia
   
   - Diizinkan hanya melalui proses yang valid.

7. Mengubah metadata buku
   
   - Diizinkan.

8. Mengubah kategori
   
   - Diizinkan.

9. Mengubah lokasi rak
   
   - Diizinkan.

10. Menghapus buku yang masih memiliki transaksi aktif
    
    - Tidak diizinkan.

11. Mengurangi stok hingga nilai negatif
    
    - Tidak diizinkan.

12. Mengatur "jumlahTersedia > jumlah"
    
    - Tidak diizinkan.


## 6. Favorit

7.1 Siswa

1. Melihat daftar favorit sendiri
   
   - Diizinkan.

2. Menambahkan buku ke favorit
   
   - Diizinkan.

3. Menghapus buku dari favorit
   
   - Diizinkan.

4. Melihat favorit siswa lain
   
   - Tidak diizinkan.

5. Mengubah favorit siswa lain
   
   - Tidak diizinkan.

7.2 Pustakawan

1. Melihat favorit siswa
   
   - Tidak diizinkan melalui fitur umum.

2. Menambah favorit atas nama siswa
   
   - Tidak diizinkan.

3. Menghapus favorit siswa
   
   - Tidak diizinkan.


## 7. Peminjaman Buku

8.1 Siswa

1. Melihat buku yang tersedia
   
   - Diizinkan.

2. Mengajukan peminjaman
   
   - Diizinkan jika:
     - Akun aktif.
     - Buku tersedia.
     - Siswa tidak memiliki kondisi yang membuat peminjaman tidak diperbolehkan.

3. Melihat pengajuan sendiri
   
   - Diizinkan.

4. Melihat status peminjaman sendiri
   
   - Diizinkan.

5. Membatalkan pengajuan
   
   - Diizinkan hanya jika status masih "PENDING", apabila fitur pembatalan diterapkan.

6. Menyetujui peminjaman sendiri
   
   - Tidak diizinkan.

7. Menolak peminjaman sendiri
   
   - Tidak diizinkan.

8. Mengubah status peminjaman
   
   - Tidak diizinkan.

9. Mengubah stok buku
   
   - Tidak diizinkan.

10. Melihat transaksi siswa lain
    
    - Tidak diizinkan.

8.2 Pustakawan

1. Melihat seluruh pengajuan peminjaman
   
   - Diizinkan.

2. Melihat detail pengajuan
   
   - Diizinkan.

3. Menyetujui pengajuan
   
   - Diizinkan.

4. Menolak pengajuan
   
   - Diizinkan.

5. Mengubah status transaksi
   
   - Diizinkan sesuai workflow.

6. Melihat data siswa yang meminjam
   
   - Diizinkan.

7. Melihat buku yang dipinjam
   
   - Diizinkan.

8. Memproses peminjaman
   
   - Diizinkan.

9. Mengubah transaksi secara tidak sesuai workflow
   
   - Tidak diizinkan.


## 8. Status Peminjaman

Status transaksi menggunakan workflow terkontrol:

PENDING
   ↓
APPROVED / REJECTED
   ↓
BORROWED
   ↓
RETURN_REQUESTED
   ↓
RETURNED

Siswa

1. Melihat status transaksi sendiri
   
   - Diizinkan.

2. Mengubah status menjadi APPROVED
   
   - Tidak diizinkan.

3. Mengubah status menjadi BORROWED
   
   - Tidak diizinkan.

4. Mengubah status menjadi RETURNED
   
   - Tidak diizinkan.

Pustakawan

1. Mengubah PENDING → APPROVED
   
   - Diizinkan.

2. Mengubah PENDING → REJECTED
   
   - Diizinkan.

3. Mengubah APPROVED → BORROWED
   
   - Diizinkan sesuai proses serah terima buku.

4. Mengubah RETURN_REQUESTED → RETURNED
   
   - Diizinkan setelah buku fisik diterima.

5. Mengubah RETURNED → BORROWED
   
   - Tidak diizinkan melalui workflow normal.

6. Mengubah status secara sembarang
   
   - Tidak diizinkan.


## 9. Bacaan Saya dan Riwayat Bacaan

Siswa

1. Melihat buku yang sedang dipinjam
   
   - Diizinkan.

2. Melihat riwayat peminjaman sendiri
   
   - Diizinkan.

   
   - Diizinkan.

4. Menghapus riwayat transaksi
   
   - Tidak diizinkan.

5. Mengubah riwayat transaksi
   
   - Tidak diizinkan.

6. Melihat riwayat siswa lain
   
   - Tidak diizinkan.

Pustakawan

1. Melihat riwayat transaksi perpustakaan
   
   - Diizinkan.

2. Melihat riwayat peminjaman siswa
   
   - Diizinkan.

3. Mengubah riwayat transaksi secara langsung
   
   - Tidak diizinkan.

4. Menghapus riwayat transaksi
   
   - Tidak diizinkan melalui fitur umum.


## 10. Pengembalian Buku

Siswa

1. Melihat buku yang sedang dipinjam
   
   - Diizinkan.

2. Mengajukan pengembalian
   
   - Diizinkan.

3. Melihat status pengembalian
   
   - Diizinkan.

4. Mengonfirmasi pengembalian sendiri
   
   - Tidak diizinkan.

5. Mengubah stok setelah pengembalian
   
   - Tidak diizinkan.

Pustakawan

1. Melihat pengajuan pengembalian
   
   - Diizinkan.

2. Melihat detail buku yang dikembalikan
   
   - Diizinkan.

3. Mengonfirmasi pengembalian
   
   - Diizinkan.

4. Mengubah status menjadi RETURNED
   
   - Diizinkan.

5. Memperbarui stok setelah pengembalian
   
   - Diizinkan melalui proses sistem.

6. Mengonfirmasi pengembalian tanpa adanya transaksi aktif
   
   - Tidak diizinkan.


## 11. Data Transaksi

Siswa

1. Melihat transaksi sendiri
   
   - Diizinkan.

2. Melihat transaksi siswa lain
   
   - Tidak diizinkan.

3. Mengubah transaksi
   
   - Tidak diizinkan.

4. Menghapus transaksi
   
   - Tidak diizinkan.

Pustakawan

1. Melihat seluruh transaksi
   
   - Diizinkan.

2. Memfilter transaksi
   
   - Diizinkan.

3. Mencari transaksi
   
   - Diizinkan.

4. Melihat detail transaksi
   
   - Diizinkan.

5. Mengubah transaksi
   
   - Diizinkan hanya melalui workflow yang ditentukan.

6. Menghapus transaksi aktif
   
   - Tidak diizinkan.

7. Menghapus histori transaksi
   
   - Tidak diizinkan melalui fitur umum.


## 12. Dashboard

Siswa

1. Mengakses Student Dashboard
   
   - Diizinkan.

2. Melihat statistik pribadi
   
   - Diizinkan.

3. Melihat jumlah buku yang sedang dipinjam
   
   - Diizinkan.

4. Melihat status peminjaman sendiri
   
   - Diizinkan.

5. Melihat statistik seluruh perpustakaan
   
   - Tidak diizinkan kecuali data tersebut memang dipublikasikan.

6. Mengakses Admin Dashboard
   
   - Tidak diizinkan.

Pustakawan

1. Mengakses Library Management Dashboard
   
   - Diizinkan.

2. Melihat jumlah buku
   
   - Diizinkan.

3. Melihat jumlah buku tersedia
   
   - Diizinkan.

4. Melihat jumlah peminjaman
   
   - Diizinkan.

5. Melihat jumlah pengembalian
   
   - Diizinkan.

6. Melihat registrasi siswa yang menunggu validasi
   
   - Diizinkan.

7. Mengakses Student Dashboard sebagai siswa
   
   - Tidak diizinkan kecuali sistem memang menyediakan preview/impersonation khusus.


## 13. Role & Access Control

Sistem harus menerapkan RBAC pada backend/API, bukan hanya menyembunyikan menu pada frontend.

Role yang digunakan

STUDENT
LIBRARIAN

Status Akun

PENDING
ACTIVE
REJECTED

Aturan Utama

1. User tanpa session/token valid tidak dapat mengakses halaman yang membutuhkan autentikasi.
2. User dengan role "STUDENT" hanya dapat mengakses resource miliknya sendiri untuk data personal dan transaksi.
3. User dengan role "LIBRARIAN" dapat mengakses resource administratif sesuai permission.
4. Role tidak boleh ditentukan berdasarkan input dari frontend.
5. Backend harus mengambil role dari session/token yang telah tervalidasi.
6. Frontend hanya bertugas menampilkan interface sesuai permission.
7. Permission harus tetap diverifikasi oleh backend meskipun endpoint dipanggil secara langsung.
8. Siswa tidak boleh dapat mengubah "role" menjadi "LIBRARIAN".
9. Siswa tidak boleh mengubah "statusAkun" menjadi "ACTIVE".
10. Siswa tidak boleh mengubah "jumlahTersedia" buku.
11. Siswa tidak boleh mengubah status transaksi secara langsung.
12. Pustakawan tidak boleh mengakses atau mengubah password dalam bentuk plaintext.
13. Data personal siswa hanya dapat diakses sesuai kebutuhan fungsi sistem.
14. Setiap operasi administratif penting sebaiknya memiliki timestamp dan identitas actor untuk kebutuhan audit.

## 14. Ownership / Data Access

Litera harus menerapkan pembatasan berdasarkan kepemilikan data.

Data milik siswa

Siswa hanya dapat:

- Membaca profil sendiri.
- Membaca favorit sendiri.
- Membaca riwayat sendiri.
- Membaca transaksi sendiri.
- Membuat transaksi atas nama sendiri.
- Membuat pengajuan pengembalian atas transaksi sendiri.

Siswa tidak dapat:

- Membaca transaksi siswa lain.
- Mengubah favorit siswa lain.
- Mengubah profil siswa lain.
- Mengubah transaksi siswa lain.

Data administratif

Pustakawan dapat:

- Membaca data siswa yang diperlukan untuk administrasi.
- Membaca seluruh transaksi.
- Mengelola buku.
- Memproses transaksi.
- Memvalidasi akun.


## 15. Permission Naming Convention

Untuk kebutuhan implementasi backend/API, permission dapat menggunakan pola berikut:

student.register
student.login
student.view_profile
student.update_profile

book.view
book.search
book.create
book.update
book.delete
book.manage_stock


favorite.view_own
favorite.create
favorite.delete

loan.create
loan.view_own
loan.cancel_own
loan.view_all
loan.approve
loan.reject

return.create
return.view_own
return.view_all
return.confirm

student_validation.view
student_validation.approve
student_validation.reject

transaction.view_own
transaction.view_all

dashboard.student
dashboard.librarian


## 16. Permission Boundary

Batas akses utama Litera adalah:

STUDENT
│
├── Authentication
│   ├── Register
│   ├── Login
│   └── Logout
│
├── Catalog
│   ├── View
│   ├── Search
│   └── Detail
│
├── Personal
│   ├── Profile
│   ├── Favorite
│   ├── Reading History
│   └── My Loans
│
├── Loan
│   ├── Create Request
│   └── View Own Status
│
├── Return
│   └── Create Request
│
    └── Read


LIBRARIAN
│
├── Authentication
│   ├── Login
│   └── Logout
│
├── Student Validation
│   ├── View
│   ├── Approve
│   └── Reject
│
├── Book Management
│   ├── View
│   ├── Create
│   ├── Update
│   ├── Delete
│   └── Manage Stock
│
│   ├── View
│   ├── Create
│   ├── Update
│   └── Delete
│
├── Loan Management
│   ├── View All
│   ├── Approve
│   └── Reject
│
├── Return Management
│   ├── View
│   └── Confirm
│
└── Transaction
    └── View All

## 17. Prinsip Keamanan Permission

Permission Litera harus mengikuti prinsip least privilege, yaitu setiap role hanya mendapatkan akses yang diperlukan untuk menjalankan tugasnya.

Hak akses tidak boleh hanya dikontrol dengan cara menyembunyikan tombol atau menu pada frontend. Setiap request ke resource yang bersifat protected harus diperiksa kembali pada backend berdasarkan identitas user, role, permission, dan ownership data.

Sebagai contoh, siswa tidak hanya tidak melihat tombol "Setujui Peminjaman", tetapi request untuk melakukan approval juga harus ditolak oleh backend apabila dikirim oleh user dengan role "STUDENT".

Dengan demikian, sistem memiliki dua lapisan kontrol:

Frontend
↓
Menampilkan UI sesuai Role
↓
Backend
↓
Validasi Authentication
↓
Validasi Role
↓
Validasi Permission
↓
Validasi Ownership
↓
Database

Hal ini memastikan bahwa pembatasan akses tetap berlaku meskipun pengguna mencoba mengakses endpoint atau fungsi secara langsung.
