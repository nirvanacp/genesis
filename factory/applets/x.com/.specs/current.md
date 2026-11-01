# Current X specification

## Identity and context

Stable ID `x-bookmarks`. Origins: https://x.com. Sources: primary, explore, alerts, saved, account. Pages: library, app. Service: bookmarks. Native sections: Home, Explore, Notifications, Saved, Profile. SDK 0.5.1, tools 0.5.0, runtime API 4, manifest schema 3, data/bundle schema 1. Monorepo guidance revision: factory redesign adopted 2026-11-01T19:24:48+05:30; exported kit metadata is not present in this applet. [Manifest](../applet.json) is executable route/source/page authority; [factory records](../../../guides/applet-records.md) define upkeep.

## Product scope

One complete X client with integrated private Categories, native Home/Explore/Notifications/Saved/Profile, mobile X identity and no primary sidebar. Preserve source browsing, profiles, conversations/media, notifications, search, upstream Bookmarks/Likes and independent Categories. X remains development-installed; HN remains APK-selected. Categories uses a personal handle-matched backend, not a multi-user account system. No automatic upstream bookmark import/synchronization, offline write queue or full media archive is supplied.

Data authority: source website owns upstream account/content/actions. Applet service owns saved records/categories. Cookies remain in website sessions and do not authenticate the service. Preserve applet/source/page/service IDs, keys, databases and account boundaries. No new exclusions approved by this documentation adoption.

## Applied defaults and overrides

Native mobile X design is the inherited user choice, with authenticated mobile website as fallback where native reference is unavailable. Preserve neutral palette, compact shared 15px/20px post text, 40px feed avatars, hairline separators, inline author/handle/time and icon actions. Saved has one Bookmarks/Likes/Categories row. Black media viewer keeps observed image identity and bounded Next/Previous controls. Preserve keyboard-safe category sheets, opaque themes, independent stores, at most 50 categories and 10 memberships per post, and rejection of deleting nonempty categories.

| Rule | Current choice | Origin / limit |
| --- | --- | --- |
| default-platform-menu | Native shell and top-right Applet options enabled | Existing manifests plus user-wide default; see decision-0001 |
| default-primary-navigation | One native footer; root selection/reselection resets transient viewport | Current host contract; detail Back/provider Return restore opener |
| default-pending-skeletons | Neutral content-shaped themed pending UI | Existing shared default; ready/empty/failure evidence still required |
| default-compact-website-cue | Compact arrow and accessible opens-website name | Inherited cross-applet UI repair; explicit website action wording retained |
| default-contextual-motion | Host contextual reveals, reduced motion | No independent full-screen animation or movable native-menu API |
| default-theme-and-layout / default-keyboard-safe-sheets | Explicit owned theme tokens, opaque panels, scrolling body/reachable actions | Existing implementation choices and observed repairs |

See [decision history](decisions.md) for attribution. No additional overrides inferred during adoption.

## Route inventory

References below summarize existing manifest rule families, not a new route policy. Each source uses its declared contract; actual route matches still require content validation. Unknown internal URLs remain owned unsupported recovery, blocked destinations cannot escape, external URLs use host policy and marked website Return. Owned library pages remain internal. Readiness uses validated model family/account/identity; affirmative empty markers are distinct from failed reads. Exact per-site extraction is in [source entry](../src/main.tsx) and view models.

