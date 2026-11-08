import { ScrollMemory, usePage, useRecord } from "@genesis/sdk/react";
import type { InfoData } from "../model";
import { LoadError, RichText, Skeleton } from "../components/ui";

/** HN's information pages (guidelines, FAQ, formatting, lists, leaders) as formatted text. */
export function InfoScreen() {
  const page = usePage();
  const record = useRecord<InfoData>("sections", null);
  const data = page.pageId === "info" ? record?.data ?? null : null;
  if (!data) return <div className="screen" aria-busy={page.status === "loading"}>
    {page.status === "error" ? <LoadError error={page.error} /> : <Skeleton label="Loading page" rows={6} kind="text" />}
  </div>;
  return <ScrollMemory className="screen" aria-busy={page.stale}>
    <h1 className="screen-title">{data.title}</h1>
    <div className="card"><RichText parts={data.parts} /></div>
  </ScrollMemory>;
}
