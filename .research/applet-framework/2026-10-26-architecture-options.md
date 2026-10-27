# Creator framework architecture options

Current implementation guidance: [live website customization](../live-dom-customization/README.md) adopts incremental DOM/CSS effects and optional creator UI, with a Rust runtime and user-approved JS/TS creator code. This document preserves the earlier framework comparison and separate-source proposal.

Research date: 26 October 2026, Asia/Kolkata. Scope: the library/framework through which creators author Genesis applets. The browser/source-runtime design remains in the [preceding architecture](../source-dom-react/2026-10-26-architecture.md).

Status: documentation research and proposals. No packages were installed, no framework was implemented and no Android or creator experiments ran. Scores and targets below are judgments and proposed experiments, not measured results.

## 1. Recommendation

Build a TypeScript/React SDK over a host-managed source and action runtime. Include reliable optional components and templates, while letting creators write ordinary JSX, CSS and local logic. A creator should not need to recreate source lifecycle, stale-state detection, action dispatch, error reporting or package rollback.

Add declarative composition as another authoring option only after the shared SDK works. A visual editor can produce that declarative format. Do not build a custom programming language, remote renderer and standalone microfrontend system at the same time.

The desired promise should be precise: Genesis prevents defined classes of invalid input, detects common failures before activation, and preserves recovery when custom code fails. Arbitrary programmable UI cannot be promised universally correct merely because it compiles or passes a schema. A schema-valid app can still show the wrong information, place controls offscreen or implement the wrong workflow.

This is reliability engineering within the user's requested scope. It does not reopen the broader security-hardening work.

## 2. Separate the choices

There are four independent design decisions:

| Decision | Alternatives |
| --- | --- |
| Creator artifact | Configuration, JSON UI, a restricted app language, React/TypeScript or a complete web project |
| Rendering owner | Host components, a custom React root, or a separate web runtime |
| Execution | Host UI thread, worker-driven messages, or a separately managed execution environment |
| Authoring interface | Chat, files/code editor, visual editor, or combinations |

A visual editor does not determine the runtime. JSON is a serialization format and does not itself establish the execution limits. React can render a predefined catalog or an unrestricted custom interface. A worker protects UI responsiveness only to the extent that expensive code actually runs there and the receiver bounds its own work.

## 3. Seven useful implementation families

### A. Templates with configurable slots

The host supplies an app type, such as a video browser. Creators choose fields, arrangement, sorting, filters, themes and supported actions. They might customize a row through a bounded slot definition.

Best property: the smallest state space and fastest route to predictable behavior. The host can account for all required loading, empty and failure states.

Cost: requests outside the templates need platform work. If a slot accepts arbitrary React, the slot has the same code-failure risks as a React app. Its small placement alone does not make it bounded.

Use for starter applets and common requests. Do not market it as unlimited customization.

### B. Declarative component trees

Creators or AI produce a tree of known components, data bindings, finite transforms and named actions. The host checks it and renders the components. A new component needs a registered implementation.

This can reject unknown components, invalid props, unsupported bindings and excessive tree depth before rendering. It cannot prove the meaning or quality of a valid interface, and host component implementations can themselves fail.

Existing candidates:

