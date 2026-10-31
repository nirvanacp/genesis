# X overflow return navigation

- Goal: Keep native Back dismissing a post menu after visiting and leaving the private Categories page.
- Changes: The foreground registers its post-menu Back handler when the active owned destination changes, and yields that handler while the library owns Back. Leaving the library re-registers the foreground handler after its scoped cleanup.
- Decisions: Live verification showed Back returning to Categories instead of closing the post menu after a Categories-to-Home round trip. The SDK exposes one active Back handler; the library replaced the foreground's initial registration, and its cleanup did not restore it. The agent fixed registration in the X foreground rather than changing the shared SDK or duplicating native navigation.
- Verification: X TypeScript/build and whitespace checks passed. Installed revision `278115047dde5fdd98735d6746496e32ab552c6098be7614ca7f7c1f51c36e8b` passed the actual launcher → Saved → Categories → Home → overflow → native Back sequence. Back closes the menu and leaves the Home feed visible, with no save/bookmark menu items remaining in accessibility. Stable applet identity and records are unchanged.
