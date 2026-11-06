import { useState } from "react";
import { ScrollMemory, useNavigation, useScreenSource } from "@genesis/sdk/react";
import { profileUrl, searchUrl, type ExploreData, type Person } from "../model";
import { usePostActions } from "../components/post";
import { Avatar, Icon, LoadError, ModeTabs, Notice, OpenOnX, Skeleton, useOpenRoute, Verified } from "../components/ui";
import { FeedList } from "./feed";

const SEARCH_TABS = [{ id: "", label: "Top" }, { id: "live", label: "Latest" }, { id: "user", label: "People" }, { id: "media", label: "Media" }];

/** Explore's trends, and search and hashtag results. */
export function ExploreScreen() {
  const { screen, navigate } = useNavigation();
  const page = useScreenSource<ExploreData>();
  const { actions, error: actionError } = usePostActions(page.stale);
  const open = useOpenRoute();
  const routeId = screen.source?.routeId ?? "explore";
  const query = routeId === "search" ? page.params.q ?? "" : routeId === "hashtag" ? `#${page.params.tag}` : "";
  const tab = new URL(screen.source?.url ?? "https://x.com/").searchParams.get("f") ?? "";
  const [draft, setDraft] = useState(query);
  const data = page.data;

  let body;
  if (!data) body = page.status === "error" ? <LoadError error={page.error} url={page.url} />
    : page.status === "unsupported" ? <Notice title="This page moved"><p>X sent this search somewhere the app doesn't show.</p>{page.url && <OpenOnX url={page.url} />}</Notice>
    : <Skeleton label={query ? "Searching" : "Loading trends"} />;
  else if (!data.items.length && !data.trends.length && !data.people.length) body = <Notice title={data.emptyText ?? "No results"}>
    <p>Try a different search.</p>
  </Notice>;
  else body = <>
    {page.status === "error" && <p className="inline-error" role="alert">Couldn't refresh. Showing the last copy.</p>}
    {actionError != null && <p className="inline-error" role="alert">That didn't go through on X. Try again.</p>}
    {data.trends.length > 0 && <section aria-label="Trends">
      {!query && <h2 className="section-title">Trends for you</h2>}
      {data.trends.map(trend => <button type="button" key={trend.context + trend.name} className="trend" onClick={() => open(searchUrl(trend.name))}>
        <span className="post-meta">{trend.context}</span>
        <strong>{trend.name}</strong>
        {trend.meta && <span className="post-meta">{trend.meta}</span>}
      </button>)}
    </section>}
    {data.people.length > 0 && <section aria-label="People">
      {tab !== "user" && <h2 className="section-title">People</h2>}
      {data.people.map(person => <PersonRow key={person.handle} person={person} />)}
    </section>}
    {data.items.length > 0 && <FeedList items={data.items} actions={actions} />}
    {data.partial && page.url && <div className="more"><OpenOnX url={page.url} label="See more on X" /></div>}
  </>;

  return <ScrollMemory className="screen" aria-busy={page.stale}>
    <form role="search" className="search-form" onSubmit={event => {
      event.preventDefault();
      const value = draft.trim();
      if (value) void navigate({ kind: "route", url: searchUrl(value, tab || undefined), mode: routeId === "explore" ? "push" : "replace" });
    }}>
      <label className="search-field">
        <Icon name="search" />
        <span className="visually-hidden">Search X</span>
        <input type="search" enterKeyHint="search" placeholder="Search" value={draft} onChange={event => setDraft(event.target.value)} />
      </label>
    </form>
    {query && <ModeTabs label="Result type" active={tab} options={SEARCH_TABS.map(option => ({
      ...option, go: () => void navigate({ kind: "route", url: searchUrl(query, option.id || undefined), mode: "replace" }),
    }))} />}
    {body}
  </ScrollMemory>;
}

export function PersonRow({ person }: { person: Person }) {
  const open = useOpenRoute();
  return <button type="button" className="person" onClick={() => open(profileUrl(person.handle))}>
    <Avatar src={person.avatar} />
    <span className="person-body">
      <span className="post-head"><strong>{person.name}</strong>{person.verified && <Verified />}</span>
      <span className="post-meta">@{person.handle}</span>
      {person.description && <span className="person-bio">{person.description}</span>}
    </span>
  </button>;
}
