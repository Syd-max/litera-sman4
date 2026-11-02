// Vercel server function. Never import this module from browser code.
export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  const reply = (status, error) => {
    response.statusCode = status;
    response.end(JSON.stringify(error ? { error } : { success: true }));
  };
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return reply(405, "Metode tidak didukung.");
  }
  if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] || "")) return reply(415, "Gunakan JSON.");
  const authorization = request.headers.authorization || "";
  if (!/^Bearer \S+$/.test(authorization)) return reply(401, "Silakan login kembali sebagai pustakawan.");

  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.startsWith("https://") || !publicKey || !secretKey) return reply(503, "Reset password belum dikonfigurasi di server. Hubungi pengelola website.");
  let body;
  try {
    if (Buffer.byteLength(typeof request.body === "string" ? request.body : JSON.stringify(request.body || {})) > 4096) return reply(413, "Data terlalu besar.");
    body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
  } catch { return reply(400, "Data tidak valid."); }
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body?.studentId || "")) return reply(400, "ID siswa tidak valid.");
  const password = body?.password;
  if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password, "utf8") > 72 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    return reply(400, "Gunakan 8–72 karakter dengan huruf besar, huruf kecil, dan angka. Jika terlalu panjang, kurangi karakter khusus.");
  }
  const userHeaders = { apikey: publicKey, Authorization: authorization };
  const adminHeaders = { apikey: secretKey, Authorization: `Bearer ${secretKey}` };
  const read = (path, headers) => fetch(`${url}${path}`, { headers, signal: AbortSignal.timeout(10000) });
  try {
    // Verify the token with Auth, then verify the caller's database role.
    const userResponse = await read("/auth/v1/user", userHeaders);
    if (!userResponse.ok) return reply(userResponse.status >= 500 ? 502 : 401, "Sesi tidak dapat diverifikasi. Silakan login kembali.");
    const user = await userResponse.json();
    if (!user.id) return reply(401, "Sesi tidak valid.");
    const roleResponse = await read(`/rest/v1/librarian_profiles?select=id&id=eq.${encodeURIComponent(user.id)}`, userHeaders);
    if (!roleResponse.ok) return reply(502, "Izin pustakawan belum dapat diperiksa.");
    const roles = await roleResponse.json();
    if (!Array.isArray(roles) || !roles.some(role => role.id === user.id)) return reply(403, "Hanya pustakawan yang dapat mereset password siswa.");

    // A librarian can reset students only, never another librarian or an arbitrary Auth user.
    const [studentResponse, librarianResponse] = await Promise.all([
      read(`/rest/v1/student_profiles?select=id&id=eq.${body.studentId}`, adminHeaders),
      read(`/rest/v1/librarian_profiles?select=id&id=eq.${body.studentId}`, adminHeaders)
    ]);
    if (!studentResponse.ok || !librarianResponse.ok) return reply(502, "Akun siswa belum dapat diperiksa.");
    const students = await studentResponse.json();
    const librarians = await librarianResponse.json();
    if (!Array.isArray(students) || students.length !== 1) return reply(404, "Akun siswa tidak ditemukan.");
    if (!Array.isArray(librarians) || librarians.length) return reply(403, "Password akun pustakawan tidak dapat diubah melalui menu ini.");

    const update = await fetch(`${url}/auth/v1/admin/users/${body.studentId}`, {
      method: "PUT", headers: { ...adminHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ password }), signal: AbortSignal.timeout(10000)
    });
    if (!update.ok) {
      if (update.status === 429) return reply(429, "Permintaan terlalu sering. Tunggu sebentar sebelum mencoba lagi.");
      return reply(update.status >= 500 ? 502 : 400, "Password belum berhasil diubah. Gunakan password baru yang kuat lalu coba lagi.");
    }
    return reply(200);
  } catch { return reply(502, "Layanan akun belum dapat dihubungi. Coba lagi nanti."); }
}
