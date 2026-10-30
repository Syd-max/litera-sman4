import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { isActiveLoanStatus, isBeforeDue, isCurrentReading, isDueSoon } from "../js/utils.js";

const root = process.cwd();
const ignored = new Set(["node_modules", ".git", "tmp", "graphify-out"]);
const files = [];

const now = Date.parse("2026-10-23T00:00:00Z");
assert.equal(isDueSoon("2026-10-24T00:00:00Z", now), true);
assert.equal(isDueSoon("2026-10-26T00:00:00Z", now), false);
assert.equal(isDueSoon("2026-10-22T00:00:00Z", now), false);
assert.equal(isBeforeDue("2026-10-24T09:00:00Z", "2026-10-25T09:00:00Z"), true);
assert.equal(isBeforeDue("2026-10-25T09:00:00Z", "2026-10-25T09:00:00Z"), false);
assert.equal(isBeforeDue(null, "2026-10-25T09:00:00Z"), false);
assert.equal(isCurrentReading("BORROWED"), true);
assert.equal(isCurrentReading("RETURN_REQUESTED"), true);
assert.equal(isCurrentReading("RETURNED"), false);
assert.equal(isActiveLoanStatus("PENDING"), true);
assert.equal(isActiveLoanStatus("APPROVED"), true);
assert.equal(isActiveLoanStatus("BORROWED"), true);
assert.equal(isActiveLoanStatus("RETURN_REQUESTED"), true);
assert.equal(isActiveLoanStatus("RETURNED"), false);
assert.equal(isActiveLoanStatus("REJECTED"), false);

async function walk(directory) {
  for (const entry of await readdir(directory)) {
    if (ignored.has(entry)) continue;
    const absolute = path.join(directory, entry);
    const info = await stat(absolute);
    if (info.isDirectory()) await walk(absolute);
    else files.push(absolute);
  }
}

await walk(root);

const librarianPages = await readFile(path.join(root, "js/pages/librarian-pages.js"), "utf8");
assert.match(librarianPages, /class="book-overview"/);
assert.match(librarianPages, /class="book-management-sticky"/);
assert.match(librarianPages, /id="book-category"/);
assert.match(librarianPages, /listBooks\(\{ limit: 5000 \}\)/);
assert.match(librarianPages, /loading="lazy" decoding="async"/);
assert.match(librarianPages, /await getBook\(edit\.dataset\.editBook\)/);

const htmlFiles = files.filter((file) => file.endsWith(".html"));
const missing = [];
const references = /(?:src|href)=["']([^"'#?]+)["']/g;

for (const htmlFile of htmlFiles) {
  const html = await readFile(htmlFile, "utf8");
  for (const match of html.matchAll(references)) {
    const reference = match[1];
    if (/^(?:https?:|mailto:|tel:)/.test(reference)) continue;
    const target = path.resolve(path.dirname(htmlFile), reference);
    try {
      await stat(target);
    } catch {
      missing.push(`${path.relative(root, htmlFile)} -> ${reference}`);
    }
  }
}

if (missing.length) {
  console.error("Missing local references:\n" + missing.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Checked ${htmlFiles.length} HTML files: all local src/href paths resolve.`);
}

