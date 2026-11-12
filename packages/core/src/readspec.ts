import { InvalidSpecError, validateLocator, validateSelector, type Locator } from "./locator.js";
import { compilePattern, matchRoute } from "./routes.js";

/** What a field reads from its element. */
export type Take =
  | "text" | "ownText" | "exists" | "count" | "number" | "url" | "value" | "checked" | "visible" | "rect"
  | { attr: string };

/**
 * One field of a record. `at` is a CSS selector relative to the record's element; without it the
 * field reads the element itself. A field has `take` (a value) or `fields` (a sub-record), not both.
 */
export interface Field {
  at?: string;
  take?: Take;
  /** An array, one entry per match of `at`. */
  all?: boolean;
  fields?: Fields;
  /** For `text` and `ownText`: the most characters kept (default 2000). */
  max?: number;
}

export type Fields = Record<string, Field>;

/** What a `read` or a watch reads: one record, a keyed list, or a page module's reader. */
export type ReadSpec =
  | { one: Locator; fields: Fields; measure?: boolean }
  | { list: Locator; key: Field; fields: Fields; within?: Locator; virtualized?: boolean; limit?: number }
  | { reader: string; args?: unknown };

/** A URL a watch is limited to, with the pattern syntax of routes. */
export interface UrlGuard {
  pattern: string;
  /** Query keys that must be present. */
  query?: string[];
}

/** Fields nest at most this deep. */
export const FIELDS_DEPTH_MAX = 4;
/** The default and largest `max` of a text field. */
export const TEXT_MAX = 2000;

const TAKES = new Set(["text", "ownText", "exists", "count", "number", "url", "value", "checked", "visible", "rect"]);
const FIELD_KEYS = new Set(["at", "take", "all", "fields", "max"]);
const ONE_KEYS = new Set(["one", "fields", "measure"]);
const LIST_KEYS = new Set(["list", "key", "fields", "within", "virtualized", "limit"]);
const READER_KEYS = new Set(["reader", "args"]);

/** Checks that `value` is a read specification. Throws `InvalidSpecError`, which carries `INVALID_ARGUMENT`. */
export function validateReadSpec(value: unknown, path = "spec"): asserts value is ReadSpec {
  if (!isObject(value)) throw new InvalidSpecError(path, "must be an object");
  if ("reader" in value) {
    onlyKeys(value, READER_KEYS, path);
    if (typeof value.reader !== "string" || value.reader === "") throw new InvalidSpecError(`${path}.reader`, "must be a non-empty string");
    return;
  }
  if ("one" in value) {
    onlyKeys(value, ONE_KEYS, path);
    validateLocator(value.one, `${path}.one`);
    validateFields(value.fields, `${path}.fields`, 0);
    if (value.measure !== undefined && typeof value.measure !== "boolean") throw new InvalidSpecError(`${path}.measure`, "must be a boolean");
    return;
  }
  if ("list" in value) {
    onlyKeys(value, LIST_KEYS, path);
    validateLocator(value.list, `${path}.list`);
    validateField(value.key, `${path}.key`, 0);
    // The key is one string: { attr } or a take that reads one text or number.
    const key = value.key as Field;
    if (key.all || key.fields) throw new InvalidSpecError(`${path}.key`, "must read one value, without all or fields");
    if (typeof key.take === "string" && !["text", "ownText", "url", "value", "number"].includes(key.take)) {
      throw new InvalidSpecError(`${path}.key`, `cannot be read with take ${key.take}`);
    }
    validateFields(value.fields, `${path}.fields`, 0);
    if (value.within !== undefined) validateLocator(value.within, `${path}.within`);
    if (value.virtualized !== undefined && typeof value.virtualized !== "boolean") throw new InvalidSpecError(`${path}.virtualized`, "must be a boolean");
    if (value.limit !== undefined && !(Number.isInteger(value.limit) && (value.limit as number) > 0)) {
      throw new InvalidSpecError(`${path}.limit`, "must be a positive integer");
    }
    return;
  }
  throw new InvalidSpecError(path, "needs one of one, list or reader");
}

function validateFields(value: unknown, path: string, depth: number): void {
  if (!isObject(value)) throw new InvalidSpecError(path, "must be an object of fields");
  if (depth >= FIELDS_DEPTH_MAX) throw new InvalidSpecError(path, `nests deeper than ${FIELDS_DEPTH_MAX} levels`);
  for (const [name, field] of Object.entries(value)) validateField(field, `${path}.${name}`, depth);
}

function validateField(value: unknown, path: string, depth: number): void {
  if (!isObject(value)) throw new InvalidSpecError(path, "must be an object");
  onlyKeys(value, FIELD_KEYS, path);
  const { at, take, all, fields, max } = value;
  if (at !== undefined && (typeof at !== "string" || at === "")) throw new InvalidSpecError(`${path}.at`, "must be a non-empty CSS selector");
  if (at !== undefined) validateSelector(at, `${path}.at`);
  if ((take === undefined) === (fields === undefined)) throw new InvalidSpecError(path, "needs exactly one of take and fields");
  if (take !== undefined) validateTake(take, `${path}.take`);
  if (fields !== undefined) validateFields(fields, `${path}.fields`, depth + 1);
  if (all !== undefined && typeof all !== "boolean") throw new InvalidSpecError(`${path}.all`, "must be a boolean");
  if (max !== undefined && !(Number.isInteger(max) && (max as number) > 0 && (max as number) <= TEXT_MAX)) {
    throw new InvalidSpecError(`${path}.max`, `must be an integer from 1 to ${TEXT_MAX}`);
  }
}

function validateTake(value: unknown, path: string): void {
  if (typeof value === "string" && TAKES.has(value)) return;
  if (isObject(value) && Object.keys(value).length === 1 && typeof value.attr === "string" && value.attr !== "") return;
  throw new InvalidSpecError(path, `must be one of ${[...TAKES].join(", ")}, or { attr }`);
}

/** Checks a watch's `when` list. */
export function validateGuards(value: unknown, path = "when"): asserts value is UrlGuard[] {
  if (!Array.isArray(value) || value.length === 0) throw new InvalidSpecError(path, "must be a non-empty array");
  value.forEach((guard, i) => {
    const at = `${path}[${i}]`;
    if (!isObject(guard)) throw new InvalidSpecError(at, "must be an object");
    onlyKeys(guard, new Set(["pattern", "query"]), at);
    if (typeof guard.pattern !== "string" || !compilePattern(guard.pattern)) throw new InvalidSpecError(`${at}.pattern`, "is not a route pattern");
    const query = guard.query;
    if (query !== undefined && !(Array.isArray(query) && query.every(k => typeof k === "string" && k !== ""))) {
      throw new InvalidSpecError(`${at}.query`, "must be an array of query keys");
    }
  });
}

/** True when the https URL `url` matches one of the guards, by path pattern and required query keys. */
export function matchesGuard(url: string, guards: UrlGuard[]): boolean {
  let origin: string;
  try { origin = new URL(url).origin; } catch { return false; }
  const routes = guards.map((guard, i) => ({ id: String(i), pattern: guard.pattern, query: guard.query, screen: "" }));
  return matchRoute({ origins: [origin], routes }, url).kind === "route";
}

function onlyKeys(value: Record<string, unknown>, keys: Set<string>, path: string): void {
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) throw new InvalidSpecError(path, `unknown field ${key}`);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
