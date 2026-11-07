import { ScrollMemory, useScreenSource } from "@genesis/sdk/react";
import type { PostData } from "../model";
import { PostCard, usePostActions } from "../components/post";
import { LoadError, Notice, OpenOnX, Skeleton } from "../components/ui";

/** A post with the thread above it and its replies. */
export function PostScreen() {
  const page = useScreenSource<PostData>();
  const { actions, error: actionError } = usePostActions(page.stale);
  const data = page.data;

  let body;
  if (!data?.focus) body = page.status === "error" ? <LoadError error={page.error} url={page.url} />
    : page.status === "unsupported" ? <Notice title="This post moved"><p>X sent this post somewhere the app doesn't show.</p>{page.url && <OpenOnX url={page.url} />}</Notice>
    : <Skeleton label="Loading post" rows={3} />;
  else body = <>
    {page.status === "error" && <p className="inline-error" role="alert">Couldn't refresh. Showing the last copy.</p>}
    {actionError != null && <p className="inline-error" role="alert">That didn't go through on X. Try again.</p>}
    <div className="feed thread">
      {data.ancestors.map(post => <PostCard key={post.postId} post={post} actions={actions} />)}
      <PostCard post={data.focus} actions={actions} focus />
    </div>
    {data.replies.length > 0 && <h2 className="section-title">Replies</h2>}
    <div className="feed">
      {data.replies.map(post => <PostCard key={post.postId} post={post} actions={actions} />)}
    </div>
    {data.partial && page.url && <div className="more"><OpenOnX url={page.url} label="See more replies on X" /></div>}
  </>;

  return <ScrollMemory className="screen" aria-busy={page.stale}>
    <h1 className="screen-title">Post</h1>
    {body}
  </ScrollMemory>;
}
