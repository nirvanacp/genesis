# Customizable applets backed by browser tabs

Research date: 24 October 2026, Asia/Kolkata.

Question: How can a vibe coder create a persistent app-like interface backed by one or more browser tabs, and what could prevent it from working?

Status: technical research and engineering proposals. No app implementation, device experiment, model trial or performance benchmark was performed. This document does not change the approved Bonsai implementation plans.

## 1. Recommendation and scope

For broad customization, investigate a programmable HTML/CSS/JavaScript applet with an explicit API for observing and operating app-owned source tabs. Keep the native Android host responsible for tabs, persistence, navigation and lifecycle. Offer reusable components as a convenience, while allowing authors to create new web components. Compare this against a restricted native catalog before committing.

This recommendation follows the user's latest requirement that vibe coders should customize what they see. It is broader than Bonsai's current native-catalog MVP. A fixed catalog is a good bounded product, but cannot supply arbitrary layouts and behaviors without adding components to the host.

Use three rendering modes selectively: modify an existing page for small changes, render a separate interface for substantial changes, and show the original website for complex interactions that are expensive to reproduce. Do not implement all three before the first comparison experiment.

Assumptions:

- The first target is a normal Android application, not an Android replacement.
- The host owns the source browser instances. It cannot assume control of another app's tabs.
- Source services are accessed through their pages and controls. Direct service APIs and hidden endpoint calls remain outside this comparison, following the existing Bonsai decisions.
- An applet can contain its own local logic and storage, but cannot obtain service data that the source tabs have not exposed.
- Foreground operation comes first. Multiple source tabs are an explicit capability to qualify, not an existing implementation.
- Security hardening and store-policy analysis are outside the requested scope. Origin, execution and authentication boundaries appear where they determine functionality.

Evidence labels used throughout: **Fact** means a documented capability or inspected source declaration. **Judgment** means a comparison based on the proposed architecture. **Target** means a suggested acceptance threshold. **Example** means arithmetic using assumed values.

## 2. What the DOM does and does not provide

