import type { ActionSpec as WireActionSpec, Step } from "@genesis/core";

/**
 * The adapter API (`COMPAT.adapterApi`). An applet's `src/adapter.ts` default-exports
 * `defineAdapter({...})`; the build runs it with `runAdapter` at document start in every context.
 * Nothing here touches the DOM when imported, so tooling can import an adapter in Node.
 */

export type { Step };
export type Steps = Step[];

/** What an action returns for the current page: `{ satisfied: true }`, or steps to run. */
export type ActionSpec = WireActionSpec<Document>;

/**
 * A desired-state function. It receives the record's element (the item for a collection, the
 * root for a single region, `null` for a page action) and the caller's arguments.
 */
export type Action<A = any> = (element: Element | null, args: A) => ActionSpec;

interface RegionOptions {
  /** Selector of the element that contains the region. */
  root: string;
  /** Selectors of nodes outside the region that `read` also depends on; a mutation inside them re-reads the region. */
  dependsOn?: string[];
  /** The record's identity across regions and pages; defaults to the key. */
  entity?: (element: Element) => string;
  /** Defaults to the region name. */
  entityType?: string;
  /** Listen to `input` and `change` inside the region and re-read on them. */
  fields?: boolean;
  /** Re-read when an element of the region changes size. */
  measure?: boolean;
  actions?: { [name: string]: Action };
}

export interface CollectionOptions<T = unknown> extends RegionOptions {
  /** Selector of the items, matched inside `root`. */
  items: string;
  /** A non-empty string unique within the region. */
  key: (item: Element) => string;
  /** Pure and synchronous: reads only the item, its descendants and its `extent`, and returns JSON. */
  read: (item: Element) => T;
  /** Nodes besides the item that `read` touches, such as a sibling row. */
  extent?: (item: Element) => (Node | null | undefined)[];
  /** Selector of the "more" link; while it is present the collection is not complete. */
  more?: string;
  /** Items leaving the DOM stay in the region for the current view. */
  virtualized?: boolean;
}

export interface SingleOptions<T = unknown> extends RegionOptions {
  /** Pure and synchronous: reads only the root and its descendants, and returns JSON. */
  read: (root: Element) => T;
  /** Defaults to the region name. */
  key?: (root: Element) => string;
}

export type CollectionRegion<T = unknown> = CollectionOptions<T> & { kind: "collection" };
export type SingleRegion<T = unknown> = SingleOptions<T> & { kind: "single" };
export type Region = CollectionRegion<any> | SingleRegion<any>;

export interface Page {
  /** Positive evidence that the page has rendered what the regions read. */
  ready: (doc: Document) => boolean;
  /** Overrides the adapter-level `account` on this page. */
  account?: (doc: Document) => string | null;
  /** Without an account the page's status is `auth`. */
  requiresAccount?: boolean;
  regions?: { [name: string]: Region };
  /** Actions on the page as a whole; they receive `null` as the element. */
  actions?: { [name: string]: Action };
}

export interface AdapterDefinition {
  /** The signed-in account read from the page, or null. Pages may override it. */
  account?: (doc: Document) => string | null;
  /** Where an `auth` page sends the user: a path on the first declared origin, or a function of the current URL. */
  signInUrl?: string | ((url: string) => string);
  /** Keyed by the page ids that manifest routes name. */
  pages: { [id: string]: Page };
}

export function collection<T>(options: CollectionOptions<T>): CollectionRegion<T> {
  return { ...options, kind: "collection" };
}

export function single<T>(options: SingleOptions<T>): SingleRegion<T> {
  return { ...options, kind: "single" };
}

/** Checks the definition's shape and returns it. Throws an Error naming the first bad field. */
export function defineAdapter(definition: AdapterDefinition): AdapterDefinition {
  const fail = (path: string, message: string): never => { throw new Error(`Adapter ${path} ${message}`); };
  const optionalFunction = (value: unknown, path: string) => {
    if (value !== undefined && typeof value !== "function") fail(path, "must be a function");
  };
  const selector = (value: unknown, path: string) => {
    if (typeof value !== "string" || value.trim() === "") fail(path, "must be a CSS selector");
  };
  const actions = (value: unknown, path: string) => {
    if (value === undefined) return;
    if (!isObject(value)) fail(path, "must be an object of functions");
    for (const [name, action] of Object.entries(value as object)) {
      if (typeof action !== "function") fail(`${path}.${name}`, "must be a function");
    }
  };

  if (!isObject(definition)) fail("definition", "must be an object");
  optionalFunction(definition.account, "account");
  if (definition.signInUrl !== undefined && typeof definition.signInUrl !== "string" && typeof definition.signInUrl !== "function") {
    fail("signInUrl", "must be a path or a function");
  }
  if (!isObject(definition.pages)) fail("pages", "must be an object");
  for (const [id, page] of Object.entries(definition.pages)) {
    const at = `pages.${id}`;
    if (!isObject(page)) fail(at, "must be an object");
    if (typeof page.ready !== "function") fail(`${at}.ready`, "must be a function");
    optionalFunction(page.account, `${at}.account`);
    actions(page.actions, `${at}.actions`);
    if (page.regions !== undefined && !isObject(page.regions)) fail(`${at}.regions`, "must be an object");
    for (const [name, region] of Object.entries(page.regions ?? {})) {
      const where = `${at}.regions.${name}`;
      if (!isObject(region) || (region.kind !== "collection" && region.kind !== "single")) {
        fail(where, "must be made with collection() or single()");
      }
      selector(region.root, `${where}.root`);
      if (typeof region.read !== "function") fail(`${where}.read`, "must be a function");
      optionalFunction(region.entity, `${where}.entity`);
      if (region.dependsOn !== undefined) {
        if (!Array.isArray(region.dependsOn)) fail(`${where}.dependsOn`, "must be an array of selectors");
        region.dependsOn.forEach((value, i) => selector(value, `${where}.dependsOn.${i}`));
      }
      actions(region.actions, `${where}.actions`);
      if (region.kind === "collection") {
        selector(region.items, `${where}.items`);
        if (typeof region.key !== "function") fail(`${where}.key`, "must be a function");
        optionalFunction(region.extent, `${where}.extent`);
        if (region.more !== undefined) selector(region.more, `${where}.more`);
      } else {
        optionalFunction(region.key, `${where}.key`);
      }
    }
  }
  return definition;
}

function isObject(value: unknown): value is { [key: string]: any } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export { runAdapter } from "./runtime.js";
