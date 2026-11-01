// Segment matching deliberately excludes regular expressions and partial wildcards.
export function validRoutePattern(pattern) {
  if (typeof pattern !== 'string' || pattern.length > 256 || !pattern.startsWith('/')) return false;
  if (pattern === '/') return true;
  const parts = pattern.slice(1).split('/');
  return parts.length <= 16 && parts.every((part, index) =>
    part === '*' ? index === parts.length - 1 : /^:[A-Za-z][A-Za-z0-9_]*$/.test(part)
      || /^[A-Za-z0-9_.-]+$/.test(part) && part !== '.' && part !== '..');
}
export function matchesRoute(pattern, pathname) {
  if (/%(?:2f|5c|2e|25)|\\|%(?![a-f0-9]{2})/i.test(pathname)) return false;
  if (pattern === '/') return pathname === '/';
  const parts = pattern.slice(1).split('/'), actual = pathname.slice(1).split('/');
  return parts.every((part, index) => part === '*' || actual[index] !== undefined && actual[index] !== ''
    && (part.startsWith(':') || part === actual[index]))
    && (parts.at(-1) === '*' ? actual.length >= parts.length - 1 : actual.length === parts.length);
}
export function customizedRoute(source, pathname) {
  if (source.ordinaryRoutes?.some(pattern => matchesRoute(pattern, pathname))) return false;
  return source.customizedRoutes ? source.customizedRoutes.some(pattern => matchesRoute(pattern, pathname))
    : source.customizedPaths ? source.customizedPaths.includes(pathname) : true;
}

// Validate before URL parsing, which normalizes dot segments and backslashes.
export function safeRouteUrl(value) {
  if (typeof value !== 'string' || new TextEncoder().encode(value).length > 8192 || /[\u0000-\u0020\u007f\\]/.test(value)
    || /%(?![a-f0-9]{2})/i.test(value)) return null;
  const raw = value.match(/^https:\/\/[^/?#]+([^?#]*)/i);
  if (!raw || /%(?:2f|5c|2e|25)/i.test(raw[1]) || /(?:^|\/)\.{1,2}(?:\/|$)/.test(raw[1])) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url : null;
  } catch { return null; }
}

export function resolveRoute(contract, value) {
  const url = safeRouteUrl(value);
  if (!url) return { kind: 'blocked' };
  if (!contract.origins.includes(url.origin)) return { kind: 'external' };
  const constrained = new Set(contract.routes.flatMap(rule => Object.keys(rule.query ?? {})));
  if ([...constrained].some(key => url.searchParams.getAll(key).length > 1)) return { kind: 'unsupported' };
  for (const rule of contract.routes) {
    if (!matchesRoute(rule.path, url.pathname)) continue;
    if (!Object.entries(rule.query ?? {}).every(([key, constraint]) => url.searchParams.has(key)
      && (constraint === 'present' || url.searchParams.get(key) === constraint.equals))) continue;
    if (rule.fragment && url.hash.slice(1) !== rule.fragment.equals) continue;
    return { kind: 'matched', routeId: rule.id, result: rule.result };
  }
  return { kind: 'unsupported' };
}
