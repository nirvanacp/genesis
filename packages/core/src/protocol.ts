import type { Compat } from "./compat.js";
import type { ErrorCode } from "./errors.js";
import type { Manifest } from "./manifest.js";

/**
 * Messages between a document (the foreground or a context page) and the host, version
 * `COMPAT.protocol`. The host checks envelopes, sizes and generations; it parses no page data.
 */

export type Role = "foreground" | "context";

/** Limits the host enforces and sends in `bound`. The Rust `Limits` struct has the same fields. */
export interface Limits {
  rpcDeadlineMs: number;
  messageMaxBytes: number;
  pageMaxBytes: number;
  patchMaxBytes: number;
  patchRecordsMax: number;
  storedDocumentMaxBytes: number;
  pendingRequestsMax: number;
  documentReadyMs: number;
  navigationJoinMs: number;
  publishQuietMs: number;
  publishMaxDelayMs: number;
  actionTimeoutMs: number;
  backAnswerMs: number;
  historyEntriesMax: number;
}

/** The first message a document sends. */
export interface Hello {
  type: "hello";
  protocol: number;
  url: string;
}

/** The host's answer to `hello`. Neither runtime receives a route; both match routes themselves. */
export interface Bound {
  type: "bound";
  protocol: number;
  compat: Compat;
  documentId: string;
  appletId: string;
  revision: number;
  /** The context this document runs in; null for the foreground. */
  contextId: string | null;
  role: Role;
  /** Increments each time a new document binds in the context; 0 for the foreground. */
  generation: number;
  manifest: Manifest;
  limits: Limits;
  /** The foreground's last `session.save`, or null. Always null for a context document. */
  session: SavedSession | null;
}

export interface SavedSession {
  /** `COMPAT.sessionState` when it was saved. */
  version: number;
  state: unknown;
}

export interface Request {
  type: "request";
  documentId: string;
  requestId: number;
  method: Method;
  params: unknown;
}

export interface Response {
  type: "response";
  documentId: string;
  requestId: number;
  result?: unknown;
  error?: { code: ErrorCode; message: string };
}

/** The host's answer to a `hello` in another protocol version. No `bound` follows. */
export interface Refused {
  type: "refused";
  error: { code: ErrorCode; message: string };
}

export interface Event {
  type: "event";
  documentId: string;
  name: EventName;
  data: unknown;
}

export type ForegroundMethod =
  | "ui.ready"
  | "storage.get" | "storage.list" | "storage.commit"
  | "services.request"
  | "context.navigate" | "context.back" | "context.forward" | "context.reload"
  | "context.reveal" | "context.cover" | "context.resync"
  | "context.act" | "context.cancel" | "context.ping"
  | "session.save"
  | "back.handled" | "back.leave";
export type ContextMethod = "context.publish" | "context.actionResult";
export type Method = ForegroundMethod | ContextMethod;

export type ForegroundEventName =
  | "resumed" | "suspended" | "storage.changed"
  | "page" | "patch" | "action.update"
  | "context.navigated" | "context.started" | "context.gone"
  | "user.viewWebsite" | "user.done"
  | "back" | "retired";
export type ContextEventName = "resync" | "act" | "cancel" | "ping" | "retired";
export type EventName = ForegroundEventName | ContextEventName;

/** `push` adds a history entry; `replace` replaces the current one. */
export type NavigateMode = "push" | "replace";

/** Data of the foreground event `context.navigated`, sent for every committed navigation. */
export interface ContextNavigated {
  id: string;
  url: string;
  generation: number;
  /** Position in the context's back-forward list, and its length. */
  index: number;
  size: number;
  /** `index > 0` and `index < size - 1`. */
  canGoBack: boolean;
  canGoForward: boolean;
  sameDocument: boolean;
  reload: boolean;
}

/**
 * A logical page inside a document. `n` increments at each same-document navigation that
 * changes `entryKey(url)`; records belong to one view.
 */
export interface ViewId {
  generation: number;
  n: number;
  url: string;
}

export type PageStatus = "loading" | "ready" | "error" | "auth" | "unsupported";
export type RegionStatus = "ready" | "error";

