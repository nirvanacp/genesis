# Genesis explicit navigation and presentation architecture

Status: proposed implementation plan, not implemented APIs. Project: Genesis platform, SDK/tools, factory, X and Hacker News. Phase: phase-5. Created 1 November 2026, Asia/Kolkata.

## Goal and governing context

Give every applet one explicit, reviewable policy for which URL destinations render custom content, which deliberately use an original website, which are external, and which remain unsupported or blocked. Apply that policy to every navigation entry point. A normal tab, link, redirect or missing selector must never silently change a custom application into a website browser.

The user requested framework architecture, applet migration and factory/documentation changes, with an in-depth implementation plan and no code changes yet. This document chooses an implementation direction; the optional permission to edit factory docs is not used to advertise unreleased APIs. Factory guidance changes are an implementation stage below. No AGENTS.md edits are required or authorized by this plan.

Read these current-phase inputs before implementing:

- [Reproduced X handoff investigation](../../../.reports/phase-5/2026-11-01/100125-x-applet-website-handoff-investigation.md).
- [Platform ownership](../../../.architecture/platform.md), [browser runtime](../../../.architecture/browser-runtime.md), [X](../../../.architecture/x.md), [HN](../../../.architecture/hacker-news.md).
- [Isolated architecture plan](../../phase-5/2026-10-31/171848-genesis-isolated-applet-architecture-plan.md) and [loading plan](085000-genesis-navigation-loading-plan.md). Preserve their isolation, bounded loading, session and data requirements; this plan supersedes their ordinary-link/provider routing where stated below.
- [Current maintenance guide](../../../.docs/phase-5/2026-10-31/194740-genesis-isolated-applet-maintenance.md), root and factory AGENTS.md, factory isolated/product-scope/design/verification guides and build/customize/verify skills.

Current source baseline is commit `e038ced` on `proto/phase-5`. Recheck branch, status and overlapping changes before implementation. No guidance from another phase is adopted implicitly.

## Diagnosis and chosen approach

The repository already has ordered route contracts with exact origins, path/query/fragment predicates, custom/website/blocked results and an unsupported default. The missing piece is consistent execution and presentation of those decisions.

X copies all observed source tabs into its foreground, then its separate `routeKind()` helper sends unknown paths directly to `webViews.open`. Subs is unknown in both helper and manifest, but appears identical to supported custom tabs. Its click bypasses the owned unsupported state. The native `isolatedLink` fallback can also open noncustom destinations without that state. `webViews.open` currently validates URL safety rather than declared navigation intent. HN separately classifies forms and even falls back to a website when an owned comment anchor cannot be found.

One URL is not enough to describe intent. Opening a post means custom reading; replying to the same post may require its original website. The replacement therefore combines **URL coverage with declared website actions**, enforced by the host and reflected by SDK controls. It extends the existing architecture rather than replacing isolated rendering.

The Rust host is authoritative. Tools implement the same declarative semantics for authoring and inspection. Applets keep content validation and source-specific extraction, but stop deciding presentation with independent regex lists. Route matches never establish authentication, valid content or a completed action.

Rejected approaches:

- Add only `/subs`: repairs one instance while preserving every other bypass.
- Broaden custom matching to every same-origin path: grants extraction to unknown pages without a renderer or readiness contract.
- Automatically show a website when custom rendering/loading fails: violates the presentation boundary and hides real faults.
- Automatically reclaim a website whenever it reaches a custom URL: interrupts original forms, media and browser history.
- Require a confirmation dialog for every marked website link: unnecessary repetition. Explicitly marked SDK controls can enter directly; unexpected/uncovered transitions need a framework-owned explanation.
- Implement a second configurable routing language in applet code: creates another source of disagreement.

## Scope and invariants

Required scope includes contracts/versioning, host reducer, Android provider/chrome, SDK navigation controls, tooling/starter/exported kit, X and HN migrations, architecture/operating guidance and integrated verification. Preserve applet IDs, source/page/service IDs, native section identity, cookies and both backends. Keep HN Search's documented placeholder; inactive YouTube remains inactive and receives no feature rewrite.

Non-goals: implementing social mutations in custom UI, bypassing subscriber gates, backend or database redesign, public distribution, multi-user security, full outbound network confinement, OS-browser integration and durable restoration of arbitrary website JavaScript/POST state. No new or modified test files are prescribed because repository instructions require a separate coverage request. Existing checks and temporary, non-delivered diagnostic runs supply verification.

Invariants:

