# Protocol

This is the specification of the messages between a document and the Genesis host. A document is the applet's UI (the role `foreground`) or a website page in one of the applet's contexts (the role `context`), where the page agent runs. Everything an applet does with Genesis goes through these messages: the SDK client and the page agent are one implementation of them, and a client in another language can drive the same pages by sending the same JSON.

`packages/core/src/protocol.ts` (TypeScript) and `crates/contracts` (Rust) are the two implementations of this specification. They must agree with it and with each other. When one of them changes the wire format, this file changes in the same commit.

For how an applet uses page control through the SDK, read [page control](page-control.md). For the SDK's functions, read [the SDK reference](sdk-reference.md).

## Transport

Messages are JSON text, one object per message. In a WebView the shell installs a bridge object as `window.__genesisBridge`, with `postMessage(text)` and a `message` event that carries the host's text. The SDK's `webViewTransport()` wraps it. Any other transport gives `connect({ transport })` an object with `send(text)`, `onMessage(listener)` (which returns a function that removes the listener) and `close()`.

In a context page, the page agent captures `__genesisBridge` at document start, before any website script runs, and deletes it from the page, so website scripts cannot send messages as the agent.

The host ignores text that does not parse as a document message. It answers a request larger than `limits.messageMaxBytes` with `MESSAGE_TOO_LARGE`.

## Handshake

A document starts by sending `hello`. The host answers with `bound`, or with `refused` when the document speaks another protocol version.

```json
{ "type": "hello", "protocol": 1, "url": "https://news.ycombinator.com/" }
```

| Field | Meaning |
| --- | --- |
| `protocol` | The protocol version the document speaks, `COMPAT.protocol`. The host reads a missing value as 0. |
| `url` | The document's URL. |

```json
{
  "type": "bound",
  "protocol": 1,
  "compat": { "manifestSchema": 6, "bundleFormat": 3, "protocol": 1, "adapterApi": 1, "sessionState": 1, "importEnvelope": 1, "credentialEnvelope": 1, "cookieEnvelope": 1, "packagesIndex": 1 },
  "documentId": "d7",
  "appletId": "hn-reader",
  "revision": 3,
  "contextId": "primary",
  "role": "context",
  "generation": 2,
  "manifest": { "schemaVersion": 6, "id": "hn-reader", "...": "..." },
  "limits": { "rpcDeadlineMs": 10000, "...": "..." },
  "session": null
}
```

