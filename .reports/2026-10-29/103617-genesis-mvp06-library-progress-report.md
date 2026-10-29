# Genesis MVP-06 category and library progress

Historical progress snapshot. Superseded by the [completed emulator verification](110545-genesis-mvp06-library-verification-report.md).

MVP-01 through MVP-05 passed emulator acceptance. MVP-06 code is implemented; native data checks passed and visible UI verification is partly complete. MVP-06 is not yet fully verified, so MVP-07 has not started. The full MVP is not release-ready.

## Implementation

The HN applet now has category normalization, reserved-name and uniqueness checks, a 50-active-category limit, CAS-protected category creation/rename, tombstone deletion and active membership handling. Bookmark saves check selected category and metadata revisions. Deleting a category preserves bookmarks, and later edits remove inactive membership IDs.

The React save/edit dialog supports multiple category choices and independently committed category creation. The packaged React library has All/Uncategorized/category filters, category management, Edit/remove, Open discussion and scan cancellation. Pagination reads 100 order entries at a time, uses at most eight concurrent bookmark reads, and returns the last consumed cursor without skipping prefetched records. Relevant changes or namespace revision changes reset the library. Filter changes abort stale reads before showing a new selection.

Native launcher entries now include declared local-page actions. The launcher opens the Library through the existing page loader without loading HN first. The host remains generic; HN fields and UI remain under `applets/news.ycombinator.com/`. The existing SDK, SQLite worker, contracts and package build were reused. Inactive applets and unrelated Android Studio files were preserved.

## Passed evidence

On Android 17 API 37 arm64-v8a, Google WebView 156.0.8078.47:

- The manifest-driven launcher opened the normal packaged library directly. It displayed the three real HN stories saved in MVP-05, with local-storage/offline scope explained in the UI.
- The visible category manager rejected All with a clear reserved-name error, then created Reading and displayed its filter.
- The bookmark dialog created Notes independently. Native Back canceled the bookmark edit. The library then showed both category filters while the story remained Uncategorized. This verifies that explicit category creation survives bookmark cancellation.
- A temporary local-page helper ran the real applet repositories/paginator through the bound SDK, JNI, Rust worker and SQLite. It used unique qualification collection names, preserving real bookmarks/categories. All 497 assertions passed, including 480 per-record uniqueness checks. Scenarios covered NFKC/reserved/duplicate names, rename/stale CAS, tombstones, inactive memberships, stale category saves with no partial bookmark, concurrent category-meta CAS, the 50-category limit, all 500 records across pages, sparse filtering, in-progress scan cancellation and revision reset.
- The helper removed its records. Read-only SQLite inspection confirmed zero remaining qualification documents and three retained real bookmarks.
- The process was stopped and the final normal APK installed with `adb install -r`, without uninstall or app-data clearing. Read-only comparison confirmed that committed document rows were unchanged, including three bookmarks and two categories. This is persistence evidence; category UI reopening still needs its separate screen check.

The native run measured acknowledged repository saves using one monotonic JS clock. Across the first 100 normal commits, p95 was 4.8 ms. Reading the first 20 entries of 500 took 53.7 ms on warm storage. A sparse category's first 20 matches required 331 scanned entries and 236.0 ms. These are emulator data-path timings from isolated qualification collections, not physical-device results or painted-frame measurements. Fixture records do not replace the real extraction evidence in the MVP-05 report.

## Commands and results

- `npm run typecheck`: passed for SDK and all applet workspaces.
- `npm run check:packages`: passed for the active HN package.
- `node --check tools/build.mjs` and `git diff --check`: passed.
- `cargo fmt --all -- --check`, `cargo check -p genesis-contracts --locked`, and host `cargo clippy -p genesis-android --locked -- -D warnings`: passed.
- With the configured SDK/NDK, `cargo ndk -t arm64-v8a -t x86_64 --platform 26 clippy --locked -p genesis-android -- -D warnings`: passed for both Android ABIs.
- From `android/`, configured JDK 17 `./gradlew :app:assembleDebug :app:lintDebug --console=plain`: passed for the final normal source entries.
- `./gradlew :app:testDebugUnitTest --console=plain`: succeeded with NO-SOURCE. Preserved Kotlin starter tests are outside the active Java source set; this task supplies no executable feature coverage.
- Node stdin checks against bundled applet modules passed category algorithms, concurrent meta CAS, 500-record/sparse pagination, cancellation and revision reset using an in-memory adapter. Actual Android SQLite evidence above is separate.
- Data-preserving APK updates and Activity launches succeeded.

Temporary helpers lived under `/tmp`. Normal tracked entries were restored, rebuilt and installed after the helper run. No automated repository test file was created or modified.

## Remaining acceptance and blocker

Finish visible zero/one/multiple category selection and its filters from both source and library; duplicate-name presentation; rename/delete membership presentation; stale/uncertain category edits; library removal; correct Open discussion/source return; and offline launcher/menu reopening with no default network. Native data algorithms passed, but these UI gates must not be inferred from compilation or the helper.

The Mac locked during verification and the user unlocked it. Later, Studio input again became unreliable and the control service returned `noWindowsAvailable`; a direct Dock-control attempt timed out. The user was asked to keep Codex and Studio windowed on the same desktop, then leave Studio foreground after replying. This is the current screen-verification blocker. No login or account sharing is needed.

Complete those MVP-06 checks before MVP-07. Final physical-device repetition, full UI/runtime/recovery timing and memory qualification remain required before release, under the approved emulator-first sequence.

Commits include `47b3038` for MVP-05 evidence, `4df3071` for launcher access, `57763b5` for categories/pagination, and `7a828d5` for React library/dialog UI.
