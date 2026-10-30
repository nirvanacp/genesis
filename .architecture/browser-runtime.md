# Genesis browser runtime and protocol

## Startup and transport

MainActivity builds an effective package index from APK assets and, in debug only, validated private development revisions, configures optional local storage, and dispatches Attach to Rust. HostState validates the index and creates manifest-driven launcher entries. A selection creates one LiveView with a fresh generation, trusted applet context and declared assets. BrowserAdapter checks provider APIs, installs world-aware injection and messaging for exact allowed origins, and loads the URL.

The bundled SDK sends hello with a fresh nonce and package revision. The host issues a challenge through the message channel. An accepted acknowledgement binds a new document identity to that channel, view generation and origin. Requests carry protocol version, document ID, request ID, method and parameters. The host derives applet identity from its live context. Replies from retired documents must not update replacement UI.

Rust exposes HostEvent to HostCommand reduction through JNI. Android performs view/network operations and returns asynchronous completions. No application-specific backend schema belongs in this reducer. StorageCompleted and ServiceCompleted use matching live active/retained generation, document ID, and channel, plus applet identity where provided. Retired, failed, and evicted documents cannot receive replies. Storage change notifications reach the active bound document of that applet; retained documents refresh on focus. New page messages remain active-view only. MainActivity executes commands on the UI thread; service I/O runs on bounded worker threads.

## DOM and UI ownership

ManagedRuntime owns the AbortSignal, observer, watchers, bindings, effects, modal, subscriptions and disposers for a document. Watchers track both element identity and content key. Callbacks must revalidate content before applying delayed results. Owned roots and styles are excluded from source discovery. Batches and repeated remounts are bounded.

Creator UI mounts in owned Shadow DOM containers. React owns those containers, while the website owns its existing components. Avoid full-tree adoption or cloning live components. Source writes and creator writes can conflict; conditional cleanup cannot restore arbitrary prior website state. Use ordinary browsing reload for recovery rather than promising complete undo.

The host retains up to three customized section WebViews with independent generations, channels and histories. Inactive views detach and pause; eviction saves WebView history and scroll. External GET links open a separate child reader without an applet bridge; Close restores the live opener. The Rust classifier uses exact declared origins and exact legacy paths or API-2 dynamic route patterns independently from root/detail position. Ordinary exclusions win. A same-source ordinary route retains its source WebView with ordinary chrome and loses applet broker eligibility. A SPA return to customized coverage performs a controlled GET reload. Detail pages opened from a packaged page retain that section as their opener. Process recreation restores private history bundles and the active source URL; arbitrary website JavaScript state is not serializable. Native Back dismisses a modal, exits fullscreen, returns from a local page, navigates history, or returns to the launcher as appropriate. Modal dismissal is guarded by a 300 ms deadline.

## Pages, accounts and failure

Local pages use WebViewAssetLoader at a host-owned HTTPS-style origin, with declared paths and SHA-256 checks. Paths under the same origin are not complete applet security isolation. Browser settings enable JavaScript, DOM storage and normal cookies, while denying arbitrary file/content access. External publishers have ordinary browsing presentation and no HN bridge registration for their origins.

The website's cookies never become applet backend credentials. Activity save/restore preserves navigation metadata; suspension disposes managed applet resources and resume rebinds them. Renderer failure disables customization and supports ordinary-site recovery. Native navigation and recovery remain outside creator UI. The launcher is an Apps list. Shell-enabled packages declare brand artwork, sections with optional standard icons, and feed choices in manifest data. Native chrome reserves content insets and owns tabs and Back. Customized routes omit browser URL controls; ordinary pages expose origin and reader controls. Creator controls are available by long-pressing the brand. Legacy packages retain their generic controls.

An opaque cover blocks departing pixels and accessibility during document transitions. Reveal requires main-frame commit, SDK initial readiness for customized routes, and a navigation-specific visual callback. SDK activation may return a Promise; the optional React helper resolves after its first layout-effect commit. Async activation checks retirement before applying its result. Progress alone never reveals content. External readers reveal after their committed frame and do not await applet preparation.

Retained views receive host.focused when restored. Applets use context.onFocus to reread server data. Remote side effects remain possible after a view is retired. SDK timers still apply to requests; retention is not a guarantee that pending requests survive arbitrary phone suspension.


## Limits and source map

RPC has a 256 KiB envelope cap, 32 pending calls and a 15-second response deadline. That deadline does not cancel a server commit. Generation checks prevent stale UI delivery, not remote side effects. Provider support is feature-gated. Historical service/device evidence applies to its recorded builds and providers.

Read android/native/src/controller.rs, sources.rs, packages.rs; crates/contracts/src/lib.rs; MainActivity.java, BrowserAdapter.java, PackageAssets.java, HostViews.java; packages/sdk/src/bootstrap.ts, runtime.ts, scope.ts and rpc.ts. These implement the active TS runtime. crates/page-runtime is historical Wasm code.

The observed emulator table raster-cache defect is contained to emulator customized WebViews with software layers. Physical devices and external reader views retain acceleration. This is a rendering compatibility workaround, not a general performance claim.

## Applet-facing boundary

The [factory SDK reference](../factory/guides/sdk-reference.md) documents the supported creator interface. Applets import public SDK exports and let the packager perform bootstrap; bridge globals, JNI, HostEvent/HostCommand, and platform source imports are internal. Each source entry adapts its own running document. Applet-owned pages combine extracted records, not other WebViews' DOM trees.

The shell receives explicit source/page selection, including the owning selection for details. Choice destinations declare source IDs and use generic View wording. Source classification checks the selected source rather than the union of package origins. Local page classification checks its exact packaged path. The [phase-3 plan](../.plans/phase-3/2026-10-30/162034-genesis-platform-applet-separation-plan.md) records these changes and their verification.

## Development package lifecycle

`PackageStore` consumes bounded one-time imports from app-private files in debuggable builds only. Rust validates envelope compatibility and manifest policy independently; Java verifies sorted asset hashes and canonical package revision before staging. The private atomic registry selects immutable current/previous revisions. Startup validates pointed bytes and falls back from corrupted code; unreferenced revisions and partial staging are cleaned without deleting records or service credentials. Request-correlated receipts acknowledge package acceptance separately from rendering/service readiness. Release builds never read the development import or registry.

## Runtime API 2 navigation

Selection identity and owning section identity are separate. Section destinations remember source/page, URL and opener while the native host retains at most three live views. SDK modal and fullscreen dismissal precede source transient Back. The optional Back handler has a document/route-bound token and a 300 ms native fallback deadline. Acknowledged leave guards intercept native section/launcher/reload navigation with Stay as the safe choice. These APIs cannot promise draft persistence or intercept every website navigation.

Neutral shell colors follow light/dark native semantics; omission preserves HN colors. Reveal animates opacity and an 8 dp translation over 180 ms when Android animators are enabled, after the existing committed-frame/readiness gate. SDK modal backgrounds preserve and restore owned inert/ARIA state, including new sibling nodes; native tabs are disabled while a managed modal is open. TalkBack and physical-device motion remain unqualified for this revision.

File selection uses ACTION_OPEN_DOCUMENT, requested MIME constraints and bounded single/multiple content-URI results. The callback is bound to its requesting WebView, generation and navigation epoch; stale results are cancelled. No filesystem, camera or microphone permission is added. Capture intents and complex authentication popups remain unsupported.
