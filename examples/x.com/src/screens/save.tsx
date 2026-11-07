import { useEffect, useMemo, useState } from "react";
import { ScrollMemory, useNavigation } from "@genesis/sdk/react";
import { libraryMessage, useLibrary } from "../library";
import { CATEGORY_LIMIT, MEMBERSHIP_LIMIT, postUrl, validateName, validId, validSnapshot, type Membership, type Snapshot } from "../model";
import { Notice, Skeleton } from "../components/ui";
import { LibraryGate } from "./categories";

interface SavePost { postId: string; url: string; snapshot: Snapshot }

function parsePost(value: string | undefined): SavePost | null {
  try {
    const parsed = JSON.parse(value ?? "") as SavePost;
    return validId(parsed?.postId) && postUrl(parsed.url)?.postId === parsed.postId && validSnapshot(parsed.snapshot) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Files a post into categories. It is a full screen rather than a sheet, so the keyboard never
 * covers the category field. Back closes it without saving.
 */
export function SaveScreen() {
  const { screen, back } = useNavigation();
  const library = useLibrary();
  const post = useMemo(() => parsePost(screen.params.post), [screen.params.post]);
  const [membership, setMembership] = useState<Membership | null | undefined>(undefined);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [reads, setReads] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { service } = library;
  const usable = !!library.library && !library.error && !library.pending;

  useEffect(() => {
    if (!post || !usable) return;
    let active = true;
    service.lookup(post.postId).then(record => {
      if (!active) return;
      setMembership(record);
      setSelected(record?.categoryIds ?? []);
    }, error => { if (active) setMessage(libraryMessage(error)); });
    return () => { active = false; };
  }, [post, usable, service, reads]);

  if (!post) return <div className="screen"><Notice title="Can't file this post" role="alert"><p>The post details are missing.</p></Notice></div>;
  const live = new Set(library.categories.map(category => category.id));
  const choice = (selected ?? []).filter(id => live.has(id));
  const full = choice.length >= MEMBERSHIP_LIMIT;

  /** Reads the record again after a conflict or an unknown outcome, so the next try starts from what the service has. */
  const failed = (error: unknown) => {
    const code = (error as { code?: string }).code;
    setMessage(code === "CONFLICT" ? "This post's categories changed elsewhere. They were reloaded; review them and save again." : libraryMessage(error));
    if (code === "CONFLICT") { setSelected(null); setReads(value => value + 1); }
  };

  const save = async () => {
    setBusy(true);
    setMessage("");
    try {
      await library.operate("bookmark.setCategories", {
        postId: post.postId, expectedRevision: membership?.revision ?? null, categoryIds: choice,
        ...membership ? {} : { url: post.url, snapshot: post.snapshot },
      }, post.postId);
      back();
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!membership) return;
    setBusy(true);
    setMessage("");
    try {
      await library.operate("bookmark.remove", { postId: post.postId, expectedRevision: membership.revision }, post.postId);
      back();
    } catch (error) {
      setConfirmRemove(false);
      failed(error);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    const problem = validateName(name);
    if (problem) { setMessage(problem); return; }
    setBusy(true);
    setMessage("");
    const id = crypto.randomUUID();
    try {
      await library.operate("category.create", { id, name }, id);
      setName("");
      if (!full) setSelected(ids => [...new Set([...(ids ?? []), id])]);
    } catch (error) {
      setMessage(libraryMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const ready = usable && membership !== undefined && selected !== null;
  return <ScrollMemory className="screen">
    <h1 className="screen-title">{membership ? "Edit categories" : "Save to categories"}</h1>
    <section className="card">
      <p className="post-head"><strong>{post.snapshot.authorName}</strong> <span className="post-meta">@{post.snapshot.authorHandle}</span></p>
      {post.snapshot.text && <p className="post-text clamp" dir="auto">{post.snapshot.text}</p>}
      <p className="post-meta">Categories are kept by this app, separate from your X bookmarks.</p>
    </section>
    <LibraryGate library={library}>
      {!ready ? <Skeleton label="Loading categories" rows={3} kind="text" /> : <>
        <fieldset className="card" disabled={busy}>
          <legend>Categories</legend>
          {library.categories.length === 0 && <p className="post-meta">No categories yet. Create one below.</p>}
          {library.categories.map(category => {
            const checked = choice.includes(category.id);
            return <label key={category.id} className="check">
              <input type="checkbox" checked={checked} disabled={!checked && full} onChange={event => {
                const id = category.id;
                setSelected(ids => event.target.checked ? [...(ids ?? []), id] : (ids ?? []).filter(entry => entry !== id));
              }} />
              <span className="grow">{category.name}</span>
              <span className="post-meta">{category.count}</span>
            </label>;
          })}
          {full && <p className="post-meta">A post can be in up to {MEMBERSHIP_LIMIT} categories.</p>}
          {library.categories.length < CATEGORY_LIMIT
            ? <form className="row" onSubmit={event => { event.preventDefault(); void create(); }}>
                <label className="grow"><span className="visually-hidden">New category name</span>
                  <input placeholder="New category" value={name} maxLength={80} enterKeyHint="done" onChange={event => setName(event.target.value)} />
                </label>
                <button type="submit" className="secondary" disabled={!name.trim()}>Create</button>
              </form>
            : <p className="post-meta">You have {CATEGORY_LIMIT} categories, the most allowed.</p>}
        </fieldset>
        {message && <p role="status" className="status">{message}</p>}
        <div className="actions">
          <button type="button" className="primary" disabled={busy || choice.length === 0} onClick={() => void save()}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={back}>Cancel</button>
          {membership && !confirmRemove && <button type="button" className="text-button danger-text" disabled={busy} onClick={() => setConfirmRemove(true)}>Remove from Categories</button>}
        </div>
        {choice.length === 0 && <p className="post-meta">{membership ? "Choose a category, or remove the post from Categories." : "Choose at least one category."}</p>}
        {confirmRemove && <div className="confirm" role="group" aria-label="Confirm removal">
          <p>Remove this post from Categories? Its X bookmark will stay unchanged.</p>
          <button type="button" className="danger" disabled={busy} onClick={() => void remove()}>Remove</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => setConfirmRemove(false)}>Keep</button>
        </div>}
      </>}
    </LibraryGate>
    {!library.error && message && !ready && <p role="status" className="status">{message}</p>}
  </ScrollMemory>;
}
