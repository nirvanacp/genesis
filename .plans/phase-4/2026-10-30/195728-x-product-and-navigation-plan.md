# X customization product and navigation plan

> Current product direction: [214048-genesis-two-complete-applets-plan.md](214048-genesis-two-complete-applets-plan.md) supersedes this document's product framing, implementation sequence and completion criteria following the user's clarification. Deliver exactly two everyday apps, Hacker News and one complete X app. Sources, pages, Categories, readers and backend services are internal parts of those apps. Retain compatible technical contracts below; previous development-only status and synthetic checks are interim evidence, not the intended deliverable.

Project: Genesis X applet, `factory/applets/x.com`. Phase `phase-4`, selected from branch `proto/phase-4`. Created 30 October 2026 at 19:57:28 Asia/Kolkata. This is a design and implementation handoff. No application code was changed or qualified on Android during planning.

Read this plan first, then [the backend plan](195728-x-category-backend-plan.md), then [the platform and execution plan](195728-genesis-x-platform-execution-plan.md). These documents form one phase-4 scope. Future API names in the platform plan are proposals, not available SDK methods.

## Problem and intended result

Build a daily-use X applet that keeps the live website's feeds, conversations, accounts and actions, gives them coherent Genesis navigation, and adds a private library organized into categories. Follow the HN applet's separation of website behavior, owned UI and an independently operated backend. Reuse its engineering patterns, not its website selectors or document schema.

The user's required ownership rule is decisive. Ordinary bookmarks remain X bookmarks. Saving to a category stores that selection in the customization's backend. Choose independent saves: a categorized save never implicitly adds or removes an X bookmark, and an X bookmark never implicitly creates a backend record. A post can exist in either system or both. This avoids a distributed transaction whose two writes cannot be made atomic.

X currently advertises paid Bookmark folders. This was visible in its subscription page during this investigation. The proposed feature supplies independently maintained categories and data ownership without relying on that paid feature. Do not describe X as universally lacking folders. Preserve any upstream folder controls that an entitled account receives.

## Confirmed requirements and design decisions

The user requested planning only, current website exploration in the in-app Browser, credential use only for sign-in, categorical bookmarking similar to HN, everyday route coverage, and platform improvements where needed. No credentials belong in documents, code, screenshots, fixtures, logs, or applet/backend storage. Browser-managed session cookies are distinct from saving a password.

The following are planning decisions made by the agent. They resolve unspecified product choices and can be changed deliberately before implementation:

- Five native sections: Home, Explore, Alerts, Saved, Me. Posting is a source action, not a tab that performs an action. Messages is a labeled shortcut from Home and Me.
- Saved contains two clearly named modes, X bookmarks and Categories. The former is the real X page; the latter is a packaged page reading the applet backend. Never combine them into a list falsely presented as a complete union.
- One personal backend library and one configured X account in the first release. An observed handle guards against accidental account mixing; it does not authenticate the user to the server. Account switching remains upstream, while category access pauses on an account mismatch.
- Multiple category membership, at most 50 categories and 10 memberships per saved post. Categories have no nesting in phase 4.
- No offline write queue, background collection, bulk bookmark import, automated categorization, social actions from backend snapshots, or backend fetching of X. Current source DOM is the input to an explicit category save.
- No new or modified test files. Use existing checks, temporary disposable verification data, and manual qualification.

## Evidence from the live website

Signed in successfully in the requested Browser on 30 October 2026. The viewport was 737 by 804 CSS pixels, so this is responsive web evidence, not proof of the phone layout. Only structural observations are retained here. Private notification contents, account history, settings values and credentials are excluded.

