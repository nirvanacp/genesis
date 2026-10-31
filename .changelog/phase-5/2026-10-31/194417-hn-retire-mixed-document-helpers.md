# Retire HN mixed-document helpers

- Goal: Keep the HN example's source tree and README aligned with the migrated architecture for future customization.
- Changes: Removed unused source account mounting, source CSS, draft-field injection and target diagnostics, plus the unused source discussion tile binder. The shared owned-library tile-click helper remains. README now distinguishes active API-3 behavior from historical qualification and explicitly states original-form ownership and live draft protection.
- Decisions: The agent removed obsolete implementations rather than leaving examples that violate the new source role. Existing local draft records are preserved but are not replayed into source forms. Original website forms remain in the explicit provider, as required by the architecture; process-death restoration is not promised.
- Verification: HN TypeScript, manifest check and API-3 bundle build passed. Emulator verification with the narrowed SDK entrypoint passed owned story controls and preserved one-story Saved read-back. No test files changed.
