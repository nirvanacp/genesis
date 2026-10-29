import { serviceMessage } from "@genesis/sdk";
import { backendStorage } from "../backend";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { GenesisError, type AppletContext, type StoredDocument } from "@genesis/sdk";
import type { StorySnapshot } from "../extract-item";
import { BookmarkRepository, type BookmarkV1 } from "../repository";
import { CategoryRepository, activeMembership, selectionChecks, type CategorySnapshot } from "../categories";
import css from "../styles.css";
import theme from "../theme.css";

export function openStoryDialog(ctx: AppletContext, snapshot: Readonly<StorySnapshot>): void {
  let close = () => {};
  close = ctx.ui.openModal("Genesis bookmark", container => {
    const root = createRoot(container);
    root.render(<StoryDialog context={ctx} snapshot={snapshot} close={() => close()} />);
    return () => root.unmount();
  });
}
function StoryDialog({ context, snapshot, close }: { context: AppletContext; snapshot: Readonly<StorySnapshot>; close(): void }) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [previous, setPrevious] = useState<StoredDocument<BookmarkV1> | null>(null);
  const [categories, setCategories] = useState<CategorySnapshot | null>(null);
  const [selected, setSelected] = useState<string[]>([]), [name, setName] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [readFailed, setReadFailed] = useState(false), [reload, setReload] = useState(0);
  const [refresh, setRefresh] = useState(false), [message, setMessage] = useState("");
  const alive = useRef(true), initialized = useRef(false);
  useEffect(() => {
    alive.current = true; setLoading(true); setReadFailed(false);
    void Promise.all([new BookmarkRepository(backendStorage(context)).get(snapshot.itemId), new CategoryRepository(backendStorage(context)).read()])
      .then(([record, current]) => {
        if (alive.current) {
          setPrevious(record); setCategories(current);
          if (!initialized.current) setSelected(activeMembership(record?.value.categoryIds ?? [], current));
          initialized.current = true;
          setMessage(""); setLoading(false);
        }
      }).catch(error => { if (alive.current) { setMessage(serviceMessage(error)); setReadFailed(true); setLoading(false); } });
    return () => { alive.current = false; };
  }, [context, snapshot.itemId, reload]);
  const reread = async () => {
    const [record, current] = await Promise.all([
      new BookmarkRepository(backendStorage(context)).get(snapshot.itemId), new CategoryRepository(backendStorage(context)).read(),
    ]);
    if (alive.current) { setPrevious(record); setCategories(current); setReadFailed(false); }
  };
  const perform = async (remove: boolean) => {
    if (busy || loading || readFailed || !categories) return;
    setBusy(true); setMessage("");
    const repository = new BookmarkRepository(backendStorage(context));
    try {
      if (remove && previous) await repository.remove(previous);
      else {
        const categoryIds = activeMembership(selected, categories);
        await repository.save(snapshot, previous, { refresh: refresh && context.sourceId !== null,
          categoryIds, checks: selectionChecks(categories, categoryIds) });
      }
      if (alive.current && !context.signal.aborted) close();
    } catch (error) {
      const reason = error as GenesisError;
      if (alive.current) setMessage(reason.message ?? String(error));
      if (reason.code === "CONFLICT" || ["TIMEOUT", "SERVICE_UNREACHABLE", "SERVICE_FAILURE", "RPC_TIMEOUT"].includes(reason.code) || reason.message?.includes("timed out")) {
        try {
          await reread();
          if (alive.current) setMessage(reason.code === "CONFLICT"
            ? "This story or its categories changed. Review the current record and your selections, then try again."
            : "The save outcome was uncertain. The current record was reloaded. Review before retrying.");
        } catch { if (alive.current) { setReadFailed(true); setMessage("The current record could not be reloaded. Reload saved state before retrying."); } }
      }
    } finally { if (alive.current) setBusy(false); }
  };
  const createCategory = async () => {
    if (busy || loading || readFailed) return;
    setBusy(true); setMessage("");
    try {
      const repository = new CategoryRepository(backendStorage(context)), id = await repository.create(name);
      const current = await repository.read();
      if (alive.current) { setCategories(current); setSelected(ids => [...new Set([...ids, id])]); setName(""); setMessage("Category created. Save this bookmark to apply its selection."); }
    } catch (error) {
      try {
        const current = await new CategoryRepository(backendStorage(context)).read();
        if (alive.current) { setCategories(current); setMessage(`${(error as Error).message} Categories reloaded; review before retrying.`); }
      } catch { if (alive.current) { setReadFailed(true); setMessage("Category creation could not be confirmed. Reload saved state before retrying."); } }
    } finally { if (alive.current) setBusy(false); }
  };
  return <><style>{theme}{css}{"section[role=dialog]{background:var(--paper)!important;color:var(--ink)!important;border-radius:22px!important}"}</style><div className="genesis-dialog">
    <div className="dialog-heading"><p className="eyebrow">SAVED STORIES</p><button disabled={busy} onClick={close}>Cancel</button></div><h2>{previous ? "Edit saved story" : "Save this story"}</h2>
    <p className="story-title">{previous?.value.title ?? snapshot.title}</p>
    <p className="muted">{snapshot.submitter ? `By ${snapshot.submitter} · ` : ""}HN item {snapshot.itemId}</p>
    <p className="muted">Saved in Genesis. No Hacker News account required.</p>
    {!loading && categories && <fieldset disabled={busy || readFailed}><legend>Categories</legend>
      {categories.categories.length === 0 && <p className="muted">No categories yet. Save without one to use Uncategorized.</p>}
      {categories.categories.map(record => <label key={record.value.id}><input type="checkbox"
        checked={selected.includes(record.value.id)} onChange={event => setSelected(ids => event.target.checked ? [...ids, record.value.id] : ids.filter(id => id !== record.value.id))} />{record.value.name}</label>)}
      <label className="stack">New category<input aria-label="New category name" value={name} onChange={event => setName(event.target.value)} /></label>
      <button disabled={!name.trim()} onClick={() => { void createCategory(); }}>Create category</button>
      <p className="muted">Creating a category saves it immediately, even if you cancel this bookmark.</p>
    </fieldset>}
    {previous && context.sourceId !== null && <label><input type="checkbox" checked={refresh} onChange={event => setRefresh(event.target.checked)} disabled={busy} /> Refresh title and link from this page</label>}
    {loading && <p role="status">Loading saved state…</p>}
    {message && <p role="status" className="notice">{message}</p>}
    {readFailed && <button disabled={busy} onClick={() => setReload(value => value + 1)}>Reload saved state</button>}
    <div className="actions"><button className="primary" disabled={busy || loading || readFailed} onClick={() => { void perform(false); }}>{busy ? "Working…" : previous ? "Save changes" : "Save to Genesis"}</button>
      <button disabled={busy} onClick={close}>Cancel</button>
      {previous && <button className="danger" disabled={busy || loading || readFailed} onClick={() => setConfirmRemove(true)}>Remove bookmark</button>}</div>
    {confirmRemove && <div className="confirm-remove" role="group" aria-label="Confirm removal"><p>Remove this saved story? This cannot be undone.</p><div className="actions"><button className="danger" disabled={busy} onClick={() => { void perform(true); }}>Remove story</button><button disabled={busy} onClick={() => setConfirmRemove(false)}>Keep story</button></div></div>}
  </div></>;
}
