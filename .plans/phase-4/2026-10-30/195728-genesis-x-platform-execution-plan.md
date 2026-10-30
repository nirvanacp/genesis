# Genesis platform changes and X execution plan

Project: Genesis platform and `factory/applets/x.com`. Phase `phase-4`, branch `proto/phase-4`. Created 30 October 2026 at 19:57:28 Asia/Kolkata. This plan completes [the product/navigation plan](195728-x-product-and-navigation-plan.md) and [the category backend plan](195728-x-category-backend-plan.md). Read all three before implementation. No application code, package selection, dependency, account setting or test file was changed during planning.

## Current baseline and adopted guidance

Inspected current architecture in [platform ownership](../../../.architecture/platform.md), [browser runtime](../../../.architecture/browser-runtime.md), [services/data](../../../.architecture/services-and-data.md), [HN](../../../.architecture/hacker-news.md), and the existing [phase-4 architecture document](../../../.docs/phase-4/2026-10-30/184524-genesis-current-system-architecture.md). Preserve that pre-existing untracked document unchanged. No phase-4 operating guide was present; the architecture document is current context, not an operating guide.

Explicitly adopt the toolchain and scoped verification commands from [phase-3 maintenance](../../../.docs/phase-3/2026-10-30/162034-genesis-platform-maintenance.md), because they match the inspected package, Gradle and Rust files. Do not adopt old phases' product scope or archived plans. Read [root instructions](../../../AGENTS.md), [factory instructions](../../../factory/AGENTS.md), the [SDK reference](../../../factory/guides/sdk-reference.md), [patterns](../../../factory/guides/patterns.md), [services](../../../factory/guides/services-and-data.md) and [verification](../../../factory/guides/verification.md).

The current public contract is SDK/tools 0.2.0, runtime API 1, manifest/data schema 1 and bundle format 1. The only bundled applet is HN. X's `src/main.tsx` is a qualification placeholder, `targets.ts` contains candidate selectors, and `library.tsx` is a local-page demo. There is no implemented X categorical bookmarking to preserve or enable by toggling the package index.

Current strengths to reuse are managed DOM watchers, owned Shadow DOM roots, document identity checks, service brokering without website cookies, native manifest sections, retained views, child reader, visual transition cover and debug applet installation. The host retains at most three customized section views; five sections do not imply five permanently live views or background execution.

## Findings and owners

| Finding grounded in inspected code | Consequence | Owner and priority |
| --- | --- | --- |
| `Source.customizedPaths` and Java's document-start guard match exact paths; Rust `route_kind` does the same. | Dynamic post/profile/media paths cannot be explicitly covered. Omitting the field customizes the entire origin, including login/security. | Generic route matching and source-ordinary presentation, required before broad X enablement. |
| Rust `eligible` checks origins, and same-document changes retain the document binding. Java starts transitions only for full navigation. | Route coverage is currently presentation rather than a per-route capability boundary. SPA crossings into ordinary account routes need deliberate cleanup/rebinding behavior. | Generic lifecycle change, required. Do not claim complete code isolation after disposal. |
| `HostViews` selects tabs by exact source/page identity. Page-to-source openers are mainly assigned for temporary non-root destinations. | X History and packaged Categories can lose Saved highlighting or return ownership on root switches. | Generic section ownership, required. |
| SDK has navigation change observation and SDK-modal Back, but no public source transient Back or leave guard. | Same-URL bookmark search and source dialogs need correct Back priority; native section switches can abandon a composer. | Generic bounded Back callback and leave guard, required for qualified composer/navigation support. |
| `onShowFileChooser` always returns null. | Ordinary photo/video attachment is impossible. | Generic Android file picker, required for the everyday attachment milestone. |
| `onPermissionRequest` denies camera/microphone; no WebAuthn integration found. | Calls, voice, live Spaces and passkey claims would be unsupported. | Explicitly deferred. Keep readable fallbacks, not a permission bypass. |
| SDK modal uses fixed white styling and traps keyboard focus but does not hide background accessibility content. | Dark styling needs an applet override; TalkBack modality requires generic qualification/fix. | Applet styling plus generic modal accessibility correction. |
| Native shell colors are fixed to the HN palette; icon enum has only home/search/post/bookmark/person. | X would inherit HN-colored chrome and lacks an Alerts icon. | Small generic shell preset/icon additions. |
| Popup interception collapses first URL into opener/reader and the child reader has limited Chrome callbacks. | Basic GET links can work; OAuth, script-created popups, external media and Web Share are not fully supported by evidence. | Qualify simple links, preserve safe fallbacks; complex auth/share/media features are deferred unless required by a verified core failure. |
| HN's backend uses document operations and client-side domain relationships. | Copying it unchanged gives poor server search and weak X category invariant enforcement. | X applet backend only, as specified in the separate plan. |

