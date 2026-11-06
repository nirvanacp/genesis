# X decisions

## decision-0001: Adopt current applet baseline

- Date and origin: 2026-11-01T19:24:48+05:30, agent adoption of existing code, README and recorded user choices. This is the record creation date, not a claimed date for every inherited decision.
- Choice and rationale: Preserve one stable `x-bookmarks` app, Home, Explore, Notifications, Saved, Profile, top-right native options, hidden sources and owned UI. The user requested durable local records and a shared menu default; existing UI/data decisions are preserved, not newly inferred approval.
- Evidence and supersession: [manifest](../applet.json), [current spec](current.md) and its historical evidence. Supersedes stale README version and blanket provider-action assertions, not historical records.

## decision-0002: Preserve product-specific choices

- Date and origin: 2026-11-01T19:24:48+05:30, inherited user design direction and agent implementation as described in previous README/code.
- Choice and rationale: Native mobile X design is the inherited user choice, with authenticated mobile website as fallback where native reference is unavailable. Preserve neutral palette, compact shared 15px/20px post text, 40px feed avatars, hairline separators, inline author/handle/time and icon actions. Saved has one Bookmarks/Likes/Categories row. Black media viewer keeps observed image identity and bounded Next/Previous controls. Preserve keyboard-safe category sheets, opaque themes, independent stores, at most 50 categories and 10 memberships per post, and rejection of deleting nonempty categories. The user requested native X identity and the five-section footer; exact token values, account-validation technique and action receipt implementation are inherited engineering choices.
- Evidence and supersession: [current spec](current.md), applet source and historical records linked there. Supersedes none. Future changed decisions append here and update current.md.

## decision-0003: Rebuild on SDK 1.0 with typed sources and screens

- Date and origin: 2026-11-06, the Genesis repository revamp requested by the user; implementation choices by the agent.
- Choice and rationale: The applet moves to manifest schema 5. Three sources publish typed data: `primary` for timelines, notifications, bookmarks, likes, posts, profiles and media, `explore` for trends and search, and `account` for the signed-in handle. One React foreground renders twelve screens. Like and bookmark run as declared intents instead of page scripts. The old separate alerts and saved sources are folded into `primary`. The account is observed from its own source at `/settings/account`, and the Categories library opens only when that handle matches the handle the service was created for. X now serves bookmarks at `/i/history` and own likes at `/i/history/likes`, so both routes, and the `/i/bookmarks` alias, open the Saved screen. Every screen leaves the shell menu button's corner clear. Product choices from decision-0002 stay in force.
- Evidence and supersession: [manifest](../applet.json), [sources](../src/sources) and the 2026-11-06 device check in [current](current.md). Supersedes the schema 3 page and source structure described in decision-0001; the five sections and the service data stay.

## decision-0004: Edit categories on screens

- Date and origin: 2026-11-06, agent choice during the SDK 1.0 rewrite.
- Choice and rationale: Filing a post and managing categories push the `save` and `manage` screens instead of opening keyboard-safe sheets. A full screen keeps the name field clear of the keyboard, and Android Back closes it through the stack. The limits of 50 categories and 10 categories per post, conflict rereads, the delete confirmation and the refusal to delete a nonempty category are unchanged.
- Evidence and supersession: [save screen](../src/screens/save.tsx), [manage screen](../src/screens/manage.tsx). Supersedes the keyboard-safe category sheets in decision-0002.
