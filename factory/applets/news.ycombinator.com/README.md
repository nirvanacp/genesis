# Hacker News applet

This applet adapts Hacker News while preserving its real login/forms and source links. Home, Post, and Me are source sections; Search is an intentional local placeholder; Saved is an owned React page. Bookmarks/categories live on the applet-owned HTTPS service. Public account identity and Post drafts use optional applet-scoped host documents; credentials stay in WebView/native service storage.

Follow [factory instructions](../../AGENTS.md). From the Genesis root use workspace typecheck, selected package validation, and the shared build tooling. Service start is explicit through genesis-applet service start with this directory and an authorized device, or the root compatibility wrapper. Current builds use runtime API 2 and SDK/tools 0.3.0; the updated host also accepts existing API-1 bundles. Use an install-as-update host workflow to preserve hn-bookmarks identity and data.

For local backend startup, run `./start.sh` from this directory, or `./factory/start-applet-servers.sh` from the Genesis root for all applets. After reboot/reconnecting Android, add `--device <adb-serial>` to restore its tunnel and service connection. HN reserves port 8787 in `factory/ports.json`. Node 24, installed workspace dependencies and OpenSSL are required; SQLite is built into Node and needs no separate server. The helper reuses private data and credentials under `~/.local/share/genesis/services/hn-bookmarks/bookmarks/`, including `documents.sqlite3` and `server.log`. `./start.sh --stop` stops the managed backend and preserves data. Repeated startup checks health and reuses the managed process. See [startup and ports](../../guides/services-and-data.md#local-startup-and-port-assignments). These scripts are for the operator; agents maintain and statically check them without running services unless explicitly asked.

| Local startup journey | Expected result | Verification |
| --- | --- | --- |
| Run `start.sh` after a computer restart | Existing HN backend data/credentials reused; authenticated HTTPS ready on 8787 | Static checks only; startup intentionally not executed |
| Rerun with `--device <serial>`, open HN Saved | Android tunnel and service connection restored; existing bookmarks available | Operator/device verification required |
| Run `start.sh --stop` | Backend stops; records and credentials preserved | Static checks only |

The backend is a personal single-token/single-database server, not a multi-user account system. Production requires trusted HTTPS, durable storage, backups, and managed credentials. No Node runtime is bundled in Android. Supported source routes and shell destinations are enumerated in applet.json. Real HN posting is never a routine verification action; its authorized prelaunch check remains separate.

For phase 4, preserve this working applet and its stable ID. Limit HN changes to measured UI improvements under the [two-app improvement plan](../../../.plans/phase-4/2026-10-30/214048-genesis-two-complete-applets-plan.md). Search remains the existing placeholder described above; do not report it as functional search or silently expand a visual-polish change into a search/backend rewrite.

## Category bookmark verification

Required behavior is to save live HN stories into one or more categories within the existing `hn-bookmarks` app, edit those assignments, filter Saved, and preserve records across app restarts. The bookmark service remains authoritative. Source browsing and the existing library must remain intact. Delivery for this check was the installed Android debug applet, without a source or package update.

Verified on 2026-10-31 using Android Studio device `emulator-5554`, runtime API 2, applet revision `8d0c52983ccac91033eca52f2dd57fe1322369f0f05b2ec7069346931dd4ee0d`, and the real HN source and HTTPS bookmark service. Saved initially showed an unavailable error because the HN backend was stopped and its adb reverse tunnel was missing. After explicit user authorization, `./start.sh --device emulator-5554` restored both using the existing private database. No bookmark logic defect was reproduced.

| Journey | Expected result | Device result |
| --- | --- | --- |
| Launcher → HN → story Save → create category → save | Story appears in Saved with the category | Passed |
| Assign two categories, select each filter, remove one assignment | Memberships persist independently; removed filter becomes empty | Passed |
| Rename category; create a case-insensitive duplicate | Membership survives rename; duplicate is rejected visibly | Passed |
| Saved → discussion → Back → Saved | Correct HN story opens; selected category is retained | Passed |
| Force-stop/relaunch Genesis → HN → Saved | Bookmark, category membership, and filter persist | Passed |
| Delete the remaining assigned category | Story stays saved under Uncategorized | Passed |
| Cancel removal, then confirm removal | Cancellation keeps the story; confirmation removes it | Passed |
| Clean up disposable records | Original library remains; temporary categories/bookmark are absent | Passed |

The backend and HN tunnel were left running. Temporary diagnostic forwarding was removed. The package checker and shared port-registry checker passed. This check did not cover concurrent clients, write timeouts, the 50-category limit, TalkBack, large text, or other devices. The backend must be running and the device connection restored after a restart; this repair does not add automatic service startup.