No X selector, API endpoint, user handle, category table or bookmark operation belongs in Rust, Java, the SDK or shared tooling. Shared fixes must also preserve HN and arbitrary applets.

## Proposed platform contract

These names are implementation decisions for a new release. They are not valid calls/fields in SDK 0.2.0. Implement, document and qualify the platform component before using them in X.

### 1. Explicit route patterns and ordinary source navigation

Add optional `customizedRoutes` and `ordinaryRoutes` string arrays to `Source`. Keep existing `customizedPaths` semantics for old manifests; reject mixing it with `customizedRoutes`. `ordinaryRoutes` takes precedence. Patterns match URL pathname only, after standard URL parsing. Queries/fragments remain intact for navigation but do not affect classification.

Support only literal segments, `:name` for exactly one nonempty segment, and a final `*` for zero or more complete segments. Examples are `/:handle/status/:id`, `/:handle/status/:id/photo/:index`, `/settings/*`. No regular expressions, mid-segment wildcards or optional parameters. A final wildcard matches its base path as well as descendants. Require a leading slash; limit each pattern to 256 UTF-8 bytes, 16 segments, and 100 patterns per array; reject duplicate patterns, `.`/`..`, backslashes, query/fragment syntax, malformed escapes and encoded slash/backslash path tricks. Literals compare case-sensitively. Parameters are syntax-level matches; X validates handles and decimal IDs itself. Do not repeatedly decode pathnames.

Use equivalent implementations in creator validation, Rust authoritative classification and generated injection predicate. Java must consume the same normalized route definition or a packager-produced bounded matcher representation verified by Rust, not invent a separate loose prefix implementation. Apply the matcher to shell choice validation as well as direct navigation, document-start injection and RPC eligibility. Keep exact origins as the independent first check.

Distinguish `source-customized`, `source-ordinary`, `page` and `external` internally. A same-origin ordinary route loads in its source WebView with ordinary origin/recovery controls and without active applet behavior. It must not automatically become an unrelated child reader. External GETs still open the child reader without a bridge. This distinction belongs to the selected source context rather than the union of all applet origins.

Lifecycle rules:

1. Customized document load follows current cover, handshake, startup timeout and visual readiness. Backend readiness does not delay source reveal.
2. A customized-to-customized SPA change keeps the live document binding, advances route revision, closes obsolete SDK modals, reclassifies shell presentation and lets managed route watchers rebuild only route-owned effects.
3. A customized-to-ordinary SPA change retires applet resources and rejects new SDK service/storage calls for that binding. Do not deliver stale completions to newly presented content. Reveal the ordinary source layout after cleanup. In-memory script definitions and shared origin privileges do not constitute isolation; the guarantee is no active customization and no valid broker binding on that route.
4. Ordinary-to-customized full navigation creates a fresh binding at document start. For ordinary-to-customized SPA navigation, use one controlled GET reload of the now-committed eligible URL behind the cover if the provider cannot install and bind the runtime in the required isolated world without a reload. This is the selected baseline, not an assumption of an undocumented WebView API. Guard by view/navigation epoch so it happens once. Do not replay POST requests, auth challenges or uncommitted form actions. If an eligible URL cannot be safely reloaded, show an explicit Refresh customization action.
5. Ordinary login hash steps remain ordinary. Never bind solely because the origin is allowed. A redirect to Home can customize only after the normal source flow completes. Repeated redirects must not create an endless rebind/reload loop.

