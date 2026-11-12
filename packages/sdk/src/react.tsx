import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import type { ActionResult, ContextState, Presentation, Screen } from "@genesis/core";
import { createForeground, type CurrentScreen, type Foreground, type NavigateTarget, type PendingAction } from "./foreground.js";
import type { ContextStore, RegionState } from "./store.js";
import type { ErrorInfo, PageState, Record, Storage, StorageBatch, StoredDocument } from "./types.js";

export type { ActionCall, CurrentScreen, Foreground, NavigateTarget, PendingAction } from "./foreground.js";

const GenesisContext = createContext<Foreground | null>(null);

export function GenesisProvider({ foreground, children }: { foreground: Foreground; children?: ReactNode }) {
  return <GenesisContext.Provider value={foreground}>{children}</GenesisContext.Provider>;
}

/** The foreground runtime of the surrounding `GenesisProvider`. */
export function useForeground(): Foreground {
  const foreground = useContext(GenesisContext);
  if (!foreground) throw new Error("Genesis hooks need mountForeground or GenesisProvider");
  return foreground;
}

/** Reports `ui.ready` after the first committed layout has been painted. */
function Ready({ foreground, children }: { foreground: Foreground; children?: ReactNode }) {
  useLayoutEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => foreground.ready()));
  }, [foreground]);
  return children;
}

/**
 * Connects to the host, renders `element` into `#root` (or `container`), reports the first
 * layout, and unmounts when the host retires the document.
 */
export async function mountForeground(element: ReactNode, container?: HTMLElement): Promise<Foreground> {
  const target = container ?? document.getElementById("root") ?? document.body.appendChild(document.createElement("div"));
  const foreground = await createForeground();
  const root = createRoot(target);
  foreground.onRetired(() => root.unmount());
  root.render(
    <GenesisProvider foreground={foreground}>
      <Ready foreground={foreground}>{element}</Ready>
    </GenesisProvider>,
  );
  return foreground;
}

/** The coordinator state; re-renders on presentation, overlay and history changes only. */
function useCoordinator() {
  const foreground = useForeground();
  return useSyncExternalStore(foreground.navigation.subscribe, foreground.navigation.state);
}

/** The context a hook reads: the given one, else the active one. */
function useContextId(contextId?: string): string {
  const state = useCoordinator();
  return contextId ?? state.active;
}

/**
 * A value selected from one context's store entry. It listens to that context only and
 * re-renders only when the selected value's identity changes.
 */
function useContextSelect<T>(contextId: string, select: (context: ContextStore | undefined) => T): T {
  const { store } = useForeground();
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener, contextId), [store, contextId]);
  return useSyncExternalStore(subscribe, () => select(store.context(contextId)));
}

const samePage = (a: PageView, b: PageView) =>
  a.pageId === b.pageId && a.status === b.status && a.stale === b.stale && a.generation === b.generation
  && a.params === b.params && a.error === b.error && a.account === b.account && a.url === b.url;

export type PageView = PageState & { url: string | null };

function pageOf(context: ContextStore | undefined, account: string | null): PageView {
  return {
    pageId: context?.pageId ?? null,
    status: context?.status ?? "loading",
    stale: context ? context.stale && context.content : false,
    generation: context?.view?.generation ?? null,
    params: context?.params ?? EMPTY_PARAMS,
    error: (context?.error ?? null) as ErrorInfo | null,
    account,
    url: context?.url ?? null,
  };
}

/** The page a context shows, the active context by default. Patches to its regions do not re-render it. */
export function usePage(contextId?: string): PageView {
  const { store } = useForeground();
  const id = useContextId(contextId);
  const cache = useRef<PageView | null>(null);
  // Every store change can change the account, so this listens to all of them and keeps its snapshot while nothing it shows changed.
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const snapshot = useCallback(() => {
    const next = pageOf(store.context(id), store.state().account);
    if (!cache.current || !samePage(cache.current, next)) cache.current = next;
    return cache.current;
  }, [store, id]);
  return useSyncExternalStore(subscribe, snapshot);
}

const EMPTY_PARAMS: { [name: string]: string } = Object.freeze({}) as { [name: string]: string };

export interface RegionView<T = unknown> {
  /** Keys in page order. A single region has its record's key, or none. */
  order: readonly string[];
  get(key: string): Record<T> | undefined;
  complete: boolean;
  status: "ready" | "error" | "missing";
  error: ErrorInfo | null;
  /** Keys are positions: record actions are unavailable. */
  ephemeral: boolean;
}

