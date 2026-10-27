# Genesis remaining MVP implementation guide

Superseded for the active prototype by the [Hacker News continuation guide](200113-genesis-hacker-news-mvp-guide.md). The earlier prompts below describe the retired YouTube/X scope and must not be used for current implementation.

Scope: the existing Genesis MVP stages, reviewed after the user's authentication/session clarifications. This guide organizes future work; it implements no new stage.

## Current position and review findings

MVP-01 is verified on the emulator. MVP-02 code is implemented, but its real browser qualification is incomplete. MVP-03 through MVP-07 are pending. Dedicated authentication verification is deferred and does not block progression; missing required WebView capabilities still do.

The earlier clarification commits are `de9df11`, which established user-owned browser accounts, and `f8ea990`, which deferred dedicated authentication verification. This review consolidates those decisions in the [MVP browser/session contract](../../.plans/2026-10-27/150238-genesis-mvp-implementation-plan.md#9-browser-and-session-contract), removes stale pre-implementation descriptions, and makes account-switch experiments explicitly deferred. It preserves the selected architecture and existing stage order.

| Reviewed area | Finding and resulting decision |
| --- | --- |
| `BrowserAdapter.java` | Cookies and DOM storage are enabled; cookies flush on pause. View replacement destroys handlers/views without clearing browser data. No functional correction is needed. |
| `MainActivity.java` and native controller | Saved state restores selection, source URLs and disabled applets. `SourceSession` and `SessionSnapshot` are navigation metadata, not auth sessions. Keep website login in WebView. |
| Contracts, SDK and applets | No credential bridge, shared-account service or website-token repository exists. Qualification entries are not the future feature implementation. |
| Build and identity | Keep `app.nirvana.genesis`, compatible signing and install-as-update. Preserve the inactive Kotlin starter and existing build tooling. |
| Data design | One local browser profile does not mean a shared account service. Future SQLite bookmarks use Genesis profile/applet identity and remain independent of website account changes. |
| Acceptance wording | Dedicated login, logout/account-switch and session-retention experiments are deferred. Actual injection, media, recovery and feature behavior still need evidence. |

No application source change was necessary for the clarified authentication model. The persistent-profile code already follows it. No new auth manager, cookie copying or tab-state serialization should be added. Per-tab `sessionStorage` is not guaranteed across view replacement; ordinary browser storage follows site/provider rules. The [Android CookieManager documentation](https://developer.android.com/reference/android/webkit/CookieManager) and [sessionStorage documentation](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage) distinguish these lifetimes.

The last observed provider was `com.google.android.webview` 145.0.7632.218 on the API 37 arm64 emulator. It lacked `JS_INJECTION_IN_FRAME_AND_WORLD` and `NAVIGATION_LISTENER`. That is evidence about the last run, not a fresh inventory. Recheck actual flags before qualification; a newer version number alone is insufficient. See the [MVP-02 report](../../.reports/2026-10-27/182114-genesis-mvp02-qualification-report.md).

## Verification of this review

The working tree was clean before this review. Only these plans, this guide, the setup guide and README changed; application source, dependencies, tests and generated assets are unchanged.

- `npm run typecheck` passed for the SDK and both applets.
- `npm run check:packages` passed for both bundled applets and still reports runtime qualification pending.
- `cargo fmt --all -- --check` passed.
- A one-off document check passed for all eight changed documents and 38 local links/anchors. All five plans reference the same browser/session contract and state the authentication deferral.
- Code inspection confirmed cookie/DOM-storage enablement and lifecycle flushing, with no cookie import/extraction/clearing or per-source profile override in the reviewed implementation.
- `git diff --check` passed. No new automated test files were added.

No Android build, device experiment or private sign-in was rerun for this documentation-only change. Earlier platform results remain historical evidence; this review does not mark MVP-02 verified.

## How to use the prompts

Run one numbered prompt at a time. The prompts reference this guide and the five authoritative plans:

- [MVP architecture and session contract](../../.plans/2026-10-27/150238-genesis-mvp-implementation-plan.md)
- [Android and build](../../.plans/2026-10-27/150238-genesis-android-build-plan.md)
- [Runtime and SDK](../../.plans/2026-10-27/150238-genesis-runtime-sdk-plan.md)
- [YouTube and X applets](../../.plans/2026-10-27/150238-genesis-hacker-news-applet-plan.md)
- [Delivery and verification](../../.plans/2026-10-27/150238-genesis-delivery-verification-plan.md)

Every prompt follows these working rules:

1. Read root/nested `AGENTS.md`, Git status, all five plans and the latest evidence before editing. Reuse existing implementations and preserve unrelated work.
2. Keep platform Java and Android Rust under `android/`, shared Rust under `crates/`, SDK under `packages/sdk/`, and all site rules/UI under `applets/`. Preserve the original website/player.
3. Keep the browser/session contract. Do not request private credentials or reopen deferred authentication verification. Do not change the engine, execution world or origin restrictions to bypass a failed gate.
4. Run the relevant checks below and existing applicable tests. Do not create or modify automated test files unless separately authorized.
5. Commit each completed, verified component using `feat/(component): message` and the configured Git author email. Report changes, commands/results, acceptance status and blockers. Save requested evidence under the repository's dated document rules.
6. Stop after the requested substep. Partial substeps do not verify their parent stage. A blocked required gate prevents progression to the next stage.

## Order and checks

| Step | Existing stage | Deliverable | Prerequisite |
| --- | --- | --- | --- |
| 1 | MVP-02 completion | Actual provider/injection/media/recovery evidence | MVP-01 verified |
| 2 | MVP-03, observation/effects | Managed targets, owned UI and cleanup | MVP-02 verified |
| 3 | MVP-03, navigation/lifecycle | Complete reusable runtime and SDK | Step 2 verified |
| 4 | MVP-04 | Generic durable storage in source/local contexts | Entire MVP-03 verified |
| 5 | MVP-05 | YouTube Shorts suppression and route blocking | Shared runtime verified; follow Step 4 in this sequence |
| 6 | MVP-06, data | X extraction and repository/category operations | MVP-04 verified; Step 5 complete in this sequence |
| 7 | MVP-06, UI | Feed Save, dialog and offline library | Step 6 verified |
| 8 | MVP-07 | Physical-device integration, quality and final handoff | All earlier stages verified except explicitly deferred checks |

These are component subdivisions of the existing stages, not extra product requirements. Although MVP-05 only depends on MVP-03, the sequence above completes shared storage before either feature applet.

Use these commands from the repository root as applicable:

```sh
npm run typecheck
npm run check:packages
node --check tools/build.mjs
node --check tools/check-packages.mjs
cargo fmt --all -- --check
cargo check -p genesis-contracts --locked
cargo check -p genesis-page-runtime --target wasm32-unknown-unknown --locked
cargo clippy -p genesis-android --locked -- -D warnings
cargo clippy -p genesis-page-runtime --target wasm32-unknown-unknown --locked -- -D warnings
```

From `android/`, with the JDK/SDK/NDK configured as in the [setup guide](161510-genesis-android-setup.md):

```sh
./gradlew :app:assembleDebug :app:lintDebug --console=plain
```

Gradle builds real Wasm and both Android ABIs. Run target-specific native Clippy when its cross-compilation toolchain is available. Build success does not substitute for real browser or physical-device checks. Use install-as-update rather than uninstalling when deploying over data.

## 1. Finish MVP-02 qualification

The next action is to qualify the existing implementation on a provider with the required APIs. This is the remaining platform gate, not an authentication task.

```text
Finish MVP-02 qualification only. Follow the working rules in the Genesis remaining MVP guide and all five plans under .plans/2026-10-27/. Inspect Git status and reuse the implemented host, bootstrap, inspector and qualification entries.

1. Read the MVP-02 report and inspect available Android devices/providers. Record the actual required feature flags. If injection or navigation APIs are unavailable, report that precise blocker and stop without changing engines or weakening isolation.
2. On a supported provider, run 20/20 fresh-document navigation/reload cycles for both source contexts. Separately verify nonce binding, Wasm startup, creator execution, computed CSS and owned mounting under the real realm policy. Verify packaged local-page activation.
3. Inspect accessible real-site variants without collecting private data. Verify original YouTube playback/fullscreen/Back and native retry, ordinary-site recovery, creator failure and renderer-loss behavior. Obtain the physical-device results required by MVP-02; label emulator results separately.
4. Keep dedicated login/account-switch/session-retention checks deferred. Do not ask for sign-in or a device for authentication. Missing APIs remain an independent blocker.
5. Fix only defects preventing MVP-02 qualification, run relevant build/lint checks, commit fixes and save a dated qualification report. Mark MVP-02 verified only when its non-deferred gates pass. Do not start MVP-03.
```

## 2. Implement MVP-03 managed observation and effects

Build the reusable DOM lifecycle on the existing qualified bootstrap.

```text
Implement the observation/effects portion of MVP-03 only. Follow the working rules in the Genesis remaining MVP guide and read all five plans under .plans/2026-10-27/. Require recorded MVP-02 verification before starting.

1. Reuse the existing contracts, nonce handshake, Wasm initialization and PageScope. Add focused Rust modules for targets, observation, effects and scope ownership, with thin TypeScript SDK wrappers.
2. Implement one MutationObserver, coalesced frame work, bounded watchElements bindings, separate element/content identity, owned styles and mountAt. Exclude Genesis-owned UI from source discovery.
3. Handle missing/replaced targets, recycled elements, duplicate mounts, callback reentry and cleanup exceptions. Track only owned effects and release DOM/callback handles on disposal. Add conflict handling for repeated page removal of owned effects.
4. Verify the corresponding MVP-03 scenarios and run type/package/Rust/Wasm/Android checks. Commit this component and report verified behavior and remaining MVP-03 work. Do not implement site features, storage or mark the whole stage verified yet.
```

## 3. Complete MVP-03 navigation, modal and recovery behavior

Finish the generic API and verify the complete runtime stage.

```text
Complete MVP-03 after its managed observation/effects component is verified. Follow the working rules in the Genesis remaining MVP guide and all five plans under .plans/2026-10-27/.

1. Implement route tracking, full generic manifest navigation policy including bounded query-value deny sets, and bound sources.open/pages.open operations. Reuse existing package validation and WebViewAssetLoader mapping. Acknowledge accepted switches before retiring the caller.
2. Implement the one-modal lifecycle with focus handling, native modal state and the 300 ms Back dismissal timeout. Preserve fullscreen-first Back and native recovery controls.
3. Finish lifecycle transitions, BFCache/resume rebinding, stale request/reply rejection and sequential explicit-source selection. Keep cookie/profile lifetime separate from document lifetime and preserve the original website.
4. Verify all MVP-03 scenarios, including two-source structure, route changes during callbacks, background/resume, Activity recreation, creator exceptions, repeated host removal and renderer nonresponse. Confirm zero duplicate owned roots, stale handles or retained managed resources after disposal.
5. Run the prescribed checks, commit by component and save the stage results. Mark MVP-03 verified only after its full acceptance criteria pass. Do not start storage or feature applets.
```

## 4. Implement MVP-04 durable generic storage

Complete storage before the X repository starts using it.

```text
Implement MVP-04 only, after MVP-03 is verified. Follow the working rules in the Genesis remaining MVP guide and all five plans under .plans/2026-10-27/.

1. Add private SQLite initialization and the versioned generic namespace/document schema in Android Rust. Implement one database worker with a bounded 64-job queue and generation-safe UI completions.
2. Implement get/list/commit, payload limits, atomic compare-and-set checks, monotonic namespace revisions, typed failures and storage.changed notifications. Derive namespace identity from the verified binding. Do not add website account keys or X-specific SQL.
3. Add thin SDK storage calls for source and local-page contexts using the existing loader and single-view transitions. Preserve WebView cookies and keep applet storage independent of website login.
4. Verify CRUD/pagination, CAS conflicts, full rollback, deletion/recreation revisions, queue/payload limits, late replies, process restart, install-as-update and offline page reopening. Do not acknowledge writes before commit or retry uncertain writes automatically.
5. Run required checks, commit by component and save acceptance evidence. Stop after MVP-04; do not implement bookmarks or Shorts filtering.
```

## 5. Implement MVP-05 YouTube Shorts blocking

Keep classification and UI rules inside the YouTube applet.

```text
Implement MVP-05 only using the verified shared runtime. Follow the working rules in the Genesis remaining MVP guide and all five plans under .plans/2026-10-27/.

1. Qualify the accessible YouTube targets and route variants. Implement positive Shorts classification and scoped managed hiding in applets/youtube.com/, with explicit unknown/degraded outcomes.
2. Suppress verified Shorts links, navigation, shelves and cards. Populate the bounded known-Shorts-ID set from observed evidence; do not classify ordinary videos by duration or aspect ratio.
3. Register direct /shorts and known-ID watch policies through the generic runtime. Handle taps, native loads, redirects, SPA/history routes and recovery without loops. Preserve the original player and ordinary-site bypass.
4. Run the full surface/navigation/recycled-node matrix and ordinary playback, seek, captions, fullscreen and Back checks. Record unobserved account-dependent variants, transient flashes/audio and unsupported layouts. Do not reopen dedicated authentication verification.
5. Run required checks, commit applet/runtime corrections separately and save coverage evidence. Stop after MVP-05; do not implement X.
```

## 6. Implement MVP-06 X extraction and data operations

This substep supplies validated records and atomic operations for the UI.

```text
Implement only the extraction/repository/category portion of MVP-06. Follow the working rules in the Genesis remaining MVP guide and all five plans under .plans/2026-10-27/. Require verified generic storage and follow the guide's stage order.

1. Qualify accessible X post variants and implement primary-permalink extraction in applets/x.com/. Distinguish outer posts, quotes, repost wrappers, media-only content and ambiguous identities. Use opaque decimal IDs and bounded plain-text metadata.
2. Implement validated BookmarkV1/CategoryV1 records, canonical URLs, category normalization and reserved names, the 50-category limit, tombstones and account-independent namespace use.
3. Implement atomic bookmark/order-index operations and category create/rename/delete using generic CAS storage. Preserve save order, selected active categories and user edits on conflicts; reread after uncertain writes.
4. Verify normalization, duplicate names, stale edits, deletion/recreation, category deletion without bookmark loss and pagination without skipped records. Distinguish synthetic data checks from actual feed-extraction evidence.
5. Keep login/account-switch experiments deferred. Run checks, commit this component and report what remains for feed controls and library UI. Do not mark MVP-06 verified or build its UI in this substep.
```

## 7. Complete MVP-06 X Save and local library UI

Connect the verified data layer to the real website and packaged offline library.

```text
Complete MVP-06 UI after its extraction/repository/category component is verified. Follow the working rules in the Genesis remaining MVP guide and all five plans under .plans/2026-10-27/.

1. Mount a distinct plain-DOM Save to Genesis button per supported post in owned Shadow DOM. Revalidate recycled cards and capture the chosen post identity when opening the dialog. Leave X's bookmark controls untouched.
2. Use one React save/edit dialog with zero/one/multiple category selection, explicit category creation, cancellation, removal and honest save/error states. Use the runtime modal lifecycle and native Back integration.
3. Complete the packaged React library with All/Uncategorized/category filters, category management, paginated records, open-original navigation and offline use. Make it reachable from the native menu and launcher. Explain that the local library survives website account changes.
4. Verify the complete MVP-06 acceptance matrix, including quote/recycled-card identity, synchronized button states, conflicts, uncertain saves, category deletion, offline reopen, restart and install-as-update. Dedicated real-account authentication checks remain deferred; unseen feed behavior must remain unverified.
5. Run checks, commit by component and save results. Mark MVP-06 verified only when the real feed and library gates pass. Do not start final integration in this substep.
```

## 8. Complete MVP-07 integration and delivery

The final step measures the complete app and records its actual supported scope.

```text
Complete MVP-07 only after the earlier non-deferred stage gates are verified. Follow the working rules in the Genesis remaining MVP guide and all five plans under .plans/2026-10-27/.

1. On a named physical Android device, alternate both applets, open the X library offline, return to a source, rotate, background/resume and recover from creator/renderer failure. Install an updated APK over populated data without uninstalling. Verify namespace isolation and browser-data preservation by code/lifecycle checks; leave dedicated account experiments deferred.
2. Measure the delivery plan's runtime/UI latency, 100-operation save latency, 500-bookmark library behavior, memory and 20/20 controlled recovery threshold. Use the stated clocks/definitions and report network time separately.
3. Fix observed integration defects within the selected architecture. Repeat affected checks and run the complete required type/package/Rust/Wasm/Android build/lint verification. Commit fixes by component.
4. Update setup instructions and save a final dated report with exact versions, commands, supported devices/site variants/routes, performance results, persistence semantics and every gate's status. Include the installable APK path and remaining limitations.
5. Declare the MVP ready only when all non-deferred acceptance criteria pass. If required evidence is unavailable, state the exact remaining blocker. Do not publish, deploy or add features outside the MVP.
```
