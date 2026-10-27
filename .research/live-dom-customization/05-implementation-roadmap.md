# Implementation roadmap

Date: 27 October 2026. Every stage below is pending. These are deliverables and acceptance gates, not a delivery-date estimate. [Set overview](README.md).

## 1. First code assignment

Build an Android proof that opens an owned dynamic page, loads a Rust/Wasm runtime plus a tiny creator script, changes one CSS rule and mounts one component while the original page continues working. Include a native disable-and-reload control immediately.

Do not start with a universal DOM mirror, a custom virtual DOM, a Chromium fork or a complete applet marketplace. The first unresolved question is whether the actual Android injection and ownership model works under the required conditions.

Use three initial Rust packages and a small TypeScript workspace. Split them further only when there is a real reusable boundary.

```text
genesis/
  Cargo.toml
  Cargo.lock
  rust-toolchain.toml
  package.json
  package-lock.json
  apps/android/                 # native Rust cdylib
    src/lib.rs
    src/browser.rs
    src/bridge.rs
    src/installations.rs
    src/storage.rs
  crates/contracts/             # messages, identities, statuses
    src/lib.rs
  crates/page-runtime/          # Rust/Wasm
    src/lib.rs
    src/targets.rs
    src/observations.rs
    src/effects.rs
    src/scopes.rs
  packages/sdk/                 # thin TS bindings and public types
  packages/react/               # optional helpers, added when useful
  applets/video-notes/           # creator project, not native runtime logic
  platform/android/             # Gradle, manifest, narrow JVM adapter
  fixtures/dynamic-watch/       # owned page, rerenders, media and failure cases
  tools/package-applet/          # build/import script before a full CLI
  engineering/evidence/          # device matrix, logs and acceptance reports
  research/live-dom-customization/
```

This is a proposed layout, not a set of directories created by the research task. Keep page-runtime internals as modules initially. Put site selectors in applets or shared creator packages, not native Rust.

Build native Android and browser Wasm for their respective targets. One generic host `cargo check --workspace` is not sufficient validation. Resolve, pin and verify a compatible toolchain during the first stage.

## 2. Open-source dependency choices

These are adoption candidates, not a tested lockfile or exhaustive transitive inventory. The [earlier dependency inventory](../rust-monorepo/2026-10-26-dependencies.md) remains historical context; its exact versions are not a requirement for this revised stack.

| Layer | Start with | Why | Defer |
| --- | --- | --- | --- |
| Android browser | System WebView, AndroidX WebKit | Existing engine, injection and host callbacks | Chromium fork; GeckoView unless comparison is needed |
| Rust/native boundary | `jni`, `serde`, `serde_json` | Android calls and small explicit protocol | General IPC framework |
| Page runtime | `wasm-bindgen`, selected `web-sys`/`js-sys` bindings | DOM access and creator callback integration | Full DOM serialization library |
| Async page tasks | `wasm-bindgen-futures` when needed | Promise/async integration | Unnecessary native async runtime in the DOM loop |
| Creator UI | JS/TS, optional `react` and `react-dom` | Familiar browser programming and component reuse | Mandatory custom DSL or component catalog |
| Creator build | Vite and its React integration, TypeScript checking | Bundles, source maps, development workflow | On-phone npm compilation as an MVP prerequisite |
| Durable local data | SQLite through a qualified Rust binding such as `rusqlite` | Transactions and applet namespaces | Cloud sync before local persistence works |
| Creator service broker | A Rust HTTP client such as `reqwest`, if the feature needs it | Explicit host-network contract | Implicit website-cookie forwarding |
| Diagnostics/tests | `tracing`, Rust tests, `wasm-bindgen-test`, browser/device integration tests | Runtime invariants and actual DOM behavior | Treating a DOM mock as proof of media/layout compatibility |
| Package tooling | Small build script, later `clap` and hashing/schema packages | Reproducible installation | Full editor and marketplace |

