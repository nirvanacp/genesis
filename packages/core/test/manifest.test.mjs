import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isBundlePath, parseSourceManifest } from "../dist/index.js";

const HN = "https://news.ycombinator.com";
const files = new Set(["src/main.tsx", "src/page.ts", "backend/service.json"]);
const exists = path => files.has(path);

function source(overrides = {}) {
  return {
    schemaVersion: 6,
    id: "hn",
    name: "Hacker News",
    origins: [HN],
    foreground: { kind: "web", entry: "index.html" },
    contexts: [{ id: "primary", startUrl: `${HN}/` }],
    capabilities: { services: [{ id: "bookmarks", config: "backend/service.json" }] },
    build: { foreground: { entry: "src/main.tsx" }, page: "src/page.ts" },
    ...overrides,
  };
}

const paths = result => ("errors" in result ? result.errors.map(error => error.path) : []);

describe("parseSourceManifest", () => {
  test("splits the build section from the bundled manifest", () => {
    const result = parseSourceManifest(source(), exists);
    assert.deepEqual(result.build, { foreground: { entry: "src/main.tsx" }, page: "src/page.ts" });
    assert.equal("build" in result.manifest, false);
    assert.deepEqual(result.manifest.foreground, { kind: "web", entry: "index.html" });
  });

  test("accepts a build command with its output directory and a check command", () => {
    const result = parseSourceManifest(source({ build: { foreground: { command: "npx vite build", dir: "dist" }, check: "npx vue-tsc --noEmit" } }), exists);
    assert.deepEqual(result.build.foreground, { command: "npx vite build", dir: "dist" });
  });

  test("reports the old layout in one message", () => {
    for (const old of [{ routes: [] }, { adapter: "src/adapter.ts" }, { foreground: { entry: "src/main.tsx", screens: [] } }]) {
      const result = parseSourceManifest(source(old), exists);
      assert.equal(result.errors.length, 1);
      assert.match(result.errors[0].message, /routes, foreground\.screens and adapter.*build\.page/);
    }
  });

  test("requires a web foreground with an HTML entry inside the bundle", () => {
    assert.deepEqual(paths(parseSourceManifest(source({ foreground: { entry: "index.html" } }), exists)), ["/foreground/kind"]);
    assert.deepEqual(paths(parseSourceManifest(source({ foreground: { kind: "web", entry: "../index.html" } }), exists)), ["/foreground/entry"]);
    assert.deepEqual(paths(parseSourceManifest(source({ foreground: { kind: "web", entry: "main.js" } }), exists)), ["/foreground/entry"]);
  });

  test("validates the build section", () => {
    assert.deepEqual(paths(parseSourceManifest(source({ build: undefined }), exists)), ["/build"]);
    assert.deepEqual(paths(parseSourceManifest(source({ build: { foreground: { entry: "src/missing.tsx" } } }), exists)), ["/build/foreground/entry"]);
    assert.deepEqual(paths(parseSourceManifest(source({ build: { foreground: { command: "", dir: "/dist" } } }), exists)), ["/build/foreground/command", "/build/foreground/dir"]);
    assert.deepEqual(paths(parseSourceManifest(source({ build: { foreground: { entry: "src/main.tsx" }, page: "src/nope.ts", extra: 1 } }), exists)), ["/build/extra", "/build/page"]);
  });
});

describe("isBundlePath", () => {
  test("accepts relative paths of safe segments", () => {
    for (const path of ["index.html", "page.js", "assets/app-1.2.css", "a/b_c/d-e.svg"]) assert.equal(isBundlePath(path), true, path);
  });

  test("refuses absolute, parent, hidden, empty and unusual paths", () => {
    for (const path of ["", "/index.html", "../x", "a/../b", ".env", "a//b", "a/", "bundle.json", "a b.js", "a\\b.js", "x".repeat(257)]) {
      assert.equal(isBundlePath(path), false, path);
    }
  });
});
