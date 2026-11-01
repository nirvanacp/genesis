# Applet rules and choices

Read this before building or customizing. A user's product requirement describes their requested app. A Genesis requirement describes the contract that makes it work. Classify each separately.

| Class | Meaning | Response |
| --- | --- | --- |
| Requirement | Platform compatibility, correctness/data boundary or mandatory authoring/verification obligation | Follow it. Explain contradictions and ask for viable alternatives before dependent implementation. Consent cannot create an unavailable capability. |
| Default | Initial product/UI behavior absent another choice | Apply automatically. An explicit compatible alternative wins, even if brief. Record the override. |
| Best practice | Preferred maintainable engineering method | Follow unless explicitly overridden compatibly. Record material departures without routine approval. |

Read the latest prompt, local instructions, `.specs/current.md`, relevant decisions and actual code. Explicit choices survive kit updates. A vague request to improve appearance does not revoke them. Split mixed rules into visual preference and correctness obligation.

## Rule index

| ID | Class and obligation | Detailed owner |
| --- | --- | --- |
| requirement-compatibility | Requirement: installed SDK/tools, schema and host must agree; public imports only | [SDK reference](sdk-reference.md) |
| requirement-isolation | Requirement: hidden source, validated bounded models, owned foreground; no source pixels/HTML fallback | [Isolation](isolated-applets.md) |
| requirement-route-policy | Requirement: exact origins, declared routes, host decisions and explicit website intent | [Navigation](navigation.md) |
| requirement-loading-evidence | Requirement: affirmative ready/empty/gating/failure evidence; missing selectors remain pending | [Patterns](patterns.md#loading-is-an-unresolved-observation) |
| requirement-real-interactions | Requirement: controls perform named actions; current account/entity/visit identity, observed outcomes and uncertainty | [Interactions](interactions.md) |
| requirement-data-integrity | Requirement: stable IDs, explicit migrations, authoritative stores, credentials outside source, no blind uncertain-write retries | [Services/data](services-and-data.md) |
| requirement-accessible-navigation | Authoring requirement: semantic labels, focus, readable contrast, scalable text, usable touch targets and Back/Return | [Design](design.md) |
| requirement-records | Authoring requirement: maintain current applet intent, decisions and change outcomes | [Records](applet-records.md) |
| requirement-honest-verification | Verification requirement: distinguish static/synthetic/live evidence and preserve blocked journeys; no unrequested account/social/purchase mutations | [Verification](verification.md) |
| requirement-operator-startup | Workflow requirement: maintain start scripts but start services only when explicitly asked | [Services/data](services-and-data.md#local-startup-and-port-assignments) |
| default-* | Initial UI/navigation choices and compatible exceptions | [Defaults](defaults.md) |
| practice-focused-modules | Best practice: separate extraction, validation, UI, repositories and backend calls; abstract only after real reuse | [Patterns](patterns.md) |
| practice-bounded-work | Best practice: bounded list work, centralized subscriptions and shared components/tokens | [Patterns](patterns.md), [design](design.md) |
| practice-small-dependencies | Best practice: smallest useful dependency and capability set without reducing requested scope | [Getting started](getting-started.md) |
| practice-scoped-diagnosis | Best practice: inspect evidence, isolate owner, verify changed journeys and keep concise current records | [Verification](verification.md) |

## Requirement conflicts and questions

Name the requested behavior, rule, concrete consequence and two or three feasible choices. Example: "Showing the original page while loading would break hidden-source isolation. Should I keep an owned loading screen, or add an explicit Open website action with Return?" Offer a separate platform capability request if necessary. Never offer to ignore a runtime constraint. An explicit process waiver cannot waive data or runtime guarantees.

Ask only for unresolved material product intent, requirement contradictions, or necessary access/fallback choices. Choose selectors, module names and ordinary spacing yourself. Continue independent work while waiting. Silence is not approval. Missing login/tools/device access leaves affected acceptance blocked; it does not approve a reduced app or synthetic replacement.

## Shared intent during customization

Judge the whole request for common intent such as "every applet should do this" or "make this standard whenever we build apps". Clear all-applet intent authorizes updating the corresponding factory guidance without requiring the phrase "update factory". Classify the rule, compare existing guidance, update its canonical owner and reconcile workflows/verification. Split mixed instructions; a visual preference does not become a runtime requirement merely because the user says "must". Record user origin, classification, scope and rationale in the shared guidance changelog, with a local decision reference where relevant.

If already covered coherently, do not duplicate the rule. If local versus shared intent is unclear, ask "Should this become the default for all applets, or apply only here?" A reusable fix or repeated local request alone is insufficient. Do not retrofit unrelated applets or erase local overrides. Site selectors and business rules stay local. In exported workspaces update only the available factory copy and identify it; no upstream update is implied.

For Genesis platform changes without requested/shared guidance scope, explain any factory mismatch and ask before changing shared policy. Restoring documented behavior needs no policy question. Authorized local applet records and port reservations are not shared policy edits.
