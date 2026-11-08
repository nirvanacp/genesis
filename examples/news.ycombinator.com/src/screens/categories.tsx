import { useState } from "react";
import type { StoredDocument } from "@genesis/sdk";
import { ScrollMemory } from "@genesis/sdk/react";
import { libraryMessage, useLibrary, useRepositories, type CategorySnapshot, type CategoryV1 } from "../library";
import { Notice, Skeleton } from "../components/ui";

/** Creates, renames and deletes Saved categories. Opened from Saved; Back closes it. */
export function CategoriesScreen() {
  const library = useLibrary();
  let body;
  if (!library.categories && library.error) body = <Notice title="Couldn't load categories" role="alert"><p>{libraryMessage(library.error)}</p></Notice>;
  else if (!library.categories) body = <Skeleton label="Loading categories" rows={3} kind="text" />;
  else body = <CategoryManager categories={library.categories} />;
  return <ScrollMemory className="screen">
    <p className="eyebrow">Saved stories</p>
    <h1 className="screen-title">Categories</h1>
    {body}
  </ScrollMemory>;
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
