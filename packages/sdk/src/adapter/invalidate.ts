/**
 * Maps DOM changes to the records they can affect. Pure: it reads only the `parentNode` chain of
 * the nodes it is given, so tests can pass plain objects instead of DOM nodes.
 */

export interface TreeNode {
  readonly parentNode: TreeNode | null;
}

export type ChangeKind = "childList" | "attributes" | "characterData" | "field" | "resize";

/** One mutation record, field event or size change, reduced to what invalidation needs. */
export interface Change {
  target: TreeNode;
  kind: ChangeKind;
  /** A `childList` change for a node the mutation removed; `target` is that node. */
  removed?: boolean;
}

/** What the runtime knows about one region since its last read. */
export interface RegionIndex {
  /** The resolved root, or null when the root selector matched nothing. */
  root: TreeNode | null;
  /** Item elements and extent nodes, each mapped to its record key. Empty for a single region. */
  items: { get(node: TreeNode): string | undefined };
  /** Nodes the `dependsOn` selectors matched. */
  dependsOn: TreeNode[];
  /** A `dependsOn` selector matched nothing, so any node added anywhere may be it. */
  dependsOnMissing: boolean;
  /** The region listens to field events. */
  fields: boolean;
  /** The region listens to size changes. */
  measure: boolean;
}

/** What to read again in one region. */
export interface Invalidation {
  /** Record keys whose item or extent changed. */
  keys: Set<string>;
  /** Read every item again: a change in the root outside any item or extent, or in a `dependsOn` node. */
  whole: boolean;
  /** Query the items again for membership and order: a `childList` change inside the root. */
  membership: boolean;
  /** Resolve the root selector again: the root is missing or left the document. */
  resolve: boolean;
}

/**
 * Returns the invalidations of the regions a batch of changes touches, keyed by region name.
 * `top` is the document: a node whose parent chain does not reach it has been removed.
 * Anything it cannot place is conservative: the whole region.
 */
export function invalidate(regions: { [name: string]: RegionIndex }, changes: Change[], top: TreeNode): Map<string, Invalidation> {
  const result = new Map<string, Invalidation>();
  const entry = (name: string) => {
    let value = result.get(name);
    if (!value) result.set(name, (value = { keys: new Set(), whole: false, membership: false, resolve: false }));
    return value;
  };

  for (const [name, region] of Object.entries(regions)) {
    const childList = changes.some(change => change.kind === "childList");
    if (!region.root) {
      if (childList) entry(name).resolve = true; // The root may have appeared.
      continue;
    }
    if (!attached(region.root, top)) {
      entry(name).resolve = true;
      continue;
    }
    if (region.dependsOn.some(node => !attached(node, top)) || (region.dependsOnMissing && childList)) {
      entry(name).whole = true;
    }
    for (const change of changes) {
      if (change.kind === "field" && !region.fields) continue;
      if (change.kind === "resize" && !region.measure) continue;
      // A removed node that holds the root (and was put back, or the root would be detached) moved the whole region.
      if (change.removed && attached(region.root, change.target)) entry(name).whole = true;
      const place = locate(region, change.target);
      if (place.dependent) entry(name).whole = true;
      if (!place.inRoot) continue;
      if (change.kind === "childList") entry(name).membership = true;
      if (place.key === undefined) entry(name).whole = true;
      else entry(name).keys.add(place.key);
    }
  }
  return result;
}

/** Whether a change to `target` can affect a region's records: it is in the root, an item's extent, or a `dependsOn` node. */
export function touches(region: RegionIndex, target: TreeNode): boolean {
  const place = locate(region, target);
  return place.inRoot || place.dependent;
}

/** Where a changed node sits relative to one region: the first item or extent above it, inside the root, inside a `dependsOn` node. */
function locate(region: RegionIndex, target: TreeNode): { key?: string; inRoot: boolean; dependent: boolean } {
  let key: string | undefined;
  let inRoot = false;
  let dependent = false;
  for (let node: TreeNode | null = target; node; node = node.parentNode) {
    key ??= region.items.get(node);
    if (node === region.root) inRoot = true;
    if (region.dependsOn.includes(node)) dependent = true;
  }
  // An extent node may sit outside the root; it still belongs to its item.
  if (key !== undefined) inRoot = true;
  return { key, inRoot, dependent };
}

function attached(node: TreeNode, top: TreeNode): boolean {
  for (let current: TreeNode | null = node; current; current = current.parentNode) {
    if (current === top) return true;
  }
  return false;
}
