# SDK and manifest reference

Current contract: `@genesis/sdk` version `0.3.0`, manifest schema `1`, data schema `1`, runtime API `2`, external bundle format `1`, internal bundled stage `MVP-07`. The SDK ships as built JavaScript/types in a packed archive; public registry publication has not occurred. This reference was checked against source on 30 October 2026. Read the installed types if a later SDK differs; do not mix a future plan with this contract.

## Public exports and lifecycle

Import from `@genesis/sdk` or `@genesis/sdk/react`. The `./manifest` export provides `Manifest`, `Source`, `AppletBundle`, and runtime API version 2. The root also exports `ServiceResponse<T> = {status:number;body:T}`. The tooling-only `./runtime` export wraps bootstrap; applet code must not call it. Public root exports include `defineApplet`, `definePage`, `initialLayout`, `serviceMessage`, `GenesisError`, and context/storage types. The qualification types are legacy diagnostic exports, not the normal applet authoring entrypoint.

```ts
type Dispose = () => void;
// Both entrypoints are default exports in the applet file.
// defineApplet({ activate(context): void | Dispose | Promise<void | Dispose> })
// definePage({ mount(context, container): void | Dispose | Promise<void | Dispose> })
```

`activate` receives one document-scoped `AppletContext`. `definePage` adapts `mount` to that lifecycle; `container` is an applet-owned element inside a Shadow DOM root. The SDK disposes resources on document retirement/suspension and reactivates on rebinding. Do not assume module variables form a durable applet process.

Activation has a five-second startup timeout. Render a local shell/loading state immediately. `mountReact(context, container, content)` returns a promise resolving after the first layout-effect commit and registers unmount on disposal. Use it for a top-level page, not as the direct return from synchronous `ui.mountAt` or `ui.openModal` render callbacks. Those callbacks accept only `void` or a synchronous disposer; use `createRoot`, `render`, and a returned `unmount` there.

## Context API

| Member | Signature and meaning |
| --- | --- |
| `binding` | Read-only host-issued `instanceId`, `appletId`, `viewId`, `generation`, and `binding: {kind:"source", sourceId} \| {kind:"page", pageId}`. Diagnostic identity, never user-selected authorization. |
| `sourceId` | Current source ID, or `null` for a packaged page. |
| `root`, `signal` | Owned UI container and abort signal for this activation. Check the signal before applying async results. |
| `styles.add` | `(key: string, css: string) => Dispose`. Managed source-document style; does not automatically style Shadow DOM content. |
| `watchElements` | `(key, options, handlers) => Dispose`. Tracks matched elements and their stable content identities. See below. |
| `ui.mountAt` | `(key, anchor, {position?, css?, shadow?, render}) => Dispose`. Position is `before`, `after`, or `append`, default append; Shadow DOM defaults on. `render(container)` returns void or a disposer. |
| `ui.openModal` | `(key, render) => Dispose`. One managed modal; a new modal replaces the old one. Return cleanup for owned content. Native Back dismisses it. |
| `navigation.onChange` | `(callback: (url: string) => void) => Dispose`. Same-document route observation, not a router that intercepts every request. |
| `sources.open` | `(sourceId: string, url?: string) => Promise<void>`. Declared source; explicit URL must be HTTPS within that source's exact origins. |
| `pages.open` | `(pageId: string) => Promise<void>`. Declared packaged page. |
| `onFocus` | `(callback: () => void) => Dispose`. Refresh when a retained view returns. Also perform the initial read yourself. |
| `onDispose` | `(callback: Dispose) => void`. Register cleanup synchronously while the context is active. |
| `services.request` | See response semantics below and [services guide](services-and-data.md). |
| `storage` | Revision-checked JSON document API described below. Requires `storage` capability. |

Navigation promises acknowledge accepted navigation, not destination load or customization completion. Do not chain a query of the destination DOM after awaiting `sources.open`.

