# Current Hacker News specification

## Identity and context

Stable ID `hn-bookmarks`. Origins: https://news.ycombinator.com. Sources: primary, post, me. Pages: library, search, app. Service: bookmarks. Native sections: Home, Search, Post, Saved, Me. SDK 0.5.1, tools 0.5.0, runtime API 4, manifest schema 3, data/bundle schema 1. Monorepo guidance revision: factory redesign adopted 2026-11-01T19:25:00+05:30; exported kit metadata is not present in this applet. [Manifest](../applet.json) is executable route/source/page authority; [factory records](../../../guides/applet-records.md) define upkeep.

## Product scope

One Hacker News app with native Home/Search/Post/Saved/Me. Preserve feeds, discussion/profile/information pages, nested comment collapse, source forms and local Save/category workflows. HN remains APK-selected. Search is an existing unimplemented placeholder, not a user-approved exclusion or completed search feature. The personal single-token backend is not a production multi-user system.

Data authority: source website owns upstream account/content/actions. Applet service owns saved records/categories. Cookies remain in website sessions and do not authenticate the service. Preserve applet/source/page/service IDs, keys, databases and account boundaries. No new exclusions approved by this documentation adoption.

## Applied defaults and overrides

Preserve compact story headings shared across feeds/discussion/Saved, current 15px/21px story title treatment, compact domain/metadata rows, orange identity and 48px standalone Save controls. Category normalization uses NFKC/whitespace/case rules, uniqueness and revision checks. Category deletion preserves stories; no active membership means Uncategorized. Comment disclosure collapses branches and same-page links open target/ancestors before scrolling. Account/private list data is not eligible for public failed-refresh caching.

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

References below summarize existing manifest rule families, not a new route policy. Each source uses its declared contract; actual route matches still require content validation. Unknown internal URLs remain owned unsupported recovery, blocked destinations cannot escape, external URLs use host policy and marked website Return. Owned library/search pages remain internal. Readiness uses validated model family/account/identity; affirmative empty markers are distinct from failed reads. Exact per-site extraction is in [source entry](../src/main.ts) and view models.

| Contract/rule | Path family or representative pattern | Adapter/screen or provider | Evidence | Cue/return | Status |
| --- | --- | --- | --- | --- | --- |
| hn/website-0 | `/changepw` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| hn/website-1 | `/comment` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| hn/website-2 | `/delete` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| hn/website-3 | `/edit` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| hn/website-4 | `/fave` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| hn/website-5 | `/forgot` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| hn/website-6 | `/login` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| hn/website-7 | `/logout` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| hn/website-8 | `/r` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| hn/website-9 | `/reply` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| hn/website-10 | `/submit` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| hn/website-11 | `/vote` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| hn/website-12 | `/x` | website | Explicit host website policy; no action submission implied | Visible website cue; website Back and Return | implemented declaration; live not-run in adoption |
| hn/hn-0 | `/` | feed/feed | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| hn/hn-1 | `/news` | feed/feed | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| hn/hn-2 | `/newest` | feed/feed | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| hn/hn-3 | `/front` | feed/feed | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| hn/hn-4 | `/newcomments` | feed/feed | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| hn/hn-5 | `/ask` | feed/feed | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| hn/hn-6 | `/show` | feed/feed | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| hn/hn-7 | `/shownew` | feed/feed | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| hn/hn-8 | `/asknew` | feed/feed | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| hn/hn-9 | `/jobs` | feed/feed | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| hn/hn-10 | `/item` with id | discussion/discussion | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| hn/hn-12 | `/user` with id | profile/profile | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| hn/hn-13 | `/submitted` with id | feed/feed | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| hn/hn-14 | `/threads` with id | feed/feed | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| hn/hn-15 | `/favorites` with id | feed/feed | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| hn/hn-16 | `/hidden` with id | feed/feed | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| hn/hn-17 | `/upvoted` with id | feed/feed | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| hn/hn-23 | `/formatdoc` | information/information | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| hn/hn-24 | `/newsfaq.html` | information/information | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| hn/hn-25 | `/newsguidelines.html` | information/information | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| hn/hn-26 | `/lists` | information/information | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| hn/hn-27 | `/best` | feed/feed | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| hn/hn-28 | `/active` | feed/feed | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| hn/hn-29 | `/leaders` | information/information | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |
| hn/hn-30 | `/from` | feed/feed | Validated content identity; affirmative empty/auth/challenge/error evidence; missing selectors stay loading | Internal Back; marked original-site action only | implemented declaration; live not-run in adoption |

## Interaction inventory

All current code remains implemented at its prior revision; this record adoption does not qualify it live. Upstream mutations need separately authorized persistence checks.

| Control/entity | Expected result / owner | Authorization | Pending/error/uncertainty | Back/Return | Status/evidence |
| --- | --- | --- | --- | --- | --- |
| Story title / comments / profile | Named destination through host policy | Read/navigation only | Missing bounded target navigates to item, not generic website fallback | Detail Back restores opener | implemented; live not-run here |
| Comment disclosure / fragment | Owned branch collapse or reveal target+ancestors then scroll | Ordinary same-document links only | Unrelated branches stay collapsed; website actions bypass local scrolling | Stay in discussion | implemented; device not-run |
| Save/Edit/Remove/categories | Owned repository/bookmarks backend | Authorized local records only | Conflicts, confirmation and uncertain-write read-back | Cancel keeps records; native Back dismisses sheet | implemented; writes not-run here |
| Reply/Post/vote/login/account | Original website forms/session | Entry only; no routine mutations | Website dirty-form Stay/Leave; no POST replay | Native Return | implemented; signed-in variants not-run |
| Search entry | Existing owned placeholder | No search results implemented | Remains unresolved required work | Native primary navigation usable | blocked feature; not user-deferred |

## Current work and verification

Adoption 2026-11-01T19:25:00+05:30: manifest IDs, package versions, documented code paths and links inspected; no runtime/data changes. Live verification not-run in this task. Existing historical evidence: [115202-genesis-explicit-navigation-verification.md](../../../../.reports/phase-5/2026-11-01/115202-genesis-explicit-navigation-verification.md), [161451-hn-compact-stories.md](../../../../.changelog/phase-5/2026-11-01/161451-hn-compact-stories.md). Each record qualifies only its named revision/environment; no past pass establishes current site selectors or all routes.

Public feed/discussion retention excludes private lists/profiles/account data. Comment fragment reveal and nested disclosure are implemented, but this adoption adds no device checks. Search remains unresolved. Physical-device/TalkBack, complete signed-in/source-route matrix and protected mutations remain unqualified.

Next work: implement only requested customization; update route/action evidence before dependent changes; run scoped static checks, then authorized real-source/device checks when available. Preserve blockers and explicit choices. Do not infer approval for production distribution, multi-user service redesign, data migration or unrelated applet retrofits.
