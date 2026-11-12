import type { ErrorCode } from "./errors.js";

/**
 * Finds elements in a context page. The page agent resolves a locator against the live document
 * each time it is used, so nothing holds an element across calls.
 */
export interface Locator {
  /** A CSS selector, evaluated inside the scope. */
  css?: string;
  /** Keeps elements whose rendered text contains this string, ignoring case and runs of white space. */
  text?: string;
  /** With `text`: the whole text must match. */
  exact?: boolean;
  /** An ARIA role, explicit or implied by the tag. */
  role?: string;
  /** With `role`: the accessible name. */
  name?: string;
  /** Scope: the element of one record of an open list watch. */
  record?: { watch: string; key: string };
  /** Scope: the first match of another locator. */
  within?: Locator;
  /** Keeps matches that contain a match of another locator. */
  has?: Locator;
  /** Picks one match; negative counts from the end. */
  nth?: number;
  /** Enters a same-origin iframe before matching. */
  frame?: Locator;
  /** Also searches open shadow roots. */
  pierce?: boolean;
  /** More than one match is the error `AMBIGUOUS_TARGET`. */
  strict?: boolean;
}

/** `within`, `has` and `frame` together nest at most this deep. */
export const LOCATOR_DEPTH_MAX = 4;

/** A page call argument that breaks the rules of a locator or read specification. */
export class InvalidSpecError extends Error {
  readonly code: ErrorCode = "INVALID_ARGUMENT";
  constructor(readonly path: string, message: string) {
    super(path ? `${path}: ${message}` : message);
    this.name = "InvalidSpecError";
  }
}

const KEYS = new Set(["css", "text", "exact", "role", "name", "record", "within", "has", "nth", "frame", "pierce", "strict"]);
const NESTED = ["within", "has", "frame"] as const;

/** Checks that `value` is a locator. Throws `InvalidSpecError`, which carries `INVALID_ARGUMENT`. */
export function validateLocator(value: unknown, path = "locator"): asserts value is Locator {
  checkLocator(value, path, 0);
}

function checkLocator(value: unknown, path: string, depth: number): void {
  if (!isObject(value)) throw new InvalidSpecError(path, "must be an object");
  for (const key of Object.keys(value)) {
    if (!KEYS.has(key)) throw new InvalidSpecError(path, `unknown field ${key}`);
  }
  const { css, text, exact, role, name, record, nth, pierce, strict } = value;
  if (css === undefined && text === undefined && role === undefined && record === undefined) {
    throw new InvalidSpecError(path, "needs one of css, text, role or record");
  }
  optionalString(css, `${path}.css`);
  optionalString(text, `${path}.text`);
  optionalString(role, `${path}.role`);
  if (name !== undefined) {
    if (typeof name !== "string") throw new InvalidSpecError(`${path}.name`, "must be a string");
    if (role === undefined) throw new InvalidSpecError(`${path}.name`, "needs role");
  }
  if (exact !== undefined) {
    if (typeof exact !== "boolean") throw new InvalidSpecError(`${path}.exact`, "must be a boolean");
    if (text === undefined) throw new InvalidSpecError(`${path}.exact`, "needs text");
  }
  if (record !== undefined) {
    const valid = isObject(record) && typeof record.watch === "string" && record.watch !== ""
      && typeof record.key === "string" && Object.keys(record).length === 2;
    if (!valid) throw new InvalidSpecError(`${path}.record`, "must be { watch, key } with two strings");
  }
  if (nth !== undefined && !Number.isInteger(nth)) throw new InvalidSpecError(`${path}.nth`, "must be an integer");
  for (const [key, flag] of [["pierce", pierce], ["strict", strict]] as const) {
    if (flag !== undefined && typeof flag !== "boolean") throw new InvalidSpecError(`${path}.${key}`, "must be a boolean");
  }
  for (const key of NESTED) {
    if (value[key] === undefined) continue;
    if (depth + 1 > LOCATOR_DEPTH_MAX) throw new InvalidSpecError(`${path}.${key}`, `nests deeper than ${LOCATOR_DEPTH_MAX} levels`);
    checkLocator(value[key], `${path}.${key}`, depth + 1);
  }
}

function optionalString(value: unknown, path: string): void {
  if (value !== undefined && (typeof value !== "string" || value === "")) throw new InvalidSpecError(path, "must be a non-empty string");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
