# X interactions without weakening route isolation

Status: implemented in component commits; static checks and sampled device behavior passed, with qualification gaps recorded below. Project: Genesis X applet, followed by Hacker News and portable factory guidance. Phase: phase-5. Created 1 November 2026, 12:20:58 Asia/Kolkata. Repository baseline: `18a16a3` on `proto/phase-5`.

## Outcome and decisions

Restore the behavior people expect from X's controls while retaining mandatory owned rendering and host-enforced route separation. Like must change the selected post's like state. Share must offer sharing. An external article link must open its destination. None of these meanings can be inferred merely from the fact that the post has a URL.

The user explicitly requested investigation and a detailed plan, with no implementation in this task. The user also selected **keep website Reply/Post editors and fix their contextual handoff**. The plan therefore keeps authentication, editors, uploads, settings and protected playback in the framework provider. It moves ordinary supported interactions into the owned applet. Opening an editor never submits it.

The main defect is applet customization and authoring policy, not a failure of mandatory rendering or the route resolver. Use the existing source command/publication channel for X actions. Do not introduce a second router, broad custom catch-all, hidden source overlay, or general remote DOM executor. A separate, small platform addition is needed for the native Android share chooser because the current foreground lacks Web Share. That addition must not contain X or HN logic.

Implement and qualify X first. Apply the interaction classification to HN second, correcting actual defects without inventing social controls it does not currently render. Update factory guidance and all three factory skills as part of delivery. Keep one X applet and one HN applet, existing sections, IDs, backend services, cookies and record schemas.

## Governing context

Read these before implementation, then check for changes since this baseline:

- [Root instructions](../../../AGENTS.md), [factory instructions](../../../factory/AGENTS.md), [applet instructions](../../../factory/applets/AGENTS.md).
- [Current navigation plan](101616-genesis-explicit-navigation-architecture-plan.md), [isolation plan](../2026-10-31/171848-genesis-isolated-applet-architecture-plan.md), [loading plan](085000-genesis-navigation-loading-plan.md).
- [Platform ownership](../../../.architecture/platform.md), [browser runtime](../../../.architecture/browser-runtime.md), [X architecture](../../../.architecture/x.md), [HN architecture](../../../.architecture/hacker-news.md).
- [Navigation](../../../factory/guides/navigation.md), [SDK reference](../../../factory/guides/sdk-reference.md), [patterns](../../../factory/guides/patterns.md), [design](../../../factory/guides/design.md), [product scope](../../../factory/guides/product-scope.md), [verification](../../../factory/guides/verification.md).
- [X README](../../../factory/applets/x.com/README.md), [HN README](../../../factory/applets/news.ycombinator.com/README.md), [maintenance](../../../.docs/phase-5/2026-10-31/194740-genesis-isolated-applet-maintenance.md), [last navigation qualification](../../../.reports/phase-5/2026-11-01/115202-genesis-explicit-navigation-verification.md).
- Factory [customize](../../../factory/skills/genesis-customize-applet/SKILL.md), [build](../../../factory/skills/genesis-build-applet/SKILL.md) and [verify](../../../factory/skills/genesis-verify-applet/SKILL.md) skills. Apply the project [Apple design skill](../../../.skills/apple-design-skill/SKILL.md) to semantics, feedback and accessibility, using Android conventions, and the project [unslop skill](../../../.skills/unslop/SKILL.md) to writing.

This plan supersedes the earlier navigation plan's exclusion of custom social mutations and the applet documents' blanket decision to route all social controls to the provider. It retains the earlier plan's URL classification, explicit website intent, isolation, Back/Return, loading and data-authority requirements. The user's editor decision above preserves the protected-form boundary. No older-phase requirements are adopted implicitly.

Some current documents still start with API-3/schema-2 text before appending API-4 guidance. The actual X/HN manifests and packages use schema 3, API 4 and SDK/tools 0.5.0. Correct that contradiction during the documentation step; do not downgrade the implementation to match stale introductory text.

## Evidence and root cause

### Confirmed in code and the running emulator

The supplied screenshot shows website arrows next to action icons. Read-only inspection on `emulator-5554` found the X foreground at revision `ce79e5b3a380be268e4fb7811d30b276f5dff4d74f15beb9fb9feb5cf765c5b6` and its hidden source at `/home`. Five source posts were present. In the inspected rows the source exposes real `BUTTON` controls with `data-testid` values `reply`, `retweet`, `like` and `bookmark`. One inspected Repost button had `aria-disabled="true"`.

The foreground's Reply, Repost, Like and Share controls were `A` elements with the same URL as their post permalink and a website cue. Views was a separate internal analytics link. This establishes the mismatch without submitting any social action. Native Web Share was absent, `typeof navigator.share === 'undefined'`; Clipboard `writeText` existed, but its success was not exercised. A missing desktop account-switcher selector in this sample does not establish sign-out; preserve the existing mobile account observer.

In [post.tsx](../../../factory/applets/x.com/src/components/post.tsx), `action()` defaults `website = true` and `url = item.url`. It renders `XLink` for every action. `XLink` resolves a custom URL again with `websiteActionId: 'original-x'`. This is explicit provider navigation, not accidental bubbling or a native host converting buttons into links. Bookmark and More use the same original-post escape.

