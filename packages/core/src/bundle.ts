import type { Manifest } from "./manifest.js";

export const BUNDLE_FORMAT = 2;

/** `dist/bundle.json`: the parsed manifest plus a hash for every file under `dist/files/`. */
export interface Bundle {
  format: typeof BUNDLE_FORMAT;
  manifest: Manifest;
  files: { path: string; sha256: string }[];
}

/** One transport file (`applet-<id>.bundle.json`) the host decodes and verifies against `bundle.files`. */
export interface BundleImport {
  bundle: Bundle;
  entries: { path: string; encoding: "utf8" | "base64"; content: string }[];
}
