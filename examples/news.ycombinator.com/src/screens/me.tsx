import { useState } from "react";
import { ScrollMemory, useAppResume, useIntent, useNavigation, useScreenSource } from "@genesis/sdk/react";
import { ORIGIN, userUrl, type AccountData } from "../model";
import { Icon, LoadError, Notice, SignInPrompt, Skeleton, useOpenRoute } from "../components/ui";

/** The account route: the front page, read for its header. */
export const accountUrl = () => `${ORIGIN}/news?account=1`;

export function MeScreen() {
  const { navigate, reload } = useNavigation();
  const page = useScreenSource<AccountData>();
  const account = useIntent("me");
  const open = useOpenRoute();
  const [confirming, setConfirming] = useState(false);
  // The website sheet may have signed in or out; read the header again.
  useAppResume(reload);
  const data = page.stale ? null : page.data;

  const signOut = async () => {
    try {
      await account.act({ name: "signOut" });
      setConfirming(false);
      reload();
    } catch { /* The error shows below. */ }
  };

  let body;
  if (page.status === "auth") body = <SignInPrompt reason="Sign in to see your profile, submissions and comments." goto="news" />;
  else if (!data) body = page.status === "error" ? <LoadError error={page.error} url={page.url} /> : <Skeleton label="Loading account" rows={4} kind="text" />;
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
      {account.error != null && <p className="inline-error" role="alert">Couldn't sign out. Try again.</p>}
      {confirming
        ? <div className="confirm" role="group" aria-label="Confirm sign out">
            <p>Sign out of Hacker News in this app?</p>
            <button type="button" className="danger" disabled={account.pending} onClick={() => void signOut()}>Sign out</button>
            <button type="button" className="secondary" disabled={account.pending} onClick={() => setConfirming(false)}>Stay signed in</button>
          </div>
        : <button type="button" className="secondary" onClick={() => setConfirming(true)}>Sign out</button>}
    </>;
  }

  return <ScrollMemory className="screen">
    <h1 className="screen-title">Me</h1>
    {body}
    <nav className="list" aria-label="About Hacker News">
      <button type="button" onClick={() => open(`${ORIGIN}/newsguidelines.html`)}>Guidelines</button>
      <button type="button" onClick={() => open(`${ORIGIN}/newsfaq.html`)}>FAQ</button>
      {page.status === "auth" && <button type="button" onClick={() => void navigate({ kind: "website", url: `${ORIGIN}/forgot` })}>
        Forgot password <Icon name="external" />
      </button>}
    </nav>
  </ScrollMemory>;
}
