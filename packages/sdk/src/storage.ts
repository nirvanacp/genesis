import type { Dispose, HostCall } from "./runtime";
export interface StoredDocument<T = unknown> { key: string; value: T; revision: number; updatedAtMs: number }
export interface StorageKey { collection: string; key: string }
export interface StorageCheck extends StorageKey { expectedRevision: number | null }
export interface StoragePut extends StorageKey { value: unknown }
export interface StorageBatch { checks: StorageCheck[]; puts: StoragePut[]; deletes: StorageKey[] }
export interface StorageChange { changes: StorageKey[]; namespaceRevision: number }
export interface AppletStorage {
  get<T = unknown>(collection: string, key: string): Promise<{ document: StoredDocument<T> | null; namespaceRevision: number }>;
  list<T = unknown>(collection: string, options: { afterKey?: string; limit: number }): Promise<{
    entries: StoredDocument<T>[]; nextAfterKey: string | null; namespaceRevision: number }>;
  commit(batch: StorageBatch): Promise<{ namespaceRevision: number }>;
  onChanged(callback: (change: StorageChange) => void): Dispose;
}
export function storageApi(call: HostCall, subscribe: AppletStorage["onChanged"]): AppletStorage {
  return {
    get: (collection, key) => call("storage.get", { collection, key }),
    list: (collection, options) => call("storage.list", { collection, ...options }),
    commit: batch => call("storage.commit", batch),
    onChanged: subscribe,
  };
}
