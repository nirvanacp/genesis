# Genesis Android and build plan

Architecture revision approved 28 October: all browser customization and the managed DOM runtime use TypeScript/JavaScript under `packages/sdk/` and `applets/`, with React for custom dialogs and local pages. Native Rust retains the controller, contracts and SQLite services. HN refuses Wasm compilation in its source realm, as recorded in the [historical qualification report](../../../.reports/phase-2/2026-10-28/162112-genesis-hn-wasm-qualification-report.md). The TS runtime passed [MVP-02 emulator qualification](../../../.reports/phase-2/2026-10-28/174427-genesis-hn-typescript-qualification-report.md); MVP-03 passed emulator verification. MVP-04 storage passed [Android emulator verification](../../../.reports/phase-2/2026-10-28/183914-genesis-mvp04-android-storage-verification-report.md); MVP-05 passed [Android Save verification](../../../.reports/phase-2/2026-10-29/095635-genesis-mvp05-android-save-verification-report.md); MVP-06 passed [category/library emulator verification](../../../.reports/phase-2/2026-10-29/110545-genesis-mvp06-library-verification-report.md). The working emulator prototype is the current delivery target. Physical-device qualification and device-specific performance gates are deferred to pre-release under the user's 29 October instruction; they do not block the emulator handoff. MVP-07 functional integration and the emulator handoff are verified in the [final report](../../../.reports/phase-2/2026-10-29/112349-genesis-mvp07-emulator-handoff-report.md).

Created 27 October 2026, Asia/Kolkata. Scope: `android/`, shared build tooling and dependency manifests. Read the [MVP plan](150238-genesis-mvp-implementation-plan.md) first. The MVP-01 build is verified on the emulator. MVP-02 browser plumbing is implemented and the updated provider supports all required APIs; TS runtime qualification passed on the emulator. The HN package replaces the earlier bundled product targets. The MVP-04 database worker is implemented; its Android end-to-end gates passed on the emulator. See the [setup evidence](../../../.docs/phase-2/2026-10-27/161510-genesis-android-setup.md) and [MVP-02 report](../../../.reports/phase-2/2026-10-27/182114-genesis-mvp02-qualification-report.md).

## 1. Android Studio project

Use `android/` as the Gradle root, with one Android application module named `app`. Use Kotlin DSL build files and Java source for the small platform adapter. Do not add Compose, Flutter, React Native, Tauri or a Kotlin business-logic layer.

Set the application ID and namespace to `app.nirvana.genesis`, application name to `Genesis`, initial versionCode to `1`, and versionName to `0.1.0`. Keep the ID stable so installing a new APK retains bookmark data. Use ordinary debug signing for development.

| Setting | Initial pin |
| --- | --- |
| AGP | 9.1.1 |
| Gradle wrapper | 9.3.1 |
| Gradle JDK | 17 |
| Java source/target compatibility | 17 |
| compileSdk / targetSdk | 37 / 37 |
| minSdk | 26 |
| SDK Build Tools | 36.0.0 |
| NDK | 28.2.13676358 |
| AndroidX WebKit | 1.18.0 |
| Rust | 1.94.0, edition 2024 |
| Node / npm | 24.15.0 / 11.14.1 |
| Native ABIs | arm64-v8a and x86_64 |

