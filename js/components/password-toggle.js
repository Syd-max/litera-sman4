import { icon } from "./icons.js";

export function initializePasswordToggles(root = document) {
  root.querySelectorAll(".password-toggle[data-password-toggle]").forEach(button => {
    const input = root.querySelector(`#${button.dataset.passwordToggle}`);
    if (!input) return;
    const label = input.labels?.[0]?.textContent.trim().toLowerCase() || "password";

    function setVisible(visible) {
      input.type = visible ? "text" : "password";
      button.innerHTML = icon(visible ? "eyeOff" : "eye");
      button.setAttribute("aria-label", `${visible ? "Sembunyikan" : "Tampilkan"} ${label}`);
    }

    button.setAttribute("aria-controls", input.id);
    setVisible(input.type === "text");
    button.addEventListener("click", () => setVisible(input.type === "password"));
    input.form?.addEventListener("reset", () => setVisible(false));
  });
}
