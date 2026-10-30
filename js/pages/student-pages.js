import { confirmDialog, renderEmpty, renderError, setBusy, showToast } from "../components/feedback.js";
import { icon } from "../components/icons.js";
import { renderStudentDesktopNavigation, renderStudentNavigation } from "../components/navigation.js";
import { initializeSelectMenus } from "../components/select-menu.js";
import { getBook, isFavorite, listCatalogBooks, listCategories, listFavorites, listPopularBooks, recordBookSearch, toggleFavorite } from "../services/book-service.js";
import { requireRole, signOut } from "../services/auth-service.js";
import { listMyLoans, listReadingHistory, requestLoan, requestLoanExtension, requestReturn } from "../services/loan-service.js";
import { MissingConfigurationError } from "../services/supabase.js";
import { escapeHtml, formatDate, friendlyError, isCurrentReading, isDueSoon, queryParam, statusBadgeClass, statusLabel } from "../utils.js";

const page = document.body.dataset.page;
const main = document.getElementById("app-main");
const header = document.getElementById("app-header");
const nav = document.getElementById("app-nav");
const fallbackCoverUrl = "../assets/book-placeholder.svg";

main.addEventListener("error", (event) => {
  const image = event.target.closest?.("img[data-book-cover]");
  if (image && !image.src.endsWith("/book-placeholder.svg")) image.src = fallbackCoverUrl;
}, true);

initializeSelectMenus();

const titles = {
  catalog: ["Katalog Buku", "Jelajahi koleksi buku yang tersedia di perpustakaan."],
  book: ["Detail Buku", "Informasi koleksi fisik perpustakaan."],
  loans: ["Status Pinjaman", "Pantau pengajuan dan pengembalian buku Anda."],
  favorites: ["Favorites", "Buku dan koleksi favoritmu, selalu bisa kamu akses kapan saja."],
  history: ["Riwayat Bacaan", "Daftar buku yang telah selesai Anda baca."],
  info: [queryParam("view") === "privacy" ? "Kebijakan Privasi" : "Bantuan", "Informasi layanan LITERA." ]
};

function activeNav() {
  if (["search", "catalog", "book", "favorites"].includes(page)) return "katalog";
  if (page === "loans") return "pinjaman";
  if (["profile", "history", "info"].includes(page)) return "profil";
  return "beranda";
}

function renderShell(identity) {
  const active = activeNav();
  nav.innerHTML = renderStudentNavigation(active);
  if (page === "search") {
    header.hidden = true;
    return;
  }
  header.hidden = false;
  if (page === "home") {
    const name = escapeHtml(identity?.profile?.full_name || "Siswa");
    header.className = "topbar home-topbar";
    header.innerHTML = `<div class="topbar__inner">
      <div class="topbar__row">
        <div class="student-profile-mini">
          <img src="../assets/sman4-logo.png" alt="Logo SMAN 4 Tangerang Selatan">
          <div><span>Selamat datang</span><strong>${name}</strong></div>
        </div>
        ${renderStudentDesktopNavigation(active)}
        <a class="icon-button" href="./favorites.html" aria-label="Buka favorit">${icon("heart")}</a>
      </div>
      <a class="search-field home-search home-search-link" href="./search.html" aria-label="Buka pencarian buku">
        ${icon("search")}<span>Cari judul atau penulis...</span>
      </a>
    </div>`;
    return;
  }
  const [title, subtitle] = titles[page] || ["LITERA", "Smart Library"];
  header.className = `topbar ${["catalog", "book", "history", "loans", "info"].includes(page) ? "topbar--compact" : ""} ${page === "catalog" ? "catalog-topbar" : ""} ${page === "book" ? "book-topbar" : ""}`;
  if (page === "book") {
    header.innerHTML = `<div class="topbar__inner"><div class="detail-topbar"><a class="icon-button" href="./catalog.html" aria-label="Kembali ke katalog">${icon("arrowLeft")}</a><h1>${title}</h1></div></div>`;
    return;
  }
  if (page === "favorites") {
    header.className = "topbar favorites-topbar";
    header.innerHTML = `<div class="topbar__inner"><div class="favorites-topbar__row"><a class="icon-button" href="./catalog.html" aria-label="Kembali ke katalog">${icon("arrowLeft")}</a><div><h1>${title}</h1><p>${subtitle}</p></div></div></div>`;
    return;
  }
  if (["history", "info"].includes(page)) {
    header.innerHTML = `<div class="topbar__inner"><div class="detail-topbar"><a class="icon-button" href="./profile.html" aria-label="Kembali ke profil">${icon("arrowLeft")}</a><h1>${title}</h1></div></div>`;
    return;
  }
  const favoriteAction = page === "catalog" ? `<a class="icon-button" href="./favorites.html" aria-label="Buka favorit">${icon("heart")}</a>` : `<span class="student-header-spacer" aria-hidden="true"></span>`;
  header.innerHTML = `<div class="topbar__inner"><div class="topbar__row"><div><h1>${title}</h1><p>${subtitle}</p></div><div class="student-header-actions">${renderStudentDesktopNavigation(active)}${favoriteAction}</div></div></div>`;
}