The minimal platform reproduction uses a disposable source with a literal root, `/:entity/status/:id`, an ordinary `/settings/*` exclusion and same-document transitions in both directions. Verify that ordinary pages never receive an active applet binding, while reloads restore customization exactly once. Do not add permanent test files without a coverage request.

### 2. Section ownership and saved-mode navigation

Represent native section identity separately from current source/page selection, through a host-derived optional `sectionId` in internal selection/session state. Native section taps establish that owner. SDK `pages.open` and `sources.open` preserve the current owner within an applet by default. Manifest validation still determines which source/page is allowed; a section ID is presentation state, never authorization.

Native highlighting uses the owner rather than an exact source/page equality when present. Restore legacy behavior for old session state without an owner. Keep the current active destination and history for each section across tab switches, within the existing three-view retention budget. Eviction stores history/scroll and reconstructs the destination; it does not serialize all source JavaScript. Native app roots and source/page detail openers remain distinct so Back returns to the expected root or prior owned page without cycling between two roots.

For Saved, source `/i/history` and packaged page `library` share the Saved owner. `pages.open('library')` from History opens Categories. `sources.open('saved', 'https://x.com/i/history')` returns to its source mode. Opening a saved post uses the same declared source and retains library as its detail opener, regardless of whether its URL matches a source root. Closing that detail returns to the existing library filter/scroll. A native section tap returns to that section's last active destination; cold startup uses the manifest root.

Persist no private post contents in session metadata. Store URLs/history in existing private host state, with current data-preservation rules. Applet IDs/signing and local records do not change. Reader Close restores the exact opener, including section ownership; an external link back into X must preserve it.

### 3. Source transient Back and unsaved-work guard

Propose `context.navigation.onBack(callback): Dispose`, where a callback returns boolean or `Promise<boolean>`. True means the current source transient UI consumed Back. Only one registration is active per document, with replacing registration disposing the old one. SDK registration/cleanup informs the host; no window-global or Android-specific API is exposed to applets.

Host Back first respects child reader, current SDK modal and fullscreen. Before ordinary WebView history, send a request token to the matching active binding. Accept one result only for its generation/document/channel/token and current route revision. Give it 300 ms. False, no handler, exception or deadline falls through to normal Back; late results cannot consume a later gesture. Prevent duplicate concurrent Back requests and keep recovery available. Do not terminate a renderer merely because this optional callback times out. A callback must finish quickly, not wait for user input or service I/O.

The X adapter returns true only when it synchronously invokes a qualified source control for bookmark search, a source menu, media overlay or composer Close. Clicking composer Close may open X's own draft/discard prompt; that still consumes this Back. If no uniquely identified source transient state is present, return false. Never globally click the first button labeled Back or Close. Revalidate route, dialog identity and connectivity immediately before invocation. Missing selector means use normal source history and report the coverage gap.

Propose `context.navigation.setLeaveGuard({message:string}|null): Promise<void>`. Bound the message to 160 visible characters and use a generic safe default if absent/invalid. Register a conservative guard as soon as a source composer appears, before editing, and clear after that composer closes. Do not try to persist source credentials, attachments or hidden editor state. Host-originated section switch, launcher return, reload and explicit destination replacement consult this guard before destroying or parking the view. Present native Stay/Leave, default Stay; leaving does not pretend to save a draft. Do not block safe reader overlays that keep the opener alive. Website-owned navigation continues through source controls and its own confirmations.

Guard state is bound to the document and cleared on retirement, source-ordinary transition and failure. It is not a durable process and cannot prevent Android process death. Respect existing page `beforeunload` behavior and avoid double-prompting when the source already owns a close/discard flow. Native modal/leave interactions must be serialized. The UI must acknowledge the guard before exposing applet-controlled composer shortcuts as ready. Device qualification must check the registration race and dirty composer tab switches.

### 4. Android source file picker

