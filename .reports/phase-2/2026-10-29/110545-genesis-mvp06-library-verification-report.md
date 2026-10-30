# Genesis MVP-06 emulator verification

MVP-06 is verified on emulator-5554, Android 17 API 37, arm64-v8a, en-US, Google System WebView 156.0.8078.47. MVP-01 through MVP-05 prerequisites already passed. This unlocks MVP-07 integration under the approved emulator-first sequence. Physical hardware is still required before release.

## Implemented and reused

The HN TypeScript repositories implement normalized category names, atomic CAS creation/rename, a 50-category limit, tombstones and active memberships. React supplies category choices, independent category creation and the local library. Pagination consumes order entries in batches of 100 with at most eight concurrent bookmark reads, returning the last consumed cursor. Relevant storage changes and namespace conflicts reset reads; cancellation aborts pending scans.

The generic Rust launcher now exposes manifest-declared local pages through the existing loader. The library reuses the SDK, isolated runtime, WebViewAssetLoader, JNI worker and generic SQLite documents. No HN-specific SQL or native category operations were added. Android remains under android/, shared contracts under crates/contracts/, SDK under packages/sdk/, and customization under applets/news.ycombinator.com/. Inactive X/YouTube code and unrelated Studio files remain intact.

Component commits are 4df3071, 57763b5 and 7a828d5. Commit 0b4c665 moves category feedback above the editable fields after screen verification found it below the category rows.

## Acceptance evidence

| Gate | Result and evidence |
| --- | --- |
| Zero/one/multiple categories | Passed. Three real saved stories started Uncategorized. Item 50284521 saved to Reading, then Reading and Notes. Reading and Notes each returned the matching item; Uncategorized excluded it and returned the other two. |
| Reserved/duplicate normalized names | Passed. All produced the reserved-name error. RESEARCH conflicted with Research and displayed a clear message above the fields; active count remained two. Native checks also covered NFKC and whitespace normalization. |
| Rename retains memberships | Passed. Reading became Research; its filter retained item 50284521 and displayed Research and Notes. |
| Delete retains bookmarks | Passed after explicit user approval. Research and Notes disappeared from active filters; all three bookmarks remained in Uncategorized. SQLite retained two tombstones and an empty active category list. |
| Stale/uncertain dialog | Passed. A temporary helper used separate qualification collections and the normal dialog. A competing identical-value category update caused an actual native SQLite CAS conflict. Both selected checkboxes remained selected after rereading. On explicit retry, a simulated lost reply after an actual successful commit produced the uncertain-outcome review message. The dialog stayed open; a subsequent read confirmed both memberships. This is not evidence of an actual five-second transport timeout. |
| Cancel and independent creation | Passed. Creating Notes in the bookmark dialog, then native Back, kept Notes while leaving bookmark membership unchanged. |
| Sparse pagination and cancellation | Passed through the real repositories and JNI/SQLite. A temporary 500-record run passed all 497 assertions, including 480 per-record uniqueness checks, sparse cursor consumption, progress/cancel and namespace revision reset. These are data-path checks, not 497 separate user scenarios. |
| Source/library consistency | Passed. The source dialog applied Notes to Ask item 50271004; the reopened library showed Notes. Library saves updated cards and filter results. Library removal of the authorized Ask item immediately reduced the list from three to two. |
| Offline launcher/menu | Passed. Wi-Fi and mobile data were disabled through Android UI; dumpsys connectivity reported Active default network: none. After process force-stop/start, the launcher opened the library directly without HN. It displayed three saved stories and both categories. Native menu Genesis bookmarks recreated the page and displayed the same records while no default network remained. Both network switches were restored and default network 104 returned. |
| Open discussion and native navigation | Passed. Library Open discussion for Ask item 50271004 loaded its original HN discussion, original comments and Saved/Edit control. Editing used a valid source context. Native Back returned to the launcher; reopening the library retained the edit. |
| Restart/install-as-update | Passed. A force-stop and normal install -r preserved committed document rows byte-for-byte, including three bookmarks and two categories before the authorized removals. The normal library visibly reopened with those categories. No uninstall or data clearing occurred. |

The public-site evidence uses the real MVP-05 records, not fixture records as extraction proof. The additional temporary dialog helper used isolated collection names and removed its records. Read-only SQLite inspection at completion found zero qual-* documents, two remaining real bookmarks, two category tombstones and an empty active category list. Normal library source was restored byte-for-byte, rebuilt and reinstalled after the helper.

The screen-control service intermittently delayed input and returned stale captures. Fresh captures confirmed each recorded result. The earlier progress report describes the historical access blocker; it is no longer the stage blocker.

## Verification commands

- npm run typecheck and npm run check:packages passed. The package check's static runtime-pending sentence is not the stage qualification verdict.
- git diff --check, node --check tools/build.mjs, cargo fmt --all -- --check, cargo check -p genesis-contracts --locked and host cargo clippy -p genesis-android --locked -- -D warnings passed.
- Configured cargo ndk -t arm64-v8a -t x86_64 --platform 26 clippy --locked -p genesis-android -- -D warnings passed both ABIs.
- Configured JDK 17, android/gradlew -p android :app:assembleDebug :app:lintDebug --console=plain passed for restored normal entries. Final log is /tmp/genesis-mvp06-restored-build.log.
- :app:testDebugUnitTest succeeded with NO-SOURCE. It supplies no executable feature coverage; preserved starter Kotlin tests are outside the active Java source set.
- Temporary manual Node and Android checks passed category CAS, limits, 500-record pagination and cleanup. No automated repository test file was added or modified.
- adb install -r and Activity restarts succeeded without clearing data. Read-only database copies and dumpsys connectivity supplied persistence/offline evidence.

The native 500-record run measured save acknowledgement p95 4.8 ms across 100 operations, first 20 of 500 in 53.7 ms on warm storage, and sparse first 20 after 331 scanned records in 236.0 ms. These emulator data-path measurements do not establish painted UI latency or physical-device performance.

## Next stage

Proceed to MVP-07 integration and handoff. The user requested completing emulator checks while retaining hardware as a release blocker. Do not declare release-ready without physical WebView, workflow, recovery, timing and memory evidence.