function configurationBlock() {
  main.innerHTML = `<div class="page-container"><div class="notice notice--warning">${icon("info")}<span>Supabase belum dikonfigurasi. Tambahkan URL proyek dan publishable key ke <strong>js/config/supabase-config.js</strong> untuk memuat data.</span></div></div>`;
}

function coverUrl(book) {
  return book.cover_url || fallbackCoverUrl;
}

function coverImage(book, className = "", loading = false) {
  return `<img${className ? ` class="${className}"` : ""} src="${escapeHtml(coverUrl(book))}" alt="Sampul ${escapeHtml(book.title || "Buku")}" data-book-cover${loading ? ' loading="lazy" decoding="async"' : ""}>`;
}

function bookCard(book) {
  const available = Number(book.available_stock) > 0;
  return `<a class="book-card" href="./book.html?id=${encodeURIComponent(book.id)}">
    ${coverImage(book, "book-card__cover", true)}
    <div class="book-card__body">
      <span class="badge book-card__availability ${available ? "badge--success" : "badge--danger"}">${available ? "Tersedia" : "Tidak tersedia"}</span>
      <h3>${escapeHtml(book.title)}</h3>
      <p>${escapeHtml(book.authors || "Penulis tidak tersedia")}</p>
      <div class="book-card__meta"><span>${escapeHtml(book.category?.name || "Tanpa kategori")}</span><span>${escapeHtml(book.shelf_location || "Lokasi belum ditentukan")}</span></div>
    </div>
    <span class="book-card__arrow">${icon("arrowRight")}</span>
  </a>`;
}

async function renderHome(identity) {
  main.className = "page-container";
  main.innerHTML = `<section class="announcement"><h2>Buku Baru Telah Tersedia!</h2><p>Temukan koleksi terbaru perpustakaan.</p><a class="button button--lime button--small" href="./catalog.html">Lihat Sekarang</a></section><div id="home-content" class="loading-region"><div class="spinner" aria-label="Memuat"></div></div>`;
  const content = document.getElementById("home-content");
  try {
    const books = await listPopularBooks(8);
    content.className = "";
    content.innerHTML = `
      <div class="section-heading"><h2>Buku Populer</h2><a class="section-link" href="./catalog.html">Lihat Semua</a></div>
      <div class="book-grid" id="home-books"></div>`;
    const booksHost = document.getElementById("home-books");
    if (books.length) booksHost.innerHTML = books.map(bookCard).join("");
    else renderEmpty(booksHost, { title: "Belum ada pencarian", message: "Buku yang paling sering dicari siswa akan tampil di sini.", actionHref: "./catalog.html", actionLabel: "Buka Katalog" });
  } catch (error) {
    renderError(content, friendlyError(error));
  }
}

