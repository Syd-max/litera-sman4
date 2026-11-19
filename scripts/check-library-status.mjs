import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("js/services/library-status-service.js", "utf8");
const original = { window: globalThis.window, document: globalThis.document, client: globalThis.libraryStatusTestClient };
const listeners = new EventTarget();
const documentEvents = new EventTarget();
const intervals = new Set();
globalThis.window = Object.assign(listeners, { setInterval(callback) { intervals.add(callback); return callback; } });
globalThis.document = Object.assign(documentEvents, { visibilityState: "visible" });
const originalClearInterval = globalThis.clearInterval;
globalThis.clearInterval = callback => intervals.delete(callback);
let status = { is_open: null, updated_at: new Date().toISOString() }, change, subscribed, removed = 0, failure, reads = 0, deferred;
const channel = {
  on(event, filter, callback) { assert.equal(filter.table, "library_status"); change = callback; return this; },
  subscribe(callback) { subscribed = callback; return this; }
};
globalThis.libraryStatusTestClient = {
  from(table) {
    assert.equal(table, "library_status");
    const query = {
      select: () => query,
      eq(column, value) { assert.equal(column, "id"); assert.equal(value, 1); return query; },
      async single() { ++reads; if (deferred) return deferred; return { data: status, error: failure }; }
    };
    return query;
  },
  async rpc(name, parameters) { assert.equal(name, "set_library_open"); if (!failure) status = { ...status, is_open: parameters.p_is_open }; return { error: failure }; },
  channel: () => channel,
  async removeChannel(received) { assert.equal(received, channel); ++removed; }
};
const moduleSource = source.replace('import { getSupabase } from "./supabase.js";', 'const getSupabase = async () => globalThis.libraryStatusTestClient;');
const service = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`);
const tick = () => new Promise(resolve => setImmediate(resolve));
try {
  assert.equal((await service.getLibraryStatus()).is_open, null);
  await assert.rejects(service.setLibraryOpen("true"), TypeError);
  const updates = [], errors = [];
  const watcher = await service.watchLibraryStatus(value => updates.push(value.is_open), error => errors.push(error));
  await tick();
  assert.deepEqual(updates, [null]);
  await service.setLibraryOpen(true); await change();
  assert.equal(updates.at(-1), true);
  await service.setLibraryOpen(false); subscribed("SUBSCRIBED"); await tick();
  assert.equal(updates.at(-1), false);
  failure = { code: "42501" };
  await assert.rejects(service.setLibraryOpen(true), error => error.code === "42501");
  assert.equal(status.is_open, false);
  await watcher.refresh(); assert.equal(errors.length, 1);
  failure = null;
  let resolveOld;
  deferred = new Promise(resolve => { resolveOld = resolve; });
  const stale = watcher.refresh(); await tick();
  deferred = null;
  status = { ...status, is_open: true };
  await watcher.refresh();
  resolveOld({ data: { is_open: false }, error: null }); await stale;
  assert.equal(updates.at(-1), true);
  document.visibilityState = "hidden";
  const before = reads;
  [...intervals][0](); await tick(); assert.equal(reads, before);
  document.visibilityState = "visible";
  window.dispatchEvent(new Event("online")); await tick(); assert.ok(reads > before);
  watcher.stop();
  assert.equal(removed, 1); assert.equal(intervals.size, 0);
  const last = updates.length;
  await change(); assert.equal(updates.length, last);
  console.log("Library status: live refresh, reconnect, stale response protection, permission errors, visible-only fallback and subscription cleanup passed.");
} finally {
  globalThis.window = original.window; globalThis.document = original.document;
  globalThis.libraryStatusTestClient = original.client; globalThis.clearInterval = originalClearInterval;
}
