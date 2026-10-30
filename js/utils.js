export function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character]);
}

export function formatDate(value, options = {}) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...options
  }).format(date);
}

export function toDateInput(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export function isDueSoon(value, now = Date.now()) {
  const due = new Date(value).getTime();
  const remaining = due - now;
  return Number.isFinite(due) && remaining >= 0 && remaining <= 2 * 24 * 60 * 60 * 1000;
}

export function isBeforeDue(value, dueAt) {
  if (!value || !dueAt) return false;
  const occurred = new Date(value).getTime();
  const due = new Date(dueAt).getTime();
  return Number.isFinite(occurred) && Number.isFinite(due) && occurred < due;
}

export function isCurrentReading(status) {
  return ["BORROWED", "RETURN_REQUESTED"].includes(status);
}

export function isActiveLoanStatus(status) {
  return ["PENDING", "APPROVED", "BORROWED", "RETURN_REQUESTED"].includes(status);
}

export function queryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function debounce(callback, delay = 300) {
  let timer;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
}

export function friendlyError(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  const status = Number(error?.status || error?.statusCode || 0);
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) return "Email akun belum dikonfirmasi oleh Supabase. Buka tautan konfirmasi di email, atau matikan Confirm Email jika validasi cukup dilakukan pustakawan.";
  if (message.includes("email logins are disabled") || message.includes("email provider is disabled") || message.includes("unsupported provider")) return "Login email Supabase sedang nonaktif. Aktifkan provider Email di Authentication > Providers > Email.";
  if (message.includes("invalid login credentials")) return "Email atau password tidak sesuai.";
  if (message.includes("user already registered") || message.includes("already been registered")) return "Email sudah digunakan. Jika sebelumnya sudah mendaftar, tunggu validasi pustakawan.";
  if (message.includes("database error saving new user") || message.includes("unexpected_failure")) return "Data pendaftaran gagal disimpan. Jalankan schema.sql terbaru di Supabase, lalu coba lagi.";
  if (code === "over_email_send_rate_limit" || message.includes("email rate limit")) return "Batas pengiriman email Supabase tercapai. Akun mungkin sudah dibuat; jangan daftar ulang. Tunggu hingga kuota pulih atau matikan Confirm Email.";
  if (message.includes("signup is disabled") || message.includes("signups not allowed")) return "Pendaftaran akun sedang dinonaktifkan di pengaturan Supabase.";
  if (message.includes("password should be at least") || message.includes("weak password")) return "Password belum memenuhi ketentuan keamanan.";
  if (status === 402 || code.includes("exceed_") || message.includes("quota exceeded")) return "Batas gratis Supabase sudah tercapai. Kurangi penggunaan atau tunggu kuota periode berikutnya.";
  if (status === 540 || code === "project_paused" || message.includes("project is paused")) return "Proyek Supabase sedang dijeda karena tidak aktif. Aktifkan kembali proyek melalui Supabase Dashboard.";
  if (status === 429 || message.includes("rate limit")) return "Permintaan terlalu sering. Tunggu sebentar lalu coba lagi.";
  if (status >= 500 || message.includes("service unavailable")) return "Layanan Supabase sedang mengalami gangguan. Coba lagi beberapa saat.";
  if (message.includes("failed to fetch") || message.includes("network")) return "Jaringan bermasalah. Periksa koneksi lalu coba lagi.";
  if (message.includes("row-level security") || message.includes("permission denied")) return "Anda tidak memiliki izin untuk tindakan ini.";
  if (code === "cover_required") return "Pilih foto sampul buku terlebih dahulu.";
  if (code === "cover_type") return "Format sampul harus JPG, PNG, atau WebP.";
  if (code === "cover_too_large") return "Ukuran sampul harus di bawah 2 MB.";
  if (code === "cover_conversion") return "Sampul tidak dapat dikonversi ke WebP. Pilih gambar lain.";
  if (message.includes("book-covers") || message.includes("bucket not found")) return "Penyimpanan sampul belum aktif. Jalankan schema.sql terbaru di Supabase.";
  if (message.includes("archive_book") || message.includes("restore_book") || message.includes("archived_at")) return "Fitur Arsip Buku belum aktif. Jalankan schema.sql terbaru di Supabase.";
  if (message.includes("save_book_details") || message.includes("inventory_number")) return "Field inventaris buku belum aktif. Jalankan schema.sql terbaru di Supabase.";
  if (message.includes("book has active transactions")) return "Buku masih memiliki transaksi aktif. Selesaikan atau tolak transaksi tersebut sebelum menghapus buku.";
  if (code === "23503" && message.includes("book")) return "Buku masih terhubung dengan riwayat transaksi dan belum dapat dihapus.";
  if (message.includes("loan extension is not available")) return "Perpanjangan hanya dapat diajukan satu kali dalam 2 hari sebelum jatuh tempo.";
  if (message.includes("invalid extension transition")) return "Permintaan perpanjangan sudah diproses atau pinjaman tidak lagi aktif.";
  return "Terjadi kesalahan. Silakan coba lagi.";
}

export function statusLabel(status) {
  return ({
    PENDING: "Menunggu",
    APPROVED: "Disetujui",
    REJECTED: "Ditolak",
    BORROWED: "Dipinjam",
    RETURN_REQUESTED: "Menunggu Pengembalian",
    RETURNED: "Selesai",
    CANCELLED: "Dibatalkan",
    ACTIVE: "Aktif"
  })[status] || status || "-";
}

export function statusBadgeClass(status) {
  if (["ACTIVE", "BORROWED", "RETURNED"].includes(status)) return "badge--success";
  if (["PENDING", "APPROVED", "RETURN_REQUESTED"].includes(status)) return "badge--warning";
  if (status === "REJECTED") return "badge--danger";
  return "badge--blue";
}

