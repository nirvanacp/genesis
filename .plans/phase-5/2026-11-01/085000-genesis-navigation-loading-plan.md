# Genesis source loading and recovery plan

Status: implementation delivered; targeted verification passed with the explicit qualification limits in the [repair report](../../../.reports/phase-5/2026-11-01/091700-genesis-loading-repair-verification.md). Project: Genesis SDK/Android runtime, X applet and portable factory. Phase: `phase-5`, from `proto/phase-5`. Created 1 November 2026, Asia/Kolkata.

## Problem and intended result

Ordinary X navigation sometimes displays website/retry recovery while the website is still assembling its content. The [live investigation](../../../.reports/phase-5/2026-11-01/085000-genesis-navigation-loading-investigation.md) reproduced this on public profile and typed-search navigation. The adapter mistakes a complete HTML document without X's content column for an unsupported page. The foreground then renders that incorrect state. A genuine offline source failure was separately reproduced.

Normal supported navigation must proceed from an immediate owned shell/loader to valid content or an affirmative empty result, without intermediate recovery instructions. Actual failures must remain actionable, and indefinite loading must have a deadline. A user must not need Retry to get through ordinary SPA initialization.

Preserve the user's approved X design, fonts, bottom navigation, pull-to-refresh, correct primary roots and viewport reset. Keep one X and one HN launcher entry, stable applet/source/page/service identities, backend authority and existing records. Keep hidden sources muted, inaccessible and behind the native barrier. Website presentation remains explicit.

The initial task delivered this plan. The user subsequently authorized implementation, now delivered in component commits. The steps below preserve the intended behavior and verification criteria. No blocking product decision remains; timeout and presentation choices below are engineering decisions, subject to real verification.

## Governing context and exclusions

Read root and factory AGENTS, [current maintenance](../../../.docs/phase-5/2026-10-31/194740-genesis-isolated-applet-maintenance.md), [runtime architecture](../../../.architecture/browser-runtime.md), [X architecture](../../../.architecture/x.md), [API-3 contract](../../../factory/guides/isolated-applets.md), [SDK reference](../../../factory/guides/sdk-reference.md), [patterns](../../../factory/guides/patterns.md), [verification](../../../factory/guides/verification.md) and the relevant factory skills before implementation. Follow the project Apple design skill for general loading/feedback/accessibility principles translated to Android, and project unslop for prose.

This plan supersedes immediate missing-selector recovery and hidden-source frame-readiness assumptions in the [earlier isolation plan](../2026-10-31/171848-genesis-isolated-applet-architecture-plan.md). That plan's document isolation, authority, explicit provider and data-preservation requirements remain. Current architecture and the latest user decisions govern over its outdated implementation-status paragraph. The November [UX report](../../../.reports/phase-5/2026-11-01/065059-x-ux-repair-verification.md) remains evidence for its stated settled behavior, not for absence of transition flashes.

Exclude redesign, new X features, website API reverse engineering, prefetching, permanent background sources, universal site selectors, new persistence/backend schemas, account mutations, blanket automatic retries and a new UI engine. HN receives only the same incomplete-observation correction and shared-runtime regression checks. YouTube stays inactive. Do not edit AGENTS or add/modify repository tests without an explicit coverage request.

## Ownership and contract

The immediate defect belongs to X. A platform overlay cannot determine whether X has finished rendering. The framework must provide reliable lifecycle, bounded loading and diagnosable failure reasons; the applet must provide website-specific evidence. Both are needed for a reusable solution.

Retain the current `SourceSnapshot.state` values and `context.source.publish/subscribe` API. No new navigation method or `pending` wire state is needed. Use `loading` for an unresolved observation. Keep three different concepts separate: foreground mounted, adapter activated, and source content ready. `runtime.ready` means only activation completed for its role.

