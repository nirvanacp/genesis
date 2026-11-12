import {
  matchesGuard,
  validateGuards,
  validateReadSpec,
  type ActionResult,
  type ContextBound,
  type ContextNavigated,
  type ElementState,
  type ErrorBody,
  type ErrorCode,
  type Evidence,
  type InputOptions,
  type InspectResult,
  type Locator,
  type NavigateMode,
  type PageEmitEvent,
  type PageInfo,
  type PageOp,
  type PageStep,
  type ReadSpec,
  type ScrollPosition,
  type ScrollTo,
  type UrlGuard,
  type ViewId,
} from "@genesis/core";
import { GenesisError } from "../bridge.js";
import type { Session } from "./session.js";
import { createWatchStore, type WatchStore, type WatchValue } from "./watch.js";

/** What the UI knows about one context. */
export interface ContextState {
  id: string;
  /** The URL of the last committed navigation, or the start URL. */
  url: string;
  /** The generation of the last bound document; every call goes to it. 0 before the first. */
  generation: number;
  /** The latest page the agent reported in a watch, or null. */
  view: ViewId | null;
  /** A page agent in the current document accepts calls. */
  bound: boolean;
  /** A navigation started and has not committed yet. */
  loading: boolean;
  /** Position in the context's back-forward list. */
  index: number;
  canGoBack: boolean;
  canGoForward: boolean;
  /** Why the context's document is gone, until the next one binds. */
  error: ErrorBody | null;
}

/** How an input's destination is judged when it leaves the page. */
export interface Expect {
  /** The destination must match one of these. Any URL does when absent. */
  url?: UrlGuard[];
  /** A destination matching one of these means the website refused: `failed` with `REJECTED`. */
  notUrl?: UrlGuard[];
  /** Read on the destination; it must be truthy. */
  read?: ReadSpec;
}

export interface CallOptions {
  /** How long the call may take, capped by the host. */
  timeoutMs?: number;
}

export interface InputCallOptions extends InputOptions {
  /** Judges the destination when the input leaves the page. Without it, a navigation answers `unknown`. */
  expect?: Expect;
  /** The input is meant to navigate even though it is not `submit`. */
  navigates?: boolean;
}

/** An input that has not settled yet, for optimistic display. */
export interface PendingInput {
  op: PageOp;
  args: Readonly<Record<string, unknown>>;
}

export interface WatchOptions {
  /** The watch reads only while the URL matches one of these. */
  when?: UrlGuard[];
}

/** One open watch: its value follows the page, and survives navigations as described in `watch.ts`. */
export interface Watch<V = unknown, R = unknown> {
  readonly id: string;
  get(): WatchValue<V, R>;
  subscribe(listener: () => void): () => void;
  /** Asks the page for a fresh snapshot. */
  resync(): void;
  /** Closes this handle; the watch closes when every handle that opened it is closed. */
  close(): void;
}

/** One context of the applet: its state, its navigation, and the page agent in its current document. */
export interface ContextHandle {
  readonly id: string;
  readonly state: ContextState;
  subscribe(listener: () => void): () => void;
  /** The last committed navigation, or null before the first. */
  readonly navigation: ContextNavigated | null;
  /** Runs after each committed navigation, once `state` reflects it. */
  onNavigated(listener: (navigation: ContextNavigated) => void): () => void;

  navigate(url: string, options?: { mode?: NavigateMode }): Promise<void>;
  back(steps?: number): Promise<void>;
  forward(): Promise<void>;
  reload(): Promise<void>;

  /** One operation of the page agent, as is: rejects with the host's error. */
  call<T = unknown>(op: PageOp, args?: Record<string, unknown>, options?: CallOptions): Promise<T>;

  info(options?: CallOptions): Promise<PageInfo>;
  read<T = unknown>(spec: ReadSpec, options?: CallOptions): Promise<T>;
  inspect(target: Locator, options?: CallOptions): Promise<InspectResult>;
  /** Waits for an element state, a URL or a truthy read. Rejects with `DEADLINE`. */
  wait(condition: { target: Locator; state: ElementState } | { url: UrlGuard } | { read: ReadSpec }, timeoutMs: number): Promise<void>;
  scroll(to: ScrollTo, options?: { target?: Locator } & CallOptions): Promise<ScrollPosition>;

