# Current X specification

## Identity

- Name X, applet id `x-bookmarks`, origin `https://x.com`.
- Three contexts, each with its own website session history: `primary` (Home, Notifications and Saved, start URL `/home`), `explore` (`/explore`) and `account` (`/settings/account`, the Profile tab). The adapter is [src/adapter.ts](../src/adapter.ts) with pages `timeline`, `post`, `profile`, `explore`, `media` and `account` in [src/adapter](../src/adapter).
- Screens: route screens `home`, `notifications`, `saved`, `explore`, `post`, `profile`, `media` and `account`; overlay screens `categories`, `save` and `manage`. Service: `bookmarks`.
- Manifest schema 6, `@genesis/sdk` 0.0.0, `genesis-applet` tools 0.0.0, protocol 1, adapter API 1. Kit version: not exported for this in-repository applet. The [manifest](../applet.json) is the authority for routes and contexts.
- Installed for development with `dev install`; it is not bundled into the APK.

## Product scope

One complete X client with five tabs: Home, Explore, Notifications, Saved and Profile, in the mobile X visual identity. Saved holds Bookmarks, Likes and the private Categories library in one row. Preserve post detail with its conversation, the media viewer, profiles with Posts, Replies and Media, liking and bookmarking.

Data authority: X owns accounts, posts, likes and bookmarks. The `bookmarks` service owns Categories and the post snapshots filed in them; it is a personal backend bound to one X handle, not a multi-user service. Website cookies never authenticate the service. Categories and X bookmarks stay independent: filing a post never bookmarks it, and removing it from Categories never changes its X bookmark.

Excluded: automatic import or sync of X bookmarks into Categories, an offline write queue, and a media archive.

## Defaults and overrides

| Rule id | Current choice | Origin and reason | Decision |
| --- | --- | --- | --- |
| default-platform-menu | Shell menu button, accent `#1d9bf0`; the first row of every screen leaves the button's corner clear | Factory default | decision-0003 |
| default-primary-navigation | One bottom tab bar of five sections; reselecting the active root tab scrolls to the top; hidden in the media viewer | Inherited user choice | decision-0001 |
| default-pending-skeletons | Neutral, static, content-shaped skeletons | Factory default | |
| default-compact-website-cue | External-link icon on every control that opens the website (shown with the website bar and Done) | Factory default | |
| default-theme-and-layout | Neutral X palette, light and dark, system font, 15px/20px post text, 40px avatars, hairline separators | Inherited user design direction | decision-0002 |
| Category editors | `save` and `manage` screens in the stack instead of keyboard-safe sheets, so Android Back closes them | Agent choice for SDK 0.0 | decision-0004 |

## Routes

Routes are matched in manifest order and the first match wins. A URL without a route shows X's page itself in its context.

| Route id | Example URL | Page and screen | Loading, empty, sign-in and error | Back | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| home | `/home` | `timeline`, `home` (context `primary`) | Skeleton; X's empty-state text; sign-in prompt; error with website button | Context start | verified | device |
| notifications | `/notifications` | `timeline`, `notifications` (`primary`) | As above | Context history | verified | device |
| bookmarks, bookmarks-alias, own-likes | `/i/history`, `/i/bookmarks`, `/i/history/likes` | `timeline`, `saved` with the Saved row (`primary`) | As above | Context history | verified (Bookmarks) | device |
| explore, search, hashtag | `/explore`, `/search?q=genesis`, `/hashtag/android` | `explore`, `explore` (context `explore`) | Skeleton; empty notice; error | Context history | verified (explore) | device |
| account | `/settings/account` | `account`, `account` (context `account`), then replaced by the own profile | Sign-in prompt when signed out | Context start | verified (signed in) | device |
| photo | `/XDevelopers/status/1/photo/1` | `media`, `media` | Black viewer; Open on X on failure | Context history | implemented | static |
| post | `/XDevelopers/status/1` | `post`, `post`: one `thread` region split at the post the URL names | Skeleton; X's empty text; error | Context history | verified | device |
| likes | `/XDevelopers/likes` | `timeline`, `saved` without the Saved row unless it is the signed-in handle | As for home | Context history | implemented | static |
| replies, profile-media, profile | `/XDevelopers/with_replies`, `/XDevelopers/media`, `/XDevelopers` | `profile`, `profile` with Posts, Replies and Media | Skeleton; empty notice; error. One-segment X pages such as `/messages` match `profile` and show the error "This X page isn't a profile" with Open on X | Context history | verified (other and own profile) | device |
| Other X URLs | `/i/flow/login`, `/XDevelopers/following` | X's page in the context | X's page | Context history | implemented | static |

