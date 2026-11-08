import {
  COMPAT,
  entryKey,
  matchRoute,
  type ActionRequest,
  type ErrorCode,
  type PageRecord,
  type PageStatus,
  type Region as WireRegion,
  type RouteMatch,
  type ViewId,
} from "@genesis/core";
import { connect, GenesisError, type BridgeObject, type Connection } from "../bridge.js";
import { createActions, type Target } from "./actions.js";
import { assignKeys, mergeVirtualized } from "./diff.js";
import type { AdapterDefinition, CollectionRegion, Page, Region, SingleRegion } from "./index.js";
import { invalidate, type Change, type Invalidation, type RegionIndex } from "./invalidate.js";
import { observe, watchNavigation } from "./observe.js";
import { debounce, Publisher, type PageContent } from "./publish.js";

/** Set by the applet build for debug bundles; then the runtime exposes `window.__genesisStats`. */
declare const __GENESIS_DEBUG__: boolean | undefined;

/** Past this many unprocessed changes a batch re-reads every region instead of tracking them. */
const CHANGES_MAX = 10000;

let running = false;

/**
 * Runs the adapter in this document. Called at document start, before any website script, in
 * every context: it captures the bridge and removes it from the page, patches history, says
 * hello, and once bound reads the page and publishes it. Does nothing in a frame, outside a
 * context, or when imported in Node.
 */
export function runAdapter(definition: AdapterDefinition): void {
  if (typeof window === "undefined" || window.top !== window || running) return;
  running = true;
  const scope = window as unknown as { __genesisBridge?: BridgeObject };
  const bridge = scope.__genesisBridge;
  try { delete scope.__genesisBridge; } catch { scope.__genesisBridge = undefined; }
  if (!bridge) return;

  let current: Bound | null = null;
  watchNavigation(() => current?.navigated());
  const bind = () => connect(bridge, location.href).then(
    connection => { current = start(connection, definition); },
    error => console.error("Genesis could not bind this page", error),
  );
  void bind();
  // A page restored from the back-forward cache was retired when it was hidden; bind it again.
  addEventListener("pageshow", event => {
    if (!event.persisted) return;
    current?.stop();
    current = null;
    void bind();
  });
}

interface Bound {
  /** Called after every same-document navigation. */
  navigated(): void;
  stop(): void;
}

/** What the runtime keeps about one region between reads. */
interface RegionState {
  name: string;
  def: Region;
  root: Element | null;
  /** Item elements and extent nodes to record keys. */
  items: WeakMap<Node, string>;
  /** Record key to item element, for actions and re-reads by key. */
  elements: Map<string, Element>;
  dependsOn: Element[];
  dependsOnMissing: boolean;
  value: WireRegion;
}

type CollectionValue = Extract<WireRegion, { kind: "collection" }>;

