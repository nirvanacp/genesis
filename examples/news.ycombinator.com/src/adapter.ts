import { defineAdapter } from "@genesis/sdk/adapter";
import { feed } from "./adapter/feed.ts";
import { item } from "./adapter/item.ts";
import { account } from "./adapter/read.ts";
import { user } from "./adapter/user.ts";

/** How Genesis reads Hacker News. The page ids are the `page` values of the manifest routes. */
export default defineAdapter({
  account,
  signInUrl: "/login",
  pages: { feed, item, user },
});