| Observation or event | Accepted state and UI |
| --- | --- |
| Matched custom route, content not yet identified | `loading`; destination shell/skeleton; no failure/retry/provider demand |
| Valid route-specific content, including a usable partial profile | `ready`; render valid sections, keep unfinished sections in their own loading state |
| Affirmative empty marker or validated completed empty structure | `empty`; ordinary empty screen, no error styling |
| Explicit sign-out or challenge evidence | `auth-required` or `challenge`; appropriate explicit website action |
| Unmatched route or affirmative unsupported content | `unsupported`; honest website fallback; no claim that a network retry will fix route coverage |
| Declared website route | `website`; deliberate action-specific provider landing |
| Blocked destination | `blocked`; Back/safe navigation; no button that retries the blocked destination |
| Actual network, HTTP, source-site or adapter failure | `error`; appropriate recovery, same-route validated prior content when safe |
| Pending content exceeds 15 seconds | `error` with `SOURCE_TIMEOUT`; Retry/Back/Open website. Later valid content may recover automatically |

Absence of a selector, absence of a spinner, `DOMContentLoaded`, `load` and `document.readyState === 'complete'` are not affirmative failure or semantic-readiness evidence. A site may legitimately render between these observations. Do not add an arbitrary one-second minimum loader or debounce all errors. Real errors and sign-in requirements must not be concealed.

### Additive failure information

Extend existing publication/error types in `packages/sdk/src/runtime.ts` and exports in `src/index.ts`. Keep `message` required and existing callers compatible; add optional fields:

```ts
interface SourceProblem {
  message: string;
  code?: 'NETWORK' | 'HTTP' | 'SOURCE_TIMEOUT' | 'ADAPTER_FAILED'
       | 'SOURCE_RENDERER_FAILED'
       | 'UNSUPPORTED_ROUTE' | 'CONTENT_UNRECOGNIZED'
       | 'UPSTREAM_FAILURE' | 'ADAPTER_NOT_IMPLEMENTED';
  retryable?: boolean;
  origin?: 'host' | 'adapter'; // assigned by host, not accepted from adapters
}
// SourceSnapshot.error uses SourceProblem.
// The source publication input omits origin.
```

Export a named `SourcePublication<T>` for the existing publish input and document these semantics. A failure message is user-safe fixed copy, not exception text or a raw upstream button label. New adapters provide `code` and `retryable` for errors/unsupported results. Legacy `{message}` and reasonless unsupported publications remain accepted for compatibility; the host must not guess they are loading. Foregrounds with older hosts still render the existing state/message fallback when optional fields are absent.

Rust validates known codes, booleans, a bounded 1,024-character message and compatible states. Reject invalid publication metadata through the existing RPC error path; do not forward arbitrary nested fields. The host overwrites origin as `adapter` for accepted source publications and `host` for its own decisions. Do not expose raw URL query strings, source text, tokens or exception messages in diagnostics. Keep the existing envelope limits and channel/epoch authority.

No generic readiness detector or redundant publisher wrapper is introduced. The existing API can express the needed states once their semantics are explicit. The factory must carry an executable observation pattern, and applet classification must be factored into readable functions instead of a terminal fallback ternary.

## Ordered implementation and commit boundaries

Each step requires its own concise development changelog, appropriate checks and commit before the next dependent component. Use `feat/(module): ...` messages and the configured author email. All paths below are relative to the workspace root. Do not commit generated SDK bundles or temporary device evidence containing private content.

### 1. SDK activation and typed failure contract

Files: `packages/sdk/src/bootstrap.ts`, `src/runtime.ts`, `src/index.ts`.

In `bootstrap.activate`, branch on API 3/source. After registration, adapter activation and initial observer reconciliation, report source runtime readiness without awaiting `initialLayout` or any animation frame. Retain the frame/layout gate for owned foregrounds. Adapter readiness does not publish content-ready data. Preserve disposal checks before and after asynchronous activation and registration.

For a source, do not let the five-second creator timer include waiting for the document body. Clear the hello timer once a source role is bound, and start its five-second adapter-activation timer after body readiness, before registration/activation. The host's independent 15-second source deadline bounds unbound/no-body visits. Foreground startup retains its current five-second gate. Retirement/disposal must clear both timer paths. Never grant source presentation to avoid scheduling throttling.

