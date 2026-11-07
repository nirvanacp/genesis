# Current X specification

## Identity

- Name X, applet id `x-bookmarks`, origin `https://x.com`.
- Sources: `primary` (timelines, notifications, bookmarks, likes, posts, profiles, media), `explore` (trends, search, hashtags) and `account` (the signed-in handle from `/settings/account`). Adapters are in [src/sources](../src/sources).
- Screens: `home`, `explore`, `notifications`, `saved`, `post`, `profile`, `media`, `account`, `categories`, `save`, `manage`, `unsupported`. Service: `bookmarks`.
- Manifest schema 5, `@genesis/sdk` 0.0.0, `genesis-applet` tools 0.0.0. Kit version: not exported for this in-repository applet. The [manifest](../applet.json) is the authority for routes and sources.
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
| default-compact-website-cue | External-link icon on every control that opens the website sheet | Factory default | |
| default-theme-and-layout | Neutral X palette, light and dark, system font, 15px/20px post text, 40px avatars, hairline separators | Inherited user design direction | decision-0002 |
| Category editors | `save` and `manage` screens in the stack instead of keyboard-safe sheets, so Android Back closes them | Agent choice for SDK 0.0 | decision-0004 |

## Routes

| Route id | Example URL | Screen or website | Loading, empty, sign-in and error | Back | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| home | `/home` | `home` | Skeleton; empty notice; sign-in prompt; error with website button | Tab root | verified | device |
| notifications | `/notifications` | `notifications` | As above | Tab root | verified | device |
| bookmarks, bookmarks-alias | `/i/history` (X redirects `/i/bookmarks` there) | `saved`, Bookmarks tab | As above | Tab root | verified | device |
| own-likes, likes | `/i/history/likes`, `/<handle>/likes` | `saved`, Likes tab for the signed-in handle; a likes feed otherwise | As above | Stack | verified (own Likes tab) | device |
| explore, search, hashtag | `/explore`, `/search?q=genesis`, `/hashtag/android` | `explore` | Skeleton; empty notice; error | Tab root or stack | verified (explore) | device |
| account | `/settings/account` | `account` (source `account`), then replaced by the own profile | Sign-in prompt when signed out | Tab root | verified (signed in) | device |
| profile, replies, profile-media | `/XDevelopers` | `profile` with Posts, Replies and Media tabs | Skeleton; partial notice with See more on X; error | Stack | verified (own profile) | device |
| post | `/XDevelopers/status/1` | `post` with ancestors and replies; matched before `post-pages` | Skeleton; partial notice; error | Stack | verified | device |
| photo | `/XDevelopers/status/1/photo/1` | `media` | Black viewer; Open on X on failure | Stack | verified (one photo) | device |
| website-* (root, login, logout, flow, compose, settings, account-pages, messages, internal, tos, privacy, about, download, post-pages, following, followers, verified-followers, avatar-photo, header-photo) | `/i/flow/login` | Website sheet | X's page | Sheet | implemented | static |
| Other X URLs | `/XDevelopers/lists` | `unsupported` with an Open on X button | | Stack | implemented | static |

## Interactions

| Screen and control | Result | Intent, route, website or store | Pending and failure | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| Post body, author, quote | Open the post or profile | Route | Unsupported screen for unknown pages | implemented | static |
| Post photo | Open the media viewer; Previous and Next replace within the post's photos | Route | Open on X when the photo is missing | implemented | static |
| Like | Like or unlike on X | `like` intent on the screen's source (`primary` or `explore`) | Disabled while pending; inline error | implemented, not exercised | static |
| Bookmark | Bookmark or remove the X bookmark | `bookmark` intent on the screen's source (`primary` or `explore`) | Disabled while pending; inline error | implemented, not exercised | static |
| Saved row: Bookmarks, Likes, Categories | Switch Saved view | Route or screen | | verified (Bookmarks, Categories) | device |
| Categories chips, search, Load more | Filter and page filed posts | `bookmarks` service | Skeleton; unavailable notice with Try again | verified (unavailable state) | device |
| Save to categories and Edit | Open the `save` screen | `bookmarks` service | Conflict rereads; a pending change is checked before new writes | implemented, writes not exercised | static |
| Manage categories | Create, rename and delete categories | `bookmarks` service | Delete confirmation; nonempty categories are refused | implemented, writes not exercised | static |
| Edit profile, Reply, Compose, Sign in | X page in the sheet | Website | | implemented | static |
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

2026-11-06 on the `emulator-5554` emulator (Android 17), signed-in X account, local `bookmarks` service not running:

- Static: `check`, `typecheck` and `build` passed.
- Device, real website: Home timeline, Explore, the own Profile and Saved Bookmarks rendered in light mode. Categories showed its unavailable state because the service was not started.
- Not exercised: like and bookmark writes, Categories reads and writes, search, signed-out states and dark mode. No X action was performed.
- Acceptance run, same day: Notifications and the Likes tab rendered. A post opened the Post screen with its replies after the route fix below; its photo opened in the media viewer with Previous and Next disabled, and Back returned to the post and then Home. Next and Previous across several photos were not exercised. Reply opened X's compose page in the website sheet, and Return restored Home at the same scroll position.
- Fixed: the `post-pages` website route (`/:handle/status/:id/*`) was listed before `post`, and a trailing `*` also matches the bare prefix, so every post opened in the website sheet. `post` now comes first.
- Known gap: news-style trends show the headline as context and the trend line as the name.
