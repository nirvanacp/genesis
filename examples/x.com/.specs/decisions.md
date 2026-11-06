# X decisions

## decision-0001: Adopt current applet baseline

- Date and origin: 2026-11-01T19:24:48+05:30, agent adoption of existing code, README and recorded user choices. This is the record creation date, not a claimed date for every inherited decision.
- Choice and rationale: Preserve one stable `x-bookmarks` app, Home, Explore, Notifications, Saved, Profile, top-right native options, hidden sources and owned UI. The user requested durable local records and a shared menu default; existing UI/data decisions are preserved, not newly inferred approval.
- Evidence and supersession: [manifest](../applet.json), [current spec](current.md) and its historical evidence. Supersedes stale README version and blanket provider-action assertions, not historical records.

## decision-0002: Preserve product-specific choices

- Date and origin: 2026-11-01T19:24:48+05:30, inherited user design direction and agent implementation as described in previous README/code.
- Choice and rationale: Native mobile X design is the inherited user choice, with authenticated mobile website as fallback where native reference is unavailable. Preserve neutral palette, compact shared 15px/20px post text, 40px feed avatars, hairline separators, inline author/handle/time and icon actions. Saved has one Bookmarks/Likes/Categories row. Black media viewer keeps observed image identity and bounded Next/Previous controls. Preserve keyboard-safe category sheets, opaque themes, independent stores, at most 50 categories and 10 memberships per post, and rejection of deleting nonempty categories. The user requested native X identity and the five-section footer; exact token values, account-validation technique and action receipt implementation are inherited engineering choices.
- Evidence and supersession: [current spec](current.md), applet source and historical records linked there. Supersedes none. Future changed decisions append here and update current.md.