Add the optional `SourceProblem`/`SourcePublication` types above. Keep method signatures and queue acknowledgement semantics compatible. A rejected source publication must still be surfaced as adapter failure, not swallowed.

Verification from root: `node packages/sdk/build.mjs`, `npm run typecheck`. Use a temporary, uninstalled diagnostic harness to exercise source activation with animation-frame delivery withheld, source body readiness delayed and activation throwing; prove activation readiness does not require frames, foreground still does, and disposal prevents late readiness. This is component evidence only. No repository test additions. Commit `feat/(sdk): separate source activation from visual readiness`.

### 2. Platform source lifecycle, deadlines and diagnosis

Files: `android/native/src/isolated.rs`, `android/app/src/main/java/app/nirvana/genesis/IsolatedBrowser.java`; update `.architecture/browser-runtime.md` and current maintenance guidance when behavior passes.

Replace the single Java navigation timer with a reducer-owned pending interval. Add a monotonically increasing deadline token plus pending/timed-out state to `IsolatedHost`. Emit a private `isolatedSourceDeadline` command containing generation, epoch, token and a 15,000ms delay. Java schedules the corresponding `isolatedSourceTimeout` event with the captured identity. It contains no site-specific semantics.

Begin an interval when a matched custom visit starts, and when a settled same-document source first publishes loading again. Repeated loading publications must not reset or extend that interval. Store a monotonic deadline instant as well as the token. A redirect within the same source visit retains the remaining budget; a new explicit visit gets a fresh epoch/budget. Any accepted settled result cancels the active token. Stale generation/epoch/token callbacks are ignored. At expiry, emit `SOURCE_TIMEOUT` once. Ignore later unresolved/loading observations for that expired interval so they cannot oscillate back to a spinner; accept a later valid ready/empty/auth/challenge/affirmative unsupported result. Explicit Retry starts a new visit and clears the timed-out state. Do not schedule content deadlines for website/blocked/unmatched routes or while an adopted source is revoked; provider Close follows existing revalidation rules. On Activity suspension, pause the interval by storing its remaining duration and invalidating its token. Resume with that remaining duration and a fresh token, so time spent outside the app does not produce an immediate timeout. Independent website presentation retains the current hidden-source policy; Close revalidates an unresolved source as today.

`isolatedSourceError` should preserve a bounded failure category. Java supplies fixed codes for main-frame network/HTTP/renderer failures, never page text. Rust emits `error` with host origin and appropriate retryability. Source `runtime.error` becomes `ADAPTER_FAILED`, not unsupported. It must settle the deadline and revoke the failed adapter's delivery authority. Foreground runtime failures keep the existing native opaque recovery. Declared route failure gets `UNSUPPORTED_ROUTE`, retryable false. Adapter `error`/unsupported metadata is normalized as above. Loading/ready/empty replacements clear obsolete problem metadata.

Once an interval has settled as a failure, later loading alone must not erase that failure; only a new visit or affirmative result can clear it. A ready snapshot after a source-site error can recover without automatic reloading. Preserve publication rate/size bounds. Do not add host caches of applet data or reinterpret an applet's selectors.

Add a debug-only bounded ring of the last 64 lifecycle transitions to the existing Inspect current document flow. Record elapsed time, generation/epoch, role, declared route ID, previous/next state and fixed problem code/origin. No raw URLs, query values, models, usernames or messages. Clear on applet exit. Route the existing debug-only Java `inspect` action through a private `isolatedInspect` event and `isolatedDiagnostics` reply command so Rust can provide its ring to the existing native dialog; preserve the explicit enablement of local inspection. This makes later failures attributable without inspecting private page contents. Do not introduce a user-facing diagnostic workflow or a new public RPC.

Verification from root: `cargo clippy -p genesis-android --offline -- -D warnings`, `cargo test -p genesis-android --offline`; the native target currently has zero unit cases, so report compilation separately. From `android/`: `./gradlew --offline :app:assembleDebug :app:lintDebug`. After an in-place debug install, use existing diagnostic controls plus a temporary non-delivered harness for deadline/token ordering, loading after timeout, old-epoch callbacks, adapter failure, foreground failure and provider-close revalidation. Verify HN and X launcher entry and native Back remain usable. Commit `feat/(android): classify and bound source loading failures`.

