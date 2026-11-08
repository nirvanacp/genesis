# Current Hacker News specification

## Identity

- Name Hacker News, applet id `hn-bookmarks`, origin `https://news.ycombinator.com`.
- One context, `primary` (start URL `/`). The adapter is [src/adapter.ts](../src/adapter.ts) with pages `feed`, `item` and `user` in [src/adapter](../src/adapter).
- Screens: `feed`, `item`, `user`. Service: `bookmarks` (declared; no screen uses it in this slice).
- Manifest schema 6, `@genesis/sdk` 0.0.0, `genesis-applet` tools 0.0.0, protocol 1, adapter API 1. Kit version: not exported for this in-repository applet. The [manifest](../applet.json) is the authority for routes and contexts.

## Product scope

One Hacker News app with five tabs: Home, Search, Post, Saved and Me. Preserve the feeds, discussions with collapsible comment branches, profiles, HN's information pages, upvoting, posting through HN's submit form, and the Saved library with categories.

Data authority: HN owns accounts, stories, comments, votes and submissions. The `bookmarks` service owns saved stories and categories; it is a personal single-token backend, not a multi-user service. Website cookies never authenticate the service.

Open work (decision-0005): this revision is the Hacker News vertical slice of the adapter runtime migration. Only Home (front page), discussions and profiles are ported. Pending, with their files kept outside the build: the other feeds and the feed chips, the information pages (`info`), Search, Post (`post` context), Saved and the Save editor (`saved`, `save`), and Me (`me` context). Their tabs show as disabled placeholders. Search was unfinished before the migration.

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

| Route id | Example URL | Page and screen | Loading, empty, sign-in and error | Back | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| home, news | `/`, `/news?p=2` | `feed` | Skeleton; empty notice; load error with website button; stale copy with inline error | Context history | implemented | static, adapter tests |
| item | `/item?id=1` | `item` | Skeleton; error; "Sign in to comment" when signed out | Context history | implemented | static, adapter tests |
| user | `/user?id=pg` | `user` | Skeleton; "No such user"; error | Context history | implemented | static, adapter tests |
| Other HN URLs | `/newest`, `/login`, `/reply?id=1` | Website, same context | HN's page | Context history | platform behavior | |
| Other origins | article links | Website, same context (external) | | Context history | platform behavior | |

## Interactions

| Screen and control | Result | Action, route or website | Pending and failure | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| Home tab | `select("primary")`: scroll to top on the start page, else return to it | Navigation | | implemented | static |
| Search, Post, Saved, Me tabs | Disabled placeholders | | | pending (decision-0005) | static |
| Story title, comments, user | Open article, discussion or profile | `navigate({ url })` | | implemented | static |
| Upvote and unvote (stories and comments, signed in only) | Vote on HN | `setVoted` on `stories`, `story` or `comments`; clicks HN's own `#up_<id>` or `#un_<id>` | Shown voted while pending; inline error on `failed` | implemented, not exercised | adapter tests |
| More (feed) | Next page | `loadMore` page action (click `a.morelink`); falls back to `navigate({ url })` on failure | Button disabled while pending | implemented | adapter tests |
| More comments | Next page of the thread | `navigate({ url })` | | implemented | static |
| Comment Hide and Show | Collapse a branch | Local state | | implemented | static |
| Same-page comment link | Reveal target and ancestors, then scroll | Local state | | implemented | static |
| Reply, Add a comment, Sign in to comment | HN's reply or login page in the same context | `navigate({ url })` | | implemented | static |
| Profile Submissions, Comments, Favorites | HN's list pages | `navigate({ url })` (website until their routes return) | | implemented | static |

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

2026-11-08, vertical slice (decision-0005), static only:

- `check`, `build`, `build --debug`, `typecheck`, `npm test` (adapter read functions on hand-written HN-shaped pages) and `node tools/check-packages.mjs` passed; the bundle imports as Current with one context.
- Not exercised: everything on a device. The device scenarios of the migration's step 7 are run separately.
- Known risk: a thread whose page exceeds the platform page limit shows a load error with the website button.
- Next: step 8 ports the pending screens and contexts.