1. Only a custom rule selects an adapter and owned screen. Source content remains hidden during navigation, recovery and errors.
2. Uncovered internal routes are distinct from external sites and from blocked routes. Unknown never means permission to expose a source automatically.
3. A website transition must have explicit intent with a visible destination cue, or a host-owned Continue on website action.
4. Blocked overrides website actions and recovery. Applet code cannot bypass it through old APIs, plain anchors or popups.
5. Website mode stays website mode until explicit return. Its history and the custom opener's history remain separate.
6. Failed or stale navigation cannot replace a newer selection, perform a write, or falsely report successful arrival.
7. Every rule and website action has an author-facing reason and an observable acceptance journey. Declared support and verified support are recorded separately.

## Declarative contract

Introduce manifest schema 3, runtime API 4, SDK/tools 0.5.0 and kit 0.5.0. Keep bundle format 1 and data schema 1. This is a behavioral breaking change: old `webViews.open` callers must not silently acquire new semantics. Retain schema-2/API-3 compatibility separately on the new host.

Reuse existing route grammar, ordering, bounds and query/fragment semantics. Keep `result.kind` as custom, website or blocked. Require a `title` of 1–100 characters on each schema-3 custom result for destination loading/error headings; it is static display metadata, not source content. Website/blocked results retain bounded reasons. Add:

```json
{
  "schemaVersion": 3,
  "navigation": {
    "external": {
      "default": "website",
      "origins": [{"origin":"https://example.invalid","result":"blocked","reason":"Outside this app's supported workflow"}]
    },
    "uncoveredWebsiteRecovery": true
  },
  "routeContracts": [{
    "id":"x",
    "origins":["https://x.com"],
    "defaultSourceId":"primary",
    "unmatched":"unsupported",
    "routes":[
      {"id":"settings","path":"/settings/*","result":{"kind":"website","reason":"Manage account settings on X"}},
      {"id":"post","path":"/:handle/status/:id","result":{"kind":"custom","screen":"conversation","adapter":"conversation","title":"Post"}},
      {"id":"profile-subs","path":"/:handle/subs","result":{"kind":"custom","screen":"profile","adapter":"profile","title":"Subscribers"}}
    ]
  }],
  "websiteActions":[
    {"id":"reply-on-x","contractId":"x","routeIds":["post"],"label":"Reply on X website","reason":"Use X's original reply controls"}
  ]
}
```

This is a partial proposed schema example, not a valid complete applet. Other required existing fields remain. `profile-subs` may ship as custom only after the X acceptance requirements below pass.

Contract rules:

- Each declared internal origin belongs to exactly one route contract within an applet. Multiple sources may share that contract. Reject overlapping origin ownership across different contracts rather than guessing which wins. Current X sources all share `x`.
- `defaultSourceId` must exist and reference that contract. For ordinary links prefer the active source if it references that contract; otherwise use this default. An explicit source selection must reference the destination contract. Never create an applet or switch to a different installed applet implicitly.
- Resolve against the union of the current applet's declared origins. Another declared source origin is internal, not external. Source selection and section selection are separate: ordinary links preserve the opener's primary section; only native section activation changes that section and opens its declared root.
- External origin entries use exact normalized HTTP(S) origins with no credentials/path/query/fragment, unique and disjoint from internal origins. Maximum 64 entries. They override required `default`, which is website or blocked. They control top-level presentation only, not subresources or network confinement.
- Internal extraction remains HTTPS-only. HTTP URLs never match custom routes or silently upgrade to HTTPS. They follow external policy, with an HTTP indicator in provider chrome. Reject malformed URLs, credentials, control characters, unsafe path encodings, app asset origins and non-HTTP(S) schemes before classification. Do not broaden existing canonicalization or decode encoded separators.
- At most 64 website actions, with 1–100 existing custom route IDs from one contract, unique action IDs, label up to 100 characters and reason up to 1024 UTF-8 bytes. Actions reference route IDs rather than duplicating URL patterns. They grant website presentation, not permission to execute a social/account action. Known website rules do not require a redundant action declaration.
- `uncoveredWebsiteRecovery` is required. False means no website fallback for uncovered internal URLs. True enables a host-controlled explicit recovery action. Neither setting overrides blocked rules. Choose true for X and HN.
- Preserve the 128 KiB route-contract limit; cap navigation/actions metadata together at 64 KiB. Both JavaScript and Rust validators must apply the same UTF-8 byte/string bounds and reject unknown fields. New fields must not accidentally pass through the legacy common validator.
- Path/query/fragment matches remain first-match. Duplicate constrained query keys stay unsupported as in the current resolver. Do not strip query strings or fragments to obtain a convenient match. Specific reserved paths must precede dynamic handles; no wildcard custom catch-all as a workaround.

## Decision model and SDK contract

Add a generic platform navigation module, separate from website selectors. These are proposed APIs and names to implement, not existing SDK methods.