### 3. X evidence-based observation and presentation

Files: `factory/applets/x.com/src/main.tsx`, `src/view-model.ts`, `src/app.tsx`; add focused `src/source-state.ts` and `src/components/source-state.tsx` if needed to separate classification and rendering. Preserve existing CSS/theme unless a state requires a small addition. Update applet README and `.architecture/x.md` after verification.

Replace both missing-content-to-unsupported branches in `main.tsx`. For a known route, an absent primary column or temporarily empty unrecognized structure publishes loading. Use affirmative inspected sign-in/challenge/error signals before this fallback. Missing account identity or a temporary login placeholder during hydration is not proof of signed-out state. An upstream Retry button alone should not supply the user-facing message; inspect its containing error region and publish `UPSTREAM_FAILURE` with fixed copy when a real failure is established. A profile header may be ready while posts load; this must not turn an unfinished post list into an empty or error state.

Keep route-specific validity in the applet. For conversations require the requested post ID or an affirmative unavailable-post result; for profiles require the requested handle's header; for media validate post ID/index and overlay; for search validate the destination query/tab context before accepting its items. Other feeds require actual entries or affirmative empty evidence. Keep route-specific content identity in the bounded X model where the foreground needs to recheck it: optional `contentIdentity` with `url`, `selectedTabKey` and, for focused content, `postId` or `profileHandle`. Bound strings and validate exact destination/query identity in `validModel`; strip this metadata from diagnostics. This is applet data, not new host authority. Do not manufacture a content identity from the target URL when the source DOM still shows a different item. `validModel` checks structure, not semantic readiness: add a separate route-content predicate and use it both before publishing and before accepting foreground content. Inspect actual DOM for any new evidence selector rather than inventing one. When evidence cannot be established, remain loading until the host deadline instead of guessing unsupported.

Keep observation scheduling and cleanup managed. Reset command targets when destination/content-tab identity changes, even when URL or screen kind stays the same. Do not dispatch commands against targets from an earlier observation. Publish loading when a read/tab transition has no valid destination content yet; the framework owns the pending deadline. Empty results need a validated empty marker. Explicit malformed parameters/unmatched routes may settle unsupported immediately; prolonged missing markup alone ends as a timeout.

In `app.tsx`, replace the current combined `ready` expression with explicit presentation selection. A non-null empty model shell on an error is not prior content. Track the last validated ready/empty result separately from the merged scrolling window, keyed by source, exact URL including query/hash, selected content tab and confirmed account. Only use it for the same destination; never render another profile/post/query while waiting. Same-route refresh may retain safe prior content, but private content stays hidden until current account validation permits reuse. Account change/sign-out clears private caches and disables account-dependent actions. Preserve existing backend account ownership checks.

Reset the merge window for refresh as today while retaining a separate safe last-valid presentation. Render refreshing/stale feedback only if there is real retained content. Without it, render the destination skeleton or honest full error state. Retry performs a source refresh; Open X remains an explicitly different provider action. An unsupported route presents a website action and Back, without a misleading network Retry. Auth/challenge/blocked/website states receive their own copy and actions. Do not copy technical error codes into reader UI.

Create the destination header from route/shell metadata before content is ready. Explore/search retains its search form and query during loading. Use existing fonts, spacing and colors. Keep the native footer available, `aria-busy` on pending content and a polite status region; avoid repeatedly announcing identical loading text. Reduced-motion users receive a static placeholder or restrained indicator. No artificial success delay.

Update refresh completion so it resolves on the replacement visit's actual settled outcome, not an incomplete observation or dispatch acknowledgement. Navigation away/disposal cancels cleanly; same-document tab transitions use their own destination identity. Replace the competing 25-second refresh error copy with a watchdog only for missing host delivery, longer than the 15-second host deadline; use 20 seconds and a fixed communication-failure message. The host outcome remains authoritative in ordinary operation.

