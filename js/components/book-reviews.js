import { icon } from "./icons.js";
import { escapeHtml, formatDate } from "../utils.js";
import { showToast } from "./feedback.js";
import { getBookReviews, reviewErrorMessage, submitBookReview } from "../services/review-service.js";

export function ratingStars(rating) {
  return `<span class="review-stars" role="img" aria-label="${rating} dari 5 bintang">${[1, 2, 3, 4, 5].map(value => `<span${value <= rating ? ' class="is-filled"' : ""}>${icon("star")}</span>`).join("")}</span>`;
}

function refreshReviewsOnReturn(refresh) {
  const visible = () => { if (document.visibilityState === "visible") void refresh(); };
  window.addEventListener("focus", visible);
  window.addEventListener("pageshow", visible);
  window.addEventListener("online", visible);
  window.addEventListener("pagehide", event => {
    if (event.persisted) return;
    window.removeEventListener("focus", visible);
    window.removeEventListener("pageshow", visible);
    window.removeEventListener("online", visible);
  });
}

export async function mountBookRating(link, bookId) {
  let loading = false;
  async function load() {
    if (loading || !link.isConnected) return;
    loading = true;
    try {
      const data = await getBookReviews(bookId);
      if (!link.isConnected) return;
      const average = Number(data.average).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      const count = Number(data.total).toLocaleString("id-ID");
      link.innerHTML = `${icon("star")}<span>${data.total ? `<strong>${average}</strong> <small>(${count})</small>` : "Ulasan"}</span>`;
      link.setAttribute("aria-label", data.total ? `Rating ${average} dari 5, ${count} ulasan. Buka ulasan buku ini.` : "Belum ada rating. Buka ulasan buku ini.");
    } catch {
      link.innerHTML = `${icon("star")}<span>Ulasan</span>`;
      link.setAttribute("aria-label", "Rating belum dapat dimuat. Buka halaman ulasan buku ini.");
    } finally { loading = false; }
  }
  refreshReviewsOnReturn(load);
  await load();
}

