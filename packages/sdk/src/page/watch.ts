import {
  matchesGuard,
  type ErrorBody,
  type Limits,
  type PageEmitParams,
  type PageRecord,
  type ReadSpec,
  type Region,
  type UrlGuard,
  type ViewId,
  type WatchPatch,
  type WatchSnapshot,
  type WatchStatus,
} from "@genesis/core";
import { GenesisError } from "../bridge.js";
import { diffRegion, json, keepNear, mergeVirtualized } from "../adapter/diff.js";
import { invalidate, touches, type Change, type Invalidation, type RegionIndex } from "../adapter/invalidate.js";
import { observe, type Observer } from "../adapter/observe.js";
import { debounce } from "../adapter/publish.js";
import { errorBody, PageError } from "./errors.js";
import type { Compiled, CompiledList } from "./read.js";

/** Past this many unprocessed changes a batch re-reads every watch instead of tracking them. */
const CHANGES_MAX = 10000;

export interface WatchHost {
  limits: Limits;
  view(): ViewId;
  /** Compiles a read specification; the watch's record lookups go through the registry. */
  compile(spec: ReadSpec): Compiled;
  /** Sends one `page.emit`. Rejects when the host refuses it. */
  emit(params: PageEmitParams): Promise<unknown>;
}

/** What a watch read last. List records are `{ key, data }` in page order. */
interface State {
  status: "ready" | "error";
  error?: ErrorBody;
  value: unknown;
  records: PageRecord[];
  complete?: boolean;
  truncated?: boolean;
}

interface Watch {
  id: string;
  compiled: Compiled;
  when?: UrlGuard[];
  seq: number;
  /** The URL matches none of the guards; one `status { idle: true }` went out. */
  idle: boolean;
  /** The next emit is a snapshot: just opened, a new view, a resync, a refused patch. */
  snapshot: boolean;
  root: Element | null;
  /** Item elements and extent nodes to record keys. */
  items: WeakMap<Node, string>;
  /** Record key to item element, for locators and re-reads by key. */
  elements: Map<string, Element>;
  dependsOn: Element[];
  dependsOnMissing: boolean;
  state: State;
  /** What the client has: the state as last emitted. */
  sent: State | null;
}

export interface Watches {
  open(id: string, spec: ReadSpec, when?: UrlGuard[]): void;
  close(id: string): void;
  /** Emits a fresh snapshot of one watch, or of every watch. */
  resync(id?: string): void;
  closeAll(): void;
  /** The element of one record of a list watch: `null` without such a watch, `undefined` when the record is not on the page. */
  record(id: string, key: string): Element | null | undefined;
  /** Processes pending changes now, so records reach the client before an action's result. */
  flush(): void;
  /** A same-document navigation changed the view: every watch emits a snapshot once the DOM settles. */
  viewChanged(): void;
  stop(): void;
}

