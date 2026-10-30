import { confirmDialog, renderEmpty, renderError, setBusy, showToast } from "../components/feedback.js";
import { icon } from "../components/icons.js";
import { renderLibrarianNavigation } from "../components/navigation.js";
import { initializeSelectMenus } from "../components/select-menu.js";
import { downloadBooksCsv, downloadBooksSpreadsheet } from "../book-export.js";
import { archiveBook, bookCoverStoragePath, getBook, listArchivedBooks, listBooks, listBooksForExport, listCategories, removeBookCover, restoreBook, saveBook, uploadBookCover } from "../services/book-service.js";
import { requireRole, signOut } from "../services/auth-service.js";
import { approveLoan, confirmReturn, listAllLoans, markBorrowed, rejectLoan, reviewLoanExtension, subscribeToLoans } from "../services/loan-service.js";
import { getOpenLibrarySynopsis, searchBookMetadata } from "../services/open-library-service.js";
import { dashboardMetrics, listStudents, reviewStudent, subscribeToStudentRegistrations } from "../services/student-service.js";
import { MissingConfigurationError } from "../services/supabase.js";
import { escapeHtml, formatDate, friendlyError, isActiveLoanStatus, isBeforeDue, statusBadgeClass, statusLabel } from "../utils.js";

const page = document.body.dataset.page;
const main = document.getElementById("admin-main");
const fallbackCoverUrl = "../assets/book-placeholder.svg";

main.addEventListener("error", (event) => {
  const image = event.target.closest?.("img[data-book-cover]");
  if (image && !image.src.endsWith("/book-placeholder.svg")) image.src = fallbackCoverUrl;
}, true);

initializeSelectMenus();

const pageTitles = {
  dashboard: ["Overview", "Ringkasan layanan perpustakaan"],
  students: ["Validasi Siswa", "Periksa dan kelola status pendaftaran"],
  books: ["Data Buku", "Kelola metadata dan stok koleksi fisik"],
  archive: ["Arsip Buku", "Koleksi yang tidak lagi tampil di katalog"],
  loans: ["Data Peminjaman", "Proses pengajuan, perpanjangan, dan pengembalian"],
  transactions: ["Data Transaksi", "Riwayat seluruh aktivitas peminjaman"]
};

function renderShell(identity) {
  const [title, subtitle] = pageTitles[page];
  document.getElementById("admin-header").innerHTML = `
    <button class="admin-menu-toggle" type="button" data-sidebar-toggle aria-controls="admin-sidebar" aria-expanded="false" aria-label="Buka atau tutup menu">${icon("book")}</button>
    <div class="admin-header__title"><div class="admin-breadcrumb"><span>${title}</span></div><p>${subtitle}</p></div>
    <div class="admin-brand"><div><strong>${escapeHtml(identity?.profile?.full_name || "Pengelola")}</strong><span>Pustakawan</span></div></div>`;
  const activeNavigation = { dashboard: "dashboard", students: "siswa", books: "buku", archive: "arsip", loans: "pinjaman", transactions: "pinjaman" }[page];
  document.getElementById("admin-nav").innerHTML = renderLibrarianNavigation(activeNavigation);
  if (!document.body.dataset.sidebarReady) {
    document.body.classList.toggle("admin-sidebar-open", matchMedia("(min-width: 760px)").matches);
    document.body.dataset.sidebarReady = "true";
  }
  const toggle = document.querySelector("[data-sidebar-toggle]");
  const setSidebar = (open) => {
    document.body.classList.toggle("admin-sidebar-open", open);
    toggle.setAttribute("aria-expanded", String(open));
  };
  toggle.addEventListener("click", () => setSidebar(!document.body.classList.contains("admin-sidebar-open")));
  document.querySelector("[data-sidebar-close]").addEventListener("click", () => setSidebar(false));
  document.querySelectorAll(".admin-nav .nav-item").forEach((link) => link.addEventListener("click", () => {
    if (!matchMedia("(min-width: 760px)").matches) setSidebar(false);
  }));
  setSidebar(document.body.classList.contains("admin-sidebar-open"));
  document.querySelectorAll("[data-admin-logout]").forEach((button) => button.addEventListener("click", async () => {
      if (!await confirmDialog({ title: "Keluar dari dashboard?", message: "Sesi pengelola akan diakhiri.", confirmLabel: "Keluar", danger: true })) return;
      await signOut();
      window.location.replace("../admin-login.html");
    }));
}

function configurationBlock() {
  main.innerHTML = `<div class="notice notice--warning">${icon("info")}<span>Supabase belum dikonfigurasi. Isi konfigurasi lokal sebelum dashboard dapat memuat data.</span></div>`;
}

function metricCard(iconName, label, value, description, size = "") {
  return `<article class="dashboard-metric ${size}"><div class="dashboard-metric__value"><span>${icon(iconName)}</span><strong>${Number(value || 0).toLocaleString("id-ID")}</strong></div><h2>${label}</h2><p>${description}</p></article>`;
}

