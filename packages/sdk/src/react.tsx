import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { currentScreen } from "@genesis/core";
import { createForeground, type Foreground } from "./foreground.js";
import type { NavigateTarget, SourceView, Storage, StorageBatch, StoredDocument } from "./types.js";

export type { Foreground } from "./foreground.js";

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

/** Re-renders on every runtime change. */
function useRuntime(): Foreground {
  const foreground = useForeground();
  useSyncExternalStore(foreground.subscribe, foreground.version);
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

export function useNavigation() {
  const foreground = useRuntime();
  const state = foreground.navigation.state();
  return {
    screen: currentScreen(state),
    stack: state.stack,
    website: state.website,
    navigate: foreground.navigation.navigate as (target: NavigateTarget) => Promise<void>,
    back: foreground.navigation.back,
    setLeaveGuard: foreground.navigation.setLeaveGuard,
  };
}

/** The snapshot for the current screen's page. `T` is the applet's data type for that route. */
export function useScreenSource<T>(): SourceView<T> {
  const foreground = useRuntime();
  return foreground.sources.forScreen<T>(currentScreen(foreground.navigation.state()));
}

/** The latest snapshot of `sourceId`, whatever page it shows. */
export function useSource<T>(sourceId: string): SourceView<T> {
  return useRuntime().sources.latest<T>(sourceId);
}

/**
 * Every document in `collection`, reloaded after each change to it. `storage` defaults to the
 * host's storage; pass an applet's own implementation, such as one over its backend, to use that.
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

  const commit = useCallback((batch: StorageBatch) => storage.commit(batch), [storage]);
  const put = useCallback((key: string, value: T, expectedRevision?: number | null) =>
    storage.commit({
      checks: expectedRevision === undefined ? [] : [{ collection, key, expectedRevision }],
      puts: [{ collection, key, value }],
    }), [storage, collection]);
  const remove = useCallback((key: string) => storage.commit({ deletes: [{ collection, key }] }), [storage, collection]);
  return { ...state, put, remove, commit };
}

/** `request(path, options)` for a declared service. Shell failures throw `ServiceError`. */
export function useService(serviceId: string) {
  const foreground = useForeground();
  return useCallback(<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}) =>
    foreground.services.request<T>(serviceId, path, options), [foreground, serviceId]);
}

/** Restoring stops after this long, or as soon as the person scrolls. */
const RESTORE_MS = 1500;

/** A ref callback for the current screen's scroll container: restores and records its position. */
export function useScrollMemory() {
  const foreground = useForeground();
  const { key } = currentScreen(useSyncExternalStore(foreground.subscribe, foreground.navigation.state));
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
    restore();
    element.addEventListener("scroll", record, { passive: true });
    element.addEventListener("touchstart", stopRestoring, { passive: true });
    element.addEventListener("wheel", stopRestoring, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("scroll", record);
      element.removeEventListener("touchstart", stopRestoring);
      element.removeEventListener("wheel", stopRestoring);
    };
  }, [foreground, key]);
}

/** A scroll container that keeps its position per screen. */
export function ScrollMemory(props: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} ref={useScrollMemory()} />;
}

/** Runs `callback` when the applet returns from the background and when the website sheet closes. */
export function useAppResume(callback: () => void) {
  const foreground = useForeground();
  const latest = useRef(callback);
  latest.current = callback;
  useEffect(() => foreground.onResume(() => latest.current()), [foreground]);
}

/** `act(intent)` for a source's adapter, with the pending state and the last error. */
export function useIntent(sourceId: string) {
  const foreground = useForeground();
  const [state, setState] = useState<{ pending: boolean; error: unknown }>({ pending: false, error: null });
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const act = useCallback(async (intent: Record<string, unknown>) => {
    setState({ pending: true, error: null });
    try {
      await foreground.act(sourceId, intent);
      if (mounted.current) setState({ pending: false, error: null });
    } catch (error) {
      if (mounted.current) setState({ pending: false, error });
      throw error;
    }
  }, [foreground, sourceId]);
  return { act, ...state };
}
