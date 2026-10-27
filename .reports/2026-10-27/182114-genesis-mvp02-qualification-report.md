# Genesis MVP-02 qualification report

Status: **blocked at provider qualification**. The MVP-02 implementation is present and its compilation checks pass. The stage is not verified and MVP-03 must not start. Scope is the Genesis Android host, shared Rust/Wasm qualification runtime, thin TypeScript bootstrap and bundled qualification entries. No Shorts filtering, bookmark/category algorithms, storage worker or database was added.

## Account ownership and the revised plans

All five companion plans now state that users sign into their own existing accounts directly in the original website inside Genesis. There is no shared website account, agent account or central credential backend. Android WebView manages first-party cookies and website session data. Cookie acceptance and lifecycle flushing are enabled; source switching, Home and view recreation never clear browser data. Genesis never reads or exports authentication cookies or tokens. The WebView profile is separate from Chrome, so an existing Chrome login is not inherited.

Implementation and emulator checks do not require a physical device or the user to share credentials. A user can complete sign-in privately inside the actual app. Physical hardware and user-operated login remain empirical gates; architecture alone does not prove authentication compatibility or session retention. The user clarified this distinction during implementation; no private sign-in was performed in this task.

## Provider stop condition

Observed on `emulator-5554`, Medium Phone API 37.0, Android 17, arm64-v8a, locale en-US. Actual provider: `com.google.android.webview` **145.0.7632.218**.

| Required capability | Actual feature check |
| --- | --- |
| `JS_INJECTION_IN_FRAME_AND_WORLD` | false |
| `WEB_MESSAGE_LISTENER` | true |
| `NAVIGATION_LISTENER` | false |
| `WEB_VIEW_RENDERER_CLIENT_BASIC_USAGE` | true |
| `WEB_VIEW_RENDERER_TERMINATE` | true |

The native inspector showed `documentId: null`, `nonceBound: false`, `ready: false`. The host displayed an unsupported-customization cover with Retry and Open ordinary site. No script/listener was registered in another execution world. No JavaScript runtime, browser engine, origin rule or source website was substituted to claim success. This is a missing-provider-API result, **not** an observed Wasm CSP error.

Only the emulator was connected at the last device check. A second device request explained the concrete missing APIs. To finish qualification, use a provider that actually reports the required capabilities and then repeat the live tests. A device merely being newer does not itself prove feature support.

## Implemented behavior

- Shared Rust contracts now separate applet, instance, source, view, generation, document, nonce, request and route identities. Safe integer counters fail explicitly on overflow.
- Native Rust owns per-instance source sessions, current source/page binding, last committed URLs, document challenge state, readiness and disabled applets. It validates package paths, hashes, source origins and local-page/action references before issuing commands.
- Android registers `genesisHost` and document-start JavaScript in the named `genesis.v1` execution world before loading a supported source. Main-frame messages include the observed callback origin and a bounded channel identity. Child frames, wrong origins, stale channels, document IDs and generations are rejected.
- The document nonce is challenged with `JavaScriptReplyProxy.executeJavaScript` in the originating frame/world. Native binds a new document ID only after the acknowledgement. Embedded Wasm initializes from bytes, without a website asset fetch. Creator activation waits for the body and runs only after binding.
- Rust/Wasm owns the qualification style and Shadow DOM mount. CSS success checks a computed marker instead of assuming that inserting a style element proves CSP acceptance. Cleanup removes only owned nodes and calls creator disposal. BFCache restoration and resume rebind identities.
- The native loading cover is removed only after Wasm, creator, style and mount readiness. Five-second deadlines retire failed bindings. Native Retry and Open ordinary site remain outside the WebView.
- Renderer loss disables source customization before recreating ordinary browsing. Fullscreen retains the original media view. Native Back exits fullscreen first. View callbacks are generation-guarded; the launcher Activity uses a single task. Saved Activity state contains only selection, source URLs and disabled applets, never DOM handles or authentication data.
- Applet-owned local HTML is mapped through WebViewAssetLoader at the exact host-issued package/revision/page URL. Only declared SHA-256-verified bytes are served, with no network fallback for undeclared local paths. The local page uses the isolated bootstrap; it does not include a page-world script as a fallback.
- The X manifest's Library action is rendered generically by the native menu. Its React qualification entry is packaged but bookmark operations remain unimplemented. Candidate website selectors live only under the corresponding applets and are not claimed as qualified classifiers.
- The debug-only native inspector reports provider features, sanitized URL, package revision, source/page/document identity and bounded structural target samples. Credential values, input text, cookies and tokens are excluded. Menu actions support twenty reload cycles, deliberate creator failure and renderer termination. Web contents debugging is explicitly disabled, and no CDP workflow was used.

MVP-02 adds two named qualification diagnostics to the staged protocol: `runtime.phase` reports successful Wasm initialization without marking the document ready, and `debug.inspection` returns a requested diagnostic snapshot only in a debug host. Both use the bound envelope and are explicitly handled in the reducer. Arbitrary native invocation and storage RPC remain unavailable. The runtime/SDK plan records these narrow diagnostics.

## Acceptance results

