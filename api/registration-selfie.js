import { randomUUID } from "node:crypto";
import { SELFIE_BUCKET, readJson, reply, selfieObjectPath, serverConfig, supabaseRequest, validateSelfieImage, verifiedUser } from "./_lib/selfie-server.js";

export default async function handler(request, response) {
  if (request.method === "GET") return reply(response, 200, { serverTime: new Date().toISOString() });
  if (request.method !== "POST") { response.setHeader("Allow", "GET, POST"); return reply(response, 405, { error: "Metode tidak didukung." }); }
  if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] || "")) return reply(response, 415, { error: "Data foto tidak valid." });
  try {
    const config = serverConfig();
    const body = readJson(request);
    const image = validateSelfieImage(body.image);
    const capturedAt = Date.parse(body.capturedAt);
    if (!Number.isFinite(capturedAt) || Math.abs(Date.now() - capturedAt) > 5 * 60 * 1000) return reply(response, 400, { error: "Waktu foto sudah lewat. Ambil selfie baru sebelum mendaftar." });
    const { user, headers } = await verifiedUser(request, config);
    const profileResult = await supabaseRequest(config, `/rest/v1/student_profiles?select=id,status&id=eq.${user.id}`, { headers });
    if (!profileResult.ok) return reply(response, 502, { error: "Data pendaftaran belum dapat diperiksa." });
    const profiles = await profileResult.json();
    if (profiles.length !== 1 || profiles[0].status !== "PENDING") return reply(response, 403, { error: "Selfie hanya dapat dilengkapi saat menunggu validasi pendaftaran." });
    let lookup = await supabaseRequest(config, `/rest/v1/registration_selfies?student_id=eq.${user.id}&select=*`);
    if (!lookup.ok) return reply(response, 503, { error: "Penyimpanan selfie belum tersedia. Hubungi pustakawan." });
    let record = (await lookup.json())[0];
    if (record?.state === "READY" && Date.parse(record.expires_at) > Date.now()) return reply(response, 200, { success: true });
    if (record && Date.parse(record.expires_at) <= Date.now()) return reply(response, 409, { error: "Foto sebelumnya sedang dibersihkan. Hubungi pustakawan sebelum mencoba lagi." });
    if (!record) {
      const id = randomUUID();
      const created = await supabaseRequest(config, "/rest/v1/registration_selfies", {
        method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ id, student_id: user.id, object_path: `${user.id}/${id}.webp` })
      });
      if (!created.ok) return reply(response, created.status === 409 ? 409 : 503, { error: "Selfie belum dapat disiapkan. Coba simpan kembali." });
      record = (await created.json())[0];
    }
    if (!selfieObjectPath(record.object_path) || !record.object_path.startsWith(`${user.id}/`)) return reply(response, 502, { error: "Data penyimpanan selfie tidak valid." });
    const upload = await supabaseRequest(config, `/storage/v1/object/${SELFIE_BUCKET}/${record.object_path}`, {
      method: "POST", headers: { "Content-Type": "image/webp", "x-upsert": "true", "Cache-Control": "no-store" }, body: image
    });
    if (!upload.ok) return reply(response, 502, { error: "Foto belum berhasil diunggah. Coba simpan selfie kembali." });
    const completed = await supabaseRequest(config, "/rest/v1/rpc/complete_registration_selfie", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_id: record.id, p_student_id: user.id, p_captured_at: new Date(capturedAt).toISOString(), p_size: image.length })
    });
    if (!completed.ok) return reply(response, 502, { error: "Foto terunggah tetapi belum tercatat. Coba simpan selfie kembali." });
    return reply(response, 200, { success: true });
  } catch (error) { return reply(response, error.status || 502, { error: error.status ? error.message : "Selfie belum dapat disimpan. Coba lagi nanti." }); }
}
