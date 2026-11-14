# SDK reference

This kit matches `@genesis/sdk` `0.0.0`, `@genesis/applet-tools` `0.0.0`, manifest schema `6`, bundle format `3`, protocol `1` and page control API `1` (`adapterApi` in the compatibility table). The SDK has four public entry points:

| Import | Runs in | Use it for |
| --- | --- | --- |
| `@genesis/sdk` | The UI | The client. It connects, drives contexts, watches pages, and gives storage, services, notifications and the locator and field builders. It uses no UI framework. |
| `@genesis/sdk/page` | The website page | The page module with its readers and commands (see [page modules](page-modules.md)). |
| `@genesis/sdk/router` | The UI | The optional router helper for routes, screens, Back and when the website shows. |
| `@genesis/sdk/react` | The UI | React bindings over the client and the router. React and React DOM `^19.3.1` are optional peer dependencies, needed only for this entry. |

Nothing else is public. The page module must not import `@genesis/sdk/react` or a UI framework (see [page modules](page-modules.md#what-check-enforces)). If a feature needs something these exports cannot do, describe the missing capability instead of reaching into the bridge. The [protocol guide](protocol.md) describes what these calls send, and the [page control guide](page-control.md) explains how to use them on a live page.

## Manifest (`applet.json`)

```json
{
  "schemaVersion": 6,
  "id": "example-reader",
  "name": "Example",
  "origins": ["https://example.com"],
  "foreground": { "kind": "web", "entry": "index.html" },
  "contexts": [
    { "id": "primary", "startUrl": "https://example.com/" },
    { "id": "me", "startUrl": "https://example.com/account" }
  ],
  "capabilities": { "storage": true, "services": [{ "id": "bookmarks", "config": "backend/service.json" }] },
  "shell": { "accent": "#ff6600", "icon": "assets/icon.png" },
  "build": { "foreground": { "entry": "src/main.tsx" }, "page": "src/page.ts" }
}
```

| Field | Rule |
| --- | --- |
| `id` | `[a-z0-9-]+`. Never change it after install, because storage and service credentials are keyed by it. |
| `name` | Shown in the launcher and on the launch splash. |
| `origins` | Exact `https://host` origins with an optional port and no path. The page agent runs only on these. |
| `foreground` | `kind` is always `web`. `entry` is the UI's HTML file inside the bundle, usually `index.html`. |
| `contexts` | One to three website sessions, each `{ id, startUrl }` with `startUrl` on a declared origin. The first context is active at launch. Each context keeps its own history. |
| `capabilities.storage` | Enables document storage for this applet. |
| `capabilities.services` | HTTPS backends. `config` points at the service file that the tools use (see [services and data](services-and-data.md)). |
| `capabilities.notifications` | Optional. `{}` lets the UI notify the user with `genesis.notifications.post`. Adding `service` (a declared service id) and `path` (starting with one `/`) also has the shell ask that service for news in the background, about every `intervalMinutes` (an integer from 15 to 1440, default 60). `service` and `path` go together. See [notifications](services-and-data.md#notifications). |
| `shell.accent` | `#rrggbb` brand color. The shell fills the applet's home-screen shortcut and Recents icon with it, and draws the first letter of `name` on it when there is no `shell.icon`. |
| `shell.icon` | Optional. A PNG under `assets/` (`assets/icon.png`), square, 192 to 1024 px on a side and at most 256 KiB. Use original artwork the applet may use, not the website's logo copied from its pages. The launcher, launch splash, home-screen shortcut and Recents card show it; the shell places it inside the adaptive icon's safe zone on the accent color, so keep the art's own background transparent or matching. `check` fails at `/shell/icon` when the file is missing, not a PNG, not square or out of range. |
| `build.foreground` | `{ entry }`, a source file the tool bundles with esbuild, or `{ command, dir }`, a command that writes the built UI into `dir`. See [frameworks](frameworks.md). |
| `build.page` | Optional. The page module file, bundled into `page.js` with the page agent. |
| `build.check` | Optional. A type check command that replaces `tsc -p tsconfig.json --noEmit`. |

The `build` section stays out of the bundled manifest. Routes and screens are code (see [`@genesis/sdk/router`](#genesissdkrouter)). A manifest that still has `routes`, `foreground.screens` or `adapter` fails with one message that says where each moved. Unknown fields are errors. `genesis-applet check` reports each error with a JSON pointer such as `/contexts/1/startUrl`.

## `@genesis/sdk`

### Connecting

| Export | Signature | Purpose |
| --- | --- | --- |
| `connect` | `connect(options?: ConnectOptions): Promise<Genesis>` | Connects the UI document to Genesis. Rejects with `PROTOCOL_MISMATCH` when Genesis speaks another protocol. |
| `ConnectOptions` | `{ transport?: Transport; url?: string }` | The WebView bridge and `location.href` by default. |
| `Genesis` | interface | The connected applet, described below. |
| `openSession` | `openSession(transport: Transport, url: string): Promise<Session>` | The raw message session under `connect`, for tools and tests. |
| `Session` | interface | `bound`, `retired`, `request(method, params?, options?)` and `on(name, handler)`. |
| `webViewTransport` | `webViewTransport(bridge?): Transport` | The transport over the bridge that Genesis installs in the UI WebView. Throws `NOT_READY` outside Genesis. |
| `Transport` | `{ send(text); onMessage(listener); close() }` | A message channel. Implement it to run the client against something other than the WebView. |

```ts
import { connect } from "@genesis/sdk";

const genesis = await connect();
document.getElementById("root")!.textContent = genesis.manifest.name;
genesis.ready();
```

`Genesis` has these members:

| Member | Purpose |
| --- | --- |
| `appletId`, `revision`, `manifest`, `limits`, `compat` | The installed applet, its bundled manifest, the host's limits and its compatibility values. |
| `contextIds` | The declared context ids, in manifest order. |
| `context(id?)` | The `ContextHandle` of a context, the first one by default. |
| `website` | Shows and hides a context's website (see [Website](#website)). |
| `onBack(handler)` | Handles Android Back. The newest handler runs first, and the first that returns `true` consumes Back. When none does, Genesis leaves the applet. Handlers answer at once. |
| `leave()` | Leaves the applet, after a consumed Back that asked the person first. |
| `saved`, `save({ router?, app? })` | State kept when Genesis recreates the UI. `save` replaces each key given, debounced by 500 ms. |
| `storage` | Document storage (`Storage`). |
| `services.request(serviceId, path, { method?, body? })` | Calls a declared backend service. |
| `notifications.post(input)` | Notifies the user (see [Notifications](#notifications)). |
| `notifications.enable()` | Turns the applet's notifications on after a tap; resolves with whether they are on (see [User actions](#user-actions)). |
| `files.pick(options?)`, `files.release(ids)` | Lets the user pick files, and lets go of them (see [User actions](#user-actions)). |
| `downloads.save({ context, url, filename? })` | Saves a file to Downloads after a tap. |
| `share({ title?, text?, url? })` | Opens Android's share sheet after a tap. |
| `links.openExternal(url)` | Opens a link in another app after a tap. |
| `ready()` | Reports the first layout. The shell then shows the UI. |
| `onResume`, `onSuspend`, `onRetired` | The applet came back, is going to the background, or this UI was closed. Each returns its unsubscribe function. |
| `retired` | `true` once the UI was closed. |

### Contexts

`genesis.context(id)` returns a `ContextHandle`. The [page control guide](page-control.md) explains each call, its options and its results.

| Export | Purpose |
| --- | --- |
| `ContextHandle` | One context, with its state, its navigation, and the page agent in its current document. |
| `ContextState` | `{ id, url, generation, view, bound, loading, index, canGoBack, canGoForward, error }`. |
| `CallOptions` | `{ timeoutMs? }` for a call that reads. |
| `InputCallOptions` | `{ timeoutMs?, force?, input?, until?, expect?, navigates? }` for an input. |
| `Expect` | `{ url?, notUrl?, read? }`, which judges the page an input leads to. |
| `PendingInput` | `{ op, args }` of an input that has not settled. |
| `Watch` | `{ id, get(), subscribe(listener), resync(), close() }`. |
| `WatchOptions` | `{ when?: UrlGuard[] }`. The watch reads only on matching URLs. |

| `ContextHandle` member | Signature |
| --- | --- |
| State | `id`, `state`, `subscribe(listener)`, `navigation`, `onNavigated(listener)` |
| Navigation | `navigate(url, { mode? })`, `back(steps?)`, `forward()`, `reload()` |
| Reads | `info()`, `read(spec)`, `inspect(target)`, `wait(condition, timeoutMs)`, `scroll(to, { target? })` |
| Inputs | `click(target, { gesture?, count? })`, `longPress(target, { ms? })`, `hover(target)`, `unhover()`, `focus(target)`, `blur(target)`, `fill(target, value)`, `type(target, text)`, `press(key, { target?, modifiers? })`, `select(target, { values?, labels? })`, `check(target, checked)`, `submit(target)`, `attachFiles(target, files, { via? })` |
| Sequences | `run(steps, { until?, navigates?, expect?, deadlineMs? })`, `invoke(command, args?, { target?, expect?, navigates?, timeoutMs? })` |
| Pending | `pending(target?)`, `subscribePending(listener)`, `cancel()` |
| Watches | `watch(id, spec, { when? })`, `resync()`, `forget({ current?, keepInputs? })` |
| Dialogs | `dialog`, `onDialog(handler)`; see [Website dialogs](#website-dialogs) |
| Grants | `allow(grant): Promise<GrantResult>`, `onGrantEnded(listener)`; see [User actions](#user-actions) |
| Raw | `call(op, args?, options?)` sends one page agent operation as is. |

`resync()` asks every open watch of the context for a fresh snapshot. `forget()` drops the copies the watches kept of earlier history entries, so none shows after the account changed; with `current: true` it also clears the data shown now. It settles the context's pending inputs as `unknown` with `CONTEXT_REPLACED`, unless `keepInputs` is true. The router calls both when the account changes.

A closed watch keeps its copies: the context keeps up to 32 closed watches, dropping the one closed longest ago. Opening the same id with the same specification again shows the kept data at once, marked `stale` with `status: "loading"`, until the page sends a snapshot.

Inputs resolve to an `ActionResult` and never reject for a page failure. Reads reject with a `GenesisError`. Only `click` (a single tap), `hover`, `unhover`, `type` and `press` take `input: "trusted"`. It needs `limits.trustedInput`, and a context whose website is shown refuses it with `INPUT_UNAVAILABLE`. Input calls spend the context's input budget (`limits.inputBurst`, `limits.inputRefillMs`); one over it is `failed` with `RATE_LIMITED` and never reaches the page.

```ts
import { connect, css, field } from "@genesis/sdk";

const genesis = await connect();
const context = genesis.context("primary");
const stories = context.watch<unknown, { title: string; link: string }>("stories", {
  list: css("tr.athing"),
  key: field.attr("id"),
  fields: { title: field.text(".titleline > a"), link: field.url(".titleline > a") },
});
stories.subscribe(() => {
  const { order, records } = stories.get();
  console.log(order.map(key => records[key]?.title));
});
const result = await context.click(css("a.morelink"), { navigates: true });
if (result.outcome !== "observed") console.warn(result.code, result.message);
```

### Watch values

| Export | Signature | Purpose |
| --- | --- | --- |
| `WatchValue` | interface | `{ status, idle, stale, value, order, records, error, truncated, complete, view }`. `value` holds a `one` or `value` read, and `order` and `records` hold a list. `complete` is `false` while a list's "more" link is present. |
| `createWatchStore` | `createWatchStore({ historyEntriesMax }): WatchStore` | The client side of one watch stream. `ContextHandle.watch` uses it, and a custom transport or test can too. |
| `WatchStore` | interface | `get`, `subscribe`, `emit`, `navigated`, `gone` and the other entry points of a stream. |
| `EmitResult` | `"applied" \| "ignored" \| "resync"` | What `WatchStore.emit` did with a message. |
| `emptyWatchValue` | `emptyWatchValue(): WatchValue` | The `loading` value before the first snapshot. |

### Locators and fields

The builders return the plain objects the protocol uses, so a locator written by hand and one built here are the same.

| Export | Signature | Builds |
| --- | --- | --- |
| `css` | `css(selector, options?)` | `{ css }` |
| `role` | `role(name, accessibleName?, options?)` | `{ role, name? }` |
| `text` | `text(value, options?)` | `{ text }`. Add `{ exact: true }` to match the whole text. |
| `record` | `record(watchId, key, selector?)` | The element of one record of an open list watch, optionally narrowed by `selector`. |
| `field` | `field.text`, `ownText`, `exists`, `count`, `number`, `url`, `value`, `checked`, `visible`, `rect`, each `(at?, options?)`, and `field.attr(name, at?, options?)` | One field of a read specification. `at` is a CSS selector relative to the record. |

A locator's `options` take the other locator fields `within`, `has`, `nth`, `frame`, `pierce`, `strict` and `exact`. A field's `options` take `all`, `fields` and `max`.

### Website

| Export | Purpose |
| --- | --- |
| `Website` | `genesis.website`, with `state`, `show(contextId)`, `hide()`, `subscribe(listener)` and `on(event, listener)`. |
| `WebsiteState` | `{ shown: string \| null }`, the context whose website is on screen. |

`on` takes `viewWebsite` (View website in the menu), `done` (Done on the website bar) and `showContext` (a link from outside opened in a context). The listener gets the context id, or `null` for `viewWebsite` when the user chose it while the UI was shown: the UI then picks the context to show. Without a listener the client shows the website for `viewWebsite` (the first context for `null`) and `showContext`, and hides it for `done`. The router helper listens to all three, and shows its active context for `null`.

### Storage and services

| Export | Purpose |
| --- | --- |
| `Storage` | `get(collection, key)`, `list(collection, { afterKey?, limit? })`, `commit(batch)` and `onChanged(listener)`. The host implements it, and an applet may implement it over its own backend. |
| `StorageBatch` | `{ checks?, puts?, deletes? }`. A check with `expectedRevision: null` requires the document to be absent. |
| `StorageKey` | `{ collection, key }`. |
| `StorageChange` | `{ changes, namespaceRevision }`, given to `onChanged`. |
| `StoredDocument` | `{ key, value, revision, updatedAtMs }`. |
| `Services` | `genesis.services`, with `request(serviceId, path, { method?, body? })`. |
| `ServiceResponse` | `{ status, body }`. HTTP error statuses arrive as responses. |
| `SavedState` | `{ router?, app? }`, as `genesis.save` takes it. |
| `Notifications` | `genesis.notifications`, with `post(input: NotificationInput): Promise<NotificationResult>`. |
| `NotificationInput` | `{ id, title, body?, url? }`. |
| `NotificationResult` | `{ posted: true }`. |
| `Files` | `genesis.files`, with `pick(options?: FilesPick): Promise<PickedFile[]>` and `release(ids): Promise<void>`. |
| `FilesPick` | `{ accept?, multiple? }`. |
| `FileHandle` | `{ id, name, type, size }` of a picked file. |
| `PickedFile` | `FileHandle & { previewUrl }`. |
| `previewUrl` | `previewUrl(id): string`, the URL the applet UI shows a picked file at. |
| `Downloads` | `genesis.downloads`, with `save(input: DownloadSave): Promise<void>`. |
| `DownloadSave` | `{ context, url, filename? }`. |
| `ShareInput` | `{ title?, text?, url? }`, as `genesis.share` takes it. |
| `Links` | `genesis.links`, with `openExternal(url): Promise<void>`. |
| `AttachVia` | `"input" \| "drop" \| "paste"`, how `attachFiles` hands files to the page. |

### Errors

| Export | Purpose |
| --- | --- |
| `GenesisError` | An `Error` with a `code` from `ErrorCode`. |
| `ServiceError` | A service request the shell could not complete, with `CONFIGURATION_REQUIRED`, `AUTHENTICATION_FAILED`, `CERTIFICATE_FAILED`, `SERVICE_UNREACHABLE`, `DEADLINE` or `SERVICE_FAILURE`. |
| `serviceMessage` | `serviceMessage(error): string` turns a service error into a sentence for people. |

### Shared types

These come from `@genesis/core` and describe what the calls send and answer.

| Type | Meaning |
| --- | --- |
| `ActionResult` | `{ outcome, code?, message?, completedSteps?, partial?, reason?, noop?, exhausted? }`, how an input ended. |
| `ActionOutcome` | `observed`, `failed`, `cancelled` or `unknown`. |
| `CallDetails` | How far a failed page call got (`dispatched`, `navigating`, `completedSteps`, `reason`). |
| `ElementState` | `attached`, `visible`, `hidden` or `detached`, for `wait` and evidence. |
| `ErrorBody` | `{ code, message, details? }`, the error a watch or call reports. |
| `ErrorCode` | Every error code (see [errors and limits](#errors-and-limits)). |
| `Evidence` | `{ target, state }` or `{ read }`, which shows an input took effect. |
| `Field`, `Fields` | A field of a read specification, and a record of them. |
| `InspectResult` | `{ count, first? }`, the value of `inspect`. |
| `Limits` | The host's limits, as `genesis.limits` holds them. |
| `ListValue` | `{ order, records, truncated? }`, the value of a list `read`. |
| `Locator` | How the agent finds elements. |
| `Manifest` | The bundled `applet.json`. |
| `NavigateMode` | `push` or `replace`. |
| `PageInfo` | The value of `info`, with the URL, title, ready state, view, scroll and viewport. |
| `PageOp` | The names of the page agent operations. |
| `ReadSpec` | `{ one, fields }`, `{ list, key, fields }` or `{ reader, args? }`. |
| `ScrollPosition`, `ScrollTo` | The value and the target of `scroll`. |
| `Step` | One step of `run`, or of a command's steps. |
| `UrlGuard` | `{ pattern, query? }`, a URL with the pattern syntax of routes. |
| `ViewId` | The logical page a watch value was read from. |

## `@genesis/sdk/page`

| Export | Signature | Purpose |
| --- | --- | --- |
| `definePageModule` | `definePageModule({ readers?, commands? }): PageModule` | Checks the module's shape and marks it. The module file default-exports its result. |
| `list` | `list(options: ListOptions): ListReader` | A keyed list reader. |
| `one` | `one(options: OneOptions): OneReader` | A single-record reader. |
| `value` | `value(read: (doc, args?) => T, options?: ValueOptions): ValueReader` | A reader of any JSON value from the document. |
| `startAgent` | `startAgent(module?: PageModule): void` | Starts the page agent. The generated page script calls it, and applet code does not. |
| `ListOptions` | `{ root, items, key, read, extent?, more?, virtualized?, dependsOn?, fields?, measure? }` | Options of `list`. |
| `OneOptions` | `{ root, read, dependsOn?, fields?, measure? }` | Options of `one`. |
| `ValueOptions` | `{ root?, dependsOn?, fields?, measure? }` | Options of `value`. |
| `ListReader`, `OneReader`, `ValueReader`, `Reader` | types | What the three builders return, and their union. |
| `Command` | `(context: CommandContext, args) => unknown` | A command. |
| `CommandContext` | `{ document, url, element, args }` | What a command receives. `element` is the call's `target`, or `null`. |
| `CommandSteps` | `{ steps, until?, navigates?, deadlineMs? }` | Steps a command returns for the agent to run. |
| `PageModuleDefinition`, `PageModule` | types | The argument and the result of `definePageModule`. |
| `Evidence`, `Locator`, `Step`, `ReadSpec`, `UrlGuard` | types | The shared types a module uses in its steps. |

The [page modules guide](page-modules.md) has the rules and examples.

## `@genesis/sdk/router`

The router helper keeps the Genesis presentation rules in code. Per context it decides whether the applet or the website shows, keeps overlay screens, orders Back and reports each route's status. It is optional. Without it the UI decides with `genesis.website` and `genesis.onBack`. See [navigation](navigation.md) and [presentation](presentation.md).

| Export | Signature | Purpose |
| --- | --- | --- |
| `createRouter` | `createRouter(genesis: Genesis, options: RouterOptions): Router` | Starts the router over a connected client. |
| `RouterOptions` | `{ routes, screens?, account?, decide? }` | The route table, the overlay screen ids, how to tell the signed-in state (`{ signedIn: ReadSpec, signInUrl?(url) }`), and an optional replacement for the presentation rules. |
| `RouterRoute` | `{ id, pattern, query?, screen?, context?, ready?, requiresAccount?, website?, onError? }` | One route. The first route whose pattern and query keys match a URL wins. `ready` is a read whose truthy value means the page is ready. `screen` defaults to the route id. |
| `Router` | interface | `state`, `version`, `subscribe`, `screen()`, `status(contextId?)`, `presentation(contextId?)`, `revealed()`, `navigate`, `select`, `back`, `reload`, `viewWebsite`, `done`, `setLeaveGuard`, `onConfirmLeave`, `onScrollToTop`, `onDone` and `destroy`. |
| `NavigateTarget` | `{ url, context?, mode? }` or `{ screen, params?, mode? }` | A website URL in a context, or an overlay screen (`push`, `replace` or `root`). |
| `CurrentScreen` | `{ key, id, params, context, overlay }` | The screen to render. |
| `RouteStatus` | `{ status, routeId, params, stale, error, signedIn, url }` | A context's route status, one of `loading`, `ready`, `error`, `auth` or `unsupported`. |
| `CoordinatorState` | `{ active, overlay, contexts, leaveGuard }` | `router.state`. |
| `RouterContextState` | type | One context in `router.state.contexts` (the core `ContextState`). |
| `Presentation` | `"custom" \| "website"` | What a context shows. |
| `Screen` | `{ key, id, params }` | An overlay screen in `router.state.overlay`. |
| `TableRoute` | type | A route as the coordinator reads it, the second parameter of `decide`. |

```ts
import { connect } from "@genesis/sdk";
import { createRouter } from "@genesis/sdk/router";

const genesis = await connect();
const router = createRouter(genesis, {
  routes: [
    { id: "home", pattern: "/", screen: "feed", context: "primary", ready: { reader: "ready.hn" } },
    { id: "item", pattern: "/item", query: ["id"], screen: "item", ready: { reader: "ready.hn" } },
  ],
  screens: ["saved"],
  account: { signedIn: { reader: "account" } },
});
router.subscribe(() => console.log(router.screen()?.id, router.status().status));
```

## `@genesis/sdk/react`

| Export | Signature | Purpose |
| --- | --- | --- |
| `mount` | `mount(element, options?: MountOptions): Promise<{ genesis, router }>` | Connects, renders into `#root`, reports the first layout after two animation frames, and unmounts when Genesis retires the UI. |
| `MountOptions` | `ConnectOptions & { container?, router?: RouterOptions }` | With `router`, `mount` creates the router helper. |
| `GenesisProvider` | `<GenesisProvider genesis router?>` | Provides a client you connected yourself. |
| `useGenesis` | `useGenesis(): Genesis` | The connected client. |
| `useContextState` | `useContextState(contextId?): ContextState` | A context's state. |
| `useWatch` | `useWatch(id, spec, { when?, context? }): WatchValue` | Opens a watch while the component is mounted. An equal `id` and specification share one watch. |
| `useRecord` | `useRecord(watchId, key, contextId?)` | One record of a list watch that a `useWatch` in the same provider has open. It re-renders only when that record changes. |
| `useCommand` | `useCommand(name, contextId?)` | Returns `(args?, options?: CommandOptions) => Promise<ActionResult & { value? }>` for a page module command. The promise never rejects. |
| `CommandOptions` | `{ target?, expect?, navigates?, timeoutMs? }` | Options of a command call. |
| `usePending` | `usePending(target?, contextId?): PendingInput[]` | Inputs that have not settled, for optimistic display. |
| `useRouter` | `useRouter(): RouterView` | The router helper's state and methods. Throws without a router. |
| `RouterView` | `{ active, screen, revealed, status, presentation, state, navigate, back, select, reload, viewWebsite, done, setLeaveGuard, onConfirmLeave }` | What `useRouter` returns. |
| `useRecords` | `useRecords(collection, { storage? })` | `{ records, loading, error, put, remove, commit }` over every document of a collection. |
| `useService` | `useService(serviceId)` | `request(path, { method?, body? })` for a declared service. |
| `useNotifications` | `useNotifications(): Notifications` | `genesis.notifications`. |
| `useFilePicker` | `useFilePicker(): { files, pick, remove, clear }` | Picked files held while the component is mounted, released when it unmounts. `pick(options?)` adds to `files` with `multiple` and replaces them without. |
| `useDialog` | `useDialog(contextId?): Dialog \| null` | The open dialog of a hidden context's page, the active context by default. Using it claims the context's dialogs. |
| `useGrant` | `useGrant(contextId?): { grant, allow(kind) }` | One-time grants of a context, the active context by default: `grant` is the `GrantKind` the hidden page may use now, or `null` once it ended. |
| `WebsiteDialog` | `<WebsiteDialog dialog {...divProps}>` | An unstyled, accessible `alertdialog` that answers a `Dialog` with the user's choice. |
| `useScrollMemory` | `useScrollMemory()` | A ref callback that keeps a scroll container's position per screen. |
| `ScrollMemory` | `<ScrollMemory {...divProps}>` | A `div` with `useScrollMemory`. |
| `useAppResume` | `useAppResume(callback)` | Runs on resume from the background and, with the router, after Done on the website. |

It also re-exports `createRouter` and the types `CurrentScreen`, `NavigateTarget`, `Router`, `RouterOptions`, `RouterRoute`, `RouteStatus`, `ContextHandle`, `ContextState`, `Expect`, `PendingInput`, `Watch`, `WatchOptions`, `Genesis` and `WatchValue`. Hooks that take `contextId` use the router's active context by default, or the first context without a router.

```tsx
import { mount, useCommand, usePending, useRouter, useWatch } from "@genesis/sdk/react";

const HOME = [{ pattern: "/" }];

function Feed() {
  const stories = useWatch<unknown, { title: string }>("stories", { reader: "stories" }, { when: HOME });
  const loadMore = useCommand("loadMore");
  const loading = usePending().length > 0;
  const { navigate } = useRouter();
  return <main>
    {stories.order.map(key => <button type="button" key={key}
      onClick={() => navigate({ url: `https://news.ycombinator.com/item?id=${key}` })}>{stories.records[key]?.title}</button>)}
    <button type="button" disabled={loading} onClick={() => void loadMore()}>More</button>
  </main>;
}

void mount(<Feed />, { router: { routes: [{ id: "home", pattern: "/", screen: "feed" }] } });
```

### `useRecords`

```tsx
const { records, put, remove } = useRecords<Bookmark>("bookmarks");
await put(item.id, { title: item.title, savedAt: Date.now() });
```

Every write is checked against a revision and fails with `CONFLICT` when the document changed since it was read. `put(key, value)` and `remove(key)` check against the revision the hook last loaded. `put(key, value, expectedRevision)` checks against the one given, where `null` means the document must not exist yet. `commit(batch)` sends a batch as it is, so it must carry a check for each document it changes. Each document is at most 32 KiB of JSON.

### `useService`

```tsx
const request = useService("bookmarks");
const response = await request<{ documents: Doc[] }>("/v1/documents", { method: "POST", body: { ids } });
if (response.status !== 200) throw new Error("The bookmarks service refused the request");
```

The shell adds the credential. A request it could not complete throws `ServiceError`. Show `serviceMessage(error)` for it.

### Notifications

```ts
await genesis.notifications.post({ id: `reply-${reply.id}`, title: "New reply", body: reply.text, url: `https://example.com/item?id=${reply.id}` });
```

In React, `useNotifications()` returns the same object. It notifies the user under the applet's name, when the manifest declares `capabilities.notifications`; otherwise it throws `CONFIGURATION_REQUIRED`. `id` is 1 to 64 letters, digits, `.`, `_` or `-`, and a later notification with the same id replaces the earlier one. `title` is 1 to 120 characters and `body` at most 500. `url` is optional, `https` on one of the applet's origins, and opens in the applet when the user taps the notification; without it the tap opens the applet where it was. Anything else throws `INVALID_ARGUMENT`. The result `{ posted: true }` means Genesis accepted the request: it shows only if the user turned the applet's notifications on in Applet info, which is off by default.

### Website dialogs

```tsx
const dialog = useDialog();
return <WebsiteDialog dialog={dialog} className="sheet" />;
```

A hidden context's page can open a JavaScript `alert`, `confirm` or `prompt`, or a `beforeunload` question; the page waits until it is answered. While at least one `context.onDialog(handler)` is registered, or a component uses `useDialog(contextId?)`, the client claims each dialog of that context at once and passes it on as a `Dialog`: `{ context, kind, message, defaultValue?, origin, answer(accept, value?), closed }`. `context.dialog` is the open one, or `null`. `kind` is `alert`, `confirm`, `prompt` or `beforeunload`; `message` and `defaultValue` are the site's text, cut to 2000 characters; `origin` is the page's origin. `answer(true)` is OK, `answer(false)` is Cancel, and only a prompt takes a `value`, at most 2000 characters. `closed` resolves once the dialog was answered or closed because its page navigated or went away. Answer only with the user's choice.

`WebsiteDialog` renders a plain, unstyled `alertdialog` with the origin, the exact message, a field for a prompt, Cancel (not for an alert) and OK. Style it through `className` and the other props, or build the applet's own sheet from `useDialog`. An applet that claims no dialog within about a second sees the website revealed with the dialog over it, followed by `user.showContext`; the user answers it there.

### User actions

```tsx
const { files, pick, clear } = useFilePicker();
const context = useGenesis().context("primary");
return <>
  <button type="button" onClick={() => void pick({ accept: ["image/*"], multiple: true })}>Add photos</button>
  {files.map(file => <img key={file.id} src={file.previewUrl} alt={file.name} />)}
  <button type="button" onClick={async () => {
    const result = await context.attachFiles(css("input[type=file]"), files);
    if (result.outcome !== "failed") clear();
  }}>Attach</button>
</>;
```

`files.pick`, `downloads.save`, `share`, `links.openExternal` and `notifications.enable` are things only the user may start. Each runs only within 3 seconds of a tap on the applet UI, once per tap, so call it straight from the tap's handler. Otherwise it rejects with `USER_ACTION_REQUIRED`; ask the user to tap again. They need `limits.userActions`, and reject with `UNKNOWN_METHOD` without it. Each waits as long as the user stays in a picker or prompt, up to 10 minutes. One tap starts one of them. [Website features](website-features.md) gives a React recipe for each feature: a composer with attachments, saving, sharing, fullscreen video, other apps, sign-in windows, dialogs and location.

- `files.pick({ accept?, multiple? })` opens Android's photo picker for image and video types and the document picker for others. `accept` holds up to 16 MIME types (`image/*`) or `.ext` suffixes. It resolves with up to 16 files of at most 64 MiB each, or none when the user cancels. A file's `id` stays valid until `files.release(ids)`, until the UI is retired or the applet's window closes, or for 30 minutes. `previewUrl` shows the file in the applet UI, for example as an `<img>` or `<video>` source; website pages cannot load it. The bytes stay with Genesis: never put an `id` in storage. An `<input type="file">` in the applet UI opens no picker, and `genesis-applet build` warns about one.
- `context.attachFiles(target, files, { via? })` gives picked files, by id or as `PickedFile`s, to a hidden page (see the [page control guide](page-control.md#attaching-files)).
- `downloads.save({ context, url, filename? })` saves an https URL with the cookies of the context's website, or a `data:` URL up to 2 MiB, to Downloads.
- `share({ title?, text?, url? })` opens Android's share sheet.
- `links.openExternal(url)` opens a `mailto`, `tel`, `sms`, `smsto`, `geo`, `intent` or `https` URL in another app. An `https` URL opens only in an app that is not a browser, and rejects with `NOT_FOUND` when none takes it.
- `notifications.enable()` asks Android for permission to notify when needed and turns the applet's notifications on; it resolves with whether they are on.
- `context.allow(grant)` lets the context's hidden page use one website feature once within 5 seconds: `fullscreen`, `download`, `window`, `handoff` or `location`. It resolves with `{ granted: true, expiresInMs }`, where `expiresInMs` is 0 for a revealed context, which needs no grant. `context.onGrantEnded(listener)` hears `{ id, grant, used }` when the grant is used, expires or is cleared by a navigation, a reveal, a cover or a window. It needs `limits.grants` and rejects with `UNKNOWN_METHOD` without it. See [One-time grants](interactions.md#one-time-grants).

## Errors and limits

`ErrorCode` is one of `RETIRED`, `CONFLICT`, `NOT_FOUND`, `DOCUMENT_TOO_LARGE`, `STORAGE_FAILURE`, `ORIGIN_NOT_DECLARED`, `MESSAGE_TOO_LARGE`, `PAGE_TOO_LARGE`, `PATCH_TOO_LARGE`, `DEADLINE`, `INVALID_STEPS`, `SERVICE_UNREACHABLE`, `SERVICE_FAILURE`, `AUTHENTICATION_FAILED`, `CERTIFICATE_FAILED`, `CONFIGURATION_REQUIRED`, `NOT_READY`, `UNKNOWN_METHOD`, `INVALID_ARGUMENT`, `QUOTA_EXCEEDED`, `PROTOCOL_MISMATCH`, `APPLET_INCOMPATIBLE`, `ENVELOPE_INVALID`, `CONTEXT_REPLACED`, `TARGET_NOT_FOUND`, `PRECONDITION_FAILED`, `ASYNC_READ`, `AUTH_REQUIRED`, `REJECTED`, `NOT_ACTIONABLE`, `AMBIGUOUS_TARGET`, `PROTECTED_FIELD`, `INPUT_UNAVAILABLE`, `UNKNOWN_OPERATION`, `USER_ACTION_REQUIRED`, `FILE_UNAVAILABLE` and `RATE_LIMITED`. Action results carry the same codes in `code`. The [protocol guide](protocol.md) says when each one occurs.

`genesis.limits` holds most of the values below at run time. Read them from there rather than copying the numbers.

| Limit | `Limits` field | Value |
| --- | --- | --- |
| Contexts per applet | | 3 |
| Watch snapshot | `pageMaxBytes` | 192 KiB of JSON |
| One watch update | `patchMaxBytes`, `patchRecordsMax` | 64 KiB and 200 records |
| List read | | 5 times `patchRecordsMax` records, then `truncated` |
| Open watches per page | `watchesMax` | 32 |
| Stored document | `storedDocumentMaxBytes` | 32 KiB of JSON |
| Message between a document and the host | `messageMaxBytes` | 256 KiB |
| Request deadline | `rpcDeadlineMs` | 15 s |
| Input or sequence | `actionTimeoutMs` | 15 s |
| Route ready deadline | `documentReadyMs` | 15 s, after which the router shows the website for a page still loading |
| Back answer | `backAnswerMs` | 300 ms, after which the shell leaves the applet |
| Stale copies kept for Back | `historyEntriesMax` | 16 history entries per context |
| Input calls per context | `inputBurst`, `inputRefillMs` | 20 at once, then one more per second; over it an input is `failed` with `RATE_LIMITED` |
| Trusted input | `trustedInput` | `true` where the shell can send real input |
| Website dialogs | `dialogs` | `true` where hidden pages' dialogs reach the applet; 1 s to claim one, text cut to 2000 characters |
| One-time grants | `grants` | `true` where `context.allow` works; a grant lasts 5 s and is used once |
| User actions | `userActions` | `true` where the applet UI can pick files, save, share, open links and enable notifications, and `attachFiles` works |
| Picked files | | 16 per pick of at most 64 MiB each, 128 MiB per `attachFiles`; held for at most 30 minutes |
| Service request or response body | | 256 KiB, with 3 s to connect and 3 s to read |
| Notification | | `id` 64 characters, `title` 120, `body` 500; at most 5 per background check |
| Background news check | | Every 15 to 1440 minutes, only with a network and only after the user turns notifications on |

## Compatibility

Every part checks the others before it runs:

| Value | Current |
| --- | --- |
| Manifest schema | 6 |
| Bundle format | 3 |
| Protocol | 1 |
| Page control API (`adapterApi`) | 1 |
| SDK and tools | 0.0.0 |

`check` and `build` compare `applet.json` and the `@genesis/sdk` dependency with the tools and fail with `APPLET_INCOMPATIBLE`, listing each `field applet → current`. Update the applet to the current SDK and run `check` again. A bundle records its values in `bundle.json`. Genesis refuses to open an applet built for another version and marks it in the launcher as "Needs update" or "Needs a newer Genesis". `dev install` and `dev status` report the same mismatch. `connect` rejects with `PROTOCOL_MISMATCH` when the UI was built for another protocol.
