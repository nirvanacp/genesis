# Genesis isolated applet foreground implementation plan

Status: proposed implementation, not released behavior. Project: Genesis platform, X and Hacker News applets, and portable creator guidance. Phase: `phase-5`, selected from `proto/phase-5`. Created 31 October 2026, Asia/Kolkata.

## Request and completion boundary

The user wants every applet to declare a maintained URL contract, run upstream website documents behind its own foreground, and use a framework web-view provider whenever an external or uncustomized website must be visible. Loading, network failure and navigation must never expose source DOM inside the custom layout. Preserve one X app and one HN app, their current stable IDs, accounts, records, services and reachable workflows. Future applets must use the same contract.

This task produces this plan only, plus the repository-required development record. Do not implement the runtime or update the operating/architecture/creator documents during planning. The steps below specify those later edits. Do not modify `AGENTS.md`; the user has not explicitly authorized agent-instruction edits.

The implementation is substantial. Execute the component commits in order, with the acceptance gates below. A platform demo or migrated manifest does not complete either applet. All new interfaces below are proposals and must be implemented before applet code imports them.

### Scope and exclusions

In scope: route classification, independent foreground rendering, source adapters, bounded live communication, explicit website presentation, lifecycle/recovery, X/HN migration, creator enforcement and documentation. Preserve existing Android native navigation and existing backend data authority. Keep site selectors, route inventories, content types and application rules in applets.

Excluded: a new backend architecture, multi-user backend support, distribution/publisher trust, a general browser replacement, continuous collection while the app is backgrounded, cloning website DOM into the foreground, undocumented website API clients, bypassing authentication/challenges, and new or changed test files. Existing tests and temporary manual verification are allowed. HN's existing Search placeholder remains accurately identified; implementing search is not part of this change. YouTube stays inactive, with old packages handled by compatibility policy.

## Evidence and adopted context

There is no `.docs/phase-5/` or previous `.plans/phase-5/` guidance at the time of investigation. The following current files and selected older guidance establish the baseline. Paths in this plan are relative to the Genesis repository root unless a working directory is stated.

- [Browser architecture](../../../.architecture/browser-runtime.md), [platform ownership](../../../.architecture/platform.md), [X](../../../.architecture/x.md) and [HN](../../../.architecture/hacker-news.md).
- [Factory workflow](../../../factory/AGENTS.md), [product scope](../../../factory/guides/product-scope.md), [patterns](../../../factory/guides/patterns.md), [verification](../../../factory/guides/verification.md) and the two applet READMEs.
- Adopt the phase-4 [two-app plan](../../phase-4/2026-10-30/214048-genesis-two-complete-applets-plan.md) only for stable identities, one launcher entry per app, data preservation, real integrated qualification and preservation of daily workflows. This plan supersedes its shared-document presentation, source-navigation restoration and ordinary-source fallback design. The latest X README supersedes older custom account-hub proposals.
- Adopt toolchain/check commands from [platform maintenance](../../../.docs/phase-3/2026-10-30/162034-genesis-platform-maintenance.md), verified against package scripts and `tools/build.mjs`. Do not treat its older presentation model as phase-5 requirements.

Observed code facts:

| Component | Existing behavior and architectural consequence |
| --- | --- |
| `packages/sdk/src/manifest.ts`, tools `src/routes.mjs`, Rust `routes.rs` | Runtime API 2 has optional customized paths/patterns and ordinary exclusions. No customization list means all paths are eligible. Matching uses pathname, so it cannot distinguish HN item IDs or query-sensitive X views. |
| `factory/applets/x.com/src/main.tsx`, `source-navigation.ts`, `source.css` | X installs controls and styles into X's document and retains most source rendering. It does not own a complete foreground. |
| HN `src/main.ts`, `source.css`, `story-interaction.ts` | HN styles upstream tables, inserts controls and intercepts row navigation. Its source DOM remains foreground content. |
| `packages/sdk/src/bootstrap.ts`, `runtime.ts` | Activation readiness and managed effects are document-scoped. Activation completion is not a proof that the source has loaded valid route content. |
| `BrowserAdapter.java`, `HostViews.java` | `maybeReveal()` reveals the source WebView after commit, preparation and a visual callback. Same-document changes and later DOM mutations can still change that visible document. |
| Rust `controller.rs`, especially `classify_url`, `navigation_presentation`, renderer failure | Same-source ordinary routes remain in the original view. Failure recovery can recreate ordinary browsing. Neither is a persistent foreground boundary. |
| `BrowserAdapter.openReader/closeReader` | A separate bridge-free child reader already exists. Reuse its navigation ideas, but remove assumptions that Close should reveal the original source WebView. |
| `sources.rs::LiveView`, `MainActivity.java` | Retention, handshake identity and routing assume a document is both the visible view and the active broker client. A foreground plus active hidden adapter needs explicit roles. |
| `PackageAssets.java`, tools `build.mjs` | Hashed packaged pages and local asset loading already exist. Extend these for the foreground instead of introducing a UI engine. |

This establishes a design weakness, not a device reproduction of the user's intermittent incident. No authenticated X/HN session was exercised during planning.

## Architecture and invariants

Use a packaged foreground WebView and separate source WebViews, coordinated by Rust. The source website continues to own its DOM, JavaScript, session and native forms. An applet adapter extracts bounded data from its source. The applet foreground renders new semantic elements from that data, never a live source subtree. React remains optional.

```text
Native shell, Back, recovery and website controls
    |
    +-- applet presentation
    |     +-- packaged foreground WebView, applet-owned UI
    |     +-- permanent opaque native backing layer
    |     +-- source WebView, website DOM and scoped adapter
    |
    +-- explicit website presentation
          +-- provider-managed website view, actual origin and Close

source adapter <--> Rust identity/route broker <--> foreground
                         |
                 navigation and view lifecycle
```

The native backing layer always separates source pixels from the foreground. It is independent of CSS, foreground JavaScript, readiness and loading cover dismissal. A transparent foreground, a crashed foreground, removal of its root, a theme change or an interrupted transition exposes an opaque native background, never the website underneath. Keep native error/retry UI above it.

Core invariants:

