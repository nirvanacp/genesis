import type {AppletContext} from "@genesis/sdk";
import {validHandle,type Library} from "./domain";
import {readLocal,writeLocal} from "./local-state";
import {Backend,LibraryError} from "./backend";
interface Ticket {nonce:string;phase:"requested"|"verified"|"consumed"|"failed";handle:string|null;epoch:string;createdAtMs:number;reason?:string}
export function currentHandle():string|null{
  const link=document.querySelector<HTMLAnchorElement>('[data-testid="AppTabBar_Profile_Link"]');
  const name=link?.getAttribute("href")?.match(/^\/([A-Za-z0-9_]{1,15})$/)?.[1];
  return validHandle(name)?name.toLowerCase():null;
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
  context.watchElements("x-library-account",{selector:'[data-testid="AppTabBar_Profile_Link"]',attributes:["href"],text:false,limit:1,contentKey:element=>element.getAttribute("href")},{enter:()=>void check(),update:()=>void check()});
}