async function renderDashboard(identity) {
  const today = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date());
  main.innerHTML = `<div class="dashboard-heading"><div><h1>Dashboard</h1><p>Selamat datang kembali, ${escapeHtml(identity.profile.full_name)}.</p></div><time>${today}</time></div><div id="metrics" class="dashboard-metrics"><div class="loading-region"><div class="spinner"></div></div></div>`;
  const metricsHost = document.getElementById("metrics");
  let loading = false;
  async function load(showLoading = true) {
    if (loading) return;
    loading = true;
    if (showLoading) metricsHost.innerHTML = `<div class="loading-region"><div class="spinner"></div></div>`;
    try {
      const [metrics, loans] = await Promise.all([dashboardMetrics(), listAllLoans()]);
      const pendingReturns = loans.filter((loan) => loan.status === "RETURN_REQUESTED").length;
      const now = new Date();
      const monthlyTransactions = loans.filter((loan) => {
        const requested = new Date(loan.requested_at);
        return requested.getFullYear() === now.getFullYear() && requested.getMonth() === now.getMonth();
      }).length;
      metricsHost.innerHTML = [
        metricCard("book", "Total Koleksi Buku", metrics.total_books, "Judul buku fisik", "dashboard-metric--wide"),
        metricCard("plus", "Ditambahkan 7 Hari", metrics.books_added_7_days, "Koleksi buku terbaru", "dashboard-metric--wide"),
        metricCard("users", "Menunggu Validasi", metrics.pending_students, "Registrasi siswa baru", "dashboard-metric--wide"),
        metricCard("clock", "Peminjaman Aktif", metrics.active_loans, "Buku sedang dipinjam"),
        metricCard("checkCircle", "Menunggu Pengembalian", pendingReturns, "Perlu dikonfirmasi"),
        metricCard("clipboard", "Transaksi Bulan Ini", monthlyTransactions, "Pengajuan peminjaman")
      ].join("");
    } catch (error) {
      renderError(metricsHost, friendlyError(error));
    } finally {
      loading = false;
    }
  }
  await load();
  const stops = await Promise.all([subscribeToStudentRegistrations(() => load(false)), subscribeToLoans(() => load(false))]);
  window.addEventListener("pagehide", () => stops.forEach((stop) => stop()), { once: true });
}

async function renderStudents() {
  main.innerHTML = `<div class="student-management-sticky"><section class="student-overview" aria-label="Ringkasan status siswa"><article class="student-overview--pending"><span>${icon("clock")}</span><div><strong id="student-stat-pending">0</strong><h2>Menunggu Validasi</h2><p>Perlu ditinjau pustakawan</p></div></article><article class="student-overview--active"><span>${icon("checkCircle")}</span><div><strong id="student-stat-active">0</strong><h2>Aktif</h2><p>Akun sudah terverifikasi</p></div></article><article class="student-overview--rejected"><span>${icon("close")}</span><div><strong id="student-stat-rejected">0</strong><h2>Ditolak</h2><p>Registrasi tidak disetujui</p></div></article></section><div class="toolbar toolbar--students"><div class="search-field">${icon("search")}<label class="sr-only" for="student-search">Cari siswa</label><input id="student-search" type="search" placeholder="Cari nama, kelas, email..."></div><div class="status-filter"><label class="sr-only" for="student-status">Filter status siswa</label><select id="student-status"><option value="">Semua status</option><option value="PENDING">Menunggu</option><option value="ACTIVE">Aktif</option><option value="REJECTED">Ditolak</option></select></div></div></div><div id="student-results" aria-live="polite"></div>`;
  const host = document.getElementById("student-results");
  let students = [];
  let loading = false;

  function drawOverview() {
    document.getElementById("student-stat-pending").textContent = students.filter((student) => student.status === "PENDING").length.toLocaleString("id-ID");
    document.getElementById("student-stat-active").textContent = students.filter((student) => student.status === "ACTIVE").length.toLocaleString("id-ID");
    document.getElementById("student-stat-rejected").textContent = students.filter((student) => student.status === "REJECTED").length.toLocaleString("id-ID");
  }

  function draw() {
    const needle = document.getElementById("student-search").value.toLocaleLowerCase("id-ID");
    const status = document.getElementById("student-status").value;
    const filtered = students.filter((student) => (!status || student.status === status) && `${student.full_name} ${student.class_name} ${student.email}`.toLocaleLowerCase("id-ID").includes(needle));
    if (!filtered.length) {
      renderEmpty(host, { title: "Tidak ada data siswa", message: "Ubah filter atau tunggu pendaftaran baru.", iconName: "users" });
      return;
    }
    host.innerHTML = `<div class="student-list">${filtered.map((student) => `<article class="student-row">
      <div class="student-row__identity"><h2>${escapeHtml(student.full_name)}</h2><p>${escapeHtml(student.class_name)} · ${escapeHtml(student.email)}</p></div>
      <span class="badge ${statusBadgeClass(student.status)}">${statusLabel(student.status)}</span>
      <div class="student-row__actions">
        <button class="button button--small button--secondary" type="button" data-student-detail="${student.id}">Detail</button>
        ${student.status === "PENDING" ? `<button class="button button--small button--primary" type="button" data-student-action="ACTIVE" data-student="${student.id}">${icon("check")} Setujui</button><button class="button button--small button--danger" type="button" data-student-action="REJECTED" data-student="${student.id}">${icon("close")} Tolak</button>` : ""}
      </div>
    </article>`).join("")}</div>`;
  }

  function openStudentDetail(student) {
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "student-detail-title");
    modal.innerHTML = `<div class="modal__dialog student-detail">
      <div class="modal__header"><div><h2 id="student-detail-title">Detail Siswa</h2><p>Data yang diisi saat registrasi.</p></div><button class="icon-button" type="button" data-close aria-label="Tutup">${icon("close")}</button></div>
      <dl class="student-detail__list">
        <div><dt>Nama lengkap</dt><dd>${escapeHtml(student.full_name)}</dd></div>
        <div><dt>Email</dt><dd>${escapeHtml(student.email)}</dd></div>
        <div><dt>Kelas</dt><dd>${escapeHtml(student.class_name)}</dd></div>
        <div><dt>Jurusan</dt><dd>${escapeHtml(student.major)}</dd></div>
        <div><dt>Tahun masuk</dt><dd>${student.enrollment_year}</dd></div>
        <div><dt>Tanggal daftar</dt><dd>${formatDate(student.created_at)}</dd></div>
        <div><dt>Status</dt><dd><span class="badge ${statusBadgeClass(student.status)}">${statusLabel(student.status)}</span></dd></div>
      </dl>
      <button class="button button--secondary button--block" type="button" data-close>Tutup</button>
    </div>`;
    const close = () => modal.remove();
    modal.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", close));
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
    document.body.append(modal);
    modal.querySelector("[data-close]").focus();
  }

  async function load(showLoading = true) {
    if (loading) return;
    loading = true;
    if (showLoading) host.innerHTML = `<div class="loading-region"><div class="spinner"></div></div>`;
    try { students = await listStudents(); drawOverview(); draw(); }
    catch (error) { renderError(host, friendlyError(error)); }
    finally { loading = false; }
  }

  document.getElementById("student-search").addEventListener("input", draw);
  document.getElementById("student-status").addEventListener("change", draw);
  host.addEventListener("click", async (event) => {
    const detailButton = event.target.closest("[data-student-detail]");
    if (detailButton) {
      const student = students.find((item) => item.id === detailButton.dataset.studentDetail);
      if (student) openStudentDetail(student);
      return;
    }
    const button = event.target.closest("[data-student-action]");
    if (!button) return;
    const decision = button.dataset.studentAction;
    const approve = decision === "ACTIVE";
    if (!await confirmDialog({ title: approve ? "Setujui siswa?" : "Tolak pendaftaran?", message: approve ? "Siswa akan dapat login setelah disetujui." : "Siswa tidak akan dapat menggunakan akun ini.", confirmLabel: approve ? "Setujui" : "Tolak", danger: !approve })) return;
    setBusy(button, true);
    try { await reviewStudent(button.dataset.student, decision); showToast(approve ? "Siswa disetujui dan sekarang dapat login." : "Pendaftaran siswa ditolak.", "success"); await load(false); }
    catch (error) { showToast(friendlyError(error), "danger"); setBusy(button, false); }
  });
  await load();

  let stopRealtime = () => {};
  subscribeToStudentRegistrations(() => load(false)).then((stop) => { stopRealtime = stop; }).catch(() => {});
  window.addEventListener("pagehide", () => {
    stopRealtime();
  }, { once: true });
}

