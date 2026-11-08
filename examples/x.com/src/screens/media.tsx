import { useNavigation, usePage, useRecord } from "@genesis/sdk/react";
import { ORIGIN, type MediaData } from "../model";
import { Icon } from "../components/ui";

/** A full-screen photo. Previous and Next replace this entry, so Back returns to the post. */
export function MediaScreen() {
  const { navigate, back, viewWebsite } = useNavigation();
  const page = usePage();
  const photo = useRecord<MediaData | null>("photos", null);
  const { handle, id, index } = page.params;
  const position = Number(index) || 1;
  const go = (to: number) => navigate({ url: `${ORIGIN}/${handle}/status/${id}/photo/${to}`, mode: "replace" });
  const data = page.stale || page.pageId !== "media" ? null : photo?.data ?? null;

  return <div className="media-viewer">
    <button type="button" className="media-close" aria-label="Close" onClick={back}><Icon name="close" /></button>
    <div className="media-stage">
      {data?.image
        ? <img src={data.image} alt={`Photo ${position}`} referrerPolicy="no-referrer" />
        : page.status === "error"
          ? <div className="media-message">
              <p>This photo couldn't be shown.</p>
              <button type="button" className="secondary" onClick={() => viewWebsite()}>
                Open on X <Icon name="external" />
              </button>
            </div>
          : <p className="media-message" role="status">Loading photo…</p>}
    </div>
    <div className="media-nav">
      <button type="button" className="icon-button" aria-label="Previous photo" disabled={position <= 1} onClick={() => go(position - 1)}><Icon name="left" /></button>
      <span>{position}</span>
      <button type="button" className="icon-button" aria-label="Next photo" disabled={!data?.hasNext} onClick={() => go(position + 1)}><Icon name="right" /></button>
    </div>
  </div>;
}