In [main.tsx](../../../factory/applets/x.com/src/main.tsx), the adapter extracts metrics and active Like/Repost state, but not executable action descriptors, Bookmark state, or disabled-state evidence. Its only commands are `loadMore`, `selectTab`, `openEntry` and `openQuote`. There is no Like/Repost/Bookmark execution path to restore merely by changing CSS or removing arrows.

The same default action helper already existed in commit `8e69cbf`, before the explicit-navigation migration. The migration preserved it, and the compact-cue change made it more conspicuous. The earlier [X migration record](../../../.changelog/phase-5/2026-10-31/190000-x-isolated-applet-migration.md) records the agent's choice to put social actions in the provider. The later [navigation record](../../../.changelog/phase-5/2026-11-01/113805-x-explicit-navigation.md) preserved that choice. The root cause is that scope decision plus missing action execution, not the arrow itself.

### Affected and related locations

| Location | Finding | Required treatment |
| --- | --- | --- |
| X feed, detail, replies, profile posts, search posts and upstream Saved lists using `Post` | Shared Reply/Repost/Like/Share links; Bookmark opens the post | Replace the action path once and reuse it everywhere |
| X `app.tsx` media action row | Independently repeats the same link substitution | Reuse the same action component and controller; never infer state from an old feed copy |
| X profile and person entries | Follow opens the profile website; observed relationship state is absent | Extract capability/state and perform an explicit requested Follow/Unfollow operation |
| X trend options and media overflow | Ellipsis opens a website rather than a local options menu | Open an owned menu; put honestly named website workflows inside it |
| X `library.tsx` | `Open post ↗` is hard-coded although it opens a custom post | Use the resolved internal link; keep category mutations as existing buttons |
| X URL links/tabs | Legitimate navigation; resolution failures are silently swallowed by custom link wrappers | Retain policy, add visible retry/error feedback, and prevent repeat activation while pending |
| X merged feed cache | Up to 120 displayed posts, while a source publication contains up to 40 and live DOM is virtualized | Cached display data cannot confer live mutation authority |
| X no-URL commands and Load more | Command dispatch is acknowledged; Load more ends a timer after 1.2 seconds | Define observed completion/failure and do not imply success from a timer |
| HN `app.tsx` | Save story and collapse are real local interactions; website Vote/comment and Reply are explicitly labeled | Preserve good semantics; distinguish the combined vote/comment recovery link from any actual Vote action |
| HN `navigation-link.tsx` | Numeric fragments may scroll a local matching ID without checking the full target document; `website=true` does not bypass that scroll branch | Restrict local scroll to ordinary same-document links; explicit website entry always follows its declared decision |
| HN `story-interaction.ts` | Already excludes nested controls, modified clicks and selected text from tile navigation | Preserve and use as the model for X event handling |
| Factory guides/skills and architecture | Blanket source read/navigation and original-site social policies encourage link substitution; route coverage table does not prove action behavior | Add a separate interaction inventory, execution contract and outcome-based acceptance |

HN findings beyond the current X screen are static code findings, not new live HN qualification. YouTube is inactive and outside this repair. Do not activate it or migrate its legacy architecture as incidental work.

## Separate three contracts

### 1. Navigation remains host-owned

Actual URLs continue through `navigation.resolve` and `navigation.activate`. Custom, local page, declared website, external, uncovered and blocked remain distinct. Only website/external presentation carries a website cue. A profile, post, photo, analytics page or ordinary source tab must retain its declared custom route. Unknown destinations stay in owned recovery. Blocked destinations remain blocked.

Keep `original-x` and `original-hn` for the explicit command **Open page on website** and documented original-page recovery. Their declaration authorizes presentation only. It cannot serve as implementation of Like, Follow, Vote, Bookmark or Share. Do not remove every website cue to conceal unchanged behavior.

Remove the broad `website?: boolean` convenience from general X link callers. A navigation component accepts a normal `NavigationTarget`; original-page recovery passes an explicit action ID. A dedicated provider-workflow control owns editor entry. Components must make these choices at their call sites rather than default to provider mode.

### 2. Interactions remain applet-owned

Use semantic `button type="button"` for mutations, menus, Share, Refresh and no-URL source controls. A button does not carry a fallback `href`. Opening a menu is local. A source mutation uses an applet-defined command, validated in the current source, then publishes observed results. It does not call `navigation.activate`.

Use native pressed/disabled/busy states, `aria-pressed` for known binary state, explicit labels such as Like/Unlike and Bookmark/Remove bookmark, and local status/error text. Preserve the compact action row, 48-CSS-pixel touch regions, focus indication, reduced motion, light/dark colors and scalable text. Pending action feedback replaces only that control's content with the existing `PendingAction` treatment, not the feed. Unknown state is not false state.

For design reasoning, the local [Buttons reference](../../../.skills/apple-design-skill/references/hig/buttons.md), Best practices, says "Always include a press state for a custom button." The [Feedback reference](../../../.skills/apple-design-skill/references/hig/feedback.md), Best practices, says "Show people when a command can't be carried out and help them understand why." Apply these principles to the Android HTML controls, not iOS styling.

### 3. Protected workflows remain deliberate website entry

