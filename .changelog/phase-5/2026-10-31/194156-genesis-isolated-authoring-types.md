# Isolated applet authoring types and starters

- Goal: Help future builders follow the isolated architecture directly from SDK types and generated projects.
- Changes: SourceAdapterContext exposes only observation, disposal and source publication/read-command callbacks. defineSourceAdapter checks the isolated source role at activation. SourceState distinguishes adapter states from host-only website/blocked states. Foreground commands require a source epoch in TypeScript, matching existing host enforcement. Vanilla and React starters subscribe to source state and recover through the current URL's explicit website view. Public guides reflect these contracts.
- Decisions: The agent added authoring-time guidance alongside native checks, without treating TypeScript as a security boundary. Both starter styles now demonstrate the same loading/recovery behavior and keep source and foreground separate.
- Verification: Workspace TypeScript, both applet CLI checks, fresh vanilla/React create/check/build, and a temporary compile-time role/epoch contract probe passed. No dependencies were installed and no repository test files changed.