Categories keeps its separate service read/error/empty logic. While source account validation is pending, show account-verification loading, not an instruction to reopen X. Account rejection and backend failure remain explicit and must never become empty categories. Do not change data authority or retry writes.

Verification from root: `node packages/applet-tools/src/cli.mjs check factory/applets/x.com --json`, `node packages/applet-tools/src/cli.mjs build factory/applets/x.com --out /tmp/genesis-x-loading-fix --json`, workspace typecheck. Install with the checked-in CLI's `dev install ... --device emulator-5554 --replace --json`. Run the acceptance matrix below, particularly the two recorded reproductions. Commit `feat/(x): keep incomplete source observations loading`.

### 4. HN adoption and shared-runtime regression

Files: `factory/applets/news.ycombinator.com/src/main.ts`, `src/app.tsx` only where needed, README and `.architecture/hacker-news.md`.

Apply the same pending-versus-affirmative distinction to missing `#hnmain`, incomplete profile fields and unfinished discussion/feed structures. Retain immediate unsupported for invalid route parameters, and actual empty tables as empty. Preserve HN's existing public last-page cache and its backend behavior. Do not implement its intentionally unfinished Search feature. This is a preventative adoption of the same pattern found in code, not a claim of a live HN reproduction.

Run standalone HN check/build and real feed, comments, profile, Saved and article/provider return checks on the shared host. Use the same no-false-recovery transition criterion. Commit `feat/(hn): distinguish incomplete source markup from failure`.

### 5. Factory guidance, starters and compatible artifacts

Files: `factory/guides/isolated-applets.md`, `sdk-reference.md`, `patterns.md`, `verification.md`, `design.md`; `factory/skills/genesis-build-applet/SKILL.md`, `genesis-customize-applet/SKILL.md`, `genesis-verify-applet/SKILL.md`; `packages/applet-tools/src/create.mjs`, `src/kit.mjs`, package manifests/lockfile and version labels in maintained delivery guidance. Do not edit AGENTS.

Add the observation/state table and a small portable example showing valid-content, affirmative-empty, real-failure and otherwise-loading branches. Explicitly forbid using missing selectors, missing spinners or document completion as terminal failure. Require applet route inventories to describe readiness/empty/auth/error evidence as well as URLs. Preserve factory ownership rules: authors use public APIs; platform bugs get a minimal reproduction rather than site-specific native patches.

Update both vanilla and React starter foregrounds to distinguish loading, ready, empty, failure and deliberate website/unsupported routes. The unimplemented source starter should honestly publish `ADAPTER_NOT_IMPLEMENTED` with developer-oriented README instructions; do not pretend it is a functioning adapter or leave it loading forever. Separate that scaffold placeholder from the recommended implemented observation example.

Build/customize skills must require state-transition design and the public contract. Verify skill/guide must require a transition trace or recording, normal and slow-loading navigation, real failure controls and no manual retry during ordinary loading. A final screenshot/typecheck does not pass transient behavior. Keep the instructions portable with links inside the exported factory kit; no internal host files or project-only skills should be prerequisites for external applet authors.

Release these additive fixes as matched SDK/tools/kit 0.4.1 archives, runtime API 3, manifest schema 2, bundle format 1 and data schema 1. Update `create.mjs` dependencies, `kit.mjs` metadata, workspace consumers and package-lock together. No registry publish is required. Older API-3 packages remain accepted; richer error fields are optional and old hosts may omit them. The new host and rebuilt applets are the qualified combination. Installation preserves IDs and records; no backend migration. Do not require API 4 for additive diagnostic fields.

Run `npm run typecheck`, `npm run check:packages`, SDK build, tools syntax checks and `npm pack` to a fresh temporary artifact directory. `prepack` refreshes the portable kit. Exercise React and vanilla create/check/build using the packed tools and local packed SDK, and verify kit metadata/links match 0.4.1. Do not install these scaffold projects onto the everyday launcher. Commit `feat/(factory): standardize source loading and recovery guidance`.

### 6. Final installed qualification and handoff

