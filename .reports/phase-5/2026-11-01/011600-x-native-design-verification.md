# X native-design verification

## Delivered design and evidence

X uses owned React/HTML with compact feed typography, inline identity/time, 40px avatars, icon actions, hairlines, blue tab indicators, profile imagery, search, black media viewing and consistent category sheets/empty states. Genesis's Home / Explore / Notifications / Saved / Profile bottom navigation is retained. No left sidebar or duplicate primary footer was added. Stable IDs, private records and website-provider boundaries are preserved.

The user clarified native X as the target, with the live mobile website as fallback. The authenticated website was inspected in Browser; native X itself was unavailable. This is an implemented native-style design informed by that website, not a claim of pixel-perfect native/proprietary-font parity. Portable defaults live in the [factory design guide](../../../factory/guides/design.md) and [phase-5 operating guidance](../../../.docs/phase-5/2026-10-31/235800-genesis-applet-design-fidelity.md).

Integrated checks used the actual `x-bookmarks` launcher entry on `emulator-5554`, the authenticated live X source and the existing private backend. ADB screenshots/taps were explicitly authorized after CUA's emulator clicks failed. The user separately approved deletion of the empty disposable category. No credentials, private messages or source snapshots are included in this report. Screenshots remained temporary local evidence.

Final installed/build revision: `eff332d4c8d176b7700b2387144703f1b3880cd2969ee5eeb38b784ab30f762d`. Each functional correction below was installed and exercised incrementally. Theme checks used preceding revision `d01d8b…`; handoffs, profile tabs and collection navigation were checked after that correction. The final media/empty-state presentation was then installed and its controls, destinations, provider return and Likes empty state rechecked. Every earlier journey was not repeated after unchanged behavior received that final presentation update.

## Live journey results

| Journey | Result | Observed outcome |
| --- | --- | --- |
| Launcher and primary sections | Passed | Everyday launcher has HN and X; X retains one native bottom navigation. |
| Home and Following | Passed | Source tabs change content; compact post rows, menus and selected state render in owned UI. |
| Conversation and pagination | Passed | Timestamp/body opens matching post; expanded date is not duplicated. Load more appended additional distinct reply rows. |
| Quoted post | Passed | Quote opens its corresponding post rather than the parent; a photo URL inside a quote no longer invalidates the entire feed. |
| Photo and video handoff | Passed with limit | Black viewer compared against original X for the same image. Next/Previous show distinct correct images; photo four has no Next. Close-to-post, Views and all Reply/Repost/Like/Share/original-media handoffs/return passed. Video opens original video provider; actual playback/audio was not qualified. |
| Views and Help Center | Passed | Counter opens the actual owned informational Views notice, Help Center opens its reader, Close returns and Back to post works. No analytics were invented. |
| Reply, Repost, Like, Share, Bookmark, More | Passed at provider boundary | Each opens the matching original post and Close returns. No social mutation was submitted. |
| Composer, messages and account settings | Passed at provider boundary | Original destinations open and return. Composer was left empty; no message, post or account change was submitted. Native departure guard was respected. |
| Explore/search and People | Passed | Search submits actual query; results/People tabs, names/handles/bios, profile links and protected Follow handoff work. Trend command opens its observed query; options opens original Explore. |
| Notifications and Mentions | Passed | Actual notification opens its corresponding post; Back returns. Mentions displays its observed empty state. |
| Public/own profiles and People counts | Passed | Correct account identity, banners/avatars/bios, following destination and profile photo handoff. Edit profile form opens and leaves without saving. Replies/Media show actual empty states; source may label the media result Videos. |
| Lists and Communities | Passed for read navigation | Lists opens owned rows, observed list opens detail/posts and native Back returns. Communities opens its actual feed. No list/community membership was changed. |
| Saved locations | Passed | Bookmarks, Likes and Categories remain distinct; source Likes empty state has separate heading/body hierarchy. |
| Private category persistence | Passed | Disposable category create, save membership, backend read-back, filter with keyboard, rename, removal confirmation and approved empty-category deletion. Existing `ctg1` (2) and `ctg2` (0) preserved; no disposable category remains. |
| Category sheet and return | Passed | Scrollable body, readable separate controls, cancellation and removal warning; overflow Back restored after library return. |
| Source failures and recovery | Passed | Trending and Notifications initially failed on original X too; provider confirmed the error and later reads recovered. Backend unavailability showed an error until the existing service connection/tunnel was restored. |
| Light/dark and enlarged text | Passed with platform limit | Correct owned text contrast, opaque menus/sheets. At density 540 on 1080px width (320 CSS pixels), font scale 2.0, applet wraps and category body scrolls with Close/Cancel reachable. Native shell bottom labels clip at that extreme setting. |

