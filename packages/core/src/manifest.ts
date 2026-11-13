import { COMPAT } from "./compat.js";
import { isBundlePath } from "./bundle.js";

export const MANIFEST_SCHEMA_VERSION = COMPAT.manifestSchema;
export const MAX_CONTEXTS = 3;

/** The manifest inside a bundle: the source `applet.json` without its `build` section. */
export interface Manifest {
  schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
  id: string;
  name: string;
  /** Exact `https://host` origins the applet adapts. Other origins open as website. */
  origins: string[];
  foreground: Foreground;
  /** One WebView each, with its own history. The first is active at launch. */
  contexts: Context[];
  capabilities: Capabilities;
  shell?: { accent?: string; icon?: string };
}

/** The applet's UI. `web` is the only kind: an HTML document inside the bundle. */
export interface Foreground {
  kind: "web";
  /** The UI's HTML file inside the bundle. */
  entry: string;
}

export interface Context {
  id: string;
  startUrl: string;
}

/**
 * The `build` section of the source `applet.json`. The tool reads it and leaves it out of the
 * bundled manifest.
 */
export interface BuildConfig {
  /** A source file the tool bundles, or a command that writes the built UI into `dir`. */
  foreground: { entry: string } | { command: string; dir: string };
  /** The page module, bundled into `page.js` with the page agent. Without it `page.js` is the agent alone. */
  page?: string;
  /** The type check command, for a project without `tsconfig.json`. */
  check?: string;
}

/** A parsed source `applet.json`. */
export interface SourceManifest {
  manifest: Manifest;
  build: BuildConfig;
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

/** `path` is a JSON pointer into the manifest, such as `/contexts/0/startUrl`. */
export interface ManifestError {
  path: string;
  message: string;
}

export type ParseResult = { manifest: Manifest } | { errors: ManifestError[] };
export type SourceParseResult = SourceManifest | { errors: ManifestError[] };

const ID = /^[a-z0-9-]+$/;
const ORIGIN = /^https:\/\/[a-z0-9.-]+(:[0-9]+)?$/;
const ACCENT = /^#[0-9a-fA-F]{6}$/;
const ICON = /^assets\/[A-Za-z0-9._\/-]+\.png$/;

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Fields of the layout before the open SDK, which `parseSourceManifest` reports together. */
const OLD_LAYOUT = "routes, foreground.screens and adapter are no longer manifest fields: routes and screens moved to code (the router helper of @genesis/sdk/router), and the page script moved to build.page";

/**
 * Validates a source `applet.json` and splits it into the bundled manifest and its `build`
 * section. `exists` reports whether a path relative to the applet directory exists, so the same
 * rules run in Node tooling and in tests.
 */
export function parseSourceManifest(json: unknown, exists: (relativePath: string) => boolean): SourceParseResult {
  if (!isObject(json)) return { errors: [{ path: "", message: "manifest must be an object" }] };
  if ("routes" in json || "adapter" in json || (isObject(json.foreground) && "screens" in json.foreground)) {
    return { errors: [{ path: "", message: OLD_LAYOUT }] };
  }
  const { build, ...rest } = json;
  const errors: ManifestError[] = [];
  const fail = (path: string, message: string) => { errors.push({ path, message }); };
  const parsed = parseManifest(rest, exists);
  if ("errors" in parsed) errors.push(...parsed.errors);

  if (!isObject(build)) fail("/build", "must be an object");
  else {
    allowKeys(build, "/build", ["foreground", "page", "check"], fail);
    const foreground = build.foreground;
    if (!isObject(foreground)) fail("/build/foreground", "must be { entry } or { command, dir }");
    else if ("entry" in foreground) {
      allowKeys(foreground, "/build/foreground", ["entry"], fail);
      filePath(foreground.entry, "/build/foreground/entry", exists, fail);
    } else {
      allowKeys(foreground, "/build/foreground", ["command", "dir"], fail);
      if (typeof foreground.command !== "string" || foreground.command.trim() === "") fail("/build/foreground/command", "must be a non-empty shell command");
      if (typeof foreground.dir !== "string" || !isBundlePath(foreground.dir)) fail("/build/foreground/dir", "must be a relative directory inside the applet directory");
    }
    if (build.page !== undefined) filePath(build.page, "/build/page", exists, fail);
    if (build.check !== undefined && (typeof build.check !== "string" || build.check.trim() === "")) fail("/build/check", "must be a non-empty shell command");
  }

  if (errors.length > 0 || "errors" in parsed) return { errors };
  return { manifest: parsed.manifest, build: build as unknown as BuildConfig };
}

/**
 * Validates a bundled manifest against schema 6. `exists` reports whether a path relative to
 * the applet directory exists, for the service configurations.
 */
export function parseManifest(json: unknown, exists: (relativePath: string) => boolean): ParseResult {
  const errors: ManifestError[] = [];
  const fail = (path: string, message: string) => { errors.push({ path, message }); };

  if (!isObject(json)) return { errors: [{ path: "", message: "manifest must be an object" }] };
  allowKeys(json, "", ["schemaVersion", "id", "name", "origins", "foreground", "contexts", "capabilities", "shell"], fail);

  if (json.schemaVersion !== MANIFEST_SCHEMA_VERSION) fail("/schemaVersion", `must be ${MANIFEST_SCHEMA_VERSION}`);
  if (typeof json.id !== "string" || !ID.test(json.id)) fail("/id", "must match [a-z0-9-]+");
  if (typeof json.name !== "string" || json.name.trim() === "") fail("/name", "must be a non-empty string");

  const origins = stringArray(json.origins, "/origins", fail);
  origins.forEach((origin, i) => { if (!ORIGIN.test(origin)) fail(`/origins/${i}`, "must be an exact https://host origin"); });
  if (origins.length === 0) fail("/origins", "must list at least one origin");

  if (!isObject(json.foreground)) fail("/foreground", "must be an object");
  else {
    allowKeys(json.foreground, "/foreground", ["kind", "entry"], fail);
    if (json.foreground.kind !== "web") fail("/foreground/kind", "must be \"web\"");
    if (typeof json.foreground.entry !== "string" || !isBundlePath(json.foreground.entry) || !json.foreground.entry.endsWith(".html")) {
      fail("/foreground/entry", "must be the path of an HTML file inside the bundle, such as index.html");
    }
  }

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
