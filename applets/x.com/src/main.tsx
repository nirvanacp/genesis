import { defineApplet } from "@genesis/sdk";
import { inspectTargets } from "./targets";

// MVP-02 preserves the original site. Save controls and storage arrive later.
export default defineApplet({
  activate({ root }) { root.textContent = "Genesis · X qualification"; },
  inspect: inspectTargets,
});
