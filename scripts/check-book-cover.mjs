import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bookCoverStoragePath, collapseCatalogDuplicates, isBookOutOfStock, MAX_BOOK_COVER_BYTES, MAX_BOOK_COVER_DIMENSION, MAX_COMPRESSED_BOOK_COVER_BYTES, sanitizeAuthors, sortBooksByCompleteness, sortCatalogBooks, validateBookCover } from "../js/services/book-service.js";
import { friendlyError } from "../js/utils.js";

const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const page = await readFile(new URL("../js/pages/librarian-pages.js", import.meta.url), "utf8");

assert.doesNotThrow(() => validateBookCover({ size: MAX_BOOK_COVER_BYTES, type: "image/jpeg" }));
assert.throws(() => validateBookCover({ size: MAX_BOOK_COVER_BYTES + 1, type: "image/png" }), (error) => error.code === "COVER_TOO_LARGE");
assert.throws(() => validateBookCover({ size: 100, type: "image/svg+xml" }), (error) => error.code === "COVER_TYPE");
assert.equal(MAX_BOOK_COVER_DIMENSION, 1200);
assert.equal(MAX_COMPRESSED_BOOK_COVER_BYTES, 600 * 1024);
assert.equal(bookCoverStoragePath("https://project.supabase.co/storage/v1/object/public/book-covers/folder/a.webp"), "folder/a.webp");
assert.equal(bookCoverStoragePath("https://covers.openlibrary.org/b/id/1-M.jpg"), "");
assert.match(schema, /'book-covers'.*true, 2097152, array\['image\/webp'\]/s);
assert.match(schema, /book_covers_insert_librarian/);
assert.match(page, /manualUpload: true/);
assert.match(page, /bookFormMarkup\(book \|\| \{\}, categories, manualUpload\)/);
assert.match(page, /id="book-form" class="book-form" autocomplete="off"/);
assert.match(page, /id="book-isbn"[^>]*autocomplete="off"/);
assert.match(page, /id="book-create-toggle"/);
assert.match(page, /data-book-create="manual"/);
assert.match(page, /data-book-create="library"/);
assert.doesNotMatch(page, /data-book-create="import"/);
assert.doesNotMatch(page, /openBookImportModal|Impor CSV/);
assert.match(page, /name="coverUrl"/);
assert.match(page, /name="coverFile"/);
assert.match(page, /manualUpload && !data\.coverUrl\?\.trim\(\) && !data\.coverFile\?\.size/);
assert.match(page, /uploadBookCover\(data\.coverFile\)/);
assert.match(page, /atau unggah dari perangkat/);
assert.match(page, /await saveBook\(data\)[\s\S]*removeBookCover\(oldCoverPath\)/);
assert.match(friendlyError({ code: "COVER_TOO_LARGE" }), /2 MB/);

const collapsed = collapseCatalogDuplicates([
  { id: "empty", title: "Annyeong Korea", authors: "<Fidelia, Elvira>", total_stock: 1, available_stock: 0, cover_url: null },
  { id: "ready", title: "Annyeong Korea", authors: "Elvira Fidelia", total_stock: 2, available_stock: 1, cover_url: "https://example.test/cover.jpg" }
]);
assert.equal(collapsed.length, 1);
assert.equal(collapsed[0].id, "ready");
assert.equal(collapsed[0].total_stock, 3);
assert.equal(collapsed[0].available_stock, 1);
assert.equal(collapsed[0].cover_url, "https://example.test/cover.jpg");
assert.equal(sanitizeAuthors("<Fidelia, Elvira>"), "Fidelia, Elvira");
assert.equal(sanitizeAuthors("<Panjaitan, Edward><Herdiwijaya, Dhani>"), "Panjaitan, Edward, Herdiwijaya, Dhani");

const sorted = sortBooksByCompleteness([
  { title: "Kosong", cover_url: null, synopsis: null, isbn: null },
  { title: "Dua field", cover_url: "https://example.test/a.jpg", synopsis: "Lengkap", isbn: null },
  { title: "Lengkap", cover_url: "https://example.test/b.jpg", synopsis: "Lengkap", isbn: "9780000000001" },
  { title: "Satu field", cover_url: null, synopsis: "Ada", isbn: null }
]);
assert.deepEqual(sorted.map((book) => book.title), ["Lengkap", "Dua field", "Satu field", "Kosong"]);

const stockBooks = [
  { title: "Lengkap kosong", available_stock: 0, total_stock: 0, cover_url: "cover", synopsis: "Sinopsis", isbn: "123" },
  { title: "Tersedia minimal", available_stock: 1, total_stock: 1 },
  { title: "Tersedia lengkap", available_stock: 2, total_stock: 2, cover_url: "cover", synopsis: "Sinopsis", isbn: "456" },
  { title: "Sedang dipinjam", available_stock: 0, total_stock: 2 }
];
assert.deepEqual(sortCatalogBooks(stockBooks).map(book => book.title), ["Tersedia lengkap", "Tersedia minimal", "Lengkap kosong", "Sedang dipinjam"]);
assert.deepEqual(stockBooks.filter(isBookOutOfStock).map(book => book.title), ["Lengkap kosong", "Sedang dipinjam"]);
assert.equal(stockBooks[0].title, "Lengkap kosong");

console.log("Manual book cover upload checks passed.");