Reply/Post editors, Quote editor, messages, settings, login, uploads and protected video playback remain website-owned under the user's decision. Label the handoff before activation, and open the actual contextual destination. **Reply on X website** must reach an editor bound to that post. Opening the generic post and expecting another tap is a failed Reply implementation. **Post on X website** opens the composer. Quote carries the quoted post identity. Never claim anything was submitted merely because a form opened.

Prefer an inspected contextual composer URL under the existing `/compose/*` website rule. Do not invent query parameters from memory. Step 1 must establish this URL behavior with non-submitting live inspection, including cancel and Return. If X only supplies a same-document modal, qualify a source preparation followed by exact-current-source adoption: the command may open that non-submitting modal, publish a matching prepared result, and the already-marked website workflow may then activate a freshly resolved decision for the exact source URL. This is permitted only while source URL, epoch, account and workflow identity remain unchanged. A route change cannot be treated as successful preparation.

If a preparation click changes URL and retires source authority before its result, stop that implementation path. Use the inspected direct destination if available. Otherwise record a narrowly reproduced platform handoff gap before adding any host capability. Do not bypass route policy, carry website intent through arbitrary source commands, or ship the generic post link as a substitute. This is a qualification gate, not permission to reduce the editor requirement.

Do not prepare source dialogs when a link merely mounts, resolves, receives focus or is hovered. Preparation requires the user's workflow click, never submits, and must not continue after Cancel, a section change or a stale decision. Keep website Back and Return behavior and dirty-form Stay/Leave intact. Provider return invalidates action authority and reobserves account/content.

## X action behavior

| Control | Desired behavior | Evidence and failure behavior |
| --- | --- | --- |
| Like / Unlike | One requested state change on the exact live post, without navigation | Observe current and inverse source control; retain previous display with pending status until changed state is observed; explicit error or uncertainty otherwise |
| Repost icon | Open an owned menu containing Repost/Undo repost as applicable and Quote on X website | Opening the menu performs no write. Selecting Repost executes its inspected source confirmation sequence once. Source-disabled Repost stays unavailable with an explanation |
| Bookmark menu item | Set/remove the X bookmark in place | Extract source Bookmark state. Keep Save to category independent, with its current backend protocol and wording |
| Follow / Unfollow | Operate on the identified profile/person in place | Model following, not-following, requested, unavailable and unknown separately. Preserve any observed confirmation before Unfollow; requested/private accounts must not display Following prematurely |
| Reply | Explicit context-bound website-editor entry | Correct recipient/post context is visible before any text is submitted; Cancel/Return restores the opener |
| Share | Owned share sheet with Copy link and native Share link | No source navigation or social write. Copy uses canonical validated post URL; native chooser cancellation is not an error or a successful send |
| Views | Existing internal analytics navigation | Remains a link, without a website arrow, except actual external help links inside that screen |
| More | Owned contextual menu | Includes category action, Bookmark, Copy link and explicit Open post on X website. Do not render unsupported actions as working buttons |
| Trend/media overflow | Owned menu with actions the applet actually implements and an explicit original-page option | No ellipsis directly opening the website. Unknown source actions are labeled unavailable, not simulated |
| Photos/post body/profile/time/quotes | Custom navigation according to the existing manifest | Nested controls and text selection do not trigger the parent post; author, quoted post and media retain separate identities |
| Video | Explicit existing website playback entry | No promise of custom playback or background source audio |
| Refresh/load more/tabs | Existing owned/read behaviors with observation-based completion | No website fallback; load more ends on observed new window or explicit exhausted/failure evidence, with bounded uncertainty |

All instances of a post use the same action controller, including the media viewer. Opening a media route does not prove that an actionable source post still exists. If the route has only a photo overlay, obtain its action descriptors from an inspected post context or provide an explicit internal View post action. Do not render enabled fictitious mutation controls in that state.

## Applet command and result design

The following are proposed **applet-local** types, not new SDK APIs. Implement them in a focused new `src/interactions.ts`. Source execution belongs in new `src/source-interactions.ts`; foreground tracking belongs in new `src/use-interactions.ts`. Keep JSX controls in `src/components/post-actions.tsx` and `src/components/share-sheet.tsx`. Keep protocol validation free of React and DOM side effects.

```ts
type Entity = {kind: 'post'; id: string} | {kind: 'person'; handle: string};
type ActionName = 'setLike' | 'setBookmark' | 'setRepost' | 'setFollow';
type ActionRef = {
  token: string;                 // generated by this adapter visit, never a selector
  entity: Entity;
  name: ActionName;
  state: 'on' | 'off' | 'requested' | 'unknown';
  available: boolean;
  unavailableReason?: 'signed-out' | 'source-disabled' | 'not-observed';
};
type ActionRequest = {
  version: 1;
  requestId: string;
  visitId: string;               // source binding.viewId
  accountHandle: string;
  token: string;
  entity: Entity;
  name: ActionName;
  desired: boolean;              // set a state, never blind toggle
};
type ActionResult = {
  requestId: string;
  token: string;
  status: 'pending' | 'observed' | 'rejected' | 'uncertain';
  reason?: 'stale' | 'account-changed' | 'disabled' | 'auth-required'
    | 'challenge' | 'source-failure' | 'not-observed' | 'timeout';
  observedState?: 'on' | 'off' | 'requested';
};
type InteractionModel = {
  version: 1;
  visitId: string;
  revision: number;
  actions: ActionRef[];
  results: ActionResult[];
};
```

