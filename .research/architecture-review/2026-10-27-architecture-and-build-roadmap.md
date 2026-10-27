# Genesis architecture review and build roadmap

Superseded defaults: the later [live website customization document set](../live-dom-customization/README.md) adopts incremental same-document customization and records the user's approval of JS/TS creator code with a Rust runtime. Use its LIVE roadmap for implementation. This review preserves the earlier separate-source/result design and the underlying lifecycle/recovery findings.

Reviewed 27 October 2026, Asia/Kolkata. Status: architectural recommendation and implementation plan. No Genesis runtime, Android build, device experiment or performance benchmark was executed for this review.

This was the recommended starting point before the incremental-customization clarification. It reviews the [runtime walkthrough](../rust-monorepo/2026-10-26-runtime-walkthrough.md) and the other Genesis research, using `~/bonsai-mobile` as reference. Genesis requirements take precedence over conflicting Bonsai decisions. The findings below reflect that earlier scope.

## 1. Verdict

The walkthrough gets the central separation right. Keep the website running in an owned source browser context, render the creator's interface in a separately owned document, and send explicit commands back to the source. This is the strongest current candidate for programmable applets that can eventually combine several websites.

The exact pipeline in the walkthrough is not yet the best implementation plan. It makes a native DOM mirror and native site extraction mandatory before demonstrating that they are necessary. It also describes synchronization more completely than it describes startup, recovery and the creator workflow. Those omissions matter when turning an explanation into code.

Build the first version around bounded source projections:

```text
Website and live Source DOM
        ↓
Rust/Wasm source agent
  ├─ site projection → typed records
  └─ requested subtree → bounded structural snapshot
        ↓
Android bridge and native Rust controller
  validate context, retain latest state, route messages
        ↓
Framework-independent Rust applet SDK
        ↓
Creator UI, initially Leptos/Rust/Wasm
        ↓
Result DOM
```

Keep a native structural mirror available as a later implementation option for subscriptions that need it. Do not require every title, link and state update to travel through that representation.

This is an engineering recommendation, not a measured speed comparison. The first experiments must establish whether the browser can support the source agent and remain useful while the result view is visible. A universal promise to customize every live website control remains unproven.

## 2. Requirements and source precedence

The current product is an installable Android browser-like application. It lets creators own applet presentation and local behavior while existing websites continue to execute their service interactions. The monorepo belongs in this directory. Genesis-owned DOM/control behavior is written in Rust.

The earlier React requirement and the later Rust requirement have not been explicitly reconciled by the user. For implementation, follow the stricter latest requirement: use a Rust UI for the reference applet. Keep the protocol independent of that renderer so a future, explicit React exception does not require rewriting source management. Do not quietly treat React as the selected implementation.

| Topic | Bonsai reference | Genesis direction for this plan |
| --- | --- | --- |
| Application language | Kotlin and Compose | Native Rust host behavior, Rust/Wasm DOM and UI behavior |
| Creator freedom | Fixed native component catalog | Programmable applets with optional helpers |
| First source | GitHub issues | Owned fixture first, then the named YouTube flow |
| Service access | Loaded page state and page controls | Retain this boundary; do not introduce hidden endpoint clients |
| Applet authoring | Data definitions and laptop model wrapper | Local editable source and compiled applet packages; model integration can follow |
| Execution | Foreground first | Retain; distinguish a covered source from an Android app in the background |
| Browser ownership | App-owned WebView | Retain as the first engine candidate |
| Runtime scale | One active source initially | One source plus one result view first; two-source composition is a later required milestone |
| Recovery | Current context, explicit uncertainty and original-page handoff | Retain and make independent of creator rendering |

The Rust rule still needs platform bindings. JNI calls require JVM entry/callback classes, and browser Wasm uses generated JavaScript bindings and startup code. Keep product decisions, extraction, routing and rendering in Rust. Keep the Java forwarding layer and generated JS visible in the build inventory. An absolute prohibition on all Java/JavaScript artifacts would invalidate this stock-WebView design.

Security hardening, store publication and hosted AI are outside this prototype roadmap. Origin, session, lifecycle and execution boundaries remain in scope because they determine whether the system targets the right document and behaves correctly.

## 3. Review coverage and current implementation evidence

All eight substantive Genesis research documents were reviewed, along with the root README, product note and research index. Their main contributions and dispositions are:

