import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createBooksCsv, createBooksXlsx } from "../js/book-export.js";

const books = [{
  id: "book-1",
  title: "A, B & C",
  authors: "Penulis \"Satu\"",
  isbn: "9780000000001",
  publisher: "Penerbit",
  publish_year: 2026,
  category: { name: "Fiksi" },
  synopsis: "Baris satu\nBaris dua",
  total_stock: 3,
  available_stock: 2,
  shelf_location: "A1",
  inventory_number: "INV-1",
  classification: "899",
  acquisition_source: "Pembelian",
  source_note: "Lengkap",
  created_at: "2026-10-29T00:00:00.000Z"
}];

const csv = createBooksCsv(books);
assert.ok(csv.startsWith("\uFEFF"));
assert.match(csv, /^\uFEFFsep=;/);
assert.match(csv, /"A, B & C"/);
assert.match(csv, /"Penulis ""Satu"""/);
assert.match(csv, /"Baris satu\nBaris dua"/);
assert.match(csv, /"Judul";"Penulis";"ISBN"/);

const spreadsheet = createBooksXlsx(books);
assert.equal(spreadsheet[0], 0x50);
assert.equal(spreadsheet[1], 0x4B);
const entries = new Map();
const view = new DataView(spreadsheet.buffer, spreadsheet.byteOffset, spreadsheet.byteLength);
for (let offset = 0; offset + 30 <= spreadsheet.length && view.getUint32(offset, true) === 0x04034B50;) {
  const size = view.getUint32(offset + 18, true);
  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const nameStart = offset + 30;
  const dataStart = nameStart + nameLength + extraLength;
  const name = new TextDecoder().decode(spreadsheet.slice(nameStart, nameStart + nameLength));
  entries.set(name, spreadsheet.slice(dataStart, dataStart + size));
  offset = dataStart + size;
}
assert.ok(entries.has("[Content_Types].xml"));
assert.ok(entries.has("xl/workbook.xml"));
assert.ok(entries.has("xl/worksheets/sheet1.xml"));
assert.ok(entries.has("xl/tables/table1.xml"));
const sheetXml = new TextDecoder().decode(entries.get("xl/worksheets/sheet1.xml"));
const tableXml = new TextDecoder().decode(entries.get("xl/tables/table1.xml"));
assert.match(sheetXml, /A, B &amp; C/);
assert.match(sheetXml, /state="frozen"/);
assert.match(tableXml, /DataBukuTable/);
assert.match(tableXml, /TableStyleMedium2/);

const page = await readFile(new URL("../js/pages/librarian-pages.js", import.meta.url), "utf8");
assert.match(page, /data-book-export="csv"/);
assert.match(page, /data-book-export="spreadsheet"/);
assert.match(page, /listBooksForExport/);
assert.match(page, /data-buku-\$\{date\}\.xlsx/);
assert.match(page, /const exportBooks = \(await listBooksForExport\(\)\)\.filter/);
assert.match(page, /button\.innerHTML = originalMarkup/);

console.log("Book export checks passed.");
