# Genesis delivery and verification plan

Created 27 October 2026, Asia/Kolkata. Scope: execution of the [Genesis MVP implementation plan](150238-genesis-mvp-implementation-plan.md). MVP-01 is verified on the emulator. MVP-02 implementation is present, but qualification is blocked on missing provider APIs; later stages remain pending. Numerical gates require actual evidence, not inferred success.

## 1. Execution rules

Implement one stage at a time and verify it before expanding scope. Do not create placeholder implementations of later stages just to make their interfaces look complete. Keep errors explicit and preserve unrelated work in the repository.

At the start of each implementation session, read root/nested AGENTS instructions, git status, the current stage, and the relevant companion plan. Do not move or rewrite the existing research collection. No commit is requested by this planning task. A later implement-and-commit request must follow the repository's prescribed commit format and author settings.

Do not create or modify automated test files without the user's explicit request for test coverage. Existing tests, compilation, linting, package validation and manual/device verification are allowed. If automated coverage is later authorized, prioritize source/document identity, CAS storage and virtualized-node cases. Do not silently create a separate test project as part of this plan.

For each stage, record `pending`, `in_progress`, `blocked` or `verified`, with files changed, commands and actual outcomes. Record explicitly postponed checks as `deferred`. A deferred check is not passed, but does not block completion of the remaining required stage gates. Dedicated authentication and session-retention verification is deferred by the user; do not treat lack of a login experiment as a stage blocker. Independent physical-device or provider failures remain unverified. Keep implementation notes in a correctly timestamped document under `.reports/` when a saved delivery report is requested; otherwise provide the status in the implementation response.

## 2. MVP-01: Android Studio and reproducible builds

Dependencies: none.

Create the three Cargo packages, npm workspace manifests, toolchain pins and `android/` Gradle project. Build only the generic native launcher and a basic WebView at this stage. Implement the Node build script incrementally, with actual native and Wasm artifacts; do not check in fake `.so` or `.wasm` files.

Files are the root workspace manifests, `tools/build.mjs`, `android/` build files, the four Java adapter classes, and initial native/controller modules. The SDK/app entries may be minimal compilation entries until the next stage, explicitly labeled incomplete.

Required commands and results:

- Root `npm ci` resolves the pinned npm graph; subsequent builds preserve its lock.
- `cargo check -p genesis-contracts` passes on the host.
- `cargo check -p genesis-page-runtime --target wasm32-unknown-unknown` passes.
- The selected cargo-ndk build produces both ABI libraries from the Rust host.
- From `android/`, `./gradlew :app:assembleDebug :app:lintDebug` passes.
- Android Studio sync finishes without running npm/Rust compilation, and Run installs/starts the app after setup.

Verify generated assets and ABI libraries are inside the APK. Verify a second unchanged build is incremental, while changing an applet entry regenerates assets. Record selected JDK, SDK, NDK, Rust, wasm-bindgen and Node paths. Document setup in a generated `.docs/<date>/<time>-genesis-android-setup.md` when preparing the implementation handoff.

Exit: launcher and ordinary browsing run on an emulator or device, native Back/Reload/Home respond, and the native library is genuinely executing. This does not yet pass applet functionality.

## 3. MVP-02: Prove the real browser contract

Dependencies: MVP-01.

Implement isolated-world registration, the nonce challenge handshake, embedded-Wasm loading, one managed style, one owned mount and native loading/error presentation. Implement source/page identities before exposing storage.

Inspect the chosen real YouTube and X variants using the actual app browser. Add a debug-only inspector that can report selected markup, URL, feature flags and package/runtime status; do not depend on it for production execution. If CDP is used during development, repeat the workflow with debugging disabled.

Required evidence:

| Experiment | Pass criterion |
| --- | --- |
| Navigate/reload supported source | 20/20 cycles bind only the current document and reach ready |
| Wasm/creator/CSS loading | Each succeeds separately under the actual realm policy |
| Local applet page | Loads fully from packaged assets without a development server |
| X authentication | Deferred by the user. Normal browser-managed login is the selected behavior; dedicated sign-in/session-retention verification is not a current stage gate. |
| YouTube playback | Original normal-video playback and fullscreen work before customization |
| Unsupported provider | Native unsupported state, no crash or false active status |

Use one physical Android device for the real-site result. Record Android version, ABI, provider package/version, locale, sign-in state and relevant page variant. Do not collect credentials in logs or fixtures.

The selected website selectors are discovered here and belong in the applets' target modules. Do not freeze guessed selectors as a public API.

Stop conditions: isolated-world startup fails on the intended provider or ordinary YouTube playback fails. Dedicated authentication verification is deferred by the user and is not a stop condition for this work. Report the exact failure before implementing the applet feature layers. Do not replace X with static saved HTML or YouTube with an unrelated embedded player. A GeckoView experiment requires a deliberate plan revision, not an automatic architectural substitution by the implementing model.

