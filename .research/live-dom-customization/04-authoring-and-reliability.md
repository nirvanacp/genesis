# Authoring and reliability workflow

Date: 27 October 2026. Proposed workflow and test criteria, not measured results. [Set overview](README.md).

## 1. Define what "not broken" can mean

Genesis can check that a package builds, matches the runtime contract, locates expected targets and passes named workflows. It can clean up managed effects and provide an independent recovery path. It cannot prove that arbitrary JavaScript will preserve every behavior of a website that can change tomorrow.

Report evidence in separate categories:

| Status | Evidence required | What it does not establish |
| --- | --- | --- |
| Build-valid | Bundle, manifest and dependency checks pass | Website compatibility |
| Fixture-tested | Named dynamic fixture scenarios pass | Current real-site behavior |
| Device-tested | Named workflows pass on recorded Android/provider versions | All phones, accounts or regions |
| Managed | Uses tracked operations with documented cleanup | Absence of website side effects |
| Unmanaged | Includes direct scripts outside complete effect tracking | Reliable automatic undo |

Do not compress these into a single green "safe" badge. A package can be build-valid and fail its first selector match.

## 2. Creator workflow

1. Open the actual source page inside Genesis. Inspect a target, its match count, enclosing root and current content identity.
2. Start with CSS or an inserted component. Generate a small editable project, not a screenshot-to-whole-page rewrite.
3. Keep target definitions separate from component code. Add a guard when matching a potentially ambiguous element.
4. Preview against an owned fixture, then against the real page. Show effect status, missing targets, console errors and source navigation.
5. Exercise the workflows the applet claims to preserve. Compare with the same page with customization disabled.
6. Build a pinned, self-contained package revision. Stage it, activate it, and test reopening without the development laptop.
7. Publish or share source and compatibility evidence when that product feature is introduced. The prototype only needs local import.

A future inspector can suggest selectors and generate scaffolding. Generated selectors still require review through match counts and tests. Prefer observable semantic attributes and content identity when available. Neither an accessible name nor a CSS class is guaranteed stable across localization and redesign.

For vibe coding, include the current SDK types, package constraints and a small captured fixture in the project context. Ask the model to add focused effects and tests for the requested behavior. Diagnose failures locally; avoid runtime model calls for routine targeting and every rerender.

## 3. Installation and updates

An installed revision contains the manifest, compiled JS/CSS/Wasm assets as applicable, source-map metadata, dependency lockfile reference and applet data-schema version. Validate package paths, required runtime capabilities and asset references before loading it.

Keep an immutable known-good revision. Stage the candidate separately and record activation atomically. A crash during activation must not make the host forget which revision was last usable. First preview with fixture data or a read-only feature path. A live-page preview can still cause side effects, so it is not a transactional sandbox.

For development, hot replacement should dispose the old applet scope before activating the next. If cleanup is incomplete, reload with the new revision rather than stacking two copies. Persist drafts explicitly if they need to survive a reload.

Rolling back code does not roll back website actions. Rolling back a data migration requires compatible data or an explicit local backup/restore plan. Begin with schema-compatible updates; implement and test migrations before advertising them.

## 4. Useful diagnostics

The runtime should be able to explain failures in terms the creator can act on:

```text
notes-panel: anchor ambiguous
Expected one [data-zone="watch-details"], found two.
No panel was inserted. Inspect matches or narrow the target scope.

compact-title: conflicting writes
The website reversed this field three times within one second.
Effect paused; original website remains active.

video-title: stale observation
Route scope ended before the asynchronous result completed.
Old result discarded.
```

Include applet revision, route, document binding, effect ID and provider version in exported diagnostics. Avoid recording entire pages by default. Small relevant fixtures are easier to understand and reproduce.

A missing match can mean delayed content, a different page variant or an obsolete selector. An ambiguous match is not a reason to silently use the first result. Extraction failure and a legitimately empty list are different states.

## 5. Failure matrix