```ts
type NavigationTarget =
  | {kind:'url'; url:string; sourceId?:string; websiteActionId?:string}
  | {kind:'page'; pageId:string};
type DestinationKind = 'custom'|'page'|'website'|'external'|'uncovered'|'blocked';
interface NavigationDecision {
  target: NavigationTarget; // URL must be absolute and validated
  kind: DestinationKind;
  sourceId?: string;
  contractId?: string;
  routeId?: string;
  screen?: string;
  title: string;
  reason?: string;
  websiteActionId?: string;
  websiteAllowed: boolean;
  binding: {revision:string; generation:number; navigationVersion:number};
  decisionKey: string;
}
context.navigation.resolve(targets: NavigationTarget[]): Promise<NavigationDecision[]>;
context.navigation.activate(options: {
  decision: NavigationDecision;
  intent: 'navigate'|'open-website';
}): Promise<{status:'dispatched'|'recovery'; navigationVersion:number}>;
```

Host recomputes the decision on activation; caller-supplied `kind`, label or permission is never authority. `decisionKey` is a deterministic hash of canonical target, resolved result, action and binding, not a security credential. Reject mismatched keys/bindings with `STALE_NAVIGATION`; the SDK re-resolves and updates the control, requiring a fresh activation when destination mode changed. Never reinterpret a stale custom click as website consent. Resolve accepts at most 64 targets and 64 KiB total input, deduplicates by full target, and returns positional results. Normal RPC bounds/timeouts remain.

Increment `navigationVersion` on foreground destination/source epoch changes, native section activation, website entry/return, policy revision and teardown. Resolution itself does not navigate, load a URL, authorize extraction or change history. SDK caches at most 256 decisions per binding and clears them on version change/disposal; no process-wide or cross-account cache. Source adapters cannot call these methods. Absolute URL construction must use the source model's actual base URL before calling resolve, never the packaged foreground asset URL.

Add a typed `navigation.subscribe` snapshot containing current destination decision, version, mode and, for an unresolved navigation, bounded recovery metadata. Snapshot contains no website DOM/form fields. Retain `source.subscribe` for source content and make its route result strongly typed. Source adapters receive read-only current resolved route metadata through their context and `navigation.onChange`; no additional foreground authority. Applets use the resolved screen/adapter rather than `routeKind(location.pathname)` to decide model/render families. Parsing a handle/post ID and checking observed content identity remains applet-owned validation.

Provide public vanilla `createNavigationControl(context, options)` and React `NavigationLink` / `NavigationTab` helpers. Options carry target, text/children, optional accessible label and custom style classes; callers cannot override decision kind or suppress website/external indicators. Resolve pending controls keep their geometry, are temporarily non-activating and expose busy status. Batch/cache shared work rather than issuing one RPC per render.

For custom/page controls, activate with navigate. For website/external controls, add a visible website/external indicator and accessible suffix, then activate with open-website. A declared website action uses its declared label. For uncovered controls, preserve discoverability and activate a framework recovery view with the original label and explanation; never mark an uncovered tab as successfully selected. Blocked controls explain unavailability without navigation. Applets can implement equivalent custom controls only using the same descriptors, visible cues and activation contract.

These rules prevent accidental authoring errors in trusted applets. They do not prove that malicious applet code labeled a button honestly or that an SDK call came from a real human gesture. Keep the existing trusted-author threat model explicit.

## Host policy and navigation state

Implement a single `decide_navigation(manifest, selection, target)` function with no side effects and a separate execution function in the isolated reducer. Order: raw URL safety, internal origin ownership, ordered route match, blocked outcome, optional website-action applicability, destination/source selection, external rules. An invalid action ID or a target outside its declared route set returns blocked with `INVALID_WEBSITE_ACTION`; do not fall through to ordinary navigation.

| Decision / intent | Execution |
| --- | --- |
| Custom/page + navigate | Preserve opener history, create next owned destination, start hidden source only if custom |
| Website/external + open-website | Explicit provider entry; adopt exact-current source or create independent reader |
| Website/external + navigate | Framework-owned website handoff view; provider opens only after its Continue action |
| Uncovered + navigate | Framework-owned unsupported view; Back always available, Open website only when policy permits |
| Custom + open-website without applicable action | Reject; no generic escape hatch |
| Uncovered + open-website from applet | Reject; only the host recovery control may approve this outcome |
| Blocked | Keep owned explanation; no provider or hidden-source load |

Use a native host-owned recovery panel above the opaque source barrier. It keeps the applet identity and native primary navigation, names the destination using safe static route metadata, displays actual origin without query values, and has Back plus the permitted explicit website action. Keep current foreground/source behind it for return. This avoids making every applet reinvent recovery or allowing a failed foreground to expose source pixels. SDK snapshots let the foreground dismiss transient menus and stop pending actions.

Recovery stores a monotonically identified pending destination and the opener's selection/history position. Back dismisses recovery without consuming the opener's prior history. Opening a provider from recovery returns to that recovery view on Close, with Back restoring the original custom screen. A new section/navigation replaces recovery and invalidates its action ID. Repeated taps must not stack panels or readers. Native recovery IDs are internal, generation/version-bound and never persisted.

