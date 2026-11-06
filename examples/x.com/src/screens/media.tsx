import { useNavigation, useScreenSource } from "@genesis/sdk/react";
import { ORIGIN, type MediaData } from "../model";
import { Icon } from "../components/ui";

/** A full-screen photo. Previous and Next replace this screen, so Back returns to the post list. */
export function MediaScreen() {
  const { navigate, back } = useNavigation();
  const page = useScreenSource<MediaData>();
  const { handle, id, index } = page.params;
  const position = Number(index) || 1;
  const go = (to: number) => void navigate({ kind: "route", url: `${ORIGIN}/${handle}/status/${id}/photo/${to}`, mode: "replace" });
  const data = page.stale ? null : page.data;

  return <div className="media-viewer">
    <button type="button" className="media-close" aria-label="Close" onClick={back}><Icon name="close" /></button>
    <div className="media-stage">
      {data?.image
        ? <img src={data.image} alt={`Photo ${position}`} referrerPolicy="no-referrer" />
        : page.status === "error" || page.status === "unsupported"
          ? <div className="media-message">
              <p>This photo couldn't be shown.</p>
              <button type="button" className="secondary" onClick={() => void navigate({ kind: "website", url: `${ORIGIN}/${handle}/status/${id}/photo/${position}` })}>
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
