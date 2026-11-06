import { ScrollMemory, useScreenSource } from "@genesis/sdk/react";
import { ORIGIN, type UserData } from "../model";
import { LoadError, Notice, RichText, Skeleton, useOpenRoute } from "../components/ui";

export function UserScreen() {
  const page = useScreenSource<UserData>();
  const open = useOpenRoute();
  const data = page.data;
  if (page.status === "unsupported") return <div className="screen"><Notice title="This profile moved"><p>Hacker News sent this link somewhere the app doesn't show.</p></Notice></div>;
  if (!data) return <div className="screen">{page.status === "error"
    ? <LoadError error={page.error} url={page.url} />
    : <Skeleton label="Loading profile" rows={4} kind="text" />}</div>;
  const id = encodeURIComponent(data.name);
  return <ScrollMemory className="screen">
    <h1 className="screen-title">{data.name}</h1>
    <dl className="facts">
      {data.karma && <><dt>Karma</dt><dd>{data.karma}</dd></>}
      {data.created && <><dt>Joined</dt><dd>{data.created}</dd></>}
    </dl>
    {data.about.length > 0 && <section className="card"><h2 className="section-title">About</h2><RichText parts={data.about} /></section>}
    <nav className="list" aria-label={`${data.name} on Hacker News`}>
      <button type="button" onClick={() => open(`${ORIGIN}/submitted?id=${id}`)}>Submissions</button>
      <button type="button" onClick={() => open(`${ORIGIN}/threads?id=${id}`)}>Comments</button>
      <button type="button" onClick={() => open(`${ORIGIN}/favorites?id=${id}`)}>Favorites</button>
    </nav>
  </ScrollMemory>;
}
