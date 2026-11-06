import { useNavigation } from "@genesis/sdk/react";
import { Notice, OpenOnX } from "../components/ui";

/** X pages that no manifest route covers. */
export function UnsupportedScreen() {
  const { screen } = useNavigation();
  const url = screen.params.url;
  return <div className="screen">
    <Notice title="Not in the app yet">
      <p>This X page doesn't have an app screen.</p>
      {url && <OpenOnX url={url} />}
    </Notice>
  </div>;
}
