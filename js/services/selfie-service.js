import { getSupabase } from "./supabase.js";

async function selfieRequest(path, options = {}) {
  const client = await getSupabase();
  const { data: { session }, error } = await client.auth.getSession();
  if (error) throw error;
  if (!session?.access_token) throw Object.assign(new Error("Sesi pendaftaran tidak tersedia. Muat ulang halaman lalu coba lagi."), { code: "SELFIE_ERROR" });
  const response = await fetch(path, { ...options, headers: { Authorization: `Bearer ${session.access_token}`, ...options.headers } });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(result?.error || "Selfie belum dapat diproses. Coba lagi nanti."), { code: "SELFIE_ERROR" });
  return result;
}

export async function uploadRegistrationSelfie(blob, capturedAt) {
  const encoded = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(new Error("Foto belum dapat dibaca."));
    reader.readAsDataURL(blob);
  });
  return selfieRequest("/api/registration-selfie", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: encoded, capturedAt })
  });
}

export const getStudentSelfie = studentId => selfieRequest(`/api/student-selfie?studentId=${encodeURIComponent(studentId)}`);
