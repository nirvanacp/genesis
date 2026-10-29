# Genesis Hacker News prototype continuation guide

Scope: the single public Hacker News bookmarking prototype. This replaces the earlier YouTube/X continuation prompts. The five current plans under `.plans/2026-10-27/` are authoritative; this guide divides their existing stages into bounded implementation tasks.

## Current state

MVP-01, MVP-02 and MVP-03 passed emulator verification. MVP-04 native storage and SDK passed Android persistence and offline gates. See the [current report](../../.reports/2026-10-28/183914-genesis-mvp04-android-storage-verification-report.md). The build bundles only `hn-bookmarks`. The HN source now includes Save/edit/remove controls and a validated bookmark repository. MVP-05 passed [Android Save verification](../../.reports/2026-10-29/095635-genesis-mvp05-android-save-verification-report.md); MVP-06 also passed [category/library emulator acceptance](../../.reports/2026-10-29/110545-genesis-mvp06-library-verification-report.md). Continue with MVP-07. YouTube/X applet source remains intact and excluded from the APK package index.

HN provides public story pages, so login is not a prerequisite. The [28 October qualification report](../../.reports/2026-10-28/162112-genesis-hn-wasm-qualification-report.md) supersedes the earlier missing-API diagnosis. The official provider update to 156.0.8078.47 resolved that problem. The packaged local page passes Wasm startup and twenty reloads; HN source startup refuses Wasm compilation in its realm. The user approved a TypeScript/JavaScript managed runtime and React customization. Keep native Rust contracts/controller/storage and TS qualification passed on the emulator as recorded in the [current HN report](../../.reports/2026-10-28/174427-genesis-hn-typescript-qualification-report.md). Proceed with MVP-05; retain the ordered prompts below for reference.

The user authorized implementation to advance after emulator qualification on 28 October. Physical-device repetition remains required before final MVP-07 release, rather than before MVP-03. This does not waive required source-realm runtime success.

| Plan | Read for |
| --- | --- |
| [MVP architecture](../../.plans/2026-10-27/150238-genesis-mvp-implementation-plan.md) | Scope, ownership, browser/session contract |
| [Android/build](../../.plans/2026-10-27/150238-genesis-android-build-plan.md) | Existing host/build/toolchain and recovery |
| [Runtime/SDK](../../.plans/2026-10-27/150238-genesis-runtime-sdk-plan.md) | DOM API, identities, RPC and generic persistence |
| [HN applet](../../.plans/2026-10-27/150238-genesis-hacker-news-applet-plan.md) | Extraction, item records, category algorithms and UI |
| [Delivery](../../.plans/2026-10-27/150238-genesis-delivery-verification-plan.md) | Acceptance gates and stage dependencies |

The [retargeting verification report](../../.reports/2026-10-27/200924-genesis-hacker-news-retargeting-report.md) records the code/build/launcher checks and pending device gates.

## Working rules for every prompt

Read root/nested `AGENTS.md`, Git status, these five plans and current evidence first. Preserve unrelated work and the inactive applet directories. Reuse the existing host, package build, handshake and local-page loader. Keep Android/native code under `android/`, shared Rust under `crates/`, SDK under `packages/sdk/` and HN-specific code under `applets/news.ycombinator.com/`.

Do not collect credentials, require a website account, rebuild HN from an API feed, or change engines/execution worlds/origin restrictions to get past a failed gate. Keep original HN DOM/navigation intact. Do not create or modify automated test files without separate authorization; run existing applicable tests and build/manual checks. Commit verified components using `feat/(component): message` and the configured author email.

Each prompt ends with changes/reused files, commands/results, acceptance status, exact blockers and the next eligible step. Save a dated verification report when requested. A substep does not verify the whole parent stage; do not start the next stage until required acceptance passes.

Run appropriate checks from the repository root:

```sh
npm run typecheck
npm run check:packages
node --check tools/build.mjs
node --check tools/check-packages.mjs
cargo fmt --all -- --check
cargo check -p genesis-contracts --locked
cargo clippy -p genesis-android --locked -- -D warnings
```

From `android/`, with the pinned tools configured as in the [setup guide](161510-genesis-android-setup.md):

```sh
./gradlew :app:assembleDebug :app:lintDebug --console=plain
```

