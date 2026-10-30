# Developer applet visibility

- Goal: Present HN and a single X entry while preserving installed diagnostic packages and data.
- Changes: Added atomic debug-only visibility metadata, correlated visibility imports, capability/status reporting and CLI visibility commands. The host carries hidden IDs independently of verified bundles; Rust validates them, filters launcher entries and rejects hidden startup restoration.
- Decisions: Preserve all IDs, revisions, databases and service connections. Release ignores private debug visibility. Unknown IDs, revision conflicts and malformed booleans fail without modifying visibility. The four identified external/hybrid/preview diagnostics are hidden on emulator-5554.
- Verification: Workspace TypeScript/package checks, strict Rust clippy, Android assembleDebug/lintDebug passed. Installed the host as an update and successfully applied visibility imports. Android Studio visibly showed exactly HN and X. No test files or user records were changed. Full X acceptance remains separate.
