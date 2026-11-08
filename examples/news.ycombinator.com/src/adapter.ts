import { defineAdapter } from "@genesis/sdk/adapter";
import { accountPage } from "./adapter/account.ts";
import { feed, privateFeed } from "./adapter/feed.ts";
import { info } from "./adapter/info.ts";
import { item } from "./adapter/item.ts";
import { account } from "./adapter/read.ts";
import { submit } from "./adapter/submit.ts";
import { user } from "./adapter/user.ts";

/** HN's login page, returning to the page that needed the account. */
const signInUrl = (url: string) => {
  const { pathname, search } = new URL(url);
  return `/login?goto=${encodeURIComponent(pathname.slice(1) + search)}`;
};

/** How Genesis reads Hacker News. The page ids are the `page` values of the manifest routes. */
export default defineAdapter({
  account,
  signInUrl,
  pages: { feed, "private-feed": privateFeed, item, user, info, account: accountPage, submit },
});
