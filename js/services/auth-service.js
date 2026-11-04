import { getSupabase } from "./supabase.js";
import { enrollmentYears, isStudentAccessExpired, studentAccessExpiresAt } from "../account-lifecycle.js";
import { uploadRegistrationSelfie } from "./selfie-service.js";

let pendingRegistration;

async function resolveRole(client, userId) {
  const [{ data: student, error: studentError }, { data: librarian, error: librarianError }] = await Promise.all([
    client.from("student_profiles").select("*").eq("id", userId).maybeSingle(),
    client.from("librarian_profiles").select("*").eq("id", userId).maybeSingle()
  ]);
  if (studentError) throw studentError;
  if (librarianError) throw librarianError;
  if (librarian) return { role: "LIBRARIAN", profile: librarian };
  if (student) return { role: "STUDENT", profile: student };
  return { role: null, profile: null };
}

export async function registerStudent({ fullName, className, enrollmentYear, major, email, password, selfie }) {
  if (!selfie?.blob?.size || selfie.blob.type !== "image/webp" || !selfie.capturedAt) throw Object.assign(new Error("Ambil selfie melalui kamera sebelum mendaftar."), { code: "SELFIE_ERROR" });
  if (!enrollmentYears().includes(Number(enrollmentYear))) throw new Error("Pilih tahun masuk mulai 2024 sampai tahun ini.");
  if (isStudentAccessExpired({ enrollment_year: enrollmentYear })) throw Object.assign(new Error("Masa aktif angkatan tersebut sudah berakhir."), { code: "EXPIRED" });
  // Refuse signup before it can send mail if the hosted Auth settings drift.
  const config = window.LITERA_CONFIG || {};
  const settingsResponse = await fetch(`${config.supabaseUrl}/auth/v1/settings`, {
    headers: { apikey: config.supabasePublishableKey }
  });
  if (!settingsResponse.ok) throw new Error("Pengaturan pendaftaran belum dapat diperiksa. Coba lagi nanti.");
  const settings = await settingsResponse.json();
  if (settings.mailer_autoconfirm !== true) {
    throw Object.assign(new Error("Pendaftaran sementara belum tersedia. Hubungi pustakawan untuk mengaktifkan pendaftaran tanpa konfirmasi email."), { code: "EMAIL_CONFIRMATION_ENABLED" });
  }
  const client = await getSupabase();
  let result = pendingRegistration?.email === email ? pendingRegistration.result : null;
  if (!result) {
    const { data: { session } } = await client.auth.getSession();
    if (session?.user?.email?.toLowerCase() === email.toLowerCase()) {
      const identity = await resolveRole(client, session.user.id);
      if (identity.role === "STUDENT" && identity.profile.status === "PENDING") result = { data: { user: session.user, session }, error: null };
      else return { data: { user: null, session: null }, error: new Error("User already registered") };
    }
  }
  if (!result) result = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        registration_source: "LITERA_STUDENT",
        full_name: fullName,
        class_name: className,
        enrollment_year: Number(enrollmentYear),
        major,
        selfie_required: true
      }
    }
  });

  const duplicate = result.error?.code === "user_already_exists" || /already registered/i.test(result.error?.message || "")
    || (!result.error && Array.isArray(result.data.user?.identities) && result.data.user.identities.length === 0);
  if (duplicate) {
    const duplicateError = result.error || new Error("User already registered");
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error) return { ...result, error: duplicateError };
    const identity = await resolveRole(client, login.data.user.id);
    if (identity.role !== "STUDENT" || identity.profile.status !== "PENDING") {
      await client.auth.signOut({ scope: "local" });
      return { ...result, error: duplicateError };
    }
    result = login;
  }

  if (!result.error && result.data.session) {
    pendingRegistration = { email, result };
    try { await uploadRegistrationSelfie(selfie.blob, selfie.capturedAt); }
    catch (error) { throw Object.assign(new Error(`Akun sudah dibuat, tetapi selfie belum tersimpan. ${error.message}`), { code: "SELFIE_UPLOAD_RETRY" }); }
    pendingRegistration = null;
    await client.auth.signOut({ scope: "local" });
  }

  return result;
}

export async function signIn(email, password, expectedRole) {
  const client = await getSupabase();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const identity = await resolveRole(client, data.user.id);
  if (!identity.role) {
    await client.auth.signOut({ scope: "local" });
    throw new Error("Profil akun belum tersedia.");
  }
  if (identity.role !== expectedRole) {
    await client.auth.signOut({ scope: "local" });
    const error = new Error(expectedRole === "LIBRARIAN" ? "Akun ini bukan akun admin." : "Akun admin harus masuk melalui halaman Login Admin.");
    error.code = "WRONG_PORTAL";
    throw error;
  }
  if (identity.role === "STUDENT" && isStudentAccessExpired(identity.profile)) {
    await client.auth.signOut({ scope: "local" });
    throw Object.assign(new Error("Masa aktif akun tiga tahun ajaran telah berakhir. Hubungi pustakawan jika tahun masuk tidak sesuai."), { code: "EXPIRED" });
  }
  if (identity.role === "STUDENT" && identity.profile.status !== "ACTIVE") {
    await client.auth.signOut({ scope: "local" });
    const error = new Error(identity.profile.status === "SUSPENDED" ? "Akun Anda ditangguhkan. Hubungi pustakawan untuk pemulihan akses." : identity.profile.status === "REJECTED" ? "Akun ditolak oleh pengelola." : "Akun masih menunggu validasi pengelola.");
    error.code = identity.profile.status;
    throw error;
  }
  return { ...data, ...identity };
}

