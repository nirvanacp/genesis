# Applet records

Keep current intent and development context in two tracked folders inside each applet, including monorepo applets:

```text
.specs/current.md
.specs/decisions.md
.changelog/YYYY-MM-DD-HHMMSS-short-change.md
```

Use flat files with the user's local time, no phases/date folders. Add a descriptive suffix on collisions; never overwrite an unrelated record. Do not create applet .plans/.docs/.reports/.reviews/.research folders. Put plans, investigations and verification summaries in current specs. Build/private-state directories are not documentation categories.

Start from [current spec](templates/current.md), [decisions](templates/decisions.md) and [change record](templates/change.md). On an existing app, initialize when first touched; inspect actual code and prior decisions. Mark unknowns honestly, attribute user choices versus agent inferences, and never backdate new records. Preserve historical root records where created.

Read current specs first, then relevant decisions/recent changes. Current specs carry identity, origins, actual compatibility, product scope, defaults/overrides, route and interaction inventories, remaining work and verification. Reference manifest IDs rather than duplicate executable path rules. Keep implementation status separate from evidence. Latest user intent wins subject to actual platform constraints; only the user can approve deferral.

Append material decisions with stable IDs, local date, origin, rationale, affected rules/workflows, evidence and superseded decision IDs. Update current specs so agents need not read the whole history. Never silently drop a prior explicit choice during summarization.

Maintain one changelog per logical change, update it until verification is known, and finalize before committing. Use four compact bullets, roughly 100–200 words: goal, changes, decisions, verification. Record blockers and exact evidence limits. Routine small edits can refer to existing choices instead of inventing decisions.

README remains the human entrypoint for purpose, operator setup, current-spec links and known limits. Avoid duplicate route tables/history. Private account data, tokens, cookies, DOM dumps and private screenshots do not belong here. Platform/shared-factory/tooling changes keep their governing workspace's records; in the Genesis monorepo those remain root phase/date files. Split mixed changes by owner and cross-link them.
