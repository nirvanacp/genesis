import type { Session } from "./session.js";
import type { Storage, StorageBatch, StorageChange, StoredDocument } from "../types.js";

/** The applet's record collections over `storage.*`, with change events from `storage.changed`. */
export function createStorage(session: Session): Storage {
  const listeners = new Set<(change: StorageChange) => void>();
  session.on("storage.changed", (change: StorageChange) => {
    for (const listener of [...listeners]) listener(change);
  });
  return {
    get: <T>(collection: string, key: string) =>
      session.request<{ document: StoredDocument<T> | null; namespaceRevision: number }>("storage.get", { collection, key }),
    list: <T>(collection: string, options: { afterKey?: string; limit?: number } = {}) =>
      session.request<{ entries: StoredDocument<T>[]; nextAfterKey: string | null; namespaceRevision: number }>(
        "storage.list", { collection, ...options }),
    commit: (batch: StorageBatch) =>
      session.request<{ namespaceRevision: number }>("storage.commit", {
        checks: batch.checks ?? [], puts: batch.puts ?? [], deletes: batch.deletes ?? [],
      }),
    onChanged(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
