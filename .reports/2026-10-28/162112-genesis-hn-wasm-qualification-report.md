# Genesis HN qualification on WebView 156

Status: MVP-02 remains blocked by Wasm compilation in the HN source realm. The missing-provider-API blocker has been resolved. No MVP-03 through MVP-07 feature implementation is claimed complete.

## Scope and authorized progression

The user asked to implement the remaining HN stages in order. On 28 October the user explicitly authorized proceeding to MVP-03 through MVP-06 after supported-emulator qualification, with physical-device repetition required before MVP-07 release. The five plans record this change. It does not waive the real source-realm runtime gate.

Git status was clean at the start. Existing YouTube/X applet source, browser profiles and application data remain preserved. No credentials, private sign-in, new test files, engine replacement or security-policy bypass were used.

## Provider investigation and update

Only `emulator-5554`, Medium Phone API 37, Android 17, arm64-v8a, locale en-US was connected. Initially `dumpsys webviewupdate` and the native HN inspector confirmed Google WebView 145.0.7632.218 lacked the world-injection and navigation APIs. No beta/dev/canary provider was installed.

Opening the official on-device WebView DevTools action and choosing Check for WebView updates started Google Play's update flow. It displayed Updating Google apps while work continued. The update completed without the agent entering credentials. Fresh `dumpsys webviewupdate` and native diagnostics then reported `com.google.android.webview` **156.0.8078.47**, version code 807804703, as the valid selected provider.

| Required capability | Fresh native inspector result |
| --- | --- |
| `JS_INJECTION_IN_FRAME_AND_WORLD` | true |
| `WEB_MESSAGE_LISTENER` | true |
| `NAVIGATION_LISTENER` | true |
| `WEB_VIEW_RENDERER_CLIENT_BASIC_USAGE` | true |
| `WEB_VIEW_RENDERER_TERMINATE` | true |

An upstream Chromium snapshot's APK metadata was inspected as an alternative while Google Play was updating. It was `com.android.webview` 159.0.8129.0 and was not installed. Chromium documents AOSP/local providers as restricted on production GMS images; the emulator is a `user` build. Task-created APK/download files were removed. The actual tests used Google's updated stable provider, without altered signatures, provider allowlists or experimental flags.

