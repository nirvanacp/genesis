---
name: genesis-customize-applet
description: Maintain or customize an existing Genesis applet, including website selector changes, native-feeling content, React pages, applet data, and services. Use for applet behavior changes and regressions while preserving user data and the platform boundary.
---

# Customize a Genesis applet

Read [factory instructions](../../AGENTS.md), [product scope and clarification](../../guides/product-scope.md), the applet's own instructions and README, and [patterns](../../guides/patterns.md).

1. Locate the behavior in the manifest, source adapter, owned page, record repository, or backend. Preserve unrelated changes. Extend the app's product brief with the requested observable difference and neighboring journeys to preserve. Keep its stable identity, complete requested scope and working sibling apps. Do not replace a complete app request with only the newest feature.
2. Resolve material product ambiguity before affected edits. Ask if a choice would split the app, remove a core workflow, change account/store semantics or change delivery without an answer in the existing context. Do not ask again about explicit user decisions. Keep unanswered choices pending while completing independent work. Backend separation and ordinary source screens do not require separate apps.
3. For a website regression, inspect current DOM and route behavior before changing selectors. Verify stable content keys, recycled nodes, and the actual clickable controls. Do not guess from an old screenshot or copy another site's selectors.
4. Check [SDK reference](../../guides/sdk-reference.md) before adding a dependency on a capability. An applet content change should stay in the applet. If the platform is at fault, isolate a reproduction and describe the general capability fix separately. Keep the requested workflow blocked rather than redefining it as excluded. Follow existing platform authorization when provided.
5. Keep mounts idempotent, dispose per-item effects on watcher leave, and reject stale async results. Preserve source login/forms and nested links. Keep loading, empty, error, and success states distinct. Do not add a second navigation bar over a manifest shell. Hide source navigation only when equivalent navigation is usable; restore it if adaptation fails.
6. For data changes, read [services and data](../../guides/services-and-data.md). Preserve applet identity, collection keys, and data authority unless migration is explicitly part of the task. Never reset a database to make a change appear successful.
7. Verify the real changed journey and neighboring navigation/cleanup flows using [verification](../../guides/verification.md). Keep preview packages off the everyday launcher and preserve their data during supported cleanup. Record routes, real versus synthetic providers, and device/provider actually exercised. Update applet guidance and the governing workspace's changelog. Report core blocked or failed flows as unfinished.

Deliver the requested behavior, its plain-language implementation, checks, and remaining limitations. Use the verification skill for an extended diagnosis. Do not create or modify test files without a request for coverage.
