import type { ContextNavigated, ErrorBody, PageEmitEvent, ViewId, WatchPatch, WatchSnapshot, WatchStatus } from "@genesis/core";

/**
 * The value of one watch. `get()` returns the same object until something in it changes, and a
 * list record keeps its object while its data is unchanged, so a UI can compare by reference.
 */
export interface WatchValue<V = unknown, R = unknown> {
  /** `loading` until the first snapshot of the current page, `error` when the read failed. */
  status: "loading" | "ready" | "error";
  /** The page's URL matches none of the watch's `when` guards, so the agent is not reading it. */
  idle: boolean;
  /** The data comes from an earlier copy of this page: Back, a reload, or a page that failed after it was ready. */
  stale: boolean;
  /** A single read's value; null for a list. */
  value: V | null;
  /** A list's keys in page order. */
  order: readonly string[];
  /** A list's records by key. */
  records: Readonly<Record<string, R>>;
  error: ErrorBody | null;
  /** The list has more items than the read keeps. */
  truncated: boolean;
  /** A list whose reader names a "more" link: false while the page offers more items. */
  complete: boolean | undefined;
  /** The page the data was read from, or null before the first snapshot. */
  view: ViewId | null;
}

/** What the caller does after `emit`: `resync` means a patch could not be applied and a fresh snapshot is needed. */
export type EmitResult = "applied" | "ignored" | "resync";

export interface WatchStore {
  get(): WatchValue;
  subscribe(listener: () => void): () => void;
  emit(event: PageEmitEvent): EmitResult;
  /** A committed navigation of the context. */
  navigated(navigation: ContextNavigated): void;
  /** The context's document is gone. */
  gone(error: ErrorBody): void;
  /** The watch could not be opened. */
  failed(error: ErrorBody): void;
  /** Forgets the stream, so the next snapshot starts it again; the data stays. */
  restart(): void;
}

type Data = Pick<WatchValue, "value" | "order" | "records" | "truncated" | "complete" | "view">;

const EMPTY_ORDER: readonly string[] = Object.freeze([]);
const EMPTY_RECORDS: Readonly<Record<string, unknown>> = Object.freeze(Object.create(null));

export function emptyWatchValue(): WatchValue {
  return {
    status: "loading", idle: false, stale: false, value: null, order: EMPTY_ORDER, records: EMPTY_RECORDS,
    error: null, truncated: false, complete: undefined, view: null,
  };
}

/**
 * The client side of one watch stream. It applies snapshots, statuses and in-order patches, and
 * keeps the last ready copy of each history entry (at most `historyEntriesMax`), so Back shows
 * the entry at once, marked `stale`, until the new document sends its snapshot.
 */
