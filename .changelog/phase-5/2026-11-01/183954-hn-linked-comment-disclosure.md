# HN linked comment disclosure

- Goal: Resolve Greptile's review finding that same-page references scroll to replies that remain hidden under collapsed ancestors.
- Changes: Add a shared comment-reveal helper and use it in both HnLink and the foreground's local fragment handling. It opens the target disclosure and every ancestor disclosure before calling scrollIntoView. Update the applet README with the behavior.
- Decisions: The user requested this review repair and a commit. The agent kept native details disclosure and existing same-document checks, explicit website handoffs and missing-target routing. Opening the target itself also reveals its text when it was independently collapsed; unrelated branches remain closed.
- Verification: HN TypeScript, standalone applet check/build and whitespace checks passed. Disposable executable checks verified that nested collapsed ancestors and the target open before scrolling, that ordinary descendant targets work and that unrelated branches stay closed. No test files were added or modified. Device interaction and accessibility checks were not performed in this task.