async function renderCatalog() {
  main.className = "page-container catalog-page";
  const initialQuery = queryParam("q") || "";
  const initialCategory = queryParam("category") || "";
  main.innerHTML = `
    <div class="catalog-sticky">
      <form class="search-field" id="catalog-search">${icon("search")}<label class="sr-only" for="catalog-query">Cari buku</label><input id="catalog-query" type="search" value="${escapeHtml(initialQuery)}" placeholder="Cari buku, penulis, kategori, ISBN..."></form>
      <div class="category-filter"><label class="sr-only" for="category-filter">Filter genre atau jenis buku</label><select id="category-filter" disabled><option>Memuat kategori...</option></select></div>
      <div class="section-heading"><h2>${icon("book")} Katalog Buku</h2><span id="catalog-count"></span></div>
    </div>
    <div id="catalog-results" class="book-grid"><div class="loading-region"><div class="spinner"></div></div></div>
    <div class="catalog-more" id="catalog-more" hidden><button class="button button--secondary" type="button">Muat 100 buku lagi</button></div>`;
  const categorySelect = document.getElementById("category-filter");
  const results = document.getElementById("catalog-results");
  const more = document.getElementById("catalog-more");
  const input = document.getElementById("catalog-query");
  let category = initialCategory;
  let categories = [];
  let allBooks = [];
  let filteredBooks = [];
  let visibleCount = 100;

  function drawBooks() {
    const visible = filteredBooks.slice(0, visibleCount);
    document.getElementById("catalog-count").textContent = `${filteredBooks.length.toLocaleString("id-ID")} buku`;
    if (visible.length) results.innerHTML = visible.map(bookCard).join("");
    else renderEmpty(results, { title: "Buku tidak ditemukan", message: "Coba kata kunci atau kategori lain.", iconName: "search" });
    more.hidden = visible.length >= filteredBooks.length;
  }

  async function load(trackSearch = false) {
    results.innerHTML = `<div class="loading-region"><div class="spinner"></div></div>`;
    try {
      const needle = input.value.trim().toLocaleLowerCase("id-ID");
      filteredBooks = allBooks.filter((book) => {
        const matchesCategory = !category || book.category?.slug === category;
        const haystack = `${book.title} ${book.authors} ${book.isbn || ""} ${book.category?.name || ""}`.toLocaleLowerCase("id-ID");
        return matchesCategory && (!needle || haystack.includes(needle));
      });
      visibleCount = 100;
      // Popularity tracking must never block catalogue results.
      if (trackSearch && needle && filteredBooks.length) recordBookSearch(filteredBooks.slice(0, 100).map((book) => book.id)).catch(() => {});
      drawBooks();
    } catch (error) {
      renderError(results, friendlyError(error));
    }
  }

  try {
    [categories, allBooks] = await Promise.all([listCategories(), listCatalogBooks()]);
    const populatedCategoryIds = new Set(allBooks.map((book) => book.category?.id).filter(Boolean));
    categories = categories.filter((item) => populatedCategoryIds.has(item.id));
    categorySelect.innerHTML = [["", "Semua genre"], ...categories.map((item) => [item.slug, item.name])].map(([slug, name]) => `<option value="${escapeHtml(slug)}" ${slug === category ? "selected" : ""}>${escapeHtml(name)}</option>`).join("");
    categorySelect.disabled = false;
    categorySelect.addEventListener("change", () => {
      category = categorySelect.value;
      load();
    });
    document.getElementById("catalog-search").addEventListener("submit", (event) => { event.preventDefault(); load(true); });
    more.addEventListener("click", () => { visibleCount += 100; drawBooks(); });
    await load(Boolean(initialQuery));
  } catch (error) {
    renderError(results, friendlyError(error));
  }
}

