import {validHandle} from "./domain";
const accounts=new WeakMap<HTMLScriptElement,{handle:string;name:string}|null>();
export function currentHandle():string|null{
  const link=document.querySelector<HTMLAnchorElement>('[data-testid="AppTabBar_Profile_Link"]');
  const name=link?.getAttribute("href")?.match(/^\/([A-Za-z0-9_]{1,15})$/)?.[1];
  if(validHandle(name))return name.toLowerCase();
  // Mobile X replaces the desktop account link with a button. Read only the
  // signed-in entity, never the author of the currently viewed post.
  const script=[...document.scripts].find(s=>s.textContent?.startsWith("window.__INITIAL_STATE__="));
  if(!script)return null;
  if(!accounts.has(script)){
    let account:{handle:string;name:string}|null=null;
    try{
      const text=script.textContent??"",end=text.indexOf(";window.");
      const initial=JSON.parse(text.slice("window.__INITIAL_STATE__=".length,end<0?undefined:end));
      const user=initial.entities?.users?.entities?.[initial.session?.user_id];
      if(validHandle(user?.screen_name)&&typeof user.name==="string")account={handle:user.screen_name.toLowerCase(),name:user.name};
    }catch{/* Unrecognized account state cannot authorize private records. */}
    // A streamed bootstrap script may be incomplete on the first observation.
    // Only memoize a successfully parsed identity; retry unknown observations.
    if(account)accounts.set(script,account);
  }
  const account=accounts.get(script);if(!account)return null;
  const mobile=document.querySelector('[data-testid="DashButton_ProfileIcon_Link"]');
  if(mobile?.getAttribute("aria-label")===`Profile menu ${account.name}`)return account.handle;
  if(document.querySelector('[data-testid="editProfileButton"]')&&location.pathname.split("/")[1]?.toLowerCase()===account.handle)return account.handle;
  // Detail and bookmarks omit the profile button but retain signed-in navigation.
  if(document.querySelector('[data-testid="AppTabBar_Notifications_Link"]')&&!mobile)return account.handle;
  return null;
}
