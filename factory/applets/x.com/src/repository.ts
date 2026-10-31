import type {AppletContext,StoredDocument} from "@genesis/sdk";
import {Backend,LibraryError} from "./backend";
import {requireLibrarySession} from "./account";
import type {Library,Receipt} from "./domain";
interface Pending {operationId:string;kind:string;libraryId:string;createdAtMs:number;recordId:string}
const clients=new WeakMap<AppletContext,Repository>();
export function repository(context:AppletContext):Repository{
  let value=clients.get(context);if(!value){value=new Repository(context);clients.set(context,value);}return value;
}
export class Repository {
  readonly backend:Backend;
  private listeners=new Set<()=>void>();
  private pendingPayload:{marker:Pending;payload:unknown;epoch:string}|null=null;
  constructor(readonly context:AppletContext){this.backend=new Backend(context);context.onDispose(()=>this.listeners.clear());}
  subscribe(callback:()=>void):()=>void{this.listeners.add(callback);return()=>this.listeners.delete(callback);}
  changed():void{for(const callback of this.listeners)callback();}
  private key(library:Library):string{return `pending:${library.libraryId}`;}
  private async pending(library:Library):Promise<StoredDocument<Pending>|null>{
    const key=this.key(library),current=await this.context.storage.get<Pending>("operations",key);
    const legacy=await this.context.storage.get<Pending>("operations","pending");
    if(legacy.document?.value.libraryId===library.libraryId){
      if(current.document)throw new LibraryError("PENDING","An older change also needs reconciliation. Preserve both records and reconnect the library.");
      await this.context.storage.commit({checks:[{collection:"operations",key,expectedRevision:null},{collection:"operations",key:"pending",expectedRevision:legacy.document.revision}],puts:[{collection:"operations",key,value:legacy.document.value}],deletes:[{collection:"operations",key:"pending"}]});
      return (await this.context.storage.get<Pending>("operations",key)).document;
    }
    return current.document;
  }
  private async clear(library:Library,operationId:string):Promise<void>{
    const key=this.key(library),{document}=await this.context.storage.get<Pending>("operations",key);
    if(document?.value.operationId===operationId)await this.context.storage.commit({checks:[{collection:"operations",key,expectedRevision:document.revision}],puts:[],deletes:[{collection:"operations",key}]});
    if(this.pendingPayload?.marker.operationId===operationId)this.pendingPayload=null;
  }
  private async settled(library:Library,receipt:Receipt):Promise<Receipt>{
    await this.clear(library,receipt.operationId);this.changed();return receipt;
  }
  async reconcile(library:Library):Promise<boolean>{
    await requireLibrarySession(this.context,library);
    const pending=await this.pending(library);if(!pending)return true;
    try{await this.settled(library,await this.backend.operation(pending.value.operationId));return true;}
    catch(error){if(error instanceof LibraryError&&error.code==="OPERATION_NOT_FOUND")return false;throw error;}
  }
  async submit(library:Library,kind:string,payload:Record<string,unknown>):Promise<Receipt>{
    const session=await requireLibrarySession(this.context,library);
    if(await this.pending(library))throw new LibraryError("PENDING","A previous change is unconfirmed. Check its saved state before making another change.");
    const marker:Pending={operationId:crypto.randomUUID(),kind,libraryId:library.libraryId,createdAtMs:Date.now(),recordId:String(payload.postId??payload.id??"")};
    // The checked shared slot serializes independent retained views too.
    await this.context.storage.commit({checks:[{collection:"operations",key:this.key(library),expectedRevision:null}],puts:[{collection:"operations",key:this.key(library),value:marker}],deletes:[]});
    this.pendingPayload={marker,payload,epoch:session.epoch};
    try{
      if((await requireLibrarySession(this.context,library)).epoch!==session.epoch)throw new LibraryError("ACCOUNT_CHANGED","Your X account changed before saving.");
      return await this.settled(library,await this.backend.mutate(marker.operationId,kind,payload));
    }catch(error){
      if(error instanceof LibraryError&&!error.uncertain)await this.clear(library,marker.operationId);
      else{try{return await this.settled(library,await this.backend.operation(marker.operationId));}catch{/* Retain the original operation for reconciliation. */}}
      throw error;
    }
  }
  async retry(library:Library):Promise<void>{
    if(await this.reconcile(library))return;
    const session=await requireLibrarySession(this.context,library),pending=await this.pending(library);
    const saved=this.pendingPayload;
    if(!saved||saved.marker.libraryId!==library.libraryId||saved.epoch!==session.epoch||pending?.value.operationId!==saved.marker.operationId)throw new LibraryError("PENDING","Refresh the original change before abandoning it.");
    await this.settled(library,await this.backend.mutate(saved.marker.operationId,saved.marker.kind,saved.payload));
  }
  async abandon(library:Library):Promise<void>{
    if(await this.reconcile(library))return;
    const pending=await this.pending(library);if(!pending)return;
    await this.backend.categories();await this.backend.query(null,"",null);
    await requireLibrarySession(this.context,library);
    await this.clear(library,pending.value.operationId);this.changed();
  }
}
