# Genesis Hacker News bookmarking applet plan

Architecture revision approved 28 October: all browser customization and the managed DOM runtime use TypeScript/JavaScript under `packages/sdk/` and `applets/`, with React for custom dialogs and local pages. Native Rust retains the controller, contracts and SQLite services. HN refuses Wasm compilation in its source realm, as recorded in the [historical qualification report](../../.reports/2026-10-28/162112-genesis-hn-wasm-qualification-report.md). The TS runtime passed [MVP-02 emulator qualification](../../.reports/2026-10-28/174427-genesis-hn-typescript-qualification-report.md); MVP-03 passed emulator verification. MVP-04 storage is implemented with Android end-to-end gates pending; see the [current progress report](../../.reports/2026-10-28/182416-genesis-mvp04-storage-progress-report.md). Physical hardware remains required before release in MVP-07.

Created 27 October 2026, Asia/Kolkata. Revised scope: only `applets/news.ycombinator.com/`. Read the [MVP architecture](150238-genesis-mvp-implementation-plan.md) and [runtime/SDK contract](150238-genesis-runtime-sdk-plan.md). The earlier applet directories remain preserved and inactive. This filename replaces the earlier YouTube/X applets plan.

## 1. Product and current implementation

Package ID is `hn-bookmarks`, display name `Hacker News with Genesis bookmarks`, source ID `primary`, start URL `https://news.ycombinator.com/`. Injection origins contain exactly `https://news.ycombinator.com`. There are no content-blocking rules and no authentication dependency.

MVP-02 supplies a qualification entry, structural target inspector and packaged React library qualification page. Bookmark extraction, controls, repository, categories and storage operations remain future stage work. Do not present this entry as a working bookmark feature.

The final applet adds an explicit `Save to Genesis` control to supported public story rows. Save opens one dialog with captured title, HN discussion link and optional categories. Existing saves open Edit categories with a separate Remove action. Preserve all original title/comment/navigation/vote/favorite controls. Genesis never requests HN login, clicks favorite/vote, or submits forms on behalf of the user.

The library works offline for saved metadata. It offers All, Uncategorized, category filters, category management, Edit categories, Remove and Open discussion. Its scope is local to this Genesis installation. It neither imports nor synchronizes HN favorites.

## 2. Required website coverage and inspection

Qualify public home/news, newest, Ask HN, Show HN, next-page navigation and top-level story rows on `item?id=<id>` discussion pages. Include external-link stories and self-posts, empty lists, unavailable/deleted items, viewport/rotation changes and Back/Forward. Comment bookmarking, jobs, user profiles, login forms and third-party search results are outside required coverage. Leave unsupported pages intact and show a feature diagnostic rather than inventing an item identity.