function bookFormMarkup(book = {}, categories = [], manualUpload = false) {
  const coverField = `<div class="field book-form__cover book-cover-upload"><label for="book-cover">URL Sampul</label><input id="book-cover" name="coverUrl" type="url" value="${escapeHtml(book.cover_url || "")}" placeholder="https://..."><div class="book-cover-alternative"><span>atau unggah dari perangkat${manualUpload ? " *" : ""}</span><input id="book-cover-file" name="coverFile" type="file" accept="image/jpeg,image/png,image/webp"></div><p class="field__hint">Pilih salah satu. URL eksternal disimpan langsung. Upload lokal maksimal 2 MB dan dikonversi ke WebP maksimal 1200 px serta 600 KB.</p></div>`;
  return `<form id="book-form" class="book-form" autocomplete="off">
    <input type="hidden" name="id" value="${escapeHtml(book.id || "")}"><input type="hidden" name="openLibraryKey" value="${escapeHtml(book.open_library_key || "")}">
    <div class="field book-form__isbn"><label for="book-isbn">ISBN</label><input id="book-isbn" name="isbn" value="${escapeHtml(book.isbn || "")}" inputmode="numeric" autocomplete="off" spellcheck="false"></div>
    <div class="field book-form__year"><label for="book-year">Tahun</label><input id="book-year" name="publishYear" type="number" min="1000" max="2100" value="${escapeHtml(book.publish_year || "")}"></div>
    <div class="field book-form__stock"><label for="book-stock">Total Stok *</label><input id="book-stock" name="totalStock" type="number" min="0" value="${book.total_stock ?? 1}" required></div>
    <div class="field book-form__title"><label for="book-title">Judul *</label><input id="book-title" name="title" value="${escapeHtml(book.title || "")}" autocomplete="off" required></div>
    <div class="field book-form__category"><label for="book-category">Kategori</label><select id="book-category" name="categoryId"><option value="">Tanpa kategori</option>${categories.map((category) => `<option value="${category.id}" ${book.category?.id === category.id ? "selected" : ""}>${escapeHtml(category.name)}</option>`).join("")}</select></div>
    <div class="field book-form__authors"><label for="book-authors">Penulis</label><input id="book-authors" name="authors" value="${escapeHtml(book.authors || "")}" autocomplete="off"></div>
    <div class="field book-form__publisher"><label for="book-publisher">Penerbit</label><input id="book-publisher" name="publisher" value="${escapeHtml(book.publisher || "")}" autocomplete="off"></div>
    <fieldset class="book-form__inventory"><legend>Data inventaris sekolah</legend>
      <div class="field"><label for="book-inventory-number">Nomor induk</label><input id="book-inventory-number" name="inventoryNumber" value="${escapeHtml(book.inventory_number || "")}" autocomplete="off"></div>
      <div class="field"><label for="book-classification">Klasifikasi</label><input id="book-classification" name="classification" value="${escapeHtml(book.classification || "")}" autocomplete="off"></div>
      <div class="field"><label for="book-acquisition-source">Sumber perolehan</label><input id="book-acquisition-source" name="acquisitionSource" value="${escapeHtml(book.acquisition_source || "")}" autocomplete="off"></div>
      <div class="field"><label for="book-shelf">Lokasi rak</label><input id="book-shelf" name="shelfLocation" value="${escapeHtml(book.shelf_location || "")}" autocomplete="off"></div>
      <div class="field book-form__source-note"><label for="book-source-note">Keterangan</label><textarea id="book-source-note" name="sourceNote">${escapeHtml(book.source_note || "")}</textarea></div>
    </fieldset>
    ${coverField}
    <div class="field book-form__synopsis"><label for="book-synopsis">Sinopsis</label><textarea id="book-synopsis" name="synopsis">${escapeHtml(book.synopsis || "")}</textarea></div>
    <button class="button button--primary button--block book-form__submit" type="submit">Simpan Buku</button>
  </form>`;
}

