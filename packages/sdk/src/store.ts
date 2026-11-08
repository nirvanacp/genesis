import { entryKey } from "@genesis/core";
import type { Page, PageRecord, PageStatus, Patch, Region as WireRegion, RegionPatch, RegionStatus, ViewId } from "@genesis/core";
import type { ErrorInfo } from "./types.js";

/**
 * The record store: what each context's documents published, as screens read it. Pure apart
 * from its listeners. It applies full pages and patches in stream order, keeps the last ready
 * page per history entry so Back shows it at once, and applies the account rule. It never
 * decides presentation; the foreground runtime passes what it learns on to the coordinator.
 */

export type RegionState =
  | {
    kind: "collection";
    status: RegionStatus;
    error: ErrorInfo | null;
    /** Keys in page order. Records may hold keys that are not in the order yet (a split patch). */
    order: string[];
    complete: boolean;
    /** Keys are positions, so record actions are unavailable. */
    ephemeral: boolean;
    records: { [key: string]: PageRecord };
  }
  | { kind: "single"; status: RegionStatus; error: ErrorInfo | null; record: PageRecord | null };

/** The ready content a screen shows: a page's identity and regions. */
export interface ShownPage {
  url: string;
  pageId: string | null;
  routeId: string | null;
  params: { [name: string]: string };
  regions: { [name: string]: RegionState };
}

export interface ContextStore {
  /** The highest generation reported for the context, by a navigation or a page. */
  generation: number;
  /** The live document's stream: the view and epoch of its last full page and the last applied `seq`. */
  view: ViewId | null;
  epoch: number;
  seq: number;
  /** Regions the live page declared; a patch that names another region needs a resync. */
  live: string[];
  /** The fields below describe the live page. False after a navigation, until its document publishes. */
  attached: boolean;
  /** The URL of what is shown. */
  url: string | null;
  pageId: string | null;
  routeId: string | null;
  params: { [name: string]: string };
  regions: { [name: string]: RegionState };
  status: PageStatus;
  error: ErrorInfo | null;
  signInUrl: string | null;
  /** The regions come from an earlier ready page: a history entry, or records kept while the page reloads or fails. */
  stale: boolean;
  /** The regions come from a ready page (current or stale). */
  content: boolean;
  /** The context's current history entry, from the last committed navigation. */
  entry: { index: number; url: string } | null;
  /** The last ready page per history index, bounded by `historyEntriesMax`, validated by URL. */
  history: Map<number, ShownPage>;
}

export interface StoreState {
  /** The account the pages report, shared by every context; null when signed out or not reported yet. */
  account: string | null;
  contexts: { [id: string]: ContextStore };
}

/** `resync`: the patch does not extend what the store holds, so the context must send a full page. */
export interface ApplyResult {
  outcome: "applied" | "dropped" | "resync";
  /** The account differs from the one every context showed until now. */
  accountChanged: boolean;
}

export interface Navigated {
  url: string;
  generation: number;
  index: number;
  size: number;
}

/** The route of a URL, for what a context shows before its document publishes. */
export interface RouteInfo {
  pageId: string | null;
  routeId: string | null;
  params: { [name: string]: string };
}

export interface Store {
  state(): StoreState;
  context(id: string): ContextStore | undefined;
  applyPage(id: string, generation: number, page: Page): ApplyResult;
  applyPatch(id: string, generation: number, patch: Patch): ApplyResult;
  /** A committed navigation: the context shows its history entry for `index` or nothing until its page arrives. */
  navigated(id: string, navigation: Navigated, route?: RouteInfo): void;
  /** The context has no document that will publish (refused or never bound). */
  gone(id: string, error: ErrorInfo): void;
  /** Calls `listener` after changes to `contextId`, or to anything when it is omitted. */
  subscribe(listener: () => void, contextId?: string): () => void;
}

const NO_ROUTE: RouteInfo = { pageId: null, routeId: null, params: {} };

