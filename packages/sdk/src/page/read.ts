import { TEXT_MAX, type Field, type Fields, type ListValue, type ReadSpec, type Take } from "@genesis/core";
import { PageError } from "./errors.js";
import { locate, locateAll, type RecordLookup } from "./locate.js";
import type { PageModule, Reader } from "./module.js";

/**
 * One engine for both kinds of read: a JSON `ReadSpec` and a page module's reader compile to the
 * same `Compiled` shape, which the `read` operation runs once and a watch keeps running.
 */
interface Common {
  /** The element changes are watched under; null when it is not on the page. */
  root(): Element | null;
  dependsOn: string[];
  fields: boolean;
  measure: boolean;
}

export interface CompiledList extends Common {
  kind: "list";
  items(root: Element): Element[];
  key(item: Element): string;
  read(item: Element): unknown;
  extent(item: Element): (Node | null | undefined)[];
  /** False while the page offers more items; undefined when the list has no "more" link. */
  complete(): boolean | undefined;
  virtualized: boolean;
  limit: number;
}

export interface CompiledOne extends Common {
  kind: "one";
  read(root: Element): unknown;
}

export interface CompiledValue extends Common {
  kind: "value";
  read(): unknown;
}

export type Compiled = CompiledList | CompiledOne | CompiledValue;

export interface CompileContext {
  module?: PageModule;
  records: RecordLookup;
  /** The largest list a read returns: `patchRecordsMax` times 5. */
  listMax: number;
}

/** Compiles a validated read specification. An unknown reader is `NOT_FOUND`. */
export function compile(spec: ReadSpec, context: CompileContext): Compiled {
  if ("reader" in spec) {
    const reader = context.module?.readers?.[spec.reader];
    if (!reader) throw new PageError("NOT_FOUND", `The page module has no reader ${spec.reader}`);
    return compileReader(reader, spec.args, context.listMax);
  }
  const { records } = context;
  if ("one" in spec) {
    const locator = spec.one;
    return {
      kind: "one",
      root: () => optional(() => locate(locator, records)),
      read: element => readFields(element, spec.fields),
      dependsOn: [],
      fields: false,
      measure: spec.measure === true,
    };
  }
  const within = spec.within;
  const limit = Math.min(spec.limit ?? context.listMax, context.listMax);
  return {
    kind: "list",
    root: () => within ? optional(() => locate(within, records)) : document.documentElement,
    items: root => locateAll(spec.list, records, root),
    key: item => keyString(readField(item, spec.key)),
    read: item => readFields(item, spec.fields),
    extent: () => [],
    complete: () => undefined,
    virtualized: spec.virtualized === true,
    limit,
    dependsOn: [],
    fields: false,
    measure: false,
  };
}

function compileReader(reader: Reader, args: unknown, listMax: number): Compiled {
  const common = { dependsOn: reader.dependsOn ?? [], fields: reader.fields === true, measure: reader.measure === true };
  if (reader.kind === "value") {
    const selector = reader.root;
    return {
      ...common,
      kind: "value",
      root: () => selector ? document.querySelector(selector) : document.documentElement,
      read: () => sync(reader.read(document, args)),
    };
  }
  if (reader.kind === "one") {
    return { ...common, kind: "one", root: () => document.querySelector(reader.root), read: root => sync(reader.read(root, args)) };
  }
  const more = reader.more;
  return {
    ...common,
    kind: "list",
    root: () => document.querySelector(reader.root),
    items: root => [...root.querySelectorAll(reader.items)],
    key: item => {
      const key = reader.key(item);
      if (typeof key !== "string" || key === "") throw new PageError("INVALID_ARGUMENT", "key must return a non-empty string");
      return key;
    },
    read: item => sync(reader.read(item, args)),
    extent: item => reader.extent?.(item) ?? [],
    complete: () => more ? document.querySelector(more) === null : undefined,
    virtualized: reader.virtualized === true,
    limit: listMax,
  };
}

/** Runs a compiled read once: a record (or null), a value, or a list. */
export function readOnce(compiled: Compiled): unknown {
  const root = compiled.root();
  if (compiled.kind === "value") return json(compiled.read());
  if (compiled.kind === "one") return root ? json(compiled.read(root)) : null;
  const items = root ? compiled.items(root) : [];
  const value: ListValue & { complete?: boolean } = { order: [], records: {} };
  for (const item of items) {
    if (value.order.length >= compiled.limit) {
      value.truncated = true;
      break;
    }
    const key = compiled.key(item);
    if (key in value.records) throw new PageError("CONFLICT", `Two items have the key ${key}`);
    value.order.push(key);
    value.records[key] = json(compiled.read(item));
  }
  const complete = compiled.complete();
  if (complete !== undefined) value.complete = complete;
  return value;
}

