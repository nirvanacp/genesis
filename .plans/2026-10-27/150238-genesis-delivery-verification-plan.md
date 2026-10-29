# Genesis delivery and verification plan

Architecture revision approved 28 October: all browser customization and the managed DOM runtime use TypeScript/JavaScript under `packages/sdk/` and `applets/`, with React for custom dialogs and local pages. Native Rust retains the controller, contracts and SQLite services. HN refuses Wasm compilation in its source realm, as recorded in the [historical qualification report](../../.reports/2026-10-28/162112-genesis-hn-wasm-qualification-report.md). The TS runtime passed [MVP-02 emulator qualification](../../.reports/2026-10-28/174427-genesis-hn-typescript-qualification-report.md); MVP-03 passed emulator verification. MVP-04 storage passed [Android emulator verification](../../.reports/2026-10-28/183914-genesis-mvp04-android-storage-verification-report.md); MVP-05 passed [Android Save verification](../../.reports/2026-10-29/095635-genesis-mvp05-android-save-verification-report.md); MVP-06 may proceed. Physical hardware remains required before release in MVP-07.

Created 27 October 2026, Asia/Kolkata. Scope: the single Hacker News bookmarking prototype in the [Genesis MVP implementation plan](150238-genesis-mvp-implementation-plan.md). MVP-01 is verified on the emulator. MVP-02 implementation is present; TS source qualification passed on the emulator; later stages remain pending. Numerical gates require actual evidence, not inferred success.

## 1. Execution rules

Implement one stage at a time and verify it before expanding scope. Do not create placeholder implementations of later stages just to make their interfaces look complete. Keep errors explicit and preserve unrelated work in the repository.

At the start of each implementation session, read root/nested AGENTS instructions, git status, the current stage, and the relevant companion plan. Do not move or rewrite the existing research collection. Commit verified component changes using the repository's prescribed commit format and configured author email. Do not commit unrelated work.

Do not create or modify automated test files without the user's explicit request for test coverage. Existing tests, compilation, linting, package validation and manual/device verification are allowed. If automated coverage is later authorized, prioritize source/document identity, CAS storage and virtualized-node cases. Do not silently create a separate test project as part of this plan.

For each stage, record `pending`, `in_progress`, `blocked` or `verified`, with files changed, commands and actual outcomes. Record explicitly postponed checks as `deferred`. A deferred check is not passed, but does not block completion of the remaining required stage gates. Authentication/session-retention experiments are outside this public HN prototype; do not request them as stage prerequisites. Independent physical-device or provider failures remain unverified. Keep implementation notes in a correctly timestamped document under `.reports/` when a saved delivery report is requested; otherwise provide the status in the implementation response.

## 2. MVP-01: Android Studio and reproducible builds

Status: verified on the emulator; retain the existing build. [Recorded evidence](../../.docs/2026-10-27/161510-genesis-android-setup.md).

Dependencies: none.

Create the three Cargo packages, npm workspace manifests, toolchain pins and `android/` Gradle project. Build only the generic native launcher and a basic WebView at this stage. Implement the Node build script incrementally, with actual native artifacts and compiled TS bundles; do not check in fake binaries. The original Wasm build was completed in MVP-01 and is now inactive.

Files are the root workspace manifests, `tools/build.mjs`, `android/` build files, the four Java adapter classes, and initial native/controller modules. The SDK/app entries may be minimal compilation entries until the next stage, explicitly labeled incomplete.

Required commands and results:

- Root `npm ci` resolves the pinned npm graph; subsequent builds preserve its lock.
- `cargo check -p genesis-contracts --locked` passes on the host.
- The active TS runtime bundles without Wasm compilation or dynamic code evaluation.
- The selected cargo-ndk build produces both ABI libraries from the Rust host.
- From `android/`, `./gradlew :app:assembleDebug :app:lintDebug` passes.
- Android Studio sync finishes without running npm/Rust compilation, and Run installs/starts the app after setup.

Verify generated assets and ABI libraries are inside the APK. Verify a second unchanged build is incremental, while changing an applet entry regenerates assets. Record selected JDK, SDK, NDK, Rust and Node paths. The original Wasm build is historical MVP-01 evidence. Document setup in a generated `.docs/<date>/<time>-genesis-android-setup.md` when preparing the implementation handoff.

Exit: launcher and ordinary browsing run on an emulator or device, native Back/Reload/Home respond, and the native library is genuinely executing. This does not yet pass applet functionality.

## 3. MVP-02: Prove the public Hacker News browser contract

Dependencies: MVP-01. Status: verified on the supported emulator, with [HN evidence](../../.reports/2026-10-28/174427-genesis-hn-typescript-qualification-report.md). Earlier YouTube/X evidence is historical and must not be relabeled HN success.

Bundle only `hn-bookmarks` with source `primary`, its qualification inspector and packaged React library page. Preserve earlier applet source directories but omit their packages from the generated index. Reuse isolated-world registration, nonce challenge, bundled TypeScript runtime, managed style/mount, native cover and source/page identities.

