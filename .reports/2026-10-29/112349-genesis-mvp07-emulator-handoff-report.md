# Genesis MVP-07 emulator handoff

Created 29 October 2026, Asia/Kolkata. The HN bookmarking prototype is ready on the supported emulator. MVP-01 through MVP-06 passed their emulator acceptance; MVP-07 functional integration also passed. Under the user's latest instruction, physical-device repetition and the delivery plan's physical performance gates are deferred to pre-release. They are not passed and do not block this emulator handoff.

## Delivered behavior and reuse

Browse original public Hacker News pages, save supported stories, assign several local categories, edit/remove bookmarks, manage categories, filter the packaged library and reopen saved metadata offline. The library opens directly from the launcher without loading HN first. Open discussion returns to the original HN page. No website login is needed.

The implementation reuses the existing Android Gradle project, Java browser adapter/native controls, Rust controller/contracts, world-aware injection, nonce/generation binding, local-page loader and generic SQLite worker. Shared runtime code stays under packages/sdk and crates/contracts; Android/native code stays under android; HN customization stays under applets/news.ycombinator.com. TypeScript implements extraction, category/bookmark transactions and cursor pagination; React implements the dialog and library. Existing X/YouTube source and unrelated Studio files remain intact and inactive.

MVP-07 removes development-stage labels from the running app and separates static package checks from recorded device qualification. It preserves the single live WebView architecture, website DOM/navigation and populated database. No automated repository test file was added or changed.

## Acceptance status

| Stage or gate | Status and evidence |
| --- | --- |
| MVP-01 build and packaging | Verified on emulator; both arm64-v8a and x86_64 native libraries build. |
| MVP-02 isolated HN runtime | Verified on supported emulator, including earlier 20/20 fresh-document cycles. See the [HN qualification report](../2026-10-28/174427-genesis-hn-typescript-qualification-report.md). |
| MVP-03 managed lifecycle and SDK | Verified. See the [runtime report](../2026-10-28/180813-genesis-mvp03-managed-runtime-report.md). |
| MVP-04 persistence and isolation | Verified. See the [storage report](../2026-10-28/183914-genesis-mvp04-android-storage-verification-report.md). |
| MVP-05 actual public HN Save flows | Verified. See the [Save report](095635-genesis-mvp05-android-save-verification-report.md). |
| MVP-06 categories, pagination and offline library | Verified. See the [library report](110545-genesis-mvp06-library-verification-report.md). Its real-site, category-conflict, cancellation, 500-record data-path, offline and update evidence remains applicable. |
| MVP-07 source/library integration | Verified. The final normal APK reopened two remaining real bookmarks; Open discussion loaded item 50284521 with original comments and Saved/Edit state. |
| Rotation | Verified. Library survived landscape Activity recreation, rendered a responsive layout and returned to portrait with both records. |
| Background/resume | Verified. Android Home visibly backgrounded Genesis. Reopening brought the existing task forward and retained the library and both records. |
| Creator failure | Verified. Debug creator failure displayed native Retry/Open ordinary site. Open ordinary site restored the original HN discussion without Save controls. Native Retry customization restored Saved/Edit and ready status. |
| Renderer loss | Verified. Debug renderer termination preserved host PID 11180 and replaced renderer PID 11240 with 11980. Ordinary HN browsing recovered; native Retry restored customization and saved state. |
| Offline/restart/install-as-update | Verified in MVP-06 and preserved by the final normal APK update. No uninstall or app-data clearing occurred. |
| Physical provider/workflow repetition | Deferred to pre-release by user instruction. |
| Physical latency, memory and 20/20 timed controlled recovery | Deferred to pre-release. No physical threshold is marked passed. |

The final app is the normal HN package. Temporary storage/dialog qualification helpers and records were removed before handoff. Two real saved stories remain; the approved Research/Notes verification categories are tombstoned, and the approved Ask HN verification bookmark was removed. Prior read-only inspection found no qual-* documents.

## Build and verification

Device: emulator-5554, Android 17 API 37, arm64-v8a, en-US. Google System WebView 156.0.8078.47 supports the five required feature flags. Provider 145 was unsupported; the official provider update resolved the missing world/navigation APIs. HN's Wasm restriction was addressed by the user-approved TS runtime, without weakening isolation.

