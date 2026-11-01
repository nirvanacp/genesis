import type {NavigationDecision as Destination, NavigationTarget} from './manifest';
import type {AppletContext, Dispose, HostCall} from './runtime';
export type {NavigationTarget, DestinationKind} from './manifest';
export interface NavigationDecision extends Destination {
  binding:{revision:string;generation:number;navigationVersion:number};decisionKey:string;
}
export interface NavigationSnapshot {decision:NavigationDecision;navigationVersion:number;mode:'applet'|'website'|'recovery'}
export interface NavigationActivation {decision:NavigationDecision;intent:'navigate'|'open-website'}

/** Batches controls in one microtask and never shares decisions across visits. */
export class NavigationClient {
  private version=-1;
  private cache=new Map<string,Promise<NavigationDecision>>();
  private pending=new Map<string,{target:NavigationTarget;resolve:(d:NavigationDecision)=>void;reject:(e:unknown)=>void}>();
  private listeners=new Set<(s:NavigationSnapshot)=>void>();
  private latest:NavigationSnapshot|undefined;
  private queued=false;
  private subscribed=false;
  constructor(private call:HostCall,private signal:AbortSignal){signal.addEventListener('abort',()=>{for(const p of this.pending.values())p.reject(new Error('Navigation disposed'));this.pending.clear();this.cache.clear();this.listeners.clear();},{once:true});}
  receive(snapshot:NavigationSnapshot):void{
    if(this.version!==snapshot.navigationVersion){this.version=snapshot.navigationVersion;this.cache.clear();}
    this.latest=snapshot;for(const listener of this.listeners)listener(snapshot);
  }
  subscribe(callback:(snapshot:NavigationSnapshot)=>void):Dispose{
    this.listeners.add(callback);if(this.latest)callback(this.latest);
    if(!this.subscribed){this.subscribed=true;void this.call('navigation.subscribe',{}).catch(()=>{this.subscribed=false;});}return()=>this.listeners.delete(callback);
  }
  resolve(targets:NavigationTarget[]):Promise<NavigationDecision[]>{
    if(this.signal.aborted)return Promise.reject(new Error('Navigation disposed'));
    if(targets.length>64||new TextEncoder().encode(JSON.stringify(targets)).length>65536)return Promise.reject(new Error('Navigation batch exceeds bounds'));
    return Promise.all(targets.map(target=>{
      const key=JSON.stringify(target);let result=this.cache.get(key);if(result)return result;
      result=new Promise<NavigationDecision>((resolve,reject)=>this.pending.set(key,{target,resolve,reject}));this.cache.set(key,result);
      if(this.cache.size>256)this.cache.delete(this.cache.keys().next().value!);
      if(!this.queued){this.queued=true;queueMicrotask(()=>void this.flush());}return result;
    }));
  }
  private async flush():Promise<void>{
    this.queued=false;const pending=[...this.pending.entries()];this.pending.clear();
    for(let start=0;start<pending.length;start+=64){const batch=pending.slice(start,start+64);try{
      const result=await this.call<NavigationDecision[]>('navigation.resolve',{targets:batch.map(([,p])=>p.target)});
      if(result.length!==batch.length)throw new Error('Incomplete navigation result');
      batch.forEach(([,p],i)=>p.resolve(result[i]));
    }catch(error){for(const [key,p]of batch){this.cache.delete(key);p.reject(error);}}}
  }
  async activate(options:NavigationActivation):Promise<{status:'dispatched'|'recovery';navigationVersion:number}>{
    try{return await this.call('navigation.activate',options);}catch(error){
      if((error as {code?:string}).code==='STALE_NAVIGATION'){this.cache.clear();await this.resolve([options.decision.target]);}
      throw error;
    }
  }
}
export function websiteDestination(decision:NavigationDecision):boolean{return decision.kind==='website'||decision.kind==='external';}
export function navigationCue(decision:NavigationDecision):string{return websiteDestination(decision)?' ↗ Website':'';}
export function createNavigationControl(context:AppletContext,options:{target:NavigationTarget;label:string;className?:string}):HTMLButtonElement{
  const button=document.createElement('button');button.className=options.className??'';button.textContent=options.label;button.disabled=true;
  let decision:NavigationDecision|undefined,serial=0;
  const resolve=()=>{const version=++serial;button.disabled=true;button.setAttribute('aria-busy','true');void context.navigation.resolve([options.target]).then(([value])=>{
    if(context.signal.aborted||version!==serial)return;decision=value;button.textContent=options.label+navigationCue(value);button.setAttribute('aria-label',options.label+navigationCue(value));button.disabled=false;button.removeAttribute('aria-busy');
  }).catch(()=>{if(version===serial){button.textContent=options.label+' · Unavailable';button.removeAttribute('aria-busy');}});};
  const dispose=context.navigation.subscribe(()=>resolve());context.onDispose(dispose);resolve();
  button.onclick=()=>{if(!decision)return;button.disabled=true;void context.navigation.activate({decision,intent:websiteDestination(decision)?'open-website':'navigate'}).catch(()=>resolve()).finally(()=>{if(!context.signal.aborted)button.disabled=false;});};return button;
}
