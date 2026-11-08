# Adapter pages, regions and contexts

- Goal: Port X to the adapter runtime and the presentation coordinator (step 9 of the session projection migration).
- Changes: Manifest schema 6 with `primary`, `explore` and `account` contexts and routes to adapter pages `timeline`, `post`, `profile`, `explore`, `media` and `account`. The sources, the website routes and the `unsupported` screen are removed. Screens read pages, regions and records; like, bookmark and Show more are adapter actions. The tab bar selects contexts. A focused post's view count no longer repeats "views".
- Decisions: decision-0006.
- Verification: `check`, `typecheck` and `build` passed. On the emulator with a signed-in account: every tab, a post, profiles, Show more and the Save overlay's unavailable state. No X action was performed and the bookmarks service was not started.
