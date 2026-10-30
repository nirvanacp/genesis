# X category backend implementation plan

Project: Genesis X applet. Phase `phase-4`, branch `proto/phase-4`. Created 30 October 2026 at 19:57:28 Asia/Kolkata. Read [product/navigation](195728-x-product-and-navigation-plan.md) and [platform/execution](195728-genesis-x-platform-execution-plan.md). This document specifies proposed application contracts, not code that already exists.

## Ownership and scope

Keep stable applet ID `x-bookmarks`. Add service ID `bookmarks` to this applet, independently scoped from HN's identically named service. All routes, tables, validation, category semantics and retry rules live under `factory/applets/x.com`. Genesis transports JSON and protects the service credential; it must not know about X post IDs, categories or bookmark operations.

The X website is authoritative for ordinary bookmarks, source posts, sessions and social actions. The backend is authoritative for categorized saved items and categories. The optional host document store holds only account-binding hints, library view preferences and pending operation IDs. It is not a second bookmark database. No website `localStorage` as the applet store, no silent SQLite fallback on backend errors, and no offline mutation queue.

Use a separate Node 24 process with built-in HTTP/HTTPS and SQLite, following the HN server's operating pattern. Implement typed application operations instead of copying HN's generic document write endpoint. X category invariants belong on the server and search/pagination should query an index directly rather than scanning HN's order documents over many RPCs.

## Proposed files and responsibilities

| File beneath `factory/applets/x.com` | Responsibility |
| --- | --- |
| `backend/service.json` | Service launcher contract, service ID `bookmarks`, entry `backend/server.mjs`, authenticated `/health`, port 8788. |
| `backend/server.mjs` | Bounded JSON parsing, bearer authentication, route dispatch, status/error envelopes, TLS environment and shutdown. |
| `backend/store.mjs` | SQLite lifecycle, migrations, authorization-bound queries, input validation and atomic operations. Split SQL helpers only if needed for readability. |
| `src/domain.ts` | Validated category, snapshot, bookmark, operation and pagination shapes. No host-private imports. |
| `src/backend.ts` | `context.services.request`, runtime response validation and applet error translation. |
| `src/repository.ts` | Membership read/write, operation status reconciliation and same-document subscriptions after confirmed writes. |
| `src/categories.ts` | Category normalization, list/create/rename/delete client behavior. Server repeats all semantic checks. |
| `src/local-state.ts` | Revision-checked settings and pending operation markers through `context.storage`. |
| `src/library-data.ts` | Server cursor/filter requests, query revisions and cancellation of stale UI application. |

The service declaration's environment names are `X_BACKEND_TOKEN`, `X_BACKEND_DB`, `X_BACKEND_PORT`, `GENESIS_TLS_CERT`, `GENESIS_TLS_KEY`. Default bind address remains loopback unless explicitly configured by the operator. Keep token/database/certificate paths outside the repository. `/health` returns `{ready:true}` only after database migration/readiness and requires authentication. The existing creator helper can provision this one service; do not add an X-specific platform provisioner.

## Authorization and account binding

Phase 4 uses a personal deployment. A private operator-generated bearer token authorizes one library owner. Store a digest for token comparison or use constant-time equality as in HN; never log the token. The server assigns the owner and its opaque `libraryId`; a caller-supplied handle or library ID never grants access to another library. All queries include that owner scope, including operation lookups and counts.

`GET /v1/library` returns the authenticated library's `libraryId`, `expectedHandle`, `revision` and schema version. The operator configures `expectedHandle` when provisioning this personal backend. The frontend normalizes and compares it with the current account profile link observed in X primary navigation. Persist that public observation only as an account-change hint with an epoch. Do not derive identity from the viewed author's route, parse hidden React state, or transfer X cookies. The observed `AppTabBar_Profile_Link` is a qualified candidate; if missing, account identity is unknown.

Account binding prevents accidental display/write under a different X account. It does not prove X account ownership to the server, and a DOM-capable applet can forge a handle. The bearer token remains the actual authorization boundary. Multi-user deployment, user verification through a supported authorization system, multiple independently selected libraries, and automatic handle-rename migration are excluded. Do not market this as isolated multi-account authentication.

Every read/write captures `libraryId`, account epoch and activation identity. Discard its UI result if any has changed. A write already sent can still commit to its original authorized library. Retained pages reread identity hints and service state on focus; unknown or changed identity hides prior rows immediately and requires current-source verification before proceeding. Do not clear library data on X logout.

