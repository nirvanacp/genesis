---
name: genesis-customize-applet
description: Change an existing Genesis applet's screens, adapter pages, actions or data while preserving its identity, data and explicit choices.
---

# Customize a Genesis applet

Read [factory instructions](../../AGENTS.md), [rules](../../guides/rules.md), [defaults](../../guides/defaults.md), [records](../../guides/applet-records.md). Use [product scope](../../guides/product-scope.md), [SDK reference](../../guides/sdk-reference.md), [adapters](../../guides/adapters.md), [navigation](../../guides/navigation.md), [interactions](../../guides/interactions.md), [presentation](../../guides/presentation.md), [motion](../../guides/motion.md), [patterns](../../guides/patterns.md), [design](../../guides/design.md), [services and data](../../guides/services-and-data.md) and [verification](../../guides/verification.md) as each step needs them.

1. Read `.specs/current.md`, the relevant decisions, `applet.json`, the README and the code you will change. Create missing records from what the code actually does.
2. Turn the request into observable journeys. Keep the applet id, existing features, stored data and the user's explicit choices. If the request is meant for every applet, follow [shared intent](../../guides/rules.md#shared-intent).
3. Inspect the current website page before changing an adapter page or region. Change the route, adapter page, model, screen and interaction inventory together. Keep region keys stable. Keep record keys and shapes readable; migrate only when the user asked for it.
4. Apply defaults only where they are relevant and not overridden. Give new screens and controls the applet's existing motion and feedback, or those in [motion](../../guides/motion.md) when it has none. Keep Back, scroll restoration, the return from the website with Done and keyboard-safe sheets working.
5. Run `npm run check` and `npm run build`, install, and walk the changed journeys and their neighbors. Start services only when the user asks.
6. Update the current spec and a change record, and commit. Report anything unverified.
