---
name: genesis-customize-applet
description: Change an existing Genesis applet's screens, routes, readers, commands or data while preserving its identity, data and explicit choices.
---

# Customize a Genesis applet

Read [factory instructions](../../AGENTS.md), [rules](../../guides/rules.md), [defaults](../../guides/defaults.md), [records](../../guides/applet-records.md) and [native feel](../../guides/native-feel.md). Read the other guides as each step needs them; the [kit README](../../README.md#read-this-first) lists them by need.

1. Read `.specs/current.md`, the relevant decisions, `applet.json`, `src/routes.ts`, the README and the code you will change. Create missing records from what the code actually does.
2. Turn the request into observable journeys. Keep the applet id, existing features, stored data and the user's explicit choices. If the request is meant for every applet, follow [shared intent](../../guides/rules.md#shared-intent). When it touches attachments, saving, sharing, other apps, fullscreen, sign-in windows, dialogs or location, such as "let me post with photos", build it in the applet with its recipe from [website features](../../guides/website-features.md) and update the spec's Website features table.
3. Inspect the current website page before changing a reader, a read specification or a command. Change the route, reader, model, screen and interaction inventory together. Keep watch ids and record keys stable. Keep record keys and shapes readable; migrate only when the user asked for it.
4. Apply defaults only where they are relevant and not overridden. Give new screens and controls the applet's existing foundation, or add the [UI kit](../../guides/ui-kit.md) when it has none. A new screen gets all of its [states](../../guides/native-feel.md#screen-states) and its own skeleton, a new destination opens with `navigate({ url })`, a new route covers each URL it lands on, and every new control gets its [feedback](../../guides/native-feel.md#taps-and-actions). Keep Back, scroll restoration, the return from the website with Done and keyboard-safe sheets working.
5. Run `npm run check` and `npm run build`, install, and walk the changed journeys and their neighbors, with the [native feel scenarios](../../guides/verification.md#native-feel-scenarios) for the changed screens. Update the acceptance bar items the change touched. Start services only when the user asks.
6. Update the current spec and a change record, and commit. Report anything unverified.

## Publishing

Publish only when the user asks for a release. Follow [publishing](../../guides/publishing.md): raise the version with `npm version <patch|minor|major> --no-git-tag-version`, run `genesis-applet publish` and `publish --verify`, commit `published/` with the version change, then run `genesis-applet release`. Never push the tag, never move or reuse one, and never change a published applet's id; tell the user to push.
