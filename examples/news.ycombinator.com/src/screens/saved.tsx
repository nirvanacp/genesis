import { useMemo, useState } from "react";
import type { StoredDocument } from "@genesis/sdk";
import { ScrollMemory, useNavigation } from "@genesis/sdk/react";
import { activeMembership, libraryMessage, useLibrary, type BookmarkV1, type CategorySnapshot } from "../library";
import { userUrl } from "../model";
import { Meta, Notice, Skeleton, useOpenUrl } from "../components/ui";

const matches = (bookmark: BookmarkV1, filter: string, categories: CategorySnapshot) => {
  const memberships = activeMembership(bookmark.categoryIds, categories);
  return filter === "all" || (filter === "uncategorized" ? memberships.length === 0 : memberships.includes(filter));
};

export function SavedScreen() {
  const { screen, navigate } = useNavigation();
  const library = useLibrary();
  const [query, setQuery] = useState("");
  const categories = library.categories;
  const wanted = screen?.params.filter;
  const filter = categories?.categories.some(record => record.value.id === wanted) || wanted === "uncategorized" ? wanted! : "all";
  const setFilter = (value: string) => navigate({ screen: "saved", params: { filter: value }, mode: "replace" });

  const shown = useMemo(() => {
    if (!categories) return [];
    const needle = query.trim().toLowerCase();
    return library.bookmarks.filter(record => matches(record.value, filter, categories)
      && (!needle || record.value.title.toLowerCase().includes(needle)));
  }, [library.bookmarks, categories, filter, query]);

  let body;
  if (!categories && library.error) body = <Notice title="Couldn't load saved stories" role="alert"><p>{libraryMessage(library.error)}</p></Notice>;
  else if (!categories || library.loading) body = <Skeleton label="Loading saved stories" />;
  else body = <>
    {library.error != null && <p className="inline-error" role="alert">{libraryMessage(library.error)}</p>}
    <nav className="chips" aria-label="Filter saved stories">
      {[{ id: "all", name: "All" }, { id: "uncategorized", name: "Uncategorized" }, ...categories.categories.map(record => record.value)]
        .map(option => <button type="button" key={option.id} className="chip" aria-pressed={filter === option.id}
          onClick={() => setFilter(option.id)}>{option.name}</button>)}
    </nav>
    <label className="search-field">
      <span className="visually-hidden">Filter by title</span>
      <input type="search" placeholder="Filter by title" value={query} onChange={event => setQuery(event.target.value)} />
    </label>
    {shown.length === 0
      ? <Notice title={library.bookmarks.length === 0 ? "No saved stories" : "No matches"}>
          <p>{library.bookmarks.length === 0 ? "Use the bookmark button on any story to save it here." : "Try another filter or title."}</p>
        </Notice>
      : shown.map(record => <SavedRow key={record.key} record={record} categories={categories} />)}
    <button type="button" className="secondary" onClick={() => navigate({ screen: "categories" })}>Manage categories</button>
  </>;

  return <ScrollMemory className="screen">
    <h1 className="screen-title">Saved</h1>
    {body}
  </ScrollMemory>;
}

function SavedRow({ record, categories }: { record: StoredDocument<BookmarkV1>; categories: CategorySnapshot }) {
  const { navigate } = useNavigation();
  const open = useOpenUrl();
  const story = record.value;
  const names = activeMembership(story.categoryIds, categories)
    .map(id => categories.categories.find(category => category.value.id === id)!.value.name);
  return <article className="story saved">
    <div className="story-body">
      <h2 className="story-title">
        <a href={story.articleUrl ?? story.discussionUrl} onClick={event => { event.preventDefault(); open(story.articleUrl ?? story.discussionUrl); }}>{story.title}</a>
      </h2>
      <Meta parts={[
        story.submitter && <a href={userUrl(story.submitter)} onClick={event => { event.preventDefault(); open(userUrl(story.submitter!)); }}>{story.submitter}</a>,
        <a href={story.discussionUrl} onClick={event => { event.preventDefault(); open(story.discussionUrl); }}>discussion</a>,
        names.length > 0 ? names.join(", ") : "Uncategorized",
      ]} />
    </div>
    <button type="button" className="text-button" aria-label={`Edit saved story: ${story.title}`} onClick={() =>
      navigate({ screen: "save", params: { snapshot: JSON.stringify(story) } })}>Edit</button>
  </article>;
}
