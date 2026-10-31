# X applet UI audit and verification

Scope: `factory/applets/x.com` only, branch `proto/phase-4`, 31 October 2026, Asia/Kolkata. The user's current requirement is the mobile X website's content and workflows with native shell navigation, plus private categorized saving. This supersedes the earlier custom account hub. Hacker News source remains outside this task. During investigation the user authorized a generic host rendering preference and then specified that any applet must be configurable through Genesis, rather than through an X-specific manifest flag.

## Findings and corrections

| Finding | Cause | Correction | Verification |
| --- | --- | --- | --- |
| Two bottom navigation bars and overlapping feed content | Current mobile X has `nav` containing `AppTabBar_Home_Link`; older `BottomBar`/`AppTabBar` selectors miss it. Adaptation also required a desktop-only profile anchor. | Recognize the mobile layout and its actual navigation container. Keep the host footer as the one primary bar. | Passed across primary sections, search, profile and details |
| Same Explore content under Explore and Alerts | Source footer allowed navigation inside a different retained native section. | Hide redundant source navigation; label the real source destination Notifications. Preserve X's All/Mentions tabs. | Correct route and All/Mentions observed |
| Distorted glyphs, clipped compose button and broken video painting | The host forces software layers on customized emulator WebViews. DOM bounds and computed font metrics were normal while the painted output was distorted. | Per-applet host rendering chooser. Switching X to hardware acceleration immediately corrected text, compose and video in place. Preserve original X fonts; rejected blanket font overrides because they do not address the renderer. | Passed on real source; persisted across package update and process restart |
| Main feed becomes narrow when adaptation activates | Custom navigation/status mounted before `primaryColumn`, creating siblings in X's horizontal column layout. Main width/alignment overrides compound this. | Mount before the column's first content child, inside the column. Remove source layout width overrides. | Passed on real feeds, search and profiles |
| Profile section introduces an invented hub and duplicate links | Account source replaces Home with “Your X” and a separate destination list. | Open the actual signed-in profile. Remove the extra Post shortcut, keeping X's composer. | Passed; actual profile and Posts/Replies/Reposts/Media tabs observed |
| Category actions cannot verify the signed-in mobile account | Only desktop `AppTabBar_Profile_Link` recognized. | Read only the signed-in bootstrap entity and validate mobile account controls, never infer account identity from the viewed author. | Passed with authenticated source save and library entry |
| Category backend unavailable | Existing local service stopped. | Restart the existing declared service and restore its emulator connection, preserving its database. | Service helper reports ready |

Additional issues found during iteration:

- Hiding the entire source banner removed its 100-pixel header spacer, obscuring first headlines. Preserve the banner and hide only the actual primary navigation.
- Saved had two tab rows with duplicated bookmark destinations. Categories now joins the source Bookmarks/Likes row; the owned library uses those same three destinations.
- SDK qualification defaults overrode the library host's inherited font/color, and short pages exposed its beige background. Set the font/color and full viewport background on the actual library wrapper.
- The library manager's back link extended off the left edge. Use a positive inset.
- The Home Messages row changed the source timeline offset and exposed its pull-to-refresh indicator. The action now sits beside the profile button in the inspected source toolbar; live Home and the source chat setup gate passed.
- X's Communities discovery redirect caused native browser Back to loop through the redirect. A route-specific handler invokes X's own Back control.
- Removing a category while its filter was retained left the library requesting a missing category. Clear that obsolete filter and reload All saved, preserving real backend errors as errors.

## Acceptance flows

