# Genesis two-app implementation status

The working emulator now presents exactly Hacker News and X. The four previously installed diagnostic applets are hidden through the new generic visibility capability; their code and data remain intact. IDs hn-bookmarks and x-bookmarks are unchanged.

Implemented components:

- `0eb4aa8`: atomic debug visibility imports, CLI support, status capability, host metadata validation and hidden startup/launcher handling.
- `f4b0f41`: X source navigation remains available until adaptation is ready; missing anchors restore source controls, and managed navigation errors are visible.
- `fa8715f`: Hacker News label and 48px Save/vote targets with matching reading-column reservations.
- `8f5f21c`: retained-section opacity reveals and directional Back/Forward/reader transitions with cancellation and animator-disabled reset.

Verification passed for workspace TypeScript, selected-package validation, both applet checks/builds, strict Rust clippy, existing Rust test command, Android assembleDebug/lintDebug and whitespace checks. Rust targets contain zero tests, so that command is not behavioral coverage. Updated host and applets were installed as replacements. Android Studio visibly confirmed the two-entry launcher and the HN feed after target enlargement. Development status confirms diagnostics remain hidden after package updates.

X remains signed out. One ordinary username submission returned the upstream temporary login limit. The password was neither entered nor saved. This blocks real timeline/profile/conversation/media/composer/category account qualification. No source post/message/bookmark/account mutation was made. Synthetic records were not introduced into the real applet.

Outstanding required work includes actual source/category save independence, website-owned file byte delivery and X attachment preview, source overlay Back, redirect/reader return, account-change and process-lifecycle flows, keyboard/TalkBack/dark/reduced-motion checks and physical-device pacing. Final two-package APK selection remains gated on real core X acceptance. The plan is partially implemented, not complete. Existing category backend/client/UI code is retained but its integrated authenticated behavior must still be verified.

Use the controlling `214048-genesis-two-complete-applets-plan.md` and `225100-genesis-launcher-visibility-guide.md` for continuation. Other pre-existing uncommitted factory guidance changes and the untracked earlier architecture snapshot were preserved separately.
