import {useEffect,useRef,useState} from 'react';
import {defineForeground,createOwnedScope,type AppletContext,type SourceSnapshot} from '@genesis/sdk';
import {mountReact} from '@genesis/sdk/react';
import {safeUrl,type HnModel,type TextPart,type Story} from './view-model';
import {openStoryDialog} from './components/story-dialog';
import library from './library';
import search from './search';
import theme from './theme.css';
const origin='https://news.ycombinator.com';
const css=`:host{display:block;background:var(--paper);min-height:100dvh;color:var(--ink);font:16px/1.6 Verdana,Geneva,sans-serif}main{max-width:792px;margin:auto;padding:16px}h1{font-size:25px;margin:0 0 12px}h2{font-size:19px;line-height:1.5;margin:0}a{color:inherit;text-decoration:none}a:hover{text-decoration:underline}button,.action{min-height:48px;padding:10px 14px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);font:inherit;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}button:hover,.action:hover{background:var(--wash)}.story{padding:20px 0;border-bottom:1px solid var(--line)}.story h2 a{display:block;min-height:48px}.meta{color:var(--muted);font-size:13px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}.meta a{min-height:48px;display:inline-flex;align-items:center}.actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.domain{font-size:12px;color:var(--muted);overflow-wrap:anywhere}.comment{border-left:2px solid var(--line);padding:14px 0 14px 12px;overflow-wrap:anywhere}.comment summary{cursor:pointer;min-height:48px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.comment summary a{display:inline-flex;align-items:center;min-height:48px;min-width:48px}.rich{white-space:pre-wrap;overflow-wrap:anywhere}.rich a{color:var(--accent);text-decoration:underline}code{font-family:monospace}pre{white-space:pre-wrap}.notice{padding:24px;border:1px solid var(--line);border-radius:16px;background:var(--card);margin:12px 0}.notice p{color:var(--muted)}.skeleton{height:90px;margin:14px 0;background:var(--wash);border-radius:12px}.account-links{display:grid;gap:10px}.account-links a{justify-content:flex-start}.banner{color:var(--muted);font-size:14px}`;
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
    const safe=safeUrl(url,snapshot?.url??origin);if(!safe)return;
    setError('');const parsed=new URL(safe);
    if(parsed.hash&&parsed.origin===origin&&parsed.pathname===new URL(snapshot?.url??origin).pathname&&parsed.search===new URL(snapshot?.url??origin).search){const target=context.root.querySelector(`[id="comment-${parsed.hash.slice(1).replace(/[^0-9]/g,'')}"]`);if(target){target.scrollIntoView();return;}void context.webViews.open({url:safe}).catch(e=>setError(String(e)));return;}
    const form=['/login','/logout','/forgot','/changepw','/submit','/reply','/vote','/comment','/delete','/edit','/fave'];
    const run=website||parsed.origin!==origin||form.includes(parsed.pathname)?context.webViews.open({url:safe}):context.sources.open(snapshot?.sourceId??'primary',safe);
    void run.catch(e=>setError(String(e)));
  };
  const link=(url:string,label:string,website=false)=> <a className="action" href={url} onClick={e=>{e.preventDefault();open(url,website);}}>{label}</a>;
  const rich=(parts:TextPart[])=>parts.map((part,i)=>{let child:React.ReactNode=part.text;if(part.code)child=<code>{child}</code>;if(part.em)child=<em>{child}</em>;if(part.strong)child=<strong>{child}</strong>;return part.href?<a key={i} href={part.href} onClick={e=>{e.preventDefault();open(part.href!);}}>{child}</a>:<span key={i}>{child}</span>;});
  const story=(item:Story)=><article className="story" key={item.snapshot.itemId}><h2><a href={item.snapshot.discussionUrl} onClick={e=>{e.preventDefault();open(item.snapshot.discussionUrl);}}>{item.rank} {item.snapshot.title}</a></h2>{item.snapshot.articleUrl&&<div className="domain">{new URL(item.snapshot.articleUrl).hostname}</div>}<div className="meta"><span>{item.score}</span>{item.snapshot.submitter&&<a href={`${origin}/user?id=${encodeURIComponent(item.snapshot.submitter)}`} onClick={e=>{e.preventDefault();open(e.currentTarget.href);}}>{item.snapshot.submitter}</a>}<span>{item.age}</span></div><div className="actions">{link(item.snapshot.discussionUrl,item.comments||'Discussion')}{item.snapshot.articleUrl&&link(item.snapshot.articleUrl,'Visit website',true)}<button onClick={()=>openStoryDialog(context,item.snapshot)}>Save story</button></div></article>;
  const ready=!!model&&['ready','empty','error'].includes(snapshot?.state??'');
  return <><style>{theme}{css}</style><main>{error&&<p role="alert">{error}</p>}{snapshot?.pageId?<div ref={owned}/>:<>
    <h1>{ready?model!.title:'Hacker News'}</h1>
    {!snapshot||snapshot.state==='loading'?<section aria-label="Loading stories" aria-busy="true"><p role="status">Loading Hacker News…</p><div className="skeleton"/><div className="skeleton"/><div className="skeleton"/></section>:!ready?<section className="notice"><h2>{snapshot.state==='auth-required'?'Sign in to continue':snapshot.state==='website'?'Continue on Hacker News':snapshot.state==='error'?'Hacker News is unavailable':'This page needs the website'}</h2><p>{snapshot.error?.message??'Open the website to continue, or retry loading this page.'}</p><div className="actions">{link(snapshot.url,'Open website',true)}<button onClick={()=>void context.sources.open(snapshot.sourceId,snapshot.url)}>Retry</button></div></section>:<>
      {snapshot.state==='error'&&<p className="banner" role="status">Could not refresh. Showing the last loaded page. {link(snapshot.url,'Retry on website',true)}</p>}
      {model!.kind==='account'?<section className="notice"><h2>{model!.account??'Your Hacker News account'}</h2><p>{model!.account?'Signed in to Hacker News':'Sign in to see your profile and activity.'}</p><div className="account-links">{model!.account?<>{link(`${origin}/user?id=${encodeURIComponent(model!.account)}`,'Profile')}{link(`${origin}/submitted?id=${encodeURIComponent(model!.account)}`,'My submissions')}{link(`${origin}/threads?id=${encodeURIComponent(model!.account)}`,'My comments')}{link(`${origin}/favorites?id=${encodeURIComponent(model!.account)}`,'HN favorites')}{link(`${origin}/user?id=${encodeURIComponent(model!.account)}`,'Account settings and sign out',true)}{model!.logoutUrl&&link(model!.logoutUrl,'Sign out',true)}</>:<>{link(`${origin}/login?goto=news`,'Sign in',true)}{link(`${origin}/forgot`,'Forgot password',true)}</>}</div><p>Genesis Saved stories are separate from HN favorites.</p></section>:<>
      {model!.stories.map(story)}
      {model!.parts.length>0&&<section className="rich">{rich(model!.parts)}</section>}
      {model!.kind==='discussion'&&<div className="actions">{link(snapshot.url,'Vote or comment on website',true)}</div>}
      {model!.profile&&<section><dl>{model!.profile.fields.map(field=><div key={field.label}><dt><strong>{field.label}</strong></dt><dd className="rich">{rich(field.parts)}</dd></div>)}</dl><div className="actions">{model!.profile.links.map(l=><span key={l.url}>{link(l.url,l.label)}</span>)}</div></section>}
      {model!.comments.map(comment=><details className="comment" id={`comment-${comment.id}`} open key={comment.id} style={{marginLeft:Math.min(comment.depth,4)*8}}><summary><a href={`${origin}/user?id=${encodeURIComponent(comment.author)}`} onClick={e=>{e.preventDefault();e.stopPropagation();open(e.currentTarget.href);}}><strong>{comment.author}</strong></a><span className="meta">{comment.age}</span></summary><div className="rich">{rich(comment.parts)}</div><div className="actions">{link(comment.contextUrl,'Permalink')}{comment.links.map(l=><span key={l.url}>{link(l.url,l.label)}</span>)}{comment.replyUrl&&link(comment.replyUrl,'Reply on website',true)}</div></details>)}
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
