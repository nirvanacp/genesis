import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Subprocesses use argument arrays; a build never installs dependencies.
function run(executable, args, env = {}, capture = false) {
  const result = spawnSync(executable, args, {
    cwd: root, env: { ...process.env, ...env }, shell: false,
    stdio: capture ? "pipe" : "inherit", encoding: "utf8",
  });
  if (result.error) throw new Error(`Cannot run ${executable}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${executable} ${args.join(" ")} failed (${result.status}). ${capture ? result.stderr : ""}`);
  return capture ? result.stdout.trim() : "";
}

const options = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (!["--stage", "--variant", "--cargo", "--sdk", "--manifest"].includes(key) || process.argv[i + 1] === undefined) {
    throw new Error(`Unknown or incomplete build option: ${key}`);
  }
  options.set(key, process.argv[i + 1]);
}
const stage = options.get("--stage") ?? "all";
const variant = options.get("--variant") ?? "debug";
if (!["check", "assets", "native", "all"].includes(stage) || !["debug", "release", "developer"].includes(variant)) {
  throw new Error("Use --stage check|assets|native|all and --variant debug|release|developer");
}
// The developer variant is the release build that Android marks debuggable for applet builders:
// it bundles the same published releases and the same optimized native library as release.
const published = variant !== "debug";
const cargo = options.get("--cargo") || "cargo";
const sdk = options.get("--sdk") || process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
const generated = path.join(root, "android/app/build/generated/genesis", variant);
const intermediates = path.join(root, "target/genesis", variant);
// The manifest overlay with the drawer aliases; Gradle passes the location AGP chose.
const manifestOverlay = path.resolve(options.get("--manifest") ?? path.join(generated, "manifest", "AndroidManifest.xml"));
// Release and developer builds share one optimized Cargo build.
const env = { CARGO_TARGET_DIR: path.join(root, "target/genesis", published ? "release" : "debug", "cargo") };

async function requireFile(filename, message) {
  try { await access(filename); } catch { throw new Error(message); }
}

// Builds the platform packages in dependency order: core, then the SDK that applets bundle.
async function check() {
  if (process.versions.node !== "24.15.0") throw new Error("Use Node 24.15.0: nvm install && nvm use, or set genesis.node in android/local.properties");
  await requireFile(path.join(root, "node_modules/typescript/lib/tsc.js"), "Missing npm dependencies. Run npm ci from the repository root.");
  run(process.execPath, ["node_modules/typescript/lib/tsc.js", "-p", "let/packages/core/tsconfig.json"]);
  run(process.execPath, ["let/packages/sdk/build.mjs"]);
  run(process.execPath, ["node_modules/typescript/lib/tsc.js", "-p", "let/packages/sdk/tsconfig.json"]);
}

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

// A published release asset on GitHub. Each segment of the tag is encoded, so `id/vX.Y.Z` keeps its slash.
function releaseUrl({ repository, tag }, asset) {
  return `https://github.com/${repository}/releases/download/${tag.split("/").map(encodeURIComponent).join("/")}/${asset}`;
}

