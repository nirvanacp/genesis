import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Only the current prototype is bundled. Earlier applet workspaces remain preserved.
const directories = ["applets/news.ycombinator.com"];
const identifier = /^[a-z][a-z0-9-]{0,63}$/;

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

export async function readPackages() {
  const packages = [];
  const ids = new Set();
  for (const directory of directories) {
    const base = path.join(root, directory);
    const manifest = JSON.parse(await readFile(path.join(base, "applet.json"), "utf8"));
    requireValue(manifest.schemaVersion === 1 && manifest.dataSchemaVersion === 1, `${directory}: unsupported schema`);
    requireValue(identifier.test(manifest.id) && !ids.has(manifest.id), `${directory}: invalid or duplicate ID`);
    ids.add(manifest.id);
    requireValue(typeof manifest.name === "string" && manifest.name.trim().length > 0, `${directory}: missing name`);
    requireValue(Array.isArray(manifest.sources) && manifest.sources.length > 0, `${directory}: sources required`);
    for (const field of ["pages", "actions", "capabilities"]) {
      requireValue(Array.isArray(manifest[field]), `${directory}: ${field} must be an array`);
    }
    requireValue(manifest.capabilities.every(c => ["dom", "navigation-policy", "storage", "services"].includes(c)), `${directory}: unsupported capability`);
    requireValue(Array.isArray(manifest.services ?? []) && new Set(manifest.services ?? []).size === (manifest.services ?? []).length
      && (manifest.services ?? []).every(id => identifier.test(id))
      && (!(manifest.services ?? []).length || manifest.capabilities.includes("services")), `${directory}: invalid service declarations`);
    const sourceIds = new Set();
    for (const source of manifest.sources) {
      requireValue(identifier.test(source.id) && !sourceIds.has(source.id), `${directory}: duplicate or invalid source ID`);
      sourceIds.add(source.id);
      requireValue(Array.isArray(source.navigationRules ?? []), `${directory}: navigation rules must be an array`);
      requireValue(Array.isArray(source.homePaths ?? []) && (source.homePaths ?? []).every(p => typeof p === "string" && p.startsWith("/") && !p.includes("?")), `${directory}: invalid home paths`);
      requireValue(source.customizedPaths === undefined || Array.isArray(source.customizedPaths) && source.customizedPaths.every(p => /^\/[a-zA-Z0-9/.\-]*$/.test(p) && !p.includes("..")), `${directory}: invalid exact customized paths`);
      const ruleIds = new Set();
      for (const rule of source.navigationRules ?? []) {
        const fallback = new URL(rule.fallbackUrl);
        requireValue(identifier.test(rule.id) && !ruleIds.has(rule.id) && rule.action === "block"
          && typeof rule.pathPrefix === "string" && rule.pathPrefix.startsWith("/")
          && fallback.protocol === "https:" && !fallback.username && !fallback.password
          && source.origins.includes(fallback.origin)
          && !(source.navigationRules ?? []).some(r => fallback.pathname.startsWith(r.pathPrefix)), `${directory}: invalid navigation rule or fallback loop`);
        ruleIds.add(rule.id);
      }
      requireValue(Array.isArray(source.origins) && source.origins.length > 0, `${directory}: origins required`);
      for (const origin of source.origins) {
        const url = new URL(origin);
        requireValue(url.protocol === "https:" && url.origin === origin, `${directory}: exact HTTPS origins required`);
      }
      const start = new URL(source.startUrl);
      requireValue(start.protocol === "https:" && !start.username && !start.password && source.origins.includes(start.origin), `${directory}: start URL outside origins`);
    }
    const pageIds = new Set();
    for (const page of manifest.pages) {
      requireValue(identifier.test(page.id) && !pageIds.has(page.id), `${directory}: duplicate or invalid page ID`);
      pageIds.add(page.id);
    }
    for (const action of manifest.actions) {
      requireValue(identifier.test(action.id) && pageIds.has(action.pageId), `${directory}: invalid page action`);
    }
    for (const entry of [...manifest.sources, ...manifest.pages]) {
      requireValue(typeof entry.entry === "string" && !entry.entry.includes("\\") && !path.isAbsolute(entry.entry)
        && !entry.entry.split("/").includes(".."), `${directory}: unsafe entry path`);
      const resolved = await realpath(path.join(base, entry.entry));
      requireValue(resolved.startsWith(`${await realpath(base)}${path.sep}`) && (await stat(resolved)).isFile(), `${directory}: entry escapes package`);
    }
    if (manifest.shell) {
      const shell = manifest.shell;
      requireValue(typeof shell.title === "string" && shell.title.length > 0 && shell.title.length < 80, `${directory}: invalid shell title`);
      requireValue(Array.isArray(shell.sections) && shell.sections.length > 0 && shell.sections.length <= 5, `${directory}: invalid shell sections`);
      const sections = new Set();
      for (const section of shell.sections) {
        requireValue(identifier.test(section.id) && !sections.has(section.id) && typeof section.label === "string" && section.label.length > 0 && sourceIds.has(section.sourceId) && (!section.pageId || pageIds.has(section.pageId)), `${directory}: invalid shell destination`);
        sections.add(section.id);
      }
      requireValue(typeof shell.brandAsset === "string" && !path.isAbsolute(shell.brandAsset) && !shell.brandAsset.includes("\\") && !shell.brandAsset.split("/").some(p => p === ".." || p === "." || !p), `${directory}: unsafe brand asset`);
      requireValue((await realpath(path.join(base, shell.brandAsset))).startsWith(`${await realpath(base)}${path.sep}`), `${directory}: brand escapes package`);
      for (const choice of shell.choices ?? []) requireValue(typeof choice.label === "string" && manifest.sources.some(source => source.origins.includes(new URL(choice.url).origin) && source.customizedPaths?.includes(new URL(choice.url).pathname)), `${directory}: invalid shell choice`);
    }
    packages.push({ base, manifest });
  }
  return packages;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const packages = await readPackages();
    console.log(`Package checks passed: ${packages.map(p => p.manifest.id).join(", ")}. Device qualification is recorded separately.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
