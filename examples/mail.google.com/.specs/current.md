# Current specification

## Identity

Name Gmail Only, id `gmail-only`, origin https://mail\.google\.com. Created 2026-11-08T23:59:17+05:30. One context `primary` (start URL `/mail/u/0/`, which Gmail redirects to its mobile web app at `/mail/mu/mp/239/`). Screens: `mail`, `todo`, `item`, `add`, `bulk`, `search`, `settings`, `accounts`, `account-setup`, `snoozed`. No services.

| Compatibility | Value |
| --- | --- |
| Manifest schema | 6 |
| Bundle format | 3 |
| Protocol | 1 |
| Adapter API | 1 |
| SDK and tools | 0.0.0 |
| Kit | 0.0.0 |

## Product scope

The user asked for a Gmail app built around the feature brief "To-do & Reminders from Email" (decision-0002), with every Gmail page drawn by the applet (decision-0003) and multi-account support written but switched off (decision-0006).

Core journeys:

- Read mail: inbox with Primary, Promotions and Social chips, system folders and the person's labels from the drawer, an open email with its attachments, star, archive, delete, mark unread, Gmail's other conversation commands, and Reply, Reply all, Forward.
- Save an email for later: the "Add to…" pill on an open email offers a quick reminder (presets), a full reminder form, a to-do form or a snooze. Selecting rows in a list offers the same for several emails ("Save for later"). Swipes on a row remind or archive (configurable).
- Work through the list: the To-do tab groups items "When it's due" under a week strip, or "When I added it" with type filters. Item detail has Reply, Snooze and Mark done, with Undo.
- See what is due: the Today card at the top of the inbox, reminder chips on inbox rows, "Back in your inbox" for reminders that bring their email back, and the To-do badge (due today plus overdue).
- Compose with "Remind me if no reply", which saves a follow-up to-do when the person continues to Gmail to write and send the message.
- Search Gmail with recent searches and filter chips, and see matching to-dos above the results.

Data ownership: Gmail owns mail, labels, stars and read state. The applet owns reminders, to-dos, snoozes, accounts and its settings, in Genesis storage on the device (decision-0004). Nothing the applet saves changes the Google account.

Not in scope, from the brief's "Not in version 1": AI-detected tasks, shared tasks and projects, calendar sync, repeating to-dos.

Open questions for the user:

- Phone notifications from the brief's section 9 are not built; the applet shows due items inside the app only (decision-0005). The user has not approved this as a deferral.
- Gmail's mobile web has no scheduled send or native snooze; snooze is done by the applet (decision-0004).

## Defaults and overrides

| Rule id | Current choice | Origin and reason | Decision |
| --- | --- | --- | --- |
| default-platform-menu | Shell floating menu button, Genesis menu and website bar, splash accent `#2347d9` from `shell.accent` | Factory default; accent from the user's mockups | |
| theme | Light and dark tokens in `src/theme.css`, following the system or the Theme setting | Agent, matching the mockups' palette | decision-0007 |
| multi-account | Built, hidden behind `MULTI_ACCOUNT_ENABLED = false` in `src/model.ts` | User instruction | decision-0006 |

## Routes

| Route id | Example URL | Page and screen | Context | Loading, empty, sign-in and error | Back | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `mail` | `/mail/mu/mp/239/#tl/priority/%5Esmartlabel_personal` | `mail` page, `mail` screen | primary | Skeletons while Gmail draws; empty state per list; sign-in screen that opens Google's page; load error with retry | Gmail history in the context | verified | device |
| `root` | `/` | same as `mail` | primary | same | same | implemented | static |

The `mail` screen picks a view from the one Gmail shows (decision-0003):

| Gmail view | Applet view | Status |
| --- | --- | --- |
| `#tl/…` lists, labels, search | Inbox or list, Today card, bulk bar | verified on the device (inbox, search) |
| `#cv/…` conversation | Open email | verified on the device |
| `#co` compose, reply, forward | Compose | verified (open and close; nothing sent) |
| `#mn` menu | Drawer | verified on the device |
| `#pr` Gmail settings | Gmail settings screen that opens Gmail's own page | verified on the device |
| Anything else | Themed screen that offers Gmail itself | implemented, not seen on the device |

