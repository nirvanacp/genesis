# X overlay opacity and shared customization safeguards

Project: Genesis platform and `factory/applets/x.com`. Phase: `phase-4` on `proto/phase-4`. Created 31 October 2026, 12:54 Asia/Kolkata. Status: investigation complete for the reproduced DOM opacity defect; implementation planned. This task changes documentation only.

## Problem, evidence and ownership

The user's 12:39 screenshots show the source bookmark acknowledgement with its Add to Folder action and the floating compose button faded over timeline content. These are X-owned controls. The separate Save to category row is applet-owned.

Live inspection of `emulator-5554`, Genesis process 13266, established the following without changing application code:

| Observation | Evidence | Meaning |
| --- | --- | --- |
| X rendering preference | `applet-rendering.xml` has `x-bookmarks=hardware` | The prior software-layer rendering workaround does not explain this reproduction. |
| Compose at rest | `[data-testid="FloatingActionButtons_Tweet_Button"]` has opaque `rgb(29, 155, 240)` background; it and its ancestors have opacity 1 | The source can render the control correctly. |
| Compose after upward swipe | Parent `[data-testid="FloatingActionButtonBase"]` receives inline `opacity: 0.3`; transition duration 170 ms | The parent fades the whole button, regardless of the child's opaque color. |
| Bookmark acknowledgement | `[data-testid="toast"][role="alert"]` has opaque `rgb(29, 155, 240)` background and inline/computed opacity 0.3 with the same transition | The alert text, background and Add to Folder action fade together. Its remaining inspected ancestors have opacity 1. |
| Existing adaptation | `source.css` has no opacity rule; `theme.css` lives in owned Shadow DOM; SDK source styles contain no matching fade | No inspected applet rule imposes this source opacity. |

The immediate root cause is X's inline opacity state on these two source containers. A child background or child `opacity:1` cannot undo ancestor compositing. The compose change was observed after scrolling. The exact upstream X event/state implementation, and whether the same behavior occurs in a completely uncustomized mobile session, were not traced. Do not claim a specific X internal bug, a shared GPU defect, or that all translucency is accidental.

The framework gap is diagnostic and contractual: checking a control's background or its own opacity misses ancestor opacity, filters and stacking contexts. Shadow DOM isolates selectors but does not isolate its host from ancestor compositing. `ManagedRuntime.openModal` already appends a body-level host, separates a translucent backdrop from a white dialog, and manages Back/focus. This evidence does not justify replacing that implementation or changing Android rendering defaults.

The installed X revision observed was `6b7e842e450cb2836cd35052fb9d7be43b635792002a776898566a8326bafa52`. The newer partial folder build was not installed. No code update was installed during this investigation. The disposable source bookmark was removed and the source returned `bookmark`, with no `removeBookmark` control, on read-back. Temporary CDP forwarding was removed.

## Product contract and scope

Required: visible, enabled compose and bookmark acknowledgement controls remain legible over media while scrolling and after scrolling. Required: shared authoring guidance and diagnostics distinguish a transparent panel from a deliberately dimmed backdrop, an ancestor fade and a native painting problem. Preserve X action handlers, source toast lifetime, disabled states, modal dismissal, source navigation and neighboring applets.

Agent decision: use two narrowly scoped source rules for this qualified X layout. Do not force every source element or every button opaque. Keep X selectors out of SDK and Android code. Shared work supplies diagnosis and an overlay contract rather than guessing the correct visual policy for arbitrary websites.

No data/schema migration, subscription changes, backend work, native rendering-default change, broad CSS reset, or new test files are included. The folder behavior repair is a separate dependency for the Add to Folder action itself; this plan fixes its readability.

## Guidance to read

Read [factory instructions](../../../factory/AGENTS.md), [SDK reference](../../../factory/guides/sdk-reference.md), [patterns](../../../factory/guides/patterns.md), [verification](../../../factory/guides/verification.md), [browser architecture](../../../.architecture/browser-runtime.md) and [X architecture](../../../.architecture/x.md). The [earlier device audit](../../../.reports/phase-4/2026-10-31/083700-x-ui-audit-and-verification.md) documents a distinct software-rendering defect; retain that historical qualification without using it as the cause here.

Apply the project Apple design guidance to HTML and Android. `accessibility.md` under Vision says "Strive to meet color contrast minimum standards." Under Cognitive it says "Minimize use of time-boxed interface elements." Use those principles for contrast and a persistent alternative to the short-lived toast. The source toast need not become permanent. `modality.md` guides one modal at a time and predictable dismissal. These references are under `.skills/apple-design-skill/references/hig/`.

## Ordered components and commit boundaries

### 1. Shared UI diagnosis and overlay authoring contract

Add `tools/inspect-ui-surfaces.mjs`, a developer-only CDP utility using built-in Node fetch/WebSocket, with no runtime dependency and no automatic page mutation. Inputs must select an explicit debug target and CSS selectors. Accept at most 20 selectors and 20 matches each. Reject ambiguous target selection. Require an existing operator-established debug connection; never start services or change device forwarding itself.

For each selected node return a bounded JSON record containing tag, role, test ID, ownership marker, bounds, computed opacity/background/color, filter, backdrop-filter, transform, mix-blend-mode, visibility, display, pointer-events, position and z-index. Traverse composed ancestors through ShadowRoot.host, at most 64 levels. Include the chain's opacity product as an approximation, explicitly excluding filter/paint effects. Flag a truncated chain instead of declaring it safe. Include relevant inline style property values, not full HTML, content, handles, cookies, URLs with query strings or account state. Do not serialize arbitrary attributes or page text.

