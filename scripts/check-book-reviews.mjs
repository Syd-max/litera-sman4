import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("js/services/review-service.js", "utf8");
const original = globalThis.bookReviewTestClient;
const calls = [];
let failure;
globalThis.bookReviewTestClient = {
  async rpc(name, parameters) { calls.push({ name, parameters }); return { data: { total: 0, average: null, reviews: [] }, error: failure }; },
  from(table) {
    assert.equal(table, "book_reviews");
    return { async select(columns) { assert.equal(columns, "book_id,rating,body"); return { data: [], error: failure }; } };
  }
};
const code = source.replace('import { getSupabase } from "./supabase.js";', 'const getSupabase = async () => globalThis.bookReviewTestClient;');
const service = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
try {
  for (const rating of [0, 6, 1.5, null]) await assert.rejects(service.submitBookReview("history", rating, "Bagus"), /invalid book review/);
  for (const body of ["", " \t\n", "x".repeat(251)]) await assert.rejects(service.submitBookReview("history", 5, body), /invalid book review/);
  assert.equal(calls.length, 0, "Invalid input must not be sent");
  await service.submitBookReview("history", 5, "  Buku ini menarik.  ");
  assert.deepEqual(calls.at(-1), { name: "submit_book_review", parameters: { p_reading_history_id: "history", p_rating: 5, p_body: "Buku ini menarik." } });
  await service.submitBookReview("history", 1, "x".repeat(250));
  assert.equal(calls.at(-1).parameters.p_body.length, 250);
  assert.deepEqual(await service.getBookReviews("book", 10), { total: 0, average: null, reviews: [] });
  assert.deepEqual(calls.at(-1), { name: "get_book_reviews", parameters: { p_book_id: "book", p_offset: 10 } });
  assert.deepEqual(await service.listMyBookReviews(), []);
  failure = { code: "42501", message: "review requires confirmed return" };
  await assert.rejects(service.submitBookReview("history", 5, "Bagus"), error => error === failure);
  assert.match(service.reviewErrorMessage(failure), /dikonfirmasi/);
  assert.match(service.reviewErrorMessage({ message: "review contains inappropriate words" }), /tidak pantas/);
  assert.match(service.reviewErrorMessage({ code: "PGRST202" }), /belum aktif/);
  const sql = (await readFile("supabase/book-reviews.sql", "utf8")).replace(/\r\n/g, "\n");
  const schema = (await readFile("supabase/schema.sql", "utf8")).replace(/\r\n/g, "\n");
  assert.ok(schema.includes(sql), "Fresh schema and incremental migration must agree");
  assert.match(sql, /references public\.reading_history\(id\) on delete cascade/);
  assert.match(sql, /unique \(student_id, book_id\)/);
  assert.match(sql, /l\.status = 'RETURNED'/);
  assert.match(sql, /h\.student_id = auth\.uid\(\)/);
  assert.match(sql, /revoke all on public\.book_reviews from public, anon, authenticated/);
  assert.doesNotMatch(sql, /grant (?:insert|update|delete) .* to authenticated/i);
  assert.ok(sql.indexOf("review contains inappropriate words") < sql.indexOf("insert into public.book_reviews"));
  console.log("Book reviews: validation, server moderation errors, private own-review reads, paginated ratings, and schema/cleanup compatibility passed.");
} finally { globalThis.bookReviewTestClient = original; }
