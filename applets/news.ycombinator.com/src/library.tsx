import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { definePage, type AppletContext, type StoredDocument } from "@genesis/sdk";
import { CategoryRepository, activeMembership, type CategorySnapshot } from "./categories";
import { readBookmarkPage } from "./library-data";
import type { BookmarkV1 } from "./repository";
import { openStoryDialog } from "./components/story-dialog";
import { CategoryManager } from "./components/category-manager";
import sharedCss from "./styles.css";
import libraryCss from "./library.css";

export default definePage({
  mount(context, container) {
    const root = createRoot(container); root.render(<Library context={context} />);
    return () => root.unmount();
  },
});
function Library({ context }: { context: AppletContext }) {
  const [categories, setCategories] = useState<CategorySnapshot | null>(null);
  const [rows, setRows] = useState<StoredDocument<BookmarkV1>[]>([]);
  const [filter, setFilter] = useState("all"), [version, setVersion] = useState(0);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true), [done, setDone] = useState(false);
  const [scanned, setScanned] = useState(0), [missing, setMissing] = useState(0), [message, setMessage] = useState("");
  const request = useRef(0), active = useRef<AbortController | null>(null);
  const current = (id: number, controller: AbortController) => request.current === id && !controller.signal.aborted && !context.signal.aborted;
  const load = async (snapshot: CategorySnapshot, after: string | undefined, replace: boolean, id: number, controller: AbortController) => {
    setLoading(true); setScanned(0); setMessage("");
    try {
      const page = await readBookmarkPage(context.storage, snapshot, filter, after, controller.signal,
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
  useEffect(() => context.storage.onChanged(change => {
    if (change.changes.some(item => ["bookmarks", "bookmark-order", "categories", "category-meta", "category-names"].includes(item.collection))) {
      active.current?.abort(); request.current++; setVersion(value => value + 1);
    }
  }), [context]);
  useEffect(() => {
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    const id = ++request.current;
    setRows([]); setCursor(undefined); setDone(false); setScanned(0); setMissing(0); setLoading(true); setMessage("");
    void new CategoryRepository(context.storage).read().then(async snapshot => {
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
  const sortedCategories = [...(categories?.categories ?? [])].sort((a, b) => a.value.name.localeCompare(b.value.name));
  return <><style>{sharedCss}{libraryCss}</style><main className="library">
    <header><p className="eyebrow">GENESIS / HACKER NEWS</p><h1>Your saved stories</h1>
      <p className="intro">Keep the stories you want to return to.</p>
      <p className="muted">Saved on this Genesis installation. Your library works offline. No account or sync.</p></header>
    <nav className="filters" aria-label="Bookmark filters">
      {[{ id: "all", name: "All" }, { id: "uncategorized", name: "Uncategorized" }, ...sortedCategories.map(record => record.value)]
        .map(category => <button key={category.id} aria-pressed={filter === category.id} onClick={() => selectFilter(category.id)}>{category.name}</button>)}
    </nav>
    {categories && <CategoryManager context={context} snapshot={categories} changed={() => setVersion(value => value + 1)} />}
    <div className="library-status" role="status">{loading ? `Reading saved stories. Scanned ${scanned} records…` : `${rows.length} ${rows.length === 1 ? "story" : "stories"} shown`}</div>
    {message && <p role="alert" className="notice">{message} <button onClick={() => setVersion(value => value + 1)}>Reload library</button></p>}
    {missing > 0 && <p className="notice">Skipped {missing} missing index targets. Existing data has been preserved.</p>}
    {!loading && done && rows.length === 0 && !message && <section className="empty"><h2>{filter === "all" ? "A place for the next good read" : "No stories in this filter"}</h2>
      <p>{filter === "all" ? "Browse Hacker News and choose Save to Genesis on a story. It will be here when you return." : "Edit a saved story to change its categories."}</p></section>}
    <ol className="stories">{rows.map(record => {
      const value = record.value, memberships = categories ? activeMembership(value.categoryIds, categories) : [];
      return <li key={value.itemId} className="story-card"><h2>{value.title}</h2>
        <p className="muted">{value.submitter ? `By ${value.submitter} · ` : ""}Saved {new Date(value.savedAtMs).toLocaleDateString()} · HN {value.itemId}</p>
        <p className="tags">{memberships.length ? memberships.map(id => categories?.categories.find(category => category.value.id === id)?.value.name).join(" · ") : "Uncategorized"}</p>
        <div className="row-actions"><button className="primary" onClick={() => { void openDiscussion(value.discussionUrl); }}>Open discussion</button>
          <button onClick={() => openStoryDialog(context, value)}>Edit / remove</button></div>
      </li>;
    })}</ol>
    <div className="actions">{loading ? <button onClick={cancel}>Cancel scan</button> : !done && categories && <button className="primary" onClick={more}>Load more</button>}
      <button onClick={() => { void context.sources.open("primary").catch(error => { if (!context.signal.aborted) setMessage(error.message); }); }}>Browse Hacker News</button></div>
  </main></>;
}
