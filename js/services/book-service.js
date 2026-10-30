import { getSupabase } from "./supabase.js";

const legacyBookSelection = "id,isbn,title,authors,publisher,publish_year,synopsis,total_stock,available_stock,shelf_location,cover_url,open_library_key,created_at,category:categories(id,name,slug)";
const catalogBookSelection = "id,isbn,title,authors,synopsis,total_stock,available_stock,shelf_location,cover_url,category:categories(id,name,slug)";
const inventoryFields = "inventory_number,classification,acquisition_source,source_note,source_file,source_sheet,source_row,source_data";
const bookSelection = `${legacyBookSelection},${inventoryFields}`;
const missingInventorySchema = (error) => error?.code === "42703" || error?.message?.includes("inventory_number");
export const MAX_BOOK_COVER_BYTES = 2 * 1024 * 1024;
export const MAX_BOOK_COVER_DIMENSION = 1200;
export const MAX_COMPRESSED_BOOK_COVER_BYTES = 600 * 1024;
const bookCoverTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export const sanitizeAuthors = (value) => String(value || "").replace(/>\s*</g, ", ").replace(/[<>]/g, "").replace(/\s*,\s*/g, ", ").replace(/(?:,\s*){2,}/g, ", ").trim();

const catalogTextKey = (value) => String(value || "").normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("id-ID").match(/[a-z0-9]+/g)?.join(" ") || "";
const catalogAuthorKey = (value) => catalogTextKey(value).split(" ").filter(Boolean).sort().join(" ");
const bookCompleteness = (book) => [book.cover_url, book.synopsis, book.isbn].filter((value) => String(value || "").trim()).length;

export function sortBooksByCompleteness(books) {
  return [...books].sort((left, right) => bookCompleteness(right) - bookCompleteness(left)
    || String(left.title || "").localeCompare(String(right.title || ""), "id-ID", { sensitivity: "base", numeric: true })
    || String(left.authors || "").localeCompare(String(right.authors || ""), "id-ID", { sensitivity: "base" }));
}

export function collapseCatalogDuplicates(books) {
  const grouped = new Map();
  for (const book of books) {
    const key = `${catalogTextKey(book.title)}|${catalogAuthorKey(book.authors)}`;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { ...book });
      continue;
    }
    const preferred = Number(current.available_stock) > 0 || Number(book.available_stock) <= 0 ? current : book;
    const alternate = preferred === current ? book : current;
    grouped.set(key, {
      ...preferred,
      cover_url: preferred.cover_url || alternate.cover_url || null,
      synopsis: preferred.synopsis || alternate.synopsis || null,
      isbn: preferred.isbn || alternate.isbn || null,
      total_stock: Number(current.total_stock || 0) + Number(book.total_stock || 0),
      available_stock: Number(current.available_stock || 0) + Number(book.available_stock || 0)
    });
  }
  return [...grouped.values()];
}

export function validateBookCover(file) {
  if (!file?.size) throw Object.assign(new Error("Cover buku wajib dipilih."), { code: "COVER_REQUIRED" });
  if (!bookCoverTypes.has(file.type)) throw Object.assign(new Error("Format cover tidak didukung."), { code: "COVER_TYPE" });
  if (file.size > MAX_BOOK_COVER_BYTES) throw Object.assign(new Error("Ukuran cover melebihi 2 MB."), { code: "COVER_TOO_LARGE" });
}

async function convertBookCoverToWebp(file) {
  validateBookCover(file);
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_BOOK_COVER_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [.82, .7, .58]) {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      if (blob && blob.size <= MAX_COMPRESSED_BOOK_COVER_BYTES) return blob;
    }
    throw new Error("converted cover is too large");
  } catch {
    throw Object.assign(new Error("Cover gagal dikonversi ke WebP."), { code: "COVER_CONVERSION" });
  } finally {
    bitmap?.close?.();
  }
}

export function bookCoverStoragePath(url) {
  try {
    const marker = "/storage/v1/object/public/book-covers/";
    const pathname = new URL(url).pathname;
    return pathname.includes(marker) ? decodeURIComponent(pathname.split(marker)[1] || "") : "";
  } catch {
    return "";
  }
}