async function renderSearch() {
  main.className = "search-page";
  main.innerHTML = `
    <div class="search-page__bar">
      <a class="search-page__back" href="./index.html" aria-label="Kembali ke beranda">${icon("arrowLeft")}</a>
      <form class="search-field search-page__form" id="book-search">
        ${icon("search")}<label class="sr-only" for="search-query">Cari buku</label>
        <input id="search-query" type="search" autocomplete="off" placeholder="Cari judul, penulis, kategori, atau ISBN..." autofocus>
      </form>
    </div>
    <section aria-live="polite">
      <div class="section-heading search-page__heading"><h1 id="search-title">Pencarian Terpopuler</h1></div>
      <div id="search-results" class="popular-search-list"><div class="loading-region"><div class="spinner"></div></div></div>
    </section>`;

  const input = document.getElementById("search-query");
  const results = document.getElementById("search-results");
  const title = document.getElementById("search-title");
  let catalogBooks = null;

  async function showPopular() {
    results.className = "popular-search-list";
    results.innerHTML = `<div class="loading-region"><div class="spinner"></div></div>`;
    try {
      const books = await listPopularBooks(8);
      if (!books.length) {
        renderEmpty(results, { title: "Belum ada pencarian populer", message: "Cari buku untuk mulai membangun daftar populer.", iconName: "search" });
        return;
      }
      results.innerHTML = books.map((book) => `<a class="popular-search-item" href="./book.html?id=${encodeURIComponent(book.id)}">${icon("clock")}<span>${escapeHtml(book.title)}</span>${icon("arrowRight")}</a>`).join("");
    } catch (error) {
      renderError(results, friendlyError(error));
    }
  }

  async function searchBooks() {
    const query = input.value.trim();
    if (!query) {
      title.textContent = "Pencarian Terpopuler";
      await showPopular();
      return;
    }
    title.textContent = `Hasil untuk “${query}”`;
    results.className = "book-grid";
    results.innerHTML = `<div class="loading-region"><div class="spinner"></div></div>`;
    try {
      catalogBooks ||= await listCatalogBooks();
      const needle = query.toLocaleLowerCase("id-ID");
      const books = catalogBooks.filter((book) => `${book.title} ${book.authors} ${book.isbn || ""} ${book.category?.name || ""}`.toLocaleLowerCase("id-ID").includes(needle)).slice(0, 60);
      if (books.length) {
        results.innerHTML = books.map(bookCard).join("");
        recordBookSearch(books.map((book) => book.id)).catch(() => {});
      } else {
        renderEmpty(results, { title: "Buku tidak ditemukan", message: "Coba judul, penulis, kategori, atau ISBN lain.", iconName: "search" });
      }
    } catch (error) {
      renderError(results, friendlyError(error));
    }
  }

  document.getElementById("book-search").addEventListener("submit", (event) => { event.preventDefault(); searchBooks(); });
  input.addEventListener("search", () => { if (!input.value) searchBooks(); });
  await showPopular();
}

async function renderBookDetail() {
  main.className = "book-detail-page";
  const bookId = queryParam("id");
  if (!bookId) {
    renderEmpty(main, { title: "Buku tidak ditemukan", message: "Tautan buku tidak lengkap.", actionHref: "./catalog.html", actionLabel: "Kembali ke Katalog" });
    return;
  }
  main.innerHTML = `<div class="loading-region"><div class="spinner"></div></div>`;
  try {
    const [book, favorite] = await Promise.all([getBook(bookId), isFavorite(bookId)]);
    const available = Number(book.available_stock) > 0;
    main.innerHTML = `
      <section class="book-detail__hero">
        ${coverImage(book, "book-detail__cover")}
        <div class="book-detail__summary"><h1 class="book-detail__title">${escapeHtml(book.title)}</h1><p class="book-detail__author">${escapeHtml(book.authors || "Penulis tidak tersedia")}</p><div class="book-detail__facts"><span>${icon("book")}${escapeHtml(book.publisher || "Penerbit tidak tersedia")}</span><span>${icon("clock")}${book.publish_year || "Tahun tidak tersedia"}<i></i>${icon("shelves")}${escapeHtml(book.isbn || "ISBN tidak tersedia")}</span><span class="badge badge--blue">${escapeHtml(book.category?.name || "Tanpa kategori")}</span></div></div>
      </section>
      <div class="detail-grid">
        <section class="card detail-card"><div class="detail-card__heading"><h2>Sinopsis</h2>${icon("book")}</div><p>${escapeHtml(book.synopsis || "Sinopsis belum tersedia.")}</p></section>
        <section class="card detail-card"><h2>Informasi Inventaris</h2><div class="stock-grid"><div class="stock-box"><span>Jumlah Buku</span><strong>${book.total_stock}</strong></div><div class="stock-box"><span>Buku Tersedia</span><strong>${book.available_stock}</strong></div></div></section>
        <section class="card detail-card detail-card--location"><div class="detail-card__heading"><h2>${icon("location")} Lokasi Buku</h2></div><span class="shelf-label">Rak</span><div class="shelf-location"><span class="shelf-location__icon">${icon("shelves")}</span><div><strong>${escapeHtml(book.shelf_location || "Belum ditentukan")}</strong><small>Kode rak perpustakaan</small></div>${icon("arrowRight")}</div></section>
        <section class="card availability-card ${available ? "" : "availability-card--none"}"><p>Status Ketersediaan</p><h2>${available ? "Tersedia" : "Tidak Tersedia"}</h2><p>${available ? "Buku dapat diajukan untuk dipinjam." : "Seluruh eksemplar sedang dipinjam."}</p></section>
      </div>
      <div class="detail-actions stack">
        <button class="button button--secondary button--block" id="favorite-button" type="button">${icon("heart")}<span>${favorite ? "Hapus dari Favorit" : "Tambah ke Favorit"}</span></button>
        <button class="button button--primary button--block" id="loan-button" type="button" ${available ? "" : "disabled"}>${icon("clipboard")}<span>${available ? "Ajukan Peminjaman" : "Buku Tidak Tersedia"}</span></button>
      </div>`;
    let favoriteState = favorite;
    document.getElementById("favorite-button").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      setBusy(button, true);
      try {
        favoriteState = await toggleFavorite(bookId, favoriteState);
        button.innerHTML = `${icon("heart")}<span>${favoriteState ? "Hapus dari Favorit" : "Tambah ke Favorit"}</span>`;
        showToast(favoriteState ? "Buku ditambahkan ke favorit." : "Buku dihapus dari favorit.", "success");
      } catch (error) { showToast(friendlyError(error), "danger"); }
      finally { button.disabled = false; }
    });
    document.getElementById("loan-button").addEventListener("click", async (event) => {
      const confirmed = await confirmDialog({ title: "Ajukan peminjaman?", message: `Pengajuan untuk “${book.title}” akan dikirim ke pengelola.`, confirmLabel: "Ajukan Peminjaman" });
      if (!confirmed) return;
      const button = event.currentTarget;
      setBusy(button, true, "Mengirim...");
      try {
        await requestLoan(bookId);
        showToast("Pengajuan peminjaman berhasil dikirim.", "success");
        window.location.assign("./loans.html");
      } catch (error) {
        showToast(friendlyError(error), "danger");
        setBusy(button, false);
      }
    });
  } catch (error) {
    renderError(main, friendlyError(error));
  }
}

