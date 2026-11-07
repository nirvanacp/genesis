import {
  currentScreen,
  initialState,
  isErrorCode,
  matchRoute,
  reduce,
  urlKey,
  type Effect,
  type Manifest,
  type NavigationEvent,
  type NavigationState,
  type Screen,
} from "@genesis/core";
import { connect, GenesisError, type BridgeObject, type Connection } from "./bridge.js";
import type {
  NavigateMode,
  NavigateTarget,
  ServiceResponse,
  Snapshot,
  SourceView,
  Storage,
  StorageBatch,
  StorageChange,
  StoredDocument,
} from "./types.js";
import { ServiceError } from "./types.js";

/** Ready snapshots kept per source, keyed by URL. */
const CACHE_PER_SOURCE = 16;
const INTENT_GRACE_MS = 2000;

interface Published {
  sourceId: string;
  requestedUrl: string | null;
  snapshot: Snapshot;
}

/** The screen stack sent with `navigation.save`, without keys. */
interface SavedNavigation {
  stack: { id: string; params: Record<string, string>; url: string | null; scroll?: number }[];
}

interface PendingIntent {
  resolve(): void;
  reject(error: GenesisError): void;
  timer: ReturnType<typeof setTimeout>;
}

export interface Foreground {
  readonly manifest: Manifest;
  readonly appletId: string;
  /** True when the host recreated the applet after retiring it in the background. The runtime
   * then restores the screen stack and scroll positions it had when it went to the background. */
  readonly restored: boolean;
  navigation: {
    state(): NavigationState;
    navigate(target: NavigateTarget): Promise<void>;
    /**
     * Reloads the current screen's page, or the page another source shows when `sourceId` is given.
     * Until the page loads, a screen shows its cached data as `stale` and `latest` shows `loading`.
     */
    reload(sourceId?: string): void;
    /** In-app Back: the same rules as Android Back, except that the root screen stays. */
    back(): void;
    /** Asks for confirmation before Back or `navigate` leaves the current screen; `null` clears it. */
    setLeaveGuard(message: string | null): void;
    /** Replaces the default `confirm()` prompt shown when a leave guard blocks leaving the screen. */
    onConfirmLeave(handler: (message: string, leave: () => void) => void): () => void;
  };
  sources: {
    /** The snapshot for the current screen's page, following the screen-to-source rule. */
    forScreen<T>(screen: Screen): SourceView<T>;
    /** The latest snapshot of a source, whatever page it shows. */
    latest<T>(sourceId: string): SourceView<T>;
  };
  storage: Storage;
  services: {
    request<T = unknown>(serviceId: string, path: string, options?: { method?: string; body?: unknown }): Promise<ServiceResponse<T>>;
  };
  /** Sends an intent to the source's adapter and settles with its result. */
  act(sourceId: string, intent: Record<string, unknown>): Promise<void>;
  scroll: { get(key: string): number | undefined; set(key: string, top: number): void };
  /** Runs on `resumed` and when the website sheet closes. */
  onResume(callback: () => void): () => void;
  onRetired(callback: () => void): () => void;
  /** Reports the first layout; the shell then reveals the foreground. */
  ready(): void;
  /** Change notification for every piece of state above. `version()` grows on each change. */
  subscribe(listener: () => void): () => void;
  version(): number;
}

/** Connects the foreground document to the host and builds the runtime the React hooks read. */
export async function createForeground(bridge: BridgeObject = (window as any).__genesisBridge): Promise<Foreground> {
  if (!bridge) throw new Error("Genesis bridge is missing; the foreground must run inside Genesis");
  const connection = await connect(bridge, location.href);
  return foreground(connection);
}