| Genesis document | Retain | Revise or qualify |
| --- | --- | --- |
| [24 October comparison](../customizable-browser-applets/2026-10-24-technical-analysis.md) | Broad authoring freedom, incomplete observations, alternative presentation modes, resource measurement | Kotlin/JavaScript choices predate the Rust requirement; ordinal scores are judgments, not selection evidence |
| [Source DOM research](../source-dom-react/2026-10-26-research.md) | Live runtime distinction, same-document alternative, original-player qualification | React and JS capture libraries are references under the current Rust constraint |
| [Source DOM architecture](../source-dom-react/2026-10-26-architecture.md) | Explicit identities, account revision, action outcomes, separate resource handling | A full mirror is one implementation strategy; React/Kotlin placement is historical |
| [Earlier roadmap](../source-dom-react/2026-10-26-roadmap.md) | Capability gates, creator tests, second-source qualification | Use the Rust build sequence below; do not implement all historical alternatives before a useful loop |
| [Creator framework options](../applet-framework/2026-10-26-architecture-options.md) | Separate authoring/rendering/execution choices, independent recovery, honest failure guarantees | Rust replaces the proposed TypeScript baseline; no evidence establishes a need for a new app language or remote renderer yet |
| [Rust monorepo design](../rust-monorepo/2026-10-26-codebase-design.md) | Three execution contexts, pure shared types, platform boundary | Start with fewer build targets; make mirror placement and adapter execution explicit choices |
| [Dependency inventory](../rust-monorepo/2026-10-26-dependencies.md) | Rust/Wasm and Android tool families, explicit optional alternatives | Listed versions are observations, not a resolved compatible build; add dependencies by milestone |
| [Runtime walkthrough](../rust-monorepo/2026-10-26-runtime-walkthrough.md) | Concrete source-to-result example, target revalidation, uncertain outcomes | Expand context ownership and recovery; use the revised default observation path |

Bonsai inspection covered its active applet architecture, relevant roadmap sections and plans 06/07, current context, October 14 applet findings/design, and browser-engine, same-UID CDP, GeckoView and lifecycle research. Runtime source and build declarations were inspected directly. Retired cloud/provider tickets and marketing animation work are not prerequisites for Genesis and were not exhaustively reviewed.

The inspected Bonsai checkout was based on commit `8e46f7f5fa7ef94a242c35af8bb69a3403af419c`. Genesis was based on `5ba1ba086d7789618dbc9ba3f028ff80ddaa14d8`, with the research documents in the working tree. These hashes identify repository baselines, not a claim that every reviewed file was committed there.

### What Bonsai actually contributes

| Source inspected | Observed implementation | Reuse in Genesis |
| --- | --- | --- |
| [WebViewController.kt](/Users/rit/bonsai-mobile/bonsai-android/app/src/main/kotlin/com/example/bonsai/browser/WebViewController.kt) | One attached WebView, navigation, callback handling, disposal and renderer-loss cleanup | Use its behavior checklist to implement the Rust adapter; it is not an existing source-agent runtime |
| [WebViewHost.kt](/Users/rit/bonsai-mobile/bonsai-android/app/src/main/kotlin/com/example/bonsai/ui/browser/WebViewHost.kt) | View lifecycle, `VISIBLE`/`INVISIBLE` switching and hidden-view accessibility exclusion | Test equivalent ownership and visibility behavior; invisibility is not evidence of working background extraction |
| [BrowserViewModel.kt](/Users/rit/bonsai-mobile/bonsai-android/app/src/main/kotlin/com/example/bonsai/browser/BrowserViewModel.kt) and [BrowserState.kt](/Users/rit/bonsai-mobile/bonsai-android/app/src/main/kotlin/com/example/bonsai/browser/BrowserState.kt) | Tab/view-generation checks and navigation commands; chat returns unavailable | Retain explicit state transitions; view recreation generation does not identify every document or account change |
| [Version catalog](/Users/rit/bonsai-mobile/bonsai-android/gradle/libs.versions.toml) and [app build file](/Users/rit/bonsai-mobile/bonsai-android/app/build.gradle.kts) | WebKit 1.15.0, minSdk 23, compile/target 37, Java 17 declarations | Reference only; no resolved or device-qualified Genesis toolchain exists |
| [Bonsai architecture](/Users/rit/bonsai-mobile/ARCHITECTURE.md) and [roadmap](/Users/rit/bonsai-mobile/ROADMAP.md) | Planned adapters, catalog, preview and recovery | Reuse concepts and failure cases; do not count planned features as existing reusable code |

The inspected controller refuses popups, file selection, downloads and several permission requests. Copying those choices unchanged could break a required login or interaction. Qualify the named workflow before claiming source-site support. Start Genesis as its own Android project in this monorepo; do not port the entire Kotlin application or alter the Bonsai checkout for this work.

## 4. Findings that affect implementation

Priorities describe when to resolve a design issue. P0 means before committing to the runtime architecture. P1 means before calling the single-source applet usable. P2 means before broader creator or multi-source claims. They are not measured failure probabilities.

### F01. The core separation is correct, but the product boundary needs precision

Priority: P0. Evidence: walkthrough introduction and original-player fallback; source-DOM research sections 2 and 5.

The design can supply arbitrary custom presentation over supported observations and operations. It does not supply arbitrary transplantation of live website controls into the Result DOM. Media, editors, embedded frames and browser-mediated prompts are separate integration problems.

Use two explicit acceptance levels: custom browsing with original-source handoff, and custom layout containing a functioning live source control. Passing the first does not pass the second. If an inline YouTube player is required for the first release, its experiment must precede SDK expansion.

### F02. Source-agent loading remains the first technical blocker

Priority: P0. Evidence: walkthrough section 2 and monorepo section 8.