Custom history remains bounded to 64 entries. Website entry does not append each website visit to custom history. Close restores the exact opener, selection and available owned scroll/cache state; account-dependent content revalidates under existing rules. Preserve the current bounded in-memory lifetime guarantees, not arbitrary durable page state.

### Every entry point must converge

- New SDK navigation methods and helpers call the central policy.
- API-4 `sources.open` compatibility wrapper goes through navigate with explicit source; `pages.open` goes through page target; direct API-4 `webViews.open` is rejected with `USE_DECLARED_NAVIGATION`. Keep legacy behavior only for API-3 documents. Storage/services/back handlers are unaffected.
- Foreground ordinary anchors, modified clicks, `target=_blank`, `window.open` and top-level location changes enter the same policy. Plain links have no verified website cue, so noncustom outcomes show recovery. A programmatic non-gesture attempt cannot open a provider. Retain bounded popup disposal and reject general opener-dependent popup protocols rather than inventing support.
- Hidden source top-level URLs, server redirects, SPA push/replaceState, hash/query changes and source-command outcomes are resolved before new adapter authority is bound. They are passive navigation observations, not consent to expose a website. Custom → website/external/uncovered/blocked shows owned recovery and retires inappropriate source authority. Never convert a POST into a GET or replay it.
- Android callbacks may arrive after an HTTP redirect/load already began. Do not promise prevention of all network requests. They must still prevent source exposure and privileged adapter injection for an unaccepted destination. Check exact view, epoch and generation before acting.
- Native sections and manifest choices pass through the same decision. Website-starting sections show a handoff view; supported roots keep immediate owned skeletons. API-4 schema loading must select the isolated reducer, not the legacy controller.
- Native retry reloads only an eligible custom/source failure or the current provider; it does not change the route policy or auto-enter a website.

For source-only tabs with no URL, keep epoch-bound read commands. An observed same-document state update may remain custom only while the contract and observed content identity remain valid. If it changes URL, apply passive-navigation rules. A read command is never an implicit declaration of website intent.

## Original website mode

Preserve exact-current WebView adoption, bridge retirement, cookie/form continuity, file-picker ownership, fullscreen handling and boolean dirty-field guard. Independent readers remain bridge-free. An explicit action opens the original page where the user performs the operation; it must not claim Follow/Reply/Like succeeded.

Native chrome says Website, shows actual origin, and provides a persistent visible **Return to [applet name]** action separately from website Back/Forward. Adapt the existing bar to two rows when needed rather than shrinking labels at 200% text. The website's own footer is allowed inside website mode; the custom native section bar is not duplicated there. Use Android touch targets, focus order, TalkBack names and light/dark contrast. No new app sidebar.

Inside an entered provider, safe navigation stays in that provider even when a destination has custom coverage. Enforce explicit blocked routes and external deny policy on each main-frame transition/redirect. Same-origin uncovered URLs may remain in an already explicit website session when uncovered recovery is allowed; otherwise show provider-local blocked navigation with Back/Return. A blocked attempt must not destroy a healthy form/opener. Track the actual current origin; do not infer it from the first URL. Frame/subresource requests do not grant extraction authority and are outside this policy's navigation scope.

Keep existing Back behavior: exit fullscreen first, traverse website history, then close when no history remains. Return always means restore opener and honors dirty-field Stay/Leave. Close/return source-origin sessions triggers fresh account/source validation; stale cached private data cannot flash. If the foreground died behind a healthy provider, Return uses native recovery and recreates the owned interface. Process recreation restores only existing eligible custom GET selections, never a provider POST or recovery consent.

Do not implement “open this website's current page in the applet” in this migration. It is a separate feature requiring deliberate session/POST and history rules. The persistent Return control solves the immediate ambiguity.

## Applet migration requirements

### X

Keep one `x-bookmarks` applet and existing five native sections, records and account checks. Change `applet.json`, `src/main.tsx`, `src/view-model.ts`, `src/app.tsx`, `src/components/post.tsx`, related library links and README. Search the whole applet for URL opens so Saved/category/detail paths do not retain a bypass.