export async function signOut() {
  const client = await getSupabase();
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) throw error;
}

export async function updatePassword(password) {
  const client = await getSupabase();
  return client.auth.updateUser({ password });
}

async function verifiedSessionUser(client) {
  const { data: { user }, error } = await client.auth.getUser();
  if (error) {
    if (![401, 403].includes(error.status) && error.name !== "AuthSessionMissingError") throw error;
    return null;
  }
  return user;
}

export async function getCurrentIdentity() {
  const client = await getSupabase();
  const { data: { session }, error } = await client.auth.getSession();
  if (error) throw error;
  if (!session?.user) return null;
  const user = await verifiedSessionUser(client);
  if (!user) {
    await client.auth.signOut({ scope: "local" });
    return null;
  }
  return { user, ...(await resolveRole(client, user.id)) };
}

export async function requireRole(expectedRole) {
  const identity = await getCurrentIdentity();
  if (!identity || identity.role !== expectedRole) {
    window.location.replace(expectedRole === "LIBRARIAN" ? "../admin-login.html" : "../index.html");
    return null;
  }
  if (expectedRole === "STUDENT" && isStudentAccessExpired(identity.profile)) {
    await signOut();
    window.location.replace("../index.html?account=expired");
    return null;
  }
  if (expectedRole === "STUDENT" && identity.profile.status !== "ACTIVE") {
    await signOut();
    window.location.replace(identity.profile.status === "SUSPENDED" ? "../index.html?account=suspended" : "../index.html");
    return null;
  }
  return identity;
}

export async function watchStudentAccess(identity, onBlocked) {
  const client = await getSupabase();
  let blocked = false;
  let checking = false;
  let stopped = false;
  let expiryTimer;
  let lastSignalCheck = -Infinity;
  let profile = identity.profile;
  const scheduleExpiry = () => {
    clearTimeout(expiryTimer);
    const expiry = studentAccessExpiresAt(profile);
    if (expiry !== null) expiryTimer = setTimeout(() => void check(), Math.max(1, Math.min(expiry - Date.now(), 2147483647)));
  };
  const block = async (status) => {
    if (blocked || stopped) return;
    blocked = true;
    clearTimeout(expiryTimer);
    onBlocked();
    try { await client.auth.signOut({ scope: "local" }); }
    finally { window.location.replace(status === "EXPIRED" ? "../index.html?account=expired" : status === "SUSPENDED" ? "../index.html?account=suspended" : "../index.html"); }
  };
  const check = async () => {
    if (checking || stopped || blocked) return;
    checking = true;
    try {
      if (isStudentAccessExpired(profile)) { await block("EXPIRED"); return; }
      if (!await verifiedSessionUser(client)) { await block("SESSION_ENDED"); return; }
      const { data, error } = await client.from("student_profiles").select("*").eq("id", identity.user.id).maybeSingle();
      if (!error && data) {
        profile = data;
        if (isStudentAccessExpired(profile)) await block("EXPIRED");
        else if (data.status !== "ACTIVE") await block(data.status);
      }
    } catch {
      // Network failures must not log out an otherwise active student.
    } finally { checking = false; if (!blocked && !stopped) scheduleExpiry(); }
  };
  const channel = client.channel(`student-access-${identity.user.id}`)
    // Broadcast only requests a server check; its payload never authorizes a logout.
    .on("broadcast", { event: "session-reset" }, () => {
      if (Date.now() - lastSignalCheck < 2000) return;
      lastSignalCheck = Date.now();
      void check();
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "student_profiles", filter: `id=eq.${identity.user.id}` }, (event) => {
      if (event.new?.status) {
        profile = event.new;
        if (isStudentAccessExpired(profile)) void block("EXPIRED").catch(() => {});
        else if (event.new.status !== "ACTIVE") void block(event.new.status).catch(() => {});
        else scheduleExpiry();
      }
    })
    .subscribe((status) => { if (status === "SUBSCRIBED") void check(); });
  const { data: { subscription } } = client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") setTimeout(() => void block("SESSION_ENDED"), 0);
  });
  const visible = () => { if (document.visibilityState === "visible") void check(); };
  const sessionTimer = setInterval(visible, 30000);
  window.addEventListener("focus", check);
  window.addEventListener("pageshow", check);
  window.addEventListener("online", check);
  document.addEventListener("visibilitychange", visible);
  await check();
  return () => {
    stopped = true;
    clearTimeout(expiryTimer);
    clearInterval(sessionTimer);
    subscription.unsubscribe();
    void client.removeChannel(channel);
    window.removeEventListener("focus", check);
    window.removeEventListener("pageshow", check);
    window.removeEventListener("online", check);
    document.removeEventListener("visibilitychange", visible);
  };
}

