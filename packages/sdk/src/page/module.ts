import type { Evidence, PageStep } from "@genesis/core";

/**
 * Page modules: applet code that runs in the website page next to the page agent. A module names
 * readers (what a watch or a `read` can ask for with `{ reader }`) and commands (what `invoke`
 * runs). Nothing here touches the DOM when imported, so tooling can import a module in Node.
 */

interface ReaderOptions {
  /** Selectors of nodes outside the root that `read` also depends on; a change inside them reads again. */
  dependsOn?: string[];
  /** Listen to `input` and `change` inside the root and read again on them. */
  fields?: boolean;
  /** Read again when an element of the reader changes size. */
  measure?: boolean;
}

export interface ListOptions<T = unknown> extends ReaderOptions {
  /** Selector of the element that contains the items. */
  root: string;
  /** Selector of the items, matched inside `root`. */
  items: string;
  /** A non-empty string unique within the list. */
  key: (item: Element) => string;
  /** Pure and synchronous: reads only the item, its descendants and its `extent`, and returns JSON. */
  read: (item: Element, args?: unknown) => T;
  /** Nodes besides the item that `read` touches, such as a sibling row. */
  extent?: (item: Element) => (Node | null | undefined)[];
  /** Selector of the "more" link; while it is present the list is not complete. */
  more?: string;
  /** Items leaving the DOM stay in the list for the current view, marked `present: false`. */
  virtualized?: boolean;
}

export interface OneOptions<T = unknown> extends ReaderOptions {
  /** Selector of the element the record is read from. No match reads `null`. */
  root: string;
  /** Pure and synchronous: reads only the root and its descendants, and returns JSON. */
  read: (root: Element, args?: unknown) => T;
}

export interface ValueOptions extends ReaderOptions {
  /** The value is read again when the document changes under this element (default the whole document). */
  root?: string;
}

export type ListReader<T = unknown> = ListOptions<T> & { kind: "list" };
export type OneReader<T = unknown> = OneOptions<T> & { kind: "one" };
export type ValueReader<T = unknown> = ValueOptions & { kind: "value"; read: (doc: Document, args?: unknown) => T };
export type Reader = ListReader<any> | OneReader<any> | ValueReader<any>;

/** What a command receives. `element` is the element of the call's `target`, or null without one. */
export interface CommandContext<A = any> {
  document: Document;
  url: string;
  element: Element | null;
  args: A;
}

/** Steps a command asks the agent to run, with the same rules as the `run` operation. */
export interface CommandSteps {
  steps: PageStep[];
  /** Evidence that the steps took effect; in a module it may be a function of the document. */
  until?: Evidence | ((doc: Document) => boolean);
  navigates?: boolean;
  deadlineMs?: number;
}

/**
 * Synchronous and without side effects of its own: returns a JSON value, `{ satisfied: true }`
 * when the wanted state already holds, or steps for the agent to run.
 */
export type Command<A = any> = (context: CommandContext<A>, args: A) => unknown;

export interface PageModuleDefinition {
  readers?: { [name: string]: Reader };
  commands?: { [name: string]: Command };
}

export type PageModule = PageModuleDefinition & { kind: "page-module" };

const NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

export function list<T>(options: ListOptions<T>): ListReader<T> {
  return { ...options, kind: "list" };
}

export function one<T>(options: OneOptions<T>): OneReader<T> {
  return { ...options, kind: "one" };
}

/** A reader that returns any JSON value from a function of the document and the read's `args`. */
export function value<T>(read: (doc: Document, args?: unknown) => T, options: ValueOptions = {}): ValueReader<T> {
  return { ...options, read, kind: "value" };
}

/** Checks the module's shape and returns it marked as a page module. Throws an Error naming the first bad field. */
export function definePageModule(definition: PageModuleDefinition): PageModule {
  const fail = (path: string, message: string): never => { throw new Error(`Page module ${path} ${message}`); };
  const selector = (value: unknown, path: string) => {
    if (typeof value !== "string" || value.trim() === "") fail(path, "must be a CSS selector");
  };
  const optionalFunction = (value: unknown, path: string) => {
    if (value !== undefined && typeof value !== "function") fail(path, "must be a function");
  };
  const names = (value: unknown, path: string) => {
    if (value === undefined) return {};
    if (!isObject(value)) fail(path, "must be an object");
    for (const name of Object.keys(value as object)) {
      if (!NAME.test(name)) fail(`${path}.${name}`, "is not a valid name (a letter, then up to 63 letters, digits, _ . or -)");
    }
    return value as { [name: string]: any };
  };

  if (!isObject(definition)) fail("definition", "must be an object");
  for (const [name, reader] of Object.entries(names(definition.readers, "readers"))) {
    const at = `readers.${name}`;
    if (!isObject(reader) || !["list", "one", "value"].includes(reader.kind)) fail(at, "must be made with list(), one() or value()");
    if (typeof reader.read !== "function") fail(`${at}.read`, "must be a function");
    if (reader.kind !== "value" || reader.root !== undefined) selector(reader.root, `${at}.root`);
    if (reader.dependsOn !== undefined) {
      if (!Array.isArray(reader.dependsOn)) fail(`${at}.dependsOn`, "must be an array of selectors");
      reader.dependsOn.forEach((value: unknown, i: number) => selector(value, `${at}.dependsOn.${i}`));
    }
    if (reader.kind === "list") {
      selector(reader.items, `${at}.items`);
      if (typeof reader.key !== "function") fail(`${at}.key`, "must be a function");
      optionalFunction(reader.extent, `${at}.extent`);
      if (reader.more !== undefined) selector(reader.more, `${at}.more`);
    }
  }
  for (const [name, command] of Object.entries(names(definition.commands, "commands"))) {
    if (typeof command !== "function") fail(`commands.${name}`, "must be a function");
  }
  return { ...definition, kind: "page-module" };
}

function isObject(value: unknown): value is { [key: string]: any } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
