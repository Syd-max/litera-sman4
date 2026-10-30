import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { friendlyError } from "../js/utils.js";

const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const service = await readFile(new URL("../js/services/book-service.js", import.meta.url), "utf8");

assert.match(schema, /alter table public\.books add column if not exists archived_at timestamptz/);
assert.match(schema, /function public\.archive_book[\s\S]*update public\.books set archived_at = now\(\)/);
assert.match(schema, /function public\.restore_book[\s\S]*update public\.books set archived_at = null/);
assert.match(schema, /function public\.delete_book[\s\S]*return public\.archive_book\(p_book_id\)/);
assert.match(service, /\.is\("archived_at", null\)/);
assert.match(service, /error\?\.code === "42703"/);
assert.match(service, /rpc\("archive_book"/);
assert.match(service, /rpc\("restore_book"/);
assert.match(friendlyError({ message: "Could not find the function public.archive_book" }), /schema\.sql/i);

console.log("Book archive and restore checks passed.");
