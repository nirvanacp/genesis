import { COMPAT } from "./compat.js";
import type { Manifest } from "./manifest.js";

export const BUNDLE_FORMAT = COMPAT.bundleFormat;

/** The versions a bundle was built against, written by the builder into `bundle.json`. */
export interface BundleCompat {
  manifestSchema: number;
  bundleFormat: number;
  protocol: number;
  adapterApi: number;
  /** `FRAMEWORK_VERSION` of the SDK and of the tools that built the bundle. */
  sdk: string;
  tools: string;
  /** ISO 8601 build time. */
  builtAt: string;
}

/** Files every bundle has besides `bundle.json`: the UI document and the page script. */
export const REQUIRED_BUNDLE_FILES = ["index.html", "page.js"] as const;

/**
 * True for a path the host accepts inside a bundle: relative, at most 256 characters, `/`
 * between segments, and segments of `A-Z a-z 0-9 . _ -` that are not empty and do not start
 * with a dot (so no `..`).
 */
export function isBundlePath(path: string): boolean {
  return path.length > 0 && path.length <= 256 && path !== "bundle.json"
    && path.split("/").every(segment => /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(segment));
}

/**
 * `bundle.json` in the revision directory, beside `index.html`, `page.js` and the other files
 * of the built UI at their relative paths. `files` hashes every other file.
 */
export interface Bundle {
  format: typeof BUNDLE_FORMAT;
  compat: BundleCompat;
  manifest: Manifest;
  files: { path: string; sha256: string }[];
}

/**
 * The import file (`applet-<id>.bundle.json`). The host validates its structure before it reads
 * any version field, so the bundle and manifest are typed only as far as that check needs.
 */
export interface ImportEnvelope {
  envelope: number;
  bundle: {
    format: number;
    compat?: Partial<BundleCompat>;
    manifest: { schemaVersion: number; id: string; name: string; [key: string]: unknown };
    files: { path: string; sha256: string }[];
  };
  entries: { path: string; encoding: "utf8" | "base64"; content: string }[];
}