The [AGP compatibility table](https://developer.android.com/build/releases/agp-9-1-0-release-notes) supports the selected Gradle/JDK/SDK combination. The [Android Studio API-level table](https://developer.android.com/build/releases/about-agp) identifies Studio support for API 37. The [WebKit release page](https://developer.android.com/jetpack/androidx/releases/webkit) lists 1.18.0. These are upstream facts, not a successful Genesis build. Provider feature support remains a separate runtime check.

Use the installed Studio if it supports this matrix. Disable minification in both debug and the initial release build. If minification is introduced later, add and verify JNI keep rules first.

## 2. Toolchain setup

MVP-01 installed/selected the required JDK, Rust targets and build tools and built both Android ABIs. The workstation uses a reduced NDK extraction because of disk limits; the setup guide records that limitation. For another workstation, use a complete pinned NDK installation.

One-time setup:

1. Install/select JDK 17 for Gradle through Android Studio's Gradle JDK settings. Do not rely on the shell's `java` command.
2. Install SDK platform 37, Build Tools 36.0.0 and the pinned NDK through SDK Manager as needed.
3. Add Rust targets `aarch64-linux-android` and `x86_64-linux-android`. The preserved Wasm crate is outside the active Android build.
4. Install `cargo-ndk` 4.1.2. The active Android build does not require wasm-bindgen-cli.
5. Resolve dependencies once, inspect failures, and commit Cargo.lock and package-lock.json with the implementation. Subsequent builds use the locks.

Do not hardcode `/Users/rit` in tracked files. Support ignored `android/local.properties` keys `genesis.node` and `genesis.cargo`. Resolve executables from those keys first, then PATH. Derive the SDK path from `sdk.dir` or the standard SDK environment setting. Derive NDK location from that SDK plus the pinned version. A missing tool must produce a message naming the exact setting or setup command needed.

## 3. Dependencies and lock rules

The implemented dependencies are resolved in Cargo.lock and package-lock.json. `rusqlite` now supplies the implemented native document store. If compilation demonstrates incompatibility, change the smallest necessary pin, record the error and update this implementation's setup notes. Do not use `latest` in manifests or install scripts.

| Rust dependency | Pin | Used by |
| --- | --- | --- |
| serde | 1.0.229, derive feature | Contracts and native host |
| serde_json | 1.0.154 | Wire messages and stored JSON |
| thiserror | 2.0.21 | Explicit runtime errors |
| url | 2.5.8 | Native URL policy evaluation |
| jni | 0.22.4 | Android boundary only |
| rusqlite | 0.41.0, bundled feature | Native host only |
| wasm-bindgen | 0.2.129 | Preserved inactive Wasm crate only |
| web-sys / js-sys | 0.3.106 | Preserved inactive Wasm crate only |

Do not add dependencies to the inactive Wasm crate. Keep browser DOM bindings out of the native controller. No Tokio or HTTP client is required by the HN applet.

| npm dependency | Pin | Used by |
| --- | --- | --- |
| typescript | 7.0.2 | Type checking |
| esbuild | 0.28.2 | Creator bundles |
| react / react-dom | 19.3.1 | HN dialog/library only |
| @types/react / @types/react-dom | 19.3.0 | HN compile-time types |

Use private workspace packages `@genesis/sdk` and `@genesis/applet-hacker-news`. Preserve earlier applet workspaces for source retention/type checking; select only `applets/news.ycombinator.com` in the bundled package list in `tools/check-packages.mjs`. Link the SDK through npm workspaces with a matching local version; do not require a published registry package. Use strict TypeScript, `noEmit`, `jsx: react-jsx`, ES2022 target, ESNext modules, Bundler module resolution and DOM libraries. esbuild performs transpilation, not type checking. Import CSS as text with esbuild's `.css: text` loader and a shared TypeScript module declaration; do not depend on Vite's `?inline` syntax.

Registry references: [npm React](https://registry.npmjs.org/react/latest), [React DOM](https://registry.npmjs.org/react-dom/latest), [TypeScript](https://registry.npmjs.org/typescript/latest), [esbuild](https://registry.npmjs.org/esbuild/latest), [crates.io](https://crates.io/). Implementation must retain the exact resolved locks instead of rereading moving latest tags on each build.

## 4. Build pipeline

Use one root Node script, `tools/build.mjs`, with explicit stage arguments. It invokes subprocesses with argument arrays and `shell: false`. It does not install packages or modify source files during a build.

The Gradle `genesisBuild` task invokes that script from the monorepo root and declares the Rust, SDK, applet, manifest and lockfile inputs. It must run before asset merging and JNI-library merging. Register generated directories as main assets and jniLibs source directories; never copy artifacts into `src/main`.

Execution order:

1. Validate tool paths and run package/manifest checks. Missing `node_modules` reports the root `npm ci` command.
2. Run TypeScript checking for the SDK and bundled HN applet. The root workspace check may also verify the preserved inactive applets.
3. Preserve `crates/page-runtime/` as inactive historical code; it is not an Android asset input.
4. Build each source entry and the TypeScript runtime into one IIFE with esbuild. Set target to ES2022, JSX automatic, code splitting false, and dynamic imports unavailable in the final package. Package CSS as text used by the runtime, not a network URL. Resolve npm dependencies at build time.
5. Build HN's local library HTML and script. It can reuse the same bundled runtime and SDK, with a page context instead of a source context. Do not ship a development-server URL.
6. Produce `packages/index.json` and immutable package asset directories under `android/app/build/generated/genesis/assets/`. Compute a SHA-256 revision from manifest plus compiled assets. Generate the Android source scripts from these exact assets.
7. Run cargo-ndk for both native ABIs, using the selected NDK/API 26 and `genesis-android` cdylib. Output `libgenesis_android.so` under `android/app/build/generated/genesis/jniLibs/<abi>/`. Use debug native builds for Debug and release native builds for Release.

The active bundle contains the TypeScript runtime and creator code. No Wasm compilation, `eval`, dynamic imports or website fetch is needed. Keep the existing isolated world and exact origin allowlist.

Use the AGP variant API or explicit per-variant task wiring to prevent Debug and Release output races. Place variant outputs under `generated/genesis/<variant>/` when both variants are built. The unqualified paths above describe their logical contents. Register a single producer per output directory.

Gradle sync must not compile Rust or invoke npm. Android Studio Run may execute the build task. A second Run with unchanged inputs should reuse generated output. Changing an applet source or manifest must invalidate its build outputs. Dependency lock changes must invalidate the relevant graph.

## 5. Java/Rust boundary

Use a small command protocol between Java and native Rust. `NativeBridge.dispatch(eventJson)` runs on the Android UI thread and returns a JSON array of host commands. Java executes the commands through `BrowserAdapter` and `HostViews`.

Examples of generic commands: `createView`, `destroyView`, `registerScript`, `loadUrl`, `replyToPage`, `showLauncher`, `showError`, `showLoadingCover`, `showFullscreen`, and `finishActivity`. HN-specific decisions do not appear as Java branches.

Rust's controller reduces an event into commands, then releases any mutable borrow before Java executes commands that can cause callbacks. Do not hold a mutex or a RefCell borrow across a Java/browser call.

Run database operations on one Rust worker with a bounded channel of 64 jobs. The worker posts a completion through a cached JNI callback into a Java main-thread Handler. The resulting host event goes through the same reducer. No database work runs on the Android or browser UI thread. Queue saturation returns `BUSY`; it does not block a callback.

Store JavaVM/global references only where their lifetime is explicit. Never retain a thread-local JNIEnv or JNI local reference across calls/threads. Catch Rust panics at native entry points and turn them into a host failure; do not unwind through JNI. The [jni crate](https://docs.rs/jni/latest/jni/) supplies the boundary facilities, not the application lifecycle.

Tag every callback and view command with a view generation. Recreating an Activity or view increments that generation, invalidating old callbacks. Release Activity references on detach. Database commits may finish after a document closes, but their old UI reply must be dropped.

## 6. Browser behavior

Enable JavaScript and DOM storage. Keep normal cookies in one persistent WebView profile. Use the default mobile user agent. Do not impersonate desktop Chrome or depend on CDP for shipping behavior.

Required capabilities are `JS_INJECTION_IN_FRAME_AND_WORLD`, `WEB_MESSAGE_LISTENER`, `NAVIGATION_LISTENER`, `WEB_VIEW_RENDERER_CLIENT_BASIC_USAGE` and `WEB_VIEW_RENDERER_TERMINATE`. Check features at runtime before calling APIs. A device missing a required feature shows an unsupported-customization state, not a partially enabled applet. [WebView feature definitions](https://developer.android.com/reference/androidx/webkit/WebViewFeature).

Register the execution-world message listener and document-start script before `loadUrl`. Use an exact origin allowlist from the source manifest. Restrict MVP source bridge handling to main-frame messages. The [WebViewCompat API](https://developer.android.com/reference/androidx/webkit/WebViewCompat) defines world-aware registration; it does not prove the complete bootstrap on a particular provider.

Use WebViewAssetLoader for applet-owned local pages at `https://appassets.androidplatform.net/genesis/<appletId>/<revision>/<pageId>/index.html`. Only serve declared package assets. A source website cannot change a local page's package binding by supplying a URL or claimed applet ID. [Local content loading](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content).

Switching source IDs, applets or source/page modes replaces the WebView object in the single browser slot. Save the source URL, retire its generation, remove its script handlers and destroy the view before creating the next one. Register only the destination context's scripts. Native Back from the library recreates the saved source URL; it does not rely on mixed website/local-page WebView history. A local page's injected entry waits for its body before creating its owned root.

Keep native browser chrome outside the WebView. It includes Home, Back, Reload, a package action menu and a visible error/loading area. Actions in the menu come from the manifest. HN supplies the Library action; Android does not hardcode it. MVP-06 also exposes declared library actions from the launcher for offline entry.

Back priority is fullscreen player, applet modal if the host knows one is open, local library return, WebView history, launcher, then Activity exit. Page modal dismissal is bounded by a 300 ms reply timeout; on timeout offer native reload/disable rather than waiting indefinitely. The native menu always remains accessible.

Preserve the implemented WebChromeClient fullscreen container. The HN prototype does not require media playback/caption qualification. Verify rotation and native Back for source/library and modal states. File uploads, downloads, new-window browsing and camera/microphone permissions are outside this MVP and must return explicit unsupported outcomes where needed.

Apply URL policy to native load commands, link navigation callbacks, redirects and navigation lifecycle events. Do not assume `shouldOverrideUrlLoading` observes every SPA change. Java forwards navigation information; Rust applies policy. External article pages use ordinary browsing without a Genesis bridge. Preserve the source selection for returning to HN. Authentication is outside this prototype; do not request login verification.

On backgrounding, notify the runtime of stale/suspended observations and use view lifecycle callbacks. Avoid global `pauseTimers()` because it affects all WebViews. On resume, revalidate location and document bindings. On rotation or process recreation, restore only applet selection, source URLs and durable data; create fresh DOM handles. If an APK update removes the saved applet/source/page from its bundle, return to the launcher instead of trying to restore an unknown destination. Do not clear browser/app data to handle that change.

If the renderer dies or becomes unresponsive, disable the failing applet in native state before recreating its view. Handle renderer loss for every affected view. A normal reload is not enough if the same broken bundle immediately runs again. [Renderer recovery API](https://developer.android.com/reference/androidx/webkit/WebViewRenderProcess).

## 7. Commands to document after implementation

From the repository root: `npm ci`, `npm run typecheck`, `npm run check:packages`, and `cargo fmt --all -- --check`. From `android/`: `./gradlew :app:assembleDebug :app:lintDebug`. Then open `android/` in Android Studio, select the `app` configuration and press Run.

These root scripts and the dated Android setup guide already exist. Keep the guide current with tool paths, SDK/NDK requirements, emulator ABI and physical-device evidence. Do not require users to manually copy JavaScript or native libraries before each Run.

## 8. Browser profile implementation

Follow the [browser/session contract](150238-genesis-mvp-implementation-plan.md#9-browser-and-session-contract). `BrowserAdapter` already enables cookies and DOM storage, uses the default WebView profile, and flushes pending cookies on pause. View destruction removes execution handlers and DOM state without clearing browser data. `MainActivity` restores navigation metadata, not credentials. Preserve these paths when adding later stages.

Do not add per-source cookie jars, Chrome-cookie import or credential serialization. Retain the current cookie policy. Public HN browsing and native bookmark storage require no website login. [Android CookieManager](https://developer.android.com/reference/android/webkit/CookieManager) documents these separate policies. Authentication verification is outside the revised HN prototype. Required provider features and physical-device qualification remain unchanged.

## 9. Emulator progression and release hardware

On 28 October the user authorized implementation of MVP-03 through MVP-06 after supported-emulator MVP-02 qualification. Repeat required HN browser/lifecycle/recovery checks on a physical device in MVP-07 before release. This changes verification timing, not the required browser APIs or isolation architecture.