function loanCard(loan) {
  const canReturn = loan.status === "BORROWED";
  const canExtend = canReturn && !loan.extension_status && isDueSoon(loan.due_at);
  const dateLabel = loan.borrowed_at ? "Tanggal Pinjam" : "Tanggal Pengajuan";
  const dateValue = loan.borrowed_at || loan.requested_at;
  const extensionNotice = ({
    PENDING: ["notice--warning", "Permintaan perpanjangan sedang menunggu keputusan pengelola."],
    APPROVED: ["notice--success", "Perpanjangan disetujui. Batas kembali sudah ditambah 7 hari."],
    REJECTED: ["notice--danger", "Permintaan perpanjangan ditolak oleh pengelola."],
    CANCELLED: ["", "Permintaan perpanjangan dibatalkan karena pengembalian diajukan."]
  })[loan.extension_status];
  return `<article class="loan-card card">
    <div class="loan-card__header"><div><h2>${escapeHtml(loan.book?.title || "Buku")}</h2><span class="loan-card__id">ID: ${escapeHtml(loan.id.slice(0, 8).toUpperCase())}</span></div><span class="badge ${statusBadgeClass(loan.status)}">${statusLabel(loan.status)}</span></div>
    <div class="loan-card__dates"><div><span>${dateLabel}</span><strong>${formatDate(dateValue)}</strong></div><div class="${canExtend ? "loan-card__due--urgent" : ""}"><span>Batas Kembali</span><strong>${formatDate(loan.due_at)}</strong></div></div>
    ${loan.rejection_reason ? `<div class="notice notice--danger">${icon("alert")}<span>${escapeHtml(loan.rejection_reason)}</span></div>` : ""}
    ${extensionNotice ? `<div class="notice ${extensionNotice[0]}">${icon("info")}<span>${extensionNotice[1]}</span></div>` : ""}
    ${canReturn ? `<div class="loan-card__actions">${canExtend ? `<button class="button button--primary button--block" type="button" data-extension="${loan.id}">Ajukan Perpanjangan 7 Hari</button>` : ""}<button class="button button--secondary button--block" type="button" data-return="${loan.id}">Ajukan Pengembalian</button></div>` : ""}
  </article>`;
}

