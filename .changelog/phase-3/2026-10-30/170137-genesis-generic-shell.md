# Generic source and shell selection

- Goal: make native navigation correct for applets with arbitrary source IDs and several websites.
- Changes: CreateView now carries its actual Selection; native section selection uses source/page pairs and preserves explicit detail ownership. Choices use declared source IDs and neutral View labels. Source presentation is limited to its bound source; local-page presentation checks the exact packaged path. Generic service errors no longer mention Saved stories. HN explicitly declares its choice source.
- Decisions: ordinary links to another source remain reader navigation; sources.open, sections, and choices explicitly switch the trusted context. Existing native sizing/chrome and HN product behavior are preserved.
- Verification: package checks, Rust compile/clippy, Android debug assembly/lint, and install-as-update on emulator-5554 passed. The HN launcher is present. Arbitrary-source and two-website runtime qualification follows the debug package store, which enables those temporary packages without changing the bundled selection.
