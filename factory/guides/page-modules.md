# Page modules

A page module is applet code that runs inside the website page, next to the Genesis page agent. It names readers, which turn parts of the page into JSON, and commands, which decide what to do on the page. The UI asks for a reader through a watch or a `read` with `{ reader: "name" }`, and runs a command with `invoke`. The [page control guide](page-control.md) covers the calls the UI makes; this guide covers the code that answers them. Signatures are in the [SDK reference](sdk-reference.md).

`build.page` in `applet.json` names the module file. Its default export is `definePageModule(...)` from `@genesis/sdk/page`:

```ts
import { definePageModule, list, one, value } from "@genesis/sdk/page";

const stories = list({
  root: "#hnmain",
  items: "tr.athing.submission",
  key: row => row.id,
  read: readStory,
  extent: row => [row.nextElementSibling],
  more: "a.morelink",
});

export default definePageModule({
  readers: {
    "ready.hn": value(doc => doc.querySelector("#hnmain") !== null),
    account: value(readAccount),
    stories,
    more: one({ root: "a.morelink", read: readMoreLink }),
  },
  commands: {
    loadMore: () => ({ steps: [{ op: "click", target: { css: "a.morelink" } }], navigates: true }),
  },
});
```

The UI then reads `stories` with `context.watch("stories", { reader: "stories" })`, or `useWatch` in React, and runs `loadMore` with `context.invoke("loadMore")`, or `useCommand`.

## When you need one

`build.page` is optional. Without it, the page script holds only the page agent, and the UI describes every read as a JSON specification and every input as a locator:

```ts
const titles = genesis.context().watch("titles", {
  list: { css: "tr.athing" },
  key: { take: { attr: "id" } },
  fields: { title: { at: ".titleline > a", take: "text" } },
});
await genesis.context().click({ css: "a.morelink" });
```

A JSON specification is enough when every value is the text, an attribute, a URL, a number or a state of an element that a CSS selector reaches inside the record. Write a page module when the read needs code:

- the record spans more than its element, such as a story whose score sits in the next table row (`extent`);
- a value needs parsing or validation, such as relative dates, counts written as "1.2K" or URLs to keep only when they are `https:`;
- rich text must become runs built from known elements;
- the read depends on nodes outside its root (`dependsOn`), typed form values (`fields`) or layout (`measure`);
- several reads must agree on one rule, such as whether the page shows a signed-in account;
- an input needs a decision first, such as skipping a vote that is already cast.

The applet's routes can use both. A route's `ready` read and a screen's watch take any read specification, so one screen can watch a reader while another uses JSON.

## Readers

Every reader is pure and synchronous. It reads its element, the element's descendants and the nodes it names in `extent` or `dependsOn`, and returns a small JSON value of text, numbers, booleans, validated URLs and ids. The second parameter of `read` is the `args` of the read specification, as in `{ reader: "comments", args: { depth: 2 } }`.

### `list(options)`

A keyed list of records, such as stories, comments or messages.