Rebuild/install the final matching host and X/HN packages after the version change. Confirm revisions via `dev status`; preserve the APK selection and installed app visibility. Repeat the critical transition matrix on this final combination. Record actual successes, failures, blocked cases and non-run cases; retain sanitized timing evidence and generic frames only. Update architecture, applet READMEs and active maintenance/design guidance to describe implemented behavior, not unverified proposals. Commit the final evidence separately as `feat/(docs): qualify source loading transitions`.

## Acceptance matrix

| Case | Required observable result |
| --- | --- |
| Profile to Following to public profile, including Back/repeat | Loader/valid partial profile/content only; no intermediate unsupported, Retry or website demand |
| Explore to typed search, query change and result to post | Same criterion; exact destination/query, usable search field and correct post |
| Each native primary section; reselect after scrolling | Declared root, correct selected footer, fresh viewport; no prior child or false recovery |
| Home/content tabs, Notifications/Mentions, Saved/likes | Pending and empty distinguished; no stale previous-tab content presented as destination |
| Pull/button refresh with prior content; no prior content | Correct busy duration, retained safe content or skeleton; no empty-shell "Could not refresh" banner |
| Slow HTML and delayed SPA content under 15 seconds | Loading persists and resolves without Retry; DOM completion does not terminate observation |
| Missing markup beyond 15 seconds, including after same-document ready-to-loading | One honest timeout, usable navigation; repeated loading cannot extend the deadline or erase failure; later valid content can recover |
| Actual offline/site error/HTTP error | Meaningful fixed error copy, correct retryability; no infinite loader; online Retry recovers |
| Auth, challenge, unsupported and blocked | Affirmative distinct outcomes; no auto-provider or automatic account action |
| Source activation with no animation frames; throwing adapter | Healthy source activates; actual exception is ADAPTER_FAILED, not unsupported; foreground failure remains native recovery |
| Rapid A-to-B navigation, stale callback/deadline, provider Close | Old epoch/token cannot alter the destination; source revalidation and Back remain correct |
| Categories verification and backend read failure | Pending account stays loading; failure stays distinct from no saved records; existing records preserved |
| HN feeds/comments/profile/Saved/article | No shared-runtime regression; Search placeholder remains unchanged |
| Accessibility and isolation | Native tabs/Back available; one polite pending announcement; source absent from foreground pixels, accessibility/focus and audio; 200% text, dark and reduced motion usable |

Repeat the two known reproductions at least five times each with warm loads and once after app re-entry, without pressing Retry. Inspect a screen recording at a documented sampling rate and the sanitized lifecycle trace. Test a controlled slow source in a disposable environment rather than modifying X DOM or the everyday account. Real source results and synthetic deadline cases must be reported separately. Full-rate video inspection can establish more than sparse samples; never claim absence of every one-frame glitch from a contact sheet.

No new/modified repository tests are authorized. Run existing tests/checks and temporary component harnesses; do not count a zero-case Cargo target as behavioral coverage. If prerequisites block live checks, keep those criteria pending rather than declaring success from compilation.

## Risks, delivery and completion

The framework cannot prove website-specific readiness from a model's shape. X/HN must maintain semantic evidence as websites change. A 15-second limit is a deliberate bound, not proof of permanent failure; late valid content may recover. Private cached content requires renewed account evidence, so some private refreshes appropriately use a skeleton. Prototype-only diagnostics must not collect content or become a permanent user-facing dependency.

Use existing installed sessions and services. Do not launch/reset backends, uninstall the host, reset emulator data, submit social actions or alter account settings. Install host APKs with `adb install -r` and applets with the supported `--replace` workflow. Roll back code through existing tools if needed while preserving records. Restore temporary network/display settings, remove task forwards/device recordings and exit diagnostic inspection before handoff.

Completion means the final installed builds pass the matrix, the two confirmed flashes no longer appear, genuine failures remain usable, portable creators receive the same guidance, all logical steps have verified commits and change records, and any remaining qualification gaps are explicit. A loader overlay or a longer arbitrary delay alone does not complete this plan.
