---
name: genesis-build-applet
description: Build a new Genesis applet from a website address and a product request, using SDK 0.0 and the factory guides.
---

# Build a Genesis applet

Read [factory instructions](../../AGENTS.md), [rules](../../guides/rules.md), [defaults](../../guides/defaults.md), [records](../../guides/applet-records.md). Use [product scope](../../guides/product-scope.md), [SDK reference](../../guides/sdk-reference.md), [navigation](../../guides/navigation.md), [interactions](../../guides/interactions.md), [patterns](../../guides/patterns.md), [design](../../guides/design.md), [services and data](../../guides/services-and-data.md) and [verification](../../guides/verification.md) as each step needs them.

1. Resolve the website's canonical `https://` origin and inspect its mobile pages, account pages, forms, loading and failure states. Do not submit anything while inspecting.
2. Run `genesis-applet create <directory> --origin <origin>`. Write the product brief, journeys and design reference in `.specs/current.md`. Ask only about unresolved choices that change the app.
3. Declare origins, sources (at most three), routes and screens in `applet.json`. Use website routes for sign-in, editors and other pages the user operates directly, and an `unsupported` screen for the rest.
4. Write one extractor per adapted route, returning `null` until the page is recognized. Write the screens with every status, skeletons and shared tokens. Add intents for actions and storage or a service for applet data.
5. Run `npm run check` and `npm run build`, install with `genesis-applet dev install`, and walk the journeys on the device. Maintain service start commands but start services only when the user asks.
6. Update the current spec, decisions, README and a change record, and commit. Report unmet journeys as failed, blocked or deferred.
