# Verify and maintain an applet

Read [explicit navigation](navigation.md) for schema-3/API-4 URL coverage, website actions, SDK controls and Return behavior. SDK/tools 0.5.0 use the host policy for new applets. Schema-2/API-3 examples below remain legacy compatibility reference wherever they use direct `webViews.open`; migrate those calls through resolve/activate or the navigation controls before using API 4.

Read [the isolated architecture](isolated-applets.md) and its route inventory first. Check the owned foreground, hidden adapter and explicit website provider independently, then together.

Start with the requested behavior and the selected applet, not the entire platform. Record SDK/package version, source routes, host build, and device/provider for live checks. Follow [factory instructions](../AGENTS.md); do not create or modify test files without a coverage request.

Use the brief and acceptance-flow table from [product scope and clarification](product-scope.md). Verify the requested application, including preserved workflows, rather than only the newest component. Ask before assuming expected behavior when a material product choice is unresolved. Follow the user's existing authorization for both applet and platform work.

## Static and development checks

From the standalone applet directory with its installed SDK/tools:

```sh
npx --no-install genesis-applet check . --json
npx --no-install genesis-applet build . --out dist --json
npx --no-install genesis-applet dev status --device emulator-5554 --json
npx --no-install genesis-applet dev install dist --device emulator-5554 --replace --json
git diff --check
```

Omit `--replace` for first installation. `check` validates the manifest, file containment, optional service declaration, and TypeScript. `build` emits bounded hashed assets plus `bundle.json`, rejects backend imports and undeclared bundle files, and invokes no native compiler, device, or backend. Output replacement is permitted only for its recognized generated directory. Rebuild after source changes; edit the applet rather than generated bundle bytes.

Use `node --check <changed-file.mjs>` for backend scripts. Frontend checks do not validate a server protocol or prove website behavior. Device status reports package acceptance/revisions, not source loading or backend availability. A timeout after install is an unknown outcome; inspect status before retrying. Rollback preserves current records.

For Genesis monorepo examples, maintainers can also run root workspace typechecks and selected-bundle checks. Read the actual `genesis.packages.json` selection and device status; root checks do not cover every installed development applet. Historical HN-only selection is not a product scope rule. Native host work uses the platform's own maintenance instructions; external applet work does not require them. Frontend-only platform stages no longer need Cargo.

## Integrated acceptance and diagnostic boundaries

Start at the actual delivered launcher. Confirm the intended application count and stable identities, enter the requested screen, perform the authorized action, verify its actual store/result and return to the opener. Include account/sign-in, section switching, detail/reader return and source forms where the requested app uses them. Reopen the feature to check persistence. Static checks, package receipts, backend health and isolated UI previews each establish only their own result.

Label evidence by what was exercised: static, component with synthetic providers, integrated real source/service, and actual device. Record source/account access, revision and provider without exposing credentials. If login is blocked, real authenticated acceptance stays blocked. Synthetic records can check layout or client behavior but cannot pass source selectors, identity, upstream actions or full integration. Still screenshots do not establish motion quality.

Prefer a separate QA environment for disposable packages. Before installing one on an everyday device, record its ID, purpose and safe supported cleanup method. Verify that it is absent from everyday navigation before handoff. Do not assume visibility/removal commands exist, edit private registries manually or clear user data to clean the launcher. If safe cleanup is unavailable, avoid the extra installation; report any existing leftover as incomplete delivery. A report-only verification task records this finding without mutating the device.

## Live acceptance checklist

For visual work, also follow [design and interaction fidelity](design.md). Compare equivalent screens at comparable CSS widths, appearance and text scale. Inventory every changed control, including items moved into menus, and verify its actual destination/result plus Back/Close. Record visual, component, integrated-source and device evidence separately. Native resemblance does not establish native feature parity.

| Area | Check and expected result |
| --- | --- |
| Product scope | Intended launcher entries and full required journeys match the brief. Sources, internal pages, readers and services have not become extra delivered apps. |
| Source identity | Correct records on supported routes; incomplete/unrecognized markup skipped; recycled nodes never retain another record's controls. |
| Cleanup | Repeated navigation/reload creates no duplicate mounts or listeners. Leaving an element removes its owned effects. Late results cannot change replacement content. |
| Initial UI | Initial page shell/loading state appears without waiting on service data. Customized page reveal and recovery work on the actual host. |
| Navigation | Source → local page → source, detail Back, external reader Close, and section return reach the expected destination and selected section. |
| Source semantics | Links, selection, login, hidden form fields, and source actions retain their meaning. Inspect consequential actions without submitting them. |
| Records | Create/read/update/delete only disposable applet records as authorized; confirmed state persists across restart. A failed read is visibly different from no records. |
| Conflicts/failures | Competing updates preserve or explain conflicts. Timeout does not automatically repeat a write. Offline/invalid service states preserve navigation and existing rows. |
| Retention | Focus refresh rereads state; drafts survive intended switches/recreation. Do not promise all JavaScript state survives eviction. |
| Multiple sources | Each source uses only its declared origins and own record identity; combined pages distinguish source/freshness; one unavailable source does not invent data. |
| Accessibility/layout | Narrow/wide layouts, large text, long content, IME, light/dark mode, reduced motion, labels, focus, and TalkBack remain usable. |