## Interactions

| Screen and control | Result | Action, navigation, website or store | Pending and failure | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| Tabs | Home selects `primary`, Explore `explore`, Profile `account`; Notifications and Saved load their X page in `primary` unless it already shows them | `select`, `navigate({ url, context: "primary" })` | | verified (all five) | device |
| Post body, author, quote | Open the post or profile | `navigate({ url })` | Unrouted pages show X's page | verified | device |
| Post photo | Open the media viewer; Previous and Next replace the entry | `navigate({ url, mode: "replace" })` | Open on X when the photo is missing | implemented | static |
| Like | Like or unlike on X | `setLiked` on the row of the region the post is shown in | Optimistic state while pending; inline error; disabled while stale or without an account | implemented, not exercised | static |
| Bookmark | Bookmark or remove the X bookmark | `setBookmarked`, as above | As above | implemented, not exercised | static |
| Show more | X loads the next rows | `loadMore` page action: scroll X's page to its end until the last row changes | "No more posts right now." when the last row stays put | verified (Home) | device |
| Saved row: Bookmarks, Likes, Categories | Switch Saved view | `navigate` URL in `primary`, or the `categories` overlay | | verified (Bookmarks) | device |
| Categories chips, search, Load more | Filter and page filed posts | `bookmarks` service | Skeleton; unavailable notice with Try again | verified (unavailable state) | device |
| Save to categories and Edit | Open the `save` overlay | `bookmarks` service | Conflict rereads; a pending change is checked before new writes | verified (unavailable state) | device |
| Manage categories | Create, rename and delete categories | `bookmarks` service | Delete confirmation; nonempty categories are refused | implemented, writes not exercised | static |
| Edit profile, Reply, Compose, Sign in | X's page in the context | `navigate({ url })` | | implemented | static |
| Profile tab after sign-in or sign-out | Read the account again | `reload("account")` at the app root on resume | | implemented | static |

## Data

| Collection or service path | Owner | Key | Shape version | Notes |
| --- | --- | --- | --- | --- |
| `bookmarks` service, table `libraries` | Applet service | Library id | 1 | Expected X handle, set at first database creation; the account source must match it |
| `bookmarks` service, table `categories` | Applet service | Library id and category id | 1 | Name, revision; at most 50 |
| `bookmarks` service, table `saved_posts` | Applet service | Library id and post id | 1 | Post URL and snapshot, revision, saved time |
| `bookmarks` service, table `memberships` | Applet service | Library, post and category ids | 1 | At most 10 categories per post |
| `bookmarks` service, table `operations` | Applet service | Library id and operation id | 1 | Receipts for idempotent writes |
| Local collection `operations` | Applet storage | `pending:<libraryId>` | 1 | Marker for a write whose outcome is unknown; checked before the next write |

The backend and its records are unchanged by the SDK 0.0 rewrite. Categories restores its search and category filter from the local `preferences` collection (key `library:<libraryId>`) and writes them back when the user changes them; its scroll position is kept by the SDK. The old `session` collection is no longer read.

## Current work and verification

2026-11-08, migration to adapter pages, regions and contexts, on the `emulator-5554` emulator (Android 17) with a signed-in X account and no running `bookmarks` service:

- Static: `check` (no warnings), `typecheck` and `build` passed.
- Device: Home, Explore with trends and People, Notifications, Saved Bookmarks, the Profile tab moving on to the own profile, another account's profile, and a post with the thread split at the focal post rendered. Saved to Home returns to `/home`. Show more added rows from X. The Save overlay showed its unavailable state and Back closed it.
- Fixed: a focused post's view count read "87.7K Views views".
- Not exercised: like and bookmark actions (no X action was performed), the media viewer, search and hashtags, signed-out states and dark mode.
- Known gaps: notification text runs X's name, time and text together; a one-segment X page that isn't a profile shows an error with Open on X instead of X's page.
