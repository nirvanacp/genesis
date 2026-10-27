import { defineApplet } from "@genesis/sdk";
import { inspectTargets } from "./targets";

// MVP-02 qualifies the browser contract; it does not suppress Shorts yet.
export default defineApplet({
  activate({ root }) { root.textContent = "Genesis · YouTube qualification"; },
  inspect: inspectTargets,
});
