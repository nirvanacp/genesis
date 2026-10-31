import {useEffect,useState} from "react";
import {createRoot} from "react-dom/client";
import type {AppletContext} from "@genesis/sdk";
import {repository} from "../repository";
import {verifyAccount,requireLibrarySession} from "../account";
import {errorMessage} from "../backend";
import {validateName} from "../categories";
import {validBookmark,type Post,type Category,type Membership,type Library} from "../domain";
import theme from "../theme.css";
const sheetCss=`:host{--paper:#fff;--ink:#0f1419;--muted:#536471;--line:#eff3f4;--wash:#f7f9f9;--accent:#006eaa;--accent-wash:#e8f5fd;--danger:#b42336}@media(prefers-color-scheme:dark){:host{--paper:#000;--ink:#e7e9ea;--muted:#8b98a5;--line:#2f3336;--wash:#16181c;--accent:#71c9f8;--accent-wash:#071e2d;--danger:#ff9aa5}}section[role=dialog]{background:var(--paper)!important;color:var(--ink)!important;padding:0!important;max-height:90dvh!important;width:min(100%,560px)!important;border-radius:22px!important;font:15px/1.45 system-ui!important;box-shadow:0 12px 64px #0005}.sheet-header{padding:12px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px}.category-sheet{display:flex;flex-direction:column;max-height:84dvh;min-height:0}.sheet-header{flex-shrink:0}.sheet-body{padding:20px;display:grid;gap:18px;overflow:auto;min-height:0}.sheet-footer{flex-shrink:0}.preview{padding:14px;background:var(--wash);border-radius:14px}.preview p{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:6px;color:var(--muted);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.categories{max-height:34dvh;overflow:auto;display:grid}.check{display:flex;gap:14px;align-items:center;min-height:54px;border-bottom:1px solid var(--line);font-weight:550;overflow-wrap:anywhere}.check input{min-height:22px;width:22px;accent-color:var(--accent);flex:none}.sheet-footer{display:flex;gap:8px;padding:16px 20px;border-top:1px solid var(--line);justify-content:flex-end;position:relative;background:var(--paper)}.note{font-size:13px;color:var(--muted)}@media(max-width:600px){:host{align-items:flex-end!important;padding:0!important}section[role=dialog]{border-radius:22px 22px 0 0!important;max-height:92dvh!important}}@media(prefers-reduced-motion:no-preference){section[role=dialog]{animation:sheet-in .22s cubic-bezier(.2,.8,.2,1)}@keyframes sheet-in{from{transform:translateY(24px);opacity:.65}to{transform:translateY(0);opacity:1}}}`;
export function openCategorySheet(context:AppletContext,post:Post,verifiedLibrary?:Library,onClosed?:()=>void):void{
  let close=()=>{};
  close=context.ui.openModal("Applet categories",container=>{
    container.setAttribute("aria-label","Applet categories");
    const unsubscribe=context.storage.onChanged(change=>{if(change.changes.some(c=>c.collection==="session"&&c.key==="account"))close();});
    const style=document.createElement("style");style.textContent=theme+sheetCss;container.append(style);
    const target=document.createElement("div");container.append(target);const root=createRoot(target);root.render(<CategorySheet context={context} post={post} verifiedLibrary={verifiedLibrary} close={()=>close()}/>);return()=>{unsubscribe();root.unmount();onClosed?.();};
  });
}
function CategorySheet({context,post,close,verifiedLibrary}:{context:AppletContext;post:Post;close:()=>void;verifiedLibrary?:Library}){
  const repo=repository(context);
  const[categories,setCategories]=useState<Category[]>([]),[selected,setSelected]=useState<string[]>([]),[membership,setMembership]=useState<Membership|null>(null);
  const[library,setLibrary]=useState<Library|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[query,setQuery]=useState(""),[name,setName]=useState(""),[creating,setCreating]=useState(false),[pending,setPending]=useState(false),[confirmRemove,setConfirmRemove]=useState(false);
  const verify=()=>verifiedLibrary&&context.sourceId===null?requireLibrarySession(context,verifiedLibrary).then(()=>verifiedLibrary):verifyAccount(context,repo.backend);
  const load=async()=>{
    setLoading(true);setError("");
    try{
      const verified=await verify();
      const[groups,state,settled]=await Promise.all([repo.backend.categories(),repo.backend.lookup([post.postId]),repo.reconcile(verified)]);
      await requireLibrarySession(context,verified);
      if(context.signal.aborted)return;
      setLibrary(verified);setCategories(groups);setMembership(state.records[0]??null);setSelected(state.records[0]?.categoryIds??[]);setPending(!settled);
    }catch(e){if(!context.signal.aborted)setError(errorMessage(e));}finally{if(!context.signal.aborted)setLoading(false);}
  };
  useEffect(()=>{void load();},[]);
  const create=async()=>{
    const invalid=validateName(name);if(invalid){setError(invalid);return;}if(!library)return;
    setBusy(true);setError("");try{
      await verify();await repo.submit(library,"category.create",{id:crypto.randomUUID(),name});
      const groups=await repo.backend.categories();if(context.signal.aborted)return;setCategories(groups);const added=groups.find(c=>c.nameKey===name.normalize("NFKC").trim().replace(/\s+/gu," ").toLowerCase());if(added)setSelected(ids=>[...new Set([...ids,added.id])].slice(0,10));setName("");setCreating(false);
    }catch(e){setError(errorMessage(e));setPending(!await repo.reconcile(library).catch(()=>false));}finally{setBusy(false);}
  };
  const save=async()=>{
    if(!library)return;if(membership&&!selected.length&&!confirmRemove){setConfirmRemove(true);return;}
    setBusy(true);setError("");try{
      await verify();
      const receipt=await repo.submit(library,selected.length?"bookmark.setCategories":"bookmark.remove",{postId:post.postId,expectedRevision:membership?.revision??null,...(selected.length?{categoryIds:selected,...(!membership?{url:post.url,snapshot:post.snapshot}:{})}:{})});
      if(selected.length&&!validBookmark(receipt.result))throw new Error("The saved response could not be read.");close();
    }catch(e){setError(errorMessage(e));setPending(!await repo.reconcile(library).catch(()=>false));}finally{setBusy(false);}
  };
  return <div className="category-sheet">
    <header className="sheet-header"><button onClick={close} aria-label="Close category editor">✕</button><h2>Applet categories</h2></header>
    <div className="sheet-body"><div className="preview"><strong>@{post.snapshot.authorHandle}</strong><p>{post.snapshot.text||`${post.snapshot.media.kind} post`}</p></div>
      {loading?<p role="status" className="status">Loading your categories…</p>:<>
        {library&&<><label className="field"><span>Find a category</span><input type="search" aria-label="Find a category" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search categories"/></label>
        <div className="categories">{categories.filter(c=>c.name.toLowerCase().includes(query.toLowerCase())).map(c=><label className="check" key={c.id}><input type="checkbox" aria-label={c.name} checked={selected.includes(c.id)} disabled={busy||pending||!selected.includes(c.id)&&selected.length>=10} onChange={e=>{setConfirmRemove(false);setSelected(ids=>e.target.checked?[...ids,c.id]:ids.filter(id=>id!==c.id));}}/><span>{c.name}</span></label>)}{!categories.length&&<p className="muted">Create your first category to keep this post organized.</p>}</div>
        {creating?<div className="field"><label htmlFor="new-category">New category</label><input id="new-category" value={name} onChange={e=>setName(e.target.value)} maxLength={160} autoFocus placeholder="e.g. Design"/><div className="row"><button className="secondary" onClick={()=>void create()} disabled={busy||pending}>Create category</button><button onClick={()=>setCreating(false)}>Cancel</button></div></div>:<button className="secondary" onClick={()=>setCreating(true)} disabled={busy||pending||categories.length>=50}>＋ New category</button>}
        <p className="note">Saved to your private Categories library. X bookmarks are unchanged.</p></>}
      </>}
      {error&&<p role="alert" className="error">{error}</p>}
      {pending&&library&&<div className="field"><p className="muted">A change is still unconfirmed.</p><button className="secondary" onClick={()=>void repo.retry(library).then(load).catch(e=>setError(errorMessage(e)))}>Check or retry the same change</button><button onClick={()=>void repo.abandon(library).then(load).catch(e=>setError(errorMessage(e)))}>Refresh state and abandon pending change</button></div>}
      {!library&&!loading&&<button className="secondary" onClick={()=>void load()}>Try again</button>}
      {confirmRemove&&<p role="alert" className="error">Remove this post from Categories? Its X bookmark will stay unchanged.</p>}
    </div>
    <footer className="sheet-footer"><button onClick={close}>Cancel</button><button className="primary" onClick={()=>void save()} disabled={loading||busy||pending||!library||!membership&&!selected.length}>{busy?"Saving…":membership&&!selected.length?confirmRemove?"Confirm removal":"Remove from Categories":"Save changes"}</button></footer>
  </div>;
}