async function openBookModal(book, categories, reload, { manualUpload = false } = {}) {
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.innerHTML = `<div class="modal__dialog book-editor-dialog"><div class="modal__header"><h2>${manualUpload ? "Tambah Buku Manual" : book ? "Ubah Buku" : "Tambah Buku"}</h2><button class="icon-button" type="button" data-close aria-label="Tutup">${icon("close")}</button></div>${bookFormMarkup(book || {}, categories, manualUpload)}</div>`;
  modal.querySelector("[data-close]").addEventListener("click", () => modal.remove());
  modal.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter;
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (manualUpload && !data.coverUrl?.trim() && !data.coverFile?.size) {
      showToast("Isi URL sampul atau pilih foto dari perangkat.", "danger");
      modal.querySelector("#book-cover").focus();
      return;
    }
    setBusy(button, true, "Menyimpan...");
    let uploadedCover = null;
    let saved = false;
    const oldCoverPath = bookCoverStoragePath(book?.cover_url);
    try {
      if (data.coverFile?.size) {
        setBusy(button, true, "Mengunggah cover...");
        uploadedCover = await uploadBookCover(data.coverFile);
        data.coverUrl = uploadedCover.publicUrl;
      }
      await saveBook(data);
      saved = true;
      if (oldCoverPath && data.coverUrl !== book.cover_url) {
        await removeBookCover(oldCoverPath).catch(() => showToast("Data tersimpan, tetapi file cover lama gagal dihapus.", "warning"));
      }
      showToast("Data buku disimpan.", "success");
      modal.remove();
      await reload();
    } catch (error) {
      if (uploadedCover && !saved) await removeBookCover(uploadedCover.path).catch(() => {});
      showToast(friendlyError(error), "danger");
      setBusy(button, false);
    }
  });
  document.body.append(modal);
  modal.querySelector("input:not([type=hidden])").focus();
}

async function openMetadataModal(categories, reload) {
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `<div class="modal__dialog"><div class="modal__header"><div><h2>Cari Metadata Buku</h2><p>Satu pencarian memeriksa Open Library, Google Books, Internet Archive, dan Gutendex secara berurutan.</p></div><button class="icon-button" type="button" data-close>${icon("close")}</button></div><form id="external-search" class="search-field">${icon("search")}<input name="query" required placeholder="Judul atau ISBN"></form><div id="external-results" class="open-library-results"></div></div>`;
  modal.querySelector("[data-close]").addEventListener("click", () => modal.remove());
  modal.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const host = modal.querySelector("#external-results");
    host.innerHTML = `<div class="loading-region"><div class="spinner"></div></div>`;
    try {
      const response = await searchBookMetadata(new FormData(event.currentTarget).get("query"), (source) => {
        host.innerHTML = `<div class="metadata-search-status"><div class="spinner"></div><span>Mencari di ${escapeHtml(source)}...</span></div>`;
      });
      const results = response.results;
      if (!results.length) { renderEmpty(host, { title: "Data buku online tidak ditemukan", message: `Sudah diperiksa: ${response.attempted.join(", ")}. Coba judul atau ISBN lain.`, iconName: "search" }); return; }
      host.innerHTML = `<p class="metadata-source-note">Ditemukan melalui <strong>${escapeHtml(response.source)}</strong></p>${results.map((book, index) => `<article class="external-book"><img src="${escapeHtml(book.coverUrl || fallbackCoverUrl)}" alt="" data-book-cover loading="lazy" decoding="async"><div><span class="badge badge--blue">${escapeHtml(book.source)}</span><h3>${escapeHtml(book.title)}</h3><p>${escapeHtml(book.authors || "Penulis tidak tersedia")} · ${book.publishYear || "Tahun tidak tersedia"}<br>${escapeHtml(book.isbn || "ISBN tidak tersedia")}</p><button class="button button--small button--primary" type="button" data-select-external="${index}">Pilih</button></div></article>`).join("")}`;
      host.onclick = async (clickEvent) => {
        const button = clickEvent.target.closest("[data-select-external]");
        if (!button) return;
        const selected = results[Number(button.dataset.selectExternal)];
        setBusy(button, true, "Memuat...");
        const synopsis = selected.synopsis || await getOpenLibrarySynopsis(selected.openLibraryKey).catch(() => "");
        if (!synopsis) showToast(`Sinopsis tidak tersedia dari ${selected.source}.`, "info");
        modal.remove();
        openBookModal({ title: selected.title, authors: selected.authors, publisher: selected.publisher, publish_year: selected.publishYear, isbn: selected.isbn, cover_url: selected.coverUrl, open_library_key: selected.openLibraryKey, synopsis, total_stock: 1 }, categories, reload);
      };
    } catch (error) { renderError(host, friendlyError(error)); }
  });
  document.body.append(modal);
  modal.querySelector("input").focus();
}

