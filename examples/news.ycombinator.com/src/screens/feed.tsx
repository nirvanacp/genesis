import { ScrollMemory, useAction, usePage, usePending, useRecord, useRegion } from "@genesis/sdk/react";
import type { MoreLink, Story } from "../model";
import { StoryRow } from "../components/story";
import { LoadError, Notice, Skeleton, useOpenUrl } from "../components/ui";

/**
 * The front page (`/`, `/news`). Rows are `memo` components keyed by the record key, so a patch
 * that changes one story renders only that row. Other feeds return in step 8.
 */
export function FeedScreen() {
  const page = usePage();
  const stories = useRegion<Story | null>("stories");
  const more = useRecord<MoreLink>("more", null);
  const loadMore = useAction("loadMore");
  const loading = usePending(null, null).some(action => action.name === "loadMore");
  const open = useOpenUrl();
  const signedIn = page.account !== null;
  const shown = page.pageId === "feed" ? stories.order : [];

  const next = () => void loadMore(null).then(result => {
    // The click did not leave the page; the link's URL still opens the next page.
    if (result.outcome === "failed" && more) open(more.data.url);
  });

  let body;
  if (shown.length === 0) {
    if (page.pageId === "feed" && page.status === "ready" && stories.status === "ready") {
      body = <Notice title="Nothing here yet"><p>This list is empty on Hacker News.</p></Notice>;
    } else if (page.status === "error" || stories.status === "error") {
      body = <LoadError error={page.error ?? stories.error} />;
    } else body = <Skeleton label="Loading stories" />;
  } else body = <>
    {page.status === "error" && <p className="inline-error" role="alert">Couldn't refresh. Showing the last copy.</p>}
    {stories.status === "error" && <p className="inline-error" role="alert">Some stories couldn't be read.</p>}
    {shown.map(key => {
      const story = stories.get(key)?.data;
      return story && <StoryRow key={key} story={story} region="stories" signedIn={signedIn} />;
    })}
    {more && <button type="button" className="secondary more" disabled={loading || page.stale} onClick={next}>
      {loading ? "Loading…" : "More"}
    </button>}
  </>;

  return <ScrollMemory className="screen" aria-busy={page.stale || page.status === "loading"}>
    <h1 className="screen-title">Top</h1>
    {body}
  </ScrollMemory>;
}
