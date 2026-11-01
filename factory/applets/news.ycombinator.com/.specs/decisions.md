# Hacker News decisions

## decision-0001: Adopt current applet baseline

- Date and origin: 2026-11-01T19:25:00+05:30, agent adoption of existing code, README and recorded user choices. This is the record creation date, not a claimed date for every inherited decision.
- Choice and rationale: Preserve one stable `hn-bookmarks` app, Home, Search, Post, Saved, Me, top-right native options, hidden sources and owned UI. The user requested durable local records and a shared menu default; existing UI/data decisions are preserved, not newly inferred approval.
- Evidence and supersession: [manifest](../applet.json), [current spec](current.md) and its historical evidence. Supersedes stale README version and blanket provider-action assertions, not historical records.

## decision-0002: Preserve product-specific choices

- Date and origin: 2026-11-01T19:25:00+05:30, inherited user design direction and agent implementation as described in previous README/code.
- Choice and rationale: Preserve compact story headings shared across feeds/discussion/Saved, current 15px/21px story title treatment, compact domain/metadata rows, orange identity and 48px standalone Save controls. Category normalization uses NFKC/whitespace/case rules, uniqueness and revision checks. Category deletion preserves stories; no active membership means Uncategorized. Comment disclosure collapses branches and same-page links open target/ancestors before scrolling. Account/private list data is not eligible for public failed-refresh caching. The user requested denser HN presentation; shared story components, normalization and disclosure mechanics are inherited engineering choices. Search placeholder is an implementation gap, not approved deferral.
- Evidence and supersession: [current spec](current.md), applet source and historical records linked there. Supersedes none. Future changed decisions append here and update current.md.