Implement verification without cross-view DOM access. Host storage holds one revision-checked `session/library-entry` record with a random nonce, phase `requested|verified|consumed|failed`, observed normalized handle, account epoch and creation time. A Categories click in a current source can issue a verified ticket after reading the visible account navigation. A library activation/focus consumes one verified ticket at most once, only if it matches the configured library handle and is less than 30 seconds old. With no fresh ticket it immediately hides rows, writes a requested ticket, and opens the declared Saved source at `/i/history`. That source verifies its own visible account, updates only the matching nonce to verified, then opens the library. The returning library consumes that ticket rather than initiating another round trip. Sign-out, mismatch, source load failure or a 10-second verification deadline settles the request as failed and offers Sign in to X or Retry. A stale nonce cannot redirect a newer navigation. Preserve library query/filter/scroll in applet-local settings so this visible verification does not discard the reader's position. This ticket is accidental-mixing protection, not a backend security credential. Do not open hidden views or assume persisted handle hints prove the current cookie session.

## Records and bounds

All public JSON includes `version:1` where it represents a stored domain record. SQLite uses `PRAGMA user_version=1` initially. Keep manifest `dataSchemaVersion:1`; it is not a general migration counter.

| Entity | Fields and rules |
| --- | --- |
| Library | Server-generated opaque UUID, normalized expected handle, monotonically increasing safe-integer revision. One owner in the initial deployment. |
| Category | UUID `id`, display `name`, normalized unique `nameKey`, positive integer `revision`, server timestamps. Name 1–80 Unicode code points and at most 320 UTF-8 bytes after trim. At most 50 active categories. |
| Saved post | Decimal string `postId`, canonical `https://x.com/<handle>/status/<id>`, `snapshot`, positive `revision`, server `savedAtMs` and `updatedAtMs`. Primary key is owner plus post ID, not username. |
| Membership | Saved post ID plus category ID, unique per pair. Every saved post has 1–10 active categories at transaction commit. |
| Snapshot | Bounded `authorHandle`, `authorName`, text excerpt, `capturedAtMs`, `textState` of `complete`, `excerpt` or `unavailable`, and media kind/count. Optional quoted post ID and up to eight validated text links, with the whole snapshot bounded to 32 KiB. No HTML, cookies, raw DOM, network payloads, private messages or neighboring posts. |
| Operation receipt | UUID `operationId`, owner, canonical request hash, final status/result, server timestamp. Same operation ID plus a different payload is rejected. |

Limit input post IDs to 1–25 decimal digits and treat them as strings everywhere. Handles match `[A-Za-z0-9_]{1,15}`; lower-case only for comparison. Canonical URLs must be parsed HTTPS URLs with exact host `x.com`, no credentials/port, and a matching status ID. Strip tracking query and fragment for saved identity, preserving an optional media context only as non-authoritative UI metadata. Validate again when opening returned links.

Implementation clarification: retain validated visible text links in snapshots so the planned library can preserve ordinary link behavior without rendering HTML or fetching previews.

Snapshot bounds: author name 200 code points, text 8,000 code points and at most 32 KiB UTF-8, canonical URL 256 bytes, media count at most 16. Reject excessive sizes instead of silently accepting unbounded JSON. The client may deliberately truncate text on a code-point boundary and mark `excerpt`. A media-only post is valid if its own canonical ID is present. Unexpanded long posts remain excerpts. Saving a translated visible excerpt does not claim to capture the original language. Missing text never permits collecting surrounding conversation content.

Category normalization matches HN's useful convention: NFKC, trim, collapse Unicode whitespace, lowercase comparison. Use one backend implementation for authority and duplicate feedback. A duplicate normalized name returns 409 `CATEGORY_NAME_EXISTS`, including the existing category ID within the same owner. UI may offer selecting that category. Do not generate misleading suffix names automatically.

Suggested tables are `libraries`, `categories`, `saved_posts`, `memberships`, `operations`. Enforce owner foreign keys, unique normalized names, unique memberships and referential integrity with `PRAGMA foreign_keys=ON`. Index categories by owner/name, saved posts by owner/saved time/post ID and memberships by owner/category/post. Run writes inside `BEGIN IMMEDIATE` with a bounded busy timeout; reads should not acquire unnecessary write locks. No HN migrations or shared database changes.

## HTTP contract

