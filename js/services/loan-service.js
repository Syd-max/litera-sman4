import { getSupabase } from "./supabase.js";

const loanSelection = "id,status,requested_at,approved_at,borrowed_at,due_at,return_requested_at,returned_at,rejection_reason,extension_status,extension_requested_at,extension_reviewed_at,book:books(id,title,authors,cover_url),student:student_profiles(id,full_name,class_name)";

export async function listMyLoans() {
  const client = await getSupabase();
  const { data, error } = await client.from("loans").select(loanSelection).order("requested_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listAllLoans({ status = "", search = "" } = {}) {
  const client = await getSupabase();
  let query = client.from("loans").select(loanSelection).order("requested_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  const normalized = (data || []);
  if (!search.trim()) return normalized;
  const needle = search.trim().toLocaleLowerCase("id-ID");
  return normalized.filter((loan) => `${loan.student?.full_name || ""} ${loan.book?.title || ""}`.toLocaleLowerCase("id-ID").includes(needle));
}

async function call(functionName, parameters) {
  const client = await getSupabase();
  const { data, error } = await client.rpc(functionName, parameters);
  if (error) throw error;
  return data;
}

export const requestLoan = (bookId) => call("request_loan", { p_book_id: bookId });
export const approveLoan = (loanId) => call("approve_loan", { p_loan_id: loanId });
export const rejectLoan = (loanId, reason) => call("reject_loan", { p_loan_id: loanId, p_reason: reason || null });
export const markBorrowed = (loanId) => call("mark_loan_borrowed", { p_loan_id: loanId });
export const requestLoanExtension = (loanId) => call("request_loan_extension", { p_loan_id: loanId });
export const reviewLoanExtension = (loanId, decision) => call("review_loan_extension", { p_loan_id: loanId, p_decision: decision });
export const requestReturn = (loanId) => call("request_return", { p_loan_id: loanId });
export const confirmReturn = (loanId) => call("confirm_return", { p_loan_id: loanId });

export async function subscribeToLoans(onChange) {
  const client = await getSupabase();
  const channel = client
    .channel(`loans-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "loans" }, onChange)
    .subscribe();

  return () => client.removeChannel(channel);
}

export async function listReadingHistory() {
  const client = await getSupabase();
  const { data, error } = await client.from("reading_history").select("id,borrowed_at,returned_at,book:books(id,title,authors,cover_url)").order("returned_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

