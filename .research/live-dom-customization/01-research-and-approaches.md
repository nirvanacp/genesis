# Research and approach selection

Date: 27 October 2026. Proposal and source research only. [Set overview](README.md).

## 1. What the proposition gets right

Most useful customizations do not require replacing a website. A compact layout, hidden recommendations, a notes panel, a keyboard shortcut or a personal filter can build on the existing application. The website continues to load data, maintain its session and implement its controls.

The closest established software family is browser extensions and userscripts. [Violentmonkey](https://github.com/violentmonkey/violentmonkey) manages scripts that modify websites. [Stylus](https://github.com/openstyles/stylus) manages website styles. [Plasmo](https://docs.plasmo.com/framework/content-scripts-ui) mounts creator UI into pages. These are evidence that the basic method is practical, not evidence that Genesis already works on Android.

The product opportunity is to make such modifications maintainable, discoverable and installable as apps. A new virtual DOM is not the missing ingredient. A dependable runtime and creator workflow are.

## 2. Where the state model needs correction

The DOM is an observable part of a running application. It is not a complete serialization of that application. The distinction matters even for a page that displays database records.

| State or behavior | Available from ordinary DOM observation? | Consequence |
| --- | --- | --- |
| Loaded text, links and attributes | Generally yes, within accessible trees | Suitable for filters, labels and new views |
| Current input value | Read its property, not only its HTML attribute | A structural snapshot alone can miss edits |
| Original event listeners and closure state | Not recoverable by copying markup | Retain original elements when preserving behavior matters |
| Unloaded or virtualized records | No, unless the page loads or exposes them | Do not present observed items as the complete database |
| Video playback, canvas drawing, rich editor internals | Only selected observable state | Keep the live component or build an explicit integration |
| Private website framework state | Not a general public DOM contract | Optional site-specific integration, never a universal requirement |
| Applet notes, settings and remote responses | Created and owned by the applet | Can be ordinary application state, independent of the website |

For example, `cloneNode()` does not copy listeners registered with `addEventListener`, and it does not copy a canvas's painted image. Input values have their own property semantics. These are concrete reasons why copying HTML is insufficient. [Node cloning](https://developer.mozilla.org/en-US/docs/Web/API/Node/cloneNode), [HTML input value model](https://html.spec.whatwg.org/multipage/input.html#dom-input-value).

There is also no single "fully loaded" DOM to transform once. The page can update after navigation, scrolling, user input and network activity. Genesis must manage a continuing relationship with the document.

Use this conceptual model:

```text
O(t) = selected observations of the running website
A(t) = applet-owned UI state, stored data and service responses
P(t) = creator's requested effects based on O(t) and A(t)

Genesis reconciles P(t) against the live DOM and its previous effects.
The website continues to execute and can change that same DOM.
```

An observation need not become a giant JSON object. Simple CSS requires no data extraction. A notes panel might observe only a content URL and title. A replacement list may need a bounded collection.

## 3. React helps with owned UI, not arbitrary takeover

React supports several roots on a page. Each root manages the contents of its container, and its initial render clears existing contents. Use a new empty container for Genesis UI. [React createRoot](https://react.dev/reference/react-dom/client/createRoot).

Hydration requires corresponding React-generated HTML and matching component output. It does not infer components or recover another application's state from arbitrary markup. [React hydrateRoot](https://react.dev/reference/react-dom/client/hydrateRoot).

A portal places React-owned content into a chosen container; it does not adopt an existing player or its application state. [React portals](https://react.dev/reference/react-dom/createPortal).

Our architectural inference is to keep two ownership rules: the website owns its existing components; the applet owns its new component interiors. React itself warns that external structural edits to its managed nodes can cause inconsistent results or crashes. That warning applies when Genesis modifies a React website too. [React DOM mutation guidance](https://react.dev/learn/manipulating-the-dom-with-refs).

This does not prohibit page manipulation. It identifies the compatibility cost of increasingly invasive changes.

## 4. Approaches worth considering

The judgments below concern fit for incremental customization. They are not measured performance or success probabilities.

| Approach | Reuses actual existing controls | Supports new UI and state | Main implementation cost | Judgment |
| --- | --- | --- | --- | --- |
| A. CSS and unrestricted userscripts | Yes, until a script disrupts them | Yes | Creator handles targeting, cleanup and failures | Essential escape hatch; weak default reliability |
| B. Managed DOM effects plus UI islands | Yes, with qualified modifications | Yes, ordinary frontend code | Effect lifecycle, anchors, conflict handling | Recommended default |
| C. Observe a region and replace its presentation | Only outside the replaced region | Yes | Extraction and explicit source action bindings | Optional tool for a substantial redesign |
| D. Clone/morph the entire website DOM | Identity may be retained selectively; behavior is not guaranteed | Yes | Competing renderers and incomplete state | Reject as universal foundation |
| E. Separate source/result documents | Source controls remain in the source document | Yes | Transport, explicit actions, media integration | Useful for dashboards and multiple sources |
| F. Custom React renderer emitting DOM effects | Depends on effects it implements | Yes | Renderer maintenance plus the same ownership problems | Defer until ordinary SDK calls prove inadequate |
| G. Engine-level independent presentation tree | Potentially, with substantial new integration | Potentially | Rendering, input, geometry and accessibility semantics | Research only after a concrete platform blocker |

### Why B should lead

It supports a small change without requiring the creator to rebuild the website. It also supports a large change assembled from CSS, selected replacement regions and new components. Existing components remain directly interactive where retained. The native bridge does not need to carry every DOM update.

Its weakness is shared ownership of the surrounding document. The website may remove an anchor, overwrite an attribute or interpret the new geometry differently. Genesis can detect and recover from some conflicts. It cannot make arbitrary mutations compatible by wrapping them in an SDK.

### Where morphing and virtual DOM libraries fit

[Morphdom](https://github.com/patrick-steele-idem/morphdom) updates an existing tree toward a target tree while reusing nodes. [Idiomorph](https://github.com/bigskysoftware/idiomorph) is another DOM-merging implementation. Both are useful where the caller has authority to update that tree. Neither establishes a protocol with an unrelated website renderer. That is the missing part in the proposed whole-page transformation.

React already reconciles the applet's new UI. Building a second reconciler for it adds little. A custom renderer could make `<Hide target={...}/>` syntax convenient, but a component that registers an effect can offer that syntax without a new React renderer. The upstream [react-reconciler package](https://raw.githubusercontent.com/facebook/react/main/packages/react-reconciler/README.md) also documents a less stable API than React DOM.

### Moving existing components

Moving the actual node preserves more than cloning it, but changing ancestors can affect delegated events, styles and website assumptions. `moveBefore()` can preserve browser-maintained state that ordinary removal/reinsertion may reset. It has document and connectedness constraints, and its presence must be checked on the selected provider. It does not make the website's renderer accept a new parent. [Chrome's state-preserving move explanation](https://developer.chrome.com/blog/movebefore-api), [moveBefore constraints](https://developer.mozilla.org/en-US/docs/Web/API/Element/moveBefore).

Start by changing layout around a player while keeping its parentage. Treat relocation as a separate qualified operation. Shadow slots also require a suitable host/light-DOM relationship; they do not teleport an arbitrary remote node without ownership consequences.

### Why an engine fork does not remove the hard question

Chromium's rendering pipeline includes layout, paint, compositing and input routing. A separate presentation tree would need rules for what geometry website scripts observe, where input goes, and how focus, selection, accessibility and embedded content behave. [RenderingNG architecture](https://developer.chrome.com/docs/chromium/renderingng-architecture).

That could be valuable research, but it is a different project from injecting a programmable layer. Neither browser internals nor Rust can infer every website's hidden assumptions. Do not fork Chromium until a failing required workflow identifies the missing capability.

## 5. Existing software that is particularly relevant

| Project | Concrete reuse or lesson | Boundary |
| --- | --- | --- |
| WXT | Integrated, Shadow DOM and iframe content UI; lifecycle utilities | Extension tooling, not an Android WebView SDK |
| Plasmo | Inline/overlay anchors, root discovery, component mounting and cleanup | Study the lifecycle; do not assume its host APIs exist in Genesis |
| Violentmonkey | Userscript packaging and per-site execution model | Reference for unrestricted mode, not a replacement for Rust runtime work |
| Stylus | Reusable CSS customization and per-site activation | Reference for style authoring |
| React/React DOM | Optional creator component runtime | Own only new applet regions |
| Morphdom/Idiomorph | Optional DOM merging for a creator-owned region | No solution to foreign renderer ownership |
| rrweb-snapshot | Optional recorded fixtures and diagnostics | Snapshot/rebuild is not preservation of live website execution |
| Shopify Remote DOM | Optional future worker-authored controlled UI | Restricts exposed DOM capabilities; does not provide arbitrary live page access |

[WXT's UI choices](https://wxt.dev/guide/essentials/content-scripts.html), [Plasmo's anchor lifecycle](https://docs.plasmo.com/framework/content-scripts-ui/life-cycle), [rrweb snapshot behavior](https://raw.githubusercontent.com/rrweb-io/rrweb/main/packages/rrweb-snapshot/README.md), and [Remote DOM's execution model](https://raw.githubusercontent.com/Shopify/remote-dom/main/README.md) support these distinctions. We have not audited these projects' implementations or run them against the target website.

## 6. Boundaries that must remain visible

Shadow DOM provides useful style encapsulation, but inherited properties and custom properties can cross the host boundary. The page can still style or remove the host. It is not a separate origin or process. [Shadow DOM documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM), [CSS shadow specification, editor's draft](https://drafts.csswg.org/css-shadow-1/).

An isolated execution world separates JavaScript globals while sharing the underlying DOM. It does not turn website internals into public APIs or give arbitrary cross-frame access. Chrome's documented extension behavior is a reference, not proof that WebView has identical policy. [Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).

Changes to geometry can alter lazy loading and intersection-based behavior. CSS visual ordering can also disagree with reading and focus order. These require behavior tests, not screenshot comparison alone. [Intersection Observer working draft](https://www.w3.org/TR/intersection-observer/), [CSS ordering and accessibility, editor's draft](https://drafts.csswg.org/css-flexbox/#order-accessibility).

The achievable promise is broad programmability with explicit compatibility and recovery. A promise that arbitrary creator code can never break an arbitrary website would be false.
