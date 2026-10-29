# Genesis seamless applet experience: findings and implementation plan

Created 29 October 2026, Asia/Kolkata. Scope: Genesis Android host, Rust controller/contracts, TypeScript SDK, package tooling, and the Hacker News applet. Baseline: commit `68fc3a6` on `proto/phase-2`.

## 1. Execution instructions for the implementing agent

This is a plan, not a record of completed fixes. The user stopped implementation and requested this document. Uncommitted application changes made before that instruction were removed; the earlier four implementation commits remain. The pre-existing modification to `AGENTS.md` must remain untouched.

Read root `AGENTS.md`, applicable nested instructions, `.architecture/{platform,browser-runtime,services-and-data,hacker-news}.md`, and this entire plan before changing code. Ignore archived documents. Use the project Apple design and unslop skills. Do not install unrelated tools, rewrite unrelated applets, or add test files without the user's separate authorization. Existing tests and temporary verification commands are permitted during implementation.

Implement the numbered work packages in order. For each package: inspect the named code, make the bounded change, run its checks, record evidence, and commit only that package's files using `feat/(component): description`. Use the repository's configured Git author email. Do not treat a passing build as evidence of visual or network correctness.

The old navigation plan remains historical context for this work. This plan supersedes its choices about browser chrome, page readiness, shell ownership, and service setup. Preserve its requirements for HN functionality, Search as a placeholder, and no real post during verification.

## 2. User requirements and fixed decisions

1. Equal outer margins and deliberate internal spacing across all customized pages.
2. A story tile's non-interactive area opens its HN discussion. The title opens the submitted URL. Discussion pages retain a title link and add an explicit Visit website action when a distinct article URL exists.
3. No login/logout action in the Home header. Account entry belongs to Me. Post may show the real login form when required.
4. Home header: original YC mark, Hacker News title, current-feed dropdown aligned right.
5. Customized pages use app navigation with a normal Back action on detail pages. They do not show a URL bar, lock icon, browser Forward button, or reader Close button.
6. External pages use an in-app browser with the actual destination origin, Back, Forward, Close, Reload, Copy link, Share, and Open in browser. An editable URL field is unnecessary; Copy link meets the request with less complexity.
7. Loading must never expose raw HN, an old page underneath a replacement, a previous article, or a blank interactive WebView. External pages become visible as normal websites after their first valid committed frame; do not wait for applet readiness on external sites.
8. App creators own frontend and backend. Framework tooling must connect declared services during development/install, rather than asking readers to configure them from Save.
9. User chose a local backend for now. Keep HTTPS transport independent of location so the same frontend can use a deployed server or a separately running phone-hosted HTTPS service. Do not silently switch bookmarks to local SQLite or upload legacy data.
10. This iteration must actually verify local backend saving. Supporting a backend running on a phone means accepting its HTTPS endpoint; bundling a Node runtime or implementing Android background server supervision is a separate project, not an implied capability of this change.

## 3. Evidence and problem inventory

Evidence labels: **Observed** means seen in the running Android Studio emulator during this audit. **Code** means established by inspected source. **Reported** means the user observed it but this audit did not measure its frequency. **Risk** means a specific path requires verification and is not a confirmed failure.