| Area | Observed behavior | Qualification limit |
| --- | --- | --- |
| Signed-out landing | `/` offered username/email, phone, Google and Apple entry points. Username continued to `/i/jf/onboarding/web` with hash-based password steps. | Username/password sign-in completed. Social login, passkeys, recovery, challenges and signed-out post gates were not exercised. |
| Home | `/home`, For you and Following tabs, an inline composer, virtualized post articles, native action controls, quotes, ads and video controls. | Actions were inspected without posting, liking, following, reposting or changing bookmarks. Following selection and playback require device checks. |
| Explore/search | `/explore` had Explore, Trending, News, Sports and Entertainment. Searching opened results with Top, Latest, People, Media and Lists. | Search results and a conversation were opened. Advanced filters were not exhausted. |
| Conversation | `/<handle>/status/<id>` contained parent context, replies, sorting, quotes, inline reply, full post metadata and bookmark action. | Nested replies, long-text expansion, polls and sensitive media need broader qualification. |
| Media | `/<handle>/status/<id>/photo/1` opened a source-owned dialog with Close and View post. The Home feed contained embedded videos. | Video playback/fullscreen/audio and galleries on Android remain unverified. |
| History/bookmarks | Main navigation led to `/i/history`, titled History, with Bookmarks and Likes. Bookmarks was empty for this session. Search Bookmarks opened an input at the same pathname; its source Back returned to the list. | No bookmark mutation or nonempty personal collection inspection. Do not assume the legacy `/i/bookmarks` route or folders remain identical. |
| Alerts | `/notifications` offered All and Mentions, with notification settings and a push-notification prompt. | Read navigation only. No notification permission granted. |
| Profile | Own profile exposed Posts, Replies, Reposts and Media; Following and verified-followers links were present. | Profile settings and relationships were not changed. |
| Lists | `/<account>/lists` showed search, create-list entry and discovery. | No list created, followed or edited. Individual list timelines remain a qualification route. |
| Communities | `/<account>/communities` led to `/explore` beneath that path and an introduction dialog. Discovery exposed topics and post articles. | Introduction was closed. No join or post. |
| Chat | `/i/chat` redirected to `/i/chat/pin/new`, showing Create Passcode. | Stopped at credential creation. Inbox, message requests, conversations and attachment flows beyond this gate are unverified. |
| Calls | `/i/calls` displayed a calendar with New Call and Schedule. | No call placed or scheduled. Camera/microphone are outside first-release scope. |
| Grok | `/i/grok` moved to `/i/jf/grok/entry`, with prompt, voice and account-linking controls. | No prompts, linking or permissions submitted. Keep as an ordinary source experience. |
| Settings/premium | `/settings` exposed account, security, privacy, notifications, accessibility and other sections. Subscription overview advertised Bookmark folders. | No settings changed or purchase initiated. |
| Account menu | Add an existing account and Log out were visible. | Neither executed. |
| External links | A post's text and card linked to the same `t.co` URL. Direct navigation of that observed URL reached an external publisher. | Clicking the target-blank link did not expose a new tab in Browser inventory. Popup behavior is not qualified by that click. |

