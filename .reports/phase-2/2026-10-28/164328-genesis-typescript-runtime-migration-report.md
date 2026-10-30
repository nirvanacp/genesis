# Genesis TypeScript runtime migration

Scope: the approved browser-runtime architecture revision for the Hacker News prototype. This continues MVP-02 qualification; it does not declare the complete MVP ready.

## Decision and implementation

The user approved TypeScript/JavaScript for all browser customization and React for custom UI. The native Rust controller, shared contracts, exact-origin bridge, SQLite design and single-view Android host remain selected. All five plans and the HN continuation guide now reflect this division.

`packages/sdk/src/scope.ts` replaces the packaged Wasm qualification scope with owned TS style and Shadow DOM nodes. Bootstrap retains the nonce challenge and verifies runtime, creator, computed CSS and connected mount separately. Native accepts the TS phase and still requires all ready phases. The self-contained esbuild bundle needs no Wasm compilation, runtime fetch or dynamic code evaluation. Gradle no longer requires wasm-bindgen-cli. The inactive `crates/page-runtime/` source and YouTube/X workspaces remain intact.

Reused code includes the existing bootstrap/handshake, HN source and local React entries, native controller/source registry, package asset hashes, esbuild packaging, Gradle variant outputs, JNI build, WebView injection world, recovery controls and persistent default browser profile. No authentication or cookie export was added.

## Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed SDK and all three applet workspaces |
| `npm run check:packages` | Passed; bundled package is HN only |
| `node --check tools/build.mjs` and `tools/check-packages.mjs` | Passed |
| `cargo fmt --all -- --check` | Passed |
| `cargo clippy -p genesis-android --locked -- -D warnings` | Passed |
| `JAVA_HOME=<configured JDK 17> ./gradlew :app:assembleDebug :app:lintDebug --console=plain` from `android/` | Passed, 30 seconds; both arm64-v8a and x86_64 built |
| APK inspection with Python `zipfile`/SHA-256 | HN only; all declared hashes match; both native libraries present; no `.wasm` asset or Wasm compilation call |
| Temporary stdin Rust harness against actual controller modules | Passed nonce binding, rejection of obsolete Wasm phase, TS phase/readiness, stale document rejection and failure preservation |
| `adb -s emulator-5554 install -r <debug APK>` and `shell am start -n app.nirvana.genesis/.MainActivity` | Passed; profile preserved |
| Real HN TS qualification | Pending, desktop-control failure prevented emulator clicks |

The one-off controller harness is under `/tmp`, not a new repository test suite. Build and compiler checks do not prove real source-realm startup.

## Stage status and blocker

MVP-01 remains verified on the emulator. MVP-02 is in progress. The prior Wasm compilation failure is historical evidence and prompted the approved TS migration. The current emulator has Google WebView 156.0.8078.47, with all five required feature flags previously observed true.

The computer-control service reads Android Studio's launcher screenshot and accessibility tree but fails coordinate actions with `noWindowsAvailable`; some reconnection attempts also return `timeoutReached`. Bringing the IDE forward did not resolve coordinate actions. Exiting IDE full-screen mode has been requested as the next control recovery step. This is separate from website login, Android provider compatibility or an observed TS runtime failure.

Required remaining MVP-02 evidence is actual HN TS/creator/CSS/mount success, 20 fresh-document reloads, public route coverage, local page activation, external navigation/Back, and failure/renderer recovery. MVP-03 through MVP-06 remain pending until those required emulator gates pass. Physical-device repetition remains a final MVP-07 release requirement under the user's explicit decision. No login is required.

After qualification, continue the approved stages in order: managed TS DOM runtime and lifecycle, native generic SQLite/CAS worker, HN Save controls/repository, category management/offline library, then full integration/performance and physical-device release checks. The existing continuation guide contains distinct prompts for those steps.
