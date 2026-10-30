import { icon } from "./icons.js";
import { escapeHtml } from "../utils.js";

export function ensureToastRegion() {
  let region = document.querySelector(".toast-region");
  if (!region) {
    region = document.createElement("div");
    region.className = "toast-region";
    region.setAttribute("aria-live", "polite");
    document.body.append(region);
  }
  return region;
}

export function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.setAttribute("role", type === "danger" ? "alert" : "status");
  toast.innerHTML = `${icon(type === "danger" ? "alert" : "checkCircle")}<span></span>`;
  toast.querySelector("span").textContent = message;
  ensureToastRegion().append(toast);
  window.setTimeout(() => toast.remove(), 4500);
}

export function setBusy(button, busy, busyLabel = "Memproses...") {
  if (!button) return;
  if (busy) {
    button.dataset.originalLabel = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalLabel || button.textContent;
    button.disabled = false;
  }
}

export function renderEmpty(container, { title, message, actionHref, actionLabel, iconName = "book" }) {
  container.innerHTML = `
    <div class="empty-state">
      <div>
        <div class="empty-state__icon">${icon(iconName)}</div>
        <h2>${title}</h2>
        <p>${message}</p>
        ${actionHref ? `<a class="button button--primary" href="${actionHref}">${actionLabel}</a>` : ""}
      </div>
    </div>`;
}

export function renderError(container, message = "Gagal memuat data. Silakan coba lagi.") {
  container.innerHTML = `<div class="notice notice--danger">${icon("alert")}<span>${message}</span></div>`;
}

export function confirmDialog({ title, message, confirmLabel = "Lanjutkan", danger = false }) {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML = `
      <div class="modal__dialog confirm-dialog">
        <div class="modal__header">
          <div><h2>${escapeHtml(title)}</h2><p class="modal__message">${escapeHtml(message)}</p></div>
          <button class="icon-button" type="button" data-cancel aria-label="Tutup">${icon("close")}</button>
        </div>
        <div class="modal__actions">
          <button class="button button--secondary" type="button" data-cancel>Batal</button>
          <button class="button ${danger ? "button--danger" : "button--primary"}" type="button" data-confirm>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;
    const finish = (value) => {
      modal.remove();
      resolve(value);
    };
    modal.querySelectorAll("[data-cancel]").forEach((button) => button.addEventListener("click", () => finish(false)));
    modal.querySelector("[data-confirm]").addEventListener("click", () => finish(true));
    modal.addEventListener("click", (event) => {
      if (event.target === modal) finish(false);
    });
    document.body.append(modal);
    modal.querySelector("[data-confirm]").focus();
  });
}