Candidates [rusqlite](https://docs.rs/rusqlite/latest/rusqlite/) and [reqwest](https://docs.rs/reqwest/latest/reqwest/) still require Android cross-compilation, TLS/storage configuration and license/dependency qualification. Reqwest's native async client requires Tokio; a blocking client must run off the UI thread. Nothing has been installed. Reuse existing libraries rather than implementing a database or TLS client, but do not add either to the first injection experiment.

WXT and Plasmo are especially useful design references and optional desktop comparison tools. Their repository license files declare MIT, as does Violentmonkey. Stylus's repository carries GPLv3 text. These are observations at the linked upstream revisions, not a transitive license audit. [WXT license](https://raw.githubusercontent.com/wxt-dev/wxt/main/LICENSE), [Plasmo license](https://raw.githubusercontent.com/PlasmoHQ/plasmo/main/LICENSE), [Violentmonkey license](https://raw.githubusercontent.com/violentmonkey/violentmonkey/master/LICENSE), [Stylus license](https://raw.githubusercontent.com/openstyles/stylus/master/LICENSE).

Do not import all four projects. Their extension APIs are not automatically available in WebView. Reuse proven lifecycle ideas; use their actual tooling only where the selected host supports it.

## 3. Build stages

### LIVE-01. Qualify the host and injection contract

Create the Android host, native recovery control, owned fixture and Rust/Wasm bootstrap. Load a creator JS bundle and packaged CSS/assets in the chosen execution world. Establish document-bound messaging. Run with WebView debugging disabled as well as during development.

Test HTTP response CSP variants, redirects, reloads and same-document navigation. Record injection time separately from Wasm-ready and creator-ready times. Include one named public YouTube route after the fixture works. CSS-only success does not pass Wasm/React loading.

Exit: 20/20 navigation/reload cycles for every claimed supported configuration produce the expected current-document ready state. One physical Android device/provider must pass the real-site case. Unsupported cases have an explicit reason.

Failure decision: repair the loader, narrow provider support, or run the same test with GeckoView. A desktop extension demo is useful supporting evidence but does not close this gate. A proposed five-engineer-day timebox limits the initial investigation; expiry means a decision report, not automatic acceptance.

### LIVE-02. Prove incremental customization preserves behavior

Implement route scopes, owned styles, one validated anchor and one owned UI container. Add a React component using the ordinary mount/unmount API. Keep the fixture's original form and media controls intact. Then make a small real-page change around the original YouTube player.

Exit: 20/20 repeated cycles of navigation, anchor replacement, enable/disable and return preserve the declared source workflow. Test playback, pause, seek, captions when available, fullscreen, Back and keyboard input where relevant. Record any additional restrictions.

Test parent-preserving layout before player relocation. If changing surrounding layout already breaks the required workflow, investigate ownership/geometry before adding more SDK abstractions. A replacement screenshot or an external embedded player does not pass preservation of the original source player.

### LIVE-03. Implement managed effects and observations

Implement stable effect keys, target cardinality/guards, bounded scheduling, snapshot status, node/content identity and conditional cleanup. Add conflict detection and observation exclusions for owned UI. Support one active applet per tab initially.

Exit: fixture cases for missing/ambiguous targets, subtree replacement, recycled nodes, same-field competing writes, stale async results, route changes and repeated disposal have zero wrong-target applications and no unbounded retry. Run the ten-minute mutation soak and measurement definitions in the [reliability document](04-authoring-and-reliability.md).

Use Rust state-machine tests for lifetime and ownership rules, and actual browser tests for DOM behavior. Prove that type checking does not substitute for target validation. Do not add a general full-tree patch protocol to complete this stage.

### LIVE-04. Deliver a useful creator-owned feature

Add local persistence and build the notes example with applet-defined state. Persist by stable content identity, not node handle. Add a second custom feature that reads a field absent from the first example without changing native code.

Exit: notes survive source navigation, app restart and a compatible package update. Failed writes show errors. Account/profile scope is explicit. The new feature requires only creator code and target-module changes.

For the independent-server promise, add a small creator-owned test endpoint and qualify the chosen browser or host request path. Demonstrate cancellation, timeout, authentication failure and an idempotent test write. Local persistence alone does not establish this capability. Keep remote sync separate from website actions.

### LIVE-05. Package, edit, update and recover

Add a reproducible creator build, import/staging, immutable revisions and local activation. Pin dependencies and record the package-to-source relationship. Implement disable/reload and rollback. Make unmanaged scripts possible with clear cleanup limits.

Exit: a creator edits source, builds, installs, disconnects the laptop and reopens the applet. Exercise invalid package, missing asset, startup exception, infinite loop, interrupted activation, renderer loss, process recreation and incompatible data schema. Test native recovery 20/20 times on the owned fixture. Record source data lost during recovery rather than hiding it.

LIVE-05 closes the single-site prototype only when LIVE-01 through LIVE-04 evidence is also present. It establishes neither universal compatibility nor unrestricted script fault isolation.

### LIVE-06. Test creator freedom and maintenance

Provide an inspector, starter projects and SDK documentation. Run the five-creator, three-task pilot from the reliability document. Include plain JS, React and one alternative mounting adapter or plain-DOM component to test framework independence.

Exit: proposed target of 12/15 working tasks without maintainer runtime changes. Introduce a controlled site redesign and record target repair time, test failures and required edits. Do not report maintainability based solely on successful initial generation.

Measure ordinary browsing, CSS-only customization and a React-island applet on at least two physical device/provider configurations before broader performance claims. Publish both successful and unsupported workflows.

### LIVE-07. Expand only from demonstrated need

Add selective region replacement when a creator needs a layout CSS cannot provide. Keep retained live controls separate from rebuilt content. Add a second source tab and a composed view only when an actual applet requires it.

Exit for region replacement: fresh observed data, explicit loading/coverage, correct source actions and keyboard/accessibility behavior. Exit for multi-source mode: independent source identity/freshness, one source failing without corrupting another, and measured memory/lifecycle cost.

Multiple customizations on one page need explicit composition rules for CSS, anchors and conflicting field ownership. Do not extend single-applet guarantees to stacked applets by assumption.

## 4. Evidence that would change the plan

| Observed blocker | Next experiment |
| --- | --- |
| Supported WebView injection cannot run required Wasm or creator assets | Equivalent GeckoView built-in extension test |
| Same-document island repeatedly conflicts with the source renderer | Different anchor/overlay placement, then region or separate-document mode |
| Required player relocation fails despite retained node identity | Narrow live-component experiment; define exact missing behavior before engine work |
| Creator code hangs too often for acceptable recovery | Worker/remote UI option with explicitly reduced direct DOM access |
| Creators repeatedly need fields absent from helpers | Improve target authoring and raw access, not a larger mandatory native catalog |
| Observation dominates frame cost | Narrow scopes and capture channels; measure before choosing another synchronization mechanism |
| Every required operation needs page-private internals | Reassess maintenance and product coverage; DOM abstractions cannot hide that dependence |

The first implementation should answer whether a programmable layer can stay attached to a live, changing website. Once that works, the SDK can become convenient. Starting with a polished declarative API before this evidence would obscure the central risk.
