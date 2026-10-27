# Proposed prototype dependency inventory

Review update, 27 October 2026: the [live customization roadmap](../live-dom-customization/05-implementation-roadmap.md) provides the revised Rust-runtime and JS/TS-creator dependency choices. The versions below remain historical observations, not a tested lockfile or a requirement to install every package before the first experiment.

Date: 26 October 2026. Scope: direct dependencies proposed for the [Rust monorepo design](2026-10-26-codebase-design.md). No packages were installed or resolved into a tested build. This is not an exhaustive transitive software bill of materials.

## 1. Rust runtime dependencies

Versions below are stable versions observed in crates.io metadata on the research date. They are research references, not a tested compatible lockfile. Select and pin a compatible set during the platform experiment. The Wasm crate, generated bindings and CLI versions must agree.

| Dependency | Observed version | Direct use | Declared license |
| --- | --- | --- | --- |
| [serde](https://docs.rs/serde/) | 1.0.229 | Shared contract and manifest serialization; derive feature | MIT OR Apache-2.0 |
| [serde_json](https://docs.rs/serde_json/) | 1.0.154 | Explicit JSON bridge messages, fixture records and local settings | MIT OR Apache-2.0 |
| [thiserror](https://docs.rs/thiserror/) | 2.0.21 | Typed protocol/core/adapter errors | MIT OR Apache-2.0 |
| [tracing](https://docs.rs/tracing/) | 0.1.44 | Host and CLI diagnostics tagged by source/document/command | MIT |
| [tracing-subscriber](https://docs.rs/tracing-subscriber/) | 0.3.23 | Host/CLI logging configuration; Android writer stays in the native adapter | MIT |
| [jni](https://docs.rs/jni/) | 0.22.4 | Rust native calls and callbacks for Android WebView hosting | MIT OR Apache-2.0 |
| [wasm-bindgen](https://docs.rs/wasm-bindgen/) | 0.2.129 | Export/import Rust Wasm functions and browser callback bindings | MIT OR Apache-2.0 |
| [web-sys](https://docs.rs/web-sys/) | 0.3.106 | DOM, MutationObserver, events, navigation and browser APIs from Rust | MIT OR Apache-2.0 |
| [js-sys](https://docs.rs/js-sys/) | 0.3.106 | JS objects, arrays, promises and callback interoperation from Rust | MIT OR Apache-2.0 |
| [wasm-bindgen-futures](https://docs.rs/wasm-bindgen-futures/) | 0.4.79 | Async Wasm startup and promise bridging | MIT OR Apache-2.0 |
| [serde-wasm-bindgen](https://docs.rs/serde-wasm-bindgen/) | 0.6.5 | Conditional: Rust value conversion when a browser bridge exposes JS values | MIT |
| [leptos](https://docs.rs/leptos/) | 0.8.22 | Client-side Rust UI in the shell and reference applet | MIT |
| [toml](https://docs.rs/toml/) | 1.1.8+spec-1.1.0 | Parse the applet manifest in native host and CLI | MIT OR Apache-2.0 |
| [sha2](https://docs.rs/sha2/) | 0.11.1 | Identify complete package contents and verify staged artifacts match | MIT OR Apache-2.0 |

`serde-wasm-bindgen` can be removed if every final bridge endpoint uses JSON strings and no structured JS conversion is needed. Pick one encoding per endpoint. Start with inspectable JSON strings, without claiming that repeatedly encoding an entire document is cheap.

Use per-target dependencies. `jni` belongs only in Android packages. Leptos and DOM bindings belong only in Wasm frontend/agent packages. `protocol` and `core` stay platform independent. Enable only the needed `web-sys` interfaces. Do not enable Leptos server rendering or a server runtime for a local client-only applet.

The observed dependency set includes crates declaring Rust 1.88 minimum. That is a lower bound from metadata, not proof the full resolved graph works on 1.88. Pin a stable toolchain only after all target builds pass.

## 2. Build, schema and test dependencies

| Dependency/tool | Direct use | License or scope |
| --- | --- | --- |
| [clap](https://docs.rs/clap/), observed 4.6.7 | CLI subcommands and argument validation | MIT OR Apache-2.0 |
| [schemars](https://docs.rs/schemars/), observed 1.2.3 | Generate JSON Schemas from canonical Rust manifest/protocol types; no second handwritten schema | MIT |
| [proptest](https://docs.rs/proptest/), observed 1.12.0 | Model-based source-tree reducer and sequencing tests | MIT OR Apache-2.0 |
| [wasm-bindgen-test](https://docs.rs/wasm-bindgen-test/), observed 0.3.79 | DOM tests in real browser runtimes | MIT OR Apache-2.0 |
| [wasm-bindgen CLI](https://wasm-bindgen.github.io/wasm-bindgen/reference/cli.html) | Generate the browser bindings and deployable Wasm artifacts | Same upstream project, MIT OR Apache-2.0 |
| [cargo-ndk](https://github.com/bbqsrc/cargo-ndk), upstream manifest 4.1.2 observed | NDK target setup and native library output for Android packaging | Apache-2.0 OR MIT in the upstream manifest; pin a release before use |
| [Rust/Cargo/rustup](https://www.rust-lang.org/tools/install) | Compiler, workspace, formatter, linter and target toolchains | Rust projects generally MIT OR Apache-2.0; retain notices for distributed tooling |
| [Gradle](https://github.com/gradle/gradle) and [Android Gradle Plugin](https://android.googlesource.com/platform/tools/base/+/mirror-goog-studio-main/build-system/) | Build the Android host package, include the Rust shared library and local assets | Gradle Apache-2.0; Android build sources have their own notices |
| [OpenJDK](https://openjdk.org/legal/gplv2+ce.html) | JVM required by Android build tooling | GPLv2 with Classpath Exception; select a supported distribution |

Cargo's ordinary test harness covers pure tests; no additional runner is required. `std::process` invokes build tools, and bounded `std::sync::mpsc` channels coordinate the first native host. A general async executor, HTTP server and Node package manager are not requirements of this proposed build path.

Android SDK, NDK, ADB, an emulator image and a WebView-equipped physical device are prerequisites. SDK distributions and images have component-specific terms; listing Android open-source projects does not mean every downloaded binary has one license. Record exact versions, SDK terms and the device provider in the implementation inventory. Do not infer an Android minSdk from a Rust crate version; choose it after checking the resolved Android libraries and required features.

## 3. Android/browser dependencies

| Component | Use | Qualification and license notes |
| --- | --- | --- |
| [Android WebView](https://developer.android.com/reference/android/webkit/WebView) | Source websites and local result UI | Device-provided runtime, not a bundled Cargo dependency. Chromium and Android contain multiple licenses and third-party notices. |
| [androidx.webkit:webkit](https://developer.android.com/jetpack/androidx/releases/webkit), stable 1.18.0 observed | Injection, provider feature checks, message bridge and WebViewAssetLoader | AndroidX open source, Apache-2.0 with dependency notices. Runtime provider feature checks remain necessary. |
| Android framework Activity/View/JNI APIs | Host lifecycle and view containment | Platform dependencies, not a separate frontend framework. |

Use a plain Activity and a forwarding Java shim for the baseline host; avoid a Kotlin build plugin and AppCompat until required. Java bootstrap methods load the native library and forward lifecycle/callback events. Rust owns the decisions. A custom WebViewClient and WebChromeClient remain forwarding platform classes, not browser logic implemented in Java.

`WebViewAssetLoader` is already part of AndroidX WebKit, not an additional independent package. Its reserved HTTPS-style origin supports local result assets. It does not prove source-origin agent loading works.

## 4. Alternatives, not simultaneous dependencies

| Alternative | When to use it | Why it is absent from the baseline |
| --- | --- | --- |
| [Wry](https://docs.rs/wry/latest/wry/), observed 0.57.1 | Replace custom platform adapter internals if Android view and injection requirements pass | Android has generated Kotlin glue. Documented child-view support excludes Android. Multi-view hosting is unqualified for this app. MIT OR Apache-2.0. |
| [Tauri](https://v2.tauri.app/reference/webview-versions/) | Product shell/package integration if its Android extension points meet the same requirements | It uses the system WebView on Android; it does not provide a Rust DOM engine. A second host abstraction is unnecessary before qualification. |
| [android-activity](https://docs.rs/android-activity/), observed 0.6.1 | Rust-native Activity/event-loop approach if chosen instead of the baseline JVM Activity path | Different lifecycle integration. Do not add it by default beside Wry's AppCompatActivity route or an unrelated Activity owner. MIT OR Apache-2.0. |
| [Dioxus](https://github.com/DioxusLabs/dioxus) | Alternative Rust creator UI framework | Choose it instead of Leptos after comparing browser output, SDK integration and build experience. Do not build two frontend bindings in the prototype. |
| [Servo](https://github.com/servo/servo) | Engine research if a demonstrated WebView limitation justifies replacement | Requires separate Android embedding and target-site compatibility work. Rust implementation is not evidence of website support. |
| React/TypeScript | Creator UI if the user explicitly keeps the earlier React plan | Violates a strict Rust UI requirement. Optional future SDK binding, not hidden in a purported Rust-only implementation. |

## 5. Deliberate omissions

rrweb, remote-dom and JavaScript browser-automation libraries are useful references but do not implement a Rust-authored source agent. Wasmtime runs Wasm but does not supply a live browser DOM. A fork of Chromium is unnecessary before the stock embedding experiments. There is no required backend, database, AI API, app store service, Docker stack or JavaScript monorepo manager.

Keep archives out of the first import format: stage a complete directory through the CLI/ADB. Add an archive library only when a single-file import becomes a prototype requirement. Keep immutable revision metadata and applet settings in files. Add SQLite only when actual query or transactional requirements justify it.

## 6. What a verified inventory would require

After the platform gate passes, commit Cargo.lock, the Gradle wrapper/version catalog and Gradle dependency locks. Record any patched upstream revision. Export both resolved dependency graphs, including transitive dependencies and notices, plus toolchain and WebView provider versions. Review optional features against the actual compiled targets.

The tables above are the proposed direct dependency inventory. A complete shipped dependency list requires that resolved build. No compatible lockfile, APK size, startup latency or memory figure has been measured in this research.
