# Applet implementation patterns

Read [explicit navigation](navigation.md) for schema-3/API-4 URL coverage, website actions, SDK controls and Return behavior. SDK/tools 0.5.0 use the host policy for new applets. Schema-2/API-3 examples below remain legacy compatibility reference wherever they use direct `webViews.open`; migrate those calls through resolve/activate or the navigation controls before using API 4.

Use the [isolated applet architecture](isolated-applets.md), [SDK reference](sdk-reference.md) and [factory instructions](../AGENTS.md). Current applets use an owned foreground and a hidden source adapter. Website DOM is an extraction input, not the layout users interact with.

Follow [design and interaction fidelity](design.md) before choosing an applet's appearance. Unless the user provides a detailed alternative, preserve the source product's mobile identity, aiming for its native app conventions and using its live mobile website where native details are uncertain. Rebuild that design in owned code. Keep the native primary navigation, compare connected screens, and apply the same tokens to applet-only features. Verify every changed interaction separately from visual comparison.

Separate applet modules for extraction, model validation, owned screen rendering, source read/navigation commands, repositories and backend calls. Shared platform modules contain generic lifecycle/capability behavior only. Reuse an abstraction when several real adapters need it, not before.

Use stable content IDs and bounded managed watchers. Revalidate DOM identity, route, account and operation sequence after async work. Dispose observers, subscriptions and listeners. Never treat missing selectors as an empty page. Extract the smallest valid model; do not clone or transfer a live website tree, arbitrary HTML, cookies or credentials.

Mount React only in owned roots. Return `mountReact` for initial top-level layout readiness. For synchronous modal callbacks use `createRoot`, render, and a returned unmount. Use `ui.openModal` for one accessible owned dialog, with an explicit Close action and native Back support. Native shell owns primary navigation and insets. Keep modal panels opaque in both themes.

Publish loading/ready/empty/auth/challenge/unsupported/error separately. Render initial local UI before remote work. Only a successful read can produce an empty collection. Preserve confirmed content through failed same-route refreshes, show freshness and retry, and prevent mutations against stale account/source state. Backend receipts/revision checks remain authoritative for uncertain writes.

Keep login, upstream forms, account changes, uploads and protected media in the framework website provider. Open external links through the same provider. Never make source UI visible after extraction failure. An unknown route has a usable owned state and an explicit Open website action. Closing the provider returns to the owned opener and revalidates identity.

Use semantic buttons/links, visible keyboard focus, scalable text and at least 48 CSS-pixel applet touch targets, verified on Android. Support 200% text, narrow widths, keyboard appearance, TalkBack, light/dark and reduced motion. Use text/status as well as color. Keep long text wrapping and list windows bounded. An internal screen and its service remain part of one stable applet identity.

Multiple sources share records through foreground storage/services. Each adapter sees only its own website. A shared foreground coordinates visits and renders accepted records; this does not grant cross-origin DOM access, independent accounts, a permanent background process or offline backend authority.

## Loading is an unresolved observation

HTML document completion does not prove that a website has rendered its content. Missing selectors, missing progress indicators and temporarily empty structures remain `loading` on a supported route. Only validated content is `ready`; an affirmative empty marker or validated completed empty structure is `empty`. Explicit sign-out, challenge, upstream error and unsupported-content evidence produce their own outcomes. A route match grants extraction permission, not readiness.

The host bounds each unresolved loading interval at 15 seconds and preserves real failures until a new visit or affirmative recovery. Repeated observations do not extend that deadline. Source activation runs without animation frames; it is separate from content readiness. The foreground mounts immediately with its destination shell, keeps navigation usable and shows a loader until valid content arrives. Do not debounce all errors, automatically open the website, or ask users to Retry during ordinary initialization.

Use optional `error.code` and `error.retryable` with fixed safe copy for real failures. The host assigns `error.origin`. Never use raw exception text, page bodies or a button label as error copy. Legacy message-only publications remain compatible. Retain prior content only for the same destination/tab and a currently permitted account; an empty model shell is not prior content. Source Retry and explicit website presentation are separate actions.

A source observer should follow this order, using site-specific functions implemented from inspected DOM:

```ts
function observe() {
  const problem = inspectExplicitProblem();
  if (problem) return context.source.publish(problem);
  const model = extractValidatedDestination();
  if (model) return context.source.publish({state:'ready', data:model});
  const empty = inspectConfirmedEmpty();
  if (empty) return context.source.publish({state:'empty', data:empty});
  return context.source.publish({state:'loading'});
}
```

The function names above are illustrative applet helpers, not SDK APIs. Do not replace them with guessed selectors. Managed observations must continue across DOM mutations and be disposed with the source. Route inventories must list content identity, readiness, empty and failure evidence. An unimplemented starter reports `ADAPTER_NOT_IMPLEMENTED`; that deliberate development placeholder is not the pattern for normal missing content.

Verify transitions with recordings or sanitized traces on the actual delivered host. Exercise HTML completion before SPA content, repeated warm/cold navigation, same-document tabs, source/provider return, offline recovery and delayed content on both sides of the deadline. Check that ordinary loading never paints Retry or unsupported recovery. Inspect actual errors separately. A settled screenshot or typecheck does not establish transition correctness.

## Skeletons are the default pending UI

Use neutral gray, content-shaped skeletons for initial source navigation, source/account verification, empty-yet-pending libraries, filters, pagination and dialog reads. Match the destination's structure: avatar/title/text rows for a social feed, title/metadata rows for news, a banner/avatar for profiles and checkbox/field rows for forms. Keep known headings, navigation, Cancel and safe controls available. Reserve expected space to reduce layout jumps. Static shapes are the default; avoid mandatory shimmer and honor reduced motion if animation is added. Provide neutral light/dark colors rather than tinting placeholders with the brand accent.

Do not show visible "Loading…", "Verifying…", "Updating…" or "Working…" as the normal wait presentation. Use a compact placeholder inside a disabled action while it runs; retain useful existing content during refresh and show placeholders only for missing/appending content. Do not replace established content or user-entered drafts with a whole-screen skeleton. Unknown images may use a neutral backing. Real errors, sign-in requirements, empty results, confirmations and uncertain-write explanations must remain readable; skeletons never conceal them or extend loading deadlines.

Expose one concise pending status to assistive technology with `role="status"` and `aria-busy`, using visually hidden status text or an accessible label. Hide decorative shapes with `aria-hidden`, do not make them focusable, and remove them when the actual operation settles. Do not announce every row or repeated observation. Keep Close/Back working during reads and preserve existing mutation/receipt safeguards. Use known progress information when it is meaningful; visually hidden loading status is allowed.

React and vanilla creator projects include this treatment from the first render. Authors must adapt the placeholder shape to their route inventory, including owned pages and dialogs, without requiring the user to ask for it. Verification must inspect a pending frame as well as final content, actual read failures and return/cancellation, light/dark and enlarged text. Static component previews may exercise forced pending states, but must be labeled separately from real source/service checks.


## Interaction contract

Follow [actions and navigation](interactions.md). Inventory buttons, local menus, source mutations and protected editor workflows separately from URL coverage. Opening a containing page cannot qualify the action its icon promises. Source actions require current identity, observed results and uncertainty handling. SDK 0.5.1 adds optional native sharing on capable API-4 hosts.
