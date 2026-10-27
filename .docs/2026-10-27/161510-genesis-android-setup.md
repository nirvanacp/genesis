# Genesis Android setup and MVP-01 handoff

Status: MVP-01 verified on the named emulator. MVP-02 is ready to start and has not been started.

Scope: the Genesis monorepo's MVP-01 build foundation and ordinary browser. Site customization, isolated-world injection, the creator SDK, storage, and the bookmark library are incomplete. Bundled compilation entries deliberately say so. No MVP-02 implementation is included.

## Project and preserved work

Open `android/` in Android Studio and select the `app` run configuration. Android application ID and namespace are `app.nirvana.genesis`, version `0.1.0`, version code `1`. The launcher is populated from compiled package metadata. Java renders native controls and operates one WebView; Rust owns selection, view generations, navigation commands and last committed URLs.

The existing Gradle wrapper scripts/JAR, settings/repositories, manifest structure, icons, XML theme, backup resources and test files were reused or retained. The starter Kotlin Activity and Compose theme remain untouched under `android/app/src/main/java/com/example/nirvanagenesis/`. The active Java source set is `src/main/java/app/nirvana/genesis`. Kotlin/Compose are disabled. Opening preserved Kotlin files in the IDE will show unresolved starter dependencies; they are not part of the application build. Existing Kotlin example tests are preserved, not executable coverage of the new Java/Rust host. No test files were added or modified.

The starter's AGP 9.4.1, Gradle 9.6.0, Java 25, minSdk 24, Compose entry point and application ID conflicted with the approved plan. The active project now uses the planned matrix below. The new ID installs alongside an old `com.example.nirvanagenesis` starter APK; data does not migrate between those IDs. The five pre-existing plan edits were left untouched.

## One-time tools

| Tool | Required version |
| --- | --- |
| Gradle / Android Gradle plugin | 9.3.1 / 9.1.1 |
| Gradle JDK and Java source/target | 17 |
| Android compile/target / minimum | 37 / 26 |
| Build Tools / NDK | 36.0.0 / 28.2.13676358 |
| AndroidX WebKit | 1.18.0 |
| Rust / edition | 1.94.0 / 2024 |
| wasm-bindgen crate and CLI | 0.2.129 |
| cargo-ndk | 4.1.2 |
| Node / npm | 24.15.0 / 11.14.1 |
| Native ABIs | arm64-v8a, x86_64 |

