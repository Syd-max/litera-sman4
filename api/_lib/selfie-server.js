export const SELFIE_BUCKET = "registration-selfies";
export const MAX_SELFIE_BYTES = 200 * 1024;
export const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function reply(response, status, data) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.statusCode = status;
  response.end(JSON.stringify(data));
}

export function serverConfig() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url?.startsWith("https://") || !publicKey || !secret) throw Object.assign(new Error("Selfie Time belum tersedia. Hubungi pustakawan."), { status: 503 });
  const adminHeaders = { apikey: secret };
  if (!secret.startsWith("sb_secret_")) adminHeaders.Authorization = `Bearer ${secret}`;
  return { url, publicKey, adminHeaders };
}

export const supabaseRequest = (config, path, options = {}) => fetch(`${config.url}${path}`, {
  ...options, headers: { ...config.adminHeaders, ...options.headers }, signal: AbortSignal.timeout(10000)
});

export async function verifiedUser(request, config, librarian = false) {
  const authorization = request.headers.authorization || "";
  if (!/^Bearer \S+$/.test(authorization)) throw Object.assign(new Error("Sesi tidak tersedia. Silakan masuk kembali."), { status: 401 });
  const headers = { apikey: config.publicKey, Authorization: authorization };
  const result = await supabaseRequest(config, "/auth/v1/user", { headers });
  if (!result.ok) throw Object.assign(new Error("Sesi tidak dapat diverifikasi. Silakan masuk kembali."), { status: 401 });
  const user = await result.json();
  if (!UUID.test(user.id)) throw Object.assign(new Error("Sesi tidak valid."), { status: 401 });
  const roleResult = await supabaseRequest(config, `/rest/v1/librarian_profiles?select=id&id=eq.${user.id}`, { headers });
  if (!roleResult.ok) throw Object.assign(new Error("Izin akun belum dapat diperiksa."), { status: 502 });
  const roles = await roleResult.json();
  const isLibrarian = Array.isArray(roles) && roles.some(role => role.id === user.id);
  if (librarian && !isLibrarian) throw Object.assign(new Error("Hanya pustakawan yang dapat mengakses fitur ini."), { status: 403 });
  if (!librarian && isLibrarian) throw Object.assign(new Error("Selfie pendaftaran hanya untuk akun siswa."), { status: 403 });
  return { user, headers };
}

export function readJson(request) {
  const text = typeof request.body === "string" ? request.body : JSON.stringify(request.body || {});
  if (Buffer.byteLength(text) > 300 * 1024) throw Object.assign(new Error("Ukuran foto terlalu besar."), { status: 413 });
  try { return JSON.parse(text); } catch { throw Object.assign(new Error("Data foto tidak valid."), { status: 400 }); }
}

export function validateSelfieImage(encoded) {
  if (typeof encoded !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length > Math.ceil(MAX_SELFIE_BYTES / 3) * 4) {
    throw Object.assign(new Error("Foto WebP tidak valid atau terlalu besar."), { status: 400 });
  }
  const image = Buffer.from(encoded, "base64");
  if (image.length < 30 || image.length > MAX_SELFIE_BYTES || image.toString("ascii", 0, 4) !== "RIFF" || image.toString("ascii", 8, 12) !== "WEBP" || image.readUInt32LE(4) + 8 !== image.length) {
    throw Object.assign(new Error("Foto harus berupa WebP maksimal 200 KB."), { status: 400 });
  }
  const type = image.toString("ascii", 12, 16);
  let width, height;
  if (type === "VP8X") {
    if (image[20] & 2) throw Object.assign(new Error("Gunakan satu foto, bukan animasi."), { status: 400 });
    width = 1 + image.readUIntLE(24, 3); height = 1 + image.readUIntLE(27, 3);
  } else if (type === "VP8 " && image.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
    width = image.readUInt16LE(26) & 0x3fff; height = image.readUInt16LE(28) & 0x3fff;
  } else if (type === "VP8L" && image[20] === 0x2f) {
    const dimensions = image.readUInt32LE(21); width = (dimensions & 0x3fff) + 1; height = ((dimensions >>> 14) & 0x3fff) + 1;
  }
  if (!width || !height || width > 960 || height > 960) throw Object.assign(new Error("Resolusi foto tidak valid. Ambil ulang melalui kamera."), { status: 400 });
  return image;
}

export const selfieObjectPath = (path) => /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/i.test(path || "");