| ID | Problem and evidence | Cause or relevant code | Required result |
| --- | --- | --- | --- |
| P01 | Observed: Home titles have a broad left gutter; story detail/comment content also starts far to the right. | `src/source.css` preserves rank/vote/empty table columns, HN colspans, and inherited padding. | Equal page edges; only useful vote space and real comment depth consume width. |
| P02 | Observed: Home, Search, Saved, Me, and login forms use different content offsets. | Body padding in `source.css`, `.library` padding, Search inline CSS, Me Shadow DOM padding; local HTML body defaults. | One spacing contract, applied once per page. |
| P03 | Observed: non-link blank area of a Home story tile does nothing. Code: no tile discussion handler. | `main.ts` only mounts bookmark controls; `library.tsx` has individual buttons. | Tile background and keyboard activation open discussion; nested controls keep their own actions. |
| P04 | Observed earlier/current detail: login pill appears above story content; brand is absent. | CSS hides `.pagetop` containing `.hnname` and leaves the account cell visible. | Branded header; account controls only in Me. |
| P05 | Observed: customized discussion shows native URL/lock/Forward/Close chrome and loses bottom sections. | `BrowserAdapter.updateNavigation` equates non-home route with reader; `main.ts` mounts tabs only for `topLevel`. | Route presentation independent of root/detail position; persistent sections on customized pages. |
| P06 | Observed: Save dialog and Saved demand native Menu > Service connections; Save disabled. | `ServiceClient` resolves only manually supplied preferences. Backend source is packaged in the repository but never started/provisioned by tooling. | Local development service starts and is provisioned by creator tooling. Readers can save immediately. |
| P07 | Observed: Saved reports zero loaded / more available while initial request has failed. | `library.tsx` renders loading/count/pagination language independently from error state. | Error is distinct from an authoritative empty library; no invented count or pagination claim. |
| P08 | Observed: a large floating plus occupies reading space on local/customized pages. | `HostViews` uses the creator menu as a persistent floating action. | Put creator controls in an explicit creator mode or launcher; no ambiguous reading action. |
| P09 | Reported: raw HN flashes before customization. Code: cover is driven by several independent callbacks. | `onPageStarted`, history updates, navigation listener, Rust `navigation_presentation`, SDK `runtime.ready`. | One navigation-specific reveal gate owned by the framework. |
| P10 | Code: SDK announces ready immediately after `activate` and `flushInitial`; React `createRoot().render()` has not necessarily committed. | `packages/sdk/src/bootstrap.ts`, `index.ts`, `runtime.ts`; local page entrypoints. | SDK readiness includes initial UI commit and style/layout completion. |
| P11 | Code: external navigation can become `ordinary` before new document pixels replace old ones. | Rust presents ordinary on ineligible URL; Java hides cover without a visual commit fence. | Hide departing pixels until the destination's first committed frame. |
| P12 | Code: reader Close searches backward for a feed URL. | `BrowserAdapter.closeReader`. | Close returns to exact opener, including a discussion or Saved entry, with state intact. |
| P13 | Code: one WebView is destroyed on section replacement; history bundles preserve only part of state. | `BrowserAdapter.create/destroy`, controller selection lifecycle. | Retain bounded section sessions; explicitly restore evicted sessions. |
| P14 | Code: Post draft is stored in website localStorage and cleared on any non-submit route after a submit event. | `src/post.ts`. | Applet-scoped draft storage; no deletion just because authentication or an error caused navigation. |
| P15 | Code: `extract-item.ts` permits fewer routes than the feed selector exposes. | `supportedRoute` excludes Past, Jobs and account story lists. | Explicit story/comment/job route handling; no silent missing bookmarks on supported story lists. |
| P16 | Risk: saved scroll restoration before rows exist, request completion after section switch, stale category state. | `library.tsx`, per-context backend listeners, lifecycle retirement. | Restore after data/layout; refresh on focus without resetting working state; reject stale replies. |
| P17 | Observed: Post opens the real signed-out HN login form; account hub offers Sign in and Forgot password. Authenticated Android flow remains unverified from previous work. | `me.ts`, `post.ts`, HN source routes. | Verify authentication on device and return to the initiating section without exposing credentials. |
| P18 | Risk: redirects, same-document changes, popups, renderer death, offline/error routes, large text and dark mode lack complete current verification. | Host/SDK lifecycle plus source layout. | Execute the route/state matrix below; document any blocker rather than marking it passed. |

This audit visited the external reader, Home, a discussion, Save dialog, Saved, Me, Post's login form, and Search. It did not publish content, alter account settings, establish a backend connection, or submit credentials. Repeated screenshots cannot prove absence of one-frame flicker; implementation verification needs a screen recording and lifecycle traces.

