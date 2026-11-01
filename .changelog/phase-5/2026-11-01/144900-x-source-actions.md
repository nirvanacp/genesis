# X source actions

- Goal: Separate live source action authority from cached post display.
- Changes: Added bounded validated interaction descriptors and retained request results. Like and Bookmark execute explicit desired states on revalidated live post controls. Requests use visit/account identity, sequence deduplication and an observation deadline. Source-disabled state is preserved.
- Decisions: Repost and Follow confirmation execution remains gated until live source confirmation qualification. No generic selectors or provider fallback execute mutations. This is a staged implementation, not completed interaction parity.
- Verification: X TypeScript and applet check/build passed. No real social mutations submitted. Confirmation qualification and device integration remain pending.
