# X applet

X is one applet with native Home, Explore, Notifications, Saved and Profile sections. It uses SDK/tools 0.5.0, runtime API 4 and manifest schema 3. Stable applet/source/page/service IDs and both existing bookmark stores are preserved.

## Product and rendering

The original X document runs hidden, muted and excluded from accessibility and keyboard focus. `src/main.tsx` publishes bounded validated post, profile, notification, discovery and collection data. `src/app.tsx` renders every customized screen in a separate packaged foreground. Loading, errors, authentication gates and unfamiliar pages remain owned. Website DOM/CSS is never a foreground fallback.

The mandatory shared `x` route contract in `applet.json` is the route inventory. It maps Home, discovery/search, profiles/people, conversations, post metadata/media, notifications, Saved and collections to declared adapters and owned screens. Reserved login/settings/messages/composer/account routes are explicit website outcomes before dynamic profile rules. Unmatched routes remain unsupported with explicit website recovery. Route matching does not prove account or content validity.

| Journey | Behavior |
| --- | --- |
| Home / Following, Explore / search, Notifications / Mentions | Owned content and observed source tabs, one native primary footer |
| Profile and people | Actual observed signed-in profile and public profiles, with owned descriptions and links |
| Post and media | Owned post/thread and bounded thumbnails; full playback and social controls in the website provider |
| Saved | One Bookmarks / Likes / Categories row; upstream and private records remain independent |
| Save to category | Owned editor, one or more categories, service receipts and backend read-back |
| Categories | Search/filter/manage the existing library, open live post and return |
| Login/settings/messages/composer/follow/reply/like/repost/bookmark | Explicit bridge-free website view; original forms/session and native Close/Back |

Read operations such as tab selection, opening an observed trend and loading more use epoch-bound source commands. They revalidate the exact source element and do not submit social actions. The foreground keeps a bounded window of posts and scroll positions. Source media does not play in the background. The website provider owns playback, uploads and full original-site interactions. Verification never submits posts/messages or changes account settings.

The source observer identifies the signed-in account through inspected signed-in controls and its matching bootstrap entity. It never uses the viewed post author. Only the foreground persists accepted observations, bound to its current visit. Private Categories access checks that confirmed account against the backend's expected handle, and revision-bound operations prevent cross-account writes. Account loading and provider return require revalidation. Website cookies never become backend credentials.

## Native X design brief

The November UX repair requires primary sections to open their declared roots, pull-to-refresh and a labeled refresh control on owned browsing screens, and a read-only refresh for Categories. A refresh clears that URL's merged feed window and waits for a replacement source result. Loading from a different route must not display the previous route's model. Existing provider and private-record boundaries remain unchanged.

Required: reproduce native X's compact feed and controls in owned HTML/React, using the live mobile-width X website for details that cannot be confirmed in the native app. Preserve Genesis's existing Home / Explore / Notifications / Saved / Profile bottom navigation. Do not add a primary sidebar or a second tab bar. Android system typography, 15px/20px post copy, 40px feed avatars, inline author/handle/time, hairline separators, blue tab indicators, icon actions and profile imagery provide the shared visual language. Categories uses the same tokens and controls.

The stable route inventory in `applet.json` is unchanged. This presentation contract supplements its adapter/renderer/provider mapping. Source data remains bounded and validated; neither source CSS nor upstream HTML supplies the foreground.

| Routes / owned screen | Presentation and interactions | Provider boundary | Acceptance |
| --- | --- | --- | --- |
| `/home`, timeline | Compact feed, For you / Following, post details, load more | Composer and social mutations | Passed on authenticated emulator |
| `/explore/*`, `/search?q=…`, discovery | Search field, source tabs, readable trends/people, results | Unsupported destination recovery | Passed, including trend options and Follow handoff |
| `/notifications`, `/notifications/mentions` | Source tabs and complete clickable notification rows | Original notification/account actions | Passed row-to-post, Mentions empty state and source error recovery |
| `/:handle`, profile and people subroutes | Banner/avatar, bio, follow counts, source tabs and posts | Edit/follow and protected account forms | Passed public/own profiles, People, Replies/Media, Lists/detail and Communities |
| `/:handle/status/:id` and photo/video/activity subroutes | Post actions, quoted post, image grid, black media viewer, expanded detail | Reply/repost/like/bookmark/share, full playback | Passed details, quote, multi-photo boundaries, Views/help and provider entry/return; actual video playback not qualified |
| `/i/history`, `/i/history/likes`, internal `library` | One Bookmarks / Likes / Categories row; coherent saved rows and category sheets | X bookmarks stay independent of private Categories | Passed tabs, filtering, create/rename/save/read-back/remove/delete of disposable records; existing records preserved |
| Unknown, loading, auth and error states | Owned recovery, visible retry and website entry | Explicit website view and native return | Loading and real source errors passed; sign-out/challenge and unknown routes not requalified in this visual pass |

