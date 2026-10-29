# Genesis MVP-05 Android Save verification

MVP-05 is verified on the supported emulator. This completes the checks left pending in the [Save progress report](093535-genesis-mvp05-save-progress-report.md) and unlocks MVP-06. Physical-device repetition remains a release requirement in MVP-07.

## Real public HN workflow

On Android 17 API 37 arm64-v8a, Google WebView 156.0.8078.47, the current HN source ran the bundled TypeScript runtime and original website without login. In this continuation, Show story 50276883 saved its external link and changed to Saved / Edit. Ask self-post 50271004 was canceled, remained unsaved, then saved and retained Saved / Edit after native Reload. Newest story 50284521 also saved correctly. News page 2 recognized the already saved Show story by the same item ID. The prior session verified homepage external story 50271640, its original comments navigation, matching discussion saved state, explicit refresh and removal. Comments had no Save controls.

Read-only SQLite inspection confirmed all three current saved records and exactly one order entry for each. The self-post article URL was null; the Show/newest article links remained separate from canonical HN discussion URLs. Data survived the probe APK updates without clearing app data. Original HN links and account actions were preserved; no vote, favorite or sign-in action was invoked.

## Controlled source-realm checks

A temporary applet helper under `/tmp` ran against the actual Android source-world DOM and the committed extractor. Fourteen assertions passed for external snapshots, immutability, missing metadata, self-post identity, reused IDs, direct comment permalinks, zero/nondecimal IDs, comment exclusion, UTF-8 truncation, conflicting metadata and job exclusion. These fixtures supplement real-page extraction above.

A connected temporary story table exercised the actual applet watcher. Initial insertion, reused item ID, replacement title-cell anchor and removal each passed their single-control/cleanup assertions. The visible result was PASS 18 extraction/lifecycle checks. The helper removed the temporary table afterward.

The real React dialog then handled a native SQLite CAS conflict. A controlled competing commit wrote the same current value with a new revision before the stale edit submitted. Native storage rejected the stale revision; the dialog remained open, reread the record, displayed the review-and-retry message and retained its checked refresh choice. No stale overwrite or false success occurred.

For uncertain acknowledgement handling, a temporary adapter awaited a real native commit and then returned a simulated timeout error. The dialog reread the committed record, retained its refresh choice and displayed the uncertain-outcome message. This verifies the lost-acknowledgement branch; it does not claim an actual five-second network timeout. Normal storage behavior and durable acknowledgement timing remain covered by MVP-04 and final performance work.

## Build and scope

`npm run typecheck` and `npm run check:packages` passed. Android `:app:assembleDebug :app:lintDebug` passed for the normal entry after probe removal. `adb install -r` succeeded for qualification updates. Earlier Rust formatting/check/Clippy and repository stdin checks remain recorded in the progress report; no native code changed during this continuation.

The normal source entry was restored byte-for-byte from the committed implementation. Temporary helpers are not included in tracked applet sources. No automated repository test file was added or changed. The current UI-control blocker is resolved after the user docked/foregrounded Running Devices.

All required MVP-05 emulator gates pass. Continue with category algorithms, dialog selection and the packaged offline library, retaining the current native storage and source isolation.