Implement `WebChromeClient.onShowFileChooser` with the system document picker in `BrowserAdapter.java` and result routing in `MainActivity.java`. No new SDK method or X-specific permission is needed because this is an upstream website input. Honor single/multiple selection and valid MIME accept types, bounded to 16 URIs; support the normal image/video attachment case. Directory selection, arbitrary camera capture and unsupported modes return a useful cancellation/fallback.

Associate a pending callback with its WebView instance, generation, navigation epoch and top-level origin. Before starting a replacement picker, complete the previous callback with null. Return results only to the still-current request; cancellation, source navigation, section retirement, Activity destruction and stale results complete/null the callback at most once. Do not deliver picked files to an unrelated view restored under the same section.

Use user-selected `content:` URIs and temporary read access. Do not request blanket storage or camera permission, resolve real filesystem paths, copy files into applet records, or forward them to the category backend. A normal source upload goes directly through X. Display origin context when required by picker UX. The reader must use the same generic handling only if its requesting view can be bound safely; otherwise preserve a clear Open in browser fallback. Verify chooser cancellation, rotation and process recreation behavior explicitly.

### 5. Shell styling, Alerts icon and accessible modal

Add generic icon enum `notifications` across SDK types, JSON schema, Java resource mapping, Rust/tool validation and documentation. Add `ic_section_notifications.xml` in Android resources. Do not encode X terminology in that asset contract.

Add optional shell `colorScheme` enum `default|neutral`. Omission preserves the current HN palette. Neutral uses semantic native light/dark background, text, selection and accent tokens suitable for mixed web content. Recompute/apply on Activity configuration rather than using one applet's palette for the whole session. X selects neutral. Keep the package-owned brand artwork local, small and decoded through existing verified asset handling. This is a limited preset, not a general theme language. Check both schemes' contrast and source/reader/cover appearance.

Keep `ui.openModal` API compatible. Fix generic background accessibility suppression while an SDK modal is active, including preserving prior `inert`/ARIA state and restoring it only when still owned by the modal. Do not overwrite `aria-hidden` on an ancestor that contains the modal. Handle source nodes added while it is open with bounded observation. Verify TalkBack, keyboard focus, native chrome modality, focus restoration, reduced motion and IME resize on Android. Existing keyboard Tab trapping is insufficient evidence for TalkBack isolation.

X styles the supplied modal section with its own semantic CSS, compact bottom alignment, viewport/IME-safe height, and explicit label. If source DOM conflicts prevent accessible overlay behavior, use the packaged page for editing as a documented fallback and resolve the generic modal defect before advertising the sheet as complete. Do not implement an unmanaged second modal to bypass SDK lifecycle.

### 6. Compatibility release

Release proposed SDK/tools version 0.3.0 and runtime API 2 together with the new host. Keep bundle format 1 and manifest schema 1; the new optional fields and methods are gated by runtime API 2. Existing tools reject unknown fields and existing hosts reject API 2 bundles, producing a clear upgrade requirement. Do not use a version-1 envelope to sneak required semantics past older hosts.

The new host must continue accepting runtime API 1 packages with their existing semantics. Replace equality-only version checks with an explicit supported set and carry the package's negotiated API version into binding/dispatch. New methods/route fields require API 2. New tools emit API 2 bundles; HN rebuilt with new tools can use API 2 without opting into route patterns or neutral styling. Old externally supplied API 1 HN bundles remain loadable. Preserve applet ID/data schema and prior compatible revisions on rollback.

Touchpoints include SDK `manifest.ts`, `runtime.ts`, `bootstrap.ts`, protocol exports/version; `packages/applet-tools/src/manifest.mjs`, build and device compatibility handling, `manifest.schema.json`; `crates/contracts/src/lib.rs`; `android/native/src/packages.rs`, `controller.rs`, `sources.rs`; Java `PackageStore`, `BrowserAdapter`, `HostViews`, `MainActivity`; package manifests/lockfile and factory guides. Inspect each version check instead of assuming the list is exhaustive. Update portable documentation and kit metadata with the release. An API-2 applet rollback must not select an incompatible API-1 host/data combination silently.

