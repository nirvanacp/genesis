# Genesis MVP-05 story Save progress

MVP-01 through MVP-04 passed emulator qualification. MVP-05 code is implemented and its verification is in progress. MVP-06 has not started. The full MVP is not ready yet.

## Implementation and reuse

The HN applet now validates positive decimal item IDs, canonical discussion links and bounded immutable story snapshots. It excludes comment rows, job metadata and conflicting identities. Each supported submission receives an owned Shadow DOM Save button. One React dialog saves, explicitly refreshes or removes a bookmark using atomic bookmark/order-index transactions. Existing saves keep their original save time and order. Reads validate stored JSON. Conflict/timeout handling rereads before user retry; initial read failure disables writes.

The implementation reuses the MVP-03 watcher, mount, modal and bound RPC APIs and MVP-04 native SQLite worker without introducing HN logic into generic storage. Bootstrap now flushes initial managed discovery before runtime ready, and source qualification roots no longer display a placeholder above HN. Local pages retain their owned full-page container. Replaced title-cell anchors dispose the old control and create its replacement.

Existing HN targets, applet manifest, package build, contracts, controller and SDK were extended in place. The preserved YouTube/X applets and running website project were not changed. Android Studio's pre-existing untracked `.idea` files are excluded from commits.

## Actual evidence

The preceding emulator session saved external story 50271640 from the real HN homepage. The button changed to Saved / Edit after acknowledgement. Its original comments link opened the correct discussion, where the top submission showed the same saved state and comments had no Save controls. Explicit refresh preserved identity, and Remove returned the control to Save. The Ask HN self-post 50271808 opened a dialog with its correct title and submitter. Cancellation was requested at the last interaction, but its final state and a durable self-post save have not yet been verified.

On this continuation, the emulator displayed a System UI nonresponse dialog. After recovery and detaching Running Devices, current public HN home again visibly showed one Save control per submission. This observation confirms mounting on the current page, not completion of the remaining workflow checks. The screen-control service then directed taps to Studio's main window rather than the device window. Rebinding the app and restarting its process without clearing data did not restore reliable input. Human assistance to dock/foreground Running Devices was requested.

## Commands and results

- `npm run typecheck`: passed for SDK and all applet workspaces.
- `npm run check:packages`: passed for the active HN package. Its generic pending-runtime wording is not an acceptance verdict.
- `cargo fmt --all -- --check`: passed.
- `cargo check -p genesis-contracts --locked`: passed.
- `cargo clippy -p genesis-android --locked -- -D warnings`: passed.
- Android `JAVA_HOME=<configured JDK 17> ./gradlew :app:assembleDebug :app:lintDebug --console=plain`: passed, including packaged TS and native ABIs.
- A Node stdin review of bundled item URL/repository code passed exact-origin and malformed-ID rejection, safe article URLs, bookmark/index creation, duplicate CAS rejection, refresh ordering, stale removal, atomic removal and stored JSON validation. The in-memory adapter does not replace actual SQLite evidence from MVP-04.
- `adb install -r` and Activity restart: succeeded without uninstall or app-data clearing.
- `git diff --check`: passed.

A temporary DOM fixture probe was compiled under `/tmp`, but its on-emulator results could not be read. Do not count those cases as passed. The normal source entry was restored and rebuilt before handoff. No automated repository test file was added or changed.

## Remaining gates and next work

Finish real self-post save/cancel/reload and explicit Save integration on newest, Show and pagination. Run the DOM fixture checks for metadata absence, malformed/conflicting IDs, comment permalinks, Unicode bounds and reused/replaced targets. Check uncertain-write presentation against actual native storage. Keep original HN navigation/vote/favorite controls intact without invoking account actions.

Only after required MVP-05 checks pass, implement MVP-06 categories, dialog selection and the offline library with manifest-driven launcher access. Then complete MVP-07 integration and measurements. Physical Android hardware remains required before release under the user's approved emulator-first sequence; it is not the current MVP-05 blocker. No login is needed for any of these public HN checks.
