import { memo, useState } from "react";
import { useAction, useNavigation, usePending } from "@genesis/sdk/react";
import { snapshotOf } from "../library";
import { ORIGIN, profileUrl, type PostView } from "../model";
import { Avatar, Icon, RichText, useOpenUrl, Verified } from "./ui";

/**
 * A like or bookmark control's shown state. A pending call shows its target state until the page
 * confirms it; the adapter's action clicks X's own control.
 */
function useToggle(region: string, key: string, name: "setLiked" | "setBookmarked", field: "liked" | "bookmarked", value: boolean) {
  const pending = usePending(region, key);
  const act = useAction<Record<string, boolean>>(name, region);
  const [failed, setFailed] = useState(false);
  const call = [...pending].reverse().find(action => action.name === name);
  const shown = call ? (call.args as Record<string, boolean>)[field] : value;
  const toggle = () => {
    setFailed(false);
    void act(key, { [field]: !shown }).then(result => setFailed(result.outcome === "failed"));
  };
  return { shown, busy: call !== undefined, failed, toggle };
}

/** Opens the category editor for a post read from the current page. */
export function useSaveToCategories() {
  const { navigate } = useNavigation();
  return (post: PostView) => navigate({
    screen: "save",
    params: { post: JSON.stringify({ postId: post.postId, url: post.url, snapshot: snapshotOf(post) }) },
  });
}

/**
 * A post of `region`, keyed by its post id. `actionable` is false when the page cannot act on
 * it: signed out, a stale copy, or a region whose keys are positions.
 */
export const PostCard = memo(function PostCard({ post, region, actionable, focus = false }: {
  post: PostView; region: string; actionable: boolean; focus?: boolean;
}) {
  const open = useOpenUrl();
  const { viewWebsite } = useNavigation();
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
        {post.videos > 0 && <button type="button" className="video-tile" onClick={() => focus ? viewWebsite() : open(post.url)}>
          <span>Video</span><span className="post-meta">Play on X <Icon name="external" /></span>
        </button>}
        {post.quote && <button type="button" className="quote" disabled={!post.quote.url} onClick={() => post.quote?.url && open(post.quote.url)}>
          <span className="post-head"><strong>{post.quote.name}</strong>{post.quote.handle && <span className="post-meta">@{post.quote.handle}</span>}</span>
          {post.quote.text && <span className="quote-text">{post.quote.text}</span>}
        </button>}
        {focus && post.time && <p className="post-meta focus-time"><time dateTime={post.dateTime ?? undefined}>{post.time}</time>{post.views && <> · <strong>{post.views}</strong> views</>}</p>}
        <ActionBar post={post} region={region} actionable={actionable} save={() => save(post)} />
      </div>
    </div>
  </article>;
});

function ActionBar({ post, region, actionable, save }: { post: PostView; region: string; actionable: boolean; save(): void }) {
  const open = useOpenUrl();
  const like = useToggle(region, post.postId, "setLiked", "liked", post.liked);
  const bookmark = useToggle(region, post.postId, "setBookmarked", "bookmarked", post.bookmarked);
  return <>
    <div className="actions-bar">
      <button type="button" className="action" aria-label={`Reply${post.replies ? `, ${post.replies} replies` : ""}`}
        onClick={() => open(`${ORIGIN}/compose/post?in_reply_to=${post.postId}`)}>
        <Icon name="reply" /><span>{post.replies}</span>
      </button>
      <span className={post.reposted ? "action reposted" : "action"} aria-label={`${post.reposts || "No"} reposts`} role="img">
        <Icon name="repost" /><span>{post.reposts}</span>
      </span>
      <button type="button" className={like.shown ? "action liked" : "action"} aria-pressed={like.shown}
        disabled={!actionable || !post.canLike || like.busy} aria-label={`${like.shown ? "Unlike" : "Like"}${post.likes ? `, ${post.likes} likes` : ""}`}
        onClick={like.toggle}>
        <Icon name="heart" filled={like.shown} /><span>{post.likes}</span>
      </button>
      <button type="button" className="action" aria-label={`${post.views || "No"} views`} disabled={!post.views}
        onClick={() => open(`${post.url}/analytics`)}>
        <Icon name="views" /><span>{post.views}</span>
      </button>
      <button type="button" className={bookmark.shown ? "action bookmarked" : "action"} aria-pressed={bookmark.shown}
        disabled={!actionable || !post.canBookmark || bookmark.busy} aria-label={bookmark.shown ? "Remove bookmark" : "Bookmark"}
        onClick={bookmark.toggle}>
        <Icon name="bookmark" filled={bookmark.shown} />
      </button>
      <button type="button" className="action" aria-label="Save to categories" onClick={save}>
        <Icon name="folder" />
      </button>
    </div>
    {(like.failed || bookmark.failed) && <p className="inline-error" role="alert">That didn't go through on X. Try again.</p>}
  </>;
}
