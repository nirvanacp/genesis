# Genesis Android phone verification

Verified on 29 October 2026, Asia/Kolkata. Scope: the customized Hacker News app, Android host and applet HTTPS bookmark integration. The user narrowed the remaining work to the customized app rather than exploring publisher websites.

## Result

The final debug APK is installed and usable on the physical Samsung Galaxy M30s, SM-M307F, Android 11 / API 30, arm64-v8a, 1080 × 2340. The provider is Android System WebView 156.0.8078.47. This is qualification of one physical phone and provider, not the entire supported Android matrix.

Production distribution is not ready yet. The release APK is unsigned, and the verified bookmark backend still depends on a Mac-hosted HTTPS process reached through the phone's USB adb reverse tunnel. Standalone release use needs signing and a reachable service connection with a production credential lifecycle. No Node runtime or phone backend supervisor is bundled.

## Phone checks

| Check | Observed result |
| --- | --- |
| Install and launch | Debug APK installed successfully on the actual Samsung phone. Native app shell, YC mark, right-aligned feed selector and all five footer icons render. Physical-device rendering stays accelerated. |
| Home feeds | Top, New, Ask, Show and Jobs render with customization and native tabs. Feed choices update the header label. Past and Comments were not individually qualified on this phone. |
| Story navigation | Story background opens its HN discussion. Discussion uses app Back and tabs without browser URL controls. Article title/Visit website opens the separate reader. |
| Discussion layout | Found and fixed an oversized blank left column and narrow comment form. The corrected title and form use the available width. No comment was submitted. |
| Search | Intended placeholder renders in its own native section. |
| Saved | Local bookmark creation, library read, edit/save, confirmation and removal succeeded. The verification bookmark was removed. No HN favorite was changed. |
| Backend startup | Fresh-install private provisioning initially failed because files/ did not exist. The creator tool now creates it privately before importing. Android acknowledged authenticated HTTPS health. |
| Backend interruption | Removed only the phone's reverse tunnel. Returning to Saved showed temporary unavailability and Reload library while retaining the existing row. Restoring the tunnel and retrying recovered the library. |
| Process recreation | Backgrounded Genesis, killed its background process and reopened the existing task. Confirmed a new PID and restored Saved selection with the saved row. An earlier immediate kill attempt did not kill the process and was not counted as a pass. |
| Account | Real sign-in and sign-out succeeded. Me showed the correct account links. Profile/settings, My submissions, My comments and HN favorites opened within app chrome and returned with Android Back. No settings, votes, stories, comments or favorites were submitted. |
| Retained Post after sign-in | Reproduced stale login UI by opening Post while signed out, signing in through Me and returning to Post. Fixed and replayed on the final APK: the submission form appears. |
| Retained Post after sign-out | A second check found that the minimal Submit header was wrongly treated as signed-out account evidence. Fixed identity detection to require an actual profile or login link. Final APK replay passed: sign-out through Me refreshes the retained Post form to the login-required page. |
| Drafts | A uniquely named unpublished verification title survived switching through Home, Search, Saved and Me, which evicted Post. Discard draft then cleared all three public fields. No publication was attempted. This draft check preceded the final small header-selector correction. |
| Customization failure | Debug creator-failure simulation displayed the native recovery cover. Retry restored the customized Jobs feed. Native tabs remained available. |
| Loading covers | Recording covers failure recovery, Jobs, feed selection, Top and discussion loading. Sampled one frame per second: the reviewed frames show opaque loading covers followed by customized content. This does not establish absence of every single-frame flash. |
| External boundary | Opening a story URL showed publisher content with native origin/reader controls and no HN tabs. Root Back and explicit Close returned to the customized app. Deep publisher flows were stopped after the user's scope correction. Forward was not qualified: it did not become enabled during one attempted publisher navigation sequence, so no successful Forward result is claimed. |

The password was used only for authorized login, declined when Android offered password storage, and was not written into source, packaged assets or this report. Raw authenticated page XML and account-setting values are not included in the saved evidence. Final phone state is signed out, on Home, with the development backend tunnel restored and the verification bookmark and draft removed.

## Fixes committed during qualification

- `90cbf95` creates the app-private directory before fresh-install service provisioning.
- `eb88bcf` scopes feed table styling away from the discussion header and makes the discussion form fill its column.
- `6830570` keeps headerless login documents subscribed to public account-identity changes.
- `8e3f656` distinguishes explicit account links from minimal submission headers, verified in both sign-in and sign-out directions.

Public identity coordinates retained pages through applet storage. Cookies remain in WebView. Pages without account evidence capture the public identity at activation and reload on focus when it changes; they do not overwrite account identity just because their header omits the user link.

## Build and package checks

- `npm run typecheck` and `npm run check:packages` passed after the final correction.
- `:app:assembleDebug :app:lintDebug :app:assembleRelease :app:lintRelease --offline` passed after the final correction using the configured Android Studio JDK and installed toolchains. Lint reports zero errors and 33 warnings. One existing warning concerns the temporary popup WebView lacking a renderer-exit handler; popup/renderer qualification remains open.
- Debug APK signature verification passed. Both APKs passed `zipalign -c -P 16 4`.
- Release signing report has null configuration, store and alias. The release artifact is intentionally named app-release-unsigned.apk and is not an installable signed release.
- `git diff --check` passed. No test files were added or changed.

Artifacts relative to the workspace root:

- `android/app/build/outputs/apk/debug/app-debug.apk`, installed phone build. SHA-256 `6090f7cdcf517b1a6f6485cc36d32f8b9946c06ef038d4bbd096a9b789eb0208`.
- `android/app/build/outputs/apk/release/app-release-unsigned.apk`. SHA-256 `87be68f1cd5916e71e1c897681b025096ac2050ef4b532da793ea51747e592ea`.

## Evidence and remaining release work

[Final Home](genesis-android-phone-evidence/home.png), [corrected discussion](genesis-android-phone-evidence/discussion.png), [Saved after process recreation](genesis-android-phone-evidence/saved-after-process-recreation.png), [failure recovery screen](genesis-android-phone-evidence/customization-failure.png), [customized navigation recording](genesis-android-phone-evidence/customized-navigation.mp4), [sampled recording frames](genesis-android-phone-evidence/navigation-sampled-frames.png).

The recording predates the account-refresh correction and is evidence for the recorded navigation only. The final account fix was checked separately through the actual signed-in and signed-out forms on the rebuilt phone APK.

Remaining work is tracked in TODOS.md: production signing and service provisioning; an authorized real-post check; source-network, TLS, popup/download and renderer failures; TalkBack, font scaling and other Android/provider versions; the remaining route matrix. The attempted publisher Forward check remains unqualified. Broad publisher-site exploration was explicitly excluded from the remaining task.

Automatic approval review rejected the pending publisher-history action after the user narrowed scope. It did not execute. The verification continued with customized HN app actions only.
