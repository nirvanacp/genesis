# Genesis two complete applets improvement plan

Project: Genesis Android platform, `factory/applets/news.ycombinator.com` and `factory/applets/x.com`. Phase: `phase-4`, branch `proto/phase-4`. Created 30 October 2026, Asia/Kolkata. This is the controlling product and implementation plan following the user's clarification. This task changes documentation only.

## Product contract and precedence

Genesis must present exactly two everyday applications in this delivery: **Hacker News** and **X**. Each opens a complete application built over its website. X must provide a cohesive native-client experience with additional categorical bookmarking. A library screen, a source browser view, an external reader and a backend are internal parts of that application. None is an additional launcher app. The platform remains capable of hosting other applets in other deployments; do not hard-code these two brands into Android or Rust.

Keep existing identities `hn-bookmarks` and `x-bookmarks`. Their names do not limit their product scope to bookmarking. Preserve website sessions, local records, service connections and both backends. Do not create a new X ID to fix navigation or branding. Multiple source contexts within the X manifest are permitted implementation details, just as HN already has several source contexts.

The user reports HN works well. Treat its current functionality as the regression baseline, with restrained UI polish. X is the main implementation gap. Native-client quality means complete connected everyday flows, readable content, responsive controls, predictable Back, preserved reading position and purposeful motion. It is not satisfied by a screenshot of a category page or a build pass. Exact parity with native-only facilities cannot be asserted without evidence. Calls, background push, passkeys or other unavailable capabilities must be named and separately scoped; their absence must not silently reduce the agreed daily app experience to a bookmark demo.

This plan supersedes product framing, execution order and completion criteria in the three `195728-*` plans. Retain their compatible technical details: route boundary protections, stable identity, backend schemas, idempotent operations, security boundaries and data bounds. The category backend plan remains the detailed data contract. Previous verification reports and changelogs remain factual historical evidence, not current completion approval.

## Evidence from the current implementation

| Current fact | Required correction |
| --- | --- |
| `genesis.packages.json` includes HN only. X is debug-installed. | Deliver one selected HN package and one selected X package after real acceptance. An intermediate state must not become the final product. |
| Android Studio previously showed HN, External reader, Hybrid isolation, Hybrid reader, X and X UI preview. | Keep technical verification packages out of the everyday launcher. Preserve their data when hiding them. |
| `PackageStore.load()` merges bundled and debug packages; `HostState::launcher()` renders all effective packages. | Add generic developer package visibility, independent of bundle integrity and user data. |
| X already has one manifest ID, five section contexts and one packaged `library` page. | Integrate and qualify these as one application; do not merge them into one WebView merely to obtain one launcher entry. |
| `source.css` hides navigation as soon as `genesis-x` is set; `sourceNavigation()` may then return early if account or primary-column anchors are missing. | Hide source navigation only after equivalent owned navigation is ready. Restore source controls on adapter failure. |
| X source errors target `x-navigation-status`, but the inspected navigation module does not mount that node. | Supply a visible, accessible error/status region for navigation and account-verification failures. |
| Messages, settings and authentication are ordinary source routes. | Keep these within the same X identity and return flow. Ordinary means no customization binding, not a separate app or an abandoned feature. |
| `HostViews.reveal()` uses a generic 180 ms fade/translation. | Qualify transitions by navigation intent, including SPA details, overlays and reader return. Do not call a generic reveal native-client parity. |
| X account verification can round-trip from the library to a source. | Present one coherent verification state; never flash stale private content or loop between pages. |
| File-picker selection was tried on a creator-owned input that was disposed during Activity suspension. | Repeat on a website-owned form. The previous attempt does not establish byte delivery. |
| X login was temporarily limited at the username step. | Resume real acceptance after access is available. Synthetic examples are developer diagnostics only. |

The current architecture and source were inspected, including `PackageStore.java`, `HostViews.java`, `BrowserAdapter.java`, `controller.rs`, shared contracts, CLI/device tooling, both manifests and the X navigation/account/library modules. No new live inspection of authenticated X or native X was performed for this revision. Route strings and source selectors in the earlier observation record are candidates requiring reconfirmation, not permanent website contracts.

## Desired application structure

