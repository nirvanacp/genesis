# Current specification

## Identity

Name, applet id, origins, source ids, screen ids and service ids. Manifest schema, SDK and tools versions, and the kit version from `kit.json`. Write "unknown" for anything not known.

## Product scope

The app the user asked for, its core journeys, the workflows and data to preserve, which store owns each record type, the delivery target, exclusions the user approved, and open questions.

## Defaults and overrides

| Rule id | Current choice | Origin and reason | Decision |
| --- | --- | --- | --- |
| default-platform-menu | Shell top bar and Genesis menu, accent from `shell.accent` | Factory default | |

## Routes

| Route id | Example URL | Screen or website | Loading, empty, sign-in and error | Back | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |

## Interactions

| Screen and control | Result | Intent, route, website or store | Pending and failure | Status | Evidence |
| --- | --- | --- | --- | --- | --- |

## Data

| Collection or service path | Owner | Key | Shape version | Notes |
| --- | --- | --- | --- | --- |

## Current work and verification

Next steps, blockers and known limits. Status is planned, implemented, verified, failed, blocked or deferred by the user. Record the evidence kind for each verification: static, synthetic, or device with the real website.