Attach this optional interaction model to `XModel`; validate it in `validModel`. The foreground matches it with the host-issued snapshot's `sourceId` and `epoch`. A foreground binding's `sourceId` is not the current hidden source ID. Never synthesize authority from an old cached post, author name, count, URL match or backend library record.

Use existing `context.source.command({name:'x.action', payload: request, epoch: snapshot.epoch})`. `source.command` currently checks source readiness/epoch in `android/native/src/isolated.rs` and returns dispatch acknowledgement. `onCommand` receives the payload; it is not an upstream transaction API. The action result comes through normal `source.publish` and `source.subscribe`.

### Bounds, identity and lifecycle

- Bound request IDs/tokens to 80 characters, post IDs to the existing 1–25 digit rule and handles to existing `validHandle`. Reject unknown keys/actions, oversized payloads and malformed desired states. A request is at most 2 KiB; publish at most 256 action descriptors and 32 retained results within a 160-KiB target, below the host's 192-KiB cap. Trim display rows before dropping pending/result metadata.
- The adapter owns an in-memory registry from token to exact entity, operation, DOM anchor and observed state. Keep tokens stable while identity/context remains valid. Revoke on account, URL, selected-tab or source-visit change, detached/recycled nodes and provider entry. Revalidate immediately before each click and after each asynchronous wait.
- Do not clear and regenerate this registry indiscriminately inside the current `publish()` function. Its existing `targets.clear()` behavior is adequate for transient read commands but would invalidate pending action acknowledgements. Reconcile descriptors against identity; preserve pending results across normal observation passes.
- The source uses `currentHandle()` and live account evidence. Do not require the Categories backend's configured account merely to use an upstream X action. Conversely, keep existing backend account checks for Categories unchanged.
- Only one source mutation runs at a time. Other mutation controls may briefly disable; browsing and Cancel remain usable. Duplicate request IDs with the same payload return the existing status without another click. Reuse with a different payload is rejected. Retain a bounded 64-entry request ledger for the visit and evict only settled entries. Never replay a request after visit retirement.
- Construct request IDs from the source visit ID and a monotonically increasing foreground sequence. Retain a source high-water mark when evicting settled ledger entries. An older request absent from the ledger is rejected as stale, never executed again. A foreground recreation must first obtain a new source visit or an observed sequence floor before issuing actions.
- A route/account change cancels work that has not clicked. After a click, cancellation means stop waiting; it cannot undo a remote action. Report uncertainty if an outcome was not observed. Clear action authority immediately on navigation mode `website` or `recovery`, even if an independent reader leaves the hidden source alive.
- Before an applet-initiated website entry, send a read-only `x.cancelInteraction` command for the pending request and stop its local continuation. Source cancellation prevents any later confirmation click, but never performs an inverse mutation. Native section changes and source adoption retire the adapter through existing lifecycle cleanup. If a platform-origin mode change leaves an independent source alive, reject further UI dispatch and let its already-clicked operation settle without initiating another source step. Qualify that race explicitly; do not assume foreground disposal alone stops source timers.
- Include results in every publication until acknowledged by an `x.ackResults` read-only command or safely retained to the bounded visit limit. Publication is coalesced in the SDK and rate-limited in the host. Do not publish a one-frame success event that the next feed snapshot can overwrite.
- Use an 8-second observation deadline per mutation, starting at dispatch. A separate foreground watchdog ends at 10 seconds if no result arrives. Stop timers/observers on disposal. A timeout must not remove useful content, select a different route or invite blind retry.

### Execution and reconciliation

Before clicking, compare the live state with `desired`. If already satisfied, return `observed` without clicking. If state is unknown, the source control is disabled, account differs or the post belongs to a quoted/other article, reject. Repost confirmation operates only in the menu opened for that registered post; no global first-match click. Follow cannot use the viewed author as signed-in identity.

After the click, observe the appropriate inverse control/state and explicit source errors. Add relevant attributes such as `disabled`, `aria-disabled` and `aria-pressed` to observation. Keep the existing `data-testid` watcher for Like/Repost state changes. Missing controls alone prove neither success nor failure. An auth/challenge interrupt remains owned and offers explicit recovery.

`observed` means the source UI reflects the requested state. It is not proof of durable server acknowledgement, since X may optimistically update its own DOM. Continue accepting source rollback/error observations. Do not increment abbreviated counts arithmetically. Use refreshed source counts and state. Qualification of persistence requires an authorized write followed by independent reload/read-back.

An `uncertain` result offers **Check status**, a read-only reobservation for the same entity and account. A new write is allowed only after a current known state is available and the user acts again. Never automatically send the opposite action to compensate for a timeout.

Merge action authority separately from `app.tsx`'s accumulated display posts. Old posts can retain text/images while their action descriptors expire. A cached post without a current target offers an internal **Open post to interact** link. Do not queue its mutation across navigation. Investigate restoring an exact live source row through read-only virtualization only if real inspection supports it; do not introduce a hidden background source or direct private API calls to avoid this limitation.

## Native sharing, the bounded platform change