async function renderLoans() {
  main.className = "page-container page-container--narrow";
  main.innerHTML = `<div id="loan-results" class="loan-list"><div class="loading-region"><div class="spinner"></div></div></div>`;
  const host = document.getElementById("loan-results");
  async function load() {
    try {
      const loans = await listMyLoans();
      if (loans.length) host.innerHTML = loans.map(loanCard).join("") + `<div class="notice">${icon("info")}<span>Bawa buku fisik ke meja sirkulasi dan tunjukkan pengajuan kepada petugas.</span></div>`;
      else renderEmpty(host, { title: "Belum ada pinjaman", message: "Buku yang Anda ajukan akan tampil di sini.", actionHref: "./catalog.html", actionLabel: "Cari Buku" });
    } catch (error) { renderError(host, friendlyError(error)); }
  }
  host.addEventListener("click", async (event) => {
    const extensionButton = event.target.closest("[data-extension]");
    if (extensionButton) {
      const confirmed = await confirmDialog({ title: "Ajukan perpanjangan?", message: "Jika disetujui pengelola, batas kembali akan ditambah 7 hari.", confirmLabel: "Ajukan Perpanjangan" });
      if (!confirmed) return;
      setBusy(extensionButton, true, "Mengirim...");
      try { await requestLoanExtension(extensionButton.dataset.extension); showToast("Permintaan perpanjangan dikirim.", "success"); await load(); }
      catch (error) { showToast(friendlyError(error), "danger"); setBusy(extensionButton, false); }
      return;
    }
    const button = event.target.closest("[data-return]");
    if (!button) return;
    const confirmed = await confirmDialog({ title: "Ajukan pengembalian?", message: "Stok baru bertambah setelah petugas menerima buku fisik.", confirmLabel: "Ajukan" });
    if (!confirmed) return;
    setBusy(button, true);
    try { await requestReturn(button.dataset.return); showToast("Pengajuan pengembalian dikirim.", "success"); await load(); }
    catch (error) { showToast(friendlyError(error), "danger"); setBusy(button, false); }
  });
  await load();
}

async function renderFavorites() {
  main.className = "page-container page-container--narrow favorites-page";
  main.innerHTML = `<div id="favorite-results" class="favorite-list"><div class="loading-region"><div class="spinner"></div></div></div>`;
  const host = document.getElementById("favorite-results");
  async function load() {
    try {
      const books = await listFavorites();
      if (books.length) host.innerHTML = books.map((book) => `<article class="favorite-card">
        <a class="favorite-card__link" href="./book.html?id=${encodeURIComponent(book.id)}">
          ${coverImage(book, "", true)}
          <div><h2>${escapeHtml(book.title)}</h2><p>${escapeHtml(book.authors || "Penulis tidak tersedia")}</p><span class="badge badge--blue">${escapeHtml(book.category?.name || "Tanpa kategori")}</span></div>
          <span class="favorite-card__arrow">${icon("arrowRight")}</span>
        </a>
        <button class="favorite-card__heart" type="button" data-remove-favorite="${book.id}" aria-label="Hapus ${escapeHtml(book.title)} dari favorit">${icon("heart")}</button>
      </article>`).join("");
      else renderEmpty(host, { title: "Belum ada favorit", message: "Tambahkan buku dari katalog agar mudah ditemukan kembali.", actionHref: "./catalog.html", actionLabel: "Buka Katalog", iconName: "heart" });
    } catch (error) { renderError(host, friendlyError(error)); }
  }
  host.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-remove-favorite]");
    if (!button) return;
    button.disabled = true;
    try { await toggleFavorite(button.dataset.removeFavorite, true); showToast("Buku dihapus dari favorit.", "success"); await load(); }
    catch (error) { showToast(friendlyError(error), "danger"); button.disabled = false; }
  });
  await load();
}