export function createWatchStore(options: { historyEntriesMax: number }): WatchStore {
  let current = emptyWatchValue();
  /** The stream position of the last applied message; null until a snapshot starts it. */
  let stream: { generation: number; n: number; seq: number } | null = null;
  /** The context's current history entry, from the last committed navigation. */
  let entry: { index: number; url: string } | null = null;
  /** The last ready data per history index, validated by URL. */
  const history = new Map<number, Data>();
  /** The URL the current data belongs to. */
  let url: string | null = null;
  const listeners = new Set<() => void>();

  function set(next: WatchValue) {
    if (same(next, current)) return;
    current = next;
    remember();
    for (const listener of [...listeners]) listener();
  }

  /** Keeps the current data as the history entry of the current index, when they agree. */
  function remember() {
    if (current.status !== "ready" || current.stale || current.idle || !entry || !sameUrl(entry.url, url)) return;
    history.delete(entry.index);
    history.set(entry.index, data(current));
    while (history.size > options.historyEntriesMax) history.delete(history.keys().next().value!);
  }

  function snapshot(event: PageEmitEvent, body: WatchSnapshot): WatchValue {
    const list = Array.isArray(body.order);
    const records = list ? reuse(current.records, body.records ?? {}) : EMPTY_RECORDS;
    const order = list ? sameArray(current.order, body.order!) ? current.order : Object.freeze([...body.order!]) : EMPTY_ORDER;
    url = event.url;
    if (body.status === "error") {
      // A failed read keeps the last data of this URL, marked stale.
      const kept = current.view && sameUrl(current.view.url, event.url) && hasData(current);
      return kept
        ? { ...current, status: "error", idle: false, stale: true, error: body.error ?? null }
        : { ...emptyWatchValue(), status: "error", error: body.error ?? null, view: event.view };
    }
    return {
      status: "ready", idle: false, stale: false, error: null,
      value: list ? null : keep(current.value, body.value ?? null),
      order, records,
      truncated: body.truncated === true,
      complete: body.complete,
      view: sameView(current.view, event.view) ? current.view : event.view,
    };
  }

  function patch(body: WatchPatch): WatchValue {
    let records = current.records;
    if (body.upsert || body.remove) {
      records = Object.assign(Object.create(null), current.records);
      for (const key of body.remove ?? []) delete (records as Record<string, unknown>)[key];
      const upserted = reuse(current.records, body.upsert ?? {});
      for (const key of Object.keys(body.upsert ?? {})) (records as Record<string, unknown>)[key] = upserted[key];
      Object.freeze(records);
    }
    const order = body.order && !sameArray(current.order, body.order) ? Object.freeze([...body.order]) : current.order;
    const complete = "complete" in body ? body.complete : current.complete;
    return { ...current, order, records, complete };
  }

  function status(event: PageEmitEvent, body: WatchStatus): WatchValue {
    let next = current;
    if (body.idle !== undefined) next = { ...next, idle: body.idle };
    if (body.status === "error") next = { ...next, status: "error", error: body.error ?? null, stale: hasData(next) };
    if (body.status === "ready") next = { ...next, status: "ready", error: null };
    if (body.idle) url = event.url;
    return next;
  }

  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    emit(event) {
      const { kind, seq, view } = event;
      if (kind === "patch") {
        if (!stream || stream.generation !== view.generation || stream.n !== view.n || seq !== stream.seq + 1) return "resync";
        stream.seq = seq;
        set(patch(event.data as WatchPatch));
        return "applied";
      }
      if (stream && stream.generation === view.generation && seq <= stream.seq) return "ignored";
      stream = { generation: view.generation, n: view.n, seq };
      set(kind === "snapshot" ? snapshot(event, event.data as WatchSnapshot) : status(event, event.data as WatchStatus));
      return "applied";
    },

    navigated(navigation) {
      for (const index of [...history.keys()]) {
        const kept = history.get(index)!;
        const keptUrl = kept.view?.url ?? null;
        if (index >= navigation.size || (index === navigation.index && !sameUrl(keptUrl, navigation.url))) history.delete(index);
      }
      entry = { index: navigation.index, url: navigation.url };
      if (navigation.sameDocument) {
        // The agent sends a snapshot for the new view; until then the data belongs to the old one.
        if (!sameUrl(url, navigation.url)) restore(navigation);
        return;
      }
      stream = null;
      if (sameUrl(url, navigation.url)) {
        // The same URL in a new document, such as a reload: the data stays, stale, until it sends a snapshot.
        set({ ...current, status: "loading", error: null, stale: hasData(current) });
      } else {
        restore(navigation);
      }
    },

    gone(error) {
      stream = null;
      set({ ...current, status: "error", error, stale: hasData(current) });
    },

    failed(error) {
      set({ ...current, status: "error", error, stale: hasData(current) });
    },

    restart() {
      stream = null;
    },
  };

  /** Shows the history copy of the entry, marked stale, or nothing until the page's snapshot arrives. */
  function restore(navigation: ContextNavigated) {
    const kept = history.get(navigation.index);
    url = navigation.url;
    set(kept
      ? { ...emptyWatchValue(), ...kept, status: "loading", stale: true }
      : emptyWatchValue());
  }
}

function data(value: WatchValue): Data {
  const { value: v, order, records, truncated, complete, view } = value;
  return { value: v, order, records, truncated, complete, view };
}

function hasData(value: WatchValue) {
  return value.value !== null || value.order.length > 0;
}

function sameUrl(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  try { return new URL(a).href === new URL(b).href; } catch { return false; }
}

function sameView(a: ViewId | null, b: ViewId) {
  return a !== null && a.generation === b.generation && a.n === b.n && a.url === b.url;
}

function sameArray(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/** `next`, or `previous` when both have the same JSON. */
function keep(previous: unknown, next: unknown) {
  return previous !== null && JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
}

/** New records by key, each keeping its previous object when its JSON did not change. */
function reuse(previous: Readonly<Record<string, unknown>>, next: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = Object.create(null);
  const keys = Object.keys(next);
  let changed = keys.length !== Object.keys(previous).length;
  for (const key of keys) {
    const old = previous[key];
    out[key] = old === undefined ? next[key] : keep(old, next[key]);
    if (out[key] !== old) changed = true;
  }
  return changed ? Object.freeze(out) : previous;
}

/** True when nothing a UI reads changed, so `get()` keeps returning the same object. */
function same(a: WatchValue, b: WatchValue) {
  return a.status === b.status && a.idle === b.idle && a.stale === b.stale && a.value === b.value
    && a.order === b.order && a.records === b.records && a.error === b.error && a.truncated === b.truncated
    && a.complete === b.complete && a.view === b.view;
}