## X frontend components

Preserve `src/main.tsx` as the default `defineApplet` entry, replacing the placeholder. It should wire focused modules rather than become a universal website framework.

| Files to create/change beneath `factory/applets/x.com` | Exact responsibility |
| --- | --- |
| `applet.json`, `package.json`, `README.md`, `assets/x.png` | Stable ID; five sources and sections from product plan; packaged library; dom/storage/services capabilities; service declaration; new route patterns; qualified origins; neutral shell; setup/support limits. Preserve legacy library page ID. |
| `src/routes.ts`, `src/main.tsx` | Route classifier, source section wiring, per-route disposal, account/source effect policy, initial shell and focus refresh. |
| `src/extract-post.ts`, `src/post-url.ts`, `src/targets.ts` | Identity, bounded snapshots, safe canonical URLs and sanitized structural diagnostics. |
| `src/account.ts`, `src/local-state.ts` | Signed-in profile-link observation, library handle comparison, account epoch, one-use source-verification tickets and retained-view invalidation. No cross-view DOM access, input values or cookies. |
| `src/source-navigation.ts`, `src/source.css`, `src/theme.css` | Hide duplicate navigation only where qualified; Home shortcuts; History mode selector; account hub; transient Back/leave guard; owned theme and safe layout adaptation. |
| `src/post-controls.ts`, `src/components/category-sheet.tsx` | Stable watched post bindings, batch membership reads, folder control, sheet state, membership submission and read-back. |
| `src/library.tsx`, `src/library-data.ts`, `src/library.css`, `src/components/category-manager.tsx` | Owned library modes/search/filter/pagination, category CRUD, row menu, record errors, focus refresh and source-open return. |
| Data/backend files | Implement the separate backend plan without importing server code into browser bundles. |

### Extraction and dynamic DOM contract

Observed structural candidates are `article[data-testid="tweet"]`, `[data-testid="tweetText"]`, `[data-testid="User-Name"]`, `a` containing `time`, action test IDs `reply`, `retweet`, `like`, `bookmark`, and navigation `AppTabBar_Profile_Link`. The account switcher uses `SideNav_AccountSwitcher_Button`. These are current website observations, not a guarantee of stable public APIs. Do not use generated CSS class names, localized button text as primary identity, hidden application state, intercepted API payloads or unofficial GraphQL endpoints.

`extractPost(article)` must select that article's own timestamp/permalink, excluding links inside quoted content or nested articles, validate its status ID, and return a bounded snapshot or null. The detailed post and replies can be separate articles in the same conversation; do not assume the first article matches the route ID. Reposted wrappers save the original post. Reject promoted items without an ordinary unambiguous permalink, user suggestions, skeletons and malformed IDs. Ads may remain visible; this project is not an ad blocker. Incomplete or unsupported articles keep their source controls and receive no applet save control.

Watch up to 100 post elements initially, using canonical post ID as `contentKey`, relevant href/data-test-ID attributes and bounded text extraction. Maintain controls keyed by binding ID; when article ID changes, dispose old resources before mounting new ones. If only the action anchor is replaced, remount the owned control once. Batch and deduplicate lookup reads, and distinguish idle/loading/known-saved/known-unsaved/unavailable. Never interpret a failed lookup as absence. Avoid rereading membership on unrelated likes/reply-count changes.

After every asynchronous read or click require active context, connected element, matching content key, same account epoch, current request sequence and current library. Keep a snapshot of the intended post in the sheet; source row recycling cannot redirect a submitted save to another post. Revalidate before opening the sheet. Save the selected snapshot only after explicit user submission. Text is rendered through text nodes/React text; no raw HTML. All mounts/listeners and queued reads have registered cleanup. Repeated source removal of an owned root stops restoration instead of fighting X's renderer.

Account verification and category service requests must not delay SDK initial readiness. Show an immediate local shell/loading indicator and fetch afterward. Source navigation and X bookmarks remain usable during backend failure. Page mounts use `definePage` plus `mountReact`; inline mounts/modal render callbacks use synchronous React root render/disposal as documented.

