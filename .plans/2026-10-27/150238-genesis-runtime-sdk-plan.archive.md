# Genesis runtime and SDK plan

Architecture revision approved 28 October: all browser customization and the managed DOM runtime use TypeScript/JavaScript under `packages/sdk/` and `applets/`, with React for custom dialogs and local pages. Native Rust retains the controller, contracts and SQLite services. HN refuses Wasm compilation in its source realm, as recorded in the [historical qualification report](../../.reports/2026-10-28/162112-genesis-hn-wasm-qualification-report.md). The TS runtime passed [MVP-02 emulator qualification](../../.reports/2026-10-28/174427-genesis-hn-typescript-qualification-report.md); MVP-03 passed emulator verification. MVP-04 storage passed [Android emulator verification](../../.reports/2026-10-28/183914-genesis-mvp04-android-storage-verification-report.md); MVP-05 passed [Android Save verification](../../.reports/2026-10-29/095635-genesis-mvp05-android-save-verification-report.md); MVP-06 passed [category/library emulator verification](../../.reports/2026-10-29/110545-genesis-mvp06-library-verification-report.md). The working emulator prototype is the current delivery target. Physical-device qualification and device-specific performance gates are deferred to pre-release under the user's 29 October instruction; they do not block the emulator handoff. MVP-07 functional integration and the emulator handoff are verified in the [final report](../../.reports/2026-10-29/112349-genesis-mvp07-emulator-handoff-report.md).

Created 27 October 2026, Asia/Kolkata. Scope: `crates/`, `packages/sdk/`, generic native services, and package contracts. Read the [MVP plan](150238-genesis-mvp-implementation-plan.md). MVP-02 implements identities, the handshake, qualification effects and bootstrap. Managed observation/navigation APIs passed MVP-03 emulator verification; storage passed MVP-04 Android emulator verification. The complete APIs below are target contracts, not a claim that every method is available.

## 1. Package manifest

Use `applet.json`, schema version 1. Validate every field at build time and again when loading the bundled index. Reject unknown schema versions, duplicate IDs, missing entries, path traversal, duplicate source IDs and unsupported capabilities.

```json
{
  "schemaVersion": 1,
  "id": "hn-bookmarks",
  "name": "Hacker News with Genesis bookmarks",
  "dataSchemaVersion": 1,
  "sources": [{
    "id": "primary",
    "startUrl": "https://news.ycombinator.com/",
    "origins": ["https://news.ycombinator.com"],
    "entry": "src/main.ts",
    "navigationRules": []
  }],
  "pages": [{"id": "library", "entry": "src/library.tsx"}],
  "actions": [{"id": "library", "label": "Genesis bookmarks", "pageId": "library"}],
  "capabilities": ["dom", "storage"]
}
```

Manifest entries are source paths for the builder; the generated index maps them to compiled assets with hashes. Read compiled entries, never TypeScript. HN has exactly one injection origin. External article links may browse ordinarily, without broadening the source bridge allowlist. Back to HN rebinds its current document.

Preserve existing static navigation-rule types and validation as generic compatibility code. This HN manifest declares no content-blocking rules. Dynamic query-value deny sets and `navigation.addDeniedValues` are outside the revised prototype; do not implement them just for a retired product requirement. Source/page URL validation and document lifecycle remain required.

## 2. Identity and source sessions

Use separate types for `AppletId`, `InstanceId`, `SourceId`, `ViewId`, `ViewGeneration`, `DocumentId`, `DocumentNonce`, `RouteRevision` and `RequestId`. Serialize IDs as strings. Serialize counters only within JavaScript's safe integer range, with explicit overflow failure.

The native host owns `HashMap<InstanceId, AppletInstance>`. Each instance owns `HashMap<SourceId, SourceSession>` and an optional current applet page. `SourceSession` stores the definition, last committed URL, lifecycle status and optional live view binding. No shared static variable may hold a website DOM reference.

The complete source lifecycle uses `Dormant`, `Loading`, `Active`, `Suspended`, `Blocked`, `Failed` and `Closed`. The host implements these transitions, including blocked policy/provider states and retirement. The one-view scheduler retires the old document and recreates the WebView before opening another source ID, applet or local page. It retains the old source URL but invalidates every old DOM handle. Navigation within a source retains its WebView. The lifecycle contract permits a future scheduler to keep multiple views alive without changing these identities.

