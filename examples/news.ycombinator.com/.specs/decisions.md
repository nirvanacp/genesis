# Hacker News decisions

## decision-0001: Adopt current applet baseline

- Date and origin: 2026-11-01T19:25:00+05:30, agent adoption of existing code, README and recorded user choices. This is the record creation date, not a claimed date for every inherited decision.
- Choice and rationale: Preserve one stable `hn-bookmarks` app, Home, Search, Post, Saved, Me, top-right native options, hidden sources and owned UI. The user requested durable local records and a shared menu default; existing UI/data decisions are preserved, not newly inferred approval.
- Evidence and supersession: [manifest](../applet.json), [current spec](current.md) and its historical evidence. Supersedes stale README version and blanket provider-action assertions, not historical records.

## decision-0002: Preserve product-specific choices

- Date and origin: 2026-11-01T19:25:00+05:30, inherited user design direction and agent implementation as described in previous README/code.
- Choice and rationale: Preserve compact story headings shared across feeds/discussion/Saved, current 15px/21px story title treatment, compact domain/metadata rows, orange identity and 48px standalone Save controls. Category normalization uses NFKC/whitespace/case rules, uniqueness and revision checks. Category deletion preserves stories; no active membership means Uncategorized. Comment disclosure collapses branches and same-page links open target/ancestors before scrolling. Account/private list data is not eligible for public failed-refresh caching. The user requested denser HN presentation; shared story components, normalization and disclosure mechanics are inherited engineering choices. Search placeholder is an implementation gap, not approved deferral.
- Evidence and supersession: [current spec](current.md), applet source and historical records linked there. Supersedes none. Future changed decisions append here and update current.md.

## decision-0003: Rebuild on SDK 0.0 with typed sources and screens

- Date and origin: 2026-11-06, the Genesis repository revamp requested by the user; implementation choices by the agent.
- Choice and rationale: The applet moves to manifest schema 5. Three sources (`primary`, `post`, `me`) publish typed data, and one React foreground renders ten screens. Votes, posting and sign-out run as declared intents instead of page scripts. The signed-in account reads from its own `me` source at `/news?account=1`; a timestamped `account` value forces a fresh read after sign-out. Every screen leaves the shell menu button's top-right corner clear with a floated spacer. Product choices from decision-0002 stay in force.
- Evidence and supersession: [manifest](../applet.json), [sources](../src/sources) and the 2026-11-06 device check in [current](current.md). Supersedes the schema 3 page and source structure described in decision-0001; the five tabs and data stay.

## decision-0004: Edit saved stories on a screen

- Date and origin: 2026-11-06, agent choice during the SDK 0.0 rewrite.
- Choice and rationale: Save and Edit push a `save` screen carrying a story snapshot, replacing the old dialog. Android Back closes it through the stack and no leave guard is needed. Conflict and uncertain-write rereads, category creation and confirmed removal are unchanged.
- Evidence and supersession: [save screen](../src/screens/save.tsx). Supersedes the story dialog from the previous release.