- Replace `routeKind()` as navigation authority with host descriptors and source route metadata. Remove duplicated route-to-screen regex routing. Retain safe entity parsing and `matchesDestination` content checks, driven by the accepted screen and exact destination.
- Observed tabs carry bounded label/key/URL/selected state as today; foreground resolves all URL tabs before rendering. No-URL read-command tabs remain epoch-bound and do not inherit website permission.
- Add `/:handle/subs` as custom profile reading. Inspect authorized live DOM first. Publish a validated matching profile/tab identity and distinguish available posts, affirmative empty content, a subscription-required state, authentication and actual errors. Subscriber-gated content gets an owned explanation and a declared subscription website action. Never subscribe to qualify it. If real source access blocks completion, keep the required custom journey marked blocked; do not claim a website-only mapping completes it.
- Profile Posts/Replies/Reposts/Media and Subs retain custom navigation. Declare observed additional read-only tabs only when their model/renderer is implemented. Unknown future tabs remain visible with owned unsupported handling. Do not predeclare every possible X URL custom.
- Keep profile photo/banner as explicit website routes in this migration, with visible “View photo on X website” / banner equivalents. Custom photo viewers are optional future work; the inconsistency fix is honest routing and labeling.
- Post body and Show more both open custom post detail. If the detail cannot retrieve complete text, keep the owned excerpt and expose a separately labeled Read full post on X website action. Do not promise full text from an incomplete model.
- Declare website actions for reply/repost/like/bookmark/share/video/follow and current-page options, referencing applicable route IDs. Settings/messages/composer/auth routes remain explicit website outcomes. Actions that merely open the page must use wording that describes that behavior and not report a successful mutation.
- Keep internal Categories as a page target; distinguish X bookmarks from private Categories. No store or account schema changes.
- Pending titles come from accepted route title, so a profile entered under Home says Profile or Subscribers while loading. Continue destination/account-matched cache and skeleton rules.

### Hacker News

Keep `hn-bookmarks`, existing native sections, service, records and Search placeholder. Change `applet.json`, `src/app.tsx`, `src/main.ts` as needed for route metadata, library/navigation consumers, and README. Remove the hardcoded `form` path list as presentation policy; manifest website routes and actions own it.

Internal feed/item/user/information links remain custom. External articles use explicitly indicated external website controls. Reply/vote/login/post/account workflows stay original-site flows with exact session preservation. Article title links receive the external cue as well as Visit website buttons.

A same-discussion comment fragment first scrolls to an existing owned comment. If the comment is outside the bounded model, navigate to its declared custom permalink and load the needed context; if still unavailable, retain owned recovery and an explicit original-page action. Never auto-open a website merely because the foreground anchor is absent. Preserve URL fragment/query identity and do not publish form tokens or logout URLs as new routing metadata.

## Ordered implementation and commit boundaries

Complete, verify, update one development changelog per logical component and commit each stage before starting its dependent stage. Do not mix unrelated work. All commands below run from repository root unless stated otherwise. New paths below are deliberate additions; other paths were verified in the current tree.

### 1. Contracts, policy resolver and version compatibility

Modify `crates/contracts/src/lib.rs`, `android/native/src/routes.rs`, `android/native/src/packages.rs`, `packages/sdk/src/manifest.ts`, `packages/applet-tools/src/routes.mjs`, `src/isolated-manifest.mjs`, `src/manifest.mjs`, and `packages/applet-tools/manifest.schema.json`. Add focused `android/native/src/navigation.rs` and `packages/applet-tools/src/navigation.mjs` for composed decisions. Keep path matching reusable and separate from execution.

Implement schema-3 policy/action definitions, exact origin ownership, default-source selection, decision shapes and bounds. Explicitly pair schema 3/API 4 and schema 2/API 3. Accept supported versions as a full list, not `[1,2,current]`, which would drop API 3 after a constant bump. Strictly reject mismatched pairs. Stage version constants so no intermediate commit makes current API-3 bundles unbuildable. Do not publish artifacts yet.

Verification: `cargo check --workspace --offline`, `cargo test --workspace --offline`, `node packages/applet-tools/check-syntax.mjs`. Run the actual Rust/JS resolvers through temporary diagnostics on identical cases from the acceptance table; compare normalized decisions. Existing tests alone do not cover this new behavior. Use scratch artifacts outside delivered applets and document commands/results. Commit `feat/(contracts): define explicit navigation policy`.

### 2. Rust lifecycle and Android presentation

Modify `android/native/src/isolated.rs`, `src/lib.rs`; Android `IsolatedBrowser.java`, `HostViews.java`, `AppletPresentation.java`, `MainActivity.java`, `PackageAssets.java`, `PackageStore.java` under `android/app/src/main/java/app/nirvana/genesis/`. Add focused `NavigationPresentation.java` if needed for native recovery panel and provider-mode chrome; keep website selectors out of all these files.

Implement side-effect-free resolve, recomputed activation, version invalidation, pending recovery and website execution above. Fix `route_state` to handle an explicit matched blocked result as blocked, rather than falling into unsupported. Route old API-4 opens, native links, source redirects and popups through policy. Enable isolated runtime selection for schema 2 and 3. Extend status capability reporting with API 4 while retaining API 3; include supported schema versions. Add content-free navigation diagnostic entries to the existing bounded ring: route/action ID, decision, initiating role, mode, transition/rejection code and version. Never include raw URLs/query values, profile handles or form data.