The current Android host has native chooser code in `IsolatedBrowser.handleUserEvent` and `BrowserAdapter.readerAction`, but only for the current website reader URL. Opening a website just to access that chooser repeats the defect. The observed foreground has no `navigator.share`, so an unconditional Web Share call is not an implementation.

Add proposed public `context.sharing.shareUrl({url, title?}): Promise<{status:'presented'}>` and `context.sharing.supported: boolean`. This is a new API, not currently callable. Advertise optional `features: ['share-url']` in the host-issued `ExecutionContext`; absence means unsupported. Keep the source authoring context unchanged. Validate an absolute HTTP(S) URL without credentials or app-assets origin, maximum 8192 characters, and a plain title up to 200 characters. Sharing creates no navigation decision or website session and does not change source epoch/history. It is an explicit foreground user action, not a site mutation.

Implement in `android/native/src/isolated.rs`, `android/app/src/main/java/app/nirvana/genesis/IsolatedBrowser.java`, `packages/sdk/src/{protocol,runtime,index}.ts`. Reuse the existing Android `ACTION_SEND` chooser pattern through a focused shared helper if useful. Keep generation/document/request identity in the native completion. A proposed `isolatedShareResult` event reports chooser launch or launch failure to the pending request; discard stale completions. Reject source-role, retired-foreground and website/recovery-mode requests. Suppress duplicate launches while one request is launching. No source URL, selectors or applet entities enter this implementation.

Resolve the promise only after the chooser is presented, not merely when its command is queued. `presented` never means a recipient received anything. Do not track or claim send success; chooser cancellation leaves the owned opener unchanged. Report unsupported/no-handler failures in the share sheet and leave Copy link available.

Ship this as an additive SDK 0.5.1 API on API 4 with feature detection. No manifest, runtime, route or data-schema bump is needed for the optional facility. Old SDKs ignore the optional binding field; the new SDK reports unsupported on old hosts without invoking an unknown RPC. Update applet dependency and lockfile only in the SDK/integration step. The target delivery host must support the chooser; Copy link is compatibility behavior for older hosts, not evidence that native sharing was qualified.

The owned share sheet uses `navigator.clipboard.writeText` only on an explicit Copy click. Report Copied only after success. If permission/focus fails, retain a selectable URL and a clear copy error. Do not silently fall back to deprecated copying or provider navigation. No clipboard reads are needed.

## Ordered implementation and commits

Each step updates its own development changelog, completes its checks and commits before the next component starts. Use the repository's configured author email. No new or modified test files are authorized. Existing checks, temporary non-delivered diagnostics and actual device journeys are the verification methods.

### 1. Record X action and editor evidence

Files: X README, this plan where inspected details replace qualification gates, and a new phase-5 verification report. Inspect Home, detail, media, public/own profile and person cells in the actual source. Record only structural selectors, state signals, identity rules, action availability and sanitized route templates. Inspect Like/Unlike, Bookmark/remove, Repost/Undo confirmation, Follow/requested/Unfollow and editor entry/cancel. Only the initial inactive Like/Repost/Bookmark controls and disabled Repost are verified by this planning task.

Do not submit real likes, follows, reposts, bookmarks, votes or posts during routine inspection. Use existing explicit mutation authorization if provided later; otherwise leave end-to-end mutation qualification blocked and complete non-mutating work. This restriction concerns testing on the user's account, not implementation of user-initiated buttons.

Establish the exact Reply/Quote composer route or same-document preparation strategy before implementing those workflows. Record protected/signed-out/disabled cases. Do not add guessed selectors for unseen inverse states. Confirm installed host/provider/package revisions using the CLI status command and inspect the chosen source.

Commit: `feat/(x): specify source interactions and editor handoffs`. Verify Markdown links and `git diff --check`. This is an evidence/prerequisite commit, not a functional completion claim.

### 2. Implement X source action models and execution

Files: new `interactions.ts` and `source-interactions.ts`; existing `src/main.tsx`, `src/view-model.ts`, `src/source-account.ts` only if additional inspected account evidence is necessary. Keep account extraction separate from action execution. Reuse `extractPost`, `postUrl`, `validHandle` and exact closest-article checks.

Implement the request/result design, registry, desired-state operations, live availability, idempotent dispatch and uncertainty behavior. Reconcile action descriptors/results into every model publication. Extend read-command outcomes for tabs/entries/quotes/load more without treating them as mutations. Do not let a command's unexpected URL change acquire website intent. The host's existing route policy still handles it.

For those read operations, use a separate applet-local request with `requestId`, `visitId`, operation name and existing observed target key. A no-URL tab completes when the requested key is observed selected. An entry/quote completes when a new accepted destination snapshot matches the observed target identity, or explicitly reports that identity unavailable. Load more completes when the observed content window changes, or an inspected end-of-list marker proves exhaustion. An unchanged window without an end marker reaches a bounded no-progress state with a user-triggered Retry, not a fabricated empty/end result. Tie pending foreground state to both source identity and request so another section cannot complete it accidentally.

Run X typecheck/check/build using the commands below. Exercise pure validation and state transitions with temporary diagnostics, including duplicate IDs, stale epoch, wrong account, recycled post, disabled source control, result coalescing and timeout. No permanent test changes. Confirm the unchanged renderer still handles models without action metadata.

Commit: `feat/(x): execute observed source actions safely`.

