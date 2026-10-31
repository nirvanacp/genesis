import { validRoutePattern, resolveRoute, safeRouteUrl } from './routes.mjs';

const identifier = /^[a-z][a-z0-9-]{0,63}$/;
const fail = message => { throw Object.assign(new Error(message), { code: 'INVALID_PACKAGE' }); };
const requireValue = (condition, message) => { if (!condition) fail(message); };
function shape(value, keys, required = keys) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => keys.includes(key)) && required.every(key => Object.hasOwn(value, key)), 'Invalid isolated manifest object');
}
const id = value => requireValue(typeof value === 'string' && identifier.test(value), 'Invalid isolated identifier');
const unique = values => requireValue(new Set(values).size === values.length, 'Duplicate isolated identifier or predicate');
const text = value => requireValue(typeof value === 'string' && value.trim().length > 0 && Buffer.byteLength(value) <= 1024, 'Invalid route explanation');

// Validates isolated declarations, then delegates unchanged common fields to the
// legacy validator. It returns the original schema 2 shape, never a legacy bundle.
export function validateIsolatedManifest(input, validateCommon) {
  const manifest = structuredClone(input);
  shape(manifest, ['schemaVersion','id','name','dataSchemaVersion','sources','pages','actions','capabilities','services','shell','routeContracts','foreground'],
    ['schemaVersion','id','name','dataSchemaVersion','sources','pages','actions','capabilities','routeContracts','foreground']);
  requireValue(manifest.schemaVersion === 2, 'Expected schema 2');
  shape(manifest.foreground, ['pageId','screens']); id(manifest.foreground.pageId);
  requireValue(Array.isArray(manifest.foreground.screens) && manifest.foreground.screens.length > 0 && manifest.foreground.screens.length <= 100, 'Foreground screens required');
  manifest.foreground.screens.forEach(id); unique(manifest.foreground.screens);
  requireValue(Array.isArray(manifest.pages) && manifest.pages.some(page => page.id === manifest.foreground.pageId), 'Unknown foreground page');
  requireValue(Array.isArray(manifest.routeContracts) && manifest.routeContracts.length > 0 && manifest.routeContracts.length <= 16
    && Buffer.byteLength(JSON.stringify(manifest.routeContracts)) <= 131072, 'Invalid route contract bounds');
  unique(manifest.routeContracts.map(contract => contract.id));
  for (const contract of manifest.routeContracts) {
    shape(contract, ['id','origins','routes','unmatched']); id(contract.id);
    requireValue(contract.unmatched === 'unsupported', 'Explicit unsupported policy required');
    requireValue(Array.isArray(contract.origins) && contract.origins.length > 0 && contract.origins.every(origin => {
      const url = safeRouteUrl(origin); return url && url.origin === origin && url.hostname !== 'appassets.androidplatform.net';
    }), 'Exact HTTPS contract origins required'); unique(contract.origins);
    requireValue(Array.isArray(contract.routes) && contract.routes.length > 0 && contract.routes.length <= 100, 'Invalid contract routes');
    unique(contract.routes.map(rule => rule.id));
    const predicates = [], unconditional = [];
    for (const rule of contract.routes) {
      shape(rule, ['id','path','query','fragment','result'], ['id','path','result']); id(rule.id);
      requireValue(validRoutePattern(rule.path), 'Invalid route pattern');
      const query = rule.query ?? {};
      requireValue(query && typeof query === 'object' && !Array.isArray(query) && Object.keys(query).length <= 16, 'Invalid query constraints');
      for (const [key, constraint] of Object.entries(query)) {
        requireValue(key.length > 0 && Buffer.byteLength(key) <= 256, 'Invalid query key');
        if (constraint !== 'present') { shape(constraint, ['equals']); requireValue(typeof constraint.equals === 'string' && Buffer.byteLength(constraint.equals) <= 1024, 'Invalid query value'); }
      }
      if (rule.fragment !== undefined) { shape(rule.fragment, ['equals']); requireValue(typeof rule.fragment.equals === 'string' && Buffer.byteLength(rule.fragment.equals) <= 1024, 'Invalid fragment'); }
      requireValue(rule.result && ['custom','website','blocked'].includes(rule.result.kind), 'Invalid route outcome');
      if (rule.result.kind === 'custom') {
        shape(rule.result, ['kind','screen','adapter']); id(rule.result.screen); id(rule.result.adapter);
        requireValue(manifest.foreground.screens.includes(rule.result.screen), 'Unknown foreground screen');
      } else { shape(rule.result, ['kind','reason']); text(rule.result.reason); }
      const predicate = JSON.stringify([rule.path, Object.entries(query).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0), rule.fragment ?? null]);
      requireValue(!predicates.includes(predicate), 'Duplicate route predicate'); predicates.push(predicate);
      requireValue(!unconditional.some(path => covers(path, rule.path)), 'Unreachable route rule');
      if (!Object.keys(query).length && !rule.fragment) unconditional.push(rule.path);
    }
  }
  requireValue(Array.isArray(manifest.sources), 'Sources required');
  const common = { ...manifest, schemaVersion: 1 };
  delete common.foreground; delete common.routeContracts;
  common.sources = manifest.sources.map(source => {
    shape(source, ['id','startUrl','routeContractId','entry','homePaths'], ['id','startUrl','routeContractId','entry']); id(source.routeContractId);
    const contract = manifest.routeContracts.find(item => item.id === source.routeContractId);
    requireValue(contract, 'Unknown route contract');
    const start = resolveRoute(contract, source.startUrl);
    requireValue(start.kind === 'matched' && start.result.kind !== 'blocked', 'Start URL requires explicit custom or website route');
    const { routeContractId, ...legacy } = source;
    return { ...legacy, origins: contract.origins };
  });
  for (const choice of manifest.shell?.choices ?? []) {
    const sourceId = choice.sourceId ?? manifest.shell.sections[0]?.sourceId;
    const source = manifest.sources.find(item => item.id === sourceId);
    const contract = manifest.routeContracts.find(item => item.id === source?.routeContractId);
    const result = contract && resolveRoute(contract, choice.url);
    requireValue(result?.kind === 'matched' && result.result.kind !== 'blocked', 'Choice requires explicit custom or website route');
  }
  validateCommon(common);
  return manifest;
}

// Whether every pathname accepted by later is also accepted by earlier.
function covers(earlier, later) {
  const a = earlier.slice(1).split('/'), b = later.slice(1).split('/');
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '*') return true;
    if (b[i] === undefined || b[i] === '*' || !(a[i].startsWith(':') || a[i] === b[i])) return false;
  }
  return a.length === b.length;
}