## 4. Architecture and responsibility boundaries

### 4.1 Host-owned app shell

Create a generic persistent native shell around WebViews. It owns section selection, header/back controls, external browser controls, loading cover, error recovery, and safe-area/keyboard insets. Applet code owns HN DOM adaptations, feed meaning, story extraction, bookmark UI, and account/form behavior.

Declare shell metadata in `applet.json`: brand title, packaged brand asset, sections, root destinations, and optional enumerated header choices. Define and validate the corresponding structures in `crates/contracts/src/lib.rs` and `tools/check-packages.mjs`. `tools/build.mjs` must hash and bundle brand assets like other declared assets, reject traversal paths, and include metadata in the package revision.

HN sections are Home -> primary source, Search -> search page, Post -> post source, Saved -> library page, Me -> me source. Home header choices map Top/New/Past/Comments/Ask/Show/Jobs to the already known HN feed URLs. These are manifest data, not hardcoded HN strings in Java or Rust. Render the original YC image asset without tracing it in CSS; reuse/obtain the actual source mark and package it locally. Brand image decorative when adjacent title is read; combined control announces Hacker News.

Retire both applet bottom-nav renderers after the host shell works. Remove extra applet bottom padding at that point; native chrome reserves its own space. Do not leave two owners for tabs or two copies of the header. Keep legacy applets without shell metadata working with the existing generic launcher/browser behavior.

### 4.2 Distinguish route presentation from history position

Define three route presentations: customized source, packaged app page, ordinary web page. Root/detail is a separate property. A source origin's trust eligibility does not prove every path is customized.

Add optional exact path rules to each source, for example `customizedPaths`; all patterns must be explicitly defined and validated, without arbitrary regular expressions. For HN, enumerate root feeds and supported routes: `/`, `/news`, `/newest`, `/front`, `/newcomments`, `/ask`, `/show`, `/shownew`, `/asknew`, `/jobs`, `/item`, `/reply`, `/user`, `/submitted`, `/threads`, `/favorites`, `/hidden`, `/upvoted`, `/login`, `/logout`, `/forgot`, `/changepw`, `/submit`, `/formatdoc`, `/newsfaq.html`, `/newsguidelines.html`, `/lists`, `/best`, `/active`, `/leaders`, `/from`. Confirm which exist by following HN links before finalizing. Query strings select records and must be preserved. Unknown paths use ordinary browsing with a visible origin until deliberately supported.

Use one classifier in Rust. Return its result to Android through presentation commands; do not reimplement another classifier in Java. Normalize scheme, host and effective port, match exact declared origins, and keep bridge eligibility separate from shell presentation. Packaged pages are always internal. Same-site unknown pages may be ordinary without enabling new bridge privileges. Never hide the origin of a page outside declared customization coverage.

Customized roots show brand/section header and bottom tabs. Customized detail pages show a normal Back action and a human title such as Discussion or Profile, plus bottom tabs. They show no browser URL. External pages show the reader chrome and hide app tabs. Navigation into a detail from Saved retains Saved as the owning tab; opening a public profile from comments retains the originating tab. Me's own account routes belong to Me. Post authentication retains Post ownership.

### 4.3 Session and history model

Implement a host session registry keyed by applet instance + section ID. Each session owns its WebView, history, runtime generation/document/channel state, scroll, current route, and pending navigation. Do not reuse a single global bridge/channel set across retained WebViews.

Use a bounded policy: at most three resident customized section WebViews plus one external reader. Evict the least recent inactive section when necessary; never evict the visible section or a section with an active modal. Save URL/history/scroll and applet state before eviction. Hidden views are detached from the visible slot, paused, and inaccessible to touch/TalkBack. They receive no visible presentation commands. Keep the current generation/document checks for replies and add section identity where required.