## Ordered execution and commit boundaries

Implementation is authorized only by a later request. When requested, implement and commit each verified component as required by root instructions, using `git config user.email` from the affected repository. Preserve unrelated work. Read/update these plans and add one development changelog per logical development change; do not combine unrelated components into one commit.

1. **Qualification baseline.** Inspect current X DOM again and record sanitized route/selector evidence plus host/provider versions. Check the installed SDK 0.2.0 prototype without enabling it. Confirm private backend deployment assumptions and the operator's configured account. Resolve changed DOM by updating these plans before affected implementation. No account mutations or permanent new test files.
2. **Platform route/lifecycle and API compatibility.** Implement proposed matcher, source-ordinary distinction, ordinary-route binding restrictions and API-1/API-2 negotiation. Update factory documentation. Verify legacy HN exact paths, new dynamic patterns, reserved exclusions and full/SPA auth return. Commit `feat/(navigation): support scoped dynamic source routes`.
3. **Platform section ownership and navigation guards.** Implement section state/openers, transient Back and leave guard with bound deadlines and restoration. Verify History-to-library root transitions, library detail return, reader return, timeout and composer tab switch in a disposable applet or current X development revision. Commit `feat/(navigation): preserve section context and guarded exits`.
4. **Android picker.** Implement independent system picker/result lifecycle. Verify local attachment preview and cancellation without submitting an X post or uploading files during this planning authorization. Use a disposable local source form for full byte-delivery verification; actual X attachment transmission requires a separately authorized harmless media selection during implementation qualification. Commit `feat/(browser): support website file selection`.
5. **Native shell and modal.** Add neutral preset, notification icon and accessible SDK modal behavior. Check legacy HN appearance and existing modal dismissal deadline; theme/IME/TalkBack checks. Commit `feat/(shell): add neutral styling and accessible dialogs`.
6. **X backend.** Implement the backend plan's server component, invariants and disposable verification independently of frontend readiness. Commit `feat/(x-backend): add categorized bookmark service`.
7. **X source shell/account adapter.** Implement manifest and source route adaptation with no category writes yet, account verification, menu destinations, History mode entry, source Back and composer guards. Keep login/security/chat ordinary. Verify representative routes, recycled rows and failure recovery. Commit `feat/(x-navigation): adapt daily X routes`.
8. **X data client and category capture.** Implement the backend plan's client/repository component, then the stable source controls and category sheet. Verify membership state/recycling/failure, independent X/category saves and uncertain-write reconciliation using disposable backend records. Commit the client as `feat/(x-data): connect category library records` and the control UI as `feat/(x-save): add category save controls` once each is verified.
9. **X library.** Replace the placeholder packaged page with the specified library, search, category manager and live-post opening. Verify pagination, full-library search, category edits/deletion refusal and Saved ownership. Commit `feat/(x-library): add categorized saved posts`.
10. **Integration and enablement.** Install X as a debug revision and provision its separate backend. Keep HN in the launcher. Add X to `genesis.packages.json` only after platform and core device acceptance; do not remove HN. Finish README, active architecture/operating guidance and final qualification report with limits. Commit `feat/(x-integration): qualify and enable X applet` after the qualification gate passes. Production hosting, signing and store distribution remain separate work.

No blanket parallel-agent workflow is needed. Backend implementation is independent after the application contract is agreed; frontend depends on platform APIs for the full navigation contract. If a platform component cannot be completed, finish unaffected backend work and leave X unselected with the exact missing contract recorded. Do not substitute direct JNI/bridge imports or unofficial X network calls.

## Verification commands and expected outcomes

Use the pinned Node 24.15.0/npm 11.14.1, Rust 1.94.0 and Android toolchain from the adopted maintenance guide. Resolve missing tooling/configuration as an environment gap, not a passing check. The commands below belong to future implementation; this planning task does not run a build or mutate a device.

