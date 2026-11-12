import type { Compat } from "./compat.js";
import type { ErrorCode } from "./errors.js";
import type { Locator } from "./locator.js";
import type { Manifest } from "./manifest.js";
import type { ReadSpec, UrlGuard } from "./readspec.js";

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
  /** Open watches per context document, enforced by the page agent. */
  watchesMax: number;
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
  error?: ErrorBody;
}

/** An error the host or a page agent reports. */
export interface ErrorBody {
  code: ErrorCode;
  message: string;
  /** On a failed page call: how far it got. */
  details?: CallDetails;
}

/** How far a page call got before it failed. */
export interface CallDetails {
  /** Input left the page agent. */
  dispatched?: boolean;
  /** The input started a navigation. */
  navigating?: boolean;
  completedSteps?: number;
  /** A short reason, such as `hidden`, `covered` or `cross-origin-frame`. */
  reason?: string;
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
  | "back.handled" | "back.leave"
  | "page.call" | "page.cancel";
export type ContextMethod = "context.publish" | "context.actionResult" | "page.result" | "page.progress" | "page.emit";
export type Method = ForegroundMethod | ContextMethod;

export type ForegroundEventName =
  | "resumed" | "suspended" | "storage.changed"
  | "page" | "patch" | "action.update"
  | "context.navigated" | "context.started" | "context.gone"
  | "user.viewWebsite" | "user.showContext" | "user.done"
  | "back" | "retired"
  | "context.bound" | "page.emit" | "page.progress";
export type ContextEventName = "resync" | "act" | "cancel" | "ping" | "retired" | "call" | "reset";
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
  /** The signed-in account, null when signed out, absent when the page does not show it. */
  account?: string | null;
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
/** Destination pages of a navigating action: `page` counts as success, `notPage` as rejection. */
export interface ActionExpect {
  page?: string | string[];
  notPage?: string | string[];
}

export type ActionSpec<D = unknown> =
  | { satisfied: true }
  | {
    steps: Step[];
    /** Evidence that the action took effect in place. */
    until?: string | ((doc: D) => boolean);
    /** Implied by a final `navigate` or `submit` step. */
    navigates?: boolean;
    /** For navigating actions: the destination pages that count as success or rejection. */
    expect?: ActionExpect;
    deadlineMs?: number;
  };

/** Data of the context event `act`: the action to run on a record, or on the page when `region` is null. */
export interface ActionRequest {
  actionId: number;
  region: string | null;
  key: string | null;
  name: string;
  args: unknown;
  /**
   * The view `n` whose records the foreground acted on. The document refuses the action with
   * `CONTEXT_REPLACED` when its view is another one, when it arrives or when it would run.
   */
  view?: number;
}

export type ActionOutcome = "observed" | "failed" | "cancelled" | "unknown";

export interface ActionResult {
  outcome: ActionOutcome;
  code?: ErrorCode;
  message?: string;
  completedSteps?: number;
  partial?: boolean;
  /** Why a target could not take input, such as `hidden`, `covered` or `editor-needs-trusted-input`. */
  reason?: string;
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
  /** On a navigating `dispatched`: the action's `expect`, which the foreground judges the destination by. */
  expect?: ActionExpect;
  result?: ActionResult;
}

// ---------------------------------------------------------------------------------------------
// Page control: the foreground asks a context's page agent to run operations (`page.call`), and
// the agent streams watches back (`page.emit`). The host relays both and reads neither.

/** Params of the foreground method `page.call`. The result is the operation's value. */
export interface PageCallParams {
  context: string;
  generation: number;
  op: PageOp;
  args: Record<string, unknown>;
  timeoutMs?: number;
}

/** Params of the foreground method `page.cancel`. Without `callId`, cancels every call of the asking document in the context. */
export interface PageCancelParams {
  context: string;
  callId?: string;
}

/** Data of the context event `call`. `deadlineMs` is the time the call has, in milliseconds. */
export interface PageCallEvent {
  callId: string;
  op: PageOp;
  args: Record<string, unknown>;
  deadlineMs: number;
}

/** Data of the context event `cancel`. */
export interface PageCancelEvent {
  callId?: string;
}

/** Params of the context method `page.progress`. Forwarded to the foreground with `context` added. */
export interface PageProgressParams {
  callId: string;
  state: "dispatched" | "navigating";
  completedSteps?: number;
}

/** Data of the foreground event `page.progress`. */
export interface PageProgressEvent extends PageProgressParams {
  context: string;
}

/** Params of the context method `page.result`: the answer to one call. */
export interface PageResultParams {
  callId: string;
  ok: boolean;
  value?: unknown;
  error?: ErrorBody;
}

export type EmitKind = "snapshot" | "patch" | "status";

/** Params of the context method `page.emit`: one message of a watch stream. */
export interface PageEmitParams {
  stream: string;
  kind: EmitKind;
  /** Counts up per stream; a gap means a lost message. */
  seq: number;
  view: ViewId;
  url: string;
  data: unknown;
}

/** Data of the foreground event `page.emit`. */
export interface PageEmitEvent extends PageEmitParams {
  context: string;
  generation: number;
}

/** Data of the foreground event `context.bound`: a page agent in the context accepts calls. */
export interface ContextBound {
  id: string;
  generation: number;
  url: string;
}

/** The operations of the page agent. */
export type PageOp =
  | "info" | "read" | "inspect"
  | "watch.open" | "watch.close" | "watch.resync"
  | "click" | "longPress" | "hover" | "unhover" | "focus" | "blur"
  | "fill" | "type" | "press" | "select" | "check" | "scroll" | "submit"
  | "wait" | "run" | "invoke";

/** Evidence that an input took effect: an element state, or a read whose value must be truthy. */
export type Evidence =
  | { target: Locator; state: ElementState }
  | { read: ReadSpec };

export type ElementState = "attached" | "visible" | "hidden" | "detached";

/** Options every input operation takes. */
export interface InputOptions {
  /** How long to wait for the target to exist and be actionable (default 0). */
  timeoutMs?: number;
  /** Skips the actionability check. */
  force?: boolean;
  /** Fidelity: `trusted` answers `INPUT_UNAVAILABLE` where the shell cannot inject real input. */
  input?: "synthetic" | "trusted";
  until?: Evidence;
}

/**
 * One step of `run`: an input operation written as `{ op, ...args }`, a wait, or a navigation.
 * `navigate` and `submit` may only be the last step.
 */
export type PageStep =
  | ({ op: "click"; target: Locator; gesture?: "click" | "tap" | "mouse"; count?: 1 | 2 } & InputOptions)
  | ({ op: "longPress"; target: Locator; ms?: number } & InputOptions)
  | ({ op: "hover"; target: Locator } & InputOptions)
  | { op: "unhover" }
  | ({ op: "focus" | "blur"; target: Locator } & InputOptions)
  | ({ op: "fill"; target: Locator; value: string } & InputOptions)
  | ({ op: "type"; target: Locator; text: string } & InputOptions)
  | ({ op: "press"; key: string; modifiers?: string[]; target?: Locator } & InputOptions)
  | ({ op: "select"; target: Locator; values?: string[]; labels?: string[] } & InputOptions)
  | ({ op: "check"; target: Locator; checked: boolean } & InputOptions)
  | { op: "scroll"; target?: Locator; to: ScrollTo }
  | { op: "submit"; target: Locator }
  | { op: "wait"; for: WaitFor; timeoutMs: number }
  | { op: "navigate"; url: string };

export type ScrollTo = "start" | "end" | "intoView" | { x?: number; y?: number } | { by: { x?: number; y?: number } };

export type WaitFor = { target: Locator; state: ElementState } | { url: UrlGuard } | { read: ReadSpec };

/** The value of `scroll`. */
export interface ScrollPosition {
  x: number;
  y: number;
  maxX: number;
  maxY: number;
  atEnd: boolean;
}

/** The value of `info`. */
export interface PageInfo {
  url: string;
  title: string;
  readyState: string;
  view: ViewId;
  scroll: { x: number; y: number; maxX: number; maxY: number };
  viewport: { width: number; height: number };
}

/** The value of `inspect`. */
export interface InspectResult {
  count: number;
  first?: {
    tag: string;
    text: string;
    visible: boolean;
    enabled: boolean;
    checked?: boolean;
    focused: boolean;
    rect: { x: number; y: number; width: number; height: number };
  };
}

/** A list read: keys in page order and the records by key. */
export interface ListValue<R = unknown> {
  order: string[];
  records: Record<string, R>;
  truncated?: boolean;
}

/** Data of a watch `snapshot`. */
export interface WatchSnapshot {
  status: "ready" | "error";
  value?: unknown;
  order?: string[];
  records?: Record<string, unknown>;
  error?: ErrorBody;
  truncated?: boolean;
  /** A list whose reader names a "more" link: false while the page offers more items. */
  complete?: boolean;
}

/** Data of a list watch `patch`. */
export interface WatchPatch {
  upsert?: Record<string, unknown>;
  remove?: string[];
  order?: string[];
  complete?: boolean;
}

/** Data of a watch `status`. */
export interface WatchStatus {
  idle?: boolean;
  status?: "ready" | "error";
  error?: ErrorBody;
}
