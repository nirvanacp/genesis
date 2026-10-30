# Genesis compact design emulator verification

The redesigned prototype is installed and running on emulator-5554, Android 17 API 37 arm64, Google System WebView 156.0.8078.47. This report updates the [earlier redesign report](122329-genesis-hn-redesign-verification.md). The emulator startup blocker was resolved by starting the existing device through Studio. No data wipe or uninstall occurred.

## Compact design changes

The user's density feedback replaces the spacious first iteration. Source story titles are 1.0625rem, the HN heading is 1.6rem and the packaged library heading is 1.75rem. Source padding, row gaps, folder tiles and dialog margins are smaller. Bookmark actions use labeled SVG icons with 44-pixel hit areas rather than a separate Save row. Saved story titles open discussions directly, so the duplicate Open discussion button was removed. Folder tiles are 80 pixels minimum instead of 124. Local-data copy is one short line. Four complete home stories were visible in the same portrait viewport where the first spacious revision showed about two; actual count varies with titles and text settings.

Original HN story rows, comment trees, account controls and links remain. HN table/colspan relationships are retained; changing those rows to grid caused overlap during verification and was removed. The current-section span receives the same readable pill treatment as ordinary navigation links. Self-post text receives body typography. Native Home/Back/Reload/Menu remain available.

## Fixes found during screen verification

- Corrected the selector that hid the outer header cell along with the logo.
- Used the actual bigbox list container instead of a nonexistent itemlist class.
- Kept native table flow and scoped story styling to submission rows, excluding comments.
- Corrected unreadable library action text and removed the duplicate action in the compact design.
- Prevented login from wrapping into several lines and kept the current section visible.
- The Android browser slot retained launcher views beneath the WebView. Removing those views before attaching the browser fixed launcher text showing through source navigation. This is generic host cleanup, with no HN-specific native behavior.

Commits: d0c10ac for the host transition and 191c99d for compact HN customization. Existing repository, storage, schema, managed bindings and inactive applets were preserved. No automated repository tests were added or modified.

## Observed checks

| Check | Result |
| --- | --- |
| Final install as update and launch | Passed; adb install -r succeeded and both existing bookmarks remained. |
| Home, New, Ask, Show | Visually inspected on the emulator. Original links navigate; compact story rows and bookmark controls render. Show displayed the existing saved state for SlideBySide. The final Ask navigation displayed its active pill and no underlying launcher. |
| Discussion | Original comments link opened the actual discussion. Title, metadata, self-post and comment form remained. A populated discussion was scrolled and showed nested comments and original reply/collapse links. No account action was submitted. |
| Save icon and Cancel | Compact source bookmark icon opened the matching Qwenputer Save dialog; Cancel returned without saving it. |
| Category creation and bookmark membership | Created Design QA in the existing bookmark dialog and explicitly saved its selection. Library showed the new folder and membership badge on item 50284521. |
| Rename | Renamed Design QA to Design notes through category management. Later views and install updates retained the new label and membership. |
| Category filter | Folder selection showed one matching story, distinct from All's two records. |
| Search feedback | An unmatched loaded-story query displayed the scoped no-matches message. Clearing it restored records. |
| Category deletion confirmation | Opened the inline warning, inspected Delete category permanently/Keep category and selected Keep category. Nothing was deleted. |
| Dialog scrolling | Swiping reached Save changes, Cancel and Remove bookmark. Save changes committed successfully. |
| Rotation | Ask HN survived landscape Activity recreation and returned to portrait with working navigation and controls. |
| Final state | The normal compact library is open with two real bookmarks and Design notes. |

The Design notes category and membership remain as qualification data. No existing bookmark was removed during this run. Software keyboard avoidance was not established because Studio hardware-keyboard input did not show the software keyboard.

## Commands and limits

npm run typecheck, npm run check:packages and git diff --check passed. With pinned JDK 17, android/gradlew -p android :app:assembleDebug :app:lintDebug --console=plain passed for the final build. That task compiled TS bundles and native ABI artifacts. The final build log is /tmp/genesis-compact-final-build.log. Install updates and Activity launches succeeded through the configured adb. UI interaction used computer control through Android Studio.

The APK is android/app/build/outputs/apk/debug/app-debug.apk. No setup blocker remains for the current emulator. Light appearance and the flows above are verified. Dark appearance, maximum text scale, TalkBack, software keyboard, every pagination state and a fresh full recovery/performance matrix were not repeated in this design pass. Their CSS/support code exists, but these checks are not marked passed. Earlier functional MVP reports remain historical evidence rather than proof of every redesigned state. Physical-device testing remains deferred to pre-release as requested.
