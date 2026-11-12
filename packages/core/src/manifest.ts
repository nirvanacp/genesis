import { COMPAT } from "./compat.js";
import { compilePattern } from "./routes.js";

export const MANIFEST_SCHEMA_VERSION = COMPAT.manifestSchema;
export const MAX_CONTEXTS = 3;

/** `applet.json`, schema 6. */
export interface Manifest {
  schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
  id: string;
  name: string;
  /** Exact `https://host` origins the applet adapts. Other origins open as website. */
  origins: string[];
  foreground: { entry: string; screens: string[] };
  /** The adapter module, run at document start in every context. */
  adapter: string;
  /** One WebView each, with its own history. The first is active at launch. */
  contexts: Context[];
  /** The first matching route wins. */
  routes: Route[];
  capabilities: Capabilities;
  shell?: { accent?: string; icon?: string };
}

export interface Context {
  id: string;
  startUrl: string;
}

export interface Route {
  id: string;
  /** Literal segments, `:name` segments and an optional trailing `*`. */
  pattern: string;
  /** Required query keys; their values become params. */
  query?: string[];
  /** The adapter page that reads this route. */
  page: string;
  /** The foreground screen that renders it. */
  screen: string;
  /** The context `navigate({ url })` uses for this route from a tab root or `select`. */
  context?: string;
}

export interface Capabilities {
  storage?: boolean;
  services?: { id: string; config: string }[];
  notifications?: NotificationCapability;
}

/**
 * `{}` lets the foreground post notifications. `service` and `path` add a background poll of
 * that declared service every `intervalMinutes` (15 to 1440, default 60).
 */
export interface NotificationCapability {
  service?: string;
  path?: string;
  intervalMinutes?: number;
}

/** `path` is a JSON pointer into the manifest, such as `/routes/3/screen`. */
export interface ManifestError {
  path: string;
  message: string;
}

export type ParseResult = { manifest: Manifest } | { errors: ManifestError[] };

const ID = /^[a-z0-9-]+$/;
const ORIGIN = /^https:\/\/[a-z0-9.-]+(:[0-9]+)?$/;
const ACCENT = /^#[0-9a-fA-F]{6}$/;
const ICON = /^assets\/[A-Za-z0-9._\/-]+\.png$/;

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates `json` against schema 6. `exists` reports whether a path relative to the
 * applet directory exists, so the same rules run in Node tooling and in tests.
 */