- A2UI defines component catalogs, data binding and catalog negotiation. Its documentation describes both generation-side and client-side validation, with fallback after rendering failures. [Catalog documentation](https://a2ui.org/concepts/catalogs/).
- json-render separates a catalog describing permitted components and actions from a registry implementing them. [Catalog](https://json-render.dev/docs/catalog), [registry](https://json-render.dev/docs/registry).

These are useful for persistent saved applets even though they were designed for generated UI. They do not require generating a new interface for every ordinary interaction. Their exact wire formats and installed renderer versions still require qualification.

Use when predictable composition matters more than unrestricted widgets. Do not silently add arbitrary JavaScript expressions to JSON and retain the claim that it is a finite declarative system.

### C. An app description language

Creators describe screens, state, queries, derived values and transitions in a language Genesis interprets or compiles. For example, a finite expression language could offer filter, sort and group without arbitrary loops, while named transitions describe navigation and source work.

Benefit: the compiler can inspect bindings and transitions before execution. A bounded language can limit work in ways arbitrary JavaScript cannot.

Cost: Genesis must define semantics, types, diagnostics, migration, debugging, tooling and version compatibility. A language that permits arbitrary recursion or user functions loses some of its termination guarantees. Compilation to React does not prove source correctness.

State-machine libraries such as XState can help represent lifecycle or action transitions. They are a building block, not a complete applet language or a replacement for source-result verification. The current documentation includes a v6 alpha; choose a specific supported release instead of assuming the newest docs match an installed version. [State-machine concepts](https://stately.ai/docs/state-machines-and-statecharts).

Use after repeated patterns demonstrate a need for a dedicated language. It is excessive initial work for a React-oriented creator audience.

### D. Ordinary React with a typed Genesis SDK

Creators write React, CSS and local logic. Genesis supplies typed observations, controlled source actions, lifecycle-aware hooks and optional UI helpers. The host wraps the applet with loading/recovery machinery that the custom root cannot accidentally delete.

Benefit: broad visual and local-behavior freedom with familiar tools. Shared source adapters remain separate from layouts. The SDK can catch unsupported API use and reduce repeated state-handling work.

Cost: arbitrary code can throw, loop, over-render, leak subscriptions or misinterpret data. TypeScript catches certain static errors; runtime schemas catch certain data errors. Neither proves a correct app.

Use as the primary MVP candidate for Genesis. Enforce browser operations in the host regardless of which components the creator uses. Treat the built-in component library as an aid rather than a mandatory vocabulary.

### E. Creator code with host-controlled remote rendering

Run creator logic in a separate JavaScript environment. It emits UI updates for components rendered by a host receiver. The code can remain flexible while the host owns actual elements, supported properties, events and method calls.

Remote DOM provides mechanisms for this arrangement, including remote elements and host receivers. Its examples include several frameworks. It still needs explicit supported APIs and components; a DOM polyfill does not imply complete compatibility with arbitrary React DOM packages, layout measurement, editors or npm dependencies. [Remote DOM documentation](https://raw.githubusercontent.com/Shopify/remote-dom/main/README.md).

Benefit: better separation between creator computation and the visible UI. A worker-based executor can be terminated when it fails to respond. [Worker specification](https://html.spec.whatwg.org/multipage/workers.html#dom-worker-terminate).

Cost: RPC overhead, event serialization, incomplete browser API coverage and receiver workload. A worker can flood the receiver with updates; queue limits and backpressure remain necessary. A worker's termination does not undo website actions already dispatched.

QuickJS is an alternative for bounded calculations or app logic. It exposes memory limits and interrupt handlers. It is a JavaScript engine, not a browser DOM or a ready React DOM runtime. Android JavaScriptIsolate termination also depends on runtime feature support. [QuickJS API](https://bellard.org/quickjs/quickjs.html), [Android isolate termination](https://developer.android.com/reference/androidx/javascriptengine/JavaScriptIsolate).

Use when the ability to stop creator computation is a required reliability property. Prototype it against D with the same applet before accepting its additional complexity.

### F. Self-contained web applets

Creators supply a complete web build with their preferred framework and libraries. Genesis loads it in an independently managed applet view and exposes a versioned bridge to source data/actions.

Benefit: maximum conventional web-development freedom and minimal dependence on a Genesis-specific UI library. This can serve expert creators who require their own routing, styling and libraries.

Cost: dependency incompatibilities, larger packages, applet lifecycle variation and weaker host control over internal UX. A separate WebView or iframe does not by itself prove a separate thread/process or a hard memory budget. Native recovery controls must remain reachable when the applet renderer is unresponsive, and shared renderer effects must be tested.

Use as an advanced package mode. A structured React project with a fixed entry contract is a smaller starting point.

### G. Source-page customization scripts

Creators directly modify source styles or source DOM and render extra controls in an owned region. This can preserve original interactions for small personal changes.

Benefit: direct access and fewer layers for a narrow restyling task. Cost: dependence on website structure and conflicts with source framework ownership. It also offers weaker separation from the original site when generated code fails.

Use as an explicitly experimental extension mode, not the default supported applet contract. This mode has different reliability claims from a layout that consumes a shared typed adapter.

### Comparative judgments

Scores are ordinal judgments. Freedom is flexibility of layout and local logic; prevention means how much can be checked before execution; burden means Genesis implementation and compatibility work. Higher means more of the named property. Scores do not represent success rates and must not be summed.

| Family | Freedom | Pre-execution checking potential | Framework burden |
| --- | ---: | ---: | ---: |
| Templates | 2 | 5 | 2 |
| Declarative component tree | 3 | 5 | 3 |
| Restricted app language | 3 | 5 | 5 |
| Typed React SDK | 5 | 3 | 3 |
| Remote host rendering | 4 | 3 | 5 |
| Complete web applet | 5 | 2 | 3 |
| Source scripts | 5 | 1 | 3 |

Checking potential assumes the host actually implements semantic checks, resource bounds and runtime validation. Remote rendering scores lower on unrestricted browser compatibility, not necessarily on component variety. Source-script freedom does not establish complete access to all frames or media state.

## 4. Visual editors and custom component packages

Puck is a relevant optional editor. Its configuration maps component types to React render functions and editing fields. The editor produces data, and its renderer renders that data using the same configuration. [Component configuration](https://puckeditor.com/docs/integrating-puck/component-configuration).

This lets Genesis combine visual authoring, AI-authored definitions and custom component packages. A new component package is still executable code and requires the same qualification as any React extension. Schema-valid props cannot prove that its implementation works.

Do not promise arbitrary React-to-visual-editor round trips. A registry-backed component tree can support visual editing. An arbitrary React program with hooks, functions and computed structure is not necessarily representable in that editor. Exporting generated code can be one-way; preserve that distinction.

Sandpack is a candidate for an embedded editor/preview. Its client defaults to a hosted bundler, and its documentation describes self-hosting and dependency retrieval. Evaluate Android WebView compatibility, cold offline operation and dependency availability before choosing it for a local-first product. Vite plus local built artifacts remains the smaller MVP workflow. [Sandpack client](https://sandpack.codesandbox.io/docs/advanced-usage/client), [bundler hosting](https://sandpack.codesandbox.io/docs/guides/hosting-the-bundler).

## 5. Recommended framework boundary

Use one source/action contract underneath multiple authoring options:

```text
User React, composed definitions or advanced applet code
                       |
          Genesis data hooks and action API
                       |
       Runtime validation and source coordinator
                       |
                 Live source tabs
```

Possible logical packages, not implemented modules:

| Package | Responsibility |
| --- | --- |
| @genesis/contracts | Canonical schemas, generated types, capabilities and version negotiation |
| @genesis/source | Immutable source projections, freshness/completeness and subscriptions |
| @genesis/actions | Typed requests, current-context checks and explicit operation results |
| @genesis/react | Hooks, lifecycle integration and component-level recovery |
| @genesis/ui | Optional lists, layouts, source links and status components |
| @genesis/applet-tools | Manifest/build checks, fixtures, previews, activation and rollback |

Source status and recovery controls should exist outside creator-owned DOM. Developers may choose their layout, but an accidental CSS rule should not delete the native control that restores the original page.

Keep source data immutable. Let creators transform it into local presentation state; do not expose mutation of the source mirror as if it changed the service. Dispatch service actions through the host and refresh the observation after confirmed changes.

Provide two extension boundaries. Layout creators use typed records and operations without maintaining selectors. Adapter authors can add source projections and operations, with separate versioning and qualification. Raw-source queries can remain available as an advanced mode, with the additional maintenance obligation stated plainly.

## 6. What the creator API could look like

Illustrative design only. These Genesis functions and components do not exist yet.

```tsx
export default defineApplet({
  id: 'my-video-library',
  sdkVersion: 1,
  sources: { videos: { adapter: 'youtube.cards', version: 1 } },
  App,
});

function App() {
  const source = useSource('videos');

  return (
    <SourceBoundary source={source}>
      {ready => (
        <section className="my-layout">
          {ready.items.map(video => (
            <SourceLink key={video.key} target={video.sourceRef}>
              <MyCustomVideoCard title={video.title} />
            </SourceLink>
          ))}
        </section>
      )}
    </SourceBoundary>
  );
}
```

The creator controls MyCustomVideoCard, markup, styling, local state and local transformations. Genesis supplies current source records, status handling and source-link behavior. The actual source adapter determines which fields exist. Unknown account/data fields remain unavailable rather than fabricated.

SourceBoundary must distinguish loading, failure, login-required, stale and ready states. It is a convenience, not a proof that the child code is correct. The host's source checks and recovery path still apply when the creator bypasses the convenience component.

## 7. Define what broken means

| Failure | Prevention or detection | Limit |
| --- | --- | --- |
| Syntax, imports and some type errors | Build and strict TypeScript checks | Correct business behavior is not established |
| Malformed external observations or command parameters | Runtime schema validation and semantic checks | Valid shapes can still carry incorrect source semantics |
| Unknown component or unsupported operation | Catalog/capability validation | A supported component or operation can still fail |
| Missing source, expired session or stale target | Source state machine and contextual execution checks | Website behavior remains an external dependency |
| Child rendering exception | Per-region React error boundary and fallback | Event/async errors need separate handling |
| Infinite computation | Terminate a worker or qualified isolated executor | A timeout callback cannot preempt a blocked UI thread by itself |
| Excessive receiver work | Message budgets, bounded trees/lists and backpressure | Runtime stress still requires physical-device measurement |
| Bad layout | Viewport, accessibility and overflow checks plus human preview | No general check proves aesthetic or task quality |
| Corrupt or incompatible update | Staged activation, compatibility checks and last-known-good revision | Restoring frontend code does not undo external actions |

TypeScript strict mode strengthens static checks, while Zod validates actual runtime values. Use one canonical schema where practical to reduce drift between types and runtime checks. Do not confuse their guarantees. [TypeScript strict](https://www.typescriptlang.org/tsconfig/strict.html), [Zod parsing](https://zod.dev/basics).

React error boundaries catch child rendering errors, with documented exclusions for event handlers and most asynchronous callbacks. They do not interrupt an infinite loop. Wrap source action promises and collect event/async failures separately. [React error boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary).

If strong hang containment is non-negotiable, evaluate remote rendering before claiming it for full React. JavaScriptIsolate close terminates pending work only with the relevant feature support; the unsupported case can continue consuming resources. An iframe alone is not the required evidence. [Android isolate API](https://developer.android.com/reference/androidx/javascriptengine/JavaScriptIsolate).

## 8. Activation workflow and evidence levels

Use draft, build-valid, previewed, qualified and active as distinct states. Record the package hash, adapter/SDK versions, fixture set, device/provider and observed results. An active applet need not be described as universally verified.

Suggested flow: compile, validate contracts, run fixtures, launch in staging, inspect actual source behavior, then activate the exact tested build. Retain the last-known-good revision and an independent recovery control. A heartbeat can detect missing progress, but its timeout must be owned outside the potentially blocked execution context.

The framework should report what it checked: build only, deterministic fixtures, real-site behavior, device behavior and creator preview. Avoid a single green badge whose meaning is unclear.

Prototype comparison:

1. Implement a minimal declarative catalog and the typed React SDK over identical source records/actions.
2. Give each mode six reference applets: list, grid, grouped view, custom interaction, a new component and a two-source view.
3. Run each against five states: loading, populated, empty, source unavailable and stale context. This yields 30 functional cases per mode before repetitions.
4. Add ten controlled faults: invalid syntax, missing import, invalid props, thrown render, rejected action, stale reference, source loss, incompatible schema, unbounded computation and excess updates. Report prevented, detected, contained and silently incorrect separately. Do not count a hard-required capability as passed merely because fallback is available.
5. If typed React fails the required hang-containment test, compare a worker/Remote DOM variant on the same tasks.

Suggested early targets: all declared invalid inputs are rejected; zero wrong-source operations in the controlled cases; recovery stays reachable for every advertised failure class; three layouts require no host/adapter changes. For creator testing, use five creators with three tasks each and a proposed 12-of-15 functional-result target without host edits. These are pilot thresholds, not measured success rates or proof of production correctness.

Start with typed React and optional components. Add a schema-based authoring mode if creators repeatedly ask for predictable composition. Add a visual editor when the component/data model is stable. Add remote execution when demonstrated failure-containment needs justify its restrictions. Do not require every mode to be available for the first useful framework.

## 9. Source register and uncertainty

Primary/maintainer documentation checked on 26 October 2026. Latest-version pages and main-branch files are unpinned discovery references. Adoption requires a specific release, dependency inspection and Android qualification.

| Source | Finding |
| --- | --- |
| [A2UI catalogs](https://a2ui.org/concepts/catalogs/) | Catalog definitions, negotiation, validation and fallback |
| [A2UI data binding](https://a2ui.org/concepts/data-binding/) | Separation of UI structure and data |
| [json-render catalog](https://json-render.dev/docs/catalog) | Schema-described components and actions |
| [json-render registry](https://json-render.dev/docs/registry) | Runtime React implementations and action handlers |
| [Puck configuration](https://puckeditor.com/docs/integrating-puck/component-configuration) | Editor data and React component registration |
| [Remote DOM](https://raw.githubusercontent.com/Shopify/remote-dom/main/README.md) | Remote authored UI and host rendering |
| [React Component](https://react.dev/reference/react/Component) | Error-boundary behavior and exclusions |
| [TypeScript strict](https://www.typescriptlang.org/tsconfig/strict.html) | Static checking controls |
| [Zod basics](https://zod.dev/basics) | Runtime validation and inferred types |
| [Workers](https://html.spec.whatwg.org/multipage/workers.html) | Separate script execution and termination |
| [QuickJS](https://bellard.org/quickjs/quickjs.html) | Memory limits and interruption API |
| [JavaScriptIsolate](https://developer.android.com/reference/androidx/javascriptengine/JavaScriptIsolate) | Feature-dependent termination behavior |
| [Sandpack client](https://sandpack.codesandbox.io/docs/advanced-usage/client) | Preview client and hosted bundler default |
| [Sandpack hosting](https://sandpack.codesandbox.io/docs/guides/hosting-the-bundler) | Self-hosting and dependencies to qualify for offline use |
| [State-machine concepts](https://stately.ai/docs/state-machines-and-statecharts) | Explicit lifecycle/state transitions; current docs include alpha material |

Top-level licenses were checked for [json-render, Apache 2.0](https://raw.githubusercontent.com/vercel-labs/json-render/main/LICENSE), [A2UI, Apache 2.0](https://raw.githubusercontent.com/a2ui-project/a2ui/main/LICENSE), and [Puck, MIT](https://raw.githubusercontent.com/puckeditor/puck/main/LICENSE). React/Remote DOM/build-tool license references are in the preceding research. This is package identification, not a complete resolved dependency assessment.

No claim is made that any candidate is already a drop-in Android applet framework. The unresolved experiments are actual creator flexibility, renderer responsiveness, supported dependency/API coverage, offline authoring, real source integration and failure recovery. The recommendation concerns framework boundaries; it does not change the existing browser architecture or implement a new runtime.
