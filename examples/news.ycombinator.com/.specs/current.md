# Current Hacker News specification

## Identity

- Name Hacker News, applet id `hn-bookmarks`, origin `https://news.ycombinator.com`.
- Sources: `primary` (feeds, items, profiles, information pages), `post` (the submit form) and `me` (the signed-in account). Adapters are in [src/sources](../src/sources).
- Screens: `feed`, `item`, `user`, `info`, `search`, `post`, `saved`, `save`, `me`, `unsupported`. Service: `bookmarks`.
- Manifest schema 5, `@genesis/sdk` 0.0.0, `genesis-applet` tools 0.0.0. Kit version: not exported for this in-repository applet. The [manifest](../applet.json) is the authority for routes and sources.

## Product scope

One Hacker News app with five tabs: Home, Search, Post, Saved and Me. Preserve the feeds, discussions with collapsible comment branches, profiles, HN's information pages, upvoting, posting through HN's submit form, and the Saved library with categories.

Data authority: HN owns accounts, stories, comments, votes and submissions. The `bookmarks` service owns saved stories and categories; it is a personal single-token backend, not a multi-user service. Website cookies never authenticate the service.

Open work: Search is a placeholder screen. It is unfinished, not a deferral the user approved.

## Defaults and overrides

| Rule id | Current choice | Origin and reason | Decision |
| --- | --- | --- | --- |
| default-platform-menu | Shell menu button, accent `#ff6600`; the first row of every screen leaves the button's corner clear | Factory default; layout fix by the agent | decision-0003 |
| default-primary-navigation | One bottom tab bar; reselecting the active root tab scrolls to the top | Factory default | decision-0001 |
| default-pending-skeletons | Neutral, static, content-shaped skeletons | Factory default | |
| default-compact-website-cue | External-link icon on every control that opens the website sheet | Factory default | |
| default-theme-and-layout | Warm paper and HN orange, Verdana, light and dark, 48px controls, compact 15px story titles | Inherited user design direction | decision-0002 |
| Saved editor | A `save` screen in the stack instead of a sheet, so Android Back closes it | Agent choice for SDK 0.0 | decision-0004 |

## Routes

| Route id | Example URL | Screen or website | Loading, empty, sign-in and error | Back | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| home, news, newest, front, newcomments, ask, show, shownew, asknew, jobs, best, active, from | `/news` | `feed` | Skeleton; empty notice; load error with website button | Stack | verified (home) | device |
| submitted, threads, favorites | `/submitted?id=pg` | `feed` | As above | Stack | implemented | static |
| hidden, upvoted | `/upvoted?id=<me>` | `feed` (sign-in required; no stale copy shown) | Sign-in prompt | Stack | implemented | static |
| item | `/item?id=1` | `item` | Skeleton; partial-thread notice; error | Stack | verified | device |
| user | `/user?id=pg` | `user` | Skeleton; error | Stack | implemented | static |
| formatdoc, faq, guidelines, lists, leaders | `/newsfaq.html` | `info` | Skeleton; error | Stack | implemented | static |
| account | `/news?account=1` | `me` (source `me`) | Sign-in prompt when signed out | Tab root | verified (signed in) | device |
| submit | `/submit` | `post` (source `post`) | Sign-in prompt; form errors | Leave guard on drafts | implemented | static |
| website-* (changepw, comment, delete, edit, fave, forgot, login, logout, r, reply, vote, x, hide) | `/login` | Website sheet | HN's page | Sheet | implemented | static |
| Other HN URLs | `/pastjobs` | `unsupported` with an Open on Hacker News button | | Stack | implemented | static |

## Interactions

| Screen and control | Result | Intent, route, website or store | Pending and failure | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| Feed chips | Switch feed | Route, replace | Skeleton | verified | device |
| Story title, comments, user | Open article, discussion or profile | Route | Unsupported screen for unknown pages | verified (comments) | device |
| Upvote | Vote on HN | `primary.vote` intent | Disabled while pending; inline error | implemented, not exercised | static |
| Comment Hide and Show | Collapse a branch | Local state | | implemented | static |
| Same-page comment link | Reveal target and ancestors, then scroll | Local state | | implemented | static |
| Reply, Add a comment, Sign in | HN page in the sheet | Website | | implemented | static |
| Save and Edit | Open the `save` screen | `bookmarks` service | Conflict rereads; uncertain writes reread | implemented, writes not exercised | static |
| Saved filters and Manage categories | Filter; create, rename, delete categories | `bookmarks` service | Confirmation before delete | verified (list) | device |
| Post form | Submit to HN | `post.submit` intent | Field errors; leave guard | implemented, not submitted | static |
| Sign out | HN logout, then the account page reloads | `me.signOut` intent, `reload()` | Confirmation | implemented, not exercised | static |
| Return to Me, Post another | Reload the account page or a fresh submit form | `reload()` | Skeleton until the page loads | implemented | static |

## Data

| Collection or service path | Owner | Key | Shape version | Notes |
| --- | --- | --- | --- | --- |
| `bookmarks` service, collection `bookmarks` | Applet service | `bookmarkKey(itemId)` | 1 | Story snapshot, category ids, `savedAtMs`, `orderKey` |
| `bookmarks` service, collection `bookmark-order` | Applet service | `orderKey` (newest first) | 1 | Index pointing to the bookmark key |
| `bookmarks` service, collection `categories` | Applet service | Category id | 1 | Name and normalized name; deletion is soft and keeps the stories |
| `bookmarks` service, collection `category-names` | Applet service | Normalized name | 1 | Keeps names unique |
| `bookmarks` service, collection `category-meta` | Applet service | `active` | 1 | Active category ids; its revision guards category writes |

Categories are read once when Saved opens and again on a category change or resume. Stories with no active category show as Uncategorized. Record shapes are unchanged from the first release, so existing data reads as is.

## Current work and verification

2026-11-06, revision 4 on the `emulator-5554` emulator (Android 17), signed-in HN account, existing local `bookmarks` service:

- Static: `check`, `typecheck`, `build` and the APK build passed.
- Device, real website: Home feed, a discussion, Me and Saved rendered in light mode; Home in dark mode.
- Not exercised: voting, posting, sign out, Save writes, category edits, signed-out states, the information pages and Search. No HN mutation was performed.
- 2026-11-07, revision 13: `dev install` passed with the applet in front. The Post tab showed the sign-in prompt for a signed-in account: HN's submit form now has `action="/r"`, and the `post` adapter still matches `form[action='r']`. Not fixed yet.
- Next: fix the submit form selector; implement Search; exercise the remaining routes on a device.
