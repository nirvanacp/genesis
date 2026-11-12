type Segment = { literal: string } | { param: string };

export interface CompiledPattern {
  segments: Segment[];
  /** True when the pattern ends in `*`; the rest of the path becomes `params.rest`. */
  rest: boolean;
}

/** A route of the router table. The applet declares its routes in code, with the router helper of `@genesis/sdk/router`. */
export interface Route {
  id: string;
  /** Literal segments, `:name` segments and an optional trailing `*`. */
  pattern: string;
  /** Required query keys; their values become params. */
  query?: string[];
  /** The screen that renders it. */
  screen: string;
  /** The context `navigate({ url })` uses for this route from a tab root or `select`. */
  context?: string;
}

/** The fields route matching reads. */
export interface RouteSet {
  origins: string[];
  routes: Route[];
}

export type RouteMatch =
  | { kind: "route"; routeId: string; screen: string; context?: string; params: Record<string, string> }
  | { kind: "website"; url: string }
  | { kind: "external"; url: string };

const PARAM = /^:[A-Za-z][A-Za-z0-9_]*$/;
const LITERAL = /^[A-Za-z0-9_.~@-]+$/;
const cache = new Map<string, CompiledPattern | null>();

/** Compiles a route pattern, or returns null when it is not a valid route pattern. */
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

/** Parses an https URL without credentials and drops the fragment, for display. Returns null for any other URL. */
export function normalizeUrl(value: string): URL | null {
  const url = parseHttps(value);
  if (url) url.hash = "";
  return url;
}

/**
 * The identity of a view: the parsed URL with its query and fragment, or null when `value`
 * is not a URL. Two URLs with the same entry key show the same view.
 */
export function entryKey(value: string): string | null {
  try { return new URL(value).href; } catch { return null; }
}

/**
 * Classifies a URL. On a declared origin the first route whose pattern and required query keys
 * match wins, and a URL no route matches is `website`. Every other URL is `external`.
 */
export function matchRoute(table: RouteSet, value: string): RouteMatch {
  const url = parseHttps(value);
  if (!url || !table.origins.includes(url.origin)) return { kind: "external", url: value };

  let actual: string[];
  try {
    actual = url.pathname.split("/").slice(1).map(decodeURIComponent);
  } catch {
    return { kind: "website", url: value };
  }
  if (actual.at(-1) === "") actual.pop(); // "/news/" matches "/news"; "/" becomes no segments

  for (const route of table.routes) {
    const pattern = compilePattern(route.pattern);
    if (!pattern) continue;
    const params = matchSegments(pattern, actual);
    if (!params) continue;
    if (!(route.query ?? []).every(key => url.searchParams.has(key))) continue;
    for (const key of route.query ?? []) params[key] = url.searchParams.get(key)!;
    const match: RouteMatch = { kind: "route", routeId: route.id, screen: route.screen, params };
    if (route.context !== undefined) match.context = route.context;
    return match;
  }
  return { kind: "website", url: value };
}

/**
 * Ids of routes no URL can reach, because an earlier route matches every URL they match:
 * its segments cover theirs one by one and it requires no query key they do not require.
 */
export function unreachableRoutes(table: Pick<RouteSet, "routes">): string[] {
  const unreachable: string[] = [];
  table.routes.forEach((route, i) => {
    const pattern = compilePattern(route.pattern);
    if (!pattern) return;
    const shadowed = table.routes.slice(0, i).some(earlier => {
      const cover = compilePattern(earlier.pattern);
      if (!cover || !covers(cover, pattern)) return false;
      const required = new Set(route.query ?? []);
      return (earlier.query ?? []).every(key => required.has(key));
    });
    if (shadowed) unreachable.push(route.id);
  });
  return unreachable;
}

/** True when every path `inner` matches is also matched by `outer`. */
function covers(outer: CompiledPattern, inner: CompiledPattern): boolean {
  if (outer.rest) {
    if (inner.segments.length < outer.segments.length) return false;
  } else if (inner.rest || inner.segments.length !== outer.segments.length) {
    return false;
  }
  return outer.segments.every((segment, i) => {
    if ("param" in segment) return true;
    const other = inner.segments[i];
    return "literal" in other && other.literal === segment.literal;
  });
}

function parseHttps(value: string): URL | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  return url;
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
