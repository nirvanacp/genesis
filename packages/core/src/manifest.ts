import { compilePattern } from "./routes.js";

export const MANIFEST_SCHEMA_VERSION = 5;
export const MAX_SOURCES = 3;

/** `applet.json`, schema 5. */
export interface Manifest {
  schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
  id: string;
  name: string;
  /** Exact `https://host` origins the applet may load. */
  origins: string[];
  foreground: { entry: string; screens: string[] };
  sources: Source[];
  routes: Route[];
  capabilities: Capabilities;
  shell?: { accent?: string };
}

export interface Source {
  id: string;
  startUrl: string;
  adapter: string;
}

interface RouteBase {
  id: string;
  /** Literal segments, `:name` segments and an optional trailing `*`. */
  pattern: string;
  /** Required query keys; their values become params. */
  query?: string[];
}
export interface AdaptedRoute extends RouteBase {
  kind: "adapted";
  source: string;
  screen: string;
  requiresSignIn?: boolean;
}
export interface WebsiteRoute extends RouteBase {
  kind: "website";
}
export type Route = AdaptedRoute | WebsiteRoute;

export interface Capabilities {
  storage?: boolean;
  services?: { id: string; config: string }[];
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

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates `json` against schema 5. `exists` reports whether a path relative to the
 * applet directory exists, so the same rules run in Node tooling and in tests.
 */
export function parseManifest(json: unknown, exists: (relativePath: string) => boolean): ParseResult {
  const errors: ManifestError[] = [];
  const fail = (path: string, message: string) => { errors.push({ path, message }); };

  if (!isObject(json)) return { errors: [{ path: "", message: "manifest must be an object" }] };
  allowKeys(json, "", ["schemaVersion", "id", "name", "origins", "foreground", "sources", "routes", "capabilities", "shell"], fail);

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

  const sourceIds = new Set<string>();
  if (!Array.isArray(json.sources)) fail("/sources", "must be an array");
  else {
    if (json.sources.length > MAX_SOURCES) fail("/sources", `at most ${MAX_SOURCES} sources`);
    json.sources.forEach((source, i) => {
      const at = `/sources/${i}`;
      if (!isObject(source)) return fail(at, "must be an object");
      allowKeys(source, at, ["id", "startUrl", "adapter"], fail);
      if (typeof source.id !== "string" || !ID.test(source.id)) fail(`${at}/id`, "must match [a-z0-9-]+");
      else if (sourceIds.has(source.id)) fail(`${at}/id`, "is declared twice");
      else sourceIds.add(source.id);
      if (typeof source.startUrl !== "string" || !origins.includes(originOf(source.startUrl))) {
        fail(`${at}/startUrl`, "must be an https URL on a declared origin");
      }
      filePath(source.adapter, `${at}/adapter`, exists, fail);
    });
  }

  if (!Array.isArray(json.routes)) fail("/routes", "must be an array");
  else {
    const routeIds = new Set<string>();
    json.routes.forEach((route, i) => {
      const at = `/routes/${i}`;
      if (!isObject(route)) return fail(at, "must be an object");
      if (typeof route.id !== "string" || !ID.test(route.id)) fail(`${at}/id`, "must match [a-z0-9-]+");
      else if (routeIds.has(route.id)) fail(`${at}/id`, "is declared twice");
      else routeIds.add(route.id);
      if (typeof route.pattern !== "string" || compilePattern(route.pattern) === null) {
        fail(`${at}/pattern`, "must be a path of literal segments, :name segments and an optional trailing *");
      }
      if (route.query !== undefined) stringArray(route.query, `${at}/query`, fail);
      if (route.kind === "adapted") {
        allowKeys(route, at, ["id", "pattern", "query", "kind", "source", "screen", "requiresSignIn"], fail);
        if (typeof route.source !== "string" || !sourceIds.has(route.source)) fail(`${at}/source`, "must name a declared source");
        if (typeof route.screen !== "string" || !screens.has(route.screen)) fail(`${at}/screen`, "must name a declared screen");
        if (route.requiresSignIn !== undefined && typeof route.requiresSignIn !== "boolean") fail(`${at}/requiresSignIn`, "must be a boolean");
      } else if (route.kind === "website") {
        allowKeys(route, at, ["id", "pattern", "query", "kind"], fail);
      } else {
        fail(`${at}/kind`, 'must be "adapted" or "website"');
      }
    });
  }

  if (!isObject(json.capabilities)) fail("/capabilities", "must be an object");
  else {
    allowKeys(json.capabilities, "/capabilities", ["storage", "services"], fail);
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
  }

  if (json.shell !== undefined) {
    if (!isObject(json.shell)) fail("/shell", "must be an object");
    else {
      allowKeys(json.shell, "/shell", ["accent"], fail);
      if (json.shell.accent !== undefined && (typeof json.shell.accent !== "string" || !ACCENT.test(json.shell.accent))) {
        fail("/shell/accent", "must be a #rrggbb color");
      }
    }
  }

  return errors.length > 0 ? { errors } : { manifest: json as unknown as Manifest };
}

function allowKeys(value: Json, at: string, keys: string[], fail: (path: string, message: string) => void) {
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${at}/${key}`, "is not a schema 5 field");
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
