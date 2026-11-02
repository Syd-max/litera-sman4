import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import handler from "../api/student-password.js";
import { statusLabel, statusBadgeClass } from "../js/utils.js";

const studentId = "11111111-1111-4111-8111-111111111111";
const librarianId = "22222222-2222-4222-8222-222222222222";
const originalFetch = globalThis.fetch;
const envNames = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const originalEnv = envNames.map(name => process.env[name]);
Object.assign(process.env, { SUPABASE_URL: "https://accounts.example.test", SUPABASE_PUBLISHABLE_KEY: "public-test", SUPABASE_SERVICE_ROLE_KEY: "secret-test" });
let isLibrarian, hasStudent, targetLibrarian, invalidToken, updateStatus, requests;
function reset() { isLibrarian = true; hasStudent = true; targetLibrarian = false; invalidToken = false; updateStatus = 200; requests = []; }
const result = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
globalThis.fetch = async (url, options) => {
  requests.push({ url, ...options });
  if (url.endsWith("/auth/v1/user")) return result(invalidToken ? {} : { id: librarianId }, invalidToken ? 401 : 200);
  if (url.includes("/librarian_profiles") && options.headers.apikey === "public-test") return result(isLibrarian ? [{ id: librarianId }] : []);
  if (url.includes("/student_profiles")) return result(hasStudent ? [{ id: studentId }] : []);
  if (url.includes("/librarian_profiles")) return result(targetLibrarian ? [{ id: studentId }] : []);
  if (url.endsWith(`/auth/v1/admin/users/${studentId}`)) return result({ id: studentId }, updateStatus);
  throw new Error("Unexpected endpoint in password reset");
};
async function request(overrides = {}) {
  const response = { headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = JSON.parse(body); } };
  await handler({ method: "POST", headers: { "content-type": "application/json", authorization: "Bearer caller-test-token" }, body: { studentId, password: "NewStudent123" }, ...overrides }, response);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.doesNotMatch(JSON.stringify(response), /secret-test|caller-test-token|NewStudent123/);
  return response;
}
try {
  reset(); assert.equal((await request({ method: "GET" })).statusCode, 405); assert.equal(requests.length, 0);
  reset(); assert.equal((await request({ headers: { "content-type": "application/json" } })).statusCode, 401); assert.equal(requests.length, 0);
  reset(); invalidToken = true; assert.equal((await request()).statusCode, 401); assert.equal(requests.length, 1);
  reset(); isLibrarian = false; assert.equal((await request()).statusCode, 403); assert.equal(requests.length, 2);
  reset(); hasStudent = false; assert.equal((await request()).statusCode, 404); assert.ok(requests.every(r => r.method !== "PUT"));
  reset(); targetLibrarian = true; assert.equal((await request()).statusCode, 403); assert.ok(requests.every(r => r.method !== "PUT"));
  reset(); assert.equal((await request({ body: { studentId, password: "weak" } })).statusCode, 400); assert.equal(requests.length, 0);
  reset(); assert.equal((await request({ body: { studentId, password: "Aa1" + "x".repeat(70) } })).statusCode, 400); assert.equal(requests.length, 0);
  reset(); assert.equal((await request({ body: { studentId, password: "Aa1" + "é".repeat(35) } })).statusCode, 400); assert.equal(requests.length, 0);
  reset(); assert.equal((await request({ body: "{" })).statusCode, 400); assert.equal(requests.length, 0);
  reset(); assert.equal((await request({ body: { studentId: "bad/id", password: "NewStudent123" } })).statusCode, 400);
  reset(); assert.equal((await request()).statusCode, 200);
  const update = requests.find(r => r.method === "PUT");
  assert.deepEqual(JSON.parse(update.body), { password: "NewStudent123" });
  assert.equal(update.headers.apikey, "secret-test");
  assert.equal(requests[0].headers.Authorization, "Bearer caller-test-token");
  assert.ok(requests.every(r => !/recover|invite|signup|otp/.test(r.url)), "Reset must not send emails or create users");
  reset(); updateStatus = 429; assert.equal((await request()).statusCode, 429);
  reset(); globalThis.fetch = async () => { throw new Error("secret-test upstream detail"); }; assert.equal((await request()).statusCode, 502);
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.equal((await request()).statusCode, 503);

  const service = await readFile(new URL("../js/services/auth-service.js", import.meta.url), "utf8");
  const source = service.replace('import { getSupabase } from "./supabase.js";', 'const getSupabase = async () => globalThis.accountTestClient;');
  const { signIn, requireRole, watchStudentAccess } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  let status = "ACTIVE", networkError = false, signouts = 0, blocked = 0, realtime;
  const redirects = [], listeners = new Map();
  globalThis.window = {
    location: { replace: target => redirects.push(target) },
    addEventListener: (event, callback) => listeners.set(event, callback), removeEventListener: event => listeners.delete(event)
  };
  globalThis.document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
  globalThis.accountTestClient = {
    auth: {
      signInWithPassword: async () => ({ data: { user: { id: studentId } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: studentId } } }, error: null }),
      signOut: async () => { signouts++; return { error: null }; }
    },
    from: table => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === "student_profiles" ? { status } : null, error: networkError ? new Error("network") : null }) }) }) }),
    channel: () => ({ on(_, filter, callback) { assert.equal(filter.filter, `id=eq.${studentId}`); realtime = callback; return this; }, subscribe() { return this; } }),
    removeChannel: async () => {}
  };
  status = "SUSPENDED";
  await assert.rejects(signIn("student@example.test", "test", "STUDENT"), error => error.code === "SUSPENDED" && /ditangguhkan/.test(error.message));
  assert.equal(await requireRole("STUDENT"), null);
  assert.ok(redirects.at(-1).includes("account=suspended"));
  status = "ACTIVE";
  assert.equal((await signIn("student@example.test", "test", "STUDENT")).role, "STUDENT");
  let stop = await watchStudentAccess({ user: { id: studentId } }, () => blocked++);
  const before = signouts;
  networkError = true;
  await listeners.get("focus")();
  assert.equal(signouts, before, "Temporary connection failure must not sign out active students");
  networkError = false;
  realtime({ new: { status: "SUSPENDED" } });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(blocked, 1); assert.equal(signouts, before + 1);
  realtime({ new: { status: "SUSPENDED" } });
  assert.equal(blocked, 1);
  stop(); assert.equal(listeners.size, 0);
  status = "SUSPENDED";
  stop = await watchStudentAccess({ user: { id: studentId } }, () => blocked++);
  assert.equal(blocked, 2, "Suspension must also be detected when the realtime event was missed"); stop();

  const sql = await readFile(new URL("../supabase/student-account-management.sql", import.meta.url), "utf8");
  const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  assert.ok(schema.includes(sql.slice(sql.indexOf("create or replace function"), sql.indexOf("-- Existing RLS" )).trim()), "Fresh schema and incremental migration must agree");
  assert.match(sql, /if not private\.is_librarian\(\) then raise exception/);
  assert.match(sql, /and status = case when p_suspend then 'ACTIVE' else 'SUSPENDED' end/);
  assert.match(sql, /revoke all .* from public, anon/);
  assert.doesNotMatch(sql, /delete from|update auth\.users|encrypted_password/i);
  assert.equal(statusLabel("SUSPENDED"), "Ditangguhkan"); assert.equal(statusBadgeClass("SUSPENDED"), "badge--danger");
  console.log("Student suspension, restoration gates, session guard, and server password-reset authorization checks passed.");
} finally {
  globalThis.fetch = originalFetch;
  envNames.forEach((name, index) => { if (originalEnv[index] === undefined) delete process.env[name]; else process.env[name] = originalEnv[index]; });
  delete globalThis.window; delete globalThis.document; delete globalThis.accountTestClient;
}
