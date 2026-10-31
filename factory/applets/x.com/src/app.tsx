import {useEffect,useRef,useState,type FormEvent} from 'react';
import {defineForeground,createOwnedScope,type AppletContext,type SourceSnapshot} from '@genesis/sdk';
import {mountReact} from '@genesis/sdk/react';
import {safeLink,validHandle} from './domain';
import {validModel,routeKind,screens,type XModel,type XPost} from './view-model';
import {recordAccountObservation} from './account';
import {openCategorySheet} from './components/category-sheet';
import library from './library';
import theme from './theme.css';
import css from './app.css';
export default defineForeground({screens,mount(context,root){return mountReact(context,root,<App context={context}/>);}});
function App({context}:{context:AppletContext}){
  const[snapshot,setSnapshot]=useState<SourceSnapshot|null>(null),[model,setModel]=useState<XModel|null>(null),[accountReady,setAccountReady]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState(''),[more,setMore]=useState(false);
  const owned=useRef<HTMLDivElement>(null),cache=useRef(new Map<string,XModel>()),positions=useRef(new Map<string,number>()),destination=useRef(''),restore=useRef<string|null>(null),epoch=useRef(-1),version=useRef(0),lastHandle=useRef<string|null>(null);
  useEffect(()=>context.source.subscribe(value=>{
    const current=++version.current,key=value.pageId||value.url;
    if(destination.current&&destination.current!==key)positions.current.set(destination.current,window.scrollY);
    const changed=destination.current!==key;destination.current=key;
    if(epoch.current!==value.epoch){epoch.current=value.epoch;setAccountReady(false);setError('');setMore(false);}
    setSnapshot(value);
    const incoming=validModel(value.data)?value.data:null;
    const confirmed=!!incoming&&incoming.account.status==='signed-in'&&value.state!=='loading';
    if(incoming?.account.status==='signed-out'||confirmed&&incoming.account.handle!==lastHandle.current){cache.current.clear();lastHandle.current=incoming.account.handle;}
    const tabKey=incoming?.tabs.filter(t=>t.selected).map(t=>t.key).join(',')??'';
    const cacheKey=value.url+'|'+tabKey;
    let display=incoming;
    if(incoming&&['ready','empty'].includes(value.state)){
      const old=['conversation','media'].includes(incoming.kind)?undefined:cache.current.get(cacheKey);
      if(old&&old.account.handle===incoming.account.handle&&value.state==='ready')display={...incoming,posts:[...old.posts.map(p=>incoming.posts.find(n=>n.postId===p.postId)??p),...incoming.posts.filter(n=>!old.posts.some(p=>p.postId===n.postId))].slice(-120)};
      cache.current.set(cacheKey,display!);if(cache.current.size>16)cache.current.delete(cache.current.keys().next().value!);
    }else if(value.state==='error'&&!changed){display=[...cache.current.entries()].find(([k])=>k.startsWith(value.url+'|'))?.[1]??null;}
    if(['saved','notifications'].includes(display?.kind??'')&&!confirmed)display=null;
    setModel(display);
    void recordAccountObservation(context,incoming?.account.handle??null,confirmed).then(()=>{if(current===version.current&&!context.signal.aborted)setAccountReady(confirmed);}).catch(e=>{if(current===version.current)setError(String(e));});
    if(changed){setSearch(new URL(value.url).searchParams.get('q')??'');restore.current=key;}
  }),[context]);
  useEffect(()=>{if(restore.current&&model&&snapshot?.state!=='loading'&&!snapshot?.pageId){const key=restore.current;restore.current=null;requestAnimationFrame(()=>window.scrollTo(0,positions.current.get(key)??0));}},[model,snapshot?.state,snapshot?.pageId]);
  useEffect(()=>{
    if(snapshot?.pageId!=='library'||!accountReady||!owned.current)return;
    const scoped=createOwnedScope(context,owned.current);let active=true;
    Promise.resolve(library.activate(scoped.context)).then(dispose=>{if(typeof dispose==='function'){if(active)scoped.context.onDispose(dispose);else dispose();}}).catch(e=>{if(active)setError(String(e));});
    return()=>{active=false;scoped.dispose();owned.current?.replaceChildren();};
  },[context,snapshot?.pageId,snapshot?.epoch,accountReady]);
  const run=(action:Promise<unknown>)=>{setError('');void action.catch(e=>setError(String(e)));};
  const open=(raw:string,website=false)=>{
    const url=safeLink(raw);if(!url)return;const parsed=new URL(url);
    if(website||parsed.origin!=='https://x.com'||!routeKind(parsed.pathname)){run(context.webViews.open({url}));return;}
    run(context.sources.open(snapshot?.sourceId??'primary',url));
  };
  const link=(url:string,label:string,website=false,className='')=><a className={className} href={url} onClick={e=>{if(!e.ctrlKey&&!e.metaKey&&!e.shiftKey){e.preventDefault();open(url,website);}}}>{label}</a>;
  const command=(name:string,key?:string)=>{if(!snapshot)return;run(context.source.command({name,payload:key?{key}:undefined,epoch:snapshot.epoch}));};
  const searchSubmit=(event:FormEvent)=>{event.preventDefault();if(search.trim())open(`https://x.com/search?q=${encodeURIComponent(search.trim())}&src=typed_query`);};
  const post=(item:XPost)=><article className="post" key={item.postId} id={`post-${item.postId}`}>
    <header className="post-heading">{item.avatar?<img className="avatar" src={item.avatar} alt="" loading="lazy"/>:<span className="avatar fallback" aria-hidden="true">{item.snapshot.authorName.slice(0,1)}</span>}<div className="author">{link(`https://x.com/${item.snapshot.authorHandle}`,item.snapshot.authorName)}<span>@{item.snapshot.authorHandle} · {item.time}</span></div></header>
    <a className="post-content" href={item.url} onClick={e=>{e.preventDefault();open(item.url);}}><p className="post-text">{item.snapshot.text||`${item.snapshot.media.kind} post`}</p></a>
    {item.snapshot.textState==='excerpt'&&link(item.url,'Read full post',false,'read-more')}
    {item.quote&&<blockquote><p>{item.quote.text}</p>{item.quote.url&&link(item.quote.url,'View quoted post')}</blockquote>}
    {item.photos.length>0&&<div className={`photos count-${item.photos.length}`}>{item.photos.map((url,i)=><a key={url} href={`${item.url}/photo/${i+1}`} onClick={e=>{e.preventDefault();open(`${item.url}/photo/${i+1}`);}}><img src={url} alt={`Photo ${i+1} in post by @${item.snapshot.authorHandle}`} loading="lazy"/></a>)}</div>}
    {['video','mixed'].includes(item.snapshot.media.kind)&&link(`${item.url}/video/1`,'Play video on X',true,'media-action')}
    {item.snapshot.links.length>0&&<div className="post-links">{item.snapshot.links.map((l,i)=><span key={i}>{link(l.href,l.text)}</span>)}</div>}
    {item.metrics.length>0&&<div className="metrics">{item.metrics.map((m,i)=><span key={i}>{m.value||m.label}</span>)}</div>}
    <div className="post-actions">{link(item.url,'Discussion',false,'secondary')}{link(item.url,'Interact on X',true,'secondary')}<button className="secondary" onClick={()=>openCategorySheet(context,item)}>Save to category</button>{link(item.url,'More on X',true)}</div>
  </article>;
  const isLibrary=snapshot?.pageId==='library',ready=!!model&&['ready','empty','error'].includes(snapshot?.state??'');
  return <><style>{theme+css}</style><main className="x-app">{error&&<p className="error banner" role="alert">{error}</p>}{isLibrary?<>{accountReady?<div ref={owned}/>:<section className="state"><h1>Categories</h1><p>{snapshot?.state==='loading'?'Verifying your X account…':'Open X and verify the account for your Categories library.'}</p>{snapshot?.state!=='loading'&&link(snapshot?.url??'https://x.com/i/history','Open X',true,'secondary')}</section>}</>:<>
    <header className="screen-title"><h1>{ready?model!.title:snapshot?.sectionId==='alerts'?'Notifications':snapshot?.sectionId==='saved'?'Saved':snapshot?.sectionId==='me'?'Profile':snapshot?.sectionId==='explore'?'Explore':'Home'}</h1><div className="row">{link('https://x.com/i/chat','Messages',true)}{link('https://x.com/compose/post','Post',true)}{link('https://x.com/settings/account','Account',true)}</div></header>
    {model?.kind==='discovery'&&<form className="search" onSubmit={searchSubmit}><input type="search" aria-label="Search X" placeholder="Search X" value={search} maxLength={200} onChange={e=>setSearch(e.target.value)}/><button className="primary" type="submit">Search</button></form>}
    {model?.kind==='saved'?<div className="mode" role="tablist" aria-label="Saved location"><button role="tab" aria-selected={!snapshot?.url.includes('/likes')} onClick={()=>open('https://x.com/i/history')}>Bookmarks</button><button role="tab" aria-selected={!!snapshot?.url.includes('/likes')} onClick={()=>open('https://x.com/i/history/likes')}>Likes</button><button role="tab" aria-selected={false} onClick={()=>run(context.pages.open('library'))}>Categories</button></div>:!!model?.tabs.length&&<div className="mode source-tabs" role="tablist" aria-label={`${model.title} tabs`}>{model.tabs.map(t=><button key={t.key} role="tab" aria-selected={t.selected} onClick={()=>t.url?open(t.url):command('selectTab',t.key)}>{t.label}</button>)}</div>}
    {!snapshot||snapshot.state==='loading'?<section className="state" aria-label="Loading X" aria-busy="true"><p role="status">Loading X…</p><div className="skeleton"/><div className="skeleton"/><div className="skeleton"/></section>:!ready?<section className="state"><h2>{snapshot.state==='auth-required'?'Sign in to X':snapshot.state==='challenge'?'X needs your attention':snapshot.state==='error'?'X is unavailable':snapshot.state==='website'?'Continue on X':'Continue on the website'}</h2><p>{snapshot.error?.message??'This page needs the original X website. Your applet will stay here while you use it.'}</p><div className="row">{link(snapshot.url,'Open website',true,'secondary')}<button className="secondary" onClick={()=>run(context.sources.open(snapshot.sourceId,snapshot.url))}>Retry</button></div></section>:<>
      {snapshot.state==='error'&&<p className="banner" role="status">Could not refresh. Showing the last loaded posts. {link(snapshot.url,'Retry on X',true)}</p>}
      {model!.profile&&<section className="profile"><h2>{model!.profile.name}</h2><p className="muted">@{model!.profile.handle}</p><p className="profile-description">{model!.profile.description}</p><p className="muted">{model!.profile.details}</p><div className="row">{model!.profile.links.map(l=><span key={l.url}>{link(l.url,l.label)}</span>)}{link(snapshot.url,model!.account.handle===model!.profile.handle.toLowerCase()?'Edit profile and account':'Follow and profile actions',true,'secondary')}{link(`https://x.com/${model!.profile.handle}/lists`,'Lists')}{link(`https://x.com/${model!.profile.handle}/communities`,'Communities')}</div></section>}
      {model!.entries.length>0&&<section aria-label={model!.kind==='notifications'?'Notifications':model!.kind==='discovery'?'Discover':'People and collections'}>{model!.entries.map(entry=><article className="entry" key={entry.key}><p>{entry.text}</p><div className="row">{entry.command?<button className="secondary" onClick={()=>command('openEntry',entry.key)}>Open {entry.kind==='trend'?'trend':'notification'}</button>:entry.url&&link(entry.url,entry.kind==='person'?'View profile':entry.url.includes('/status/')?'View post':entry.kind==='notification'?'View profile':'Open',false,'secondary')}{entry.kind==='notification'&&link(snapshot.url,'Open notification on X',true)}</div></article>)}</section>}
      {model!.information&&<p className="information">{model!.information}</p>}
      {model!.posts.map(post)}
      {model!.emptyText&&<section className="state"><h2>{model!.emptyText}</h2></section>}
      {(model!.posts.length>0||model!.entries.length>0)&&<div className="more"><button className="secondary" disabled={more} onClick={()=>{setMore(true);command('loadMore');setTimeout(()=>setMore(false),1200);}}>{more?'Loading more…':'Load more'}</button></div>}
      {model!.partial&&<p className="banner">Showing a window of this page. {link(snapshot.url,'Continue on X',true)}</p>}
      <footer className="page-actions">{link(snapshot.url,'Open page on X',true,'secondary')}{model!.account.handle&&validHandle(model!.account.handle)&&link(`https://x.com/${model!.account.handle}`,'My profile')}{link('https://x.com/settings','Settings',true)}</footer>
    </>}
  </>}</main></>;
}
