import type { Locator } from "@genesis/core";
import { PageError } from "./errors.js";

/** Where a locator searches: a document, an element, or an open shadow root. */
type Scope = Document | Element | ShadowRoot;

/** Finds the element of one record of an open list watch. */
export interface RecordLookup {
  /** The record's element, `undefined` when the record is not on the page, `null` when no such list watch is open. */
  (watch: string, key: string): Element | undefined | null;
}

/** Tags with an implicit ARIA role. An element's own `role` attribute takes precedence. */
const IMPLICIT_ROLES: { [role: string]: string } = {
  button: "button, input[type=button], input[type=submit], input[type=reset], input[type=image], summary",
  link: "a[href], area[href]",
  textbox: "input:not([type]), input[type=text], input[type=email], input[type=search], input[type=tel], input[type=url], input[type=password], textarea",
  checkbox: "input[type=checkbox]",
  radio: "input[type=radio]",
  heading: "h1, h2, h3, h4, h5, h6",
  listitem: "li",
  list: "ul, ol",
  img: "img[alt]:not([alt=''])",
  combobox: "select:not([multiple])",
  listbox: "select[multiple]",
  option: "option",
  form: "form",
  navigation: "nav",
  main: "main",
  article: "article",
  dialog: "dialog",
  table: "table",
  row: "tr",
  cell: "td",
};

/**
 * The elements a locator matches now, in document order, after `has`, `strict` and `nth`.
 * Throws `NOT_FOUND` when a scope (`frame`, `within`) is missing, `TARGET_NOT_FOUND` when a
 * `record` is not on the page, and `AMBIGUOUS_TARGET` for a strict locator with several matches.
 */
export function locateAll(locator: Locator, records: RecordLookup, scope: Scope = document): Element[] {
  let root: Scope = scope;
  if (locator.frame) root = frameDocument(first(locator.frame, records, root));
  if (locator.within) root = first(locator.within, records, root);
  let matches: Element[];
  if (locator.record) {
    const element = records(locator.record.watch, locator.record.key);
    if (element === null) throw new PageError("NOT_FOUND", `No list watch ${locator.record.watch} is open`);
    if (element === undefined) throw new PageError("TARGET_NOT_FOUND", `Record ${locator.record.key} of ${locator.record.watch} is not on the page`);
    matches = locator.css || locator.text !== undefined || locator.role ? candidates(locator, element) : [element];
  } else {
    matches = candidates(locator, root);
  }
  if (locator.has) {
    const has = locator.has;
    matches = matches.filter(element => locateAll(has, records, element).length > 0);
  }
  if (locator.strict && matches.length > 1) {
    throw new PageError("AMBIGUOUS_TARGET", `${describe(locator)} matches ${matches.length} elements`);
  }
  if (locator.nth !== undefined) {
    const element = matches.at(locator.nth);
    matches = element ? [element] : [];
  }
  return matches;
}

/** The first match, or `NOT_FOUND` (`TARGET_NOT_FOUND` for a record). */
export function locate(locator: Locator, records: RecordLookup, scope: Scope = document): Element {
  return first(locator, records, scope);
}

function first(locator: Locator, records: RecordLookup, scope: Scope): Element {
  const element = locateAll(locator, records, scope)[0];
  if (!element) throw new PageError(locator.record && !locator.css && !locator.role && locator.text === undefined ? "TARGET_NOT_FOUND" : "NOT_FOUND", `Nothing matches ${describe(locator)}`);
  return element;
}

/** The document of a same-origin iframe. A cross-origin frame is `NOT_FOUND` with the reason `cross-origin-frame`. */
function frameDocument(frame: Element): Document {
  if (!(frame instanceof HTMLIFrameElement || frame instanceof HTMLFrameElement)) {
    throw new PageError("NOT_FOUND", "frame must match an iframe");
  }
  let doc: Document | null = null;
  try { doc = frame.contentDocument; } catch { doc = null; }
  if (!doc) throw new PageError("NOT_FOUND", "The frame is cross-origin, so its content cannot be reached", { reason: "cross-origin-frame" });
  return doc;
}

