# Genesis Android setup

Updated 29 October 2026. Current ownership is defined in [architecture](../../.architecture/README.md). HN persistence uses an independent server; configure it using the [operations guide](200113-genesis-hacker-news-mvp-guide.md). Existing device SQLite is preserved as legacy data and optional platform storage. Earlier emulator reports do not qualify this new network path.

## Project and preserved work

Open `android/` in Android Studio and select the `app` run configuration. Android application ID and namespace are `app.nirvana.genesis`, version `0.1.0`, version code `1`. The launcher is populated from compiled package metadata. Java renders native controls and operates one WebView; Rust owns selection, view generations, navigation commands and last committed URLs.

The existing Gradle wrapper scripts/JAR, settings/repositories, manifest structure, icons, XML theme, backup resources and test files were reused or retained. The starter Kotlin Activity and Compose theme remain untouched under `android/app/src/main/java/com/example/nirvanagenesis/`. The active Java source set is `src/main/java/app/nirvana/genesis`. Kotlin/Compose are disabled. Opening preserved Kotlin files in the IDE will show unresolved starter dependencies; they are not part of the application build. Existing Kotlin example tests are preserved, not executable coverage of the new Java/Rust host. No test files were added or modified.

The starter's AGP 9.4.1, Gradle 9.6.0, Java 25, minSdk 24, Compose entry point and application ID conflicted with the approved plan. The active project now uses the planned matrix below. The new ID installs alongside an old `com.example.nirvanagenesis` starter APK; data does not migrate between those IDs. Earlier plans are archived and are not current instructions.

## One-time tools

| Tool | Required version |
| --- | --- |
| Gradle / Android Gradle plugin | 9.3.1 / 9.1.1 |
| Gradle JDK and Java source/target | 17 |
| Android compile/target / minimum | 37 / 26 |
| Build Tools / NDK | 36.0.0 / 28.2.13676358 |
| AndroidX WebKit | 1.18.0 |
| Rust / edition | 1.94.0 / 2024 |
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
rustup target add --toolchain 1.94.0 aarch64-linux-android x86_64-linux-android
cargo +1.94.0 install cargo-ndk --version 4.1.2 --locked
npm ci
```

`npm ci` and Cargo use the root lockfiles. Builds never install packages, choose latest versions, or copy generated files into `src/main`.

Set machine-specific paths in ignored `android/local.properties`. Use absolute paths appropriate to the machine, without shell expansion. Example placeholders:

```properties
sdk.dir=/absolute/path/to/Android/sdk
genesis.node=/absolute/path/to/node
genesis.cargo=/absolute/path/to/cargo
```

Gradle uses these executable keys before PATH. SDK lookup uses `sdk.dir`, then `ANDROID_HOME`, then `ANDROID_SDK_ROOT`. cargo-ndk must be in Cargo's bin directory or PATH. Java must be a registered/discoverable JDK 17, selected in Studio, or supplied through `JAVA_HOME` for terminal builds. Missing dependencies and tools produce setup errors; the build does not generate placeholder binaries.

## Build and run

```sh
# Repository root
npm run typecheck
npm run check:packages
cargo fmt --all -- --check
cargo check -p genesis-contracts --locked
cargo clippy -p genesis-android --locked -- -D warnings

# android/
./gradlew :app:assembleDebug :app:lintDebug
```

Open `android/`, sync, select an arm64-v8a or x86_64 emulator or physical Android device with API 26 or newer, and press Run. The launcher offers the HN source and its packaged bookmark library. Library access does not first load HN. Customization requires the qualified provider APIs; unsupported providers offer ordinary browsing. Check Home, Back, Reload and normal browsing. Use install-as-update for later APKs; do not uninstall to deploy over user data.

The build task `genesisBuildDebug` or `genesisBuildRelease` runs type checking, package checks, esbuild TypeScript IIFE bundling, package hashing, and cargo-ndk builds for both ABIs at API 26. Debug uses debug native libraries; Release uses release native libraries. `genesisBuild` builds all variants. Individual script stages are `check`, `assets`, `native` and `all`, selected through `node tools/build.mjs --stage <stage> --variant debug|release`.

Generated assets and libraries live under `android/app/build/generated/genesis/<variant>/assets` and `jniLibs`. Intermediates live under `target/genesis/<variant>/`. AGP generated-source registration makes asset and JNI merges depend on the producer. Source and lockfile inputs invalidate the task. Sync only configures tasks; it does not execute the generator. Debug and Release have separate output and Cargo target directories.

The package checker verifies bundled schemas, identities, source origins, entry containment and action/page references. The runtime exposes managed DOM observation, modal lifecycle, bound source/page navigation optional generic storage and service requests. HN extraction, categories and library UI stay in the applet.