Capture only authorized evidence, excluding passwords, account settings, private page contents, and service tokens. Screenshots show final layout; recordings with described sampling are needed for transition claims. Do not claim absence of every one-frame flash from a few screenshots.

## Diagnose by owner

| Symptom | First place to inspect |
| --- | --- |
| New applet missing from launcher | dev status, applet ID/revision, compatible debug host, and matching install receipt; do not assume an accepted package has loaded its source. |
| Controls missing/attached to wrong item | Source extraction, selector, content key, route coverage; applet. |
| Page never becomes ready | Default export, activation rejection or network wait, owned root, React initial commit; then host diagnostics. |
| Only local page loses styles | CSS placement inside its Shadow DOM; applet. |
| Service unavailable | Declaration, provisioned connection, reachable server, auth/TLS/health; separate environment failure from applet response parsing. |
| State stale after section return | `onFocus` refresh and storage/service authority; pending calls may not survive switching. |
| Origin/Back/recovery wrong across applets | Minimal host reproduction with source/page/reader sequence; platform. |

Give a platform maintainer the SDK/host versions, minimal manifest, entry, exact steps, expected/actual result, and sanitized errors. Do not include personal data or ask the user to reverse-engineer the host.

## Maintenance handoff

Update the applet README with supported source routes, behavior, data authority, backend setup if any, and known gaps. Preserve applet IDs and data on updates. Source websites can change independently; record the date and routes inspected, and isolate adapter changes from record-schema changes. Report checks as passed, failed, or not run with a reason. Existing historical device reports apply to those builds only.

For each requirement separately report implementation status and verification result. Identify blocked requirements and explicitly user-approved deferrals; do not conflate them. Keep core gaps visible in the final answer and current operating guidance. A developer-only subset or installed preview is not a completed full-client deliverable. Continue independent authorized work and report the precise remaining dependency when it prevents completion.

Website file inputs use Android's system document picker for single or multiple selection, up to 16 selected content URIs. No blanket storage or camera permission is requested. File-selection cancellation and stale-view result rejection need device qualification; attachments stay in the requesting website workflow, never in applet records.

For faded overlays, inspect the control and its composed ancestor chain: opacity, alpha backgrounds, filters, blending and stacking contexts. Shadow DOM does not prevent ancestor opacity. Distinguish an intentional backdrop from a faded dialog panel. Compare settled samples with animation entry/exit. Correct computed styles with incorrect pixels require a separate native renderer/ancestor-alpha investigation. Genesis maintainers can use `node tools/inspect-ui-surfaces.mjs <CDP endpoint> <target-id> <selector>…` from the monorepo. It samples for one second without mutating DOM or collecting page text. This is a maintainer tool, not a portable SDK API.

## Isolated-runtime acceptance

Verify actual internal links, query/hash changes, section switches, Saved/detail/Back, external reader/Close and source-owned forms. During slow/offline loading and source errors, inspect frame recordings and accessibility trees to confirm no upstream pixels/nodes enter applet mode. Check source audio, autofocus, popups and fullscreen attempts. Recycled source rows and stale callbacks must not update another item/account/route. Confirm provider Close restores owned state and revalidates account data. Report exact device/provider/revisions and separate synthetic from real authenticated checks.

## Isolated runtime diagnostics

In a debuggable host, Developer tools / Inspect current document explicitly enables local WebView inspection for the current applet visit. Leaving disables it. Keep diagnostic forwarding local and remove it afterward. Simulate creator failure and Terminate renderer should retain a native opaque recovery screen, with Retry recreating the foreground. The legacy 20-reload control is not available for API 3. Source-only schema-1 packages in a mixed API-3 host use ordinary website presentation; they are not isolated custom applets.

## Transient recovery acceptance

Follow [loading observations](patterns.md#loading-is-an-unresolved-observation). Record supported navigation from its initiating action through valid content, including slow SPA assembly after HTML completion. Normal loading must not display failure/Retry/website-demand UI. Check real offline/adapter failures and bounded timeout separately, including Back, later recovery and stale callbacks. Preserve native navigation, account-safe content and source isolation. Report recording/sampling and exact revisions; settled screenshots do not pass this requirement.

Verify [default skeleton presentation](design.md#skeletons-are-the-default-pending-ui) on every asynchronous owned screen and dialog, including retained-content refresh and pagination. Capture pending and settled states; check hidden status labels, dark appearance, large text, cancellation, errors and return. Normal wait states must not display loading prose.

## Navigation acceptance

Verify declared custom/website/action/uncovered/external/blocked decisions independently from real-source rendering. Exercise ordinary anchors, target-blank, redirects and query/hash updates as well as SDK controls. Check wrong-action/source rejection, stale decisions, missing owned anchors, website history versus Return, dirty-form Stay/Leave and source-origin account revalidation. A typecheck, route match or package receipt cannot qualify these connected journeys. Record unperformed cases explicitly.


## Interaction contract

Follow [actions and navigation](interactions.md). Inventory buttons, local menus, source mutations and protected editor workflows separately from URL coverage. Opening a containing page cannot qualify the action its icon promises. Source actions require current identity, observed results and uncertainty handling. SDK 0.5.1 adds optional native sharing on capable API-4 hosts.