| Field | Meaning |
| --- | --- |
| `protocol` | The host's protocol version. |
| `compat` | Every compatibility number of this Genesis (see [Versions](#versions)). |
| `documentId` | This document's id. Every later request names it. |
| `appletId`, `revision` | The active applet and its installed revision. |
| `contextId` | The context this document runs in, or null for the foreground. |
| `role` | `foreground` or `context`. |
| `generation` | 0 for the foreground. In a context it increases each time a new document binds there. |
| `manifest` | The applet's manifest. |
| `limits` | The limits below. |
| `session` | The foreground's last `session.save` (`{ version, state }`) when Genesis recreated the applet after retiring it in the background, otherwise null. Always null for a context. |

The values in the examples are illustrations. Read limits from `bound`, never from this file.

```json
{ "type": "refused", "error": { "code": "PROTOCOL_MISMATCH", "message": "The page speaks protocol 2; this Genesis speaks 1" } }
```

No `bound` follows `refused`. When a context document is refused, the foreground also receives `context.gone` with the code `PROTOCOL_MISMATCH`.

A `hello` from a context page whose context is not in the manifest gets no answer. A new document in a view replaces the view's previous document: the old one receives `retired`, and its open page calls end (see [Call lifecycle](#call-lifecycle)).

When a foreground document binds, the host sends `reset` to every bound context document, because the new foreground knows none of the old one's calls and watches. It then sends the new foreground `context.bound` for each of those documents.

## Requests, responses and events

A document sends requests; the host answers each with one response. The host also sends events, which have no answer.

```json
{ "type": "request", "documentId": "d4", "requestId": 12, "method": "storage.get", "params": { "collection": "saved", "key": "42" } }
```

```json
{ "type": "response", "documentId": "d4", "requestId": 12, "result": { "document": null, "namespaceRevision": 7 } }
```

```json
{ "type": "response", "documentId": "d4", "requestId": 13, "error": { "code": "NOT_FOUND", "message": "Unknown context feed" } }
```

```json
{ "type": "event", "documentId": "d4", "name": "context.navigated", "data": { "id": "primary", "url": "https://news.ycombinator.com/newest", "generation": 3, "index": 1, "size": 2, "canGoBack": true, "canGoForward": false, "sameDocument": false, "reload": false } }
```

| Rule | Detail |
| --- | --- |
| Request ids | A number the document chooses, unique among its open requests. The response carries the same `requestId`. |
| Document id | A request whose `documentId` is not the view's current document is ignored, so a retired document gets no answers. |
| Params | `null` params are read as `{}`. Params that do not match the method's shape answer `INVALID_ARGUMENT`. |
| Response | Has `result` on success and `error` on failure, never both. |
| Roles | A method of the other role answers `INVALID_ARGUMENT` ("not available to this document"). A name that is no method answers `UNKNOWN_METHOD`. |
| No applet | A request while no applet is active answers `RETIRED`. |

An error is an `ErrorBody`:

```json
{ "code": "CONTEXT_REPLACED", "message": "The page changed before the call finished", "details": { "dispatched": true, "navigating": true, "completedSteps": 1 } }
```

`details` appears on failed page calls and says how far the call got: `dispatched` (input left the page agent), `navigating` (the input started a navigation), `completedSteps`, and `reason`, a short word such as `hidden`, `covered` or `cross-origin-frame`.

## Foreground methods

Params and results use the field names shown.

| Method | Params | Result |
| --- | --- | --- |
| `ui.ready` | `{}` | `{}`. The first call shows the foreground. |
| `storage.get` | `{ collection, key }` | `{ document, namespaceRevision }`. `document` is `{ key, value, revision, updatedAtMs }` or null. |
| `storage.list` | `{ collection, afterKey?, limit? }` | `{ entries, nextAfterKey, namespaceRevision }`. `limit` defaults to 100. `nextAfterKey` is null on the last page. |
| `storage.commit` | `{ checks, puts, deletes }` | `{ namespaceRevision }` |
| `services.request` | `{ serviceId, path, method, body? }` | `{ status, body }`. An HTTP error status is a result, not an error. |
| `context.navigate` | `{ id, url, mode? }` | `{}`. `mode` is `push` (default) or `replace`. |
| `context.back` | `{ id, steps? }` | `{}`. `steps` defaults to 1. |
| `context.forward` | `{ id }` | `{}` |
| `context.reload` | `{ id }` | `{}` |
| `context.reveal` | `{ id }` | `{}`. Shows the context's website above the foreground. |
| `context.cover` | `{}` | `{}`. Covers the revealed website with the foreground again. |
| `session.save` | `{ version, state }` | `{}`. `version` must equal `COMPAT.sessionState`. |
| `back.handled` | `{ handled }` | `{}`. The answer to a `back` event. |
| `back.leave` | `{}` | `{}`. Leaves the applet. |
| `page.call` | `{ context, generation, op, args, timeoutMs? }` | The operation's value (see [Page operations](#page-operations)). |
| `page.cancel` | `{ context, callId? }` | `{}` |
| `context.dialog.claim` | `{ id, dialogId }` | `{}`. The foreground shows the dialog itself (see [Website dialogs](#website-dialogs)). |
| `context.dialog.answer` | `{ id, dialogId, accept, value? }` | `{}`. The user's answer: OK when `accept`, else Cancel. |

Rules the host applies:

- Storage needs `capabilities.storage` in the manifest, else `CONFIGURATION_REQUIRED`. In `storage.commit`, `checks` are `{ collection, key, expectedRevision }` (null expects no document), `puts` are `{ collection, key, value }` and `deletes` are `{ collection, key }`. A failed check is `CONFLICT`; a value over `limits.storedDocumentMaxBytes` is `DOCUMENT_TOO_LARGE`.
- Storage and service requests answer `QUOTA_EXCEEDED` while `limits.pendingRequestsMax` of them are open.
- The `context.*` methods answer `NOT_FOUND` for an id that is not a context of the manifest.
- `context.navigate` needs an `http` or `https` URL with a host and no user name or password, else `INVALID_ARGUMENT`. A URL outside the manifest's origins loads too, and shows as the website, because no page agent runs there.
- After a `back` event, `back.handled` with `handled: false` steps back in the revealed context's history, or leaves the applet when there is none. With no answer within `limits.backAnswerMs`, the host steps back in the first context, in manifest order, that has history, or leaves. A second Back while the host waits is ignored.

## Context methods

Only a context document sends these, and only about calls the host gave it.

| Method | Params | Result |
| --- | --- | --- |
| `page.result` | `{ callId, ok, value?, error? }` | `{}`. Answers one call. |
| `page.progress` | `{ callId, state, completedSteps? }` | `{}`. `state` is `dispatched` or `navigating`. |
| `page.emit` | `{ stream, kind, seq, view, url, data }` | `{}`. One message of a watch stream. |
| `page.input` | `{ callId, events }` | `{}` once the shell dispatched the events. |

- `page.result` and `page.progress` about a call that is not this document's, or that has already ended, are accepted and ignored. `page.result` with `ok: false` and no `error` ends the call with `INVALID_ARGUMENT`. The page agent checks a value before it answers: a value that is not JSON data (a BigInt, a cycle) answers `INVALID_ARGUMENT`, and one over `limits.pageMaxBytes` answers `PAGE_TOO_LARGE`.
- `page.progress` marks the call `dispatched`, and `navigating` when that is the state. The host forwards it to the foreground as the event `page.progress`.
- `page.emit` answers `PAGE_TOO_LARGE` for a snapshot whose `data` is over `limits.pageMaxBytes`, and `PATCH_TOO_LARGE` for a patch over `limits.patchMaxBytes` or with more than `limits.patchRecordsMax` upserts. The host adds `context` and `generation` and forwards it as the event `page.emit`.
- `page.input` carries 1 to 64 real input events for one of the document's open calls (see [Trusted input](#trusted-input)).

## Events

Events the foreground receives:

| Event | Data |
| --- | --- |
| `resumed` | `{}`. The applet came back to the foreground. |
| `suspended` | `{}`. The applet is going to the background. |
| `storage.changed` | `{ changes, namespaceRevision }`. `changes` lists `{ collection, key }`. |
| `context.navigated` | `{ id, url, generation, index, size, canGoBack, canGoForward, sameDocument, reload }`. Sent for every committed navigation. `index` and `size` describe the context's back-forward list. |
| `context.started` | `{ id, url }`. A navigation started. |
| `context.bound` | `{ id, generation, url }`. A page agent in the context accepts calls. |
| `context.gone` | `{ id, code, message }`. The context's document is gone without a replacement, for example `NOT_READY` when a page on a declared origin did not bind within `limits.documentReadyMs`. |
| `user.viewWebsite` | `{ id }`. The user chose View website in the Genesis menu. `id` is the revealed context, or null when none is revealed (the foreground then picks its active context). |
| `user.done` | `{ id }`. The user tapped Done on the website bar. `id` is the revealed context or null. |
| `user.showContext` | `{ id }`. A link opened the applet in this context, or Genesis revealed it for an unclaimed dialog; show it. |
| `context.dialog` | `{ id, dialogId, kind, message, defaultValue?, origin }`. A hidden context's page opened a JavaScript dialog (see [Website dialogs](#website-dialogs)). |
| `context.dialogClosed` | `{ id, dialogId }`. The dialog ended without the foreground's answer. |
| `back` | `{}`. The user pressed Back; answer with `back.handled` or `back.leave`. |
| `retired` | `{}`. The document will get no more answers. |
| `page.emit` | `{ context, generation, stream, kind, seq, view, url, data }` |
| `page.progress` | `{ context, callId, state, completedSteps? }` |

Events a context document receives:

| Event | Data |
| --- | --- |
| `call` | `{ callId, op, args, deadlineMs }`. Run one page operation and answer with `page.result`. |
| `cancel` | `{ callId? }`. Cancel that call, or every call when `callId` is absent. |
| `reset` | `{}`. A new foreground bound: close every watch and cancel every call. |
| `retired` | `{}`. Stop: the document is replaced or the applet is closing. |

```json
{ "type": "event", "documentId": "d7", "name": "call", "data": { "callId": "c14", "op": "read", "args": { "spec": { "one": { "css": "#hnmain" }, "fields": { "title": { "at": "title", "take": "text" } } } }, "deadlineMs": 10000 } }
```

## Page operations

`page.call` asks the page agent in a context to run one operation. `generation` names the document the call is for, from `context.bound`. The value of the call is the operation's value; a failure is an error response.

| Operation | Args | Value |
| --- | --- | --- |
| `info` | `{}` | `{ url, title, readyState, view, scroll: { x, y, maxX, maxY }, viewport: { width, height } }` |
| `read` | `{ spec }` | The read's value (see [Read specifications](#read-specifications)). |
| `inspect` | `{ target }` | `{ count, first? }`. `first` is `{ tag, text, visible, enabled, checked?, focused, rect }`, with `text` cut to 200 characters. A target not on the page is `{ count: 0 }`. |
| `watch.open` | `{ id, spec, when? }` | `{}`. Starts a watch stream named `id`. |
| `watch.close` | `{ id }` | `{}` |
| `watch.resync` | `{ id? }` | `{}`. Sends a fresh snapshot of that watch, or of every watch. |
| `wait` | `{ for, timeoutMs }` | `{}` once the condition holds; `DEADLINE` when it does not in time. |
| `click` | `{ target, gesture?, count?, ...options }` | `ActionResult`. `gesture` is `click` (default), `tap` or `mouse`; `count` is 1 or 2. |
| `longPress` | `{ target, ms?, ...options }` | `ActionResult` |
| `hover` | `{ target, ...options }` | `ActionResult` |
| `unhover` | `{ ...options }` | `ActionResult` |
| `focus`, `blur` | `{ target, ...options }` | `ActionResult` |
| `fill` | `{ target, value, ...options }` | `ActionResult` |
| `type` | `{ target, text, ...options }` | `ActionResult` |
| `press` | `{ key, modifiers?, target?, ...options }` | `ActionResult` |
| `select` | `{ target, values?, labels?, ...options }` | `ActionResult` |
| `check` | `{ target, checked, ...options }` | `ActionResult` |
| `scroll` | `{ to, target? }` | `{ x, y, maxX, maxY, atEnd }`. `to` is `start`, `end`, `intoView` (needs `target`), `{ x?, y? }` or `{ by: { x?, y? } }`. |
| `submit` | `{ target, ...options }` | `ActionResult` |
| `run` | `{ steps, until?, navigates?, deadlineMs? }` | `ActionResult` |
| `invoke` | `{ command, args?, target? }` | The command's value, or an `ActionResult` |

`options` are the input options: `timeoutMs` (how long to wait for the target to be actionable, default 0), `force` (skip the actionability check), `input` (`synthetic`, the default, or `trusted`) and `until` (evidence). [Page control](page-control.md) describes what each input does in the page.

```json
{ "type": "request", "documentId": "d4", "requestId": 20, "method": "page.call", "params": { "context": "primary", "generation": 2, "op": "click", "args": { "target": { "record": { "watch": "stories", "key": "41234567" }, "css": ".votearrow" }, "timeoutMs": 2000, "until": { "target": { "record": { "watch": "stories", "key": "41234567" }, "css": ".votearrow" }, "state": "hidden" } }, "timeoutMs": 8000 } }
```

```json
{ "type": "response", "documentId": "d4", "requestId": 20, "result": { "outcome": "observed", "completedSteps": 1, "partial": false } }
```

Read operations (`info`, `read`, `inspect`, `watch.*`, `wait`) run as soon as they arrive. Input operations, `run` and `invoke` run one at a time, in arrival order. One that waited in that order while an earlier input changed the view (a same-document navigation) dispatches nothing and answers `failed` with `PRECONDITION_FAILED`, since the client chose it for the view it saw; `scroll` is exempt. An operation name the agent does not know answers `UNKNOWN_OPERATION`.

### Action results

Inputs, `run` and `invoke` with steps never fail with an error response for a problem in the page. They answer an `ActionResult`:

| Field | Meaning |
| --- | --- |
| `outcome` | `observed`: the input ran and its evidence held (or it had no evidence). `failed`: nothing took effect. `unknown`: input reached the page, but whether it took effect is not known. `cancelled`: the call was cancelled before any input. |
| `code`, `message` | Why, when the outcome is not `observed`, or why an `unknown` stayed unknown. |
| `reason` | A short word for `NOT_ACTIONABLE` and similar codes: `detached`, `hidden`, `disabled`, `covered`, `not-a-text-field`, `not-editable`, `not-a-select`, `editor-needs-trusted-input`, or `state-unchanged` (with `DEADLINE`). |
| `completedSteps` | Steps that finished. |
| `partial` | Some steps finished and the outcome is not `observed`. |
| `noop` | The wanted state already held, so no input was sent. |
| `exhausted` | Reserved for a load-more action that found the end of a list. The page agent does not set it. |

Invalid input arguments answer `{ outcome: "failed", code: "INVALID_ARGUMENT" }`. `scroll` is the exception among inputs: it answers `ScrollPosition`, and invalid arguments or a missing target are an error response.

### Steps

`run` takes a list of steps. A step is an input operation written as `{ "op": "<name>", ...args }`, a wait `{ "op": "wait", "for": <condition>, "timeoutMs": n }`, or a navigation `{ "op": "navigate", "url": "..." }`. `navigate` goes only to an `https` URL on one of the manifest's origins, and a relative URL resolves against the page; any other URL answers `failed` with `INVALID_ARGUMENT`. `navigate` and `submit` may only be the last step. The agent runs the steps inside the page with no round trip between them. `deadlineMs`, counted from the call's arrival, shortens the call's own deadline; it must be a finite number above 0.

```json
{ "op": "run", "args": { "steps": [
  { "op": "fill", "target": { "css": "textarea[name=text]" }, "value": "Nice write-up." },
  { "op": "submit", "target": { "css": "form[action=comment]" } }
] } }
```

A `wait` condition is `{ target, state }`, `{ url: UrlGuard }` or `{ read: ReadSpec }`. Evidence (`until`) is `{ target, state }` or `{ read }`. `state` is `attached`, `visible`, `hidden` or `detached`. A read condition holds when its value is truthy, and a list read when it has at least one record.

### Commands

`invoke` runs a command of the applet's page module. The value depends on what the command returns:

| The command returns | The call answers |
| --- | --- |
| A JSON value | That value (`null` for `undefined`). |
| `{ satisfied: true }` | `{ outcome: "observed", noop: true }` |
| `{ steps, until?, navigates?, deadlineMs? }` | The steps run as `run` would run them; the value is an `ActionResult`. |
| A promise | `INVALID_STEPS` |
| It throws | `INVALID_STEPS` |

A command name the module does not have answers `NOT_FOUND`.

## Call lifecycle

```
foreground          host                       context page agent
 page.call  ─────▶  checks, starts the clock
                    call ───────────────────▶  runs the operation
            ◀─────  page.progress  ◀─────────  page.progress (dispatched | navigating)
 response   ◀─────  answers the request  ◀───  page.result
```

The host checks a `page.call` in this order:

| Check | Error |
| --- | --- |
| The context exists | `NOT_FOUND` |
| The context has a bound document | `NOT_READY` |
| `generation` is not older than the bound document's | `CONTEXT_REPLACED` |
| `generation` is not newer (the next document has not bound) | `NOT_READY` |
| Fewer than `limits.pendingRequestsMax` calls are open in the context | `QUOTA_EXCEEDED` |

The call's budget is `min(timeoutMs or limits.rpcDeadlineMs, limits.actionTimeoutMs)`. The host sends it to the page as `deadlineMs`.

A call ends in one of four ways:

1. The page answers with `page.result`. The host answers the foreground's request with the value or the error.
2. The document is replaced (a cross-document navigation, a reload, the page leaving the context) before it answers. The host ends the call with `CONTEXT_REPLACED`.
3. The budget runs out. The host ends the call with `DEADLINE`. The budget does not count the time a JavaScript dialog of the context is open (see [Website dialogs](#website-dialogs)).
4. The foreground document that asked is retired. The call is dropped with no answer.

In cases 2 and 3 the error's `details` hold `dispatched`, `navigating` and `completedSteps` as the last `page.progress` reported them. This is how a client tells a call that never touched the page (`dispatched` false: safe to send again) from an input that may have taken effect (`dispatched` true: never send again without checking the page). A call with `navigating` true started a navigation, and the client judges the effect on the destination page.

The page agent reports `dispatched` before the first step that has an effect. When the steps navigate (the last step is `navigate` or `submit`, or `navigates` is true), it reports `navigating` instead and waits for the host to record it before the effect runs. A `pagehide` during an effect also reports `navigating`.

`page.cancel` sends `cancel` to the context only while one of the asking document's matching calls has not dispatched. The agent answers a cancelled call that has not started its input with `{ outcome: "cancelled" }`; a call that has already sent input runs to its end.

`reset` cancels every call and closes every watch. `retired` stops the agent without answering its calls; the host ends them as above. After a `pageshow` from the back-forward cache, the agent sends `hello` again and binds as a new document.

## Watches

A watch is a stream of `page.emit` messages that keeps the client's copy of a read up to date. The page agent observes the DOM, re-reads what changed, and sends the difference.

| Kind | Data | When |
| --- | --- | --- |
| `snapshot` | `{ status, value?, order?, records?, error?, truncated?, complete? }` | The first message, after a new view, after a resync, and whenever a patch cannot carry the change. |
| `patch` | `{ upsert?, remove?, order?, complete? }` | A list changed. `upsert` maps keys to records. |
| `status` | `{ idle?, status?, error? }` | The agent sends `{ idle: true }` when the URL stops matching the watch's `when` guards. |

```json
{ "type": "request", "documentId": "d7", "requestId": 31, "method": "page.emit", "params": { "stream": "stories", "kind": "patch", "seq": 5, "view": { "generation": 2, "n": 0, "url": "https://news.ycombinator.com/" }, "url": "https://news.ycombinator.com/", "data": { "upsert": { "41234567": { "title": "Show HN: A tiny text editor", "points": 129 } } } } }
```

```json
{ "type": "event", "documentId": "d4", "name": "page.emit", "data": { "context": "primary", "generation": 2, "stream": "stories", "kind": "snapshot", "seq": 1, "view": { "generation": 2, "n": 0, "url": "https://news.ycombinator.com/" }, "url": "https://news.ycombinator.com/", "data": { "status": "ready", "order": ["41234567"], "records": { "41234567": { "title": "Show HN: A tiny text editor", "points": 128 } } } } }
```

### Streams and views

- `seq` starts at 1 for each watch and increases by one per message. A patch applies only when its `seq` is one more than the last applied message of the same view. On a gap, the client asks for `watch.resync`.
- `view` is `{ generation, n, url }`. `n` counts the same-document navigations that changed the page's entry key (path and query), so a single-page website's route change starts a new view. On a new view every watch sends a snapshot once the DOM settles. Records belong to one view.
- Messages of an older generation or view are stale. A client drops a patch from another view and a message with a `seq` it has already applied.

### States

```
open ─▶ snapshot ─▶ patch* ─▶ snapshot (new view, resync, refused patch)
  │                      │
  └── URL fails `when` ──┴─▶ status { idle: true } ─▶ (URL matches again) ─▶ snapshot
```

- A watch with `when` reads only while the page URL matches one of its guards. When the URL stops matching, it sends one `status { idle: true }` and stops reading. When it matches again, the next message is a snapshot.
- `status` is a `PageStatus`: `loading`, `ready`, `error`, `auth` or `unsupported`. The page agent sends only `ready` and `error`; the other values are for clients.
- A read that throws makes the watch `error`: the snapshot has `status: "error"` and `error`. The next successful read sends `status: "ready"` in a snapshot.
- A read whose value is not JSON data (a BigInt, a cycle) fails `watch.open` with `INVALID_ARGUMENT`. When that happens later, the watch reports `status: "error"` with `INVALID_ARGUMENT`.
- Changes are batched: the agent sends a batch after `limits.publishQuietMs` without changes, and at least every `limits.publishMaxDelayMs`.
- The agent splits a change into patches of at most `limits.patchRecordsMax` upserts and `limits.patchMaxBytes`. Only the last patch carries `remove`, `order` and `complete`, so the client gets the new order only after every record it names. A patch the host refuses makes the next message a snapshot.
- A snapshot over `limits.pageMaxBytes` drops a quarter of a virtualized list's records farthest from those on screen until it fits. Otherwise the watch reports `status: "error"` with `PAGE_TOO_LARGE`.
- `truncated: true` means the list has more items than `limit` (or the agent's maximum, five times `limits.patchRecordsMax`) allows.
- In a `virtualized` list, records whose elements left the DOM stay in the view's list with `present: false` added to their data.
- `complete` is present for a page module list reader that names a "more" selector, and false while the "more" element is on the page.

The page agent keeps at most `limits.watchesMax` watches per document; one more answers `QUOTA_EXCEEDED`. A watch id is 1 to 64 letters, digits, `_`, `.`, `:` or `-`, starting with a letter or digit. Opening an id that is already open answers `CONFLICT`. `watch.resync` of an id that is not open answers `NOT_FOUND`. Watches end with the document: on `pagehide`, `reset` and `retired`.

## Locators

A locator is a JSON object that finds elements in the page when the operation runs.

| Key | Type | Meaning |
| --- | --- | --- |
| `css` | string | Elements matching the selector. |
| `role` | string | Elements with that ARIA role, from the `role` attribute or the tag's implicit role. |
| `name` | string | With `role`: the accessible name contains this text. |
| `text` | string | The deepest elements whose text contains this text. The text leaves out the content of `script`, `style`, `noscript` and `template` elements. With `css` or `role`, filters their matches. |
| `exact` | boolean | With `text`: the text must be equal, not contained. |
| `record` | `{ watch, key }` | The element of one record of an open list watch. With `css`, `role` or `text`, searches inside it. It cannot be combined with `within` or `frame`. |
| `within` | locator | Searches inside the first match of this locator. |
| `has` | locator | Keeps elements that contain a match of this locator. |
| `nth` | integer | Keeps the match at this index; a negative index counts from the end. |
| `frame` | locator | Enters the same-origin iframe this locator matches. |
| `pierce` | boolean | Also searches open shadow roots. |
| `strict` | boolean | More than one match is `AMBIGUOUS_TARGET`. |

Rules:

- A locator needs one of `css`, `role`, `text` or `record`. `name` needs `role`; `exact` needs `text`. Unknown keys are invalid.
- `within`, `has` and `frame` nest at most 4 levels.
- A `css` selector, and a read field's `at`, may not test the `value` attribute, in any case, with a namespace, or written with CSS escapes. Such a selector is `INVALID_ARGUMENT`, because a selector like `[value^=a]` would reveal a protected value one character at a time.
- Text comparisons collapse white space, trim and ignore case.
- Matches are in document order. `has` and `strict` apply before `nth`.
- An invalid locator is `INVALID_ARGUMENT` with the path of the bad field, such as `target.within.nth: must be an integer`.

| Failure | Code |
| --- | --- |
| Nothing matches | `NOT_FOUND` |
| A `record` key is not on the page | `TARGET_NOT_FOUND` |
| No list watch with that id is open | `NOT_FOUND` |
| `within` or `frame` finds nothing | `NOT_FOUND` |
| A cross-origin frame | `NOT_FOUND`, reason `cross-origin-frame` |
| A strict locator matches more than one element | `AMBIGUOUS_TARGET` |
| An invalid CSS selector | `INVALID_ARGUMENT` |

## Read specifications

A read specification (`ReadSpec`) says what to read. It is one of three shapes:

| Shape | Value |
| --- | --- |
| `{ one, fields, measure? }` | The fields of the first element `one` matches, or null when none does. `measure: true` reads again when the element changes size. |
| `{ list, key, fields, within?, virtualized?, limit? }` | `{ order, records, truncated?, complete? }`: every element `list` matches (inside `within` when given), keyed by the `key` field. |

A watch of the first two shapes whose fields take `value` or `checked` reads again on `input` and `change` events, because form values change without DOM mutations.
| `{ reader, args? }` | The value of the page module's reader with that name. An unknown reader is `NOT_FOUND`. |

`fields` maps names to fields. A field is `{ at?, take?, all?, fields?, max? }`:

| Key | Meaning |
| --- | --- |
| `at` | A CSS selector inside the element. Without it the field reads the element itself. With no match the field is null. |
| `take` | What to read (below). |
| `fields` | Nested fields of the element `at` finds. A field has exactly one of `take` and `fields`. |
| `all` | Reads every match of `at` into an array. |
| `max` | The longest text kept, 1 to 2000 characters (the default is 2000). |

| Take | Value |
| --- | --- |
| `text` | The rendered text with white space collapsed. |
| `ownText` | The element's own text nodes, without its children's text. |
| `number` | The first number in the text, without thousands separators, or null. |
| `url` | `href` or `src` as an absolute URL. |
| `value` | A form control's value. |
| `checked` | A checkbox, radio, or `aria-checked`, `aria-pressed` or `aria-selected` state; null when the element has none. |
| `visible` | Whether the element has a box and is not hidden by style. |
| `rect` | `{ x, y, width, height }` in CSS pixels. |
| `exists` | Whether `at` matches. |
| `count` | How many elements `at` matches. |
| `{ attr: name }` | The attribute's value, or null. |

Rules:

- Fields nest at most 4 levels.
- A list's `key` reads one value: no `all` or `fields`, and `take` is `text`, `ownText`, `url`, `value`, `number` or `{ attr }`. An empty key is `INVALID_ARGUMENT`. Two items with one key are `CONFLICT`.
- `limit` is a positive integer. The agent caps every list at five times `limits.patchRecordsMax`; past it the value has `truncated: true`.
- A read never returns the value of a protected field (see [Protected fields](#protected-fields)).
- A reader must return its value synchronously; a promise is `ASYNC_READ`.

```json
{ "list": { "css": "tr.athing" }, "key": { "take": { "attr": "id" } }, "fields": { "title": { "at": ".titleline > a", "take": "text" }, "link": { "at": ".titleline > a", "take": "url" } }, "limit": 30 }
```

### URL guards

A URL guard is `{ pattern, query? }`. `pattern` uses the route syntax: it starts with `/`, `:name` matches one path segment, a trailing `*` matches the rest, and it has at most 256 characters. `query` lists query keys that must be present. A guard matches the path of any origin. `when` and `expect` take a non-empty array of guards; a URL matches when one guard does.

## Protected fields

The agent never reads or writes the value of a password field, a hidden input, or a field whose `autocomplete` is `current-password`, `new-password`, `one-time-code` or starts with `cc-`. A read of `value`, or of the `value` attribute, gives null. `fill`, `type` and `select` on one, and `press` with such a target, are `PROTECTED_FIELD`. A selector may not test the `value` attribute (see [Locators](#locators)). A trusted `press` refuses a protected field even without a target, because the key goes to the focused element.

## Trusted input

`click`, `hover`, `unhover`, `type` and `press` accept `input: "trusted"`. The agent finds the target and its point (for an element in a same-origin frame, measured through every containing frame onto the top page), and sends `page.input` with the events for the shell to dispatch as real Android input to the hidden context's WebView. The events reach the page as trusted DOM events.

| Event | Shape | Dispatch |
| --- | --- | --- |
| `tap` | `{ type, x, y }` | A touch down and up 50 ms apart. |
| `hover` | `{ type, x, y }` | A mouse hover enter (the first time) and move. |
| `hoverExit` | `{ type }` | The mouse moves out of the view, then exits. |
| `key` | `{ type, key, modifiers? }` | Key down and up. `key` is a DOM key name. |
| `text` | `{ type, text }` | The key events that type the text. |

```json
{ "type": "request", "documentId": "d7", "requestId": 40, "method": "page.input", "params": { "callId": "c22", "events": [{ "type": "tap", "x": 187.5, "y": 412 }] } }
```

- `x` and `y` are CSS pixels of the visual viewport at scale 1: the element's client position minus `visualViewport.offsetLeft` and `offsetTop`, times `visualViewport.scale`. The shell multiplies them by the display density.
- Named keys are `Enter`, `Tab`, `Escape`, `Backspace`, `Delete`, `" "` (space), `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `PageUp` and `PageDown`; any other key is one character. Modifiers are `Shift`, `Control`, `Alt` and `Meta`. `Control` and `Meta` work only with named keys.
- The shell converts every event first and dispatches nothing when one cannot be converted: an unknown event, key or modifier, a point outside the view, text that cannot be typed as keys, or a key that would reach the clipboard (`Control` or `Meta` with a one-character key, or `Shift+Delete`). That answers `INPUT_UNAVAILABLE`.
- One `page.input` types at most 2000 characters across its `text` events; more is `INVALID_ARGUMENT`. The page agent refuses a trusted `type` of a longer text the same way, before it sends anything.
- `page.input` answers `INPUT_UNAVAILABLE` when `limits.trustedInput` is not true, and when the context is revealed: the user is looking at the website then, and applet input there would count as the user's own gesture. It answers `CONTEXT_REPLACED` when another document has already started loading in the context, `NOT_FOUND` when `callId` is not an open call of the asking document, and `DEADLINE` when the call's budget runs out first.
- A trusted `click` is one touch tap: `gesture` other than `tap`, or `count` other than 1, is `INVALID_ARGUMENT`. Any other operation with `input: "trusted"` is `INVALID_ARGUMENT`.
- A trusted tap or key gives the page user activation. A trusted hover does not.
- For 5 seconds after the last trusted input to a context's page, that page may not open a window or hand a link to another app, even once it is revealed and the user taps it. The page's user activation can outlast the input, so the shell does not count any gesture as the user's in that time.

## Website dialogs

A page's `alert`, `confirm`, `prompt` and `beforeunload` dialogs block the page until they are answered. On a revealed context, its popup and the foreground, they are WebView's own dialogs. On a hidden context, the host sends the foreground `context.dialog`:

```json
{ "type": "event", "documentId": "d3", "name": "context.dialog", "data": { "id": "main", "dialogId": 7, "kind": "confirm", "message": "Delete this item?", "origin": "https://example.com" } }
```

- `kind` is `alert`, `confirm`, `prompt` or `beforeunload`. `message` and `defaultValue` (a prompt's prefilled value) are cut to 2000 characters. `origin` is the page's origin, not its URL.
- A context has at most one open dialog. The foreground that shows it sends `context.dialog.claim` within 1 second, then `context.dialog.answer` with the user's choice. Answer only with what the user chose.
- Without a claim within 1 second, the host reveals the context, sends `user.showContext`, and the shell shows the dialog over the website, titled with its origin. Once the user answers it there, the foreground receives `context.dialogClosed`.
- `context.dialog.answer` takes `value` only for a `prompt`, at most 2000 characters, else `INVALID_ARGUMENT`. A prompt accepted without `value` gets its default value. Claim and answer answer `NOT_FOUND` when `dialogId` is not the context's open dialog or the shell already shows it.
- When the page navigates or goes away while the dialog is open, the dialog is cancelled and the foreground receives `context.dialogClosed`.
- A new foreground receives `context.dialog` again for each open dialog that the shell does not show yet, with a new claim window.
- While a dialog is open, the context's page calls do not use up their budget: when the dialog ends, the host adds the time it was open to each of their deadlines. The page agent keeps its own clock for waits and evidence, so an effect that appears only later after a long dialog can still end as `unknown` with `DEADLINE`.
- `limits.dialogs` is true when the host sends `context.dialog`. It is absent in an older Genesis.

## Error codes

| Code | Meaning |
| --- | --- |
| `RETIRED` | The applet or document is no longer active. |
| `CONFLICT` | A storage check failed, a watch id is already open, or two list items have the same key. |
| `NOT_FOUND` | An unknown context, call, watch, reader, command, option, or a locator that matches nothing. |
| `DOCUMENT_TOO_LARGE` | A stored value is over `limits.storedDocumentMaxBytes`. |
| `STORAGE_FAILURE` | Storage could not complete the request. |
| `ORIGIN_NOT_DECLARED` | Reserved. Nothing returns it now. |
| `MESSAGE_TOO_LARGE` | A request is over `limits.messageMaxBytes`. |
| `PAGE_TOO_LARGE` | A watch snapshot, or a page call's value, is over `limits.pageMaxBytes`. |
| `PATCH_TOO_LARGE` | A watch patch is over `limits.patchMaxBytes` or `limits.patchRecordsMax`. |
| `DEADLINE` | A request, call, wait or evidence ran out of time. |
| `INVALID_STEPS` | A page module command threw, returned a promise, or returned invalid steps. |
| `SERVICE_UNREACHABLE` | A backend service could not be reached. |
| `SERVICE_FAILURE` | A backend service request failed. |
| `AUTHENTICATION_FAILED` | A backend service refused the credentials. |
| `CERTIFICATE_FAILED` | A backend service's certificate did not verify. |
| `CONFIGURATION_REQUIRED` | The manifest does not declare what the method needs, or a service has no credentials. |
| `NOT_READY` | The context has no bound document yet, or a page did not load in time. |
| `UNKNOWN_METHOD` | No such method. |
| `INVALID_ARGUMENT` | Params, args, a locator or a read specification are invalid, or a method of the other role was called. |
| `QUOTA_EXCEEDED` | Too many pending requests, open calls or watches. |
| `PROTOCOL_MISMATCH` | The document and the host speak different protocol versions, or the page agent's operation set differs from this Genesis's. |
| `APPLET_INCOMPATIBLE` | The applet was built for another manifest schema or bundle format. |
| `ENVELOPE_INVALID` | An import file's envelope is invalid. |
| `CONTEXT_REPLACED` | The document a call was for has been replaced. |
| `TARGET_NOT_FOUND` | A record's element is not on the page. |
| `PRECONDITION_FAILED` | A queued input did not run because an earlier input changed the view first. |
| `ASYNC_READ` | A reader returned a promise. |
| `AUTH_REQUIRED` | Reserved. Nothing returns it now; the router reports a signed-out page as a route status instead. |
| `REJECTED` | The website refused the input: the destination matched `expect.notUrl`. |
| `NOT_ACTIONABLE` | The target cannot take input; `reason` says why. |
| `AMBIGUOUS_TARGET` | A strict locator matched more than one element. |
| `PROTECTED_FIELD` | The input would write into a protected field. |
| `INPUT_UNAVAILABLE` | Trusted input is not available, or the shell could not dispatch it. |
| `UNKNOWN_OPERATION` | The page agent has no such operation. |

`packages/core/src/errors.ts` and `crates/contracts` list the same codes.

## Limits

`bound.limits` carries the limits the host and the page agent enforce.

| Limit | What it bounds |
| --- | --- |
| `rpcDeadlineMs` | The default budget of a request or page call. |
| `messageMaxBytes` | One request's size. |
| `pageMaxBytes` | One watch snapshot's `data`. |
| `patchMaxBytes` | One watch patch's `data`. |
| `patchRecordsMax` | Upserts in one patch; five times it caps a list read. |
| `storedDocumentMaxBytes` | One stored value. |
| `pendingRequestsMax` | Open storage and service requests, and open page calls per context. |
| `documentReadyMs` | How long a context page on a declared origin has to bind after it commits. |
| `navigationJoinMs` | Sent in `bound`; neither the host nor the SDK uses it now. |
| `publishQuietMs` | The quiet time before the agent sends a batch of watch changes. |
| `publishMaxDelayMs` | The longest the agent holds watch changes. |
| `actionTimeoutMs` | The most a page call's budget can be, whatever `timeoutMs` asks for. |
| `backAnswerMs` | How long the host waits for an answer to `back`. |
| `historyEntriesMax` | History entries per watch whose last copy the client keeps. |
| `watchesMax` | Open watches per context document. |
| `trustedInput` | True when the shell can send real input to a hidden context. Absent in an older Genesis. |
| `dialogs` | True when a hidden page's JavaScript dialogs reach the foreground as `context.dialog`. Absent in an older Genesis. |

## Versions

`bound.compat` carries every compatibility number of the running Genesis. `packages/core/src/compat.ts` defines them as `COMPAT`, and `crates/contracts` has the same values. `tools/check-packages.mjs` checks that the two agree.

| Name | Covers |
| --- | --- |
| `manifestSchema` | The shape of `applet.json`. |
| `bundleFormat` | `bundle.json` and the bundle's files. |
| `protocol` | The messages in this file: envelope, handshake, methods and events. |
| `adapterApi` | The page agent's operations, locators, read specifications and watch stream. |
| `sessionState` | The `session.save` payload. |
| `importEnvelope` | The import file around a bundle. |
| `credentialEnvelope` | The service credential import file. |
| `cookieEnvelope` | The development cookie import file of debug builds. |
| `packagesIndex` | `genesis.packages.json`. |

The current values are those in `compat.ts`. What each mismatch does today:

- A `hello` with another `protocol` gets `refused` with `PROTOCOL_MISMATCH`.
- The SDK's `connect` rejects with `PROTOCOL_MISMATCH` when `compat.protocol` or `compat.sessionState` differs from the SDK's own.
- A page agent whose `adapterApi` differs from `compat.adapterApi` answers every call with `PROTOCOL_MISMATCH`.
- `session.save` with another `version` answers `INVALID_ARGUMENT`.

Only the Genesis developer changes these numbers. A change that alters a message, an operation, a locator or read key, or an error code's meaning in a way an existing client or page agent would misread needs a new number, and this file changes with it.
