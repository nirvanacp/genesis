# Current Hacker News specification

## Identity

- Name Hacker News, applet id `hn-bookmarks`, origin `https://news.ycombinator.com`.
- Three contexts, each with its own website session history: `primary` (Home, start URL `/`), `post` (`/submit`) and `me` (`/news?account=1`). The adapter is [src/adapter.ts](../src/adapter.ts) with pages `feed`, `private-feed`, `item`, `user`, `info`, `account` and `submit` in [src/adapter](../src/adapter).
- Screens: route screens `feed`, `item`, `user`, `info`, `post` and `me`; overlay screens `search`, `saved`, `categories` and `save`. Service: `bookmarks`, used by Saved, Categories and Save.
- Manifest schema 6, `@genesis/sdk` 0.0.0, `genesis-applet` tools 0.0.0, protocol 1, adapter API 1. Kit version: not exported for this in-repository applet. The [manifest](../applet.json) is the authority for routes and contexts.

## Product scope

One Hacker News app with five tabs: Home, Search, Post, Saved and Me. Preserve the feeds, discussions with collapsible comment branches, profiles, HN's information pages, upvoting, posting through HN's submit form, and the Saved library with categories.

Data authority: HN owns accounts, stories, comments, votes and submissions. The `bookmarks` service owns saved stories and categories; it is a personal single-token backend, not a multi-user service. Website cookies never authenticate the service.

Open work: Search is a placeholder, as it was before the migration (decision-0006).

## Defaults and overrides

| Rule id | Current choice | Origin and reason | Decision |
| --- | --- | --- | --- |
| default-platform-menu | Shell menu button, accent `#ff6600`; the first row of every screen leaves the button's corner clear | Factory default; layout fix by the agent | decision-0003 |
| default-primary-navigation | One bottom tab bar; reselecting the active root tab scrolls to the top | Factory default | decision-0001 |
| default-pending-skeletons | Neutral, static, content-shaped skeletons | Factory default | |
| default-compact-website-cue | External-link icon on every control that opens the website (shown with the website bar and Done) | Factory default | |
| default-theme-and-layout | Warm paper and HN orange, Verdana, light and dark, 48px controls, compact 15px story titles | Inherited user design direction | decision-0002 |
| Saved editor | A `save` screen in the stack instead of a sheet, so Android Back closes it | Agent choice for SDK 0.0 | decision-0004 |

## Routes

Routes match in manifest order; the first match wins.

| Route id | Example URL | Page and screen | Loading, empty, sign-in and error | Back | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| account | `/news?account=1` | `account`, `me` (context `me`) | Skeleton; HN's login page when signed out (the page requires an account); error | Context history | implemented | device, adapter tests |
| home, news | `/`, `/news?p=2` | `feed` | Skeleton; empty notice; load error with website button; stale copy with inline error | Context history | implemented | device, adapter tests |
| newest, front, newcomments, ask, show, shownew, asknew, jobs, best, active, from | `/newest`, `/newcomments`, `/from?site=example.com` | `feed` (stories, or comments on `/newcomments`) | As Home | Context history | implemented | device (chips), adapter tests |
| submitted, threads, favorites | `/submitted?id=pg` | `feed` | As Home | Context history | implemented | static |
| hidden, upvoted | `/upvoted?id=<own name>` | `private-feed`, `feed` | As Home; HN's login page when signed out | Context history | implemented | device (Upvoted) |
| item | `/item?id=1` | `item` | Skeleton; error; "Sign in to comment" when signed out | Context history | implemented | device, adapter tests |
| user | `/user?id=pg` | `user` | Skeleton; "No such user"; error | Context history | implemented | device, adapter tests |
| formatdoc, faq, guidelines, lists, leaders | `/newsguidelines.html`, `/newsfaq.html`, `/lists` | `info` | Skeleton; error | Context history | implemented | device (Guidelines), adapter tests |
| submit | `/submit` | `submit`, `post` (context `post`) | Skeleton; HN's login page when signed out; "didn't show its submit form" | Context history; leave guard while a draft exists | implemented | device (form, guard), adapter tests |
| submit-result | `/r` | `submit`, `post` | HN's message above the form after a rejection | Context history | implemented, not exercised | adapter tests |
| Other HN URLs | `/login`, `/reply?id=1` | Website, same context | HN's page | Context history | platform behavior | |
| Other origins | article links | Website, same context (external) | | Context history | platform behavior | |

## Interactions

| Screen and control | Result | Action, route or website | Pending and failure | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| Home, Post, Me tabs | Select the context; reselecting returns it to its start page | `select(context)` | | implemented | device |
| Search, Saved tabs | Open the screen as the overlay root | `navigate({ screen, mode: "root" })` | | implemented | device |
| Feed chips (Top, New, Past, Comments, Ask, Show, Jobs) | Replace the Home page with that list | `navigate({ url, mode: "replace" })` | | implemented | device |
| Story title, comments, user | Open article, discussion or profile | `navigate({ url })` | | implemented | device |
| Save (bookmark on a story row) | Open the Save editor with a snapshot of the story | `navigate({ screen: "save" })` | | implemented | static |
| Upvote and unvote (stories and comments, signed in only) | Vote on HN | `setVoted` on `stories`, `story` or `comments`; clicks HN's own `#up_<id>` or `#un_<id>` | Shown voted while pending; inline error on `failed` | implemented | device (step 7) |
| More (feed) | Next page | `loadMore` page action (click `a.morelink`), expecting a feed page; falls back to `navigate({ url })` on failure | Button disabled while pending | implemented | adapter tests |
| More comments | Next page of the thread | `navigate({ url })` | | implemented | static |
| Comment Hide and Show | Collapse a branch | Local state | | implemented | static |
| Same-page comment link | Reveal target and ancestors, then scroll | Local state | | implemented | static |
| Reply, Add a comment, Sign in to comment | HN's reply or login page in the same context | `navigate({ url })` | | implemented | static |
| Profile Submissions, Comments, Favorites | The routed lists | `navigate({ url })` | | implemented | static |
| Post | Fill HN's fields, then submit HN's form | `setField` per field, then `submit` (expects `item` or `feed`, not `submit`) | "Posting…"; HN's message on `REJECTED`; "Check Hacker News" on `unknown` | implemented, not exercised (nothing is posted in testing) | adapter tests |
| Me: Profile, lists, Guidelines, FAQ | The routed pages | `navigate({ url })` | | implemented | device (Upvoted, Guidelines) |
| Me: Sign out | Confirm, then follow HN's logout link | `signOut` on `account`; signed out when observed, `AUTH_REQUIRED` or `CONTEXT_REPLACED` | Buttons disabled while pending; inline error otherwise | implemented, not exercised | adapter tests |
| Saved: filter chips, title filter, Edit | Filter the library; open the Save editor | Local state; `navigate({ screen: "saved", mode: "replace" })` keeps the filter in the screen | Error notice when the service is unreachable | implemented | device (unreachable service only) |
| Saved: Manage categories | Open the Categories screen | `navigate({ screen: "categories" })` | Status line; reread after a failure | implemented | static |

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

2026-11-08, full migration (decision-0006):

- `check` (no warnings), `build`, `typecheck` and `npm test` (adapter read functions on hand-written HN-shaped pages, including the submit form, account and information pages) passed.
- Device (emulator, signed in to a test account): Home with chips, the Me tab, Upvoted, Guidelines, Search, the Post form and its leave guard, and Saved showing its error with the service stopped.
- Not exercised: posting (nothing may be posted), sign-out, Saved and the editors against a running service.
- Known risk: a thread whose page exceeds the platform page limit shows a load error with the website button.