Open external navigation in a child reader session with an explicit opener record: section, route/history position, scroll, and focus target. Its own Back traverses external history; at its root Back closes it. Close always returns to the opener, not the nearest feed. Replace rather than stack a second reader when an external page opens another external page. A target-blank link from customized content uses this same path.

If a retained source session changes route, use normal WebView navigation and preserve HN form POST semantics. Never convert a POST submission into a new GET load. Native/Android Back first dismisses a dialog/keyboard as appropriate, then traverses the active detail stack, then returns to the section root, then exits to launcher according to existing host policy. Test process recreation separately from rotation.

## 5. Framework loading and reveal protocol

Implement this before visual polish. Files: `BrowserAdapter.java`, `HostViews.java`, `MainActivity.java`, `android/native/src/controller.rs`, contracts, SDK `bootstrap.ts`, `runtime.ts`, `index.ts`, `protocol.ts`, and `scope.ts`.

### 5.1 State and invariants

Track one transition identity per session: generation, main-frame navigation epoch, document ID when bound, destination URL, presentation kind, commit readiness, customization readiness, visual-frame readiness, and terminal error. Increment epoch once per real cross-document navigation. Redirects remain part of the same transition but invalidate any earlier destination frame. URL equality alone is not an identity; reload of the same URL is a new document.

States: stable, loading destination, awaiting customization, awaiting visual commit, visible, failed. The reveal condition for a customized source/local page is current document committed AND SDK initial UI ready AND current visual state callback completed. For an ordinary page it is current document committed AND current visual state callback completed. Network progress 100%, history notifications, or an old runtime-ready event cannot satisfy this gate.

At the earliest accepted cross-document navigation event, synchronously place an opaque themed cover above the content and block old-page touch/accessibility. Preserve old pixels only for the unchanged tab until the user requests navigation; once the transition starts they must not leak underneath a new route. Keep the shell and Back usable. Do not expose underlying source markup while arranging shell elements.

For external links show destination origin immediately in reader chrome, keep a neutral opaque content cover until the first committed external frame, then allow the website to render normally while a slim progress indicator finishes. Do not apply HN CSS, delay on HN selectors, or inject the applet bridge in the external reader.

Deduplicate Android navigation callbacks: NavigationListener owns main-frame transition identity when available; WebViewClient supplies commit/error observations and is the fallback only on providers without that listener. `doUpdateVisitedHistory` must not start or finish a second transition. Add the epoch/document identity to presentation commands so a delayed ready command for the previous document cannot unlock the current one.

Use `WebView.postVisualStateCallback` after the necessary readiness signals. Check captured WebView identity, generation and navigation epoch again inside the callback. Keep the destination WebView attached and layout-capable under the opaque cover while waiting for its visual callback; do not put it in GONE state and then wait for a frame it cannot produce. Revoke pending reveal callbacks on redirect, navigation, retirement, timeout, renderer death, and disposal. Never reveal using a stale command merely because its WebView generation still matches.

### 5.2 SDK readiness

Allow entry activation/mount to return a Promise of void/disposer while preserving synchronous entry compatibility. Bootstrap awaits it, flushes initial watchers, confirms owned mounts/styles remain connected, and waits for a layout frame before reporting ready. For React provide a framework helper that resolves after the first committed root layout effect; do not rely on `root.render` returning. Local pages should commit their shell/loading skeleton without waiting for network records.

Creators should use one standard mount helper, not write their own timers or opacity hacks. Update HN Search, Saved, and dialogs to use it where relevant. Avoid waiting for all website images or network-idle. Await only applet-owned resources needed for the initial layout; package the logo to avoid an external asset blocking Home.

For SPA/hash/history updates preserve the visible stable document when the route does not require replacing its content. If adaptation is required, the SDK reports route readiness for that route revision. Handle BFCache pageshow by rebinding runtime state and going through a fresh reveal check. Ensure real form navigations receive the same cover even when `shouldOverrideUrlLoading` is not invoked.

