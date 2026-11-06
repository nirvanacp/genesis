import { spawnSync } from "node:child_process";
import { access, copyFile, mkdir, rm } from "node:fs/promises";
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
  if (!["--stage", "--variant", "--cargo", "--sdk"].includes(key) || process.argv[i + 1] === undefined) {
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

// Each selected applet becomes assets/bundles/applet-<id>.bundle.json, which the shell
// stages into its import directory on first launch.
async function assets() {
  // The applet tools import @genesis/core, which check() has just built.
  const { readPackages } = await import("./check-packages.mjs");
  const { buildApplet } = await import("../packages/applet-tools/src/build.mjs");
  const output = path.join(generated, "assets");
  await rm(output, { recursive: true, force: true });
  await mkdir(path.join(output, "bundles"), { recursive: true });
  for (const { base, manifest } of await readPackages()) {
    const built = await buildApplet(base, path.join(intermediates, "bundles", manifest.id));
    await copyFile(built.importFile, path.join(output, "bundles", path.basename(built.importFile)));
  }
  console.log(`Generated applet bundles: ${path.join(output, "bundles")}`);
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
