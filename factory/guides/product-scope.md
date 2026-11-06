# Product scope

Use this to turn a website address and an ordinary request into the app the user expects, and to keep that app intact while you change it.

## One app, many parts

An applet is the app the user opens. Its sources, screens, records and services are internal parts. A request for "an X client with categorized bookmarks" means one applet with timelines, search, conversations, profiles and bookmarking, not a bookmark app and a separate client. Make two applets only when the user asks for two apps.

When customizing, keep the applet's id, launcher entry, working features, stored data and explicit choices. Do not shrink a full client to the feature that needs the most new code. Reference applets show technique; do not copy their placeholders, restrictions, themes or data models unless the user asked for them.

## Start from the website

A domain and a description are enough to start. Resolve the domain to its canonical `https://` origin. Inspect the mobile website, signed in where the user has given access: the entry page, lists, details, profiles, search, account pages, forms, loading and failure states. Derive the everyday journeys yourself; the user does not have to list screens or selectors. Choose a readable name and an id when none was given.

## The product brief

Write a short brief in `.specs/current.md`:

- The app's name, id and launcher entry, and what already exists.
- The user's explicit requirements and the workflows and data to preserve.
- The core journeys: where each starts, what the user does, what is stored, and how they get back.
- What the website supplies, what the applet renders, and which store owns each record type.
- The design reference and any explicit overrides.
- Exclusions the user approved, assumptions you made, and open questions.

Mark each requirement `required`, `preserve` or `deferred by user`, and track its status as `planned`, `implemented`, `verified`, `failed` or `blocked` with evidence. Your inability to check something does not make it an exclusion.

| Journey | Expected result | Owner and data | Status |
| --- | --- | --- | --- |
| Launch, browse, open a detail, Back | Right content, section and scroll position on return | Source and foreground | |
| Sign in or open an account page | Website sheet; returns to the opener | Website | |
| Use the added feature, leave, reopen | The result persists in its store | Foreground and its store | |
| Open an outside link and close it | Correct destination; the detail is restored | Website sheet or browser | |
| Service down or unfamiliar page | A clear error; the rest of the app keeps working | Foreground | |

Size the brief to the change. A style fix does not need a full client audit; a full client does.

## Ask about real ambiguity

Ask when two reasonable readings would give the user a materially different app and the context does not decide it. Ask before building the affected part, in product language, one to three questions with concrete choices.

| Situation | Response |
| --- | --- |
| The user asked for one app with a new feature | Keep it integrated; do not ask again. |
| "Make a saved-posts app" without saying whether it replaces the client | Ask whether they want the full client with Saved, or a separate collection app. |
| Two stores could stay independent or sync | Ask what saving and removing should do in each. |
| A personal single-account backend would exclude other intended accounts | Establish who will use it first. |
| A feature needs a capability the host lacks | Explain the gap; ask about a fallback if one changes the product. |
| Module names, file layout, selector choice | Decide yourself. |

Continue work that does not depend on the answer. No answer is not approval.

## Limits do not change the product

A blocked sign-in or a missing device blocks the affected verification; it does not redefine the app. Do not bypass challenges or collect extra account data. Label synthetic data and component previews as diagnostics. When the platform lacks a capability, describe the missing contract and a sanitized reproduction instead of inventing an API.

## Finishing

Start acceptance at the launcher. Walk each core journey with the real website and the intended store, including errors and Back. Do not post, message, follow or purchase to prove a form works. Remove temporary test applets from the device with the tools that exist, and never reset Genesis to clean up. Report each unmet requirement as failed, blocked or deferred by the user, and do not call the app complete while a core journey is unmet.
