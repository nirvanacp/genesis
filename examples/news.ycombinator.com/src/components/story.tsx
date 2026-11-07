import { memo, type CSSProperties } from "react";
import { useNavigation } from "@genesis/sdk/react";
import { snapshotOf } from "../library";
import { itemUrl, userUrl, type CommentEntry, type Story } from "../model";
import { Icon, Meta, RichText, useOpenRoute } from "./ui";

/** Opens the save editor for a story read from the current page. */
export function useSaveStory() {
  const { navigate } = useNavigation();
  return (story: Story) => void navigate({
    kind: "screen", id: "save", params: { snapshot: JSON.stringify(snapshotOf(story)), fresh: "1" },
  });
}

export interface StoryActions {
  vote?: (id: string) => void;
  voting?: boolean;
}

export const StoryRow = memo(function StoryRow({ story, actions, heading = false }: {
  story: Story; actions: StoryActions; heading?: boolean;
}) {
  const open = useOpenRoute();
  const save = useSaveStory();
  const Title = heading ? "h1" : "h2";
  const discussion = itemUrl(story.id);
  return <article className="story">
    {story.rank && !heading && <span className="rank" aria-hidden="true">{story.rank}</span>}
    <VoteButton story={story} actions={actions} />
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
    </div>
    <button type="button" className="icon-button" aria-label={`Save story: ${story.title}`} onClick={() => save(story)}>
      <Icon name="bookmark" />
    </button>
  </article>;
});

function VoteButton({ story, actions }: { story: Story; actions: StoryActions }) {
  if (story.voted) return <span className="vote voted" role="img" aria-label="Upvoted"><Icon name="up" filled /></span>;
  if (!story.canVote || !actions.vote) return <span className="vote" aria-hidden="true" />;
  return <button type="button" className="vote icon-button" disabled={actions.voting}
    aria-label={`Upvote: ${story.title}`} onClick={() => actions.vote!(story.id)}>
    <Icon name="up" />
  </button>;
}

export function CommentView({ entry, collapsed, hidden, toggle, onLink, showStory = false }: {
  entry: CommentEntry;
  collapsed?: boolean;
  hidden?: number;
  toggle?: () => void;
  onLink?: (url: string) => void;
  showStory?: boolean;
}) {
  const open = useOpenRoute();
  const follow = onLink ?? open;
  const { navigate } = useNavigation();
  return <article className="comment" id={`comment-${entry.id}`} style={{ "--depth": Math.min(entry.depth, 8) } as CSSProperties}>
    <header className="comment-head">
      <Meta parts={[
        entry.author && <a href={userUrl(entry.author)} onClick={event => { event.preventDefault(); open(userUrl(entry.author!)); }}><strong>{entry.author}</strong></a>,
        entry.age,
        showStory && entry.onStory && <a href={itemUrl(entry.onStory.id)} onClick={event => { event.preventDefault(); open(itemUrl(entry.onStory!.id)); }}>on: {entry.onStory.title}</a>,
      ]} />
      {toggle && <button type="button" className="text-button" aria-expanded={!collapsed} onClick={toggle}>
        {collapsed ? `Show${hidden ? ` (${hidden + 1})` : ""}` : "Hide"}
      </button>}
    </header>
    {!collapsed && <>
      <RichText parts={entry.parts} onLink={follow} />
      <nav className="comment-links" aria-label="Comment links">
        {entry.links.map(link => <a key={link.label + link.url} href={link.url} onClick={event => { event.preventDefault(); follow(link.url); }}>{link.label}</a>)}
        {entry.canReply && <a href={`${itemUrl(entry.id).replace("/item", "/reply")}`} onClick={event => {
          event.preventDefault();
          void navigate({ kind: "website", url: itemUrl(entry.id).replace("/item", "/reply") });
        }}>reply <Icon name="external" /></a>}
      </nav>
    </>}
  </article>;
}
