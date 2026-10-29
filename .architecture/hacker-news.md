# Hacker News frontend and backend

## Current split

The HN frontend remains in applets/news.ycombinator.com/src. The independent server is in backend/server.mjs and backend/store.mjs. It uses Node's built-in HTTP and SQLite modules, so no new runtime package is required. Run/deploy it separately. The Android build bundles frontend assets only.

The applet declares service bookmarks and calls POST /v1/documents through the generic service broker. src/backend.ts implements the HN-specific {operation, params} protocol and adapts responses to the existing repository interfaces. Those TypeScript interfaces describe document operations; sharing a type with the SDK does not make Rust the authoritative database. Source controls, dialog and library use this adapter.

The API accepts get, list and commit. Its only collections are bookmarks, bookmark-order, categories, category-meta and category-names. Authentication grants access to the entire single-user backend; this document API is not a per-user authorization model. The server checks keys, collection membership, batch size, document size, revision checks and atomicity. Frontend repositories additionally validate the application record formats and relationships. If exposing less-trusted writers, move/add application semantic validation and authorization on the server before expanding access.

## Records and consistency

Bookmarks use hn:item:<id> keys and retain bounded title, canonical discussion URL, optional safe article URL/submitter, capture/save timestamps, category IDs and order key. The order index sorts by inverted safe-integer save time plus stable item ID. A save/removal transaction maintains bookmark and index records together.

Category names are trimmed and normalized with NFKC, collapsed whitespace and lowercase comparison. Active category count is capped at 50. Name-index and active-meta records support uniqueness and checked edits. Deletion tombstones the category and preserves bookmarks. Membership in deleted categories is inactive; no remaining active membership means Uncategorized.

Backend SQLite stores one state revision plus documents with key, JSON, revision and timestamp. Each write transaction checks all expected revisions, requires a unique check for every modification, updates the state revision, changes records and commits before returning success. A conflict rolls back the whole transaction. list uses binary key cursors and response-size bounds.

## Frontend workflows

extract-item.ts validates supported HN story rows and metadata. main.ts mounts one managed Save control per bound story and reads saved state with bounded concurrency. story-dialog.tsx handles category selection, saving/removal and rereads after uncertain writes. It retains source identity across async operations.

library-data.ts scans order entries, reads documents in bounded groups and returns 20 matching bookmarks. Namespace revision changes invalidate an inconsistent scan. Sparse category filters may scan many records. Search filters loaded titles only. Cancellation stops further UI application and scanning, not an already committed backend write.

src/backend.ts publishes same-document changes after acknowledged commits. There is no cross-device push or automatic cross-client invalidation. Reopening/reloading the library reads server state; concurrent reads detect revisions. The library requires connectivity to the configured backend even though its HTML is packaged locally. Full articles are not cached.

## Acceptance scope

Compilation and local backend integration are separate from Android end-to-end qualification. Existing local SQLite emulator reports remain historical. Before claiming the remote workflow ready, verify native connection setup, HTTPS/authentication, real HN save/edit/remove, categories, pagination, server restart durability, stale document completions, unavailable backend and migration on the supported provider. Physical-device/performance evidence remains separate.
