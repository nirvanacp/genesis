# X navigation recovery

- Goal: Keep one usable X experience when source anchors or account detection are unavailable.
- Changes: Source adaptation now transitions through detecting/ready/unsupported/retired states. Source navigation hiding starts only after required account/content anchors and owned replacements exist. Every render removes old hiding first; disposal restores source presentation. Added a managed accessible navigation-status region and directs action errors to it.
- Decisions: Preserve the existing x-bookmarks identity and source sections. Account and library data authority are unchanged. Unknown source layout exposes original source navigation instead of leaving hidden actions behind.
- Verification: Workspace TypeScript and X manifest/bundle checks passed. Updated the existing emulator applet to revision 44e39b866711822474a42dd2daff6cfd8097483249cf836d459253c25a6aa14b. Real authenticated navigation still requires device qualification; no synthetic provider was added to production source.
