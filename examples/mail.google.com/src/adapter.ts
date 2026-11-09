import { defineAdapter } from "@genesis/sdk/adapter";
import { mailPage } from "./adapter/pages.ts";
import { account } from "./adapter/read.ts";

/** How Genesis reads Gmail's mobile web app. Every Gmail screen is the one page `mail`. */
export default defineAdapter({
  account,
  signInUrl: "/mail/u/0/",
  pages: { mail: mailPage },
});
