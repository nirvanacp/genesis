---
name: genesis-customize-applet
description: Maintain or customize an existing Genesis applet, including website selector changes, native-feeling content, React pages, applet data, and services. Use for applet behavior changes and regressions while preserving user data and the platform boundary.
---

# Customize a Genesis applet

Read [factory instructions](../../AGENTS.md), the applet's own instructions and README, and [patterns](../../guides/patterns.md).

1. Locate the behavior in the manifest, source adapter, owned page, record repository, or backend. Preserve unrelated changes. Establish what currently works and the requested observable difference.
2. For a website regression, inspect current DOM and route behavior before changing selectors. Verify stable content keys, recycled nodes, and the actual clickable controls. Do not guess from an old screenshot or copy another site's selectors.
3. Check [SDK reference](../../guides/sdk-reference.md) before adding a dependency on a capability. An applet content change should stay in the applet. If the platform is at fault, isolate a reproduction and describe the general capability fix separately.
4. Keep mounts idempotent, dispose per-item effects on watcher leave, and reject stale async results. Preserve source login/forms and nested links. Keep loading, empty, error, and success states distinct. Do not add a second navigation bar over a manifest shell.
5. For data changes, read [services and data](../../guides/services-and-data.md). Preserve applet identity, collection keys, and data authority unless migration is explicitly part of the task. Never reset a database to make a change appear successful.
6. Verify the changed flow and its neighboring navigation/cleanup flows using [verification](../../guides/verification.md). Record routes and device/provider actually exercised. Update applet guidance and the governing workspace's changelog.

Deliver the requested behavior, its plain-language implementation, checks, and remaining limitations. Use the verification skill for an extended diagnosis. Do not create or modify test files without a request for coverage.
