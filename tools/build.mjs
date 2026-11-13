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
if (!["check", "assets", "native", "all"].includes(stage) || !["debug", "release"].includes(variant)) {
  throw new Error("Use --stage check|assets|native|all and --variant debug|release");
}
const cargo = options.get("--cargo") || "cargo";
const sdk = options.get("--sdk") || process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
const generated = path.join(root, "android/app/build/generated/genesis", variant);
const intermediates = path.join(root, "target/genesis", variant);
// The manifest overlay with the drawer aliases; Gradle passes the location AGP chose.
const manifestOverlay = path.resolve(options.get("--manifest") ?? path.join(generated, "manifest", "AndroidManifest.xml"));
const env = { CARGO_TARGET_DIR: path.join(intermediates, "cargo") };

async function requireFile(filename, message) {
  try { await access(filename); } catch { throw new Error(message); }
}

// Builds the platform packages in dependency order: core, then the SDK that applets bundle.
async function check() {
  if (process.versions.node !== "24.15.0") throw new Error("Use Node 24.15.0: nvm install && nvm use, or set genesis.node in android/local.properties");
  await requireFile(path.join(root, "node_modules/typescript/lib/tsc.js"), "Missing npm dependencies. Run npm ci from the repository root.");
  run(process.execPath, ["node_modules/typescript/lib/tsc.js", "-p", "packages/core/tsconfig.json"]);
  run(process.execPath, ["packages/sdk/build.mjs"]);
  run(process.execPath, ["node_modules/typescript/lib/tsc.js", "-p", "packages/sdk/tsconfig.json"]);
}

// The committed release of an applet, when it is current: `published/` holds the bundle and its
// release record, the record names this applet and its package.json version, and the bundle
// matches the record's hash. Rebuilding would change `builtAt` and break the match with GitHub.
async function publishedRelease(base, id) {
  const record = path.join(base, "published", `applet-${id}.release.json`);
  const bundle = path.join(base, "published", `applet-${id}.bundle.json`);
  let release, bytes;
  try {
    release = JSON.parse(await readFile(record, "utf8"));
    bytes = await readFile(bundle);
  } catch {
    return { reason: "no published release" };
  }
  const { version } = JSON.parse(await readFile(path.join(base, "package.json"), "utf8"));
  if (release.appletId !== id || release.version !== version) {
    return { reason: `published release ${release.version} is not package.json version ${version}` };
  }
  if (createHash("sha256").update(bytes).digest("hex") !== release.bundle?.sha256) {
    return { reason: "published bundle does not match its release record" };
  }
  return { record, bundle, version };
}

// Each selected applet becomes assets/bundles/applet-<id>.bundle.json, which the shell stages on
// the first launch after an install or update. The release variant ships the committed release
// with its record; the debug variant, and an applet without a current release, is built here.
async function assets() {
  // The applet tools import @genesis/core, which check() has just built.
  const { readPackages } = await import("./check-packages.mjs");
  const { buildApplet } = await import("../packages/applet-tools/src/build.mjs");
  const output = path.join(generated, "assets");
  await rm(output, { recursive: true, force: true });
  await mkdir(path.join(output, "bundles"), { recursive: true });
  const packages = await readPackages();
  await drawerEntries(packages);
  for (const { base, manifest } of packages) {
    if (variant === "release") {
      const published = await publishedRelease(base, manifest.id);
      if (published.record) {
        await copyFile(published.bundle, path.join(output, "bundles", path.basename(published.bundle)));
        await copyFile(published.record, path.join(output, "bundles", path.basename(published.record)));
        console.log(`${manifest.id}: published release ${published.version}`);
        continue;
      }
      console.warn(`Warning: ${manifest.id}: ${published.reason}; bundling a fresh build without a release record.`);
    }
    const built = await buildApplet(base, path.join(intermediates, "bundles", manifest.id), { debug: variant === "debug" });
    await copyFile(built.importFile, path.join(output, "bundles", path.basename(built.importFile)));
    console.log(`${manifest.id}: built from source`);
  }
  console.log(`Generated applet bundles: ${path.join(output, "bundles")}`);
}

const escapeXml = text => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Android string resources also treat quotes, backslashes and a leading @ or ? specially.
const androidString = text => escapeXml(text.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"')).replace(/^([@?])/, "\\$1");

// Each selected applet with `drawer: true` gets an app drawer entry: an `activity-alias` of
// AppletEntryActivity whose meta-data names the applet, with the applet's name and an adaptive
// icon made from `shell.icon` over its accent color. The shell enables each alias only while its
// applet is installed and can run. Gradle adds `res/` and the manifest overlay to the variant.
async function drawerEntries(packages) {
  const res = path.join(generated, "res");
  const overlay = manifestOverlay;
  await rm(res, { recursive: true, force: true });
  for (const folder of ["values", "drawable", "drawable-nodpi", "mipmap-anydpi-v26"]) await mkdir(path.join(res, folder), { recursive: true });
  await mkdir(path.dirname(overlay), { recursive: true });
  const { containedFile } = await import("../packages/applet-tools/src/manifest.mjs");
  const values = [], aliases = [];
  for (const { base, manifest } of packages.filter(p => p.drawer)) {
    if (!manifest.shell?.icon) {
      console.warn(`Warning: ${manifest.id}: no shell.icon, so no app drawer entry; a drawer entry needs the applet's own artwork.`);
      continue;
    }
    const name = `applet_${manifest.id.replace(/-/g, "_")}`;
    await copyFile(await containedFile(base, manifest.shell.icon), path.join(res, "drawable-nodpi", `${name}_fg.png`));
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
    "build", "--locked", "-p", "genesis-host", ...(variant === "release" ? ["--release"] : [])],
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