  click(target: Locator, options?: InputCallOptions & { gesture?: "click" | "tap" | "mouse"; count?: 1 | 2 }): Promise<ActionResult>;
  longPress(target: Locator, options?: InputCallOptions & { ms?: number }): Promise<ActionResult>;
  hover(target: Locator, options?: InputCallOptions): Promise<ActionResult>;
  unhover(options?: InputCallOptions): Promise<ActionResult>;
  focus(target: Locator, options?: InputCallOptions): Promise<ActionResult>;
  blur(target: Locator, options?: InputCallOptions): Promise<ActionResult>;
  fill(target: Locator, value: string, options?: InputCallOptions): Promise<ActionResult>;
  type(target: Locator, text: string, options?: InputCallOptions): Promise<ActionResult>;
  press(key: string, options?: InputCallOptions & { target?: Locator; modifiers?: string[] }): Promise<ActionResult>;
  select(target: Locator, choice: { values?: string[]; labels?: string[] }, options?: InputCallOptions): Promise<ActionResult>;
  check(target: Locator, checked: boolean, options?: InputCallOptions): Promise<ActionResult>;
  submit(target: Locator, options?: Omit<InputCallOptions, "navigates">): Promise<ActionResult>;
  /** Steps in order inside the page; `navigate` and `submit` may only be last. */
  run(steps: PageStep[], options?: { until?: Evidence; navigates?: boolean; expect?: Expect; deadlineMs?: number; timeoutMs?: number }): Promise<ActionResult>;
  /** A page module command. A command that returns a value answers `observed` with `value`. */
  invoke<T = unknown>(command: string, args?: unknown, options?: { target?: Locator; expect?: Expect; navigates?: boolean; timeoutMs?: number }): Promise<ActionResult & { value?: T }>;

  /** Inputs that have not settled, in call order; with `target`, only those whose target equals it. Stable until it changes. */
  pending(target?: Locator): readonly PendingInput[];
  subscribePending(listener: () => void): () => void;
  /** Cancels the inputs that have not reached the page yet. */
  cancel(): void;

  /** Opens a watch. The same `id` with an equal specification returns the same watch; another specification throws `CONFLICT`. */
  watch<V = unknown, R = unknown>(id: string, spec: ReadSpec, options?: WatchOptions): Watch<V, R>;
}

/** The handle and the event entry points the session calls. */
export interface ContextControl {
  handle: ContextHandle;
  bound(data: ContextBound): void;
  navigated(data: ContextNavigated): void;
  started(url: string): void;
  gone(data: { code?: string; message?: string }): void;
  emit(data: PageEmitEvent): void;
  resumed(): void;
  retired(): void;
}

/** Answers that mean "try again on the next document". */
const RETRY = new Set(["CONTEXT_REPLACED", "NOT_READY"]);
/** The shortest time between two resyncs of one watch. */
const RESYNC_GAP_MS = 1000;

interface InputRecord {
  key: string;
  op: PageOp;
  args: Record<string, unknown>;
  target: string | null;
  promise: Promise<ActionResult>;
  resolve(result: ActionResult): void;
  /** Set while the client judges the destination; an app navigation settles it as unknown. */
  judging: boolean;
  /** Ends the wait for the destination. */
  abort: (() => void) | null;
}

interface WatchEntry {
  id: string;
  specJson: string;
  spec: ReadSpec;
  when?: UrlGuard[];
  store: WatchStore;
  handle: Watch;
  refs: number;
  /** The generation the watch is open in, or null. */
  openIn: number | null;
  lastResync: number;
}