/** Candidates in the scope by `css`, `role` and `name`, then `text`. */
function candidates(locator: Locator, scope: Scope): Element[] {
  const deep = locator.pierce === true;
  let found: Element[];
  if (locator.css) {
    found = query(scope, locator.css, deep);
  } else if (locator.role) {
    const implicit = IMPLICIT_ROLES[locator.role];
    found = query(scope, implicit ? `${implicit}, [role="${cssEscape(locator.role)}"]` : `[role="${cssEscape(locator.role)}"]`, deep);
  } else {
    found = deepestWithText(scope, locator.text ?? "", locator.exact === true, deep);
  }
  if (locator.role) {
    const role = locator.role;
    found = found.filter(element => roleOf(element) === role);
    if (locator.name !== undefined) {
      const name = normalize(locator.name);
      found = found.filter(element => normalize(accessibleName(element)).includes(name));
    }
  }
  if (locator.text !== undefined && (locator.css || locator.role)) {
    const exact = locator.exact === true;
    const needle = normalize(locator.text);
    found = found.filter(element => textMatches(element, needle, exact));
  }
  return found;
}

/** `querySelectorAll` that also walks open shadow roots when `deep` is set, in document order. */
function query(scope: Scope, selector: string, deep: boolean): Element[] {
  let found: Element[];
  try {
    found = [...scope.querySelectorAll(selector)];
  } catch {
    throw new PageError("INVALID_ARGUMENT", `${selector} is not a valid CSS selector`);
  }
  if (!deep) return found;
  const result: Element[] = [];
  const walk = (root: Scope) => {
    for (const element of root.querySelectorAll("*")) {
      if (element.matches(selector)) result.push(element);
      if (element.shadowRoot) walk(element.shadowRoot);
    }
  };
  walk(scope);
  return result;
}

/**
 * The deepest elements whose text contains the needle: an element is kept when none of its
 * child elements contains the needle too. Text here is `textContent` with white space
 * collapsed, which is cheap enough to test on every element of a page.
 */
function deepestWithText(scope: Scope, text: string, exact: boolean, deep: boolean): Element[] {
  const needle = normalize(text);
  const all = query(scope, "*", deep).filter(element => !NON_TEXT.has(element.localName));
  const containing = new Set(all.filter(element => normalize(element.textContent ?? "").includes(needle)));
  const deepest = [...containing].filter(element => ![...element.children].some(child => containing.has(child)));
  return exact ? deepest.filter(element => normalize(element.textContent ?? "") === needle) : deepest;
}

const NON_TEXT = new Set(["script", "style", "noscript", "template", "head", "title", "meta", "link"]);

function textMatches(element: Element, needle: string, exact: boolean): boolean {
  const text = normalize(element.textContent ?? "");
  return exact ? text === needle : text.includes(needle);
}

/** The element's role: its `role` attribute, or the role its tag implies. */
export function roleOf(element: Element): string | null {
  const explicit = element.getAttribute("role")?.trim().split(/\s+/)[0];
  if (explicit) return explicit;
  for (const [role, selector] of Object.entries(IMPLICIT_ROLES)) {
    if (element.matches(selector)) return role;
  }
  return null;
}

/** `aria-label`, then `aria-labelledby`, then a field's labels, then `alt` or `title`, then the text. */
export function accessibleName(element: Element): string {
  const label = element.getAttribute("aria-label");
  if (label?.trim()) return label;
  const ids = element.getAttribute("aria-labelledby");
  if (ids) {
    const doc = element.ownerDocument;
    const text = ids.split(/\s+/).map(id => doc.getElementById(id)?.textContent ?? "").join(" ");
    if (text.trim()) return text;
  }
  const labels = (element as HTMLInputElement).labels;
  if (labels && labels.length) return [...labels].map(item => item.textContent ?? "").join(" ");
  const alt = element.getAttribute("alt") ?? element.getAttribute("title") ?? element.getAttribute("placeholder");
  if (alt?.trim()) return alt;
  return element.textContent ?? "";
}

/** Lower case with runs of white space collapsed and the ends trimmed. */
export function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
}

/** A short description of a locator for error messages. */
export function describe(locator: Locator): string {
  const parts: string[] = [];
  if (locator.record) parts.push(`record ${locator.record.watch}/${locator.record.key}`);
  if (locator.css) parts.push(locator.css);
  if (locator.role) parts.push(`role ${locator.role}${locator.name !== undefined ? ` "${locator.name}"` : ""}`);
  if (locator.text !== undefined) parts.push(`text "${locator.text}"`);
  if (locator.nth !== undefined) parts.push(`nth ${locator.nth}`);
  return parts.join(" ");
}
