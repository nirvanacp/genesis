import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { GenesisError, type AppletContext, type StoredDocument } from "@genesis/sdk";
import type { StorySnapshot } from "../extract-item";
import { BookmarkRepository, type BookmarkV1 } from "../repository";
import css from "../styles.css";

export function openStoryDialog(ctx: AppletContext, snapshot: Readonly<StorySnapshot>): void {
  let close = () => {};
  close = ctx.ui.openModal("Genesis bookmark", container => {
    const root = createRoot(container);
    root.render(<StoryDialog context={ctx} snapshot={snapshot} close={() => close()} />);
    return () => root.unmount();
  });
}
function StoryDialog({ context, snapshot, close }: { context: AppletContext; snapshot: Readonly<StorySnapshot>; close(): void }) {
  const [previous, setPrevious] = useState<StoredDocument<BookmarkV1> | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [refresh, setRefresh] = useState(false), [message, setMessage] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    void new BookmarkRepository(context.storage).get(snapshot.itemId).then(record => {
      if (alive.current) { setPrevious(record); setLoading(false); }
    }).catch(error => { if (alive.current) { setMessage(String(error.message ?? error)); setReadFailed(true); setLoading(false); } });
    return () => { alive.current = false; };
  }, [context, snapshot.itemId]);
  const perform = async (remove: boolean) => {
    if (busy || loading || readFailed) return;
    setBusy(true); setMessage("");
    const repository = new BookmarkRepository(context.storage);
    try {
      if (remove && previous) await repository.remove(previous);
      else await repository.save(snapshot, previous, { refresh });
      if (alive.current && !context.signal.aborted) close();
    } catch (error) {
      const reason = error as GenesisError;
      if (alive.current) setMessage(reason.message ?? String(error));
      if (reason.code === "CONFLICT" || reason.message?.includes("timed out")) {
        try {
          const record = await repository.get(snapshot.itemId);
          if (alive.current) {
            setPrevious(record);
            setMessage(reason.code === "CONFLICT" ? "This story changed. Review the current record, then try again." : "The save outcome was uncertain. The current record was reloaded. Review before retrying.");
          }
        } catch { /* Preserve the original error and the user's choices. */ }
      }
    } finally { if (alive.current) setBusy(false); }
  };
  return <><style>{css}</style><div className="genesis-dialog">
    <p className="eyebrow">GENESIS BOOKMARKS</p><h2>{previous ? "Edit saved story" : "Save this story"}</h2>
    <p className="story-title">{previous?.value.title ?? snapshot.title}</p>
    <p className="muted">{snapshot.submitter ? `By ${snapshot.submitter} · ` : ""}HN item {snapshot.itemId}</p>
    <p className="muted">Saved locally in Genesis. No Hacker News account required.</p>
    {previous && <label><input type="checkbox" checked={refresh} onChange={event => setRefresh(event.target.checked)} disabled={busy} /> Refresh title and link from this page</label>}
    {loading && <p role="status">Loading saved state…</p>}
    {message && <p role="alert" className="error">{message}</p>}
    <div className="actions"><button className="primary" disabled={busy || loading || readFailed} onClick={() => { void perform(false); }}>{busy ? "Saving…" : previous ? "Save changes" : "Save to Genesis"}</button>
      <button disabled={busy} onClick={close}>Cancel</button>
      {previous && <button className="danger" disabled={busy || loading || readFailed} onClick={() => { void perform(true); }}>Remove bookmark</button>}</div>
  </div></>;
}
