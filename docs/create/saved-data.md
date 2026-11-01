# Choose where saved data lives

[Learning path](../README.md) · Before adding persistent features

"Save this" needs a clear meaning. Website bookmarks and your app's own collection may be separate records.

## Pick the result you want

| Place | Useful for | What to expect |
| --- | --- | --- |
| Original website | Its bookmarks, posts, and account data | The website controls availability and account rules |
| Applet storage on this device | Personal settings, drafts, small collections | Shared within this applet; no automatic cross-device sync |
| A separate backend | A library managed by a service | Needs a running server, access rules, and backups |

Different record types can live in different places. For example, drafts may stay on the phone while a collection lives on a server.

## Tell the agent the rules

> Save a story's URL, title, and my note on this device. Do not change my website bookmarks. Removing it from Saved should remove only my app's record. Keep my collection after app updates.

If you want website bookmarks and custom categories to stay in sync, say exactly how adding and removing should work. That synchronization must be implemented; Genesis does not provide it automatically.

## Ask about failures

- After a restart, should the records still be there?
- Without a connection, what can I still read or edit?
- If a save times out, how does the app check whether it succeeded?
- If two edits conflict, how does the app preserve my work?

A timeout does not always mean a write failed. The app should check the result before blindly repeating it.

Local records do not make the source website available offline. Server-backed collections need an explicit cache if you want offline reading.

## Protect an existing collection

Keep the same applet ID during updates. Ask for a backup and a migration plan before changing stored record formats or moving records to another store.

Code rollback does not restore old data. Export and backup are app-specific features; do not assume every app has them.

**Next:** [Combine websites](multiple-websites.md), or [add a backend](services.md) if your app needs one.
