# Implementation patterns

## Layout

```text
applet.json
src/main.tsx              mountForeground and the screen switch
src/sources/<id>.ts       one adapter per source: extract functions and intents
src/model.ts              data types shared by adapters and screens
src/screens/*.tsx         one file per screen
src/components/*.tsx      shared rows, skeletons, sheets
src/data/*.ts             record and service access (repositories)
src/theme.css             tokens and base styles
backend/                  optional service
```

Adapters import only `@genesis/sdk/source` and pure helpers. Screens import `@genesis/sdk/react`. Share types, not code with side effects, between them; each adapter is bundled separately and runs inside its website page. Extract a helper only after a second real use.

## Extractors

- Read the page in one pass and return a small typed model. Use stable attributes such as ids, `data-*` attributes and URL parameters before visual class names.
- Resolve links with `new URL(href, doc.baseURI)` and keep only `https:` URLs. Parse numbers with explicit fallbacks: `null` means unknown, not zero.
- Keep text as text. For rich text, return runs such as `{ text, href?, emphasis? }` built from known elements.
- Cap list lengths and deduplicate by id. Snapshots over 192 KiB fail.
- Keep extractors pure: no clicks, no timers, no writes to the page. Use intents for actions.

## Loading is not empty

An extractor returns data only when it recognized the page. Return `null` (loading) when the content container is missing, the page is still assembling, or a placeholder is shown. Return an empty list only when the page itself says there is nothing, such as an empty container that the site renders for no results, or a "No results" message.

```ts
extract(doc) {
  const list = doc.querySelector("[data-testid=results]");
  if (!list) return null;                                   // not there yet
  const items = [...list.querySelectorAll("article")].map(readItem).filter(Boolean);
  if (items.length === 0 && !doc.querySelector("[data-testid=empty-state]")) return null;
  return { items };
}
```

Sign-in walls, consent banners and error pages can appear at any route. Detect the ones you know: return a field such as `{ blocked: "signin" }` for the screen to explain, or use `requiresSignIn` with `isSignedIn`. If the page publishes nothing but `loading` for 15 seconds, the host reports `NOT_READY`; show it as a failure with a way to open the website.

## Screens

```tsx
function ItemScreen() {
  const page = useScreenSource<ItemData>();
  if (page.status === "auth") return <SignInPrompt />;
  if (page.status === "unsupported") return <OpenOnWebsite url={page.url} />;
  if (page.status === "error" && !page.data) return <LoadError error={page.error} url={page.url} />;
  if (!page.data) return <ItemSkeleton />;
  return <Item data={page.data} refreshing={page.stale} />;
}
```

- Handle every status. Loading, empty, sign-in, unsupported and failure look different and say different things.
- Render cached `stale` data with an unobtrusive refreshing state instead of a skeleton.
- One `useScreenSource` per screen. Read other sources with `useSource` only for what the screen needs.
- Keep keys stable: React keys and stored record keys use the website's ids.
- Put each screen's scroll container in `ScrollMemory`.

## Records and services

Wrap storage and service calls in small modules under `src/data/` that screens call. Keep one authoritative store per record type and say which in the current spec. Validate stored values when reading; treat a missing or malformed record as absent, not as a crash. See [services and data](services-and-data.md).

## Performance

Bound list sizes and paginate. Avoid re-rendering the whole tree per snapshot: memoize row components by id. Keep images lazy and sized. Do not poll; snapshots arrive when the page changes.