### 3. Implement X owned controls and contextual workflows

Files: new `use-interactions.ts`, `components/post-actions.tsx`, `components/share-sheet.tsx`, and a focused provider-workflow helper if needed; existing `app.tsx`, `components/post.tsx`, `view-model.ts`, `app.css`, `library.tsx`, `applet.json` and README.

Wire all post renderers and media controls through one action controller. Separate pending/error state by entity/operation. Open owned Repost/More/Share menus with `context.ui.openModal` and restore focus/native Back. Remove default website behavior from actions. Preserve existing category editor logic and backend authority.

Use semantic buttons and current capability metadata. Keep cached display rows from carrying cached command authority. Reconcile late source rollback with visible state. Preserve selected tabs, scroll and normal navigation when actions complete. Use the HN `tileClick` exclusions as the pattern for X's post-body handler, including `defaultPrevented`, non-primary/modified clicks, composed-path interactive elements and selected text.

Implement the inspected editor entry from step 1, with visible website intent and exact target identity. Only add narrowly named website actions when a custom URL genuinely needs original workflow presentation. Retain the existing composer website route. Keep errors inline; a failed action never automatically calls `original-x`.

Replace X library's hard-coded arrow with a normal resolved link. Make route-resolution failures actionable rather than an indefinitely busy anchor. Preserve fresh-click requirements when a stale decision changes destination mode. Avoid multiple activations while a link is awaiting dispatch.

Run X checks, then qualified non-mutating device journeys: menus, cancellation, copy, editor entry/cancel/Return, analytics, ordinary links, source disabled states, account gates, cached rows and source refresh. Record write/read-back gaps explicitly. Commit: `feat/(x): restore action controls and contextual editor entry`.

### 4. Add native share support and finish X integration

Implement the generic sharing API above. First commit host support after Rust/Android checks as `feat/(android): share foreground links without navigation`. Then commit the SDK API, feature detection, version/lockfile and package metadata after SDK/type checks as `feat/(sdk): expose optional native link sharing`. Finally integrate native Share link in X, update its dependency/README, rerun X checks and qualify chooser open/cancel/return before `feat/(x): connect owned sharing to Android chooser`.

Do not send the shared link to another person for verification. Confirm exact canonical URL in the outgoing intent through sanitized component checks. A chooser launch and cancellation suffice for platform presentation acceptance; they do not establish receipt by another app/person. Confirm Copy link separately without reading unrelated clipboard data.

### 5. Apply the distinction to Hacker News

Files: `factory/applets/news.ycombinator.com/src/{app.tsx,view-model.ts,main.ts,library.tsx}`, `src/components/navigation-link.tsx`, README, and manifest only if an inspected workflow needs a missing declaration. Avoid touching unaffected category/repository/backend modules.

Inventory current HN controls. Keep Save/Edit/Remove/category/collapse as local interactions. Keep story titles as external article links where applicable; discussion, author and More remain internal links. Reply already points to a contextual `/reply?id=...` website route, so preserve and verify that form/Return behavior. Posting/login/edit/delete retain provider ownership. Replace ambiguous combined Vote/comment copy with an honest original-discussion action unless an actual owned Vote control is implemented separately.

Fix local-fragment scrolling in `HnLink`: compare origin, pathname and query with the current accepted source snapshot before locating a numeric anchor; only ordinary non-website activation may scroll locally. Otherwise navigate to the custom comment permalink, preserving the existing bounded-comment fallback. Do not ignore explicit `original-hn` intent because a matching comment happens to be on screen. Maintain consistent behavior between `App.open` and `HnLink` without adding a competing presentation router.

Do not add voting or favorites mutations solely to imitate X's toolbar. If a future owned Vote control is requested, require observed HN capability/state and the same request/result/uncertainty discipline; token-bearing vote URLs stay in the source and must never become foreground navigation links. HN Saved remains separate from upstream favorites.

Run HN checks and actual feed/discussion/nested-button/fragment/provider/Saved journeys, then smoke X. Commit: `feat/(hacker-news): separate local interactions from website navigation`.

### 6. Update the factory and current architecture

Add `factory/guides/interactions.md` with the three contracts, applet-local request/result example, state/identity rules, uncertainty, source-owned protected editors, native sharing capability detection and real acceptance requirements. Examples must be executable against the delivered SDK; distinguish applet helper types from public APIs.

