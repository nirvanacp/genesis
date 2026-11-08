# Current specification

## Identity

Name, applet id, origins, context ids, screen ids and service ids. Write "unknown" for anything not known.

| Compatibility | Value |
| --- | --- |
| Manifest schema | 6 |
| Bundle format | 3 |
| Protocol | 1 |
| Adapter API | 1 |
| SDK and tools | 0.0.0 |
| Kit | `frameworkVersion` from `kit.json` |

## Product scope

The app the user asked for, its core journeys, the workflows and data to preserve, which store owns each record type, the delivery target, exclusions the user approved, and open questions.

## Defaults and overrides

| Rule id | Current choice | Origin and reason | Decision |
| --- | --- | --- | --- |
| default-platform-menu | Shell floating menu button, Genesis menu and website bar, splash accent from `shell.accent` | Factory default | |

## Routes

| Route id | Example URL | Page and screen | Context | Loading, empty, sign-in and error | Back | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Interactions

| Screen and control | Result | Action, navigation, website or store | Pending, failure and unknown | Status | Evidence |
| --- | --- | --- | --- | --- | --- |

## Data

| Collection or service path | Owner | Key | Shape version | Notes |
| --- | --- | --- | --- | --- |

## Current work and verification

Next steps, blockers and known limits. Status is planned, implemented, verified, failed, blocked or deferred by the user. Record the evidence kind for each verification: static, synthetic, or device with the real website.
