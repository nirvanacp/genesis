import {
  COMPAT,
  entryKey,
  matchRoute,
  presentation,
  reduce,
  restore,
  serialize,
  type ContextState as CoordinatorContext,
  type CoordinatorEffect,
  type CoordinatorEvent,
  type CoordinatorState,
  type ErrorBody,
  type NavigateMode,
  type PageStatus,
  type Presentation,
  type ReadSpec,
  type RouteTable,
  type Screen,
  type TableRoute,
} from "@genesis/core";
import { GenesisError } from "../bridge.js";
import type { Watch } from "../client/context.js";
import type { Genesis } from "../client/session.js";

/** A route of the router's table. The first route whose pattern and query keys match a URL on a declared origin wins. */
export interface RouterRoute {
  id: string;
  /** Literal segments, `:name` segments and an optional trailing `*`. */
  pattern: string;
  /** Required query keys; their values become params. */
  query?: string[];
  /** The screen that renders the route; the route id by default. */
  screen?: string;
  /** The context `navigate({ url })` uses for this route from a tab root or an overlay screen. */
  context?: string;
  /** Read on the page while the route is shown; the page is ready once the value is truthy. Without it, a bound page is ready. */
  ready?: ReadSpec;
  /** The page needs a signed-in account: it reports `auth` while `account.signedIn` is falsy. */
  requiresAccount?: boolean;
  /** The website is shown for this route, whatever the page reports. */
  website?: boolean;
  /** The applet screen stays for an `error` status and for a `loading` status past its deadline. */
  onError?: "applet";
}

export interface RouterOptions {
  routes: RouterRoute[];
  /** Overlay screens: applet screens with no website page. */
  screens?: string[];
  account?: {
    /**
     * Read on every page: truthy while the person is signed in, `false` (or another falsy value)
     * while signed out, and `null` on a page that shows no evidence either way, such as a page
     * on another origin. A `one` read without a match and an empty list read are `null` too, so
     * an account read that can see a signed-out page should return `false` there.
     */
    signedIn: ReadSpec;
    /** The sign-in page for a URL that needs the account, relative to that URL. */
    signInUrl?: (url: string) => string | null;
  };
  /** Replaces the default presentation rules: whether a context shows the applet (`custom`) or its website. */
  decide?: (context: CoordinatorContext, route: TableRoute | null) => Presentation;
}

/** `{ url }` loads a website URL in a context; `{ screen }` opens an overlay screen. */
export type NavigateTarget =
  | { url: string; context?: string; mode?: NavigateMode }
  | { screen: string; params?: Record<string, string>; mode?: "push" | "replace" | "root" };

/** What the UI renders now: the top overlay screen, or the route screen of the active context. */
export interface CurrentScreen {
  /** Unique per overlay entry, or `context:index` for a context's history entry. Scroll memory uses it. */
  key: string;
  id: string;
  params: Record<string, string>;
  /** The active context. */
  context: string;
  overlay: boolean;
}

/** The page a context shows, as the router judges it. */
export interface RouteStatus {
  status: PageStatus;
  routeId: string | null;
  params: Readonly<Record<string, string>>;
  /** The ready value comes from an earlier copy of this page. */
  stale: boolean;
  error: ErrorBody | null;
  /** Whether the person is signed in; undefined until known or without `account`. */
  signedIn: boolean | undefined;
  url: string;
}

export interface Router {
  readonly state: CoordinatorState;
  /** Grows on every change the subscribers hear, so a binding can compare snapshots. */
  readonly version: number;
  /** Runs on every change of `state` and of a context's status. */
  subscribe(listener: () => void): () => void;
  /** The screen to render, or null when the active context shows a URL without a route. */
  screen(): CurrentScreen | null;
  status(contextId?: string): RouteStatus;
  presentation(contextId?: string): Presentation;
  /** The context whose website is shown, or null when the applet is. */
  revealed(): string | null;
  navigate(target: NavigateTarget): void;
  /** Switches to a context's tab. Reselecting the shown tab returns it to its start page, or scrolls to top there. */
  select(contextId: string): void;
  /** In-app Back: the same order as Android Back, except that it never leaves the applet. */
  back(): void;
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
  /** Runs when the person leaves a website with Done. */
  onDone(listener: (contextId: string) => void): () => void;
  /** Stops the router: closes its watches and drops its handlers. */
  destroy(): void;
}