Public HTML fetched on 27 October 2026 showed `tr.athing.submission[id]`, `.titleline > a`, and an immediately following metadata row containing `.subtext`. Discussion HTML for item 1 also contains `tr.athing.comtr` comments. Consequently `.athing` alone is unsafe as a story selector. References: [HN home](https://news.ycombinator.com/), [newest](https://news.ycombinator.com/newest), [Ask](https://news.ycombinator.com/ask), [discussion example](https://news.ycombinator.com/item?id=1). This is public desktop-response evidence, not Android execution-world qualification. Recheck actual WebView markup and retain structural evidence in `targets.ts`.

| File | Responsibility |
| --- | --- |
| `applet.json` | Exact source origin, entries and manifest Library action |
| `src/main.ts` | Qualification now; future watchers and feed-button lifecycle |
| `src/targets.ts` | Supported story/metadata anchors and variant diagnostics |
| `src/item-url.ts` | Pure HN item-ID and discussion-URL parsing |
| `src/extract-item.ts` | Bounded immutable story snapshot from verified source DOM |
| `src/repository.ts` | Applet record validation, bookmark transactions and pagination |
| `src/categories.ts` | Category normalization, uniqueness and atomic changes |
| `src/components/` | React dialog and category/library UI |
| `src/library.tsx` | Packaged library entry and cleanup |
| `src/styles.css`, `src/library.css` | Scoped owned UI styles |

All these algorithms belong in the applet. Do not add HN selectors or bookmark fields to Java, generic Rust storage or the build script.

## 3. Item identity and extraction

1. Discover a qualified submission row containing a primary title anchor. Require a positive decimal row ID as a string, never a JavaScript number. Reject missing, nondecimal, conflicting or ambiguous identity. Do not treat nested comments as submissions.
2. Generate the canonical discussion URL as `https://news.ycombinator.com/item?id=<id>`. `item-url.ts` accepts only this exact HTTPS origin and `/item` path with one positive decimal `id`; reject credentials, duplicate IDs and malformed values. Drop unrelated query parameters and fragments after validation. Identity is the item ID, not title, rank, author or external URL.
3. On a discussion page, match the top-level submission row ID to the document's `id`. A direct comment permalink without a matching story row is unsupported, not an instruction to save the comment or guess its parent.
4. Read the title anchor's plain text and its own href. Self-posts may link to the HN item itself. Store an optional article URL only if it resolves to HTTP/HTTPS without credentials. Keep it separate from the canonical discussion URL; external URLs never become bridge origins.
5. Read submitter only from the immediately associated metadata row, bounded before the next submission. Missing metadata is allowed; never borrow the next story's author. Verify item links there against the row ID when present. Do not extract nested comment bodies.
6. Bound title to 2,048 UTF-8 bytes, submitter to 256 and article URL to 2,048; mark text truncation. Invalid/oversized article URLs become null with a diagnostic. Store plain text, not HTML. Do not fetch an article, use an HN API, download images or copy whole threads.

## 4. Owned Save controls and interaction

Mount a plain-DOM button in one owned Shadow DOM host per supported story, appended into a qualified title cell or metadata cell outside existing links. Never put a div directly under a table row, replace the HN table, or mount React on website-owned roots. HN retains its original DOM and behavior.

Use runtime `watchElements` with item ID as content key. On row reuse or identity change, dispose the old control before binding a new one. Async saved-state lookups must check the current binding; capture an immutable item snapshot when the dialog opens. Use one React root for the active dialog rather than a root per row.

The Save button must not navigate, vote or favorite. Use a button with an accessible name and visible focus. One runtime modal handles focus, Escape and native Back. Cancel leaves bookmark membership unchanged. An explicit Create category action commits the category independently and is labeled accordingly.

Show success only after a durable commit. On a timeout, reread before offering retry; on a conflict reload and ask the user to retry the edit. Preserve selections on storage failure. `storage.changed` refreshes all mounted controls for the same item ID. An empty list or unsupported page must not fail runtime startup.

## 5. Local record model

```ts
interface BookmarkV1 {
  schemaVersion: 1;
  itemId: string;
  discussionUrl: string;
  articleUrl: string | null;
  title: string;
  submitter: string | null;
  truncated: boolean;
  savedAtMs: number;
  capturedAtMs: number;
  categoryIds: string[];
  orderKey: string;
}
interface CategoryV1 {
  schemaVersion: 1;
  id: string;
  name: string;
  normalizedName: string;
  createdAtMs: number;
  deletedAtMs: number | null;
}
```

| Collection | Key/value |
| --- | --- |
| `bookmarks` | `hn:item:<id>` to BookmarkV1 |
| `bookmark-order` | Order key to `{bookmarkKey}` |
| `categories` | UUID to CategoryV1, including tombstones |
| `category-names` | Normalized name to `{categoryId}` |
| `category-meta` | `active` to `{ids: string[]}` |

The namespace is host-derived `(local, hn-bookmarks)`. Validate stored JSON at the applet boundary; TypeScript types alone do not validate reads. No website account key, cookie or authentication token is stored. Preserve other applet namespaces if they exist.

## 6. Category algorithms

Category IDs use `crypto.randomUUID()`. Trim display names and require 1 to 40 Unicode code points. Normalize using NFKC, trimming, whitespace collapse and lowercase. All and Uncategorized are virtual filters; reject normalized user names equal to those reserved names.

Limit active categories to 50 using the CAS-protected `category-meta/active` document. Create checks meta revision, absent UUID and absent normalized name; atomically writes category, name index and updated meta. Rename checks current category/index and absent destination index; if normalization is unchanged, update only display name. Delete writes a tombstone, removes name index and active ID in one transaction. Do not rewrite every bookmark.

Only active category IDs affect membership. Deleting a category never deletes its bookmarks. A bookmark with no active categories appears in Uncategorized. Remove inactive IDs when its categories are next edited.

## 7. Bookmark transactions and pagination

First save atomically creates bookmark and order index. Generate `orderKey` from the zero-padded 16-digit value of `Number.MAX_SAFE_INTEGER - savedAtMs`, followed by `:` and item ID. Validate timestamps in the safe integer range. The transaction checks absence of both records plus current category/meta revisions.

An existing save preserves savedAtMs/orderKey and compares the bookmark revision before editing categories or explicitly refreshing metadata. Remove deletes bookmark and order index atomically with revision checks. A stale edit returns CONFLICT; it must not overwrite a completed edit. Deletion/recreation receives a fresh native namespace revision.

Library pagination scans `bookmark-order` in pages of 100, reading bookmarks with at most eight concurrent RPCs. Accumulate 20 matches for the active filter. Resume after the last consumed order key, including scanned nonmatches, without skipping unconsumed rows. Reset on relevant `storage.changed` or namespace-revision change. A rare-category filter may scan many records; show progress and allow cancellation. Skip missing index targets with a diagnostic and never auto-delete user data.

## 8. Library and acceptance

Use the existing declared local-page loader, one-view transitions and React qualification entry. Add library access through both native menu and launcher so HN/network availability is not a prerequisite to offline use. Native Back recreates the last source URL; Open discussion calls `sources.open("primary", discussionUrl)`. The library never directly reads source DOM or navigates by treating article URLs as HN item identities.

Verify external-link and self-post saves, list/detail duplicate identity, comments excluded, malformed ID handling, metadata absence, recycled/replaced rows, duplicate mounts and no interference with original links. Verify zero/one/multiple categories, reserved/duplicate names, rename/delete, stale edits, cancellation, uncertain writes, consistency across controls, pagination with sparse filters, offline library, restart and APK update. Verify original HN favorite/vote links are untouched without invoking them.

The applet is complete only when both real public-page Save integration and durable offline library pass. Local fixture operations alone do not qualify extraction. No sign-in, account switch, media player or private page is part of acceptance. Required browser isolation and recovery gates remain in the [delivery plan](150238-genesis-delivery-verification-plan.md).

The user authorized emulator-qualified development on 28 October. Complete and verify this applet on the supported emulator, then repeat required HN feature/lifecycle/recovery checks on physical hardware before release.
