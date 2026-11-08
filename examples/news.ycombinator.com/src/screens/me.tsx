import { useState } from "react";
import { ScrollMemory, useAction, usePage, usePending, useRecord } from "@genesis/sdk/react";
import { ORIGIN, userUrl, type AccountData } from "../model";
import { LoadError, Skeleton, useOpenUrl } from "../components/ui";

/**
 * The Me tab (`/news?account=1`, the `me` context). The page needs an account: signed out,
 * Genesis shows HN's login page in this context and returns here after sign-in.
 */
export function MeScreen() {
  const page = usePage();
  const record = useRecord<AccountData | null>("account", null);
  const signOut = useAction("signOut", "account");
  const pending = usePending("account", record?.key ?? null).length > 0;
  const open = useOpenUrl();
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const data = page.pageId === "account" && !page.stale ? record?.data ?? null : null;

  const leave = () => {
    setFailed(false);
    void signOut(record!.key).then(result => {
      // Signed out, HN returns to this page, which then needs an account: that is the evidence.
      const done = result.outcome === "observed" || result.code === "AUTH_REQUIRED" || result.code === "CONTEXT_REPLACED";
      setFailed(!done);
      if (done) setConfirming(false);
    });
  };

  let body;
  if (!data) body = page.status === "error"
    ? <LoadError error={page.error} />
    : <Skeleton label="Loading account" rows={4} kind="text" />;
  else {
    const id = encodeURIComponent(data.name);
    body = <>
      <section className="card account">
        <h2>{data.name}</h2>
        {data.karma && <p className="meta">{data.karma} karma</p>}
      </section>
      <nav className="list" aria-label="Your Hacker News">
        <button type="button" onClick={() => open(userUrl(data.name))}>Profile</button>
        <button type="button" onClick={() => open(`${ORIGIN}/submitted?id=${id}`)}>My submissions</button>
        <button type="button" onClick={() => open(`${ORIGIN}/threads?id=${id}`)}>My comments</button>
        <button type="button" onClick={() => open(`${ORIGIN}/favorites?id=${id}`)}>HN favorites</button>
        <button type="button" onClick={() => open(`${ORIGIN}/upvoted?id=${id}`)}>Upvoted</button>
        <button type="button" onClick={() => open(`${ORIGIN}/hidden?id=${id}`)}>Hidden</button>
      </nav>
      <p className="meta">Genesis Saved stories are separate from HN favorites.</p>
      {failed && <p className="inline-error" role="alert">Couldn't sign out. Try again.</p>}
      {confirming
        ? <div className="confirm" role="group" aria-label="Confirm sign out">
            <p>Sign out of Hacker News in this app?</p>
            <button type="button" className="danger" disabled={pending} onClick={leave}>Sign out</button>
            <button type="button" className="secondary" disabled={pending} onClick={() => setConfirming(false)}>Stay signed in</button>
          </div>
        : <button type="button" className="secondary" onClick={() => setConfirming(true)}>Sign out</button>}
    </>;
  }

  return <ScrollMemory className="screen" aria-busy={page.stale || page.status === "loading"}>
    <h1 className="screen-title">Me</h1>
    {body}
    <nav className="list" aria-label="About Hacker News">
      <button type="button" onClick={() => open(`${ORIGIN}/newsguidelines.html`)}>Guidelines</button>
      <button type="button" onClick={() => open(`${ORIGIN}/newsfaq.html`)}>FAQ</button>
    </nav>
  </ScrollMemory>;
}
