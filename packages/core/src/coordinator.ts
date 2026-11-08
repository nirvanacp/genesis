import { COMPAT } from "./compat.js";
import type { Manifest } from "./manifest.js";
import type { NavigateMode, PageStatus, SavedSession, ViewId } from "./protocol.js";
import { entryKey, matchRoute } from "./routes.js";

/**
 * The presentation coordinator: a pure reducer, run in the foreground runtime, that decides per
 * context whether the applet screen (`custom`) or the website itself (`website`) is shown, keeps
 * the overlay stack, pins and readiness deadlines, and orders Back. It never touches the DOM or
 * the bridge; the foreground runtime turns its effects into calls.
 */

/** An overlay screen: applet data shown above the active context. */
export interface Screen {
  /** Unique per entry; scroll memory uses it. */
  key: string;
  /** A declared screen name from `foreground.screens`. */
  id: string;
  params: Record<string, string>;
}

export type Presentation = "custom" | "website";

export interface ContextPage {
  status: PageStatus;
  pageId: string | null;
  routeId: string | null;
  /** The view that reported this status; null until the current view reports. */
  view: ViewId | null;
  /** The store holds a stale ready page for this history entry. */
  stale: boolean;
  /** `documentReadyMs` passed for this view before it became ready. */
  expired: boolean;
}

export interface ContextState {
  id: string;
  /** The URL of the current view. */
  url: string | null;
  generation: number;
  /** Highest view `n` reported in this generation; -1 before the first. */
  seen: number;
  index: number;
  size: number;
  canGoBack: boolean;
  canGoForward: boolean;
  page: ContextPage;
  pin: "none" | "user" | "auth";
  /** Token of the readiness deadline that applies now. Each new view takes a new token. */
  deadline: number;
}

export interface CoordinatorState {
  /** Always names a context, also while an overlay is open. */
  active: string;
  overlay: Screen[];
  contexts: Record<string, ContextState>;
  leaveGuard: { message: string } | null;
}

export type CoordinatorEvent =
  | {
    type: "context.navigated"; id: string; url: string; generation: number;
    index: number; size: number; canGoBack: boolean; canGoForward: boolean; sameDocument: boolean; reload: boolean;
  }
  | {
    type: "context.page"; id: string; generation: number; view: ViewId; status: PageStatus;
    pageId: string | null; routeId: string | null; account: string | null;
    /** Whether the store holds a stale page for the context's current history index. */
    stale: boolean;
    signInUrl?: string | null;
  }
  /** Ignored unless `token` is the context's current deadline. */
  | { type: "deadline"; id: string; token: number }
  | { type: "user.viewWebsite"; id: string }
  | { type: "user.done"; id: string }
  | { type: "navigate.url"; url: string; context?: string; mode: NavigateMode }
  | { type: "navigate.screen"; screen: Screen; mode: "push" | "replace" | "root" }
  | { type: "select"; id: string }
  | { type: "back" }
  | { type: "guard"; guard: { message: string } | null }
  | { type: "context.gone"; id: string };

export type CoordinatorEffect =
  | { type: "reveal"; id: string }
  | { type: "cover" }
  | { type: "context.navigate"; id: string; url: string; mode: NavigateMode }
  | { type: "context.back"; id: string }
  | { type: "context.reload"; id: string }
  /** Send `{ type: "deadline", id, token }` after `limits.documentReadyMs`. */
  | { type: "schedule"; id: string; token: number }
  | { type: "leave" }
  | { type: "confirmLeave"; message: string };

type Result = { state: CoordinatorState; effects: CoordinatorEffect[] };

const LOADING: ContextPage = { status: "loading", pageId: null, routeId: null, view: null, stale: false, expired: false };

export function initialState(manifest: Pick<Manifest, "contexts">): CoordinatorState {
  const contexts: Record<string, ContextState> = {};
  for (const context of manifest.contexts) contexts[context.id] = freshContext(context.id, context.startUrl);
  return { active: manifest.contexts[0].id, overlay: [], contexts, leaveGuard: null };
}

function freshContext(id: string, url: string | null): ContextState {
  return {
    id, url, generation: 0, seen: -1, index: 0, size: 0, canGoBack: false, canGoForward: false,
    page: LOADING, pin: "none", deadline: 0,
  };
}

