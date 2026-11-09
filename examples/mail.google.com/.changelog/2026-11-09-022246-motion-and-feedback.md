# Motion and feedback

- Goal: Make Gmail Only feel less rigid, with transitions between screens, motion for sheets and menus, and loaders and feedback for every event, as the user asked.
- Changes: A `Stage` and ghost layer give screens push, pop, fade and drawer motion; sheets rise, can be dragged closed and keep the screen under them in place; popovers, tabs, badges, toasts and the segmented control move. Skeletons shimmer after a short delay and open emails get an email-shaped one. A progress bar shows refreshes and running toolbar commands. Pull to refresh, optimistic star and selection, swipe archive that slides the row away, and Undo toasts for completing and dismissing items.
- Decisions: decision-0009 in [decisions](../.specs/decisions.md).
- Verification: typecheck, `tsc --noUnusedLocals`, `genesis-applet check` and build passed. Revisions 13 and 14 on emulator-5556, dark and light: the motion and feedback journeys listed in [current](../.specs/current.md). Not run: swipe archive and toolbar commands, which change the account.
