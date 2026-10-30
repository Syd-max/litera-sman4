import { icon } from "./icons.js";

const studentItems = [
  ["home", "Beranda", "./index.html"],
  ["book", "Katalog", "./catalog.html"],
  ["clock", "Pinjaman", "./loans.html"],
  ["user", "Profil", "./profile.html"]
];

const librarianItems = [
  ["home", "Overview", "./index.html", "dashboard"],
  ["users", "Validasi Siswa", "./students.html", "siswa"],
  ["book", "Data Buku", "./books.html", "buku"],
  ["shelves", "Stok Kosong", "./empty-stock.html", "stok-kosong"],
  ["archive", "Arsip Buku", "./archive.html", "arsip"],
  ["clock", "Peminjaman", "./loans.html", "pinjaman"]
];

function itemMarkup([iconName, label, href, activeKey], active) {
  const current = active === (activeKey || label.toLowerCase()) ? ' aria-current="page"' : "";
  return `<a class="nav-item" href="${href}"${current}><span class="nav-item__icon">${icon(iconName)}</span><span>${label}</span></a>`;
}

export function renderStudentNavigation(active) {
  return `<nav class="bottom-nav" aria-label="Navigasi siswa">${studentItems.map((item) => itemMarkup(item, active)).join("")}</nav>`;
}

export function renderStudentDesktopNavigation(active) {
  return `<nav class="desktop-nav" aria-label="Navigasi siswa">${studentItems.map(([, label, href]) => `<a href="${href}"${active === label.toLowerCase() ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>`;
}

export function renderLibrarianNavigation(active) {
  return `<button class="admin-sidebar-backdrop" type="button" data-sidebar-close aria-label="Tutup menu" tabindex="-1"></button>
  <nav class="admin-nav" id="admin-sidebar" aria-label="Navigasi pengelola">
    <a class="admin-nav__brand" href="./index.html"><img src="../assets/sman4-logo.png" alt="Logo SMAN 4 Tangerang Selatan"><span><strong>Smart Library</strong><small>SMAN 4 Tangerang Selatan</small></span></a>
    <div class="admin-nav__items">${librarianItems.map((item) => itemMarkup(item, active)).join("")}</div>
    <button class="admin-sidebar-logout" type="button" data-admin-logout>${icon("logout")}<span>Keluar</span></button>
  </nav>`;
}