const views = new WeakMap<RegionState, RegionView>();
const MISSING: RegionView = Object.freeze({
  order: Object.freeze([]) as readonly string[], get: () => undefined, complete: false, status: "missing", error: null, ephemeral: false,
}) as RegionView;

function regionView(region: RegionState | undefined): RegionView {
  if (!region) return MISSING;
  let view = views.get(region);
  if (view) return view;
  if (region.kind === "collection") {
    const { records } = region;
    view = {
      order: region.order.filter(key => records[key] !== undefined),
      get: key => records[key] as Record | undefined,
      complete: region.complete, status: region.status, error: region.error, ephemeral: region.ephemeral,
    };
  } else {
    const { record } = region;
    view = {
      order: record ? [record.key] : [],
      get: key => (record && record.key === key ? record as Record : undefined),
      complete: true, status: region.status, error: region.error, ephemeral: false,
    };
  }
  views.set(region, view);
  return view;
}

/**
 * A region of the page a context shows. Its identity changes only when the region does; a
 * record's identity changes only when that record does, so `memo` rows keyed by record stay put.
 */
export function useRegion<T = unknown>(name: string, contextId?: string): RegionView<T> {
  return useContextSelect(useContextId(contextId), context => regionView(context?.regions[name])) as RegionView<T>;
}

/** One record of a region, or undefined. A single region's record is returned whatever `key` is when `key` is null. */
export function useRecord<T = unknown>(name: string, key: string | null, contextId?: string): Record<T> | undefined {
  return useContextSelect(useContextId(contextId), context => recordOf(context?.regions[name], key)) as Record<T> | undefined;
}

function recordOf(region: RegionState | undefined, key: string | null): Record | undefined {
  if (!region) return undefined;
  if (region.kind === "single") return (key === null || region.record?.key === key ? region.record ?? undefined : undefined) as Record | undefined;
  return key === null ? undefined : region.records[key] as Record | undefined;
}

/**
 * Runs `name` on a record of `region` (or on the page without a region) in a context, the
 * active one at call time by default. Identical pending calls share one promise; the promise
 * never rejects and settles with the outcome.
 */
export function useAction<A = unknown>(name: string, region?: string | null, contextId?: string) {
  const foreground = useForeground();
  return useCallback((key: string | null, args?: A): Promise<ActionResult> =>
    foreground.actions.act({
      context: contextId ?? foreground.navigation.state().active, region: region ?? null, key, name, args,
    }), [foreground, name, region, contextId]);
}

/** The pending actions on a record, for optimistic display; an empty list when there are none. */
export function usePending(region: string | null, key: string | null, contextId?: string): readonly PendingAction[] {
  const foreground = useForeground();
  const id = useContextId(contextId);
  return useSyncExternalStore(foreground.actions.subscribe, () => foreground.actions.pending(id, region, key));
}

export interface Navigation {
  /** The active context's presentation. */
  presentation: Presentation;
  active: string;
  contexts: { [id: string]: ContextState };
  overlay: readonly Screen[];
  /** The screen to render, or null when the active context shows a URL without a route. */
  screen: CurrentScreen | null;
  /** The context whose website is shown, or null. */
  revealed: string | null;
  navigate(target: NavigateTarget): void;
  back(): void;
  select(contextId: string): void;
  reload(contextId?: string): void;
  viewWebsite(contextId?: string): void;
  done(contextId?: string): void;
  setLeaveGuard(message: string | null): void;
}

export function useNavigation(): Navigation {
  const foreground = useForeground();
  const state = useCoordinator();
  const { navigation } = foreground;
  return useMemo(() => ({
    presentation: navigation.presentation(state.active),
    active: state.active,
    contexts: state.contexts,
    overlay: state.overlay,
    screen: navigation.screen(),
    revealed: navigation.revealed(),
    navigate: navigation.navigate,
    back: navigation.back,
    select: navigation.select,
    reload: navigation.reload,
    viewWebsite: navigation.viewWebsite,
    done: navigation.done,
    setLeaveGuard: navigation.setLeaveGuard,
  }), [navigation, state]);
}

/**
 * Every document in `collection`, reloaded after each change to it. `storage` defaults to the
 * host's storage; pass an applet's own implementation, such as one over its backend, to use that.
 *
 * Every write is checked against a revision, so it fails with `CONFLICT` when the document
 * changed since it was read. `put(key, value)` and `remove(key)` check against the revision the
 * hook last loaded (absent for a key it has not loaded); `put(key, value, expectedRevision)`
 * checks against the one given, `null` meaning the document must not exist yet. `commit` sends
 * the batch as it is, so it must carry a check for each document it changes.
 */
