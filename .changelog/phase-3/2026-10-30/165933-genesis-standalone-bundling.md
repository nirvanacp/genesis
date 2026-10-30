# Standalone applet validation and build

- Goal: build applets using public SDK artifacts without the native toolchain or monorepo paths.
- Changes: added check/build/readBundle libraries and CLI, strict contained-file and asset checks, deterministic canonical bundle revisions, and guarded output replacement. Platform package selection and APK asset generation now use the same implementation. Frontend stages no longer require Cargo.
- Decisions: use minified output without source paths for reproducibility; reject backend imports and source escapes. Backend startup remains an explicit creator operation. Keep the APK index format compatible while external bundles use API/format version 1.
- Verification: packed SDK/tools installed offline into a temporary external workspace; DOM and React entries built with a PATH containing no Cargo/Android tools. Two HN builds produced identical revisions. Symlink escape and undeclared bundle files were rejected. Workspace type/package checks, script syntax, Android debug assembly/lint, and diff checks passed. Device runtime qualification follows the package store component.