export function createWatches(host: WatchHost): Watches {
  const { limits } = host;
  const watches = new Map<string, Watch>();
  let pending: Change[] = [];
  let overflow = false;
  let observer: Observer | null = null;
  let stopped = false;
  const absent = new WeakSet<PageRecord>();

  const batch = debounce(flush, limits.publishQuietMs, limits.publishMaxDelayMs);

  function startObserving() {
    if (observer || stopped) return;
    observer = observe(changes => {
      if (stopped || overflow) return;
      // Attribute changes outside every watch change no record.
      const indexes = [...watches.values()].map(indexOf);
      pending.push(...changes.filter(change => change.kind !== "attributes" || indexes.some(index => touches(index, change.target))));
      if (pending.length > CHANGES_MAX) { pending = []; overflow = true; }
      batch.schedule();
    });
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => batch.schedule(), { once: true });
  }

  function stopObserving() {
    batch.cancel();
    observer?.disconnect();
    observer = null;
    pending = [];
    overflow = false;
  }

  // ---- Reading ----------------------------------------------------------------------------------

  /** Resolves the root and the `dependsOn` nodes, then reads everything. */
  function readAll(watch: Watch) {
    const { compiled } = watch;
    watch.dependsOn = [];
    watch.dependsOnMissing = false;
    for (const selector of compiled.dependsOn) {
      const found = [...document.querySelectorAll(selector)];
      if (found.length === 0) watch.dependsOnMissing = true;
      watch.dependsOn.push(...found);
    }
    watch.items = new WeakMap();
    guarded(watch, () => {
      watch.root = compiled.root();
      if (compiled.kind === "list") return readList(watch, compiled, "all");
      if (compiled.kind === "one") return ready(watch.root ? compiled.read(watch.root) : null);
      return ready(compiled.read());
    });
  }

  function ready(value: unknown): State {
    return { status: "ready", value: value === undefined ? null : value, records: [] };
  }

  /** Sets the state from `read`, or marks it `error` and keeps the last records. */
  function guarded(watch: Watch, read: () => State) {
    try {
      watch.state = read();
    } catch (error) {
      watch.state = { ...watch.state, status: "error", error: errorBody(error) };
    }
  }

  /**
   * Queries the items again. An item keeps its last record when its element is the same and its
   * key is not in `dirty`; every other item is read. Duplicate keys are the error `CONFLICT`.
   */
  function readList(watch: Watch, compiled: CompiledList, dirty: Set<string> | "all"): State {
    const previous = watch.state;
    const elements = watch.root ? compiled.items(watch.root) : [];
    const before = new Map(previous.records.map(record => [record.key, record]));
    const known = watch.elements;
    const next = new Map<string, Element>();
    const records: PageRecord[] = [];
    let truncated = false;
    for (const element of elements) {
      const key = compiled.key(element);
      if (next.has(key)) throw new PageError("CONFLICT", `Two items have the key ${key}`);
      if (records.length >= compiled.limit) { truncated = true; break; }
      next.set(key, element);
      const old = before.get(key);
      records.push(dirty !== "all" && old && !absent.has(old) && !dirty.has(key) && known.get(key) === element ? old : readItem(watch, compiled, element, key));
    }
    watch.elements = next;
    const state: State = { status: "ready", value: null, records, complete: compiled.complete() };
    if (compiled.virtualized) state.records = markAbsent(mergeVirtualized(previous.records, records, compiled.limit), next);
    if (truncated) state.truncated = true;
    return state;
  }

  /** Records kept for a virtualized list that are no longer in the DOM carry `present: false`. */
  function markAbsent(records: PageRecord[], shown: Map<string, Element>): PageRecord[] {
    return records.map(record => {
      if (shown.has(record.key) || absent.has(record)) return record;
      const data = record.data;
      const marked = { key: record.key, data: isPlainObject(data) ? { ...data, present: false } : data };
      absent.add(marked);
      return marked;
    });
  }

  function readItem(watch: Watch, compiled: CompiledList, element: Element, key: string): PageRecord {
    const data = compiled.read(element);
    watch.items.set(element, key);
    for (const node of compiled.extent(element)) if (node) watch.items.set(node, key);
    return { key, data: data === undefined ? null : data };
  }

  /** Re-reads the items of `keys` in place; any surprise queries the items again. */
  function rereadKeys(watch: Watch, compiled: CompiledList, keys: Set<string>) {
    const state = watch.state;
    if (state.status === "error") return guarded(watch, () => readList(watch, compiled, keys));
    const records = state.records.slice();
    for (const key of keys) {
      const element = watch.elements.get(key);
      const i = records.findIndex(record => record.key === key);
      const member = element?.isConnected && watch.root?.contains(element);
      try {
        if (!element || !member || i === -1 || compiled.key(element) !== key) return guarded(watch, () => readList(watch, compiled, keys));
        records[i] = readItem(watch, compiled, element, key);
      } catch {
        return guarded(watch, () => readList(watch, compiled, keys));
      }
    }
    watch.state = { ...state, records, complete: compiled.complete() };
  }

  function apply(watch: Watch, change: Invalidation) {
    const { compiled } = watch;
    if (change.resolve || change.whole || compiled.kind !== "list") readAll(watch);
    else if (change.membership) guarded(watch, () => readList(watch, compiled, change.keys));
    else rereadKeys(watch, compiled, change.keys);
  }

  // ---- Emitting ---------------------------------------------------------------------------------

  function send(watch: Watch, kind: PageEmitParams["kind"], data: WatchSnapshot | WatchPatch | WatchStatus) {
    const view = host.view();
    const params: PageEmitParams = { stream: watch.id, kind, seq: ++watch.seq, view, url: view.url, data };
    return host.emit(params);
  }

  /** Emits a snapshot of the current state, shrinking a virtualized list or reporting `PAGE_TOO_LARGE` when it does not fit. */
  function snapshot(watch: Watch) {
    watch.snapshot = false;
    let state = watch.state;
    let data = snapshotData(watch, state);
    while (bytes(data) > limits.pageMaxBytes) {
      const smaller = shrink(watch, state);
      if (!smaller) {
        state = { ...state, status: "error", error: { code: "PAGE_TOO_LARGE", message: "The watch is too large to send" }, records: [], value: null };
        data = snapshotData(watch, state);
        break;
      }
      state = smaller;
      data = snapshotData(watch, state);
    }
    watch.state = state;
    watch.sent = state;
    post(watch, "snapshot", data);
  }

  function snapshotData(watch: Watch, state: State): WatchSnapshot {
    const data: WatchSnapshot = { status: state.status };
    if (watch.compiled.kind === "list") {
      data.order = state.records.map(record => record.key);
      data.records = Object.fromEntries(state.records.map(record => [record.key, record.data]));
      if (state.complete !== undefined) data.complete = state.complete;
    } else {
      data.value = state.value;
    }
    if (state.error) data.error = state.error;
    if (state.truncated) data.truncated = true;
    return data;
  }

  /** A virtualized list without a quarter of the records farthest from the ones in the DOM; null when none can go. */
  function shrink(watch: Watch, state: State): State | null {
    if (watch.compiled.kind !== "list" || !watch.compiled.virtualized) return null;
    const records = keepNear(state.records, new Set(watch.elements.keys()), Math.floor(state.records.length * 3 / 4));
    return records.length === state.records.length ? null : { ...state, records };
  }

  /** Emits what changed since the last emit: nothing, patches, or a snapshot. */
  function update(watch: Watch) {
    const sent = watch.sent;
    const state = watch.state;
    if (watch.snapshot || !sent || sent.status !== state.status || !sameError(sent.error, state.error) || Boolean(sent.truncated) !== Boolean(state.truncated)) {
      return snapshot(watch);
    }
    if (watch.compiled.kind !== "list") {
      if (!sameValue(sent.value, state.value)) snapshot(watch);
      return;
    }
    const patch = diffRegion(region(sent), region(state));
    if (!patch) return;
    if (patch.kind !== "collection") return snapshot(watch);
    const patches = split(patch.upsert ?? [], { remove: patch.remove, order: patch.order, complete: patch.complete ?? (sent.complete !== state.complete ? state.complete : undefined) });
    if (patches.some(item => bytes(item) > limits.patchMaxBytes)) return snapshot(watch);
    watch.sent = state;
    for (const item of patches) post(watch, "patch", item);
  }

  /**
   * Splits one change so each patch carries at most `patchRecordsMax` upserts and stays under
   * `patchMaxBytes`. Only the last carries removals, order and `complete`, so the client sees
   * the new order only once every record it names has arrived.
   */
  function split(upsert: PageRecord[], rest: { remove?: string[]; order?: string[]; complete?: boolean }): WatchPatch[] {
    const tail: WatchPatch = {};
    if (rest.remove?.length) tail.remove = rest.remove;
    if (rest.order) tail.order = rest.order;
    if (rest.complete !== undefined) tail.complete = rest.complete;
    const budget = limits.patchMaxBytes - bytes(tail) - 256;
    const chunks: PageRecord[][] = [];
    let chunk: PageRecord[] = [];
    let size = 0;
    for (const record of upsert) {
      const itemSize = json(record).length + 1;
      if (chunk.length && (chunk.length >= limits.patchRecordsMax || size + itemSize > budget)) {
        chunks.push(chunk);
        chunk = [];
        size = 0;
      }
      chunk.push(record);
      size += itemSize;
    }
    chunks.push(chunk);
    return chunks.map((records, i) => {
      const patch: WatchPatch = i === chunks.length - 1 ? { ...tail } : {};
      if (records.length) patch.upsert = Object.fromEntries(records.map(record => [record.key, record.data]));
      return patch;
    }).filter(patch => Object.keys(patch).length > 0);
  }

  function post(watch: Watch, kind: PageEmitParams["kind"], data: WatchSnapshot | WatchPatch | WatchStatus) {
    send(watch, kind, data).catch((error: unknown) => {
      const code = error instanceof GenesisError ? error.code : null;
      if (code === "RETIRED" || stopped || watches.get(watch.id) !== watch) return;
      if (kind === "snapshot" && code === "PAGE_TOO_LARGE" && (data as WatchSnapshot).status !== "error") {
        watch.state = { ...watch.state, status: "error", error: { code, message: "The watch is too large to send" }, records: [], value: null };
        return snapshot(watch);
      }
      // A refused patch leaves the client behind; a snapshot catches it up.
      if (kind === "patch") {
        watch.snapshot = true;
        batch.schedule();
        return;
      }
      console.error("Genesis could not send a watch", error);
    });
  }

  // ---- Batches ----------------------------------------------------------------------------------

  /** True when the watch may read now; emits `status { idle: true }` once when its guards stop matching. */
  function active(watch: Watch): boolean {
    if (!watch.when) return true;
    if (matchesGuard(location.href, watch.when)) {
      if (watch.idle) {
        watch.idle = false;
        watch.snapshot = true;
      }
      return true;
    }
    if (!watch.idle) {
      watch.idle = true;
      post(watch, "status", { idle: true });
    }
    return false;
  }

  function flush() {
    if (stopped) return;
    const changes = pending;
    const whole = overflow;
    pending = [];
    overflow = false;
    const indexes: { [id: string]: RegionIndex } = {};
    for (const watch of watches.values()) {
      if (!active(watch)) continue;
      if (watch.snapshot || whole || !watch.sent) readAll(watch);
      else indexes[watch.id] = indexOf(watch);
    }
    for (const [id, change] of invalidate(indexes, changes, document)) apply(watches.get(id)!, change);
    for (const watch of watches.values()) {
      if (watch.idle) continue;
      // The "more" link may sit outside every item; check it on every batch.
      if (watch.compiled.kind === "list" && watch.state.status === "ready") {
        try { watch.state = { ...watch.state, complete: watch.compiled.complete() }; } catch { /* the next read reports it */ }
      }
      update(watch);
    }
    measure();
  }

  function measure() {
    if (!observer) return;
    const elements: Element[] = [];
    for (const watch of watches.values()) {
      if (!watch.compiled.measure || watch.idle) continue;
      if (watch.compiled.kind === "list") elements.push(...watch.elements.values());
      else if (watch.root) elements.push(watch.root);
    }
    observer.measure(elements);
  }

  return {
    open(id, spec, when) {
      if (watches.has(id)) throw new PageError("CONFLICT", `A watch ${id} is already open`);
      if (watches.size >= limits.watchesMax) throw new PageError("QUOTA_EXCEEDED", `At most ${limits.watchesMax} watches can be open`);
      const compiled = host.compile(spec);
      const watch: Watch = {
        id, compiled, when, seq: 0, idle: false, snapshot: true, root: null, items: new WeakMap(), elements: new Map(),
        dependsOn: [], dependsOnMissing: false, state: { status: "ready", value: null, records: [] }, sent: null,
      };
      watches.set(id, watch);
      startObserving();
      if (!active(watch)) return;
      readAll(watch);
      snapshot(watch);
      measure();
    },
    close(id) {
      watches.delete(id);
      if (watches.size === 0) stopObserving();
    },
    resync(id) {
      if (id !== undefined && !watches.has(id)) throw new PageError("NOT_FOUND", `No watch ${id} is open`);
      for (const watch of watches.values()) {
        if (id !== undefined && watch.id !== id) continue;
        watch.snapshot = true;
        // An idle watch says so again; the client may have lost the status.
        if (watch.idle) post(watch, "status", { idle: true });
      }
      batch.cancel();
      flush();
    },
    closeAll() {
      watches.clear();
      stopObserving();
    },
    record(id, key) {
      const watch = watches.get(id);
      if (!watch || watch.compiled.kind !== "list") return null;
      const compiled = watch.compiled;
      const known = watch.elements.get(key);
      const keyOf = (element: Element) => { try { return compiled.key(element); } catch { return null; } };
      if (known?.isConnected && keyOf(known) === key) return known;
      const root = compiled.root();
      return root ? compiled.items(root).find(item => keyOf(item) === key) : undefined;
    },
    flush() {
      batch.cancel();
      flush();
    },
    viewChanged() {
      for (const watch of watches.values()) {
        watch.snapshot = true;
        watch.sent = null;
        watch.elements = new Map();
        watch.state = { status: "ready", value: null, records: [] };
      }
      // The website renders the new route after it changes the URL; read once the DOM settles.
      batch.cancel();
      if (watches.size) batch.schedule();
    },
    stop() {
      stopped = true;
      watches.clear();
      stopObserving();
    },
  };
}

function indexOf(watch: Watch): RegionIndex {
  return {
    root: watch.root,
    items: watch.items,
    dependsOn: watch.dependsOn,
    dependsOnMissing: watch.dependsOnMissing,
    fields: watch.compiled.fields,
    measure: watch.compiled.measure,
  };
}

/** A list state in the old region shape, so the tested `diffRegion` compares it. */
function region(state: State): Region {
  return { kind: "collection", status: "ready", items: state.records, complete: state.complete ?? true };
}

const encoder = new TextEncoder();
const bytes = (value: unknown) => encoder.encode(JSON.stringify(value)).length;

function sameError(a: ErrorBody | undefined, b: ErrorBody | undefined): boolean {
  return a?.code === b?.code && a?.message === b?.message;
}

function sameValue(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function isPlainObject(value: unknown): value is { [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
