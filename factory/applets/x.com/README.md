# X applet

X is one applet with native Home, Explore, Notifications, Saved and Profile sections. It uses SDK/tools 0.4.0, runtime API 3 and manifest schema 2. Stable applet/source/page/service IDs and both existing bookmark stores are preserved.

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

Run the applet CLI check/build, workspace TypeScript check and backend `node --check` commands. Device acceptance must cover the actual authenticated applet, source tabs, internal/external transitions, provider Close/Back, category writes/read-back/cleanup and source isolation. See current phase-5 records for observed results. Static checks do not qualify current selectors or website behavior. Physical-device, localized layouts, Premium-only folder flows and multi-user service provisioning require separate qualification.
