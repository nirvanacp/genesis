---
name: genesis-verify-applet
description: Verify a Genesis applet against its current spec on a device and report the evidence for each requirement.
---

# Verify a Genesis applet

Read [factory instructions](../../AGENTS.md), [rules](../../guides/rules.md), [defaults](../../guides/defaults.md), [records](../../guides/applet-records.md). Use [product scope](../../guides/product-scope.md), [SDK reference](../../guides/sdk-reference.md), [page control](../../guides/page-control.md), [page modules](../../guides/page-modules.md), [frameworks](../../guides/frameworks.md), [navigation](../../guides/navigation.md), [interactions](../../guides/interactions.md), [presentation](../../guides/presentation.md), [motion](../../guides/motion.md), [patterns](../../guides/patterns.md), [design](../../guides/design.md), [services and data](../../guides/services-and-data.md) and [verification](../../guides/verification.md) as each step needs them.

1. Read the current spec's requirements, route and interaction inventories, and the installed revision and its compatibility status from `genesis-applet dev status`.
2. Run `npm run check` and `npm run build`; `check` also reports an applet built for another SDK. Do not add test files unless the user asked for test coverage. Separate failures that existed before the change.
3. From the Genesis launcher, walk each journey: pending state, content, action, outcome, stored result and Back. Exercise sign-in, empty and failure states, the presentation scenarios (stale Back, View website and Done, pages without a route, other origins, the readiness deadline), resume and Reload applet, both themes and large text. Check the motion scenarios: screen changes, loaders, feedback after each action, and reduced motion. When a journey needs an account and the device is signed out, sign in with [test accounts](../genesis-test-accounts/SKILL.md), and with two of its numbered accounts when the applet works with several accounts on one site.
4. Do not post, message, vote, follow, purchase or change account settings unless the user asked. A report-only request does not authorize fixes.
5. When something fails, find the owner (reader or command, router, screen, store, service, website or platform) from the route status, the watch status, the error code and the input outcome.
6. Report each requirement as implemented, verified, failed, blocked or deferred, with the evidence kind. When the work changed files, record the outcome in the current spec and the change record.