## 4. MVP-03: Implement the reusable runtime and SDK

Dependencies: MVP-02.

Complete `genesis-contracts`, Rust `targets`, `observations`, `effects`, `scopes` and route tracking modules, plus the thin SDK facade. Implement `watchElements`, styles, mounting, modal lifecycle, source/page navigation and generic navigation policy. Add native recovery and stale-callback rejection.

Implement the manifest parser and generated package index in `tools/check-packages.mjs`. Validate paths, entries, origins, capabilities, action/page references and duplicate source IDs. Make root `npm run typecheck` and `npm run check:packages` real commands.

Verification scenarios: target absent then present; target replaced; one element reused for a different content key; duplicate mount attempt; route change during a pending callback; callback from a destroyed view; Back/Forward/BFCache; app background/resume; Activity recreation; creator exception; repeated host removal; and deliberate renderer nonresponse with native recovery.

Exit: zero duplicate owned roots in repeated activation, zero stale handles accepted, and no unbounded remount loop. After disposal, diagnostic counts show no retained managed effects or DOM handles for that scope. Unmanaged creator resources are outside that count and must not be mislabeled as tracked.

Validate two-source manifest structure with package validation and route source selection by explicit ID. Sequential source switching must work at the controller level without a global website singleton. Do not claim simultaneous multi-source rendering.

## 5. MVP-04: Durable generic storage and local pages

Dependencies: MVP-03.

Implement SQLite schema initialization, generic get/list/commit, bounded worker queue, typed errors and storage notifications. Add applet-owned page loading through WebViewAssetLoader and the single-view source/page transition contract.

Implement JSON validation and all CAS checks before applying writes. Use a transaction for each commit batch. Keep namespace identity host-derived. Do not add X tables, SQL field names or native category actions.

Verification scenarios: put/get/list/delete; CAS conflict; failed batch leaves no partial writes; deletion/recreation gets a fresh revision; payload/queue limit; document closes before reply; app process ends after a committed write; APK update; and offline local page reopening.

Exit: persisted data survives app restart and reinstall-as-update, old replies cannot reach a new document, and failed transactions do not acknowledge success. Uninstall/app-data clearing are destructive and outside persistence guarantees. Do not use uninstall as a routine build/deploy step once real data exists.

## 6. MVP-05: YouTube Shorts blocking

Dependencies: MVP-03, with the platform gate already passed. It can be completed before X storage UI work, but verify the shared runtime first.

Implement `applets/youtube.com/` exactly as the [applet plan](150238-genesis-youtube-x-applets-plan.md) specifies. Register URL policies from the manifest, managed styles and positive classifications. Add reasons to diagnostics for each hidden card and blocked route.

Run the full surface/navigation matrix: home, search, subscriptions, channel Shorts tab, bottom/side navigation, direct URL, redirect, SPA transition, browser history, delayed insertion and virtualized reuse. Verify a normal video with a Shorts link in its description remains visible. Verify a known Short ID through a normal watch URL is blocked while that ID remains in the active deny set.

Exit: no supported Shorts route remains playable, identifiable Shorts surfaces are suppressed after content updates, and ordinary player controls still work. Record transient flashes or audio separately. No blanket "all Shorts everywhere" claim is permitted from link hiding alone.

When a page variant is unsupported, record it and show degraded status. Do not hide the whole feed to improve the apparent blocking rate.

## 7. MVP-06: X independent categorized bookmarks

Dependencies: MVP-04 and the non-deferred platform gates from MVP-02. X uses the user's ordinary browser session when available; dedicated authentication qualification is not a prerequisite.

Implement primary-post extraction, plain-DOM feed Save controls, one React save dialog, the applet repository/category algorithms and the React library page. Keep bookmark ordering and category-name indexes in generic applet storage.

Acceptance matrix:

| Scenario | Required result |
| --- | --- |
| Save normal or media-only post | Correct primary post ID and canonical URL |
| Save post containing a quote | Saves the selected outer post, not the quote |
| Recycled timeline element | New control identity; no stale metadata written |
| Save with no categories | Appears in All and Uncategorized |
| Save with several categories | Appears under each selected active category |
| Duplicate category name | Clear conflict; no duplicate normalized entry |
| Rename category | Existing memberships retained |
| Delete last category of a bookmark | Bookmark remains and appears in Uncategorized |
| Edit in a stale dialog | CAS conflict with reload/retry, no silent lost update |
| Cancel dialog | No bookmark/category membership change |
| Write failure/timeout | No false success; reread resolves uncertain commit |
| Offline library and app restart | Saved data remains usable |
| X account switch | Local library retained with explicit profile scope |
| Existing X bookmark control | X's original behavior/state remains independent |

