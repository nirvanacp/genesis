import { single, type Page } from "@genesis/sdk/adapter";
import type { AccountData } from "../model.ts";
import { account, clean, hnPage } from "./read.ts";

/** The Me tab's page (`/news?account=1`): the front page, read only for its top bar. */
function accountOf(main: Element): AccountData | null {
  const name = clean(main.querySelector("#me")?.textContent, 64);
  if (!name) return null;
  return { name, karma: clean(main.querySelector("#karma")?.textContent, 20) || null };
}

export const accountPage: Page = {
  ready: hnPage,
  requiresAccount: true,
  regions: {
    account: single({
      root: "#hnmain",
      read: accountOf,
      actions: {
        /**
         * Follows HN's own logout link, which carries the session's token. HN returns to this
         * page, which then needs an account: the destination's `auth` status is the evidence.
         */
        signOut: main => {
          if (account(main!.ownerDocument) === null) return { satisfied: true };
          if (!main!.querySelector("a#logout")) throw new Error("Hacker News shows no logout link");
          return { steps: [{ click: "a#logout" }], navigates: true };
        },
      },
    }),
  },
};