Each live execution binding has kind `source` with a source ID, or kind `page` with a page ID. Storage is scoped to the applet/profile for both kinds. A local library page can request `sources.open("primary", url)` but has no direct access to a source DOM.

## 3. Injection and handshake

Build one self-contained injected script per source entry. The script bundles the TypeScript managed DOM runtime, SDK and applet entry. It uses no Wasm compilation, dynamic code evaluation or website asset fetch. Observation, effect scheduling and route management run in TypeScript.

Use isolated world name `genesis.v1` and bridge object `genesisHost`. World/listener/script registration must happen before source navigation. The injected script exits immediately in child frames. Do not change to the main world when an isolated-world assumption fails.

Binding sequence:

1. Native opens a view with a fresh generation and puts a native loading cover over its content.
2. The source loader creates a document nonce using browser crypto, installs the reply handler, and posts `hello` with protocol version, nonce and package revision.
3. Native checks the bound view, main-frame flag, callback origin and expected revision. It does not trust a message's claimed applet ID.
4. Native challenges that nonce by executing a small function in the current document's same execution world. The function replies only if its locally held nonce matches. A delayed hello from an old document cannot bind the new document.
5. Native returns a fresh document ID and the accepted source/page binding. The runtime rejects normal RPC until this handshake completes.
6. The TypeScript runtime installs managed effects and performs the first pass. It sends `runtime.ready` with effect statuses. Native removes the cover for a healthy eligible page. An empty or unsupported HN page is not a runtime startup failure; report feature coverage separately.

The loader has a five-second startup deadline after delivery. A timeout produces a native failure with Retry and Open ordinary site. It never silently calls a broken customization active. An external publisher origin uses ordinary-site presentation and no applet bridge. Login forms are outside story targets; never inspect their values or expand origins for article links.

