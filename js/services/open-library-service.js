import { APP_CONFIG } from "../config/app-config.js";

export async function searchOpenLibrary(term) {
  const normalized = term.trim();
  if (!normalized) return [];
  const params = new URLSearchParams({
    fields: "key,title,author_name,first_publish_year,isbn,publisher,cover_i",
    limit: "10",
    lang: "id"
  });
  if (/^(?:97[89])?\d{9}[\dXx]$/.test(normalized.replace(/[-\s]/g, ""))) {
    params.set("isbn", normalized.replace(/[-\s]/g, ""));
  } else {
    params.set("q", normalized);
  }
  const response = await fetch(`${APP_CONFIG.openLibrarySearchUrl}?${params}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Open Library tidak dapat dihubungi.");
  const payload = await response.json();
  return (payload.docs || []).map((book) => ({
    source: "Open Library",
    openLibraryKey: book.key || "",
    title: book.title || "",
    authors: Array.isArray(book.author_name) ? book.author_name.join(", ") : "",
    publishYear: book.first_publish_year || "",
    isbn: Array.isArray(book.isbn) ? book.isbn[0] : "",
    isbns: Array.isArray(book.isbn) ? book.isbn : [],
    publisher: Array.isArray(book.publisher) ? book.publisher[0] : "",
    coverUrl: book.cover_i ? `${APP_CONFIG.openLibraryCoverUrl}/${book.cover_i}-M.jpg?default=false` : "",
    synopsis: ""
  }));
}

const normalizeText = (value) => String(value || "").normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("id-ID").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const normalizeIsbn = (value) => String(value || "").replace(/[^0-9Xx]/g, "").toUpperCase();
const authorForms = (value) => {
  const plain = String(value || "").replace(/[<>]/g, "").trim();
  const forms = new Set([normalizeText(plain)]);
  if (plain.includes(",")) {
    const [last, ...first] = plain.split(",").map((part) => part.trim()).filter(Boolean);
    if (last && first.length) forms.add(normalizeText(`${first.join(" ")} ${last}`));
  }
  return forms;
};

export function selectOpenLibraryMatch(results, { isbn = "", title = "", authors = "" } = {}) {
  const requestedIsbn = normalizeIsbn(isbn);
  if (requestedIsbn) return results.find((book) => (book.isbns || []).some((candidate) => normalizeIsbn(candidate) === requestedIsbn)) || null;
  const requestedTitle = normalizeText(title);
  if (!requestedTitle) return null;
  let matches = results.filter((book) => normalizeText(book.title) === requestedTitle);
  if (authors) {
    const requestedAuthors = authorForms(authors);
    matches = matches.filter((book) => [...authorForms(book.authors)].some((form) => requestedAuthors.has(form)));
  }
  return matches.length === 1 ? matches[0] : null;
}

export async function getOpenLibrarySynopsis(workKey) {
  if (!workKey?.startsWith("/works/")) return "";
  const response = await fetch(`https://openlibrary.org${workKey}.json`, { headers: { Accept: "application/json" } });
  if (!response.ok) return "";
  const payload = await response.json();
  return typeof payload.description === "string" ? payload.description : payload.description?.value || "";
}

const publicationYear = (value) => String(value || "").match(/\b(?:1[0-9]{3}|20[0-9]{2})\b/)?.[0] || "";
const cleanDescription = (value) => {
  const description = Array.isArray(value) ? value.join(" ") : String(value || "");
  return description.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#39;/g, "'").replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim();
};
const httpsUrl = (value) => String(value || "").replace(/^http:/, "https:");
const isIsbnQuery = (value) => /^(?:97[89])?\d{9}[\dXx]$/.test(normalizeIsbn(value));

function relevantResults(results, term) {
  const isbn = normalizeIsbn(term);
  if (isIsbnQuery(term)) return results.filter((book) => (book.isbns || []).some((candidate) => normalizeIsbn(candidate) === isbn));
  const tokens = normalizeText(term).split(" ").filter((token) => token.length > 1);
  if (!tokens.length) return [];
  return results.filter((book) => {
    const haystack = normalizeText(`${book.title} ${book.authors}`);
    return tokens.every((token) => haystack.includes(token));
  });
}

async function fetchJson(url, source) {
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`${source} tidak dapat dihubungi.`);
  return response.json();
}

export function mapGoogleBook(item) {
  const book = item?.volumeInfo || {};
  const identifiers = (book.industryIdentifiers || []).map((entry) => entry.identifier).filter(Boolean);
  return {
    source: "Google Books", sourceKey: item?.id || "", openLibraryKey: "",
    title: book.title || "", authors: (book.authors || []).join(", "), publisher: book.publisher || "",
    publishYear: publicationYear(book.publishedDate), isbn: identifiers[0] || "", isbns: identifiers,
    coverUrl: httpsUrl(book.imageLinks?.extraLarge || book.imageLinks?.large || book.imageLinks?.medium || book.imageLinks?.thumbnail),
    synopsis: cleanDescription(book.description)
  };
}

