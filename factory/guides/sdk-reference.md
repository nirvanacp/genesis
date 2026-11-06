# SDK reference

This kit matches `@genesis/sdk` `1.0.0`, `@genesis/applet-tools` `1.0.0`, manifest schema `5` and bundle format `2`. Import only from the three public entry points:

| Import | Use it in | Exports |
| --- | --- | --- |
| `@genesis/sdk/react` | The foreground | `mountForeground`, `GenesisProvider`, `useForeground`, `useNavigation`, `useScreenSource`, `useSource`, `useIntent`, `useRecords`, `useService`, `useScrollMemory`, `ScrollMemory`, `useAppResume` |
| `@genesis/sdk/source` | Source adapters | `defineSource` and the types `Step`, `Steps`, `SourceDefinition`, `RouteAdapter`, `IntentHandler` |
| `@genesis/sdk` | Either | `GenesisError`, `ServiceError`, `serviceMessage` and the shared types (`SourceView`, `Snapshot`, `NavigateTarget`, `Storage`, `StoredDocument`, `ErrorCode`, `Manifest`, `Screen`) |

Nothing else is public. If a feature needs something these exports cannot do, describe the missing capability instead of reaching into the bridge.

## Manifest (`applet.json`)

```json
{
  "schemaVersion": 5,
  "id": "example-reader",
  "name": "Example",
  "origins": ["https://example.com"],
  "foreground": { "entry": "src/main.tsx", "screens": ["home", "item", "saved", "unsupported"] },
  "sources": [{ "id": "main", "startUrl": "https://example.com/", "adapter": "src/sources/main.ts" }],
  "routes": [
    { "id": "home", "pattern": "/", "kind": "adapted", "source": "main", "screen": "home" },
    { "id": "item", "pattern": "/item", "query": ["id"], "kind": "adapted", "source": "main", "screen": "item" },
    { "id": "settings", "pattern": "/settings", "kind": "adapted", "source": "main", "screen": "settings", "requiresSignIn": true },
    { "id": "login", "pattern": "/login", "kind": "website" }
  ],
  "capabilities": { "storage": true, "services": [{ "id": "bookmarks", "config": "backend/service.json" }] },
  "shell": { "accent": "#ff6600" }
}
```

| Field | Rule |
| --- | --- |
| `id` | `[a-z0-9-]+`. Never change it after install; storage and service credentials are keyed by it. |
| `name` | Shown in the launcher and on the launch splash. |
| `origins` | Exact `https://host` origins, no path. Hidden sources load only these. |
| `foreground.entry` | The TypeScript or TSX file that calls `mountForeground`. |
| `foreground.screens` | Every screen id the foreground renders. A screen named `unsupported` receives declared-origin URLs that no route matches. |
| `sources` | At most three. `startUrl` is on a declared origin; `adapter` is the file that calls `defineSource` with the same `id`. |
| `routes` | Checked in order; the first match wins. `pattern` has literal segments, `:name` segments and an optional trailing `*` (the rest goes into `params.rest`). Keys listed in `query` must be present and become params. A trailing slash is ignored. |
| `kind: "adapted"` | The route's page loads in `source` and renders as `screen`. `requiresSignIn` makes the adapter's `isSignedIn` decide between data and `auth`. |
| `kind: "website"` | The URL opens in the website sheet. Use it for sign-in, editors and other pages the user operates directly. |
| `capabilities.storage` | Enables document storage for this applet. |
| `capabilities.services` | HTTPS backends. `config` points at the service file that the tools use (see [services and data](services-and-data.md)). |
| `shell.accent` | `#rrggbb` color for the applet name on the launch splash. |

Unknown fields are errors. `genesis-applet check` reports each error with a JSON pointer such as `/routes/3/screen`.

## Source adapters

