import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollMemory, usePage, useRecord, useRegion, type RegionView } from "@genesis/sdk/react";
import { ORIGIN, type CommentEntry, type ItemHead, type MoreLink } from "../model";
import { CommentRow, StoryRow } from "../components/story";
import { loginUrl, LoadError, Notice, RichText, Skeleton, useOpenUrl } from "../components/ui";

/** For each comment, the ids of its ancestors (from the depths in page order) and how many replies it holds. */
function threadOf(comments: RegionView<CommentEntry | null>) {
  const ancestors = new Map<string, string[]>();
  const replies = new Map<string, number>();
  const path: { id: string; depth: number }[] = [];
  for (const key of comments.order) {
    const entry = comments.get(key)?.data;
    if (!entry) continue;
    while (path.length > 0 && path[path.length - 1].depth >= entry.depth) path.pop();
    ancestors.set(key, path.map(parent => parent.id));
    for (const parent of path) replies.set(parent.id, (replies.get(parent.id) ?? 0) + 1);
    path.push({ id: key, depth: entry.depth });
  }
  return { ancestors, replies };
}

/**
 * A discussion (`/item?id=`): the story or comment at the top, then the thread. Comment rows
 * are `memo` components keyed by comment id; the callbacks they get keep their identity.
 */
export function ItemScreen() {
  const page = usePage();
  const head = useRecord<ItemHead>("story", null);
  const comments = useRegion<CommentEntry | null>("comments");
  const more = useRecord<MoreLink>("more", null);
  const open = useOpenUrl();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [target, setTarget] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const { ancestors, replies } = useMemo(() => threadOf(comments), [comments]);
  const signedIn = page.account !== null;
  const data = page.pageId === "item" ? head?.data ?? null : null;
  const id = data?.story?.id ?? data?.comment?.id ?? page.params.id ?? "";
  const storyId = data?.comment?.onStory?.id ?? id;

  // Callbacks read the latest thread through a ref so memo rows keep the same props.
  const latest = useRef({ ancestors, url: page.url });
  latest.current = { ancestors, url: page.url };

  // Scroll to a comment after its collapsed ancestors have opened.
  useEffect(() => {
    if (!target) return;
    container.current?.querySelector(`[id="comment-${target}"]`)?.scrollIntoView({ block: "start" });
    setTarget(null);
  }, [target]);

  /** A link to a comment on this page reveals it; anything else goes through the manifest. */
  const follow = useCallback((url: string) => {
    const { ancestors, url: pageUrl } = latest.current;
    const link = new URL(url);
    const comment = link.hash.slice(1);
    link.hash = "";
    const here = pageUrl ? new URL(pageUrl) : null;
    if (here) here.hash = "";
    if (comment && here && link.href === here.href && ancestors.has(comment)) {
      setCollapsed(current => new Set([...current].filter(entry => entry !== comment && !ancestors.get(comment)!.includes(entry))));
      setTarget(comment);
    } else open(url);
  }, [open]);

  const toggle = useCallback((key: string) => setCollapsed(current => {
    const next = new Set(current);
    if (!next.delete(key)) next.add(key);
    return next;
  }), []);

  if (!data) return <div className="screen" aria-busy={page.status === "loading"}>
    {page.status === "error" ? <LoadError error={page.error} /> : <Skeleton label="Loading discussion" />}
  </div>;

  const keys = page.pageId === "item" ? comments.order : [];
  const visible = keys.filter(key => !ancestors.get(key)?.some(parent => collapsed.has(parent)));
  const goto = `item?id=${id}`;

  return <ScrollMemory className="screen" aria-busy={page.stale}>
    <div ref={container}>
      {page.status === "error" && <p className="inline-error" role="alert">Couldn't refresh. Showing the last copy.</p>}
      {data.story && <StoryRow heading story={data.story} region="story" signedIn={signedIn} />}
      {data.comment && <CommentRow head entry={data.comment} region="story" storyId={storyId} signedIn={signedIn} onLink={follow} />}
      {data.text.length > 0 && <div className="toptext"><RichText parts={data.text} onLink={follow} /></div>}
      {signedIn && data.canComment && <button type="button" className="secondary" onClick={() =>
        open(`${ORIGIN}/reply?id=${id}&goto=${encodeURIComponent(goto)}`)}>Add a comment</button>}
      {!signedIn && <button type="button" className="secondary" onClick={() => open(loginUrl(goto))}>Sign in to comment</button>}
      <h2 className="section-title">{keys.length === 0 ? "No comments yet" : "Comments"}</h2>
      {comments.status === "error" && <p className="inline-error" role="alert">Some comments couldn't be read.</p>}
      {visible.map(key => {
        const entry = comments.get(key)?.data;
        return entry && <CommentRow key={key} entry={entry} region="comments" storyId={storyId} signedIn={signedIn}
          collapsed={collapsed.has(key)} hidden={replies.get(key) ?? 0} onToggle={toggle} onLink={follow} />;
      })}
      {more && <button type="button" className="secondary more" disabled={page.stale} onClick={() => open(more.data.url)}>
        More comments
      </button>}
    </div>
  </ScrollMemory>;
}