function start(connection: Connection, definition: AdapterDefinition): Bound {
  const { manifest, limits, generation } = connection.bound;
  const stats = {
    batches: 0, reads: 0, lastBatchReads: 0, pages: 0, patches: 0, lastPublishBytes: 0, resyncs: 0, startedAt: Date.now(),
  };
  const debug = typeof __GENESIS_DEBUG__ !== "undefined" && __GENESIS_DEBUG__;
  if (debug) (window as unknown as { __genesisStats?: unknown }).__genesisStats = stats;
  const publisher = new Publisher(params => {
    if (debug) {
      if ("page" in params) stats.pages++; else stats.patches++;
      stats.lastPublishBytes = JSON.stringify(params).length;
    }
    return connection.request("context.publish", params);
  }, limits);
  let view: ViewId = { generation, n: 0, url: location.href };

  if (connection.bound.compat.adapterApi !== COMPAT.adapterApi) {
    const message = `This applet uses adapter API ${COMPAT.adapterApi}; this Genesis uses ${connection.bound.compat.adapterApi}`;
    console.error(`Genesis: ${message}`);
    publisher.page({ view, pageId: null, routeId: null, params: {}, status: "error", error: { code: "PROTOCOL_MISMATCH", message }, account: null, regions: {} });
    return { navigated() {}, stop() {} };
  }

  let stopped = false;
  let key = entryKey(location.href);
  let match: RouteMatch = matchRoute(manifest, location.href);
  let page: Page | null = pageFor(match);
  let status: PageStatus | null = null;
  let regions = new Map<string, RegionState>();
  let pending: Change[] = [];
  let overflow = false;

  function pageFor(value: RouteMatch): Page | null {
    return value.kind === "route" ? definition.pages[value.page] ?? null : null;
  }

  function readAccount(): string | null {
    const read = page?.account ?? definition.account;
    try {
      const value = read?.(document);
      return typeof value === "string" && value !== "" ? value : null;
    } catch {
      return null;
    }
  }

  function signInUrl(): string | null {
    const value = definition.signInUrl;
    try {
      if (typeof value === "string") return new URL(value, manifest.origins[0]).href;
      if (typeof value === "function") return new URL(value(location.href), location.href).href;
    } catch (error) {
      console.error("Genesis adapter signInUrl failed", error);
    }
    return null;
  }

  /** The page's status now. An `auth` page needs positive evidence: ready, or a parsed document. */
  function evaluate(account: string | null): { status: PageStatus; error?: { code: ErrorCode; message: string } } {
    if (match.kind !== "route") return { status: "unsupported" };
    if (!page) return { status: "error", error: { code: "NOT_FOUND", message: `The adapter declares no page ${match.page}` } };
    let ready: boolean;
    try {
      ready = page.ready(document) === true;
    } catch (error) {
      return { status: "error", error: { code: "INVALID_ARGUMENT", message: messageOf(error) } };
    }
    const signedOut = page.requiresAccount === true && account === null;
    if (ready) return { status: signedOut ? "auth" : "ready" };
    if (signedOut && document.readyState !== "loading") return { status: "auth" };
    return { status: "loading" };
  }

  function content(account: string | null, state: ReturnType<typeof evaluate>): PageContent {
    const result: PageContent = {
      view,
      pageId: match.kind === "route" ? match.page : null,
      routeId: match.kind === "route" ? match.routeId : null,
      params: match.kind === "route" ? match.params : {},
      status: state.status,
      account,
      signInUrl: signInUrl(),
      regions: {},
    };
    if (state.error) result.error = state.error;
    for (const [name, region] of regions) result.regions[name] = region.value;
    return result;
  }

  // ---- Reading --------------------------------------------------------------------------------

  function readRegion(name: string, def: Region, previous?: RegionState): RegionState {
    const state: RegionState = {
      name, def, root: null, items: new WeakMap(), elements: new Map(), dependsOn: [], dependsOnMissing: false,
      value: previous?.value ?? empty(def),
    };
    for (const selector of def.dependsOn ?? []) {
      const found = [...document.querySelectorAll(selector)];
      if (found.length === 0) state.dependsOnMissing = true;
      state.dependsOn.push(...found);
    }
    state.root = document.querySelector(def.root);
    guarded(state, () => def.kind === "collection" ? readCollection(state, def, "all") : readSingle(state, def));
    return state;
  }

  /** Sets the region's value from `read`, or marks it `error` with the message and keeps its records. */
  function guarded(state: RegionState, read: () => WireRegion) {
    try {
      state.value = read();
    } catch (error) {
      const code = error instanceof GenesisError ? error.code : "INVALID_ARGUMENT";
      state.value = { ...state.value, status: "error", error: { code, message: `${state.name}: ${messageOf(error)}` } };
    }
  }

  function readSingle(state: RegionState, def: SingleRegion): WireRegion {
    const root = state.root;
    if (!root) return { kind: "single", status: "ready", record: null };
    const record = readRecord(def, root, def.key ? keyOf(def.key, root) : state.name);
    return { kind: "single", status: "ready", record };
  }

  /**
   * Queries the items again. An item keeps its last record when its element is the same and its
   * key is not in `dirty`; every other item is read.
   */
  function readCollection(state: RegionState, def: CollectionRegion, dirty: Set<string> | "all"): WireRegion {
    const previous = state.value as CollectionValue;
    const elements = state.root ? [...state.root.querySelectorAll(def.items)] : [];
    const { keys, ephemeral } = assignKeys(elements.map(element => keyOf(def.key, element)));
    const before = previous.ephemeral ? new Map<string, PageRecord>() : new Map(previous.items.map(record => [record.key, record]));
    const known = state.elements;
    state.elements = new Map();
    const items = elements.map((element, i) => {
      const key = keys[i];
      state.elements.set(key, element);
      const old = before.get(key);
      if (dirty !== "all" && old && !dirty.has(key) && known.get(key) === element) return old;
      return readItem(state, def, element, key);
    });
    const region: CollectionValue = {
      kind: "collection",
      status: "ready",
      items: def.virtualized && !ephemeral && !previous.ephemeral ? mergeVirtualized(previous.items, items) : items,
      complete: completeOf(def),
    };
    if (ephemeral) region.ephemeral = true;
    return region;
  }

  function readItem(state: RegionState, def: CollectionRegion, element: Element, key: string): PageRecord {
    const record = readRecord(def, element, key);
    state.items.set(element, key);
    for (const node of def.extent?.(element) ?? []) if (node) state.items.set(node, key);
    return record;
  }

  function readRecord(def: Region, element: Element, key: string): PageRecord {
    stats.reads++;
    const data: unknown = def.read(element);
    if (typeof (data as { then?: unknown } | null)?.then === "function") throw new GenesisError("ASYNC_READ", "read must return its data synchronously");
    const record: PageRecord = { key, data: data === undefined ? null : data };
    if (def.entity) record.entity = def.entity(element);
    if (def.entityType) record.entityType = def.entityType;
    return record;
  }

  /** Re-reads the items of `keys` in place; any surprise queries the items again. */
  function rereadKeys(state: RegionState, def: CollectionRegion, keys: Set<string>) {
    const value = state.value as CollectionValue;
    if (value.ephemeral || value.status === "error") return guarded(state, () => readCollection(state, def, keys));
    const items = value.items.slice();
    for (const key of keys) {
      const element = state.elements.get(key);
      const i = items.findIndex(record => record.key === key);
      if (!element?.isConnected || i === -1 || keyOf(def.key, element) !== key) return guarded(state, () => readCollection(state, def, keys));
      try {
        items[i] = readItem(state, def, element, key);
      } catch {
        return guarded(state, () => readCollection(state, def, keys));
      }
    }
    state.value = { ...value, items, complete: completeOf(def) };
  }

  function apply(state: RegionState, change: Invalidation) {
    const { def } = state;
    if (change.resolve || change.whole || def.kind === "single") {
      regions.set(state.name, readRegion(state.name, def, state));
    } else if (change.membership) {
      guarded(state, () => readCollection(state, def, change.keys));
    } else {
      rereadKeys(state, def, change.keys);
    }
  }

  // ---- Publishing -----------------------------------------------------------------------------

  /** Reads everything and publishes it: a full page when `force` is set, else what changed. */
  function refresh(force = false) {
    if (stopped) return;
    pending = [];
    overflow = false;
    const account = readAccount();
    const state = evaluate(account);
    const previous = regions;
    regions = new Map();
    if (state.status === "ready") {
      for (const [name, def] of Object.entries(page?.regions ?? {})) regions.set(name, readRegion(name, def, previous.get(name)));
    }
    status = state.status;
    const result = content(account, state);
    if (force) publisher.page(result); else publisher.update(result);
    measure();
  }

  /** Processes one batch: re-reads what the changes invalidated and publishes the difference. */
  function flush() {
    if (stopped) return;
    stats.batches++;
    const reads = stats.reads;
    const changes = pending;
    const whole = overflow;
    pending = [];
    overflow = false;
    const account = readAccount();
    const state = evaluate(account);
    if (state.status !== "ready" || status !== "ready" || whole) {
      refresh();
    } else {
      const indexes: { [name: string]: RegionIndex } = {};
      for (const [name, region] of regions) indexes[name] = indexOf(region);
      for (const [name, change] of invalidate(indexes, changes, document)) apply(regions.get(name)!, change);
      // The "more" link may sit outside every item; check it on every batch.
      for (const region of regions.values()) {
        const value = region.value;
        if (region.def.kind === "collection" && value.kind === "collection" && region.def.more) {
          const complete = completeOf(region.def);
          if (complete !== value.complete) region.value = { ...value, complete };
        }
      }
      publisher.update(content(account, state));
      measure();
    }
    stats.lastBatchReads = stats.reads - reads;
  }

  function measure() {
    const elements: Element[] = [];
    for (const region of regions.values()) {
      if (!region.def.measure) continue;
      if (region.def.kind === "single") { if (region.root) elements.push(region.root); }
      else elements.push(...region.elements.values());
    }
    observer.measure(elements);
  }

  const batch = debounce(flush, limits.publishQuietMs, limits.publishMaxDelayMs);
  const observer = observe(changes => {
    if (stopped) return;
    if (status === "ready" && !overflow) {
      pending.push(...changes);
      if (pending.length > CHANGES_MAX) { pending = []; overflow = true; }
    }
    batch.schedule();
  });

  // ---- Actions --------------------------------------------------------------------------------

  const actions = createActions({
    connection,
    limits,
    flush: () => { batch.cancel(); flush(); },
    find,
  });

  function find(request: ActionRequest): Target {
    const fail = (code: ErrorCode, message: string): Target => ({ error: { code, message } });
    if (status !== "ready" || !page) return fail("NOT_READY", "The page is not ready");
    const n = view.n;
    if (request.region === null) {
      const action = page.actions?.[request.name];
      return action ? { action, element: () => null } : fail("INVALID_ARGUMENT", `The page has no action ${request.name}`);
    }
    const name = request.region;
    const state = regions.get(name);
    if (!state) return fail("NOT_FOUND", `The page has no region ${name}`);
    const action = state.def.actions?.[request.name];
    if (!action) return fail("INVALID_ARGUMENT", `Region ${name} has no action ${request.name}`);
    const def = state.def;
    if (def.kind === "single") {
      return { action, element: () => view.n === n ? document.querySelector(def.root) ?? undefined : undefined };
    }
    if ((state.value as CollectionValue).ephemeral) return fail("PRECONDITION_FAILED", `Region ${name} repeats keys, so its records have no actions`);
    const key = request.key;
    if (key === null) return fail("INVALID_ARGUMENT", `Action ${request.name} needs a record key`);
    const element = () => {
      if (view.n !== n) return undefined;
      const known = regions.get(name)?.elements.get(key);
      if (known?.isConnected && safeKey(def, known) === key) return known;
      const root = document.querySelector(def.root);
      return root ? [...root.querySelectorAll(def.items)].find(item => safeKey(def, item) === key) : undefined;
    };
    return element() === undefined ? fail("TARGET_NOT_FOUND", `No ${name} item has key ${key}`) : { action, element };
  }

  // ---- Lifecycle ------------------------------------------------------------------------------

  /** Stops reading and publishing. On pagehide a running action still hands itself off, so it is not retired. */
  function stop(retireActions = true) {
    if (stopped) return;
    stopped = true;
    batch.cancel();
    observer.disconnect();
    if (retireActions) actions.retire();
  }

  connection.on("resync", () => { stats.resyncs++; batch.cancel(); refresh(true); });
  connection.on("act", (request: ActionRequest) => actions.act(request));
  connection.on("cancel", ({ actionId }: { actionId: number }) => actions.cancel(actionId));
  connection.on("ping", () => {}); // The host answers pings; receiving one needs nothing here.
  connection.on("retired", () => stop());
  connection.on("pagehide", () => stop(false));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => batch.schedule(), { once: true });

  refresh();

  return {
    navigated() {
      if (stopped) return;
      const next = entryKey(location.href);
      if (next === key) return;
      key = next;
      view = { generation, n: view.n + 1, url: location.href };
      match = matchRoute(manifest, location.href);
      page = pageFor(match);
      status = null;
      regions = new Map();
      batch.cancel();
      refresh();
    },
    stop: () => stop(),
  };
}

function indexOf(state: RegionState): RegionIndex {
  return {
    root: state.root,
    items: state.items,
    dependsOn: state.dependsOn,
    dependsOnMissing: state.dependsOnMissing,
    fields: state.def.fields === true,
    measure: state.def.measure === true,
  };
}

function empty(def: Region): WireRegion {
  return def.kind === "collection"
    ? { kind: "collection", status: "ready", items: [], complete: true }
    : { kind: "single", status: "ready", record: null };
}

function completeOf(def: CollectionRegion): boolean {
  return def.more ? document.querySelector(def.more) === null : true;
}

function keyOf(read: (element: Element) => string, element: Element): string {
  const key = read(element);
  if (typeof key !== "string" || key === "") throw new GenesisError("INVALID_ARGUMENT", "key must return a non-empty string");
  return key;
}

function safeKey(def: CollectionRegion, element: Element): string | null {
  try { return keyOf(def.key, element); } catch { return null; }
}

function messageOf(error: unknown): string {
  return String((error as Error)?.message ?? error);
}
