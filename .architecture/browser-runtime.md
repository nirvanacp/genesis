# Genesis browser runtime and protocol

## Startup and transport

MainActivity reads packages/index.json, configures optional local storage, and dispatches Attach to Rust. HostState validates the index and creates manifest-driven launcher entries. A selection creates one LiveView with a fresh generation, trusted applet context and declared assets. BrowserAdapter checks provider APIs, installs world-aware injection and messaging for exact allowed origins, and loads the URL.

The bundled SDK sends hello with a fresh nonce and package revision. The host issues a challenge through the message channel. An accepted acknowledgement binds a new document identity to that channel, view generation and origin. Requests carry protocol version, document ID, request ID, method and parameters. The host derives applet identity from its live context. Replies from retired documents must not update replacement UI.

Rust exposes HostEvent to HostCommand reduction through JNI. Android performs view/network operations and returns asynchronous completions. No application-specific backend schema belongs in this reducer. ServiceCompleted is accepted only for the current generation, document and channel. MainActivity executes commands on the UI thread; service I/O runs on bounded worker threads.

## DOM and UI ownership

ManagedRuntime owns the AbortSignal, observer, watchers, bindings, effects, modal, subscriptions and disposers for a document. Watchers track both element identity and content key. Callbacks must revalidate content before applying delayed results. Owned roots and styles are excluded from source discovery. Batches and repeated remounts are bounded.

Creator UI mounts in owned Shadow DOM containers. React owns those containers, while the website owns its existing components. Avoid full-tree adoption or cloning live components. Source writes and creator writes can conflict; conditional cleanup cannot restore arbitrary prior website state. Use ordinary browsing reload for recovery rather than promising complete undo.

Only one active WebView exists. Changing source/local-page destinations retires and recreates views. The host retains source URLs and selection metadata, not complete website application state. Native Back dismisses a modal, exits fullscreen, returns from a local page, navigates history, or returns to the launcher as appropriate. Modal dismissal is guarded by a 300 ms deadline.

## Pages, accounts and failure

Local pages use WebViewAssetLoader at a host-owned HTTPS-style origin, with declared paths and SHA-256 checks. Paths under the same origin are not complete applet security isolation. Browser settings enable JavaScript, DOM storage and normal cookies, while denying arbitrary file/content access. External publishers have ordinary browsing presentation and no HN bridge registration for their origins.

The website's cookies never become applet backend credentials. Activity save/restore preserves navigation metadata; suspension disposes managed applet resources and resume rebinds them. Renderer failure disables customization and supports ordinary-site recovery. Native navigation and recovery remain outside creator UI. The launcher is an Apps list with one entry per bundled applet, opening its first declared source. Local pages are reached through applet navigation or the floating Genesis menu. Inside an app, the WebView fills the available system-safe content area. A 56 dp native Genesis button overlays the bottom-right corner and opens Return to Apps, Back, Reload, App pages, Service connections, Recovery and debug-only Developer tools. No permanent host toolbar or status strip reserves space above the app. Loading/failure notices temporarily cover the content; recovery remains available through native controls. The floating control hides during native fullscreen content and returns on exit.

## Limits and source map

RPC has a 256 KiB envelope cap, 32 pending calls and a 15-second response deadline. That deadline does not cancel a server commit. Generation checks prevent stale UI delivery, not remote side effects. Provider support is feature-gated. The previous supported emulator report does not establish the newly introduced service workflow.

Read android/native/src/controller.rs, sources.rs, packages.rs; crates/contracts/src/lib.rs; MainActivity.java, BrowserAdapter.java, PackageAssets.java, HostViews.java; packages/sdk/src/bootstrap.ts, runtime.ts, scope.ts and rpc.ts. These implement the active TS runtime. crates/page-runtime is historical Wasm code.
