# Genesis browser runtime and protocol

## Startup and transport

MainActivity reads packages/index.json, configures optional local storage, and dispatches Attach to Rust. HostState validates the index and creates manifest-driven launcher entries. A selection creates one LiveView with a fresh generation, trusted applet context and declared assets. BrowserAdapter checks provider APIs, installs world-aware injection and messaging for exact allowed origins, and loads the URL.

The bundled SDK sends hello with a fresh nonce and package revision. The host issues a challenge through the message channel. An accepted acknowledgement binds a new document identity to that channel, view generation and origin. Requests carry protocol version, document ID, request ID, method and parameters. The host derives applet identity from its live context. Replies from retired documents must not update replacement UI.

Rust exposes HostEvent to HostCommand reduction through JNI. Android performs view/network operations and returns asynchronous completions. No application-specific backend schema belongs in this reducer. ServiceCompleted is accepted only for the current generation, document and channel. MainActivity executes commands on the UI thread; service I/O runs on bounded worker threads.

## DOM and UI ownership

ManagedRuntime owns the AbortSignal, observer, watchers, bindings, effects, modal, subscriptions and disposers for a document. Watchers track both element identity and content key. Callbacks must revalidate content before applying delayed results. Owned roots and styles are excluded from source discovery. Batches and repeated remounts are bounded.

Creator UI mounts in owned Shadow DOM containers. React owns those containers, while the website owns its existing components. Avoid full-tree adoption or cloning live components. Source writes and creator writes can conflict; conditional cleanup cannot restore arbitrary prior website state. Use ordinary browsing reload for recovery rather than promising complete undo.

The host retains up to three customized section WebViews with independent generations, channels and histories. Inactive views detach and pause; eviction saves WebView history and scroll. External GET links open a separate child reader without an applet bridge; Close restores the live opener. The Rust classifier uses exact declared origins and customized paths independently from root/detail position. Detail pages opened from a packaged page retain that section as their opener. Process recreation restores private history bundles and the active source URL; arbitrary website JavaScript state is not serializable. Native Back dismisses a modal, exits fullscreen, returns from a local page, navigates history, or returns to the launcher as appropriate. Modal dismissal is guarded by a 300 ms deadline.

## Pages, accounts and failure

Local pages use WebViewAssetLoader at a host-owned HTTPS-style origin, with declared paths and SHA-256 checks. Paths under the same origin are not complete applet security isolation. Browser settings enable JavaScript, DOM storage and normal cookies, while denying arbitrary file/content access. External publishers have ordinary browsing presentation and no HN bridge registration for their origins.

The website's cookies never become applet backend credentials. Activity save/restore preserves navigation metadata; suspension disposes managed applet resources and resume rebinds them. Renderer failure disables customization and supports ordinary-site recovery. Native navigation and recovery remain outside creator UI. The launcher is an Apps list. Shell-enabled packages declare brand artwork, sections with optional standard icons, and feed choices in manifest data. Native chrome reserves content insets and owns tabs and Back. Customized routes omit browser URL controls; ordinary pages expose origin and reader controls. Creator controls are available by long-pressing the brand. Legacy packages retain their generic controls.

An opaque cover blocks departing pixels and accessibility during document transitions. Reveal requires main-frame commit, SDK initial readiness for customized routes, and a navigation-specific visual callback. SDK activation may return a Promise; the optional React helper resolves after its first layout-effect commit. Async activation checks retirement before applying its result. Progress alone never reveals content. External readers reveal after their committed frame and do not await applet preparation.

Retained views receive host.focused when restored. Applets use context.onFocus to reread server data. Remote side effects remain possible after a view is retired. SDK timers still apply to requests; retention is not a guarantee that pending requests survive arbitrary phone suspension.


## Limits and source map

RPC has a 256 KiB envelope cap, 32 pending calls and a 15-second response deadline. That deadline does not cancel a server commit. Generation checks prevent stale UI delivery, not remote side effects. Provider support is feature-gated. The previous supported emulator report does not establish the newly introduced service workflow.

Read android/native/src/controller.rs, sources.rs, packages.rs; crates/contracts/src/lib.rs; MainActivity.java, BrowserAdapter.java, PackageAssets.java, HostViews.java; packages/sdk/src/bootstrap.ts, runtime.ts, scope.ts and rpc.ts. These implement the active TS runtime. crates/page-runtime is historical Wasm code.

The observed emulator table raster-cache defect is contained to emulator customized WebViews with software layers. Physical devices and external reader views retain acceleration. This is a rendering compatibility workaround, not a general performance claim.