Official references: [WebView update channels](https://chromium.googlesource.com/chromium/src/+/HEAD/android_webview/docs/prerelease.md), [on-device DevTools](https://chromium.googlesource.com/chromium/src/+/HEAD/android_webview/docs/developer-ui.md), [provider validation](https://chromium.googlesource.com/chromium/src/+/HEAD/android_webview/docs/webview-providers.md).

## Defects found and fixed

Commit `5dbb01c feat/(browser): preserve startup failures and fix nonce evaluation callback` contains:

- A non-null callback for `JavaScriptReplyProxy.executeJavaScript`. Although AndroidX declares it optional, WebView 156 crashed while dereferencing the absent callback in `ExecuteJavaScriptCallbackBoundaryInterface.onSuccess`. The final build supplies a no-op result callback; only the nonce acknowledgement can bind a document.
- Failed-context guards in navigation/deadline handling. A previously scheduled startup deadline no longer overwrites a specific runtime error or starts another deadline after failure.
- A debug-only startup trace capped at 48 static labels. It records no payloads, credentials, nonces or page text and remains available after a failed binding retires.

The trace on HN proved that JavaScript delivery, hello, challenge acknowledgement and document binding completed. The source runtime then emitted its real error. This separates provider support from Wasm compatibility.

## Actual browser results

| Experiment | Result and limits |
| --- | --- |
| HN isolated-world injection and nonce binding | Passed to document binding on the updated emulator. Full startup did not pass. |
| HN embedded Wasm | Failed with `CompileError: WebAssembly.Module(): Wasm code generation disallowed by embedder`. Native error stays visible after startup deadlines. |
| HN creator/CSS/mount | Not reached because Wasm initialization precedes these steps. |
| HN 20-cycle ready gate | Not completed; a failed source is not a qualified ready document. |
| Packaged local library qualification | Passed. Actual Wasm, computed CSS, owned Shadow DOM and React entry reached ready without a development server. This is still a qualification page, not implemented bookmarking. |
| Local-page 20 reloads | Passed 20/20. The native runner reported fresh document identities and Wasm/creator/CSS/mount readiness. This is local-page evidence only. |
| Controlled creator failure | Passed on the local page. Deliberate debug creator failure removed owned UI and showed native recovery controls with its specific error. |
| Open ordinary site | Passed from the failed local page. Native recovery recreated ordinary HN and the original public story list loaded, with customization explicitly disabled. |
| Physical-device qualification | Deferred to the final release stage by user authorization; no physical device connected. |

Native UI automation initially required recovering/focusing the Android Studio panel. Docking and using the IDE action made emulator coordinate interaction usable; the earlier `noWindowsAvailable` tool failure did not remain the browser blocker.

## Source policy and architectural consequence

A public GET of `https://news.ycombinator.com/` returned HTTP 200 and this script policy:

```text
script-src 'self' 'unsafe-inline' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://cdnjs.cloudflare.com/
```

Neither `wasm-unsafe-eval` nor `unsafe-eval` is present. HEAD returned HTTP 405, so the policy was read from GET response headers instead. The [CSP specification's Wasm compilation check](https://www.w3.org/TR/CSP3/#can-compile-wasm-bytes) distinguishes Wasm compilation permission from ordinary script execution. The observed HN refusal plus successful local-page compilation is consistent with source-realm policy enforcement. It is not evidence that WebAssembly is unavailable across every WebView realm or every device.

The AndroidX 1.18.0 `JavaScriptExecutionWorld` and `getExecutionWorld` source were inspected. The selected API exposes a named world, without a public CSP-setting method. The app did not strip response headers, change HN markup/policy, move to the page world, disable browser protections, or silently replace Rust/Wasm.

The plan explicitly stops when required source-realm Wasm cannot initialize. A separate user decision is pending: retain the selected architecture and investigate further, or use a TypeScript DOM runtime in the same isolated world while retaining Rust native controller/contracts/SQLite. The latter is the recommended prototype revision, but has not been implemented or counted as a pass in this report. Physical-device deferral alone does not authorize that change.

## Verification commands

From the root, `npm run typecheck`, `npm run check:packages`, `cargo fmt --all -- --check`, `cargo check -p genesis-contracts --locked`, `cargo check -p genesis-page-runtime --target wasm32-unknown-unknown --locked`, and `cargo clippy -p genesis-android --locked -- -D warnings` passed. `cargo build -p genesis-contracts --locked` refreshed the contracts artifact used for the one-off reducer verification.

From `android/`, with the configured JDK 17:

```sh
./gradlew :app:assembleDebug :app:lintDebug --console=plain
```

The final code build passed in 6 seconds with 46 tasks, 6 executed and 40 up to date. The generator cross-compiled the actual native host for both ABIs. `adb install -r` and `am start` installed/launched each diagnostic build without uninstalling or clearing data. The final emulator Genesis process remained alive during local-page startup, 20 reloads, creator failure and ordinary recovery.

A one-off Rust executable compiled the actual current controller/source/package modules from stdin. It passed nonce binding and specific-error preservation after a runtime failure, an old deadline and a later navigation commit, and verified that failed navigation schedules no new startup deadline. It added no test source file and does not replace browser qualification.

Temporary logs: `/tmp/genesis-20261028-mvp02-build.log`, `/tmp/genesis-20261028-mvp02-trace-build.log`, `/tmp/genesis-20261028-mvp02-deadline-build.log`. Public response headers are `/tmp/genesis-hn-20261028-headers.txt`. These temporary files are not durable handoff artifacts. Final APK remains `android/app/build/outputs/apk/debug/app-debug.apk`.

Final artifact checks passed for the single HN package, all declared asset hashes, real Wasm and both ABI ELF libraries. Eight updated documents and 42 local links/anchors passed validation. `git diff --check` passed, and earlier applet source directories match the pre-task commit.