```text
Genesis Apps
  Hacker News
    Home / Search / Post / Saved / Me
    Stories, comments, reply and account flows
    External article reader with return to the originating story
  X
    Home / Explore / Alerts / Saved / Me
    Timeline, search, profile, conversation and media
    Composer and Messages reachable from the same application
    Saved: X bookmarks / Categories
    Account, Lists, Communities, settings and sign-in
    External reader with return to the originating post
```

Keep the existing five X section IDs and destinations initially. Home preserves For you/Following and source composer behavior. Explore preserves search and result tabs. Alerts preserves All/Mentions. Saved contains both X bookmarks and Categories. Me provides the actual account identity, profile, Messages, Lists, Communities and settings. Keep Messages directly reachable from Home as well; do not require a separate launcher entry or developer menu. Post is an action, not another app. Every post detail retains the section from which it was opened.

Keep original X bookmarks and backend categories as two data authorities inside this single app. An ordinary bookmark uses X's original action and storage. Save to category uses the applet backend. Either or both may exist for one post. Removing the final category removes the backend record only; it does not create or remove an X bookmark. Keep both choices clearly labeled in Saved and retain the original source action handlers.

### Navigation behavior

| Trigger | Destination and Back behavior |
| --- | --- |
| Switch X section | Restore that section's current source/page, reading position and filter. Retained-view eviction may reload content but must not invent a new app identity. |
| Open profile, post, reply thread or topic | Internal X detail in the originating section. Back restores the exact opener, not Home unconditionally. |
| Open photo/video | Source media experience. Close/fullscreen Back returns to the post before leaving the section. |
| Compose/reply/quote | Source form retains recipient and draft controls. Back first invokes source draft/close handling. Native section/launcher changes honor the leave guard. |
| Open Messages/settings/auth | Same X app and cookie session; source owns sensitive forms. Use protected source presentation with clear Back and, for authentication, origin identity. Do not start a child reader just because customization is disabled. |
| Open external HTTP(S) link | Child reader with final origin, Close, Back and system-browser option. Close restores post and scroll. A recognized X return opens an internal route with the correct owner. |
| Open Categories | Same Saved section; loading/account verification appears in place. Query, category and scroll survive detail visits. |
| Adapter/backend failure | Restore usable source navigation or show a localized Categories error. Source browsing and ordinary bookmarking remain usable. |

Back priority remains SDK modal, fullscreen/source overlay, source transient, owned detail opener, source history, section/root handling, then Genesis launcher. Android system Back and visible Back must agree. Do not intercept source form POSTs as GET navigation. Test target-blank and t.co resolution as well as ordinary anchors. Never prefetch signed-in pages through an unofficial X API.

### Visual and motion specification

Use the project Apple design skill's general accessibility/layout/motion principles translated to Android, not iOS controls. Relevant references are `references/cross-platform.md` and `references/hig/{accessibility,layout,typography,color,tab-bars,motion,loading}.md` beneath `.skills/apple-design-skill/`. The motion reference calls for brief, cancellable feedback; the tab reference connects top-level navigation with preserved state. These principles guide the design; the following numbers are project design choices.

X keeps its continuous timeline, source media and typography. Owned UI uses the existing neutral theme tokens and system text. Keep comfortable Android targets of at least 48 dp natively and 48 CSS px for owned web controls, visible focus, and 4.5:1 normal-text contrast. Validate at 360, 412 and 840 CSS-pixel layouts and large system font settings. Category sheets remain bottom-aligned on compact displays and centered on wide displays. Keyboard resizing must keep the primary action reachable. Use one header owner and one section-navigation owner; don't stack source and native bars that perform the same job.

Keep source-managed SPA transitions when they work. Animate owned detail entry/return directionally over 180–240 ms; sheet opening/closing uses vertical movement over 180–220 ms. Restoring a retained tab should be immediate or use at most a short opacity transition, never a fake push animation. External reader entry and Close must communicate return to the opener. Avoid animating the entire scrolling timeline on ordinary mutations. Never delay interaction to complete an animation. Reduced motion removes translation and uses immediate state changes or brief opacity. Readiness gates still prevent exposing stale or unauthorized content; do not replace them with screenshot overlays of private pages.

