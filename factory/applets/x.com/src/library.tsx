import {useEffect,useRef,useState} from "react";
import {definePage,type AppletContext} from "@genesis/sdk";
import {mountReact} from "@genesis/sdk/react";
import {repository} from "./repository";
import {enterLibrary,requireLibrarySession} from "./account";
import {readLocal,writeLocal} from "./local-state";
import {errorMessage,LibraryError} from "./backend";
import {safeLink,type Bookmark,type Category,type Library} from "./domain";
import {CategoryManager} from "./components/category-manager";
import {openCategorySheet} from "./components/category-sheet";
import {openCategoryFilter} from "./components/category-filter";
import theme from "./theme.css";
import css from "./library.css";
export default definePage({mount:(context,container)=>mountReact(context,container,<LibraryPage context={context}/>)});
interface Preferences{query:string;categoryId:string|null;scroll:number}
function LibraryPage({context}:{context:AppletContext}){
  const repo=repository(context),[library,setLibrary]=useState<Library|null>(null),[categories,setCategories]=useState<Category[]>([]),[rows,setRows]=useState<Bookmark[]>([]),[query,setQuery]=useState(""),[filter,setFilter]=useState<string|null>(null),[cursor,setCursor]=useState<string|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[ready,setReady]=useState(false),[manage,setManage]=useState(false),[pending,setPending]=useState(false);
  const sequence=useRef(0),verified=useRef<Library|null>(null),preferences=useRef<Preferences>({query:"",categoryId:null,scroll:0}),restoreScroll=useRef(false),failures=useRef(0);
  const savePreferences=()=>{if(!verified.current)return Promise.resolve();preferences.current={query,categoryId:filter,scroll:window.scrollY};return writeLocal(context,"preferences",`library:${verified.current!.libraryId}`,preferences.current).catch(()=>{});};
  const load=async(after:string|null=null)=>{
    const account=verified.current;if(!account)return;const version=++sequence.current;setLoading(true);setError("");
    try{
      const [groups,page,settled]=await Promise.all([repo.backend.categories(),repo.backend.query(filter,query,after),repo.reconcile(account)]);
      await requireLibrarySession(context,account);
      if(context.signal.aborted||version!==sequence.current)return;
      setCategories(groups);setRows(previous=>after?[...previous,...page.entries.filter(row=>!previous.some(old=>old.postId===row.postId))]:page.entries);setCursor(page.nextCursor);setPending(!settled);setReady(true);failures.current=0;
      if(restoreScroll.current){restoreScroll.current=false;requestAnimationFrame(()=>window.scrollTo(0,preferences.current.scroll));}
    }catch(e){if(context.signal.aborted||version!==sequence.current)return;
      if(e instanceof LibraryError&&e.code==="CATEGORY_MISSING"&&filter){setFilter(null);setRows([]);setCursor(null);setReady(false);return;}
      if(e instanceof LibraryError&&e.code==="CURSOR_STALE"&&after&&failures.current++<2){void load(null);return;}
      setError(errorMessage(e));
    }finally{if(version===sequence.current&&!context.signal.aborted)setLoading(false);}
  };
  useEffect(()=>{
    let active=true;
    const verify=async()=>{
      sequence.current++;verified.current=null;setLibrary(null);setRows([]);setLoading(true);setError("");
      try{
        const account=await enterLibrary(context);if(!active||context.signal.aborted||!account)return;
        const key=`library:${account.libraryId}`;
        const prefs=await readLocal<Preferences>(context,"preferences",key)??await readLocal<Preferences>(context,"preferences","library");
        if(!active||context.signal.aborted)return;
        await requireLibrarySession(context,account);
        if(prefs){preferences.current=prefs;setQuery(prefs.query);setFilter(prefs.categoryId);restoreScroll.current=true;await writeLocal(context,"preferences",key,prefs);}
        verified.current=account;setLibrary(account);
      }catch(e){if(active&&!context.signal.aborted){setError(errorMessage(e));setLoading(false);}}
    };void verify();const unsubscribe=context.storage.onChanged(change=>{if(change.changes.some(c=>c.collection==="session"&&c.key==="account")){sequence.current++;verified.current=null;setLibrary(null);setRows([]);setCategories([]);setError("Your account changed. Reopen applet categories to verify it.");setLoading(false);}});const focus=context.onFocus(()=>void verify());return()=>{active=false;sequence.current++;focus();unsubscribe();};
  },[context]);
  useEffect(()=>{if(!library)return;const timer=setTimeout(()=>void load(),300);return()=>{clearTimeout(timer);sequence.current++;};},[library,filter,query]);
  useEffect(()=>repo.subscribe(()=>{if(verified.current)void load();}),[repo,filter,query]);
  useEffect(()=>{
    if(!library)return;
    let timer=setTimeout(()=>void savePreferences(),350),lastSaved=0;
    const persist=()=>{lastSaved=Date.now();void savePreferences();};
    const scroll=()=>{
      preferences.current.scroll=window.scrollY;
      clearTimeout(timer);
      if(Date.now()-lastSaved>250)persist();
      timer=setTimeout(persist,150);
    };
    window.addEventListener("scroll",scroll,{passive:true});
    return()=>{clearTimeout(timer);window.removeEventListener("scroll",scroll);};
  },[query,filter,library]);
  useEffect(()=>context.navigation.onBack(()=>{if(manage){setManage(false);return true;}return false;}),[context,manage]);
  const openX=(path="/i/history")=>{void savePreferences().then(()=>context.sources.open("saved",`https://x.com${path}`)).catch(e=>setError(errorMessage(e)));};
  const openPost=(row:Bookmark)=>{void savePreferences().then(()=>context.sources.open("saved",row.url)).catch(e=>setError(errorMessage(e)));};
  const choose=(id:string|null)=>{setFilter(id);setManage(false);window.scrollTo(0,0);};
  return <><style>{theme+css}</style><main className="library">
    <header className="library-title"><h1>Saved</h1><p>Your private Categories library</p></header>
    <div className="mode" role="tablist" aria-label="Saved location"><button role="tab" aria-selected={false} onClick={()=>openX()}><span>Bookmarks</span></button><button role="tab" aria-selected={false} onClick={()=>openX("/i/history/likes")}><span>Likes</span></button><button role="tab" aria-selected={true} onClick={()=>setManage(false)}><span>Categories</span></button></div>
    {library?<div className="library-layout"><aside className="category-sidebar" aria-label="Filter saved posts"><button aria-pressed={filter===null} onClick={()=>choose(null)}>All saved</button>{categories.map(c=><button key={c.id} aria-pressed={filter===c.id} onClick={()=>choose(c.id)}>{c.name} <small className="muted">{c.count}</small></button>)}</aside><section className="saved-list">
      {manage?<><button className="back-link" onClick={()=>setManage(false)}>‹ Saved posts</button><CategoryManager library={library} repo={repo} categories={categories} refresh={load} openCategory={choose}/></>:<>
      <div className="library-tools"><div className="filter-row"><button className="filter-button secondary" aria-label="Filter by category" onClick={()=>openCategoryFilter(context,categories,filter,choose)}>{categories.find(c=>c.id===filter)?.name??"All saved"} <span aria-hidden="true">⌄</span></button><span className="spacer"/><button onClick={()=>setManage(true)}>Manage</button></div><input type="search" aria-label="Search all saved posts" placeholder="Search saved posts" value={query} onChange={e=>setQuery(e.target.value)} maxLength={200}/></div>
      <div aria-live="polite">{loading&&<p className="status library-status">{rows.length?"Refreshing…":"Loading saved posts…"}</p>}</div>
      {rows.map(row=><article className="saved-post" key={row.postId}><div className="post-heading"><div className="avatar" aria-hidden="true">{row.snapshot.authorName.slice(0,1).toUpperCase()}</div><div className="author"><strong>{row.snapshot.authorName}</strong><span>@{row.snapshot.authorHandle}</span></div><button aria-label={`Edit categories for post by ${row.snapshot.authorHandle}`} onClick={()=>openCategorySheet(context,row,library)}>•••</button></div><p className="post-text">{row.snapshot.text||(row.snapshot.media.kind==='none'?'Post without a text preview':`${row.snapshot.media.kind} post`)}</p>
        {row.snapshot.links.length>0&&<div className="post-links">{row.snapshot.links.map((link,index)=><a key={index} href={safeLink(link.href)!}>{link.text} ↗</a>)}</div>}
        <div className="category-pills">{row.categoryIds.map(id=><span className="pill" key={id}>{categories.find(c=>c.id===id)?.name??"Category"}</span>)}</div>
        <div className="post-actions"><a className="open-post" href={row.url} onClick={e=>{if(!e.ctrlKey&&!e.metaKey&&!e.shiftKey){e.preventDefault();openPost(row);}}}>Open post ↗</a><span className="post-meta">Saved {new Date(row.savedAtMs).toLocaleDateString()}</span></div><p className="snapshot-note">Captured {new Date(row.snapshot.capturedAtMs).toLocaleDateString()}{row.snapshot.textState==="excerpt"?" · Excerpt":""}. View the live post for updates.</p></article>)}
      {!loading&&ready&&!rows.length&&!error&&<div className="empty"><h2>{query?"No matching posts":filter?"Nothing saved here yet":"Keep what matters."}</h2><p>{query?"Try another word or category. Search covers your entire Categories library.":"Use Save to category on a post to find it here later. Your ordinary X bookmarks stay in X."}</p><button className="secondary" onClick={()=>setManage(true)}>Create a category</button></div>}
      {cursor&&<button className="secondary load-more" onClick={()=>void load(cursor)} disabled={loading}>Load more</button>}</>}
      {error&&<div className="library-status"><p className="error" role="alert">{error}</p>{rows.length>0&&<p className="muted">Showing previously loaded posts.</p>}<button onClick={()=>void load()}>Refresh</button></div>}
      {pending&&<div className="library-status"><p>A previous change is still unconfirmed.</p><button className="secondary" onClick={()=>void repo.retry(library).then(()=>load()).catch(e=>setError(errorMessage(e)))}>Check or retry the same change</button><button onClick={()=>void repo.abandon(library).then(()=>load()).catch(e=>setError(errorMessage(e)))}>Refresh state and abandon pending change</button></div>}
    </section></div>:<div className="empty"><h2>{loading?"Verifying your account…":"Categories unavailable"}</h2><p role={error?"alert":"status"}>{error||"Checking your X account before showing your private library."}</p>{!loading&&<button className="primary" onClick={()=>openX()}>Open X bookmarks</button>}</div>}
  </main></>;
}
