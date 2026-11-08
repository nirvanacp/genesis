# Adapters

The adapter is one file, named by `adapter` in the manifest, whose default export is `defineAdapter(...)`. Genesis runs it inside every context's page on a declared origin. It does two jobs: it reads the page into records that screens render, and it turns actions into steps on the page. Option tables are in the [SDK reference](sdk-reference.md#adapter); this guide covers how to use them.

The adapter imports only `@genesis/sdk/adapter` (or `@genesis/sdk`) and pure helpers. It has no storage, services or navigation. Share types with the foreground, not code with side effects.

## Pages

Each route names a `page`. The adapter declares that page under `pages`, and several routes can share one page (every story list on a news site can be page `feed`).

```ts
export const item: Page = {
  ready: doc => doc.querySelector("table.fatitem") !== null,
  regions: { story: single({ root: "table.fatitem", read: readStory }), comments: collection({ ... }) },
};
```

## Readiness

`ready(doc)` is the page's positive evidence: return `true` only when the content the regions read is there. Until then the page is `loading`, and the screen shows its skeleton. Return `true` for an empty page only when the page itself says there is nothing, such as an empty results container or a "No results" message.

```ts
ready: doc => {
  const list = doc.querySelector("[data-testid=results]");
  return list !== null && (list.querySelector("article") !== null || doc.querySelector("[data-testid=empty]") !== null);
},
```

When the site shows its own failure text, throw from `ready` with a message for people. The page becomes `error` with that message, and the screen shows it.

```ts
ready: doc => {
  const failure = doc.querySelector("[data-testid=error-detail]")?.textContent?.trim();
  if (failure) throw new Error(failure);
  return doc.querySelector("[data-testid=primaryColumn] article") !== null;
},
```

A page that is still `loading` after 15 seconds shows the website, so the user sees what the site shows instead of a skeleton that never ends. See [presentation](presentation.md).

## Account and sign-in

`account(doc)` reads who is signed in: the account's name or id, `null` when the page shows the user is signed out, and `undefined` when this page does not show either. Return `undefined` rather than `null` when the evidence is missing; `null` is a claim that nobody is signed in.

Set `requiresAccount: true` on pages that only an account can see. With no account the page is `auth`. Genesis then shows the website and opens `signInUrl`, so the user signs in on the site itself. When a ready page with an account arrives, the context shows the applet again. A page can supply its own `account` when its evidence differs, for example a form that the site only shows signed in:

```ts
export const submit: Page = {
  ready: doc => doc.querySelector("#hnmain") !== null,
  account: doc => (doc.querySelector("form[action='/r']") ? undefined : null),
  requiresAccount: true,
  regions: { form: single({ root: "form[action='/r']", fields: true, read: readForm }) },
};
```

When a ready or `auth` page reports a different account than before (signing in, signing out or switching), Genesis drops the stale copies it kept for Back, marks the other contexts' records stale and reloads them, and actions in flight end `unknown` with `CONTEXT_REPLACED`.

## Regions

A region is a named part of the page. Use `collection` for repeated items (stories, comments, posts) and `single` for one thing (a profile header, a form, a "more" link). Each region has a `root` selector; `items` is matched inside it.

- `read` is pure and synchronous. It reads only its element, the element's descendants and the nodes named by `extent` or `dependsOn`, and returns a small JSON model: text, numbers, validated URLs and ids.
- Use stable attributes such as ids, `data-*` attributes and URL parameters before visual class names.
- Resolve links with `new URL(href, doc.baseURI)` and keep only `https:` URLs. Parse numbers with explicit fallbacks: `null` means unknown, not zero.
- Keep text as text. For rich text, return runs such as `{ text, href?, emphasis? }` built from known elements. Never return HTML, cookies, form tokens or credentials, and never execute code taken from the page.
- A `read` that throws marks only that region `error` and keeps its earlier records. A `read` that returns a promise is an `ASYNC_READ` error, and `check` warns about async reads.

Genesis re-reads only what changed. After the first read, a mutation inside an item re-reads that item, and the screen receives a small update for it.

## Keys and entities

`key(item)` must return a non-empty string that is unique within the region and stays the same for the same thing across reloads: the site's id for the post, not its position. Screens use keys as React keys and actions target records by key.

When two items share a key, Genesis cannot tell them apart. The region becomes `ephemeral`: its keys become positions, and record actions on it fail with `PRECONDITION_FAILED`. Fix the `items` selector or the key rather than accepting that.

`entity(element)` and `entityType` name what the record is across regions and pages. Two regions that show the same story should give it the same `entityType` and entity, so identical actions on it from either place share one call. Both default to the key and the region name.

## Extents and `dependsOn`

Genesis watches the item element and its descendants. When `read` also uses nodes outside the item, name them, or their changes go unnoticed:

- `extent(item)` returns other nodes that belong to this item, such as the next table row that holds a story's score and vote state. A mutation there re-reads that item.
- `dependsOn` lists selectors of nodes outside the region that every read uses, such as a page-level setting. A mutation inside them re-reads the whole region. Use it sparingly.

```ts
stories: collection({
  root: "#hnmain",
  items: "tr.athing.submission",
  key: row => row.id,
  read: story,
  extent: row => [row.nextElementSibling],
  more: "a.morelink",
}),
```

Reading anything outside the item, its extent and `dependsOn` works on the first read and then goes stale.

## Lists that load more

Set `more` to the selector of the site's "more" link. While it is present the region reports `complete: false`, and the screen can offer a More control backed by a page action. Infinite-scroll sites remove items as the user scrolls; set `virtualized: true` so items that leave the DOM stay in the region for the current view, and load more with a `scroll` step (see [interactions](interactions.md#loading-more)).

## Forms and sizes

- `fields: true` re-reads the region on `input` and `change` events inside it, so a form region reports what is typed. Form values are properties, not DOM, so without it typing goes unnoticed.
- `measure: true` re-reads when an element of the region changes size, for reads that depend on layout, such as which photo of a carousel is in view.

## Limits

- **No script-only field changes.** Genesis sees DOM mutations and, with `fields`, input events. A site script that sets an input's `.value` without firing events changes nothing Genesis can observe, so the region keeps the old value.
- **Reads outside the declared nodes go stale**, as described under extents.
- **One page is at most 192 KiB of JSON**, and one update at most 64 KiB and 200 records. Larger pages fail with `PAGE_TOO_LARGE`. Bound long lists in the selector rather than reading everything the site keeps.
- **`check` runs your code.** It bundles the adapter and imports it in Node to check the definition and the route pages. This is not a sandbox: check only applets you trust, and keep top-level adapter code free of side effects.
- **There is no fixture runner.** The tools cannot load a saved page and run the adapter against it. `check` proves the adapter loads and declares every route's page; that its pages become ready and its regions read correctly is proven only on the device against the live website. To debug reads, build with `genesis-applet build --debug`, which keeps the adapter runtime's measurements in `window.__genesisStats`.
