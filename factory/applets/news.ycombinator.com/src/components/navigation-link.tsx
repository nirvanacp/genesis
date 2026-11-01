import {useEffect,useState,type ReactNode} from 'react';
import {navigationCue,type AppletContext,type NavigationDecision} from '@genesis/sdk';
export function HnLink({context,url,website=false,className='',label,children}:{context:AppletContext;url:string;website?:boolean;className?:string;label?:string;children:ReactNode}){
  const [decision,setDecision]=useState<NavigationDecision|null>(null),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let active=true,serial=0;const resolve=()=>{const current=++serial;setDecision(null);void(async()=>{
    const parsed=new URL(url);const destination=parsed.origin==='https://news.ycombinator.com'&&/^#[0-9]+$/.test(parsed.hash)?`https://news.ycombinator.com/item?id=${parsed.hash.slice(1)}`:url;
    let [value]=await context.navigation.resolve([{kind:'url',url:destination}]);
    if(website&&value.kind==='custom')[value]=await context.navigation.resolve([{kind:'url',url,websiteActionId:'original-hn'}]);
    if(active&&current===serial)setDecision(value);
  })().catch(()=>{});};const dispose=context.navigation.subscribe(resolve);resolve();return()=>{active=false;dispose();};},[context,url,website,attempt]);
  return <a href={url} className={className} aria-busy={!decision} aria-label={label?label+(decision?navigationCue(decision):''):undefined} onClick={event=>{
    event.preventDefault();event.stopPropagation();if(!decision)return;
    const parsed=new URL(url);if(parsed.hash&&parsed.origin==='https://news.ycombinator.com'){const id=parsed.hash.slice(1);const anchor=/^[0-9]+$/.test(id)?context.root.querySelector(`[id="comment-${id}"]`):null;if(anchor){anchor.scrollIntoView();return;}}
    void context.navigation.activate({decision,intent:decision.kind==='website'||decision.kind==='external'?'open-website':'navigate'}).catch(()=>{setDecision(null);setAttempt(value=>value+1);});
  }}>{children}{decision&&navigationCue(decision)}</a>;
}
