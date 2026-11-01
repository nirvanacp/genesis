import { useLayoutEffect,useEffect,useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { AppletContext, Dispose } from "./runtime";

/** Resolve activation after React commits; always unmount if activation is retired. */
export function mountReact(context: AppletContext, container: HTMLElement, content: ReactNode): Promise<Dispose> {
  const root = createRoot(container);
  let disposed = false;
  const dispose = () => { if (!disposed) { disposed = true; root.unmount(); } };
  context.onDispose(dispose);
  return new Promise(resolve => {
    function Committed() {
      useLayoutEffect(() => { resolve(dispose); }, []);
      return content;
    }
    root.render(<Committed />);
  });
}


import type {NavigationTarget,NavigationDecision} from './navigation';
import {navigationCue,websiteDestination} from './navigation';
/** Destination mode is supplied by the host, including the visible website cue. */
export function NavigationLink({context,target,children,className='',label,tab=false,selected=false}:{context:AppletContext;target:NavigationTarget;children:ReactNode;className?:string;label?:string;tab?:boolean;selected?:boolean}){
  const [decision,setDecision]=useState<NavigationDecision|null>(null),[error,setError]=useState('');
  const identity=JSON.stringify(target);
  useEffect(()=>{
    let active=true,serial=0;
    const resolve=()=>{const current=++serial;setDecision(null);void context.navigation.resolve([JSON.parse(identity) as NavigationTarget]).then(([value])=>{if(active&&current===serial){setDecision(value);setError('');}}).catch(()=>{if(active)setError('Destination unavailable');});};
    const dispose=context.navigation.subscribe(resolve);resolve();return()=>{active=false;dispose();};
  },[context,identity]);
  return <button type="button" className={className} role={tab?'tab':undefined} aria-selected={tab?selected:undefined} aria-label={label?label+(decision?navigationCue(decision):''):undefined} aria-busy={!decision&&!error} disabled={!decision} title={error||undefined} onClick={()=>{
    if(!decision)return;void context.navigation.activate({decision,intent:websiteDestination(decision)?'open-website':'navigate'}).catch(()=>{setDecision(null);void context.navigation.resolve([target]).then(([value])=>setDecision(value));});
  }}>{children}{decision&&navigationCue(decision)}</button>;
}
export function NavigationTab(props:Omit<Parameters<typeof NavigationLink>[0],'tab'>){return <NavigationLink {...props} tab/>;}