/**
 * Presentation of one context. A pin always shows the website. Otherwise a URL with a route
 * shows the applet screen while its page is ready, while it loads within the deadline, and on
 * error while a stale page exists within the deadline; everything else shows the website.
 */
export function presentation(context: ContextState, manifest: Pick<Manifest, "origins" | "routes">): Presentation {
  if (context.pin !== "none") return "website";
  if (context.url === null) return "custom";
  if (matchRoute(manifest, context.url).kind !== "route") return "website";
  const { status, stale, expired } = context.page;
  if (status === "ready") return "custom";
  if (status === "loading") return expired ? "website" : "custom";
  if (status === "error") return stale && !expired ? "custom" : "website";
  return "website";
}

/** The context whose WebView is revealed: the active one, when no overlay covers it and it presents as website. */
export function revealed(state: CoordinatorState, manifest: Pick<Manifest, "origins" | "routes">): string | null {
  const active = state.contexts[state.active];
  return state.overlay.length === 0 && active && presentation(active, manifest) === "website" ? state.active : null;
}

export function reduce(state: CoordinatorState, event: CoordinatorEvent, manifest: Manifest): Result {
  const result = apply(state, event, manifest);
  const before = revealed(state, manifest);
  const after = revealed(result.state, manifest);
  if (after !== before) result.effects.push(after === null ? { type: "cover" } : { type: "reveal", id: after });
  return result;
}

function apply(state: CoordinatorState, event: CoordinatorEvent, manifest: Manifest): Result {
  const effects: CoordinatorEffect[] = [];
  const unchanged = { state, effects };
  switch (event.type) {
    case "context.navigated": {
      const context = state.contexts[event.id];
      if (!context || event.generation < context.generation) return unchanged;
      const moved = sameView(context, event.generation, event.url) ? context : newView(context, event.generation, event.url, effects);
      const next = {
        ...moved,
        index: event.index, size: event.size, canGoBack: event.canGoBack, canGoForward: event.canGoForward,
      };
      return { state: withContext(state, next), effects };
    }

    case "context.page": {
      const context = state.contexts[event.id];
      if (!context || event.generation < context.generation) return unchanged;
      const current = sameView(context, event.generation, event.view.url);
      // A page for another URL is current only when it is newer than every view seen so far.
      if (!current && event.generation === context.generation && event.view.n <= context.seen) return unchanged;
      if (current && event.generation === context.generation && event.view.n < context.seen) return unchanged;
      const moved = current ? context : newView(context, event.generation, event.view.url, effects);
      let pin = moved.pin;
      if (event.status === "auth") {
        if (pin === "none") pin = "auth";
        const target = event.signInUrl ?? null;
        if (target !== null && entryKey(target) !== entryKey(event.view.url)) {
          effects.push({ type: "context.navigate", id: context.id, url: target, mode: "push" });
        }
      } else if (event.status === "ready" && event.account !== null && pin === "auth") {
        pin = "none";
      }
      const next: ContextState = {
        ...moved,
        seen: Math.max(moved.seen, event.view.n),
        pin,
        page: {
          status: event.status, pageId: event.pageId, routeId: event.routeId, view: event.view,
          stale: event.stale, expired: moved.page.expired,
        },
      };
      return { state: withContext(state, next), effects };
    }

    case "deadline": {
      const context = state.contexts[event.id];
      if (!context || event.token !== context.deadline || context.page.status === "ready" || context.page.expired) return unchanged;
      return { state: withContext(state, { ...context, page: { ...context.page, expired: true } }), effects };
    }

    case "user.viewWebsite": {
      const context = state.contexts[event.id];
      if (!context || context.pin === "user") return unchanged;
      return { state: withContext(state, { ...context, pin: "user" }), effects };
    }

    case "user.done": {
      const context = state.contexts[event.id];
      if (!context || context.pin === "none") return unchanged;
      return { state: withContext(state, { ...context, pin: "none" }), effects };
    }

    case "navigate.url": {
      const id = event.context ?? state.active;
      if (!state.contexts[id]) return unchanged;
      effects.push({ type: "context.navigate", id, url: event.url, mode: event.mode });
      return { state: { ...state, active: id, overlay: [], leaveGuard: null }, effects };
    }

    case "navigate.screen": {
      const overlay =
        event.mode === "root" ? [event.screen]
        : event.mode === "replace" ? [...state.overlay.slice(0, -1), event.screen]
        : [...state.overlay, event.screen];
      return { state: { ...state, overlay, leaveGuard: null }, effects };
    }

    case "select": {
      const context = state.contexts[event.id];
      if (!context) return unchanged;
      if (event.id !== state.active || state.overlay.length > 0) {
        return { state: { ...state, active: event.id, overlay: [], leaveGuard: null }, effects };
      }
      // Reselecting the shown tab returns it to its start page; on the start page the screen scrolls to top.
      const start = manifest.contexts.find(c => c.id === event.id)?.startUrl;
      if (start && (context.url === null || entryKey(context.url) !== entryKey(start))) {
        effects.push({ type: "context.navigate", id: event.id, url: start, mode: "push" });
      }
      return { state: { ...state, leaveGuard: null }, effects };
    }

    case "back": {
      if (state.leaveGuard) return { state, effects: [{ type: "confirmLeave", message: state.leaveGuard.message }] };
      if (state.overlay.length > 0) return { state: { ...state, overlay: state.overlay.slice(0, -1) }, effects };
      if (state.contexts[state.active]?.canGoBack) return { state, effects: [{ type: "context.back", id: state.active }] };
      return { state, effects: [{ type: "leave" }] };
    }

    case "guard":
      return { state: { ...state, leaveGuard: event.guard }, effects };

    case "context.gone": {
      const context = state.contexts[event.id];
      if (!context) return unchanged;
      return { state: withContext(state, { ...context, page: { ...LOADING, status: "unsupported" } }), effects };
    }
  }
}