Build the self-contained TS bundles and both native ABIs; use target-specific native Clippy when its cross-compilation environment is available. Install as an update without uninstalling or clearing data. Compilation and public desktop HTML inspection do not replace actual Android browser/device results.

## 1. Finish MVP-02 on Hacker News

This stage passed on the emulator. Retain this prompt for physical-device repetition and future provider changes.

```text
Finish MVP-02 qualification only for the Hacker News prototype. Read all five current plans under .plans/2026-10-27/ and follow the working rules in the HN continuation guide.

1. Inspect Git status and available Android devices/providers. Reuse the HN package and existing debug inspector. Record actual required feature flags. If world-aware injection or navigation APIs are missing, report the precise compatibility blocker and stop; do not request a login or bypass isolation.
2. On a supported provider, load public HN home/news, newest, Ask, Show and a story discussion. Qualify the nonce challenge, TypeScript runtime, creator execution, computed style and owned mount separately. Run 20/20 fresh-document cycles for the HN source and verify stale bindings are rejected.
3. Activate the packaged library qualification page without a development server. Verify an external story title link uses ordinary browsing without the source bridge and Back rebinds HN correctly.
4. Verify unsupported-provider handling, Retry/Open ordinary site, creator failure and renderer-loss recovery. Use emulator results for the implementation gate under the 28 October authorization; repeat the required checks on physical hardware before final MVP-07 release.
5. Fix only MVP-02 defects, run appropriate checks, commit verified components and save a dated HN qualification report. Mark the stage verified only when its required gates pass. Stop before MVP-03.
```

## 2. MVP-03 managed observation and effects

Build the reusable DOM lifecycle used by HN's future Save buttons.

```text
Implement only the observation/effects portion of MVP-03 after recorded HN MVP-02 verification. Read all five current plans and follow the HN continuation guide's working rules.

1. Reuse contracts, the qualified bootstrap and existing PageScope. Add focused TypeScript modules under packages/sdk for targets, observation, effects and scope ownership. Keep native controller and shared Rust contracts in their current locations.
2. Implement watchElements, one MutationObserver, coalesced frame work, bounded bindings, separate element/content identity, managed styles and owned mountAt hosts. Exclude Genesis-owned UI from source discovery.
3. Handle absent/replaced targets, changed/recycled row identities, duplicate mounts, callback reentry and creator cleanup exceptions. Suspend effects after repeated page removal instead of remounting indefinitely.
4. Verify zero duplicate owned roots, stale bindings or retained managed resources after disposal. Distinguish HN's ordinary document replacement from synthetic recycled-node stress checks.
5. Run appropriate type/package/native Rust/Android checks, commit this component and report remaining MVP-03 work. Do not implement storage or HN Save behavior yet.
```

## 3. Complete MVP-03 navigation, modal and lifecycle

Finish the reusable runtime before adding durable applet data.

```text
Complete MVP-03 after its observation/effects component is verified. Read all five current plans and follow the HN continuation guide's working rules.

1. Finish route/lifecycle tracking, typed bound sources.open/pages.open and URL validation. Preserve exact HN injection origins and ordinary external publisher browsing. HN needs no content-blocking or dynamic query-value deny rules.
2. Implement the one-modal lifecycle, accessible focus handling, native modal state and 300 ms Back dismissal timeout. Preserve native recovery and existing fullscreen handling without adding media acceptance requirements.
3. Complete BFCache/resume/Activity rebinding and stale callback/reply rejection. Verify explicit source-ID selection structurally without shipping another applet or concurrent views.
4. Verify all MVP-03 lifecycle cases, including route changes during pending work, Back/Forward, background/resume, repeated host removal, creator exceptions and renderer nonresponse.
5. Run required checks, commit by component and save the stage results. Mark MVP-03 verified only when its full acceptance passes. Stop before storage.
```

## 4. MVP-04 generic durable storage

This supplies persistence for HN without website account access.