### 5.3 Failures and recovery

Keep the existing timeout concept but tie it to the active epoch. On timeout or customization failure, show Retry, Back, and an explicit View original page recovery. Only that deliberate action may expose uncustomized HN. Website failures show Page unavailable with Retry/Back; applet errors show Couldn't prepare this page. Technical qualification/runtime messages belong in creator diagnostics.

Treat harmless favicon/image failures as subresource errors, not full-page failure. Handle unsupported provider, certificate errors, downloads and external schemes explicitly. Do not bypass TLS errors. Do not silently retry writes or resubmit POST on reload. Failed popups return to their opener rather than leaving a new blank reader.

## 6. HN content layout and interaction specifications

### 6.1 Layout contract

Use the existing theme colors and Verdana family. Add shared tokens for page gutter 16 CSS px, narrow gutter 12 px below 360 px, maximum readable content width 760 px, section gap 16 px, card padding 12 px, and control target 48 CSS px. Native controls use 48 dp. Wide content is centered with equal left/right outer space. “Symmetrical” does not mean centering paragraphs or removing useful reply indentation.

Set the packaged-page HTML body margin to zero in framework page styles. Apply page padding once, at the content wrapper. Me must not add its Shadow host padding on top of source body padding. Search, Saved, account forms and story lists use the same wrapper metrics. Respect IME and system insets through the native shell; do not add the same bottom inset in CSS again.

Refactor `source.css` rather than appending a new override layer. Remove obsolete header and scrolling-pill rules. Group rules by page structure, stories, comments, forms and footer. Use explicit root classes set by the applet route adapter to scope layout. Avoid global table-to-block conversion and broad last-row selectors that accidentally style login/account forms as footers.

For story lists, turn the story row and associated metadata into a logical card layout without destroying HN links/forms. Prefer CSS grid on narrowly identified rows, with title/metadata aligned, a compact vote action, and a separate Save target. Rank can be secondary metadata rather than a dedicated full-height gutter. Remove empty spacer cells only in that recognized list structure. Job promotions and comment-only lists require their own adapters, not forced story assumptions.

For discussion, remove empty leading table cells around the submission/form; align title, article action, and top-level comment body to the same content bounds. Preserve genuine thread depth using a capped indentation step of 12 px and a depth cue beyond the cap. Keep collapse, reply, parent/context and permalink controls. Bound preformatted blocks with horizontal overflow; long URLs must wrap without enlarging the viewport.

Forms retain HN actions, hidden inputs, field names, server errors and submission behavior. Style label/control rows to stack on narrow screens. Do not clone passwords or replace authentication with a custom API. Page shell surrounds login/recovery pages even when HN supplies no normal header table.

### 6.2 Tile semantics

Implement a shared HN interaction helper, used by source list adapters and React Saved cards:

- Title anchor: actual validated article URL; if no external/article destination exists, discussion URL.
- Tile blank area and metadata blank area: discussion URL for that item's ID.
- Explicit Discussion shortcut: same discussion destination.
- Save/Edit/Remove, vote, author, domain, age, collapse/reply links: their own actions, with no tile navigation.
- Enter on a focused tile discussion control opens discussion. Space should only activate if using button semantics. Expose a real focusable discussion link rather than wrapping nested interactive content in a link or button.
- Ignore non-primary mouse clicks, modified clicks, text selection, and prevented events. Respect long-press link menus.
- Inspect `event.composedPath()` so bookmark controls inside Shadow DOM cannot trigger their parent tile.
- Dispose listeners on watcher leave/update, not only on whole-page teardown. Reused DOM rows must resolve their current item identity at click time.

Do not change comments into clickable story tiles. Extend `supportedRoute` only for routes whose actual story markup has been inspected; provide separate comment/job handling. Discussion header offers Visit website only for a distinct safe HTTP(S) article URL. External navigation always passes through the host reader policy.

### 6.3 Home, Saved, Me and Post

