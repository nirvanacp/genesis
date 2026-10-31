import type {AppletContext} from "@genesis/sdk";
import {validHandle,type Library} from "./domain";
import {readLocal,writeLocal} from "./local-state";
import {Backend,LibraryError} from "./backend";
interface Ticket {nonce:string;phase:"requested"|"verified"|"consumed"|"failed";handle:string|null;epoch:string;createdAtMs:number;reason?:string}
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
    accounts.set(script,account);
  }
  const account=accounts.get(script);if(!account)return null;
  const mobile=document.querySelector('[data-testid="DashButton_ProfileIcon_Link"]');
  if(mobile?.getAttribute("aria-label")===`Profile menu ${account.name}`)return account.handle;
  if(document.querySelector('[data-testid="editProfileButton"]')&&location.pathname.split("/")[1]?.toLowerCase()===account.handle)return account.handle;
  // Detail and bookmarks omit the profile button but retain signed-in navigation.
  if(document.querySelector('[data-testid="AppTabBar_Notifications_Link"]')&&!mobile)return account.handle;
  return null;
}
export async function verifyAccount(context:AppletContext,backend:Backend):Promise<Library>{
  const handle=currentHandle();
  if(!handle)throw new LibraryError("SIGN_IN","Open X and sign in to verify your Categories account.");
  const library=await backend.library();
  if(context.signal.aborted||currentHandle()!==handle)throw new LibraryError("ACCOUNT_CHANGED","Your X account changed. Open Categories again.");
  if(library.expectedHandle.toLowerCase()!==handle)throw new LibraryError("ACCOUNT_MISMATCH",`Categories belongs to @${library.expectedHandle}. Switch to that X account to continue.`);
  return library;
}
export async function openLibrary(context:AppletContext):Promise<void>{
  const handle=currentHandle();
  const ticket:Ticket={nonce:crypto.randomUUID(),phase:handle?"verified":"failed",handle,epoch:crypto.randomUUID(),createdAtMs:Date.now()};
  await writeLocal(context,"session","library-entry",ticket);
  if(!context.signal.aborted)await context.pages.open("library");
}
export async function enterLibrary(context:AppletContext):Promise<Library|null>{
  const library=await new Backend(context).library();
  const ticket=await readLocal<Ticket>(context,"session","library-entry");
  if(ticket?.phase==="verified"&&Date.now()-ticket.createdAtMs<30000){
    await writeLocal(context,"session","library-entry",{...ticket,phase:"consumed"});
    if(ticket.handle!==library.expectedHandle.toLowerCase())throw new LibraryError("ACCOUNT_MISMATCH",`Categories belongs to @${library.expectedHandle}. Switch to that X account to continue.`);
    return library;
  }
  if(ticket?.phase==="failed"&&Date.now()-ticket.createdAtMs<30000)throw new LibraryError("SIGN_IN",ticket.reason??"Sign in to X, then open Categories again.");
  const request:Ticket={nonce:crypto.randomUUID(),phase:"requested",handle:null,epoch:crypto.randomUUID(),createdAtMs:Date.now()};
  await writeLocal(context,"session","library-entry",request);
  await context.sources.open("saved","https://x.com/i/history");return null;
}
export function verifyLibraryReturn(context:AppletContext):void{
  if(context.sourceId!=="saved")return;
  let running=false,deadline:ReturnType<typeof setTimeout>|undefined;
  context.onDispose(()=>clearTimeout(deadline));
  const check=async()=>{
    if(running||context.signal.aborted)return;running=true;
    try{
      const ticket=await readLocal<Ticket>(context,"session","library-entry");
      if(ticket?.phase!=="requested")return;
      const expired=Date.now()-ticket.createdAtMs>10000;
      const handle=currentHandle();
      if(!handle&&!expired){clearTimeout(deadline);deadline=setTimeout(()=>void check(),10001-(Date.now()-ticket.createdAtMs));return;}
      clearTimeout(deadline);
      const latest=await context.storage.get<Ticket>("session","library-entry");
      if(latest.document?.value.nonce!==ticket.nonce||latest.document.value.phase!=="requested")return;
      await context.storage.commit({checks:[{collection:"session",key:"library-entry",expectedRevision:latest.document.revision}],puts:[{collection:"session",key:"library-entry",value:{...ticket,handle,phase:expired?"failed":"verified",createdAtMs:Date.now(),...(expired?{reason:"Account verification expired. Open X bookmarks, then try Categories again."}:{})}}],deletes:[]});
      if(!context.signal.aborted)await context.pages.open("library");
    }catch{/* Keep source navigation available. A later focus retries verification. */}finally{running=false;}
  };
  void check();context.onFocus(()=>void check());
  context.storage.onChanged(change=>{if(change.changes.some(key=>key.collection==="session"&&key.key==="library-entry"))void check();});
  context.watchElements("x-library-account",{selector:'[data-testid="AppTabBar_Profile_Link"],[data-testid="DashButton_ProfileIcon_Link"],[data-testid="AppTabBar_Notifications_Link"]',attributes:["href","aria-label"],text:false,limit:3,contentKey:element=>element.getAttribute("href")??element.getAttribute("aria-label")},{enter:()=>void check(),update:()=>void check()});
}