```text
Implement MVP-04 only after MVP-03 is verified. Read all five current plans and follow the HN continuation guide's working rules.

1. Add the private SQLite namespace/document schema and one native database worker with a bounded 64-job queue and generation-safe main-thread completions.
2. Implement get/list/commit, payload limits, CAS checks, full rollback, fresh namespace revisions, typed errors and storage.changed notifications. Derive profile/applet identity from the verified host binding; keep SQL independent of HN fields and categories.
3. Expose thin SDK storage calls to both source and local-page contexts through the existing loader/transitions. Preserve browser data and all other applet namespaces.
4. Verify CRUD/pagination, stale CAS conflicts, atomic rollback, deletion/recreation revisions, queue/message limits, retired-context replies, process restart, install-as-update and offline local-page reopening. Acknowledge writes only after commit; reread uncertain writes rather than retrying automatically.
5. Run required checks, commit verified components and save acceptance evidence. Stop before applet-specific extraction or Save controls.
```

## 5. MVP-05 HN extraction and story Save

Implement the first end-to-end feature using public pages and the verified storage layer.

```text
Implement MVP-05 only after MVP-04 is verified. Read all five current plans and follow the HN continuation guide's working rules.

1. Qualify story and immediately associated metadata rows on public home/news, newest, Ask, Show, pagination and item discussion pages. Implement item-url.ts and extract-item.ts in the HN applet, separating submission rows from comments and jobs.
2. Use opaque positive decimal item IDs and canonical HN discussion URLs. Capture bounded title, optional submitter and optional safe article URL; never guess identity from a nested comment or publisher URL.
3. Implement validated BookmarkV1 records and atomic bookmark/order-index save, explicit refresh/edit/remove and uncertain-write handling. Use the final categoryIds field, initially empty, so the next stage needs no destructive migration.
4. Add one owned plain-DOM Save control per supported story and one React save/edit dialog. Capture immutable identity, clean up changed/replaced rows, update duplicate story instances and preserve original HN links/actions.
5. Verify real public-page saves, external-link/self-post cases, list/detail identity, ambiguous/missing metadata, cancellation, conflicts, failure states and no account action. Run checks, commit by component and save MVP-05 evidence. Stop before category management and the complete library UI.
```

## 6. MVP-06 categories and offline library

This stage passed emulator acceptance. The prompt below records its scope; do not repeat completed implementation.

```text
Implement MVP-06 only after MVP-05 is verified. Read all five current plans and follow the HN continuation guide's working rules.

1. Implement category normalization, reserved names, the 50-active-category limit, CAS uniqueness, rename and tombstone deletion in applet TypeScript. Deleting a category preserves bookmarks.
2. Extend the one React save/edit dialog for zero/one/multiple categories and explicit independently committed category creation. Preserve selections on errors and handle stale edits honestly.
3. Complete the packaged React library with All/Uncategorized/category filters, progress/cancellation, correct consumed-key pagination, Edit/Remove and Open discussion through sources.open.
4. Add manifest-driven library access from the native launcher as well as the source menu. It must open offline without first loading HN. Keep the host generic and the website-specific UI/data under the HN applet.
5. Verify the complete category/library matrix, sparse pagination, notifications, offline reopen, restart, install-as-update and correct source return. Explain local storage scope in the UI. Run checks, commit components and save results. Stop before final integration.
```

## 7. MVP-07 integration and prototype handoff

Finish emulator integration, then repeat qualification on physical hardware before release. On 29 October the user requested finishing emulator checks while keeping release blocked on hardware.

```text
Complete MVP-07 only after all earlier required stage gates pass. Read all five current plans and follow the HN continuation guide's working rules.

1. On a named physical Android device, alternate HN and the library, use the library offline from the launcher, return to discussions, paginate, rotate, background/resume and recover from creator/renderer failure. Install an updated APK over populated data without uninstalling.
2. Measure the delivery plan's 100-observation runtime/UI latency, 100-save persistence latency, 500-bookmark library cases, memory and 20/20 controlled recovery threshold. Report network time separately and avoid claims about painted frames without measurements.
3. Fix observed integration defects in the selected architecture. Verify original HN navigation remains usable and the single-view resource budget is respected. Preserve the inactive applets and data.
4. Run the complete relevant verification, commit fixes by component and save a final dated report with exact tool/provider/device versions, APK path, commands/results, supported HN routes, persistence semantics, performance and gate status. Update setup instructions.
5. Declare the prototype ready only when every required gate passes. Authentication, HN account actions, comment bookmarking, media playback and the retired applet features are outside scope. Do not deploy or add extra features.
```
