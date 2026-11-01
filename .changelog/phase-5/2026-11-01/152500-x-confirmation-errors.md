# X confirmation error handling

- Goal: Preserve uncertainty if a source click throws or a relationship change needs confirmation.
- Changes: Source click failures quarantine the action token rather than invite a retry. Confirmation steps revalidate identity and remain scoped to a newly opened single source menu/dialog. An English Unfollow confirmation is accepted only when it is the unique matching command in that dialog. Extracted entity checks are explicit for posts, people cells and profiles.
- Decisions: Missing, localized or ambiguous confirmation markup times out as uncertain, never a guessed click or success. Private/requested account variants remain unqualified.
- Verification: X TypeScript and applet check/build passed. No real social mutation was submitted; live mutation persistence and inverse/private/localized confirmation qualification remain gaps.