async function renderBooks() {
  main.innerHTML = `<div class="book-management-sticky"><section class="book-overview" aria-label="Ringkasan koleksi"><article>${icon("book")}<div><strong id="book-stat-titles">0</strong><span>Judul buku</span></div></article><article>${icon("shelves")}<div><strong id="book-stat-copies">0</strong><span>Total eksemplar</span></div></article><article>${icon("checkCircle")}<div><strong id="book-stat-available">0</strong><span>Eksemplar tersedia</span></div></article><article>${icon("clipboard")}<div><strong id="book-stat-categories">0</strong><span>Genre aktif</span></div></article></section><div class="toolbar toolbar--books"><div class="book-export-actions" aria-label="Ekspor data buku"><button class="button button--secondary" type="button" data-book-export="csv">${icon("download")} Ekspor CSV</button><button class="button button--secondary" type="button" data-book-export="spreadsheet">${icon("shelves")} Ekspor Spreadsheet</button></div><div class="search-field">${icon("search")}<label class="sr-only" for="book-search">Cari buku</label><input id="book-search" type="search" placeholder="Cari judul, penulis, ISBN..."></div><div class="book-genre-filter"><label class="sr-only" for="book-category">Filter genre buku</label><select id="book-category" disabled><option value="">Memuat genre...</option></select></div></div></div><div id="book-results"></div><div class="book-results-more" id="book-results-more" hidden><button class="button button--secondary" type="button">Muat 100 buku lagi</button></div><div class="book-create-actions" id="book-create-actions"><div class="book-create-actions__menu" id="book-create-menu" role="menu" hidden><button class="button" type="button" role="menuitem" data-book-create="manual">${icon("edit")} Tambah Manual</button><button class="button" type="button" role="menuitem" data-book-create="library">${icon("external")} Open Library</button></div><button class="book-create-actions__toggle" id="book-create-toggle" type="button" aria-label="Buka menu tambah buku" aria-controls="book-create-menu" aria-expanded="false">${icon("plus")}</button></div>`;
  const host = document.getElementById("book-results");
  const categorySelect = document.getElementById("book-category");
  const more = document.getElementById("book-results-more");
  const createActions = document.getElementById("book-create-actions");
  const createMenu = document.getElementById("book-create-menu");
  const createToggle = document.getElementById("book-create-toggle");
  let books = [];
  let categories = [];
  let visibleCount = 100;

  function drawOverview() {
    document.getElementById("book-stat-titles").textContent = books.length.toLocaleString("id-ID");
    document.getElementById("book-stat-copies").textContent = books.reduce((total, book) => total + Number(book.total_stock || 0), 0).toLocaleString("id-ID");
    document.getElementById("book-stat-available").textContent = books.reduce((total, book) => total + Number(book.available_stock || 0), 0).toLocaleString("id-ID");
    document.getElementById("book-stat-categories").textContent = new Set(books.map((book) => book.category?.id).filter(Boolean)).size.toLocaleString("id-ID");
  }

  function draw() {
    const needle = document.getElementById("book-search").value.toLocaleLowerCase("id-ID");
    const category = categorySelect.value;
    const filtered = books.filter((book) => (!category || book.category?.slug === category) && `${book.title} ${book.authors} ${book.isbn || ""} ${book.category?.name || ""}`.toLocaleLowerCase("id-ID").includes(needle));
    if (!filtered.length) { more.hidden = true; renderEmpty(host, { title: "Belum ada buku", message: "Tambah buku secara manual atau ambil metadata dari Open Library." }); return; }
    const visible = filtered.slice(0, visibleCount);
    host.innerHTML = `<div class="admin-book-list">${visible.map((book) => `<article class="admin-book-row"><img src="${escapeHtml(book.cover_url || fallbackCoverUrl)}" alt="" data-book-cover loading="lazy" decoding="async"><div class="admin-book-row__identity"><h2 title="${escapeHtml(book.title)}">${escapeHtml(book.title)}</h2><p>${escapeHtml(book.authors)} · ${escapeHtml(book.isbn || "Tanpa ISBN")}</p></div><div class="admin-book-row__meta"><span><b>Kategori</b>${escapeHtml(book.category?.name || "Tanpa kategori")}</span><span><b>Stok</b>${book.available_stock}/${book.total_stock}</span><span><b>Rak</b>${escapeHtml(book.shelf_location)}</span></div><div class="action-cell"><button class="button button--small button--secondary" data-edit-book="${book.id}">${icon("edit")} Ubah</button><button class="button button--small button--danger" aria-label="Arsipkan ${escapeHtml(book.title)}" data-archive-book="${book.id}">${icon("archive")} Arsipkan</button></div></article>`).join("")}</div>`;
    more.hidden = visible.length >= filtered.length;
  }
  async function load() {
    host.innerHTML = `<div class="loading-region"><div class="spinner"></div></div>`;
    try {
      [books, categories] = await Promise.all([listBooks({ limit: 5000 }), listCategories()]);
      const populated = new Set(books.map((book) => book.category?.id).filter(Boolean));
      categories = categories.filter((category) => populated.has(category.id));
      categorySelect.innerHTML = [["", "Semua genre"], ...categories.map((category) => [category.slug, category.name])].map(([slug, name]) => `<option value="${escapeHtml(slug)}">${escapeHtml(name)}</option>`).join("");
      categorySelect.disabled = false;
      drawOverview();
      draw();
    }
    catch (error) { renderError(host, friendlyError(error)); }
  }
  let searchTimer;
  document.getElementById("book-search").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { visibleCount = 100; draw(); }, 140);
  });
  categorySelect.addEventListener("change", () => { visibleCount = 100; draw(); });
  more.addEventListener("click", () => { visibleCount += 100; draw(); });
  main.querySelectorAll("[data-book-export]").forEach((button) => button.addEventListener("click", async () => {
    const originalMarkup = button.innerHTML;
    setBusy(button, true, "Menyiapkan...");
    try {
      const needle = document.getElementById("book-search").value.toLocaleLowerCase("id-ID");
      const category = categorySelect.value;
      const exportBooks = (await listBooksForExport()).filter((book) => (!category || book.category?.slug === category) && `${book.title} ${book.authors} ${book.isbn || ""} ${book.category?.name || ""}`.toLocaleLowerCase("id-ID").includes(needle));
      if (!exportBooks.length) { showToast("Tidak ada data buku pada filter ini.", "info"); return; }
      const date = new Date().toISOString().slice(0, 10);
      if (button.dataset.bookExport === "csv") downloadBooksCsv(exportBooks, `data-buku-${date}.csv`);
      else downloadBooksSpreadsheet(exportBooks, `data-buku-${date}.xlsx`);
      showToast(`${exportBooks.length.toLocaleString("id-ID")} data buku berhasil diekspor.`, "success");
    } catch (error) { showToast(friendlyError(error), "danger"); }
    finally { setBusy(button, false); button.innerHTML = originalMarkup; }
  }));
  const setCreateMenu = (open) => {
    createMenu.hidden = !open;
    createToggle.setAttribute("aria-expanded", String(open));
    createToggle.setAttribute("aria-label", open ? "Tutup menu tambah buku" : "Buka menu tambah buku");
  };
  createToggle.addEventListener("click", () => setCreateMenu(createMenu.hidden));
  createActions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-book-create]");
    if (!button) return;
    setCreateMenu(false);
    if (button.dataset.bookCreate === "manual") openBookModal(null, categories, load, { manualUpload: true });
    if (button.dataset.bookCreate === "library") openMetadataModal(categories, load);
  });
  document.addEventListener("click", (event) => { if (!createActions.contains(event.target)) setCreateMenu(false); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !createMenu.hidden) { setCreateMenu(false); createToggle.focus(); }
  });
  host.addEventListener("click", async (event) => {
    const edit = event.target.closest("[data-edit-book]");
    const archive = event.target.closest("[data-archive-book]");
    if (edit) {
      try { openBookModal(await getBook(edit.dataset.editBook), categories, load); }
      catch (error) { showToast(friendlyError(error), "danger"); }
    }
    if (archive) {
      if (!await confirmDialog({ title: "Arsipkan buku?", message: "Buku akan hilang dari katalog dan tetap tersimpan di menu Arsip Buku.", confirmLabel: "Arsipkan" })) return;
      try { await archiveBook(archive.dataset.archiveBook); showToast("Buku dipindahkan ke Arsip Buku.", "success"); await load(); }
      catch (error) { showToast(friendlyError(error), "danger"); }
    }
  });
  await load();
}