const READY_WATCH = "router:ready:";
const ACCOUNT_WATCH = "router:account";
const NO_PARAMS: Readonly<Record<string, string>> = Object.freeze({});

interface Tracked {
  /** The route whose `ready` watch is open, or null. */
  routeId: string | null;
  ready: Watch | null;
  stopReady: (() => void) | null;
  account: Watch | null;
  /** The last `context.page` sent, as JSON, so an unchanged status is not sent again. */
  sent: string;
  status: RouteStatus | null;
  gone: boolean;
}

/**
 * The applet's presentation rules over the client: the coordinator of `@genesis/core` fed with
 * the contexts' navigations, a status per context from the matched route's `ready` watch and
 * the account watch, the shell's user events and Back. Its effects become client calls.
 */
export function createRouter(genesis: Genesis, options: RouterOptions): Router {
  const { manifest, limits } = genesis;
  const table: RouteTable = {
    origins: manifest.origins,
    routes: options.routes.map(route => tableRoute(route)),
    contexts: manifest.contexts,
    screens: options.screens ?? [],
  };
  const routes = new Map(options.routes.map(route => [route.id, route]));
  const contextIds = manifest.contexts.map(context => context.id);
  const listeners = new Set<() => void>();
  const stops: (() => void)[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let destroyed = false;

  let state = restore(savedSession(genesis.saved?.router), table);
  let confirmLeave: ((message: string, leave: () => void) => void) | null = null;
  const scrollTopListeners = new Set<(contextId: string) => void>();
  const doneListeners = new Set<(contextId: string) => void>();

  let version = 0;
  function notify() {
    version++;
    screenCache = undefined;
    for (const listener of [...listeners]) listener();
  }

  // ---- Coordinator ------------------------------------------------------------------------------

  function presentationOf(id: string): Presentation {
    const context = state.contexts[id];
    if (!context) return "website";
    if (!options.decide) return presentation(context, table);
    const match = context.url === null ? null : matchRoute(table, context.url);
    const route = match?.kind === "route" ? table.routes.find(r => r.id === match.routeId) ?? null : null;
    return options.decide(context, route);
  }

  function revealedNow(): string | null {
    return state.overlay.length === 0 && presentationOf(state.active) === "website" ? state.active : null;
  }

  function dispatch(event: CoordinatorEvent): CoordinatorEffect[] {
    if (destroyed) return [];
    const result = reduce(state, event, table);
    const changed = result.state !== state;
    state = result.state;
    const rest = result.effects.filter(effect => !run(effect));
    show();
    if (changed) {
      genesis.save({ router: serialize(state).state });
      notify();
    }
    return rest;
  }

  /** Shows the website the rules reveal now, or the UI. */
  function show() {
    const shown = revealedNow();
    if (shown === genesis.website.state.shown) return;
    if (shown === null) genesis.website.hide();
    else genesis.website.show(shown);
  }

  /** Runs an effect that maps to a call. Returns false for the Back effects the caller handles. */
  function run(effect: CoordinatorEffect): boolean {
    switch (effect.type) {
      case "reveal":
      case "cover":
        return true; // `show` follows the rules after each event.
      case "context.navigate":
        void genesis.context(effect.id).navigate(effect.url, { mode: effect.mode });
        return true;
      case "context.back":
        void genesis.context(effect.id).back(effect.steps);
        return true;
      case "context.reload":
        void genesis.context(effect.id).reload();
        return true;
      case "schedule":
        schedule(effect.id, effect.token);
        return true;
      case "leave":
      case "confirmLeave":
        return false;
    }
  }

  function schedule(id: string, token: number) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      dispatch({ type: "deadline", id, token });
    }, limits.documentReadyMs);
    timers.add(timer);
  }

  function prompt(message: string, leave: () => void) {
    if (confirmLeave) confirmLeave(message, leave);
    else if ((globalThis as { confirm?: (message: string) => boolean }).confirm?.(message)) leave();
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

  function done(id: string) {
    dispatch({ type: "user.done", id });
    for (const listener of [...doneListeners]) listener(id);
  }

  /** Runs Back. Returns whether it was handled inside the applet. */
  function back(fromHost: boolean): boolean {
    let handled = true;
    for (const effect of dispatch({ type: "back" })) {
      if (effect.type === "leave") handled = false; // Only Android Back leaves the applet.
      else if (effect.type === "confirmLeave") {
        const leave = () => {
          dispatch({ type: "guard", guard: null });
          if (!back(false) && fromHost) genesis.leave();
        };
        // Answer the host first; the prompt may take longer than the Back answer window.
        setTimeout(() => prompt(effect.message, leave), 0);
      }
    }
    return handled;
  }

  // ---- Screens and navigation -------------------------------------------------------------------

  let screenCache: CurrentScreen | null | undefined;
  function currentScreen(): CurrentScreen | null {
    if (screenCache !== undefined) return screenCache;
    const top = state.overlay[state.overlay.length - 1];
    const active = state.contexts[state.active];
    let screen: CurrentScreen | null = null;
    if (top) {
      screen = { key: top.key, id: top.id, params: top.params, context: state.active, overlay: true };
    } else if (active?.url) {
      const match = matchRoute(table, active.url);
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
      if (!table.screens.includes(target.screen)) throw new GenesisError("NOT_FOUND", `No screen ${target.screen}`);
      const screen: Screen = { key: screenKey(), id: target.screen, params: target.params ?? {} };
      guarded(() => dispatch({ type: "navigate.screen", screen, mode: target.mode ?? "push" }));
      return;
    }
    const base = state.contexts[state.active]?.url ?? manifest.contexts[0].startUrl;
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
    const match = matchRoute(table, url);
    if (match.kind !== "route" || !match.context || !state.contexts[match.context]) return state.active;
    const active = state.contexts[state.active];
    const start = startUrl(state.active);
    const atRoot = !active.url || (start !== undefined && entryKey(active.url) === entryKey(start));
    return state.overlay.length > 0 || atRoot ? match.context : state.active;
  }

  function select(id: string) {
    guarded(() => {
      const reselect = id === state.active && state.overlay.length === 0;
      const url = state.contexts[id]?.url ?? null;
      const navigates = reselect && url !== null && entryKey(url) !== entryKey(startUrl(id) ?? "");
      dispatch({ type: "select", id });
      if (reselect && !navigates) for (const listener of [...scrollTopListeners]) listener(id);
    });
  }

  const startUrl = (id: string) => manifest.contexts.find(context => context.id === id)?.startUrl;

  // ---- Status -----------------------------------------------------------------------------------

  const tracked = new Map<string, Tracked>();
  /** Whether the person is signed in, from the latest account value any context reported. */
  let signedIn: boolean | undefined;

  /** Keeps the `ready` watch of the context's current route open, and reports the context's status. */
  function update(id: string) {
    if (destroyed) return;
    const entry = tracked.get(id)!;
    const context = genesis.context(id);
    const { url } = context.state;
    const match = matchRoute(table, url);
    const route = match.kind === "route" ? routes.get(match.routeId)! : null;
    const wanted = route?.ready && !route.website ? route : null;
    if ((wanted?.id ?? null) !== entry.routeId) {
      entry.stopReady?.();
      entry.ready?.close();
      entry.ready = null;
      entry.stopReady = null;
      entry.routeId = wanted?.id ?? null;
      if (wanted) {
        entry.ready = context.watch(READY_WATCH + wanted.id, wanted.ready!, { when: [guardOf(wanted)] });
        entry.stopReady = entry.ready.subscribe(() => update(id));
      }
    }
    accountChanged(id, entry);

    let params: Readonly<Record<string, string>> = match.kind === "route" ? match.params : NO_PARAMS;
    if (entry.status && JSON.stringify(entry.status.params) === JSON.stringify(params)) params = entry.status.params;
    const status = statusOf(id, entry, route, params);
    if (!entry.status || !sameStatus(entry.status, status)) {
      entry.status = status;
      notify();
    }

    const gone = context.state.error !== null && !context.state.bound;
    if (gone && !entry.gone) {
      entry.gone = true;
      entry.sent = "";
      dispatch({ type: "context.gone", id });
      return;
    }
    if (!gone) entry.gone = false;
    // Report only a bound page the coordinator already moved to.
    const coordinator = state.contexts[id];
    if (!context.state.bound || !coordinator?.url || entryKey(coordinator.url) !== entryKey(url)) return;
    const view = { generation: context.state.generation, n: context.state.view?.n ?? 0, url };
    const signInUrl = status.status === "auth" ? absolute(options.account?.signInUrl?.(url) ?? null, url) : null;
    const event: CoordinatorEvent = {
      type: "context.page", id, generation: view.generation, view, status: status.status,
      pageId: status.routeId, routeId: status.routeId, stale: status.stale, signInUrl,
      ...(status.signedIn === undefined ? {} : { account: status.signedIn ? "yes" : null }),
    };
    const json = JSON.stringify(event);
    if (json === entry.sent) return;
    entry.sent = json;
    dispatch(event);
  }

  function statusOf(id: string, entry: Tracked, route: RouterRoute | null, params: Readonly<Record<string, string>>): RouteStatus {
    const context = genesis.context(id).state;
    // A page that shows nothing about the account, such as a form, keeps the account already known.
    const known = options.account ? accountOf(entry) ?? signedIn : undefined;
    const base = { routeId: route?.id ?? null, params, url: context.url, signedIn: known, stale: false, error: context.error };
    if (!route || route.website) return { ...base, status: "unsupported" };
    if (context.error && !context.bound) return { ...base, status: "unsupported" };
    if (!context.bound) return { ...base, status: "loading" };
    if (route.requiresAccount && options.account) {
      if (known === false) return { ...base, status: "auth" };
      if (known === undefined) return { ...base, status: "loading" };
    }
    if (!entry.ready) return { ...base, status: "ready" };
    const value = entry.ready.get();
    if (value.idle) return { ...base, status: "loading" };
    if (value.status === "error") return { ...base, status: "error", stale: value.stale, error: value.error };
    if (value.status === "ready" && !value.stale && truthy(value)) return { ...base, status: "ready" };
    return { ...base, status: "loading", stale: value.stale && truthy(value) };
  }

  function accountOf(entry: Tracked): boolean | undefined {
    const value = entry.account?.get();
    if (!value || value.status !== "ready" || value.stale || value.idle) return undefined;
    return value.value === null && value.order.length === 0 ? undefined : truthy(value);
  }

  /**
   * The account rule: when a context reports another account than the one known, the other
   * contexts reload, except the one whose website is shown, so no context shows another
   * account's pages.
   */
  function accountChanged(id: string, entry: Tracked) {
    const value = accountOf(entry);
    if (value === undefined || value === signedIn) return;
    const before = signedIn;
    signedIn = value;
    if (before === undefined) {
      // Contexts whose pages showed nothing about the account were waiting for it.
      for (const other of contextIds) if (other !== id && tracked.has(other)) update(other);
      return;
    }
    const shown = genesis.website.state.shown;
    for (const other of contextIds) {
      if (other !== id && other !== shown) void genesis.context(other).reload();
    }
  }

  // ---- Wiring -----------------------------------------------------------------------------------

  for (const id of contextIds) {
    const context = genesis.context(id);
    const entry: Tracked = { routeId: null, ready: null, stopReady: null, account: null, sent: "", status: null, gone: false };
    tracked.set(id, entry);
    if (options.account) {
      entry.account = context.watch(ACCOUNT_WATCH, options.account.signedIn);
      stops.push(entry.account.subscribe(() => update(id)));
    }
    stops.push(context.subscribe(() => update(id)));
    stops.push(context.onNavigated(navigation => {
      dispatch({ type: "context.navigated", ...navigation });
      update(id);
    }));
    // The UI may start after the context's first navigation.
    if (context.navigation) dispatch({ type: "context.navigated", ...context.navigation });
    schedule(id, state.contexts[id].deadline);
    update(id);
  }

  stops.push(genesis.website.on("viewWebsite", id => viewWebsite(id)));
  // The person opened a link from outside the applet; it already restarted, so no guard asks.
  stops.push(genesis.website.on("showContext", id => { dispatch({ type: "user.showContext", id }); }));
  stops.push(genesis.website.on("done", id => done(id)));
  stops.push(genesis.onBack(() => back(true)));
  show();

  return {
    get state() { return state; },
    get version() { return version; },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    screen: currentScreen,
    status: (id = state.active) => tracked.get(id)?.status ?? missing(id),
    presentation: (id = state.active) => presentationOf(id),
    revealed: revealedNow,
    navigate,
    select,
    back: () => { back(false); },
    reload: id => { void genesis.context(id ?? state.active).reload(); },
    viewWebsite: id => { viewWebsite(id ?? state.active); },
    done: id => { done(id ?? state.active); },
    setLeaveGuard: message => { dispatch({ type: "guard", guard: message === null ? null : { message } }); },
    onConfirmLeave(handler) {
      confirmLeave = handler;
      return () => { if (confirmLeave === handler) confirmLeave = null; };
    },
    onScrollToTop(listener) {
      scrollTopListeners.add(listener);
      return () => { scrollTopListeners.delete(listener); };
    },
    onDone(listener) {
      doneListeners.add(listener);
      return () => { doneListeners.delete(listener); };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const stop of stops.splice(0)) stop();
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const entry of tracked.values()) {
        entry.stopReady?.();
        entry.ready?.close();
        entry.account?.close();
      }
      listeners.clear();
    },
  };
}

