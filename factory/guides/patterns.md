# Applet implementation patterns

Use the [isolated applet architecture](isolated-applets.md), [SDK reference](sdk-reference.md) and [factory instructions](../AGENTS.md). Current applets use an owned foreground and a hidden source adapter. Website DOM is an extraction input, not the layout users interact with.

Separate applet modules for extraction, model validation, owned screen rendering, source read/navigation commands, repositories and backend calls. Shared platform modules contain generic lifecycle/capability behavior only. Reuse an abstraction when several real adapters need it, not before.

Use stable content IDs and bounded managed watchers. Revalidate DOM identity, route, account and operation sequence after async work. Dispose observers, subscriptions and listeners. Never treat missing selectors as an empty page. Extract the smallest valid model; do not clone or transfer a live website tree, arbitrary HTML, cookies or credentials.

Mount React only in owned roots. Return `mountReact` for initial top-level layout readiness. For synchronous modal callbacks use `createRoot`, render, and a returned unmount. Use `ui.openModal` for one accessible owned dialog, with an explicit Close action and native Back support. Native shell owns primary navigation and insets. Keep modal panels opaque in both themes.

Publish loading/ready/empty/auth/challenge/unsupported/error separately. Render initial local UI before remote work. Only a successful read can produce an empty collection. Preserve confirmed content through failed same-route refreshes, show freshness and retry, and prevent mutations against stale account/source state. Backend receipts/revision checks remain authoritative for uncertain writes.

Keep login, upstream forms, account changes, uploads and protected media in the framework website provider. Open external links through the same provider. Never make source UI visible after extraction failure. An unknown route has a usable owned state and an explicit Open website action. Closing the provider returns to the owned opener and revalidates identity.

Use semantic buttons/links, visible keyboard focus, scalable text and at least 48 CSS-pixel applet touch targets, verified on Android. Support 200% text, narrow widths, keyboard appearance, TalkBack, light/dark and reduced motion. Use text/status as well as color. Keep long text wrapping and list windows bounded. An internal screen and its service remain part of one stable applet identity.

Multiple sources share records through foreground storage/services. Each adapter sees only its own website. A shared foreground coordinates visits and renders accepted records; this does not grant cross-origin DOM access, independent accounts, a permanent background process or offline backend authority.
