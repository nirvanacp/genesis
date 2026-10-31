# HN story link semantics

- Goal: Preserve existing HN title, discussion-tile and domain-filter behavior in the owned foreground.
- Changes: Story titles open their actual submitted destination through normal internal/provider routing; explicit comments and blank story areas open discussions. Shared tileClick preserves nested controls and selected text. Domain labels open the declared from-site feed with an adequate touch target.
- Decisions: The agent preserves the original title/article behavior while retaining an explicit discussion action, rather than changing every title into a discussion link during rendering migration. Internal HN destinations remain eligible for owned routing.
- Verification: HN TypeScript, manifest check and bundle build passed. Emulator opened a currently visible public story title, rendered the real external article under its actual origin, closed back to HN, and opened the corresponding owned domain-filter feed. No records were changed and no test files added.