Install JDK 17 and select it for Gradle. The project commits Gradle JVM criteria for version 17. Newer Studio versions display this as **Gradle JVM criteria** instead of a single Gradle JDK path. The wrapper checksum is pinned to the official 9.3.1 distribution checksum. Compatibility reference: [AGP 9.1.1](https://developer.android.com/build/releases/agp-9-1-0-release-notes).

In Android Studio SDK Manager, install Android platform 37, Build Tools 36.0.0 and NDK 28.2.13676358. Install enough disk space for the complete SDK/NDK, dependency caches and build outputs. Keep normal SDK license acceptance in SDK Manager. No license bypass is part of this project.

From the repository root:

```sh
nvm install
nvm use
npm install --global npm@11.14.1
rustup toolchain install 1.94.0 --profile minimal --component rustfmt,clippy
rustup target add --toolchain 1.94.0 wasm32-unknown-unknown aarch64-linux-android x86_64-linux-android
cargo +1.94.0 install cargo-ndk --version 4.1.2 --locked
cargo +1.94.0 install wasm-bindgen-cli --version 0.2.129 --locked
npm ci
```

`npm ci` and Cargo use the root lockfiles. Builds never install packages, choose latest versions, or copy generated files into `src/main`.

Set machine-specific paths in ignored `android/local.properties`. Use absolute paths appropriate to the machine, without shell expansion. Example placeholders:

```properties
sdk.dir=/absolute/path/to/Android/sdk
genesis.node=/absolute/path/to/node
genesis.cargo=/absolute/path/to/cargo
genesis.wasmBindgen=/absolute/path/to/wasm-bindgen
```

Gradle uses these executable keys before PATH. SDK lookup uses `sdk.dir`, then `ANDROID_HOME`, then `ANDROID_SDK_ROOT`. cargo-ndk must be in Cargo's bin directory or PATH. Java must be a registered/discoverable JDK 17, selected in Studio, or supplied through `JAVA_HOME` for terminal builds. Missing dependencies and tools produce setup errors; the build does not generate placeholder binaries.

## Build and run

```sh
# Repository root
npm run typecheck
npm run check:packages
cargo fmt --all -- --check
cargo check -p genesis-contracts --locked
cargo check -p genesis-page-runtime --target wasm32-unknown-unknown --locked

# android/
./gradlew :app:assembleDebug :app:lintDebug
```

Open `android/`, sync, select an arm64-v8a or x86_64 emulator or physical Android device with API 26 or newer, and press Run. This stage opens the original websites. The launcher explicitly reports that customization is unavailable. Check Home, Back, Reload and normal browsing. Use install-as-update for later APKs; do not uninstall to deploy over user data.

The build task `genesisBuildDebug` or `genesisBuildRelease` runs type checking, package checks, a real release Wasm compilation, matching wasm-bindgen generation, esbuild IIFE bundling with embedded Wasm bytes, package hashing, and cargo-ndk builds for both ABIs at API 26. Debug uses debug native libraries; Release uses release native libraries. `genesisBuild` builds all variants. Individual script stages are `check`, `assets`, `native` and `all`, selected through `node tools/build.mjs --stage <stage> --variant debug|release`.

Generated assets and libraries live under `android/app/build/generated/genesis/<variant>/assets` and `jniLibs`. Intermediates live under `target/genesis/<variant>/`. AGP generated-source registration makes asset and JNI merges depend on the producer. Source and lockfile inputs invalidate the task. Sync only configures tasks; it does not execute the generator. Debug and Release have separate output and Cargo target directories.

The package checker currently verifies the MVP-01 bundled schemas, identities, source origins, entry containment and action/page references. Full navigation-policy/runtime validation belongs to subsequent stages. Packaged local-page HTML is a build artifact only; the host does not expose local-page navigation yet.

## Workstation qualification

Actual paths used on this workstation, with the home directory expressed portably:

| Tool | Selected path |
| --- | --- |
| Node 24.15.0 / npm 11.14.1 | `$HOME/.nvm/versions/node/v24.15.0/bin/` |
| Cargo / Rust | `$HOME/.cargo/bin/cargo`, toolchain `1.94.0-aarch64-apple-darwin` |
| wasm-bindgen / cargo-ndk | `$HOME/.cargo/bin/wasm-bindgen`, `$HOME/.cargo/bin/cargo-ndk` |
| JDK | Temurin 17.0.21+9 at `$HOME/Library/Java/JavaVirtualMachines/genesis-temurin-17.jdk/Contents/Home` |
| Gradle invocation JDK | `/tmp/genesis-jdk17/Contents/Home`, a symlink to that registered JDK |
| SDK / platform | `$HOME/Library/Android/sdk`, `platforms/android-37.0` |
| NDK | `$HOME/Library/Android/sdk/ndk/28.2.13676358` |

Full NDK extraction failed with `No space left on device`. Its 952495160-byte official archive passed SHA-1 `fc20a6bf15a30fb3428c9b60a7308793a362dc6d`. To finish the supported checks without deleting unrelated files, only the genuine r28c compiler/linker, headers, builtins, unwind libraries and API 26 libraries needed for these two ABIs were extracted. This is a reduced local tool installation, not the full SDK Manager installation. Normal setup should install the complete pinned NDK after freeing space. The temporary archives were removed. Native outputs were compiled from Rust, never fabricated or checked in. This local reduction does not change the tracked build design or NDK version.

The emulator was `emulator-5554`, Medium Phone API 37.0, Android 17, arm64-v8a. Its provider was `com.google.android.webview` 145.0.7632.218. No physical-device compatibility or authentication qualification is claimed by MVP-01.

## Verification evidence

- `npm ci` resolved the exact npm graph. `npm run typecheck` and `npm run check:packages` passed.
- `cargo check -p genesis-contracts --locked`, the Wasm target check, and `cargo fmt --all -- --check` passed.
- Clippy with `-D warnings` passed for contracts/native on the host, the page runtime on wasm32, and native on both Android targets.
- The selected `cargo ndk -t arm64-v8a -t x86_64 --platform 26 ... build --locked -p genesis-android` produced both libraries through Gradle.
- `./gradlew :app:assembleDebug :app:lintDebug` passed. Final lint has no errors. Remaining warnings concern preserved starter resources and version-update suggestions. The pinned AGP also warns that its built-in Kotlin opt-out is deprecated; it remains necessary to preserve the inactive starter sources with a Java-only application. A narrow Back lint suppression documents the actual API 33+ callback registration.
- APK ZIP inspection verified every declared asset SHA-256 and real Wasm magic. ELF machine IDs are AArch64 183 and x86-64 62; both APK libraries export `Java_app_nirvana_genesis_NativeBridge_dispatch`.
- Both source bundles executed in Node and initialized their embedded Wasm export. This checks compilation/loading of bytes only, not the isolated WebView realm or CSP.
- An unchanged second build completed with 45 tasks up to date and `genesisBuildDebug UP-TO-DATE`.
- A temporary YouTube entry edit reran the generator and changed its package revision. Restoring the exact entry restored revision `48a89e74b22a0ca2c8a381879ff9da05f184996a79229fd6cd4ff6171ad3a8c9`. The probe was removed.
- Android Studio sync completed and Run installed the app successfully. The emulator displayed the Rust-supplied launcher and ordinary YouTube home and X sign-in pages. X sign-in was not attempted.

An isolated Android Studio sync left generated index and both JNI library modification timestamps unchanged. Native Reload completed ordinary X browsing, native Back returned to the Rust launcher, and native Home returned from YouTube to the launcher. All required MVP-01 acceptance checks passed on this emulator; no required MVP-01 device check remains unverified. MVP-02 must remain unstarted until all MVP-01 acceptance checks are satisfied. Website injection, provider feature qualification, authentication, media playback and physical-device checks belong to MVP-02 or later.