function exportHistory(history) {
  const rows = [["Judul", "Penulis", "Tanggal Pinjam", "Tanggal Kembali"], ...history.map((item) => [item.book?.title || "", item.book?.authors || "", formatDate(item.borrowed_at), formatDate(item.returned_at)])];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  link.download = "riwayat-bacaan-litera.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

async function renderHistory() {
  main.className = "page-container page-container--narrow history-page";
  main.innerHTML = `<div class="history-toolbar" role="tablist" aria-label="Jenis riwayat bacaan">
    <button class="history-tab" type="button" role="tab" data-history-view="current" aria-selected="true">Sedang Dibaca</button>
    <button class="history-tab" type="button" role="tab" data-history-view="completed" aria-selected="false">Selesai Dibaca</button>
    <button class="history-export" id="export-history" type="button" aria-label="Unduh riwayat selesai sebagai CSV" disabled>${icon("download")} CSV</button>
  </div><div id="history-results" class="reading-list" role="tabpanel"><div class="loading-region"><div class="spinner"></div></div></div>
  <div class="reading-habit">${icon("checkCircle")}<div><strong>Kebiasaan kecil, dampak besar!</strong><span>Pertahankan konsistensimu.</span></div></div>`;
  const host = document.getElementById("history-results");
  const exportButton = document.getElementById("export-history");
  let history = [];
  let currentLoans = [];

  function readingCard(item, current = false) {
    const book = item.book || {};
    const highlightLabel = current ? "Batas kembali" : "Terakhir dibaca";
    const highlightDate = current ? item.due_at : item.returned_at;
    return `<article class="reading-card">
      ${coverImage(book, "reading-card__cover", true)}
      <div class="reading-card__body"><h2>${escapeHtml(book.title || "Buku")}</h2><p>${escapeHtml(book.authors || "Penulis tidak tersedia")}</p>
        <div class="reading-card__highlight">${icon(current ? "clock" : "checkCircle")}<span><small>${highlightLabel}</small><strong>${formatDate(highlightDate)}</strong></span></div>
      </div>
      <div class="reading-card__borrowed">${icon("clock")}<span>Dipinjam: ${formatDate(item.borrowed_at)}</span></div>
    </article>`;
  }

  function draw(view) {
    document.querySelectorAll("[data-history-view]").forEach((button) => button.setAttribute("aria-selected", String(button.dataset.historyView === view)));
    const items = view === "current" ? currentLoans : history;
    if (items.length) host.innerHTML = items.map((item) => readingCard(item, view === "current")).join("");
    else renderEmpty(host, { title: view === "current" ? "Belum ada buku yang sedang dibaca" : "Riwayat masih kosong", message: view === "current" ? "Buku yang sudah diambil dari perpustakaan akan tampil di sini." : "Buku yang selesai dikembalikan akan tercatat di sini.", iconName: "book" });
  }

  try {
    const [completed, loans] = await Promise.all([listReadingHistory(), listMyLoans()]);
    history = completed;
    currentLoans = loans.filter((loan) => isCurrentReading(loan.status));
    exportButton.disabled = !history.length;
    draw(currentLoans.length ? "current" : "completed");
  } catch (error) { renderError(host, friendlyError(error)); }

  document.querySelector(".history-toolbar").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-history-view]");
    if (tab) draw(tab.dataset.historyView);
  });
  exportButton.addEventListener("click", async () => {
    const confirmed = await confirmDialog({ title: "Unduh Riwayat Bacaan?", message: "Riwayat buku yang selesai dibaca akan diunduh dalam format CSV.", confirmLabel: "Unduh CSV" });
    if (confirmed) exportHistory(history);
  });
}

async function renderProfile(identity) {
  header.remove();
  main.className = "";
  main.innerHTML = `
    <section class="topbar topbar--compact profile-hero"><div class="topbar__inner profile-hero__inner"><div class="profile-identity"><img src="../assets/sman4-logo.png" alt="Logo SMAN 4 Tangerang Selatan"><div><h1>${escapeHtml(identity.profile.full_name)}</h1><p>${escapeHtml(identity.profile.class_name)}, ${escapeHtml(identity.profile.major)}</p></div></div><div class="profile-hero__nav"><div class="student-header-actions">${renderStudentDesktopNavigation("profil")}<span class="student-header-spacer" aria-hidden="true"></span></div></div></div></section>
    <div class="page-container page-container--narrow stack">
      <div class="profile-menu card">
        <a href="./history.html">${icon("book")}<span>Riwayat Bacaan</span>${icon("arrowRight")}</a>
        <a href="../forgot-password.html">${icon("lock")}<span>Ubah Password</span>${icon("arrowRight")}</a>
        <a href="./info.html?view=privacy">${icon("shield")}<span>Kebijakan Privasi</span>${icon("arrowRight")}</a>
        <a href="./info.html?view=help">${icon("help")}<span>Bantuan</span>${icon("arrowRight")}</a>
      </div>
      <button class="button button--danger button--block" id="logout-button" type="button">${icon("logout")} Keluar</button>
      <p style="text-align:center;color:var(--ink-500);font-size:.78rem">LITERA Smart Library, SMAN 4 Tangerang Selatan</p>
    </div>`;
  document.getElementById("logout-button").addEventListener("click", async () => {
    if (!await confirmDialog({ title: "Keluar dari LITERA?", message: "Anda perlu login kembali untuk mengakses layanan.", confirmLabel: "Keluar", danger: true })) return;
    await signOut();
    window.location.replace("../index.html");
  });
}

