import { getSupabase } from "./supabase.js";

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

export async function registerStudent({ fullName, className, enrollmentYear, major, email, password }) {
  const client = await getSupabase();
  const result = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        registration_source: "LITERA_STUDENT",
        full_name: fullName,
        class_name: className,
        enrollment_year: Number(enrollmentYear),
        major
      }
    }
  });

  if (!result.error && Array.isArray(result.data.user?.identities) && result.data.user.identities.length === 0) {
    return { ...result, error: new Error("User already registered") };
  }

  if (!result.error && result.data.session) {
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
  if (identity.role === "STUDENT" && identity.profile.status !== "ACTIVE") {
    await client.auth.signOut({ scope: "local" });
    const error = new Error(identity.profile.status === "REJECTED" ? "Akun ditolak oleh pengelola." : "Akun masih menunggu validasi pengelola.");
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

export async function sendPasswordReset(email) {
  const client = await getSupabase();
  return client.auth.resetPasswordForEmail(email, {
    redirectTo: new URL("./update-password.html", window.location.href).href
  });
}

export async function updatePassword(password) {
  const client = await getSupabase();
  return client.auth.updateUser({ password });
}

export async function getCurrentIdentity() {
  const client = await getSupabase();
  const { data: { session }, error } = await client.auth.getSession();
  if (error) throw error;
  if (!session?.user) return null;
  return { user: session.user, ...(await resolveRole(client, session.user.id)) };
}

export async function requireRole(expectedRole) {
  const identity = await getCurrentIdentity();
  if (!identity || identity.role !== expectedRole) {
    window.location.replace(expectedRole === "LIBRARIAN" ? "../admin-login.html" : "../index.html");
    return null;
  }
  if (expectedRole === "STUDENT" && identity.profile.status !== "ACTIVE") {
    await signOut();
    window.location.replace("../index.html");
    return null;
  }
  return identity;
}

