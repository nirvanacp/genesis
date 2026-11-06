import type {AppletContext} from '@genesis/sdk';
import type {Library} from './domain';
import {readLocal,writeLocal} from './local-state';
import {Backend,LibraryError} from './backend';
const libraryEpochs=new WeakMap<Library,string>();
export interface AccountSession {handle:string|null;epoch:string;confirmed?:boolean;owner?:string}
const observationQueues=new WeakMap<AppletContext,Promise<AccountSession>>();
/** Only the foreground persists observations accepted from its live source. */
export function recordAccountObservation(context:AppletContext,handle:string|null,confirmed:boolean):Promise<AccountSession>{
  const prior=observationQueues.get(context)??Promise.resolve(null);
  const next=prior.catch(()=>null).then(async()=>{
    const previous=await readLocal<AccountSession>(context,'session','account');
    if(previous?.handle===handle&&previous.confirmed===confirmed&&previous.owner===context.binding.viewId)return previous;
    const value:AccountSession={handle,confirmed,owner:context.binding.viewId,epoch:previous?.handle===handle&&previous.owner===context.binding.viewId&&previous.confirmed===false&&confirmed?previous.epoch:crypto.randomUUID()};
    await writeLocal(context,'session','account',value);return value;
  });observationQueues.set(context,next);return next;
}
export async function verifyAccount(context:AppletContext,backend:Backend):Promise<Library>{
  const library=await backend.library();await requireLibrarySession(context,library);return library;
}
export async function enterLibrary(context:AppletContext):Promise<Library>{return verifyAccount(context,new Backend(context));}
export async function requireLibrarySession(context:AppletContext,library:Library):Promise<AccountSession>{
  const session=await readLocal<AccountSession>(context,'session','account');
  if(!session?.confirmed||session.owner!==context.binding.viewId)throw new LibraryError('SIGN_IN','Wait for X to verify your account, then open Categories again.');
  if(!session.handle||session.handle!==library.expectedHandle.toLowerCase())throw new LibraryError('ACCOUNT_MISMATCH',`Categories belongs to @${library.expectedHandle}. Switch to that X account to continue.`);
  const bound=libraryEpochs.get(library);
  if(bound&&bound!==session.epoch)throw new LibraryError('ACCOUNT_CHANGED','Reopen applet categories after switching accounts.');
  libraryEpochs.set(library,session.epoch);return session;
}
