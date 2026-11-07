import { useNavigation } from "@genesis/sdk/react";
import { Icon, Notice } from "../components/ui";

/** Hacker News pages that no manifest route covers. */
export function UnsupportedScreen() {
  const { screen, navigate } = useNavigation();
  const url = screen.params.url;
  return <div className="screen">
    <Notice title="Not in the app yet">
      <p>This Hacker News page doesn't have an app screen.</p>
      {url && <button type="button" className="secondary" onClick={() => void navigate({ kind: "website", url })}>
        Open on Hacker News <Icon name="external" />
      </button>}
    </Notice>
  </div>;
}
