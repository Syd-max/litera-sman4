import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dashboardWindowStart } from "../js/services/student-service.js";

assert.equal(dashboardWindowStart(new Date("2026-10-29T12:00:00.000Z")), "2026-10-22T12:00:00.000Z");

const serviceSource = (await readFile(new URL("../js/services/student-service.js", import.meta.url), "utf8"))
  .replace('import { getSupabase } from "./supabase.js";', 'const getSupabase = async () => globalThis.dashboardClient;')
  .replace('"../account-lifecycle.js"', JSON.stringify(new URL("../js/account-lifecycle.js", import.meta.url).href));
const rows = {
  student_profiles: [
    { id: "a", enrollment_year: 2026 },
    { id: "b", enrollment_year: 2024 },
    { id: "c", enrollment_year: 2026 },
    { id: "d", enrollment_year: 2025 }
  ],
  loans: [
    ...Array.from({ length: 1001 }, (_, index) => ({ id: String(index), student_id: "a", status: "RETURNED", requested_at: "2026-10-15T00:00:00Z" })),
    { student_id: "b", status: "BORROWED", requested_at: "2026-10-31T17:00:00Z" },
    { student_id: "b", status: "RETURN_REQUESTED", requested_at: "2026-11-05T00:00:00Z" },
    { student_id: "c", status: "PENDING", requested_at: "2026-11-06T00:00:00Z" },
    { student_id: "c", status: "APPROVED", requested_at: "2026-11-07T00:00:00Z" },
    { student_id: "c", status: "REJECTED", requested_at: "2026-11-08T00:00:00Z" }
  ]
};
globalThis.dashboardClient = {
  from: table => ({ select: () => ({ order: () => ({ range: async (start, end) => ({ data: rows[table].slice(start, end + 1), error: null }) }) }) })
};
try {
  const { dashboardActivity } = await import(`data:text/javascript;base64,${Buffer.from(serviceSource).toString("base64")}`);
  assert.deepEqual(await dashboardActivity(new Date("2026-11-10T00:00:00+07:00")), {
    cohorts: [
      { year: 2024, registrations: 1, loans: 2 },
      { year: 2025, registrations: 1, loans: 0 },
      { year: 2026, registrations: 2, loans: 1001 }
    ],
    pendingReturns: 1,
    monthlyTransactions: 5
  });
} finally {
  delete globalThis.dashboardClient;
}

const librarianPage = await readFile(new URL("../js/pages/librarian-pages.js", import.meta.url), "utf8");
assert.match(librarianPage, /student-management-sticky/);
assert.match(librarianPage, /student-stat-pending/);
assert.match(librarianPage, /student-stat-active/);
assert.match(librarianPage, /student-stat-rejected/);
assert.match(librarianPage, /students = await listStudents\(\); drawOverview\(\); draw\(\)/);

console.log("Dashboard metric checks passed.");
