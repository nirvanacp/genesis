import { defineSource } from "@genesis/sdk/source";
import type { AccountData } from "../model";
import { clean, parsing, requireHnPage, signedIn } from "./page";

export default defineSource({
  id: "me",
  routes: {
    account: {
      extract(doc): AccountData | null {
        if (parsing(doc)) return null;
        requireHnPage(doc);
        return {
          name: clean(doc.querySelector("#me")?.textContent, 64),
          karma: clean(doc.querySelector("#karma")?.textContent, 20) || null,
        };
      },
    },
  },
  intents: {
    signOut: () => [{ click: "a#logout" }],
  },
  isSignedIn: doc => parsing(doc) || signedIn(doc),
});
