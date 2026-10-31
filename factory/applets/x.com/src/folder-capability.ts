import type {AppletContext} from "@genesis/sdk";
import type {AccountSession} from "./account";
import type {Post} from "./domain";
export type FolderProvider="unknown"|"native"|"custom";
export type FolderEvidence="native-picker"|"folder-paywall"|"none";
export interface FolderCapability {
  version:1;accountKey:string;accountEpoch:string;state:FolderProvider;evidence:FolderEvidence;
  observedAtMs:number;expiresAtMs:number;revision:number;
}
export interface FolderIntent {
  id:string;kind:"save-post"|"manage-folders";accountKey:string;accountEpoch:string;
  sourceId:string;sourceUrl:string;generation:number;createdAtMs:number;expiresAtMs:number;
  phase:"armed"|"native-open"|"switching"|"custom-open"|"complete"|"canceled";
  provider:FolderProvider;post?:Readonly<Post>;
}
const freshness=5*60*1000,observationWindow=10000;
export function folderCapability(previous:FolderCapability|null,account:AccountSession,now:number,evidence:FolderEvidence="none"):FolderCapability {
  const matches=previous?.accountKey===account.handle&&previous.accountEpoch===account.epoch;
  const fresh=matches&&now>=previous.observedAtMs&&now<previous.expiresAtMs;
  const accepted=!!account.handle&&evidence!=="none";
  return {version:1,accountKey:account.handle??"",accountEpoch:account.epoch,
    state:accepted?evidence==="native-picker"?"native":"custom":fresh?previous.state:"unknown",
    evidence:accepted?evidence:fresh?previous.evidence:"none",
    observedAtMs:accepted?now:fresh?previous.observedAtMs:now,
    expiresAtMs:accepted?now+freshness:fresh?previous.expiresAtMs:now,
    revision:(previous?.revision??0)+1};
}
/** No selectors, service writes or native clicks. The source adapter must qualify evidence. */
export class FolderController {
  private capability:FolderCapability|null=null;
  private intent:FolderIntent|null=null;
  constructor(private clock=()=>Date.now(),private uuid=()=>crypto.randomUUID()){}
  state(account:AccountSession):FolderProvider {
    this.capability=folderCapability(this.capability,account,this.clock());return this.capability.state;
  }
  reset():void{this.capability=null;this.cancel();}
  begin(account:AccountSession,sourceId:string,sourceUrl:string,generation:number,post?:Post):Readonly<FolderIntent>|null{
    if(!account.handle)return null;
    if(this.intent && ["armed","switching"].includes(this.intent.phase) && (this.clock()>=this.intent.expiresAtMs || this.clock()<this.intent.createdAtMs))this.cancel();
    if(this.intent&&["armed","native-open","switching","custom-open"].includes(this.intent.phase)){
      if(this.intent.accountEpoch===account.epoch&&this.intent.accountKey===account.handle)return null;
      this.cancel();
    }
    const now=this.clock(),provider=this.state(account);
    this.intent={id:this.uuid(),kind:post?"save-post":"manage-folders",accountKey:account.handle,accountEpoch:account.epoch,
      sourceId,sourceUrl,generation,createdAtMs:now,expiresAtMs:now+observationWindow,
      phase:provider==="custom"?"switching":"armed",provider, ...(post?{post:structuredClone(post)}:{})};
    return structuredClone(this.intent);
  }
  observe(id:string,account:AccountSession,generation:number,evidence:Exclude<FolderEvidence,"none">):"native"|"switch"|"ignored"{
    const intent=this.intent,now=this.clock();
    if(!intent||intent.id!==id||intent.accountKey!==account.handle||intent.accountEpoch!==account.epoch||intent.generation!==generation)return "ignored";
    if(!["armed","native-open"].includes(intent.phase))return "ignored";
    if(now<intent.createdAtMs||now>=intent.expiresAtMs){intent.phase="canceled";return "ignored";}
    this.capability=folderCapability(this.capability,account,now,evidence);
    intent.provider=evidence==="native-picker"?"native":"custom";
    intent.phase=evidence==="native-picker"?"native-open":"switching";
    return evidence==="native-picker"?"native":"switch";
  }
  openCustom(id:string,account:AccountSession,generation:number):Readonly<FolderIntent>|null{
    const intent=this.intent,now=this.clock();
    if(!intent||intent.id!==id||intent.phase!=="switching"||intent.accountKey!==account.handle||intent.accountEpoch!==account.epoch||intent.generation!==generation||now<intent.createdAtMs||now>=intent.expiresAtMs)return null;
    intent.phase="custom-open";return structuredClone(intent);
  }
  complete(id:string):void{if(this.intent?.id===id)this.intent.phase="complete";}
  cancel():void{if(this.intent)this.intent.phase="canceled";}
}
const controllers=new WeakMap<AppletContext,FolderController>();
export function folderController(context:AppletContext):FolderController{
  let controller=controllers.get(context);if(controller)return controller;
  controller=new FolderController();controllers.set(context,controller);
  context.navigation.onChange(()=>controller!.cancel());
  context.onFocus(()=>controller!.cancel());
  context.storage.onChanged(change=>{if(change.changes.some(c=>c.collection==="session"&&c.key==="account"))controller!.reset();});
  context.onDispose(()=>controller!.reset());return controller;
}
