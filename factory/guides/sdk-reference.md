# SDK reference

This kit matches `@genesis/sdk` `0.0.0`, `@genesis/applet-tools` `0.0.0`, manifest schema `6`, bundle format `3`, protocol `1` and adapter API `1`. Import only from the three public entry points:

| Import | Use it in | Exports |
| --- | --- | --- |
| `@genesis/sdk/react` | The foreground | `mountForeground`, `GenesisProvider`, `useForeground`, `usePage`, `useRegion`, `useRecord`, `useAction`, `usePending`, `useNavigation`, `useRecords`, `useService`, `useNotifications`, `useScrollMemory`, `ScrollMemory`, `useAppResume` and the types `PageView`, `RegionView`, `Navigation`, `NavigateTarget`, `CurrentScreen`, `PendingAction` |
| `@genesis/sdk/adapter` | The adapter | `defineAdapter`, `collection`, `single` and the types `Page`, `Region`, `CollectionOptions`, `SingleOptions`, `Action`, `ActionSpec`, `Step`, `Steps`, `AdapterDefinition` |
| `@genesis/sdk` | Either | The adapter exports, `GenesisError`, `ServiceError`, `serviceMessage` and the shared types (`ActionResult`, `ActionOutcome`, `PageState`, `PageStatus`, `Record`, `ErrorInfo`, `ErrorCode`, `Presentation`, `ContextState`, `Screen`, `Storage`, `StoredDocument`, `Manifest`, `Limits`) |

Nothing else is public. The build rejects an adapter that imports `@genesis/sdk/react`. If a feature needs something these exports cannot do, describe the missing capability instead of reaching into the bridge.

## Manifest (`applet.json`)

```json
{
  "schemaVersion": 6,
  "id": "example-reader",
  "name": "Example",
  "origins": ["https://example.com"],
  "foreground": { "entry": "src/main.tsx", "screens": ["feed", "item", "account", "saved"] },
  "adapter": "src/adapter.ts",
  "contexts": [
    { "id": "primary", "startUrl": "https://example.com/" },
    { "id": "me", "startUrl": "https://example.com/account" }
  ],
  "routes": [
    { "id": "home", "pattern": "/", "page": "feed", "screen": "feed", "context": "primary" },
    { "id": "item", "pattern": "/item", "query": ["id"], "page": "item", "screen": "item" },
    { "id": "account", "pattern": "/account", "page": "account", "screen": "account", "context": "me" }
  ],
  "capabilities": { "storage": true, "services": [{ "id": "bookmarks", "config": "backend/service.json" }] },
  "shell": { "accent": "#ff6600", "icon": "assets/icon.png" }
}
```

