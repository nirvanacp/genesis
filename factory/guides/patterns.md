# Applet implementation patterns

Use [SDK signatures](sdk-reference.md) and [factory instructions](../AGENTS.md). These patterns apply to all applets; HN's entities and visual design are examples, not platform rules.

Start with the application's journeys under [product scope and clarification](product-scope.md). Map components to that experience. Separate implementation ownership does not require separate product apps, and a sample applet's limitations do not become requirements for the new app.

## Respect the running website

Inspect the real DOM and canonical URLs. Prefer stable IDs and semantic relationships to generated class names, position, or translated labels. Put extraction and URL validation in a focused module. Return no record when required identity is missing. A selector that matches a row is not proof that it represents a supported item.

Keep the source application's DOM and forms alive. Do not clone its whole tree, replace its application root, copy login tokens, or reconstruct POST requests without a separately justified contract. Source cookies remain in WebView. Read only the fields needed by the requested applet feature; do not collect unrelated account data.

Use `watchElements` for dynamic content. Store per-binding resources in a map keyed by `binding.id`. On `leave`, mark work inactive, remove queued work, and dispose mounts/listeners. On `update`, re-extract the record and handle replaced child anchors. Use a stable record ID for `contentKey`; use a canonical URL only if the site has no record ID.

For every delayed read or click, require the context to be active, the element to be connected, the extracted ID to match the original content key, and the operation's sequence number to still be current. An abort signal alone does not detect a recycled DOM row. Limit concurrent reads and coalesce duplicate requests; the SDK permits at most 32 pending calls across a document.

Manage custom listeners with an abort signal or explicit removal. Clear timers and subscriptions. Register cleanup before starting asynchronous work. Global source classes/attributes need deliberate restoration only if the current value still belongs to your change; arbitrary source behavior cannot be fully undone. Genesis's original-page reload remains the recovery path.

## Owned UI and React

`ui.mountAt` creates a managed owned host, normally with Shadow DOM. Put component CSS in its `css` option. Use `styles.add` for source-document changes. Put CSS directly inside the owned root for a packaged React page. Shadow DOM is a style/ownership boundary, not a complete security boundary.

For top-level pages, return `mountReact(context, container, <Page />)`. Keep hooks and applet business logic in components. Render a skeleton or “Loading” state immediately; fetch data in an effect and check cancellation before setting state. Unmount releases subscriptions and event listeners. A local page can still require connectivity for its records.

For inline React controls and modals, the render callback is synchronous: create a React root there, call `root.render`, and return `() => root.unmount()`. Do not return the async `mountReact` helper from that callback. Provide an explicit Close action for modals, preserve focus, and let the SDK handle native dismissal. Do not install a competing Back handler.

Prefer real buttons and links. A clickable row must not intercept its child links, buttons, text selection, modified clicks, or Shadow DOM controls; inspect `event.composedPath()`. Validate extracted destinations before assigning `href`. Avoid rendering raw website/service strings with `innerHTML` or React `dangerouslySetInnerHTML`.

## Several websites in one applet

Give each website a source declaration and entry adapter. Multiple sources may also represent different sections of one website, as HN does. These are explicit destinations, not tabs you can query from arbitrary JavaScript.

Example design: a reading app has sources `news` and `journal` plus page `saved`. Each source extracts `{sourceId,recordId,title,url,capturedAt}` and saves only the selected record into the applet's `saved-items` collection or backend. Keys include source identity, such as `news:123`, so unrelated sites' IDs cannot collide. The Saved page renders those records and opens their source with `context.sources.open(record.sourceId, record.url)` after validating that source/origin combination.

The workflow is sequential: visit source, extract/save, switch to the combined page, read records, then open another source. A shared namespace lets source documents and local pages coordinate persisted data. It does not grant cross-origin DOM access. Do not promise parallel scraping, hidden background jobs, an always-running applet process, or synchronized snapshots of several live sites. Those need a new platform capability or an explicitly operated backend.

Maintain data authority and per-source freshness timestamps. Show partial results when one source is unavailable. A stale extracted record is still a saved record, not a live claim about the upstream website. Website sessions may share the host WebView cookie store; do not promise separate accounts per source or per applet.

## Make the application behave coherently

Declare native sections in `shell`; do not add a duplicate applet tab bar. Genesis reserves native chrome space. Avoid adding the same bottom inset twice. Customized routes use app navigation; external pages use ordinary reader controls with their actual origin. Keep unsupported same-origin routes usable through ordinary presentation and preserve original-page recovery.

Only hide a source navigation control once its equivalent is usable in the adapted experience. If required anchors or account/layout detection fail, restore source navigation rather than leaving an empty shell. Authentication, settings and other protected source routes remain part of the same application's journey even when they receive no customization binding. Verify their entry and return separately from external-reader links.

Treat each screen as loading, loaded-empty, loaded-content, refreshing, or error. Keep existing content during a failed refresh and retain user input. Confirm writes before showing success. Native navigation must remain usable during data errors. Refresh retained pages through `onFocus`; persist drafts explicitly because eviction and process death do not serialize arbitrary JavaScript state.

For applet content, use consistent spacing, readable type, responsive widths, and visible keyboard focus. As a project design target, aim for 48 CSS-pixel interactive hit areas in WebView and verify their on-device size; native Android controls use 48 dp. Support 200% text, narrow screens, keyboard appearance, light/dark colors, and reduced motion. Label icon buttons and statuses for TalkBack; do not convey state by color alone. Avoid fixed-height text containers and horizontal overflow from long titles or code.

These are portable applet acceptance requirements. The Genesis repository's Apple design skill informs general accessibility/layout principles; Android Back, Android sizing, HTML semantics, and the current host contract govern implementation. No Apple-only runtime or component library is required by this kit.

## Opaque panels and source compositing

Use `ui.openModal` for floating owned sheets. `mountAt` inherits source ancestor compositing even inside Shadow DOM. Put a translucent backdrop and an opaque light/dark panel on separate elements; fade the backdrop color rather than their shared parent. Verify settled and cancelled animations, reduced motion, hidden controls and semantic disabled state. Never force every source element opaque. Source corrections need qualified selectors, an active scope and cleanup.
