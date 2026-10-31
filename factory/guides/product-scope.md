# Product scope and clarification

Use this workflow with [factory instructions](../AGENTS.md) and the selected [applet skill](../skills/README.md). It applies to new applications, feature additions and maintenance. It travels with the creator kit and requires no access to the Genesis monorepo or its historical plans.

## Keep the requested application intact

An applet is the application a person opens. A source is a running website context, a page is an internal screen, and a service is a data provider. Several sources or pages can belong to the same applet. A user asking for one social client with categorized bookmarks usually wants timelines, search, conversations, account flows and bookmarking inside one application. A separate category backend does not imply a separate bookmark app. A request for two distinct applications normally produces two applet identities.

For an existing app, preserve its working behavior and identity while adding the requested change. For a complete website-backed client, map the daily experience before selecting implementation components. Preserve source browsing, forms and authentication where the website already provides them. Do not reduce the app to the custom feature merely because that feature needs most of the new code. A source-owned form/action can satisfy a workflow through explicit website presentation with correct return navigation. Core custom browsing screens require owned renderers.

Copy useful technical patterns from reference applets. Do not copy an unrelated placeholder, missing workflow, personal-account restriction, visual theme or data model as if the user requested it. A minimum capability set means least privilege, not minimum product functionality. Component milestones are useful; a component demo is not the completed application.

## Establish a small product brief

Read the prompt, previous decisions, existing manifest/README and available authorized source context. In the applet README or the workspace's designated plan, record the following in a few paragraphs and a flow table. For small edits, extend the existing brief instead of writing a separate planning document.

- Intended application names/count, existing stable IDs and intended launcher entries.
- Explicit user requirements and the existing workflows/data to preserve.
- Essential journeys, including entry, action, persistence where relevant, and return to the opener.
- Which behavior the website supplies, which UI the applet owns and which store is authoritative.
- Delivery target, such as source code, an installed debug applet or a bundled build. Do not confuse these.
- User-approved exclusions, reversible technical assumptions and unresolved material choices. Attribute material decisions to the user or agent.

Label each requirement as `required`, `preserve`, or `user-approved deferred`. During work give it a separate status: `planned`, `implemented`, `verified`, `failed`, `blocked`, or `deferred`. Record evidence for verification and a reason for every block. An agent's convenience or inability to verify a flow does not turn it into a user-approved exclusion.

| Journey | Expected user-visible result | Owner/data authority | Status and evidence |
| --- | --- | --- | --- |
| Open application, browse, open detail, Back | One app identity; correct content, section and reading position on return | Website plus native shell | Fill from actual observation |
| Open a sensitive/account route | Source session and forms remain usable; return stays within the app | Website | Do not infer from origin permission alone |
| Use the added feature and reopen it | Confirmed result persists in the intended store | Applet and its declared authority | Trace actual UI through write/read-back |
| Follow an external link and Close | Actual destination origin; original detail and scroll restored | Reader and owning section | Verify both directions |
| Lose backend access or encounter unfamiliar markup | Useful error or usable source recovery; unrelated browsing remains available | Applet/source/host | Failed reads never become empty collections |

Adjust the rows to the request. A tiny CSS fix does not require a full client audit. A complete client request does require coverage of its daily workflows and explicit reporting of gaps. Do not promise parity with a native application based solely on build success or visual similarity.

## Ask about material ambiguity

Ask when two plausible interpretations would materially change what the user receives and the prompt/context does not resolve them. Ask before implementing the affected decision. Use ordinary product language, one to three focused questions at a time, with concrete choices and their consequences. A question is for missing intent, not a ritual approval of every plan.

