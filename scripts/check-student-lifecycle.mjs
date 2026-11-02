import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { enrollmentYears, isStudentAccessExpired, studentAccessExpiresAt } from "../js/account-lifecycle.js";

const cutoff = Date.parse("2027-06-30T17:00:00Z");
assert.deepEqual(enrollmentYears(new Date("2026-11-02T00:00:00Z")), [2024, 2025, 2026]);
assert.deepEqual(enrollmentYears(new Date("2026-12-31T17:00:00Z")), [2024, 2025, 2026, 2027]);
assert.equal(studentAccessExpiresAt({ enrollment_year: 2024 }), cutoff);
assert.equal(isStudentAccessExpired({ enrollment_year: 2024 }, cutoff - 1), false);
assert.equal(isStudentAccessExpired({ enrollment_year: 2024 }, cutoff), true);
assert.equal(isStudentAccessExpired({ enrollment_year: 2025 }, cutoff), false);
assert.equal(studentAccessExpiresAt({ enrollment_year: 2020 }), null, "Do not infer a legacy student's graduation date");
assert.equal(isStudentAccessExpired({ status: "EXPIRED" }), true);

const authSource = (await readFile(new URL("../js/services/auth-service.js", import.meta.url), "utf8"))
  .replace('import { getSupabase } from "./supabase.js";', 'const getSupabase = async () => globalThis.lifecycleClient;')
  .replace('"../account-lifecycle.js"', JSON.stringify(new URL("../js/account-lifecycle.js", import.meta.url).href));
const { signIn, requireRole, watchStudentAccess } = await import(`data:text/javascript;base64,${Buffer.from(authSource).toString("base64")}`);
const originalNow = Date.now, originalSetTimeout = globalThis.setTimeout, originalClearTimeout = globalThis.clearTimeout;
let now = cutoff - 1000, timer, timerDelay, signedOut = 0, blanked = 0;
let profile = { status: "ACTIVE", enrollment_year: 2024 };
const redirects = [];
const listeners = new Map();
globalThis.window = { location: { replace: path => redirects.push(path) }, addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) };
globalThis.document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
globalThis.lifecycleClient = {
  auth: {
    getSession: async () => ({ data: { session: { user: { id: "student" } } }, error: null }),
    signInWithPassword: async () => ({ data: { user: { id: "student" } }, error: null }),
    signOut: async () => { signedOut++; return { error: null }; }
  },
  from: table => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === "student_profiles" ? profile : null, error: null }) }) }) }),
  channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: async () => {}
};
try {
  Date.now = () => now;
  globalThis.setTimeout = (callback, delay) => { timer = callback; timerDelay = delay; return 1; };
  globalThis.clearTimeout = () => {};
  const stop = await watchStudentAccess({ user: { id: "student" }, profile }, () => blanked++);
  assert.equal(timerDelay, 1000, "Open student pages must expire at the boundary without polling");
  now = cutoff;
  timer();
  await new Promise(resolve => originalSetTimeout(resolve, 0));
  assert.equal(blanked, 1); assert.equal(signedOut, 1);
  assert.ok(redirects.at(-1).includes("account=expired"));
  stop();
  await assert.rejects(signIn("student@example.test", "test", "STUDENT"), error => error.code === "EXPIRED");
  assert.equal(await requireRole("STUDENT"), null);
  profile = { status: "ACTIVE", enrollment_year: 2025 };
  assert.equal((await signIn("student@example.test", "test", "STUDENT")).role, "STUDENT");
} finally {
  Date.now = originalNow; globalThis.setTimeout = originalSetTimeout; globalThis.clearTimeout = originalClearTimeout;
  delete globalThis.window; delete globalThis.document; delete globalThis.lifecycleClient;
}

const sql = await readFile(new URL("../supabase/student-lifecycle.sql", import.meta.url), "utf8");
const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const body = sql.slice(sql.indexOf("alter table public.student_profiles"), sql.indexOf("\ncommit;")).trim();
assert.ok(schema.includes(body), "Fresh schema and incremental lifecycle migration must match");
assert.match(sql, /access_expires_at > now\(\)/, "RLS must reject old access tokens after graduation");
assert.match(sql, /entry_year::integer < 2024/);
assert.match(sql, /'PENDING', 'APPROVED', 'BORROWED', 'RETURN_REQUESTED'/, "Do not delete uncompleted loans");
assert.match(sql, /update public\.loans set status = 'RETURN_REQUESTED'/, "Librarians must be able to receive physical books from expired accounts");
assert.match(sql, /not exists \(select 1 from public\.librarian_profiles where id = students\.id\)/);
assert.ok(sql.indexOf("delete from public.reading_history") < sql.indexOf("delete from public.loans"));
assert.ok(sql.indexOf("delete from public.loans") < sql.indexOf("delete from auth.users"));
assert.match(sql, /exception when foreign_key_violation/);
assert.match(sql, /revoke all on function private\.cleanup_expired_students\(\) from public, anon, authenticated, service_role/);
assert.match(sql, /cron\.schedule\('litera-cleanup-alumni', '15 17 \* \* \*'/);
assert.doesNotMatch(sql, /update public\.books|delete from public\.books/);
assert.doesNotMatch(sql, /^select private\.cleanup_expired_students\(\)/m, "Migration must not immediately invoke destructive cleanup");
console.log("Enrollment dropdown, Jakarta expiry boundary, automatic logout, and alumni cleanup safety checks passed.");