| Field | Rule |
| --- | --- |
| `id` | `[a-z0-9-]+`. Never change it after install; storage and service credentials are keyed by it. |
| `name` | Shown in the launcher and on the launch splash. |
| `origins` | Exact `https://host` origins with an optional port and no path. The adapter runs only on these. |
| `foreground.entry` | The TypeScript or TSX file that calls `mountForeground`. |
| `foreground.screens` | Every screen id the foreground renders, for routes and for overlay screens. |
| `adapter` | The file whose default export is `defineAdapter(...)`. One adapter serves every context. |
| `contexts` | One to three website sessions, each `{ id, startUrl }` with `startUrl` on a declared origin. The first context is the primary one and is active at launch. Each context keeps its own history. |
| `routes` | Checked in order; the first match wins. `pattern` has literal segments, `:name` segments and an optional trailing `*` (the rest of the path goes into `params.rest`, and the bare prefix also matches). Keys listed in `query` must be present and become params. A trailing slash is ignored. There is no exclusion syntax: put a narrower route first. |
| `routes[].page` | The adapter page that reads this URL, `[a-z0-9-]+`. `check` fails when the adapter does not declare it. |
| `routes[].screen` | A declared screen that renders the page. |
| `routes[].context` | Optional. The context a link to this route opens in from a tab root or an overlay screen (see [navigation](navigation.md#which-context-a-url-opens-in)). |
| `capabilities.storage` | Enables document storage for this applet. |
| `capabilities.services` | HTTPS backends. `config` points at the service file that the tools use (see [services and data](services-and-data.md)). |
| `capabilities.notifications` | Optional. `{}` lets the foreground notify the user with `useNotifications()`. Adding `service` (a declared service id) and `path` (starting with one `/`) also has the shell ask that service for news in the background, about every `intervalMinutes` (an integer from 15 to 1440, default 60). `service` and `path` go together. See [notifications](services-and-data.md#notifications). |
| `shell.accent` | `#rrggbb` brand color. The shell fills the applet's home-screen shortcut and Recents icon with it, and draws the first letter of `name` on it when there is no `shell.icon`. |
| `shell.icon` | Optional. A PNG under `assets/` (`assets/icon.png`), square, 192 to 1024 px on a side and at most 256 KiB. Use original artwork the applet may use, not the website's logo copied from its pages. The launcher, launch splash, home-screen shortcut and Recents card show it; the shell places it inside the adaptive icon's safe zone on the accent color, so keep the art's own background transparent or matching. `check` fails at `/shell/icon` when the file is missing, not a PNG, not square or out of range. |

A URL on a declared origin that no route matches, and any URL on another origin, shows as the website itself in its context. Unknown fields are errors ("is not a schema 6 field"). `genesis-applet check` reports each error with a JSON pointer such as `/routes/3/screen`, and warns about routes that an earlier route always matches first.

## Adapter

The adapter runs inside each context's page on a declared origin. It reads the page into records and turns actions into steps. It has no storage, services or navigation of its own. See [adapters](adapters.md) for how to write one.

```ts
import { collection, defineAdapter, single } from "@genesis/sdk/adapter";

export default defineAdapter({
  account: doc => doc.querySelector("#me")?.textContent?.trim() ?? null,
  signInUrl: url => `/login?goto=${encodeURIComponent(new URL(url).pathname)}`,
  pages: {
    feed: {
      ready: doc => doc.querySelector("#content") !== null,
      regions: {
        stories: collection({
          root: "#content",
          items: "article[data-id]",
          key: item => item.getAttribute("data-id")!,
          entityType: "story",
          read: readStory,
          more: "a.more",
          actions: { setSaved: (item, args: { saved: boolean }) => setSaved(item!, args.saved) },
        }),
      },
      actions: {
        loadMore: () => ({ steps: [{ click: "a.more" }], navigates: true, expect: { page: "feed" } }),
      },
    },
  },
});
```

### `defineAdapter(definition)`

| Option | Meaning |
| --- | --- |
| `pages` | Keyed by the page ids that manifest routes name. |
| `account(doc)` | The signed-in account read from the page: a non-empty string, `null` when signed out, or `undefined` when this page does not show the account (no evidence either way). A throw counts as `null`. A page's own `account` overrides it. |
| `signInUrl` | Where an `auth` page sends the user: a path resolved on the first declared origin, or a function of the current URL that returns a URL or a path. |

`defineAdapter` checks the shape and throws `Adapter <path> ...` naming the first bad field. `check` imports the adapter, so shape errors fail there.

### Pages

| Option | Meaning |
| --- | --- |
| `ready(doc)` | Positive evidence that the page has rendered what the regions read. Return `true` only from content you recognized. A throw makes the page `error` with code `INVALID_ARGUMENT` and the thrown message. |
| `account(doc)` | Overrides the adapter-level `account` on this page. |
| `requiresAccount` | Without an account the page's status is `auth`, reported once the page is ready or the document is parsed. |
| `regions` | Named `collection` and `single` regions. |
| `actions` | Actions on the page as a whole. They receive `null` as the element. |

### `collection(options)` and `single(options)`

| Option | Applies to | Meaning |
| --- | --- | --- |
| `root` | Both | Selector of the element that contains the region. A missing root gives an empty region. |
| `items` | Collection | Selector of the items, matched inside `root`. |
| `key(item)` | Collection, required | A non-empty string unique within the region, such as the site's id. |
| `key(root)` | Single, optional | Defaults to the region name. |
| `read(element)` | Both | Pure and synchronous. Reads only the item (or root), its descendants, its `extent` and `dependsOn`, and returns JSON. |
| `extent(item)` | Collection | Other nodes `read` touches for this item, such as a sibling row. A mutation there re-reads the item. |
| `dependsOn` | Both | Selectors of nodes outside the region that `read` uses. A mutation inside them re-reads the whole region. |
| `more` | Collection | Selector of the site's "more" link. While it is present the region is not `complete`. |
| `virtualized` | Collection | Items that leave the DOM stay in the region for the current view. |
| `fields` | Both | Re-read on `input` and `change` events inside the region. |
| `measure` | Both | Re-read when an element of the region changes size. |
| `entity(element)` | Both | The record's identity across regions and pages. Defaults to the key. |
| `entityType` | Both | Defaults to the region name. |
| `actions` | Both | Record actions. They receive the item element (collection) or the root (single). |

## Page and region state

The adapter publishes each context's current page. Screens read it through hooks.

| Page status | Meaning |
| --- | --- |
| `loading` | The page has not shown its ready evidence yet. |
| `ready` | `ready(doc)` returned `true`; regions hold records. |
| `auth` | The page `requiresAccount` and the account is `null`. |
| `error` | `ready` threw, the route names a page the adapter lacks (`NOT_FOUND`), the page is too large (`PAGE_TOO_LARGE`), or the adapter API does not match (`PROTOCOL_MISMATCH`). |
| `unsupported` | The URL matches no route. |

A region read that throws marks that region `error` with the message and keeps its earlier records. A `read` that returns a promise is an `ASYNC_READ` error. Repeated keys in a collection make the region `ephemeral`: keys become positions, and record actions fail with `PRECONDITION_FAILED`.

## Foreground hooks

`mountForeground(<App />)` connects to Genesis, renders into `#root`, tells the shell when the first layout is painted, and unmounts when the host retires the page. Call it once from `foreground.entry`. The hooks below need it, or a `GenesisProvider` around a foreground from `useForeground`. Hooks that take `contextId` default to the active context.

### `usePage(contextId?)`

```tsx
const page = usePage();
if (page.status === "error" && !page.stale) return <LoadError error={page.error} />;
```

`{ pageId, status, stale, generation, params, error, account, url }`. `stale` is `true` while the screen shows the last ready copy of this history entry and the page loads again (Back, Reload). `account` is the last account the adapter read, or `null`. `params` are the route params.

### `useRegion<T>(name, contextId?)`

```tsx
const stories = useRegion<Story>("stories");
stories.order.map(key => <StoryRow key={key} id={key} />);
```

`{ order, get(key), complete, status, error, ephemeral }`. `order` lists keys in page order. `status` is `ready`, `error`, or `missing` when the current page has no such region. The view and each record keep their identity while nothing in them changed, so rows memoized by key re-render only when their own record changes.

### `useRecord<T>(name, key, contextId?)`

```tsx
const story = useRecord<Story>("stories", id);      // { key, entity?, entityType?, data } or undefined
const form = useRecord<Form>("form", null);         // a single region's record
```

### `useAction<A>(name, region?, contextId?)`

```tsx
const setSaved = useAction<{ saved: boolean }>("setSaved", "stories");
const result = await setSaved(story.key, { saved: true });
```

Returns `(key | null, args?) => Promise<ActionResult>`. The key is `null` for a single region or a page action (no region). The context is the one passed, or the active one at call time. The promise never rejects. Identical pending calls (same context, entity, action name and args) share one promise. See [interactions](interactions.md).

| `ActionResult` field | Meaning |
| --- | --- |
| `outcome` | `observed`, `failed`, `cancelled` or `unknown` |
| `code`, `message` | Why, when the outcome is not `observed` |
| `noop` | `true` when the action reported `{ satisfied: true }` and ran no steps |
| `completedSteps`, `partial` | How far the steps got before a failure or deadline |
| `exhausted` | Reserved for a load-more action that found the end of the collection. The type declares it, but the SDK does not set it yet; tell the end from the records the region shows |

### `usePending(region, key, contextId?)`

```tsx
const pending = usePending("stories", id).find(action => action.name === "setSaved");
const saved = pending ? (pending.args as { saved: boolean }).saved : story.data.saved;
```

The actions in flight on one record, as `{ name, args }[]`. Pass `null, null` for page actions. The list keeps its identity while it does not change.

### `useNavigation()`

```tsx
const { screen, active, overlay, navigate, back, select, reload, viewWebsite, done, setLeaveGuard } = useNavigation();
if (screen?.id === "item") return <ItemScreen key={screen.key} />;
```

| Field | Meaning |
| --- | --- |
| `screen` | What to render: the top overlay screen, or the route screen of the active context. `{ key, id, params, context, overlay }`, or `null` while the active context shows a URL without a route (the website shows then). |
| `active`, `contexts` | The active context id and every context's state. |
| `overlay` | The overlay screens above the active context. |
| `presentation`, `revealed` | Whether the active context shows the applet (`custom`) or the website, and which context's website is on screen. |
| `navigate(target)` | `{ url, context?, mode? }` loads a website URL in a context; `{ screen, params?, mode? }` opens an overlay screen. See [navigation](navigation.md). |
| `select(contextId)` | Switches to a context, as a tab does. |
| `back()` | In-app Back. It follows Android Back but never leaves the applet. |
| `reload(contextId?)` | Loads the context's current page again. The screen keeps the last copy, marked `stale`, until the new page is ready. |
| `viewWebsite(contextId?)`, `done(contextId?)` | Show the website for the current page, and return from it. |
| `setLeaveGuard(message)` | Asks for confirmation before Back or navigation leaves the current screen. `null` clears it, and so does any navigation. |

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

### `useNotifications()`

```tsx
const notifications = useNotifications();
await notifications.post({ id: `reply-${reply.id}`, title: "New reply", body: reply.text, url: `https://example.com/item?id=${reply.id}` });
```

Notifies the user under the applet's name, when the manifest declares `capabilities.notifications`; otherwise it throws `CONFIGURATION_REQUIRED`. `id` is 1 to 64 letters, digits, `.`, `_` or `-`, and a later notification with the same id replaces the earlier one. `title` is 1 to 120 characters and `body` at most 500. `url` is optional, `https` on one of the applet's origins, and opens in the applet when the user taps the notification; without it the tap opens the applet where it was. Anything else throws `INVALID_ARGUMENT`. The result `{ posted: true }` means Genesis accepted the request: it shows only if the user turned the applet's notifications on in Applet info, which is off by default.

### `useScrollMemory()` and `ScrollMemory`

```tsx
<ScrollMemory className="screen">{rows}</ScrollMemory>
```

Keeps a scroll container's position per context history entry and per overlay screen, and restores it when the user comes back. Reselecting the current tab on its start page scrolls it to the top. Use the component, or put `ref={useScrollMemory()}` on your own scroll container.

### `useAppResume(callback)`

```tsx
useAppResume(() => void reload());
```

Runs when the applet returns from the background and when the user taps Done on the website. Use it to reread stored records or service data that may have changed elsewhere.

### `useForeground()`

The underlying runtime: `manifest`, `appletId`, `restored` (the host recreated the applet after retiring it in the background; the active context, the overlay screens and each context's last page come back with it, without overlay screens the manifest no longer declares), `storage`, `navigation.onConfirmLeave(handler)` to replace the default confirm prompt, and the methods behind the hooks. Prefer the hooks.

## Errors and limits

`GenesisError` has a `code` from this list: `RETIRED`, `CONFLICT`, `NOT_FOUND`, `DOCUMENT_TOO_LARGE`, `STORAGE_FAILURE`, `ORIGIN_NOT_DECLARED`, `MESSAGE_TOO_LARGE`, `PAGE_TOO_LARGE`, `PATCH_TOO_LARGE`, `DEADLINE`, `INVALID_STEPS`, `SERVICE_UNREACHABLE`, `SERVICE_FAILURE`, `AUTHENTICATION_FAILED`, `CERTIFICATE_FAILED`, `CONFIGURATION_REQUIRED`, `NOT_READY`, `UNKNOWN_METHOD`, `INVALID_ARGUMENT`, `QUOTA_EXCEEDED`, `PROTOCOL_MISMATCH`, `APPLET_INCOMPATIBLE`, `ENVELOPE_INVALID`, `CONTEXT_REPLACED`, `TARGET_NOT_FOUND`, `PRECONDITION_FAILED`, `ASYNC_READ`, `AUTH_REQUIRED`, `REJECTED`. Action results carry the same codes in `code`.

| Limit | Value |
| --- | --- |
| Contexts per applet | 3 |
| Published page | 192 KiB of JSON (196608 bytes) |
| One update to a page | 64 KiB and 200 records |
| Stored document | 32 KiB of JSON |
| Message between page and host | 256 KiB |
| Service request or response body | 256 KiB; 3 s to connect, 4 s to read |
| Notification | `id` 64 characters, `title` 120, `body` 500; at most 5 per background check |
| Background news check | Every 15 to 1440 minutes, only with a network and only after the user turns notifications on |
| Page ready deadline | 15 s; after it a loading page shows the website |
| Action | 15 s on the page by default (`deadlineMs` overrides it), 17 s in the foreground |
| Request deadline | 15 s |
| Back answer | 300 ms, after which the shell leaves the applet |
| Stale pages kept for Back | 16 history entries per context |

## Compatibility

Every part checks the others before it runs:

| Value | Current |
| --- | --- |
| Manifest schema | 6 |
| Bundle format | 3 |
| Protocol | 1 |
| Adapter API | 1 |
| SDK and tools | 0.0.0 |

`check` and `build` compare `applet.json` and the `@genesis/sdk` dependency with the tools and fail with `APPLET_INCOMPATIBLE`, listing each `field applet → current`. Update the applet to the current SDK and run `check` again. A bundle records its values in `bundle.json`. Genesis refuses to open an applet built for another version and marks it in the launcher as "Needs update" or "Needs a newer Genesis"; `dev install` and `dev status` report the same mismatch. A page whose adapter API differs shows `error` with `PROTOCOL_MISMATCH`.
