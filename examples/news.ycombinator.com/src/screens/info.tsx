import { ScrollMemory, useScreenSource } from "@genesis/sdk/react";
import type { InfoData } from "../model";
import { LoadError, Notice, RichText, Skeleton } from "../components/ui";

export function InfoScreen() {
  const page = useScreenSource<InfoData>();
  const data = page.data;
  if (page.status === "unsupported") return <div className="screen"><Notice title="This page moved"><p>Hacker News sent this link somewhere the app doesn't show.</p></Notice></div>;
  if (!data) return <div className="screen">{page.status === "error"
    ? <LoadError error={page.error} url={page.url} />
    : <Skeleton label="Loading page" rows={6} kind="text" />}</div>;
  return <ScrollMemory className="screen">
    <h1 className="screen-title">{data.title}</h1>
    <div className="card"><RichText parts={data.parts} /></div>
  </ScrollMemory>;
}
