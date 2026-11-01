# X owned action controls

- Goal: Stop presenting post mutations and sharing as generic original-post links.
- Changes: Added foreground interaction tracking, Like/Bookmark buttons, owned Repost options, share/copy sheet and shared feed/media action rendering. Cached rows cannot dispatch without current descriptors. Nested/modified post clicks preserve control semantics. Categories links no longer show a hard-coded external arrow.
- Decisions: Keep website editors and explicit website cues. Repost/Follow execution qualification and editor contextual-route qualification remain pending; disabled controls do not claim support.
- Verification: X TypeScript and applet check/build passed. Native chooser integration and connected device acceptance follow in later steps. No real social action was submitted.
