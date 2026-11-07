import type { Manifest } from "./manifest.js";

type Segment = { literal: string } | { param: string };

export interface CompiledPattern {
  segments: Segment[];
  /** True when the pattern ends in `*`; the rest of the path becomes `params.rest`. */
  rest: boolean;
}

export type RouteMatch =
  | { routeId: string; kind: "adapted"; source: string; screen: string; params: Record<string, string> }
  | { routeId: string; kind: "website"; params: Record<string, string> }
  | { routeId: null; kind: "unsupported" | "external"; params: Record<string, never> };

const PARAM = /^:[A-Za-z][A-Za-z0-9_]*$/;
const LITERAL = /^[A-Za-z0-9_.~@-]+$/;
const cache = new Map<string, CompiledPattern | null>();

/** Compiles a route pattern, or returns null when it is not a valid schema 5 pattern. */
export function compilePattern(pattern: string): CompiledPattern | null {
  if (cache.has(pattern)) return cache.get(pattern)!;
  let compiled: CompiledPattern | null = null;
  if (pattern.startsWith("/") && pattern.length <= 256) {
    const parts = pattern === "/" ? [] : pattern.slice(1).split("/");
    const rest = parts.at(-1) === "*";
    if (rest) parts.pop();
    const segments: Segment[] = [];
    let valid = true;
    for (const part of parts) {
      if (PARAM.test(part)) segments.push({ param: part.slice(1) });
      else if (LITERAL.test(part) && part !== "." && part !== "..") segments.push({ literal: part });
      else valid = false;
    }
    if (valid) compiled = { segments, rest };
  }
  cache.set(pattern, compiled);
  return compiled;
}

/** Parses an https URL without credentials and drops the fragment. Returns null for any other URL. */
export function normalizeUrl(value: string): URL | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  url.hash = "";
  return url;
}

/** The normalized form of `value` used to compare and cache URLs, or null when it is not a usable URL. */
export function urlKey(value: string): string | null {
  return normalizeUrl(value)?.href ?? null;
}

/**
 * Classifies a URL: the first declared route whose pattern and required query keys match wins.
 * URLs on undeclared origins are `external`; URLs on declared origins without a route are `unsupported`.
 */
export function matchRoute(manifest: Pick<Manifest, "origins" | "routes">, value: string): RouteMatch {
  const url = normalizeUrl(value);
  if (!url || !manifest.origins.includes(url.origin)) return { routeId: null, kind: "external", params: {} };

  let actual: string[];
  try {
    actual = url.pathname.split("/").slice(1).map(decodeURIComponent);
  } catch {
    return { routeId: null, kind: "unsupported", params: {} };
  }
  if (actual.at(-1) === "") actual.pop(); // "/news/" matches "/news"; "/" becomes no segments

  for (const route of manifest.routes) {
    const pattern = compilePattern(route.pattern);
    if (!pattern) continue;
    const params = matchSegments(pattern, actual);
    if (!params) continue;
    if (!(route.query ?? []).every(key => url.searchParams.has(key))) continue;
    for (const key of route.query ?? []) params[key] = url.searchParams.get(key)!;
    if (route.kind === "adapted") {
      return { routeId: route.id, kind: "adapted", source: route.source, screen: route.screen, params };
    }
    return { routeId: route.id, kind: "website", params };
  }
  return { routeId: null, kind: "unsupported", params: {} };
}

function matchSegments(pattern: CompiledPattern, actual: string[]): Record<string, string> | null {
  if (pattern.rest ? actual.length < pattern.segments.length : actual.length !== pattern.segments.length) return null;
  const params: Record<string, string> = {};
  for (const [i, segment] of pattern.segments.entries()) {
    const part = actual[i];
    if (part === "") return null;
    if ("literal" in segment) {
      if (segment.literal !== part) return null;
    } else {
      params[segment.param] = part;
    }
  }
  if (pattern.rest) params.rest = actual.slice(pattern.segments.length).join("/");
  return params;
}