```ts
import { defineSource } from "@genesis/sdk/source";

export interface Item { id: string; title: string; url: string | null; points: number | null }

export default defineSource({
  id: "main",
  routes: {
    home: {
      extract(doc): { items: Item[] } | null {
        const rows = doc.querySelectorAll("tr.athing");
        if (rows.length === 0) return doc.readyState === "complete" && doc.querySelector("#content") ? { items: [] } : null;
        return { items: [...rows].slice(0, 60).map(readItem) };
      },
    },
  },
  intents: {
    upvote: (intent, doc) => [{ click: `#up_${CSS.escape(intent.id)}` }, { waitFor: `#un_${CSS.escape(intent.id)}`, timeoutMs: 5000 }],
  },
  isSignedIn: doc => doc.querySelector("a#logout") !== null,
});
```

| Option | Meaning |
| --- | --- |
| `id` | Must equal the manifest source id. |
| `routes[routeId].extract(doc, params)` | A pure function of the page. Return JSON for the screen, or `null` while the page is not ready. A thrown error publishes `status: "error"`. Runs again 250 ms after the page settles from any DOM or URL change. |
| `intents[name](intent, doc)` | Returns the driver steps for the intent whose `name` matches. It runs against the current page and must not change it itself. |
| `isSignedIn(doc)` | Runs only on routes declared with `requiresSignIn`. `false` publishes `status: "auth"` instead of calling `extract`. |

Driver steps run in order. Selectors are CSS selectors; `waitForUrl` is a regular expression tested against `location.href`. A `navigate` or `submit` step replaces the page, so it may appear only as the last step; the intent is reported as successful when that step starts. Any step that finds nothing fails the intent with `NOT_FOUND`; a wait that runs out fails with `DEADLINE`; a page that moves to another route mid-intent fails with `SOURCE_REPLACED`.

| Step | Effect |
| --- | --- |
| `{ click: selector }` | Clicks the first match. |
| `{ fill: selector, value }` | Sets an input or textarea the way typing does, firing `input` and `change`. |
| `{ submit: selector }` | Submits the form that is or contains the match. Target the form, or its submit button to use that button as the submitter. Last step only. |
| `{ navigate: url }` | Loads `url` in the source. Last step only. |
| `{ waitFor: selector, timeoutMs }` | Waits until the selector matches. |
| `{ waitForUrl: pattern, timeoutMs }` | Waits until the URL matches. |

## Snapshots and `SourceView`

Each source publishes one snapshot of its current page. Screens read it as a `SourceView<T>`:

| Field | Meaning |
| --- | --- |
| `status` | `loading`, `ready`, `auth`, `unsupported` or `error` |
| `data` | The extractor's result when `ready`, otherwise `null`, except that a stale cached view keeps its data |
| `stale` | `true` when the view comes from the cache (up to 16 ready pages per source) while the page loads. A screen keeps its cached data through `loading`; `error`, `auth` and `unsupported` replace it |
| `url`, `routeId`, `params` | The page and the route it matched |
| `error` | `{ code, message }` for `error` |

The host writes an error snapshot with code `NOT_READY` when a page publishes nothing but `loading` within 15 seconds. A page that redirects to another route shows as `unsupported` on the screen that asked for it. A snapshot larger than 192 KiB becomes an error with code `SNAPSHOT_TOO_LARGE`.

## Foreground hooks

`mountForeground(<App />)` connects to Genesis, renders into `#root`, tells the shell when the first layout is painted, and unmounts when the host retires the page. Call it once from `foreground.entry`. The hooks below need it (or a `GenesisProvider` around a foreground from `useForeground`).

### `useNavigation()`

```tsx
const { screen, stack, website, navigate, back, reload, setLeaveGuard } = useNavigation();
if (screen.id === "item") return <ItemScreen id={screen.params.id} />;
```

`screen` is the current entry: `{ key, id, params, source }`. `stack` is the whole stack, `website` is `{ url }` while the website sheet is open. `navigate` takes the three targets in [navigation](navigation.md). `back()` is in-app Back: it follows Android Back's rules but never leaves the applet from the root screen. `reload(sourceId?)` loads the current screen's page again, or the last page of another source; the screen keeps its cached data, marked `stale`, while it loads. `setLeaveGuard(message)` asks for confirmation before Back leaves the current screen; `null` clears it, and so does any screen change. On the root screen, confirming leaves the applet.

### `useScreenSource<T>()`

```tsx
const page = useScreenSource<{ items: Item[] }>();
if (page.status === "auth") return <SignInPrompt />;
if (!page.data) return page.status === "error" ? <ErrorNotice error={page.error} /> : <FeedSkeleton />;
```

The snapshot of the page that belongs to the current screen. A screen opened from a route URL owns that page; the source loads it when the screen becomes current. A screen pushed with `kind: "screen"` and no `source` has no page and always reads `loading`.

### `useSource<T>(sourceId)`

```tsx
const account = useSource<{ handle: string }>("account");
```

