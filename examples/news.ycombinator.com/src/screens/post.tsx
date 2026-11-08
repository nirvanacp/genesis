import { useEffect, useState } from "react";
import { ScrollMemory, useAction, useNavigation, usePage, useRecord } from "@genesis/sdk/react";
import { ORIGIN, safeUrl, TITLE_LIMIT, type SubmitForm } from "../model";
import { LoadError, Notice, Skeleton, useOpenUrl } from "../components/ui";

type Sent = "accepted" | "unknown" | null;

/**
 * HN's submit form, rebuilt (the `post` context). The values go into HN's own fields and HN's
 * own form posts them, so HN decides the outcome. Signed out, Genesis shows HN's login page.
 */
export function PostScreen() {
  const page = usePage();
  const { setLeaveGuard } = useNavigation();
  const form = useRecord<SubmitForm>("form", null);
  const setField = useAction<{ name: string; value: string }>("setField", "form");
  const submit = useAction("submit", "form");
  const open = useOpenUrl();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent>(null);
  const shown = page.pageId === "submit" && !page.stale ? form?.data ?? null : null;
  // A rejected submission lands on `/r`, a new history entry that mounts this screen again with
  // empty fields. HN's returned form carries the draft back, so the fields start from it once.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded || !shown) return;
    setSeeded(true);
    setTitle(shown.title);
    setUrl(shown.url);
    setText(shown.text);
  }, [seeded, shown]);
  const draft = sent === null && (title.trim() !== "" || url.trim() !== "" || text.trim() !== "");
  useEffect(() => setLeaveGuard(draft ? "Discard this post?" : null), [draft, setLeaveGuard]);

  const urlProblem = url.trim() && !safeUrl(url.trim()) ? "Enter a web address that starts with http or https." : null;
  const ready = title.trim() !== "" && title.trim().length <= TITLE_LIMIT && !urlProblem && !busy && form !== undefined;

  const post = async () => {
    setBusy(true);
    setProblem(null);
    const key = form!.key;
    for (const [name, value] of [["title", title.trim()], ["url", url.trim()], ["text", text]] as const) {
      const result = await setField(key, { name, value });
      if (result.outcome !== "observed") {
        setBusy(false);
        setProblem("Couldn't fill in Hacker News's form. Try again.");
        return;
      }
    }
    const result = await submit(key);
    setBusy(false);
    if (result.outcome === "observed") setSent("accepted");
    else if (result.code === "REJECTED") setProblem(null); // HN's message shows from the form.
    else if (result.outcome === "unknown") setSent("unknown");
    else setProblem("Hacker News didn't take the post. Check the form and try again.");
  };

  const reset = () => {
    setTitle(""); setUrl(""); setText(""); setSent(null);
    open(`${ORIGIN}/submit`);
  };

  if (sent) return <div className="screen">
    <h1 className="screen-title">Post</h1>
    <Notice title={sent === "accepted" ? "Submitted to Hacker News" : "Check Hacker News"} role="status">
      <p>{sent === "accepted"
        ? "New posts appear under New. Hacker News may point you to an existing discussion of the same link."
        : "Hacker News went to another page, so the app can't tell whether the post went through."}</p>
      <button type="button" className="primary" onClick={() => open(`${ORIGIN}/newest`)}>See New</button>
      <button type="button" className="secondary" onClick={reset}>Post another</button>
    </Notice>
  </div>;

  let body;
  if (!shown) body = page.status === "error"
    ? <LoadError error={page.error} />
    : page.status === "ready"
      ? <LoadError error={{ code: "NOT_FOUND", message: "Hacker News didn't show its submit form." }} />
      : <Skeleton label="Loading the post form" rows={3} kind="text" />;
  else body = <form className="form" onSubmit={event => { event.preventDefault(); if (ready) void post(); }}>
    {shown.error && <p className="inline-error" role="alert">{shown.error}</p>}
    <label>Title
      <input value={title} maxLength={TITLE_LIMIT} required onChange={event => setTitle(event.target.value)} />
      <span className="meta">{title.trim().length} of {TITLE_LIMIT}</span>
    </label>
    <label>URL
      <input type="url" inputMode="url" value={url} aria-invalid={urlProblem !== null} onChange={event => setUrl(event.target.value)} />
      {urlProblem && <span className="field-error">{urlProblem}</span>}
    </label>
    <label>Text
      <textarea rows={6} value={text} onChange={event => setText(event.target.value)} />
    </label>
    <p className="meta">Leave the URL blank to ask a question. With a URL, the text appears as the first comment.</p>
    {problem && <p className="inline-error" role="alert">{problem}</p>}
    <button type="submit" className="primary" disabled={!ready}>{busy ? "Posting…" : "Post"}</button>
    <button type="button" className="text-button" onClick={() => open(`${ORIGIN}/newsguidelines.html`)}>Read the guidelines</button>
  </form>;

  return <ScrollMemory className="screen" aria-busy={page.stale || page.status === "loading"}>
    <h1 className="screen-title">Post</h1>
    {body}
  </ScrollMemory>;
}
