import { ScrollMemory, useAction, useNavigation, usePage, usePending, useRecord, useRegion } from "@genesis/sdk/react";
import { ORIGIN, type CommentEntry, type MoreLink, type Story } from "../model";
import { CommentRow, StoryRow } from "../components/story";
import { LoadError, Notice, Skeleton, useOpenUrl } from "../components/ui";

/** The Home feed chooser. Each choice is an HN URL, so the manifest still decides the screen. */
const HOME_FEEDS = [
  { label: "Top", paths: ["/", "/news"] },
  { label: "New", paths: ["/newest"] },
  { label: "Past", paths: ["/front"] },
  { label: "Comments", paths: ["/newcomments"] },
  { label: "Ask", paths: ["/ask"] },
  { label: "Show", paths: ["/show"] },
  { label: "Jobs", paths: ["/jobs"] },
];

/** Titles of the lists outside the chooser, by path. */
const TITLES: Record<string, string> = {
  "/shownew": "New Show", "/asknew": "New Ask", "/best": "Best", "/active": "Active", "/from": "From site",
  "/submitted": "Submissions", "/threads": "Comments", "/favorites": "Favorites", "/hidden": "Hidden", "/upvoted": "Upvoted",
};

/**
 * A list page: stories, or comments on `/newcomments` and `/threads`. Rows are `memo` components
 * keyed by the record key, so a patch that changes one row renders only that row.
 */
export function FeedScreen() {
  const page = usePage();
  const { navigate } = useNavigation();
  const stories = useRegion<Story | null>("stories");
  const comments = useRegion<CommentEntry | null>("comments");
  const more = useRecord<MoreLink>("more", null);
  const loadMore = useAction("loadMore");
  const loading = usePending(null, null).some(action => action.name === "loadMore");
  const open = useOpenUrl();
  const signedIn = page.account !== null;
  const list = page.pageId === "feed" || page.pageId === "private-feed";
  const path = page.url ? new URL(page.url).pathname : "/";
  const chosen = HOME_FEEDS.find(feed => feed.paths.includes(path));
  const storyKeys = list ? stories.order : [];
  const commentKeys = list && storyKeys.length === 0 ? comments.order : [];

  const next = () => void loadMore(null).then(result => {
    // The click did not leave the page; the link's URL still opens the next page.
    if (result.outcome === "failed" && more) open(more.data.url);
  });

  let body;
  if (storyKeys.length === 0 && commentKeys.length === 0) {
    if (list && page.status === "ready" && stories.status === "ready") {
      body = <Notice title="Nothing here yet"><p>This list is empty on Hacker News.</p></Notice>;
    } else if (page.status === "error" || stories.status === "error") {
      body = <LoadError error={page.error ?? stories.error} />;
    } else body = <Skeleton label="Loading stories" />;
  } else body = <>
    {page.status === "error" && <p className="inline-error" role="alert">Couldn't refresh. Showing the last copy.</p>}
    {(stories.status === "error" || comments.status === "error") && <p className="inline-error" role="alert">Some rows couldn't be read.</p>}
    {storyKeys.map(key => {
      const story = stories.get(key)?.data;
      return story && <StoryRow key={key} story={story} region="stories" signedIn={signedIn} />;
    })}
    {commentKeys.map(key => {
      const entry = comments.get(key)?.data;
      return entry && <CommentRow key={key} head entry={entry} region="comments" storyId={entry.onStory?.id ?? key}
        signedIn={signedIn} onLink={open} />;
    })}
    {more && <button type="button" className="secondary more" disabled={loading || page.stale} onClick={next}>
      {loading ? "Loading…" : "More"}
    </button>}
  </>;

  return <ScrollMemory className="screen" aria-busy={page.stale || page.status === "loading"}>
    {chosen
      ? <nav className="chips" aria-label="Feeds">{HOME_FEEDS.map(feed => <button type="button" key={feed.label} className="chip"
          aria-pressed={feed === chosen}
          onClick={() => feed !== chosen && navigate({ url: ORIGIN + feed.paths[0], mode: "replace" })}>{feed.label}</button>)}</nav>
      : <h1 className="screen-title">{TITLES[path] ?? "Hacker News"}</h1>}
    {body}
  </ScrollMemory>;
}
