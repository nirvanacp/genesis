import {
  COMPAT,
  entryKey,
  isErrorCode,
  matchRoute,
  presentation,
  reduce,
  restore,
  revealed,
  serialize,
  type ActionExpect,
  type ActionResult,
  type ActionUpdate,
  type ContextNavigated,
  type CoordinatorEffect,
  type CoordinatorEvent,
  type CoordinatorState,
  type Limits,
  type Manifest,
  type NavigateMode,
  type Page,
  type Patch,
  type Presentation,
  type Screen,
  type ViewId,
} from "@genesis/core";
import { connect, GenesisError, type BridgeObject, type Connection } from "./bridge.js";
import { createStore, type ApplyResult, type RouteInfo, type Store } from "./store.js";
import type { ServiceResponse, Storage, StorageBatch, StorageChange, StoredDocument } from "./types.js";
import { ServiceError } from "./types.js";

/** `{ url }` loads a website URL in a context; `{ screen }` opens an overlay screen. */
export type NavigateTarget =
  | { url: string; context?: string; mode?: NavigateMode }
  | { screen: string; params?: Record<string, string>; mode?: "push" | "replace" | "root" };

/** What the foreground renders now: the top overlay screen, or the route screen of the active context. */
export interface CurrentScreen {
  /** Unique per overlay entry, or `context:index` for a context's history entry. Scroll memory uses it. */
  key: string;
  /** A declared screen name. */
  id: string;
  params: Record<string, string>;
  /** The context whose records the screen reads: the active context. */
  context: string;
  overlay: boolean;
}

/** An action that has not settled, for optimistic display. */
export interface PendingAction {
  name: string;
  args: unknown;
}

export interface ActionCall {
  context: string;
  /** Null for a page action. */
  region: string | null;
  key: string | null;
  name: string;
  args: unknown;
}

export interface Foreground {
  readonly manifest: Manifest;
  readonly appletId: string;
  readonly limits: Limits;
  /** True when the host recreated the foreground with a saved session. */
  readonly restored: boolean;
  /** The records every context published. */
  readonly store: Store;
  navigation: {
    state(): CoordinatorState;
    /** The screen to render, or null when the active context shows a URL without a route. */
    screen(): CurrentScreen | null;
    presentation(contextId: string): Presentation;
    /** The context whose website is shown, or null when the applet screen is. */
    revealed(): string | null;
    navigate(target: NavigateTarget): void;
    /** Switches to a context's tab. Reselecting the shown tab returns it to its start page, or scrolls to top there. */
    select(contextId: string): void;
    /** In-app Back: the same order as Android Back, except that it never leaves the applet. */
    back(): void;
    /** Reloads the context's document, the active one by default. */
    reload(contextId?: string): void;
    /** Shows the website of the context, the active one by default, until `done`. */
    viewWebsite(contextId?: string): void;
    done(contextId?: string): void;
    /** Asks for confirmation before Back or a navigation leaves the current screen; `null` clears it. */
    setLeaveGuard(message: string | null): void;
    /** Replaces the default `confirm()` prompt shown when a leave guard blocks leaving. */
    onConfirmLeave(handler: (message: string, leave: () => void) => void): () => void;
    /** Runs when the shown tab is selected again on its start page. */
    onScrollToTop(listener: (contextId: string) => void): () => void;
    subscribe(listener: () => void): () => void;
  };
  actions: {
    /** Runs an action and settles with its outcome; it never rejects. Identical pending calls share one promise. */
    act(call: ActionCall): Promise<ActionResult>;
    /** The pending actions on a record (or on the page when `region` is null), in call order. */
    pending(context: string, region: string | null, key: string | null): readonly PendingAction[];
    subscribe(listener: () => void): () => void;
  };
  storage: Storage;
  services: {
    request<T = unknown>(serviceId: string, path: string, options?: { method?: string; body?: unknown }): Promise<ServiceResponse<T>>;
  };
  /** Scroll positions by screen key, kept while the foreground lives. */
  scroll: { get(key: string): number | undefined; set(key: string, top: number): void };
  /** Runs on `resumed` and when the person leaves the website with Done. */
  onResume(callback: () => void): () => void;
  onRetired(callback: () => void): () => void;
  /** Reports the first layout; the shell then reveals the foreground. */
  ready(): void;
}

