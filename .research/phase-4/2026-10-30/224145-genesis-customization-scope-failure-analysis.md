# Genesis customization scope failure analysis

Scope: the first phase-4 X implementation and the portable `factory/` authoring guidance. This assessment uses the conversation, earlier plans, implementation records, manifests and Android qualification report. It explains observable decisions, not an inaccessible internal model process.

## What actually happened

The user requested a customized X application alongside the working HN app, with daily navigation and independent categorized bookmarking. The real implementation kept one X applet ID, `x-bookmarks`, with internal source contexts and a packaged library. A second installed entry, `x-ui-qualification`, was a synthetic diagnostic applet. It was not a second production X client, but leaving it in the launcher made the delivered experience look fragmented. Existing External/Hybrid diagnostics added further clutter.

The [qualification report](../../../.reports/phase-4/2026-10-30/211400-genesis-x-android-verification.md) documents incomplete real authentication, a synthetic UI preview and the extra installed entry. The agent implemented useful components but did not establish the complete requested X experience. Keeping X outside the default bundle pending acceptance was a sensible intermediate safeguard; treating that state as a final implementation handoff was the mistake.

## Decision failures and contributing guidance

| Failure | Evidence and responsibility | Preventive instruction |
| --- | --- | --- |
| The new feature displaced the application outcome | Plans and component commits concentrated on categories/platform APIs; integrated source acceptance remained incomplete. The agent should have preserved the user's complete-client intent throughout. | Carry a brief and required journey table through implementation and final verification. |
| Diagnostic installation became product clutter | The report records both X and X UI preview in the launcher and no completed cleanup. This was the agent's delivery decision. | Plan diagnostic isolation/cleanup before installing; verify intended launcher entries at handoff. |
| Component progress became an endpoint | Backend/static checks and synthetic UI evidence were real, but did not establish authenticated X behavior. The final handoff acknowledged gaps yet still led with implemented components. | Separate implementation from verification; core blocked journeys mean incomplete app acceptance. |
| Material assumptions lacked a clear decision rule | Original guidance said to ask only when needed or when a choice could not be inferred. It did not list product-impact triggers or require pending decisions to stay unresolved. | Ask before unresolved app boundaries, core-flow exclusions, account/store semantics or delivery substitutions. |
| Reference status and old versions could mislead an agent | Applet instructions called X an inactive prototype; the build skill prescribed tools 0.2.0 despite the current 0.3.0 contract. | Check actual versions/status and give latest user intent precedence over historical sample limitations. |

The original request did not need a question about whether X should be one app. That intent was already available. More questioning alone would not fix this incident. The needed question would have concerned a material proposed compromise, such as substituting a partial deliverable after an access/capability block. The agent should not have chosen that compromise silently or asked the user to repeat settled requirements.

The existing factory guidance correctly emphasized SDK boundaries, managed DOM ownership, stable IDs and honest device evidence. Those rules were retained. They needed a matching product-scope contract, concrete ambiguity rules and integrated delivery checks. Instructions can reduce recurrence but cannot guarantee a complete one-prompt build when access or capabilities are missing.

## Changes made

Updated `factory/AGENTS.md`, `factory/applets/AGENTS.md`, all three authoring skills, the factory/skills indexes and the getting-started, patterns, services/data and verification guides. Added [product scope and clarification](../../../factory/guides/product-scope.md), including a compact brief, acceptance-flow table, question triggers, access-block handling and manual reasoning examples. These are portable and do not depend on internal monorepo reports.

No X/HN code, package selection, platform capability or installed-device state changed in this task. The current two-app implementation plan remains separate future work. Verification of documentation/export is recorded in the accompanying development changelog; no model-behavior evaluation or permanent test suite was added.