| Option | Meaning |
| --- | --- |
| `root` | Selector of the element that contains the items. Without a match the list is empty. |
| `items` | Selector of the items, matched inside `root`. |
| `key(item)` | A non-empty string unique within the list, such as the site's id. |
| `read(item, args)` | The record for one item. |
| `extent(item)` | Other nodes that belong to this item, such as a sibling row. A change there reads the item again. |
| `more` | Selector of the site's "more" link. While it is present the watch reports `complete: false`. |
| `virtualized` | Items that leave the DOM stay in the list for the current page, with `present: false` added to their record. |
| `dependsOn`, `fields`, `measure` | See [changes outside the item](#changes-outside-the-item). |

A watch on a list reports `order` (the keys in page order) and `records` (each record by key). A list keeps at most five times `limits.patchRecordsMax` items and reports `truncated: true` beyond that.

### `one(options)`

One record, such as a story header, a profile or a form.

| Option | Meaning |
| --- | --- |
| `root` | Selector of the element the record is read from. Without a match the value is `null`. |
| `read(root, args)` | The record. |
| `dependsOn`, `fields`, `measure` | As for `list`. |

A watch on `one` reports the record in `value`.

### `value(read, options?)`

Any JSON value computed from the whole document, such as readiness evidence or the signed-in account. `read(doc, args)` receives the document. The optional `root` selector limits which changes read it again; by default every change in the document does. A watch on `value` reports it in `value`.

```ts
/** The signed-in account's name, false when the page shows the login link, and null when it shows neither. */
function readAccount(doc: Document): string | false | null {
  const me = doc.querySelector("#me")?.textContent?.trim();
  if (me) return me;
  return doc.querySelector("a[href^='login']") ? false : null;
}
```

## Reading rules

- Prefer stable attributes, such as ids, `data-*` attributes and URL parameters, to visual class names.
- Resolve links with `new URL(href, doc.baseURI)` and keep only `https:` URLs.
- Parse numbers with explicit fallbacks. `null` means unknown, not zero.
- Keep text as text. For rich text, return runs such as `{ text, href?, emphasis? }` built from known elements.
- Never return HTML, cookies, form tokens or credentials, and never run code taken from the page.
- Return `null` for a fact the page does not show. A readiness reader returns `true` only from content it recognized, and an account reader returns `false` only when the page shows the person is signed out. The router treats `null` as unknown.
- Keep top-level module code free of side effects. `check` imports the module in Node, where there is no document.

A reader that throws puts its watch in `status: "error"` with the thrown message, and the client keeps the last data it had, marked `stale`. A reader that returns a promise fails the same way with `ASYNC_READ`, and `check` warns about any reader with an `async` function.

### Ready readers

A route's `ready` reader is the page's positive evidence: return `true` only when the content the screen reads is there. Until then the route is `loading`, and the screen shows its skeleton. Return `true` for an empty page only when the page itself says there is nothing, such as an empty results container or a "No results" message.

When the site shows its own failure text, throw an `Error` with that text from the `ready` reader. The route's status becomes `error`, and `status().error.message` carries the site's text, so a screen with `onError: "applet"`, or one still showing the last copy, can show it ([presentation](presentation.md#errors)); otherwise the router shows the website, where the user reads the same text. Returning `false` instead leaves the route `loading` until the deadline.

```ts
"ready.results": value(doc => {
  const failure = doc.querySelector("[data-testid=error-detail]")?.textContent?.trim();
  if (failure) throw new Error(failure);
  const list = doc.querySelector("[data-testid=results]");
  return list !== null && (list.querySelector("article") !== null || doc.querySelector("[data-testid=empty]") !== null);
}),
```

## Keys

`key(item)` returns the same string for the same thing across reloads: the site's id for the post, not its position. The UI uses keys as React keys, and the locator `record("stories", key)` finds the item with that key in the open watch `stories`. An empty key fails the read with `INVALID_ARGUMENT`. Two items with one key fail it with `CONFLICT` ("Two items have the key ..."). Fix the `items` selector or the key rather than working around it.

## Changes outside the item

The agent watches each item element and its descendants. When `read` uses other nodes, name them, or their changes go unnoticed:

- `extent(item)` returns other nodes that belong to this item, such as the next table row with a story's score and vote state. A change there reads that item again.
- `dependsOn` lists selectors of nodes outside the root that the reader uses, such as a page-level toolbar. A change inside them reads the whole reader again. Use it sparingly.
- `fields: true` reads again on `input` and `change` events inside the root, so a form reader reports what is typed. Form values are properties, not DOM, so without it typing goes unnoticed.
- `measure: true` reads again when an element of the reader changes size, for reads that depend on layout, such as which photo of a carousel is in view.

```ts
const compose = one({ root: "#co_", dependsOn: ["#cmcbcc"], fields: true, read: readCompose });
const photo = one({ root: "[data-testid=swipe-to-dismiss]", measure: true, read: readPhoto });
```

## Lists that load more

Set `more` to the selector of the site's "more" link, and give the UI a command that follows it. Infinite-scroll sites remove items as the user scrolls. Set `virtualized: true` so items that leave the DOM stay in the list for the current page, and load more with a `scroll` step (see [page control](page-control.md)).

## Commands

A command is a function of the page and the call's arguments. It runs synchronously and does nothing to the page itself; it returns what the agent should do.

```ts
type Command<A = any> = (context: CommandContext<A>, args: A) => unknown;
// CommandContext<A> is { document: Document; url: string; element: Element | null; args: A }
```

`element` is the element of the call's `target` locator, or `null` without one. `args` is the second parameter of `invoke`, and is also `context.args`.

A command returns one of three things:

| Return | Result of `invoke` |
| --- | --- |
| `{ satisfied: true }` | `{ outcome: "observed", noop: true }`. The wanted state already holds, so nothing runs. |
| `{ steps, until?, navigates?, deadlineMs? }` | The agent runs the steps with the rules of `run`. `until` is evidence, or a function of the document that returns `true` once the steps took effect. `deadlineMs` shortens the call's deadline. |
| Any other value | `{ outcome: "observed", value }`, with `undefined` sent as `null`. Use this for a read that needs arguments. |

```ts
import { definePageModule, type CommandSteps } from "@genesis/sdk/page";

/** HN hides the up arrow of a story the person has voted on. */
const isVoted = (id: string, doc: Document) => doc.querySelector(`[id="up_${id}"]`)?.classList.contains("nosee") === true;

/** Votes or unvotes a story; nothing runs when the page already shows the wanted state. */
function setVoted(doc: Document, args: unknown): CommandSteps | { satisfied: true } {
  const { id, voted } = (args ?? {}) as { id?: unknown; voted?: unknown };
  if (typeof id !== "string" || !/^\d+$/.test(id) || typeof voted !== "boolean") throw new Error("setVoted needs { id, voted }");
  if (isVoted(id, doc) === voted) return { satisfied: true };
  const link = `[id="${voted ? "up" : "un"}_${id}"]`;
  if (!doc.querySelector(link)) throw new Error("This story cannot be voted on here");
  return { steps: [{ op: "click", target: { css: link } }], until: d => isVoted(id, d) === voted };
}

export default definePageModule({ commands: { setVoted: ({ document }, args) => setVoted(document, args) } });
```

The UI runs it with `invoke("setVoted", { id, voted: true })` and shows the vote at once from `pending()` while it runs (see [page control](page-control.md)).

| Failure | Code |
| --- | --- |
| No command of that name | `NOT_FOUND` |
| The command throws | `INVALID_STEPS`, with the thrown message |
| The command returns a promise | `INVALID_STEPS` ("A command must return synchronously") |
| The steps or `until` break the step rules | `INVALID_STEPS`, naming the command |

The steps themselves fail as `run` does, for example with `TARGET_NOT_FOUND` or `DEADLINE`. `invoke` never rejects for these; the failure arrives as the result's `outcome` and `code`.

## What `check` enforces

`genesis-applet check` bundles the module with esbuild, imports it in Node and checks it before the build:

- The default export must come from `definePageModule`, or the check fails with `PAGE_MODULE_INVALID`.
- `definePageModule` itself rejects names that do not match `^[A-Za-z][A-Za-z0-9_.-]{0,63}$`, readers not made with `list`, `one` or `value`, missing or empty selectors, a `read`, `key` or `extent` that is not a function, and commands that are not functions. Its error names the first bad field.
- A reader with an `async` function gets a warning.
- Each of the applet's own module files is checked line by line, skipping comment lines. A line fails with `PAGE_MODULE_INVALID` when it imports `react`, `react-dom`, `vue`, `svelte`, `solid-js`, `preact` or `@genesis/sdk/react`, calls `eval` or `fetch`, uses `new Function`, `XMLHttpRequest`, `document.cookie`, `localStorage`, `sessionStorage` or `indexedDB`. These rules are a text lint, not a sandbox: they cover only files inside the applet directory (not `node_modules` or shared code outside it), and they miss code that reaches the same API indirectly, such as `window["fe" + "tch"]`. Keep page module code inside the applet so the lint sees it, and treat the rules as a guard against mistakes.

The build refuses `@genesis/sdk/react` in the page script as well. Import from `@genesis/sdk/page` and pure helpers, and share types, not code with side effects, with the UI.

## Limits

- **No script-only value changes.** The agent sees DOM mutations and, with `fields`, input events. A site script that sets an input's `.value` without firing events changes nothing the agent can observe, so the reader keeps the old value.
- **Reads outside the declared nodes go stale.** They are right on the first read and then miss changes.
- **Size.** A snapshot is at most `limits.pageMaxBytes` of JSON (192 KiB), and one update at most `limits.patchMaxBytes` (64 KiB) and `limits.patchRecordsMax` records (200). A larger snapshot fails with `PAGE_TOO_LARGE`; a virtualized list drops the records farthest from the screen first. Bound long lists in the selector rather than reading everything the site keeps.
- **`check` runs your code.** It imports the module in Node. This is not a sandbox, so check only applets you trust.
- **No fixture runner.** The tools cannot load a saved page and run a reader against it. `check` proves the module loads and has the right shape; that its readers read correctly is proven on the device against the live website. To try selectors on the live page, open the context's WebView in Chrome's remote inspector (`chrome://inspect`) on a debuggable Genesis build.