| Experiment | Pass criterion |
| --- | --- |
| Public HN page | Original home/news, newest, Ask/Show and top-level item discussion load without sign-in |
| Navigate/reload | 20/20 fresh-document cycles on the HN source reach ready and reject stale bindings |
| TS runtime/creator/CSS/mount | Each succeeds separately under actual isolated-realm policy |
| Packaged local page | Activates fully from APK assets without a development server |
| External title link and Back | Ordinary publisher browsing has no source bridge; returning to HN establishes its valid binding |
| Unsupported provider | Explicit native unsupported state with usable ordinary-site recovery and no false ready |
| Creator/renderer failure | Scope retires; native disable/retry or ordinary recovery remains usable |

On 28 October the user authorized completing this stage on a supported emulator and proceeding to MVP-03 through MVP-06. Record device/ABI/provider/locale and actual HN variant. Repeat the real-site qualification on physical hardware before MVP-07 can declare release readiness; emulator evidence alone does not satisfy that final requirement. Inspect story versus comment targets through the debug-only structural inspector; no credentials or page-text dumps.

Stop if required world/navigation APIs are missing or isolated startup fails. The earlier provider lacked `JS_INJECTION_IN_FRAME_AND_WORLD` and `NAVIGATION_LISTENER`; the current provider supports them, and the approved TypeScript runtime must now pass source-realm qualification. Do not fall back to page-world injection, a different engine or static HTML to call this gate passed. Login and media are outside the revised prototype and are not MVP-02 gates. Do not start MVP-03 until required HN qualification passes.

## 4. MVP-03: Implement the reusable runtime and SDK

Dependencies: MVP-02. Status: verified on the supported emulator. See the [MVP-03 report](../../.reports/2026-10-28/180813-genesis-mvp03-managed-runtime-report.md).

Complete `genesis-contracts` and the TypeScript managed targets, observation, effects, scopes and route tracking in `packages/sdk/`. Implement `watchElements`, styles, mounting, modal lifecycle, source/page navigation and generic navigation policy. Add native recovery and stale-callback rejection.

Retain the existing manifest parser, generated index and checks in `tools/check-packages.mjs`; complete generic source/page navigation validation where needed. HN declares no deny rules; dynamic query-value policies are outside this prototype. Paths, entries, origins, capabilities, references and duplicate IDs already have validation. Keep the working root type/package commands and nonce/generation protections.

Verification scenarios: target absent then present; target replaced; one element reused for a different content key; duplicate mount attempt; route change during a pending callback; callback from a destroyed view; Back/Forward/BFCache; app background/resume; Activity recreation; creator exception; repeated host removal; and deliberate renderer nonresponse with native recovery.

Exit: zero duplicate owned roots in repeated activation, zero stale handles accepted, and no unbounded remount loop. After disposal, diagnostic counts show no retained managed effects or DOM handles for that scope. Unmanaged creator resources are outside that count and must not be mislabeled as tracked.

Validate two-source manifest structure with package validation and route source selection by explicit ID. Sequential source switching must work at the controller level without a global website singleton. Do not claim simultaneous multi-source rendering.

## 5. MVP-04: Durable generic storage and local pages

Dependencies: MVP-03. Status: verified on the supported emulator. See the [Android storage report](../../.reports/2026-10-28/183914-genesis-mvp04-android-storage-verification-report.md).

Implement SQLite schema initialization, generic get/list/commit, bounded worker queue, typed errors and storage notifications. Reuse the MVP-02 WebViewAssetLoader mapping and source/page transitions; expose generic storage to their bound contexts. Do not build a second local-page loader.

Implement JSON validation and all CAS checks before applying writes. Use a transaction for each commit batch. Keep namespace identity host-derived. Do not add HN tables, SQL field names or native category actions.

Verification scenarios: put/get/list/delete; CAS conflict; failed batch leaves no partial writes; deletion/recreation gets a fresh revision; payload/queue limit; document closes before reply; app process ends after a committed write; APK update; and offline local page reopening.

Exit: persisted data survives app restart and reinstall-as-update, old replies cannot reach a new document, and failed transactions do not acknowledge success. Uninstall/app-data clearing are destructive and outside persistence guarantees. Do not use uninstall as a routine build/deploy step once real data exists.

## 6. MVP-05: Hacker News extraction and story Save

Dependencies: verified MVP-04, which includes the shared runtime. Status: verified on the supported emulator. This revised stage replaces the retired filtering stage.

Implement `item-url.ts`, qualified story/metadata targets, immutable extraction and the bookmark/order repository in `applets/news.ycombinator.com/`. Add plain-DOM owned Save controls and one React dialog. Start with uncategorized saving; MVP-06 adds category management/library filters. Keep the final record schema from the [HN applet plan](150238-genesis-hacker-news-applet-plan.md) so no destructive migration is needed.