Existing service credentials/database were reused; the backend was not restarted or reset. Temporary diagnostic forwarding was removed and the inspected applet was exited/reopened through Genesis. Original font scale 1.0, physical density 420 with no override and light appearance were restored. No temporary applet/package was added to the launcher.

## Verification and limits

Passed from the repository root:

```sh
npm run typecheck
node packages/applet-tools/src/cli.mjs check factory/applets/x.com --json
node packages/applet-tools/src/cli.mjs build factory/applets/x.com --out /tmp/genesis-x-native-final-bundle --json
node --check factory/applets/x.com/backend/model.mjs
node --check factory/applets/x.com/backend/store.mjs
node --check factory/applets/x.com/backend/server.mjs
git diff --check
```

Workspace TypeScript passed before the last media presentation change; X TypeScript/check/build passed again afterward. One-off in-memory identity checks also passed transient-control loss, reset, explicit sign-out marker, mismatched mobile identity and bootstrap replacement. No test files were added/changed. A redundant `npx` wrapper was stopped while waiting for registry resolution; the checked-in CLI above passed without that dependency. A browser-blocked local-file preview was not used as evidence.

Observed accessibility gap: UIAutomator exposes the search field as a native editable element with an empty name, although the owned input has `aria-label="Search X"`. Screenshot-guided touch and keyboard submission pass. This pass does not establish the cause or TalkBack behavior; field-name exposure needs follow-up qualification.

Not run: real sign-out/account switching, challenge/unknown-route requalification, TalkBack, physical devices, localized layouts, Premium-only folder workflows, video playback/audio and production multi-user provisioning. Native app comparison and frame-by-frame source-isolation qualification were unavailable; existing isolation architecture was preserved, not newly certified by this visual pass. Protected mutations intentionally stop at provider entry/return. The native shell large-text clipping remains a separate platform issue.

## Commits and change records

| Commit | Change record |
| --- | --- |
| `8e69cbf` | [Native X content design](../../../.changelog/phase-5/2026-10-31/234500-x-native-design.md) |
| `2dcb030` | [Factory design fidelity](../../../.changelog/phase-5/2026-10-31/235800-factory-design-fidelity.md) |
| `5273d8e` | [Explore controls](../../../.changelog/phase-5/2026-11-01/000430-x-explore-controls.md) |
| `a6d7a17` | [Quote validation](../../../.changelog/phase-5/2026-11-01/001600-x-quote-model-validation.md) |
| `8eef147` | [Accessible post controls](../../../.changelog/phase-5/2026-11-01/002000-x-post-control-accessibility.md) |
| `df3c92e` | [Keyboard/account identity](../../../.changelog/phase-5/2026-11-01/003030-x-category-keyboard-identity.md) |
| `6b3f54b` | [Category sheet layout](../../../.changelog/phase-5/2026-11-01/003700-x-category-sheet-layout.md) |
| `d6b9711` | [Overflow return navigation](../../../.changelog/phase-5/2026-11-01/004000-x-overflow-return-navigation.md) |
| `e72d61a` | [Owned Views notice](../../../.changelog/phase-5/2026-11-01/004800-x-owned-views-notice.md) |
| `c5636ea` | [Discovery/People fidelity](../../../.changelog/phase-5/2026-11-01/005700-x-discovery-row-fidelity.md) |
| `ba605f0` | [Explicit owned theme](../../../.changelog/phase-5/2026-11-01/011000-x-owned-theme-inheritance.md) |
| `c362089` | [Media viewer and empty states](../../../.changelog/phase-5/2026-11-01/012200-x-media-viewer-fidelity.md) |

The final documentation commit records this acceptance matrix and removes the resolved UI-access blocker from current guidance.