/** A reader's value as JSON data: `undefined` becomes null, and a promise is `ASYNC_READ`. */
export function sync(value: unknown): unknown {
  if (typeof (value as { then?: unknown } | null)?.then === "function") throw new PageError("ASYNC_READ", "A reader must return its data synchronously");
  return value === undefined ? null : value;
}

function json(value: unknown): unknown {
  return value === undefined ? null : value;
}

/** The element, or null when it is not on the page. Other errors (a strict locator, a frame) still throw. */
function optional(find: () => Element): Element | null {
  try {
    return find();
  } catch (error) {
    if (error instanceof PageError && (error.code === "NOT_FOUND" || error.code === "TARGET_NOT_FOUND") && !error.details) return null;
    throw error;
  }
}

function keyString(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string" || value === "") throw new PageError("INVALID_ARGUMENT", "The list key read no value");
  return value;
}

// ---- Fields ------------------------------------------------------------------------------------

export function readFields(element: Element, fields: Fields): { [name: string]: unknown } {
  const record: { [name: string]: unknown } = {};
  for (const [name, field] of Object.entries(fields)) record[name] = readField(element, field);
  return record;
}

function readField(element: Element, field: Field): unknown {
  const { at, take, all } = field;
  if (take === "count") return at ? element.querySelectorAll(at).length : 1;
  if (take === "exists" && !all) return at ? element.querySelector(at) !== null : true;
  const one = (target: Element) => field.fields ? readFields(target, field.fields) : readTake(target, take!, field.max ?? TEXT_MAX);
  if (all) return (at ? [...element.querySelectorAll(at)] : [element]).map(one);
  const target = at ? element.querySelector(at) : element;
  return target ? one(target) : null;
}

function readTake(element: Element, take: Take, max: number): unknown {
  if (typeof take === "object") {
    if (take.attr === "value" && isProtected(element)) return null;
    return element.getAttribute(take.attr);
  }
  switch (take) {
    case "text": return cut(collapse(textOf(element)), max);
    case "ownText": return cut(collapse([...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join("")), max);
    case "number": return numberIn(textOf(element));
    case "url": return urlOf(element);
    case "value": return isProtected(element) ? null : (element as HTMLInputElement).value ?? null;
    case "checked": return checkedOf(element);
    case "visible": return isVisible(element);
    case "rect": return rectOf(element);
    case "exists": return true;
    default: return null;
  }
}

/** The rendered text when the element has layout, else its text content. */
export function textOf(element: Element): string {
  return element instanceof HTMLElement ? element.innerText ?? element.textContent ?? "" : element.textContent ?? "";
}

export function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function cut(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

/** The first number in the text, with thousands separators removed; null when there is none. */
export function numberIn(text: string): number | null {
  const match = /-?\d[\d,]*(?:\.\d+)?/.exec(text);
  if (!match) return null;
  const value = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function urlOf(element: Element): string | null {
  const raw = element.getAttribute("href") ?? element.getAttribute("src");
  if (raw === null) return null;
  try { return new URL(raw, element.ownerDocument.baseURI).href; } catch { return null; }
}

export function checkedOf(element: Element): boolean | null {
  if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) return element.checked;
  const aria = element.getAttribute("aria-checked") ?? element.getAttribute("aria-pressed") ?? element.getAttribute("aria-selected");
  if (aria === "true" || aria === "mixed") return true;
  if (aria === "false") return false;
  return null;
}

/** Has a box and is not hidden by `display`, `visibility` or `opacity: 0` style. */
export function isVisible(element: Element): boolean {
  if (!element.isConnected) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse";
}

export function rectOf(element: Element): { x: number; y: number; width: number; height: number } {
  const rect = element.getBoundingClientRect();
  const round = (value: number) => Math.round(value * 10) / 10;
  return { x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height) };
}

const PROTECTED_AUTOCOMPLETE = new Set(["current-password", "new-password", "one-time-code"]);

/** Fields whose value the agent never reads or writes: passwords, hidden inputs, one-time codes, card data. */
export function isProtected(element: Element): boolean {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return false;
  if (element instanceof HTMLInputElement && (element.type === "password" || element.type === "hidden")) return true;
  const autocomplete = (element.getAttribute("autocomplete") ?? "").trim().toLowerCase().split(/\s+/);
  return autocomplete.some(token => PROTECTED_AUTOCOMPLETE.has(token) || token.startsWith("cc-"));
}
