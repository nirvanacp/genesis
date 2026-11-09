# Multiple accounts

- Goal: Turn on multiple Google accounts in Gmail Only and check them with two signed-in sessions, as the user asked.
- Changes: `MULTI_ACCOUNT_ENABLED` is on. The adapter reads the session index from the page and the store corrects stored indices. Switching and opening saved emails go to `authuser=<address>`, so an item from another account opens in that account. "Show in inbox" now controls the Today card, unread counts clear on a switch, the search placeholder no longer claims to search all inboxes, and a second account on the same domain gets its own default name.
- Decisions: decision-0010 in [decisions](../.specs/decisions.md).
- Verification: typecheck, `tsc --noUnusedLocals`, `genesis-applet check` and build passed. Revisions 17 to 19 on emulator-5556 with two sessions: switching both ways, counts, cross-account open, "Show in inbox" and To-do. Not run: adding a session end to end, because Google asked for a CAPTCHA.
