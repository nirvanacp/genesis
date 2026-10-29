# Genesis HN redesign verification

Scope: HN source customization, packaged saved-story/category views, bookmark dialogs and minimal generic Android chrome. Implementation is committed; final visual acceptance is pending emulator recovery.

## Design and architecture

The supplied Home, Comments and Saved images guide warm paper surfaces, serif story headings, rounded cards, orange bookmark accents, folder tiles and compact persistent navigation. This is an Android WebView app with TypeScript customization and React local pages, so Apple guidance supplies design principles rather than iOS system chrome. Original HN DOM, links, comment trees, pagination and account actions remain. No API feed replaces the website. There are no fake account/search tabs, invented category counts or simulated comment sorting. The library field explicitly filters loaded stories, with a load-more explanation when more records exist.

Applets own theme.css, source.css, library.css, styles.css and the navigation/dialog/category components. Existing extraction, managed lifecycle, SQLite repositories and pagination remain in use. Saved controls read category names and refresh when categories change. Category management is a separate local view with create/rename/delete controls. Bookmark removal and category deletion now request explicit inline confirmation. Empty, loading, canceled-scan, missing-record and error states retain the same visual language. No storage schema or Rust change was needed.

The native host keeps Home/Back/Reload/Menu and failure recovery. It uses equal-width controls, hides the redundant ready status, and supplies light/night appearance without adding HN-specific host commands. The night Android theme also lets WebView report the matching preferred color scheme.

Commits: d03f8e5 for native chrome and d9dc7ce for HN customization. The working branch was proto/phase-2; unrelated/inactive applets were preserved. No automated repository test files were added or modified.

## Guidance consulted

Read the project apple-design-skill and its linked repository references, including accessibility, layout, typography, color, buttons, modality, lists/tables, iOS design, tab bars and cross-platform translation. Remote references were read because the local skill copy lacks its references directory.

- [Accessibility, Vision](https://github.com/dickwu/apple-design-skill/blob/main/references/hig/accessibility.md) calls for larger text and adaptable interfaces. The design uses relative type, wrapping content and no fixed-height story cards.
- [Layout, Visual hierarchy](https://github.com/dickwu/apple-design-skill/blob/main/references/hig/layout.md) informed grouping, indentation and separate controls/content.
- [Buttons, Best practices](https://github.com/dickwu/apple-design-skill/blob/main/references/hig/buttons.md) informed touch targets, visible focus/press states and restrained primary actions.
- [Modality, Best practices](https://github.com/dickwu/apple-design-skill/blob/main/references/hig/modality.md) informed the single bookmark task and explicit Cancel controls.
- [Cross-platform translation](https://github.com/dickwu/apple-design-skill/blob/main/references/cross-platform.md) maps semantic colors to CSS variables and screen-reader labels to ARIA. Android system controls and recovery are retained.

Computed WCAG contrast on intended surfaces: light ink #24211c on #faf7f2 is 15.01:1; muted #655d53 is 6.06:1; accent #b93800 is 5.42:1 on paper and 4.82:1 on #f3e9dc. Dark ink #f5eee4 on #1d1b18 is 14.92:1; muted #c4b8a9 is 8.82:1; accent #ff995f is 8.16:1. These calculations do not certify every legacy HN control or TalkBack behavior. Focus, reduced-motion and increased-contrast CSS are included. Full screen-reader and large-font testing remains pending.

## Checks and current blocker

- npm run typecheck passed all workspaces.
- npm run check:packages passed for hn-bookmarks.
- git diff --check passed.
- With pinned JDK 17, android/gradlew -p android :app:assembleDebug :app:lintDebug --console=plain passed. This compiles the TS bundles and both native ABIs. Final log: /tmp/genesis-redesign-final-build.log.
- Lint initially caught an API-27-only XML navigation-bar attribute. Removed it while preserving API-26-compatible Java styling; the final lint run passes.
- An earlier redesign candidate installed with adb install -r, without clearing data. Its native launcher was captured in Android Studio. Feed taps could not be confirmed before the emulator disconnected.
- adb devices now lists no device. Restarting the existing Medium_Phone_API_37.0 AVD, including a cold boot without snapshot loading, reaches the emulator crash-report dialog before adb becomes available. No wipe/uninstall occurred. The user was asked to dismiss the dialog and start the AVD through Android Studio.

The final APK is android/app/build/outputs/apk/debug/app-debug.apk. It is built but has not been installed or visually qualified after the final refinements. Do not transfer the previous MVP's full visual/workflow acceptance to this redesign.

## Remaining visual acceptance

After emulator recovery, install the final APK as an update. Inspect feed/news/newest/Ask/Show pagination and actual discussions; original title links, votes and comment collapse must remain usable. Open Saved through the applet bottom navigation and native menu; inspect existing records, category tiles/filters, management, loaded-story search, empty/error/progress states and the bookmark dialog. Exercise create/rename/category selection and cancel, confirming both destructive actions before any removal. Verify source/library return, portrait/landscape, large font, dark mode, keyboard avoidance and recovery. Fix visual/integration defects before marking this redesign accepted. Physical-device repetition remains a pre-release task.