HN keeps its existing warm palette, story density, feed selector, comment nesting and working source forms. Suggested polish: consistent 48 px Save/expand controls, sufficient spacing between vote/title/comment actions, title/body hierarchy with subdued readable metadata, consistent empty/error states, and reliable large-font wrapping. These are review targets based on source and previous visual evidence, not a new claim that HN is broken. Make a change only when a measured usability issue exists. Do not replace HN with X styling or rewrite its backend/search behavior under a UI-polish task.

## Ordered implementation and commits

### 1. Establish the real two-app baseline

Read root/factory instructions and this plan. Record installed IDs with `genesis-applet dev status`; distinguish bundle entries, debug overrides and synthetic packages. Capture an HN baseline covering Home, Search, Post draft, Saved and Me without submitting content. Open the existing `x-bookmarks` applet and record signed-out/authenticated state. Reconfirm current source DOM before changing selectors.

Use one development changelog per component. Do not save passwords, cookies, service tokens, private timelines or messages as fixtures/evidence. Do not clear app data or uninstall Genesis. Existing synthetic verification code is temporary and must not be copied into the actual X frontend. If X login remains blocked, complete platform/HN work and keep the X acceptance items pending.

Verification: root `npm run typecheck`, `npm run check:packages`, both applet CLI checks; preserve their initial result for comparison. This is a baseline step, not a commit that claims product completion.

### 2. Separate installed developer packages from everyday launcher entries

Files: `android/app/src/main/java/app/nirvana/genesis/PackageStore.java`, `packages/applet-tools/src/device.mjs`, `cli.mjs`, `crates/contracts/src/lib.rs`, `android/native/src/controller.rs` and relevant package-index validation in `packages.rs`. Update `factory/guides/verification.md` and CLI help when implemented.

Proposed generic debug contract, not currently available: `genesis-applet dev visibility <applet-id> --hidden true|false --device <serial> --json`. Add a debug-only, atomic private visibility map keyed by installed applet ID, separate from revision pointers. Absence means visible for compatibility. Import action carries `requestId`, `action:"visibility"`, `appletId`, `hidden` and `expectedCurrentRevision`. Reject unknown IDs, invalid booleans, revision conflicts and release-mode requests without changing state. Return a correlated receipt and include visibility in dev status. Treat a request timeout as uncertain and inspect status before retrying.

Expose hidden IDs as host-controlled optional metadata on the effective `PackageIndex`, default empty; do not modify hashed bundles or add a website-controllable manifest permission. Rust validates IDs against the effective installed set and filters only launcher construction. Installed assets, records, services and rollback remain intact. A startup restore pointing to a hidden developer app should open the launcher instead. Release builds ignore debug visibility and show the selected bundles. Host-side metadata must not imply a new applet SDK capability or claim support on old hosts; advertise support in device status and have new tooling fail clearly on incompatible hosts.

Read actual IDs from status before hiding the named verification packages, including X UI preview and the External/Hybrid examples. Do not infer IDs from labels or delete their databases. Leave HN and X visible. Diagnostic packages belong on a separate QA emulator where possible; adding one temporarily must include explicit cleanup/visibility restoration before handoff.

Acceptance: normal launcher displays exactly Hacker News and X; dev status still lists preserved hidden packages; restart and rollback do not reintroduce them. Verify visibility conflict, show/hide and release behavior with disposable data, without adding test files. Run Rust formatting/check/clippy and Android assemble/lint. Commit `feat/(launcher): separate developer applets from everyday apps`.

### 3. Complete X navigation and recovery as one app

Files: X `applet.json`, `src/main.tsx`, `source-navigation.ts`, `source.css`, `account.ts`, `library.tsx`, and existing `post-controls.ts` where lifecycle behavior needs correction. Keep all source IDs, `x-bookmarks`, `library` and `bookmarks` service stable. Do not add an applet per route or remove source contexts simply because there is one launcher icon.

Split source adaptation into explicit states: `detecting`, `ready`, `unsupported`, `retired`. While detecting, source controls remain usable. Mount replacements and the visible status region before applying narrowly scoped navigation-hide classes. When required anchors disappear, remove only classes/effects owned by that adaptation and expose source navigation. Reserve native shell layout without deleting upstream content. Do not hide the entire source banner on unrecognized signed-out or mobile layouts.