async function renderArchive() {
  main.innerHTML = `<div class="toolbar"><div class="search-field">${icon("search")}<label class="sr-only" for="archive-search">Cari arsip buku</label><input id="archive-search" type="search" placeholder="Cari judul, penulis, ISBN..."></div></div><div id="archive-results"></div>`;
  const host = document.getElementById("archive-results");
  let books = [];
  function draw() {
    const needle = document.getElementById("archive-search").value.toLocaleLowerCase("id-ID");
    const filtered = books.filter((book) => `${book.title} ${book.authors} ${book.isbn || ""}`.toLocaleLowerCase("id-ID").includes(needle));
    if (!filtered.length) { renderEmpty(host, { title: "Arsip buku kosong", message: "Buku yang diarsipkan akan tersimpan di sini.", iconName: "archive" }); return; }
    host.innerHTML = `<div class="admin-book-list">${filtered.map((book) => `<article class="admin-book-row"><img src="${escapeHtml(book.cover_url || fallbackCoverUrl)}" alt="" data-book-cover><div class="admin-book-row__identity"><h2 title="${escapeHtml(book.title)}">${escapeHtml(book.title)}</h2><p>${escapeHtml(book.authors)} · Diarsipkan ${formatDate(book.archived_at)}</p></div><div class="admin-book-row__meta"><span><b>Kategori</b>${escapeHtml(book.category?.name || "Tanpa kategori")}</span><span><b>Stok</b>${book.available_stock}/${book.total_stock}</span><span><b>Rak</b>${escapeHtml(book.shelf_location)}</span></div><div class="action-cell"><button class="button button--small button--secondary" type="button" data-restore-book="${book.id}">${icon("restore")} Pulihkan</button></div></article>`).join("")}</div>`;
  }
  async function load() {
    host.innerHTML = `<div class="loading-region"><div class="spinner"></div></div>`;
    try { books = await listArchivedBooks(); draw(); }
    catch (error) { renderError(host, friendlyError(error)); }
  }
  document.getElementById("archive-search").addEventListener("input", draw);
  host.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-restore-book]");
    if (!button || !await confirmDialog({ title: "Pulihkan buku?", message: "Buku akan kembali tampil di Data Buku dan katalog siswa.", confirmLabel: "Pulihkan" })) return;
    setBusy(button, true, "Memulihkan...");
    try { await restoreBook(button.dataset.restoreBook); showToast("Buku dipulihkan ke katalog.", "success"); await load(); }
    catch (error) { showToast(friendlyError(error), "danger"); setBusy(button, false); }
  });
  await load();
}

