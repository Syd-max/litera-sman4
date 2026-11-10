import { createCsv, downloadCsv } from "./book-export.js";
import { statusLabel } from "./utils.js";

const dateTimeWib = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Jakarta",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
});

function formatLoanDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? dateTimeWib.format(date) : "";
}

export function createLoansCsv(loans) {
  const header = [
    "No.", "ID peminjaman", "Nama siswa", "Kelas", "Angkatan", "Judul buku", "Penulis", "Status",
    "Diajukan (WIB)", "Disetujui (WIB)", "Diambil (WIB)", "Batas kembali (WIB)",
    "Pengajuan kembali (WIB)", "Dikembalikan (WIB)", "Status perpanjangan",
    "Perpanjangan diajukan (WIB)", "Perpanjangan diproses (WIB)"
  ];
  const rows = loans.map((loan, index) => [
    index + 1, loan.id, loan.student?.full_name, loan.student?.class_name, loan.student?.enrollment_year,
    loan.book?.title, loan.book?.authors, statusLabel(loan.status),
    formatLoanDate(loan.requested_at), formatLoanDate(loan.approved_at), formatLoanDate(loan.borrowed_at),
    formatLoanDate(loan.due_at), formatLoanDate(loan.return_requested_at), formatLoanDate(loan.returned_at),
    loan.extension_status ? statusLabel(loan.extension_status) : "",
    formatLoanDate(loan.extension_requested_at), formatLoanDate(loan.extension_reviewed_at)
  ]);
  return createCsv([header, ...rows]);
}

export function downloadLoansCsv(loans, showHistory) {
  const name = showHistory ? "riwayat-selesai" : "peminjaman-aktif";
  const date = dateTimeWib.format(new Date()).slice(0, 10);
  downloadCsv(createLoansCsv(loans), `${name}-${date}.csv`);
}