/** One item a region read: JSON only, no nodes, callbacks or HTML. */
export interface PageRecord {
  key: string;
  /** Identity across views and contexts; defaults to `key`. */
  entity?: string;
  /** Defaults to the region name. */
  entityType?: string;
  data: unknown;
}

export type Region =
  | {
    kind: "collection";
    status: RegionStatus;
    error?: { code: ErrorCode; message: string };
    /** In page order. */
    items: PageRecord[];
    /** False while the page offers more items. */
    complete: boolean;
    /** Keys repeated in one read, so keys are positions and record actions are unavailable. */
    ephemeral?: boolean;
  }
  | {
    kind: "single";
    status: RegionStatus;
    error?: { code: ErrorCode; message: string };
    record: PageRecord | null;
  };

/** A full description of a view, published on every view change, readiness change and resync. */
export interface Page {
  view: ViewId;
  /** Increments with every full page; patches name the epoch they extend. */
  epoch: number;
  pageId: string | null;
  routeId: string | null;
  params: Record<string, string>;
  status: PageStatus;
  error?: { code: ErrorCode; message: string };
  account: string | null;
  /** Where the coordinator sends an `auth` page, resolved by the adapter for this URL. */
  signInUrl?: string | null;
  regions: Record<string, Region>;
}

export type RegionPatch =
  | {
    kind: "collection";
    upsert?: PageRecord[];
    remove?: string[];
    /** The full key order, present when membership or order changed. */
    order?: string[];
    complete?: boolean;
    status?: RegionStatus;
    error?: { code: ErrorCode; message: string } | null;
  }
  | {
    kind: "single";
    record: PageRecord | null;
    status?: RegionStatus;
    error?: { code: ErrorCode; message: string } | null;
  }
  /** Sent instead of a delta that would exceed `patchMaxBytes`. */
  | { kind: "replace"; region: Region };

/**
 * The changes of one DOM batch, applied atomically. It applies only on the state it was made
 * from: the same view and epoch, and `base` equal to the last applied `seq` (0 after a page).
 */
export interface Patch {
  view: ViewId;
  epoch: number;
  base: number;
  seq: number;
  account?: string | null;
  regions: Record<string, RegionPatch>;
}

/** One driver step. Selectors are CSS selectors; `waitForUrl` is a regular expression tested against `location.href`. */
export type Step =
  | { click: string }
  | { fill: string; value: string }
  | { submit: string }
  | { navigate: string }
  | { waitFor: string; timeoutMs: number }
  | { waitForUrl: string; timeoutMs: number }
  | { scroll: { target: string | "window"; to: "end" | number } };

/**
 * What an action function returns for the current page. `D` is the document type, which this
 * package does not know.
 */
export type ActionSpec<D = unknown> =
  | { satisfied: true }
  | {
    steps: Step[];
    /** Evidence that the action took effect in place. */
    until?: string | ((doc: D) => boolean);
    /** Implied by a final `navigate` or `submit` step. */
    navigates?: boolean;
    /** For navigating actions: the destination pages that count as success or rejection. */
    expect?: { page?: string | string[]; notPage?: string | string[] };
    deadlineMs?: number;
  };

/** Data of the context event `act`: the action to run on a record, or on the page when `region` is null. */
export interface ActionRequest {
  actionId: number;
  region: string | null;
  key: string | null;
  name: string;
  args: unknown;
}

export type ActionOutcome = "observed" | "failed" | "cancelled" | "unknown";

export interface ActionResult {
  outcome: ActionOutcome;
  code?: ErrorCode;
  message?: string;
  completedSteps?: number;
  partial?: boolean;
  /** The desired state already held. */
  noop?: boolean;
  /** A load-more action found the end of the collection. */
  exhausted?: boolean;
}

/** Params of `context.actionResult`, forwarded to the foreground as `action.update`. */
export interface ActionUpdate {
  actionId: number;
  state: "dispatched" | "observed" | "failed" | "cancelled";
  /** On `dispatched`: the action is leaving the document, so the foreground observes the outcome. */
  navigating?: boolean;
  result?: ActionResult;
}
