# Contextual browser motion

- Goal: Avoid presenting every navigation as the same vertical screen entry.
- Changes: Retained section restoration uses a short opacity reveal. Browser Back/Forward and child reader entry/Close use directional 24dp horizontal reveals over 200ms. New app/section selections reset direction. Readiness gating remains intact, and canceled or disabled animations reset opacity and translation.
- Decisions: Preserve source-managed SPA transitions. Platform code carries generic intent without inspecting X routes. Android animator settings suppress motion. This bounded host change does not establish native-client frame pacing or gesture parity.
- Verification: Android debug assembly and lint passed. Physical-device pacing and authenticated X overlay transitions remain unverified. HN feed rendering was observed after target changes. No screenshot copies of private pages or permanent test files were introduced.