| Situation | Required response |
| --- | --- |
| The user explicitly wants one app with a new feature | Keep it integrated. Do not ask again whether to create a separate app. |
| A brief says "make a saved-post app" without saying whether it replaces the full client | Ask whether they want the complete client with Saved integrated or a dedicated collection app. |
| A request says "like our other app" | Reuse relevant patterns; ask only if importing an unresolved product limitation would affect the outcome. |
| Two stores could be synchronized or independent and the user has not specified behavior | Ask what saving/removing should do in each store. Do not invent synchronization or migrations. |
| A personal single-account backend would exclude intended accounts/users | Establish intended account scope before committing to that limitation. |
| A required feature needs an unavailable host capability or blocked authentication | Explain the blocked workflow. Ask about the product tradeoff if a fallback or scope change is necessary; retain the requirement until answered. |
| The request already defines the app count, data ownership or platform authorization | Follow it. Do not make the user repeat the instruction. |
| A choice concerns module names, managed SDK calls or ordinary implementation structure | Decide from current code, document material technical tradeoffs and continue. |

For example: "Should removing a post from a category also remove its website bookmark, or should these remain independent?" This resolves a behavior choice. "Should I use a repository module?" transfers an implementation responsibility to the user and is unnecessary.

While a material answer is pending, continue work that does not depend on it. Keep the decision marked unresolved and avoid building one interpretation into schemas, navigation or delivery. No response is not approval. If no question mechanism is available, state the focused question in the handoff and identify dependent work. Do not invent a response after a timeout.

## Handle access and capability limits without changing the product

An authentication failure blocks the affected verification; it does not redefine the product. Keep credentials out of source, evidence and password storage when requested. Do not bypass challenges or collect extra account data to complete a check.

Use independent component checks to make progress. Label synthetic data, substituted account providers and temporary applets as diagnostics. Such checks cannot establish real source extraction, account handling, service integration or native-client parity. A source route with ordinary presentation is still part of the app's journey; it must not be treated as an abandoned feature or another launcher app.

If platform changes are authorized, handle generic capability work under platform instructions and then return to integrated app acceptance. If not, provide the exact missing contract and reproduction. Do not invent an SDK API, silently patch host internals or turn a missing capability into an unexplained exclusion.

## Deliver the app, then assess completion

Start acceptance at the actual launcher entry. Walk each required journey with the real source and intended service, including errors and return navigation. Keep component, integrated, device and synthetic evidence separate. For source actions with consequences, use existing authorization or ask for the specific missing mutation scope; never send a post/message just to prove a form works.

Record any temporary installed package's identity and how it will be removed from everyday navigation. Prefer a separate QA environment. Use only supported cleanup/visibility tools and preserve user data. Do not assume a proposed visibility/uninstall command exists. If safe cleanup is unavailable, avoid installing an extra package on the everyday device; if it is already there, report the gap and seek the appropriate platform capability. Never reset Genesis merely to make the launcher look clean.

Before handoff, compare the delivered launcher and behavior with the brief. A build pass, an accepted package receipt and a running server are separate checks; none proves the whole journey. For each unmet requirement state whether implementation failed, verification was blocked or the user explicitly deferred it. Continue independent authorized work, but do not label the requested application complete while a core journey remains unmet.

## Examples for checking these instructions

These are manual reasoning examples, not executable tests or promised tool capabilities.

| Request or event | Expected agent behavior |
| --- | --- |
| "Build the complete X client and add categorized bookmarks; keep HN" | One X applet alongside HN; source/page/service parts remain internal; verify daily routes and both save authorities. |
| "Improve this app's category sheet" | Preserve the app and existing stores; change/verify the sheet and neighboring return flow. |
| "Create a collection app, separate from my social client" | A separate applet is appropriate because the split is explicit. |
| "Make a client like the native app" but a core host facility is absent | Record the expected workflow, explain the precise gap and ask about a material fallback; do not declare a subset equivalent. |
| Login becomes rate-limited after source work | Keep real acceptance blocked, complete independent work and do not deliver a second synthetic app as the result. |
| A QA applet remains in the launcher | Treat this as unfinished delivery cleanup, even if its individual UI checks passed. |

The product brief must include the mandatory route inventory with owned-screen/adapter mapping, website-provider actions and unknown-route recovery. See [isolated applets](isolated-applets.md). A route match is not evidence of valid loaded source content.
