import { getSupabase } from "./supabase.js";

export function reviewErrorMessage(error) {
  if (/inappropriate words/.test(error?.message || "")) return "Ulasan mengandung kata yang tidak pantas. Perbaiki bahasanya sebelum dikirim.";
  if (/confirmed return/.test(error?.message || "")) return "Ulasan hanya bisa dikirim setelah pengembalian buku dikonfirmasi pengelola.";
  if (/invalid book review/.test(error?.message || "")) return "Pilih rating 1–5 bintang dan isi ulasan 1–250 karakter.";
  if (["42P01", "42703", "42883", "PGRST202", "PGRST205"].includes(error?.code)) return "Fitur ulasan belum aktif. Pengelola perlu menjalankan book-reviews.sql di Supabase.";
  if (error?.code === "42501") return "Akun tidak memiliki izin untuk mengirim atau melihat ulasan ini.";
  return "Ulasan belum berhasil diproses. Periksa koneksi dan coba lagi.";
}

export async function listMyBookReviews() {
  const client = await getSupabase();
  const { data, error } = await client.from("book_reviews").select("book_id,rating,body");
  if (error) throw error;
  return data || [];
}

export async function submitBookReview(historyId, rating, body) {
  const cleaned = body.trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !cleaned || Array.from(cleaned).length > 250) {
    throw new Error("invalid book review");
  }
  const client = await getSupabase();
  const { error } = await client.rpc("submit_book_review", { p_reading_history_id: historyId, p_rating: rating, p_body: cleaned });
  if (error) throw error;
}

export async function getBookReviews(bookId, offset = 0) {
  const client = await getSupabase();
  const { data, error } = await client.rpc("get_book_reviews", { p_book_id: bookId, p_offset: offset });
  if (error) throw error;
  return data;
}
