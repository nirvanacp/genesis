# Navigation contract foundation

- Goal: Implement the first component of the approved explicit-navigation plan without changing active applet execution prematurely.
- Changes: Added schema-3 navigation policy/actions, typed targets/decisions, matching pure Rust and JavaScript resolvers, strict authoring validation, structural schema and SDK manifest declarations. Existing API-3 route resolution remains unchanged.
- Decisions: The user authorized implementation. API-4 execution and package acceptance remain gated until the host stage is verified; current runtime/version constants stay at 3. The resolver rejects mismatched sources/actions and overlapping origins, distinguishes external and uncovered destinations, and preserves exact query/fragment identity.
- Verification: Workspace Cargo check/test, tools syntax and SDK build passed. A disposable out-of-tree Rust/JavaScript comparison exercised 17 identical decisions, malformed URLs, wrong actions/sources and invalid metadata; existing X/HN/YouTube manifests still validate. No test files changed. Host enforcement, applet migration and live API-4 acceptance remain subsequent plan stages.