| Flow | Expected behavior | Result |
| --- | --- | --- |
| Launcher → Home / Following → detail → Back | One native footer, readable text/media, source actions preserved, opener restored | Passed real For you/Following feeds, post and quoted video, photo overlay and native Back; no upstream actions submitted |
| Explore → topics / search / result tabs | Source search and topic tabs preserved, no duplicated primary bar | Passed Explore and News, live search `from:NASA`, Top/Latest results and photo viewer → native Back |
| Notifications → All / Mentions | Real notification content, distinct from Explore | Passed actual All feed and source Mentions empty state |
| Saved → X bookmarks / Categories | Two explicitly separate authorities; one Saved section | Passed source Bookmarks and Likes, consolidated Categories tab, owned three-tab row |
| Save post → create/select categories → save → reopen | Real backend persistence, correct post identity, independent upstream bookmark | Passed with a temporary category and one real public post; X bookmarks remained empty |
| Categories → search / filter / manage / live post → Back | Retained filters and usable return, errors distinct from empty state | Passed search match/no-match, filter, create/rename, two memberships, real-post open/Back with retained filter, manager inset and removed-filter recovery. Backend guard/cleanup passed |
| Profile → replies / media / following | Actual X profile, no custom hub | Passed Posts, Replies, Reposts, Media/Videos and Following list; no follows changed |
| Account drawer → Lists / Communities → Back | Original source pages and correct opener | Passed Lists discovery/empty list and Communities live feed/video. Final native Back returned to the retained Following feed without a redirect loop |
| Composer / Messages / settings | Website forms and gates preserved; no posts/messages submitted | Passed original blank composer and native Back; Home Messages reached X Chat passcode setup; Settings opened with source-owned controls and one source footer in ordinary presentation. No posts/messages, passcodes or account changes submitted |
| Portrait → landscape → portrait | Source reflows and one primary footer remains usable | Passed Home/Following layout inspection at both orientations; portrait restored with the same source content |

## Build, service and scope evidence

- Final installed X revision: `6b7e842e450cb2836cd35052fb9d7be43b635792002a776898566a8326bafa52`, SDK/tools 0.3.0, runtime API 2. Development import receipt and status agree.
- Host debug APK SHA-256: `c5a84152ba833f6e4b611c6cad21505383e32c4d330f60eb539da62127052558`. Android API 37 emulator, Google WebView `156.0.8078.47`.
- Passed `npm run typecheck --workspace=@genesis/applet-x`, standalone applet `check` and `build`, backend syntax checks and `git diff --check`. Android `:app:assembleDebug :app:lintDebug` passed with zero errors and 35 existing warnings. No test files added or modified.
- Existing personal service restored, database/token preserved, local TLS tunnel restored after emulator restart. Live source save/read-back and later direct authenticated guard/cleanup checks passed. Temporary verification data: two categories and one bounded public-post snapshot, all removed; backend returned zero categories/posts afterward, matching the initial empty library. Ordinary X Bookmarks/Likes remained empty.
- Launcher shows exactly Hacker News and X; prior diagnostic packages remain hidden. HN source, records and renderer preference were untouched. Read-only HN regression check showed its normal feed and generic Rendering chooser on Default. The sole stored override is `x-bookmarks=hardware`.
- Significant-step commits: `38a20af` host preferences, `ddc1593` X mobile layout/navigation, `a851385` Saved integration, `e4388c9` obsolete-filter recovery. Documentation/evidence finalized separately.

## Qualification limits

Device checks use the existing authenticated `emulator-5554` in Android Studio. WebView debugging was temporarily enabled only in a running debug process for read-only DOM/CSS diagnostics; host source disables it at startup and the final process was restarted. No credentials or private page contents are recorded. Screenshots were inspected in-session.

The Mac emulator process crashed twice during the longer verification run (`qemu-system-aarch64`, HangDetector/SIGSEGV). The existing AVD was restarted without wiping app data; checks then continued. This is recorded as an environment failure, not evidence of an applet crash or a proven rendering-mode cause.

Physical-device performance, TalkBack, largest text setting, dark-mode device visuals, every paid/authentication gate, attachment delivery and frame-by-frame animation/load benchmarks were not run. The logged-in source workflows and controls were inspected without posting, messaging, changing follows, credentials or account settings. Chat reaches X's passcode setup gate; no passcode was created. These checks establish the named emulator journeys, not complete native-X feature parity or a production backend deployment.
