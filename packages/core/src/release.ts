import type { BundleCompat } from "./bundle.js";

/**
 * The format of the release record (`published/applet-<id>.release.json`). It is versioned on
 * its own and is not part of `COMPAT`.
 */
export const RELEASE_FORMAT = 1;

/** The committed bundle the record describes. */
export interface ReleaseBundle {
  file: string;
  /** Hex SHA-256 of the bundle file bytes. */
  sha256: string;
  size: number;
}

/** What the applet asks for, copied from `applet.json` so a reviewer sees it before downloading. */
export interface ReleaseCapabilities {
  storage: boolean;
  /** Service ids. */
  services: string[];
}

export interface ReleaseToolchain {
  /** The Genesis commit that built the bundle; CI rebuilds at this commit. */
  genesisCommit: string;
  node: string;
  tools: string;
  sdk: string;
}

/** Where the applet is published, from the git remote. Lets a bundled copy match later releases. */
export interface ReleaseHome {
  fullName: string;
  /** `.` for a single-applet repository. */
  path: string;
}

/** Added by CI to the release asset copy. The committed record cannot hold its own commit. */
export interface ReleaseSource {
  repository: { id: number; fullName: string };
  path: string;
  commit: string;
  tag: string;
  workflowRun: string;
}

export interface ReleaseRecord {
  releaseFormat: typeof RELEASE_FORMAT;
  appletId: string;
  name: string;
  version: string;
  bundle: ReleaseBundle;
  compat: BundleCompat;
  origins: string[];
  capabilities: ReleaseCapabilities;
  toolchain: ReleaseToolchain;
  home?: ReleaseHome;
  /** Equals `compat.builtAt` inside the bundle. */
  builtAt: string;
  source?: ReleaseSource;
}

/** A semver version: `MAJOR.MINOR.PATCH` with an optional `-prerelease`. Build metadata is refused. */
export interface Version {
  major: number;
  minor: number;
  patch: number;
  prerelease: (string | number)[];
}

const NUMBER = "(0|[1-9]\\d*)";
const IDENTIFIER = "(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)";
const VERSION = new RegExp(`^${NUMBER}\\.${NUMBER}\\.${NUMBER}(?:-(${IDENTIFIER}(?:\\.${IDENTIFIER})*))?$`);

/** Parses a version, or returns null when it is not valid semver without build metadata. */
export function parseVersion(text: unknown): Version | null {
  if (typeof text !== "string") return null;
  const match = VERSION.exec(text);
  if (!match) return null;
  const [major, minor, patch] = [match[1], match[2], match[3]].map(Number);
  if (![major, minor, patch].every(Number.isSafeInteger)) return null;
  const prerelease = match[4] ? match[4].split(".").map(part => (/^\d+$/.test(part) ? Number(part) : part)) : [];
  return { major, minor, patch, prerelease };
}

