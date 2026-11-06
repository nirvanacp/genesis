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
| requirement-compatibility | Requirement: the installed SDK, tools, manifest schema and host agree; public imports only | [SDK reference](sdk-reference.md) |
| requirement-hidden-sources | Requirement: websites stay hidden; adapters publish bounded JSON; the foreground renders every screen | [Hidden sources](#hidden-sources) |
| requirement-route-policy | Requirement: exact origins, declared routes, and the website sheet only on explicit user intent | [Navigation](navigation.md) |
| requirement-loading-evidence | Requirement: an extractor returns data only from content it recognized; `null` while the page is not ready | [Patterns](patterns.md#loading-is-not-empty) |
| requirement-real-interactions | Requirement: a control performs the action its label names, against the current entity and account, and reports the observed outcome | [Interactions](interactions.md) |
| requirement-data-integrity | Requirement: stable keys, one authoritative store per record type, revision checks, credentials outside the bundle, no blind retry of uncertain writes | [Services and data](services-and-data.md) |
| requirement-accessible-navigation | Authoring requirement: semantic labels, focus, readable contrast, scalable text, 48 dp touch targets and working Back | [Design](design.md) |
| requirement-records | Authoring requirement: keep current intent, decisions and change outcomes in applet records | [Records](applet-records.md) |
| requirement-honest-verification | Verification requirement: keep static, synthetic and live evidence apart; keep blocked journeys visible; no unrequested posts, messages, purchases or account changes | [Verification](verification.md) |
| requirement-operator-startup | Workflow requirement: maintain backend start commands; start services only when the user asks | [Services and data](services-and-data.md#local-startup-and-ports) |
| default-* | Initial UI and navigation choices and their compatible overrides | [Defaults](defaults.md) |
| practice-focused-modules | Best practice: separate extraction, data types, screens, repositories and backend calls; abstract only after real reuse | [Patterns](patterns.md) |
| practice-bounded-work | Best practice: bounded lists, one subscription per concern, shared components and tokens | [Patterns](patterns.md), [design](design.md) |
| practice-small-dependencies | Best practice: the smallest useful dependency and capability set, without shrinking the requested scope | [Getting started](getting-started.md) |
| practice-scoped-diagnosis | Best practice: inspect evidence, find the owning component, verify the changed journeys, keep records short and current | [Verification](verification.md) |

## Hidden sources

- A source is a hidden website page. Its adapter extracts JSON for the declared routes of that source and nothing else. The user never sees the hidden page, including while it loads, fails or redirects.
- Adapters have no storage, services or navigation. They return data from `extract`, return driver steps from `intents`, and report sign-in state from `isSignedIn`. Only the foreground stores records and calls services.
- An adapter never executes code taken from the page, never copies whole DOM trees, and never returns HTML, cookies, form tokens or credentials. Return the smallest model a screen needs: text, numbers, validated URLs and ids.
- The foreground renders website strings as text. Rich text uses an applet-defined model of text runs, links and emphasis, never upstream HTML. Validate link and media URLs before use.
- Each source sees only its own website. Screens that combine several sources read each one's snapshot in the foreground; no adapter reads another source's page.
- A route match permits extraction; it does not prove the page holds valid content. Sign-in pages, challenges, error pages and changed markup can appear at any declared URL.
- Snapshots are capped at 192 KiB. Page large lists, and deduplicate records by id.

## Conflicts and questions

Name the requested behavior, the rule it hits, the concrete consequence and two or three workable choices. Example: "Showing the website while the screen loads would expose the hidden page. Should I keep a skeleton, or add an Open website button?" Offer a platform capability request when that is the real gap. Never offer to ignore a runtime constraint; a process waiver does not waive data or runtime guarantees.

Ask only about unresolved product intent, requirement conflicts, or access and fallback choices. Choose selectors, module names and spacing yourself. Continue independent work while waiting. Silence is not approval. Missing sign-in, tools or device access blocks the affected acceptance; it does not approve a smaller app or synthetic data in its place.

## Shared intent

Judge the whole request for intent that covers every applet, such as "every applet should do this" or "make this standard whenever we build apps". Clear all-applet intent authorizes updating the factory guidance that owns the topic, without the user saying "update the factory". Classify the rule, compare it with the existing guidance, update its one canonical place, and reconcile skills and verification with it. A visual preference does not become a runtime requirement because the user said "must".

If the guidance already covers the rule, do not duplicate it. If it is unclear whether the user means this applet or all applets, ask: "Should this become the default for all applets, or apply only here?" A reusable fix or a repeated local request is not enough. Do not change unrelated applets or erase their local overrides. Site selectors and business rules stay local. In an exported kit, update only the available copy and say so; nothing flows upstream automatically.