Rust/Wasm DOM access is documented. Loading Genesis's generated bindings and Wasm into the chosen source execution world, under the actual website's restrictions, is not demonstrated. Delivering Wasm bytes and compiling them are separate operations. CSP contains a Wasm compilation check; whether and how a particular injected world applies policy needs qualification. Do not infer either universal failure or universal exemption from the page's CSP alone. [CSP Wasm integration](https://w3c.github.io/webappsec-csp/#wasm-integration).

The first capability test must prove the complete bootstrap, DOM read, observation and host round trip on a real Android provider. Test generated loading modes and resource/byte delivery deliberately. Do not silently replace the Rust observer with handwritten JS if the experiment fails.

### F03. A mandatory native DOM mirror is an unnecessary initial commitment

Priority: P1. Evidence: walkthrough sections 2 and 5 versus Bonsai's bounded-record extraction and the earlier Genesis projection discussion.

Serializing a structural subtree, constructing a native tree, extracting records and serializing those records again adds an implementation and data-copy path. That may be worthwhile for several raw-tree consumers, offline replay or native querying. It is not required to show a list of observed video titles.

Default to extracting bounded records in the Rust/Wasm source agent. Keep the host authoritative for source context, command dispatch and latest accepted observation metadata. Offer bounded structural snapshots for advanced projections and debugging. Introduce a continuously patched native tree only after a consumer or measurement justifies it.

This moves the built-in adapter's execution into the source agent. Keep its field interpretation and record types in Rust modules that can be exercised against fixtures. It is a change from the walkthrough's native adapter placement, not merely a renamed box.

### F04. Context ownership is incomplete in the illustrative messages

Priority: P1. Evidence: walkthrough identity table and command example; earlier source-DOM architecture and Bonsai contracts include account context.

The walkthrough omits known session/account invalidation and does not specify how host identity binds to a newly initialized agent. Document generation alone does not cover logout, source reassignment, manual takeover or a stale applet revision sending a late command.

Define a host-owned source instance, session epoch, document binding and command-ownership revision. Add subscription identity and schema/adapter revision to observation messages. Unknown account identity remains unknown; an epoch records known invalidations, not proof that every server-side change has been detected.

Start with the top-level source document only. A `frame_id` field does not establish arbitrary cross-frame support. Android's navigation listener supplies page/navigation identities for main-frame navigation; qualify those APIs and the agent handshake together. [NavigationListener](https://developer.android.com/reference/androidx/webkit/NavigationListener).

### F05. Full snapshots and patches need different delivery rules

Priority: P1. Evidence: walkthrough's missing-sequence handling and monorepo queue requirements.

A delta depends on a specific prior revision and must not skip required changes. A complete replacement snapshot for the same declared subscription can supersede older pending snapshots. Applying the patch rule to every full snapshot causes avoidable resynchronization under load.

Start with complete bounded record snapshots and a latest-pending-snapshot queue per subscription. Keep command results and lifecycle events on a separate reliable path. Add deltas only when measurement justifies the extra state machine. Intermediate visual states can be coalesced; that does not authorize discarding action outcome evidence.

### F06. `activate` is too broad to be the first product operation

Priority: P1. Evidence: walkthrough section 8.

Define semantic operations with preconditions and observable postconditions. Begin with `open_record`, `refresh_source` and `show_original`. Opening a qualified observed link may use native navigation in the same source view. It does not have to synthesize a click when link navigation is the intended behavior.