Home brand and feed dropdown live in the host shell. Hide HN's original visual header once its account/session links have been read, while retaining the source DOM for behavior. No blank slot remains. Dropdown shows current feed, right aligns, indicates selection, and closes after selection. Preserve current feed when returning from detail. Footer retains HN information links and live announcement; hide only its search form. Do not hardcode a dated YC announcement.

Saved: remove backend/network plumbing text. Distinguish initial loading, loaded empty, loaded nonempty, refreshing, and error. Only show item counts and Load more after successful reads establish them. Preserve existing rows on refresh failure. Keep search labeled Filter this page. Persist query/category/scroll and restore scroll after rows render, not before. On reactivation refresh changed bookmark/category data without clearing working state.

Bookmark dialog: use Loading saved state while reading; show a friendly unavailable message and Retry if the service is down. After an uncertain write, reread before offering retry. Never claim Saved before the backend confirms it. Do not display connection setup or tokens to readers. Preserve revision/conflict handling and category transaction invariants.

Me is the only account entry. Auth state starts unknown while the source is being prepared. Read identity from actual HN account controls, not a cached username. Sign-in and logout refresh all retained HN sections' account view without clearing bookmarks. Use the initiating section to determine post-login return. Do not persist HN passwords or include them in debug output.

Post retains the real HN form. Replace website localStorage draft persistence with applet-scoped host storage. Store title/URL/text only. Do not store hidden tokens/passwords. Keep drafts after validation errors or auth redirects; clear only on an identified success response or explicit discard. A navigation-away warning is needed only when a draft cannot be persisted. No real post during implementation verification; keep the existing prelaunch TODO.

## 7. Applet-owned backend and automatic service provisioning

### 7.1 Keep the existing separation

Keep `src/backend.ts` calling `context.services.request('bookmarks', ...)`. Keep domain rules and SQLite transactions in `backend/store.mjs`. Host transports bounded JSON and knows service identity, endpoint, and credentials, not HN collections. No HN-specific endpoints, database schemas, or token environment names in Java/Rust.

A service contract names the logical service, development entrypoint, health endpoint, and deployment configuration reference. Store non-secret creator configuration beside the applet, for example `backend/service.json`. Validate that entry paths remain within that applet and declared service IDs match its manifest. An endpoint alone never proves the server program is running.

Use a private install-time provisioning envelope scoped to applet identity + service ID: HTTPS origin, credential reference/value delivered privately, configuration version, and optional explicitly trusted development certificate. Do not put tokens into `applet.json`, frontend bundles, APK assets, URLs, documentation, or version control. Keep native Keystore encryption. The current manual editor can remain as a creator troubleshooting tool, not the standard reader path.

### 7.2 Concrete local development workflow

Add a generic creator command in `tools/` with documented invocation accepting an applet directory and selected Android device. It should:

1. Read and validate that applet's service declaration.
2. Create/reuse a private per-developer directory outside tracked source for database, generated service token, TLS key/certificate and process metadata. Permissions 0700 on directory, 0600 on private files. Never print tokens.
3. Run the declared backend using the pinned Node executable, passing environment via process options. Persist its database across restarts. Detect occupied ports and an existing managed process; do not kill arbitrary processes.
4. Serve HTTPS. Add optional certificate/key configuration to HN's existing Node server, or wrap it in a generic HTTPS proxy. Choose Node HTTPS support here because it avoids installing a separate proxy for local development.
5. Use `adb reverse` so the selected device reaches a loopback HTTPS endpoint. Certificate SAN must match that endpoint hostname. Provision trust only for that declared development service in debuggable builds; keep hostname verification enabled. Never install a global trust-all manager or disable WebView certificate checking.
6. Wait for authenticated service health, then provision the connection through a debug-only private host import channel. An `adb run-as` private-file import is sufficient for this prototype; validate every field, encrypt the token, atomically commit settings, delete the one-time file, and acknowledge success without echoing secrets. Reject this path in release builds.
7. Run a read-only applet service smoke request through the installed host and report ready. A ready app launch must not defer missing-configuration discovery until a reader taps Save.
8. Provide explicit stop/status commands. Stop only the managed process; preserve database and credentials. Document that restarting the phone may require restoring the development reverse tunnel.

