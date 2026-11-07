# Applet records

Keep the applet's current intent and development history in two tracked folders inside the applet:

```text
.specs/current.md
.specs/decisions.md
.changelog/YYYY-MM-DD-HHMMSS-short-change.md
```

Use flat files named with the user's local time; no phase or date folders. Add a descriptive suffix on a name collision and never overwrite an unrelated record. Do not create other record folders such as `.plans`, `.docs` or `.reports`; plans, investigations and verification summaries go in the current spec.

Start from the [current spec](templates/current.md), [decisions](templates/decisions.md) and [change record](templates/change.md) templates. On an existing applet without records, create them the first time you change it, from the actual code and prior decisions. Mark unknowns as unknown, say whether a choice came from the user or from you, and never backdate a record.

Read the current spec first, then the relevant decisions and recent changes. The current spec holds identity, origins, versions, product scope, defaults and overrides, the route and interaction inventories, data authority, remaining work and verification. Refer to manifest route ids instead of copying patterns. Keep implementation status separate from verification evidence. The latest user intent wins within platform constraints; only the user can approve a deferral.

Append material decisions to `decisions.md` with a stable id, local date, origin, rationale, the rules and journeys affected, evidence, and any decision it supersedes. Update the current spec so a reader does not need the whole history. Never drop an earlier explicit choice while summarizing.

Write one change record per logical change, keep it updated until verification is known, and finish it before committing. Use four short bullets of about 100 to 200 words in total: goal, changes, decisions, verification. Record blockers and the exact limits of the evidence. A small routine edit can point to existing decisions instead of creating new ones.

The README is the human entry point: purpose, operator setup, links to the current spec and known limits. Do not duplicate route tables there. Account data, tokens, cookies, page dumps and private screenshots never go into records. Changes to the shared factory, the platform or the tools keep the records their own workspace requires; describe a related change in words when the other record is not visible to the same readers.
