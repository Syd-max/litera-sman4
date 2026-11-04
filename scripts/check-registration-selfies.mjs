import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import upload from "../api/registration-selfie.js";
import view from "../api/student-selfie.js";
import cleanup from "../api/cleanup-selfies.js";
import { validateSelfieImage } from "../api/_lib/selfie-server.js";

const studentId = "11111111-1111-4111-8111-111111111111", adminId = "22222222-2222-4222-8222-222222222222", photoId = "33333333-3333-4333-8333-333333333333";
const originalFetch = globalThis.fetch;
const keys = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET"];
const originalEnv = keys.map(key => process.env[key]);
Object.assign(process.env, { SUPABASE_URL: "https://selfies.example.test", SUPABASE_PUBLISHABLE_KEY: "public-test", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test", CRON_SECRET: "cron-test-secret" });
const image = Buffer.alloc(30); image.write("RIFF"); image.writeUInt32LE(22, 4); image.write("WEBPVP8X", 8); image.writeUInt32LE(10, 16); image.writeUIntLE(639, 24, 3); image.writeUIntLE(479, 27, 3);
let role, status, record, expired, requests, uploadStatus, completeStatus, removeStatus, metadataStatus;
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
function reset() { role = "STUDENT"; status = "PENDING"; record = null; expired = []; requests = []; uploadStatus = 200; completeStatus = 200; removeStatus = 200; metadataStatus = 200; }
globalThis.fetch = async (url, options) => {
  requests.push({ url, ...options });
  if (options.headers.apikey === "sb_secret_test") assert.equal(options.headers.Authorization, undefined);
  if (url.endsWith("/auth/v1/user")) return response({ id: role === "LIBRARIAN" ? adminId : studentId });
  if (url.includes("/librarian_profiles")) return response(role === "LIBRARIAN" ? [{ id: adminId }] : []);
  if (url.includes("/student_profiles")) return response([{ id: studentId, status }]);
  if (url.includes("/registration_selfies") && options.method === "POST") {
    record = { ...JSON.parse(options.body), state: "UPLOADING", expires_at: new Date(Date.now() + 7 * 86400000).toISOString() };
    return response([record], 201);
  }
  if (url.includes("/registration_selfies") && options.method === "DELETE") return response({}, metadataStatus);
  if (url.includes("/registration_selfies?expires_at=")) return response(expired);
  if (url.includes("/registration_selfies")) return response(record ? [record] : []);
  if (url.includes("/rpc/complete_registration_selfie")) return response({}, completeStatus);
  if (url.includes("/object/sign/")) return response({ signedURL: `/object/sign/registration-selfies/${record.object_path}?token=test-signed-token` });
  if (url.endsWith("/object/registration-selfies") && options.method === "DELETE") return response({}, removeStatus);
  if (url.includes("/object/registration-selfies/") && options.method === "POST") {
    assert.equal(options.headers["Content-Type"], "image/webp");
    assert.ok(Buffer.isBuffer(options.body));
    return response({}, uploadStatus);
  }
  throw new Error("Unexpected request in selfie tests");
};
async function call(handler, overrides = {}) {
  const req = { method: "POST", url: "/api/registration-selfie", headers: { "content-type": "application/json", authorization: "Bearer student-token" }, body: { image: image.toString("base64"), capturedAt: new Date().toISOString() }, ...overrides };
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(body) { this.body = JSON.parse(body); } };
  await handler(req, res);
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.doesNotMatch(JSON.stringify(res.body), /sb_secret_test|cron-test-secret|student-token/);
  return res;
}
function readyRecord(expiry = Date.now() + 7 * 86400000) {
  return { id: photoId, student_id: studentId, state: "READY", object_path: `${studentId}/${photoId}.webp`, captured_at: new Date().toISOString(), received_at: new Date().toISOString(), expires_at: new Date(expiry).toISOString() };
}
try {
  assert.equal(validateSelfieImage(image.toString("base64")).length, image.length);
  assert.throws(() => validateSelfieImage(Buffer.from("not an image").toString("base64")));
  const huge = Buffer.from(image); huge.writeUIntLE(2000, 24, 3); assert.throws(() => validateSelfieImage(huge.toString("base64")));
  const animated = Buffer.from(image); animated[20] = 2; assert.throws(() => validateSelfieImage(animated.toString("base64")));
  reset(); assert.equal((await call(upload, { headers: { "content-type": "application/json" } })).statusCode, 401); assert.equal(requests.length, 0);
  reset(); assert.equal((await call(upload, { body: { image: image.toString("base64"), capturedAt: new Date(Date.now() - 3600000).toISOString() } })).statusCode, 400); assert.equal(requests.length, 0);
  reset(); status = "ACTIVE"; assert.equal((await call(upload)).statusCode, 403); assert.ok(!requests.some(r => r.url.includes("/storage/")));
  reset(); role = "LIBRARIAN"; assert.equal((await call(upload)).statusCode, 403);
  reset(); assert.equal((await call(upload)).statusCode, 200);
  const created = requests.findIndex(r => r.url.endsWith("/registration_selfies") && r.method === "POST");
  const saved = requests.findIndex(r => r.url.includes("/object/registration-selfies/"));
  const completed = requests.findIndex(r => r.url.includes("/rpc/complete_registration_selfie"));
  assert.ok(created < saved && saved < completed, "Track cleanup before uploading; approve only after upload succeeded");
  reset(); uploadStatus = 502; assert.equal((await call(upload)).statusCode, 502); assert.equal(record.state, "UPLOADING"); assert.ok(!requests.some(r => r.url.includes("/rpc/complete_registration_selfie")));
  reset(); completeStatus = 502; assert.equal((await call(upload)).statusCode, 502); assert.ok(record.object_path, "Failed completion must retain a cleanup queue entry");
  reset(); record = readyRecord(); assert.equal((await call(upload)).statusCode, 200); assert.ok(!requests.some(r => r.url.includes("/storage/")), "Successful registration retries are idempotent");

  const adminRequest = { method: "GET", url: `/api/student-selfie?studentId=${studentId}` };
  reset(); record = readyRecord(); assert.equal((await call(view, adminRequest)).statusCode, 403); assert.ok(!requests.some(r => r.url.includes("/object/sign/")));
  reset(); role = "LIBRARIAN"; record = readyRecord();
  let result = await call(view, adminRequest); assert.equal(result.statusCode, 200); assert.match(result.body.photo.url, /^https:\/\/selfies\.example\.test\/storage\/v1\/object\/sign\/registration-selfies\//);
  assert.equal(JSON.parse(requests.find(r => r.url.includes("/object/sign/")).body).expiresIn, 300);
  reset(); role = "LIBRARIAN"; record = readyRecord(Date.now() + 30000); await call(view, adminRequest);
  assert.ok(JSON.parse(requests.find(r => r.url.includes("/object/sign/")).body).expiresIn <= 30);
  reset(); role = "LIBRARIAN"; record = readyRecord(Date.now() - 1); result = await call(view, adminRequest); assert.equal(result.body.photo, null); assert.ok(!requests.some(r => r.url.includes("/object/sign/")));

  reset(); assert.equal((await call(cleanup, { method: "GET" })).statusCode, 401); assert.equal(requests.length, 0);
  const cronRequest = { method: "GET", headers: { authorization: "Bearer cron-test-secret" } };
  reset(); result = await call(cleanup, cronRequest); assert.equal(result.body.deleted, 0);
  reset(); expired = [readyRecord(Date.now() - 1000)]; removeStatus = 502;
  assert.equal((await call(cleanup, cronRequest)).statusCode, 502); assert.ok(!requests.some(r => r.url.includes("/rest/v1/registration_selfies") && r.method === "DELETE"));
  reset(); expired = [readyRecord(Date.now() - 1000)]; result = await call(cleanup, cronRequest); assert.equal(result.body.deleted, 1);
  const removeFile = requests.findIndex(r => r.url.includes("/storage/") && r.method === "DELETE");
  const removeMetadata = requests.findIndex(r => r.url.includes("/rest/") && r.method === "DELETE");
  assert.ok(removeFile < removeMetadata);
  assert.deepEqual(JSON.parse(requests[removeFile].body).prefixes, [`${studentId}/${photoId}.webp`]);
  assert.match(requests[removeMetadata].url, /expires_at=lte\./);

  const sql = await readFile(new URL("../supabase/registration-selfies.sql", import.meta.url), "utf8");
  const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  assert.ok(schema.includes(sql.slice(sql.indexOf("alter table public.student_profiles"), sql.indexOf("\ncommit;")).trim()));
  assert.match(sql, /'registration-selfies', 'registration-selfies', false, 204800/);
  assert.match(sql, /interval '7 days'/);
  assert.match(sql, /on delete set null/);
  assert.match(sql, /revoke all on public\.registration_selfies from public, anon, authenticated/);
  assert.match(sql, /old\.status = 'PENDING' and new\.status = 'ACTIVE' and new\.selfie_required/);
  assert.doesNotMatch(sql, /delete from storage\.objects/i);
  const cron = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(cron.crons, [{ path: "/api/cleanup-selfies", schedule: "0 18 * * *" }]);
  console.log("Private WebP selfie upload, approval guard, short signed URLs, seven-day visibility, and file-first cleanup checks passed.");
} finally {
  globalThis.fetch = originalFetch;
  keys.forEach((key, index) => { if (originalEnv[index] === undefined) delete process.env[key]; else process.env[key] = originalEnv[index]; });
}
