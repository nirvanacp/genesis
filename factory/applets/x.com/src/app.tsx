import {useEffect,useRef,useState,type FormEvent} from 'react';
import {defineForeground,createOwnedScope,type AppletContext,type SourceSnapshot} from '@genesis/sdk';
import {mountReact} from '@genesis/sdk/react';
import {safeLink,validHandle} from './domain';
import {validModel,routeKind,screens,type XModel} from './view-model';
import {recordAccountObservation} from './account';
import {openCategorySheet} from './components/category-sheet';
import library from './library';
import {Icon} from './components/icon';
import {Post,XLink} from './components/post';
import {PullToRefresh} from './components/pull-to-refresh';
import theme from './theme.css';
import css from './app.css';
export default defineForeground({screens,mount(context,root){return mountReact(context,root,<App context={context}/>);}});
function App({context}:{context:AppletContext}){
  const[snapshot,setSnapshot]=useState<SourceSnapshot|null>(null),[model,setModel]=useState<XModel|null>(null),[accountReady,setAccountReady]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState(''),[more,setMore]=useState(false),[reloading,setReloading]=useState(false);
  const owned=useRef<HTMLDivElement>(null),cache=useRef(new Map<string,XModel>()),positions=useRef(new Map<string,number>()),destination=useRef(''),restore=useRef<string|null>(null),epoch=useRef(-1),version=useRef(0),lastHandle=useRef<string|null>(null);
  const pendingRefresh=useRef<{sourceId:string;url:string;epoch:number;finish:(error?:unknown)=>void}|null>(null);
  useEffect(()=>()=>pendingRefresh.current?.finish(),[]);
  useEffect(()=>context.source.subscribe(value=>{
    const current=++version.current,key=value.pageId||value.url;
    if(destination.current&&destination.current!==key)positions.current.set(destination.current,window.scrollY);
    const changed=destination.current!==key;destination.current=key;
    if(epoch.current!==value.epoch){epoch.current=value.epoch;setAccountReady(false);setError('');setMore(false);}
    setSnapshot(value);
    // During navigation the old document may publish before the replacement binds.
    const incoming=validModel(value.data)&&value.data.kind===routeKind(new URL(value.url).pathname)?value.data:null;
    const pending=pendingRefresh.current;
    if(pending&&(value.sourceId!==pending.sourceId||value.url!==pending.url||!!value.pageId||value.epoch!==pending.epoch&&value.state!=='loading'))pending.finish();
    const confirmed=!!incoming&&incoming.account.status==='signed-in';
    if(incoming?.account.status==='signed-out'||confirmed&&incoming.account.handle!==lastHandle.current){cache.current.clear();lastHandle.current=incoming.account.handle;}
    const tabKey=incoming?.tabs.filter(t=>t.selected).map(t=>t.key).join(',')??'';
    const cacheKey=value.url+'|'+tabKey;
    let display=incoming;
    if(incoming&&['ready','empty'].includes(value.state)){
      const old=['conversation','media'].includes(incoming.kind)?undefined:cache.current.get(cacheKey);
      if(old&&old.account.handle===incoming.account.handle&&value.state==='ready')display={...incoming,posts:[...old.posts.map(p=>incoming.posts.find(n=>n.postId===p.postId)??p),...incoming.posts.filter(n=>!old.posts.some(p=>p.postId===n.postId))].slice(-120)};
      cache.current.set(cacheKey,display!);if(cache.current.size>16)cache.current.delete(cache.current.keys().next().value!);
    }else if(confirmed&&incoming&&['loading','error'].includes(value.state)){display=cache.current.get(cacheKey)??incoming;}
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
  useEffect(()=>{
    if(snapshot?.pageId==='library')return;
    return context.navigation.onBack(()=>{
    const root=context.root.getRootNode() as Document|ShadowRoot;
    const menu=root.querySelector<HTMLDetailsElement>('.post-menu[open]');
    if(!menu)return false;menu.open=false;menu.querySelector('summary')?.focus();return true;
    });
  },[context,snapshot?.pageId,snapshot?.epoch]);
  const run=(action:Promise<unknown>)=>{setError('');void action.catch(e=>setError(String(e)));};
  const refreshSource=()=>{
    if(!snapshot||snapshot.pageId||pendingRefresh.current)return;
    const current=snapshot;
    setError('');setReloading(true);
    for(const key of cache.current.keys())if(key.startsWith(current.url+'|'))cache.current.delete(key);
    positions.current.set(current.url,0);window.scrollTo(0,0);
    const timer=setTimeout(()=>request.finish(new Error('Refresh is taking too long. Try again or open X.')),25000);
    const request={sourceId:current.sourceId,url:current.url,epoch:current.epoch,finish:(failure?:unknown)=>{
      if(pendingRefresh.current!==request)return;
      clearTimeout(timer);pendingRefresh.current=null;
      if(!context.signal.aborted){setReloading(false);if(failure)setError(String(failure));}
    }};
    pendingRefresh.current=request;
    void context.sources.open(current.sourceId,current.url).catch(request.finish);
  };
  const open=(raw:string,website=false)=>{
    const url=safeLink(raw);if(!url)return;const parsed=new URL(url);
    if(website||parsed.origin!=='https://x.com'||!routeKind(parsed.pathname)){run(context.webViews.open({url}));return;}
    run(context.sources.open(snapshot?.sourceId??'primary',url));
  };
  const link=(url:string,label:string,website=false,className='')=><a className={className} href={url} onClick={e=>{if(!e.ctrlKey&&!e.metaKey&&!e.shiftKey){e.preventDefault();open(url,website);}}}>{label}</a>;
  const command=(name:string,key?:string)=>{if(!snapshot)return;run(context.source.command({name,payload:key?{key}:undefined,epoch:snapshot.epoch}));};
  const searchSubmit=(event:FormEvent)=>{event.preventDefault();if(search.trim())open(`https://x.com/search?q=${encodeURIComponent(search.trim())}&src=typed_query`);};
  const entries=()=>!model||!snapshot?null:model.entries.length>0&&<section aria-label={model.kind==='notifications'?'Notifications':model.kind==='discovery'?'Discover':'People and collections'}>{model.entries.map(entry=>{
    const lines=entry.text.split('\n').map(line=>line.trim()).filter(Boolean);
    const titleIndex=entry.kind==='trend'?lines.findIndex(line=>!/^([0-9]+|·)$/.test(line)&&!/trending|posts$/i.test(line)):0;
    const content=<>{entry.kind!=='trend'&&entry.avatar?<img className="avatar" src={entry.avatar} alt="" loading="lazy"/>:null}<span className="entry-copy">{entry.person?<><span className="person-name">{entry.person.name}{entry.person.verified&&<Icon name="verified"/>}</span><span className="entry-meta">@{entry.person.handle}</span>{entry.person.description&&<span className="person-description">{entry.person.description}</span>}</>:lines.map((line,index)=><span key={index} className={index===titleIndex?'entry-title':'entry-meta'}>{line}</span>)}</span></>;
    return <article className={'entry entry-'+entry.kind} key={entry.key}>{entry.command?<button className="entry-target" onClick={()=>command('openEntry',entry.key)}>{content}</button>:entry.url?<XLink className="entry-target" url={entry.url} open={open}>{content}</XLink>:<div className="entry-target">{content}</div>}{entry.kind==='trend'&&<XLink className="icon-button entry-options" url={snapshot.url} open={open} website label="Trend options on X"><Icon name="more"/></XLink>}{entry.kind==='person'&&entry.url&&<XLink className="primary follow-button" url={entry.url} open={open} website>Follow on X</XLink>}</article>;
  })}</section>;
  const sourceTabs=()=>!!model?.tabs.length&&<div className="mode source-tabs" role="tablist" aria-label={model.title+' tabs'}>{model.tabs.map(t=><button key={t.key} role="tab" aria-selected={t.selected} onClick={()=>t.url?open(t.url):command('selectTab',t.key)}><span>{t.label}</span></button>)}</div>;
  const isLibrary=snapshot?.pageId==='library',refreshing=snapshot?.state==='loading'&&!!model&&(model.posts.length>0||model.entries.length>0||!!model.profile),ready=!!model&&(['ready','empty','error'].includes(snapshot?.state??'')||refreshing);
  const isMedia=ready&&model?.kind==='media'&&!!model.media,emptyLines=model?.emptyText?.split('\n').map(line=>line.trim()).filter(Boolean)??[];
  const searchForm=<form className="search" role="search" onSubmit={searchSubmit}><label className="search-field"><Icon name="search"/><input type="search" aria-label="Search X" placeholder="Search X" value={search} maxLength={200} onChange={e=>setSearch(e.target.value)}/></label><button className="icon-button search-submit" type="submit" aria-label="Search"><Icon name="search"/></button></form>;
  return <><style>{theme+css}</style><main className={'x-app'+(isMedia?' media-surface':'')}><PullToRefresh enabled={!!snapshot&&!isLibrary&&!isMedia&&!reloading} busy={reloading} onRefresh={refreshSource} resetKey={(snapshot?.sourceId??'')+'|'+(snapshot?.url??'')}>{error&&<p className="error banner" role="alert">{error}</p>}{isLibrary?<>{accountReady?<div ref={owned}/>:<section className="state"><h1>Categories</h1><p>{snapshot?.state==='loading'?'Verifying your X account…':'Open X and verify the account for your Categories library.'}</p>{snapshot?.state!=='loading'&&link(snapshot?.url??'https://x.com/i/history','Open X',true,'secondary')}</section>}</>:<>
    {!isMedia&&<header className="screen-title">{model?.kind==='discovery'?searchForm:<h1>{ready?model!.title:snapshot?.sectionId==='alerts'?'Notifications':snapshot?.sectionId==='saved'?'Saved':snapshot?.sectionId==='me'?'Profile':snapshot?.sectionId==='explore'?'Explore':'Home'}</h1>}<div className="header-actions">{model?.kind!=='discovery'&&<XLink url="https://x.com/i/chat" open={open} website className="icon-button" label="Messages on X"><Icon name="mail"/></XLink>}<button className="icon-button" aria-label="Refresh" disabled={!snapshot||reloading} onClick={refreshSource}><Icon name="refresh"/></button><XLink url="https://x.com/settings/account" open={open} website className="icon-button" label="Account settings on X"><Icon name="settings"/></XLink></div></header>}
    {['collection','people'].includes(model?.kind??'')&&snapshot&&<div className="page-actions">{link(snapshot.url,model?.kind==='collection'?'Create or manage on X':'People actions on X',true,'secondary')}</div>}
    {model?.kind==='saved'?<div className="mode" role="tablist" aria-label="Saved location"><button role="tab" aria-selected={!snapshot?.url.includes('/likes')} onClick={()=>open('https://x.com/i/history')}><span>Bookmarks</span></button><button role="tab" aria-selected={!!snapshot?.url.includes('/likes')} onClick={()=>open('https://x.com/i/history/likes')}><span>Likes</span></button><button role="tab" aria-selected={false} onClick={()=>run(context.pages.open('library'))}><span>Categories</span></button></div>:model?.kind!=='profile'&&sourceTabs()}
    {!snapshot||snapshot.state==='loading'&&!refreshing?<section className="state" aria-label="Loading X" aria-busy="true"><p role="status">Loading X…</p><div className="skeleton"/><div className="skeleton"/><div className="skeleton"/></section>:!ready?<section className="state"><h2>{snapshot.state==='auth-required'?'Sign in to X':snapshot.state==='challenge'?'X needs your attention':snapshot.state==='error'?'X is unavailable':snapshot.state==='website'?'Continue on X':'Continue on the website'}</h2><p>{snapshot.error?.message??'This page needs the original X website. Your applet will stay here while you use it.'}</p><div className="row">{link(snapshot.url,'Open website',true,'secondary')}<button className="secondary" onClick={()=>run(context.sources.open(snapshot.sourceId,snapshot.url))}>Retry</button></div></section>:<>
      {refreshing&&<p className="banner" role="status">Refreshing the live page…</p>}
      {snapshot.state==='error'&&<p className="banner" role="status">Could not refresh this page. {model!.posts.length>0?'Showing the last loaded posts. ':''}{link(snapshot.url,'Retry on X',true)}</p>}
      {model!.profile&&<section className="profile">
        {model!.profile.banner?<XLink className="profile-banner" url={'https://x.com/'+model!.profile.handle+'/header_photo'} open={open} website label="View profile banner"><img src={model!.profile.banner} alt=""/></XLink>:<div className="profile-banner"/>}
        <div className="profile-body"><div className="profile-toolbar"><XLink className="profile-avatar-link" url={'https://x.com/'+model!.profile.handle+'/photo'} open={open} website label="View profile photo">{model!.profile.avatar?<img className="profile-avatar" src={model!.profile.avatar} alt=""/>:<span className="profile-avatar fallback">{model!.profile.name.slice(0,1)}</span>}</XLink><XLink className={model!.account.handle===model!.profile.handle.toLowerCase()?'secondary profile-edit':'primary profile-edit'} url={model!.account.handle===model!.profile.handle.toLowerCase()?'https://x.com/settings/profile':snapshot.url} open={open} website>{model!.account.handle===model!.profile.handle.toLowerCase()?'Edit profile on X':'Follow on X'}</XLink></div>
        <h2>{model!.profile.name}{model!.profile.verified&&<Icon name="verified"/>}</h2><p className="muted">@{model!.profile.handle}</p><p className="profile-description">{model!.profile.description}</p><p className="profile-details">{model!.profile.details}</p><div className="profile-counts">{model!.profile.links.map(l=><XLink key={l.url} url={l.url} open={open}>{l.label}</XLink>)}</div><div className="profile-links">{link('https://x.com/'+model!.profile.handle+'/lists','Lists')}{link('https://x.com/'+model!.profile.handle+'/communities','Communities')}</div></div>
      </section>}
      {model!.kind==='profile'&&sourceTabs()}
      {model!.kind!=='profile'&&entries()}
      {model!.postNotice&&<section className="post-notice"><h2>{model!.postNotice.title}</h2><p>{model!.postNotice.description.split(model!.postNotice.help.label).map((part,index)=><span key={index}>{index>0&&<XLink url={model!.postNotice!.help.url} open={open}>{model!.postNotice!.help.label}</XLink>}{part}</span>)}</p><XLink className="primary" url={model!.postNotice.postUrl} open={open}>Back to post</XLink></section>}
      {model!.information&&<p className="information">{model!.information}</p>}
      {model!.kind==='media'&&!model!.media&&<section className="state"><p>Use X for full media playback and controls.</p>{link(snapshot.url,'Open original media on X',true,'secondary')}</section>}
      {model!.kind==='media'&&model!.media&&<section className="media-view" aria-label="Post media">
        <header className="media-toolbar"><XLink className="icon-button" url={model!.media.postUrl} open={open} label="View post"><Icon name="close"/></XLink><h2>{model!.media.image?'Photo '+model!.media.index:'Media'}</h2><XLink className="icon-button" url={snapshot.url} open={open} website label="Open original media on X"><Icon name="more"/></XLink></header>
        <div className="media-stage">{model!.media.image?<img src={model!.media.image} alt={`Photo ${model!.media.index} in the selected post`}/>:<p>Use X for full media playback and controls.</p>}
          {model!.media.image&&<nav className="media-navigation" aria-label="Photos">{model!.media.index>1&&<XLink className="icon-button media-previous" url={`${model!.media.postUrl}/photo/${model!.media.index-1}`} open={open} label="Previous photo"><Icon name="previous"/></XLink>}{model!.media.hasNext&&<XLink className="icon-button media-next" url={`${model!.media.postUrl}/photo/${model!.media.index+1}`} open={open} label="Next photo"><Icon name="next"/></XLink>}</nav>}
        </div>
        <div className="media-actions" aria-label="Post actions">{(['reply','repost','like','views','share'] as const).map(name=><XLink key={name} className="icon-button" url={model!.media!.postUrl+(name==='views'?'/analytics':'')} open={open} website={name!=='views'} label={{reply:'Reply on X',repost:'Repost on X',like:'Like on X',views:'View post activity',share:'Share post on X'}[name]}><Icon name={name}/></XLink>)}</div>
      </section>}
      {model!.posts.map(item=><Post key={item.postId} item={item} expanded={model!.kind==='conversation'&&item.postId===snapshot.url.match(/\/status\/([0-9]+)/)?.[1]} open={open} save={()=>openCategorySheet(context,item)} openQuote={key=>command('openQuote',key)}/>)}
      {model!.kind==='profile'&&entries()}
      {emptyLines.length>0&&<section className="state empty-state"><h2>{emptyLines[0]}</h2>{emptyLines.length>1&&<p>{emptyLines.slice(1).join('\n')}</p>}</section>}
      {(model!.posts.length>0||model!.entries.length>0)&&<div className="more"><button className="secondary" disabled={more} onClick={()=>{setMore(true);command('loadMore');setTimeout(()=>setMore(false),1200);}}>{more?'Loading more…':'Load more'}</button></div>}
      {model!.partial&&<p className="banner">Showing a window of this page. {link(snapshot.url,'Continue on X',true)}</p>}
      {!isMedia&&<footer className="page-actions">{link(snapshot.url,'Open page on X',true,'secondary')}{model!.account.handle&&validHandle(model!.account.handle)&&link(`https://x.com/${model!.account.handle}`,'My profile')}{link('https://x.com/settings','Settings',true)}</footer>}
    </>}
  </>}{!isLibrary&&!isMedia&&ready&&<XLink url="https://x.com/compose/post" open={open} website className="compose-button" label="Post on X"><Icon name="compose"/></XLink>}</PullToRefresh></main></>;
}
