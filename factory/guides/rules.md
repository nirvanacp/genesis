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
| requirement-compatibility | Requirement: the applet's manifest schema, SDK and tools match the host's compatibility values; public imports only | [SDK reference](sdk-reference.md) |
| requirement-session-projection | Requirement: the applet reads bounded JSON from the live page through watches and reads, and acts only through page inputs and commands; the UI renders the pages it routes, and the website shows for everything else | [Session projection](#session-projection) |
| requirement-route-policy | Requirement: exact origins and a route table in code. A routed page shows its screen while ready, while loading within its readiness deadline, and on error while a stale copy is within that deadline; a page that was ready and starts loading or fails again gets a fresh deadline. Genesis shows the website for unrouted pages, sign-in, unsupported pages, a load that outlasts the deadline and an error with no stale copy. A screen opens the website itself only on explicit user intent | [Navigation](navigation.md), [presentation](presentation.md) |
| requirement-loading-evidence | Requirement: a route's `ready` reader returns a truthy value only from content it recognized; a list is empty only when the page says so | [Page modules](page-modules.md) |
| requirement-real-interactions | Requirement: a control performs the action its label names, against the current entity and account, reports the observed outcome, and never retries an uncertain one | [Interactions](interactions.md) |
| requirement-user-paced-writes | Requirement: every write to a website comes from one user tap; no loops of writes, no background writes, no writes while the user is not in the applet; bulk work uses the website's own bulk control | [User-paced writes](#user-paced-writes) |
| requirement-user-tap-actions | Requirement: picking files, saving, sharing, opening another app, enabling notifications and one-time grants start only from the handler of a user's tap on the applet UI, one per tap, never chained or automatic; features that need visible UI stay in the applet as [website features](website-features.md) describes | [User tap actions](#user-tap-actions) |
| requirement-website-dialogs | Requirement: a website's `alert`, `confirm`, `prompt` or leave question reaches the user unchanged, as Genesis's own dialog, and is answered only by the user | [Website dialogs](#website-dialogs) |
| requirement-protected-fields | Requirement: the applet never reads or enters passwords, hidden inputs, one-time codes or card data; the user types them on the website | [Protected fields](#protected-fields) |
| requirement-data-integrity | Requirement: stable keys, one authoritative store per record type, revision checks, credentials outside the bundle, no blind retry of uncertain writes | [Services and data](services-and-data.md) |
| requirement-accessible-navigation | Authoring requirement: semantic labels, focus, readable contrast, scalable text, 48 dp touch targets and working Back | [Design](design.md) |
| requirement-records | Authoring requirement: keep current intent, decisions and change outcomes in applet records | [Records](applet-records.md) |
| requirement-honest-verification | Verification requirement: keep static, synthetic and live evidence apart; keep blocked journeys visible; no unrequested posts, messages, purchases or account changes | [Verification](verification.md) |
| requirement-operator-startup | Workflow requirement: maintain backend start commands; start services only when the user asks | [Services and data](services-and-data.md#local-startup-and-ports) |
| default-* | Initial UI and navigation choices and their compatible overrides | [Defaults](defaults.md), [motion](motion.md) |
| practice-focused-modules | Best practice: separate page module readers and commands, data types, screens, repositories and backend calls; abstract only after real reuse | [Patterns](patterns.md) |
| practice-bounded-work | Best practice: bounded lists, one subscription per concern, shared components and tokens | [Patterns](patterns.md), [design](design.md) |
| practice-small-dependencies | Best practice: the smallest useful dependency and capability set, without shrinking the requested scope | [Getting started](getting-started.md) |
| practice-scoped-diagnosis | Best practice: inspect evidence, find the owning component, verify the changed journeys, keep records short and current | [Verification](verification.md) |

## Session projection

- Each context is a live website session that the user could also see directly. The page agent reads those sessions' pages into records, through JSON read specifications or the readers of the applet's page module (`build.page`); the UI renders them as screens. The route table lives in the UI's code, usually `src/routes.ts` given to the router helper. Pages without a route, sign-in, and pages that do not become ready show as the website itself.
- Page modules have no storage, services, network calls or navigation of their own. Readers return data synchronously; commands return a value or the input steps to run. Only the UI stores records and calls services. `genesis-applet check` refuses a page module that imports a UI framework, calls `eval`, `new Function`, `fetch` or `XMLHttpRequest`, reads `document.cookie`, or uses `localStorage`, `sessionStorage` or `indexedDB`.
- A page module never executes code taken from the page, never copies whole DOM trees, and never returns HTML, cookies, form tokens or credentials. Return the smallest model a screen needs: text, numbers, validated URLs and ids.
- The UI renders website strings as text. Rich text uses an applet-defined model of text runs, links and emphasis, never upstream HTML. Validate link and media URLs before use.
- One page module serves every context, and each read sees only its own page. Screens that combine contexts watch each one from the UI.
- A route match permits reading; it does not prove the page holds valid content. Sign-in pages, challenges, error pages and changed markup can appear at any declared URL, so a route's `ready` reader needs positive evidence.
- A watch snapshot is capped at 192 KiB of JSON (196608 bytes), and a context page holds at most 32 open watches. Bound long lists, and give every item a stable unique key.

## User-paced writes

Genesis is a different face for websites the user already uses, not an automation tool. Websites watch for bot-like input, and an account that looks automated can be locked.

- Every input that changes something on a website (a vote, a post, a follow, a delete, a form submit) comes from one tap on the applet control that names it. One tap may run one input or one sequence (`run`, a command) that does that one thing. Filling a composer, attaching its files and clicking the site's Post button after one Post tap is one sequence.
- No loops of writes over a list, no writes from timers, page events, watches or a backend, and no writes while the user is not in the applet.
- Bulk work uses the website's own bulk control: select all, then one action, as the website offers it. When the website has none, the applet offers the action per item.
- The host enforces a budget per context: `limits.inputBurst` input calls at once (20), then one more every `limits.inputRefillMs` (1 s). An input over the budget fails with `RATE_LIMITED` and never reaches the page. Treat it as a design error, not as something to wait out; never retry after `retryAfterMs`.

## User tap actions

Some things only the user may start: picking files, saving to Downloads, sharing, opening another app, turning notifications on, and letting a hidden page use a website feature once with `context.allow`.

- Call each straight from the handler of a tap on the applet control that names it, before any other `await`. Genesis carries it out only within 3 seconds of that tap, once per tap.
- One tap starts one of them. Never chain two, and never start one from a timer, a watch, a page event, a backend or a retry.
- When one rejects with `USER_ACTION_REQUIRED`, ask the user to tap again.
- Keep these features in the applet. File attachments, downloads, sharing, links to apps, fullscreen video, windows and location follow [website features](website-features.md); only camera and microphone, server sign-in prompts and client certificates, protected fields, payments and challenges show the website.

## Website dialogs

A hidden page's `alert`, `confirm`, `prompt` or leave question waits for the user, and Genesis shows it as its own dialog over the applet with the site's origin and its exact message. Only the user answers it: a page module never replaces `window.alert`, `confirm` or `prompt`, never removes the site's `beforeunload` question, and never answers a dialog for the user from a stored preference. See [interactions](interactions.md#website-dialogs).

## Protected fields

The page agent treats a field as protected when it is a password or hidden input, or when its `autocomplete` is `current-password`, `new-password`, `one-time-code` or starts with `cc-`. Reading its `value` returns `null`, and `fill` or `type` into it fails with `PROTECTED_FIELD`. A `press` aimed at a protected field fails the same way, and so does a trusted `press` while one has focus. An applet that needs such a value, such as a sign-in or a payment, shows the website so the user types it there. Do not work around the rule with a page module command; a request to do so is a requirement conflict.

## Conflicts and questions

Name the requested behavior, the rule it hits, the concrete consequence and two or three workable choices. Example: "Reading the vote state from a script variable would go stale, because Genesis only sees the page's DOM. Should I read the arrow's state from the page, or drop the vote count from this screen?" Offer a platform capability request when that is the real gap. Never offer to ignore a runtime constraint; a process waiver does not waive data or runtime guarantees.

Ask only about unresolved product intent, requirement conflicts, or access and fallback choices. Choose selectors, module names and spacing yourself. Continue independent work while waiting. Silence is not approval. Missing sign-in, tools or device access blocks the affected acceptance; it does not approve a smaller app or synthetic data in its place.

## Shared intent

Judge the whole request for intent that covers every applet, such as "every applet should do this" or "make this standard whenever we build apps". Clear all-applet intent authorizes updating the factory guidance that owns the topic, without the user saying "update the factory". Classify the rule, compare it with the existing guidance, update its one canonical place, and reconcile skills and verification with it. A visual preference does not become a runtime requirement because the user said "must".

If the guidance already covers the rule, do not duplicate it. If it is unclear whether the user means this applet or all applets, ask: "Should this become the default for all applets, or apply only here?" A reusable fix or a repeated local request is not enough. Do not change unrelated applets or erase their local overrides. Site selectors and business rules stay local. In an exported kit, update only the available copy and say so; nothing flows upstream automatically.
