import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { validRoutePattern, customizedRoute } from './routes.mjs';
import { validateIsolatedManifest } from './isolated-manifest.mjs';
import { createHash } from 'node:crypto';
export const RUNTIME_API_VERSION = 3;
export const FORMAT_VERSION = 1;
export const MAX_ASSET_BYTES = 4 * 1024 * 1024;
export const MAX_BUNDLE_BYTES = 8 * 1024 * 1024;
export const identifier = /^[a-z][a-z0-9-]{0,63}$/;
export function requireValue(condition, message) { if (!condition) throw Object.assign(new Error(message), { code: 'INVALID_PACKAGE' }); }
function object(value, keys, required = keys) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), 'Expected object');
  requireValue(Object.keys(value).every(k => keys.includes(k)) && required.every(k => Object.hasOwn(value, k)), `Unexpected or missing field: ${keys.join(', ')}`);
}
const array = value => { requireValue(Array.isArray(value), 'Expected array'); return value; };
const text = value => requireValue(typeof value === 'string' && value.trim().length > 0, 'Expected nonempty text');
const id = value => requireValue(typeof value === 'string' && identifier.test(value), 'Invalid identifier');
function unique(values, label) { requireValue(new Set(values).size === values.length, `Duplicate ${label}`); }
export function safePath(value) {
  return typeof value === 'string' && !path.posix.isAbsolute(value) && !value.includes('\\') && !value.includes('\0') && value.split('/').every(p => p && p !== '.' && p !== '..');
}
export async function containedFile(base, name) {
  requireValue(safePath(name), 'Unsafe relative file path');
  const root = await realpath(base), file = await realpath(path.join(root, name));
  requireValue(file.startsWith(root + path.sep) && (await stat(file)).isFile(), 'File escapes applet or is not a regular file');
  return file;
}
function httpsUrl(value) {
  requireValue(typeof value === 'string', 'Expected HTTPS URL');
  const url = new URL(value);
  requireValue(url.protocol === 'https:' && !url.username && !url.password && url.hostname !== 'appassets.androidplatform.net', 'Expected public HTTPS URL without credentials');
  return url;
}
function route(value) { return typeof value === 'string' && /^\/[a-zA-Z0-9/.\-]*$/.test(value) && !value.includes('..'); }
/** Validate authoring or compiled manifests; only readApplet performs filesystem checks. */
export function validateManifest(input) {
  if (input?.schemaVersion === 2) return validateIsolatedManifest(input, validateManifest);
  const manifest = structuredClone(input);
  object(manifest, ['schemaVersion','id','name','dataSchemaVersion','sources','pages','actions','capabilities','services','shell'], ['schemaVersion','id','name','dataSchemaVersion','sources','pages','actions','capabilities']);
  requireValue(manifest.schemaVersion === 1 && manifest.dataSchemaVersion === 1, 'Unsupported manifest/data schema version');
  id(manifest.id); text(manifest.name);
  array(manifest.capabilities).forEach(c => requireValue(['dom','navigation-policy','storage','services'].includes(c), 'Unsupported capability'));
  unique(manifest.capabilities, 'capability');
  manifest.services ??= [];
  array(manifest.services).forEach(id); unique(manifest.services, 'service');
  requireValue(!manifest.services.length || manifest.capabilities.includes('services'), 'Services capability required');
  requireValue(array(manifest.sources).length > 0, 'Sources required');
  unique(manifest.sources.map(s => s.id), 'source');
  for (const s of manifest.sources) {
    object(s, ['id','startUrl','origins','entry','homePaths','customizedPaths','customizedRoutes','ordinaryRoutes','navigationRules'], ['id','startUrl','origins','entry']); id(s.id);
    requireValue(safePath(s.entry), 'Unsafe source entry');
    requireValue(array(s.origins).length > 0, 'Exact HTTPS origins required'); unique(s.origins, 'origin');
    for (const origin of s.origins) requireValue(httpsUrl(origin).origin === origin, 'Use exact HTTPS origins');
    requireValue(s.origins.includes(httpsUrl(s.startUrl).origin), 'Start URL outside source origins');
    s.homePaths ??= []; s.navigationRules ??= [];
    requireValue(array(s.homePaths).every(route), 'Invalid home paths');
    requireValue(s.customizedPaths === undefined || array(s.customizedPaths).every(route), 'Invalid customized paths');
    requireValue(!(s.customizedPaths !== undefined && s.customizedRoutes !== undefined), 'Choose exact paths or route patterns');
    for (const patterns of [s.customizedRoutes, s.ordinaryRoutes]) if (patterns !== undefined) { requireValue(array(patterns).length <= 100 && patterns.every(validRoutePattern), 'Invalid route patterns'); unique(patterns, 'route pattern'); }
    unique(array(s.navigationRules).map(r => r.id), 'navigation rule');
    for (const r of s.navigationRules) {
      object(r, ['id','pathPrefix','action','fallbackUrl']); id(r.id);
      const fallback = httpsUrl(r.fallbackUrl);
      requireValue(r.action === 'block' && route(r.pathPrefix) && s.origins.includes(fallback.origin) && !s.navigationRules.some(n => typeof n.pathPrefix === 'string' && fallback.pathname.startsWith(n.pathPrefix)), 'Invalid navigation rule or fallback loop');
    }
  }
  unique(array(manifest.pages).map(p => p.id), 'page');
  for (const p of manifest.pages) { object(p, ['id','entry']); id(p.id); requireValue(safePath(p.entry), 'Unsafe page entry'); }
  unique(array(manifest.actions).map(a => a.id), 'action');
  for (const a of manifest.actions) { object(a, ['id','label','pageId']); id(a.id); text(a.label); requireValue(manifest.pages.some(p => p.id === a.pageId), 'Unknown action page'); }
  if (manifest.shell !== undefined) {
    const s = manifest.shell;
    object(s, ['title','brandAsset','sections','choices','colorScheme'], ['title','brandAsset','sections']); text(s.title);
    requireValue(Buffer.byteLength(s.title) < 80 && safePath(s.brandAsset), 'Invalid shell title/brand asset');
    requireValue(s.colorScheme === undefined || ['default','neutral'].includes(s.colorScheme), 'Invalid shell color scheme');
    requireValue(array(s.sections).length > 0 && s.sections.length <= 5, 'Shell requires 1–5 sections'); unique(s.sections.map(e => e.id), 'section');
    for (const section of s.sections) {
      object(section, ['id','label','sourceId','pageId','icon'], ['id','label','sourceId']); id(section.id); text(section.label);
      requireValue(manifest.sources.some(src => src.id === section.sourceId) && (section.pageId == null || manifest.pages.some(p => p.id === section.pageId)), 'Unknown shell destination');
      requireValue(section.icon === undefined || ['home','search','post','bookmark','person','notifications'].includes(section.icon), 'Unsupported section icon');
    }
    s.choices ??= [];
    for (const choice of array(s.choices)) {
      object(choice, ['label','url','sourceId'], ['label','url']); text(choice.label);
      choice.sourceId ??= s.sections[0].sourceId;
      const source = manifest.sources.find(src => src.id === choice.sourceId), url = httpsUrl(choice.url);
      requireValue(source && source.origins.includes(url.origin) && customizedRoute(source, url.pathname), 'Choice outside declared source customization');
    }
  }
  return manifest;
}
export async function readApplet(directory, { serviceFile } = {}) {
  const base = await realpath(directory);
  const manifest = validateManifest(JSON.parse(await readFile(path.join(base, 'applet.json'), 'utf8')));
  for (const entry of [...manifest.sources, ...manifest.pages]) await containedFile(base, entry.entry);
  if (manifest.shell) await containedFile(base, manifest.shell.brandAsset);
  let service;
  try { service = JSON.parse(await readFile(await containedFile(base, serviceFile ?? 'backend/service.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT' || serviceFile) throw error; }
  if (service) {
    object(service, ['serviceId','entry','healthPath','port','environment']);
    requireValue(manifest.services.includes(service.serviceId), 'Undeclared backend service');
    await containedFile(base, service.entry);
    requireValue(Number.isInteger(service.port) && service.port >= 1024 && service.port <= 65535 && /^\/[a-z0-9/-]+$/.test(service.healthPath), 'Invalid service port/health');
    object(service.environment, ['token','database','port','certificate','key']);
    for (const value of Object.values(service.environment)) requireValue(typeof value === 'string' && /^[A-Z][A-Z0-9_]+$/.test(value), 'Invalid environment name');
  }
  return { base, manifest, service };
}
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function bundleRevision(bundle) {
  return sha256(canonicalJson({ formatVersion: bundle.formatVersion, runtimeApiVersion: bundle.runtimeApiVersion, sdkVersion: bundle.sdkVersion, manifest: bundle.package.manifest, assets: bundle.package.assets }));
}
export function validateBundle(bundle) {
  object(bundle, ['formatVersion','runtimeApiVersion','sdkVersion','package']);
  requireValue(bundle.formatVersion === FORMAT_VERSION && [1, 2, RUNTIME_API_VERSION].includes(bundle.runtimeApiVersion), 'Unsupported bundle/runtime API version');
  requireValue(typeof bundle.sdkVersion === 'string' && /^\d+\.\d+\.\d+$/.test(bundle.sdkVersion), 'Invalid SDK version');
  object(bundle.package, ['manifest','revision','assets']);
  validateManifest(bundle.package.manifest);
  requireValue((bundle.runtimeApiVersion === 3) === (bundle.package.manifest.schemaVersion === 2), "Schema 2 requires runtime API 3");
  requireValue(bundle.runtimeApiVersion >= 2 || !bundle.package.manifest.sources.some(s => s.customizedRoutes !== undefined || s.ordinaryRoutes !== undefined) && !bundle.package.manifest.shell?.colorScheme && !bundle.package.manifest.shell?.sections.some(s => s.icon === 'notifications'), 'These features require runtime API 2');
  const assets = array(bundle.package.assets);
  unique(assets.map(a => a.path), 'asset');
  for (const a of assets) { object(a, ['path','sha256']); requireValue(safePath(a.path) && /^[a-f0-9]{64}$/.test(a.sha256), 'Invalid asset/hash'); }
  requireValue(assets.every((a,i) => !i || assets[i-1].path < a.path), 'Assets must be sorted');
  const has = name => assets.some(a => a.path === name);
  const m = bundle.package.manifest;
  for (const s of m.sources) requireValue(has(s.entry), 'Missing source asset');
  for (const p of m.pages) requireValue(has(p.entry) && has(`pages/${p.id}/index.html`), 'Missing page asset');
  if (m.shell) requireValue(has(m.shell.brandAsset), 'Missing brand asset');
  requireValue(bundle.package.revision === bundleRevision(bundle), 'Package revision mismatch');
  return bundle;
}
