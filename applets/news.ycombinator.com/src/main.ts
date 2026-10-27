import { defineApplet } from "@genesis/sdk";
import { inspectTargets } from "./targets";

// MVP-02 qualification only. Story Save controls arrive after runtime/storage verification.
export default defineApplet({
  activate({ root }) { root.textContent = "Genesis · Hacker News qualification · no sign-in required"; },
  inspect: inspectTargets,
});