**Fact.** Android WebView exposes JavaScript evaluation in the displayed page, with calls and callbacks on the UI thread. It is a useful control mechanism, not a complete applet runtime. [WebView API](https://developer.android.com/reference/android/webkit/WebView#evaluateJavascript(java.lang.String,%20android.webkit.ValueCallback%3Cjava.lang.String%3E)).

**Fact.** The DOM standard defines node trees, events and mutation observation. These describe a document, not a service's entire database or application state. [DOM standard](https://dom.spec.whatwg.org/).

**Fact.** Virtualized interfaces render a subset of their records. TanStack's example declares 10,000 rows but renders the virtualizer's current items. A DOM reader cannot treat the current node count as the complete record count. [Maintainer example](https://tanstack.com/virtual/latest/docs/introduction).

**Fact.** A canvas can draw bitmap content. The visible objects drawn inside it need not be individual DOM elements. Treat canvas-heavy editors and games as a different compatibility class. [HTML canvas specification](https://html.spec.whatwg.org/multipage/canvas.html#the-canvas-element).

**Fact.** An ordinary web page cannot freely read the DOM of a different-origin iframe. An embedder or extension can have separate injection capabilities, but those must be implemented and qualified per frame. [Cross-origin access specification](https://html.spec.whatwg.org/multipage/nav-history-apis.html), [Chrome injection targets](https://developer.chrome.com/docs/extensions/reference/api/scripting).

**Judgment.** The useful abstraction is an observable source with operations, completeness and freshness. A screenshot or a DOM snapshot alone is insufficient to define an app's behavior.

## 3. Four implementation approaches

### A. Modify the existing website

Load the website normally. Apply creator-authored CSS and small JavaScript changes. Add your own controls in a separate container when necessary. Preserve the site's original controls where possible.

Required parts: script/style injection, page and route matching, element selection, change observation, persistent revisions, and a way to disable a broken customization. CSS, JavaScript, Shadow DOM for owned widgets, MutationObserver and browser navigation events are candidate mechanisms. Shadow DOM limits style collisions; it does not produce a separate service session or make a source DOM stable.

**Fact.** Chrome extensions can inject styles and scripts into selected tabs and frames. This supports a desktop validation prototype; it does not establish Chrome extension APIs inside Android System WebView. [Scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting).

Advantages:

- Reuses existing editors, forms and service state.
- Needs no second frontend runtime in the simplest case.
- Can prove demand for hiding, restyling or modest rearrangement quickly.

Disadvantages:

- The site continues to own its DOM. Framework updates can conflict with creator changes.
- CSS selectors, text, routes and component structure can change.
- Combining several services into one coherent document needs additional integration.
- Hiding content does not establish that its scripts or network requests stop.

**Fact.** React warns that modifying or removing nodes it manages can produce inconsistent results or crashes. Prefer styles and independently owned containers to aggressive reparenting. [React guidance](https://react.dev/learn/manipulating-the-dom-with-refs).

Best fit: personal themes, distraction reduction, density and a few added shortcuts. Poor fit: replacing a complex application or composing several services.

### B. Arrange live website views or selected regions

Keep original website runtimes and arrange their views inside a custom host. For example, show a live original editor beside a custom list. Use clipping or scrolling only where the exact region remains usable.

Required parts: browser-view layout, viewport control, keyboard/focus arbitration, original-page expansion, navigation tracking and a tab resource manager.

Advantages:

- Preserves actual website behavior when the live view remains intact.
- Useful for media, rich editors and controls that would be expensive to rebuild.
- Can serve as a fallback inside another approach.

Disadvantages:

- A clipped region still belongs to a whole document and browser runtime.
- Responsive layouts, sticky elements, dialogs and keyboard resizing can change the crop.
- Multiple views introduce focus, gesture and resource competition.
- Moving or copying a DOM region is not equivalent to embedding its live application behavior.

**Fact.** DOM cloning does not copy event listeners registered with addEventListener or property handlers, and does not copy a canvas's painted image. Moving a node instead can still interfere with its framework and event delegation. [cloneNode documentation](https://developer.mozilla.org/en-US/docs/Web/API/Node/cloneNode), [standard cloning algorithm](https://dom.spec.whatwg.org/#concept-node-clone), [React guidance](https://react.dev/learn/manipulating-the-dom-with-refs).

**Fact.** iframe embedding can be refused by the source's frame-ancestors policy. A separate top-level WebView is not an iframe and avoids this particular embedding restriction, but still needs an explicit host integration. [CSP specification](https://www.w3.org/TR/CSP3/#directive-frame-ancestors).

Best fit: a small number of original website panels and complex-control fallback. Poor fit: unrestricted redesign. Screenshot crops may help previews but should not be the primary interactive renderer because text semantics, focus and accessibility must then be reconstructed.

### C. Extract data and render a native component catalog

Read supported fields into typed observations. A creator supplies a declarative definition selecting Kotlin/Compose components, bindings, local transformations and available operations.

Required parts: site adapters, a versioned data contract, validator, component renderer, configuration editor, action mapping, persistence and lifecycle recovery.

Advantages:

- Predictable supported layouts and component behavior.
- Layout-only edits can preserve the data and action integration.
- Can avoid a separate web runtime for the visible custom frontend.
- Matches the current Bonsai roadmap most closely.

Disadvantages:

- Freedom ends where the catalog ends. An unknown widget or behavior needs host development.
- Rich website controls have to be reproduced or opened in the original page.
- Source websites still run underneath, so native presentation does not prove lower total resource use.
- Catalog size, schema migrations and bindings become a maintained programming system.

Best fit: reliable personal dashboards and bounded app builders. Poor fit: a literal promise that any creator can implement any interface using familiar web code.

### D. Extract data and render a programmable web applet

Keep the source tabs separate. Load a creator-authored HTML/CSS/JavaScript frontend, optionally using React, Svelte or plain DOM APIs. A host-supplied SDK provides typed observations and supported actions. Its frontend may use a component library but does not have to be restricted to it.

Required parts: everything needed for source observation and action mapping, plus a frontend runtime, package/build format, SDK, preview tooling, dependency management, error reporting and versioned updates.

**Fact.** WebView can load local HTML and its resources through WebViewAssetLoader using HTTP-style origins. This supports packaged web interfaces. It does not connect them to source tabs automatically. [Android local-content guide](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content), [AssetLoader reference](https://developer.android.com/reference/androidx/webkit/WebViewAssetLoader).

Advantages:

- Largest layout and local-behavior freedom among these approaches.
- Familiar files and tools for coding agents and web developers.
- One source adapter can support many independently authored interfaces.
- Multiple source observations can feed one custom interface without merging the original DOM trees.

Disadvantages:

- Adds a visible frontend runtime alongside the source runtimes.
- Requires explicit synchronization, loading, stale-data and action states.
- Generated interfaces can reference unavailable fields or operations.
- A richer authoring platform increases dependency, debugging and migration work.

Best fit: the broad vibe-coder requirement. This is a recommendation to test, not a claim that the broader runtime is already approved or implemented in Bonsai.

### Comparative judgments

Scores are ordinal engineering judgments, not measured performance, probabilities or market statistics. For freedom and reuse, 5 means highest. For burden, 5 means highest burden. Do not sum the columns: the criteria are not interchangeable, and a one-point difference has no calibrated magnitude.

| Criterion | A: Page modification | B: Live website views | C: Native catalog | D: Programmable web applet |
| --- | ---: | ---: | ---: | ---: |
| Layout and local-behavior freedom | 3 | 2 | 3 | 5 |
| Reuse of original complex controls | 5 | 5 | 2 | 2 |
| Coherent multi-source interface | 1 | 2 | 5 | 5 |
| Initial runtime/tooling burden | 2 | 3 | 4 | 5 |
| Burden of defining data/action bindings | 2 | 2 | 5 | 5 |
| Separation of creator layout changes from site integration | 1 | 2 | 5 | 5 |

C's freedom score assumes a finite catalog. It can increase only by expanding the catalog or allowing more expressive code. B's reuse score assumes actual live views rather than cloned nodes. A's lower binding burden applies only when it retains original website behavior. None of these scores establishes which approach uses less memory or battery.

## 4. Components required for a programmable applet

| Component | Required behavior | Candidate technology |
| --- | --- | --- |
| Android host | App entry, routes, browser ownership, lifecycle and original-page handoff | Existing Kotlin/Compose host |
| Source runtime | Open, navigate, observe and operate each source page | System WebView first; GeckoView if a measured capability gap justifies it |
| Tab manager | Source IDs, profile bindings, active/retained/suspended states, work queue and eviction | Host-owned Kotlin state and persistent metadata |
| Observation adapters | Convert a qualified page into records with identity, timestamps and completeness | Packaged scripts, DOM queries, MutationObserver, bounded messages |
| Action layer | Map supported intent to current page controls and observe the outcome | Typed operations, semantic locators and deterministic procedures where possible |
| Applet SDK | Discover available data/operations, subscribe to updates, invoke operations and persist local app state | Versioned message protocol and generated TypeScript types |
| UI runtime | Render arbitrary authored frontend code within the supported platform | Local WebView frontend, HTML/CSS/JS; framework optional |
| Authoring tools | Inspect data, edit files, preview, view errors, compare revisions and undo | Coding-agent tools plus a small applet CLI or editor bridge |
| Package store | Save manifest, assets, schemas, compatibility requirements and prior revision | Versioned package directory and atomic activation |
| Qualification tools | Replay fixtures, compare output, inject interruptions and profile resources | Browser fixtures, existing browser automation tools, Android tracing and Macrobenchmark |

These are logical responsibilities, not ten servers or ten Gradle modules. A first implementation can keep most responsibilities inside one app and one laptop authoring tool.

### Separate three contracts

1. The observation contract defines available records and their meaning.
2. The action contract defines operations, inputs and observable results.
3. The applet contract defines the creator's frontend, sources and local state.

A proposed observation carries source ID, document generation, account-context revision, schema version, sequence number, observation time, completeness and stable record IDs. Completeness should distinguish loaded subset, completed traversal of a defined result set and unknown coverage.

An operation refers to a stable record ID and expected source context. It must re-resolve the current target. A DOM node handle, CSS path or screenshot coordinate from an earlier page cannot be the persistent identity of a record.

Send snapshots initially, then bounded updates where needed. If a receiver misses sequence numbers or changes documents, request a new snapshot. The custom view's sorting must not silently become the source page's sorting. Preserve draft input when data updates arrive.

Expose separate local and website operations. Grouping 100 already observed records is local work. Searching unloaded records, navigating or submitting a form requires source work. A useful SDK should make that difference explicit.

### What the coding agent needs

Give the author a capability inspector, typed SDK reference, real or synthetic observation examples, error output, preview screenshots and commands to stage, activate and revert an applet. An interface-only screenshot is insufficient context for binding fields and operations correctly.

For repeatable use, store source adapters separately from layout packages. If ten layouts use the same observed issue schema, repair the adapter once. Creator-specific direct selectors are possible in an experimental mode, but measure their repair burden separately.

Model inference is optional for ordinary rendering. A useful initial objective is zero model calls for local filtering, sorting, tab selection and painting. An agent may still help discover or repair a source procedure. A generated repair is a candidate until it passes the workflow checks.

## 5. Browser engine and execution location

Engine selection is separate from the choice of custom frontend.

| Option | Documented basis | Main cost or limitation | Recommendation |
| --- | --- | --- | --- |
| Android System WebView | App-owned web content, JavaScript execution and AndroidX compatibility APIs | Provider feature variation; host must implement its own tab and applet abstractions | First candidate because Bonsai already uses it |
| GeckoView | Built-in WebExtensions and native messaging | Different engine/dependency stack and integration qualification | Run a narrow comparison if WebView fails a required injection or control experiment |
| Desktop/cloud browser | Browser tooling can operate an external browser runtime | Different execution location and session; network dependence and remote rendering or transport | Useful authoring reference, not equivalent to phone-owned tabs |
| Chromium fork | Requires taking responsibility for a browser implementation and its release process | Highest implementation and update commitment among these choices | No current requirement demonstrates the need |

Mozilla documents extensions as the preferred way to interact with GeckoView web content and supports bundled extensions and messaging. That is evidence for an alternative control mechanism, not proof it will outperform WebView. [GeckoView documentation](https://firefox-source-docs.mozilla.org/mobile/android/geckoview/consumer/web-extensions.html).

The inspected Bonsai catalog still declares AndroidX WebKit 1.15.0. The current official release page lists 1.18.0, released 21 October 2026. Version 1.16 raised the library minimum SDK to 24. An upgrade needs explicit dependency and device qualification. Newer script-world features must not be assumed from the older dependency. [WebKit release notes](https://developer.android.com/jetpack/androidx/releases/webkit).

Runtime feature checks are separate from choosing a library version. ProfileStore explicitly requires MULTI_PROFILE support; another WebView instance does not by itself establish another account profile. [WebViewFeature](https://developer.android.com/reference/androidx/webkit/WebViewFeature), [ProfileStore](https://developer.android.com/reference/androidx/webkit/ProfileStore).

Qualification limitation: the current WebViewCompat full reference repeatedly failed to load during this research. Release notes document newer world-aware injection APIs, but the exact overloads and feature constants need a compile-and-device spike against the chosen artifact. This report does not claim that the old research's JS_INJECTION_IN_FRAME_AND_WORLD identifier is currently available.

## 6. Critical problems and how to detect them

Priority definitions: P0 means a failure invalidates the advertised capability or can produce an incorrect result. P1 means it can make a working capability impractical. These are priorities, not estimated probabilities.

| Priority | Problem | What can go wrong | Concrete experiment and measurement |
| --- | --- | --- | --- |
| P0 | Incomplete observations | A custom filter reports no matches even though matching records were never loaded | Fixture with 1,000 records and a window of 30 rendered rows. Compare observed IDs with the expected loaded subset; verify the UI never claims complete coverage without evidence |
| P0 | Source state diverges from custom UI | Reordered rows, updates or navigation cause an action to affect a different record | Mutate and reorder records before dispatch. Count wrong-target actions, stale-operation rejections and confirmed results |
| P0 | Layout cloning loses behavior | A copied editor looks right but cannot accept input, upload or submit | Exercise keyboard, composition input, selection, clipboard, submission and focus on original and customized versions |
| P0 | Page changes invalidate integration | Selectors still match but now identify the wrong field or control | Apply 20 predefined source variants. Count correct results, detected incompatibilities and silent incorrect results separately |
| P0 | Runtime recovery is missing | Definitions reopen, but source tabs or account context do not | Kill renderer and app process separately during reading, editing and an operation. Record data recovery, draft recovery and duplicate operations |
| P0 | Required data/control is unavailable | Canvas, inaccessible frame or unsupported component prevents the promised interaction | Include canvas, iframe and rich-editor fixtures before promising general support; report supported capabilities individually |
| P1 | Multiple source runtimes exceed device budget | Memory, CPU or network use grows until tabs are killed or interaction stalls | Measure 1, 2, 4 and 8 source tabs plus the visible frontend, including source renderers and shared processes |
| P1 | Observation overload | Every page mutation sends an entire document or large record set | Generate controlled mutation bursts. Measure bytes/second, queued updates, main-thread time, memory growth and dropped/resynchronized messages |
| P1 | Sequential browser actions feel slow | The UI responds immediately but waits several seconds for source navigation and extraction | Separate local acknowledgement, source execution and confirmation timestamps; compare warm and cold source states |
| P1 | Applet creation still requires a maintainer | A generated interface renders but someone must hand-code its bindings | Give independent creators fixed tasks. Count successful functional apps, human interventions and new host/adapter changes |
| P1 | Multiple sources produce misleading combined state | One panel is fresh while another is stale or unavailable | Delay and fail one source independently; verify per-source age and partial failure behavior |
| P1 | Sharing introduces incompatible environments | Another creator has a different schema, account, locale or browser capability | Import the same package on a fresh install and a second qualified device; record setup steps and unsupported requirements |

For the source-variant experiment include class-name changes, wrapper insertion, sibling reordering, missing fields, delayed content, client-side navigation, loading placeholders, changed labels, locale changes and record deletion. Fix the exact set before comparing approaches. Do not count silently incorrect output as a graceful failure.

**Fact.** Android documents renderer termination and requires replacing the affected WebView. **Fact.** Doze defers CPU and network work. Neither a saved layout nor a retained tab establishes uninterrupted execution. Test native applet visible, original page offscreen, another app active, locked device and process death separately. [Renderer handling](https://developer.android.com/develop/ui/views/layout/webapps/managing-webview), [Doze documentation](https://developer.android.com/training/monitoring-device-state/doze-standby).

**Fact.** Some browser operations require user activation. A tap in the custom frontend followed by asynchronous work in another document must not be assumed to grant the source page that activation. A browser automation protocol can have different input semantics from dispatchEvent, so qualify the actual executor. Preserve an original-page path for unsupported interactions. [HTML user activation model](https://html.spec.whatwg.org/multipage/interaction.html#tracking-user-activation).

## 7. Quantitative models

### Memory

Model total memory as host memory plus frontend memory plus shared engine memory plus the incremental memory of every active source. Measure proportional set size across relevant processes and avoid double-counting shared processes. For A, the extra frontend term may be absent; for D it is usually present. Shared resources mean growth is not guaranteed to be linear.

There is no universal supported-tab count. Derive the limit from the chosen device budget and observed incremental cost, then test eviction and reopening. Always report loaded tabs, retained tabs and concurrently executing tabs separately.

### Observation traffic

Traffic per second equals mean update payload bytes multiplied by update frequency, before serialization overhead.

**Example.** A 200 KiB snapshot sent ten times per second transfers about 1.95 MiB each second across the host boundary. That is about 117 MiB in a minute, even if no internet transfer occurs. This is an assumed workload, not a Bonsai measurement. Deltas and coalescing may reduce it; they require sequence and resynchronization logic.

### Interaction latency

Confirmed-action latency includes source readiness, operation dispatch, page response, extraction, transport and custom-view rendering. Local filtering does not need all these steps.

**Example.** Twenty serial operations that each take 250 ms contribute five seconds before adding model inference or further page loads. This arithmetic explains why reducing browser steps can matter more than changing the frontend framework.

### Workflow reliability

**Example.** If 20 steps each succeed independently with probability 0.98, the workflow succeeds with probability 0.98 to the power 20, approximately 66.8%. Independence is an illustration; actual errors can be correlated. Measure complete workflow success rather than inferring it from a successful click rate.

### Maintenance

Monthly maintenance hours approximately equal supported integrations multiplied by material changes per integration per month multiplied by mean repair hours, plus compatibility testing. Measure the quantities before making a staffing estimate.

Separate shared adapter repairs from applet-layout repairs. A successful architecture should let several layouts survive an adapter repair without individual edits. AI repair may reduce repair time; it does not remove the need to detect incorrect behavior and verify the repair.

## 8. Qualification plan and proposed targets

These are research targets, not achieved results, production release gates or universal performance limits.

### Stage 1. Compare rendering approaches on the same source

Use an owned fixture with an issue-like dataset, dynamic navigation, a virtualized list and one complex original control. Implement the smallest version of A, B, C and D. Keep source data, actions and task definitions fixed.

Per approach, evaluate three layouts, four workflows and two source states, retained and recreated. That produces 24 cases per approach and 96 cases across four approaches. Five repetitions produce 480 executions. The layouts should include a compact list, grouped view and a substantially different interaction such as a board. The workflows should include reading, local transformation, record opening and one reversible operation on the owned fixture.

Measure complete task correctness, interventions, implementation effort, applet-specific code and original-page fallbacks. A read-only layout cannot receive credit for an unsupported write task.

### Stage 2. Check whether the platform actually supports creators

Give ten independent creators three fixed customization tasks each, for 30 authoring attempts. Include one visual change, one structural change and one workflow change. Count all attempts, including refusals and unsupported requests. Pilot target: at least 24 functional results without a platform maintainer editing the host. Report how many required adapter changes, coding-agent retries or manual developer intervention. Ten creators are enough to expose usability problems, not to establish market demand statistically.

### Stage 3. Add a second source

Prove each integration independently, then combine them. Kill or delay either source. A combined interface should preserve the other source and identify stale information. Report timestamp skew between sources; do not imply a single atomic snapshot across websites.

### Stage 4. Physical-device qualification

Use at least two physical devices with recorded RAM, Android version and browser-provider version. Compare identical tasks, account state, network and cache preparation. Record startup-to-saved-UI separately from startup-to-fresh-data. Macrobenchmark supports startup and UI measurements; its results are not a substitute for source correctness. [Android benchmark documentation](https://developer.android.com/topic/performance/benchmarking/macrobenchmark-overview).

| Measurement | Proposed prototype target | Interpretation |
| --- | --- | --- |
| Local interaction response | p95 at or below 100 ms | Local filtering, selection and controls, excluding website/network work |
| Warm saved-app UI | p95 at or below 1 second | Saved interface visible; current remote data measured separately |
| Observer-to-view delay | p95 at or below 500 ms | Starts at a committed observation, so debounce and extraction cost must also be reported separately |
| Layout change without integration work | All three reference layouts use the same data/action adapter | Tests the intended separation |
| Ordinary local actions | Zero model calls | Rendering and local transforms should not require inference |
| Wrong-target operations in controlled trials | Zero | A single occurrence blocks confidence in action mapping |
| Source variations | At least 18 of 20 remain correct; every other variant is detected as unsupported | Silent incorrect output fails regardless of survival rate |
| Interruption recovery | All declared state transitions produce correct stale/reload/recovery behavior | Draft recovery is tracked separately from definition recovery |
| Resource cost | Report incremental total memory, CPU and traffic at 1/2/4/8 tabs | Choose a tab limit from evidence rather than assuming all four configurations pass |

Use at least 100 observations per latency condition for exploratory p95 reporting, publish the sample size and raw distribution, and treat tail estimates as unstable until repeated across sessions. At 60 Hz, one display interval is about 16.7 ms; this is arithmetic, not a guarantee that either frontend meets that budget. Measure frame timing separately from overall response latency.

Zero failures in a small sample does not prove a zero failure rate. Under an independent identical-trial model, zero failures in 100 trials gives a one-sided 95% upper failure bound of about 2.95%. A pilot is a way to reject broken designs quickly, not proof of production reliability.

## 9. Decision sequence

1. Qualify source loading, observation, navigation and original-page recovery in the existing Android runtime. Stop if the required source interaction is unavailable.
2. Compare a native catalog with a programmable web frontend using the same observations and operations. Include at least one requested interface that is outside the native catalog.
3. Keep page modification as a small separate experiment. Prefer it when it meets the task with substantially less work and preserves behavior.
4. Choose the main renderer from creator success and total runtime cost. Do not select it from screenshot quality alone.
5. Separate layout packages from shared adapters. Add authoring tools that reveal actual available data and operations.
6. Add the second source only after a complete single-source loop works. Measure resource use and partial failure before increasing retained-tab count.

The first decisive artifact is three different useful applets over one source adapter, created without host changes. The second is a two-source applet that remains understandable when either source fails. Those results would substantiate the platform idea more directly than a universal customization claim.

## 10. Source register and limitations

All external sources below were checked on 24 October 2026. Official documentation, maintainer documentation and standards are used for technical claims. Living documents and latest-version pages are unpinned. They establish documented behavior, not tested behavior in Bonsai.

| Source | Version or status | Supports |
| --- | --- | --- |
| [WebView JavaScript API](https://developer.android.com/reference/android/webkit/WebView#evaluateJavascript(java.lang.String,%20android.webkit.ValueCallback%3Cjava.lang.String%3E)) | Current Android reference; method added API 19 | Basic page execution and thread requirements |
| [WebKit release notes](https://developer.android.com/jetpack/androidx/releases/webkit) | Lists 1.18.0 dated 21 October 2026 | Dependency drift, API evolution, API 24 minimum since 1.16 |
| [WebViewFeature](https://developer.android.com/reference/androidx/webkit/WebViewFeature) | Current reference | Runtime feature detection |
| [ProfileStore](https://developer.android.com/reference/androidx/webkit/ProfileStore) | Current reference; added 1.9.0 | Feature-gated profile management |
| [Local web content](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content) | Current Android guide | Local frontend loading |
| [WebViewAssetLoader](https://developer.android.com/reference/androidx/webkit/WebViewAssetLoader) | Current reference; added 1.1.0 | HTTP-style URLs for local resources |
| [WebView management](https://developer.android.com/develop/ui/views/layout/webapps/managing-webview) | Current Android guide | Renderer termination and replacement |
| [Doze](https://developer.android.com/training/monitoring-device-state/doze-standby) | Current Android guide | Background CPU/network restrictions |
| [Macrobenchmark](https://developer.android.com/topic/performance/benchmarking/macrobenchmark-overview) | Current Android guide | Startup and UI measurement tooling |
| [GeckoView web content](https://firefox-source-docs.mozilla.org/mobile/android/geckoview/consumer/web-extensions.html) | Moving Firefox documentation | Bundled extensions and messaging alternative |
| [Chrome scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting) | Manifest V3 reference | Desktop injection targets and CSS/JS mechanisms |
| [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) | Current Chrome guide | Separate JavaScript worlds and content-script behavior |
| [React DOM manipulation](https://react.dev/learn/manipulating-the-dom-with-refs) | Current React docs | Conflict with framework-owned DOM changes |
| [TanStack Virtual](https://tanstack.com/virtual/latest/docs/introduction) | v3 latest, moving page | Partial rendered lists |
| [DOM standard](https://dom.spec.whatwg.org/) | Living Standard, page dated 19 October 2026 | Nodes, events, cloning and observation |
| [cloneNode](https://developer.mozilla.org/en-US/docs/Web/API/Node/cloneNode) | Mozilla web-platform reference | Listener and canvas-copy limitations; checked against standard cloning model |
| [Cross-origin access](https://html.spec.whatwg.org/multipage/nav-history-apis.html) | Living Standard, page dated 22 October 2026 | Cross-origin document-access checks and permitted properties |
| [CSP frame ancestors](https://www.w3.org/TR/CSP3/#directive-frame-ancestors) | Working Draft dated 16 September 2026 | Website-controlled iframe embedding restrictions |
| [HTML user activation](https://html.spec.whatwg.org/multipage/interaction.html#tracking-user-activation) | Living Standard, page dated 22 October 2026 | User-activation-dependent operations |
| [HTML canvas](https://html.spec.whatwg.org/multipage/canvas.html#the-canvas-element) | Living Standard, page dated 22 October 2026 | Bitmap rendering rather than per-object DOM semantics |
| [Requested unslop skill](https://raw.githubusercontent.com/cursor/plugins/refs/heads/main/pstack/skills/unslop/SKILL.md) | Moving main branch | Writing instructions only |

Local context: Nirvana README, Bonsai ARCHITECTURE.md, ROADMAP.md, October 14 applet research, current plan index and relevant plans from the preceding investigation. The Android version catalog was re-read for this analysis and still declares WebKit 1.15.0. No source was modified in Bonsai.

Unavailable or unresolved evidence: repeated WebViewCompat reference fetch failures; no live source-site login qualification; no tested creator workflow; no cross-site compatibility matrix; no physical-device memory/latency data; no measured AI generation or repair success. Score changes and architectural commitments should follow those experiments.