export async function uploadBookCover(file) {
  const client = await getSupabase();
  const cover = await convertBookCoverToWebp(file);
  const path = `${crypto.randomUUID()}.webp`;
  const bucket = client.storage.from("book-covers");
  const { error } = await bucket.upload(path, cover, { contentType: "image/webp", upsert: false });
  if (error) throw error;
  const { data } = bucket.getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

export async function removeBookCover(path) {
  if (!path) return;
  const client = await getSupabase();
  const { error } = await client.storage.from("book-covers").remove([path]);
  if (error) throw error;
}

export async function listBooks({ search = "", category = "", limit = 60 } = {}) {
  const client = await getSupabase();
  const data = [];
  const requested = Math.max(limit, 200);
  const pageSize = Math.min(requested, 1000);
  for (let offset = 0; offset < requested; offset += pageSize) {
    let { data: page, error } = await client.from("books").select(catalogBookSelection).is("archived_at", null).order("title").order("id").range(offset, Math.min(offset + pageSize, requested) - 1);
    if (error?.code === "42703" || error?.message?.includes("archived_at")) {
      ({ data: page, error } = await client.from("books").select(catalogBookSelection).order("title").order("id").range(offset, Math.min(offset + pageSize, requested) - 1));
    }
    if (error) throw error;
    data.push(...(page || []));
    if ((page || []).length < pageSize) break;
  }
  const needle = search.trim().toLocaleLowerCase("id-ID");
  return sortBooksByCompleteness(data.filter((book) => {
    const matchesCategory = !category || book.category?.slug === category;
    const haystack = `${book.title} ${book.authors} ${book.isbn || ""} ${book.category?.name || ""}`.toLocaleLowerCase("id-ID");
    return matchesCategory && (!needle || haystack.includes(needle));
  })).slice(0, limit);
}

export async function listBooksForExport() {
  const client = await getSupabase();
  const books = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    let { data, error } = await client.from("books").select(bookSelection).is("archived_at", null).order("title").order("id").range(offset, offset + pageSize - 1);
    if (missingInventorySchema(error)) {
      ({ data, error } = await client.from("books").select(legacyBookSelection).is("archived_at", null).order("title").order("id").range(offset, offset + pageSize - 1));
    }
    if (error?.code === "42703" || error?.message?.includes("archived_at")) {
      ({ data, error } = await client.from("books").select(bookSelection).order("title").order("id").range(offset, offset + pageSize - 1));
      if (missingInventorySchema(error)) ({ data, error } = await client.from("books").select(legacyBookSelection).order("title").order("id").range(offset, offset + pageSize - 1));
    }
    if (error) throw error;
    books.push(...(data || []));
    if ((data || []).length < pageSize) return books;
  }
}

export async function listCatalogBooks() {
  const client = await getSupabase();
  const books = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    let { data, error } = await client.from("books").select(catalogBookSelection).is("archived_at", null).order("title").order("id").range(offset, offset + pageSize - 1);
    if (error?.code === "42703" || error?.message?.includes("archived_at")) {
      ({ data, error } = await client.from("books").select(catalogBookSelection).order("title").order("id").range(offset, offset + pageSize - 1));
    }
    if (error) throw error;
    books.push(...(data || []));
    if ((data || []).length < pageSize) return sortBooksByCompleteness(collapseCatalogDuplicates(books));
  }
}

export async function listArchivedBooks() {
  const client = await getSupabase();
  let { data, error } = await client.from("books").select(`${bookSelection},archived_at`).not("archived_at", "is", null).order("archived_at", { ascending: false });
  if (missingInventorySchema(error)) {
    ({ data, error } = await client.from("books").select(`${legacyBookSelection},archived_at`).not("archived_at", "is", null).order("archived_at", { ascending: false }));
  }
  if (error) throw error;
  return data || [];
}

