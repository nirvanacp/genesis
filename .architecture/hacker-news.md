# Hacker News frontend and backend

This document describes one reference applet. HN collections, category limits, typography, and workflow decisions are applet-specific; they are not requirements for other applications. Use [factory instructions](../factory/AGENTS.md) when changing this applet. General creator guidance lives in [factory](../factory/README.md).

## Current split

The HN frontend remains in factory/applets/news.ycombinator.com/src. The independent server is in backend/server.mjs and backend/store.mjs. It uses Node’s built-in HTTP/HTTPS and SQLite modules. tools/services.mjs starts and provisions the local development backend; production operators can run the same server behind trusted HTTPS. The Android build bundles frontend assets only.

The applet declares service bookmarks and calls POST /v1/documents through the generic service broker. src/backend.ts implements the HN-specific {operation, params} protocol and adapts responses to the existing repository interfaces. Those TypeScript interfaces describe document operations; sharing a type with the SDK does not make Rust the authoritative database. Source controls, dialog and library use this adapter.

The API accepts get, list and commit. Its only collections are bookmarks, bookmark-order, categories, category-meta and category-names. Authentication grants access to the entire single-user backend; this document API is not a per-user authorization model. The server checks keys, collection membership, batch size, document size, revision checks and atomicity. Frontend repositories additionally validate the application record formats and relationships. If exposing less-trusted writers, move/add application semantic validation and authorization on the server before expanding access.

## Records and consistency

Bookmarks use hn:item:<id> keys and retain bounded title, canonical discussion URL, optional safe article URL/submitter, capture/save timestamps, category IDs and order key. The order index sorts by inverted safe-integer save time plus stable item ID. A save/removal transaction maintains bookmark and index records together.

Category names are trimmed and normalized with NFKC, collapsed whitespace and lowercase comparison. Active category count is capped at 50. Name-index and active-meta records support uniqueness and checked edits. Deletion tombstones the category and preserves bookmarks. Membership in deleted categories is inactive; no remaining active membership means Uncategorized.

Backend SQLite stores one state revision plus documents with key, JSON, revision and timestamp. Each write transaction checks all expected revisions, requires a unique check for every modification, updates the state revision, changes records and commits before returning success. A conflict rolls back the whole transaction. list uses binary key cursors and response-size bounds.

## Frontend workflows

extract-item.ts validates supported HN story rows and metadata. main.ts mounts one managed Save control per bound story and reads saved state with bounded concurrency. story-dialog.tsx handles category selection, saving/removal and rereads after uncertain writes. It retains source identity across async operations.

library-data.ts scans order entries, reads documents in bounded groups and returns 20 matching bookmarks. Namespace revision changes invalidate an inconsistent scan. Sparse category filters may scan many records. Search filters loaded titles only. Cancellation stops further UI application and scanning, not an already committed backend write.

src/backend.ts publishes same-document changes after acknowledged commits. There is no cross-device push or automatic cross-client invalidation. Restoring the library triggers a focus refresh while retaining filters and existing rows; concurrent reads detect revisions. The library requires connectivity to the configured backend even though its HTML is packaged locally. Full articles are not cached.

## Navigation and local state

The native manifest shell owns Home, Search, Post, Saved and Me. Source headers and both old applet tab renderers are retired. Home retains compact native table rows and separators, following the user’s preference over separate rounded cards; the native footer retains labeled section icons. Story blank areas open discussions; actual title links open the submitted destination. Shadow DOM controls, selected text and modified clicks preserve their actions. Discussion headers expose Visit website when a distinct safe article exists. Comments remain normal threaded content.

Post stores title/URL/text in applet-scoped host documents with serialized, revision-checked writes. Authentication redirects and validation errors retain drafts. Discard explicitly clears the fields. Automatic success deletion remains conservative because no real post is submitted during verification. Public account identity coordinates reloads of retained source views; credentials and HN cookies are never copied into applet storage.

## Acceptance scope

Compilation and local backend integration are separate from Android end-to-end qualification. The [seamless implementation report](../.reports/phase-2/2026-10-29/202706-genesis-seamless-implementation-verification.md) and [phone report](../.reports/phase-2/2026-10-29/223320-genesis-android-phone-verification.md) record specific successful HN save/read/edit/remove, navigation, backend interruption, and account/draft checks. The phone used a Mac-hosted HTTPS backend over USB adb reverse. These reports do not qualify production hosting, every provider, all accessibility/failure cases, or applet distribution. Older local SQLite reports remain historical, and this documentation task did not rerun device checks.
