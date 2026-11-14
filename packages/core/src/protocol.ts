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
  /** The shell can send real input to a hidden context (`page.input`). Absent in an older Genesis. */
  trustedInput?: boolean;
  /**
   * The foreground can pick files, save, share, open links in apps and turn on notifications
   * after a tap, and attach picked files to a page (`attachFiles`). Absent in an older Genesis.
   */
  userActions?: boolean;
  /** The foreground can let a hidden page use one website feature once (`context.grant`). Absent in an older Genesis. */
  grants?: boolean;
  /** Input page calls one context takes at once before `RATE_LIMITED`. Absent in an older Genesis, which has no limit. */
  inputBurst?: number;
  /** Milliseconds for one input call of the burst to come back. */
  inputRefillMs?: number;
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
  | "notifications.post"
  | "context.navigate" | "context.back" | "context.forward" | "context.reload"
  | "context.reveal" | "context.cover"
  | "session.save"
  | "back.handled" | "back.leave"
  | "page.call" | "page.cancel"
  | "context.grant"
  | "files.pick" | "files.release" | "downloads.save" | "share.open" | "links.openExternal" | "notifications.enable";
export type ContextMethod = "page.result" | "page.progress" | "page.emit" | "page.input" | "page.files" | "page.share";
export type Method = ForegroundMethod | ContextMethod;

export type ForegroundEventName =
  | "resumed" | "suspended" | "storage.changed"
  | "context.navigated" | "context.started" | "context.gone"
  | "user.viewWebsite" | "user.showContext" | "user.done"
  | "back" | "retired"
  | "context.bound" | "page.emit" | "page.progress"
  | "context.grantEnded";
export type ContextEventName = "retired" | "call" | "cancel" | "reset";
export type EventName = ForegroundEventName | ContextEventName;

/**
 * Params of `notifications.post`. `id` is 1 to 64 of `[A-Za-z0-9._-]` and replaces an earlier
 * notification with the same id; `title` is at most 120 characters and `body` 500; `url` is
 * https on one of the applet's origins and opens in the applet when the user taps it.
 */
export interface NotificationInput {
  id: string;
  title: string;
  body?: string;
  url?: string;
}

/** `posted` is true when Genesis accepted it; the user decides in Applet info whether it shows. */
export interface NotificationResult {
  posted: boolean;
}

/** How long the shell has for a user action, which can wait on the user in a picker or a prompt. */
export const USER_ACTION_DEADLINE_MS = 600_000;
/** The most `accept` entries of `files.pick`. */
export const ACCEPT_MAX = 16;
/** The most files one `files.pick` returns and one `attachFiles` attaches. */
export const FILES_MAX = 16;
/** The largest picked file, in bytes. */
export const FILE_BYTES_MAX = 64 * 1024 * 1024;
/** The most bytes one `attachFiles` sends. */
export const FILES_BYTES_MAX = 128 * 1024 * 1024;
/** The longest `data:` URL `downloads.save` takes. */
export const SAVE_DATA_URL_MAX = 2 * 1024 * 1024;

/**
 * Params of `files.pick`. `accept` holds up to 16 MIME types (`image/*`) or `.ext` suffixes;
 * empty accepts any file.
 */
export interface FilesPick {
  accept?: string[];
  multiple?: boolean;
}

/** One picked file. `id` is 32 hex characters and stays valid until released, for at most 30 minutes. */
export interface FileHandle {
  id: string;
  name: string;
  type: string;
  size: number;
}

/** Result of `files.pick`: empty when the user cancelled. At most 16 files of 64 MiB each. */
export interface FilesPicked {
  files: FileHandle[];
}

/**
 * Params of `downloads.save`: `url` is https, or a `data:` URL up to 2 MiB, without credentials;
 * the https download carries the cookies of `context`. `filename` is 1 to 128 characters without `/`.
 */
export interface DownloadSave {
  context: string;
  url: string;
  filename?: string;
}

/** Params of `share.open`: at least one field; `title` up to 200 characters, `text` 4000, `url` http or https. */
export interface ShareInput {
  title?: string;
  text?: string;
  url?: string;
}

/** Params of `page.files`, sent by the page agent for an open call. Answers `{count}`. */
export interface PageFiles {
  callId: string;
  ids: string[];
}

/**
 * Params of `page.share`, the website's own `navigator.share` on a revealed context. `active` is
 * the page's `navigator.userActivation.isActive`. Answers `{shown: true}`.
 */
export interface PageShare extends ShareInput {
  active: boolean;
}

/** How long a one-time grant lasts unused, in milliseconds. */
export const GRANT_MS = 5_000;

/**
 * A website feature a hidden page may use once after the user's tap: `fullscreen` a video,
 * `download` a file, open a `window`, `handoff` a link to another app, or ask for `location`.
 */
export type GrantKind = "fullscreen" | "download" | "window" | "handoff" | "location";

/** Params of `context.grant`. */
export interface ContextGrant {
  id: string;
  grant: GrantKind;
}

/** Result of `context.grant`. `expiresInMs` is 0 for a revealed context, which needs no grant. */
export interface GrantResult {
  granted: true;
  expiresInMs: number;
}

/**
 * Data of the foreground event `context.grantEnded`: `used` when the page used the grant,
 * otherwise it expired or a navigation, reveal, cover or popup cleared it.
 */
export interface GrantEnded {
  id: string;
  grant: GrantKind;
  used: boolean;
}

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

/** How an input operation ended. */
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

/**
 * One real input event. `x` and `y` are CSS pixels of the visual viewport at scale 1: the
 * element's client position minus `visualViewport.offsetLeft`/`offsetTop`, times `visualViewport.scale`.
 */
export type InputEvent =
  | { type: "tap"; x: number; y: number }
  | { type: "hover"; x: number; y: number }
  | { type: "hoverExit" }
  | { type: "key"; key: string; modifiers?: string[] }
  | { type: "text"; text: string };

/**
 * Params of the context method `page.input`: real input for one of the document's open calls,
 * dispatched by the shell to the hidden context's WebView. The result is `{}` once the shell has
 * dispatched the events; `INPUT_UNAVAILABLE` when it could not.
 */
export interface PageInputParams {
  callId: string;
  events: InputEvent[];
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
  | "fill" | "type" | "press" | "select" | "check" | "scroll" | "submit" | "attachFiles"
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
  /**
   * Fidelity. `trusted` has the shell send real Android input to the hidden page: events are
   * trusted, CSS `:hover` applies, and a tap or key gives user activation. It is accepted by
   * `click` (a touch tap), `hover`, `unhover`, `type` and `press`, and answers `INPUT_UNAVAILABLE`
   * where the shell cannot inject real input or the context is revealed.
   */
  input?: "synthetic" | "trusted";
  until?: Evidence;
}

/**
 * One step of `run`: an input operation written as `{ op, ...args }`, a wait, or a navigation.
 * `navigate` and `submit` may only be the last step.
 */
export type Step =
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
  | ({ op: "attachFiles"; target: Locator; files: string[]; via?: AttachVia } & InputOptions)
  | { op: "scroll"; target?: Locator; to: ScrollTo }
  | { op: "submit"; target: Locator }
  | { op: "wait"; for: WaitFor; timeoutMs: number }
  | { op: "navigate"; url: string };

/**
 * How `attachFiles` hands picked files to the page: `input` sets a file input's files (default);
 * `drop` and `paste` dispatch those events with the files on the target.
 */
export type AttachVia = "input" | "drop" | "paste";

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