All endpoints use authenticated service requests. Success bodies wrap a `result`; errors use `{error:{code,message}}` with stable bounded messages and no SQL, paths, secrets or source text. Every successful read/write returns the current library revision. The client checks HTTP status and validates bodies; TypeScript generics do not validate JSON.

| Method and path | Request and successful result |
| --- | --- |
| `GET /health` | `{ready:true}`. |
| `GET /v1/library` | Authenticated library metadata described above. |
| `GET /v1/categories` | Category records with counts, sorted normalized name then ID, library revision. Maximum 50 records. |
| `POST /v1/bookmarks/lookup` | `{postIds:string[]}`, at most 50 distinct IDs. Returns existing saved-post revisions and category IDs, plus explicit missing IDs. No snapshots needed for inline indicators. |
| `POST /v1/bookmarks/query` | `{categoryId:null|string, query:string, cursor:null|string, limit:20}`. Returns saved rows including category IDs, `nextCursor`, library revision and the applied filter. Search is at most 200 code points. |
| `POST /v1/operations` | `{operationId, kind, payload}`. Kinds `category.create`, `category.rename`, `category.delete`, `bookmark.setCategories`, `bookmark.remove`. Returns stored receipt, result and current revision after commit. |
| `GET /v1/operations/<uuid>` | Committed receipt or 404 `OPERATION_NOT_FOUND`. Presence establishes completion even if the client timed out. |

For `category.create`, payload has client-generated category UUID and name. The client supplies the ID so retries and eventual membership references address the same category. For rename/delete include category ID and `expectedRevision`. Delete requires zero memberships and otherwise returns 409 `CATEGORY_NOT_EMPTY`. A deleted category is physically removed only after the empty check; preserve operation receipts and backups according to operator policy.

For `bookmark.setCategories`, payload contains post ID, snapshot on first save, canonical URL, a full nonempty category ID set and `expectedRevision:null|number`. Null requires absence; a number requires exactly that saved-post revision. Existing snapshots are preserved by default during membership changes. Explicit future snapshot refresh needs a distinct contract; do not overwrite a complete snapshot with a truncated feed excerpt. Validate existence/ownership of every category in the transaction. Category IDs deleted since the sheet opened cause 409 `CATEGORY_MISSING`; no partial membership change.

For `bookmark.remove`, include post ID and expected revision. Atomically delete memberships and saved row; return the removed ID. Removing a missing record with a different operation ID returns conflict so the client rereads, while replaying its original operation ID returns its receipt. No operation in this API adds an upstream X bookmark or calls an X endpoint.

Map input errors to 400, missing domain objects to 404 where appropriate, conflicts to 409, body excess to 413 and unavailable storage to 503. Authentication failures use 401/403. Host transport may translate authentication failures to a rejected service request; the client must handle both rejected requests and ordinary non-2xx response envelopes.

## Atomicity, idempotency and uncertain results

For a mutation: authenticate; bound and validate JSON; normalize payload; compute its canonical hash; begin transaction; look up the owner/operation ID; return identical committed receipt if present; reject changed payload reuse; check entity revisions and semantic invariants; perform the complete change; increment library revision once; store receipt in that same transaction; commit; respond. A conflict rolls back both change and receipt. Enforce limits on the server even if the frontend already checked them.

Retain receipts for the lifetime of the phase-4 database. Do not prune them until a defined expiration protocol prevents an old client from duplicating a previously committed write. At the personal-use volume this is simpler than a partially reliable TTL scheme. Backups include receipts and data in one consistent snapshot.

Generate an operation UUID when the user submits. Before network submission persist a small pending marker through host storage containing operation ID, kind, record IDs, account epoch and creation time, without source text. If that marker cannot be saved, fail before sending so process death cannot lose the only reconciliation key. Serialize same-record submits and disable duplicate submission while one is pending.

On acknowledged success, update local UI and notify same-document subscribers; clear the pending marker. On a definitive rejection, retain form edits, display the issue and clear/settle its marker. On timeout, disconnection, suspension or an unknown transport failure, show `Checking whether it saved`. Query operation status and reread record state on retry/focus/restart. A receipt confirms completion. An absent receipt alone does not prove an older request cannot still arrive. Do not manufacture a new operation ID and repeat the write. A user retry resends the exact request with the same operation ID only while that payload is still in memory. After process death, reconcile by operation ID; if no receipt exists, reread and require a new explicit edit, whose revision precondition prevents overwriting a late commit. Keep the unresolved marker until settled or explicitly abandoned after read-back.