1. While presentation is `applet`, a source view never receives user touch, accessibility focus, keyboard focus, context menus, permission prompts, fullscreen presentation or visible popups. Source HTML cannot remove the native barrier.
2. A source route match grants only its adapter eligibility. It does not mean the content is valid or ready, nor does it authorize source presentation.
3. Website presentation happens only through the provider and an explicit foreground/native user intent. Unknown redirects, errors and crashes never automatically switch presentation to website mode.
4. All routes, including unmatched routes, produce a deterministic outcome. All custom outcomes name an adapter handler and foreground screen. No implicit customize-all default.
5. Host-derived identity binds each event to applet instance, package revision, view role, source session, generation, document, navigation epoch and route revision. Payloads cannot supply authority.
6. Foreground code has no source DOM access. Source code cannot call frontend storage/services or drive arbitrary foreground script execution. Both roles have a limited public SDK.
7. The active hidden adapter can run while its applet is foregrounded. This is not a background service. Suspension and eviction are normal, observable states.
8. Any fallback preserves app identity and return navigation. Applet backend records and upstream account state keep their existing independent authorities.

### Native composition and resources

Create `AppletPresentation.java` to own the ordering of source container, permanent opaque backing, foreground container, transient native recovery and provider container. Keep `HostViews.java` responsible for shell and host messages. Give source views normal nonzero viewport dimensions and layout so responsive/virtualized sites can work. Initially keep the active source attached and `VISIBLE` beneath the opaque native barrier, with descendants excluded from accessibility, touch and focus. Do not rely on `display:none`, `opacity:0`, zero dimensions, `GONE`, screenshots or the website's own CSS to establish isolation.

Source media must be silent; require a supported per-view mute mechanism for isolated source execution, deny hidden fullscreen/custom views and require user gesture for media. If a provider lacks a required control, show unsupported-provider recovery and allow deliberate website mode. Do not silently weaken the guarantee. Avoid global audio/timer changes that pause the foreground too. Verify compositor-backed video cannot escape native occlusion. If a provider cannot satisfy that invariant, disable isolated mode on that provider rather than releasing a CSS workaround.

The initial hard budget is one active foreground, at most two source WebViews, and at most one external provider WebView, four total across the active applet. An adopted source provider view counts as an existing source, not an extra view. Other applets retain serializable navigation metadata, not live WebViews. Evict the least-recently-used inactive source after saving permitted history and applet view state. Never silently evict a provider view with a live form; resolve its leave guard or reject the new navigation with a usable explanation. Do not promise preservation of arbitrary JavaScript state after eviction. Serialize in-memory route stacks and scroll anchors with a bounded size; persist only non-secret allowlisted UI state.

