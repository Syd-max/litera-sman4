import { setLibraryOpen, watchLibraryStatus } from "../services/library-status-service.js";
import { icon } from "./icons.js";
import { showToast } from "./feedback.js";

export async function mountLibraryStatus(host, { editable = false } = {}) {
  host.className = editable ? "library-status-control" : "library-status-card card";
  host.innerHTML = editable ? `
    <details class="library-status-menu"><summary class="library-status-badge" aria-label="Atur status perpustakaan"><span class="library-status-dot" aria-hidden="true"></span><span data-status-label>Memuat...</span>${icon("arrowRight")}</summary>
      <div class="library-status-options" role="group" aria-label="Status perpustakaan">
        <button type="button" data-library-open="true" aria-pressed="false">Buka</button>
        <button type="button" data-library-open="false" aria-pressed="false">Tutup</button>
      </div>
    </details>` : `
    <div class="library-status-card__heading"><strong>Status Perpustakaan</strong><span class="library-status-badge"><span class="library-status-dot" aria-hidden="true"></span><span data-status-label role="status">Memuat...</span></span></div>
    <p data-status-description>Memuat status layanan pengambilan buku.</p>`;
  const badge = host.querySelector(".library-status-badge");
  const label = host.querySelector("[data-status-label]");
  const description = host.querySelector("[data-status-description]");
  const menu = host.querySelector("details");
  const buttons = [...host.querySelectorAll("[data-library-open]")];
  let current;
  const render = status => {
    current = status.is_open;
    const state = current === true ? "open" : current === false ? "closed" : "unknown";
    badge.dataset.state = state;
    label.textContent = { open: "Buka", closed: "Tutup", unknown: "Belum diatur" }[state];
    if (editable) badge.setAttribute("aria-label", `Atur status perpustakaan: ${label.textContent}`);
    if (description) description.textContent = {
      open: "Perpustakaan melayani pengambilan buku.",
      closed: "Pengambilan buku belum dilayani. Silakan datang saat perpustakaan buka.",
      unknown: "Status layanan belum diperbarui oleh pengelola."
    }[state];
    buttons.forEach(button => button.setAttribute("aria-pressed", String(current === (button.dataset.libraryOpen === "true"))));
  };
  const renderError = () => {
    current = undefined;
    delete badge.dataset.state;
    label.textContent = "Belum tersedia";
    buttons.forEach(button => button.setAttribute("aria-pressed", "false"));
    if (description) description.textContent = "Status layanan belum dapat dimuat. Akan diperiksa kembali saat koneksi tersedia.";
  };
  try {
    const watcher = await watchLibraryStatus(render, renderError);
    buttons.forEach(button => button.addEventListener("click", async () => {
      const open = button.dataset.libraryOpen === "true";
      if (current === open) { menu.open = false; badge.focus(); return; }
      buttons.forEach(item => { item.disabled = true; });
      menu.setAttribute("aria-busy", "true");
      try {
        await setLibraryOpen(open);
        await watcher.refresh();
        menu.open = false;
        badge.focus();
        showToast(`Perpustakaan ditandai ${open ? "buka" : "tutup"}.`, "success");
      } catch (error) {
        const missing = ["42P01", "PGRST202", "PGRST205", "42883"].includes(error.code);
        showToast(missing ? "Status perpustakaan belum aktif. Jalankan library-status.sql di Supabase." : "Status belum berhasil disimpan. Coba lagi.", "danger");
      } finally {
        buttons.forEach(item => { item.disabled = false; });
        menu.removeAttribute("aria-busy");
      }
    }));
    if (menu) {
      menu.addEventListener("keydown", event => { if (event.key === "Escape") { menu.open = false; menu.querySelector("summary").focus(); } });
      const closeOutside = event => { if (!host.contains(event.target)) menu.open = false; };
      document.addEventListener("click", closeOutside);
      window.addEventListener("pagehide", event => { if (!event.persisted) document.removeEventListener("click", closeOutside); });
    }
  } catch { renderError(); }
}