Toolchain: Node 24.15.0, npm 11.14.1, Rust 1.94.0, JDK 17, cargo-ndk 4.1.2, NDK 28.2.13676358, Gradle 9.3.1, AGP 9.1.1 and AndroidX WebKit 1.18.0.

The following commands passed from the repository root:

```sh
npm run typecheck
npm run check:packages
node --check tools/build.mjs
node --check tools/check-packages.mjs
cargo fmt --all -- --check
cargo check -p genesis-contracts --locked
cargo clippy -p genesis-android --locked -- -D warnings
ANDROID_NDK_HOME=/Users/rit/Library/Android/sdk/ndk/28.2.13676358 ANDROID_HOME=/Users/rit/Library/Android/sdk cargo ndk -t arm64-v8a -t x86_64 --platform 26 clippy --locked -p genesis-android -- -D warnings
git diff --check
```

With the configured JDK 17, from android/:

```sh
./gradlew :app:assembleDebug :app:lintDebug --console=plain
./gradlew :app:testDebugUnitTest --console=plain
```

Build and lint passed. Unit-test task succeeded with NO-SOURCE, so it supplies no executable feature coverage. Android builds compile the TS packages and both native ABIs. Final normal build log is /tmp/genesis-mvp07-normal-build.log; Android Clippy log is /tmp/genesis-mvp07-android-clippy.log. Temporary logs support the session evidence; they are not durable repository artifacts.

The final normal APK SHA-256 is `8b87f423c7ac7ad8ea2b3c8c199f31508640b281f1fe0671d517df2fe1bd29c9`. It installed successfully as an update:

```sh
/Users/rit/Library/Android/sdk/platform-tools/adb -s emulator-5554 install -r /Users/rit/Nirvana/genesis/android/app/build/outputs/apk/debug/app-debug.apk
```

UI qualification used Android Studio's Running Devices panel through computer control. Read-only adb process, connectivity and database inspection corroborated the screen results. Build/ADB success alone does not establish UI acceptance.

## Provisional emulator measurements

The MVP-06 native 500-record data-path run measured save acknowledgement p95 4.8 ms over 100 operations, warm first 20 of 500 in 53.7 ms, and sparse first 20 after scanning 331 records in 236.0 ms. Its 497 passed assertions include 480 individual record checks. These fixtures do not establish real-site extraction or painted UI latency.

Read-only dumpsys meminfo samples counted the Genesis host and its owned renderer once each, excluding the WebView zygote:

| Scenario | Host PSS KiB | Renderer PSS KiB | Sum KiB |
| --- | ---: | ---: | ---: |
| Ordinary HN item 50284521 | 103849 | 84960 | 188809 |
| Same HN item with Save controls | 105086 | 86228 | 191314 |
| Packaged library with two real bookmarks | 101305 | 83148 | 184453 |

These are sequential snapshots of one emulator, not peaks, benchmark deltas or measurements of a 500-card rendered library. Do not infer a multi-tab budget. The physical 100-observation UI/runtime matrix, populated-library memory and controlled 20/20 recovery timing remain deferred.

## Use the prototype

1. Open android/ in Android Studio and run app on the existing supported emulator. The APK is android/app/build/outputs/apk/debug/app-debug.apk.
2. Use native Home, then Hacker News. On a supported story tap Save to Genesis. Choose or create categories and confirm Save.
3. Use Menu > Genesis bookmarks, or native Home > the bookmark-library entry. Filter All/Uncategorized/category, manage categories, edit/remove a bookmark or open its discussion.
4. Turn off emulator networking to browse previously saved library metadata. HN pages and external articles still require network access.
5. Use native Retry/Open ordinary site if customization fails. Keep the app ID and signing key; install updates without uninstalling or clearing app data.

Supported story surfaces are public home/news, newest, Ask, Show, paginated lists and item discussions. Genesis does not bookmark comments/jobs, perform HN account actions, cache full articles or sync data. Website cookies belong to the WebView profile; bookmarks belong to the local installation's SQLite namespace. No shared account or credential import is involved.

All 80 local links across the nine changed/new documents resolve. No setup or device blocker remains for this supported emulator. Other providers may lack required APIs. Before release, follow the distinct hardware, performance and release-readiness prompts in the [continuation guide](../../.docs/2026-10-27/200113-genesis-hacker-news-mvp-guide.md). Do not repeat completed implementation or expand feature scope during qualification.
