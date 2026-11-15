# Current specification

## Identity

Name, applet id, origins, context ids, screen ids and service ids. Write "unknown" for anything not known.

| Compatibility | Value |
| --- | --- |
| Manifest schema | 6 |
| Bundle format | 3 |
| Protocol | 1 |
| Page control API (`adapterApi`) | 1 |
| SDK and tools | 0.0.0 |
| Kit | `frameworkVersion` from `kit.json` |

## Product scope

The app the user asked for, its core journeys, the workflows and data to preserve, which store owns each record type, the delivery target, exclusions the user approved, and open questions.

## Defaults and overrides

| Rule id | Current choice | Origin and reason | Decision |
| --- | --- | --- | --- |
| default-platform-menu | Shell floating menu button, Genesis menu and website bar, splash accent from `shell.accent`, applet icon from `shell.icon` | Factory default | |

## Routes

The router table is in `src/routes.ts`. Any URL without a route shows the website.

| Route id | Pattern and example URL | Screen | Context | Ready reader | Loading, empty, sign-in and error | Back | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

## Page module

The module file (`build.page`, usually `src/page.ts`), each reader with its kind, key and extent, each command with the evidence it waits for, and the watches each screen opens.

## Interactions

| Screen and control | Result | Input or command, navigation, website or store | Pending, failure and unknown | Status | Evidence |
| --- | --- | --- | --- | --- | --- |

## Website features

Each feature the website offers that needs visible UI: attachments, saving, sharing, other apps, fullscreen, sign-in windows, dialogs, location, camera. Handling names the [website features](../website-features.md) recipe, or the website for the features that stay there.

| Feature and where the site offers it | Handling | Status | Evidence |
| --- | --- | --- | --- |

## Data

| Collection or service path | Owner | Key | Shape version | Notes |
| --- | --- | --- | --- | --- |

## Native feel

The [acceptance bar](../native-feel.md#acceptance-bar), each item marked verified, failed, not applicable or not checked, with the evidence and the date. Website pages shown on purpose in the core journeys: list them here or mark them in the route table.

- [ ] Cold start signed in and signed out
- [ ] Landing URLs routed or listed as website pages
- [ ] Skeleton, error, empty and stale state on every routed screen
- [ ] Details open at once
- [ ] Pressed state, busy, outcome and Undo on every control
- [ ] Back, overlays and scroll restoration
- [ ] Screen motion, no leftover copy after rapid Back
- [ ] Refresh
- [ ] Themes, 200% text, narrow width, reduced motion
- [ ] Website cue on every control that shows the website

## Current work and verification

Next steps, blockers and known limits. Status is planned, implemented, verified, failed, blocked or deferred by the user. Record the evidence kind for each verification: static, synthetic, or device with the real website.