Make route-specific adapters responsible for Home actions, Explore, Alerts, Me, Saved and details. Factor focused helpers from `sourceNavigation()` where useful; use the existing managed watcher/disposer APIs. Rendering on account/focus changes must not duplicate bars or drop source forms. Mount the missing navigation status region and show recoverable errors there. Recheck async result identity/account before applying it.

In `HostViews.java`, `BrowserAdapter.java`, `MainActivity.java` and Rust navigation presentation, treat source-ordinary and external-reader cases distinctly. Sensitive X routes stay in the active app/session with source UI and return context. They receive no customization bridge. Ordinary source screens may replace the native section bar with their own navigation to avoid duplication; retain recognizable app return and origin context where needed. This is a generic presentation decision, with no X path matching in Java/Rust beyond manifest policy.

For account verification, retain the existing one-use ticket and backend handle check. Show one verification/loading state, allow recovery, preserve Saved preferences and reject obsolete tickets. Do not eliminate verification by trusting stored handles. Avoid repeated source/library oscillation; an expired ticket settles in an error state. Unrecognized identity must not expose prior rows.

Acceptance: walk every row of the navigation table using the same X launcher entry. Missing selectors reveal a usable source page. Backend disconnection affects Categories only. Saved retains selection through its source/page/detail loop. Run X typecheck, manifest check/bundle, and platform checks if changed. Commit applet changes as `feat/(x-navigation): unify the complete X experience`; commit necessary generic presentation fixes separately as `feat/(navigation): preserve app context on protected source pages`.

### 4. Finish integrated category bookmarking

Reuse the existing backend/store/client/operation contract from `195728-x-category-backend-plan.md`. Files: `post-controls.ts`, `extract-post.ts`, `domain.ts`, `components/category-sheet.tsx`, `category-filter.ts`, `category-manager.tsx`, `library.tsx`, `library.css`, `repository.ts`, `account.ts`. Change backend code only for reproduced contract failures.

Verify the actual source post action and actual configured service together. Cover quoted/reposted posts, replies, recycled rows, media-only posts and long excerpts. Native X bookmarking and category membership must remain independent. The sheet must show the selected post, load membership before editing, prevent stale/duplicate submissions, preserve entered category names on errors and explain final-category removal. Pending operations keep the same ID for retry/status; reopening after suspension rereads the receipt.

Saved has one title and an X bookmarks/Categories selector. Categories management stays inside this section. Validate whole-library search, category filters, pagination, empty state, rename, nonempty-delete refusal and detail return with actual disposable backend records. Cleanup only records created for qualification. No fake backend/account provider may enter the shipped bundle.

Acceptance: one real post can be represented in either authority with independent behavior, and category failure cannot break source bookmarking. Upstream mutations need explicit user-selected verification scope; browsing alone is not authority to post or message. Run X checks and disposable backend verification without permanent test files. Commit `feat/(x-bookmarks): finish integrated category workflows` for necessary fixes.

### 5. Verify source forms, attachments and mobile interactions

Files: generic `FileSelection.java`, Activity callbacks, `BrowserAdapter.java`, SDK `bootstrap.ts`/`runtime.ts`, X source guard/overlay handling. Diagnose failures before changes. SDK-owned controls may be disposed on suspension; a website-owned file input should survive opening the system picker unless its source document navigates. Verify that requesting WebView/generation/navigation identity and content-URI grants permit the correct source form to receive bytes. Never solve a failure by turning on blanket filesystem access or storing credentials.

Use a disposable website-owned form for single/multiple selection, exact byte verification, MIME filtering and cancellation. Then confirm X attachment preview without submitting. Check stale results after navigation, rotation and Activity destruction. Back must close source media/search/composer overlays before leaving their section. Qualify messages without sending or creating a chat passcode solely for testing. A source security gate remains a real limitation to record.

Acceptance: source forms keep state promised by the platform, native guard offers Stay, attachment delivery is observed, and no late result reaches a replacement document. Run Android assemble/lint and existing SDK/Rust checks for changes. Commit only reproduced fixes, `feat/(browser): qualify source forms and attachment return`.

### 6. Apply visual and motion polish, preserving HN