| Gate | Result and limits |
| --- | --- |
| Required isolated-world registration | Blocked. The actual provider reports the world API unsupported. No page-world fallback was attempted. |
| 20/20 navigate/reload bindings | Blocked, no qualified cycles completed. The debug runner refuses to start without a ready document. Offline reducer checks are not these twenty browser cycles. |
| Wasm, creator, CSS and owned mount under real realm policy | Blocked. The real Wasm compiles and its version export initializes in Node, but there is no supported isolated browser realm here for the required experiment. |
| Packaged local applet page | Assets, hashes, local mapping and React bundle compile/validation passed. Actual isolated local-page activation is blocked by the provider and is not counted as a pass. |
| X authentication and retained session | Pending user-operated sign-in in Genesis. A login page, browser-cookie configuration or Chrome sign-in is not successful X authentication. No credentials were requested or entered by the agent. |
| Original normal-video playback | Passed on emulator in ordinary mode. YouTube's own search opened “Big Buck Bunny 60fps 4K - Official Blender Foundation Short Film”, channel Blender. Native player controls showed advancing playback at 3:43, 3:52 and later 4:16 of 10:34. This is not a physical-device or audible-output claim. |
| Original player fullscreen and native Back | Passed on emulator. The original player's fullscreen action displayed its media view in the native container; native browser chrome remained available. Back restored the same original video page and controls. Rotation and caption behavior remain unverified. |
| Unsupported-provider handling | Passed on the actual unsupported emulator provider. No crash or false ready status; native recovery controls remained usable. |
| Open ordinary site recovery | Passed. The unsupported cover was removed by recreating a source view without scripts, and the original YouTube site loaded with customization explicitly disabled. |
| Renderer-loss recovery | Passed for one controlled emulator trial. Renderer PID 13098 exited with code -1; app PID 13052 stayed alive, and ordinary browsing was recreated with customization disabled. This does not qualify infinite-loop detection, creator-exception recovery or the later 20/20 timed recovery threshold. |
| Physical real-site qualification | Pending. No physical Android device was connected. |

No authenticated X feed markup or post selectors were inspected. The observed YouTube variant was the signed-out mobile site, including home, search and ordinary watch UI. Source DOM target inspection in the isolated realm remains blocked; candidate selectors are clearly labeled provisional.

## Commands and outcomes

From the repository root:

```sh
npm run typecheck
npm run check:packages
node --check tools/build.mjs
cargo fmt --all -- --check
cargo check -p genesis-contracts --locked
cargo check -p genesis-page-runtime --target wasm32-unknown-unknown --locked
cargo clippy -p genesis-android -- -D warnings
cargo clippy -p genesis-page-runtime --target wasm32-unknown-unknown -- -D warnings
CARGO_TARGET_DIR=target/genesis/debug/cargo cargo clippy -p genesis-android --target aarch64-linux-android --locked -- -D warnings
CARGO_TARGET_DIR=target/genesis/debug/cargo cargo clippy -p genesis-android --target x86_64-linux-android --locked -- -D warnings
```

These checks passed. The new exact web-sys/js-sys 0.3.106 dependencies resolve with wasm-bindgen 0.2.129 in Cargo.lock. npm dependencies and package-lock.json did not need to change.

From `android/`, using registered Temurin JDK 17.0.21:

```sh
./gradlew :app:assembleDebug :app:lintDebug --console=plain
```

This passed, including genuine Wasm generation and cargo-ndk builds for arm64-v8a and x86_64 at API 26. The selected SDK/NDK and executable paths remain in ignored local.properties as documented by the MVP-01 setup guide. Lint has no errors. It reports RequiresFeature warnings around new WebKit APIs despite explicit runtime feature guards, plus retained starter-resource and version-update warnings. These warnings are not treated as evidence of provider support.

An unchanged repeat completed in 724 ms with `genesisBuildDebug UP-TO-DATE`, 45 tasks up to date and one task executed. APK ZIP inspection verified every declared asset hash, real Wasm magic and both JNI ELF machine IDs/exports. The local-page HTML contains no page-world script. The generated Wasm was actually initialized in Node and returned the MVP-02 version; this is compilation/byte-loading evidence only.

The final APK was installed with `adb install -r`, without uninstalling or clearing browser data, and launched with `adb shell am start -n app.nirvana.genesis/.MainActivity`. Provider/version and device inventory were read through adb. Native UI interaction used Android Studio's embedded emulator. No automated test files were added or modified.

Additional offline verification compiled the real Rust controller/modules from stdin into a temporary executable, with the generated package index and actual contracts. It passed origin/main-frame/channel rejection, fresh document IDs, stale document/deadline/generation rejection, timeout retirement, ordinary/renderer recovery decisions, local-page/source separation and safe counter overflow. Synthetic controller inputs were used only for reducer validation; they do not replace the failing browser/provider qualification.

## Required continuation

Keep MVP-02 blocked and do not start MVP-03. With a supported provider, run the twenty-cycle check for both source contexts, separately observe Wasm/creator/CSS/mount results, activate the packaged local page, inspect the actual site variants, and exercise creator-error/unresponsive recovery. The user must complete their own X sign-in privately inside Genesis, followed by reload, source reopening, restart and install-as-update session-retention checks. Repeat real-site playback/fullscreen on a physical Android device and record its provider and locale.

Reference: [MVP implementation plan](../../.plans/2026-10-27/150238-genesis-mvp-implementation-plan.md), [runtime and SDK](../../.plans/2026-10-27/150238-genesis-runtime-sdk-plan.md), [delivery gates](../../.plans/2026-10-27/150238-genesis-delivery-verification-plan.md), [Android setup](../../.docs/2026-10-27/161510-genesis-android-setup.md).
