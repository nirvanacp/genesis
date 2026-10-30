# X private Categories architecture

## Phase-4 product direction

The user requires two complete everyday applets, Hacker News and one X client. Internal browser contexts, source routes, Categories, backend services and reader pages do not create additional apps. Preserve stable applet IDs and data. The [controlling improvement plan](../.plans/phase-4/2026-10-30/214048-genesis-two-complete-applets-plan.md) defines the corrective work and acceptance. The current HN-only bundle and X debug qualification described below are implementation status, not the final product. HN functionality is the preservation baseline; X requires integrated end-to-end qualification.

Phase-4 implementation lives in `factory/applets/x.com`. X remains a debug-installed applet pending authenticated device qualification; only HN is selected by `genesis.packages.json`. See [qualification evidence and remaining checks](../.reports/phase-4/2026-10-30/211400-genesis-x-android-verification.md).

Five manifest sections select source contexts for Home, Explore, Alerts, Saved and Me. Runtime API 2 patterns adapt daily source routes, while auth/settings/chat/paid routes retain ordinary source presentation. Owned source effects provide shortcuts, a Me hub, Saved modes and per-post category actions. The source owns social actions, media, drafts and ordinary bookmarks. Folder controls never click X's bookmark action.

`extract-post.ts` takes bounded text snapshots from an article's own permalink, avoiding quoted-post identity. `post-controls.ts` binds managed watchers to post IDs and batches membership lookups. `account.ts` reads the signed-in profile link rather than the viewed author. Packaged-page entry uses a one-use host-local ticket and a visible source round trip; it cannot inspect another view's DOM. This handle check prevents accidental account mixing, not hostile impersonation.

`library.tsx` owns category-filtered server search, pagination, captured-post display, category management and safe live-post links. `repository.ts` persists operation IDs before writes, keeps retry payloads only in memory, and reconciles uncertain responses through operation status. Host storage contains preferences, tickets and pending metadata; it is not the category authority and contains no X password/cookie.

The separately hosted Node 24/SQLite backend authenticates a personal library with its independently provisioned bearer token. It enforces normalized category uniqueness, empty-only deletion, 50 categories, 10 memberships per post, canonical decimal post IDs, bounded snapshots, literal substring search, cursor revision checks and atomic receipt-backed mutations. No backend modules or secrets enter frontend bundles. Production hosting/backups and multi-user authorization remain outside this implementation.

The public SDK/services boundary supplies all browser-side capabilities. Rust and Android implement generic route, lifecycle, section, picker, shell and service contracts without X entities. [The operating guide](../.docs/phase-4/2026-10-30/210800-genesis-x-development-guide.md) describes build/import/service setup and the release gate.
