import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollMemory, useIntent, useNavigation, useScreenSource } from "@genesis/sdk/react";
import { itemUrl, type CommentEntry, type ItemData } from "../model";
import { CommentView, StoryRow } from "../components/story";
import { Icon, LoadError, Notice, RichText, Skeleton, useOpenRoute } from "../components/ui";

/** For each comment, the ids of its ancestors, from the depth of the flat page order. */
function ancestorsOf(comments: CommentEntry[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const path: CommentEntry[] = [];
  for (const entry of comments) {
    while (path.length > 0 && path[path.length - 1].depth >= entry.depth) path.pop();
    result.set(entry.id, path.map(parent => parent.id));
    path.push(entry);
  }
  return result;
}

export function ItemScreen() {
  const { screen, navigate } = useNavigation();
  const page = useScreenSource<ItemData>();
  const vote = useIntent("primary");
  const open = useOpenRoute();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const data = page.data;
  const comments = data?.comments ?? [];
  const ancestors = useMemo(() => ancestorsOf(comments), [comments]);
  const pageUrl = screen.source?.url ?? "";

  // Scroll to a comment after its collapsed ancestors have opened.
  useEffect(() => {
    if (!target) return;
    container.current?.querySelector(`[id="comment-${target}"]`)?.scrollIntoView({ block: "start" });
    setTarget(null);
  }, [target]);

  /** Links to a comment on this page reveal it; anything else goes through the manifest. */
  const follow = (url: string) => {
    const link = new URL(url);
    const id = link.hash.slice(1);
    link.hash = "";
    const here = new URL(pageUrl || itemUrl("1"));
    here.hash = "";
    if (id && link.href === here.href && ancestors.has(id)) {
      setCollapsed(current => new Set([...current].filter(entry => entry !== id && !ancestors.get(id)!.includes(entry))));
      setTarget(id);
    } else open(url);
  };

  if (page.status === "unsupported") return <div className="screen"><Notice title="This item moved"><p>Hacker News sent this link somewhere the app doesn't show.</p></Notice></div>;
  if (!data) return <div className="screen">{page.status === "error"
    ? <LoadError error={page.error} url={page.url} />
    : <Skeleton label="Loading discussion" />}</div>;

  const toggle = (id: string) => setCollapsed(current => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  const hiddenCount = (id: string) => comments.filter(entry => ancestors.get(entry.id)!.includes(id)).length;
  const visible = comments.filter(entry => !ancestors.get(entry.id)!.some(id => collapsed.has(id)));
  const commentUrl = data.story ? itemUrl(data.story.id) : data.comment ? itemUrl(data.comment.id) : page.url;

  return <ScrollMemory className="screen" aria-busy={page.stale}>
    <div ref={container}>
      {page.status === "error" && <p className="inline-error" role="alert">Couldn't refresh. Showing the last copy.</p>}
      {data.story && <StoryRow heading story={data.story}
        actions={{ vote: id => void vote.act({ name: "vote", id }).catch(() => {}), voting: vote.pending }} />}
      {data.comment && <CommentView entry={data.comment} onLink={follow} showStory />}
      {data.text.length > 0 && <div className="toptext"><RichText parts={data.text} onLink={follow} /></div>}
      {data.canComment && commentUrl && <button type="button" className="secondary" onClick={() =>
        void navigate({ kind: "website", url: commentUrl })}>Add a comment <Icon name="external" /></button>}
      <h2 className="section-title">{comments.length === 0 ? "No comments yet" : "Comments"}</h2>
      {visible.map(entry => <CommentView key={entry.id} entry={entry} onLink={follow}
        collapsed={collapsed.has(entry.id)} hidden={hiddenCount(entry.id)} toggle={() => toggle(entry.id)} />)}
      {data.partial && <Notice title="More comments on Hacker News">
        <p>This thread is longer than the app shows at once.</p>
        <button type="button" className="secondary" onClick={() => void navigate({ kind: "website", url: page.url ?? commentUrl! })}>
          Open the full thread <Icon name="external" />
        </button>
      </Notice>}
    </div>
  </ScrollMemory>;
}