function tableRoute(route: RouterRoute): TableRoute {
  const out: TableRoute = { id: route.id, pattern: route.pattern, screen: route.screen ?? route.id };
  if (route.query) out.query = route.query;
  if (route.context !== undefined) out.context = route.context;
  if (route.website) out.website = true;
  if (route.onError) out.onError = route.onError;
  return out;
}

function guardOf(route: RouterRoute) {
  return route.query ? { pattern: route.pattern, query: route.query } : { pattern: route.pattern };
}

function savedSession(router: unknown) {
  return router === undefined ? null : { version: COMPAT.sessionState, state: router };
}

function missing(id: string): never {
  throw new GenesisError("NOT_FOUND", `No context ${id}`);
}

function absolute(url: string | null, base: string): string | null {
  if (url === null) return null;
  try { return new URL(url, base).href; } catch { return null; }
}

/** A watch value is truthy when its single value is, or when its list has records. */
function truthy(value: { value: unknown; order: readonly string[] }) {
  return value.order.length > 0 || Boolean(value.value);
}

function sameStatus(a: RouteStatus, b: RouteStatus) {
  return a.status === b.status && a.routeId === b.routeId && a.params === b.params && a.stale === b.stale
    && a.error === b.error && a.signedIn === b.signedIn && a.url === b.url;
}
