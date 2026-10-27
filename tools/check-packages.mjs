import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directories = ["applets/youtube.com", "applets/x.com"];
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
    requireValue(manifest.capabilities.every(c => ["dom", "navigation-policy", "storage"].includes(c)), `${directory}: unsupported capability`);
    const sourceIds = new Set();
    for (const source of manifest.sources) {
      requireValue(identifier.test(source.id) && !sourceIds.has(source.id), `${directory}: duplicate or invalid source ID`);
      sourceIds.add(source.id);
      requireValue(Array.isArray(source.origins) && source.origins.length > 0, `${directory}: origins required`);
      for (const origin of source.origins) {
        const url = new URL(origin);
        requireValue(url.protocol === "https:" && url.origin === origin, `${directory}: exact HTTPS origins required`);
      }
      const start = new URL(source.startUrl);
      requireValue(start.protocol === "https:" && source.origins.includes(start.origin), `${directory}: start URL outside origins`);
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
    packages.push({ base, manifest });
  }
  return packages;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const packages = await readPackages();
    console.log(`MVP-01 package checks passed: ${packages.map(p => p.manifest.id).join(", ")}. Runtime qualification remains pending.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
