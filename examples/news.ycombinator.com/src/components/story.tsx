import { memo, useState, type CSSProperties } from "react";
import { useAction, useNavigation, usePending } from "@genesis/sdk/react";
import { snapshotOf } from "../library";
import { itemUrl, ORIGIN, userUrl, type CommentEntry, type Story } from "../model";
import { Icon, Meta, RichText, useOpenUrl } from "./ui";

/**
 * The vote an item shows and a way to change it. A pending `setVoted` call shows its target
 * state until the page confirms it; the adapter's `setVoted` clicks HN's own vote link.
 */
function useVote(region: string, id: string, voted: boolean) {
  const pending = usePending(region, id);
  const setVoted = useAction<{ voted: boolean }>("setVoted", region);
  const [failed, setFailed] = useState(false);
  const call = [...pending].reverse().find(action => action.name === "setVoted");
  const shown = call ? (call.args as { voted: boolean }).voted : voted;
  const toggle = () => {
    setFailed(false);
    void setVoted(id, { voted: !shown }).then(result => setFailed(result.outcome === "failed"));
  };
  return { shown, busy: call !== undefined, failed, toggle };
}

type Vote = ReturnType<typeof useVote>;

/** The upvote arrow. Signed out, HN shows no arrows, and neither does the app. */
function VoteButton({ vote, canVote, title, signedIn, small = false }: {
  vote: Vote; canVote: boolean; title: string; signedIn: boolean; small?: boolean;
}) {
  const className = `vote${small ? " small" : ""}${vote.shown ? " voted" : ""}`;
  if (!signedIn || (!canVote && !vote.shown)) return <span className={className} aria-hidden="true" />;
  return <button type="button" className={`${className} icon-button`} aria-pressed={vote.shown} disabled={vote.busy}
    aria-label={vote.shown ? `Remove upvote: ${title}` : `Upvote: ${title}`} onClick={vote.toggle}>
    <Icon name="up" filled={vote.shown} />
  </button>;
}

const VoteFailed = ({ vote }: { vote: Vote }) =>
  vote.failed ? <p className="inline-error" role="alert">The vote didn't go through. Try again.</p> : null;

/** Opens the save editor for a story read from the current page. */
function useSaveStory() {
  const { navigate } = useNavigation();
  return (story: Story) => navigate({ screen: "save", params: { snapshot: JSON.stringify(snapshotOf(story)), fresh: "1" } });
}

/** A story in a list (`region` "stories") or at the top of its discussion (`region` "story"). */
export const StoryRow = memo(function StoryRow({ story, region, signedIn, heading = false }: {
  story: Story; region: string; signedIn: boolean; heading?: boolean;
}) {
  const open = useOpenUrl();
  const vote = useVote(region, story.id, story.voted);
  const save = useSaveStory();
  const Title = heading ? "h1" : "h2";
  const discussion = itemUrl(story.id);
  return <article className="story">
    {story.rank && !heading && <span className="rank" aria-hidden="true">{story.rank}</span>}
    <VoteButton vote={vote} canVote={story.canVote} title={story.title} signedIn={signedIn} />
    <div className="story-body">
      <Title className="story-title">
        <a href={story.articleUrl ?? discussion} onClick={event => { event.preventDefault(); open(story.articleUrl ?? discussion); }}>
          {story.title}
        </a>
        {story.domain && <span className="domain"> ({story.domain})</span>}
      </Title>
      <Meta parts={[
        story.score,
        story.submitter && <a href={userUrl(story.submitter)} onClick={event => { event.preventDefault(); open(userUrl(story.submitter!)); }}>{story.submitter}</a>,
        story.age,
        story.comments && !heading && <a href={discussion} onClick={event => { event.preventDefault(); open(discussion); }}>{story.comments}</a>,
      ]} />
      <VoteFailed vote={vote} />
    </div>
    <button type="button" className="icon-button" aria-label={`Save story: ${story.title}`} onClick={() => save(story)}>
      <Icon name="bookmark" />
    </button>
  </article>;
});

/** HN's reply page for a comment, which returns to the comment in its thread. */
const replyUrl = (id: string, storyId: string) =>
  `${ORIGIN}/reply?id=${id}&goto=${encodeURIComponent(`item?id=${storyId}#${id}`)}`;

/**
 * A comment in a thread (`region` "comments") or at the top of its own page (`region` "story").
 * `onLink` handles links in the text, so links to comments on the same page can reveal them.
 */
export const CommentRow = memo(function CommentRow({ entry, region, storyId, signedIn, collapsed, hidden, onToggle, onLink, head = false }: {
  entry: CommentEntry;
  region: string;
  storyId: string;
  signedIn: boolean;
  collapsed?: boolean;
  hidden?: number;
  onToggle?: (id: string) => void;
  onLink: (url: string) => void;
  head?: boolean;
}) {
  const open = useOpenUrl();
  const vote = useVote(region, entry.id, entry.voted);
  const author = entry.author;
  return <article className="comment" id={`comment-${entry.id}`} style={{ "--depth": Math.min(entry.depth, 8) } as CSSProperties}>
    <header className="comment-head">
      <VoteButton small vote={vote} canVote={entry.canVote} title={`comment by ${author ?? "unknown"}`} signedIn={signedIn} />
      <Meta parts={[
        author && <a href={userUrl(author)} onClick={event => { event.preventDefault(); open(userUrl(author)); }}><strong>{author}</strong></a>,
        entry.age,
        head && entry.onStory && <a href={itemUrl(entry.onStory.id)} onClick={event => { event.preventDefault(); open(itemUrl(entry.onStory!.id)); }}>on: {entry.onStory.title}</a>,
      ]} />
      {onToggle && <button type="button" className="text-button" aria-expanded={!collapsed} onClick={() => onToggle(entry.id)}>
        {collapsed ? `Show${hidden ? ` (${hidden + 1})` : ""}` : "Hide"}
      </button>}
    </header>
    {!collapsed && <>
      <RichText parts={entry.parts} onLink={onLink} />
      <VoteFailed vote={vote} />
      <nav className="comment-links" aria-label="Comment links">
        {entry.links.map(link => <a key={link.label + link.url} href={link.url} onClick={event => { event.preventDefault(); onLink(link.url); }}>{link.label}</a>)}
        {entry.canReply && <a href={replyUrl(entry.id, storyId)} onClick={event => { event.preventDefault(); open(replyUrl(entry.id, storyId)); }}>
          reply
        </a>}
      </nav>
    </>}
  </article>;
});
