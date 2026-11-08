import type { PageRecord, Region, RegionPatch } from "@genesis/core";

/**
 * Compares regions as published with regions as read now. Pure. Records are compared by key
 * through their JSON, which is cached per record object, so a record the runtime did not read
 * again (the same object) costs nothing.
 */

const serialized = new WeakMap<object, string>();

/** The record's JSON, computed once per record object. */
export function json(record: PageRecord): string {
  let value = serialized.get(record);
  if (value === undefined) serialized.set(record, (value = JSON.stringify(record)));
  return value;
}

function same(a: PageRecord | null, b: PageRecord | null): boolean {
  if (a === b) return true;
  return a !== null && b !== null && json(a) === json(b);
}

function sameError(a: Region["error"], b: Region["error"]): boolean {
  return a?.code === b?.code && a?.message === b?.message;
}

/** The changes from `previous` to `next`, or null when nothing changed. */
export function diffRegion(previous: Region, next: Region): RegionPatch | null {
  if (previous.kind !== next.kind) return { kind: "replace", region: next };

  if (next.kind === "single") {
    const prior = previous as Extract<Region, { kind: "single" }>;
    if (same(prior.record, next.record) && prior.status === next.status && sameError(prior.error, next.error)) return null;
    const patch: RegionPatch = { kind: "single", record: next.record };
    if (prior.status !== next.status) patch.status = next.status;
    if (!sameError(prior.error, next.error)) patch.error = next.error ?? null;
    return patch;
  }

  const prior = previous as Extract<Region, { kind: "collection" }>;
  // Position keys mean nothing across reads; send the region whole.
  if (Boolean(prior.ephemeral) !== Boolean(next.ephemeral) || next.ephemeral) {
    return sameCollection(prior, next) ? null : { kind: "replace", region: next };
  }
  const before = new Map(prior.items.map(record => [record.key, record]));
  const after = new Set<string>();
  const upsert: PageRecord[] = [];
  for (const record of next.items) {
    after.add(record.key);
    const old = before.get(record.key);
    if (!old || !same(old, record)) upsert.push(record);
  }
  const remove = prior.items.filter(record => !after.has(record.key)).map(record => record.key);
  const order = next.items.map(record => record.key);
  const reordered = order.length !== prior.items.length || order.some((key, i) => prior.items[i].key !== key);

  const patch: Extract<RegionPatch, { kind: "collection" }> = { kind: "collection" };
  if (upsert.length) patch.upsert = upsert;
  if (remove.length) patch.remove = remove;
  if (reordered) patch.order = order;
  if (prior.complete !== next.complete) patch.complete = next.complete;
  if (prior.status !== next.status) patch.status = next.status;
  if (!sameError(prior.error, next.error)) patch.error = next.error ?? null;
  return Object.keys(patch).length > 1 ? patch : null;
}

function sameCollection(a: Extract<Region, { kind: "collection" }>, b: Extract<Region, { kind: "collection" }>): boolean {
  return a.complete === b.complete && a.status === b.status && sameError(a.error, b.error)
    && Boolean(a.ephemeral) === Boolean(b.ephemeral)
    && a.items.length === b.items.length && a.items.every((record, i) => same(record, b.items[i]));
}

/**
 * The items of a virtualized collection: every key read before stays, in its order, and each
 * new key goes in at its DOM position, after the nearest earlier known neighbour (or before the
 * nearest later one). Records read now replace the ones read before. Past `max` records, the
 * ones farthest from the records in the DOM go (see `keepNear`).
 */
export function mergeVirtualized(previous: PageRecord[], dom: PageRecord[], max = Infinity): PageRecord[] {
  const merged = previous.slice();
  const position = (key: string) => merged.findIndex(record => record.key === key);
  let anchor = -1; // Index in `merged` of the last DOM item placed.
  for (const [i, record] of dom.entries()) {
    const known = position(record.key);
    if (known !== -1) {
      merged[known] = record;
      anchor = known;
      continue;
    }
    let at = anchor + 1;
    if (anchor === -1) {
      const later = dom.slice(i + 1).map(next => position(next.key)).find(index => index !== -1);
      at = later ?? merged.length;
    }
    merged.splice(at, 0, record);
    anchor = at;
  }
  return merged.length > max ? keepNear(merged, new Set(dom.map(record => record.key)), max) : merged;
}

/**
 * At most `max` of `items`, a run around the ones whose keys are `shown` (the records in the
 * DOM), dropping the records farthest from them first. The shown records always stay, so the
 * result is longer than `max` when more than `max` are shown. With none shown, the first stay.
 */
export function keepNear(items: PageRecord[], shown: Set<string>, max: number): PageRecord[] {
  if (items.length <= max) return items;
  let first = -1;
  let last = 0;
  for (const [i, record] of items.entries()) {
    if (!shown.has(record.key)) continue;
    if (first === -1) first = i;
    last = i;
  }
  if (first === -1) first = 0;
  const keep = Math.max(max, last - first + 1);
  const start = Math.min(Math.max(0, Math.floor((first + last + 1 - keep) / 2)), items.length - keep);
  return items.slice(start, start + keep);
}

/**
 * Keys for one read. Unique keys are kept. When any key repeats, every record is keyed by its
 * position instead and the region is ephemeral, so record actions are unavailable.
 */
export function assignKeys(keys: string[]): { keys: string[]; ephemeral: boolean } {
  if (new Set(keys).size === keys.length) return { keys, ephemeral: false };
  return { keys: keys.map((_, i) => String(i)), ephemeral: true };
}