Files: `HostViews.java` reveal/presentation, `BrowserAdapter.java` navigation events, Rust/contracts only if generic navigation intent must be carried; X `theme.css`, `source.css`, `library.css` and sheet styles. HN scope is `src/source.css`, `theme.css`, `styles.css`, `library.css`, plus existing components for measured accessibility fixes. The HN manifest display name can become `Hacker News`; its ID remains unchanged.

Apply the visual/motion specification above. Represent generic intents such as section switch, detail entry, Back and reader entry/exit where the host owns the transition. Do not guess intent from an X URL in platform code or double-animate source SPA transitions. Cancel/reset animations on rapid navigation, retirement and reduced motion; keep the existing visual-readiness cover. Measure interaction responsiveness and frame pacing on a real device before claiming native quality.

HN's `src/search.tsx` is an existing 'Search is coming' placeholder. Preserve it as part of the user's accepted baseline in this UI scope, and record that limitation instead of claiming working search. A functional search expansion is a separate feature, not an incidental styling fix.

HN changes require before/after evidence of the particular readability or touch-target issue. Preserve all five sections, story/comment semantics, category authority and source account actions. Use separate commits `feat/(x-ui): polish integrated mobile navigation` and `feat/(hn-ui): refine reading and touch targets`. Verify both applets after every shared shell change.

### 7. Deliver and accept the two-app build

After core real X flows pass, select exactly `factory/applets/news.ycombinator.com` and `factory/applets/x.com` in `genesis.packages.json`. Build/install while preserving data; bundled and debug revisions with the same ID must produce one effective entry each. Verify both required service connections. Development process/tunnel setup is not a screen the everyday reader should have to navigate.

Test clean install and upgrade from the current HN-only build. Existing debug applets must remain hidden on the working device. Verify both apps after cold start, Back to Genesis, relaunch, section eviction, rotation and process recreation. A physical-device gap or login gate remains an explicit incomplete acceptance item, never a reason to demonstrate a second X preview as the deliverable. Provide sanitized screenshots/video of actual integrated flows and a pass/fail/not-run matrix; synthetic checks remain separately labeled.

Run from repository root: `npm run typecheck`, `npm run check:packages`, `cargo fmt --all -- --check`, `cargo check --workspace --locked`, `cargo clippy --workspace --locked -- -D warnings`, `cargo test --workspace --locked`, `git diff --check`. Existing Rust targets with zero tests establish no behavioral coverage. Run `./gradlew :app:assembleDebug :app:lintDebug` from `android/`. Use both applet CLI check/build commands with fresh output directories. No new/modified test files unless the user requests coverage.

Update current architecture, both applet READMEs, phase-4 operating guide and verification report to the observed final state. Commit `feat/(applets): deliver Hacker News and X together`. Do not claim completion until the ordinary launcher has two entries and each opens the complete working experience described here.

## Constraints and unresolved external dependencies

There are no unresolved product choices preventing the first implementation steps. The chosen structure preserves the working HN model and builds on the single existing X applet. X login availability, optional additional-account access, physical-device availability and native-only capability parity remain external qualification dependencies. Access blockers do not authorize bypassing authentication or preserving the password. Finish independent work and record exact unfinished flows.

The stale sentence in `factory/applets/AGENTS.md` calling X an inactive prototype is historical baseline text. The user's latest instruction and this plan define current scope. Do not edit instruction files without an explicit request to change those files. The pre-existing untracked architecture diagram is an earlier HN-only snapshot; `.architecture/` and this plan are the current source of guidance.

## Implementation progress at 22:51

Implemented and component-committed generic visibility, X adaptation recovery/status, HN 48px Save/vote targets and concise label, and contextual host motion. Android Studio confirmed the everyday launcher has exactly Hacker News and X, with diagnostics preserved but hidden. HN feed layout rendered successfully. The updated X applet is installed under its existing ID.

Real X login was retried once at the username step and remains temporarily limited by X. No password was entered or saved. Steps requiring authenticated source/category independence, attachment preview, real source overlays and final APK enablement remain incomplete. The HN-only bundled selection is retained per this plan's qualification gate; the working debug launcher already exposes both apps. No synthetic preview is offered as the completed X application. See the continuation report for exact checks and remaining work.
