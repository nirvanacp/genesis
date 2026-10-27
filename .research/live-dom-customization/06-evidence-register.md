# Evidence register

Research checked on 27 October 2026. Links below are primary platform documentation, standards, or upstream project documentation. They support specific capabilities and constraints. They do not establish that the proposed Genesis integration works.

## 1. Evidence classes

- **Documented capability:** an upstream API or project explicitly describes the behavior.
- **Design inference:** a recommendation drawn from those capabilities and Genesis's requirements.
- **Unverified integration:** needs a build, device experiment or real-site test.
- **Acceptance target:** a proposed threshold, with no measured result yet.

Standards editor's drafts and working drafts are cited as such in the research document. Upstream documentation can change. Implementation should record exact dependency versions, source revisions and provider versions alongside its tests.

## 2. Claim-to-source map

| Claim | Evidence | Consequence for Genesis |
| --- | --- | --- |
| React can own selected new containers | [createRoot](https://react.dev/reference/react-dom/client/createRoot) | Mount islands without requiring a new whole-page frontend |
| Hydration expects corresponding React-produced HTML | [hydrateRoot](https://react.dev/reference/react-dom/client/hydrateRoot) | Do not present hydration as arbitrary website adoption |
| External structural edits can conflict with React | [DOM refs guidance](https://react.dev/learn/manipulating-the-dom-with-refs) | Website-owned components need compatibility tests |
| Portals place React-owned output | [createPortal](https://react.dev/reference/react-dom/createPortal) | A portal is not live-node transplantation |
| External stores need stable immutable snapshots | [useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore) | Specify snapshot identity and subscriptions |
| A custom renderer has a less stable upstream contract | [react-reconciler README](https://raw.githubusercontent.com/facebook/react/main/packages/react-reconciler/README.md) | Prefer ordinary React DOM and SDK effects |
| Extension tools already mount UI inside websites | [WXT content UI](https://wxt.dev/guide/essentials/content-scripts.html), [Plasmo lifecycle](https://docs.plasmo.com/framework/content-scripts-ui/life-cycle) | Reuse the approach; qualify the Android implementation separately |
| Cloning does not transfer all live behavior | [cloneNode](https://developer.mozilla.org/en-US/docs/Web/API/Node/cloneNode) | Retain source controls rather than infer their state from HTML |
| DOM observation has defined capture limits | [DOM standard](https://dom.spec.whatwg.org/#interface-mutationobserver), [MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver) | Declare additional property/event capture explicitly |
| A state-preserving move API exists | [Chrome moveBefore](https://developer.chrome.com/blog/movebefore-api), [constraints](https://developer.mozilla.org/en-US/docs/Web/API/Element/moveBefore) | Test relocation without claiming framework compatibility |
| Shadow styles have boundaries and inheritance rules | [CSS Shadow editor's draft](https://drafts.csswg.org/css-shadow-1/), [Shadow DOM guide](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM) | Treat Shadow DOM as encapsulation, not complete isolation |
| Rendering includes input routing as well as pixels | [RenderingNG](https://developer.chrome.com/docs/chromium/renderingng-architecture) | An engine presentation fork needs more than a DOM transform |
| Android provides feature-gated injection worlds | [WebViewCompat](https://developer.android.com/reference/androidx/webkit/WebViewCompat), [WebViewFeature](https://developer.android.com/reference/androidx/webkit/WebViewFeature) | First device experiment must establish actual provider support |
| Wasm deployment involves generated browser bindings | [wasm-bindgen deployment](https://wasm-bindgen.github.io/wasm-bindgen/reference/deployment.html) | Select and test an injection-compatible output format |
| Applicable CSP can govern Wasm compilation | [CSP editor's draft](https://w3c.github.io/webappsec-csp/#wasm-integration) | Byte delivery alone does not pass startup qualification |
| GeckoView supports built-in extensions and messaging | [Mozilla embedder documentation](https://firefox-source-docs.mozilla.org/mobile/android/geckoview/consumer/web-extensions.html) | Defined alternative experiment if WebView is unsuitable |
| Renderer termination may affect more than one view | [WebViewRenderProcess](https://developer.android.com/reference/androidx/webkit/WebViewRenderProcess) | Native recovery must recreate every affected context |
| Storage/network context matters even with injected code | [Chrome storage](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies), [network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests) | Use explicit applet storage and request contracts |
| Rust libraries provide JNI, SQLite and HTTP facilities | [jni](https://docs.rs/jni/latest/jni/), [rusqlite](https://docs.rs/rusqlite/latest/rusqlite/), [reqwest](https://docs.rs/reqwest/latest/reqwest/) | Reuse candidates, then qualify their Android build and configuration |

## 3. Alternative libraries researched

| Library | What the reviewed material establishes | What it does not establish |
| --- | --- | --- |
| [Morphdom](https://github.com/patrick-steele-idem/morphdom) | Real-DOM diff/patch mechanism | Coordination with an unrelated running framework |
| [Idiomorph](https://github.com/bigskysoftware/idiomorph) | DOM-merging algorithm | General preservation of website application state |
| [rrweb-snapshot](https://raw.githubusercontent.com/rrweb-io/rrweb/main/packages/rrweb-snapshot/README.md) | Serializable view snapshots and reconstruction, including deliberate script handling | A second executable copy of the original application |
| [Remote DOM](https://raw.githubusercontent.com/Shopify/remote-dom/main/README.md) | Authored UI synchronization between execution environments | Unrestricted manipulation of a live foreign DOM from a worker |
| [Violentmonkey](https://github.com/violentmonkey/violentmonkey) | Browser userscript management | An embeddable Rust Android applet runtime |
| [Stylus](https://github.com/openstyles/stylus) | Browser userstyle management | General UI/state/behavior customization by CSS alone |

These were documentation and license-file reviews, not source-code audits or package benchmarks. No upstream project was installed or copied into Genesis.

## 4. Local context and superseded assumptions

The [earlier architecture review](../architecture-review/2026-10-27-architecture-and-build-roadmap.md) contains the prior review of Genesis documents and the `~/bonsai-mobile` reference implementation. The [source-DOM research](../source-dom-react/2026-10-26-research.md) already identified same-document rendering and live-node movement as alternatives. The [browser UI layer proposal](../applet-framework/2026-10-27-browser-runtime-and-ui-layer-framework.md) separates persistent applet data from observed website data.

This set changes the default because the user clarified the product requirement: incremental customization of the original website with familiar creator code. It also records the user's explicit approval of JS/TS creator code alongside a Rust runtime. It does not claim that later research disproved separate-document rendering for every use case.

No Bonsai files were changed. Earlier fixed native UI catalogs, Rust-only creator examples and dual-WebView defaults are not constraints on this revised proposal.

## 5. What remains unknown

| Unknown | Required evidence |
| --- | --- |
| WebView can load the selected Wasm/creator/CSS assets in the chosen world | LIVE-01 Android and CSP matrix |
| Same-document customization preserves required YouTube behavior | LIVE-02 named route and player workflows |
| Effect conflict handling remains responsive under real mutations | LIVE-03 soak, frame measurements and fault injection |
| Data persists and creator endpoints work under the actual host | LIVE-04 storage/service tests |
| Native recovery handles both exceptions and hangs | LIVE-05 fault matrix on physical Android |
| Ordinary creators can implement new features without runtime edits | LIVE-06 creator pilot |
| Multi-source composition fits device resources and lifecycle constraints | LIVE-07 measurements and failure cases |

The architectural recommendation is an inference, not a measured winner. The [roadmap](05-implementation-roadmap.md) is designed to reject it early if the required runtime behavior fails.
