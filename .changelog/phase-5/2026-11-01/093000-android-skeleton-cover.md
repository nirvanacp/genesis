# Android transition skeleton cover

- Goal: remove the remaining visible native loading prose during applet startup and explicit website transitions.
- Changes: the host cover uses three neutral gray title/text groups while loading, with a native accessibility status. Light/dark appearance uses matching neutral tones. Failure notices restore their original headings, messages and recovery controls.
- Decisions: keep this generic host presentation independent of applet content, source isolation and lifecycle. The foreground remains responsible for content-specific skeletons; the permanent opaque source barrier is unchanged.
- Verification: offline Android assembleDebug/lintDebug passed. Installed transition and failure-recovery checks follow the final build.
