import { backendStorage } from "./backend";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { definePage, type AppletContext, type StoredDocument } from "@genesis/sdk";
import { CategoryRepository, activeMembership, type CategorySnapshot } from "./categories";
import { readBookmarkPage } from "./library-data";
import { BookmarkRepository, type BookmarkV1 } from "./repository";
import { openStoryDialog } from "./components/story-dialog";
import { CategoryManager } from "./components/category-manager";
import sharedCss from "./styles.css";
import libraryCss from "./library.css";
import theme from "./theme.css";
import { Icon, Navigation } from "./components/navigation";

export default definePage({
  mount(context, container) {
    const root = createRoot(container); root.render(<Library context={context} />);
    return () => root.unmount();
  },
});
function Library({ context }: { context: AppletContext }) {
  const [section, setSection] = useState<"saved" | "categories">("saved");
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<CategorySnapshot | null>(null);
  const [rows, setRows] = useState<StoredDocument<BookmarkV1>[]>([]);
  const [filter, setFilter] = useState("all"), [version, setVersion] = useState(0);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true), [done, setDone] = useState(false);
  const [scanned, setScanned] = useState(0), [missing, setMissing] = useState(0), [message, setMessage] = useState("");
  const [removeId, setRemoveId] = useState<string | null>(null), [removing, setRemoving] = useState(false);
  const request = useRef(0), active = useRef<AbortController | null>(null);
  const current = (id: number, controller: AbortController) => request.current === id && !controller.signal.aborted && !context.signal.aborted;
  const load = async (snapshot: CategorySnapshot, after: string | undefined, replace: boolean, id: number, controller: AbortController) => {
    setLoading(true); setScanned(0); setMessage("");
    try {
      const page = await readBookmarkPage(backendStorage(context), snapshot, filter, after, controller.signal,
        count => { if (current(id, controller)) setScanned(count); });
      if (!current(id, controller)) return;
      setRows(previous => replace ? page.entries : [...previous, ...page.entries]);
      setCursor(page.cursor); setDone(page.done); setScanned(page.scanned); setMissing(value => replace ? page.missing : value + page.missing);
    } catch (error) {
      if (!current(id, controller)) return;
      if ((error as { code?: string }).code === "CONFLICT") { setVersion(value => value + 1); }
      else setMessage((error as Error).message);
    } finally { if (current(id, controller)) setLoading(false); }
  };
  useEffect(() => backendStorage(context).onChanged(change => {
    if (change.changes.some(item => ["bookmarks", "bookmark-order", "categories", "category-meta", "category-names"].includes(item.collection))) {
      active.current?.abort(); request.current++; setVersion(value => value + 1);
    }
  }), [context]);
  useEffect(() => {
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    const id = ++request.current;
    setCursor(undefined); setDone(false); setScanned(0); setMissing(0); setLoading(true); setMessage("");
    void new CategoryRepository(backendStorage(context)).read().then(async snapshot => {
      if (!current(id, controller)) return;
      setCategories(snapshot);
      if (filter !== "all" && filter !== "uncategorized" && !snapshot.categories.some(category => category.value.id === filter)) {
        setFilter("all"); return;
      }
      await load(snapshot, undefined, true, id, controller);
    }).catch(error => { if (current(id, controller)) { setMessage((error as Error).message); setLoading(false); } });
    return () => { controller.abort(); request.current++; };
  }, [context, filter, version]);
  const selectFilter = (id: string) => {
    if (id === filter) return;
    active.current?.abort(); request.current++; setRows([]); setLoading(true); setFilter(id);
  };
  const cancel = () => {
    active.current?.abort(); request.current++; setLoading(false);
    setMessage("Scan canceled. Load more to resume from the last completed page.");
  };
  const more = () => {
    if (!categories || loading) return;
    const controller = new AbortController(); active.current = controller;
    void load(categories, cursor, false, ++request.current, controller);
  };
  const openDiscussion = async (url: string) => {
    try { await context.sources.open("primary", url); }
    catch (error) { if (!context.signal.aborted) setMessage((error as Error).message); }
  };
  const removeStory = async (record: StoredDocument<BookmarkV1>) => {
    if (removing) return;
    setRemoving(true); setMessage("");
    try {
      await new BookmarkRepository(backendStorage(context)).remove(record);
      setRows(previous => previous.filter(row => row.value.itemId !== record.value.itemId));
      setRemoveId(null);
    } catch (error) {
      setMessage(`Could not remove this story: ${(error as Error).message}. Reload the library before retrying.`);
      setRemoveId(null);
      setVersion(value => value + 1);
    } finally { setRemoving(false); }
  };
  const sortedCategories = [...(categories?.categories ?? [])].sort((a, b) => a.value.name.localeCompare(b.value.name));
  return <><style>{theme}{sharedCss}{libraryCss}</style><main className="library">
    <header><h1>{section === "categories" ? "Categories" : filter === "all" ? "Saved" : filter === "uncategorized" ? "Uncategorized" : categories?.categories.find(c => c.value.id === filter)?.value.name ?? "Saved"}</h1>
      <button className="manage-link" onClick={() => setSection(section === "saved" ? "categories" : "saved")}>{section === "saved" ? "Manage categories" : "Back to saved"}</button>
      <p className="muted">Saved on your connected backend · Network required</p></header>
    {section === "saved" && <><label className="search"><Icon name="search" /><input type="search" aria-label="Filter this page" placeholder="Filter this page" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <p className="filter-note">Filters stories loaded below. Use Load more to include older saves.</p></>}
    {categories && section === "categories" && <CategoryManager context={context} snapshot={categories} changed={() => setVersion(value => value + 1)} />}
    {section === "saved" && <><nav className="filters" aria-label="Bookmark filters">
      {[{ id: "all", name: "All" }, { id: "uncategorized", name: "Uncategorized" }, ...sortedCategories.map(record => record.value)]
        .map(category => <button key={category.id} aria-pressed={filter === category.id} onClick={() => selectFilter(category.id)}>{category.name}</button>)}
    </nav>
    <div className="library-status" role="status">{loading ? `Updating saved stories${scanned ? ` · ${scanned} checked` : ""}…` : `${rows.length} saved stories loaded${done ? "" : " · More available"}`}</div>
    {message && <p role="alert" className="notice">{message} <button onClick={() => setVersion(value => value + 1)}>Reload library</button></p>}
    {missing > 0 && <p className="notice">Skipped {missing} missing index targets. Existing data has been preserved.</p>}
    {!loading && done && rows.length === 0 && !message && <section className="empty"><h2>{filter === "all" ? "A place for the next good read" : "No stories in this filter"}</h2>
      <p>{filter === "all" ? "Browse Hacker News and save a story to keep it here." : "Edit a saved story to change its categories."}</p>
      {filter === "all" && <button onClick={() => { void context.sources.open("primary"); }}>Go to Home</button>}</section>}
    {query && !loading && !rows.some(record => record.value.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) && <p className="notice">No matches in loaded stories.{!done && " Load more to search the next page."}</p>}
    <ol className="stories">{rows.filter(record => record.value.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map(record => {
      const value = record.value, memberships = categories ? activeMembership(value.categoryIds, categories) : [];
      return <li key={value.itemId} className="story-card"><h2><button className="story-link" onClick={() => {
        if (value.articleUrl) window.location.assign(value.articleUrl);
        else void openDiscussion(value.discussionUrl);
      }}>{value.title}</button></h2>
        <div className="story-meta">{memberships.map(id => <span className="tag" key={id}>{categories?.categories.find(category => category.value.id === id)?.value.name}</span>)}
          <span>{value.articleUrl ? new URL(value.articleUrl).hostname : "news.ycombinator.com"}</span><span>Saved {new Date(value.savedAtMs).toLocaleDateString()}</span></div>
        <div className="row-actions"><button onClick={() => { void openDiscussion(value.discussionUrl); }}>Discussion</button>
          <button onClick={() => openStoryDialog(context, value)}>Edit</button>
          <button onClick={() => setRemoveId(value.itemId)}>Remove</button></div>
        {removeId === value.itemId && <div className="remove-prompt" role="group" aria-label={`Remove ${value.title}`}>
          <span>Remove this saved story?</span>
          <button disabled={removing} onClick={() => { void removeStory(record); }}>Remove story</button>
          <button disabled={removing} onClick={() => setRemoveId(null)}>Keep story</button>
        </div>}
      </li>;
    })}</ol>
    <div className="actions">{loading && scanned > 100 ? <button onClick={cancel}>Cancel scan</button> : !loading && !done && categories && <button className="primary" onClick={more}>Load more</button>}</div></>}
  </main><Navigation context={context} current="saved" error={setMessage} /></>;
}
