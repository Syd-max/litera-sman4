import { getSupabase } from "./supabase.js";

export async function getLibraryStatus() {
  const client = await getSupabase();
  const { data, error } = await client.from("library_status").select("is_open,updated_at").eq("id", 1).single();
  if (error) throw error;
  if (!data || ![true, false, null].includes(data.is_open)) throw new Error("Status perpustakaan tidak valid.");
  return data;
}

export async function setLibraryOpen(isOpen) {
  if (typeof isOpen !== "boolean") throw new TypeError("Status harus Buka atau Tutup.");
  const client = await getSupabase();
  const { error } = await client.rpc("set_library_open", { p_is_open: isOpen });
  if (error) throw error;
}

export async function watchLibraryStatus(onChange, onError) {
  const client = await getSupabase();
  let stopped = false;
  let version = 0;
  const refresh = async () => {
    const request = ++version;
    try {
      const status = await getLibraryStatus();
      if (!stopped && request === version) onChange(status);
    } catch (error) {
      if (!stopped && request === version) onError(error);
    }
  };
  const refreshVisible = () => { if (document.visibilityState === "visible") void refresh(); };
  const channel = client.channel(`library-status-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "library_status", filter: "id=eq.1" }, refresh)
    .subscribe(status => { if (status === "SUBSCRIBED") void refresh(); });
  const interval = window.setInterval(refreshVisible, 30000);
  window.addEventListener("focus", refreshVisible);
  window.addEventListener("online", refreshVisible);
  window.addEventListener("pageshow", refreshVisible);
  document.addEventListener("visibilitychange", refreshVisible);
  const stop = () => {
    stopped = true;
    ++version;
    clearInterval(interval);
    void client.removeChannel(channel);
    window.removeEventListener("focus", refreshVisible);
    window.removeEventListener("online", refreshVisible);
    window.removeEventListener("pageshow", refreshVisible);
    document.removeEventListener("visibilitychange", refreshVisible);
    window.removeEventListener("pagehide", onPageHide);
  };
  const onPageHide = event => { if (!event.persisted) stop(); };
  window.addEventListener("pagehide", onPageHide);
  void refresh();
  return { refresh, stop };
}
