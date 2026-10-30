let clientPromise;

function getAuthStorageKey() {
  const path = window.location.pathname.toLowerCase();
  const portal = path.includes("/librarian/") || path.endsWith("/admin-login.html") ? "admin" : "student";
  return `litera-${portal}-auth`;
}

export class MissingConfigurationError extends Error {
  constructor() {
    super("Supabase belum dikonfigurasi.");
    this.name = "MissingConfigurationError";
  }
}

export function hasSupabaseConfig() {
  const config = window.LITERA_CONFIG || {};
  return Boolean(
    config.supabaseUrl &&
    config.supabasePublishableKey &&
    !config.supabaseUrl.includes("YOUR_PROJECT") &&
    !config.supabasePublishableKey.includes("YOUR_")
  );
}

export async function getSupabase() {
  if (!hasSupabaseConfig()) throw new MissingConfigurationError();
  if (!clientPromise) {
    clientPromise = import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm")
      .then(({ createClient }) => createClient(
        window.LITERA_CONFIG.supabaseUrl,
        window.LITERA_CONFIG.supabasePublishableKey,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storage: window.localStorage,
            storageKey: getAuthStorageKey()
          }
        }
      ));
  }
  return clientPromise;
}

