import type {AppletContext} from "@genesis/sdk";
import {Backend,LibraryError} from "./backend";
import {readLocal,writeLocal} from "./local-state";
import type {Library,Receipt} from "./domain";
interface Pending {operationId:string;kind:string;libraryId:string;createdAtMs:number;recordId:string}
const clients=new WeakMap<AppletContext,Repository>();
export function repository(context:AppletContext):Repository{
  let value=clients.get(context);if(!value){value=new Repository(context);clients.set(context,value);}return value;
}
export class Repository {
  readonly backend:Backend;
  private listeners=new Set<()=>void>();
  private pendingPayload:{marker:Pending;payload:unknown}|null=null;
  private submitting=false;
  constructor(readonly context:AppletContext){this.backend=new Backend(context);context.onDispose(()=>this.listeners.clear());}
  subscribe(callback:()=>void):()=>void{this.listeners.add(callback);return()=>this.listeners.delete(callback);}
  changed():void{for(const callback of this.listeners)callback();}
  private async settled(receipt:Receipt):Promise<Receipt>{
    await writeLocal(this.context,"operations","pending",null);this.pendingPayload=null;this.changed();return receipt;
  }
  async reconcile(library:Library):Promise<boolean>{
    const pending=await readLocal<Pending>(this.context,"operations","pending");
    if(!pending)return true;
    if(pending.libraryId!==library.libraryId)throw new LibraryError("ACCOUNT_MISMATCH","A change belongs to a different Categories library.");
    try{await this.settled(await this.backend.operation(pending.operationId));return true;}
    catch(error){if(error instanceof LibraryError&&error.code==="OPERATION_NOT_FOUND")return false;throw error;}
  }
  async submit(library:Library,kind:string,payload:Record<string,unknown>):Promise<Receipt>{
    if(this.submitting)throw new LibraryError("BUSY","Wait for the current change to finish.");
    this.submitting=true;
    try{
      const pending=await readLocal<Pending>(this.context,"operations","pending");
      if(pending)throw new LibraryError("PENDING","A previous change is unconfirmed. Check its saved state before making another change.");
      const marker:Pending={operationId:crypto.randomUUID(),kind,libraryId:library.libraryId,createdAtMs:Date.now(),recordId:String(payload.postId??payload.id??"")};
      await writeLocal(this.context,"operations","pending",marker);
      this.pendingPayload={marker,payload};
      try{return await this.settled(await this.backend.mutate(marker.operationId,kind,payload));}
      catch(error){
        if(error instanceof LibraryError&&!error.uncertain){await writeLocal(this.context,"operations","pending",null);this.pendingPayload=null;}
        else{try{const receipt=await this.backend.operation(marker.operationId);return await this.settled(receipt);}catch{/* Preserve the operation ID for user reconciliation. */}}
        throw error;
      }
    }finally{this.submitting=false;}
  }
  async retry(library:Library):Promise<void>{
    if(await this.reconcile(library))return;
    if(!this.pendingPayload)throw new LibraryError("PENDING","This change is still unconfirmed. Refresh its saved state before abandoning it.");
    const {marker,payload}=this.pendingPayload;
    await this.settled(await this.backend.mutate(marker.operationId,marker.kind,payload));
  }
  async abandon(library:Library):Promise<void>{
    if(await this.reconcile(library))return;
    // Read-back plus subsequent revision preconditions protect against a late older commit.
    await this.backend.categories();await this.backend.query(null,"",null);
    await writeLocal(this.context,"operations","pending",null);this.pendingPayload=null;this.changed();
  }
}
