import {useEffect,useState,useRef,type ReactNode} from 'react';
import {websiteDestination,type AppletContext,type NavigationDecision} from '@genesis/sdk';
export function HnLink({context,url,website=false,className='',label,children}:{context:AppletContext;url:string;website?:boolean;className?:string;label?:string;children:ReactNode}){
  const currentUrl=useRef('');
  useEffect(()=>context.source.subscribe(snapshot=>{currentUrl.current=snapshot.url;}),[context]);
  const [decision,setDecision]=useState<NavigationDecision|null>(null),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let active=true,serial=0;const resolve=()=>{const current=++serial;setDecision(null);void(async()=>{
    const parsed=new URL(url);const destination=!website&&parsed.origin==='https://news.ycombinator.com'&&/^#[0-9]+$/.test(parsed.hash)?`https://news.ycombinator.com/item?id=${parsed.hash.slice(1)}`:url;
    let [value]=await context.navigation.resolve([{kind:'url',url:destination}]);
    if(website&&value.kind==='custom')[value]=await context.navigation.resolve([{kind:'url',url,websiteActionId:'original-hn'}]);
    if(active&&current===serial)setDecision(value);
  })().catch(()=>{});};const dispose=context.navigation.subscribe(resolve);resolve();return()=>{active=false;dispose();};},[context,url,website,attempt]);
  const opensWebsite=!!decision&&websiteDestination(decision);
  return <a href={url} className={className} aria-busy={!decision} aria-label={label?label+(opensWebsite?', opens website':''):undefined} onClick={event=>{
    event.preventDefault();event.stopPropagation();if(!decision)return;
    const parsed=new URL(url),current=currentUrl.current?new URL(currentUrl.current):null;if(!website&&current&&parsed.origin===current.origin&&parsed.pathname===current.pathname&&parsed.search===current.search&&parsed.hash&&parsed.origin==='https://news.ycombinator.com'){const id=parsed.hash.slice(1);const anchor=/^[0-9]+$/.test(id)?context.root.querySelector(`[id="comment-${id}"]`):null;if(anchor){anchor.scrollIntoView();return;}}
    void context.navigation.activate({decision,intent:decision.kind==='website'||decision.kind==='external'?'open-website':'navigate'}).catch(()=>{setDecision(null);setAttempt(value=>value+1);});
  }}>{children}{opensWebsite&&<><span className="website-cue" aria-hidden="true">↗</span>{!label&&<span className="visually-hidden"> opens website</span>}</>}</a>;
}
