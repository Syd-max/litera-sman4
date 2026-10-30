import { getSupabase } from "./supabase.js";

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
  const { data, error } = await client.from("student_profiles").select("id,full_name,class_name,enrollment_year,major,email,status,created_at").eq("status", "PENDING").order("created_at");
  if (error) throw error;
  return data || [];
}

export async function listStudents() {
  const client = await getSupabase();
  await syncStudentRegistrations(client);
  const { data, error } = await client.from("student_profiles").select("id,full_name,class_name,enrollment_year,major,email,status,created_at").order("full_name");
  if (error) throw error;
  return data || [];
}

export async function subscribeToStudentRegistrations(onChange) {
  const client = await getSupabase();
  const channel = client
    .channel(`student-registrations-${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "student_profiles" },
      onChange
    )
    .subscribe();

  return () => client.removeChannel(channel);
}

export async function reviewStudent(studentId, decision) {
  const client = await getSupabase();
  const { data, error } = await client.rpc("review_student_registration", { p_student_id: studentId, p_decision: decision });
  if (error) throw error;
  return data;
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

export async function updateStudentProfile({ fullName, className, major }) {
  const client = await getSupabase();
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user) throw userError || new Error("Sesi tidak tersedia.");
  const { data, error } = await client.from("student_profiles").update({ full_name: fullName, class_name: className, major }).eq("id", user.id).select().single();
  if (error) throw error;
  return data;
}