function sameView(context: ContextState, generation: number, url: string): boolean {
  return generation === context.generation && context.url !== null && entryKey(url) === entryKey(context.url);
}

/** The context moved to another view: its page is unknown and a new readiness deadline starts. Pins stay. */
function newView(context: ContextState, generation: number, url: string, effects: CoordinatorEffect[]): ContextState {
  const deadline = context.deadline + 1;
  effects.push({ type: "schedule", id: context.id, token: deadline });
  return {
    ...context,
    url,
    seen: generation === context.generation ? context.seen : -1,
    generation,
    page: LOADING,
    deadline,
  };
}

function withContext(state: CoordinatorState, context: ContextState): CoordinatorState {
  return { ...state, contexts: { ...state.contexts, [context.id]: context } };
}

/** The `session.save` payload: what survives the foreground being destroyed. */
export function serialize(state: CoordinatorState): SavedSession {
  const contexts: Record<string, { url: string | null }> = {};
  for (const [id, context] of Object.entries(state.contexts)) contexts[id] = { url: context.url };
  return { version: COMPAT.sessionState, state: { active: state.active, overlay: state.overlay, contexts } };
}

/**
 * Rebuilds the coordinator from a saved session. Pages, pins and deadlines start over, because
 * the documents report again; leaving the applet clears the pins. Anything that does not fit
 * the manifest, or a session of another version, falls back to `initialState`.
 */
export function restore(saved: SavedSession | null, manifest: Pick<Manifest, "contexts" | "foreground">): CoordinatorState {
  const initial = initialState(manifest);
  if (!saved || saved.version !== COMPAT.sessionState || !isObject(saved.state)) return initial;
  const { active, overlay, contexts } = saved.state;
  const state = { ...initial, contexts: { ...initial.contexts } };
  if (typeof active === "string" && state.contexts[active]) state.active = active;
  if (Array.isArray(overlay)) state.overlay = overlay.filter((screen): screen is Screen => isScreen(screen, manifest.foreground.screens));
  if (isObject(contexts)) {
    for (const id of Object.keys(state.contexts)) {
      const url = isObject(contexts[id]) ? contexts[id].url : undefined;
      if (typeof url === "string") state.contexts[id] = freshContext(id, url);
    }
  }
  return state;
}

function isScreen(value: unknown, screens: string[]): boolean {
  return isObject(value) && typeof value.key === "string" && typeof value.id === "string" && screens.includes(value.id)
    && isObject(value.params) && Object.values(value.params).every(v => typeof v === "string");
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
