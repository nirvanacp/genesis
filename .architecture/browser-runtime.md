# Genesis browser runtime and protocol

## Rendering and lifecycle

MainActivity loads the effective bundled/development index and selects the isolated reducer when it contains a schema-2 applet. `android/native/src/isolated.rs` owns the API-3 state machine. Legacy-only indexes retain controller.rs; legacy packages in a mixed index open as ordinary websites.

IsolatedBrowser creates a packaged foreground and a separate source WebView. AppletPresentation keeps an opaque native barrier above the source even when foreground content is transparent, loading, removed or failed. The source remains laid out for website virtualization but is not an input/accessibility surface. SourceView suppresses WebView virtual accessibility nodes, focus and text-editor behavior independently of importance flags. Hidden media is muted with a required provider feature and requires a gesture. Unsupported providers fail visibly rather than exposing source UI.

A foreground mounts immediately and waits only for its own committed initial layout before reveal. It renders loading/error/auth/unsupported states while the website loads. API-3 source watcher batches use a coalesced timer, independent of animation frames or document visibility; foreground effects retain frame scheduling. Source visits receive fresh navigation epochs and may recreate the source view; the foreground persists for the active applet. In-memory Back history is bounded to 64 entries, with per-section destination metadata. Declared homePaths distinguish root chrome from detail chrome. Native Back handles website/fullscreen, owned modal, bounded transient handlers, history and launcher. Stale deadline/result tokens cannot consume newer Back requests.

## Contracts and authority

Each schema-2 source references an exact-HTTPS-origin route contract. Ordered bounded path/query/fragment predicates resolve to custom, website or blocked; unmatched is explicitly unsupported. JS tooling and Rust share resolver semantics. Unsafe path encodings/credentials/dot segments are checked before normalization. A matching route permits extraction but does not validate website content or account identity.

SDK hello carries a fresh nonce and package revision. A channel challenge/ack binds role, exact origin, generation, document ID and channel. Document/visit IDs include the nonce, preventing old Activity completions from matching a replacement. Source messages also require the active navigation epoch. Adapter/screen registrations must exactly match declarations. Source adapters can publish bounded JSON and receive foreground read/navigation commands; source storage/services/UI requests are rejected.

SDK publication coalesces to at most four per second. The host caps accepted snapshots at 192 KiB within a 256 KiB transport envelope. Commands require the current source epoch and acknowledge dispatch, not eventual website results. Applet models validate stable IDs, content families, safe links/media and account state. Foregrounds render text/allowlisted rich models, never source HTML or cloned DOM.

ManagedRuntime owns abort/disposal, watchers, subscriptions, dialogs and Back handlers. createOwnedScope gives an internal screen a child lifetime without retiring the persistent foreground. Leaving/remounting a page releases its React roots, modal and subscriptions. Async applet work must separately verify record identity and disposal before applying results.

## Explicit website presentation

A foreground's webViews.open opens an explicit native-controlled website view. The exact current source URL adopts that live WebView under provider chrome, preserving its session/forms/POST state. Its adapter is retired, future injection removed and broker authority revoked before exposure. Other HTTP(S) URLs create an independent bridge-free reader. Native chrome shows the actual origin and Back/Forward/Reload/Close. Non-web schemes and app asset origins are rejected.

Close restores the owned opener. A provider visit to the source origin triggers fresh hidden-source/account validation. External articles that did not visit that origin preserve the existing source. A boolean dirty-field check protects native departure with Stay/Leave; field contents never leave the website for this check. Original website navigation owns its own form behavior. File pickers are provider/session-bound, hidden-source permissions/fullscreen are denied, and provider fullscreen exits before Back closes the reader. Permission-dependent features remain explicitly limited.

Activity pause/resume reaches foreground, source and external views. Renderer failure keeps native opaque recovery; Retry recreates the foreground and source. Stale source errors require matching view/epoch. Activity recreation restores eligible custom GET selection only. It never serializes arbitrary JavaScript, restores a POST, or guarantees durable website drafts or in-memory Back/scroll state.

## Services, diagnostics and limits

Only the foreground uses applet-scoped storage/services through existing workers. Completions require the live document/generation/channel and cannot update retired UI. Dropping a reply cannot undo a remote commit. RPC has 32 pending calls and a 15-second response deadline; source loading has a separate recovery deadline. Source media, focus and accessibility remain suppressed during those failures.

Debug inspection is explicit and visit-scoped; startup/leaving keeps local WebView inspection disabled. Isolated developer controls support inspection, simulated failure and renderer termination. The legacy 20-reload control is not offered for API 3. Native controls remain outside applet DOM.

Core files are IsolatedBrowser.java, AppletPresentation.java, MainActivity.java, HostViews.java, PackageAssets.java, isolated.rs, routes.rs, packages.rs, crates/contracts and packages/sdk. Shared app asset-origin paths and isolated worlds do not establish publisher sandboxing or total outbound network confinement. Qualification is recorded per actual build/provider/environment, not inferred from compilation.

The provider owns callbacks by exact WebView identity. A hidden source cannot change another reader's origin/loading UI or request its file picker/fullscreen. Independent readers leave exact-current hidden source publication active; hidden URL changes are deferred and revalidated on Close. Owned-page navigation cannot replace an open provider. Opening a provider cancels pending owned Back tokens. If the foreground dies behind a healthy reader, the reader stays usable and Close recreates the owned interface. User-activated ordinary target-blank links are routed through bounded, muted, five-second transient views; general opener-dependent authentication popup protocols are not guaranteed.
