import { timingSafeEqual } from "node:crypto";
import { SELFIE_BUCKET, reply, selfieObjectPath, serverConfig, supabaseRequest } from "./_lib/selfie-server.js";

export default async function handler(request, response) {
  if (request.method !== "GET") return reply(response, 405, { error: "Metode tidak didukung." });
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.authorization || "");
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reply(response, 401, { error: "Tidak diizinkan." });
  try {
    const config = serverConfig();
    const cutoff = new Date().toISOString();
    const result = await supabaseRequest(config, `/rest/v1/registration_selfies?expires_at=lte.${encodeURIComponent(cutoff)}&select=id,object_path&order=expires_at.asc&limit=500`);
    if (!result.ok) return reply(response, 502, { error: "Daftar foto kedaluwarsa belum dapat dimuat." });
    const records = await result.json();
    if (!Array.isArray(records) || records.some(record => !selfieObjectPath(record.object_path))) return reply(response, 502, { error: "Data pembersihan foto tidak valid." });
    if (!records.length) return reply(response, 200, { deleted: 0 });
    const removed = await supabaseRequest(config, `/storage/v1/object/${SELFIE_BUCKET}`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: records.map(record => record.object_path) })
    });
    if (!removed.ok) return reply(response, 502, { error: "File foto belum dapat dibersihkan. Metadata dipertahankan untuk dicoba lagi." });
    const ids = records.map(record => record.id).join(",");
    const metadata = await supabaseRequest(config, `/rest/v1/registration_selfies?id=in.(${ids})&expires_at=lte.${encodeURIComponent(cutoff)}`, { method: "DELETE" });
    if (!metadata.ok) return reply(response, 502, { error: "File sudah dibersihkan; metadata akan dicoba lagi pada jadwal berikutnya." });
    return reply(response, 200, { deleted: records.length });
  } catch { return reply(response, 502, { error: "Pembersihan foto belum selesai. Coba lagi nanti." }); }
}