Watcher options are `{ selector, root?, attributes: string[], text: boolean, limit?, contentKey(element): string | null }`. `limit` is 1–200, default 200. Return `null` for unsupported/incomplete items. Handlers are `enter(binding)`, optional `update(binding)`, and optional `leave(binding)`. A binding has `id`, `element`, `contentKey`, and `routeRevision`. A recycled element with a changed key leaves its old binding and enters a new one. Changed text under a stable key can call `update`. Anchor replacement still requires applet handling. Avoid unbounded queries or network work in each update callback.

Keys for watchers, styles, and mounts must be unique within their respective managed registries. Mount anchors must be connected. Managed mounts removed repeatedly by website code stop restoring after repeated conflicts; do not create a loop to fight the source renderer. Disposers should tolerate repeated calls when registered through more than one ownership path.

## Services and local documents

`services.request<T>(serviceId, {path, method, body?}): Promise<T>` currently types the whole response as `T`. For example:

```ts
import type { AppletContext } from "@genesis/sdk";

async function readItems(context: AppletContext) {
  const response = await context.services.request<{ status: number; body: unknown }>(
    "catalog", { method: "GET", path: "/v1/items" });
  if (response.status < 200 || response.status >= 300) throw new Error("Items unavailable");
  // Validate response.body before treating it as application records.
  return response.body;
}
```

Methods are GET, POST, PUT, PATCH, DELETE. GET cannot carry a body. Paths start with one `/`, remain on the configured HTTPS origin, and cannot include backslashes or fragments. Redirects are disabled. The host rejects authentication/transport failures; other HTTP errors can arrive as `{status, body}` and require applet handling. A generic type argument does not validate JSON.

```ts
// context.storage signatures, abbreviated only to remove generic parameters:
// get(collection, key) -> {document: {key,value,revision,updatedAtMs} | null, namespaceRevision}
// list(collection, {afterKey?,limit}) -> {entries, nextAfterKey: string | null, namespaceRevision}
// commit({checks,puts,deletes}) -> {namespaceRevision}
// onChanged(callback: ({changes,namespaceRevision}) => void) -> Dispose
```

Checks are `{collection,key,expectedRevision: number | null}`; null means the record must not exist. Puts are `{collection,key,value}` and deletes are `{collection,key}`. Every modification needs a check; the whole batch commits or conflicts. Collections match `[a-z][a-z0-9-]{0,63}`; keys are nonempty and at most 512 UTF-8 bytes. Limits: list 1–100 records, 32 KiB/document, 64 modifications and 128 checks/batch. RPC envelopes and storage operations are limited to 256 KiB. Paginate by returned keys, and detect namespace revision changes when a consistent scan matters.

Storage belongs to the current local profile and applet ID. Pages/sources within that applet share its namespace. Other applets do not. Storage and service replies may finish for their matching live retained document. Retired or evicted documents cannot receive replies. Notifications are not a durable cross-view message bus; refresh on focus, and do not rely on pending requests surviving eviction, timeouts, or phone suspension.

RPC permits 32 pending calls and has a 15-second response timeout. A timed-out write may already have committed. `GenesisError` exposes `code`, `message`, and `retryable`; retryable does not mean a write is safe to repeat. `serviceMessage(error)` supplies generic reader-facing text for some service failures. Validate and translate other errors in the applet; do not display raw server output or secrets.

## Manifest schema