export function createContext(id: string, startUrl: string, session: Session): ContextControl {
  const { limits } = session.bound;
  let state: ContextState = {
    id, url: startUrl, generation: 0, view: null, bound: false, loading: false,
    index: 0, canGoBack: false, canGoForward: false, error: null,
  };
  /** Counts `context.bound` events, so a retry can wait for the next one. */
  let boundCount = 0;
  /** The generation of the latest committed document, bound or not. */
  let latest = 0;
  const listeners = new Set<() => void>();
  let lastNavigation: ContextNavigated | null = null;
  const navigationListeners = new Set<(navigation: ContextNavigated) => void>();

  function set(patch: Partial<ContextState>) {
    const next = { ...state, ...patch };
    if ((Object.keys(patch) as (keyof ContextState)[]).every(key => next[key] === state[key])) return;
    state = next;
    for (const listener of [...listeners]) listener();
  }

  /** Resolves true once `condition` holds, false after `ms` or on `abort`. */
  function until(condition: () => boolean, ms: number, onAbort?: (abort: () => void) => void): Promise<boolean> {
    if (condition()) return Promise.resolve(true);
    return new Promise(resolve => {
      let done = false;
      const finish = (value: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        off();
        resolve(value);
      };
      const timer = setTimeout(() => finish(false), Math.max(0, ms));
      const off = subscribe(() => { if (condition()) finish(true); });
      onAbort?.(() => finish(false));
    });
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  // ---- Calls ------------------------------------------------------------------------------------

  /** The host's own budget for a page call. */
  const budget = (timeoutMs?: number) => Math.min(timeoutMs ?? limits.rpcDeadlineMs, limits.actionTimeoutMs);

  function send<T>(op: PageOp, args: Record<string, unknown>, timeoutMs?: number): Promise<T> {
    const ms = budget(timeoutMs);
    const params = { context: id, generation: state.generation, op, args, timeoutMs: ms };
    return session.request<T>("page.call", params, { timeoutMs: ms });
  }

  /** A call that is safe to repeat: on `CONTEXT_REPLACED` or `NOT_READY` it goes again to the next bound document, until its time is up. */
  async function repeating<T>(op: PageOp, args: Record<string, unknown>, timeoutMs?: number): Promise<T> {
    const deadline = Date.now() + budget(timeoutMs);
    for (;;) {
      const seen = boundCount;
      if (!state.bound && !(await until(() => state.bound, deadline - Date.now()))) {
        throw new GenesisError("NOT_READY", "The page did not load in time");
      }
      try {
        return await send<T>(op, args, Math.max(1, deadline - Date.now()));
      } catch (error) {
        if (!(error instanceof GenesisError) || !RETRY.has(error.code)) throw error;
        if (!(await until(() => boundCount > seen && state.bound, deadline - Date.now()))) throw error;
      }
    }
  }

  // ---- Inputs -----------------------------------------------------------------------------------

  const inputs = new Map<string, InputRecord>();
  const pendingListeners = new Set<() => void>();
  let pendingCache = new Map<string, readonly PendingInput[]>();

  function pendingChanged() {
    pendingCache = new Map();
    for (const listener of [...pendingListeners]) listener();
  }

  function pending(target?: Locator): readonly PendingInput[] {
    const key = target === undefined ? "" : JSON.stringify(target);
    const old = pendingCache.get(key);
    if (old) return old;
    const list: PendingInput[] = [];
    for (const record of inputs.values()) {
      if (target === undefined || record.target === key) list.push({ op: record.op, args: record.args });
    }
    const result = Object.freeze(list);
    pendingCache.set(key, result);
    return result;
  }

  function settle(record: InputRecord, result: ActionResult) {
    if (inputs.get(record.key) !== record) return;
    inputs.delete(record.key);
    record.resolve(result);
    pendingChanged();
  }

  /** The context is leaving its page for another reason: inputs judging a destination can no longer be judged. */
  function leftBy() {
    for (const record of [...inputs.values()]) {
      if (record.judging) {
        record.abort?.();
        settle(record, { outcome: "unknown", message: "The page changed before the input finished" });
      }
    }
  }

  /**
   * Runs an input operation. Identical pending calls share one promise; the promise never
   * rejects. A call that leaves the page is judged by its destination.
   */
  function input(op: PageOp, args: Record<string, unknown>, options: { expect?: Expect; navigates?: boolean; timeoutMs?: number } = {}): Promise<ActionResult> {
    const { expect, navigates, timeoutMs } = options;
    const key = JSON.stringify([op, args, expect ?? null, navigates ?? false]);
    const existing = inputs.get(key);
    if (existing) return existing.promise;
    if (!state.bound) return Promise.resolve({ outcome: "failed", code: "NOT_READY", message: "The page is not ready" });
    try {
      if (expect?.url) validateGuards(expect.url, "expect.url");
      if (expect?.notUrl) validateGuards(expect.notUrl, "expect.notUrl");
      if (expect?.read) validateReadSpec(expect.read, "expect.read");
    } catch (error) {
      return Promise.resolve({ outcome: "failed", code: "INVALID_ARGUMENT", message: messageOf(error) });
    }

    let resolve!: (result: ActionResult) => void;
    const promise = new Promise<ActionResult>(done => { resolve = done; });
    const target = args.target === undefined ? null : JSON.stringify(args.target);
    const record: InputRecord = { key, op, args, target, promise, resolve, judging: false, abort: null };
    inputs.set(key, record);
    pendingChanged();

    const from = { generation: latest, url: state.url };
    const leaves = navigates === true || expect !== undefined || op === "submit" || leavesBySteps(op, args);
    const judge = () => {
      record.judging = true;
      void judgeDestination(record, from, expect).then(result => settle(record, result));
    };
    send<unknown>(op, args, timeoutMs).then(
      value => {
        const result = asResult(op, value);
        if (result.outcome === "unknown" && !result.code && leaves) judge();
        else settle(record, result);
      },
      error => {
        const code: ErrorCode | undefined = error instanceof GenesisError ? error.code as ErrorCode : undefined;
        const message = error instanceof Error ? error.message : "The input failed";
        const details = error instanceof GenesisError ? error.details : undefined;
        if (details?.navigating) judge();
        else if (details?.dispatched || code === "RETIRED") settle(record, { outcome: "unknown", code, message });
        else settle(record, { outcome: "failed", code, message, ...(details?.reason ? { reason: details.reason } : {}) });
      },
    );
    return promise;
  }

  /**
   * Waits for the input's destination: a newer bound document, or a new URL in the same one.
   * Without `expect` the outcome stays unknown; a destination matching `notUrl` is `REJECTED`;
   * one matching `url` (any, when absent) whose `read` is truthy is `observed`.
   */
  async function judgeDestination(record: InputRecord, from: { generation: number; url: string }, expect?: Expect): Promise<ActionResult> {
    const arrived = await until(
      () => (state.bound && state.generation > from.generation) || (latest === from.generation && state.url !== from.url),
      limits.actionTimeoutMs,
      abort => { record.abort = abort; },
    );
    if (!arrived) return { outcome: "unknown", code: "DEADLINE", message: "The destination did not load in time" };
    if (!expect) return { outcome: "unknown", message: "The input led to another page" };
    const url = state.url;
    if (expect.notUrl && matchesGuard(url, expect.notUrl)) return { outcome: "failed", code: "REJECTED", message: "The website did not accept the input" };
    if (expect.url && !matchesGuard(url, expect.url)) return { outcome: "unknown", message: "The input led to another page" };
    if (expect.read) {
      try {
        const value = await repeating<unknown>("read", { spec: expect.read });
        if (!truthy(value)) return { outcome: "unknown", message: "The destination does not show the effect" };
      } catch {
        return { outcome: "unknown", message: "The destination could not be read" };
      }
    }
    return { outcome: "observed" };
  }

  const inputArgs = (target: Locator | undefined, extra: Record<string, unknown>, options: InputCallOptions = {}) => {
    const { expect, navigates, ...rest } = options;
    const args: Record<string, unknown> = { ...rest, ...extra };
    if (target !== undefined) args.target = target;
    return { args, expect, navigates };
  };
  const run = (op: PageOp, target: Locator | undefined, extra: Record<string, unknown>, options?: InputCallOptions) => {
    const { args, ...rest } = inputArgs(target, extra, options);
    return input(op, args, rest);
  };

  // ---- Watches ----------------------------------------------------------------------------------

  const watches = new Map<string, WatchEntry>();

  function openWatch(entry: WatchEntry) {
    if (!state.bound || entry.refs === 0) return;
    const generation = state.generation;
    if (entry.openIn === generation) return;
    entry.openIn = generation;
    entry.store.restart();
    const args: Record<string, unknown> = { id: entry.id, spec: entry.spec };
    if (entry.when) args.when = entry.when;
    send("watch.open", args).catch(error => {
      if (entry.openIn === generation) entry.openIn = null;
      if (error instanceof GenesisError && (RETRY.has(error.code) || error.code === "RETIRED")) return;
      entry.store.failed({ code: (error?.code ?? "NOT_READY") as ErrorCode, message: messageOf(error) });
    });
  }

  function resyncWatch(entry: WatchEntry, force = false) {
    const now = Date.now();
    if (!force && now - entry.lastResync < RESYNC_GAP_MS) return;
    entry.lastResync = now;
    if (entry.openIn !== state.generation || !state.bound) return openWatch(entry);
    send("watch.resync", { id: entry.id }).catch(() => {});
  }

  function watch(watchId: string, spec: ReadSpec, options: WatchOptions = {}): Watch {
    validateReadSpec(spec, "spec");
    if (options.when) validateGuards(options.when, "when");
    const specJson = JSON.stringify([spec, options.when ?? null]);
    const existing = watches.get(watchId);
    if (existing) {
      if (existing.specJson !== specJson) throw new GenesisError("CONFLICT", `The watch ${watchId} is open with another specification`);
      existing.refs++;
      return existing.handle;
    }
    const store = createWatchStore({ historyEntriesMax: limits.historyEntriesMax });
    const entry: WatchEntry = {
      id: watchId, specJson, spec, when: options.when, store, refs: 1, openIn: null, lastResync: 0,
      handle: {
        id: watchId,
        get: store.get,
        subscribe: store.subscribe,
        resync: () => resyncWatch(entry, true),
        close() {
          if (entry.refs === 0 || --entry.refs > 0) return;
          watches.delete(watchId);
          if (entry.openIn !== null && entry.openIn === state.generation && state.bound) send("watch.close", { id: watchId }).catch(() => {});
          entry.openIn = null;
        },
      },
    };
    watches.set(watchId, entry);
    openWatch(entry);
    return entry.handle;
  }

  // ---- Handle -----------------------------------------------------------------------------------

  const fail = (method: string) => (error: unknown) => {
    if (!(error instanceof GenesisError && error.code === "RETIRED")) console.error(`Genesis ${method} failed`, error);
  };
  const navigation = (method: "context.navigate" | "context.back" | "context.forward" | "context.reload", params: Record<string, unknown>) => {
    leftBy();
    return session.request(method, { id, ...params }).then(() => {}, fail(method));
  };

  const handle: ContextHandle = {
    id,
    get state() { return state; },
    subscribe,
    get navigation() { return lastNavigation; },
    onNavigated(listener) {
      navigationListeners.add(listener);
      return () => { navigationListeners.delete(listener); };
    },
    navigate(url, options = {}) {
      const absolute = new URL(url, state.url).href;
      return navigation("context.navigate", { url: absolute, mode: options.mode ?? "push" });
    },
    back: steps => navigation("context.back", steps === undefined ? {} : { steps }),
    forward: () => navigation("context.forward", {}),
    reload: () => navigation("context.reload", {}),

    call: (op, args = {}, options = {}) => send(op, args, options.timeoutMs),

    info: (options = {}) => repeating("info", {}, options.timeoutMs),
    read: (spec, options = {}) => repeating("read", { spec }, options.timeoutMs),
    inspect: (target, options = {}) => repeating("inspect", { target }, options.timeoutMs),
    wait: async (condition, timeoutMs) => {
      await repeating("wait", { for: condition, timeoutMs }, timeoutMs);
    },
    scroll: (to, options = {}) => {
      const args: Record<string, unknown> = { to };
      if (options.target !== undefined) args.target = options.target;
      return send("scroll", args, options.timeoutMs);
    },

    click: (target, options = {}) => {
      const { gesture, count, ...rest } = options;
      return run("click", target, defined({ gesture, count }), rest);
    },
    longPress: (target, options = {}) => {
      const { ms, ...rest } = options;
      return run("longPress", target, defined({ ms }), rest);
    },
    hover: (target, options) => run("hover", target, {}, options),
    unhover: options => run("unhover", undefined, {}, options),
    focus: (target, options) => run("focus", target, {}, options),
    blur: (target, options) => run("blur", target, {}, options),
    fill: (target, value, options) => run("fill", target, { value }, options),
    type: (target, text, options) => run("type", target, { text }, options),
    press: (key, options = {}) => {
      const { target, modifiers, ...rest } = options;
      return run("press", target, defined({ key, modifiers }), rest);
    },
    select: (target, choice, options) => run("select", target, defined({ values: choice.values, labels: choice.labels }), options),
    check: (target, checked, options) => run("check", target, { checked }, options),
    submit: (target, options) => run("submit", target, {}, options),
    run: (steps, options = {}) => {
      const { expect, navigates, timeoutMs, until: evidence, deadlineMs } = options;
      return input("run", defined({ steps, until: evidence, navigates, deadlineMs }), { expect, navigates, timeoutMs });
    },
    invoke: (command, args, options = {}) => {
      const { target, expect, navigates, timeoutMs } = options;
      return input("invoke", defined({ command, args, target }), { expect, navigates, timeoutMs }) as Promise<ActionResult & { value?: never }>;
    },

    pending,
    subscribePending(listener) {
      pendingListeners.add(listener);
      return () => { pendingListeners.delete(listener); };
    },
    cancel() {
      session.request("page.cancel", { context: id }).catch(fail("page.cancel"));
    },

    watch: watch as ContextHandle["watch"],
  };

  return {
    handle,
    bound(data) {
      if (data.generation < latest) return;
      latest = data.generation;
      boundCount++;
      set({ generation: data.generation, url: data.url, bound: true, loading: false, error: null });
      for (const entry of watches.values()) openWatch(entry);
    },
    navigated(data) {
      if (data.generation < latest) return;
      // A new document: calls wait for its `context.bound`, which brings its generation.
      const newer = data.generation > latest;
      latest = data.generation;
      if (newer) for (const entry of watches.values()) entry.openIn = null;
      for (const entry of watches.values()) entry.store.navigated(data);
      set({
        url: data.url, index: data.index, canGoBack: data.canGoBack, canGoForward: data.canGoForward, loading: false,
        ...(newer ? { bound: false, view: null } : {}),
      });
      lastNavigation = data;
      for (const listener of [...navigationListeners]) listener(data);
    },
    started() {
      set({ loading: true });
    },
    gone(data) {
      const error: ErrorBody = { code: (data.code ?? "NOT_READY") as ErrorCode, message: data.message ?? "The page is gone" };
      leftBy();
      for (const entry of watches.values()) {
        entry.openIn = null;
        entry.store.gone(error);
      }
      set({ bound: false, loading: false, error });
    },
    emit(data) {
      if (data.generation !== state.generation) return;
      if (!state.view || state.view.n !== data.view.n || state.view.url !== data.view.url || state.view.generation !== data.view.generation) set({ view: data.view });
      const entry = watches.get(data.stream);
      if (!entry || entry.openIn !== data.generation) return;
      if (entry.store.emit(data) === "resync") resyncWatch(entry);
    },
    resumed() {
      if (state.bound && watches.size > 0) send("watch.resync", {}).catch(() => {});
    },
    retired() {
      for (const record of [...inputs.values()]) {
        record.abort?.();
        settle(record, { outcome: "unknown", code: "RETIRED", message: "This page was closed" });
      }
    },
  };
}

/** The value of an input call as an outcome; a command's own value answers `observed` with `value`. */
function asResult(op: PageOp, value: unknown): ActionResult & { value?: unknown } {
  if (isObject(value) && typeof value.outcome === "string") return value as unknown as ActionResult;
  if (op === "invoke") return { outcome: "observed", value };
  return { outcome: "observed" };
}

/** True when `run` steps end in a navigation. */
function leavesBySteps(op: PageOp, args: Record<string, unknown>) {
  if (op !== "run" || !Array.isArray(args.steps)) return false;
  const last = args.steps.at(-1) as { op?: string } | undefined;
  return last?.op === "navigate" || last?.op === "submit";
}

/** A read's value is truthy when it is truthy; a list, when it has records. */
function truthy(value: unknown) {
  if (isObject(value) && Array.isArray(value.order)) return value.order.length > 0;
  return Boolean(value);
}

function defined(value: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) if (item !== undefined) out[key] = item;
  return out;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