| Contract/rule | Path family or representative pattern | Adapter/screen or provider | Evidence | Cue/return | Status |
| --- | --- | --- | --- | --- | --- |
| x/website-1 | `/` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| x/website-2 | `/login` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| x/website-3 | `/logout` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| x/website-4 | `/settings/*` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| x/website-5 | `/account/*` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| x/website-6 | `/i/flow/*` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| x/website-7 | `/i/jf/onboarding/*` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| x/website-8 | `/i/chat/*` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| x/website-9 | `/messages/*` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| x/website-10 | `/i/grok` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| x/website-11 | `/i/jf/grok/*` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| x/website-12 | `/i/calls` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| x/website-13 | `/i/spaces/*` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| x/website-14 | `/i/premium_sign_up` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| x/website-15 | `/i/verified-get-verified` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| x/website-16 | `/i/jf/creators/*` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| x/website-17 | `/i/verified-orgs-signup` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| x/website-18 | `/tos` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| x/website-19 | `/privacy` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| x/website-20 | `/about` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| x/website-21 | `/download` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| x/website-22 | `/compose/*` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| x/website-23 | `/:handle/photo` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| x/website-24 | `/:handle/header_photo` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| x/website-25 | `/:handle/about` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| x/home | `/home` | timeline/timeline | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| x/explore | `/explore/*` | discovery/discovery | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| x/search | `/search` | discovery/discovery | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| x/hashtag | `/hashtag/:tag` | discovery/discovery | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| x/notifications | `/notifications` | notifications/notifications | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| x/mentions | `/notifications/mentions` | notifications/notifications | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| x/bookmarks | `/i/history` | saved/saved | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| x/likes | `/i/history/likes` | saved/saved | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| x/bookmarks-alias | `/i/bookmarks` | saved/saved | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| x/lists | `/i/lists/*` | collection/collection | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| x/communities | `/i/communities/*` | collection/collection | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| x/connect | `/i/connect_people` | people/people | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| x/post-quotes | `/:handle/status/:id/quotes` | post-metadata/post-metadata | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| x/post-analytics | `/:handle/status/:id/analytics` | post-metadata/post-metadata | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| x/post-photo | `/:handle/status/:id/photo/:index` | media/media | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| x/post-video | `/:handle/status/:id/video/:index` | media/media | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| x/post | `/:handle/status/:id` | conversation/conversation | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| x/following | `/:handle/following` | people/people | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| x/followers | `/:handle/followers` | people/people | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| x/verified-followers | `/:handle/verified_followers` | people/people | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| x/profile-lists | `/:handle/lists` | collection/collection | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| x/profile-communities | `/:handle/communities/*` | collection/collection | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| x/replies | `/:handle/with_replies` | profile/profile | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| x/reposts | `/:handle/reposts` | profile/profile | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| x/profile-media | `/:handle/media` | profile/profile | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| x/profile-subs | `/:handle/subs` | profile/profile | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| x/profile | `/:handle` | profile/profile | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |

## Interaction inventory

All current code remains implemented at its prior revision; this record adoption does not qualify it live. Upstream mutations need separately authorized persistence checks.

| Control/entity | Expected result / owner | Authorization | Pending/error/uncertainty | Back/Return | Status/evidence |
| --- | --- | --- | --- | --- | --- |
| Like/Bookmark/Follow live entity | Desired state/current source executor | Explicit user action; current visit/account/entity token | Pending/observed/rejected/uncertain; retain rollback and no automatic retry | Revalidate on Return | implemented; persistence not-run here |
| Repost/More | Owned contextual choices/scoped source confirmation | Same live identity, no queued cached mutation | Menu/confirmation cancellation; uncertain result remains honest | Back closes current menu | implemented; variants unqualified |
| Share | Owned Copy/optional native chooser | User click; canonical URL | Report copy only after success; chooser means presented | Cancel/Back restores opener | implemented; device not-run |
| Reply/Post/Quote/settings/uploads | Contextual original website editor | Entry is not submission authorization | Website owns fields/tokens/dirty guard | Native website Back/Return | implemented; no submissions |
| Category save/filter/manage | Owned library/repository/bookmarks service | Confirmed source handle matches personal backend | Receipts/revisions and read-back; uncertain operation reconciled with same ID | Cancel/Back preserves records | implemented; live writes not-run here |
| Pull/button refresh | Exact current source URL or Categories authoritative read | Read only; query/filter retained | Replacement epoch/result; timeout, exclusions and duplicate suppression | Menu Back after refresh works | implemented; device not-run |

## Current work and verification

Adoption 2026-11-01T19:24:48+05:30: manifest IDs, package versions, documented code paths and links inspected; no runtime/data changes. Live verification not-run in this task. Existing historical evidence: [144631-x-interactions-verification.md](../../../../.reports/phase-5/2026-11-01/144631-x-interactions-verification.md), [065059-x-ux-repair-verification.md](../../../../.reports/phase-5/2026-11-01/065059-x-ux-repair-verification.md). Each record qualifies only its named revision/environment; no past pass establishes current site selectors or all routes.

Current interaction code restores ready account-bound controls after provider Return even without new source publication, cancels pending work on website entry, and keeps cached rows read-only until live targets exist. Actual mutation persistence, inverse confirmation/private Follow variants, native video, physical-device/TalkBack, localization/Premium-only layouts and account switching remain unqualified.

Next work: implement only requested customization; update route/action evidence before dependent changes; run scoped static checks, then authorized real-source/device checks when available. Preserve blockers and explicit choices. Do not infer approval for production distribution, multi-user service redesign, data migration or unrelated applet retrofits.