function foreground(connection: Connection): Foreground {
  const { manifest, appletId, limits } = connection.bound;
  const boundState = (connection.bound.state ?? {}) as {
    website?: { open: boolean; url: string | null };
    snapshots?: Record<string, Published>;
    sourceUrls?: Record<string, string>;
    restored?: boolean;
    navigation?: SavedNavigation | null;
  };

  let version = 0;
  const listeners = new Set<() => void>();
  const changed = () => {
    version++;
    for (const listener of [...listeners]) listener();
  };

  // Sources: the latest publication per source, a cache of ready snapshots, and the URL each source was asked to load.
  const latest = new Map<string, Published>(Object.entries(boundState.snapshots ?? {}));
  const cache = new Map<string, Map<string, Snapshot>>();
  const sourceUrls = new Map<string, string>(Object.entries(boundState.sourceUrls ?? {}));

  for (const published of latest.values()) remember(published);

  function remember(published: Published) {
    const { snapshot } = published;
    const key = urlKey(published.requestedUrl ?? snapshot.url);
    if (snapshot.status !== "ready" || !key) return;
    let entries = cache.get(published.sourceId);
    if (!entries) cache.set(published.sourceId, (entries = new Map()));
    entries.delete(key);
    entries.set(key, snapshot);
    while (entries.size > CACHE_PER_SOURCE) entries.delete(entries.keys().next().value!);
  }

  // The host retires a source's document when it loads another URL, so every publication belongs
  // to the page its requestedUrl names.
  connection.on("snapshot", (published: Published) => {
    latest.set(published.sourceId, published);
    forget(published);
    remember(published);
    changed();
  });

  /**
   * Drops cached data a publication shows to be out of date. Sign-in pages mean the session
   * changed, so every page of that source goes; an error or unsupported page drops its own entry.
   */
  function forget(published: Published) {
    const { status, url } = published.snapshot;
    if (status === "auth") cache.delete(published.sourceId);
    else if (status === "error" || status === "unsupported") {
      const key = urlKey(published.requestedUrl ?? url);
      if (key) cache.get(published.sourceId)?.delete(key);
    }
  }

  function view<T>(snapshot: Snapshot, stale: boolean): SourceView<T> {
    return {
      status: snapshot.status,
      data: (snapshot.data ?? null) as T | null,
      stale,
      url: snapshot.url,
      routeId: snapshot.routeId,
      params: snapshot.params ?? {},
      error: snapshot.error ?? null,
    };
  }

  function loading<T>(url: string | null, routeId: string | null, params: Record<string, string>): SourceView<T> {
    return { status: "loading", data: null, stale: false, url, routeId, params, error: null };
  }

  const sources: Foreground["sources"] = {
    forScreen<T>(screen: Screen) {
      const source = screen.source;
      if (!source) return loading<T>(null, null, screen.params);
      const key = urlKey(source.url);
      const published = latest.get(source.sourceId);
      const cached = key ? cache.get(source.sourceId)?.get(key) : undefined;
      const fallback = cached && cached.routeId === source.routeId ? view<T>(cached, true) : null;
      if (published && urlKey(published.requestedUrl ?? published.snapshot.url) === key) {
        const { snapshot } = published;
        // A page still loading keeps showing its cached data. An error, sign-in or unsupported
        // state replaces it: cached data must not outlive a failed refresh or a sign-out.
        if (snapshot.status === "loading" && fallback) return fallback;
        if (snapshot.status !== "ready" || snapshot.routeId === source.routeId) return view<T>(snapshot, false);
        // The page redirected to another route; its data does not fit this screen.
        return { ...view<T>(snapshot, false), status: "unsupported", data: null };
      }
      return fallback ?? loading<T>(source.url, source.routeId, screen.params);
    },
    latest<T>(sourceId: string) {
      const published = latest.get(sourceId);
      return published ? view<T>(published.snapshot, false) : loading<T>(sourceUrls.get(sourceId) ?? null, null, {});
    },
  };

  /** Asks the source to load the screen's page when it shows another one, or always with `force`. */
  function associate(screen: Screen, force = false) {
    const source = screen.source;
    if (!source || (!force && urlKey(sourceUrls.get(source.sourceId) ?? "") === urlKey(source.url))) return;
    load(source.sourceId, source.url);
  }

  /** Loads `url` in the source. Its last publication described the page being replaced, so it goes. */
  function load(sourceId: string, url: string) {
    sourceUrls.set(sourceId, url);
    if (latest.delete(sourceId)) changed();
    connection.request("source.navigate", { sourceId, url }).catch(error => {
      console.error("Genesis could not load the source page", error);
    });
  }

  function reload(sourceId?: string) {
    const current = currentScreen(navigation);
    if (!sourceId || sourceId === current.source?.sourceId) return associate(current, true);
    const url = sourceUrls.get(sourceId);
    if (url) load(sourceId, url);
  }

  // Navigation.
  let nextScreenKey = 1;
  const screen = (id: string, params: Record<string, string> = {}, source: Screen["source"] = null): Screen =>
    ({ key: `s${nextScreenKey++}`, id, params, source });

  function screenForUrl(url: string): Screen | null {
    const match = matchRoute(manifest, url);
    if (match.kind !== "adapted") return null;
    return screen(match.screen, match.params, { sourceId: match.source, url: urlKey(url)!, routeId: match.routeId });
  }

  const scrollMemory = new Map<string, number>();
  const start = manifest.sources[0] ? screenForUrl(manifest.sources[0].startUrl) : null;
  let navigation = initialState(start ?? screen(manifest.foreground.screens[0]));
  const restoredStack = boundState.restored ? restoreStack(boundState.navigation) : [];
  if (restoredStack.length > 0) navigation = { ...navigation, stack: restoredStack };
  if (boundState.website?.open && boundState.website.url) navigation = { ...navigation, website: { url: boundState.website.url } };

  /** Rebuilds saved screens against the current manifest; entries it no longer declares are dropped. */
  function restoreStack(saved: SavedNavigation | null | undefined): Screen[] {
    const stack: Screen[] = [];
    for (const entry of Array.isArray(saved?.stack) ? saved!.stack : []) {
      const restored = entry.url ? screenForUrl(entry.url)
        : manifest.foreground.screens.includes(entry.id) ? screen(entry.id, entry.params ?? {}) : null;
      if (!restored || restored.id !== entry.id) continue;
      if (typeof entry.scroll === "number") scrollMemory.set(restored.key, entry.scroll);
      stack.push(restored);
    }
    return stack;
  }

  function saveNavigation() {
    const saved: SavedNavigation = {
      stack: navigation.stack.map(entry => ({
        id: entry.id, params: entry.params, url: entry.source?.url ?? null, scroll: scrollMemory.get(entry.key),
      })),
    };
    void connection.request("navigation.save", { navigation: saved }).catch(() => {});
  }
  connection.on("suspended", saveNavigation);
  let confirmLeave: ((message: string, leave: () => void) => void) | null = null;

  function dispatch(event: NavigationEvent): Effect[] {
    const before = currentScreen(navigation);
    const result = reduce(navigation, event);
    navigation = result.state;
    const after = currentScreen(navigation);
    if (after !== before) {
      const keys = new Set(navigation.stack.map(entry => entry.key));
      for (const key of scrollMemory.keys()) if (!keys.has(key)) scrollMemory.delete(key);
      associate(after);
    }
    changed();
    return result.effects;
  }

  /** Runs the reducer's Back effects. Returns whether Back was handled inside the applet. */
  function back(fromHost: boolean): boolean {
    let handled = true;
    for (const effect of dispatch({ type: "back" })) {
      if (effect.type === "host.website.close") void connection.request("website.close").catch(() => {});
      else if (effect.type === "host.back.unhandled") handled = false; // Only Android Back leaves the applet.
      else if (effect.type === "confirmLeave") {
        // The host's Back slot is answered by now, so a confirmed Android Back on a root screen
        // leaves through back.leave.
        const leave = () => {
          dispatch({ type: "guard", guard: null });
          if (!back(false) && fromHost) void connection.request("back.leave").catch(() => {});
        };
        // Answer the host first; the prompt may take longer than the Back answer window.
        setTimeout(() => {
          if (confirmLeave) confirmLeave(effect.message, leave);
          else if (window.confirm(effect.message)) leave();
        }, 0);
      }
    }
    return handled;
  }

  connection.on("back", () => {
    const handled = back(true);
    void connection.request("back.handled", { handled }).catch(() => {});
  });

  const resumeListeners = new Set<() => void>();
  const resume = () => { for (const listener of [...resumeListeners]) listener(); };
  connection.on("resumed", resume);

  connection.on("website", (data: { open: boolean; url: string | null }) => {
    const wasOpen = navigation.website !== null;
    if (data.open && data.url) dispatch({ type: wasOpen ? "website.changed" : "website.opened", url: data.url });
    else if (wasOpen) {
      dispatch({ type: "website.closed" });
      resume();
    }
  });

  /** Changes the screen, first asking to confirm when the current screen set a leave guard. */
  function show(mode: NavigateMode, next: Screen) {
    const go = () => { dispatch({ type: mode, screen: next }); };
    const guard = navigation.leaveGuard;
    if (!guard) return go();
    const leave = () => {
      dispatch({ type: "guard", guard: null });
      go();
    };
    if (confirmLeave) confirmLeave(guard.message, leave);
    else if (window.confirm(guard.message)) leave();
  }

  async function navigate(target: NavigateTarget): Promise<void> {
    if (target.kind === "screen") {
      show(target.mode ?? "push", screen(target.id, target.params, target.source ?? null));
      return;
    }
    if (target.kind === "website") {
      await connection.request("website.open", { url: target.url });
      return;
    }
    const match = matchRoute(manifest, target.url);
    if (match.kind === "adapted") {
      show(target.mode ?? "push", screenForUrl(target.url)!);
    } else if (match.kind === "unsupported" && manifest.foreground.screens.includes("unsupported")) {
      show(target.mode ?? "push", screen("unsupported", { url: target.url }));
    } else {
      await connection.request("website.open", { url: target.url });
    }
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

  // Intents. A result may arrive before the `source.intent` response, so early results wait here.
  const intents = new Map<number, PendingIntent>();
  const early = new Map<number, { ok: boolean; error?: { code?: string; message?: string } | null }>();
  function settle(intentId: number, ok: boolean, error?: { code?: string; message?: string } | null) {
    const entry = intents.get(intentId);
    if (!entry) { early.set(intentId, { ok, error }); return; }
    intents.delete(intentId);
    clearTimeout(entry.timer);
    if (ok) entry.resolve();
    else entry.reject(new GenesisError(isErrorCode(error?.code) ? error!.code : "INVALID_ARGUMENT", error?.message ?? "The action failed"));
  }
  connection.on("intent.result", (data: { intentId: number; ok: boolean; error?: { code?: string; message?: string } | null }) =>
    settle(data.intentId, data.ok, data.error));

  async function act(sourceId: string, intent: Record<string, unknown>): Promise<void> {
    const { intentId } = await connection.request<{ intentId: number }>("source.intent", { sourceId, intent });
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        intents.delete(intentId);
        reject(new GenesisError("DEADLINE", "The action did not finish in time"));
      }, limits.intentTimeoutMs + INTENT_GRACE_MS);
      intents.set(intentId, { resolve, reject, timer });
      const result = early.get(intentId);
      if (result) { early.delete(intentId); settle(intentId, result.ok, result.error); }
    });
  }

  const retiredListeners = new Set<() => void>();
  connection.on("retired", () => {
    for (const entry of intents.values()) { clearTimeout(entry.timer); entry.reject(new GenesisError("RETIRED", "This page was closed")); }
    intents.clear();
    for (const listener of [...retiredListeners]) listener();
  });

  let readySent = false;
  associate(currentScreen(navigation));

  return {
    manifest,
    appletId,
    restored: boundState.restored === true,
    navigation: {
      state: () => navigation,
      navigate,
      reload,
      back: () => { back(false); },
      setLeaveGuard: message => { dispatch({ type: "guard", guard: message === null ? null : { message } }); },
      onConfirmLeave(handler) {
        confirmLeave = handler;
        return () => { if (confirmLeave === handler) confirmLeave = null; };
      },
    },
    sources,
    storage,
    services,
    act,
    scroll: {
      get: key => scrollMemory.get(key),
      set: (key, top) => { if (navigation.stack.some(entry => entry.key === key)) scrollMemory.set(key, top); },
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
      void connection.request("ui.ready").catch(error => console.error("Genesis ui.ready failed", error));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    version: () => version,
  };
}
