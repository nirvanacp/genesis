import { useState } from "react";
import { ScrollMemory, useAction, useNavigation, usePage, usePending, useRecord, useRegion, type RegionView } from "@genesis/sdk/react";
import { ORIGIN, type FeedItem, type NoticeView } from "../model";
import { PostCard } from "../components/post";
import { Avatar, LoadError, ModeTabs, Notice, SignInPrompt, Skeleton, useOpenUrl } from "../components/ui";

/** Bookmarks, Likes and Categories under the Saved tab. Bookmarks and Likes are X pages; Categories is an applet screen. */
export function SavedTabs({ active }: { active: "bookmarks" | "likes" | "categories" }) {
  const { navigate } = useNavigation();
  const options = [
    { id: "bookmarks", label: "Bookmarks", go: () => navigate({ url: `${ORIGIN}/i/history`, context: "primary", mode: active === "categories" ? "push" : "replace" }) },
    { id: "likes", label: "Likes", go: () => navigate({ url: `${ORIGIN}/i/history/likes`, context: "primary", mode: active === "categories" ? "push" : "replace" }) },
    { id: "categories", label: "Categories", go: () => navigate({ screen: "categories", mode: "root" }) },
  ];
  return <ModeTabs label="Saved" options={options} active={active} />;
}

const TITLES: Record<string, string> = { home: "Home", notifications: "Notifications", saved: "Saved" };
const SIGN_IN: Record<string, string> = {
  home: "Sign in to see your timeline.",
  notifications: "Sign in to see your notifications.",
  saved: "Sign in to see your bookmarks and likes.",
};

/** Which list a timeline URL shows. Another account's likes reuse this screen without the Saved tabs. */
function kindOf(path: string, account: string | null): { kind: string; likes: boolean; handle: string | null } {
  if (path === "/home") return { kind: "home", likes: false, handle: null };
  if (path === "/notifications") return { kind: "notifications", likes: false, handle: null };
  if (path === "/i/history/likes") return { kind: "saved", likes: true, handle: null };
  const likes = /^\/([A-Za-z0-9_]{1,15})\/likes$/.exec(path)?.[1] ?? null;
  if (likes) return likes.toLowerCase() === account?.toLowerCase()
    ? { kind: "saved", likes: true, handle: null } : { kind: "likes", likes: true, handle: likes };
  return { kind: "saved", likes: false, handle: null };
}

/** Home, Notifications, and Bookmarks or Likes under Saved: a list of posts and notifications. */
export function FeedScreen() {
  const page = usePage();
  const timeline = useRegion<FeedItem | null>("timeline");
  const empty = useRecord<string | null>("empty", null);
  const path = page.url ? new URL(page.url).pathname : "/home";
  const { kind, likes, handle } = kindOf(path, page.account);
  const shown = page.pageId === "timeline" ? timeline.order : [];
  const actionable = page.account !== null && !page.stale && !timeline.ephemeral;
  const partial = page.pageId === "timeline" && timeline.status === "error";

  let body;
  if (page.status === "auth") body = <SignInPrompt reason={SIGN_IN[kind] ?? "Sign in to see this page."} />;
  else if (shown.length === 0) {
    if (partial) body = <p className="inline-error" role="alert">Some posts couldn't be read.</p>;
    else if (page.status === "ready" && page.pageId === "timeline") body = <Notice title={empty?.data ?? "Nothing here yet"}>
      <p>{kind === "notifications" ? "New activity shows up here." : kind === "saved" ? "Posts you bookmark or like on X appear here." : "X has nothing to show here right now."}</p>
    </Notice>;
    else body = page.status === "error" ? <LoadError error={page.error} /> : <Skeleton label={`Loading ${TITLES[kind] ?? "posts"}`} />;
  } else body = <>
    {page.status === "error" && <p className="inline-error" role="alert">Couldn't refresh. Showing the last copy.</p>}
    {partial && <p className="inline-error" role="alert">Some posts couldn't be read.</p>}
    <FeedList region="timeline" items={timeline} actionable={actionable} />
    <MoreButton stale={page.stale} />
  </>;

  return <ScrollMemory className="screen" aria-busy={page.stale || page.status === "loading"}>
    <h1 className="screen-title">{kind === "likes" ? `@${handle}’s likes` : TITLES[kind] ?? "Posts"}</h1>
    {kind === "saved" && <SavedTabs active={likes ? "likes" : "bookmarks"} />}
    {body}
  </ScrollMemory>;
}

/** The rows of a region of posts and notifications, in page order. Rows are keyed by record key. */
export function FeedList({ region, items, actionable }: { region: string; items: RegionView<FeedItem | null>; actionable: boolean }) {
  return <div className="feed">
    {items.order.map(key => {
      const item = items.get(key)?.data;
      if (!item) return null;
      return item.kind === "post"
        ? <PostCard key={key} post={item.post} region={region} actionable={actionable} />
        : <NoticeRow key={key} notice={item.notice} />;
    })}
  </div>;
}

/**
 * Asks X for the next rows: the adapter scrolls X's page to its end. A page whose last row stays
 * put has nothing more right now.
 */
export function MoreButton({ stale }: { stale: boolean }) {
  const loadMore = useAction("loadMore");
  const loading = usePending(null, null).some(action => action.name === "loadMore");
  const [end, setEnd] = useState(false);
  const next = () => void loadMore(null).then(result => setEnd(result.outcome !== "observed"));
  return <div className="more">
    {end && <p className="post-meta" role="status">No more posts right now.</p>}
    <button type="button" className="secondary" disabled={loading || stale} onClick={next}>{loading ? "Loading…" : "Show more"}</button>
  </div>;
}

function NoticeRow({ notice }: { notice: NoticeView }) {
  const open = useOpenUrl();
  const content = <>
    {notice.avatars.length > 0 && <span className="notice-avatars">{notice.avatars.map(src => <Avatar key={src} src={src} size={32} />)}</span>}
    <span className="notice-text">{notice.text}</span>
  </>;
  return notice.url
    ? <button type="button" className="notification" onClick={() => open(notice.url!)}>{content}</button>
    : <div className="notification">{content}</div>;
}