Verification: `cargo clippy -p genesis-android --offline -- -D warnings`, `cargo test -p genesis-android --offline`; from `android/`, `./gradlew --offline :app:assembleDebug :app:lintDebug`. Confirm existing API-3 X/HN still open on the new host before migration. Use temporary component diagnostics for stale versions, wrong actions, blocked rules and recovery teardown. Do not install a throwaway app on the everyday launcher. Commit `feat/(android): enforce navigation decisions and explicit return`.

### 3. SDK and standalone creator tooling

Modify SDK `src/index.ts`, `src/runtime.ts`, `src/protocol.ts`, `src/bootstrap.ts`, `src/react.tsx`, `src/owned-scope.ts`, `build.mjs` and package metadata; add `src/navigation.ts` and focused shared controls/styles. Replace exact `runtimeApiVersion === 3` assumptions with explicit isolated-version handling for 3 and 4, preserving timer scheduling, registration, source role restrictions and ready behavior. Update `defineSourceAdapter` and exported foreground/context types. Avoid exposing navigation resolve/activate to source adapters.

Modify tools `src/build.mjs`, `src/check.mjs`, `src/cli.mjs`, `src/device.mjs`, `src/create.mjs`, `src/kit.mjs`, package metadata and root build/selection validation where schema-version branches apply. New tooling emits API-4 packages for schema 3. SDK 0.5.0 advertises supported runtime APIs `[3,4]` and preserves API-3 behavior when bound to API 3; tools choose the emitted runtime from the manifest, not solely from the newest SDK constant. Tools accept schema-2 builds with SDK 0.4.x or 0.5.0 and schema-3 builds only with SDK 0.5.0. Interpret SDK 0.4.x’s existing single API constant as `[3]`. This permits the workspace SDK to advance before both applets migrate, without fetching an unpublished older package. Reject incompatible SDK/schema pairs with actionable messages. Device acceptance checks supported version lists instead of equality to 3. Preserve old host installation of old bundles.

Add proposed CLI `routes inspect <applet-directory> --url <absolute-url> [--source <id>] [--action <id>] --json`. Return exact rule, kind, selected source, screen, action, website permission and fixed reason; exit nonzero for invalid arguments/manifests, return successful inspection for a valid blocked/uncovered result. This command runs locally and loads no website. Add `routes list <directory> --json` for the declared coverage inventory, actions, fallback/external policy and unresolved verification status in applet documentation. Do not present declared routes as verified.

Static check validates all declared references and flags legacy direct `webViews.open` usage in API-4 applets using TypeScript AST inspection, not a regex-only safety claim. Dynamic aliases and native anchors remain host-enforced. Emit diagnostics for catch-all custom rules as review warnings, while exact unreachable/invalid declarations remain errors. Generated React and vanilla starters use helpers and native recovery, contain a realistic internal/website/external policy example, and never claim complete website support from a starter.

Verification: `node packages/sdk/build.mjs`, `npm run typecheck`, tooling syntax checks, CLI inspection for every acceptance case, old and new package checks. Create/check/build both starter variants in disposable `/tmp` directories with supplied local archives. Verify resolve RPC deduplication, cache invalidation and stale click handling with temporary component diagnostics. Commit `feat/(sdk): expose policy-driven navigation controls` and, separately after SDK verification, `feat/(applet-tools): inspect routes and scaffold explicit navigation`.

### 4. X migration

Implement the X requirements above with public API only. Update applet package dependency versions, manifest, adapter/model/renderers and README together. Record declared route, model/readiness evidence, renderer, website action and acceptance status for each changed journey.

Verification: `node packages/applet-tools/src/cli.mjs check factory/applets/x.com --json`; build with `node packages/applet-tools/src/cli.mjs build factory/applets/x.com --out /tmp/genesis-x-navigation --json`. In-place development installation uses `dev install /tmp/genesis-x-navigation --device emulator-5554 --replace --json` only after host compatibility is verified. Execute the X rows below on the real authenticated source, keeping social/subscription actions unsubmitted. Commit `feat/(x): migrate browsing to declared navigation policy`.

### 5. HN migration and shared-host regression

Implement HN requirements, package/manifest changes and README. Verify standalone check/build with corresponding `factory/applets/news.ycombinator.com` and `/tmp/genesis-hn-navigation` paths. Rebuild the APK-selected HN bundle via root `node tools/build.mjs --stage frontend --variant debug` before assembling/installing the host for bundled qualification. Confirm any existing development override is identified so the device actually runs the intended HN revision. Record both revisions from device status. No data reset or extra launcher entry.

Run real feed/discussion/profile/fragment, external story/provider return, protected-form entry/cancel and Saved read/return journeys, then X smoke on the same host. Commit `feat/(hn): adopt explicit route and website navigation`.