| Component and working directory | Commands | Expected result |
| --- | --- | --- |
| SDK/tooling, repository root | `npm run build --workspace @genesis/sdk`; `npm run typecheck --workspace @genesis/sdk`; `npm run typecheck --workspace @genesis/applet-tools`; `node --check packages/applet-tools/src/manifest.mjs` | Current SDK builds; changed source/type/schema consumers agree. Validate new and rejected manifests through temporary inputs without permanent test files. |
| Rust/contracts, repository root | `cargo fmt --all -- --check`; `cargo check --workspace --locked`; `cargo clippy --workspace --locked -- -D warnings`; `cargo test --workspace --locked` | No formatting, build, lint or existing-test regressions. Existing zero-test areas still require manual reproductions. |
| Java/native integration, `android/` | `./gradlew :app:assembleDebug :app:lintDebug` | Valid debug APK and clean scoped Android lint with pinned SDK/NDK/JDK. Inspect actual lint findings; record environmental blockers. |
| X backend, `factory/applets/x.com` | `node --check backend/server.mjs`; `node --check backend/store.mjs` | Syntax valid; separate disposable database/API checks establish semantics specified in backend plan. |
| X applet, repository root | `npm run typecheck --workspace @genesis/applet-x`; `node packages/applet-tools/src/cli.mjs check factory/applets/x.com --json` | Manifest, service declaration, file containment and TS pass on the new released contract. |
| X bundle, repository root | `node packages/applet-tools/src/cli.mjs build factory/applets/x.com --out /private/tmp/genesis-x-phase4-bundle --json` | Hashed API-2 bundle contains only declared frontend assets, not backend code/secrets. Use a fresh output directory or supported generated-output replacement. |
| Cross-project regression, repository root | `npm run typecheck`; `npm run check:packages`; `git diff --check` | Workspaces remain valid; selected HN and eventually X package checks pass; no whitespace errors. |

For a connected authorized debug device, from `factory/applets/x.com`, use `npx --no-install genesis-applet dev status --device <serial> --json`, build/install commands from the factory verification guide, and `npx --no-install genesis-applet service start . --device <serial> --json`. Install only a reviewed bundle, with explicit replacement when updating. Device receipt proves acceptance, not backend or source readiness. Service start can restart the host; protect unsaved work. Do not uninstall or reset the user's app/database/cookies. Production endpoint provisioning uses the existing private credential-file workflow.

## Device acceptance matrix

Record physical device model, Android version, WebView provider/version, host build/revision, SDK/tool versions, X applet revision and backend revision. Browser observations from planning do not replace these checks. Use disposable applet data and do not submit source posts/messages, purchase, follow, like, repost, create passcodes or change account settings just to test UI.

| Flow | Required observable result |
| --- | --- |
| Cold start, signed in/out and auth return | Correct source or gate; password fields untouched by applet; no duplicate native/source navigation; one controlled customization rebind after ordinary SPA return. Challenge/recovery screens remain upstream. |
| Home and Explore | Both feeds, query/filter navigation, long text, quotes, reposts and recycled rows retain correct post identity. Scroll/category controls do not jump between IDs. |
| Conversation/media | Parent/reply/quote identity correct; Close/Back returns correctly; image gallery and video fullscreen keep source controls. Pause/resume does not play hidden audio. Report playback limits separately. |
| Source composer | Text, reply and quote recipients stay upstream. Back invokes source close/draft flow; native section/launcher switch prompts before losing work. Picker attaches only to its requesting form; cancellation/stale results do not corrupt it. No real submission required. |
| Saved modes | X History and Categories keep Saved highlighted; source bookmark search closes before history navigation; library filters/scroll survive a detail visit, reader and section switch. |
| Two bookmark systems | Category save/remove produces only backend mutations; source bookmark save/remove produces only X behavior. A post can be saved in both with independent removal. No upstream mutation is required during planning; controlled mutation verification later needs a disposable post and explicit scope. |
| Backend failures | Stop/unreachable/401/invalid JSON/timeout after commit show useful states; source browsing/bookmark controls still work. Same-ID reconciliation avoids duplicate writes. A failed initial load is not empty data. |
| Categories/search | Create/duplicate/rename, 50-category cap, multi-membership, final removal, nonempty deletion refusal, entire-library search and cursor invalidation match contract. |
| Account changes | Signed-out/unknown/mismatched account hides previous category content and stops stale UI updates; no record reset. Retained source/page focus rereads identity. Actual account switching is a separate operator-controlled check if an additional account is unavailable. |
| External links | Text/card/target-blank/t.co redirect opens reader, shows final origin, and Close restores opener/scroll. X return links rebind correctly. Unsupported schemes and blocked popup flows recover without losing source context. |
| Retention/process lifecycle | More than three sections exercises eviction. Reload/rotation/process recreation preserve promised history and backend records, never claim complete source JS/draft recovery. Pending receipts reconcile. |
| Failure/recovery | Unsupported provider, renderer loss and customization failure expose View original/Retry/Back. Original page remains usable; record data survives code rollback. |
| Accessibility | 320-width and wide layouts, 200% text, IME, RTL, dark/light, reduced motion, keyboard and TalkBack work. Modal background is inaccessible; controls have labels and focus restoration. Check native preset contrast. |
| HN regression | Launcher, native tabs, source-to-library/detail/reader return, save/category flow, service connection and default palette remain working under the updated platform. |