Use source-element activation for behavior that genuinely requires the website control, after qualifying that behavior. A result-side tap cannot be assumed to transfer source-document user activation. [HTML user activation](https://html.spec.whatwg.org/multipage/interaction.html#tracking-user-activation).

Track a command through expected navigation even though the old document's node handles become invalid. Preserve request deduplication and distinguish cancellation before dispatch from uncertainty after dispatch. No generic exactly-once guarantee exists for an external website action.

### F07. Hidden-source behavior and media are product gates

Priority: P0. Evidence: walkthrough resource boundary, original research's G0 and Bonsai visibility implementation.

A successful visible-page observation does not establish that the website behaves correctly while covered, invisible, detached or backgrounded. Lazy loading, viewport-dependent logic, focus and media can differ. The earliest prototype must include switching between source and result, plus the selected player workflow.

Do not use `pauseTimers()` as a per-source scheduler. Android documents it as global to all WebViews; `onPause()` does not pause JavaScript. [WebView lifecycle methods](https://developer.android.com/reference/android/webkit/WebView).

### F08. Separate documents do not guarantee hang containment

Priority: P1. Evidence: walkthrough failure table and creator-framework recovery discussion.

The latest Rust walkthrough warns about shared renderer processes, but does not put an independent recovery control into the concrete flow. Add a host-owned control for show-original, disable-applet and reload/recreate. Its handler must not wait for a blocked result event loop.

When the source and result share a failed renderer, showing the original may not work until both views are recreated. Android explicitly documents that terminating a renderer can affect multiple WebViews and that every affected view must handle renderer loss. [Renderer termination API](https://developer.android.com/reference/androidx/webkit/WebViewRenderProcess).

Rust/Wasm does not prevent an infinite loop from blocking its browser thread. Claim recoverability only for failure cases that actually pass on the selected provider.

### F09. Creator SDK and UI framework should remain separate

Priority: P1. Evidence: framework-options separation of authoring/rendering/execution; walkthrough's direct Leptos choice.

Leptos is a reasonable first Rust frontend. Keep transport, subscription lifetimes, data freshness and command handles in a renderer-independent Rust API. Add Leptos helpers on top. The wire contract must contain records and operations, not Leptos signals or component types.

Arbitrary layouts need more than a fixed video schema. Demonstrate both shared typed records and a creator-defined transformation over a bounded raw subtree. Otherwise the implementation may deliver Bonsai's fixed catalog constraints under a different UI framework.

### F10. Rollback must include applet state compatibility

Priority: P1. Evidence: walkthrough promises restoring a prior package but defines no activation transaction.

A working old Wasm bundle may fail if a new revision irreversibly changed its local state. Store immutable package revisions separately from versioned applet state. Preview against a copy or frozen observation feed, with source actions disabled by default. Activate an exact tested package and compatible state revision through a recoverable native commit record.

Restoring frontend code does not undo website actions. After renderer loss, restore definitions and safe navigation metadata, then observe again. Do not revive old node handles or resend an uncertain command.

### F11. Ten components describe eventual ownership, not the first coding task

Priority: P1. Evidence: monorepo's ten-unit layout and its own warning against empty scaffolding.

The first loop needs four Rust build targets and an Android packaging project. Keep browser integration, the fixture adapter and SDK bridge as internal modules initially. Extract reusable crates after a second consumer or stable contract exists. Build tooling should automate a demonstrated build, rather than define an elaborate package format before Wasm injection works.

### F12. The research contains no device evidence or tested dependency set

Priority: P0 for compatibility claims; P2 for performance claims. Evidence: all Genesis research status sections and inspected Bonsai source.

Earlier numerical scores and latency targets are proposals. Different documents measure different intervals, including host receipt, capture time and rendered updates. Do not compare their numbers as if they were benchmark results. The measurement definitions below replace those ambiguous comparisons for the first implementation.

## 5. Alternatives and selection rules

No option is universally best. Select against creator freedom, source compatibility, measured cost and the exact live-control requirement.

| Architecture | Strongest use | Main limitation | Decision |
| --- | --- | --- | --- |
| Separate result document, records first | Programmable layouts and eventual multi-source composition | Two browser documents, explicit resources/actions and source residency | Recommended baseline |
| Separate result document, native structural mirror | Generic structural queries, replay and several shared mirror consumers | Additional serialization, tree maintenance and protocol work | Add when a demonstrated consumer or benchmark justifies it |
| Owned UI root inside the source document | Same-document access and experiments retaining live controls | Website navigation, DOM ownership, geometry, styles and shared execution interfere | Narrow comparison if live inline controls or measured overhead require it |
| Source restyling and selective live-node movement | Hiding, density changes and modest layout edits | Changes source structure and depends on the website's rendering behavior | Optional specialized mode, not the default creator contract |
| Finite native component catalog | Predictable predefined dashboards | New widgets require framework work | Useful templates; insufficient as the only Genesis authoring model |
| Worker/isolated computation with remote rendering | Creator computation that must be independently interruptible | Limited browser APIs, another protocol and receiver workload | Reconsider if full applets fail required hang-containment tests |
| GeckoView with a bundled extension | A documented WebView capability gap | New engine qualification and packaged extension/Wasm integration | Second engine candidate |
| Same-UID WebView CDP | An otherwise unavailable inspection or input capability | Debug endpoint, target mapping and provider-dependent transport | Diagnostic or separately qualified fallback experiment |
| Chromium fork or Servo embedding | A required capability unavailable through supported embedding APIs | Engine compatibility, build and continuing maintenance work | Separate research project after a specific failing test |

AndroidX exposes world-aware injection and messaging, but their existence does not prove the complete Rust bootstrap. Wry supports Android embedding, while its documented child-view API lists desktop platforms. That is a reason to qualify Wry, not proof that all Android multi-view arrangements are impossible. Prefer a narrow JNI adapter for the first two-view experiment. [WebViewCompat](https://developer.android.com/reference/androidx/webkit/WebViewCompat), [Wry documentation](https://docs.rs/wry/latest/wry/).

GeckoView's built-in extensions provide a documented page-access and messaging route. A Rust/Wasm content-script implementation would still need its own loader and compatibility test. It is not an automatic escape from Wasm integration work. [GeckoView integration](https://firefox-source-docs.mozilla.org/mobile/android/geckoview/consumer/web-extensions.html).

## 6. Architectural guidelines

### Ownership and execution

The website owns its DOM, live JavaScript and service responses. The source agent owns document-local handles and extraction. The native controller owns browser instances, accepted context, source work and package activation. The creator owns Result DOM layout and applet-local presentation state.

The native host stores the latest accepted projection per active subscription. That cache is an observation, not the service's authoritative database. Pure Rust validation and state transitions must not depend on JNI or `web-sys`. DOM handles stay inside their browser document; JNI handles stay in the platform adapter.

UI calls execute on Android's UI thread. Native parsing and coordination can run on a controller thread. Callbacks enqueue bounded work and return promptly; synchronous callbacks use short decisions without waiting on a cycle involving the UI thread. Source extraction and result rendering run in browser event loops and must yield between bounded work batches.

Use nonblocking queue submission from UI callbacks. A full data queue can replace an older pending complete snapshot; a full control queue must produce explicit refusal or invalidate the affected source for recovery. Never block the UI thread waiting for capacity or silently discard a lifecycle transition. Release detached node handles and subscriptions so long-lived source pages do not retain every node ever observed.

Keep one source writer initially. Manual source takeover invalidates queued applet operations. When multiple source tabs share a service session, operations affecting that session may also need account-level serialization.

### Observation contract

The first protocol is version `0`, internal and allowed to change during the platform experiment. Freeze a creator-facing version only after the first end-to-end workflow works.

| Field group | Required meaning |
| --- | --- |
| Source context | Host source instance, session epoch and current document binding |
| Subscription | Query/projection ID and subscription revision; different filters or scopes are different subscriptions |
| Representation | Complete records, bounded structural snapshot, or explicitly negotiated delta |
| Revision | Monotonic replacement revision; deltas additionally name their exact base revision |
| Schema | Adapter identity/version and payload schema version |
| Coverage | Observed scope, loaded subset, truncation and unknown/missing fields |
| Status | Loading, ready, stale, login-required, unsupported, resynchronizing or failed |
| Timing | Host receipt time for age; separately labeled capture timing if available |

Rust types are canonical. Schema validation checks shape; semantic validation checks context, sizes, versions and supported operations. A generated JSON Schema does not replace those semantic checks.

Record snapshots may replace older pending snapshots for the same subscription and context. A record disappearing from a virtualized viewport is an observation-scope change, not evidence that the remote record was deleted. Any accumulated cache must label records no longer observed as historical/stale and bound their retention.

The advanced raw API selects a bounded subtree and declared fields. It does not initially expose every frame, all computed styles, arbitrary private application state or unrestricted source scripting. Creators can write Rust transformations over the returned records. New source capabilities remain explicit framework work.

### Commands and verification

Commands carry an ID, applet/runtime revision, expected source/session/document context, semantic operation, expected record key and deadline. The host checks context before dispatch; the agent rechecks live preconditions immediately before a DOM operation.

Use lifecycle states such as queued, dispatched, confirmed, rejected, cancelled-before-dispatch, needs-user and uncertain. A request arriving twice must not produce two host dispatches within the declared deduplication window. That does not guarantee exactly-once execution after process loss.

Each operation declares its postcondition. Opening a record can be confirmed by a matching committed route or qualified content identity. Playback, saving a form and a server-side write require different evidence. Expected navigation must not cause the controller to throw away the command record before it can correlate the new document's outcome.

### Browser presentation, recovery and resources

Keep source and result view ownership stable across presentation switches. Qualify the source's attached/covered/invisible behavior rather than assuming a layout flag preserves execution. Remove hidden source content from the active accessibility traversal while restoring it on source handoff. Test focus, keyboard, Android Back and fullscreen transitions explicitly.

Start with original-source presentation for media. A rectangular browser region is a possible later presentation mode, but does not provide arbitrary CSS reflow of live source controls. Text extraction, images and media are separate capabilities.

Place recovery outside creator-owned DOM. A host control should first restore source presentation when its renderer is healthy, and otherwise recreate affected views with fresh identity. A suspended or restarted applet displays stale/loading state until new observations arrive. Backgrounding suspends Genesis command dispatch; it does not imply all website networking has stopped.

### Creator packages

Build on a laptop, import immutable compiled assets with editable source, and run accepted applets locally without the laptop. Source data can still require the website and network. Keep package revision, local state schema, source binding and browser session as separate lifetimes.

Preview uses frozen/sample records by default. An explicit live preview may subscribe read-only to current observations. It must not dispatch website actions merely because a generated component mounts. Native activation selects the tested bundle and compatible state atomically enough to recover after an interrupted write.

Use one stable applet asset-loading strategy and explicit per-applet storage namespaces. Different paths under one origin do not create independent storage origins. Broader account/profile separation is deferred; document the actual shared browser context.

## 7. Where to start writing code

Create this structure for the first experiment. These paths are proposed, not created by this review:

```text
Cargo.toml
Cargo.lock
rust-toolchain.toml
apps/android/
  Cargo.toml                  # native Rust cdylib
  src/lib.rs                  # JNI entry and composition
  src/browser.rs              # view lifetime and platform requests
  src/bridge.rs               # context-bound message routing
  src/session.rs              # initial source state machine
crates/protocol/
  Cargo.toml
  src/lib.rs                  # version-0 envelopes and statuses
crates/source-agent/
  Cargo.toml                  # browser Wasm cdylib
  src/lib.rs                  # startup and ready handshake
  src/observe.rs              # bounded read and change triggers
  src/actions.rs              # qualified source operations
  src/adapters/               # fixture first, then YouTube
applets/reference/
  Cargo.toml                  # browser Wasm cdylib
  src/lib.rs                  # result UI
  src/bridge.rs               # initial SDK client module
platform/android/
  settings.gradle.kts
  gradle/libs.versions.toml
  app/                        # manifest, Java forwarding classes, assets
fixtures/source-pages/        # owned HTML and Rust/Wasm behavior
engineering/evidence/         # capability results and reproducible run records
```

These are four Cargo packages plus the Gradle application. Keep build-target dependencies explicit. Check native shared types on the development host, Wasm packages for `wasm32-unknown-unknown`, and the Android library for the device ABI. A blanket host `cargo check --workspace` is not the intended cross-platform verification strategy.

The first visible result should be small: an owned source page displays a title, the Rust source agent observes a change, and the custom result page updates. A result-side action then changes a controlled fixture state and receives an observed confirmation. The host's recovery control remains available throughout.

After that loop works, extract `runtime-core` for pure session/command/observation state and `applet-sdk` when a second applet consumes it. Split `browser-android` into its own crate when its boundary has stabilized. Add the launcher and CLI after they automate a working package/runtime workflow. The earlier ten-component layout remains a possible destination, not a prerequisite.

### Dependencies by milestone

| Introduce when | Dependencies |
| --- | --- |
| First platform loop | `jni`, `serde`, `serde_json`, `wasm-bindgen`, selected `web-sys`/`js-sys` APIs, `wasm-bindgen-futures` if startup needs it, AndroidX WebKit |
| First Rust result UI | Leptos client-side rendering; no server-side rendering stack |
| State and protocol implementation | `thiserror`, focused `tracing` diagnostics; schema generation when a contract is ready |
| Correctness qualification | Standard Rust tests, `proptest` for state-machine properties, `wasm-bindgen-test` for DOM behavior |
| Applet packaging and creator commands | `toml`, `sha2`, `clap`, `schemars` as required by implemented commands |
| Build environment | Rust/Cargo, compatible wasm-bindgen CLI, cargo-ndk, Android SDK/NDK, Gradle/AGP, JDK and ADB |

The existing [inventory](../rust-monorepo/2026-10-26-dependencies.md) supplies candidate packages and license observations. Resolve and lock actual versions during implementation. AndroidX's reviewed release page lists 1.18.0 and documents an API 24 minimum since 1.16; installation compatibility still does not prove provider feature support. Choose a current supported device/provider for the experiment before making an older-device promise. [WebKit releases](https://developer.android.com/jetpack/androidx/releases/webkit).

## 8. Build roadmap and exit evidence

All work below is pending. Numerical thresholds are proposed prototype gates, not observed success rates. Record deviations and reasons instead of silently lowering a failed gate.

### GEN-01. Establish the Rust Android and browser build

Dependencies: none. Create the four build targets and Gradle host above. Pin the actual toolchain, build bindings, package the Rust library and local Wasm assets, and create source/result views. Add the host-owned recovery control immediately.

Deliverable: an installable debug APK, a local Rust result UI and a source view that navigates and can be revealed. Record Android version, provider package/version, ABI, feature support, compile/min/target SDK, NDK and build commands.

Exit: native Rust receives Android callbacks, both views work, Back/presentation switching works and missing capabilities produce an explicit state. A Rust console executable or desktop Wasm demo does not pass this gate.

### GEN-02. Prove source-agent loading and communication

Dependencies: GEN-01. Register the source bootstrap before navigation, establish document-bound messaging, instantiate Wasm and read the top-level DOM. Use an owned fixture with real HTTP response CSP variations, then one named real YouTube route. Static markup alone does not test response-header policy.

Deliverable: a reproducible loader and capability report covering byte delivery, binding mode, execution world, startup readiness, navigation and disposal. The API's injection time and the later Wasm-ready time must be recorded separately.

Exit: every configuration claimed as supported passes 20 consecutive navigations/reloads with the expected ready handshake and observation. Unsupported configurations must report their missing capability and do not count as successful integrations. Repeat on at least one physical device before treating real-site support as established. Confirm operation with WebView debugging disabled as well as in debug development. A fixture pass and a real-site failure do not close the real-site gate.

Failure decision: fix the documented loading mechanism, narrow the provider range or run a scoped GeckoView comparison. Do not build the general mirror/SDK while this required capability remains unresolved.

### GEN-03. Qualify source residency and original-player presentation

Dependencies: GEN-02. Keep the source attached while the result is visible. Measure observation progression and source behavior across source-visible, result-visible, app-background/resume and rotation cases. Test the first YouTube watch workflow and returning to the custom list.

Start with public content. If the applet claims signed-in content or behavior, qualify login, logout, expiry and account change in the owned source browser here. A login completed in another browser does not establish this WebView's session. Record unsupported authentication paths instead of treating a public-page pass as account qualification.

Deliverable: supported presentation/lifecycle matrix. Include playback start, pause/resume, seek, fullscreen, captions when available, Back and return-to-applet. Test an owned media fixture separately from actual YouTube behavior.

Exit: 20 repeated source/custom transitions per selected configuration preserve correct source targeting and the advertised player path. The app never presents suspended observations as fresh. If arbitrary inline placement is an MVP requirement, compare a narrow same-document or live-region mode here; original-page handoff alone does not pass that requirement.

### GEN-04. Implement bounded projections and context correctness

Dependencies: GEN-02, with integration continuing only on GEN-03's supported presentation mode. Implement complete record snapshots, subscription/context metadata and a bounded raw-subtree snapshot. Build the fixture adapter first and one qualified YouTube projection next.

Deliverable: source-to-result updates with loading, valid-empty, partial, stale, unsupported and extraction-error states. Add current-session invalidation and document handshakes. Compare record extraction with the native-mirror candidate on the same workload before introducing a general patch engine.

Exit: controlled cases for node recycling, deletion, reordering, route changes, delayed old messages, session changes and overload have zero silently wrong records or wrong-context acceptance. Demonstrate safe coalescing of replacement snapshots. If deltas are introduced, every injected base-revision mismatch triggers recovery. Use model-based tests for the chosen state machine rather than only tests that repeat its implementation.

### GEN-05. Complete the action loop

Dependencies: GEN-04. Implement `open_record`, `refresh_source` and `show_original`, with source revalidation where needed. Add one reversible fixture action to prove the execution/confirmation path. Keep real-site writes and rich form editing in original-source mode initially.

Deliverable: explicit command states, deduplication, cancellation and postcondition checks that survive expected navigation.

Exit: 100 controlled action cases spanning stale targets, recycled nodes, duplicate requests, navigation, manual takeover and interruption produce zero wrong-target operations and zero automatic replay of uncertain side effects. Report valid refusals separately from successful actions. Opening a video route does not count as proving playback.

### GEN-06. Prove creator freedom through a stable SDK

Dependencies: GEN-04 and GEN-05. Extract the Rust SDK and add optional Leptos helpers. Create a list, grouped view and a layout with a creator-defined component or interaction over the same source contract. Include one custom transformation of a field obtained through the raw-subtree API.

Deliverable: editable applet source, typed examples, a capability inspector, fixture preview and actionable errors. A creator can identify which fields and operations are actually available.

Exit: all three layouts work without changes to the Android host or source adapter. Local sorting/filtering and rendering require zero model calls. Exercise loading, empty, stale and source-failed states. This proves more than rearranging a fixed component catalog.

### GEN-07. Make applets installable and recoverable

Dependencies: GEN-06. Add build/import automation, immutable package revisions, preview, activation and rollback. Preserve compatible local state and restore safe source definitions after app recreation. Add a small launcher only as needed to select installed applets.

Deliverable: a creator edits source, builds, stages, previews and activates the exact package, then disconnects the laptop and reopens the applet.

Exit: invalid build, incompatible protocol, startup failure, interrupted activation, state migration failure, infinite result computation and renderer loss all have recorded outcomes. The recovery control remains usable for every advertised failure class. If a shared renderer is terminated, all affected views recover with fresh identities. Restoring an old package restores compatible local state without claiming to undo website actions.

GEN-07 completes the proposed single-source prototype, subject to the explicitly selected media mode. It does not establish universal site support or multi-source composition.

### GEN-08. Add a second source and establish practical limits

Dependencies: GEN-07 and independent qualification of the second source. Add an owned second fixture first, then a second real website with a clearly named workflow. Combine records in one creator interface with separate ages, coverage and failures.

Deliverable: a two-source applet, source scheduling/eviction behavior and resource measurements. Observe at least two physical device/provider configurations before broader compatibility claims.

Exit: failing or navigating either source never relabels the other's records or targets. Shared-session invalidation reaches every affected source. Measure one and two sources plus the result view; test four only if that extension has a use case and acceptable measured cost.

Run a small creator pilot of five people completing three defined tasks each. A proposed target is 12 of 15 working outcomes without a maintainer editing the host or adapter. Record failures, unsupported requests, elapsed authoring time and interventions. This is usability evidence, not a population success-rate estimate.

## 9. Measurement and failure experiments

Record provider/version and build mode for every result. Use identical source content, viewport, session and cache preparation when comparing ordinary browsing with custom presentation. Emulator results establish functionality; physical-device results are needed for performance claims.

| Measurement | Definition | Initial target or decision |
| --- | --- | --- |
| Local UI response | Creator-local input to its visible result, excluding source/network work | Exploratory p95 at or below 100 ms; verify frame presentation with appropriate browser/Android tracing |
| Host-to-result update | Host accepts an observation until host receives a result DOM-commit acknowledgement | Exploratory p95 at or below 100 ms; this does not measure capture delay or actual display presentation |
| Fixture end-to-end loop | Host dispatches a known fixture mutation until host receives its correlated result DOM-commit acknowledgement | Exploratory p95 at or below 500 ms under the declared batching/workload |
| Source work | Extraction/serialization duration, observed nodes, field count and batches per second | Profile before selecting a continuous mirror or broad capture scope |
| Transport | Bytes per message and per second on both bridges, queue depth, coalesces and resyncs | Bounded memory and no unreported truncation |
| Total memory | Host plus relevant renderer proportional set size, with shared processes counted once | Compare incremental cost; choose source limits from measured data |
| Source liveness | Known fixture progression and qualified website behavior in each presentation state | Record stale/failure instead of inferring success from a live process |
| Recovery | Time and steps to usable source/app after each declared fault | Zero silently reused old targets or replayed uncertain commands |

Use at least 100 samples per exploratory latency condition and repeat across sessions. Host intervals use one host monotonic clock. Do not subtract a browser `performance.now()` value from an Android timestamp without explicit clock alignment. Do not label a DOM-commit acknowledgement as a measured painted frame.

Suggested starting limits for the record path: at most 200 records, at most 2 KiB per text field, at most 64 KiB per message, and at most five replacement snapshots per second per subscription. The total message budget wins if these limits conflict. Emit truncation metadata and keep at most one pending replacement snapshot per subscription. These are tunable experiment defaults, not proven device limits.

At those maxima, one bridge carries `64 KiB × 5 = 320 KiB/s`; sending the same volume through both bridges accounts for `640 KiB/s` before copies and encoding overhead. This arithmetic is not a measured workload. Structural snapshots can have a separate lower-frequency budget; do not force them into an unbounded serialization path.

Use a 10-minute owned fixture run with 1,000 DOM nodes and bursts up to 100 mutations/second. Verify that extraction coalesces work, UI data converges to the expected state, queues remain bounded and action outcomes are preserved. Test missing/reordered updates, nested structural changes, subtree replacement, retained-node growth, renderer crash, app process loss and a deliberately blocked result event loop.

## 10. When to change the architecture

| Evidence | Change to consider |
| --- | --- |
| The source cannot load Rust/Wasm using a supported qualified mechanism | Narrow provider support or compare GeckoView before expanding framework work |
| Custom mode breaks required source/media behavior | Revisit presentation ownership; test a same-document or live-source-region mode |
| Several applets need the same raw structure and extraction repeats expensive DOM reads | Introduce a shared bounded mirror and compare native versus source-side placement |
| Record snapshots exceed practical budgets | Narrow subscriptions, then evaluate deltas and binary encoding against a measured baseline |
| Result hangs cannot be recovered within the product requirement | Evaluate a genuinely separate execution environment with a bounded host renderer, or revise the supported failure guarantee |
| Creators repeatedly require fields outside the shared adapter | Improve raw projections and adapter authoring, instead of adding one-off host UI components |
| Two live sources exceed the target-device budget | Support suspended/reloaded sources with truthful stale state; do not advertise simultaneous freshness |
| Required behavior needs an engine hook absent from both candidates | Write the exact failing test and scope an embedder/engine experiment |

Do not select a browser fork merely because it permits deeper modifications. A fork still needs source identity, action semantics, UI ownership and Android lifecycle management. The decision should name the missing capability and the maintenance obligations it introduces.

## 11. Source verification and remaining uncertainty

Primary references rechecked for this review:

| Source | What it establishes | What remains unproven |
| --- | --- | --- |
| [WebViewCompat](https://developer.android.com/reference/androidx/webkit/WebViewCompat) and [feature flags](https://developer.android.com/reference/androidx/webkit/WebViewFeature) | World-aware injection/messaging APIs and runtime gating | Complete Genesis Wasm bootstrap and target-provider compatibility |
| [WebKit releases](https://developer.android.com/jetpack/androidx/releases/webkit) | Current stable listing and relevant minimum-SDK/API changes | A resolved Genesis dependency set |
| [NavigationListener](https://developer.android.com/reference/androidx/webkit/NavigationListener) | Main-frame page/navigation lifecycle API | Correct binding to every Genesis handshake and same-document transition |
| [WebView lifecycle](https://developer.android.com/reference/android/webkit/WebView) | `onPause` and global timer-pause distinctions | Source liveness in the chosen two-view layout |
| [Renderer termination](https://developer.android.com/reference/androidx/webkit/WebViewRenderProcess) | Termination can affect multiple WebViews | Recovery from every advertised applet fault on target devices |
| [wasm-bindgen deployment](https://wasm-bindgen.github.io/wasm-bindgen/reference/deployment.html) | Generated browser integration and output modes | A source-origin loading strategy for Genesis |
| [CSP Wasm integration](https://w3c.github.io/webappsec-csp/#wasm-integration) | Wasm compilation is subject to the applicable realm policy | Policy behavior of the selected injected execution world |
| [HTML user activation](https://html.spec.whatwg.org/multipage/interaction.html#tracking-user-activation) | Activation is an execution-context requirement | Success of each source operation after a result-side tap |
| [Wry](https://docs.rs/wry/latest/wry/) | Android setup and documented child-view platform support | A ready-made Genesis Android multi-view host |
| [GeckoView extensions](https://firefox-source-docs.mozilla.org/mobile/android/geckoview/consumer/web-extensions.html) | Bundled extensions and native messaging | Target-site media/authentication and Rust/Wasm extension loading |

The recommended path is ready to start as an experiment. The first implementation assignment is GEN-01 followed immediately by GEN-02, producing an Android APK and a source-agent capability report. Current research cannot supply the missing compatibility, media, creator or performance evidence.