The latest snapshot of a source, whichever page it shows. Use it for a second source that a screen reads alongside its own page.

### `useIntent(sourceId)`

```tsx
const { act, pending, error } = useIntent("main");
<button type="button" disabled={pending} onClick={() => act({ name: "upvote", id: item.id }).catch(() => {})}>Upvote</button>
```

`act(intent)` sends the intent to the source's adapter and resolves when its steps finish. It rejects with a `GenesisError` (`NOT_FOUND`, `DEADLINE`, `SOURCE_REPLACED`, `INVALID_STEPS`, `RETIRED`). Intents for one source run one at a time. An intent targets the page that was showing when it arrived: if the source navigates elsewhere before or between steps (other than through its own `waitForUrl` step), it fails with `SOURCE_REPLACED`, and the 15-second deadline counts from arrival, including time queued. The foreground gives up after 17 seconds.

### `useRecords<T>(collection, { storage })`

```tsx
const { records, loading, error, put, remove, commit } = useRecords<Bookmark>("bookmarks");
await put(item.id, { title: item.title, savedAt: Date.now() }, existing?.revision ?? null);
```

Every document in a collection, reloaded after each change. `put(key, value, expectedRevision)` writes one document; pass `null` to require that it does not exist yet, a revision to require that it has not changed, or omit it to write unconditionally. `commit({ checks, puts, deletes })` applies several changes atomically and fails with `CONFLICT` when a check fails. Each document is at most 32 KiB of JSON. Pass `storage` to read an applet's own `Storage` implementation, such as one over its backend, through the same hook.

### `useService(serviceId)`

```tsx
const request = useService("bookmarks");
const response = await request<{ documents: Doc[] }>("/v1/documents", { method: "POST", body: { ids } });
if (response.status !== 200) throw new Error("The bookmarks service refused the request");
```

Sends an HTTPS request to the declared service through the shell, which adds the credential. HTTP error statuses arrive as responses. A request the shell could not complete throws `ServiceError` with `CONFIGURATION_REQUIRED`, `AUTHENTICATION_FAILED`, `CERTIFICATE_FAILED`, `SERVICE_UNREACHABLE`, `DEADLINE` or `SERVICE_FAILURE`. `serviceMessage(error)` turns those into a sentence for people.

### `useScrollMemory()` and `ScrollMemory`

```tsx
<ScrollMemory className="screen">{rows}</ScrollMemory>
```

Keeps a scroll container's position per stack entry and restores it when the user comes back to that entry. Use the component, or put `ref={useScrollMemory()}` on your own scroll container.

### `useAppResume(callback)`

```tsx
useAppResume(() => void reload());
```

Runs when the applet returns from the background and when the website sheet closes. Use it to reread stored records or service data that may have changed elsewhere.

### `useForeground()`

The underlying runtime: `manifest`, `appletId`, `restored` (the host recreated the applet after retiring it in the background; the screen stack, its parameters and scroll positions come back with it, without screens whose route no longer exists), `storage`, `navigation.onConfirmLeave(handler)` to replace the default confirm prompt, and the methods behind the hooks. Prefer the hooks.

## Errors and limits

`GenesisError` has a `code` from this list: `RETIRED`, `CONFLICT`, `NOT_FOUND`, `DOCUMENT_TOO_LARGE`, `STORAGE_FAILURE`, `ORIGIN_NOT_DECLARED`, `SNAPSHOT_TOO_LARGE`, `MESSAGE_TOO_LARGE`, `DEADLINE`, `SOURCE_REPLACED`, `INVALID_STEPS`, `SERVICE_UNREACHABLE`, `SERVICE_FAILURE`, `AUTHENTICATION_FAILED`, `CERTIFICATE_FAILED`, `CONFIGURATION_REQUIRED`, `NOT_READY`, `UNKNOWN_METHOD`, `INVALID_ARGUMENT`, `QUOTA_EXCEEDED`.

| Limit | Value |
| --- | --- |
| Sources per applet | 3 |
| Snapshot | 192 KiB of JSON |
| Stored document | 32 KiB of JSON |
| Message between page and host | 256 KiB |
| Service request or response body | 256 KiB; 3 s to connect, 4 s to read |
| Page ready deadline | 15 s to publish anything but `loading`, then `NOT_READY` |
| Intent | 15 s on the page, 17 s in the foreground |
| Request deadline | 15 s |
| Back answer | 300 ms, after which the shell leaves the applet |