export function createStore(contextIds: string[], options: { historyEntriesMax: number }): Store {
  const contexts: { [id: string]: ContextStore } = {};
  for (const id of contextIds) contexts[id] = emptyContext();
  let state: StoreState = { account: null, contexts };
  /** False until the first page reports an account; the first report is not a change. */
  let accountKnown = false;
  const listeners = new Map<string | null, Set<() => void>>();

  function emit(ids: string[] | null) {
    const sets = ids === null ? [...listeners.values()] : [listeners.get(null), ...ids.map(id => listeners.get(id))];
    const called = new Set<() => void>();
    for (const set of sets) {
      for (const listener of [...(set ?? [])]) {
        if (called.has(listener)) continue;
        called.add(listener);
        listener();
      }
    }
  }

  function update(id: string, context: ContextStore) {
    state = { ...state, contexts: { ...state.contexts, [id]: context } };
  }

  /** Keeps the context's shown page as the history entry of its current index, when they agree. */
  function remember(context: ContextStore) {
    const { entry } = context;
    if (!context.attached || context.status !== "ready" || !entry || !sameUrl(entry.url, context.url)) return;
    const { history } = context;
    history.delete(entry.index);
    history.set(entry.index, shown(context));
    while (history.size > options.historyEntriesMax) history.delete(history.keys().next().value!);
  }

  /**
   * The account rule. Only a ready or `auth` page that shows the account is evidence of it: a
   * page that is still loading may not show it yet, and some pages never do. On a change every history entry goes, and the other
   * contexts' records are marked stale until they reload.
   */
  function report(id: string, account: string | null | undefined, status: PageStatus): boolean {
    if (account === undefined || (status !== "ready" && status !== "auth")) return false;
    if (!accountKnown) {
      accountKnown = true;
      if (state.account !== account) state = { ...state, account };
      return false;
    }
    if (account === state.account) return false;
    const next: { [id: string]: ContextStore } = {};
    for (const [other, context] of Object.entries(state.contexts)) {
      context.history.clear();
      next[other] = other === id || !context.content || context.stale ? context : { ...context, stale: true };
    }
    state = { account, contexts: next };
    remember(next[id]);
    return true;
  }

  const result = (outcome: ApplyResult["outcome"], accountChanged = false): ApplyResult => ({ outcome, accountChanged });

  return {
    state: () => state,
    context: id => state.contexts[id],

    applyPage(id, generation, page) {
      const context = state.contexts[id];
      if (!context || generation < context.generation) return result("dropped");
      const { view } = context;
      if (view && generation === view.generation && page.view.n < view.n) return result("dropped");

      const stream = {
        generation,
        view: page.view,
        epoch: page.epoch,
        seq: 0,
        live: Object.keys(page.regions),
        attached: true,
        status: page.status,
        error: page.error ?? null,
        signInUrl: page.signInUrl ?? null,
      };
      let next: ContextStore;
      const fallback = page.status === "loading" || page.status === "error" ? staleFor(context, page.view.url) : null;
      if (fallback) {
        // Loading again or failed: keep the last ready records for this URL, marked stale.
        next = { ...context, ...stream, ...fallback, stale: true, content: true };
      } else {
        next = {
          ...context,
          ...stream,
          url: page.view.url,
          pageId: page.pageId,
          routeId: page.routeId,
          params: page.params,
          regions: regionsOf(page.regions, context.regions),
          stale: false,
          content: page.status === "ready",
        };
      }
      update(id, next);
      remember(next);
      const changed = report(id, page.account, page.status);
      emit(changed ? null : [id]);
      return result("applied", changed);
    },

    applyPatch(id, generation, patch) {
      const context = state.contexts[id];
      if (!context || generation < context.generation) return result("dropped");
      const { view } = context;
      // A patch extends exactly the stream the store holds: same document, view and epoch, and the next seq.
      const sameView = view !== null && generation === view.generation && patch.view.n === view.n;
      if (!sameView || patch.epoch !== context.epoch || patch.base !== context.seq) return result("resync");
      if (!context.attached) {
        // The context shows another entry; the patch still advances the stream it extends.
        update(id, { ...context, seq: patch.seq });
        return result("dropped");
      }
      const regions = patchRegions(context, patch.regions);
      if (regions === null) return result("resync");
      const next: ContextStore = { ...context, seq: patch.seq, regions };
      update(id, next);
      remember(next);
      const changed = patch.account !== undefined && report(id, patch.account, next.status);
      emit(changed ? null : [id]);
      return result("applied", changed);
    },

    navigated(id, navigation, route = NO_ROUTE) {
      const context = state.contexts[id];
      if (!context || navigation.generation < context.generation) return;
      const { history } = context;
      for (const index of [...history.keys()]) {
        const entry = history.get(index)!;
        if (index >= navigation.size || (index === navigation.index && !sameUrl(entry.url, navigation.url))) history.delete(index);
      }
      const base = { ...context, generation: navigation.generation, entry: { index: navigation.index, url: navigation.url } };
      let next: ContextStore;
      if (sameUrl(context.url, navigation.url)) {
        if (context.attached && context.view?.generation !== navigation.generation) {
          // The same URL in a new document, such as a reload: the records stay, stale, until it publishes.
          next = { ...base, attached: false, status: "loading", error: null, stale: context.content };
        } else {
          next = base; // The page arrived first, or the same entry again.
        }
      } else {
        const entry = history.get(navigation.index);
        next = entry
          ? { ...base, ...entry, attached: false, status: "loading", error: null, stale: true, content: true }
          : {
            ...base, ...route, url: navigation.url, regions: {}, attached: false,
            status: "loading", error: null, signInUrl: null, stale: false, content: false,
          };
      }
      update(id, next);
      remember(next);
      emit([id]);
    },

    gone(id, error) {
      const context = state.contexts[id];
      if (!context) return;
      update(id, { ...context, attached: false, status: "error", error, stale: context.content });
      emit([id]);
    },

    subscribe(listener, contextId) {
      const key = contextId ?? null;
      let set = listeners.get(key);
      if (!set) listeners.set(key, (set = new Set()));
      set.add(listener);
      return () => { set!.delete(listener); };
    },
  };
}