export function openBookReview({ historyId, book, review }) {
  if (document.querySelector(".review-dialog")) return Promise.resolve(false);
  return new Promise(resolve => {
    const dialog = document.createElement("dialog");
    dialog.className = "review-dialog";
    dialog.setAttribute("aria-labelledby", "review-dialog-title");
    dialog.innerHTML = `<form class="stack">
      <div class="modal__header"><div><h2 id="review-dialog-title">${review ? "Edit Ulasan" : "Ulas Buku"}</h2><p>${escapeHtml(book.title || "Buku")}</p></div><button class="icon-button" type="button" data-review-cancel aria-label="Tutup">${icon("close")}</button></div>
      <fieldset class="review-rating"><legend>Rating buku</legend><div>${[1, 2, 3, 4, 5].map(value => `<label><input class="sr-only" type="radio" name="rating" value="${value}" required${review?.rating === value ? " checked" : ""}><span aria-hidden="true">${icon("star")}</span><span class="sr-only">${value} bintang</span></label>`).join("")}</div></fieldset>
      <div class="field"><label for="review-body">Ulasanmu</label><textarea id="review-body" name="body" rows="4" maxlength="250" required placeholder="Ceritakan pendapatmu tentang buku ini." aria-describedby="review-hint review-counter">${escapeHtml(review?.body || "")}</textarea><div class="review-text-meta"><span id="review-hint">Gunakan bahasa yang sopan.</span><span id="review-counter"></span></div></div>
      <p class="field__error" data-review-error role="alert" hidden></p>
      <div class="modal__actions"><button class="button button--secondary" type="button" data-review-cancel>Batal</button><button class="button button--primary" type="submit">Simpan Ulasan</button></div>
    </form>`;
    const form = dialog.querySelector("form");
    const textarea = dialog.querySelector("textarea");
    const errorHost = dialog.querySelector("[data-review-error]");
    const submit = form.querySelector('[type="submit"]');
    let saving = false;
    let saved = false;
    const counter = () => { dialog.querySelector("#review-counter").textContent = `${textarea.value.length}/250`; };
    textarea.addEventListener("input", counter);
    counter();
    dialog.querySelectorAll("[data-review-cancel]").forEach(button => button.addEventListener("click", () => { if (!saving) dialog.close(); }));
    dialog.addEventListener("cancel", event => { if (saving) event.preventDefault(); });
    dialog.addEventListener("close", () => { dialog.remove(); resolve(saved); }, { once: true });
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (saving || !form.reportValidity()) return;
      saving = true;
      errorHost.hidden = true;
      const rating = Number(new FormData(form).get("rating"));
      const body = textarea.value;
      form.querySelectorAll("button, input, textarea, fieldset").forEach(control => { control.disabled = true; });
      submit.textContent = "Menyimpan...";
      try {
        await submitBookReview(historyId, rating, body);
        saved = true;
        showToast("Rating dan ulasan berhasil disimpan.", "success");
        dialog.close();
      } catch (error) {
        errorHost.textContent = reviewErrorMessage(error);
        errorHost.hidden = false;
      } finally {
        saving = false;
        form.querySelectorAll("button, input, textarea, fieldset").forEach(control => { control.disabled = false; });
        submit.textContent = "Simpan Ulasan";
      }
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

export async function mountBookReviews(host, bookId) {
  host.innerHTML = `<div class="book-reviews__heading"><h2>Rating &amp; Ulasan</h2><span data-review-summary role="status">Memuat...</span></div><p class="book-reviews__hint">Dari siswa yang sudah mengembalikan buku.</p><div data-review-list></div><button class="button button--secondary" type="button" data-more-reviews hidden>Lihat ulasan lainnya</button><p data-review-load-error role="status" hidden></p><button class="button button--secondary" type="button" data-review-retry hidden>Coba lagi</button>`;
  const list = host.querySelector("[data-review-list]");
  const summary = host.querySelector("[data-review-summary]");
  const more = host.querySelector("[data-more-reviews]");
  const retry = host.querySelector("[data-review-retry]");
  const errorHost = host.querySelector("[data-review-load-error]");
  let offset = 0;
  let loading = false;
  const shown = new Set();
  async function load(reset = false) {
    if (loading || !host.isConnected) return;
    loading = true;
    more.disabled = true;
    retry.hidden = true;
    errorHost.hidden = true;
    try {
      const data = await getBookReviews(bookId, reset ? 0 : offset);
      if (!host.isConnected) return;
      if (reset) { shown.clear(); list.replaceChildren(); offset = 0; }
      summary.innerHTML = data.total ? `${icon("star")}<strong>${Number(data.average).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong><span>/ 5 · ${Number(data.total).toLocaleString("id-ID")} ulasan</span>` : "Belum ada rating";
      if (!data.total) list.innerHTML = '<p class="book-reviews__empty">Belum ada ulasan untuk buku ini.</p>';
      for (const review of data.reviews) {
        if (shown.has(review.id)) continue;
        shown.add(review.id);
        list.insertAdjacentHTML("beforeend", `<article class="book-review"><header><strong>${escapeHtml(review.reviewer_name)}${review.is_mine ? " (Kamu)" : ""}</strong><time datetime="${escapeHtml(review.updated_at)}">${formatDate(review.updated_at, { timeZone: "Asia/Jakarta" })}</time></header>${ratingStars(review.rating)}<p>${escapeHtml(review.body)}</p></article>`);
      }
      offset += data.reviews.length;
      more.hidden = offset >= Number(data.total);
    } catch (error) {
      if (!shown.size) summary.textContent = "Belum dapat dimuat";
      errorHost.textContent = reviewErrorMessage(error);
      errorHost.hidden = false;
      retry.hidden = false;
      more.hidden = true;
    } finally {
      loading = false;
      more.disabled = false;
    }
  }
  more.addEventListener("click", () => void load());
  retry.addEventListener("click", () => void load());
  refreshReviewsOnReturn(() => load(true));
  await load();
}