If a new edit races an uncertain older operation, its expected revision ensures only one change based on that revision succeeds. On 409, reread and preserve the user's intended checkbox set for review. Never automatically replace server state with an old selection. Category creation similarly reuses its ID and operation ID; uniqueness provides a second protection against duplication.

## Search and pagination

Query the backend's complete categorized dataset with parameterized SQL. Case-insensitive normalized text/author matching is sufficient for a personal first release; avoid requiring SQLite FTS availability. Store normalized search text explicitly. Escape SQL LIKE wildcard characters when using LIKE so a literal `%` or `_` query stays literal. Do not build SQL from user text.

Sort by server `savedAtMs DESC`, then decimal post ID as a deterministic string tie-breaker. `savedAtMs` is fixed on membership edits. Cursor payload binds library, filter hash, library revision, last saved time and last post ID; serialize as bounded base64url JSON and validate all fields. A modified filter or changed library revision invalidates the cursor with 409 `CURSOR_STALE`. Restart from the first page while retaining previous rows until replacement is ready. No endlessly repeated restart loop; after two consecutive stale scans show Refresh to try again.

Return at most 20 rows and target at most 192 KiB encoded body, below the host's 256 KiB envelope. Stop before the byte limit and supply a continuation after the last emitted row. A single validated snapshot must fit. Never return an empty page with the same continuation token. Query search covers all rows even when only the first page has been fetched. Source membership lookup deduplicates up to 50 IDs per batch, with at most two concurrent service calls per document. Cancel queued work and stale UI delivery on account/route changes. Do not refresh memberships on every like-count mutation.

## Privacy, recovery and rollout

Store only posts the user explicitly selects. Do not ingest an entire personal bookmark timeline, DMs, notifications, browsing history or hidden X state. The private backend may contain selected restricted content; keep it behind the service credential, exclude it from logs and use a durable private volume and encrypted backups appropriate to the operator's environment. A snapshot is historical and may outlive a deleted post. Show its captured date and offer removal; do not assume source deletion propagates automatically. There is no backend scraping or remote image proxy.

Do not migrate the inactive X prototype's local records automatically. Its current UI contains no implemented bookmark workflow. Inspect actual deployed data before any future migration, provide an explicit export and conversion, and preserve source copies. HN data stays in HN. New X databases start independently and reject schema versions newer than the running server. Back up before migrations and never roll back data merely because applet code rolls back.

Development uses the existing service helper over trusted HTTPS/adb reverse. Production requires a reachable trusted HTTPS origin, durable SQLite volume, backups and operator-managed token provisioning. A local tunnel is not production deployment. Do not log POST bodies. `/health` proves readiness, not full application semantics.

## Component order and verification

1. Implement server, schema and application validation as one backend component. Check from `factory/applets/x.com` with `node --check backend/server.mjs` and `node --check backend/store.mjs`. Use an ephemeral database and a credential held outside source for temporary in-process or HTTP checks. Exercise create/duplicate/rename, category limit, membership create/move/remove, nonempty-delete refusal, invalid IDs, wrong owner, 409 rollback and byte limits. Verify same-operation replay produces one revision increment and changed payload reuse fails. Do not add test files. Commit only this component and its changelog as `feat/(x-backend): add categorized bookmark service` after checks pass.
2. Implement service client, repositories, local pending markers and library queries. From the repository root run `npm run typecheck --workspace @genesis/applet-x` after preparing the SDK build as documented in the execution plan. Validate malformed responses, missing connection, auth failure, stale cursors, cancellation and account epoch changes. Verify backend stop/restart preserves records. Commit as `feat/(x-data): connect category library records`.
3. Integrate the sheet and library under the frontend components in the execution plan. Through authorized disposable applet records, exercise a response-lost-after-commit scenario, same-ID retry, restart reconciliation, concurrent edits, two categories on one post and final-membership removal. Confirm no request goes to X for category operations. Existing source bookmarks must work with the backend stopped. Commit with the corresponding UI component, not a second copy of this backend work.

Backend changes can proceed independently of the new host APIs. Full device acceptance depends on platform navigation, account verification and the UI. Do not claim completion before those dependencies are verified. The final report must distinguish static checks, disposable backend verification, Browser DOM evidence and physical-device evidence.