| Field | Current rule |
| --- | --- |
| `schemaVersion`, `dataSchemaVersion` | Both must be `1`. Incrementing the data version is not an implemented migration mechanism. |
| `id`, `name` | Stable applet ID matching `[a-z][a-z0-9-]{0,63}`, unique in the bundle; nonempty display name. |
| `sources` | Nonempty array of unique `id`, HTTPS `startUrl`, exact `origins`, and applet-relative `entry`. Origins have no wildcard, path, or trailing slash. |
| Source `homePaths` | Optional root-route path list for root/detail presentation; does not grant origin access. |
| Source `customizedPaths` | Optional exact path list, query ignored when matching. Missing means legacy same-origin customization presentation; `[]` means no customized path. This is presentation coverage, not a per-path security sandbox. |
| Source `navigationRules` | Optional `{id,pathPrefix,action:"block",fallbackUrl}` array. Fallback must be a declared HTTPS origin and must not match any blocked prefix. Declare `navigation-policy` when using it. |
| `pages` | Required array, possibly empty, of unique `{id,entry}`. Each compiled page gets generated HTML. |
| `actions` | Required array, possibly empty, of unique `{id,label,pageId}` referencing a page. |
| `capabilities` | Required array from `dom`, `navigation-policy`, `storage`, `services`. Declare only what the applet uses. |
| `services` | Optional unique logical service IDs; nonempty declarations require `services` capability. Credentials and origins are configured outside the manifest. |
| `shell` | Optional `{title,brandAsset,sections,choices?}`; enables native app sections. |

Shell title should be 1–79 characters to satisfy both current validators. Brand artwork is an applet-relative packaged file. Sections number 1–5 with unique `{id,label,sourceId,pageId?,icon?}`; `sourceId` is required even for a local page and gives its source context. Icons currently supported: `home`, `search`, `post`, `bookmark`, `person`, `notifications`; omit unsupported icons. Choices are `{label,url,sourceId?}` and must point to that source's origins and explicit customized paths. Missing sourceId defaults to the first section's source for legacy manifests. Do not put a create/delete action in a section destination.

All entries and assets must stay inside the applet, including resolved symlinks. The current bundler supports TS/TSX, CSS imported as text, generated local HTML, and the declared shell artwork. It is not a general public-assets server. Backend files are not browser entries. No runtime external or dynamic imports may remain in a bundle. Generated revisions/hashes belong to the build, not hand-edited manifests.

The tooling and Rust host independently validate schema, fields, identifiers, references, exact origins, and capabilities. Both reject duplicate action IDs and use the same shell-title limit of 79 UTF-8 bytes. The host also checks canonical revision and asset bytes; it does not trust a creator-side check. Source presentation is limited to the selected source. Use sources.open for a customization-aware transition to another source; an ordinary cross-source web link uses reader presentation.

## Runtime API 2 route coverage

SDK/tools 0.3.0 emit runtime API 2 bundles. The updated host also accepts API 1 packages with their old semantics. API 2 keeps the protocol envelope `v:1`, data schema 1 and bundle format 1. Do not use new fields on an API 1 bundle.

Sources may declare `customizedRoutes` instead of `customizedPaths`, plus optional `ordinaryRoutes` exclusions. Match literal pathname segments, `:name` for one nonempty segment, and final `*` for zero or more segments. Exclusions win; queries/fragments do not affect classification. Patterns are bounded to 100 per list, 256 bytes and 16 segments. Regex, traversal and encoded separators are rejected. The host and injected predicate enforce the same rules.

Same-origin excluded routes stay in the source view with ordinary browser controls and no active applet binding. Crossing there disposes source effects and rejects broker calls. An ordinary SPA route returning to customized coverage performs one controlled eligible GET reload to obtain a fresh document binding. This is lifecycle control, not isolation of previously evaluated code from its origin.

Optional shell `colorScheme` accepts `default` or `neutral`; omission preserves the existing palette. The `notifications` section icon is also available in API 2.

## Guarding source navigation

API 2 exposes `context.navigation.onBack(callback): Dispose`. Return true only after consuming a source transient Back action; false falls through to browser history. The host allows 300 ms and ignores late or retired replies. SDK modals and fullscreen take priority. Do not await service requests or user decisions in this callback.

`context.navigation.setLeaveGuard({message})` returns an acknowledgement promise. Passing null clears it. Native section/reload/launcher navigation presents Stay/Leave while a guard is active. Register before editing, clear when the editor closes, and retain the website's own close/draft flow. This does not persist website drafts across process death.

Native sections carry a host-owned section identity across `pages.open` and `sources.open`. Section switches restore the last destination within the bounded retention budget. Source details opened from a packaged page retain that page as their opener. Source/page identity still determines permissions; section identity only controls navigation/presentation.
