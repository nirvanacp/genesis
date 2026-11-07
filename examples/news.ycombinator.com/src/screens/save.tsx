import { useEffect, useMemo, useState } from "react";
import type { StoredDocument } from "@genesis/sdk";
import { ScrollMemory, useNavigation } from "@genesis/sdk/react";
import {
  activeMembership, libraryMessage, selectionChecks, useRepositories,
  type BookmarkV1, type CategorySnapshot, type StorySnapshot,
} from "../library";
import { validItemId } from "../model";
import { Notice, Skeleton } from "../components/ui";

/** Codes after which a write may or may not have happened; the screen rereads before a retry. */
const UNCERTAIN = ["DEADLINE", "SERVICE_UNREACHABLE", "SERVICE_FAILURE"];

function parseSnapshot(value: string | undefined): StorySnapshot | null {
  try {
    const parsed = JSON.parse(value ?? "") as StorySnapshot;
    return validItemId(parsed?.itemId) && typeof parsed.title === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/** Saves a story with categories, edits a saved one, or removes it. Back closes it. */
export function SaveScreen() {
  const { screen, back } = useNavigation();
  const { storage, bookmarkRepository, categoryRepository } = useRepositories();
  const snapshot = useMemo(() => parseSnapshot(screen.params.snapshot), [screen.params.snapshot]);
  const fromPage = screen.params.fresh === "1";
  const [state, setState] = useState<{ previous: StoredDocument<BookmarkV1> | null; categories: CategorySnapshot } | null>(null);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [reads, setReads] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [refresh, setRefresh] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const read = async () => {
    const [previous, categories] = await Promise.all([bookmarkRepository.get(snapshot!.itemId), categoryRepository.read()]);
    setState({ previous, categories });
    setSelected(current => current ?? activeMembership(previous?.value.categoryIds ?? [], categories));
    setReadFailed(false);
    return categories;
  };

  useEffect(() => {
    if (!snapshot) return;
    let active = true;
    Promise.all([bookmarkRepository.get(snapshot.itemId), categoryRepository.read()]).then(([previous, categories]) => {
      if (!active) return;
      setState({ previous, categories });
      setSelected(current => current ?? activeMembership(previous?.value.categoryIds ?? [], categories));
      setReadFailed(false);
    }, error => {
      if (!active) return;
      setMessage(libraryMessage(error));
      setReadFailed(true);
    });
    return () => { active = false; };
  }, [snapshot, bookmarkRepository, categoryRepository, reads]);

  if (!snapshot) return <div className="screen"><Notice title="Can't save this story" role="alert"><p>The story details are missing.</p></Notice></div>;
  const previous = state?.previous ?? null;
  const loading = !state && !readFailed;
  const blocked = busy || loading || readFailed;

  const perform = async (remove: boolean) => {
    if (blocked || !state || !selected) return;
    setBusy(true);
    setMessage("");
    try {
      if (remove && previous) await bookmarkRepository.remove(previous);
      else {
        const categoryIds = activeMembership(selected, state.categories);
        await bookmarkRepository.save(snapshot, previous, {
          refresh: refresh && fromPage, categoryIds, checks: selectionChecks(state.categories, categoryIds),
        });
      }
      back();
    } catch (error) {
      const code = (error as { code?: string }).code ?? "";
      setMessage(libraryMessage(error));
      if (code === "CONFLICT" || UNCERTAIN.includes(code)) {
        try {
          await read();
          setMessage(code === "CONFLICT"
            ? "This story or its categories changed. Review the current record and your selections, then try again."
            : "The result of the save was uncertain. The current record was reloaded. Review it before retrying.");
        } catch {
          setReadFailed(true);
          setMessage("The current record could not be reloaded. Reload it before retrying.");
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const createCategory = async () => {
    if (blocked) return;
    setBusy(true);
    setMessage("");
    try {
      const id = await categoryRepository.create(name);
      await read();
      setSelected(ids => [...new Set([...(ids ?? []), id])]);
      setName("");
      setMessage("Category created. Save to apply your selection.");
    } catch (error) {
      try {
        await read();
        setMessage(`${libraryMessage(error)} Categories were reloaded; review them before retrying.`);
      } catch {
        setReadFailed(true);
        setMessage("The new category could not be confirmed. Reload before retrying.");
      }
    } finally {
      setBusy(false);
      storage.refresh();
    }
  };

  return <ScrollMemory className="screen">
    <p className="eyebrow">Saved stories</p>
    <h1 className="screen-title">{previous ? "Edit saved story" : "Save story"}</h1>
    <section className="card">
      <p className="story-title">{previous?.value.title ?? snapshot.title}</p>
      <p className="meta">{snapshot.submitter ? `By ${snapshot.submitter} · ` : ""}HN item {snapshot.itemId}</p>
      <p className="meta">Saved in Genesis, separate from your HN favorites.</p>
    </section>
    {loading && <Skeleton label="Loading saved state" rows={3} kind="text" />}
    {state && selected && <fieldset className="card" disabled={blocked}>
      <legend>Categories</legend>
      {state.categories.categories.length === 0 && <p className="meta">No categories yet. Saving without one files the story under Uncategorized.</p>}
      {state.categories.categories.map(record => <label key={record.value.id} className="check">
        <input type="checkbox" checked={selected.includes(record.value.id)} onChange={event => {
          const id = record.value.id;
          setSelected(ids => event.target.checked ? [...(ids ?? []), id] : (ids ?? []).filter(entry => entry !== id));
        }} />
        {record.value.name}
      </label>)}
      <div className="row">
        <label className="grow"><span className="visually-hidden">New category name</span>
          <input placeholder="New category" value={name} onChange={event => setName(event.target.value)} />
        </label>
        <button type="button" className="secondary" disabled={!name.trim()} onClick={() => void createCategory()}>Create</button>
      </div>
      <p className="meta">A new category is kept even if you leave without saving.</p>
    </fieldset>}
    {previous && fromPage && <label className="check">
      <input type="checkbox" checked={refresh} disabled={busy} onChange={event => setRefresh(event.target.checked)} />
      Update the title and link from Hacker News
    </label>}
    {message && <p role="status" className="status">{message}</p>}
    {readFailed && <button type="button" className="secondary" disabled={busy} onClick={() => { setMessage(""); setReads(value => value + 1); }}>Reload saved state</button>}
    <div className="actions">
      <button type="button" className="primary" disabled={blocked} onClick={() => void perform(false)}>
        {busy ? "Saving…" : previous ? "Save changes" : "Save"}
      </button>
      <button type="button" className="secondary" disabled={busy} onClick={back}>Cancel</button>
      {previous && !confirmRemove && <button type="button" className="text-button danger-text" disabled={blocked} onClick={() => setConfirmRemove(true)}>Remove from Saved</button>}
    </div>
    {confirmRemove && <div className="confirm" role="group" aria-label="Confirm removal">
      <p>Remove this saved story? This can't be undone.</p>
      <button type="button" className="danger" disabled={busy} onClick={() => void perform(true)}>Remove story</button>
      <button type="button" className="secondary" disabled={busy} onClick={() => setConfirmRemove(false)}>Keep story</button>
    </div>}
  </ScrollMemory>;
}