export async function listPopularBooks(limit = 8) {
  const client = await getSupabase();
  let { data, error } = await client.from("book_search_stats").select(`search_count,book:books(${bookSelection})`).order("search_count", { ascending: false }).order("last_searched_at", { ascending: false }).limit(limit);
  if (missingInventorySchema(error)) {
    ({ data, error } = await client.from("book_search_stats").select(`search_count,book:books(${legacyBookSelection})`).order("search_count", { ascending: false }).order("last_searched_at", { ascending: false }).limit(limit));
  }
  if (["42P01", "PGRST200", "PGRST205"].includes(error?.code)) return [];
  if (error) throw error;
  return collapseCatalogDuplicates((data || []).map((row) => row.book).filter(Boolean));
}

export async function recordBookSearch(bookIds) {
  if (!bookIds.length) return;
  const client = await getSupabase();
  const { error } = await client.rpc("record_book_searches", { p_book_ids: bookIds.slice(0, 5) });
  if (error) throw error;
}

export async function getBook(bookId) {
  const client = await getSupabase();
  let { data, error } = await client.from("books").select(bookSelection).eq("id", bookId).single();
  if (missingInventorySchema(error)) ({ data, error } = await client.from("books").select(legacyBookSelection).eq("id", bookId).single());
  if (error) throw error;
  return data;
}

export async function listCategories() {
  const client = await getSupabase();
  const { data, error } = await client.from("categories").select("id,name,slug").order("name");
  if (error) throw error;
  return data || [];
}

export async function saveBook(book) {
  const client = await getSupabase();
  const common = {
    p_book_id: book.id || null,
    p_isbn: book.isbn || null,
    p_title: book.title,
    p_authors: sanitizeAuthors(book.authors),
    p_publisher: book.publisher || null,
    p_publish_year: book.publishYear || null,
    p_category_id: book.categoryId || null,
    p_synopsis: book.synopsis || null,
    p_total_stock: Number(book.totalStock),
    p_shelf_location: book.shelfLocation,
    p_cover_url: book.coverUrl || null,
    p_open_library_key: book.openLibraryKey || null
  };
  let { data, error } = await client.rpc("save_book_details", {
    ...common,
    p_inventory_number: book.inventoryNumber || null,
    p_classification: book.classification || null,
    p_acquisition_source: book.acquisitionSource || null,
    p_source_note: book.sourceNote || null,
    p_source_file: book.sourceFile || null,
    p_source_sheet: book.sourceSheet || null,
    p_source_row: book.sourceRow ? Number(book.sourceRow) : null,
    p_source_data: book.sourceData || null
  });
  if ((error?.code === "PGRST202" || error?.code === "42883") && ![book.inventoryNumber, book.classification, book.acquisitionSource, book.sourceNote, book.sourceFile].some(Boolean)) {
    ({ data, error } = await client.rpc("save_book", common));
  }
  if (error) throw error;
  return data;
}

export async function archiveBook(bookId) {
  const client = await getSupabase();
  const { data, error } = await client.rpc("archive_book", { p_book_id: bookId });
  if (error) throw error;
  return data;
}

export async function restoreBook(bookId) {
  const client = await getSupabase();
  const { data, error } = await client.rpc("restore_book", { p_book_id: bookId });
  if (error) throw error;
  return data;
}

export async function isFavorite(bookId) {
  const client = await getSupabase();
  const { data, error } = await client.from("favorites").select("book_id").eq("book_id", bookId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function toggleFavorite(bookId, favorite) {
  const client = await getSupabase();
  if (favorite) {
    const { error } = await client.from("favorites").delete().eq("book_id", bookId);
    if (error) throw error;
    return false;
  }
  const { error } = await client.from("favorites").insert({ book_id: bookId });
  if (error) throw error;
  return true;
}

export async function listFavorites() {
  const client = await getSupabase();
  let { data, error } = await client.from("favorites").select(`created_at,book:books(${bookSelection})`).order("created_at", { ascending: false });
  if (missingInventorySchema(error)) {
    ({ data, error } = await client.from("favorites").select(`created_at,book:books(${legacyBookSelection})`).order("created_at", { ascending: false }));
  }
  if (error) throw error;
  return collapseCatalogDuplicates((data || []).map((row) => row.book).filter(Boolean));
}

