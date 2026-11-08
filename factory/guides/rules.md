# Applet rules and choices

Read this before building or customizing an applet. A product requirement describes the app the user asked for. A Genesis requirement describes what makes an applet work on the platform. Classify each one separately.

| Class | Meaning | Response |
| --- | --- | --- |
| Requirement | Platform compatibility, correctness, a data boundary, or a mandatory authoring or verification step | Follow it. If the user's request contradicts it, explain the consequence and offer workable alternatives before building the dependent part. Consent cannot create a capability the host lacks. |
| Default | Initial product or UI behavior when nobody chose otherwise | Apply it automatically. A compatible explicit choice wins, however brief. Record the override. |
| Best practice | Preferred maintainable engineering | Follow it unless the user overrides it compatibly. Record material departures; no approval needed. |

Read the latest request, local instructions, `.specs/current.md`, relevant decisions and the code itself. Explicit choices survive kit updates; a vague request to "make it look better" does not revoke them. Split a mixed instruction into its visual preference and its correctness obligation.

## Rule index

| ID | Class and obligation | Details |
| --- | --- | --- |
| requirement-compatibility | Requirement: the applet's manifest schema, SDK and tools match the host's compatibility values; public imports only | [SDK reference](sdk-reference.md#compatibility) |
| requirement-session-projection | Requirement: adapters read bounded JSON from the live page and act only through the page; the foreground renders routed pages, and Genesis shows the website for everything else | [Session projection](#session-projection) |
| requirement-route-policy | Requirement: exact origins and declared routes. A routed page shows its screen while ready, while loading within its readiness deadline, and on error while a stale copy is within that deadline; a page that was ready and starts loading or fails again gets a fresh deadline. Genesis shows the website for unrouted pages, sign-in, unsupported pages, a load that outlasts the deadline and an error with no stale copy. A screen opens the website itself only on explicit user intent | [Navigation](navigation.md), [presentation](presentation.md) |
| requirement-loading-evidence | Requirement: a page's `ready` returns `true` only from content it recognized; empty only when the page says so | [Adapters](adapters.md#readiness) |
| requirement-real-interactions | Requirement: a control performs the action its label names, against the current entity and account, reports the observed outcome, and never retries an uncertain one | [Interactions](interactions.md) |
| requirement-data-integrity | Requirement: stable keys, one authoritative store per record type, revision checks, credentials outside the bundle, no blind retry of uncertain writes | [Services and data](services-and-data.md) |
| requirement-accessible-navigation | Authoring requirement: semantic labels, focus, readable contrast, scalable text, 48 dp touch targets and working Back | [Design](design.md) |
| requirement-records | Authoring requirement: keep current intent, decisions and change outcomes in applet records | [Records](applet-records.md) |
| requirement-honest-verification | Verification requirement: keep static, synthetic and live evidence apart; keep blocked journeys visible; no unrequested posts, messages, purchases or account changes | [Verification](verification.md) |
| requirement-operator-startup | Workflow requirement: maintain backend start commands; start services only when the user asks | [Services and data](services-and-data.md#local-startup-and-ports) |
| default-* | Initial UI and navigation choices and their compatible overrides | [Defaults](defaults.md), [motion](motion.md) |
| practice-focused-modules | Best practice: separate adapter pages, data types, screens, repositories and backend calls; abstract only after real reuse | [Patterns](patterns.md) |
| practice-bounded-work | Best practice: bounded lists, one subscription per concern, shared components and tokens | [Patterns](patterns.md), [design](design.md) |
| practice-small-dependencies | Best practice: the smallest useful dependency and capability set, without shrinking the requested scope | [Getting started](getting-started.md) |
| practice-scoped-diagnosis | Best practice: inspect evidence, find the owning component, verify the changed journeys, keep records short and current | [Verification](verification.md) |

## Session projection

- Each context is a live website session that the user could also see directly. The adapter reads the declared pages of those sessions into records; the foreground renders them as screens. Pages without a route, sign-in, and pages that do not become ready show as the website itself.
- Adapters have no storage, services or navigation. They read with `ready`, `account` and region `read` functions and act with action functions that return steps. Only the foreground stores records and calls services.
- An adapter never executes code taken from the page, never copies whole DOM trees, and never returns HTML, cookies, form tokens or credentials. Return the smallest model a screen needs: text, numbers, validated URLs and ids.
- The foreground renders website strings as text. Rich text uses an applet-defined model of text runs, links and emphasis, never upstream HTML. Validate link and media URLs before use.
- One adapter serves every context, and each read sees only its own page. Screens that combine contexts read each one in the foreground.
- A route match permits reading; it does not prove the page holds valid content. Sign-in pages, challenges, error pages and changed markup can appear at any declared URL, so `ready` needs positive evidence.
- A page is capped at 192 KiB of JSON (196608 bytes). Bound long lists, and give every item a stable unique key.

## Conflicts and questions

Name the requested behavior, the rule it hits, the concrete consequence and two or three workable choices. Example: "Reading the vote state from a script variable would go stale, because Genesis only sees the page's DOM. Should I read the arrow's state from the page, or drop the vote count from this screen?" Offer a platform capability request when that is the real gap. Never offer to ignore a runtime constraint; a process waiver does not waive data or runtime guarantees.

Ask only about unresolved product intent, requirement conflicts, or access and fallback choices. Choose selectors, module names and spacing yourself. Continue independent work while waiting. Silence is not approval. Missing sign-in, tools or device access blocks the affected acceptance; it does not approve a smaller app or synthetic data in its place.

## Shared intent

Judge the whole request for intent that covers every applet, such as "every applet should do this" or "make this standard whenever we build apps". Clear all-applet intent authorizes updating the factory guidance that owns the topic, without the user saying "update the factory". Classify the rule, compare it with the existing guidance, update its one canonical place, and reconcile skills and verification with it. A visual preference does not become a runtime requirement because the user said "must".

If the guidance already covers the rule, do not duplicate it. If it is unclear whether the user means this applet or all applets, ask: "Should this become the default for all applets, or apply only here?" A reusable fix or a repeated local request is not enough. Do not change unrelated applets or erase their local overrides. Site selectors and business rules stay local. In an exported kit, update only the available copy and say so; nothing flows upstream automatically.