export function mapGoogleFeedBook(entry) {
  const value = (items) => items?.[0]?.$t || "";
  const identifiers = (entry?.["dc$identifier"] || []).map((item) => item.$t).filter((item) => /^(?:97[89])?\d{9}[\dXx]$/.test(normalizeIsbn(item)));
  const thumbnail = (entry?.link || []).find((link) => link.rel === "http://schemas.google.com/books/2008/thumbnail")?.href || "";
  return {
    source: "Google Books", sourceKey: String(entry?.id?.$t || "").split("/").pop(), openLibraryKey: "",
    title: value(entry?.["dc$title"]), authors: (entry?.["dc$creator"] || []).map((item) => item.$t).join(", "),
    publisher: value(entry?.["dc$publisher"]), publishYear: publicationYear(value(entry?.["dc$date"])),
    isbn: identifiers[0] || "", isbns: identifiers, coverUrl: httpsUrl(thumbnail),
    synopsis: cleanDescription(value(entry?.["dc$description"]))
  };
}

async function searchGoogleBooks(term) {
  const query = isIsbnQuery(term) ? `isbn:${normalizeIsbn(term)}` : term;
  try {
    const params = new URLSearchParams({ q: query, maxResults: "10", printType: "books", projection: "full" });
    const payload = await fetchJson(`https://www.googleapis.com/books/v1/volumes?${params}`, "Google Books");
    const results = relevantResults((payload.items || []).map(mapGoogleBook), term);
    if (results.length) return results;
  } catch { /* Feed publik Google Books menjadi fallback saat API utama membatasi kuota. */ }
  const feedParams = new URLSearchParams({ q: query, alt: "json", "max-results": "10" });
  const feed = await fetchJson(`https://books.google.com/books/feeds/volumes?${feedParams}`, "Google Books");
  return relevantResults((feed.feed?.entry || []).map(mapGoogleFeedBook), term);
}

export function mapInternetArchiveBook(item) {
  const isbns = (Array.isArray(item?.isbn) ? item.isbn : [item?.isbn]).filter(Boolean);
  return {
    source: "Internet Archive", sourceKey: item?.identifier || "", openLibraryKey: "",
    title: item?.title || "", authors: Array.isArray(item?.creator) ? item.creator.join(", ") : item?.creator || "",
    publisher: Array.isArray(item?.publisher) ? item.publisher[0] : item?.publisher || "",
    publishYear: publicationYear(item?.date), isbn: isbns[0] || "", isbns,
    coverUrl: item?.identifier ? `https://archive.org/services/img/${encodeURIComponent(item.identifier)}` : "",
    synopsis: cleanDescription(item?.description)
  };
}

async function searchInternetArchive(term) {
  const cleanTerm = String(term).replace(/["\\]/g, " ").trim();
  const query = isIsbnQuery(term) ? `isbn:\"${normalizeIsbn(term)}\" AND mediatype:texts` : `title:\"${cleanTerm}\" AND mediatype:texts`;
  const params = new URLSearchParams({ q: query, fields: "identifier,title,creator,date,publisher,isbn,description", count: "10" });
  const payload = await fetchJson(`https://archive.org/services/search/v1/scrape?${params}`, "Internet Archive");
  return relevantResults((payload.items || []).map(mapInternetArchiveBook), term);
}

export function mapGutendexBook(item) {
  return {
    source: "Gutendex", sourceKey: item?.id ? String(item.id) : "", openLibraryKey: "",
    title: item?.title || "", authors: (item?.authors || []).map((author) => author.name).join(", "),
    publisher: "Project Gutenberg", publishYear: "", isbn: "", isbns: [],
    coverUrl: httpsUrl(item?.formats?.["image/jpeg"]), synopsis: cleanDescription(item?.summaries?.[0])
  };
}

async function searchGutendex(term) {
  const payload = await fetchJson(`https://gutendex.com/books?${new URLSearchParams({ search: term })}`, "Gutendex");
  return relevantResults((payload.results || []).map(mapGutendexBook), term);
}

export async function searchFirstAvailableMetadata(term, sources, onSource = () => {}) {
  const attempted = [];
  for (const source of sources) {
    attempted.push(source.name);
    onSource(source.name, attempted.length, sources.length);
    try {
      const results = await source.search(term);
      if (results.length) return { results, source: source.name, attempted };
    } catch { /* Sumber berikutnya tetap dicoba saat satu layanan gagal. */ }
  }
  return { results: [], source: "", attempted };
}

export async function searchBookMetadata(term, onSource) {
  const normalized = term.trim();
  if (!normalized) return { results: [], source: "", attempted: [] };
  return searchFirstAvailableMetadata(normalized, [
    { name: "Open Library", search: async (query) => relevantResults(await searchOpenLibrary(query), query) },
    { name: "Google Books", search: searchGoogleBooks },
    { name: "Internet Archive", search: searchInternetArchive },
    { name: "Gutendex", search: searchGutendex }
  ], onSource);
}