| File | Required update |
| --- | --- |
| `factory/AGENTS.md` and `factory/applets/AGENTS.md` | As part of the user's requested factory-guideline update, require interaction inventories; replace the blanket read-only-social limitation with explicit, validated user-intent actions; retain provider-owned forms and source isolation; make schema/API wording current |
| `factory/README.md`, `factory/skills/README.md` | Link interactions guide beside navigation; state route support and action support separately |
| `factory/guides/product-scope.md` | Require each control's intended result, execution owner, mutation status, evidence and qualification; do not silently replace an action with opening its containing page |
| `factory/guides/navigation.md` | State websiteActions grant presentation only; separate URL links from source actions and prepared protected workflows; retain host policy and stale-decision handling |
| `factory/guides/isolated-applets.md`, `patterns.md`, `sdk-reference.md` | Document action commands through existing transport, dispatch versus result, coalesced retained receipts, account/visit checks, optional sharing API and the protected-form boundary; correct contradictory current version claims |
| `factory/guides/design.md` | Buttons perform named actions; menus open menus; arrows describe real provider transitions; disabled/unknown/pending state comes from evidence; no false success or decorative controls |
| `factory/guides/verification.md` | Observe the promised outcome, not merely destination entry; verify nested controls, disabled state, recycled rows, late rollback, uncertainty, source isolation, chooser cancellation and editor identity/Return |
| `factory/guides/getting-started.md` | Link both contracts; distinguish starter navigation from a completed interactive app |
| `factory/skills/genesis-build-applet/SKILL.md` | Classify navigation, local action, source mutation and protected workflow before building; require a result model for source actions |
| `factory/skills/genesis-customize-applet/SKILL.md` | Audit every shared occurrence and cache/virtualization path; establish applet versus platform ownership before changes; reject generic website substitutions |
| `factory/skills/genesis-verify-applet/SKILL.md` | A link-opening pass cannot qualify Like/Follow/Share; no real social submission without explicit mutation scope; report blocked write/read-back qualification |
| X/HN READMEs and `.architecture/{x,hacker-news,browser-runtime,platform}.md` | Replace blanket website-social descriptions with implemented behavior; describe sharing and command-result limits accurately |
| `.docs/phase-5/2026-10-31/194740-genesis-isolated-applet-maintenance.md` | Current versions, action/route/chooser diagnostics and deployment order; retain its creation path |

Keep root `AGENTS.md` unchanged. Do not add a generic all-site executor to starter code. Factory-only creators must be able to follow the guidance without reading internal Genesis plans. Export the portable kit and verify it contains the new guide and changed skills. Refresh packed copies through `prepare-kit.mjs`/prepack, not manual edits.

Commit: `feat/(factory): require real action semantics and result verification`. Verify local Markdown links, signatures, kit export, and `git diff --check`.

### 7. Deliver and record final qualification

Install compatible share-capable host first, then the new SDK-built X revision in place. Qualify X before updating HN. HN is APK-selected and the emulator also had a development override in earlier delivery evidence; inspect actual current status so the intended revision is exercised. Rebuild bundled HN when delivering the host. Never reset app data, signing identity, backend stores, or cookies.

Create a phase-5 verification report with exact host/provider/device/applet revisions and each matrix result below. Link it from applet READMEs and this plan. Keep implementation and verification status separate. Roll back immutable code revisions without record migration if a regression appears. Optional sharing detection keeps older hosts usable; it does not waive chooser qualification for the target host.

Commit: `feat/(release): qualify applet interactions and navigation`.

## Verification commands and environments

All commands below run from the repository root unless noted. Use the installed pinned toolchain. Build outputs go outside source. Do not start services unless the user asks; inspect existing service availability instead.

```sh
node packages/sdk/build.mjs
npm run typecheck --workspace=@genesis/applet-x
node packages/applet-tools/src/cli.mjs check factory/applets/x.com --json
node packages/applet-tools/src/cli.mjs build factory/applets/x.com --out /tmp/genesis-x-interactions --json
npm run typecheck --workspace=@genesis/applet-hacker-news
node packages/applet-tools/src/cli.mjs check factory/applets/news.ycombinator.com --json
node packages/applet-tools/src/cli.mjs build factory/applets/news.ycombinator.com --out /tmp/genesis-hn-interactions --json
node packages/applet-tools/src/cli.mjs routes list factory/applets/x.com --json
node packages/applet-tools/src/cli.mjs routes inspect factory/applets/x.com --url https://x.com/example/status/123 --json
node packages/applet-tools/src/cli.mjs routes inspect factory/applets/x.com --url https://x.com/example/status/123 --action original-x --json
git diff --check
```

Expected: typecheck/check/build success; ordinary post resolution is custom and explicit original-page resolution is website. Use inspected editor URL templates and actual manifest IDs for the added workflow cases. These static commands cannot qualify selectors or submitted outcomes.

For the platform/SDK share step and final integration:

```sh
cargo clippy -p genesis-android --offline -- -D warnings
cargo test -p genesis-android --offline
./android/gradlew -p android --offline :app:assembleDebug :app:lintDebug
npm run typecheck
npm run check:packages
node tools/build.mjs --stage frontend --variant debug
```

The final APK assembly follows the frontend bundle rebuild. Existing native tests may be absent; report that as compilation evidence, not action coverage. Run no platform rebuild merely for an applet-only intermediate step.

Device examples use the actual authorized serial and available adb path:

```sh
node packages/applet-tools/src/cli.mjs dev status --device emulator-5554 --adb /Users/rit/Library/Android/sdk/platform-tools/adb --json
node packages/applet-tools/src/cli.mjs dev install /tmp/genesis-x-interactions --device emulator-5554 --adb /Users/rit/Library/Android/sdk/platform-tools/adb --replace --json
node packages/applet-tools/src/cli.mjs dev install /tmp/genesis-hn-interactions --device emulator-5554 --adb /Users/rit/Library/Android/sdk/platform-tools/adb --replace --json
```

Check status after an install timeout instead of blindly reinstalling. Preserve existing service tunnels. Remove only diagnostic forwards created by the task. Do not install extra everyday applets for synthetic previews.