export function useRecords<T>(collection: string, options: { storage?: Storage } = {}) {
  const foreground = useForeground();
  const storage = options.storage ?? foreground.storage;
  const [state, setState] = useState<{ records: StoredDocument<T>[]; loading: boolean; error: unknown }>(
    { records: [], loading: true, error: null });

  useEffect(() => {
    let active = true;
    let serial = 0;
    async function load() {
      const current = ++serial;
      try {
        const records: StoredDocument<T>[] = [];
        let afterKey: string | undefined;
        do {
          const page = await storage.list<T>(collection, afterKey === undefined ? {} : { afterKey });
          records.push(...page.entries);
          afterKey = page.nextAfterKey ?? undefined;
        } while (afterKey !== undefined);
        if (active && current === serial) setState({ records, loading: false, error: null });
      } catch (error) {
        if (active && current === serial) setState(previous => ({ ...previous, loading: false, error }));
      }
    }
    void load();
    const stop = storage.onChanged(change => {
      if (change.changes.some(entry => entry.collection === collection)) void load();
    });
    return () => { active = false; stop(); };
  }, [storage, collection]);

  // The revisions last loaded, read when a write runs rather than when it was created.
  const loaded = useRef(state.records);
  loaded.current = state.records;
  const revisionOf = useCallback((key: string) => loaded.current.find(record => record.key === key)?.revision ?? null, []);

  const commit = useCallback((batch: StorageBatch) => storage.commit(batch), [storage]);
  const put = useCallback((key: string, value: T, expectedRevision?: number | null) =>
    storage.commit({
      checks: [{ collection, key, expectedRevision: expectedRevision === undefined ? revisionOf(key) : expectedRevision }],
      puts: [{ collection, key, value }],
    }), [storage, collection, revisionOf]);
  const remove = useCallback((key: string) =>
    storage.commit({ checks: [{ collection, key, expectedRevision: revisionOf(key) }], deletes: [{ collection, key }] }),
  [storage, collection, revisionOf]);
  return { ...state, put, remove, commit };
}

/** `request(path, options)` for a declared service. Shell failures throw `ServiceError`. */
export function useService(serviceId: string) {
  const foreground = useForeground();
  return useCallback(<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}) =>
    foreground.services.request<T>(serviceId, path, options), [foreground, serviceId]);
}

/** `post(input)` notifies the user; see `Foreground["notifications"]`. */
export function useNotifications() {
  return useForeground().notifications;
}

/** Restoring stops after this long, or as soon as the person scrolls. */
const RESTORE_MS = 1500;

/**
 * A ref callback for the current screen's scroll container. Positions are kept per context
 * history entry (and per overlay screen), so Back returns to where the person was; selecting
 * the shown tab again on its start page scrolls to top.
 */
export function useScrollMemory() {
  const foreground = useForeground();
  useCoordinator();
  const screen = foreground.navigation.screen();
  const key = screen?.key ?? `${foreground.navigation.state().active}:none`;
  const context = screen && !screen.overlay ? screen.context : null;
  return useCallback((element: HTMLElement | null) => {
    if (!element) return;
    const target = foreground.scroll.get(key) ?? 0;
    let restoring = target > 0;
    const started = performance.now();
    let frame = 0;
    const restore = () => {
      if (!restoring) return;
      element.scrollTop = target;
      if (Math.abs(element.scrollTop - target) < 2 || performance.now() - started > RESTORE_MS) restoring = false;
      else frame = requestAnimationFrame(restore);
    };
    const stopRestoring = () => { restoring = false; };
    const record = () => { if (!restoring) foreground.scroll.set(key, element.scrollTop); };
    const stopTop = foreground.navigation.onScrollToTop(id => {
      if (id !== context) return;
      restoring = false;
      element.scrollTo({ top: 0, behavior: "smooth" });
    });
    restore();
    element.addEventListener("scroll", record, { passive: true });
    element.addEventListener("touchstart", stopRestoring, { passive: true });
    element.addEventListener("wheel", stopRestoring, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      stopTop();
      element.removeEventListener("scroll", record);
      element.removeEventListener("touchstart", stopRestoring);
      element.removeEventListener("wheel", stopRestoring);
    };
  }, [foreground, key, context]);
}

/** A scroll container that keeps its position per context history entry. */
export function ScrollMemory(props: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} ref={useScrollMemory()} />;
}

/** Runs `callback` when the applet returns from the background and when the person leaves the website with Done. */
export function useAppResume(callback: () => void) {
  const foreground = useForeground();
  const latest = useRef(callback);
  latest.current = callback;
  useEffect(() => foreground.onResume(() => latest.current()), [foreground]);
}