/** Semver precedence: negative when `a` is lower, 0 when equal, positive when higher. Throws on invalid input. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a), y = parseVersion(b);
  if (!x || !y) throw new Error(`Not a semver version: ${!x ? a : b}`);
  for (const key of ["major", "minor", "patch"] as const) {
    if (x[key] !== y[key]) return x[key] - y[key];
  }
  if (x.prerelease.length === 0 || y.prerelease.length === 0) return y.prerelease.length - x.prerelease.length;
  for (let i = 0; i < Math.min(x.prerelease.length, y.prerelease.length); i++) {
    const p = x.prerelease[i], q = y.prerelease[i];
    if (p === q) continue;
    if (typeof p === "number" && typeof q === "number") return p - q;
    if (typeof p === "number") return -1;
    if (typeof q === "number") return 1;
    return p < q ? -1 : 1;
  }
  return x.prerelease.length - y.prerelease.length;
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const HEX64 = /^[0-9a-f]{64}$/;
const HEX40 = /^[0-9a-f]{40}$/;
const ID = /^[a-z0-9-]+$/;

/** Validates a release record and returns it typed. Throws an error listing every problem. */
export function validateReleaseRecord(value: unknown): ReleaseRecord {
  const errors: string[] = [];
  const fail = (path: string, message: string) => { errors.push(`${path || "/"}: ${message}`); };
  const keys = (json: Json, path: string, required: string[], optional: string[] = []) => {
    for (const key of Object.keys(json)) if (![...required, ...optional].includes(key)) fail(`${path}/${key}`, "unknown field");
    for (const key of required) if (!Object.hasOwn(json, key)) fail(`${path}/${key}`, "is required");
  };
  const text = (json: Json, path: string, key: string, pattern?: RegExp) => {
    const v = json[key];
    if (typeof v !== "string" || v === "" || (pattern && !pattern.test(v))) fail(`${path}/${key}`, pattern ? `must match ${pattern}` : "must be a non-empty string");
  };

  if (!isObject(value)) throw new Error("release record: must be an object");
  keys(value, "", ["releaseFormat", "appletId", "name", "version", "bundle", "compat", "origins", "capabilities", "toolchain", "builtAt"], ["home", "source"]);
  if (value.releaseFormat !== RELEASE_FORMAT) fail("/releaseFormat", `must be ${RELEASE_FORMAT}`);
  text(value, "", "appletId", ID);
  text(value, "", "name");
  if (!parseVersion(value.version)) fail("/version", "must be a semver version without build metadata");
  text(value, "", "builtAt");

  const bundle = value.bundle;
  if (isObject(bundle)) {
    keys(bundle, "/bundle", ["file", "sha256", "size"]);
    if (bundle.file !== `applet-${String(value.appletId)}.bundle.json`) fail("/bundle/file", "must be applet-<appletId>.bundle.json");
    text(bundle, "/bundle", "sha256", HEX64);
    if (!Number.isSafeInteger(bundle.size) || (bundle.size as number) <= 0) fail("/bundle/size", "must be a positive integer");
  } else fail("/bundle", "must be an object");

  const compat = value.compat;
  if (isObject(compat)) {
    if (compat.builtAt !== value.builtAt) fail("/compat/builtAt", "must equal builtAt");
  } else fail("/compat", "must be an object");

  if (!Array.isArray(value.origins) || !value.origins.every(o => typeof o === "string")) fail("/origins", "must be an array of strings");

  const capabilities = value.capabilities;
  if (isObject(capabilities)) {
    keys(capabilities, "/capabilities", ["storage", "services"]);
    if (typeof capabilities.storage !== "boolean") fail("/capabilities/storage", "must be a boolean");
    if (!Array.isArray(capabilities.services) || !capabilities.services.every(s => typeof s === "string")) fail("/capabilities/services", "must be an array of strings");
  } else fail("/capabilities", "must be an object");

  const toolchain = value.toolchain;
  if (isObject(toolchain)) {
    keys(toolchain, "/toolchain", ["genesisCommit", "node", "tools", "sdk"]);
    text(toolchain, "/toolchain", "genesisCommit", HEX40);
    for (const key of ["node", "tools", "sdk"]) text(toolchain, "/toolchain", key);
  } else fail("/toolchain", "must be an object");

  if (value.home !== undefined) {
    if (isObject(value.home)) {
      keys(value.home, "/home", ["fullName", "path"]);
      text(value.home, "/home", "fullName", /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
      text(value.home, "/home", "path");
    } else fail("/home", "must be an object");
  }

  const source = value.source;
  if (source !== undefined) {
    if (isObject(source)) {
      keys(source, "/source", ["repository", "path", "commit", "tag", "workflowRun"]);
      const repository = source.repository;
      if (isObject(repository)) {
        keys(repository, "/source/repository", ["id", "fullName"]);
        if (!Number.isSafeInteger(repository.id) || (repository.id as number) <= 0) fail("/source/repository/id", "must be a positive integer");
        text(repository, "/source/repository", "fullName");
      } else fail("/source/repository", "must be an object");
      text(source, "/source", "path");
      text(source, "/source", "commit", HEX40);
      text(source, "/source", "tag");
      text(source, "/source", "workflowRun");
    } else fail("/source", "must be an object");
  }

  if (errors.length > 0) throw new Error(`release record is invalid:\n${errors.map(e => `  ${e}`).join("\n")}`);
  return value as unknown as ReleaseRecord;
}
