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
let isLibrarian, hasStudent, targetLibrarian, invalidToken, updateStatus, adminReadStatus, adminReadCode, broadcastFails, requests;
function reset() { isLibrarian = true; hasStudent = true; targetLibrarian = false; invalidToken = false; updateStatus = 200; adminReadStatus = 200; adminReadCode = ""; broadcastFails = false; requests = []; process.env.SUPABASE_SERVICE_ROLE_KEY = "secret-test"; }
const result = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
globalThis.fetch = async (url, options) => {
  requests.push({ url, ...options });
  if (url.endsWith("/auth/v1/user")) return result(invalidToken ? {} : { id: librarianId }, invalidToken ? 401 : 200);
  if (url.includes("/librarian_profiles") && options.headers.apikey === "public-test") return result(isLibrarian ? [{ id: librarianId }] : []);
  if (options.headers.apikey?.startsWith("sb_secret_")) assert.equal(options.headers.Authorization, undefined, "Secret keys must not be passed as a JWT");
  else assert.equal(options.headers.Authorization, "Bearer secret-test");
  if (url.includes("/rest/v1/") && adminReadStatus !== 200) return result({ code: adminReadCode }, adminReadStatus);
  if (url.includes("/student_profiles")) return result(hasStudent ? [{ id: studentId }] : []);
  if (url.includes("/librarian_profiles")) return result(targetLibrarian ? [{ id: studentId }] : []);
  if (url.endsWith(`/auth/v1/admin/users/${studentId}`)) return result({ id: studentId }, updateStatus);
  if (url.endsWith("/realtime/v1/api/broadcast")) {
    if (broadcastFails) throw new Error("Realtime unavailable");
    return result({ success: true });
  }
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
  reset(); adminReadStatus = 403; adminReadCode = "42501";
  let denied = await request(); assert.equal(denied.statusCode, 503); assert.match(denied.body.error, /student-password-permissions\.sql/); assert.ok(requests.every(r => r.method !== "PUT"));
  reset(); adminReadStatus = 401;
  denied = await request(); assert.equal(denied.statusCode, 503); assert.match(denied.body.error, /SUPABASE_SERVICE_ROLE_KEY/); assert.ok(requests.every(r => r.method !== "PUT"));
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
  const broadcast = requests.find(r => r.url.endsWith("/realtime/v1/api/broadcast"));
  assert.deepEqual(JSON.parse(broadcast.body), { messages: [{ topic: `student-access-${studentId}`, event: "session-reset", payload: {}, private: false }] });
  assert.ok(requests.indexOf(broadcast) > requests.indexOf(update), "Notify devices only after password update succeeds");
  assert.ok(requests.every(r => !/recover|invite|signup|otp/.test(r.url)), "Reset must not send emails or create users");
  reset(); process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test_only";
  assert.equal((await request()).statusCode, 200);
  const secretUpdate = requests.find(r => r.method === "PUT");
  assert.equal(secretUpdate.headers.apikey, "sb_secret_test_only"); assert.equal(secretUpdate.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(secretUpdate.body), { password: "NewStudent123" });
  reset(); broadcastFails = true; assert.equal((await request()).statusCode, 200, "Realtime outage must not report a successful password change as failed");
  reset(); updateStatus = 429; assert.equal((await request()).statusCode, 429);
  assert.ok(requests.every(r => !r.url.includes("/realtime/")), "Failed password reset must not notify devices");
  reset(); globalThis.fetch = async () => { throw new Error("secret-test upstream detail"); }; assert.equal((await request()).statusCode, 502);
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.equal((await request()).statusCode, 503);

  const service = await readFile(new URL("../js/services/auth-service.js", import.meta.url), "utf8");
  const source = service.replace('import { getSupabase } from "./supabase.js";', 'const getSupabase = async () => globalThis.accountTestClient;')
    .replace('"../account-lifecycle.js"', JSON.stringify(new URL('../js/account-lifecycle.js', import.meta.url).href))
    .replace('"./selfie-service.js"', JSON.stringify(new URL('../js/services/selfie-service.js', import.meta.url).href));
  const { signIn, requireRole, watchStudentAccess, getCurrentIdentity } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  let status = "ACTIVE", networkError = false, sessionError = null, signouts = 0, blocked = 0, realtime, broadcastHandler, authHandler;
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
      getUser: async () => ({ data: { user: sessionError ? null : { id: studentId } }, error: sessionError }),
      onAuthStateChange: callback => { authHandler = callback; return { data: { subscription: { unsubscribe() { authHandler = null; } } } }; },
      signOut: async () => { signouts++; return { error: null }; }
    },
    from: table => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === "student_profiles" ? { status } : null, error: networkError ? new Error("network") : null }) }) }) }),
    channel: () => ({ on(type, filter, callback) { if (type === "broadcast") broadcastHandler = callback; else { assert.equal(filter.filter, `id=eq.${studentId}`); realtime = callback; } return this; }, subscribe() { return this; } }),
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

  status = "ACTIVE";
  sessionError = { status: 503 };
  const beforeSessionCheck = signouts;
  await assert.rejects(getCurrentIdentity());
  assert.equal(signouts, beforeSessionCheck, "Auth outages must preserve the stored session");
  sessionError = { status: 401 };
  assert.equal(await getCurrentIdentity(), null, "A stored user must not bypass server session verification");
  assert.equal(signouts, beforeSessionCheck + 1);
  sessionError = null;
  assert.equal((await getCurrentIdentity()).user.id, studentId, "New login remains valid after reset");

  const baseClient = globalThis.accountTestClient;
  const devices = [];
  for (let index = 0; index < 2; index++) {
    const device = { signouts: 0, blocked: 0 };
    globalThis.accountTestClient = {
      ...baseClient,
      auth: {
        ...baseClient.auth,
        signOut: async () => { device.signouts++; return { error: null }; },
        onAuthStateChange: callback => { device.authEvent = callback; return { data: { subscription: { unsubscribe() { device.unsubscribed = true; } } } }; }
      },
      channel: () => ({ on(type, _, callback) { if (type === "broadcast") device.broadcast = callback; return this; }, subscribe() { return this; } })
    };
    device.stop = await watchStudentAccess({ user: { id: studentId } }, () => device.blocked++);
    devices.push(device);
  }
  devices[0].broadcast();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(devices[0].signouts, 0, "An untrusted broadcast must never log out a valid session");
  sessionError = { status: 401, code: "session_not_found" };
  await listeners.get("focus")();
  devices[0].authEvent("SIGNED_OUT");
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(devices.every(device => device.blocked === 1 && device.signouts === 1), "Every device clears its revoked session and redirects, including missed broadcast fallback");
  devices.forEach(device => device.stop());
  assert.ok(devices.every(device => device.unsubscribed), "Leaving the page removes Auth listeners");
  globalThis.accountTestClient = baseClient;

  sessionError = null;
  stop = await watchStudentAccess({ user: { id: studentId } }, () => blocked++);
  sessionError = { status: 401 };
  const beforeBroadcast = signouts;
  broadcastHandler();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(signouts, beforeBroadcast + 1, "Reset broadcast promptly checks and clears revoked sessions");
  stop(); sessionError = null;

  const sql = await readFile(new URL("../supabase/student-account-management.sql", import.meta.url), "utf8");
  const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  assert.ok(schema.includes(sql.slice(sql.indexOf("create or replace function"), sql.indexOf("-- Existing RLS" )).trim()), "Fresh schema and incremental migration must agree");
  assert.match(sql, /if not private\.is_librarian\(\) then raise exception/);
  assert.match(sql, /and status = case when p_suspend then 'ACTIVE' else 'SUSPENDED' end/);
  assert.match(sql, /revoke all .* from public, anon/);
  assert.doesNotMatch(sql, /delete from|update auth\.users|encrypted_password/i);
  const permissions = await readFile(new URL("../supabase/student-password-permissions.sql", import.meta.url), "utf8");
  assert.match(permissions, /grant select \(id\) on public\.student_profiles, public\.librarian_profiles to service_role/);
  assert.doesNotMatch(permissions, /to anon|to authenticated|disable row level security|update |delete from/i);
  assert.equal(statusLabel("SUSPENDED"), "Ditangguhkan"); assert.equal(statusBadgeClass("SUSPENDED"), "badge--danger");
  console.log("Student suspension, restoration gates, session guard, and server password-reset authorization checks passed.");
} finally {
  globalThis.fetch = originalFetch;
  envNames.forEach((name, index) => { if (originalEnv[index] === undefined) delete process.env[name]; else process.env[name] = originalEnv[index]; });
  delete globalThis.window; delete globalThis.document; delete globalThis.accountTestClient;
}
