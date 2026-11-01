# X navigation and control completion

- Goal: Make overflow and pending read behavior match the controls shown.
- Changes: Replaced trend/media ellipsis website shortcuts with owned options dialogs. XLink now takes an explicit website action ID, prevents repeated activation and exposes Retry after resolution/activation failure. Load more waits for observed content change or reports no progress. Profile Follow selection excludes nested post/person controls.
- Decisions: Keep the existing read channel and observe load-more completion in the foreground rather than introducing a second transport for read receipts. Normal website cues remain only on actual navigation.
- Verification: X TypeScript and package check/build passed. Live interaction and accessibility checks follow delivery; social mutation persistence remains unqualified.
