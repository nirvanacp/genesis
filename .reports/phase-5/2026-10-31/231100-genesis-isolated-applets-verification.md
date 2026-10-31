# Genesis isolated applets verification

Date: 31 October 2026. Scope: platform API 3/schema 2, SDK/tools 0.4.0, Hacker News and X, and the portable factory workflow. This records exercised journeys and limits; it does not certify every possible upstream website variant.

## Delivered architecture

Every new applet must declare exact-origin ordered route contracts, a mandatory unmatched outcome, hidden adapters and an owned packaged foreground. The native source view stays below an opaque backing, muted and excluded from focus/accessibility. Loading, errors, unknown routes and renderer recovery never reveal it. Adapters publish bounded validated data; only the foreground owns service/storage/UI capabilities. Commands require the current source epoch.

Original websites use explicit native provider presentation. The exact live source can be adopted after adapter retirement; other URLs use an independent bridge-free reader. Native chrome identifies the actual origin. View/session identity protects file pickers, fullscreen, popups, loading callbacks and Close. Hidden source navigation cannot replace a reader, and late foreground navigation cannot replace an open provider. Close revalidates changed/unready/source-origin sessions. Foreground failure behind a reader revokes the failed document and recreates it on return.

API-3 source observation uses timer batches rather than display frames. The final Saved regression demonstrated why a deliberately occluded source cannot depend on animation-frame scheduling. Foreground/legacy effects retain frame scheduling. Source account observations cache only successful identities.

## Final environment and artifacts

- Branch `proto/phase-5`; Android emulator `emulator-5554`, Medium Phone API 37 arm64; WebKit 1.18.0; JDK 17; Node 24.15.0 and npm 11.14.1.
- Normal debug host `app.nirvana.genesis`, updated in place with cookies and records retained. HN remains APK-selected by `genesis.packages.json`; X remains development-installed in that same host. Hidden pre-existing development packages were preserved.
- HN revision `2df9abb6a012051156fd825f72cdff5937ddceb12221e6ecee937f0aa0998d02`.
- X revision `3856c01243dbee5e2d126bf785a7aa642cc9666aa907877be7098df27c8dca92`.
- Normal APK: `android/app/build/outputs/apk/debug/app-debug.apk`. Portable SDK/tools archives were packed into `/tmp/genesis-final-artifacts-2310/`. Temporary source, fixtures and screenshots stayed outside the repository; private account/post content is not included in this report.
- A host emulator graphics crash required a cold boot with software graphics and existing AVD userdata. This was separate from the deliberately exercised app renderer termination. Service tunnels were reprovisioned; no backend was started or stopped by this task.

## Actual emulator journeys

| Area | Exercised result |
| --- | --- |
| HN feeds | Launcher to owned feed, successive feed chooser selections including Comments/New, root chrome retained, domain-filter feed |
| HN stories and discussions | Actual title opens the destination article, article origin/Close, explicit discussion, comments, collapse, author/profile, parent/context/story navigation and Back |
| HN Saved | Existing Saved story and categories retained; save, assign/filter, create category, edit with keyboard, read-back and removal of known temporary records |
| HN account/submission | Owned signed-out Me, sign-in/forgot-password actions, explicit original submit/login form, no credentials entered, Close and return to Saved |
| HN failed source | Failed refresh retained bounded public content with an explicit stale notice; network restored; original DOM stayed hidden |
| X Home/discovery | Authenticated Home/Following, Explore/Trending, actual trend/search results, typed public search with actual posts and observed result tabs, source commands and native Back |
| X notifications | Notifications/Mentions; an actual notification reaches its actual owned post rather than a generic fallback |
| X profiles/collections | Observed signed-in Profile, public profiles, people links, original follow/management actions, observed list-card activation to actual collection metadata/posts |
| X post/media | Owned post and selected-photo view, photo identity filtering, View post, original media provider and Close |
| X Saved/Categories | Bookmarks/Likes/Categories; private account verification, category editor, receipt-backed save/read-back, known temporary post cleanup, original records retained; management and Back |
| X composer/upload | Original composer, temporary unsubmitted text, Stay retains text and Leave discards that view; reopening showed no temporary QA draft; real file picker opened and was canceled without file selection/upload |
| X service outage | Removing only the emulator reverse tunnel produced an explicit Categories unavailable state; the tunnel was automatically restored and the same library recovered without deleting records or replaying a write |
| Recovery | Simulated creator failure and actual WebView renderer termination show opaque native recovery; Retry recreates the interface; subsequent owned navigation works |
| Isolation | Hidden source virtual accessibility is suppressed after website load; owned controls remain exposed; source mute is supported; opaque native backing and provider adoption/Close were pixel/component checked |

The final accessibility smoke check found one owned X WebView branch. Chromium exposes a nested virtual WebView root under its native wrapper, so the audit counts independent branches rather than treating two nested nodes as two source documents. Both nodes contained the owned controls, with no separate source-navigation branch.

The final normal host was restarted with inspection disabled. Both rebuilt applets loaded; X Saved/Categories no longer needed inspection to advance observation. HN's final Saved view showed the original story and two original categories. Final X storage retained two saved rows and two categories; neither known disposable test author remained. Uncertain or pre-existing records were not deleted merely to force a count.

The native website dirty check is conservative and can request Stay/Leave even after a canceled picker. The explicit decision was exercised; no post, vote, follow, message, account change, subscription or upload was submitted.

## Synthetic checks, separately qualified

