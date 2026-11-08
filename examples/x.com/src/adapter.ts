import { defineAdapter } from "@genesis/sdk/adapter";
import { accountPage, explorePage, mediaPage, postPage, profilePage, timelinePage } from "./adapter/pages.ts";
import { account } from "./adapter/read.ts";

/** How Genesis reads X. The page ids are the `page` values of the manifest routes. */
export default defineAdapter({
  account,
  signInUrl: "/i/flow/login",
  pages: {
    timeline: timelinePage,
    post: postPage,
    profile: profilePage,
    explore: explorePage,
    media: mediaPage,
    account: accountPage,
  },
});