Verify external-link stories and self-posts on home/news, newest, Ask, Show, pagination and item discussion pages. Exclude comment rows, jobs and ambiguous identities. Verify list/detail duplicate saves, missing metadata, replaced/reused nodes, cancellation, edit/remove, stale CAS conflicts and uncertain writes. Original title/comment/vote/favorite controls remain intact and no account action is invoked.

Exit: real public HN pages save/edit/remove correct story records durably without login; duplicate controls/identities are absent; failed writes show no false success. Do not use synthetic records as proof of real extraction.

## 7. MVP-06: Categories and offline bookmark library

Dependencies: verified MVP-05 and its generic storage/runtime prerequisites.

Implement category algorithms, the save dialog's category selection, React library and native manifest-driven launcher library access. Reuse the existing local-page loader and navigation contract. No source page or network connection is required to open saved metadata.

| Scenario | Required result |
| --- | --- |
| Zero/one/multiple categories | Correct All/Uncategorized/category membership |
| Reserved or duplicate normalized name | Clear conflict; no duplicate index |
| Rename category | Existing memberships retained |
| Delete a category | Bookmarks retained; no remaining active categories means Uncategorized |
| Stale dialog or uncertain commit | CAS conflict/reread; no silent lost update or false success |
| Cancel bookmark edit | No membership change; explicit category creation remains independently committed |
| Sparse category pagination | Correct next cursor, no skipped/duplicated items; progress/cancellation |
| Source and library state | Save/edit/remove updates consistent views through notifications |
| Offline launcher/menu entry | Library opens without first loading HN and shows local records |
| Open discussion | Returns to the correct HN item and valid source context |
| Restart/install-as-update | Saved data retained; no credentials/account identity required |

Exit: save, categorize, manage, browse, remove and Open discussion work together on the named device. The library explains that storage is local to Genesis. Authentication and media tests are outside scope.

## 8. MVP-07: Integration, device quality and handoff

Dependencies: all earlier stages.

Alternate HN source and library; open the library from the launcher while offline; return to the source; rotate; background/resume; recover from creator failure; and install an updated APK over a populated database. Ensure applet settings and saved data do not leak between namespaces.

Proposed performance checks on the named physical device:

| Check | Definition and threshold |
| --- | --- |
| Managed update latency | Foreground source mutation to corresponding DOM effect, p95 <=100 ms over 100 observations |
| UI response | Save dialog/category selection to displayed response, p95 <=100 ms excluding durable-save acknowledgement |
| Managed runtime batch | p95 <=4 ms; report worst cases and total website/frame cost separately |
| Local save | Submit to acknowledged SQLite commit, p95 <=250 ms for normal records over 100 operations |
| Unfiltered library first page | First 20 entries from 500 saved HN bookmarks, target <=1 s on warm storage |
| Filtered library | Report scanned records and duration; no constant-time promise for rare categories |
| Recovery | Native disable to usable ordinary page on a controlled local route, <=5 s in 20/20 runs |

Use one monotonic clock per measured interval. Do not call a DOM update acknowledgement a measured painted frame. If a threshold fails, profile and fix the observed bottleneck before changing the architecture. Report network time separately from local runtime cost.

Measure process memory for ordinary HN browsing, HN with Save controls and the populated local library, counting shared renderer memory once. Report supported source budget as one live view. Do not extrapolate a safe multi-tab count without measurement.

Run formatting/type/package/Android lint/build checks appropriate to the changed files. At minimum:

```text
# repository root
npm run typecheck
npm run check:packages
cargo fmt --all -- --check
cargo check -p genesis-contracts --locked
cargo clippy -p genesis-android --locked -- -D warnings

# android/
./gradlew :app:assembleDebug :app:lintDebug
```

The build performs native cross-compilation. Add target-specific clippy execution when its toolchain is installed; do not use an unsupported host-wide Cargo command as a substitute for Android validation. Run any existing tests relevant to the changes. No new test files are authorized by this plan.

Final handoff must include the setup guide, actual build commands, exact tool/provider versions, supported routes, remaining limitations, data persistence semantics, and the status of every acceptance gate. Generated setup/verification documents follow the repository's dated `.docs`/`.reports` rules. Link the setup guide from an appropriate entry point without rewriting unrelated research.

## 9. Continuation and historical evidence

Use the [HN continuation guide](../../.docs/2026-10-27/200113-genesis-hacker-news-mvp-guide.md) for ordered prompts. Apply the [browser/session contract](150238-genesis-mvp-implementation-plan.md#9-browser-and-session-contract). Login is outside the prototype; public HN feature evidence and physical-device isolation/recovery remain required.

The [earlier MVP-02 report](../../.reports/2026-10-27/182114-genesis-mvp02-qualification-report.md) records the last provider flags and prior-site results. Preserve those observations without transferring their pass status to HN. The [HN retargeting report](../../.reports/2026-10-27/200924-genesis-hacker-news-retargeting-report.md) records code/build/launcher checks separately. Missing provider APIs still stop progression to MVP-03.