function loanActions(loan) {
  if (loan.status === "BORROWED" && loan.extension_status === "PENDING") return `<button class="button button--small button--primary" data-loan-action="extension-approve" data-loan="${loan.id}">Setujui +7 Hari</button><button class="button button--small button--danger" data-loan-action="extension-reject" data-loan="${loan.id}">Tolak</button>`;
  if (loan.status === "PENDING") return `<button class="button button--small button--primary" data-loan-action="approve" data-loan="${loan.id}">Setujui</button><button class="button button--small button--danger" data-loan-action="reject" data-loan="${loan.id}">Tolak</button>`;
  if (loan.status === "APPROVED") return `<button class="button button--small button--primary" data-loan-action="borrowed" data-loan="${loan.id}">Tandai Diambil</button>`;
  if (loan.status === "RETURN_REQUESTED") return `<button class="button button--small button--primary" data-loan-action="returned" data-loan="${loan.id}">Konfirmasi Kembali</button>`;
  return "";
}

function loanTimeline(loan) {
  const returnedEarly = isBeforeDue(loan.return_requested_at, loan.due_at);
  return [["Diajukan", loan.requested_at], ["Dipinjam", loan.borrowed_at], ["Batas kembali", loan.due_at], ["Ajukan kembali", loan.return_requested_at], ["Diterima", loan.returned_at]]
    .filter(([, value]) => value)
    .map(([label, value]) => `<span><b>${label}</b><span>${formatDate(value, { weekday: "short", hour: "2-digit", minute: "2-digit" })}${label === "Ajukan kembali" && returnedEarly ? `<em>Sebelum jatuh tempo</em>` : ""}</span></span>`)
    .join("");
}

const loanActionMessages = {
  approve: ["Setujui pengajuan?", "Buku belum mengurangi stok sampai ditandai telah diambil."],
  reject: ["Tolak pengajuan?", "Status akan berubah menjadi Ditolak."],
  borrowed: ["Buku sudah diserahkan?", "Stok tersedia akan berkurang satu dan jatuh tempo ditetapkan oleh sistem."],
  returned: ["Buku fisik sudah diterima?", "Stok tersedia akan bertambah satu."],
  "extension-approve": ["Setujui perpanjangan?", "Batas kembali akan diperbarui oleh sistem."],
  "extension-reject": ["Tolak perpanjangan?", "Batas kembali tidak akan berubah."]
};

async function performLoanAction(button, reload, close) {
  const action = button.dataset.loanAction;
  const message = loanActionMessages[action];
  if (!message || !await confirmDialog({ title: message[0], message: message[1], confirmLabel: "Konfirmasi", danger: ["reject", "extension-reject"].includes(action) })) return;
  setBusy(button, true);
  try {
    if (action === "approve") await approveLoan(button.dataset.loan);
    if (action === "reject") await rejectLoan(button.dataset.loan, "Pengajuan ditolak oleh pengelola.");
    if (action === "borrowed") await markBorrowed(button.dataset.loan);
    if (action === "returned") await confirmReturn(button.dataset.loan);
    if (action === "extension-approve") await reviewLoanExtension(button.dataset.loan, "APPROVED");
    if (action === "extension-reject") await reviewLoanExtension(button.dataset.loan, "REJECTED");
    showToast("Status transaksi diperbarui.", "success");
    close();
    await reload();
  } catch (error) { showToast(friendlyError(error), "danger"); setBusy(button, false); }
}