Take sanitized screenshots for static layout and sampled recordings for transitions, excluding credentials, private messages, personal notifications and settings values. Do not claim absence of every one-frame flash from still images. Keep production/service secrets outside evidence.

## Deferred work, risks and completion gate

Deferred by explicit scope decision: verified multi-account backend authorization, paid folder sync, automatic native bookmark import, persistent background jobs, offline caches/queues, full post/media archival, server fetching of X, camera/microphone, Calls/Spaces voice, passkey/OAuth guarantees, Web Share integration, production deployment/distribution and broad creator/business UI customization. Keep upstream access and clear Open in browser fallbacks for these functions. If basic browser sharing proves unusable, propose a separate generic share-URL capability with validation and user-gesture handling; do not silently implement an X-specific Android command.

Remaining factual uncertainties are website selectors across locales/layouts, chat beyond its passcode gate, private/protected/deleted posts, list detail variants, real attachment delivery and provider rendering/SPA event ordering. Each has an explicit qualification step above. They do not authorize invented APIs or an assertion that the applet is already usable. The baseline design choices are resolved; qualification can require targeted plan updates before affected implementation.

Phase 4 is complete only when generic platform components are verified, X's daily/custom library flows pass on a physical device with a working separate backend, HN has no material regression, documentation/changelogs match the implementation, and limitations are recorded. Build success and a successful login in this Browser are evidence for narrower claims only.

## Execution status — 30 October 2026

Planning was committed first as `08aa831`; the user then authorized implementation. Components 2–9 are implemented in separate commits: route/API compatibility, section ownership/guards, file picker, shell/modal, X backend, source adapter, data client, save sheet and Categories library. An additional account-ticket refinement replaced idle polling with events plus a pending deadline and persisted scrolling preferences. Type/package/Rust/Android build and lint checks passed; existing Rust targets have zero tests, so that command is not evidence of behavior coverage.

Step 1's browser planning observations were preserved, but authenticated Android baseline could not be established: X limited login at the username step. Step 10 installed the reviewed X dev revision and provisioned its separate HTTPS backend. It remains **incomplete**: no physical device was connected, and authenticated source flows, accessibility/media/lifecycle qualification and final enablement are outstanding. `genesis.packages.json` deliberately retains HN only. Do not use the proposed enablement commit message or add X until that gate passes.

The final report is [here](../../../.reports/phase-4/2026-10-30/211400-genesis-x-android-verification.md); the active [operating guide](../../../.docs/phase-4/2026-10-30/210800-genesis-x-development-guide.md) and [X architecture](../../../.architecture/x.md) describe the implemented system. Organizational deviations: `post-url.ts` helpers live in `domain.ts`; `routes.ts`/`library-data.ts` responsibilities are split across the manifest, source navigation and domain/repository modules. No new generic applet framework, private bridge, unofficial X API or permanent test file was introduced.