The layout approach is a proposed implementation requiring device qualification. Android documents visibility/attachment conditions for visual callbacks; callbacks establish a drawn frame, not validity of website content. See [WebView API](https://developer.android.com/reference/android/webkit/WebView#postVisualStateCallback(long,%20android.webkit.WebView.VisualStateCallback)).

## Mandatory URL contract

Introduce manifest schema 2 and runtime API 3. Keep bundle format 1 and data schema 1 because the envelope and stored applet data do not need redesign. SDK/tools move together to `0.4.0`. Validate the schema/API combination explicitly in TypeScript tooling, Rust and Java package handling.

A proposed source and route declaration:

```ts
interface RouteContract {
  id: string;
  origins: string[];                 // exact HTTPS origins
  routes: RouteRule[];               // ordered, first match wins
  unmatched: "unsupported";          // required, no source exposure
}
interface RouteRule {
  id: string;
  path: string;                     // existing bounded segment grammar
  query?: Record<string, "present" | { equals: string }>;
  fragment?: { equals: string };    // omitted means not used for matching
  result:
    | { kind: "custom"; screen: string; adapter: string }
    | { kind: "website"; reason: string }
    | { kind: "blocked"; reason: string };
}
interface SourceV3 {
  id: string;
  startUrl: string;
  routeContractId: string;
  entry: string;                    // source-adapter bundle
  homePaths?: string[];              // section/root metadata only
}
// New manifest fields, in addition to stable identity, pages, shell and services:
// routeContracts: RouteContract[]
// foreground: { pageId: string; screens: string[] }
// source entries use SourceV3 instead of legacy customization/navigation fields.
```

The `foreground.pageId` names one declared packaged page that exports `defineForeground`. Existing library/search pages remain declared and are rendered inside this foreground as owned destinations. The foreground registers named screen handlers; runtime startup rejects missing or extra registrations against `foreground.screens`. Adapter startup likewise registers handlers for the custom rules associated with its source. These registrations are validated before content readiness. The packager verifies referenced entries, screens and routes but does not pretend a static scan proves adapter behavior.

Shared route contracts prevent the five X source sections and three HN sections drifting apart. Each source keeps its existing ID and points to the applet's shared contract. Contract origins are the source's permission list. Different applets can use the same origin without sharing broker identity. Do not add X or HN patterns to platform code.

### Matching and validation algorithm

Implement the pure resolver in tools `src/routes.mjs` and Rust `routes.rs`, with the same documented behavior. Tooling bundles the JavaScript resolver for document-start eligibility. Rust remains authoritative; document-start code only narrows eligibility and cannot authorize itself. Avoid an independent Java regex implementation.

1. Parse an absolute URL. Reject credentials, malformed escapes, disallowed schemes, encoded slash/backslash/dot/double-encoding sequences already rejected by the current matcher, and paths exceeding bounds. Never decode a pathname twice. Validate raw input before parser normalization where normalization could erase rejected dot segments.
2. Normalize scheme/host/default port through the URL parser. Match exact origin. Do not turn `www`, `twitter.com`, redirectors or suffix-matching domains into source permissions. An outside origin resolves to `external`, with no adapter.
3. Evaluate rules in declared order using case-sensitive pathname segment matching. Preserve meaningful trailing slashes. Keep the existing terminal wildcard semantics, including matching the prefix with no remaining segments. Dynamic parameters match nonempty segments only.
4. Query constraints are checked on parsed values. A constrained key must occur once; duplicate constrained keys yield `unsupported`. Extra query keys are permitted and retained for source navigation, but never recorded verbatim in diagnostics. No match ignores the query for navigation identity, even if it ignored query for classification.
5. The first rule matching path, query and optional fragment supplies the route ID and result. The source adapter validates dynamic parameter semantics and actual content identity before publishing ready data. An unmatched path or malformed required item ID produces an owned unsupported state.
6. A canonical navigation key includes origin, path, query and fragment. Preserve query ordering initially to avoid assuming website equivalence. `pushState`, `replaceState`, hash and query changes all invalidate the old route binding when this key changes, even if the rule ID is unchanged.

Use current 256-character pattern and 16-segment limits. Limit contracts to 100 rules each, query constraints to 16 per rule, URLs to 8 KiB and total contract metadata to 128 KiB. Validate unique IDs, exact origins, valid rule shapes, existing screen references, unique query keys and no legacy fields in schema 2. Reject duplicate match predicates and provably unreachable rules after an unconditional broader rule. Explicit order resolves intentional overlap, such as `/settings/*` before `/:handle`; report such overlaps in `check --json` so maintainers can review them. Do not claim to enumerate every route a third party may ever invent. Mandatory known coverage plus a mandatory unmatched outcome makes classification total.

Require every source start URL and native choice to resolve explicitly to a declared custom or website rule, never unmatched or blocked. A website-only start opens an owned route landing with a clear Continue action unless selection itself is a user action explicitly labeled as opening the website. Permission-change reporting compares contract origins as it currently compares source origins. Route changes remain part of hashed revision identity.

## Adapter-to-foreground contract

Add SDK roles `foreground` and `source-adapter`; provider documents have no SDK role. Retain old `source`/`page` types only in the legacy compatibility path. Extend `ExecutionContext` in `packages/sdk/src/protocol.ts` and shared Rust contracts with role and host-owned session/route identity.

Proposed public API shape:

```ts
// Source entry. Handlers never render user-visible UI.
defineSourceAdapter({
  routes: {
    timeline: async context => {
      // Managed watchers inspect source DOM and publish bounded snapshots.
      // context.signal aborts when this document or route is retired.
    }
  }
});

interface SourceSnapshot<T> {
  state: "loading" | "ready" | "empty" | "auth-required"
    | "challenge" | "unsupported" | "error";
  data?: T;
  error?: { code: string; message: string; retryable: boolean };
}
// SourceAdapterContext:
// publish(snapshot): Promise<void>
// onCommand(handler): Dispose
// watchElements, signal, onDispose and read-only route metadata

// Foreground entry:
defineForeground({ screens: { timeline, detail, profile, library, /* ... */ } });
// ForegroundContext:
// source.subscribe(sourceId, callback): Dispose
// source.command(sourceId, {name, payload, expectedSnapshot}): Promise<result>
// navigation.open({sourceId, url}): Promise<void>
// navigation.back(), pages.open(pageId), onFocus, storage, services, modal, leave guard
// webViews.open({url, sourceId?, reason}): Promise<{sessionId}>
// webViews.close(sessionId): Promise<void>
// webViews.onClosed(callback): Dispose
```

Finalize exported TypeScript types with these semantics in the SDK step. `publish` wraps payloads in host-issued route identity; it cannot target another applet or an arbitrary foreground. Introduce RPC methods `source.publish`, `source.command`, `source.commandResult`, `foreground.ready`, `webViews.open`, `webViews.close`. Host events deliver `source.snapshot`, `source.state`, `source.command`, `route.changed` and `webViews.closed`. A foreground subscription receives the latest accepted snapshot immediately, then subsequent replacements. Source adapters are not a service credential proxy.

Retain the 256 KiB RPC envelope, 32 pending requests and 15-second request deadline. Limit one snapshot data payload to 192 KiB, one cached snapshot per live source, and publication to four per second per source with latest-value coalescing. Reject oversized snapshots explicitly; adapters page/window lists instead of silent truncation. Use monotonically increasing source sequence numbers; drop duplicates and out-of-order deliveries. Send a versioned JSON envelope only, never DOM nodes, raw HTML, executable text, credentials or cookie values.

The host maintains the trusted tuple:

```text
(instanceId, packageRevision, role, viewId, generation,
 documentId, channel, sourceSessionId, navigationEpoch, routeRevision)
```

Accept a publish only from the active eligible adapter or an explicitly retained eligible source in the active applet. Route it only to that applet's current foreground. Retained inactive sources are paused and may finish existing bounded work, but cannot start collection. On navigation, cancellation, provider adoption, logout/account change, app switch, update or eviction, retire the binding and pending commands. A late completion cannot refresh a different screen or account. SDK role checks improve errors; Rust checks provide enforcement. Extend completion routing in `controller.rs` and `MainActivity.java` rather than relaxing current active-view checks globally.

Commands are applet-defined bounded JSON with a declared name and expected snapshot sequence. The adapter revalidates route, current element identity, content key and account before acting. Start with read/navigation commands such as selecting a feed and loading the next window. Never automatically retry a command that may mutate upstream state. Timeout means unknown result, not success or permission to repeat. Keep upstream login, compose, reply, upload, voting and account actions in the provider until a separately implemented, explicitly qualified action contract exists. Applet category writes stay in the foreground and use existing operation receipts and revisions.

### Concrete model and error contracts

Put shared transport envelopes in the SDK, but keep these content models inside the respective applet. Extend fields only for an implemented screen; never publish a complete source document.

```ts
// Applet-local examples; all content is validated before publication.
type TextPart = { text: string; href?: string; emphasis?: "strong" | "em" | "code" };
type Item = {
  id: string; canonicalUrl: string; author?: { id: string; name: string; url?: string };
  text: TextPart[]; title?: string; publishedAt?: string;
  counts?: { replies?: number; score?: number; reposts?: number; likes?: number };
  media?: { kind: "image" | "video"; url?: string; alt: string; sourceUrl: string }[];
};
type FeedModel = {
  kind: "feed"; variant: string; items: Item[];
  tabs: { id: string; label: string; selected: boolean; url?: string }[];
  next: { kind: "url"; url: string } | { kind: "source-scroll" } | null;
  complete: boolean;
};
type DiscussionModel = {
  kind: "discussion"; item: Item;
  comments: { id: string; parentId: string | null; depth: number;
    author?: string; text: TextPart[]; url: string; replyUrl?: string }[];
  nextUrl?: string;
};
```

X adds profile, people, notifications, collection and media variants in its own `domain.ts`; HN adds user, leader and informational variants in an applet-local `view-model.ts`. Each is a discriminated union with the fields its renderer needs. Reuse existing post/bookmark snapshot fields where they have the same meaning; do not change persisted record types just to match live view models. Notifications must retain their actual event category and stable identity, rather than converting all notifications to posts. Profile models distinguish viewed identity from a separate signed-in account observation with states `unknown`, `signed-out` and `signed-in`.

Validate all list lengths, text lengths and URL schemes before `publish`; cap individual text fields at 16 KiB and report oversized content with a provider action instead of truncating invisibly. The foreground validates model shape again before rendering. Rich text is a bounded array of text/link/emphasis parts; no arbitrary tags/styles. An item can omit unavailable metadata, but never fabricate counts or timestamps. Invalid required identity produces `unsupported` for that content, not a different item selected by position. Render partial lists only with an explicit partial-content indicator and per-item failures.

Use stable SDK error codes `ROUTE_UNSUPPORTED`, `SOURCE_UNAVAILABLE`, `SOURCE_NOT_READY`, `STALE_CONTEXT`, `INVALID_PAYLOAD`, `PAYLOAD_TOO_LARGE`, `RATE_LIMITED`, `COMMAND_TIMEOUT`, `PROVIDER_UNSUPPORTED`, `USER_CANCELLED` and `INCOMPATIBLE_RUNTIME`. SDK errors contain code and retryability; screen copy belongs to applets or native recovery, and no stack traces or bridge identifiers appear in normal UI. Pending calls reject once on retirement. Provider Close resolves once per provider session and carries its opener token plus `closed`, `failed` or `process-lost`; the host validates the token before restoring a route.

### Content validity and fetching more rows

An HTTP 200 or a matching selector is insufficient. Each adapter checks the expected content family, source URL parameters and record identity, plus login/challenge/error indicators. Empty requires an affirmative empty marker or known complete page structure. Missing rows during loading must not become an empty feed. Published data records carry stable item IDs and destination URLs. Render strings as text; validate links and media URLs before use.

For virtualized X feeds, use bounded `loadMore`/`selectFeed` commands that scroll or operate the active source and re-extract items. Deduplicate by post identity, retain explicit cursor/window metadata, and cap the foreground feed to 200 items before offering a reload/next window. A source scroll is a website behavior prerequisite, not a visible scroll synchronization scheme. The foreground tracks its own stable item scroll anchor. Layout-dependent source work must be qualified with the actual hidden viewport. No general cross-source live scraping API is added.

## State, navigation and recovery

The foreground loads from verified local assets before source readiness. It paints its shell/skeleton and reports `foreground.ready` after its first layout commit. Native code reveals only the foreground after its own visual callback. Source readiness independently replaces the skeleton. Display a recoverable timeout after 15 seconds without a valid source state; keep Back, sections and Retry available. Retry creates a new epoch and cannot unblock an old event.

Use separate state fields rather than a single overloaded `ready` boolean:

| State owner | States |
| --- | --- |
| Foreground | starting, mounted, failed, retired |
| Route | resolving, loading, ready, empty, auth-required, challenge, unsupported, error |
| Source | dormant, loading, active, suspended, failed, adopted-by-provider, closed |
| Presentation | applet, website |

On initial navigation, render a new route skeleton. On refresh of the same route/account, keep the last valid owned content, mark it stale and disable source mutations until revalidated. On a different route, never display old content under the new route title. On account changes, clear in-memory private snapshots immediately and recheck the existing backend account gate; do not delete stored records. Authentication uncertainty is distinct from signed out.

All navigation intents use one Rust resolver: native section selection, foreground link, source redirect, push/replace state, Back/Forward, provider return, deep link, restored history and explicit `sources.open` compatibility calls. Classify main-frame destinations at start and again at commit. JS route observation supplements native callbacks; its reports are bound to its current document and checked against native URL where available. A silent source mutation can still invalidate the content without changing URL; adapters must publish unsupported/loading rather than retaining a false ready state.

Keep an applet route stack containing source/page, source URL, owner section, stable scroll anchor and view-state token. Native Back order: owned modal/transient UI, provider fullscreen, provider history/Close, owned route history, owning section, launcher. Preserve existing bounded Back acknowledgements and leave guards. Histories of the source and foreground are not interchangeable. Suppress duplicate stack entries for adapter refresh and `replaceState`; a native Back request has one token and one committed result.

Crash handling covers every WebView affected by a shared renderer failure. Revoke bindings and close invalid views, retain the native opaque layer and show native recovery if the foreground is unavailable. Do not reopen the website automatically. Process restoration reconstructs local foreground first, then source GET state; never restore a POST submission or replay an uncertain action. Asset/hash failure shows native package recovery without loading any source visibly.

## Framework website provider

Extract existing reader handling into `WebViewProvider.java`, controlled by Rust state and the SDK `webViews` API. A route can be explicitly classified `website` or an owned error can offer Open website. Only a foreground/native user action activates that transition. Source script redirects cannot fabricate user intent. Show actual current origin, Back, Forward, Reload and Close using native chrome. Close restores the owned opener, route state and focus. Automatic redirects within an already open provider remain ordinary browsing and never acquire applet capabilities.

Two implementations share one provider contract:

| Kind | Use and lifecycle |
| --- | --- |
| External reader | Create a bridge-free WebView for an HTTP(S) destination outside the selected source, or an independent ordinary GET view. Retain the owned opener. Returning to a known applet URL offers a native Open in app action; do not auto-close on every matching redirect. |
| Adopted source session | For login, challenges, composer, POST flows, blob-backed media or source state that cannot be copied, transfer the existing source WebView to the provider. Retire its adapter, remove future adapter injection, revoke its broker binding and cancel pending commands before making it visible. Preserve the live website state, forms and cookies. The same view can return to hidden source ownership only under the native barrier with a fresh eligible binding. |

Adoption is essential because a POST, in-memory form, challenge or blob URL cannot safely be reproduced by copying a URL to another WebView. Existing isolated-world applet code may not be fully erasable without reload; its broker access must be revoked synchronously, its managed scope disposed, and injection disabled. Do not claim adopting a live document erases every previously executed instruction. It contains no visible custom mounts in this architecture.

On Close from an adopted session, show the foreground first under the permanent barrier, detach provider input/focus, then revalidate. If the source is now a custom GET route, use a controlled reload to establish a clean adapter. If it is still a form/challenge or has unsaved work, apply the leave guard and preserve that provider session until the user chooses to leave. Returning to a noncustom route keeps an owned unsupported/auth state with a Continue on website action. Do not loop automatically between source and provider. Keep the original owner section even if the provider visits another source origin.

For sensitive routes reached by unexpected source navigation, stop adapter delivery and show the owned explanation. Continue adopts the exact session instead of reissuing the navigation. A foreground action explicitly labeled Post, Sign in or Open website can carry that intent directly into the provider without an extra approval dialog.

`shouldOverrideUrlLoading` is not called for POST requests, so request interception alone cannot enforce this design. Keep independent native occlusion and commit/history observation. Never convert a non-GET request into `loadUrl(url)` or copy its body. See [Android WebViewClient](https://developer.android.com/reference/android/webkit/WebViewClient#shouldOverrideUrlLoading(android.webkit.WebView,%20android.webkit.WebResourceRequest)).

Provider policy:

- Do not register the applet bridge for external views. Adopted views lose eligibility even on a source origin. Foreground assets never navigate directly to remote content, and local asset hosts never fall through to network.
- Share the current WebView cookie policy, preserving existing sessions. This is not per-applet account isolation. Cookie/session changes invalidate retained private source snapshots on return.
- Keep current TLS and permission defaults; do not bypass certificate errors. Reject `javascript:`, arbitrary `file:`/`content:` and source-supplied intent launches. `mailto:`/`tel:` or Android intents require a deliberate native external-app action with validated destination.
- Allow a user-initiated popup only within the provider's bounded session handling. Hidden source popups become an owned Continue prompt; deny unsolicited windows. Stateful authentication popups need preserving the originating session and an explicitly qualified transport; if unsupported, explain the limitation and offer system-browser opening without claiming cookies will synchronize.
- Keep current document/epoch-bound file chooser in provider mode. Hidden source file requests are denied. Camera/microphone remain denied under current host capability policy. Downloads use an explicit host/system action; do not add filesystem capability to applets.
- Media requiring source cookies, DRM, canvas, blob URLs or unsupported decoding opens in the provider. Static approved public thumbnails can be rendered in the foreground; failures show a placeholder and source action. Never serialize DOM/canvas into HTML as an isolation shortcut.

## Applet migration contracts

Preserve `x-bookmarks` and `hn-bookmarks`, source/section IDs, page IDs, service ID `bookmarks`, backend URLs/protocols, category keys and local records. This change requires no backend migration. Source adapters publish public account identity only to the current applet; the current X account check remains a personal-library safeguard, not authentication of a general multi-user service.

### X

Create applet-local `src/routes.ts` as the authoring inventory if useful, but emit a fully validated JSON route contract into `applet.json`; runtime must not depend on unbundled TypeScript. Keep one canonical manifest contract referenced by all five sources. Do not hand-copy route arrays again.

Owned screen families and coverage:

| Existing paths | Foreground implementation |
| --- | --- |
| `/home`, `/explore`, `/explore/*`, `/search`, `/hashtag/:tag` | `timeline` and `discovery` with real source feed tabs, search input/navigation, post cards, loading, empty and retry states. Query changes such as search terms change route identity. |
| `/:handle`, profile replies/reposts/media/following/followers/verified_followers | `profile` or `people` with validated account/profile identity; the viewed author never substitutes for signed-in identity. |
| `/:handle/status/:id`, `/quotes`, `/analytics` | `conversation` or `post-metadata`, with post identity and thread ordering checked. Unsupported content remains an owned error with provider action. |
| status `/photo/:index`, `/video/:index` | Owned `media` landing with validated metadata; playback or protected media uses the provider. Preserve return to the exact post. |
| `/notifications`, `/notifications/mentions` | `notifications` with actual source categories and content, no fabricated notifications. |
| `/i/history`, `/i/history/likes` | `saved` with Bookmarks, Likes and Categories in one applet-owned row. Categories uses the existing library components and backend. |
| handle lists, `/i/lists/*`, handle communities, `/i/communities/*`, `/i/connect_people` | `collection` or `people`, with route-specific validators and metadata. No blanket ready state based only on generic tweet selectors. |
| `/compose/*` | Explicit website provider route for live source composer, attachments and drafts. |
| Every existing `ordinaryRoutes` entry, including root/login/logout/settings/account/flow/chat/messages/Grok/calls/spaces/premium/legal | Explicit website rule before dynamic handle rules, preserving the actual workflow through the provider. No bridge eligibility. |
| Future/unlisted path | Owned unsupported page with Open website, Retry and Back. |

The wildcard rules above designate families to implement, not proof every future subpath is supported. Adapter handlers validate recognized subtypes and use the owned unsupported state for unknown subtypes. New supported paths update the contract and README in the same commit.

Split existing `src/main.tsx` into adapter registration and `src/app.tsx` foreground. Add `src/adapters/` and `src/screens/` focused modules. Reuse `extract-post.ts`, `domain.ts`, `targets.ts`, repository/category/backend modules and visual tokens after separating source DOM assumptions. Replace source-mounted controls in `post-controls.ts`, `source-navigation.ts` and `folder-source.ts` with foreground controls and adapter observations. Remove `source.css` dependency for user-visible layout. Preserve current typography and product navigation where possible without copying X's live DOM.

Private Categories remains independent of upstream bookmarks. Move the current account round trip in `account.ts` to a scoped adapter account snapshot/command, and revalidate on provider Close/focus. Existing native-folder detection may continue as adapter observation, but never click subscription/folder UI automatically as a migration fallback. Qualified native-folder actions run in the provider; known unavailability can offer existing applet Categories. Unknown availability remains unknown. Preserve `folder-capability.ts` semantics and bounded intent correlation; retire the old visible toast opacity repair because source toasts are no longer applet UI.

All existing core browsing families above require a real owned renderer for completion. Do not map every X route to the provider to claim migration is finished. Upstream social actions and protected workflows remain intentionally website-owned through the provider, as described above.

### Hacker News

Replace all three `customizedPaths` copies with one contract. Implement the following owned families:

| Paths | Result |
| --- | --- |
| `/`, `/news`, `/newest`, `/front`, `/newcomments`, `/ask`, `/show`, `/shownew`, `/asknew`, `/jobs`, `/best`, `/active`, `/leaders`, `/from` | Owned feed/comment-feed/leader list renderer, preserving source links, ranking and pagination. |
| `/item` with one `id` | Owned discussion with validated item identity, comments, parent/context links, collapse state, Visit website and Genesis Save controls. Malformed IDs show unsupported, never the wrong story. |
| `/user`, `/submitted`, `/threads`, `/favorites`, `/hidden`, `/upvoted` | Owned user/list renderer; account-required states are explicit. Validate each page's required query fields in its adapter. |
| `/lists`, `/formatdoc`, `/newsfaq.html`, `/newsguidelines.html` | Owned informational/list renderer using an allowlisted semantic text/link model, not raw HTML. |
| `/reply`, `/login`, `/logout`, `/forgot`, `/changepw`, `/submit` | Explicit provider routes for source forms, tokens and authentication. Preserve Post and reply entry/return behavior. |
| Existing source form action endpoints discovered during implementation, including `/vote` when present | Explicit website rules; do not invoke them through a background GET to verify. Inventory the real form/link targets before final migration acceptance. |
| Unknown path | Owned unsupported state with provider action. |

Reuse extraction in `extract-item.ts` and record types in `post.ts` where appropriate after inspection; `post.ts` currently handles draft behavior, so do not assume it exports a domain model. Reuse category/repository, library and dialog components. Replace source row DOM edits in `main.ts` and `story-interaction.ts` with owned story/comment components. Preserve Me's account state, Saved filters, category operations and independent backend authority. Account/login forms and Post drafts remain source-owned in the provider; keep the current bounded draft behavior only where it can be retained without exporting hidden form tokens or passwords. Do not claim durable provider form restoration after process death.

### Product acceptance journeys

| Journey | Required result and authority |
| --- | --- |
| Launcher to X/HN, feed to detail, Back | One entry per app, owned content throughout, correct section and scroll anchor. Website supplies content; applet renders it. |
| Native section switch while source loads | Foreground shell remains usable; stale source events cannot paint another section. |
| X Saved/Categories and HN Saved | Existing records and service receipts preserved; backend failures remain errors, never empty libraries. |
| Login/challenge/composer/reply/account settings | Explicit provider mode, actual origin, original source forms, Close returns to applet. No automatic mutations during verification. |
| External article or protected media | Provider displays actual destination; Close restores the owned opener and focus. |
| Offline, malformed DOM, package failure, renderer death | Owned/native error with usable recovery; no source content leak. |

## Edge-case verification matrix

Record each row as passed, failed, blocked or not exercised with package revision, device/provider and real versus synthetic evidence. Screenshots of a settled page alone do not prove absence of flashes; use frame recording and accessibility inspection during transitions.

| Trigger | Expected behavior |
| --- | --- |
| Slow bundle/bootstrap, source loads first, foreground root removed | Native backing remains opaque, only foreground skeleton or native failure is visible. |
| Slow network, offline initial load, failed refresh, HTTP 4xx/5xx | Retry/Back work; same-route valid content may remain stale; empty is never inferred from failure. |
| SPA query/hash change, redirect chain, rapid A-B-A navigation | New route identity and epoch; no stale snapshot, command result or focus callback updates the new route. |
| URL matches but DOM is login, consent, challenge, deleted/private post or error | Corresponding owned state; Continue opens provider only after user intent. |
| Source replaces body, mutates after ready, restores an old history entry | Foreground remains isolated; revalidation updates model or error. |
| Reserved X paths overlap `/:handle` | First-match explicit website rules win; no account/settings page is parsed as profile. |
| HN duplicate/missing item ID, encoded path, unexpected port/origin | Contract-defined unsupported/external/blocked result with no eligible adapter. |
| Foreground transparent CSS, source video/fullscreen/popup/keyboard request | Native isolation still holds; no input, sound or accessibility leak from hidden source. |
| Empty feed, virtualized rows recycled, endless scroll | Stable IDs, bounded extraction, verified empty signal and no controls acting on recycled records. |
| Reader redirect to applet URL, auth popup, source POST redirect | Provider owns session; no automatic mode oscillation, GET replay or duplicate submission. |
| Close provider after account switch/logout | Private snapshots cleared, source and backend account gate rechecked, existing stored records untouched. |
| Background/resume, rotation, low-memory eviction, process death | Owned shell first; restartable adapter; state restored only to its documented extent; no action replay. |
| Foreground/source shared renderer crash | Every affected binding retired; native recovery survives; no ordinary automatic fallback. |
| Source command times out after upstream action | Unknown outcome shown, no automatic retry or false success. |
| Backend times out after category commit | Existing receipt reconciliation used; no source mutation or invented offline store. |
| Applet update/rollback while requests pending | Old package bindings revoked, data preserved, compatibility enforced. |
| Oversized/flooded/malformed publication, wrong channel/role/source | Reject with bounded error; no cross-app delivery or unbounded queue. |
| 200% text, dark/light, reduced motion, keyboard, TalkBack | Owned screens remain usable; hidden source excluded; focus restores correctly; Android touch targets and native Back preserved. |

## Ordered implementation and commit boundaries

Before each step, re-read applicable project instructions and current code, preserve unrelated edits, and update one concise `.changelog/<phase>/<local-date>/<time>-...md` record for that logical change. Use the current branch-derived phase at implementation time. Commit only that step after its checks. New files named below are proposed; existing files were verified during planning. Do not add tests unless the user separately requests coverage.

### 1. Define contracts and resolver

Change `crates/contracts/src/lib.rs`, `android/native/src/routes.rs`, `android/native/src/packages.rs`, `packages/sdk/src/manifest.ts`, tools `manifest.schema.json`, `src/manifest.mjs`, `src/routes.mjs`. Add discriminated schema 1/2 validation, API 3 role/session/event types, ordered route contracts and explicit compatibility policy. Avoid changing runtime behavior for an unimplemented API 3 package; reject execution until host capability support is present. Keep API 1/2 parsable.

Verification from root: `cargo fmt --all -- --check`, `cargo check --workspace --locked`, `cargo clippy --workspace --locked -- -D warnings`, `cargo test --workspace --locked`; `node --check` for changed `.mjs`, `npm run typecheck`, `npm run check:packages`. Manually resolve representative X reserved/profile URLs and HN query URLs, duplicates, malformed encodings, wildcard prefix, unknown origin and unmatched route through both resolvers using temporary inputs. Existing package checks must still pass. Record actual existing test coverage, including zero-test suites, honestly.

Commit: `feat/(contracts): define isolated applet route contracts`.

### 2. Implement native composition and lifecycle roles

Change `BrowserAdapter.java`, `HostViews.java`, `MainActivity.java`, `PackageAssets.java`, `AppletRendering.java`, Rust `sources.rs` and `controller.rs`. Add `AppletPresentation.java`; split source and foreground adapter responsibilities into focused classes where necessary, keeping source-only callbacks away from reveal/reader methods. Implement the permanent native barrier, foreground local page, role-bound handshakes, independent epochs, source budgets and failure handling. Preserve render preferences by applet ID while qualifying both view roles. Add MIME-aware local assets as needed and exact-path handling for the foreground; do not allow arbitrary local-origin navigation or network fallback.

Verification: root Rust checks above, then from `android/` run `./gradlew :app:assembleDebug :app:lintDebug`. Use a disposable local fixture on a QA device to remove the foreground root, force delayed activation, rotate, request source fullscreen and kill renderers. Confirm no source pixels or accessibility nodes appear. Do not create a permanent test file. If compositor/hidden-source operation cannot be qualified on the supported provider, stop API 3 release and fix this step; later applet migration cannot substitute for this gate.

Commit: `feat/(android): isolate applet foreground from source views`.

### 3. Implement SDK and bounded source broker

Change SDK `index.ts`, `protocol.ts`, `bootstrap.ts`, `runtime.ts`, `react.tsx`, `rpc.ts`, `build.mjs` and exports as needed. Add focused `source-adapter.ts` and `foreground.ts` modules. Implement the proposed public registrations, source snapshot/command channel, role restrictions, backpressure, registration checks and route abort semantics. Extend Rust message/completion routing and `MainActivity.java` command dispatch for these methods. Scope DOM watcher cleanup to the adapter; modal and React layout readiness belong to the foreground. Storage/services remain foreground capabilities for API 3. Legacy API calls stay confined to their compatibility behavior.

Verification: root `npm run typecheck`, Rust checks and Android assemble/lint if JNI/dispatch changed. Manually publish delayed, oversized and stale snapshots, navigate between same-rule query URLs, retire a source during a command, and attempt wrong-role RPC. Expected outcome is bounded rejection or current-screen update only. Confirm foreground loading does not await source network and readiness does not reveal source pixels.

Commit: `feat/(sdk): connect source adapters to owned foregrounds`.

### 4. Implement website provider and navigation reconciliation

Add `WebViewProvider.java`. Change existing reader methods in `BrowserAdapter.java`, `FileSelection.java`, `HostViews.java`, `MainActivity.java`, Rust `controller.rs`/`sources.rs`, and SDK navigation/provider APIs. Implement both external and adopted session modes, source binding revocation, guarded Close, route stack, provider return/account invalidation and user-intent checks. Replace failure paths that reveal ordinary sources. Handle main-frame POST observations without copying requests, source popup denial, provider file callbacks and renderer failure.

Verification: SDK/Rust checks and Android assemble/lint. On a QA device walk external link/Close, same-source unsupported route/Continue/Close, login redirect without submitting credentials unless authorized, existing form entry/Back without posting, media fullscreen exit, popup failure, stale file chooser result and provider crash. Verify actual origin and owned opener restoration. Obtain authorized real-source access for stateful authentication acceptance; synthetic flows alone are insufficient.

Commit: `feat/(navigation): add explicit website presentation provider`.

### 5. Enforce creator packaging and compatibility

Change tools `src/build.mjs`, `src/check.mjs`, `src/create.mjs`, `src/manifest.mjs`, `src/device.mjs`, `src/kit.mjs`, `prepare-kit.mjs`, SDK/tools `package.json`, root lockfile and `PackageStore.java`. Generate separate adapter and foreground bundles with complete asset hashes. Add registration manifests/metadata needed by SDK validation. Newly created applets always declare schema 2 contracts, one foreground and unmatched handling; even a source-only starter now contains owned loading/unsupported screens. React remains optional. Remove the current hardcoded 0.2.0 creator dependency mismatch and pin the matching 0.4.0 kit versions.

New tools may inspect/build legacy packages for maintenance, but report their legacy mode explicitly and never silently convert them to isolated applets. The completed new host accepts API 1/2 package bytes for rollback/data continuity but presents them only through ordinary provider mode with a clear compatibility explanation and no injected legacy UI. API 3 packages require all new host capabilities and never downgrade to shared-document customization. Enforce compatibility at package import, startup, bundled selection and rollback. Corrupt revision fallback can select older bytes, but must retain this presentation policy. Keep IDs and data; do not reset the app or uninstall it.

Verification: root `npm run typecheck`, `npm run check:packages`, `node packages/applet-tools/check-syntax.mjs`. Pack SDK/tools to a temporary directory, create/check/build a standalone generated applet using the tarballs and no monorepo imports; export the kit and inspect matching metadata. Exercise missing route/foreground, invalid screen reference, incompatible host/API, old package rollback and permission-origin diffs. Existing API 1/2 source trees should still pass maintenance checks. Use Android assemble/lint for package-store changes. Update minimum creator reference examples in this commit only where necessary for package completeness; broader documentation work is step 8.

Commit: `feat/(applet-tools): require isolated applet contracts`.

### 6. Migrate HN

Change HN `applet.json`, `package.json`, `src/main.ts`, `me.ts`, `post.ts`, `story-interaction.ts`, source styles and owned page imports. Add `src/app.tsx`, adapter modules and owned screen modules for the HN mapping above. Reuse library/category/storage/backend code; keep existing source IDs and shell sections. Remove every dependency on exposing source tables. Do not change backend protocol or add search functionality. Update the applet README with the new route inventory, website-mode flows and honest qualification state.

Verification from root: `npm run typecheck`, `npm run check:packages`. From `factory/applets/news.ycombinator.com/`: `npx --no-install genesis-applet check . --json` and `npx --no-install genesis-applet build . --out dist --json`. Run the HN journeys and relevant edge matrix on Android, including live discussion, pagination, account/provider return, category read/write reconciliation and source/network failures. Only perform data mutations that are authorized; otherwise record that verification block. Verify original records survive package update. Commit code only with accurate implemented/verified/blocked status.

Commit: `feat/(hacker-news): render browsing in owned foreground`.

### 7. Migrate X

Change X `applet.json`, `package.json`, source registration, navigation/account/folder/control modules and library imports. Add `src/app.tsx`, `src/adapters/` and `src/screens/` as described. Implement all listed screen families with explicit subtype validation. Keep current native sections, signed-in Profile, Bookmarks/Likes/Categories navigation and backend authority. Remove source layout CSS as a UI dependency and the opacity patch. Sensitive actions use the provider with context and return state.

Verification from root: `npm run typecheck`; from `factory/applets/x.com/`: the same CLI check/build commands as HN. Root selected-package checks do not include X today, so verify its bundle explicitly. Qualify real signed-in timelines, profile, conversations, notifications, Saved and Categories; force a delayed redirect, network error and DOM mismatch without posting/messages or subscription/account changes. Verify infinite-scroll/virtualization with the occluded source viewport, media/provider return, folder fallback correlation and stale account invalidation. Keep any inaccessible route marked blocked rather than reducing coverage to a generic provider shortcut.

Commit: `feat/(x): separate source adapters from applet screens`.

### 8. Update architecture and creator/user documents

Apply the documentation matrix below after the APIs and applets exist. Write statements about released behavior only when verified. Keep legacy behavior in a clearly labeled compatibility section. All new generated guides go under `.docs/<active-phase>/<local-date>/<time>-...md`; current `.architecture/` files are updated in place. Older phase documents remain historical and are not moved. Do not edit `.archive.` files. Do not modify `AGENTS.md`; include a precedence note in new phase guidance that the implemented API 3 source/foreground/provider contract replaces legacy mixed-document examples.

Verification: check all local Markdown links, code/manifest examples against the actual SDK/schema, factory export contents and terminology. Search current docs for obsolete CSS-only starter, source reveal, ordinary fallback, active-view-only and hidden-source prohibitions and resolve each in context. `git diff --check` must pass. Do not regenerate a binary solely for prose changes.

Commit: `feat/(docs): document isolated applet architecture`.

### 9. Integrated qualification and rollout

Build the host with `node tools/build.mjs --stage all --variant debug` from root, then `./gradlew :app:assembleDebug :app:lintDebug` from `android/`. Confirm toolchain prerequisites from the maintenance guide; do not invent passing native checks if unavailable. Install as an update on an authorized QA device, preserving signing identity and data. Use explicit device serials. Do not start applet backends without user authorization; connect to existing approved services or record the service block.

Run the full matrix for HN and X on the current emulator and a physical Android device, including recording transition frames, TalkBack, large text, reduced motion and hardware/software rendering preferences. Capture package/host revision, provider versions, failed/blocked rows and sanitized evidence in a new `.reports/<phase>/...` record. No authenticated page text, tokens or private queries in saved logs. Debug diagnostics should include route ID, role, epoch, reason and timing, with query values redacted.

Do not deploy the intermediate platform commits to the everyday device before the HN/X migration and qualification gates. Use a separate QA installation to avoid temporarily replacing working custom apps with the legacy compatibility presentation. Keep `genesis.packages.json` HN selection and existing X development delivery unless changing distribution is separately requested. Do not turn diagnostic fixtures into everyday launcher apps. Before rollout, verify no extra launcher entries and no leftover synthetic records/packages in the everyday environment. Confirm rollback retains data and displays legacy packages safely through the provider. If an applet's required journey is blocked, the plan is partially implemented, not complete.

Commit qualification artifacts as `feat/(verification): qualify isolated applet navigation` after results are recorded. If code fixes arise, use separate component commits with their own records/checks before updating the qualification report.

## Documentation change matrix for step 8

| Existing document | Planned change |
| --- | --- |
| `.architecture/README.md`, `platform.md` | Make phase 5 current; separate website adapter, foreground, provider and native ownership; link this plan and later verified guide. |
| `.architecture/browser-runtime.md` | Replace shared source reveal with independent foreground/source lifecycle, total route contract, broker roles, native barrier, resource budget and explicit provider recovery. Document compatibility. |
| `.architecture/services-and-data.md` | Explain foreground service authority, ephemeral adapter snapshots, account invalidation and unchanged backend stores. |
| `.architecture/x.md`, `hacker-news.md` | Update extraction-to-render flow, route families, provider routes, account/session handling and limits. Remove reliance on source overlays/layout and obsolete readiness claims. |
| `factory/README.md`, `guides/getting-started.md` | New mandatory contract and foreground starter, exact version matrix, no CSS-only applet creation, no need for native compilers for ordinary authors. |
| `factory/guides/sdk-reference.md` | Actual v3 types, role permissions, route matching, publish/subscribe/command/provider examples, bounds, error codes and version rejection. |
| `factory/guides/patterns.md` | Adapters extract, foregrounds render; no source mounting as visible layout; explicit unsupported/auth states and provider forms. Distinguish active hidden sources from background jobs. |
| `factory/guides/product-scope.md` | Require route coverage and owned-screen/provider mapping in the brief while preserving complete app journeys. Website-owned workflows remain explicit provider journeys. |
| `factory/guides/verification.md` | Add contract coverage, no-pixel/no-accessibility-leak, late reply, source action uncertainty, provider return and resource checks; retain no unsolicited test creation rule. |
| `factory/guides/services-and-data.md` | Keep server startup and stores intact; update which runtime role uses services and how account snapshots are scoped. |
| `factory/skills/genesis-build-applet/SKILL.md`, `genesis-customize-applet/SKILL.md`, `genesis-verify-applet/SKILL.md` | Require mandatory contract and coverage updates, separate adapter/UI ownership, inspect source DOM for extraction, verify native isolation and provider return. Update `factory/skills/README.md` descriptions. |
| Both applet READMEs | Product brief, exact route-to-screen/provider inventory, preserved data authority, SDK/host versions and actual remaining verification gaps. |
| `README.md`, `docs/reference/current-support.md`, `docs/reference/glossary.md` | Current compatibility/support and clear meanings of applet, source, foreground, route contract and website view. |
| `docs/create/custom-screens.md`, `multiple-websites.md`, `describe-your-app.md`, `docs/start/first-app.md`, `get-ready.md`, `meet-genesis.md` | Replace mixed-DOM examples with owned rendering, explicit provider journeys and updated setup requirements. |
| `docs/maintain/update-your-app.md`, `troubleshooting.md`, `docs/use/everyday-use.md`, `accounts-and-privacy.md` | Route maintenance, errors without source leaks, Open website/Close behavior, compatibility updates, actual shared-cookie limits. |
| New phase-5 operating guide | Verified build/install/version/rollback procedures, provider support matrix, troubleshooting, migration checklist and links to current architecture. Adopt useful toolchain commands from phase 3 explicitly. |

Search the remaining current documentation for references to these replaced contracts before finalizing. Leave historical phase-2/3/4 records in place; current indexes should point to the phase-5 guidance. This planning task does not perform any of these edits.

## Decisions, risks and finish criteria

User decisions: mandatory route declaration, permanently separate custom foreground, framework-provided website views, preserve X/HN and future applet support, and plan documentation work without performing it now.

Agent architectural decisions: separate packaged/source WebViews, native opaque isolation independent of readiness, ordered shared route contracts with mandatory unmatched state, bounded JSON broker, explicit adopted-source provider for stateful forms, API 3/schema 2, and provider-only legacy presentation on the completed host. These are deliberate design choices to implement, not claims about today's APIs.

Rejected approaches: more source CSS selectors, an always-on same-document overlay, cloning live source nodes, waiting for network idle, treating route match as data validity, automatically showing the source on errors, opening a second GET for a POST/auth session, and replacing all custom screens with a browser. Each leaves either isolation, correctness or the requested custom experience unresolved.

Primary risks are hidden-WebView layout/virtualization and media behavior, renderer sharing, X DOM churn, source actions requiring real user gestures, and the amount of owned rendering to migrate. The native isolation gate is deliberately before applet rewrites. Source-only behavior that cannot be qualified becomes an explicit provider workflow or a reported blocked requirement, never a silent product reduction. No unanswered product question blocks the architecture; device/provider behavior and actual source variants are implementation qualification gates.

Complete only when both applets use mandatory contracts, all specified owned screen families exist, the source never appears in applet mode across the matrix, provider sessions preserve required workflows/return state, existing records survive update/rollback, new creators cannot omit the contract, current guidance matches the actual API, and real verification gaps are resolved or explicitly accepted by the user. Passing typechecks alone does not satisfy this definition.