### 6. Factory, architecture and operating documents

Update the documents in the next section after APIs stabilize and before creator release. These are part of implementation acceptance, not optional cleanup. Keep current deployed instructions accurate while work is staged; unreleased examples must remain marked proposed until a compatible host/SDK/tools set is available.

Verification: check Markdown relative links, cross-check signatures against exported declarations, render/inspect code examples through actual create/check/build flows, run `git diff --check`. Commit `feat/(factory): document navigation coverage and handoffs`.

### 7. Packaged delivery and final qualification

Set SDK/tools/kit to 0.5.0, synchronize package-lock and applet dependencies, schema/API metadata, factory compatibility tables and `kit.json` generation. Review `packages/applet-tools/prepare-kit.mjs` and packed kit output; exportKit copies guides/skills from factory, so the new navigation guide must travel with it. Build SDK, `npm pack ./packages/sdk --pack-destination <temporary-directory>` and equivalent tools pack. Verify both starter types using only those extracted packages and exported factory guidance, outside repository-relative imports.

Run root `npm run typecheck`, `npm run check:packages`, existing Rust checks and Android assemble/lint. Rebuild/qualify the final delivered artifact set, not just a preceding debug build. Save a phase-5 verification report with exact host/provider/device/package revisions and table status. Update current architecture and maintenance qualification links only after results exist. Commit `feat/(release): qualify explicit applet navigation artifacts`.

## Required factory and document changes

Add `factory/guides/navigation.md` as the portable navigation contract. It must explain all five URL outcomes plus local pages, same-URL actions, source selection, intent, unknown tabs, source redirects, provider return, no-URL commands and declared-versus-qualified coverage. Include small valid schema/API examples verified against the release. Do not require internal repository plans or Android/Rust source to build an ordinary applet.

| Existing file | Required change |
| --- | --- |
| `factory/README.md`, `factory/skills/README.md` | Link navigation guide early; describe new compatibility and mandatory coverage workflow |
| `factory/guides/product-scope.md` | Require a journey inventory including normal links, tabs, same-URL actions, external destinations and return behavior; retain unresolved scope as required/blocked |
| `factory/guides/isolated-applets.md` | Replace low-level provider escape examples; document authoritative decisions and separate content validity; retain hidden-source architecture |
| `factory/guides/getting-started.md` | API-4/schema-3 artifacts and route inspect/list workflow; old-package compatibility and migration steps |
| `factory/guides/sdk-reference.md` | Exact types, RPC errors, cache/version lifecycle, helpers, legacy rejection, source route metadata and provider limits |
| `factory/guides/patterns.md` | Source → resolved target → visible control → activation examples; forbid `unknown => webViews.open`, default catch-all custom and missing-anchor provider fallbacks |
| `factory/guides/design.md` | Visible website cues, unsupported tab presentation, destination-based loading title, Return versus website Back, focus/large-text behavior |
| `factory/guides/verification.md` | Connected entry/redirect/history/return matrix, hidden source checks, unknown query/fragment cases, wrong action/stale decision cases, exact version evidence |
| All three `factory/skills/genesis-*/SKILL.md` | Require the navigation guide and route/action inventory; build declares it first, customize updates it with renderer/model changes, verify attempts every escape path and return flow |
| X/HN README | Supported routes/actions, known website workflows, uncovered fallback, acceptance status and actual release versions; remove claims that all unknown links already remain owned |
| `.architecture/{README,platform,browser-runtime,x,hacker-news}.md` | Current implemented authority, state model, ownership, compatibility and applet coverage after rollout |
| `.docs/phase-5/2026-10-31/194740-genesis-isolated-applet-maintenance.md` | Version checks, install/rollback order, navigation diagnostics and provider-return qualification; retain its creation path |
| Root README and `docs/README.md` | Check entry links/version claims and point authors to current factory navigation guidance |

The mandatory applet inventory contains: journey/control label; example URL; contract/rule; selected source; custom screen/adapter or website action; readiness/empty/gated/error evidence; cue; expected Back/Return; declared status; actual verification status. Model it in README tables, referencing manifest IDs rather than duplicating executable path logic. Dynamic tabs must be resolved even when absent from the documented examples.

Skills must state that a passed manifest/typecheck proves neither content extraction nor navigation continuity. If a core route is inaccessible, report it blocked rather than redefining the application around accessible pages. Website handoffs are legitimate only when declared, visibly communicated and verified for return. Do not insert instructions to submit protected actions merely to verify routing.

AGENTS.md files remain unchanged; their existing factory skill/guide routing is sufficient. Generated packed kit files should be refreshed through the pack workflow, not hand-edited.

## Acceptance matrix