Factory verification uses `node packages/applet-tools/src/cli.mjs kit export --out <new-temporary-directory>` and packed SDK/tools archives. Confirm the exported guide/skill links resolve. Check/build the existing starter variants outside the repository using the delivered packages; do not require new test files or native internals in creator workspaces.

## Acceptance matrix

| Journey or failure | Required observable result |
| --- | --- |
| X Like/Unlike, Bookmark/remove, Follow/Unfollow | Correct entity/state, no provider entry or route change; fresh source observation updates every displayed copy; actual persistence is verified only with authorized write/read-back |
| Source disabled Repost, unknown state, restricted account | Matching unavailable state and explanation; no enabled fake action and no arbitrary source click |
| Repost menu open/cancel, then authorized selection | Open/cancel makes no write; one selection invokes one correctly scoped operation; Quote opens the matching website editor |
| X Reply/Post | Correct contextual editor opens with website cue already visible; nothing auto-submitted; Return preserves opener and revalidates source |
| X post/detail/profile/Saved/media action reuse | Same control semantics and state; media/cached rows without a live target use an honest internal interaction path |
| Share and Copy | Owned sheet opens; copy success/error is truthful; chooser opens/cancels without a website session, history push or social submission |
| Category save versus upstream bookmark | Existing independent stores remain independent; no implicit import, migration or cross-write |
| Body versus nested control | Like, Share, overflow, quote and text links do not also open the parent; selected text and modified clicks retain their semantics |
| Cached/recycled post, new account or selected tab | Old token rejected before any click; old result cannot change replacement content |
| Double tap, delayed receipt, coalesced publications | At most one dispatched mutation per request; completion remains observable; no duplicate chooser or provider stacking |
| Source optimistic rollback, explicit error, timeout | Source rollback reconciles; failed/uncertain outcome stays visible; Check status reads, never blind-retries a write |
| Navigation or provider during pending work | Authority expires; unclicked work cancels; already-clicked uncertain work is not replayed; native Back/Return remains usable |
| Source-command redirect to unknown/external/login | Existing host recovery, no automatic website intent or leaked source pixels |
| HN Save/Edit/Remove/collapse and article/discussion | Local actions stay local; article destination and internal discussion remain distinct; source tokens never enter foreground URLs |
| HN fragment and explicit website on an existing comment | Local scroll only for same-document ordinary link; another document/explicit website request is not swallowed |
| Loading/offline/error and source isolation | Existing owned skeleton/recovery; no source pixels/accessibility/focus/audio fallback |
| 320-CSS-pixel width, 200% text, dark/light, keyboard/TalkBack | No overlapping actions or clipped cues; correct role/name/pressed/disabled/busy states; Close/Back and focus restoration work |
| Old host/new optional sharing API and rollback | Clear unsupported share option with Copy available; source/navigation still work; no data reset |

## Assumptions, risks and completion criteria

Confirmed user decisions: planning only now; mandatory custom rendering remains; X first; assess existing HN; update factory guidance/skills; keep website editors and repair their handoff. Technical decisions made by the agent: applet-local action protocol over existing public transport, desired-state requests, retained bounded results, no blind retries, separate native sharing capability and no new HN social feature expansion.

Source selectors, contextual editor URLs, inverse states and server-persistence signals remain implementation inspection/qualification prerequisites. The plan supplies exact required behavior and decision gates rather than treating those unknown details as inspected facts. A provider preparation that loses its source epoch is specifically not an accepted solution. No unresolved product choice blocks starting step 1.

The main risks are recycled X DOM, optimistic source state, account transitions, action dialogs that change URL, source publication coalescing and interrupted operations. The registry, fresh identity checks, retained results, explicit uncertainty, contextual editor gate and real acceptance matrix address those risks without weakening route enforcement. The current host command channel is an author-trust mechanism, not a security boundary against a malicious applet author.

Completion requires real action controls across all X renderers, qualified contextual website editor entry, working native Share/Copy, HN corrections, portable factory updates, preserved isolation/navigation/data, and recorded acceptance outcomes. Unavailable credentials or unapproved social-write verification leave those rows blocked, not passed. A screenshot, typecheck or successful website entry alone cannot establish interaction parity.

## Planning verification

This task inspected current manifests, applet renderers/adapters/models, public SDK signatures, native command dispatch/provider adoption/sharing code, factory instructions/skills and active-phase documents. Read-only live DOM inspection confirmed the X source-button/foreground-link mismatch and one disabled Repost state. It did not click controls, submit anything, change account/backend data, install packages or change app code. The temporary local inspector forward was removed; pre-existing inspection state was preserved. HN findings are from code inspection. Implementation checks and social-write qualification remain future work. Local document links and whitespace are checked before the planning commit.

## Implementation outcome

The user authorized implementation after planning. Applet action execution, owned controls, contextual Reply, optional native sharing, HN fragment correction and factory guidance are implemented and installed. See [delivery verification](../../../.reports/phase-5/2026-11-01/144631-x-interactions-verification.md) for exact revisions, component commits, observations and unperformed cases. Existing read commands remain the public transport; load-more completion uses foreground observation rather than an additional read-result protocol. Social persistence, Quote context, private/inverse/localized confirmations and the full accessibility/HN device matrix remain unqualified. No real social mutation or record reset was performed.
