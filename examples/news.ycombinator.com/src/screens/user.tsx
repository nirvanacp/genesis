import { ScrollMemory, usePage, useRecord } from "@genesis/sdk/react";
import { ORIGIN, type UserData } from "../model";
import { Icon, LoadError, Notice, RichText, Skeleton, useOpenUrl } from "../components/ui";

/** A profile (`/user?id=`). Its lists open on the website until their screens return in step 8. */
export function UserScreen() {
  const page = usePage();
  const record = useRecord<UserData | null>("profile", null);
  const open = useOpenUrl();
  const data = page.pageId === "user" ? record?.data ?? null : null;
  if (!data) return <div className="screen" aria-busy={page.status === "loading"}>
    {page.status === "error"
      ? <LoadError error={page.error} />
      : page.status === "ready" && page.pageId === "user"
        ? <Notice title="No such user"><p>Hacker News has no profile with this name.</p></Notice>
        : <Skeleton label="Loading profile" rows={4} kind="text" />}
  </div>;
  const id = encodeURIComponent(data.name);
  return <ScrollMemory className="screen" aria-busy={page.stale}>
    {page.status === "error" && <p className="inline-error" role="alert">Couldn't refresh. Showing the last copy.</p>}
    <h1 className="screen-title">{data.name}</h1>
    <dl className="facts">
      {data.karma && <><dt>Karma</dt><dd>{data.karma}</dd></>}
      {data.created && <><dt>Joined</dt><dd>{data.created}</dd></>}
    </dl>
    {data.about.length > 0 && <section className="card"><h2 className="section-title">About</h2><RichText parts={data.about} /></section>}
    <nav className="list" aria-label={`${data.name} on Hacker News`}>
      <button type="button" onClick={() => open(`${ORIGIN}/submitted?id=${id}`)}>Submissions <Icon name="external" /></button>
      <button type="button" onClick={() => open(`${ORIGIN}/threads?id=${id}`)}>Comments <Icon name="external" /></button>
      <button type="button" onClick={() => open(`${ORIGIN}/favorites?id=${id}`)}>Favorites <Icon name="external" /></button>
    </nav>
  </ScrollMemory>;
}
