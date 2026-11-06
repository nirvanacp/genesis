import { useMemo, useState } from "react";
import type { StoredDocument } from "@genesis/sdk";
import { ScrollMemory, useNavigation } from "@genesis/sdk/react";
import { activeMembership, libraryMessage, useLibrary, useRepositories, type BookmarkV1, type CategorySnapshot, type CategoryV1 } from "../library";
import { userUrl } from "../model";
import { Meta, Notice, Skeleton, useOpenRoute } from "../components/ui";

const matches = (bookmark: BookmarkV1, filter: string, categories: CategorySnapshot) => {
  const memberships = activeMembership(bookmark.categoryIds, categories);
  return filter === "all" || (filter === "uncategorized" ? memberships.length === 0 : memberships.includes(filter));
};

export function SavedScreen() {
  const { screen, navigate } = useNavigation();
  const library = useLibrary();
  const [query, setQuery] = useState("");
  const [managing, setManaging] = useState(false);
  const categories = library.categories;
  const filter = categories?.categories.some(record => record.value.id === screen.params.filter) || screen.params.filter === "uncategorized"
    ? screen.params.filter : "all";
  const setFilter = (value: string) => void navigate({ kind: "screen", id: "saved", params: { filter: value }, mode: "replace" });

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
    <button type="button" className="secondary" aria-expanded={managing} onClick={() => setManaging(value => !value)}>
      {managing ? "Done managing categories" : "Manage categories"}
    </button>
    {managing && <CategoryManager categories={categories} />}
  </>;

  return <ScrollMemory className="screen">
    <h1 className="screen-title">Saved</h1>
    {body}
  </ScrollMemory>;
}

function SavedRow({ record, categories }: { record: StoredDocument<BookmarkV1>; categories: CategorySnapshot }) {
  const { navigate } = useNavigation();
  const open = useOpenRoute();
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
      void navigate({ kind: "screen", id: "save", params: { snapshot: JSON.stringify(story) } })}>Edit</button>
  </article>;
}

function CategoryManager({ categories }: { categories: CategorySnapshot }) {
  const { categoryRepository, storage } = useRepositories();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const run = async (operation: () => Promise<unknown>, done: string) => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await operation();
      setMessage(done);
    } catch (error) {
      storage.refresh();
      setMessage(`${libraryMessage(error)} The list has been reread; review it before retrying.`);
    } finally {
      setBusy(false);
    }
  };
  return <section className="card manager" aria-busy={busy} aria-label="Manage categories">
    <p className="meta">Changes save immediately. Deleting a category keeps its stories, which become Uncategorized.</p>
    {message && <p role="status" className="status">{message}</p>}
    <form className="row" onSubmit={event => {
      event.preventDefault();
      void run(async () => { await categoryRepository.create(name); setName(""); }, "Category created.");
    }}>
      <label className="grow"><span className="visually-hidden">New category name</span>
        <input placeholder="New category" value={name} disabled={busy} onChange={event => setName(event.target.value)} />
      </label>
      <button type="submit" className="primary" disabled={busy || !name.trim()}>Create</button>
    </form>
    <p className="meta">{categories.categories.length} of 50 categories</p>
    {categories.categories.map(record => <CategoryRow key={`${record.value.id}:${record.revision}`} record={record} busy={busy}
      rename={value => void run(() => categoryRepository.rename(record, value), "Category renamed.")}
      remove={() => void run(() => categoryRepository.remove(record), "Category deleted.")} />)}
  </section>;
}

function CategoryRow({ record, busy, rename, remove }: {
  record: StoredDocument<CategoryV1>; busy: boolean; rename(value: string): void; remove(): void;
}) {
  const [name, setName] = useState(record.value.name);
  const [confirming, setConfirming] = useState(false);
  return <div className="category">
    <div className="row">
      <label className="grow"><span className="visually-hidden">Rename {record.value.name}</span>
        <input value={name} disabled={busy} onChange={event => setName(event.target.value)} />
      </label>
      <button type="button" className="secondary" disabled={busy || !name.trim() || name === record.value.name} onClick={() => rename(name)}>Rename</button>
      <button type="button" className="text-button danger-text" disabled={busy} onClick={() => setConfirming(true)}>Delete</button>
    </div>
    {confirming && <div className="confirm" role="group" aria-label={`Delete ${record.value.name}`}>
      <p>Delete “{record.value.name}”? Its stories stay saved.</p>
      <button type="button" className="danger" disabled={busy} onClick={remove}>Delete category permanently</button>
      <button type="button" className="secondary" disabled={busy} onClick={() => setConfirming(false)}>Keep category</button>
    </div>}
  </div>;
}
