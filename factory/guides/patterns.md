# Implementation patterns

## Layout

```text
applet.json
src/main.tsx              mountForeground
src/app.tsx               the screen switch and the tabs
src/adapter.ts            defineAdapter: account, signInUrl and the pages
src/adapter/*.ts          one file per page or shared reader
src/model.ts              data types shared by the adapter and screens
src/screens/*.tsx         one file per screen
src/components/*.tsx      shared rows, skeletons, sheets
src/data/*.ts             record and service access (repositories)
src/theme.css             tokens and base styles
backend/                  optional service
```

The adapter imports only `@genesis/sdk/adapter` and pure helpers; the build rejects an adapter that imports `@genesis/sdk/react`. Screens import `@genesis/sdk/react`. Share types, not code with side effects, between them; the adapter is bundled separately and runs inside the website's page. Extract a helper only after a second real use.

## Adapters

Write one adapter page for each sort of page the site has, with `ready` as positive evidence and small, pure `read` functions. Name the nodes each read touches with `extent` or `dependsOn`, give every item a stable unique key, and express actions as desired state. [Adapters](adapters.md) covers each of these; [interactions](interactions.md) covers actions.

## The screen switch

```tsx
export function App() {
  const { screen } = useNavigation();
  const Screen = screen ? SCREENS[screen.id] : undefined;
  return <div className="app">
    <main className="content">{Screen && <Screen key={screen!.key} />}</main>
    <Tabs />
  </div>;
}
```

`screen` is `null` while the active context shows a page without a route; the website shows then, so render nothing for it. Key each screen by `screen.key` so a new history entry gets fresh component state.

## Screens

```tsx
function FeedScreen() {
  const page = usePage();
  const stories = useRegion<Story>("stories");
  if (stories.order.length === 0) {
    if (page.status === "ready" && stories.status === "ready") return <Empty />;
    if (page.status === "error" || stories.status === "error") return <LoadError error={page.error ?? stories.error} />;
    return <FeedSkeleton />;
  }
  return <ScrollMemory className="screen" aria-busy={page.stale || page.status === "loading"}>
    {page.status === "error" && <p className="inline-error" role="alert">Couldn't refresh. Showing the last copy.</p>}
    {stories.order.map(key => <StoryRow key={key} id={key} />)}
  </ScrollMemory>;
}

const StoryRow = memo(function StoryRow({ id }: { id: string }) {
  const story = useRecord<Story>("stories", id);
  return story ? <Row story={story.data} /> : null;
});
```

- Handle each state: loading, empty, error, stale and the region's own error. `auth` and pages without a route show the website, so screens do not draw a sign-in wall of their own. See [presentation](presentation.md).
- Render `stale` content with an unobtrusive refreshing state instead of a skeleton.
- Read the screen's regions with `useRegion` and each row with `useRecord` in a memoized row component keyed by the record key, so an update to one record renders one row.
- Read another context with `usePage(contextId)` and `useRegion(name, contextId)` only for what the screen needs, such as the account name on a Me tab.
- Put each screen's scroll container in `ScrollMemory`.

## Records and services

Wrap storage and service calls in small modules under `src/data/` that screens call. Keep one authoritative store per record type and say which in the current spec. Validate stored values when reading; treat a missing or malformed record as absent, not as a crash. See [services and data](services-and-data.md).

## Performance

Bound list sizes in the adapter's selectors; a page is at most 192 KiB of JSON. Memoize rows by key. Keep images lazy and sized. Do not poll; records arrive when the page changes.
