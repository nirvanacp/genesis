import { useState } from "react";
import { ScrollMemory } from "@genesis/sdk/react";
import { libraryMessage, useLibrary } from "../library";
import { CATEGORY_LIMIT, validateName, type Category } from "../model";
import { LibraryGate } from "./categories";

/** Create, rename and delete categories. A category with posts in it can't be deleted. */
export function ManageScreen() {
  const library = useLibrary();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const run = async (kind: string, payload: Record<string, unknown>, recordId: string) => {
    setBusy(true);
    setMessage("");
    try {
      await library.operate(kind, payload, recordId);
      return true;
    } catch (error) {
      setMessage(libraryMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    const problem = validateName(name);
    if (problem) { setMessage(problem); return; }
    const id = crypto.randomUUID();
    if (await run("category.create", { id, name }, id)) setName("");
  };

  const count = library.categories.length;
  return <ScrollMemory className="screen">
    <h1 className="screen-title">Manage categories</h1>
    <LibraryGate library={library}>
      <p className="post-meta">{count} of {CATEGORY_LIMIT} categories</p>
      {count < CATEGORY_LIMIT && <form className="row" onSubmit={event => { event.preventDefault(); void create(); }}>
        <label className="grow"><span className="visually-hidden">New category name</span>
          <input placeholder="New category" value={name} maxLength={80} enterKeyHint="done" disabled={busy} onChange={event => setName(event.target.value)} />
        </label>
        <button type="submit" className="primary" disabled={busy || !name.trim()}>Create</button>
      </form>}
      {message && <p role="status" className="status">{message}</p>}
      <div className="category-list">
        {library.categories.map(category => <CategoryRow key={category.id} category={category} busy={busy} run={run} />)}
      </div>
    </LibraryGate>
  </ScrollMemory>;
}

function CategoryRow({ category, busy, run }: {
  category: Category; busy: boolean; run(kind: string, payload: Record<string, unknown>, recordId: string): Promise<boolean>;
}) {
  const [mode, setMode] = useState<"view" | "rename" | "delete">("view");
  const [name, setName] = useState(category.name);
  const [problem, setProblem] = useState("");

  if (mode === "rename") return <form className="category" onSubmit={async event => {
    event.preventDefault();
    const invalid = validateName(name);
    if (invalid) { setProblem(invalid); return; }
    if (await run("category.rename", { id: category.id, expectedRevision: category.revision, name }, category.id)) setMode("view");
  }}>
    <label><span className="visually-hidden">Name for {category.name}</span>
      <input value={name} maxLength={80} autoFocus enterKeyHint="done" onChange={event => { setName(event.target.value); setProblem(""); }} />
    </label>
    {problem && <p className="field-error">{problem}</p>}
    <div className="actions">
      <button type="submit" className="primary" disabled={busy || !name.trim()}>Save</button>
      <button type="button" className="secondary" disabled={busy} onClick={() => { setName(category.name); setMode("view"); }}>Cancel</button>
    </div>
  </form>;

  return <div className="category">
    <div className="category-head">
      <span className="grow"><strong>{category.name}</strong> <span className="post-meta">{category.count} {category.count === 1 ? "post" : "posts"}</span></span>
      <button type="button" className="text-button" disabled={busy} onClick={() => setMode("rename")}>Rename</button>
      <button type="button" className="text-button danger-text" disabled={busy} onClick={() => setMode("delete")}>Delete</button>
    </div>
    {mode === "delete" && <div className="confirm" role="group" aria-label={`Confirm deleting ${category.name}`}>
      <p>{category.count ? `Delete “${category.name}”? Move or remove its ${category.count} saved posts first.` : `Delete “${category.name}”?`}</p>
      <button type="button" className="danger" disabled={busy} onClick={async () => {
        if (await run("category.delete", { id: category.id, expectedRevision: category.revision }, category.id)) setMode("view");
      }}>Delete</button>
      <button type="button" className="secondary" disabled={busy} onClick={() => setMode("view")}>Keep</button>
    </div>}
  </div>;
}
