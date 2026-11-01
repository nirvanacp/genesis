# X UX repair verification

## Scope and delivered behavior

The user reported Explore reopening one specific post, missing pull-to-refresh, inconsistent fonts and other broken interactions in Android Studio. Investigation reproduced concrete defects in both the generic Android shell and the X applet. The earlier route-by-route acceptance missed mixed navigation, refresh expectations and source-epoch Back registration. This report qualifies the repairs below, without claiming that every X feature or device configuration has been tested.

The installed X applet remains `x-bookmarks`, schema 2 / API 3, SDK/tools 0.4.0. Final bundle revision is `b39d065819e075dcf7b702f0edc89e0048e5e04c9e3ab6c371d87ccddd156c13`. The Android debug host `app.nirvana.genesis` was built from this workspace and updated in place on `emulator-5554`. X and HN remain the two everyday launcher entries. No package IDs, record schema, backend credentials or database were reset.

Native primary buttons now open their declared source/page entry and recreate the owned screen, clearing child destinations, transient cached presentation and viewport offsets. Internal SDK navigation and website return retain their ordinary lifecycle. X adds top-edge pull/button refresh, current-URL cache replacement, destination-kind model validation and per-epoch Back registration. Categories refresh uses its existing authoritative backend. Shared type tokens cover content and dialogs; measured header heights drive sticky tabs and refresh feedback. The native footer adapts to enlarged text while preserving bottom navigation and accessible names.

## Observed defects and results

| Journey | Before | Verified result |
| --- | --- | --- |
| Search result, post, Home, Explore | Explore restored the child post | Passed on the final installed build. The native Explore button opens its entry with an empty search field, including after a long post. |
| Primary reselect after scrolling | Source reloaded while the owned viewport stayed more than 1,000 CSS pixels down | Passed. Read-only owned inspection measured a later reselect moving from 447px to zero; a fresh foreground also clears presentation caches. |
| Short pull and ordinary scrolling | Refresh unavailable | Passed. Short pull canceled without epoch change; downward mid-list scroll did not refresh. A full top-edge pull advanced the source epoch and completed on real ready rows without opening a post. |
| Refresh button and search query | No common refresh action | Passed. The exact current query/URL survived refresh; busy state ended after the replacement source result, not dispatch acknowledgement. |
| Offline refresh and recovery | No verified refresh failure path | Passed. Emulator Wi-Fi/data were temporarily disabled, an owned error released the control, original connectivity was restored and online refresh recovered. |
| Categories refresh/filter | No common list refresh gesture | Passed. A pull advanced the actual library read counter from 4 to 5 without changing source epoch. Two existing saved rows remained. Filtered refresh and return to All saved were exercised without record writes. |
| Refresh, More, Back | Back exited X to Genesis while the menu was open | Passed after re-registering the handler per source epoch. Back closes only the menu. Categories, Home, More, Back also passed. |
| Body/dialog typography | Feed body was 15px; category filter inherited the SDK's 16px | Passed computed-style comparison. Feed, filter and sheet use the same family and 15px body. Metadata and heading differences are intentional hierarchy. |
| Sticky search tabs | A roughly 58px header used a fixed 53px offset | Passed with measured offsets. At 320 CSS pixels, doubled system text and dark appearance, the header was 74.67px and the sticky offset matched it; document width remained 320px. |
| Enlarged native footer | Labels clipped; a first wrapping attempt still truncated Notifications | Passed with adaptive icon controls when captions cannot fit. All five full accessible names and adequate touch bounds were present; web content ended above the footer. Normal-size labels remain. Home/Explore taps passed at enlarged text. |
| Website handoff/return | Needs preservation across shell changes | Passed bookmark-post provider entry and native Close without submitting a bookmark. Source/internal-page return also passed. |
| Saved root after Categories | Could restore an internal child as the section entry | Passed. Native Saved opens source Bookmarks and clears the private Categories child. |
| Own profile and notification tabs | Neighboring X navigation | Own Profile exposes the expected Edit profile handoff; Notifications/Mentions entry was exercised on the final build. This is not a new qualification of every notification row or protected form. |
| HN neighboring sections | Shared native shell could regress another applet | Passed declared Search placeholder, Saved and Home entry navigation. HN comments/Back was exercised earlier in the repair. No HN code or records changed. |

Checks were incremental after each component install. The final mixed-route/profile/notification entry smoke used the final host and bundle. Earlier gesture/offline/receipt-read checks were not all repeated after later presentation-only changes. Native and content tabs with the same name were explicitly distinguished in the final checks. A long post's activity control was below the viewport, so its visible Post heading was used to qualify the destination instead of treating an offscreen control as missing.

## Static verification and cleanup

Passed workspace `npm run typecheck`, standalone X `check`/`build`, offline Android `:app:assembleDebug` including both native ABIs, and `git diff --check`. Offline `cargo test --locked --offline -p genesis-android` compiled successfully but that target contains zero unit cases; it does not supply behavioral test coverage. No repository tests were added or modified.

The user had authorized ADB screenshots/taps. Read-only local inspection measured owned epochs, counts, geometry and computed styles; no private content, credentials or message bodies are included in this report. Android UI-dump processes occasionally exited 137 or returned a null root; those tool failures were retried and kept separate from observed app results. One approval-review quota interruption prevented an install attempt until the user resumed; the later install succeeded.

Original font scale 1.0, density 420 without override, light appearance and connectivity settings were restored after temporary checks. No disposable categories/posts were created in this repair. Existing categories and saved rows remain authoritative in their original backend. Protected social/account workflows stopped at entry/return; no post, message, follow, like or bookmark mutation was submitted. The temporary inspector forward and device UI dump were removed, and X was exited/reopened on Home. See the [acceptance change record](../../../.changelog/phase-5/2026-11-01/065059-x-ux-repair-acceptance.md).

## Limits

Native X itself was unavailable; system typography and the inspected mobile website remain the reference rather than proprietary-font or exact native parity. Real video/audio playback, physical devices, TalkBack, localized/Premium-only layouts, account switching, production multi-user provisioning and frame-by-frame source-isolation qualification were not performed. The Android accessibility dump still omits the search input's name despite its owned HTML label; touch/keyboard search works, and that exposure needs follow-up. No claim of complete X feature parity or absence of every possible UX defect is made.

## Component commits

| Commit | Record |
| --- | --- |
| `57d5dd0` | [Declared primary roots](../../../.changelog/phase-5/2026-11-01/050700-android-primary-section-roots.md) |
| `39ea8ea` | [Pull-to-refresh](../../../.changelog/phase-5/2026-11-01/051200-x-pull-refresh.md) |
| `f8bb9a1` | [Owned viewport reset](../../../.changelog/phase-5/2026-11-01/052500-android-primary-viewport-reset.md) |
| `1c46740` | [Back after refresh](../../../.changelog/phase-5/2026-11-01/053100-x-back-after-refresh.md) |
| `585e3e3` | [Shared typography](../../../.changelog/phase-5/2026-11-01/053300-x-shared-typography.md) |
| `2fd60c0` | [Scalable primary footer](../../../.changelog/phase-5/2026-11-01/063500-android-scalable-primary-footer.md) |

The final documentation commit updates current applet/phase/factory guidance with these results and connected verification sequences.