function renderInfo() {
  main.className = "page-container page-container--narrow";
  if (queryParam("view") === "privacy") {
    document.title = "Kebijakan Privasi";
    main.innerHTML = `<article class="card stack"><p>Terakhir diperbarui: 22 Oktober 2026</p><section><h2>1. Informasi yang Kami Kumpulkan</h2><p>LITERA menyimpan data identitas siswa yang diperlukan untuk validasi akun dan catatan transaksi perpustakaan.</p></section><section><h2>2. Penggunaan Informasi</h2><p>Data digunakan untuk pengelolaan akun, katalog, peminjaman, pengembalian, dan komunikasi layanan perpustakaan.</p></section><section><h2>3. Perlindungan Data</h2><p>Akses dibatasi berdasarkan peran dan kepemilikan data melalui autentikasi dan kebijakan keamanan basis data.</p></section><section><h2>4. Hak Pengguna</h2><p>Siswa dapat melihat data profil dan riwayat miliknya sendiri serta meminta koreksi melalui petugas perpustakaan.</p></section></article>`;
    return;
  }
  document.title = "Bantuan";
  main.innerHTML = `<section class="help-intro"><span class="help-intro__icon">${icon("message")}</span><div><h2>Hai, ada yang bisa kami bantu?</h2><p>Temukan jawaban di bawah atau hubungi petugas bila masalah belum selesai.</p></div></section>
  <section class="help-section"><h2>Pertanyaan Umum</h2><div class="info-list">
    <details><summary><span>Cara meminjam buku</span>${icon("arrowRight")}</summary><div>Cari buku yang berstatus tersedia di Katalog, buka detail buku, lalu pilih <strong>Ajukan Peminjaman</strong>. Permintaan masuk ke dashboard pustakawan. Ambil buku setelah permintaan disetujui; batas pinjam ditetapkan satu minggu sejak tanggal peminjaman.</div></details>
    <details><summary><span>Cara mengembalikan buku</span>${icon("arrowRight")}</summary><div>Buka menu Pinjaman dan pilih pengajuan pengembalian, lalu serahkan buku fisik kepada petugas. Pinjaman dinyatakan selesai setelah pustakawan mengonfirmasi penerimaan buku. Tanggal dan waktu pengembalian akan tercatat otomatis.</div></details>
    <details><summary><span>Perpanjang masa peminjaman</span>${icon("arrowRight")}</summary><div>Saat jatuh tempo sudah dekat, tombol perpanjangan akan tersedia di menu Pinjaman. Kirim permintaan satu kali dan tunggu keputusan pustakawan. Batas kembali berubah hanya jika permintaan disetujui.</div></details>
    <details><summary><span>Keterlambatan pengembalian</span>${icon("arrowRight")}</summary><div>Pinjaman yang melewati batas kembali akan ditandai terlambat. Segera kembalikan buku dan hubungi petugas untuk mengetahui ketentuan perpustakaan yang berlaku.</div></details>
    <details><summary><span>Masalah akun dan login</span>${icon("arrowRight")}</summary><div>Akun siswa baru dapat digunakan setelah disetujui pustakawan. Jika lupa password, gunakan menu Lupa Password pada halaman login. Hubungi petugas bila email tidak dikenali atau akun belum aktif.</div></details>
  </div></section>
  <section class="help-contact"><div><strong>Masih butuh bantuan?</strong><span>Senin–Jumat, 08.00–16.00 WIB</span></div><a href="mailto:library@sman4.sch.id">${icon("mail")} Hubungi petugas</a></section>`;
}

async function initialize() {
  renderShell(null);
  let identity;
  try {
    identity = await requireRole("STUDENT");
    if (!identity) return;
  } catch (error) {
    if (error instanceof MissingConfigurationError) { configurationBlock(); return; }
    renderError(main, friendlyError(error));
    return;
  }
  renderShell(identity);
  if (page === "home") await renderHome(identity);
  if (page === "search") await renderSearch();
  if (page === "catalog") await renderCatalog();
  if (page === "book") await renderBookDetail();
  if (page === "loans") await renderLoans();
  if (page === "favorites") await renderFavorites();
  if (page === "history") await renderHistory();
  if (page === "profile") await renderProfile(identity);
  if (page === "info") renderInfo();
}

initialize();

