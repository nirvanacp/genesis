# X applet

This is the single X application inside Genesis, built over the live X website. Timelines, search, conversations, profiles, messages, media, authentication and private Categories belong to this one applet. Categories is an integrated feature whose data has a separate backend authority. X bookmarks stay in X. Saving or removing a category record never changes an upstream bookmark.

## Product brief

One X client over the live mobile website, with native Home, Explore, Notifications, Saved and Profile sections. Keep X's typography, timelines, search, conversations, media, profiles, account drawer, forms and original social actions. Profile opens the actual signed-in profile. There is no separate account hub or fabricated notifications page. Saved keeps X's Bookmarks and Likes tabs and adds Categories to the same row.

The user requested this correction on 31 October 2026. It supersedes the earlier plan's custom Me hub and extra Saved mode row. Preserve the stable `x-bookmarks` identity, source IDs, sessions and both bookmark authorities. Delivery remains the existing development-installed X applet in Genesis. No neighboring applet source is changed.

| Journey | Required behavior |
| --- | --- |
| Home / Following, Explore / search, Notifications / Mentions | Live source content and tabs, one native primary footer, no content hidden under source headers |
| Profile, conversations, media and source account drawer | Original source behavior and return navigation; no invented replacement pages |
| Saved | One Bookmarks / Likes / Categories row, independent upstream and private saved records |
| Save to category | Select one or more categories, create categories, confirm the backend write and show membership on the correct post |
| Categories | Search the whole library, filter categories, create/rename/manage categories, open the live post and return |
| Login, settings, messages and composer | Source-owned controls and account gates; verification never submits posts/messages or changes account settings |

See the [current audit and verification matrix](../../../.reports/phase-4/2026-10-31/083700-x-ui-audit-and-verification.md) for observed results and remaining checks. Website requests can fail independently; retain X's retry/recovery controls.

## Rendering

Genesis's **Applet options → Rendering** setting is available to any applet and stored on this device for that applet ID. X's authenticated emulator session exhibited distorted text, clipped compose controls and broken video painting under the host's default software renderer. Switching X to **Hardware acceleration** immediately corrected those defects. Other applets retain their existing settings. This is a host preference, not an X manifest flag or a source font override.

Requires Genesis runtime API 2 and SDK/tools 0.3.0. The applet uses only public SDK APIs. Origin permission is limited to `https://x.com`. Website sessions remain in WebView and never authorize the category server.

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

Categories and selected bounded post snapshots are authoritative in the backend. Categories support multiple membership, up to 50 categories and 10 categories per post. A nonempty category cannot be deleted. The backend provides operation receipts and revision preconditions. After uncertain writes, check the same operation rather than resubmitting a new ID. No offline fallback or automatic import of X/HN bookmarks exists.

The packaged library verifies the signed-in X account through a one-use source round trip before showing records. Mobile detection reads the signed-in bootstrap entity and checks signed-in source controls; desktop detection uses the profile navigation link. The viewed post author is never used as the library account. It cannot inspect another WebView's DOM. Saved records are snapshots, may outlive source edits/deletion, and contain no downloaded media. Open the live post for current content and social actions.

## Verification

From this directory run `npx --no-install genesis-applet check . --json` and `npx --no-install genesis-applet build . --out /absolute/output --json`. Backend scripts support `node --check`. Static checks do not qualify source selectors, navigation, Android accessibility, service availability or source attachment handling. See the phase-4 qualification report for the actual device/provider coverage when available.

No background collection, full media archive, automatic folder sync, chat passcode creation, calls/microphone integration or production distribution is supplied. Source actions and account changes require the user's intent. Preserve ordinary-site recovery for unsupported layouts.
