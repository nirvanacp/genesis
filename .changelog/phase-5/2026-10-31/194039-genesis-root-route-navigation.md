# Root-route navigation chrome

- Goal: Keep root-feed controls available after moving between declared source feeds.
- Changes: The isolated reducer determines detail presentation from owned-page selection, navigation history and the source's declared homePaths. Root paths retain their native view chooser even when earlier visits exist in Back history. Actual detail routes keep Back presentation.
- Decisions: The agent reused the existing generic homePaths contract instead of adding HN-specific paths or treating every historical navigation as a detail screen. This repairs a visible feed-chooser regression without changing source permissions or stored records.
- Verification: Rust clippy, the temporary lifecycle verifier for both manifests, and Android assembly/lint passed. Emulator moved HN Top to Comments and kept Choose view visible, then selected New and verified the chooser again. No test files changed.