function emptyContext(): ContextStore {
  return {
    generation: 0, view: null, epoch: 0, seq: 0, live: [], attached: false,
    url: null, pageId: null, routeId: null, params: {}, regions: {},
    status: "loading", error: null, signInUrl: null, stale: false, content: false,
    entry: null, history: new Map(),
  };
}

function sameUrl(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && entryKey(a) === entryKey(b);
}

function shown(context: ContextStore): ShownPage {
  return { url: context.url!, pageId: context.pageId, routeId: context.routeId, params: context.params, regions: context.regions };
}

/** The ready records the context can keep showing for `url`: what it shows now, else its history entry. */
function staleFor(context: ContextStore, url: string): ShownPage | null {
  if (context.content && sameUrl(context.url, url)) return shown(context);
  const { entry } = context;
  const remembered = entry && sameUrl(entry.url, url) ? context.history.get(entry.index) : undefined;
  return remembered && sameUrl(remembered.url, url) ? remembered : null;
}

function records(items: PageRecord[], into: { [key: string]: PageRecord } = Object.create(null)) {
  for (const record of items) into[record.key] = record;
  return into;
}

function regionOf(region: WireRegion): RegionState {
  if (region.kind === "single") return { kind: "single", status: region.status, error: region.error ?? null, record: region.record };
  return {
    kind: "collection",
    status: region.status,
    error: region.error ?? null,
    order: region.items.map(record => record.key),
    complete: region.complete,
    ephemeral: region.ephemeral === true,
    records: records(region.items),
  };
}

/**
 * The regions of a full page. Records whose JSON did not change keep their objects, and so does a
 * region with no change at all, so components reading them do not render again.
 */
function regionsOf(wire: { [name: string]: WireRegion }, previous: { [name: string]: RegionState }) {
  const regions: { [name: string]: RegionState } = {};
  for (const [name, region] of Object.entries(wire)) {
    const next = regionOf(region);
    const old = previous[name];
    regions[name] = old ? reuse(old, next) : next;
  }
  return regions;
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

function reuse(old: RegionState, next: RegionState): RegionState {
  if (old.kind === "single" || next.kind === "single") {
    if (old.kind !== "single" || next.kind !== "single") return next;
    if (same(old.record, next.record)) next.record = old.record;
    return old.record === next.record && old.status === next.status && same(old.error, next.error) ? old : next;
  }
  let unchanged = old.order.length === next.order.length && old.complete === next.complete
    && old.ephemeral === next.ephemeral && old.status === next.status && same(old.error, next.error);
  for (const [i, key] of next.order.entries()) {
    const previous = old.records[key];
    if (previous && same(previous, next.records[key])) next.records[key] = previous;
    else unchanged = false;
    if (old.order[i] !== key) unchanged = false;
  }
  return unchanged ? old : next;
}

/** Applies a patch's regions, or returns null when it names a region the live page does not have. */
function patchRegions(context: ContextStore, patches: { [name: string]: RegionPatch }) {
  let regions = context.regions;
  for (const [name, patch] of Object.entries(patches)) {
    const old = context.live.includes(name) ? regions[name] : undefined;
    if (!old) return null;
    let next: RegionState;
    if (patch.kind === "replace") {
      next = regionOf(patch.region);
    } else if (patch.kind === "single") {
      if (old.kind !== "single") return null;
      next = {
        ...old,
        record: patch.record,
        status: patch.status ?? old.status,
        error: patch.error === undefined ? old.error : patch.error,
      };
    } else {
      if (old.kind !== "collection") return null;
      next = {
        ...old,
        complete: patch.complete ?? old.complete,
        status: patch.status ?? old.status,
        error: patch.error === undefined ? old.error : patch.error,
      };
      if (patch.upsert?.length || patch.remove?.length) {
        next.records = records(patch.upsert ?? [], Object.assign(Object.create(null), old.records));
        for (const key of patch.remove ?? []) delete next.records[key];
      }
      if (patch.order) {
        next.order = patch.order;
        // Records the order no longer names are gone; keys it names arrived in this or earlier patches.
        const keep = new Set(patch.order);
        for (const key of Object.keys(next.records)) {
          if (keep.has(key)) continue;
          if (next.records === old.records) next.records = Object.assign(Object.create(null), old.records);
          delete next.records[key];
        }
      } else if (patch.remove?.length) {
        const removed = new Set(patch.remove);
        next.order = old.order.filter(key => !removed.has(key));
      }
    }
    if (regions === context.regions) regions = { ...regions };
    regions[name] = next;
  }
  return regions;
}
