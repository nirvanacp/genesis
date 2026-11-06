import { ScrollMemory, useNavigation, useScreenSource } from "@genesis/sdk/react";
import { useAccount } from "../library";
import { ORIGIN, type FeedData, type FeedItem, type NoticeView } from "../model";
import { PostCard, usePostActions, type PostActions } from "../components/post";
import { Avatar, LoadError, ModeTabs, Notice, OpenOnX, SignInPrompt, Skeleton, useOpenRoute } from "../components/ui";

/** Bookmarks, Likes and Categories under the Saved tab. Each replaces the tab's root. */
export function SavedTabs({ active }: { active: "bookmarks" | "likes" | "categories" }) {
  const { navigate } = useNavigation();
  const options = [
    { id: "bookmarks", label: "Bookmarks", go: () => void navigate({ kind: "route", url: `${ORIGIN}/i/history`, mode: "replace" }) },
    { id: "likes", label: "Likes", go: () => void navigate({ kind: "route", url: `${ORIGIN}/i/history/likes`, mode: "replace" }) },
    { id: "categories", label: "Categories", go: () => void navigate({ kind: "screen", id: "categories", mode: "replace" }) },
  ];
  return <ModeTabs label="Saved" options={options} active={active} />;
}

const TITLES: Record<string, string> = { home: "Home", notifications: "Notifications", saved: "Saved" };
const SIGN_IN: Record<string, string> = {
  home: "Sign in to see your timeline.",
  notifications: "Sign in to see your notifications.",
  saved: "Sign in to see your bookmarks and likes.",
};

/** Home, Notifications, and Bookmarks or Likes under Saved: a list of posts and notifications. */
export function FeedScreen() {
  const { screen } = useNavigation();
  const page = useScreenSource<FeedData>();
  const { account } = useAccount();
  const { actions, error: actionError } = usePostActions(page.stale);
  const routeId = screen.source?.routeId ?? "";
  const ownLikes = routeId === "own-likes" || (routeId === "likes" && account?.handle?.toLowerCase() === page.params.handle?.toLowerCase());
  // Another account's likes reuse this screen without the Saved tabs.
  const kind = routeId === "likes" && !ownLikes ? "likes" : screen.id;
  const data = page.data;

  let body;
  if (page.status === "auth") body = <SignInPrompt reason={SIGN_IN[kind] ?? "Sign in to see this page."} />;
  else if (page.status === "unsupported") body = <>
    <SignInPrompt reason="X opened a different page, which usually means it needs you to sign in." />
    {page.url && <OpenOnX url={page.url} />}
  </>;
  else if (!data) body = page.status === "error" ? <LoadError error={page.error} url={page.url} /> : <Skeleton label={`Loading ${TITLES[kind] ?? "posts"}`} />;
  else if (data.items.length === 0) body = <Notice title={data.emptyText ?? "Nothing here yet"}>
    <p>{kind === "notifications" ? "New activity shows up here." : kind === "saved" ? "Posts you bookmark or like on X appear here." : "X has nothing to show here right now."}</p>
  </Notice>;
  else body = <>
    {page.status === "error" && <p className="inline-error" role="alert">Couldn't refresh. Showing the last copy.</p>}
    {actionError != null && <p className="inline-error" role="alert">That didn't go through on X. Try again.</p>}
    <FeedList items={data.items} actions={actions} />
    {data.partial && page.url && <div className="more"><OpenOnX url={page.url} label="See more on X" /></div>}
  </>;

  return <ScrollMemory className="screen" aria-busy={page.stale}>
    <h1 className="screen-title">{kind === "likes" ? `@${page.params.handle}’s likes` : TITLES[kind] ?? "Posts"}</h1>
    {kind === "saved" && <SavedTabs active={routeId === "likes" || routeId === "own-likes" ? "likes" : "bookmarks"} />}
    {body}
  </ScrollMemory>;
}

export function FeedList({ items, actions }: { items: FeedItem[]; actions: PostActions | null }) {
  return <div className="feed">
    {items.map(item => item.kind === "post"
      ? <PostCard key={item.post.postId} post={item.post} actions={actions} />
      : <NoticeRow key={item.notice.id} notice={item.notice} />)}
  </div>;
}

function NoticeRow({ notice }: { notice: NoticeView }) {
  const open = useOpenRoute();
  const content = <>
    {notice.avatars.length > 0 && <span className="notice-avatars">{notice.avatars.map(src => <Avatar key={src} src={src} size={32} />)}</span>}
    <span className="notice-text">{notice.text}</span>
  </>;
  return notice.url
    ? <button type="button" className="notification" onClick={() => open(notice.url!)}>{content}</button>
    : <div className="notification">{content}</div>;
}
