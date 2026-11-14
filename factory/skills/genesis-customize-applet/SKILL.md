---
name: genesis-customize-applet
description: Change an existing Genesis applet's screens, routes, readers, commands or data while preserving its identity, data and explicit choices.
---

# Customize a Genesis applet

Read [factory instructions](../../AGENTS.md), [rules](../../guides/rules.md), [defaults](../../guides/defaults.md), [records](../../guides/applet-records.md). Use [product scope](../../guides/product-scope.md), [SDK reference](../../guides/sdk-reference.md), [page control](../../guides/page-control.md), [page modules](../../guides/page-modules.md), [frameworks](../../guides/frameworks.md), [navigation](../../guides/navigation.md), [interactions](../../guides/interactions.md), [website features](../../guides/website-features.md), [presentation](../../guides/presentation.md), [motion](../../guides/motion.md), [patterns](../../guides/patterns.md), [design](../../guides/design.md), [services and data](../../guides/services-and-data.md) and [verification](../../guides/verification.md) as each step needs them.

1. Read `.specs/current.md`, the relevant decisions, `applet.json`, `src/routes.ts`, the README and the code you will change. Create missing records from what the code actually does.
2. Turn the request into observable journeys. Keep the applet id, existing features, stored data and the user's explicit choices. If the request is meant for every applet, follow [shared intent](../../guides/rules.md#shared-intent). When it touches attachments, saving, sharing, other apps, fullscreen, sign-in windows, dialogs or location, such as "let me post with photos", build it in the applet with its recipe from [website features](../../guides/website-features.md) and update the spec's Website features table.
3. Inspect the current website page before changing a reader, a read specification or a command. Change the route, reader, model, screen and interaction inventory together. Keep watch ids and record keys stable. Keep record keys and shapes readable; migrate only when the user asked for it.
4. Apply defaults only where they are relevant and not overridden. Give new screens and controls the applet's existing motion and feedback, or those in [motion](../../guides/motion.md) when it has none. Keep Back, scroll restoration, the return from the website with Done and keyboard-safe sheets working.
5. Run `npm run check` and `npm run build`, install, and walk the changed journeys and their neighbors. Start services only when the user asks.
6. Update the current spec and a change record, and commit. Report anything unverified.

## Publishing

Publish only when the user asks for a release. Follow [publishing](../../guides/publishing.md): raise the version with `npm version <patch|minor|major> --no-git-tag-version`, run `genesis-applet publish` and `publish --verify`, commit `published/` with the version change, then run `genesis-applet release`. Never push the tag, never move or reuse one, and never change a published applet's id; tell the user to push.