Support bounded sampling, default 1 second at 100 ms intervals, maximum 10 seconds. This distinguishes a 170 ms entry transition from persistent opacity 0.3. A sample result classifies evidence as ancestor opacity, own opacity, alpha background, filter/blend effect, hidden/inactive, or unexplained paint discrepancy. It must allow multiple causes. A transparent button over an opaque container is not automatically an error. A translucent backdrop is not an opaque dialog panel. Return data and warnings; do not repair CSS automatically.

Update `factory/guides/patterns.md` and `verification.md` with this contract:

- Owned dialogs use `ui.openModal`; inline `mountAt` controls remain subject to their source ancestors. A floating sheet must not mount inside a faded article/FAB parent.
- Keep panel and backdrop separate. Apply alpha to backdrop color, not opacity on their shared parent. Specify opaque light/dark panel tokens. Bound entry animations and verify their settled state, including cancellation and reduced motion.
- Use semantic disabled state independently from source scroll fading. Do not raise opacity on a disabled control to make it appear enabled.
- Source corrections need qualified selectors, a clear active scope and cleanup. Do not rewrite source React styles repeatedly or use a document-wide opacity observer.
- When DOM/computed styles are correct but pixels remain wrong, compare applet rendering preference and native host ancestor alpha. Only that reproduction opens Android renderer work.

Reference the utility from the monorepo verification guidance, while keeping the portable factory contract usable without a Genesis checkout. Document that the utility is a maintainer tool, not an installed SDK API. Commit as `feat/(ui-diagnostics): add overlay ancestry inspection` with its own changelog.

Verify from root: `node --check tools/inspect-ui-surfaces.mjs`, `git diff --check`. Run it against the two real X containers. In a temporary local diagnostic page, compare an opaque dialog plus alpha backdrop, an ancestor at opacity .3, nested shadow hosts, a disabled control and an animated panel settling at opacity 1. Do not create repository tests or install a diagnostic applet. Expected: accurate distinctions, bounded output and no DOM mutation.

### 2. Narrow X source correction

Change `factory/applets/x.com/src/source.css` and, only if necessary for safe scoping, `source-navigation.ts`. Scope rules under `.genesis-x`, which existing activation adds only after supported signed-in layout detection and removes on disposal.

Normalize opacity to 1 with `!important` on the qualified visible enabled `[data-testid="FloatingActionButtonBase"]` and visible `[data-testid="toast"][role="alert"]`. The owning container is the target; setting only the descendant button will not fix the issue. Do not change X background colors, hit areas, z-index, handler wiring, React nodes or ordinary bookmark state. Exclude explicit hidden/inert/disabled source states and verify the observed toast exit behavior before finalizing a selector. If X uses opacity 0 as the only hidden state, use a scoped marker for the observed active state and remove it on exit instead of overriding all opacity values.

Prefer static CSS if the qualified lifecycle permits it. If an active-state marker is required, use a bounded managed watcher keyed to these two controls, with identity checks, marker removal and disposal. Do not match generated X class names. Preserve other transition properties and reduced-motion handling; eliminating the broken opacity fade for these active controls is intentional.

Keep ordinary-site recovery unchanged. Removal of `.genesis-x` must restore original source styling. Update X README Rendering with this source-opacity distinction. Commit as `feat/(x-ui): keep active floating controls opaque` with its own changelog.

Verify from `factory/applets/x.com`: `npx --no-install genesis-applet check . --json`. From root: `git diff --check`. Build a temporary bundle with the documented applet CLI, then update the existing `x-bookmarks` installation during the implementation task. Do not edit generated assets or install a second launcher entry.

### 3. Integrated qualification and handoff

Use the existing emulator and hardware preference. Capture computed-style samples and short visual sequences before/while/after scroll, over images and playing video, during bookmark toast entry and expiry, after opening/closing composer without submitting, and after switching sections and returning. Test light/dark, large text, keyboard and reduced motion. Check the actual source hit target and accessibility label remain reachable. Use disposable authorized bookmarks and remove them with read-back.

Inspect custom category sheet and a neighboring applet modal for opaque content with a deliberately translucent backdrop. Verify disabled controls, hidden elements and ordinary browsing recovery keep their intended state. If software mode is compared, restore the previous preference and report it separately; do not require it to cure the previously documented media bug.

Run the step-2 checker after final edits and `git diff --check`. Update README and the shared guidance with actual results and untested physical-device/TalkBack cases. Commit as `feat/(x-ui): record overlay qualification` with a concise changelog.

## Acceptance and limits

| Scenario | Pass condition |
| --- | --- |
| Compose and bookmark toast while timeline scrolls | Active container and ancestor opacity product is 1; no faded text/action over media. |
| Toast exits or source disables/hides a control | No ghost alert, intercepted tap or resurrected disabled control. |
| Custom sheet and backdrop | Panel remains opaque; backdrop dims the page; one modal and normal Back/focus restoration. |
| Source route or account becomes unsupported | Scoped correction disappears; ordinary source UI remains usable. |
| Another applet | No X selector or global opacity reset affects its UI. |
| Correct styles but bad pixels | Report rendering discrepancy separately with device/provider and native alpha evidence. |

Root-cause evidence is complete for the reproduced .3 opacity. A guarantee that every future website overlay stays opaque would require taking over intentional source behavior and is not the chosen design. The framework provides bounded diagnosis, an owned-overlay contract and explicit qualification gates; adapters own source-specific policy. This planning task made no runtime, applet, style or test changes.
