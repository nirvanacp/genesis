# Navigation review fixes

- Goal: Resolve review findings where a delayed Back action could navigate twice and a remembered section could reference a source or page removed by a package update.
- Changes: `android/native/src/controller.rs` now compares the saved route revision at the Back deadline before navigating. It validates remembered section selections against the current manifest on session restore and again when opening a section, falling back to that section's declared destination when invalid.
- Decisions: The user requested fixes for the four attached review comments and commits. The agent kept the checks in the generic host because both failures affect any applet. A route change consumes the pending Back request without a second navigation; section validation preserves valid remembered destinations.
- Verification: Strict native Clippy passed. The existing native test command passed but found zero tests. `git diff --check` passed. No device navigation was exercised for this repair.
