import { useState } from "react";
import { ScrollMemory, useNavigation, usePage, useRecord, useRegion } from "@genesis/sdk/react";
import { profileUrl, searchUrl, type Person, type PostView, type Trend } from "../model";
import { PostCard } from "../components/post";
import { Avatar, Icon, LoadError, ModeTabs, Notice, Skeleton, useOpenUrl, Verified } from "../components/ui";
import { MoreButton } from "./feed";

const SEARCH_TABS = [{ id: "", label: "Top" }, { id: "live", label: "Latest" }, { id: "user", label: "People" }, { id: "media", label: "Media" }];

/** Explore's trends, and search and hashtag results, in the `explore` context. */
export function ExploreScreen() {
  const { navigate } = useNavigation();
  const page = usePage();
  const trends = useRegion<Trend | null>("trends");
  const people = useRegion<Person | null>("people");
  const results = useRegion<PostView | null>("results");
  const empty = useRecord<string | null>("empty", null);
  const open = useOpenUrl();
  const url = new URL(page.url ?? "https://x.com/explore");
  const path = url.pathname;
  const query = path === "/search" ? page.params.q ?? "" : path.startsWith("/hashtag/") ? `#${page.params.tag}` : "";
  const tab = url.searchParams.get("f") ?? "";
  const [draft, setDraft] = useState(query);
  const here = page.pageId === "explore";
  const shown = { trends: here ? trends.order : [], people: here ? people.order : [], results: here ? results.order : [] };
  const actionable = page.account !== null && !page.stale && !results.ephemeral;

  let body;
  if (!shown.trends.length && !shown.people.length && !shown.results.length) {
    body = here && page.status === "ready" ? <Notice title={empty?.data ?? "No results"}><p>Try a different search.</p></Notice>
      : page.status === "error" ? <LoadError error={page.error} />
      : <Skeleton label={query ? "Searching" : "Loading trends"} />;
  } else body = <>
    {page.status === "error" && <p className="inline-error" role="alert">Couldn't refresh. Showing the last copy.</p>}
    {shown.trends.length > 0 && <section aria-label="Trends">
      {!query && <h2 className="section-title">Trends for you</h2>}
      {shown.trends.map(key => {
        const trend = trends.get(key)?.data;
        return trend && <button type="button" key={key} className="trend" onClick={() => open(searchUrl(trend.name))}>
          {trend.context && <span className="post-meta">{trend.context}</span>}
          <strong>{trend.name}</strong>
          {trend.meta && <span className="post-meta">{trend.meta}</span>}
        </button>;
      })}
    </section>}
    {shown.people.length > 0 && <section aria-label="People">
      {tab !== "user" && <h2 className="section-title">People</h2>}
      {shown.people.map(key => {
        const person = people.get(key)?.data;
        return person && <PersonRow key={key} person={person} />;
      })}
    </section>}
    {shown.results.length > 0 && <div className="feed">
      {shown.results.map(key => {
        const post = results.get(key)?.data;
        return post && <PostCard key={key} post={post} region="results" actionable={actionable} />;
      })}
    </div>}
    {query && <MoreButton stale={page.stale} />}
  </>;

  return <ScrollMemory className="screen" aria-busy={page.stale || page.status === "loading"}>
    <form role="search" className="search-form" onSubmit={event => {
      event.preventDefault();
      const value = draft.trim();
      if (value) navigate({ url: searchUrl(value, tab || undefined), mode: query ? "replace" : "push" });
    }}>
      <label className="search-field">
        <Icon name="search" />
        <span className="visually-hidden">Search X</span>
        <input type="search" enterKeyHint="search" placeholder="Search" value={draft} onChange={event => setDraft(event.target.value)} />
      </label>
    </form>
    {query && <ModeTabs label="Result type" active={tab} options={SEARCH_TABS.map(option => ({
      ...option, go: () => navigate({ url: searchUrl(query, option.id || undefined), mode: "replace" }),
    }))} />}
    {body}
  </ScrollMemory>;
}

export function PersonRow({ person }: { person: Person }) {
  const open = useOpenUrl();
  return <button type="button" className="person" onClick={() => open(profileUrl(person.handle))}>
    <Avatar src={person.avatar} />
    <span className="person-body">
      <span className="post-head"><strong>{person.name}</strong>{person.verified && <Verified />}</span>
      <span className="post-meta">@{person.handle}</span>
      {person.description && <span className="person-bio">{person.description}</span>}
    </span>
  </button>;
}
