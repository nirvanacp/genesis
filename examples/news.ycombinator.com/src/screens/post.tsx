import { useEffect, useState } from "react";
import { ScrollMemory, useIntent, useNavigation, useScreenSource } from "@genesis/sdk/react";
import { ORIGIN, safeUrl, TITLE_LIMIT, type SubmitData } from "../model";
import { LoadError, Notice, SignInPrompt, Skeleton, useOpenRoute } from "../components/ui";

/** HN's submit form, rebuilt; HN's own form receives the values and decides the outcome. */
export function PostScreen() {
  const { navigate, setLeaveGuard } = useNavigation();
  const page = useScreenSource<SubmitData>();
  const post = useIntent("post");
  const open = useOpenRoute();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const draft = !sent && (title.trim() !== "" || url.trim() !== "" || text.trim() !== "");
  useEffect(() => setLeaveGuard(draft ? "Discard this post?" : null), [draft, setLeaveGuard]);

  const urlProblem = url.trim() && !safeUrl(url.trim()) ? "Enter a web address that starts with http or https." : null;
  const ready = title.trim() !== "" && title.trim().length <= TITLE_LIMIT && !urlProblem && !post.pending;

  const submit = async () => {
    try {
      await post.act({ name: "submit", title: title.trim(), url: url.trim(), text });
      setSent(true);
    } catch { /* The error shows below. */ }
  };

  if (sent) return <div className="screen">
    <h1 className="screen-title">Post</h1>
    <Notice title="Sent to Hacker News" role="status">
      <p>Hacker News checks each submission. New posts appear under New, or HN may point you to an existing discussion of the same link.</p>
      <button type="button" className="primary" onClick={() => open(`${ORIGIN}/newest`)}>See New</button>
      <button type="button" className="secondary" onClick={() => {
        setTitle(""); setUrl(""); setText(""); setSent(false);
        void navigate({ kind: "route", url: `${ORIGIN}/submit?t=${Date.now()}`, mode: "replace" });
      }}>Post another</button>
    </Notice>
  </div>;

  const data = page.stale ? null : page.data;
  let body;
  if (page.status === "auth") body = <SignInPrompt reason="You need a Hacker News account to post." goto="submit" />;
  else if (!data) body = page.status === "error" ? <LoadError error={page.error} url={page.url} /> : <Skeleton label="Loading the post form" rows={3} kind="text" />;
  else if (!data.form) body = <LoadError error={{ code: "NOT_FOUND", message: "Hacker News didn't show its submit form." }} url={`${ORIGIN}/submit`} />;
  else body = <form className="form" onSubmit={event => { event.preventDefault(); if (ready) void submit(); }}>
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
    {post.error != null && <p className="inline-error" role="alert">Hacker News didn't take the post. Check the form and try again.</p>}
    <button type="submit" className="primary" disabled={!ready}>{post.pending ? "Posting…" : "Post"}</button>
    <button type="button" className="text-button" onClick={() => open(`${ORIGIN}/newsguidelines.html`)}>Read the guidelines</button>
  </form>;

  return <ScrollMemory className="screen">
    <h1 className="screen-title">Post</h1>
    {body}
  </ScrollMemory>;
}
