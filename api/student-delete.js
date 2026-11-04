import { SELFIE_BUCKET, UUID, reply, selfieObjectPath, serverConfig, supabaseRequest, verifiedUser } from "./_lib/selfie-server.js";

export default async function handler(request, response) {
  if (request.method !== "DELETE") {
    response.setHeader("Allow", "DELETE");
    return reply(response, 405, { error: "Metode tidak didukung." });
  }
  if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] || "")) return reply(response, 415, { error: "Gunakan JSON." });
  let body;
  try {
    const raw = typeof request.body === "string" ? request.body : JSON.stringify(request.body || {});
    if (Buffer.byteLength(raw) > 4096) return reply(response, 413, { error: "Data terlalu besar." });
    body = JSON.parse(raw);
  } catch { return reply(response, 400, { error: "Data tidak valid." }); }
  if (!UUID.test(body?.studentId || "")) return reply(response, 400, { error: "ID siswa tidak valid." });
  try {
    const config = serverConfig();
    await verifiedUser(request, config, true);
    const deleted = await supabaseRequest(config, "/rest/v1/rpc/delete_rejected_student_account", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ p_student_id: body.studentId })
    });
    if (!deleted.ok) {
      const details = await deleted.json().catch(() => ({}));
      if (["PGRST202", "42883", "42501"].includes(details.code)) return reply(response, 503, { error: "Penghapusan akun belum aktif. Jalankan delete-rejected-students.sql di Supabase." });
      if (/student is not rejected|cannot delete librarian/.test(details.message || "")) return reply(response, 409, { error: "Hanya akun siswa berstatus Ditolak yang dapat dihapus." });
      if (/student has active loans/.test(details.message || "")) return reply(response, 409, { error: "Akun masih memiliki peminjaman berjalan. Selesaikan peminjaman sebelum menghapus akun." });
      return reply(response, 502, { error: "Akun belum dapat dihapus. Data tetap tersimpan; coba lagi nanti." });
    }
    const { photos } = await deleted.json();
    let photoCleanupPending = !Array.isArray(photos);
    if (Array.isArray(photos) && photos.length) {
      photoCleanupPending = true;
      if (photos.every(photo => UUID.test(photo.id) && selfieObjectPath(photo.object_path) && photo.object_path.startsWith(`${body.studentId}/`))) {
        try {
          const removed = await supabaseRequest(config, `/storage/v1/object/${SELFIE_BUCKET}`, {
            method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: photos.map(photo => photo.object_path) })
          });
          if (removed.ok) {
            const metadata = await supabaseRequest(config, `/rest/v1/registration_selfies?id=in.(${photos.map(photo => photo.id).join(",")})&student_id=is.null`, { method: "DELETE" });
            photoCleanupPending = !metadata.ok;
          }
        } catch { /* The expired queue lets the daily cleanup retry safely. */ }
      }
    }
    return reply(response, 200, { success: true, photoCleanupPending });
  } catch (error) {
    return reply(response, error.status || 502, { error: error.status === 503 ? "Penghapusan akun belum dikonfigurasi di server." : error.status ? error.message : "Hasil penghapusan belum dapat dipastikan. Muat ulang daftar siswa sebelum mencoba lagi." });
  }
}
