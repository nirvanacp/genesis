---
name: genesis-build-applet
description: Build a new Genesis applet from a website address and a product request, using SDK 0.0 and the factory guides.
---

# Build a Genesis applet

Read [factory instructions](../../AGENTS.md), [rules](../../guides/rules.md), [defaults](../../guides/defaults.md), [records](../../guides/applet-records.md). Use [product scope](../../guides/product-scope.md), [SDK reference](../../guides/sdk-reference.md), [adapters](../../guides/adapters.md), [navigation](../../guides/navigation.md), [interactions](../../guides/interactions.md), [presentation](../../guides/presentation.md), [motion](../../guides/motion.md), [patterns](../../guides/patterns.md), [design](../../guides/design.md), [services and data](../../guides/services-and-data.md) and [verification](../../guides/verification.md) as each step needs them.

1. Resolve the website's canonical `https://` origin and inspect its mobile pages, account pages, forms, loading and failure states. Do not submit anything while inspecting.
2. Run `genesis-applet create <name> --origin <origin>`, where `<name>` is a short product name for the applet, never the website's domain; it becomes the directory and the applet id. Write the product brief, journeys and design reference in `.specs/current.md`. Ask only about unresolved choices that change the app.
3. Declare origins, contexts (at most three), routes and screens in `applet.json`. Route only the pages the applet customizes; sign-in, editors and other pages without a route show as the website in the same session.
4. Write one adapter page per kind of routed page, with positive `ready` evidence, regions with stable unique keys, and extents for every node a read touches. Write the screens with loading, stale, empty and error states, skeletons and shared tokens, and give them the motion and feedback in [motion](../../guides/motion.md) from the start: directional screen changes, pressed states, optimistic toggles, toasts with Undo, delayed loaders and reduced motion. Add desired-state actions with evidence, and storage or a service for applet data.
5. Run `npm run check` and `npm run build`, install with `genesis-applet dev install`, and walk the journeys and the presentation scenarios on the device. Maintain service start commands but start services only when the user asks.
6. Update the current spec, decisions, README and a change record, and commit. Report unmet journeys as failed, blocked or deferred.

## Publishing

Publish only when the user asks for a release. Follow [publishing](../../guides/publishing.md): raise the version with `npm version <patch|minor|major> --no-git-tag-version`, run `genesis-applet publish` and `publish --verify`, commit `published/` with the version change, then run `genesis-applet release`. Never push the tag, never move or reuse one, and never change a published applet's id; tell the user to push.
