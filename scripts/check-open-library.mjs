import assert from "node:assert/strict";
import { mapGoogleBook, mapGoogleFeedBook, mapGutendexBook, mapInternetArchiveBook, searchFirstAvailableMetadata, selectOpenLibraryMatch } from "../js/services/open-library-service.js";

const results = [
  { title: "Bumi", authors: "Tere Liye", isbns: ["9786020332956"] },
  { title: "Bumi", authors: "Penulis Lain", isbns: ["9780000000002"] },
  { title: "Laut Bercerita", authors: "Leila S. Chudori", isbns: ["9786024246945"] }
];

assert.equal(selectOpenLibraryMatch(results, { isbn: "978-602-4246-94-5" }), results[2]);
assert.equal(selectOpenLibraryMatch(results, { isbn: "9780000000999" }), null);
assert.equal(selectOpenLibraryMatch(results, { title: "Bumi", authors: "Tere Liye" }), results[0]);
assert.equal(selectOpenLibraryMatch(results, { title: "Bumi" }), null);
assert.equal(selectOpenLibraryMatch(results, { title: "Laut Bercerita" }), results[2]);
assert.equal(selectOpenLibraryMatch([{ title: "Jurnalistik", authors: "Aep Saefulloh" }], { title: "Jurnalistik", authors: "<Saefulloh, Aep>" })?.title, "Jurnalistik");
assert.equal(selectOpenLibraryMatch(results, { title: "Laut Bercerita Ringkas" }), null);

const google = mapGoogleBook({ id: "g1", volumeInfo: { title: "Bumi", authors: ["Tere Liye"], publishedDate: "2014-01-01", industryIdentifiers: [{ identifier: "9786020332956" }], imageLinks: { thumbnail: "http://example.test/cover.jpg" }, description: "Sinopsis lengkap." } });
assert.equal(google.source, "Google Books");
assert.equal(google.publishYear, "2014");
assert.equal(google.coverUrl, "https://example.test/cover.jpg");
const googleFeed = mapGoogleFeedBook({ id: { $t: "https://books.google.com/books/feeds/volumes/g1" }, "dc$title": [{ $t: "Bumi" }], "dc$creator": [{ $t: "Tere Liye" }], "dc$date": [{ $t: "2014-01-01" }], "dc$identifier": [{ $t: "9786020332956" }], "dc$description": [{ $t: "Sinopsis&nbsp;lengkap." }], link: [{ rel: "http://schemas.google.com/books/2008/thumbnail", href: "http://example.test/feed.jpg" }] });
assert.equal(googleFeed.isbn, "9786020332956");
assert.equal(googleFeed.synopsis, "Sinopsis lengkap.");
assert.equal(mapInternetArchiveBook({ identifier: "abc", title: "Bumi", creator: "Tere Liye", date: "2014" }).source, "Internet Archive");
assert.equal(mapGutendexBook({ id: 1, title: "Pride and Prejudice", authors: [{ name: "Jane Austen" }], formats: { "image/jpeg": "https://example.test/a.jpg" } }).publisher, "Project Gutenberg");

const attempted = [];
const fallback = await searchFirstAvailableMetadata("Bumi", [
  { name: "Pertama", search: async () => [] },
  { name: "Kedua", search: async () => { throw new Error("gagal"); } },
  { name: "Ketiga", search: async () => [google] },
  { name: "Keempat", search: async () => [{ title: "tidak boleh dipanggil" }] }
], (source) => attempted.push(source));
assert.deepEqual(attempted, ["Pertama", "Kedua", "Ketiga"]);
assert.equal(fallback.source, "Ketiga");
assert.equal(fallback.results[0].title, "Bumi");

console.log("Open Library matching checks passed.");