/** Connects the foreground document to the host and builds the runtime the React hooks read. */
export async function createForeground(bridge: BridgeObject = (window as any).__genesisBridge): Promise<Foreground> {
  if (!bridge) throw new Error("Genesis bridge is missing; the foreground must run inside Genesis");
  const connection = await connect(bridge, location.href);
  const { compat } = connection.bound;
  if (compat.protocol !== COMPAT.protocol || compat.sessionState !== COMPAT.sessionState) {
    throw new GenesisError("PROTOCOL_MISMATCH", "This applet was built for another Genesis version");
  }
  return foreground(connection);
}

const SESSION_SAVE_MS = 500;
const RESYNC_INTERVAL_MS = 1000;
const SCROLL_ENTRIES_MAX = 64;
/** Time past `actionTimeoutMs` the foreground waits for an action that never reported dispatch. */
const ACTION_GRACE_MS = 2000;
const NO_PENDING: readonly PendingAction[] = Object.freeze([]);

interface ActionRecord extends ActionCall {
  dedup: string;
  actionId: number | null;
  promise: Promise<ActionResult>;
  resolve(result: ActionResult): void;
  timer: ReturnType<typeof setTimeout> | null;
  /** Set once the action left its document: the view it left, which the destination must replace. */
  from: ViewId | null;
  /** The pages that count as success or rejection at the destination. */
  expect: ActionExpect | null;
}

const names = (value: string | string[] | undefined) => value === undefined ? null : Array.isArray(value) ? value : [value];

