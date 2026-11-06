import { ScrollMemory, useIntent, useNavigation, useScreenSource } from "@genesis/sdk/react";
import { ORIGIN, type FeedData } from "../model";
import { CommentView, StoryRow } from "../components/story";
import { LoadError, Notice, SignInPrompt, Skeleton, useOpenRoute } from "../components/ui";

/** The Home feed chooser; each choice is an HN URL, so the manifest still decides the screen. */
export const HOME_FEEDS = [
  { label: "Top", path: "/", routes: ["home", "news"] },
  { label: "New", path: "/newest", routes: ["newest"] },
  { label: "Past", path: "/front", routes: ["front"] },
  { label: "Comments", path: "/newcomments", routes: ["newcomments"] },
  { label: "Ask", path: "/ask", routes: ["ask"] },
  { label: "Show", path: "/show", routes: ["show"] },
  { label: "Jobs", path: "/jobs", routes: ["jobs"] },
];
const HOME_ROUTES = HOME_FEEDS.flatMap(feed => feed.routes);
/** Feeds of one account; HN shows its login form for these when signed out. */
const PRIVATE_ROUTES = ["hidden", "upvoted"];

export function FeedScreen() {
  const { screen, navigate } = useNavigation();
  const page = useScreenSource<FeedData>();
  const vote = useIntent("primary");
  const open = useOpenRoute();
  const routeId = screen.source?.routeId ?? "";
  const home = HOME_ROUTES.includes(routeId);
  const data = PRIVATE_ROUTES.includes(routeId) && page.stale ? null : page.data;

  let body;
  if (page.status === "auth") body = <SignInPrompt reason="Hacker News shows this list only to its owner." goto={new URL(screen.source!.url).pathname.slice(1) + new URL(screen.source!.url).search} />;
  else if (page.status === "unsupported") body = <Notice title="This page moved"><p>Hacker News sent this feed somewhere the app doesn't show.</p></Notice>;
  else if (!data) body = page.status === "error" ? <LoadError error={page.error} url={page.url} /> : <Skeleton label="Loading stories" />;
  else if (data.stories.length === 0 && data.comments.length === 0) body = <Notice title="Nothing here yet"><p>This list is empty on Hacker News.</p></Notice>;
  else body = <>
    {page.status === "error" && <p className="inline-error" role="alert">Couldn't refresh. Showing the last copy.</p>}
    {vote.error != null && <p className="inline-error" role="alert">The vote didn't go through. Try again.</p>}
    {data.commentList
      ? data.comments.map(entry => <CommentView key={entry.id} entry={entry} showStory />)
      : data.stories.map(story => <StoryRow key={story.id} story={story}
          actions={{ vote: id => void vote.act({ name: "vote", id }).catch(() => {}), voting: vote.pending }} />)}
    {data.nextUrl && <button type="button" className="secondary more" onClick={() => open(data.nextUrl!)}>More</button>}
  </>;

  return <ScrollMemory className="screen" aria-busy={page.stale}>
    {home
      ? <nav className="chips" aria-label="Feeds">{HOME_FEEDS.map(feed => {
          const active = feed.routes.includes(routeId);
          return <button type="button" key={feed.path} className="chip" aria-pressed={active}
            onClick={() => !active && void navigate({ kind: "route", url: ORIGIN + feed.path, mode: "replace" })}>{feed.label}</button>;
        })}</nav>
      : <h1 className="screen-title">{data?.title ?? "Hacker News"}</h1>}
    {body}
  </ScrollMemory>;
}
