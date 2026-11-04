import { SELFIE_BUCKET, UUID, reply, selfieObjectPath, serverConfig, supabaseRequest, verifiedUser } from "./_lib/selfie-server.js";

export default async function handler(request, response) {
  if (request.method !== "GET") { response.setHeader("Allow", "GET"); return reply(response, 405, { error: "Metode tidak didukung." }); }
  try {
    const studentId = new URL(request.url, "https://litera.local").searchParams.get("studentId");
    if (!UUID.test(studentId || "")) return reply(response, 400, { error: "ID siswa tidak valid." });
    const config = serverConfig();
    await verifiedUser(request, config, true);
    const result = await supabaseRequest(config, `/rest/v1/registration_selfies?student_id=eq.${studentId}&state=eq.READY&select=object_path,captured_at,received_at,expires_at`);
    if (!result.ok) return reply(response, 503, { error: "Foto belum dapat dimuat. Pastikan konfigurasi Selfie Time sudah aktif." });
    const record = (await result.json())[0];
    if (!record || Date.parse(record.expires_at) <= Date.now()) return reply(response, 200, { photo: null });
    if (!selfieObjectPath(record.object_path)) return reply(response, 502, { error: "Data foto tidak valid." });
    const expiresIn = Math.max(1, Math.min(300, Math.floor((Date.parse(record.expires_at) - Date.now()) / 1000)));
    const signed = await supabaseRequest(config, `/storage/v1/object/sign/${SELFIE_BUCKET}/${record.object_path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn })
    });
    if (!signed.ok) return reply(response, 502, { error: "Foto belum dapat dibuka. Coba lagi nanti." });
    const data = await signed.json();
    if (typeof data.signedURL !== "string" || !data.signedURL.startsWith(`/object/sign/${SELFIE_BUCKET}/`)) return reply(response, 502, { error: "Tautan foto tidak valid." });
    return reply(response, 200, { photo: { url: `${config.url}/storage/v1${data.signedURL}`, capturedAt: record.captured_at, receivedAt: record.received_at, expiresAt: record.expires_at } });
  } catch (error) { return reply(response, error.status || 502, { error: error.status ? error.message : "Foto belum dapat dimuat. Coba lagi nanti." }); }
}