function foreground(connection: Connection): Foreground {
  const { manifest, appletId, limits, session } = connection.bound;
  const contextIds = manifest.contexts.map(context => context.id);
  const store = createStore(contextIds, { historyEntriesMax: limits.historyEntriesMax });
  const request = (method: Parameters<Connection["request"]>[0], params?: unknown) =>
    connection.request(method, params).catch(error => {
      if (!connection.retired) console.error(`Genesis ${method} failed`, error);
    });

  // Coordinator.
  let state = restore(session, manifest);
  const navigationListeners = new Set<() => void>();
  let confirmLeave: ((message: string, leave: () => void) => void) | null = null;
  const scrollTopListeners = new Set<(contextId: string) => void>();

  function dispatch(event: CoordinatorEvent): CoordinatorEffect[] {
    const result = reduce(state, event, manifest);
    const changed = result.state !== state;
    state = result.state;
    const rest = result.effects.filter(effect => !run(effect));
    if (changed) {
      screenCache = undefined;
      scheduleSave();
      for (const listener of [...navigationListeners]) listener();
    }
    return rest;
  }

  /** Runs an effect that maps to a call. Returns false for the Back effects the caller handles. */
  function run(effect: CoordinatorEffect): boolean {
    switch (effect.type) {
      case "reveal": void request("context.reveal", { id: effect.id }); return true;
      case "cover": void request("context.cover"); return true;
      case "context.navigate":
        leftBy(effect.id);
        void request("context.navigate", { id: effect.id, url: effect.url, mode: effect.mode });
        return true;
      case "context.back":
        leftBy(effect.id);
        void request("context.back", effect.steps ? { id: effect.id, steps: effect.steps } : { id: effect.id });
        return true;
      case "context.reload": leftBy(effect.id); void request("context.reload", { id: effect.id }); return true;
      case "schedule":
        setTimeout(() => dispatch({ type: "deadline", id: effect.id, token: effect.token }), limits.documentReadyMs);
        return true;
      case "leave":
      case "confirmLeave":
        return false;
    }
  }

  function prompt(message: string, leave: () => void) {
    if (confirmLeave) confirmLeave(message, leave);
    else if (window.confirm(message)) leave();
  }

  /** Runs `go` now, or after the person confirms leaving a screen that set a leave guard. */
  function guarded(go: () => void) {
    const guard = state.leaveGuard;
    if (!guard) return go();
    prompt(guard.message, () => {
      dispatch({ type: "guard", guard: null });
      go();
    });
  }

  /** Pins `id` to its website. Leaving an overlay screen for it asks first when that screen set a leave guard. */
  function viewWebsite(id: string) {
    const go = () => { dispatch({ type: "user.viewWebsite", id }); };
    if (state.overlay.length > 0 || id !== state.active) guarded(go);
    else go();
  }

  /** Runs Back. Returns whether it was handled inside the applet. */
  function back(fromHost: boolean): boolean {
    let handled = true;
    for (const effect of dispatch({ type: "back" })) {
      if (effect.type === "leave") handled = false; // Only Android Back leaves the applet.
      else if (effect.type === "confirmLeave") {
        const leave = () => {
          dispatch({ type: "guard", guard: null });
          if (!back(false) && fromHost) void request("back.leave");
        };
        // Answer the host first; the prompt may take longer than the Back answer window.
        setTimeout(() => prompt(effect.message, leave), 0);
      }
    }
    return handled;
  }

  // Session.
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let savedJson = session ? JSON.stringify(serialize(state)) : "";
  function scheduleSave() {
    if (saveTimer === null) saveTimer = setTimeout(save, SESSION_SAVE_MS);
  }
  function save() {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = null;
    const saved = serialize(state);
    const json = JSON.stringify(saved);
    if (json === savedJson) return;
    savedJson = json;
    void request("session.save", saved);
  }
  connection.on("suspended", save);

  // Screens.
  let screenCache: CurrentScreen | null | undefined;
  function currentScreen(): CurrentScreen | null {
    if (screenCache !== undefined) return screenCache;
    const top = state.overlay[state.overlay.length - 1];
    const active = state.contexts[state.active];
    let screen: CurrentScreen | null = null;
    if (top) {
      screen = { key: top.key, id: top.id, params: top.params, context: state.active, overlay: true };
    } else if (active?.url) {
      const match = matchRoute(manifest, active.url);
      if (match.kind === "route") {
        screen = { key: `${active.id}:${active.index}`, id: match.screen, params: match.params, context: active.id, overlay: false };
      }
    }
    return (screenCache = screen);
  }

  let nextScreenKey = 1;
  const usedKeys = new Set(state.overlay.map(screen => screen.key));
  function screenKey() {
    let key: string;
    do key = `s${nextScreenKey++}`; while (usedKeys.has(key));
    usedKeys.add(key);
    return key;
  }

  function navigate(target: NavigateTarget) {
    if ("screen" in target) {
      const screen: Screen = { key: screenKey(), id: target.screen, params: target.params ?? {} };
      guarded(() => dispatch({ type: "navigate.screen", screen, mode: target.mode ?? "push" }));
      return;
    }
    const active = state.contexts[state.active];
    const base = active?.url ?? manifest.contexts[0].startUrl;
    let url: string;
    try { url = new URL(target.url, base).href; } catch { throw new GenesisError("INVALID_ARGUMENT", `Not a URL: ${target.url}`); }
    const id = target.context ?? defaultContext(url);
    if (!state.contexts[id]) throw new GenesisError("NOT_FOUND", `No context ${id}`);
    const shown = state.contexts[id].url;
    // The context shows this page already: switch to it instead of adding a history entry.
    if (shown !== null && entryKey(shown) === entryKey(url) && (target.mode ?? "push") === "push") {
      if (id !== state.active || state.overlay.length > 0) guarded(() => dispatch({ type: "select", id }));
      return;
    }
    guarded(() => dispatch({ type: "navigate.url", url, context: id, mode: target.mode ?? "push" }));
  }

  /**
   * The context for a URL without an explicit one. A route's `context` applies from a tab root
   * (the active context on its start page) and from an overlay screen; elsewhere the active
   * context keeps the navigation in its own history.
   */
  function defaultContext(url: string): string {
    const match = matchRoute(manifest, url);
    if (match.kind !== "route" || !match.context || !state.contexts[match.context]) return state.active;
    const active = state.contexts[state.active];
    const start = manifest.contexts.find(context => context.id === state.active)?.startUrl;
    const atRoot = !active.url || (start !== undefined && entryKey(active.url) === entryKey(start));
    return state.overlay.length > 0 || atRoot ? match.context : state.active;
  }

  function select(id: string) {
    guarded(() => {
      const reselect = id === state.active && state.overlay.length === 0;
      const navigates = reselect && state.contexts[id]?.url !== null
        && entryKey(state.contexts[id].url!) !== entryKey(manifest.contexts.find(context => context.id === id)?.startUrl ?? "");
      dispatch({ type: "select", id });
      if (reselect && !navigates) for (const listener of [...scrollTopListeners]) listener(id);
    });
  }

  // Record stream.
  const resyncing = new Set<string>();
  function resync(id: string) {
    if (resyncing.has(id)) return;
    resyncing.add(id);
    setTimeout(() => resyncing.delete(id), RESYNC_INTERVAL_MS);
    void connection.request("context.resync", { id }).catch(() => {});
  }

  function routeInfo(url: string): RouteInfo {
    const match = matchRoute(manifest, url);
    return match.kind === "route" ? { pageId: match.page, routeId: match.routeId, params: match.params } : { pageId: null, routeId: null, params: {} };
  }

  connection.on("page", ({ id, generation, page }: { id: string; generation: number; page: Page }) => {
    const result = store.applyPage(id, generation, page);
    if (result.outcome !== "applied") return;
    resyncing.delete(id);
    const context = store.context(id)!;
    observe(id, page); // Before the coordinator's effects, which may move the context on.
    dispatch({
      type: "context.page", id, generation, view: page.view, status: page.status,
      pageId: page.pageId, routeId: page.routeId, account: page.account,
      stale: context.stale && context.content, signInUrl: page.signInUrl ?? null,
    });
    accountChanged(id, result);
  });

  connection.on("patch", ({ id, generation, patch }: { id: string; generation: number; patch: Patch }) => {
    const result = store.applyPatch(id, generation, patch);
    if (result.outcome === "resync") resync(id);
    accountChanged(id, result);
  });

  /**
   * The account rule's calls: covered contexts reload, the revealed one sends its records again,
   * and the actions of the other contexts can no longer be judged. The reporter's document stays,
   * so its actions (such as the sign-in that changed the account) report their own outcome.
   */
  function accountChanged(reporter: string, result: ApplyResult) {
    if (!result.accountChanged) return;
    const shown = revealed(state, manifest);
    for (const id of contextIds) {
      if (id === reporter) continue;
      if (id === shown) resync(id);
      else dispatchReload(id);
    }
    for (const record of [...actions.values()]) {
      if (record.context !== reporter) settle(record, { outcome: "unknown", code: "CONTEXT_REPLACED", message: "The account changed" });
    }
  }

  function dispatchReload(id: string) {
    leftBy(id);
    void request("context.reload", { id });
  }

  connection.on("context.navigated", (data: ContextNavigated) => {
    store.navigated(data.id, data, routeInfo(data.url));
    dispatch({ type: "context.navigated", ...data });
  });

  connection.on("context.gone", (data: { id: string; code?: string; message?: string }) => {
    store.gone(data.id, { code: data.code ?? "NOT_READY", message: data.message ?? "The page cannot be read" });
    dispatch({ type: "context.gone", id: data.id });
  });

  connection.on("user.viewWebsite", (data: { id?: string | null } | null) => {
    viewWebsite(data?.id ?? state.active);
  });
  // The person opened a link from outside the applet; it already restarted, so no guard asks.
  connection.on("user.showContext", (data: { id?: string | null } | null) => {
    dispatch({ type: "user.showContext", id: data?.id ?? state.active });
  });
  connection.on("user.done", (data: { id?: string | null } | null) => {
    dispatch({ type: "user.done", id: data?.id ?? state.active });
    resume();
  });

  connection.on("back", () => {
    const handled = back(true);
    void request("back.handled", { handled });
  });

  // Actions.
  const actions = new Map<string, ActionRecord>();
  const byId = new Map<number, ActionRecord>();
  /** Updates that arrived before their `context.act` response; kept only while a request is out. */
  const early = new Map<number, ActionUpdate[]>();
  let requests = 0;
  const actionListeners = new Set<() => void>();
  let pendingIndex = new Map<string, readonly PendingAction[]>();
  const recordKey = (context: string, region: string | null, key: string | null) => JSON.stringify([context, region, key]);

  function actionsChanged() {
    const index = new Map<string, PendingAction[]>();
    for (const record of actions.values()) {
      const key = recordKey(record.context, record.region, record.key);
      let list = index.get(key);
      if (!list) index.set(key, (list = []));
      list.push({ name: record.name, args: record.args });
    }
    // Lists that did not change keep their identity.
    const next = new Map<string, readonly PendingAction[]>();
    for (const [key, list] of index) {
      const old = pendingIndex.get(key);
      next.set(key, old && old.length === list.length && old.every((item, i) => item.name === list[i].name && item.args === list[i].args) ? old : list);
    }
    pendingIndex = next;
    for (const listener of [...actionListeners]) listener();
  }

  function settle(record: ActionRecord, result: ActionResult) {
    if (actions.get(record.dedup) !== record) return;
    actions.delete(record.dedup);
    if (record.actionId !== null) byId.delete(record.actionId);
    if (record.timer !== null) clearTimeout(record.timer);
    record.resolve(result);
    actionsChanged();
  }

  function deadline(record: ActionRecord, ms: number) {
    if (record.timer !== null) clearTimeout(record.timer);
    record.timer = setTimeout(() => settle(record, { outcome: "unknown", code: "DEADLINE", message: "The action did not finish in time" }), ms);
  }

  function updated(record: ActionRecord, update: ActionUpdate) {
    if (update.state === "dispatched") {
      if (!update.navigating) return; // The document keeps observing; the host enforces its deadline.
      record.from = store.context(record.context)?.view ?? null;
      record.expect = update.expect ?? null;
      deadline(record, limits.actionTimeoutMs);
      return;
    }
    const fallback = update.state === "observed" ? "observed" : update.state === "cancelled" ? "cancelled" : "failed";
    settle(record, update.result ?? { outcome: fallback });
  }

  connection.on("action.update", (update: ActionUpdate) => {
    const record = byId.get(update.actionId);
    if (record) return updated(record, update);
    // An update may arrive before the `context.act` response. Without one out, its action has settled already.
    if (requests === 0) return;
    const list = early.get(update.actionId) ?? [];
    list.push(update);
    early.set(update.actionId, list);
  });

  /**
   * Settles navigating actions in `id` from its destination page: `auth` fails, a page in
   * `expect.notPage` is rejected, a ready page in `expect.page` (any page with a screen when
   * unspecified) is observed, and anything else is unknown.
   */
  function observe(id: string, page: Page) {
    for (const record of [...actions.values()]) {
      if (record.context !== id || record.from === null) continue;
      const { from } = record;
      if (page.view.generation === from.generation && page.view.n === from.n) continue; // The page it left.
      if (page.status === "loading") continue;
      const match = matchRoute(manifest, page.view.url);
      const pageName = match.kind === "route" ? match.page : null;
      const wanted = names(record.expect?.page);
      if (page.status === "auth") settle(record, { outcome: "failed", code: "AUTH_REQUIRED", message: "Sign-in is needed" });
      else if (pageName !== null && names(record.expect?.notPage)?.includes(pageName)) {
        settle(record, { outcome: "failed", code: "REJECTED", message: "The website did not accept the action" });
      } else if (page.status === "ready" && pageName !== null && (wanted === null || wanted.includes(pageName))) {
        settle(record, { outcome: "observed" });
      } else settle(record, { outcome: "unknown", message: "The action led to another page" });
    }
  }

  /** The context is leaving its page for another reason: its navigating actions can no longer be judged. */
  function leftBy(id: string) {
    for (const record of [...actions.values()]) {
      if (record.context === id && record.from !== null) {
        settle(record, { outcome: "unknown", message: "The page changed before the action finished" });
      }
    }
  }

  function act(call: ActionCall): Promise<ActionResult> {
    const context = store.context(call.context);
    if (!context?.view) return Promise.resolve({ outcome: "failed", code: "NOT_READY", message: "The page is not ready" });
    const region = call.region === null ? undefined : context.regions[call.region];
    const record = region?.kind === "collection" ? region.records[call.key ?? ""] : region?.record ?? undefined;
    const dedup = JSON.stringify([
      call.context, record?.entityType ?? call.region, record?.entity ?? call.key, call.name, call.args ?? null,
    ]);
    const existing = actions.get(dedup);
    if (existing) return existing.promise;

    let resolve!: (result: ActionResult) => void;
    const promise = new Promise<ActionResult>(done => { resolve = done; });
    const entry: ActionRecord = { ...call, dedup, actionId: null, promise, resolve, timer: null, from: null, expect: null };
    actions.set(dedup, entry);
    deadline(entry, limits.actionTimeoutMs + ACTION_GRACE_MS);
    actionsChanged();

    // The view lets the document refuse an action meant for records it no longer shows.
    const { view } = context;
    const action = { region: call.region, key: call.key, name: call.name, args: call.args ?? null, view: view.n };
    const answered = () => { if (--requests === 0) early.clear(); };
    requests++;
    connection.request<{ actionId: number }>("context.act", { id: call.context, generation: view.generation, action }).then(
      ({ actionId }) => {
        const updates = early.get(actionId) ?? [];
        early.delete(actionId);
        answered();
        if (actions.get(dedup) !== entry) return;
        entry.actionId = actionId;
        byId.set(actionId, entry);
        for (const update of updates) updated(entry, update);
      },
      error => {
        answered();
        const code = isErrorCode(error?.code) ? error.code : undefined;
        settle(entry, { outcome: "failed", code, message: error instanceof Error ? error.message : "The action failed" });
      },
    );
    return promise;
  }

  // Storage.
  const storageListeners = new Set<(change: StorageChange) => void>();
  connection.on("storage.changed", (change: StorageChange) => {
    for (const listener of [...storageListeners]) listener(change);
  });
  const storage: Storage = {
    get: <T>(collection: string, key: string) =>
      connection.request<{ document: StoredDocument<T> | null; namespaceRevision: number }>("storage.get", { collection, key }),
    list: <T>(collection: string, options: { afterKey?: string; limit?: number } = {}) =>
      connection.request<{ entries: StoredDocument<T>[]; nextAfterKey: string | null; namespaceRevision: number }>(
        "storage.list", { collection, ...options }),
    commit: (batch: StorageBatch) =>
      connection.request<{ namespaceRevision: number }>("storage.commit", {
        checks: batch.checks ?? [], puts: batch.puts ?? [], deletes: batch.deletes ?? [],
      }),
    onChanged(listener) {
      storageListeners.add(listener);
      return () => { storageListeners.delete(listener); };
    },
  };

  // Services.
  const services: Foreground["services"] = {
    async request<T>(serviceId: string, path: string, options: { method?: string; body?: unknown } = {}) {
      try {
        return await connection.request<ServiceResponse<T>>("services.request", {
          serviceId, path, method: options.method ?? "GET", body: options.body ?? null,
        });
      } catch (error) {
        if (error instanceof GenesisError) throw new ServiceError(error.code, error.message);
        throw error;
      }
    },
  };

  // Lifecycle.
  const resumeListeners = new Set<() => void>();
  function resume() { for (const listener of [...resumeListeners]) listener(); }
  connection.on("resumed", resume);

  const retiredListeners = new Set<() => void>();
  connection.on("retired", () => {
    for (const record of [...actions.values()]) settle(record, { outcome: "unknown", code: "RETIRED", message: "This page was closed" });
    for (const listener of [...retiredListeners]) listener();
  });

  const scrollMemory = new Map<string, number>();

  // Start: every context reports its page again, and each starts its readiness deadline.
  for (const id of contextIds) {
    void connection.request("context.resync", { id }).catch(() => {}); // NOT_READY until its document binds.
    run({ type: "schedule", id, token: state.contexts[id].deadline });
  }
  const initial = revealed(state, manifest);
  if (initial !== null) void request("context.reveal", { id: initial });

  let readySent = false;

  return {
    manifest,
    appletId,
    limits,
    restored: session !== null,
    store,
    navigation: {
      state: () => state,
      screen: currentScreen,
      presentation: id => presentation(state.contexts[id], manifest),
      revealed: () => revealed(state, manifest),
      navigate,
      select,
      back: () => { back(false); },
      reload: id => { dispatchReload(id ?? state.active); },
      viewWebsite: id => { viewWebsite(id ?? state.active); },
      done: id => { dispatch({ type: "user.done", id: id ?? state.active }); },
      setLeaveGuard: message => { dispatch({ type: "guard", guard: message === null ? null : { message } }); },
      onConfirmLeave(handler) {
        confirmLeave = handler;
        return () => { if (confirmLeave === handler) confirmLeave = null; };
      },
      onScrollToTop(listener) {
        scrollTopListeners.add(listener);
        return () => { scrollTopListeners.delete(listener); };
      },
      subscribe(listener) {
        navigationListeners.add(listener);
        return () => { navigationListeners.delete(listener); };
      },
    },
    actions: {
      act,
      pending: (context, region, key) => pendingIndex.get(recordKey(context, region, key)) ?? NO_PENDING,
      subscribe(listener) {
        actionListeners.add(listener);
        return () => { actionListeners.delete(listener); };
      },
    },
    storage,
    services,
    scroll: {
      get: key => scrollMemory.get(key),
      set(key, top) {
        scrollMemory.delete(key);
        scrollMemory.set(key, top);
        while (scrollMemory.size > SCROLL_ENTRIES_MAX) scrollMemory.delete(scrollMemory.keys().next().value!);
      },
    },
    onResume(callback) {
      resumeListeners.add(callback);
      return () => { resumeListeners.delete(callback); };
    },
    onRetired(callback) {
      retiredListeners.add(callback);
      return () => { retiredListeners.delete(callback); };
    },
    ready() {
      if (readySent) return;
      readySent = true;
      void request("ui.ready");
    },
  };
}
