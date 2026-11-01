import css from './app.css';
import {StoryHeading} from './components/story-heading';
import storyCss from './story.css';
import {HnLink} from './components/navigation-link';
import {Skeleton} from './components/skeleton';
import {useEffect,useRef,useState} from 'react';
import {defineForeground,createOwnedScope,type AppletContext,type SourceSnapshot} from '@genesis/sdk';
import {mountReact} from '@genesis/sdk/react';
import {safeUrl,type HnModel,type TextPart,type Story} from './view-model';
import {tileClick} from './story-interaction';
import {openStoryDialog} from './components/story-dialog';
import library from './library';
import search from './search';
import theme from './theme.css';
const origin='https://news.ycombinator.com';
export default defineForeground({screens:['feed','discussion','profile','information'],mount(context,root){return mountReact(context,root,<App context={context}/>);}});
function App({context}:{context:AppletContext}){
  const[snapshot,setSnapshot]=useState<SourceSnapshot|null>(null),[error,setError]=useState('');
  const owned=useRef<HTMLDivElement>(null),positions=useRef(new Map<string,number>()),previous=useRef(''),lastPages=useRef(new Map<string,HnModel>());
  useEffect(()=>context.source.subscribe(value=>{
    const cacheKey=value.sourceId+':'+value.url;
    if(['ready','empty'].includes(value.state)&&validModel(value.data)&&value.data.kind!=='account'){
      lastPages.current.set(cacheKey,value.data);if(lastPages.current.size>16)lastPages.current.delete(lastPages.current.keys().next().value!);
    }
    const cached=value.state==='error'?lastPages.current.get(cacheKey):undefined;
    setSnapshot(old=>{if(old&&(old.pageId||old.url)!==(value.pageId||value.url)){const key=old.pageId||old.url;positions.current.set(key,window.scrollY);}return cached?{...value,data:cached}:value;});
  }),[context]);
  const model=validModel(snapshot?.data)?snapshot!.data as HnModel:null;
  const key=snapshot?.pageId||snapshot?.url||'';
  useEffect(()=>{if(key!==previous.current&&snapshot?.state!=='loading'){previous.current=key;requestAnimationFrame(()=>window.scrollTo(0,positions.current.get(key)??0));} },[key,snapshot?.state]);
  useEffect(()=>{
    if(!snapshot?.pageId||!owned.current)return;
    const entry=snapshot.pageId==='library'?library:snapshot.pageId==='search'?search:null;if(!entry)return;
    const scoped=createOwnedScope(context,owned.current);let active=true;
    Promise.resolve(entry.activate(scoped.context)).then(dispose=>{if(typeof dispose==='function'){if(active)scoped.context.onDispose(dispose);else dispose();}}).catch(e=>{if(active)setError(String(e));});
    return()=>{active=false;scoped.dispose();owned.current?.replaceChildren();};
  },[context,snapshot?.pageId,snapshot?.epoch]);
  const open=(url:string,website=false)=>{
    const safe=safeUrl(url,snapshot?.url??origin);if(!safe)return;setError('');const parsed=new URL(safe),current=new URL(snapshot?.url??origin);
    if(!website&&parsed.hash&&parsed.origin===origin&&parsed.pathname===current.pathname&&parsed.search===current.search){const target=context.root.querySelector(`[id="comment-${parsed.hash.slice(1).replace(/[^0-9]/g,'')}"]`);if(target){target.scrollIntoView();return;}}
    void(async()=>{const destination=parsed.origin===origin&&/^#[0-9]+$/.test(parsed.hash)?`${origin}/item?id=${parsed.hash.slice(1)}`:safe;let [decision]=await context.navigation.resolve([{kind:'url',url:destination}]);if(website&&decision.kind==='custom')[decision]=await context.navigation.resolve([{kind:'url',url:safe,websiteActionId:'original-hn'}]);await context.navigation.activate({decision,intent:decision.kind==='website'||decision.kind==='external'?'open-website':'navigate'});})().catch(e=>setError(String(e)));
  };
  const link=(url:string,label:string,website=false)=><HnLink context={context} url={url} website={website} className="action">{label}</HnLink>;
  const rich=(parts:TextPart[])=>parts.map((part,i)=>{let child:React.ReactNode=part.text;if(part.code)child=<code>{child}</code>;if(part.em)child=<em>{child}</em>;if(part.strong)child=<strong>{child}</strong>;return part.href?<HnLink key={i} context={context} url={part.href}>{child}</HnLink>:<span key={i}>{child}</span>;});
  const story=(item:Story)=><article className="story" key={item.snapshot.itemId} onClick={e=>tileClick(e.nativeEvent,()=>open(item.snapshot.discussionUrl))}>
    <StoryHeading context={context} title={item.snapshot.title} url={item.snapshot.discussionUrl} articleUrl={item.snapshot.articleUrl} rank={item.rank}>
      <div className="story-metadata">{item.score&&<span>{item.score}</span>}{item.snapshot.submitter&&<HnLink context={context} url={`${origin}/user?id=${encodeURIComponent(item.snapshot.submitter)}`}>{item.snapshot.submitter}</HnLink>}<span>{item.age}</span><HnLink className="story-comments" context={context} url={item.snapshot.discussionUrl}>{item.comments||'Discussion'}</HnLink></div>
    </StoryHeading>
    <button type="button" className="story-save" aria-label={'Save story: '+item.snapshot.title} title="Save story" onClick={()=>openStoryDialog(context,item.snapshot)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg></button>
  </article>;
  const ready=!!model&&['ready','empty','error'].includes(snapshot?.state??'');
  return <><style>{theme}{css}{storyCss}</style><main>{error&&<p role="alert">{error}</p>}{snapshot?.pageId?<div ref={owned}/>:<>
    <h1>{ready?(model!.title==='Hacker News'?'Top stories':model!.title):'Hacker News'}</h1>
    {!snapshot||snapshot.state==='loading'?<Skeleton kind={snapshot?.url.includes('/user?')?'profile':snapshot?.url.includes('/item?')?'discussion':snapshot?.sourceId==='me'?'form':'feed'} label="Loading Hacker News"/>:!ready?<section className="notice"><h2>{snapshot.state==='auth-required'?'Sign in to continue':snapshot.state==='website'?'Continue on Hacker News':snapshot.state==='error'?'Hacker News is unavailable':'This page needs the website'}</h2><p>{snapshot.error?.message??'Open the website to continue, or retry loading this page.'}</p><div className="actions">{link(snapshot.url,'Open website',true)}<button onClick={()=>void context.sources.open(snapshot.sourceId,snapshot.url)}>Retry</button></div></section>:<>
      {snapshot.state==='error'&&<p className="banner" role="status">Could not refresh. Showing the last loaded page. {link(snapshot.url,'Retry on website',true)}</p>}
      {model!.kind==='account'?<section className="notice"><h2>{model!.account??'Your Hacker News account'}</h2><p>{model!.account?'Signed in to Hacker News':'Sign in to see your profile and activity.'}</p><div className="account-links">{model!.account?<>{link(`${origin}/user?id=${encodeURIComponent(model!.account)}`,'Profile')}{link(`${origin}/submitted?id=${encodeURIComponent(model!.account)}`,'My submissions')}{link(`${origin}/threads?id=${encodeURIComponent(model!.account)}`,'My comments')}{link(`${origin}/favorites?id=${encodeURIComponent(model!.account)}`,'HN favorites')}{link(`${origin}/user?id=${encodeURIComponent(model!.account)}`,'Account settings and sign out',true)}{model!.logoutUrl&&link(model!.logoutUrl,'Sign out',true)}</>:<>{link(`${origin}/login?goto=news`,'Sign in',true)}{link(`${origin}/forgot`,'Forgot password',true)}</>}</div><p>Genesis Saved stories are separate from HN favorites.</p></section>:<>
      {model!.stories.map(story)}
      {model!.parts.length>0&&<section className="rich">{rich(model!.parts)}</section>}
      {model!.kind==='discussion'&&<div className="actions">{link(snapshot.url,'Open discussion on HN website',true)}</div>}
      {model!.profile&&<section><dl>{model!.profile.fields.map(field=><div key={field.label}><dt><strong>{field.label}</strong></dt><dd className="rich">{rich(field.parts)}</dd></div>)}</dl><div className="actions">{model!.profile.links.map(l=><span key={l.url}>{link(l.url,l.label)}</span>)}</div></section>}
      {model!.comments.map(comment=><details className="comment" id={`comment-${comment.id}`} open key={comment.id} style={{marginLeft:Math.min(comment.depth,4)*8}}><summary><HnLink context={context} url={`${origin}/user?id=${encodeURIComponent(comment.author)}`}><strong>{comment.author}</strong></HnLink><span className="meta">{comment.age}</span></summary><div className="rich">{rich(comment.parts)}</div><div className="actions">{link(comment.contextUrl,'Permalink')}{comment.links.map(l=><span key={l.url}>{link(l.url,l.label)}</span>)}{comment.replyUrl&&link(comment.replyUrl,'Reply on website',true)}</div></details>)}
      {snapshot.state==='empty'&&<p className="notice">No items on this page.</p>}
      {model!.partial&&<p className="banner">More comments are available on the website. {link(snapshot.url,'Continue reading',true)}</p>}
      {model!.nextUrl&&<div className="actions">{link(model!.nextUrl,'More')}</div>}
      <div className="actions">{link(snapshot.url,'Open page on website',true)}</div>
      </>}
    </>}
  </>}</main></>;
}
function validModel(value:unknown):value is HnModel {
  const model=value as HnModel|undefined;
  return !!model&&['feed','discussion','profile','information','account'].includes(model.kind)&&Array.isArray(model.stories)&&Array.isArray(model.comments)&&Array.isArray(model.parts)&&model.stories.length<=200&&model.comments.length<=100;
}
