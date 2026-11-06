import { memo } from "react";
import { useIntent, useNavigation } from "@genesis/sdk/react";
import { snapshotOf } from "../library";
import { ORIGIN, profileUrl, type PostView } from "../model";
import { Avatar, Icon, RichText, useOpenRoute, Verified } from "./ui";

/** The like and bookmark intents of the page the post was read from. Null when that page is not loaded. */
export interface PostActions {
  toggle(name: "like" | "bookmark", postId: string, on: boolean): void;
  pending: boolean;
}

/** Like and bookmark through the current screen's source. A stale page has no controls to press, so it gets none. */
export function usePostActions(stale: boolean): { actions: PostActions | null; error: unknown } {
  const { screen } = useNavigation();
  const intent = useIntent(screen.source?.sourceId ?? "primary");
  const actions = stale ? null : {
    toggle: (name: "like" | "bookmark", postId: string, on: boolean) => void intent.act({ name, postId, on }).catch(() => {}),
    pending: intent.pending,
  };
  return { actions, error: intent.error };
}

/** Opens the category editor for a post read from the current page. */
export function useSaveToCategories() {
  const { navigate } = useNavigation();
  return (post: PostView) => void navigate({
    kind: "screen", id: "save",
    params: { post: JSON.stringify({ postId: post.postId, url: post.url, snapshot: snapshotOf(post) }) },
  });
}

export const PostCard = memo(function PostCard({ post, actions, focus = false }: {
  post: PostView; actions: PostActions | null; focus?: boolean;
}) {
  const open = useOpenRoute();
  const { navigate } = useNavigation();
  const save = useSaveToCategories();
  const openPost = () => { if (!focus) open(post.url); };
  return <article className={focus ? "post focus" : "post"} aria-label={`Post by ${post.name}`}>
    {post.context && <p className="post-context">
      <Icon name={/pinned/i.test(post.context.text) ? "bookmark" : "repost"} />
      {post.context.url
        ? <a href={post.context.url} onClick={event => { event.preventDefault(); open(post.context!.url!); }}>{post.context.text}</a>
        : post.context.text}
    </p>}
    <div className="post-grid">
      <button type="button" className="avatar-button" aria-label={`Profile of ${post.name}`} onClick={() => open(profileUrl(post.handle))}>
        <Avatar src={post.avatar} size={focus ? 48 : 40} />
      </button>
      <div className="post-body">
        <header className="post-head">
          <a className="post-name" href={profileUrl(post.handle)} onClick={event => { event.preventDefault(); open(profileUrl(post.handle)); }}>
            <strong>{post.name}</strong>{post.verified && <Verified />}
          </a>
          <span className="post-meta">@{post.handle}{!focus && post.time && <> · <time dateTime={post.dateTime ?? undefined}>{post.time}</time></>}</span>
        </header>
        <div className="post-content" onClick={openPost}>
          {post.parts.length > 0 && <RichText parts={post.parts} className={focus ? "post-text large" : "post-text"} />}
          {post.textState === "excerpt" && !focus && <span className="show-more">Show more</span>}
          {post.textState === "unavailable" && post.photos.length === 0 && post.videos === 0 && !post.quote
            && <p className="post-meta">X didn't show this post's text.</p>}
        </div>
        {post.photos.length > 0 && <div className={`photos n${post.photos.length}`}>
          {post.photos.map((src, index) => <button type="button" key={src} aria-label={`Photo ${index + 1} of ${post.photos.length}`}
            onClick={() => open(`${post.url}/photo/${index + 1}`)}>
            <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />
          </button>)}
        </div>}
        {post.videos > 0 && <button type="button" className="video-tile" onClick={() => void navigate({ kind: "website", url: post.url })}>
          <span>Video</span><span className="post-meta">Play on X <Icon name="external" /></span>
        </button>}
        {post.quote && <button type="button" className="quote" disabled={!post.quote.url} onClick={() => post.quote?.url && open(post.quote.url)}>
          <span className="post-head"><strong>{post.quote.name}</strong>{post.quote.handle && <span className="post-meta">@{post.quote.handle}</span>}</span>
          {post.quote.text && <span className="quote-text">{post.quote.text}</span>}
        </button>}
        {focus && post.time && <p className="post-meta focus-time"><time dateTime={post.dateTime ?? undefined}>{post.time}</time>{post.views && <> · <strong>{post.views}</strong> views</>}</p>}
        <ActionBar post={post} actions={actions} save={() => save(post)} />
      </div>
    </div>
  </article>;
});

function ActionBar({ post, actions, save }: { post: PostView; actions: PostActions | null; save(): void }) {
  const { navigate } = useNavigation();
  const open = useOpenRoute();
  return <div className="actions-bar">
    <button type="button" className="action" aria-label={`Reply${post.replies ? `, ${post.replies} replies` : ""}`}
      onClick={() => void navigate({ kind: "website", url: `${ORIGIN}/compose/post?in_reply_to=${post.postId}` })}>
      <Icon name="reply" /><span>{post.replies}</span>
    </button>
    <span className={post.reposted ? "action reposted" : "action"} aria-label={`${post.reposts || "No"} reposts`} role="img">
      <Icon name="repost" /><span>{post.reposts}</span>
    </span>
    <button type="button" className={post.liked ? "action liked" : "action"} aria-pressed={post.liked}
      disabled={!actions || !post.canLike || actions.pending} aria-label={`${post.liked ? "Unlike" : "Like"}${post.likes ? `, ${post.likes} likes` : ""}`}
      onClick={() => actions?.toggle("like", post.postId, !post.liked)}>
      <Icon name="heart" filled={post.liked} /><span>{post.likes}</span>
    </button>
    <button type="button" className="action" aria-label={`${post.views || "No"} views`} disabled={!post.views}
      onClick={() => open(`${post.url}/analytics`)}>
      <Icon name="views" /><span>{post.views}</span>
    </button>
    <button type="button" className={post.bookmarked ? "action bookmarked" : "action"} aria-pressed={post.bookmarked}
      disabled={!actions || !post.canBookmark || actions.pending} aria-label={post.bookmarked ? "Remove bookmark" : "Bookmark"}
      onClick={() => actions?.toggle("bookmark", post.postId, !post.bookmarked)}>
      <Icon name="bookmark" filled={post.bookmarked} />
    </button>
    <button type="button" className="action" aria-label="Save to categories" onClick={save}>
      <Icon name="folder" />
    </button>
  </div>;
}