| Failure to inject | Expected response | Required evidence |
| --- | --- | --- |
| Anchor absent at startup, later appears | Mount once when valid | No duplicate root or listener |
| Website replaces anchor subtree | Dispose old binding, resolve new one | Old handles released; local state policy explicit |
| Virtualized node now represents another item | Invalidate content binding | No note/action applied to previous item |
| Target matches two elements | Suspend dependent effect | Both source controls remain usable |
| Website reverses a managed change | Bounded retry then conflict | No sustained mutation loop |
| Creator callback throws | Report and dispose affected scope where possible | Native recovery remains available |
| Creator enters an infinite loop | Native disable/recreate path | No dependence on a responsive page callback |
| Source performs SPA navigation | Reevaluate route scope and bindings | No stale panel bound to the wrong content |
| Page restore, renderer or app process loss | Establish fresh bindings | No reuse of old handles or automatic replay of uncertain actions |
| Local write fails | Visible unsaved/error state | No false success acknowledgement |
| Creator service times out | Local UI remains usable | Cancellation and explicit retry state |
| CSS changes visual order | Test focus and reading order | Keyboard/TalkBack task remains understandable |
| Customization changes player geometry | Exercise actual player workflow | Playback, captions, fullscreen and Back still work |

Error boundaries help React rendering failures, but do not provide general JavaScript preemption. A renderer restart also restarts the website, with possible loss of unsaved source state. Treat this as recovery, not seamless fault isolation.

## 6. Proposed measurements

These targets are initial decision thresholds. Record the workload, device, Android version, WebView provider, build mode and sample count with every result. Revise a target only with a written reason.

| Measurement | Definition | Proposed initial gate |
| --- | --- | --- |
| Effect application | Fixture mutation timestamp to stable managed DOM effect, same renderer clock | p95 at most 100 ms while foregrounded, at least 100 samples |
| Creator-local input response | Input to visible UI response | p95 at most 100 ms, verify with presentation tracing; DOM commit alone is insufficient |
| Runtime work per scheduled batch | Rust observation/effect work plus called extraction, excluding later React work | p95 at most 4 ms on the selected physical device; also report worst cases |
| Recovery | Native disable request to usable ordinary fixture page | At most 5 seconds in 20/20 local runs; report real network reload separately |
| Managed cleanup | Registered effects, listeners and retained handles after disposal | Zero active objects attributed to the disposed scope |
| Soak convergence | 1,000-node fixture, bursts of 100 mutations/s, ten-minute run | Correct final state, bounded dirty queue and no sustained effect conflict |
| Memory | Host and renderer PSS, shared processes counted once | Compare ordinary page, CSS-only and React-island modes; no universal limit claimed yet |

The 4 ms batch threshold is about one quarter of a 60 Hz frame interval of approximately 16.7 ms. The rest of the frame is not free: the website, React, browser layout and painting also consume time. Passing the runtime threshold alone does not establish smooth scrolling.

Keep one dirty entry per affected subscription rather than one job per mutation. Start with a 200-record and 64 KiB cap for a published structured snapshot; emit explicit truncation metadata. These limits apply to managed observations, not to arbitrary raw DOM code. Do not present them as the total memory bound for an applet.

Use one clock for each interval. Host round-trip latency and renderer-local latency are different measurements. Do not subtract `performance.now()` from a native timestamp without alignment.

## 7. Website maintenance

Keep compatibility tests and targets in the applet or shared site module. Record tested route, date, locale, sign-in state and responsive layout. Public-page success does not establish authenticated behavior.

When a site changes, suspend affected managed effects and expose the original page. A creator can repair the target module and ship a new revision. AI can help propose that repair, but auto-installing untested selector changes would trade a visible failure for a potentially wrong operation.

Run a creator pilot only after the basic loop works. Have five creators attempt three defined tasks: a layout change, a persistent feature, and an interaction or field the maintainers did not predefine. A proposed gate is 12 successful outcomes out of 15 without a maintainer changing the runtime. Record time and interventions. This is a small usability test, not a market-wide success estimate.