export function parseManifest(json: unknown, exists: (relativePath: string) => boolean): ParseResult {
  const errors: ManifestError[] = [];
  const fail = (path: string, message: string) => { errors.push({ path, message }); };

  if (!isObject(json)) return { errors: [{ path: "", message: "manifest must be an object" }] };
  allowKeys(json, "", ["schemaVersion", "id", "name", "origins", "foreground", "adapter", "contexts", "routes", "capabilities", "shell"], fail);

  if (json.schemaVersion !== MANIFEST_SCHEMA_VERSION) fail("/schemaVersion", `must be ${MANIFEST_SCHEMA_VERSION}`);
  if (typeof json.id !== "string" || !ID.test(json.id)) fail("/id", "must match [a-z0-9-]+");
  if (typeof json.name !== "string" || json.name.trim() === "") fail("/name", "must be a non-empty string");

  const origins = stringArray(json.origins, "/origins", fail);
  origins.forEach((origin, i) => { if (!ORIGIN.test(origin)) fail(`/origins/${i}`, "must be an exact https://host origin"); });
  if (origins.length === 0) fail("/origins", "must list at least one origin");

  const screens = new Set<string>();
  if (!isObject(json.foreground)) fail("/foreground", "must be an object");
  else {
    allowKeys(json.foreground, "/foreground", ["entry", "screens"], fail);
    filePath(json.foreground.entry, "/foreground/entry", exists, fail);
    stringArray(json.foreground.screens, "/foreground/screens", fail).forEach((screen, i) => {
      if (!ID.test(screen)) fail(`/foreground/screens/${i}`, "must match [a-z0-9-]+");
      if (screens.has(screen)) fail(`/foreground/screens/${i}`, "is declared twice");
      screens.add(screen);
    });
  }

  filePath(json.adapter, "/adapter", exists, fail);

  const contextIds = new Set<string>();
  if (!Array.isArray(json.contexts)) fail("/contexts", "must be an array");
  else {
    if (json.contexts.length === 0) fail("/contexts", "must declare at least one context");
    if (json.contexts.length > MAX_CONTEXTS) fail("/contexts", `at most ${MAX_CONTEXTS} contexts`);
    json.contexts.forEach((context, i) => {
      const at = `/contexts/${i}`;
      if (!isObject(context)) return fail(at, "must be an object");
      allowKeys(context, at, ["id", "startUrl"], fail);
      if (typeof context.id !== "string" || !ID.test(context.id)) fail(`${at}/id`, "must match [a-z0-9-]+");
      else if (contextIds.has(context.id)) fail(`${at}/id`, "is declared twice");
      else contextIds.add(context.id);
      if (typeof context.startUrl !== "string" || !origins.includes(originOf(context.startUrl))) {
        fail(`${at}/startUrl`, "must be an https URL on a declared origin");
      }
    });
  }

  if (!Array.isArray(json.routes)) fail("/routes", "must be an array");
  else {
    const routeIds = new Set<string>();
    json.routes.forEach((route, i) => {
      const at = `/routes/${i}`;
      if (!isObject(route)) return fail(at, "must be an object");
      allowKeys(route, at, ["id", "pattern", "query", "page", "screen", "context"], fail);
      if (typeof route.id !== "string" || !ID.test(route.id)) fail(`${at}/id`, "must match [a-z0-9-]+");
      else if (routeIds.has(route.id)) fail(`${at}/id`, "is declared twice");
      else routeIds.add(route.id);
      if (typeof route.pattern !== "string" || compilePattern(route.pattern) === null) {
        fail(`${at}/pattern`, "must be a path of literal segments, :name segments and an optional trailing *");
      }
      if (route.query !== undefined) stringArray(route.query, `${at}/query`, fail);
      if (typeof route.page !== "string" || !ID.test(route.page)) fail(`${at}/page`, "must match [a-z0-9-]+");
      if (typeof route.screen !== "string" || !screens.has(route.screen)) fail(`${at}/screen`, "must name a declared screen");
      if (route.context !== undefined && (typeof route.context !== "string" || !contextIds.has(route.context))) {
        fail(`${at}/context`, "must name a declared context");
      }
    });
  }

  if (!isObject(json.capabilities)) fail("/capabilities", "must be an object");
  else {
    allowKeys(json.capabilities, "/capabilities", ["storage", "services", "notifications"], fail);
    if (json.capabilities.storage !== undefined && typeof json.capabilities.storage !== "boolean") fail("/capabilities/storage", "must be a boolean");
    const services = json.capabilities.services;
    if (services !== undefined) {
      if (!Array.isArray(services)) fail("/capabilities/services", "must be an array");
      else services.forEach((service, i) => {
        const at = `/capabilities/services/${i}`;
        if (!isObject(service)) return fail(at, "must be an object");
        allowKeys(service, at, ["id", "config"], fail);
        if (typeof service.id !== "string" || !ID.test(service.id)) fail(`${at}/id`, "must match [a-z0-9-]+");
        filePath(service.config, `${at}/config`, exists, fail);
      });
    }
    if (json.capabilities.notifications !== undefined) notifications(json.capabilities.notifications, services, fail);
  }

  if (json.shell !== undefined) {
    if (!isObject(json.shell)) fail("/shell", "must be an object");
    else {
      allowKeys(json.shell, "/shell", ["accent", "icon"], fail);
      if (json.shell.accent !== undefined && (typeof json.shell.accent !== "string" || !ACCENT.test(json.shell.accent))) {
        fail("/shell/accent", "must be a #rrggbb color");
      }
      const icon = json.shell.icon;
      if (icon !== undefined && (typeof icon !== "string" || !ICON.test(icon) || icon.split("/").includes(".."))) {
        fail("/shell/icon", "must be a PNG path under assets/");
      }
    }
  }

  return errors.length > 0 ? { errors } : { manifest: json as unknown as Manifest };
}

/** `capabilities.notifications`: its service must be declared, and polling needs both service and path. */
function notifications(value: unknown, services: unknown, fail: (path: string, message: string) => void): void {
  const at = "/capabilities/notifications";
  if (!isObject(value)) return fail(at, "must be an object");
  allowKeys(value, at, ["service", "path", "intervalMinutes"], fail);
  const declared = Array.isArray(services) ? services.filter(isObject).map((s) => s.id) : [];
  if (value.service !== undefined && (typeof value.service !== "string" || !declared.includes(value.service))) {
    fail(`${at}/service`, "must be the id of a service in capabilities.services");
  }
  if (value.path !== undefined && (typeof value.path !== "string" || !/^\/(?!\/)\S*$/.test(value.path))) {
    fail(`${at}/path`, "must be a path that starts with one /");
  }
  if ((value.service === undefined) !== (value.path === undefined)) fail(at, "service and path go together");
  const interval = value.intervalMinutes;
  if (interval !== undefined && (!Number.isInteger(interval) || (interval as number) < 15 || (interval as number) > 1440)) {
    fail(`${at}/intervalMinutes`, "must be an integer from 15 to 1440");
  }
}

function allowKeys(value: Json, at: string, keys: string[], fail: (path: string, message: string) => void) {
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${at}/${key}`, `is not a schema ${MANIFEST_SCHEMA_VERSION} field`);
}

function stringArray(value: unknown, at: string, fail: (path: string, message: string) => void): string[] {
  if (!Array.isArray(value)) { fail(at, "must be an array of strings"); return []; }
  value.forEach((item, i) => { if (typeof item !== "string") fail(`${at}/${i}`, "must be a string"); });
  return value.filter((item): item is string => typeof item === "string");
}

function filePath(value: unknown, at: string, exists: (relativePath: string) => boolean, fail: (path: string, message: string) => void) {
  if (typeof value !== "string" || value === "" || value.startsWith("/") || value.split("/").includes("..")) {
    fail(at, "must be a relative path inside the applet directory");
  } else if (!exists(value)) {
    fail(at, `file ${value} does not exist`);
  }
}

function originOf(url: string): string {
  try { return new URL(url).origin; } catch { return ""; }
}
