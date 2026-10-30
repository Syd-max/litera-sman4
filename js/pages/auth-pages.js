import { icon } from "../components/icons.js";
import { setBusy, showToast } from "../components/feedback.js";
import { friendlyError } from "../utils.js";
import { registerStudent, sendPasswordReset, signIn, updatePassword } from "../services/auth-service.js";

const page = document.body.dataset.page;

function setupPasswordToggles() {
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.innerHTML = icon("eye");
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      button.innerHTML = icon(visible ? "eye" : "eyeOff");
      button.setAttribute("aria-label", visible ? "Tampilkan password" : "Sembunyikan password");
    });
  });
}

function setupFieldIcons() {
  document.querySelectorAll("[data-field-icon]").forEach((element) => {
    element.innerHTML = icon(element.dataset.fieldIcon);
  });
}

async function initializeLogin(expectedRole) {
  document.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter;
    setBusy(button, true, "Memeriksa...");
    try {
      const form = new FormData(event.currentTarget);
      const result = await signIn(form.get("email").trim(), form.get("password"), expectedRole);
      window.location.assign(result.role === "LIBRARIAN" ? "./librarian/index.html" : "./student/index.html");
    } catch (error) {
      const message = ["PENDING", "REJECTED", "WRONG_PORTAL"].includes(error.code) ? error.message : friendlyError(error);
      showToast(message, "danger");
    } finally {
      setBusy(button, false);
    }
  });
}

function validateRegistration(data) {
  if (data.password.length < 8) return "Password minimal 8 karakter.";
  if (!/[A-Z]/.test(data.password) || !/[a-z]/.test(data.password) || !/\d/.test(data.password)) return "Password harus berisi huruf besar, huruf kecil, dan angka.";
  const year = Number(data.enrollmentYear);
  const currentYear = new Date().getFullYear();
  if (year < currentYear - 6 || year > currentYear + 1) return "Tahun masuk tidak valid.";
  return "";
}

function initializeRegister() {
  const errorNotice = document.querySelector("[data-register-error]");
  const showRegistrationError = (message) => {
    errorNotice.textContent = message;
    errorNotice.hidden = false;
    showToast(message, "danger");
  };

  document.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    errorNotice.hidden = true;
    errorNotice.textContent = "";
    const button = event.submitter;
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const validationMessage = validateRegistration(payload);
    if (validationMessage) {
      showRegistrationError(validationMessage);
      return;
    }
    setBusy(button, true, "Mendaftarkan...");
    try {
      const { error } = await registerStudent(payload);
      if (error) throw error;
      window.location.assign("./registration-success.html");
    } catch (error) {
      showRegistrationError(friendlyError(error));
    } finally {
      setBusy(button, false);
    }
  });
}

function initializeForgotPassword() {
  document.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter;
    setBusy(button, true, "Mengirim...");
    try {
      const email = new FormData(event.currentTarget).get("email").trim();
      const { error } = await sendPasswordReset(email);
      if (error) throw error;
      const confirmation = document.querySelector("[data-reset-confirmation]");
      confirmation.hidden = false;
      confirmation.querySelector("strong").textContent = email;
      event.currentTarget.hidden = true;
    } catch (error) {
      showToast(friendlyError(error), "danger");
    } finally {
      setBusy(button, false);
    }
  });
}

function initializeUpdatePassword() {
  document.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = form.get("password");
    if (password !== form.get("confirmation")) {
      showToast("Konfirmasi password tidak sama.", "danger");
      return;
    }
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      showToast("Gunakan minimal 8 karakter dengan huruf besar, huruf kecil, dan angka.", "danger");
      return;
    }
    const button = event.submitter;
    setBusy(button, true, "Menyimpan...");
    try {
      const { error } = await updatePassword(password);
      if (error) throw error;
      document.querySelector("[data-update-form]").hidden = true;
      document.querySelector("[data-update-success]").hidden = false;
    } catch (error) {
      showToast(friendlyError(error), "danger");
    } finally {
      setBusy(button, false);
    }
  });
}

setupFieldIcons();
setupPasswordToggles();

if (page === "student-login") initializeLogin("STUDENT");
if (page === "admin-login") initializeLogin("LIBRARIAN");
if (page === "register") initializeRegister();
if (page === "forgot-password") initializeForgotPassword();
if (page === "update-password") initializeUpdatePassword();

