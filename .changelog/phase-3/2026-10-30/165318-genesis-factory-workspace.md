# Factory example workspace

- Goal: place applet examples under factory and make bundled selection explicit.
- Changes: preserved and completed the pre-existing applet relocation, updated npm workspace/lock metadata, tsconfig paths, Gradle inputs, current instruction paths, and genesis.packages.json selection. HN remains the sole bundle; X/YouTube stay inactive.
- Decisions: the user authorized implementation after the documentation checkpoint. Manifest and service IDs, source records, signing, and private data locations remain unchanged. Historical reports retain their original paths.
- Verification: all three manifests compare equal to their previous versions. Existing npm dependencies installed offline and TypeScript/package checks passed. Android debug assembly/lint passed. Device data retention is verified later with the package installation qualification. The initial shell npm resolved version 9.5; subsequent commands use the pinned npm 11.14.1 executable.
