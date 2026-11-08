import type { ErrorCode, PageRecord, PageStatus } from "@genesis/core";
import { GenesisError } from "./bridge.js";

export { GenesisError };

export type { ActionResult } from "@genesis/core";

export interface ErrorInfo {
  code: string;
  message: string;
}

/** One record of a region as a screen sees it: the published record with its data typed. */
export interface Record<T = unknown> extends Omit<PageRecord, "data"> {
  data: T;
}

/** The page a screen shows, apart from its regions. `stale` marks records kept while the page reloads. */
export interface PageState {
  pageId: string | null;
  status: PageStatus;
  stale: boolean;
  generation: number | null;
  params: { [name: string]: string };
  error: ErrorInfo | null;
  account: string | null;
}

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