The user requested verification of all interactions. Opening original forms does not authorize publishing posts/messages or changing account settings. Component previews establish layout and event wiring only; actual source, account, backend persistence and native return need integrated checks. Visual similarity does not establish native feature parity.

## Backend

The separate Node 24 server uses built-in HTTP/HTTPS and SQLite. It is not bundled into Android. It requires `X_BACKEND_TOKEN`, `X_BACKEND_DB` and, on first database creation, `X_EXPECTED_HANDLE`. A service token authorizes one personal library; the handle check prevents accidental account mixing, not malicious impersonation. Multiple users/accounts are not supported.

For routine local startup, run `./start.sh` from this directory, or `./factory/start-applet-servers.sh` from the Genesis root for all applets. Add `--device <adb-serial>` after reboot/reconnecting Android to restore its tunnel and service connection. X reserves port 8788 in `factory/ports.json`. Node 24, installed workspace dependencies and OpenSSL are required; no separate SQLite daemon is needed. The helper supplies the token/database/TLS environment and reuses private state at `~/.local/share/genesis/services/x-bookmarks/bookmarks/`, including `documents.sqlite3` and `server.log`. Only for a new database, prefix startup with `X_EXPECTED_HANDLE=your_handle`. `./start.sh --stop` stops the managed server without deleting records. See [startup and ports](../../guides/services-and-data.md#local-startup-and-port-assignments). Agents maintain and statically check scripts; they must not run services unless explicitly asked.

| Local startup journey | Expected result | Verification |
| --- | --- | --- |
| Run `start.sh` after a computer restart | Existing X library/account and credentials reused; authenticated HTTPS ready on 8788 | Static checks only; startup intentionally not executed |
| Rerun with `--device <serial>`, open X Categories | Android tunnel and connection restored; same private library available | Operator/device verification required |
| Run `start.sh --stop` | Backend stops; private library preserved | Static checks only |

For the development emulator, use the existing creator helper with the expected handle in the process environment:

```sh
X_EXPECTED_HANDLE=<your-handle> npx --no-install genesis-applet service start . --device <serial> --json
```

The helper stores its generated token, certificate, logs and database privately outside source. Keep X passwords, cookies and all service secrets out of source and frontend bundles. Production needs a reachable trusted HTTPS endpoint, durable data volume, backups and private token provisioning. A USB/emulator tunnel is development infrastructure.

## Data and recovery

Categories and selected bounded snapshots remain authoritative in the existing backend. A post can belong to up to 10 categories, with at most 50 categories. Nonempty categories cannot be deleted. Operation receipts and revision preconditions preserve uncertain-write recovery. Retry the same operation rather than inventing another ID. No offline substitute, automatic bookmark import or full media archive is provided.

The previous mixed-document source CSS, injected post controls, one-use source-to-library tickets and premium folder interception were retired in this migration. The owned Save to category action is always available without changing X bookmarks. Original X bookmark/folder actions remain in the website view. Earlier phase-4 reports describe the earlier implementation and do not qualify this API-3 revision.

## Verification

The current UX repair passes workspace TypeScript, applet check/build, offline Android assembly and whitespace checks. X revision `b39d065819e075dcf7b702f0edc89e0048e5e04c9e3ab6c371d87ccddd156c13` and the updated Android host are installed on `emulator-5554`. See the [November UX repair report](../../../.reports/phase-5/2026-11-01/065059-x-ux-repair-verification.md) for exact mixed-navigation, refresh, error recovery, typography and footer checks. It supersedes the earlier individual-route acceptance for those behaviors. The [initial design report](../../../.reports/phase-5/2026-11-01/011600-x-native-design-verification.md) remains historical context. Authenticated mobile website inspection supplied the design reference; native X itself was unavailable, so exact native/font parity is not claimed. The blocked local-file preview supplies no evidence.

Native primary tabs now open their declared entries with a fresh owned viewport, rather than restoring a child post or old scroll offset. Browsing and Categories support pull/button refresh; model route validation and epoch-bound Back registration prevent stale screen/menu behavior. The shared font system uses 15px/20px body, 13px metadata and 20px titles, with separate expanded-post and empty-state hierarchy. Header/tab offsets follow actual measured heights.

Light/dark appearance and 320-CSS-pixel width with doubled system text were inspected. The native footer uses larger icons, full accessible names and tooltips when captions cannot fit; ordinary-size captions remain. Web content is inset above the measured footer. The Android accessibility dump still omits the search field's name despite its owned HTML label; touch/keyboard search works, and TalkBack remains unqualified. Original display/connectivity settings were restored. No social/account changes were submitted. Real video playback, physical devices, localized layouts, account switching and Premium-only flows remain unqualified.

Run the applet CLI check/build, workspace TypeScript check and backend `node --check` commands. Device acceptance must cover the actual authenticated applet, source tabs, internal/external transitions, provider Close/Back, category writes/read-back/cleanup and source isolation. See current phase-5 records for observed results. Static checks do not qualify current selectors or website behavior. Physical-device, localized layouts, Premium-only folder flows and multi-user service provisioning require separate qualification.

Incomplete website markup remains loading, including after HTML document completion. Validated route content determines readiness; missing spinners/selectors do not imply unsupported content. Empty model shells never count as retained content after failure. Refresh retains only destination/account-matched valid content, and genuine failures expose source Retry separately from explicit website presentation.

The [source loading repair qualification](../../../.reports/phase-5/2026-11-01/091700-genesis-loading-repair-verification.md) records installed SDK 0.4.1 and tools 0.4.2 revisions, repeated X navigation, genuine recovery and shared-host checks. It supersedes earlier loading/recovery qualification for those journeys and states the remaining device/transport/accessibility limits.

Gray content skeletons are the default for source transitions, account/library/dialog reads and pagination. Pending operations retain hidden accessible status and real errors remain explicit. See [skeleton verification](../../../.reports/phase-5/2026-11-01/093559-genesis-skeleton-loading-verification.md) for installed revisions and limits.

## Explicit navigation policy

Schema 3/API 4 with SDK 0.5.0 uses the host's route decision for every URL link and source tab. `applet.json` declares the internal `x` contract, default source, external website policy, unsupported fallback and the `original-x` action. Source extraction uses the host-bound route screen; the separate pathname presentation router is removed. Website controls visibly include a Website cue. Uncovered internal destinations retain native recovery with explicit Continue; ordinary navigation never directly opens a website because a path is unknown.

| Journey | Declaration and rendering | Return / qualification |
| --- | --- | --- |
| Profile Replies → Subs | `profile-subs`, owned profile; observed subscription gate stays owned with a marked website action | Passed authenticated emulator; no subscription submitted |
| Posts/Replies/Reposts/Media | Existing custom route IDs and profile renderer | Existing content extraction preserved; Replies/Subs transition rechecked |
| Future profile tab | Unmatched unsupported; native owned recovery | Policy verified; every future source layout is not qualified |
| Profile photo/banner | Declared website routes; visible website cue | Native Return restores opener; photo flow qualified in the earlier investigation |
| Show more | Custom post detail, with a separate explicit full-text website link if still excerpted | Static wiring checked; live long-post qualification pending |
| Social/media/current page controls | `original-x`, applicable only to declared custom route IDs | Opens original controls; never reports a submitted action |
| Categories | Existing owned `library` page and backend authority | No record/schema migration |

The installed API-4 migration preserves applet/source/page/service identity and account validation. The subscription gate was inspected from the actual public Subs source, including selected-tab identity and the visible “Unlock more with Subscriptions” heading. Subscriber-authorized posts, paid actions and all account/layout variations remain unqualified. Check the final phase-5 navigation delivery report for exact package/host revisions and remaining acceptance limits.

Current delivery evidence: [explicit navigation verification](../../../.reports/phase-5/2026-11-01/115202-genesis-explicit-navigation-verification.md). Earlier reports qualify their recorded revisions only.
