import { useEffect, useRef, useState } from "react";
import type { AppletContext, StoredDocument } from "@genesis/sdk";
import { CategoryRepository, type CategorySnapshot, type CategoryV1 } from "../categories";
export function CategoryManager({ context, snapshot, changed }: { context: AppletContext; snapshot: CategorySnapshot; changed(): void }) {
  const [name, setName] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const run = async (operation: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setMessage("");
    try { await operation(); if (alive.current) { setMessage("Category saved."); changed(); } }
    catch (error) { if (alive.current) { setMessage(`${(error as Error).message} Reload and review before retrying.`); changed(); } }
    finally { if (alive.current) setBusy(false); }
  };
  const repository = new CategoryRepository(context.storage);
  return <details className="category-manager"><summary>Manage categories</summary>
    <p className="muted">Categories are saved immediately. Deleting one keeps its bookmarks.</p>
    {message && <p role="status" className="notice">{message}</p>}
    <form onSubmit={event => { event.preventDefault(); void run(async () => { await repository.create(name); if (alive.current) setName(""); }); }}>
      <label className="stack">New category<input aria-label="New library category name" value={name} onChange={event => setName(event.target.value)} disabled={busy} /></label>
      <button disabled={busy || !name.trim()}>Create category</button>
    </form>
    <p className="muted">{snapshot.categories.length} of 50 active categories</p>
    {snapshot.categories.map(record => <CategoryRow key={record.value.id} record={record} busy={busy}
      rename={value => { void run(() => repository.rename(record, value)); }} remove={() => { void run(() => repository.remove(record)); }} />)}
  </details>;
}
function CategoryRow({ record, busy, rename, remove }: { record: StoredDocument<CategoryV1>; busy: boolean; rename(value: string): void; remove(): void }) {
  const [name, setName] = useState(record.value.name);
  useEffect(() => setName(record.value.name), [record.value.name]);
  return <div className="category-row"><label className="stack">Category name<input aria-label={`Rename ${record.value.name}`} value={name} onChange={event => setName(event.target.value)} disabled={busy} /></label>
    <div className="row-actions"><button disabled={busy || !name.trim() || name === record.value.name} onClick={() => rename(name)}>Rename</button>
      <button className="danger" disabled={busy} onClick={remove}>Delete category</button></div></div>;
}
