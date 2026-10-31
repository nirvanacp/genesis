import {watchAccount} from "./account";
import { defineApplet } from "@genesis/sdk";
import { inspectTargets } from "./targets";
import { postControls } from "./post-controls";
import { sourceNavigation } from "./source-navigation";

export default defineApplet({
  activate(context) { watchAccount(context); sourceNavigation(context); postControls(context); },
  inspect: inspectTargets,
});
