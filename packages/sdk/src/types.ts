import type { ErrorCode, Screen } from "@genesis/core";
import { GenesisError } from "./bridge.js";

export { GenesisError };

export type SnapshotStatus = "loading" | "ready" | "auth" | "unsupported" | "error";

export interface ErrorInfo {
  code: string;
  message: string;
}

/** What a source document publishes about the page it shows. */
export interface Snapshot<T = unknown> {
  /** Null for snapshots the host writes itself, such as a page that did not load in time. */
  documentId: string | null;
  url: string;
  routeId: string | null;
  params: Record<string, string>;
  status: SnapshotStatus;
  data?: T;
  error?: ErrorInfo;
}

/** A snapshot as a screen sees it. `stale` marks cached data shown while the page reloads. */
export interface SourceView<T> {
  status: SnapshotStatus;
  data: T | null;
  stale: boolean;
  url: string | null;
  routeId: string | null;
  params: Record<string, string>;
  error: ErrorInfo | null;
}

export type NavigateMode = "push" | "replace" | "root";

export type NavigateTarget =
  | { kind: "screen"; id: string; params?: Record<string, string>; mode?: NavigateMode; source?: Screen["source"] }
  | { kind: "website"; url: string }
  | { kind: "route"; url: string; mode?: NavigateMode };

export interface StoredDocument<T = unknown> {
  key: string;
  value: T;
  revision: number;
  updatedAtMs: number;
}

export interface StorageKey {
  collection: string;
  key: string;
}

export interface StorageBatch {
  /** `expectedRevision: null` requires the document to be absent. */
  checks?: (StorageKey & { expectedRevision: number | null })[];
  puts?: (StorageKey & { value: unknown })[];
  deletes?: StorageKey[];
}

export interface StorageChange {
  changes: StorageKey[];
  namespaceRevision: number;
}

/** Document storage. The host implements it; an applet may implement it over its own backend. */
export interface Storage {
  get<T = unknown>(collection: string, key: string): Promise<{ document: StoredDocument<T> | null; namespaceRevision: number }>;
  list<T = unknown>(collection: string, options?: { afterKey?: string; limit?: number }): Promise<{
    entries: StoredDocument<T>[];
    nextAfterKey: string | null;
    namespaceRevision: number;
  }>;
  commit(batch: StorageBatch): Promise<{ namespaceRevision: number }>;
  onChanged(listener: (change: StorageChange) => void): () => void;
}

export interface ServiceResponse<T = unknown> {
  status: number;
  body: T;
}

/** A service request the shell could not complete. HTTP error statuses are responses, not errors. */
export class ServiceError extends GenesisError {
  constructor(code: ErrorCode, message: string) {
    super(code, message);
    this.name = "ServiceError";
  }
}

const UNAVAILABLE: string[] = [
  "CONFIGURATION_REQUIRED",
  "AUTHENTICATION_FAILED",
  "CERTIFICATE_FAILED",
  "SERVICE_UNREACHABLE",
  "DEADLINE",
  "SERVICE_FAILURE",
  "QUOTA_EXCEEDED",
];

/** A message for people: service failures read as temporary, other errors keep their message. */
export function serviceMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code && UNAVAILABLE.includes(code)) return "This feature is temporarily unavailable. Try again in a moment.";
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
