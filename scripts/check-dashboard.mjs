import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dashboardWindowStart } from "../js/services/student-service.js";

assert.equal(dashboardWindowStart(new Date("2026-10-29T12:00:00.000Z")), "2026-10-22T12:00:00.000Z");

const librarianPage = await readFile(new URL("../js/pages/librarian-pages.js", import.meta.url), "utf8");
assert.match(librarianPage, /student-management-sticky/);
assert.match(librarianPage, /student-stat-pending/);
assert.match(librarianPage, /student-stat-active/);
assert.match(librarianPage, /student-stat-rejected/);
assert.match(librarianPage, /students = await listStudents\(\); drawOverview\(\); draw\(\)/);

console.log("Dashboard metric checks passed.");
