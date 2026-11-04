import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import handler from "../api/student-delete.js";

const studentId = "11111111-1111-4111-8111-111111111111", adminId = "22222222-2222-4222-8222-222222222222", photoId = "33333333-3333-4333-8333-333333333333";
const originalFetch = globalThis.fetch;
const keys = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const originalEnv = keys.map(key => process.env[key]);
Object.assign(process.env, { SUPABASE_URL: "https://delete.example.test", SUPABASE_PUBLISHABLE_KEY: "public-test", SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test" });
let role, rpcError, photos, storageStatus, metadataStatus, requests;
function reset() { role = true; rpcError = null; photos = []; storageStatus = 200; metadataStatus = 204; requests = []; }
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
globalThis.fetch = async (url, options) => {
  requests.push({ url, ...options });
  if (url.endsWith("/auth/v1/user")) return json({ id: adminId });
  if (url.includes("/librarian_profiles?")) return json(role ? [{ id: adminId }] : []);
  assert.equal(options.headers.apikey, "sb_secret_test");
  assert.equal(options.headers.Authorization, undefined);
  if (url.endsWith("/rpc/delete_rejected_student_account")) {
    assert.deepEqual(JSON.parse(options.body), { p_student_id: studentId });
    return rpcError ? json(rpcError, 400) : json({ photos });
  }
  if (url.includes("/storage/v1/object/")) return json({}, storageStatus);
  if (url.includes("/rest/v1/registration_selfies?")) return new Response(null, { status: metadataStatus });
  throw Error("Unexpected delete request");
};
async function call(overrides = {}) {
  const response = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(body) { this.body = JSON.parse(body); } };
  await handler({ method: "DELETE", headers: { "content-type": "application/json", authorization: "Bearer caller-token" }, body: { studentId }, ...overrides }, response);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.doesNotMatch(JSON.stringify(response.body), /sb_secret_test|caller-token/);
  return response;
}
try {
  reset(); assert.equal((await call({ method: "POST" })).statusCode, 405); assert.equal(requests.length, 0);
  reset(); assert.equal((await call({ headers: { "content-type": "text/plain" } })).statusCode, 415);
  reset(); assert.equal((await call({ body: "{" })).statusCode, 400);
  reset(); assert.equal((await call({ body: " ".repeat(4097) })).statusCode, 413);
  reset(); assert.equal((await call({ body: { studentId: "bad/id" } })).statusCode, 400); assert.equal(requests.length, 0);
  reset(); assert.equal((await call({ headers: { "content-type": "application/json" } })).statusCode, 401); assert.equal(requests.length, 0);
  reset(); role = false; assert.equal((await call()).statusCode, 403); assert.ok(requests.every(request => !request.url.includes("/rpc/")));
  for (const message of ["student is not rejected", "cannot delete librarian", "student has active loans"]) {
    reset(); rpcError = { message }; assert.equal((await call()).statusCode, 409);
    assert.ok(requests.every(request => request.method !== "DELETE"), "Failed database guards must not delete a photo");
  }
  reset(); rpcError = { code: "PGRST202" }; assert.equal((await call()).statusCode, 503);
  reset(); assert.deepEqual((await call()).body, { success: true, photoCleanupPending: false });
  reset(); photos = [{ id: photoId, object_path: `${studentId}/${photoId}.webp` }];
  assert.equal((await call()).body.photoCleanupPending, false);
  const storage = requests.findIndex(request => request.url.includes("/storage/"));
  const metadata = requests.findIndex(request => request.url.includes("/registration_selfies?"));
  assert.ok(metadata > storage && storage > requests.findIndex(request => request.url.includes("/rpc/")));
  assert.deepEqual(JSON.parse(requests[storage].body), { prefixes: [`${studentId}/${photoId}.webp`] });
  reset(); photos = [{ id: photoId, object_path: `${studentId}/${photoId}.webp` }]; storageStatus = 500;
  assert.equal((await call()).body.photoCleanupPending, true);
  assert.ok(requests.every(request => !request.url.includes("/registration_selfies?")), "Failed binary removal must retain the cleanup queue");
  reset(); photos = [{ id: photoId, object_path: `${adminId}/${photoId}.webp` }];
  assert.equal((await call()).body.photoCleanupPending, true);
  assert.ok(requests.every(request => request.method !== "DELETE"), "Never delete files owned by another account");
  reset(); photos = [{ id: photoId, object_path: `${studentId}/${photoId}.webp` }]; metadataStatus = 500;
  assert.equal((await call()).body.photoCleanupPending, true);

  const sql = await readFile(new URL("../supabase/delete-rejected-students.sql", import.meta.url), "utf8");
  const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  const definition = sql.slice(sql.indexOf("create or replace function"), sql.indexOf("\ncommit;")).trim();
  assert.ok(schema.includes(definition), "Fresh schema and migration must agree");
  assert.match(sql, /for update/);
  assert.match(sql, /target.status <> 'REJECTED'/);
  assert.match(sql, /'PENDING', 'APPROVED', 'BORROWED', 'RETURN_REQUESTED'/);
  assert.ok(sql.indexOf("delete from public.reading_history") < sql.indexOf("delete from public.loans"));
  assert.ok(sql.indexOf("delete from public.loans") < sql.indexOf("delete from auth.users"));
  assert.match(sql, /set expires_at = least\(expires_at, now\(\)\)/);
  assert.match(sql, /revoke all .* from public, anon, authenticated/);
  assert.match(sql, /grant execute .* to service_role/);
  assert.doesNotMatch(sql, /update public.books|delete from public.books|delete from storage\./);
  console.log("Rejected-account deletion authorization, atomic guards, photo cleanup retry, and schema compatibility checks passed.");
} finally {
  globalThis.fetch = originalFetch;
  keys.forEach((key, index) => { if (originalEnv[index] === undefined) delete process.env[key]; else process.env[key] = originalEnv[index]; });
}
