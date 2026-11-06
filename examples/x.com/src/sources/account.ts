import { defineSource } from "@genesis/sdk/source";
import { validHandle, type AccountData } from "../model";
import { parsing, signedOut } from "./page";

const STATE = "window.__INITIAL_STATE__=";

/** The signed-in account from X's bootstrap state; never the author of a post on the page. */
function bootstrapAccount(doc: Document): { handle: string; name: string } | null {
  const script = [...doc.scripts].find(element => element.textContent?.startsWith(STATE));
  if (!script) return null;
  try {
    const text = script.textContent ?? "";
    const end = text.indexOf(";window.");
    const initial = JSON.parse(text.slice(STATE.length, end < 0 ? undefined : end));
    const user = initial.entities?.users?.entities?.[initial.session?.user_id];
    return validHandle(user?.screen_name) && typeof user.name === "string" ? { handle: user.screen_name.toLowerCase(), name: user.name } : null;
  } catch {
    return null; // A streamed script may be incomplete; the next mutation reads it again.
  }
}

/**
 * The account handle, confirmed by X's own signed-in controls: the desktop profile link, the mobile
 * profile menu labelled with the account's name, or the signed-in navigation bar.
 */
export function currentAccount(doc: Document): AccountData | null {
  const link = doc.querySelector('[data-testid="AppTabBar_Profile_Link"]')?.getAttribute("href")?.match(/^\/([A-Za-z0-9_]{1,15})$/)?.[1];
  const account = bootstrapAccount(doc);
  if (validHandle(link)) return { handle: link.toLowerCase(), name: account?.handle === link.toLowerCase() ? account.name : null };
  if (!account) return null;
  const mobile = doc.querySelector('[data-testid="DashButton_ProfileIcon_Link"]');
  if (mobile) return mobile.getAttribute("aria-label") === `Profile menu ${account.name}` ? account : null;
  return doc.querySelector('[data-testid="AppTabBar_Notifications_Link"]') ? account : null;
}

export default defineSource({
  id: "account",
  routes: {
    account: {
      extract(doc): AccountData | null {
        if (parsing(doc)) return null;
        return currentAccount(doc);
      },
    },
  },
  isSignedIn: doc => parsing(doc) || !signedOut(doc),
});
