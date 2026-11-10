import { getSupabase } from "./supabase.js";
import { isStudentAccessExpired, MIN_ENROLLMENT_YEAR } from "../account-lifecycle.js";

const REGISTRATION_SYNC_INTERVAL_MS = 5 * 60 * 1000;
let lastRegistrationSync = 0;

async function syncStudentRegistrations(client) {
  if (Date.now() - lastRegistrationSync < REGISTRATION_SYNC_INTERVAL_MS) return;
  const { error } = await client.rpc("sync_student_registrations");
  if (error && !["42883", "PGRST202"].includes(error.code)) throw error;
  lastRegistrationSync = Date.now();
}

export async function listPendingStudents() {
  const client = await getSupabase();
  await syncStudentRegistrations(client);
  const { data, error } = await client.from("student_profiles").select("id,full_name,class_name,enrollment_year,major,email,status,created_at,access_expires_at").eq("status", "PENDING").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).filter(student => !isStudentAccessExpired(student));
}

export async function listStudents() {
  const client = await getSupabase();
  await syncStudentRegistrations(client);
  const { error: refreshError } = await client.rpc("refresh_student_access_status");
  if (refreshError && !["42883", "PGRST202"].includes(refreshError.code)) throw refreshError;
  const { data, error } = await client.from("student_profiles").select("id,full_name,class_name,enrollment_year,major,email,status,created_at,access_expires_at").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(student => isStudentAccessExpired(student) ? { ...student, status: "EXPIRED" } : student);
}

export async function hasPendingStudentRegistrations() {
  const client = await getSupabase();
  const { data, error } = await client.from("student_profiles").select("id")
    .eq("status", "PENDING")
    .or(`access_expires_at.is.null,access_expires_at.gt.${new Date().toISOString()}`)
    .limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}

export async function subscribeToStudentRegistrations(onChange, onSubscribed) {
  const client = await getSupabase();
  const channel = client
    .channel(`student-registrations-${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "student_profiles" },
      onChange
    )
    .subscribe(status => { if (status === "SUBSCRIBED") onSubscribed?.(); });

  return () => client.removeChannel(channel);
}

export async function reviewStudent(studentId, decision) {
  const client = await getSupabase();
  const { data, error } = await client.rpc("review_student_registration", { p_student_id: studentId, p_decision: decision });
  if (error) throw error;
  return data;
}

export async function setStudentSuspended(studentId, suspended) {
  const client = await getSupabase();
  const { data, error } = await client.rpc("set_student_suspension", { p_student_id: studentId, p_suspend: suspended });
  if (error) throw error;
  return data;
}

export async function resetStudentPassword(studentId, password) {
  const client = await getSupabase();
  const { data: { session }, error } = await client.auth.getSession();
  if (error) throw error;
  if (!session?.access_token) throw new Error("Sesi pustakawan tidak tersedia. Silakan login kembali.");
  const response = await fetch("/api/student-password", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ studentId, password })
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(result?.error || "Reset password belum tersedia. Pastikan fungsi server sudah diterapkan."), { code: "STUDENT_PASSWORD_RESET" });
}

export async function deleteRejectedStudent(studentId) {
  const client = await getSupabase();
  const { data: { session }, error } = await client.auth.getSession();
  if (error) throw error;
  if (!session?.access_token) throw new Error("Sesi pustakawan tidak tersedia. Silakan login kembali.");
  const response = await fetch("/api/student-delete", {
    method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ studentId })
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(result?.error || "Penghapusan akun belum tersedia. Coba lagi nanti."), { code: "STUDENT_DELETE" });
  return result;
}

export const dashboardWindowStart = (now = new Date()) => new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

export async function dashboardMetrics() {
  const client = await getSupabase();
  const [{ data, error }, recentBooks] = await Promise.all([
    client.rpc("librarian_dashboard_metrics"),
    client.from("books").select("id", { count: "exact", head: true }).is("archived_at", null).gte("created_at", dashboardWindowStart())
  ]);
  if (error) throw error;
  if (recentBooks.error) throw recentBooks.error;
  return { ...(data || {}), books_added_7_days: recentBooks.count || 0 };
}

async function listDashboardRows(client, table, columns) {
  const pageSize = 500;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from(table).select(columns).order("id").range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export async function dashboardActivity(now = new Date()) {
  const client = await getSupabase();
  const [students, loans] = await Promise.all([
    listDashboardRows(client, "student_profiles", "id,enrollment_year"),
    listDashboardRows(client, "loans", "id,student_id,status,requested_at")
  ]);
  const cohorts = new Map();
  const studentYears = new Map();
  for (const student of students) {
    const year = Number(student.enrollment_year);
    if (!Number.isInteger(year) || year < MIN_ENROLLMENT_YEAR || year > 2100) continue;
    if (!cohorts.has(year)) cohorts.set(year, { year, registrations: 0, loans: 0 });
    cohorts.get(year).registrations++;
    studentYears.set(student.id, year);
  }

  let pendingReturns = 0;
  let monthlyTransactions = 0;
  const monthFormat = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", year: "numeric", month: "numeric" });
  const currentMonth = monthFormat.format(now);
  for (const loan of loans) {
    if (loan.status === "RETURN_REQUESTED") pendingReturns++;
    const requested = new Date(loan.requested_at);
    if (loan.requested_at && Number.isFinite(requested.getTime()) && monthFormat.format(requested) === currentMonth) monthlyTransactions++;
    const cohort = cohorts.get(studentYears.get(loan.student_id));
    if (cohort && ["BORROWED", "RETURN_REQUESTED", "RETURNED"].includes(loan.status)) cohort.loans++;
  }

  return { cohorts: [...cohorts.values()].sort((a, b) => a.year - b.year), pendingReturns, monthlyTransactions };
}

export async function updateStudentProfile({ fullName, className, major }) {
  const client = await getSupabase();
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user) throw userError || new Error("Sesi tidak tersedia.");
  const { data, error } = await client.from("student_profiles").update({ full_name: fullName, class_name: className, major }).eq("id", user.id).select().single();
  if (error) throw error;
  return data;
}