async function download(url) {
  let response;
  try { response = await fetch(url); }
  catch (error) { throw new Error(`Cannot download ${url}: ${error.cause?.message ?? error.message}`); }
  if (!response.ok) throw new Error(`Cannot download ${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

// The bundle and release record of an applet's published release. A cached bundle whose SHA-256
// equals the pinned one is reused, so a rebuild works offline. Both files are checked before
// they are cached: the bundle's SHA-256 equals the pinned one and the record's, the record is
// valid and names this applet, and so does the bundle's manifest.
async function downloadRelease({ id, release }) {
  const { validateReleaseRecord } = await import("@nirvanacp/core");
  const directory = path.join(root, "target/genesis/releases", id, release.tag.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\./, "_"));
  const bundleFile = path.join(directory, `applet-${id}.bundle.json`);
  const recordFile = path.join(directory, `applet-${id}.release.json`);
  const cached = await Promise.all([readFile(bundleFile), readFile(recordFile)]).catch(() => null);
  const fresh = !(cached && sha256(cached[0]) === release.sha256);
  const [bundleBytes, recordBytes] = fresh
    ? [await download(releaseUrl(release, path.basename(bundleFile))), await download(releaseUrl(release, path.basename(recordFile)))]
    : cached;
  const failure = `${id} release ${release.tag} from ${release.repository}`;
  const actual = sha256(bundleBytes);
  if (actual !== release.sha256) throw new Error(`${failure}: the bundle's SHA-256 is ${actual}, but genesis.packages.json pins ${release.sha256}`);
  let record, bundle;
  try { record = validateReleaseRecord(JSON.parse(recordBytes.toString("utf8"))); }
  catch (error) { throw new Error(`${failure}: invalid release record: ${error.message}`); }
  if (record.appletId !== id) throw new Error(`${failure}: the release record is for ${record.appletId}`);
  if (record.bundle.sha256 !== actual) throw new Error(`${failure}: the release record's bundle SHA-256 is ${record.bundle.sha256}, not ${actual}`);
  try { bundle = JSON.parse(bundleBytes.toString("utf8")); }
  catch (error) { throw new Error(`${failure}: the bundle is not JSON: ${error.message}`); }
  if (bundle?.bundle?.manifest?.id !== id || !Array.isArray(bundle.entries)) throw new Error(`${failure}: the bundle is not an import file for ${id}`);
  if (fresh) {
    await mkdir(directory, { recursive: true });
    await writeFile(bundleFile, bundleBytes);
    await writeFile(recordFile, recordBytes);
  }
  return { bundleFile, recordFile, bundle, version: record.version, cached: !fresh };
}

// The icon file of a bundle: the entry at `shell.icon`, or null when there is none.
function bundleIcon({ bundle: { manifest }, entries }) {
  const entry = manifest.shell?.icon && entries.find(e => e.path === manifest.shell.icon);
  return entry ? Buffer.from(entry.content, entry.encoding === "base64" ? "base64" : "utf8") : null;
}

// Where an applet's bundle comes from. A release or developer build always uses the published release; a debug
// build uses the source directory when there is one, and the published release otherwise.
// assets() has already refused an applet the variant cannot bundle.
async function resolveApplet({ id, drawer, release, base, manifest }) {
  if (published || !base) {
    const downloaded = await downloadRelease({ id, release });
    console.log(`${id}: published release ${downloaded.version} (${release.tag}${downloaded.cached ? ", cached" : ", downloaded"})`);
    return { manifest: downloaded.bundle.bundle.manifest, drawer, bundleFile: downloaded.bundleFile, recordFile: downloaded.recordFile, icon: bundleIcon(downloaded.bundle) };
  }
  // The applets directory is its own npm workspace: its node_modules holds the SDK and React.
  const { appletsDirectory } = (await import("./workspace.mjs")).readWorkspace();
  await requireFile(path.join(appletsDirectory, "node_modules"), `Missing the applets' npm dependencies. Run npm ci in ${appletsDirectory}.`);
  const { buildApplet } = await import("../let/packages/applet-tools/src/build.mjs");
  const { containedFile } = await import("../let/packages/applet-tools/src/manifest.mjs");
  const built = await buildApplet(base, path.join(intermediates, "bundles", manifest.id), { debug: variant === "debug" });
  console.log(`${manifest.id}: built from source`);
  const icon = manifest.shell?.icon ? await readFile(await containedFile(base, manifest.shell.icon)) : null;
  return { manifest, drawer, bundleFile: built.importFile, recordFile: null, icon };
}

// Each selected applet becomes assets/bundles/applet-<id>.bundle.json, which the shell stages on
// the first launch after an install or update. A published release also brings its record.
async function assets() {
  // The applet tools import @nirvanacp/core, which check() has just built.
  const { readPackages, requireSource } = await import("./check-packages.mjs");
  const output = path.join(generated, "assets");
  await rm(output, { recursive: true, force: true });
  await mkdir(path.join(output, "bundles"), { recursive: true });
  const applets = [];
  for (const entry of await readPackages()) {
    if (published && !entry.release) throw new Error(`A ${variant} build needs a published release for ${entry.id}: add release to its genesis.packages.json entry`);
    requireSource(entry);
    const applet = await resolveApplet(entry);
    for (const file of [applet.bundleFile, applet.recordFile].filter(Boolean)) {
      await copyFile(file, path.join(output, "bundles", path.basename(file)));
    }
    applets.push(applet);
  }
  await drawerEntries(applets);
  console.log(`Generated applet bundles: ${path.join(output, "bundles")}`);
}

const escapeXml = text => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Android string resources also treat quotes, backslashes and a leading @ or ? specially.
const androidString = text => escapeXml(text.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"')).replace(/^([@?])/, "\\$1");

// Each selected applet with `drawer: true` gets an app drawer entry: an `activity-alias` of
// AppletEntryActivity whose meta-data names the applet, with the applet's name and an adaptive
// icon made from `shell.icon` (the `icon` bytes resolveApplet read) over its accent color. The shell enables each alias only while its
// applet is installed and can run. Gradle adds `res/` and the manifest overlay to the variant.
async function drawerEntries(applets) {
  const res = path.join(generated, "res");
  const overlay = manifestOverlay;
  await rm(res, { recursive: true, force: true });
  for (const folder of ["values", "drawable", "drawable-nodpi", "mipmap-anydpi-v26"]) await mkdir(path.join(res, folder), { recursive: true });
  await mkdir(path.dirname(overlay), { recursive: true });
  const values = [], aliases = [];
  for (const { manifest, icon } of applets.filter(a => a.drawer)) {
    if (!icon) {
      console.warn(`Warning: ${manifest.id}: no shell.icon, so no app drawer entry; a drawer entry needs the applet's own artwork.`);
      continue;
    }
    const name = `applet_${manifest.id.replace(/-/g, "_")}`;
    await writeFile(path.join(res, "drawable-nodpi", `${name}_fg.png`), icon);
    // The inset keeps the whole icon inside the adaptive icon's safe zone.
    await writeFile(path.join(res, "drawable", `${name}_inset.xml`),
      `<inset xmlns:android="http://schemas.android.com/apk/res/android" android:drawable="@drawable/${name}_fg" android:inset="21%" />\n`);
    await writeFile(path.join(res, "mipmap-anydpi-v26", `${name}.xml`), [
      `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">`,
      `    <background android:drawable="@color/${name}_bg" />`,
      `    <foreground android:drawable="@drawable/${name}_inset" />`,
      `</adaptive-icon>`, ""].join("\n"));
    values.push(`    <string name="${name}_label">${androidString(manifest.name)}</string>`,
      `    <color name="${name}_bg">${manifest.shell.accent ?? "#5F6368"}</color>`);
    aliases.push([
      `        <activity-alias`,
      `            android:name="app.nirvana.genesis.alias.${name}"`,
      `            android:enabled="true"`,
      `            android:exported="true"`,
      `            android:icon="@mipmap/${name}"`,
      `            android:label="@string/${name}_label"`,
      `            android:targetActivity="app.nirvana.genesis.AppletEntryActivity">`,
      `            <intent-filter>`,
      `                <action android:name="android.intent.action.MAIN" />`,
      `                <category android:name="android.intent.category.LAUNCHER" />`,
      `            </intent-filter>`,
      `            <meta-data android:name="app.nirvana.genesis.APPLET_ID" android:value="${escapeXml(manifest.id)}" />`,
      `        </activity-alias>`].join("\n"));
    console.log(`${manifest.id}: app drawer entry`);
  }
  await writeFile(path.join(res, "values", "applet_aliases.xml"), ["<resources>", ...values, "</resources>", ""].join("\n"));
  await writeFile(overlay, [
    `<manifest xmlns:android="http://schemas.android.com/apk/res/android">`,
    `    <application>`, ...aliases, `    </application>`,
    `</manifest>`, ""].join("\n"));
}

async function native() {
  await requireFile(path.join(root, "Cargo.lock"), "Missing Cargo.lock");
  const version = run(cargo, ["--version"], {}, true);
  if (!version.startsWith("cargo 1.94.0 ")) throw new Error(`Expected Cargo 1.94.0, got ${version}`);
  if (!sdk) throw new Error("Set sdk.dir in android/local.properties or ANDROID_HOME to the Android SDK directory.");
  const ndk = path.join(sdk, "ndk/28.2.13676358");
  await requireFile(path.join(ndk, "source.properties"), `Install NDK 28.2.13676358 with SDK Manager at ${ndk}`);
  let ndkVersion;
  try { ndkVersion = run(cargo, ["ndk", "--version"], {}, true); }
  catch (error) { throw new Error(`${error.message}\nRun cargo install cargo-ndk --version 4.1.2 --locked and ensure Cargo's bin directory is available.`); }
  if (ndkVersion !== "cargo-ndk 4.1.2") throw new Error(`Expected cargo-ndk 4.1.2, got ${ndkVersion}. Run cargo install cargo-ndk --version 4.1.2 --locked.`);
  const output = path.join(generated, "jniLibs");
  // Start empty so libraries from earlier builds never reach the APK.
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  run(cargo, ["ndk", "-t", "arm64-v8a", "-t", "x86_64", "--platform", "26", "-o", output,
    "build", "--locked", "-p", "genesis-host", ...(published ? ["--release"] : [])],
  { ...env, ANDROID_NDK_HOME: ndk, ANDROID_HOME: sdk });
  for (const abi of ["arm64-v8a", "x86_64"]) {
    await requireFile(path.join(output, abi, "libgenesis_host.so"), `Native build did not produce ${abi}/libgenesis_host.so`);
  }
}

try {
  await check();
  if (stage === "assets" || stage === "all") await assets();
  if (stage === "native" || stage === "all") await native();
  console.log(`Genesis ${variant} ${stage} build passed. Build output is ready for device qualification.`);
} catch (error) {
  console.error(`Genesis build failed: ${error.message}`);
  process.exitCode = 1;
}