Exit: the user can complete save, categorize, browse, edit, delete-category and open-original flows without the development laptop. Do not count a working local library as proof of feed extraction. Record any unobserved feed feature cases separately. Dedicated sign-in and session-retention verification remains deferred by the user and does not become an account gate for implementation.

## 8. MVP-07: Integration, device quality and handoff

Dependencies: all earlier stages.

Run both applets in alternation; open the X library while offline; return to the source; rotate; background/resume; recover from creator failure; and install an updated APK over a populated database. Ensure applet settings and saved data do not leak between namespaces.

Proposed performance checks on the named physical device:

| Check | Definition and threshold |
| --- | --- |
| Managed update latency | Foreground source mutation to corresponding DOM effect, p95 <=100 ms over 100 observations |
| UI response | Save dialog/category selection to displayed response, p95 <=100 ms excluding durable-save acknowledgement |
| Managed runtime batch | p95 <=4 ms; report worst cases and total website/frame cost separately |
| Local save | Submit to acknowledged SQLite commit, p95 <=250 ms for normal records over 100 operations |
| Unfiltered library first page | First 20 entries from 500 saved bookmarks, target <=1 s on warm storage |
| Filtered library | Report scanned records and duration; no constant-time promise for rare categories |
| Recovery | Native disable to usable ordinary page on a controlled local route, <=5 s in 20/20 runs |

Use one monotonic clock per measured interval. Do not call a DOM update acknowledgement a measured painted frame. If a threshold fails, profile and fix the observed bottleneck before changing the architecture. Report network time separately from local runtime cost.

Measure process memory for ordinary browsing, YouTube customization and X with populated bookmarks, counting shared renderer memory once. Report supported source budget as one live view. Do not extrapolate a safe multi-tab count without measurement.

Run formatting/type/package/Android lint/build checks appropriate to the changed files. At minimum:

```text
# repository root
npm run typecheck
npm run check:packages
cargo fmt --all -- --check
cargo check -p genesis-contracts
cargo check -p genesis-page-runtime --target wasm32-unknown-unknown

# android/
./gradlew :app:assembleDebug :app:lintDebug
```

The build performs native cross-compilation. Add target-specific clippy execution when its toolchain is installed; do not use an unsupported host-wide Cargo command as a substitute for Android validation. Run any existing tests relevant to the changes. No new test files are authorized by this plan.

Final handoff must include the setup guide, actual build commands, exact tool/provider versions, supported routes, remaining limitations, data persistence semantics, and the status of every acceptance gate. Generated setup/verification documents follow the repository's dated `.docs`/`.reports` rules. Link the setup guide from an appropriate entry point without rewriting unrelated research.

## 9. Implementing-model handoff prompt

> Implement the next unverified stage of the Genesis MVP plan. Read the root AGENTS.md and the five plan documents in this set first. Keep Android code under android/, site customization under applets/, and generic Rust page/runtime contracts in crates/. Follow the specified APIs and data model. Do not change engines, rendering architecture, storage model or creator language to get around a failed gate. Preserve unrelated changes. Do not create automated test files without an explicit request for coverage. Run the prescribed checks, distinguish passed checks from unavailable device checks and user-deferred authentication checks, and report the next stage only after the current stage's acceptance conditions are met.

Use this as a bounded implementation instruction, not a request to scaffold every remaining stage in one unverified change.

## Account and device qualification clarification

Implementation uses browser-managed sessions with user-owned existing website accounts. There is no shared account and no request for the user to send login credentials, cookies or tokens. The user enters credentials privately in Genesis's original website WebView. The persistent WebView profile is independent of Chrome; Chrome sign-in is not evidence of Genesis sign-in.

MVP-02 implementation and emulator qualification may proceed without a connected physical device. The user has explicitly deferred dedicated X sign-in and session-retention verification. Treat authentication as ordinary browser-managed behavior, record that verification as deferred, and do not request a sign-in or device connection for it. Its deferral does not block current implementation or stage progression and does not imply a successful authentication experiment. A physical device is still required for the physical real-site release result. Emulator results must be labeled emulator results. Do not repeatedly request a device merely to implement the browser layer.

If the user later reopens authentication verification, check session retention after their private sign-in by reloading, returning Home and reopening the source, restarting the app and installing an update without uninstalling. Do not promise perpetual sign-in: websites can expire or revoke sessions. Record these checks independently from initial authentication and from Genesis applet-data persistence. Continue no further than MVP-02 while its non-deferred platform qualification gates remain pending. Authentication verification does not contribute to that stop condition while deferred.

## Current MVP-02 evidence

See [182114-genesis-mvp02-qualification-report.md](../../.reports/2026-10-27/182114-genesis-mvp02-qualification-report.md) for the provider flags, passed emulator checks and remaining gates. The actual provider lacks isolated-world injection and navigation-listener support. MVP-02 remains blocked, so MVP-03 must not start.
