# Genesis Hacker News retargeting report

Scope: update all active plans and retarget the implemented MVP-01/02 foundation to one public HN bookmarking applet. Bookmark feature implementation remains MVP-05/06 work; shared runtime/storage completion remains MVP-03/04 work. No later stage is claimed verified.

## Changes and preserved work

All five plans now use HN as the only product target. The applet plan was renamed to `150238-genesis-hacker-news-applet-plan.md` and specifies item identity, public-page extraction, owned Save controls, categorized local bookmarks and the offline library. The delivery plan keeps stage numbers, replacing the former product stages with HN Save and then categories/library. Login/account and media experiments are outside this prototype. Provider isolation/recovery gates remain required.

Added `applets/news.ycombinator.com/` with package `hn-bookmarks`, exact HN source origin, plain TypeScript qualification entry, bounded structural inspector and packaged React library qualification entry. The entries state that saving/storage remain unimplemented. The existing package checker selects only HN for APK assets/launcher entries. npm retains earlier applet workspaces so their source and type checking are preserved. The local HN workspace reuses already pinned SDK/React dependencies; no new external dependency version was introduced.

Reused the current Gradle/Node build, real Wasm/JNI outputs, Java browser adapter, Rust controller/package validation/source registry, nonce bootstrap, native inspector, WebViewAssetLoader mapping and recovery. Existing YouTube/X directories are unchanged and omitted from the generated package index; no earlier data or browser profile was cleared. No platform/browser architecture was replaced.

The one necessary native correction is saved-state compatibility. An APK can stop bundling a previously selected applet while Android still retains its Activity selection. Attach now accepts restoration only for an applet/source/page declared by the current package index; retired destinations return to the launcher. User-directed unknown opens still return errors. Valid HN source/library restoration is preserved.

Component commits are `0264336` for restoration and `617c653` for the HN qualification package. The plan/guide updates form a separate documentation commit.

## Inspection and verification

Public HTTPS HTML was fetched for HN home and item 1 without credentials. It showed submission rows with positive decimal IDs, primary title anchors and an immediately associated metadata row. Comment rows share `.athing` but have `.comtr`; the HN plan explicitly excludes them. Public web inspection also reached newest, Ask and jobs. These responses support candidate selectors only and are not Android isolation evidence.

| Command/check | Result |
| --- | --- |
| `npm install --ignore-scripts --offline --no-audit --no-fund` | Passed; added the local workspace link using existing pinned dependencies |
| `npm run typecheck` | Passed for SDK, HN and both preserved applets |
| `npm run check:packages` | Passed; selected only `hn-bookmarks`; runtime qualification still pending |
| `node --check tools/build.mjs` and `node --check tools/check-packages.mjs` | Passed |
| `cargo fmt --all -- --check` | Passed |
| `cargo check -p genesis-contracts --locked` | Passed |
| `cargo check -p genesis-page-runtime --target wasm32-unknown-unknown --locked` | Passed |
| `cargo clippy -p genesis-android --locked -- -D warnings` | Passed |
| `cargo build -p genesis-contracts --locked` | Passed; refreshed the host library for the one-off reducer check |
| From `android/`, `./gradlew :app:assembleDebug :app:lintDebug --console=plain` with configured JDK 17 | Passed after the final native edit; build completed in 5 seconds, 46 tasks, 6 executed/40 up to date |
| APK inspection | Exactly one package, `hn-bookmarks`; all declared asset hashes match; real Wasm magic and both ABI ELF libraries present; no earlier applet package assets |
| One-off actual controller check compiled from stdin | Passed retirement of old applet, unknown source and unknown page selections to the single HN launcher; valid HN source/library selections create views |
| Preserved source comparison | `git diff --exit-code` against original YouTube/X source directories passed before component commits |
| Documentation/whitespace | Local links/anchors and all five HN plan scopes checked; `git diff --check` passed |

No automated test source files were added or changed. The first one-off reducer compilation used a stale host contracts artifact and failed before execution; rebuilding the current contracts resolved that verification setup issue. The final check used the real current modules and generated index, without changing runtime code to accommodate the check.

Final APK: `android/app/build/outputs/apk/debug/app-debug.apk`. HN package revision: `9b6c9d4c62d56333b2d1c7f81dd5ed80252fcbe5c3abf83d15da9d92eb517aa4`. Build output is in `/tmp/genesis-hn-final-build.log`; temporary logs/check binaries are not durable repository artifacts. Android lint reports 0 errors and 23 warnings; existing feature-annotation, starter-resource and dependency-version warnings remain.

## Emulator and remaining gates

Installed with `adb -s emulator-5554 install -r` and started `app.nirvana.genesis/.MainActivity`, without uninstalling or clearing data. Android Studio's emulator screenshot visibly showed the native launcher with exactly one entry, Hacker News with Genesis bookmarks.

Attempting to click the embedded emulator through native UI automation returned `noWindowsAvailable`. Therefore this task does not claim actual HN browsing, fresh runtime-ready cycles, local-page activation or recovery qualification. The screenshot proves the new launcher only. No private sign-in or account action was performed.

The last observed provider from earlier qualification was `com.google.android.webview` 145.0.7632.218 and lacked `JS_INJECTION_IN_FRAME_AND_WORLD` and `NAVIGATION_LISTENER`. Flags were not requalified in this task. HN removes the login dependency but not these requirements. A supported provider and the specified physical-device evidence are still needed to complete MVP-02. No MVP-03 through MVP-07 feature implementation was started.

Follow the [HN continuation guide](../../.docs/2026-10-27/200113-genesis-hacker-news-mvp-guide.md). Begin with its MVP-02 qualification prompt, then the two runtime components, storage, story Save, categories/library and final integration. The public HN applet is now the only target for these stages.