The official [X bookmark help](https://help.x.com/en/using-x/bookmarks) describes private upstream bookmarks. Its nav instructions still refer to Bookmarks, whereas this session exposed History. Follow the inspected DOM rather than hard-coding help-page navigation wording. The [subscription page](https://x.com/i/premium_sign_up) is evidence only for the folders offer visible on this date, not a permanent entitlement specification.

## Information architecture

| Native section | Default destination | Owned behavior |
| --- | --- | --- |
| Home | Source `primary`, `/home` | Keep source feed selection and composer; add a compact Post and Messages action row only if equivalent source actions are hidden by layout adaptation. |
| Explore | Source `explore`, `/explore` | Keep source search, topic tabs and result filters. |
| Alerts | Source `alerts`, `/notifications` | Keep source All/Mentions and settings. Native icon is a generic platform addition. No fabricated unread count. |
| Saved | Source `saved`, `/i/history` | Keep X Bookmarks/Likes and add the Categories destination. Packaged `library` belongs to Saved. |
| Me | Source `account`, `/home` | At this exact source/home combination mount an owned account hub. Other routes use normal source content. |

All sources use `https://x.com` and the same focused adapter entry, `src/main.tsx`, with behavior selected by `context.sourceId` and a route classifier. Remove unused historical Twitter/mobile origin permissions from the prototype. Legacy aliases remain ordinary redirects until separately qualified; do not grant a bridge to every alias speculatively. X's CDN resources need no additional source declarations because source origins govern top-level documents, not all subresources.

The account hub reads only the current account's profile link and shows Profile, Messages, Lists, Communities, X history, Settings and privacy, and Account actions. Account actions reveals or directs to X's existing account control rather than reconstructing logout requests. Access remains available to Calls, Grok, Premium and help through a secondary list. Preserve X's menu when a route or unfamiliar layout cannot be safely adapted. A hub failure must reveal the source UI and normal recovery controls.

Do not mount an additional bottom tab bar. Genesis owns the header, section bar and insets. On qualified content routes hide only source navigation that duplicates the native shell, using inspected semantic/test-ID anchors. Keep the source search bar, feed tabs, conversation controls, action toolbars, dialogs and forms. Login, account security and unsupported routes use ordinary browsing with origin controls and retain the source's complete layout.

## Implementation decision from the later user request

The user authorized implementation after committing these plans, requested visual quality at least equal to the original X website, and asked for mobile-quality animated navigation. Keep the live source layout as the visual baseline, use a neutral native shell, and animate prepared screen/reader reveals with a brief 180 ms ease-out. Owned sheets use restrained entry motion. Respect system/reduced-motion settings and do not animate scrolling posts or delay navigation for a minimum animation duration. Android Studio emulator verification is authorized; a physical-device requirement remains an explicitly reported qualification gap if no phone is connected.

## Visual and interaction design

The content remains recognizable as X. Use a continuous single-column timeline with separators, readable text and media. Owned saved rows use the same rhythm rather than a dashboard of large cards. System UI typography, a restrained accent for category actions, and explicit category labels distinguish applet data from X's bookmark glyph. This is a product choice, not an instruction to restyle every X component.

### Category action on a live post

Keep X's bookmark control and its event handlers untouched. Mount a separate folder-plus button in a small owned strip after that post's own action group, labeled `Save to category`. After a backend read confirms membership, show a folder-check with `Categories: 2` or the single category's name. Never use the X bookmark glyph or its filled state to represent category membership. At narrow widths, place the owned strip on a second line rather than shrinking X's action targets.

The extra action works on top-level post articles in Home, search, profiles, Lists, Communities and conversation replies. A repost saves the underlying post, not the reposter's wrapper. A quote card does not silently become the parent post's identity. To save the quoted post, open it and use its own action. Media overlays keep their source controls and offer View post as the path to categorization; do not crowd their playback controls.

Selecting the button opens one SDK-managed modal styled as a bottom-aligned sheet on compact layouts and a centered dialog on wider layouts. Use the supported modal first; styling the supplied container is applet code. Generic modal accessibility work is specified in the platform plan. Do not add a second nested modal for category creation.

```text
Save to category                              Close
@author  ·  A short preview of the selected post

Find a category [                             ]
[ ] Development
[x] Design
[ ] Read later
+ New category

Saved to your private Categories library.
X bookmarks are unchanged.

Cancel                                Save changes
```

Checkbox changes remain local until Save changes. New category opens an inline name field within the same sheet. Validate trimmed names immediately, retain entered text on errors, and create that category with a separate acknowledged operation. Canceling the bookmark edit does not delete an already created category; show it as an ordinary empty category. Save is disabled with no selected category on a new record. Existing membership is loaded before editing and errors do not look like an unchecked list.

Removing the final checkbox changes the primary label to `Remove from Categories`. That operation removes the backend saved item and its memberships after confirmation in the same sheet. It never converts to an X bookmark. The explicit `Remove from Categories` action has the same behavior. Closing an unsubmitted sheet discards checkbox changes. Closing during a request does not cancel a possible server commit; later views reread status and never show an unconfirmed success.

### Saved navigation and library

Saved opens X bookmarks on the first visit. On the X History page show `X bookmarks | Categories` above the source Bookmarks/Likes controls. Categories opens packaged page `library`. On that page the same mode selector returns to the real X History source. Preserve source Likes as upstream functionality; it is not a category. The platform plan specifies section ownership so both modes highlight Saved, source details return to the right opener, and switching tabs restores the active Saved destination. Cold launch may start in X bookmarks; do not implement a redirect loop to remember a mode.

```text
Saved
[X bookmarks]  [Categories selected]

All saved       Design                     Manage
Search saved posts [                           ]

@author · saved 2 hours ago                    ...
Post excerpt with original paragraph breaks
Design · Development
Open post
------------------------------------------------
@author · saved yesterday                      ...
Photo post · excerpt unavailable
Read later
Open post

                  Load more
Home       Explore       Alerts       Saved       Me
```

All saved means all categorized backend items only. Show a short explanatory empty state, not an Uncategorized collection. A category selector opens a searchable list, avoiding fifty tiny horizontally scrolling chips. At wide content widths of at least 840 CSS pixels, use a category column and reading column inside the owned page; retain the existing native navigation. Use one column below that width and when large text makes two columns cramped.

Rows show author, bounded captured text, saved time, memberships, and an `Open post` link. Saved data is labeled as a snapshot. No saved likes/reply counters, embedded live X widgets, automatic media downloads or scripts. Source interactions happen after opening the live post. A link within captured text stays a real validated link and opens the external reader. The row's blank area may open the post only if child controls, text selection, modified clicks and Shadow DOM events are excluded.

Search is server-side across captured text and author, combined with the selected category. Debounce 300 ms. Search results cover the full backend library, not merely loaded rows. Switching filters cancels application of older responses, resets pagination and scroll, and retains the search string. On focus, reread while retaining rows, filter and scroll anchor. A failed refresh leaves stale rows labeled as such; initial failure is not an empty library.

Manage categories supports create, rename and delete, with no nesting or drag reordering. Sort names consistently using the backend's normalized name plus ID. Delete is allowed only for an empty category in phase 4. A nonempty category offers Open category to move or remove its records first. This prevents silent loss or applet-owned uncategorized records. Editing memberships explicitly supports moving a post by checking the destination and unchecking the old category in one transaction.

## Route and presentation matrix

Patterns below express intended coverage, not syntax supported by SDK 0.2.0. The platform plan defines the proposed matcher. Treat route controls and post selectors as separate questions. A supported route can contain an unsupported article that receives no category button.

| Route family | Presentation and navigation |
| --- | --- |
| `/home` | Customized root; retain For you/Following and feed position. Feed tab changes belong to X. |
| `/explore`, `/explore/*`, `/search`, `/hashtag/:tag` | Customized; retain query parameters and X filters. Back from results returns to prior search/feed. |
| `/:handle`, `/:handle/with_replies`, `/:handle/reposts`, `/:handle/media`, `/:handle/following`, `/:handle/followers`, `/:handle/verified_followers` | Customized profile/detail. Identify the signed-in account from primary navigation, never from the profile being viewed. |
| `/:handle/status/:id`, plus `/quotes`, `/analytics` | Customized details; adapt articles only where identity is qualified. Analytics and quotes retain source controls. |
| `/:handle/status/:id/photo/:index`, `/:handle/status/:id/video/:index` | Source-owned media overlay; Back/Close returns to source context; Android fullscreen exits before navigation. |
| `/compose/post`, `/compose/*` | Source-owned composer/dialog with unsaved-work protection. Preserve reply/quote recipients, hidden fields, upload preview, drafts and X validation. |
| `/notifications`, `/notifications/mentions` | Customized Alerts. Settings links use ordinary source pages. |
| `/i/history`, `/i/history/likes` | Customized Saved source. Bookmark search is a same-URL transient state; source Back must take priority over browser history. |
| `/:handle/lists`, `/i/lists/*` | Customized browsing, with selectors qualified on actual list timelines. Creation/editing dialogs remain source-owned. |
| `/:handle/communities`, `/:handle/communities/*`, `/i/communities/*`, `/i/connect_people` | Preserve browsing and source introductions. Mount category controls only on qualified post articles. |
| `/i/chat/*`, `/messages/*` | Ordinary browsing; retain source PIN gate and conversation privacy. No category extraction or backend logging here. Messages beyond the gate need separate operator qualification. |
| `/`, `/login`, `/i/flow/*`, `/i/jf/onboarding/*`, `/account/*`, `/logout`, `/settings`, `/settings/*` | Ordinary upstream account/login/security pages. No applet DOM effects or credential observation. Keep exact origin visible. |
| `/i/grok`, `/i/jf/grok/*`, `/i/calls`, `/i/spaces/*`, `/i/premium_sign_up`, `/i/jf/creators/*`, `/i/verified-orgs-signup` | Ordinary source experience. Retain discovery/access. Calls, live Spaces, voice, purchases and creator tooling are not custom phase-4 workflows. |
| Packaged `library` | Owned React UI, service-backed. Every live post opens with the public source API and Saved as its section owner. |
| Other same-origin paths | Ordinary source fallback. A one-segment valid handle is a profile candidate; reserved application prefixes take precedence. Unknown layouts preserve the source. |
| Other HTTP(S) origins, including `t.co`, help and publishers | Child reader without an applet bridge; retain opener and actual final origin after redirects. |

`/messages/*`, older login paths, video route patterns, followers variants and deeper list routes are compatibility coverage to verify during implementation, not claims that every one was exercised today. Site redirects can change the route map. Update the plan/changelog with material changes instead of silently guessing new selectors.

## Transitions, links and authentication

Native sections own independent navigation state. Details opened from a feed keep that feed's section; details opened from Categories keep Saved. Back order is keyboard/system handling, child reader, SDK modal, fullscreen, qualified source transient UI, source history, owned-page/opener return, section root, launcher as applicable. The platform plan resolves source transient Back and section ownership rather than an applet installing competing system Back listeners.

For document navigation use Genesis's existing opaque cover until current-document commit, initial SDK layout and visual readiness. Show a source skeleton immediately and never wait for backend data to reveal X. For SPA route changes, dispose obsolete route effects and apply the new route's mode without a full-screen flash or artificial minimum delay. Crossings into account/settings/unsupported routes must remove customized chrome and effects before revealing ordinary content. Do not promise zero-frame flashes until sampled recordings prove them on the supported provider.

External text links, cards and target-blank links open the reader. A shortened URL resolves in the reader, not through a backend unfurl service. Preserve query strings, fragments and timestamps for navigation. Only the saved canonical post URL drops tracking parameters. Origin classification uses parsed exact HTTPS origins, never string prefixes such as `x.com.evil.example`. JavaScript/data/file URLs from website or backend records are not executable applet links. Mail, phone and supported app links go through the host's user-initiated handler policy. Unknown schemes show a recoverable message.

Cross-origin reader redirects back to a supported X post return to the customized source with the original section ownership. Same-origin ordinary account flows should stay in the source view so authentication and browser history remain coherent. An unknown publisher link back to X must not acquire service access before the host reclassifies and binds its document. User-gesture popups with meaningful forms must not be flattened as if they were simple GET links. Third-party OAuth and passkeys remain unqualified and require explicit device investigation before support is claimed.

Website session and backend connection are independent. Signed out, X shows its own sign-in/gate. Categories requires an explicit configured library account and a matching visible signed-in account for normal entry. A packaged page cannot inspect a retained source's DOM. On each library entry or focus, verify through a visible Saved source round trip using the one-use entry ticket specified in the backend plan, then return to the library without a loop. Keep category rows hidden during that verification. No X password, cookie, CSRF value or chat passcode is sent to the backend. When identity is unknown, present a verification/sign-in state, not an empty library. On mismatch, hide prior-account category rows and stop pending UI application; do not repoint the library or delete records. A handle rename requires an operator-verified account-binding update, not a new empty database. This first release is not a verified multi-account or multi-user service.

## Accessibility and observable acceptance

Apply the project Apple design principles to Android and HTML, using [cross-platform guidance](../../../.skills/apple-design-skill/references/cross-platform.md). The inspected references were accessibility, layout, typography, color, designing for iOS, tab bars, sheets, motion, loading, managing accounts and lists/tables. Their principles guide hierarchy and recovery; Android controls, Back and sizing govern the implementation.

Use 48 dp native targets and at least 48 CSS-pixel owned hit areas, with device verification. Support 200% text, 320 CSS-pixel content width, keyboard resize, landscape, RTL, long category names, light/dark appearance and reduced motion. Use semantic links/buttons/checkboxes, visible focus, readable errors and a polite status region. Text must reach 4.5:1 normal contrast and 3:1 for qualifying large text; calculate values from final tokens. Category state uses a check and label, not color alone. A sheet must keep TalkBack within its content and restore focus to a still-connected opener.

Completion means daily reading, search, source actions, media, account gates, Saved mode switching and external-reader return work on a physical Android device. Categorized saves survive app/backend restart; X bookmarks work when the category service is down; category saves never mutate X bookmarks; and a post in both stores can be removed independently. All unqualified routes and protected actions must be reported honestly. Build/typecheck success alone is insufficient.

## Implementation status — 30 October 2026

The user authorized implementation after the planning commit. The daily source adapter, neutral native shell, Me hub, separate save action, category editor and packaged library are implemented. The actual owned UI rendered in Android Studio with synthetic records. X temporarily limited the emulator login at the username step, so authenticated source appearance, daily routes, independent upstream bookmark mutation, account switching and mobile-quality navigation parity remain unqualified. The password was not saved. X remains a debug revision rather than a default bundled applet.

See [Android qualification and remaining matrix](../../../.reports/phase-4/2026-10-30/211400-genesis-x-android-verification.md). The release gate and product acceptance criteria above still apply; synthetic UI checks do not satisfy authenticated X acceptance.