For production/self-hosting, accept a configured HTTPS origin using normal platform trust and secure installation-time credentials. No need for a different frontend or a different bookmark protocol. Configuration replacement must be atomic; origin changes require new credentials and must not reuse an old certificate. Remove developer trust on disconnect/reconfiguration.

For a separately running phone backend, the same endpoint/provisioning contract applies. Check hostname/certificate validation and service reachability. Do not claim that the Node process automatically runs inside Android. A managed phone runtime, process limits, storage lifecycle and background restrictions need a dedicated follow-up if requested.

### 7.3 Error and readiness contract

Keep distinct machine-readable service errors for missing configuration, authentication failure, unreachable service, timeout, invalid response and application conflict. SDK provides a standard user-safe presentation helper; creator diagnostics retain the actionable technical cause. Missing configuration is an installation readiness failure. A service becoming unavailable later is an ordinary recoverable data error and must not disable navigation.

Do not automatically switch storage authority or retry uncertain commits. Do not import the existing device SQLite database without an explicit migration operation. Verify both fresh local backend data and persistence after server restart. Health checks must not modify bookmark data.

## 8. Implementation work packages and stop conditions

| Order | Component/files | Deliverable and check before commit |
| --- | --- | --- |
| 1 | Contracts, `tools/check-packages.mjs`, `tools/build.mjs`, HN manifest | Declarative shell, section and route metadata; service declaration validation; old manifests remain compatible. Run package checks, TypeScript and Rust checks. |
| 2 | `controller.rs`, contracts, `BrowserAdapter`, `HostViews`, `MainActivity` | Single route classifier and persistent shell; customized detail Back versus external browser chrome. Verify Home/comment/profile/login/packaged/external routes. |
| 3 | Same host files plus SDK bootstrap/runtime/scope/index/protocol | Navigation-specific loading/reveal gate and React first-commit helper. Verify cold/warm/redirect/Back/reload/error with recording. Do not proceed with known raw-page flashes. |
| 4 | Host controller/session registry and Android WebView ownership | Bounded retained section sessions and external opener restoration. Verify tab round trip, Close, process recreation, memory eviction, modal and keyboard Back. |
| 5 | HN `source.css`, theme/styles, main/extract-item, navigation, library, search, me, post, story dialog | Shared spacing, story semantics, header migration, form/comment adapters, stateful Saved and safe drafts. Remove superseded CSS/renderers. Verify visual matrix. |
| 6 | ServiceClient, creator tooling, applet service declaration, backend/server, SDK service error helper | Local HTTPS backend with automatic development provisioning; secure remote endpoint compatibility. Verify actual save/read/edit/remove and restart. |
| 7 | Current architecture/operating docs, TODOS and final verification record | Document exact setup command and real limitations; update obsolete manual-setup guidance. Run all applicable gates and device matrix. |

Do not start broad rewrites outside these boundaries. Preserve the existing Rust lifecycle and bridge trust checks as the foundation. If a named API differs in the checked-out version, inspect its definition and adapt the call without weakening the specified invariant.

## 9. Verification matrix and exact expected outcomes

Use a disposable local bookmark database for destructive CRUD checks. Never publish an HN story, comment, vote, hide/favorite action, or account change just to test UI. Account navigation can be inspected without submitting changes. Obtain credentials privately when necessary and never write them into artifacts.

