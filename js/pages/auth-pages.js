import { icon } from "../components/icons.js";
import { setBusy, showToast } from "../components/feedback.js";
import { friendlyError } from "../utils.js";
import { getCurrentIdentity, registerStudent, signIn, updatePassword } from "../services/auth-service.js";
import { initializeSelectMenus } from "../components/select-menu.js";
import { enrollmentYears, isStudentAccessExpired, studentAccessExpiresAt } from "../account-lifecycle.js";
import { initializeSelfieCamera } from "../components/selfie-camera.js";

const page = document.body.dataset.page;

export async function restoreAuthNavigation() {
  if (!["student-login", "admin-login", "forgot-password"].includes(page)) return;
  const adminPortal = page === "admin-login" || new URLSearchParams(window.location.search).get("portal") === "admin";
  const backLinks = document.querySelectorAll("[data-auth-back]");
  for (const link of backLinks) link.href = adminPortal ? "./admin-login.html" : "./index.html";
  try {
    const identity = await getCurrentIdentity();
    if (!identity || (identity.role !== "LIBRARIAN" && !(identity.role === "STUDENT" && identity.profile?.status === "ACTIVE" && !isStudentAccessExpired(identity.profile)))) return;
    if (page === "forgot-password") {
      for (const link of backLinks) {
        link.href = identity.role === "LIBRARIAN" ? "./librarian/index.html" : "./student/profile.html";
        link.setAttribute("aria-label", "Kembali ke akun");
        if (link.classList.contains("forgot-login")) link.textContent = "Kembali ke Akun";
      }
    } else {
      window.location.replace(identity.role === "LIBRARIAN" ? "./librarian/index.html" : "./student/index.html");
    }
  } catch {
    // A temporary network failure must not clear a stored login session.
  }
}

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
      const message = ["PENDING", "REJECTED", "SUSPENDED", "EXPIRED", "WRONG_PORTAL"].includes(error.code) ? error.message : friendlyError(error);
      showToast(message, "danger");
    } finally {
      setBusy(button, false);
    }
  });
}

function validateRegistration(data) {
  if (data.password.length < 8) return "Password minimal 8 karakter.";
  if (!/[A-Z]/.test(data.password) || !/[a-z]/.test(data.password) || !/\d/.test(data.password)) return "Password harus berisi huruf besar, huruf kecil, dan angka.";
  if (!enrollmentYears().includes(Number(data.enrollmentYear))) return "Pilih tahun masuk mulai 2024 sampai tahun ini.";
  if (isStudentAccessExpired({ enrollment_year: data.enrollmentYear })) return "Masa aktif angkatan tersebut sudah berakhir. Hubungi pustakawan jika tahun masuk tidak sesuai.";
  return "";
}

function initializeRegister() {
  const camera = initializeSelfieCamera(document.getElementById("selfie-time"));
  let pendingPayload = null;
  const yearSelect = document.getElementById("enrollment-year");
  yearSelect.insertAdjacentHTML("beforeend", enrollmentYears().map(year => `<option value="${year}" ${isStudentAccessExpired({ enrollment_year: year }) ? "disabled" : ""}>${year}</option>`).join(""));
  initializeSelectMenus();
  yearSelect.addEventListener("change", () => {
    const expiry = studentAccessExpiresAt({ enrollment_year: yearSelect.value });
    const date = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" }).format(expiry);
    document.getElementById("enrollment-expiry").textContent = `Akses angkatan ${yearSelect.value} berakhir pada ${date}.`;
  });
  yearSelect.addEventListener("invalid", event => {
    event.preventDefault();
    yearSelect.parentElement.querySelector(".select-menu__button").focus();
    showToast("Pilih tahun masuk terlebih dahulu.", "danger");
  });
  const errorNotice = document.querySelector("[data-register-error]");
  document.getElementById("selfie-time").addEventListener("selfie-ready", () => { errorNotice.hidden = true; errorNotice.textContent = ""; });
  const showRegistrationError = (message) => {
    errorNotice.textContent = message;
    errorNotice.hidden = false;
    showToast(message, "danger");
  };

  document.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const registrationForm = event.currentTarget;
    errorNotice.hidden = true;
    errorNotice.textContent = "";
    const button = event.submitter;
    const form = new FormData(event.currentTarget);
    const payload = pendingPayload || Object.fromEntries(form.entries());
    const validationMessage = pendingPayload ? "" : validateRegistration(payload);
    if (validationMessage) {
      showRegistrationError(validationMessage);
      return;
    }
    const selfie = camera.photo();
    if (!selfie) { showRegistrationError("Ambil selfie melalui kamera sebelum mendaftar."); return; }
    setBusy(button, true, "Mendaftarkan...");
    try {
      const { error } = await registerStudent({ ...payload, selfie });
      if (error) throw error;
      window.location.assign("./registration-success.html");
    } catch (error) {
      if (error.code === "SELFIE_UPLOAD_RETRY") {
        pendingPayload = payload;
        registrationForm.querySelectorAll("[name]").forEach(field => { field.disabled = true; });
      }
      showRegistrationError(friendlyError(error));
    } finally {
      setBusy(button, false);
      if (pendingPayload) button.textContent = "Coba Simpan Selfie Lagi";
    }
  });
  getCurrentIdentity().then(identity => {
    if (identity?.role !== "STUDENT" || identity.profile.status !== "PENDING") return;
    const profile = identity.profile;
    if (!enrollmentYears().includes(Number(profile.enrollment_year))) return;
    pendingPayload = { fullName: profile.full_name, className: profile.class_name, enrollmentYear: String(profile.enrollment_year), major: profile.major, email: profile.email, password: "" };
    const form = document.querySelector("form");
    for (const [name, value] of Object.entries(pendingPayload)) {
      const field = form.elements[name];
      if (field) { field.value = value; field.disabled = true; }
    }
    yearSelect.dispatchEvent(new Event("change"));
    form.querySelector('[type="submit"]').textContent = "Lengkapi Selfie Pendaftaran";
  }).catch(() => {});
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
if (page === "student-login" && new URLSearchParams(window.location.search).get("account") === "suspended") {
  showToast("Akun Anda ditangguhkan. Hubungi pustakawan untuk pemulihan akses.", "danger");
}
if (page === "student-login" && new URLSearchParams(window.location.search).get("account") === "expired") {
  showToast("Masa aktif akun tiga tahun ajaran telah berakhir. Hubungi pustakawan jika data tahun masuk tidak sesuai.", "danger");
}
if (page === "admin-login") initializeLogin("LIBRARIAN");
if (page === "register") initializeRegister();
if (page === "update-password") initializeUpdatePassword();

restoreAuthNavigation();
window.addEventListener("pageshow", (event) => {
  if (event.persisted) restoreAuthNavigation();
});