## Interactions

| Screen and control | Result | Action, navigation, website or store | Pending, failure and unknown | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| List row | Opens the email | Navigates to the thread URL | Skeleton until Gmail draws it | verified | device |
| List avatar | Selects the row, shows the bulk bar | `threads.setSelected` | Selection is Gmail's own | implemented | static |
| Bulk bar Archive, Delete, Save for later | Archives, trashes, or opens `bulk` | `archiveSelected`, `trashSelected`, `bulk` screen | | implemented | static |
| Row swipe | Remind or archive, per settings | `add` sheet or `threads.archive` | | implemented | static |
| Email "Add to…" | Menu with presets, Reminder, To-do, Snooze | `add` sheet; store `items` | Save failure keeps the sheet open | verified | device |
| Email toolbar | Archive, Delete, Mark unread, Snooze, more | `conversation.*` actions | Unknown outcome shows a toast | implemented (not run: they change the account) | static |
| Reply, Reply all, Forward | Compose with fields filled | Gmail's own buttons, then `compose.fill` | Body is typed and sent in Gmail (decision-0008) | implemented | static |
| Compose Close | Back to the list | `compose.discard`; falls back to Back | | verified | device |
| Drawer folders and labels | Opens the list | URL navigation; labels through `menu.open` | | verified (folders listed) | device |
| To-do views, week strip, filters | Groups and filters items | Store `items` | | verified | device |
| To-do add button | Manual to-do form | `add` sheet; store `items` | | verified (added, then deleted) | device |
| Item Mark done and Undo | Marks done, restores | Store `items` | Conflict rereads the item | verified | device |
| Item Delete | Removes the item, toast with Undo | Store `items` | | verified | device |
| Item Snooze, Change, Edit | Snooze chips, edit form | Store `items` | | implemented | static |
| Search | Results, matching to-dos, filter chips | URL navigation to `#tl/search/…` | | verified | device |
| Mail and To-do tabs | Switch sections | Inbox URL or `todo` screen | | verified | device |
| Gmail Only settings | Stored preferences | Store `settings/prefs` | | verified (opened) | device |
| Accounts, Snoozed | Account list, snoozed emails | Store `accounts`, `items` | | verified (opened) | device |

## Data

| Collection or service path | Owner | Key | Shape version | Notes |
| --- | --- | --- | --- | --- |
| `items` | Applet | Random item id | `v: 1` | Reminders, to-dos and snoozes. Each keeps the linked email (thread id, sender, subject, snippet) and its account id. Done items are purged after the "Keep done items" setting. |
| `accounts` | Applet | Id derived from the email address | `v: 1` | Name, color, Gmail session index, "Show in inbox" and "Show in To-do". Created when a signed-in account is first seen. |
| `settings/prefs` | Applet | `prefs` | `v: 1` | Brief section 12 settings, swipe actions, theme, recent searches. |

## Current work and verification

Verified on 2026-11-09 on emulator-5556 (Android 17, `app.nirvana.genesis`), installed revision 12, with the one test Google account, light and dark mode. Evidence kind: device with the real website. Checked: inbox, Today card, reminder chip, open email with attachment, "Add to…" and the reminder sheet, item detail with Mark done and Undo, To-do in both views, manual to-do add and delete, drawer, accounts, snoozed, Gmail Only settings, Gmail settings, search, compose open and close, and the tabs. Static checks: `npm run typecheck`, `npm run check`, `npm run build`, and `tsc --noUnusedLocals`.

Not verified, because each changes the Google account or needs a second one: archive, delete, mark unread, spam and the other conversation commands; bulk archive and delete; swipes; snooze (it archives); archive after adding a to-do; sending mail; account switching and setup with a second session. Also not seen: the fallback screen for unknown Gmail views, the sign-in screen, and list error states.

Known limits:

- No phone notifications (decision-0005).
- The compose body is written in Gmail, not in the applet (decision-0008).
- The Primary chip's unread count can be missing after returning from compose, until Gmail's menu is read again.
- One reminder, "Wallpaper Image Share", is stored on the test device from verification. It lives in applet storage only.