| Scenario | Pass condition |
| --- | --- |
| Cold launch of Home | Branded header and loader appear immediately; first source frame is customized. |
| Home -> tile background | Discussion opens once; correct item; no external reader chrome; tabs remain. |
| Home -> title | External reader opens once with actual origin; no Home pixels under destination. |
| Title without article | Correct HN discussion opens; no fabricated external URL or Visit action. |
| Save/vote/author/domain controls | Each keeps its semantics; no accidental tile navigation. Inspect mutation controls without submitting. |
| Discussion -> Visit -> redirects | Browser origin follows actual destination; bridge remains absent; Close restores exact discussion/scroll. |
| Saved -> discussion -> external -> Close -> Back | Return to discussion, then Saved with category/query/scroll retained. |
| Every feed option and pagination | Correct URL and current choice; no broken Jobs/comment-list adaptation. |
| Me -> login/recovery/profile | App chrome and equal margins; no browser URL bar for customized paths. |
| Post -> login -> submit | Return to Post, real HN form intact; draft survives tab switch and failed validation. Do not submit real content. |
| Search/Saved first React mount | First visible frame includes local shell/skeleton; no default-body flash. |
| Backend fresh install | Save and Saved work without opening Service connections. |
| Bookmark CRUD and categories | Save, read, edit category, remove, reload; correct confirmed state in list/detail/library. |
| Backend stopped/restarted | Friendly recoverable data error; tabs usable; data persists after restart; Retry works. |
| Invalid token/certificate/wrong service | Request rejected; no secret leakage or fallback to another database. |
| Slow page/redirect/back during load | Only current epoch can reveal; never an old callback displaying a superseded page. |
| HTTP error/offline/customization error | Correct recovery state; Back remains available; original UI requires explicit recovery choice. |
| Hash/SPA/BFCache | No unnecessary full reload; appropriate adaptation readiness; no stuck cover. |
| Popup/download/mailto | One predictable destination or explanation; no blank window or duplicate history entry. |
| Rotation/process recreation/renderer death | Active route/state restored or clear recovery; no crash or endless loading. |
| 320/360/412 px, landscape/tablet, 200% text | No horizontal page overflow, clipped controls, mismatched gutters, or bottom occlusion. |
| Dark mode/reduced motion/TalkBack | Readable contrast; named controls; no hidden document focus; loading announced once; focus restored. |

Record a screen capture for Home -> comments -> external -> Close -> Saved -> Me -> Post -> Home, and repeat key transitions with a deliberately slowed connection. Inspect frame-by-frame for raw markup, stale frames and blank frames. Log transition IDs and readiness milestones in debug mode only, excluding query secrets, credentials and form contents. A screenshot of the final frame alone does not pass the flicker requirement.

Run existing project verification from the workspace root: `npm run typecheck`, `npm run check:packages`, `cargo check --workspace`, and applicable existing Rust tests. Use `node --check` on changed backend/tool scripts. Run Rust formatting/clippy for changed Rust modules as documented by the repository. From `android/`, run `./gradlew :app:assembleDebug :app:lintDebug` with configured toolchains; use offline mode only when dependencies are already cached. Run `git diff --check`. Do not add or modify test files without authorization.

## 10. Completion and handoff requirements

All P01-P18 items must map to a delivered change or an explicitly documented verification limitation. Core local saving, story tap behavior, internal/external navigation distinction, and no-flash reveal are required outcomes; do not move them to a future TODO to declare completion. Authenticated verification may be blocked on credentials or service behavior, but report it precisely.

The final implementation report must list commits, changed responsibilities, actual device evidence, commands run, and unresolved limitations. Keep the real-post prelaunch TODO. Never equate HTTPS endpoint support with a shipped phone backend runtime. Do not claim deployment to a server that was never provisioned.

Design references used: project `.skills/apple-design-skill/references/hig/layout.md` on alignment, consistent margins and adaptable layouts; `tab-bars.md` on persistent top-level destinations and visible unavailable sections; `toolbars.md` on distinguishing navigation from content actions; `web-views.md` on browsing controls. Apply Android target sizes and Back behavior. The exact spacing tokens and native shell ownership in this plan are product/engineering decisions, not quoted Apple requirements.
