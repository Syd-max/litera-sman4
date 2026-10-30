# USER FLOW SISWA

START
↓
Landing Page
↓
Apakah sudah memiliki akun?
├── Tidak
│   ↓
│   Register
│   ↓
│   Mengisi Nama Lengkap, Kelas, Tahun Masuk, Jurusan, Email/Username, Password
│   ↓
│   Submit Registrasi
│   ↓
│   Status: Menunggu Validasi
│   ↓
│   Menunggu Pengelola Memvalidasi
│   ↓
│   Apakah disetujui?
│   ├── Tidak
│   │   ↓
│   │   Status: Ditolak
│   │   ↓
│   │   Selesai
│   │
│   └── Ya
│       ↓
│       Status: Aktif
│       ↓
│       Login
│
└── Ya
    ↓
    Login
    ↓
    Apakah akun aktif?
    ├── Tidak
    │   ↓
    │   Tampilkan status akun
    │   ↓
    │   Selesai
    │
    └── Ya
        ↓
        Beranda
        ↓
        ├── Katalog Buku
        │   ↓
        │   Cari Buku
        │   ↓
        │   Pilih Buku
        │   ↓
        │   Detail Buku
        │   ↓
        │   ├── Tambah Favorit
        │   │
        │   │
        │   └── Pinjam Buku
        │       ↓
        │       Cek Ketersediaan
        │       ↓
        │       Apakah buku tersedia?
        │       ├── Tidak
        │       │   ↓
        │       │   Tampilkan "Buku Tidak Tersedia"
        │       │
        │       └── Ya
        │           ↓
        │           Ajukan Peminjaman
        │           ↓
        │           Status: Menunggu Persetujuan
        │           ↓
        │           Menunggu Pengelola
        │           ↓
        │           Apakah disetujui?
        │           ├── Tidak
        │           │   ↓
        │           │   Status: Ditolak
        │           │
        │           └── Ya
        │               ↓
        │               Status: Disetujui
        │               ↓
        │               Buku Diambil
        │               ↓
        │               Status: Dipinjam
        │               ↓
        │               Buku Digunakan
        │
        ├── Bacaan Saya
        │   ↓
        │   ├── Buku yang Sedang Dipinjam
        │   │   ↓
        │   │   Ajukan Pengembalian
        │   │   ↓
        │   │   Status: Menunggu Pengembalian
        │   │   ↓
        │   │   Menunggu Konfirmasi Pengelola
        │   │   ↓
        │   │   Status: Dikembalikan
        │   │
        │   └── Riwayat Bacaan
        │
        ├── Favorit
        │
        └── Profil
            ↓
            Logout
            ↓
            END

# USER FLOW PUSTAKAWAN

START
↓
Login Petugas
↓
Masukkan Username/Email dan Password
↓
Validasi Login
↓
Apakah kredensial valid?
├── Tidak
│   ↓
│   Tampilkan Pesan Error
│   ↓
│   Login Kembali
│
└── Ya
    ↓
    Dashboard Pengelola
    ↓
    ├── Validasi Siswa
    │   ↓
    │   Melihat Daftar Registrasi
    │   ↓
    │   Memilih Data Siswa
    │   ↓
    │   Memeriksa Nama, Kelas, Tahun Masuk, Jurusan
    │   ↓
    │   Apakah Data Sesuai?
    │   ├── Tidak
    │   │   ↓
    │   │   Tolak Registrasi
    │   │   ↓
    │   │   Status: Ditolak
    │   │
    │   └── Ya
    │       ↓
    │       Setujui Registrasi
    │       ↓
    │       Status: Aktif
    │       ↓
    │       Siswa Dapat Login
    │
    ├── Data Buku
    │   ↓
    │   ├── Lihat Buku
    │   ├── Tambah Buku
    │   ├── Ubah Buku
    │   └── Hapus Buku
    │
    │   ↓
    │
    ├── Data Peminjaman
    │   ↓
    │   Melihat Pengajuan Peminjaman
    │   ↓
    │   Memeriksa Data Siswa dan Buku
    │   ↓
    │   Apakah Pengajuan Disetujui?
    │   ├── Tidak
    │   │   ↓
    │   │   Tolak Peminjaman
    │   │   ↓
    │   │   Status: Ditolak
    │   │
    │   └── Ya
    │       ↓
    │       Setujui Peminjaman
    │       ↓
    │       Status: Disetujui
    │       ↓
    │       Stok Buku Diperbarui
    │       ↓
    │       Buku Diberikan kepada Siswa
    │       ↓
    │       Status: Dipinjam
    │
    ├── Pengembalian
    │   ↓
    │   Melihat Pengajuan Pengembalian
    │   ↓
    │   Menerima Buku Fisik
    │   ↓
    │   Konfirmasi Pengembalian
    │   ↓
    │   Status: Dikembalikan
    │   ↓
    │   Stok Buku Bertambah
    │
    └── Data Transaksi
        ↓
        Melihat Riwayat Peminjaman dan Pengembalian
        ↓
        Logout
        ↓
        END
