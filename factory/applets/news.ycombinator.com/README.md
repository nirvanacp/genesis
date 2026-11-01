# Hacker News applet

HN now uses manifest schema 2, SDK 0.4.1 and tools 0.4.2 and runtime API 3. Its upstream document stays hidden behind a native opaque layer. The source adapter publishes validated story/comment/profile/information models; `src/app.tsx` renders the owned foreground. This supersedes the source-table styling described in historical phase-4 records below. Keep stable ID `hn-bookmarks`, source/section/page IDs, service `bookmarks` and all existing record keys.

Home/feed families, discussion, public profiles/lists and informational pages have owned renderers. The manifest contains the exact route contract, including required item/profile query IDs and explicit unmatched handling. Me shows observed account state in the foreground. Saved reuses the existing backend/category components with an owned screen lifetime. Search retains its documented placeholder.

Login/logout/account changes, posting, reply/vote/edit/delete actions and source forms use explicit framework website presentation. External article links use the bridge-free reader. Native Close restores/revalidates the owning applet. Login tokens, form fields and cookies never enter the source data model; sign-out remains an original-site action. No source action is submitted as routine verification.

Current migration checks passed CLI/type/build validation and real QA feed, discussion, comment collapse, website-form presentation/Close, Saved save/read-back, category creation/assignment/filtering, text entry and section re-entry. Temporary records were removed and the original library was preserved. Final everyday-host delivery, signed-in flows and broader failure/accessibility checks continue in the phase-5 verification report. Earlier reports do not qualify this revision.

For local backend startup, run `./start.sh` from this directory, or `./factory/start-applet-servers.sh` from the Genesis root for all applets. After reboot/reconnecting Android, add `--device <adb-serial>` to restore its tunnel and service connection. HN reserves port 8787 in `factory/ports.json`. Node 24, installed workspace dependencies and OpenSSL are required; SQLite is built into Node and needs no separate server. The helper reuses private data and credentials under `~/.local/share/genesis/services/hn-bookmarks/bookmarks/`, including `documents.sqlite3` and `server.log`. `./start.sh --stop` stops the managed backend and preserves data. Repeated startup checks health and reuses the managed process. See [startup and ports](../../guides/services-and-data.md#local-startup-and-port-assignments). These scripts are for the operator; agents maintain and statically check them without running services unless explicitly asked.

| Local startup journey | Expected result | Verification |
| --- | --- | --- |
| Run `start.sh` after a computer restart | Existing HN backend data/credentials reused; authenticated HTTPS ready on 8787 | Static checks only; startup intentionally not executed |
| Rerun with `--device <serial>`, open HN Saved | Android tunnel and service connection restored; existing bookmarks available | Operator/device verification required |
| Run `start.sh --stop` | Backend stops; records and credentials preserved | Static checks only |

The backend is a personal single-token/single-database server, not a multi-user account system. Production requires trusted HTTPS, durable storage, backups, and managed credentials. No Node runtime is bundled in Android. Supported source routes and shell destinations are enumerated in applet.json. Real HN posting is never a routine verification action; its authorized prelaunch check remains separate.

## Current verification and form ownership

The phase-5 emulator checks cover owned feed/discussion, new-comments/parent/context/author links, profiles, Saved/category operations and cleanup, explicit website presentation/Close and offline refresh recovery. Existing bookmark/category records were preserved. The current phase-5 verification report records exact revisions and remaining qualification limits.

Post, reply, authentication and account forms remain original website forms in the framework provider. Native Stay/Leave protects a live edited form. Legacy public draft records are preserved in host storage but are not injected into original forms; durable form restoration after process death is not supplied. The obsolete source-style/account/draft-injection modules were removed so new customization work follows the active source/foreground contract.

Historical API-2 checks and older phone reports qualify only their recorded revisions, not this migration. Search remains the documented placeholder. Real posting/voting/account mutations are not routine QA actions.

Missing content anchors and unfinished profile/discussion markup remain loading until validated content or the framework deadline. Invalid route parameters still produce unsupported outcomes; successful empty structures remain distinct from failed reads.

The [source loading repair qualification](../../../.reports/phase-5/2026-11-01/091700-genesis-loading-repair-verification.md) records installed SDK 0.4.1 and tools 0.4.2 revisions, repeated X navigation, genuine recovery and shared-host checks. It supersedes earlier loading/recovery qualification for those journeys and states the remaining device/transport/accessibility limits.

Gray content skeletons are the default for source transitions, account/library/dialog reads and pagination. Pending operations retain hidden accessible status and real errors remain explicit. See [skeleton verification](../../../.reports/phase-5/2026-11-01/093559-genesis-skeleton-loading-verification.md) for installed revisions and limits.