On `pageshow` restoration, rebind with a new document ID before accepting operations. Dispose or replace any previous applet scope so BFCache does not duplicate roots. Same-document route changes increment a route revision and refresh targets without treating the whole JS realm as a new document. The [Android navigation listener](https://developer.android.com/reference/androidx/webkit/NavigationListener) includes main-frame same-document notifications; qualify their behavior rather than relying on URL polling alone.

## 4. Wire messages

Use UTF-8 JSON. Do not send DOM nodes across the native bridge. Native callbacks associate messages with their verified binding and compare envelope values against it.

```json
{
  "v": 1,
  "documentId": "doc-12",
  "requestId": "req-8",
  "method": "storage.get",
  "params": {"collection": "bookmarks", "key": "hn:item:12345"}
}
```

```json
{
  "v": 1,
  "documentId": "doc-12",
  "requestId": "req-8",
  "ok": true,
  "result": {"document": null, "namespaceRevision": 4}
}
```

Failure replies have `ok: false` and `error: {code, message, retryable}` instead of `result`. Codes are `UNSUPPORTED`, `INVALID_ARGUMENT`, `EXPIRED_CONTEXT`, `NOT_FOUND`, `CONFLICT`, `BUSY`, `QUOTA_EXCEEDED`, `STORAGE_FAILURE` and `INTERNAL`. No silent empty-object fallback.

Methods in v1: `runtime.ready`, `runtime.error`, `route.changed`, `ui.modalState`, `sources.open`, `pages.open`, `storage.get`, `storage.list`, and `storage.commit`. Host events are `context.retired`, `storage.changed`, `ui.dismissModal`, `host.suspended` and `host.resumed`. Do not introduce arbitrary native method invocation.

`sources.open` and `pages.open` acknowledge an accepted navigation request, not a completed page load. Send the acknowledgement before scheduling view replacement; the new view reports its own loading/ready/error state. Callers must not depend on code continuing after their document is retired.

For MVP-02 qualification, the bound envelope also accepts `runtime.phase` with `{phase: "typescript"}` to report initialization progress without claiming ready. The debug host alone accepts `debug.inspection` responses to its explicit inspector request. These are named qualification diagnostics, not arbitrary native invocation or a public storage capability. Feature methods in the v1 table remain unavailable until their delivery stage.

Use at most 32 pending page requests, 256 KiB encoded message size and a five-second RPC timeout. Validate before queueing. Timeouts do not prove that a storage transaction failed; the applet rereads the affected record. Never retry a write automatically. Deliver replies through the document-bound reply channel and drop them after retirement.

Keep protocol types in `genesis-contracts` and mirrored TypeScript types in `packages/sdk/src/protocol.ts`. The Rust types and this method table are authoritative. Keep the small mirror explicit; do not build a code-generator framework for v1. Increment the protocol version for incompatible changes.

## 5. Minimum creator API

```ts
type Dispose = () => void;

interface AppletContext {
  readonly signal: AbortSignal;
  readonly sourceId: string | null;
  styles: { add(key: string, css: string): Dispose };
  watchElements(key: string, options: WatchOptions, handlers: ElementHandlers): Dispose;
  ui: {
    mountAt(key: string, anchor: Element, options: MountOptions): Dispose;
    openModal(key: string, render: (container: HTMLElement) => Dispose): Dispose;
  };
  navigation: {
    onChange(callback: (url: string) => void): Dispose;
  };
  sources: { open(sourceId: string, url?: string): Promise<void> };
  pages: { open(pageId: string): Promise<void> };
  storage: AppletStorage;
  onDispose(callback: Dispose): void;
}
```

`defineApplet({activate(ctx)})` is the source entry contract. `definePage({mount(ctx, container)})` is the local page entry contract and returns a disposer. The SDK implements the managed DOM runtime in TypeScript. It does not force React on either entry type.

`WatchOptions` contains `selector`, optional `root`, `attributes: string[]`, `text: boolean`, `limit` with maximum 200, and `contentKey(element): string | null`. `ElementHandlers` provides `enter(binding)`, `update(binding)` and `leave(binding)`. A binding has an opaque binding ID, live Element, content key and current route revision. Missing keys are skipped and diagnosed.

The runtime tracks element identity separately from content key. Reusing an element for another story must call leave for the old binding before enter for the new one. Updates retain a binding only while both identities match. Async callbacks must revalidate or use the immutable record captured when the user chose Save.

`MountOptions` specifies position `before`, `after` or `append`, CSS text, Shadow DOM enabled by default, and `render(container)` returning a disposer. The runtime creates/removes the host and tracks its anchor. Creator code owns the container's contents. Never mount React on the website's existing application root. [React root ownership](https://react.dev/reference/react-dom/client/createRoot).

The modal implementation permits one modal per applet context, reports open/closed state to native, traps focus, closes on Escape or native dismissal, restores focus when the target still exists, and prevents taps from falling through to the page. React can render modal contents. The runtime owns the outer host and its lifetime.

Creators retain ordinary DOM APIs for unusual changes, with cleanup registered through `onDispose`. Those writes are not automatically reversible. The HN applet should use managed styles/hosts and narrow event listeners rather than unrestricted whole-page rewrites.

## 6. Observation and cleanup implementation

Use one document MutationObserver in TypeScript, plus explicitly registered listeners. Its callback marks relevant watchers dirty and returns. One scheduled frame performs coalesced work. Exclude owned UI hosts from target discovery and do not observe their internal React mutations as source data. Observe relevant attribute names, not every attribute by default.

Release internal iteration state before invoking creator callbacks because they can synchronously call the SDK again. Keep observers, event listeners and timers in their owning scope and release them on disposal. Catch creator JS exceptions and retire the affected scope without abandoning the rest of cleanup.

Use scoped discovery for changed subtrees and revalidate retained bindings. A root replacement triggers rediscovery. Keep one pending dirty item per watcher. The 200-result cap bounds retained bindings, not the duration of arbitrary CSS queries or creator functions. Measure both; neither can be preempted by a runtime timeout on the same event loop.

On each update, refresh element/content identity, run creator classification, and apply only changed effects. Track owned CSS markers and UI hosts. Repeated restoration by the page, initially three reversals within one second, suspends the affected effect and emits a conflict. Do not remount forever.

Removal order is abort context tasks, close modal, run creator disposers, unmount UI roots, remove owned styles/markers, disconnect watchers and release DOM handles. Cleanup functions run once and exceptions are reported without skipping the remaining disposers. Restore preexisting attributes only if their current value still matches the runtime's last write. Never restore an initial whole-page snapshot.

Route tracking combines Android notifications, `popstate`, `hashchange`, `pageshow` and a visible-page URL check every 250 ms as a fallback. A mutation pass checks location before applying source effects. Polling is a recovery aid; it is not evidence of frame-perfect navigation blocking.

## 7. Generic persistence

Create `genesis.sqlite3` under the application's private files directory. Native Rust owns one SQLite connection on the database worker. Enable foreign keys and use transactions. Keep applet storage independent of website storage/cookies.

```sql
CREATE TABLE namespaces (
  profile_id TEXT NOT NULL,
  applet_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (profile_id, applet_id)
);
CREATE TABLE documents (
  profile_id TEXT NOT NULL,
  applet_id TEXT NOT NULL,
  collection TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  revision INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (profile_id, applet_id, collection, key),
  FOREIGN KEY (profile_id, applet_id)
    REFERENCES namespaces(profile_id, applet_id)
);
```

Store platform schema version using SQLite `user_version`. Applet dataSchemaVersion is a different field. Implement only applet schema 1 for MVP. Reject incompatible applet data revisions without deleting user data. No automatic downgrade or destructive migration.

`get(collection,key)` returns `{document: {key,value,revision,updatedAtMs} | null, namespaceRevision}`. `list(collection,{afterKey?,limit})` returns `{entries, nextAfterKey, namespaceRevision}` in key-ascending order. `nextAfterKey` is the last returned key when more rows exist, otherwise null. A caller that consumes only part of a page can resume after its last consumed key. Limit is at most 100 and encoded replies must fit 256 KiB; pagination stops before the size cap. A document is at most 32 KiB, a key at most 512 UTF-8 bytes, and collection names match `[a-z][a-z0-9-]{0,63}`.

`commit({checks, puts, deletes})` operates on one implicit applet/profile namespace. Checks contain collection, key and expected revision, with null meaning absent. Every modified key must have a check. Permit extra read-only checks, such as ensuring a selected category is still active. Limit a batch to 64 modifications and 256 KiB total.

Within `BEGIN IMMEDIATE`, validate every check, increment namespace revision once, apply all writes/deletes, and commit. Each written document gets the new namespace revision. On any failed check, roll back and return CONFLICT. Never partially save a bookmark and its category selection. A deletion followed by recreation gets a new namespace revision, preventing revision reuse.

Only acknowledge a write after commit. Publish `storage.changed` with changed collection/key pairs to active contexts of the same namespace. Namespace identity comes from the host binding, never from creator-supplied parameters. Native SQL contains no HN-specific tables or JSON fields.

The database worker serializes commits, while compare-and-set protects stale applet edits. Page code handles CONFLICT by reloading the affected records and asking the user to retry the edit. It must not silently overwrite another completed edit. Generic type parameters in TypeScript do not validate stored JSON; applet repositories validate their own records on read.

## 8. Limits and future extension

Source DOM handles never cross source boundaries. A future `observations.publish/subscribe` API can carry bounded JSON topics keyed by `(instanceId, sourceId, documentId, topic, revision)`. Do not expose or stub this API as working in v1.

Direct page scripting, multiple live sources, private-page JavaScript access and strong applet fault isolation are separate capabilities. The MVP delivers one qualified page context and native recovery. It does not claim that the runtime can interrupt an arbitrary infinite loop inside the browser renderer.

## 9. Website authentication boundary

Follow the [browser/session contract](150238-genesis-mvp-implementation-plan.md#9-browser-and-session-contract). `SourceSession` tracks navigation and lifecycle; `SessionSnapshot` restores host selection and source URLs. Neither represents a website account. Retiring a document invalidates handles, replies and owned effects without clearing browser cookies or website storage.

The bridge must not expose credentials, website cookies, authentication tokens or Chrome-session import. Applet SQLite storage stays independent of website storage. Diagnostics exclude credential inputs and values. The qualification bootstrap and SDK already have no authentication API; preserve that boundary in MVP-03 and MVP-04.

Authentication/session-retention experiments are outside the revised HN prototype. No account is needed for public story extraction or native bookmark storage. Required provider/injection gates remain unchanged.

MVP-02 emulator evidence may unlock the remaining runtime/storage implementation under the user's 28 October decision. Physical-device repetition remains a final MVP-07 release gate.