function openLoanDetail(loan, reload, showHistory) {
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "loan-detail-title");
  const close = () => modal.remove();
  modal.innerHTML = `<div class="modal__dialog modal__dialog--wide"><div class="modal__header"><div><h2 id="loan-detail-title">Detail Peminjaman</h2><p>Informasi lengkap transaksi dan waktunya.</p></div><button class="icon-button" type="button" data-close aria-label="Tutup">${icon("close")}</button></div><div class="loan-detail__heading"><div><span>Siswa</span><strong>${escapeHtml(loan.student?.full_name || "-")}</strong><small>${escapeHtml(loan.student?.class_name || "Kelas tidak tersedia")}</small></div><div><span>Buku</span><strong>${escapeHtml(loan.book?.title || "-")}</strong><small>${escapeHtml(loan.book?.authors || "Penulis tidak tersedia")}</small></div></div><div class="loan-detail__status"><span class="badge ${statusBadgeClass(loan.status)}">${statusLabel(loan.status)}</span>${loan.extension_status ? `<span class="badge ${statusBadgeClass(loan.extension_status)}">Perpanjangan: ${statusLabel(loan.extension_status)}</span>` : ""}</div><div class="loan-detail__timeline"><h3>Riwayat Waktu</h3><div class="loan-timeline">${loanTimeline(loan)}</div></div>${loan.rejection_reason ? `<div class="notice notice--danger">${icon("alert")}<span>${escapeHtml(loan.rejection_reason)}</span></div>` : ""}<div class="loan-detail__actions">${showHistory ? "" : loanActions(loan)}<button class="button button--secondary" type="button" data-close>Tutup</button></div></div>`;
  modal.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", close));
  modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
  modal.addEventListener("click", (event) => {
    const button = event.target.closest("[data-loan-action]");
    if (button) performLoanAction(button, reload, close);
  });
  document.body.append(modal);
  modal.querySelector("[data-close]").focus();
}

async function renderLoans(showHistory = false) {
  main.innerHTML = `<nav class="admin-tabs" aria-label="Jenis data peminjaman"><a href="./loans.html" ${showHistory ? "" : 'aria-current="page"'}>Peminjaman Aktif</a><a href="./transactions.html" ${showHistory ? 'aria-current="page"' : ""}>Riwayat Selesai</a></nav><div class="toolbar"><div class="search-field">${icon("search")}<label class="sr-only" for="loan-search">Cari transaksi</label><input id="loan-search" type="search" placeholder="Cari siswa atau buku..."></div>${showHistory ? "" : `<select id="loan-status"><option value="">Semua status</option><option value="PENDING">Menunggu</option><option value="APPROVED">Disetujui</option><option value="BORROWED">Dipinjam</option><option value="EXTENSION_PENDING">Perpanjangan</option><option value="RETURN_REQUESTED">Pengembalian</option></select>`}</div><div id="loan-results"></div>`;
  const host = document.getElementById("loan-results");
  let loans = [];
  function draw() {
    const needle = document.getElementById("loan-search").value.toLocaleLowerCase("id-ID");
    const status = document.getElementById("loan-status")?.value || "";
    const filtered = loans.filter((loan) => (!status || (status === "EXTENSION_PENDING" ? loan.extension_status === "PENDING" : loan.status === status)) && `${loan.student?.full_name || ""} ${loan.book?.title || ""}`.toLocaleLowerCase("id-ID").includes(needle));
    if (!filtered.length) { renderEmpty(host, { title: "Tidak ada transaksi", message: "Data yang sesuai akan tampil di sini.", iconName: "clock" }); return; }
    host.innerHTML = `<div class="loan-admin-list">${filtered.map((loan) => `<article class="loan-admin-row"><div class="loan-admin-row__student"><strong title="${escapeHtml(loan.student?.full_name || "-")}">${escapeHtml(loan.student?.full_name || "-")}</strong><small>${escapeHtml(loan.student?.class_name || "")}</small></div><div class="loan-admin-row__book"><span>Buku</span><strong title="${escapeHtml(loan.book?.title || "-")}">${escapeHtml(loan.book?.title || "-")}</strong></div><div class="loan-admin-row__date"><span>${showHistory ? "Dikembalikan" : "Diajukan"}</span><strong>${formatDate(showHistory ? loan.returned_at : loan.requested_at, { weekday: "short", hour: "2-digit", minute: "2-digit" })}</strong></div><div class="loan-admin-row__status"><span class="badge ${statusBadgeClass(loan.status)}">${statusLabel(loan.status)}</span>${loan.extension_status === "PENDING" ? `<span class="badge badge--warning">Perpanjangan</span>` : ""}</div><button class="button button--small button--secondary" type="button" data-loan-detail="${loan.id}">Detail</button></article>`).join("")}</div>`;
  }
  async function load(showLoading = true) {
    if (showLoading) host.innerHTML = `<div class="loading-region"><div class="spinner"></div></div>`;
    try { loans = (await listAllLoans()).filter((loan) => showHistory ? loan.status === "RETURNED" : isActiveLoanStatus(loan.status)); draw(); }
    catch (error) { renderError(host, friendlyError(error)); }
  }
  document.getElementById("loan-search").addEventListener("input", draw);
  document.getElementById("loan-status")?.addEventListener("change", draw);
  host.addEventListener("click", (event) => {
    const button = event.target.closest("[data-loan-detail]");
    if (!button) return;
    const loan = loans.find((item) => item.id === button.dataset.loanDetail);
    if (loan) openLoanDetail(loan, load, showHistory);
  });
  await load();
  const stopRealtime = await subscribeToLoans(() => load(false));
  window.addEventListener("pagehide", stopRealtime, { once: true });
}

async function initialize() {
  renderShell(null);
  try {
    const identity = await requireRole("LIBRARIAN");
    if (!identity) return;
    renderShell(identity);
    if (page === "dashboard") await renderDashboard(identity);
    if (page === "students") await renderStudents();
    if (page === "books") await renderBooks();
    if (page === "archive") await renderArchive();
    if (page === "loans") await renderLoans(false);
    if (page === "transactions") await renderLoans(true);
  } catch (error) {
    if (error instanceof MissingConfigurationError) configurationBlock();
    else renderError(main, friendlyError(error));
  }
}

initialize();