Run existing checks plus temporary local diagnostics and real device journeys. No permanent test suite modifications without a separate user request. Static decisions and real DOM/session evidence must be labeled separately.

| Case | Observable required result |
| --- | --- |
| X profile → Subs → Replies/Media → Back | Remains owned; correct tab/content identity, gated state stays owned; no original footer/chrome appears |
| X future unmatched tab | Owned unsupported view with honest website option; previous tab is not falsely replaced by loaded content |
| X post body vs Show more | Both use custom detail; explicit full-text website action is separate |
| X photo/banner, reply/follow/video entry | Website cue before activation, correct original URL/session, no operation submitted automatically, clear Return |
| HN discussion fragment not in current window | Custom context navigation or owned recovery, never automatic website entry |
| HN external article | External cue, actual origin, website browsing remains there, Return restores original discussion/feed |
| Same internal URL with/without website action | Custom browse versus declared website workflow; invalid/incorrect action rejected |
| Other declared source origin | Selects declared source within the same applet, maintains opener section and Back; no accidental external browser |
| Explicit source inconsistent with contract | Rejected before new source/reader is created |
| Unknown internal versus unknown external | Different decisions and controls; no origin-based ambiguity |
| Query/hash changes and duplicate constrained query | Full identity preserved; unsupported cases remain owned; no normalization into a broader route |
| Bad escapes, encoded separators, credentials, appassets, nonweb schemes | Blocked through SDK, anchors, redirect and popup paths |
| Plain anchors, modified clicks, target blank and script navigation | Same policy; noncustom unmarked navigation cannot silently enter website |
| Hidden redirect custom → login/unknown/external | Owned recovery, no auto-exposure, exact source session available only on deliberate website continuation |
| Source tab command changes URL | Reclassified and epoch-bound; stale command cannot open provider or update replacement content |
| Website → custom-covered URL | Remains website; no automatic takeover; Back is website history, Return restores opener |
| Website blocked redirect | Navigation stopped/recovered without losing healthy opener or bypassing declared block |
| Dirty form Return | Stay preserves current session; Leave returns safely; no POST replay |
| Slow/error/offline custom content | Owned skeleton/error with correct destination title, no provider fallback |
| Stale resolution, rapid double tap, new section during resolution | Version rejection, no reader stacking or stale mode switch |
| Source-origin website Return / account changes | Revalidation before private content; no stale account/cache flash |
| Renderer crash behind provider | Provider usable; Return shows native recovery and recreates custom foreground |
| Legacy/new package combinations and rollback | Explicit compatibility outcomes; prior code/records/cookies retained; no mixed policy claims |
| 200% text, narrow layout, dark mode, TalkBack, keyboard | Website cues and Return remain visible/named/focusable; source absent from accessibility |

Sampling video verifies sampled transitions, not every frame. Record initiating actions through completion; do not accept only settled screenshots. Keep tokens, private content and raw URL queries out of persisted diagnostics. Preserve functional backend tunnels and clean up temporary diagnostic forwarding and device files. Do not install extra test applets on the everyday launcher or clear user data.

## Rollout, risks and completion

Roll out backward-compatible host support first, then SDK/tools, then X, then bundled HN, then factory release artifacts. A host supporting API 4 must still run API 3 with its existing semantics. Old hosts reject schema-3/API-4 packages before activation; old SDKs must not generate apparently valid API-4 packages. Update device capability checks and record permissions review for changed declared origins. Rollback selects the prior immutable package revision and compatible host without migrating/resetting records.

Known risks are classifier drift between Rust and tooling, unexamined navigation callbacks, changed source markup, inaccessible subscriber content, and stale resolution while models re-render. Mitigations are actual cross-resolver diagnostics, the exhaustive entry-point checklist, inspection-backed applet models, explicit blocked acceptance status and host recomputation/version checks. SDK controls reduce author mistakes; native policy supplies the fallback when those controls are bypassed. This is a navigation/presentation contract, not a malicious-code sandbox.

The design assumes continued use of the in-app website provider and existing form/media boundaries. These assumptions preserve current architecture and the user's request for controlled customization. No implementation-blocking product question remains for the framework. Source access can still block live applet qualification and must be reported then.

Implementation is complete only when the new policy is enforced across entry points, X/HN use it without local presentation routers, the reproduced Subs flow passes, provider return is clear, packaged factory-only starter workflows pass, data identity is preserved, and required matrix results and remaining environment limits are recorded. A declared custom route with an unimplemented renderer is not completion.

## Plan validation performed

This planning task checked existing filenames, local document links, current public API signatures, runtime/schema compatibility branches and the original investigation. The proposed signatures and new files are explicitly identified above. No application code, factory instruction, package, service or device state was changed by this planning task. No implementation/build/device verification is claimed. Local Markdown-link and whitespace checks passed before the documentation commit.