A disposable API-3 package in a separate QA host verified plain target-blank foreground links through native routing, external origin/Close, and hidden source history changes while the external reader retained its origin. Close restored a freshly validated opener. These establish framework behavior, not authenticated third-party popup compatibility.

A temporary verifier importing the actual Rust reducer and both actual bundles passed declaration registration, source service denial, publication, stale command rejection, independent-reader source updates, source navigation deferral, reader replacement rejection, adoption retirement, unique-session stale Close rejection, foreground failure/recreation and eligible GET restoration. It excluded storage execution. Another temporary runtime verifier withheld every animation frame and verified initial/mutation source observation plus cancellation on disposal. No repository test files were added or changed.

## Build and authoring verification

| Check | Outcome |
| --- | --- |
| `npm run typecheck` | Passed across SDK, tooling and all workspace applets |
| `npm run check:packages` | Passed selected HN package; separate CLI checks passed HN and X |
| Both applet CLI builds | Passed, revisions above |
| `cargo clippy -p genesis-android --offline -- -D warnings` | Passed |
| Existing Rust check/test commands | Passed earlier; existing suites contain zero tests, not unit coverage |
| Temporary resolver verifier | 33 JavaScript/Rust parity cases, schema-2 round trip, 13 rejected declarations passed |
| Normal Android `:app:assembleDebug :app:lintDebug --offline` | Passed for final normal package |
| Both backend `node --check` and factory server `--check` | Passed; ports/scripts valid, no servers started |
| Packed SDK/tools create/check/build | Passed fresh vanilla and React projects using unpacked archives and existing dependencies |
| Portable factory comparison | All 11 instruction/guide/skill files checked were byte-identical to current factory sources |
| Markdown links / whitespace | Current local links and `git diff --check` qualified before final commit |

Fresh creator projects require the route/foreground declarations. Source authoring types deny services/storage/UI and require command epochs; native checks independently enforce roles. The exported kit includes the updated contracts, navigation, provider, lifecycle and verification guidance. Archives remain local artifacts, not registry releases.

## Cleanup and handoff

The disposable `app.nirvana.genesis.isolationqa` host was uninstalled; task fixtures never entered the everyday launcher. Diagnostic adb forwarding on 9229 was removed. The final normal APK was installed in place, with HN/X development revisions retained. Service tunnels on 8787/8788 remain available. Original account cookies, hidden pre-existing packages and backend records were retained. Known temporary applet records were removed; no uncertain existing record was deleted. The emulator remains running.

## Boundaries still requiring qualification

- HN Search retains its explicitly documented existing placeholder. The migration did not introduce a separate search integration.
- Real posting, voting, following, sending messages, account/subscription changes and uploaded media were intentionally not submitted. Their original website forms are reachable, not end-to-end mutation certified.
- No guarantee of arbitrary opener-dependent authentication popups, camera/microphone permission workflows, every protected/Premium media variant, localized markup, or every future X/HN website change.
- Physical devices, a full TalkBack session, large-text/theme/reduced-motion combinations and long-duration performance/memory measurements are not certified by this emulator pass. Touch/keyboard, inspected accessibility exclusion and visible layouts were checked.
- Website JavaScript/form/POST state and in-memory Back/scroll stacks are not durable across process death. Existing local draft records are preserved but are not automatically injected into original HN forms. No uncertain upstream action is replayed.
- Whole-repository Rust formatting still reports pre-existing differences in untouched `controller.rs`; changed Rust files were formatted. No unrelated formatting was committed.

Current implementation guidance: [maintenance](../../../.docs/phase-5/2026-10-31/194740-genesis-isolated-applet-maintenance.md), [factory isolation contract](../../../factory/guides/isolated-applets.md), [runtime architecture](../../../.architecture/browser-runtime.md), [implementation plan](../../../.plans/phase-5/2026-10-31/171848-genesis-isolated-applet-architecture-plan.md).

## Component commits

- `9b52819` feat/(architecture): plan isolated applet foregrounds
- `622059f` feat/(contracts): define isolated applet route contracts
- `902fc68` feat/(android): add verified native isolation container
- `733d739` feat/(runtime): connect isolated applet foreground and website provider
- `6032b0f` feat/(factory): require isolated source and foreground customization
- `6af055f` feat/(sdk): scope internal owned screen lifetimes
- `bbb4925` feat/(navigation): route owned anchors and retire adopted adapters
- `a3b78de` feat/(foreground): retain native focus for owned applet input
- `8001880` feat/(hn): migrate browsing and saved flows to owned foreground
- `9ead0fe` feat/(x): migrate browsing and categories to owned foreground
- `9ca9568` feat/(runtime): guard website drafts and recover isolated documents
- `a14d0ee` feat/(hn): preserve comment navigation and failed refresh content
- `38dfde9` feat/(tooling): scope live WebView inspection to explicit debug visits
- `9d448fb` feat/(x): qualify owned media and notification navigation
- `7462e7b` feat/(navigation): retain root controls across feed transitions
- `15a9ae5` feat/(sdk): enforce source authoring roles and complete starter recovery
- `ce45593` feat/(hn): retire obsolete mixed-document customization helpers
- `0e94309` feat/(docs): document the current isolated applet architecture and workflow
- `3ba4f77` feat/(x): preserve individual collection and profile navigation
- `8cce82f` feat/(hn): preserve article titles and domain feed navigation
- `5bfa6ce` feat/(runtime): bind reader callbacks and sessions to visible ownership
- `139acdf` feat/(sdk): observe hidden sources independently of display frames
- `610532d` feat/(x): retry incomplete account observations and label search
