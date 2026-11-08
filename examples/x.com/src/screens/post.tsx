import { ScrollMemory, usePage, useRecord, useRegion } from "@genesis/sdk/react";
import type { FeedItem, PostView } from "../model";
import { PostCard } from "../components/post";
import { LoadError, Notice, Skeleton } from "../components/ui";

/**
 * A post with the thread above it and its replies. X shows them as one column; the post the URL
 * names splits it into the posts above and the replies below.
 */
export function PostScreen() {
  const page = usePage();
  const thread = useRegion<FeedItem | null>("thread");
  const empty = useRecord<string | null>("empty", null);
  const keys = page.pageId === "post" ? thread.order : [];
  const posts = keys.flatMap(key => {
    const item = thread.get(key)?.data;
    return item?.kind === "post" ? [{ key, post: item.post }] : [];
  });
  const focus = posts.findIndex(({ post }) => post.postId === page.params.id);
  const actionable = page.account !== null && !page.stale && !thread.ephemeral;
  const card = ({ key, post }: { key: string; post: PostView }, isFocus = false) =>
    <PostCard key={key} post={post} region="thread" actionable={actionable} focus={isFocus} />;

  let body;
  if (focus < 0) body = page.status === "error" ? <LoadError error={page.error} />
    : page.status === "ready" && page.pageId === "post" ? <Notice title={empty?.data ?? "This post isn't available"}><p>X has nothing to show for it.</p></Notice>
    : <Skeleton label="Loading post" rows={3} />;
  else {
    const replies = posts.slice(focus + 1);
    body = <>
      {page.status === "error" && <p className="inline-error" role="alert">Couldn't refresh. Showing the last copy.</p>}
      <div className="feed thread">
        {posts.slice(0, focus).map(entry => card(entry))}
        {card(posts[focus], true)}
      </div>
      {replies.length > 0 && <h2 className="section-title">Replies</h2>}
      <div className="feed">{replies.map(entry => card(entry))}</div>
    </>;
  }

  return <ScrollMemory className="screen" aria-busy={page.stale || page.status === "loading"}>
    <h1 className="screen-title">Post</h1>
    {body}
  </ScrollMemory>;
}
