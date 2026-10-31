import type {AppletContext,Dispose,ElementBinding} from "@genesis/sdk";
import {extractPost} from "./extract-post";
import {repository} from "./repository";
import {currentHandle,verifyAccount} from "./account";
import {openCategorySheet} from "./components/category-sheet";
import theme from "./theme.css";
interface Control{binding:ElementBinding;anchor:Element;button:HTMLButtonElement;dispose:Dispose;active:boolean}
const icon='<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M12 10v7m-3-3.5h6"/></svg>';
export function postControls(context:AppletContext):void{
  const repo=repository(context),controls=new Map<string,Control>(),queue=new Set<Control>();let scheduled=false,running=false,sequence=0;
  const valid=(c:Control,account:string|null)=>c.active&&c.binding.element.isConnected&&!context.signal.aborted&&currentHandle()===account&&extractPost(c.binding.element)?.postId===c.binding.contentKey;
  const pump=async()=>{
    if(running||context.signal.aborted)return;running=true;scheduled=false;
    const batch=[...queue].filter(c=>c.active).slice(0,50);batch.forEach(c=>queue.delete(c));
    if(!batch.length){running=false;return;}
    const account=currentHandle(),version=sequence;
    try{
      await verifyAccount(context,repo.backend);
      const ids=[...new Set(batch.map(c=>c.binding.contentKey))];const result=await repo.backend.lookup(ids);
      if(version!==sequence)return;
      for(const c of batch)if(valid(c,account)){
        const saved=result.records.find(r=>r.postId===c.binding.contentKey);c.button.setAttribute("aria-pressed",String(!!saved));c.button.setAttribute("aria-label",saved?`Edit categories. Saved in ${saved.categoryIds.length} categories`:"Save to category");
        c.button.querySelector("span")!.textContent=saved?`Categories · ${saved.categoryIds.length}`:"Save to category";
      }
    }catch{for(const c of batch)if(valid(c,account))c.button.title="Category state unavailable. Tap to retry.";}
    finally{running=false;if(queue.size&&!context.signal.aborted)void pump();}
  };
  const refresh=(c:Control)=>{queue.add(c);if(!scheduled){scheduled=true;queueMicrotask(()=>void pump());}};
  const remove=(binding:ElementBinding)=>{const c=controls.get(binding.id);if(c){c.active=false;queue.delete(c);c.dispose();controls.delete(binding.id);}};
  const mount=(binding:ElementBinding)=>{
    const bookmark=binding.element.querySelector('[data-testid="bookmark"],[data-testid="removeBookmark"]');const anchor=bookmark?.closest('[role="group"]');if(!anchor)return;
    const button=document.createElement("button");button.type="button";button.innerHTML=icon+"<span>Save to category</span>";button.setAttribute("aria-label","Save to category");
    button.onclick=e=>{e.preventDefault();e.stopPropagation();const post=extractPost(binding.element);if(post?.postId===binding.contentKey&&binding.element.isConnected&&!context.signal.aborted)openCategorySheet(context,post);};
    const dispose=context.ui.mountAt(`x-category:${binding.id}`,anchor,{position:"after",css:theme+":host{display:block;margin-top:4px}button{display:flex;align-items:center;gap:7px;color:var(--muted);font-size:13px;padding:4px 10px;min-height:44px;margin-inline-start:-10px}button[aria-pressed=true]{color:var(--accent)}",render:container=>container.append(button)});
    const control={binding,anchor,button,dispose,active:true};controls.set(binding.id,control);refresh(control);
  };
  context.watchElements("x-posts",{selector:'article[data-testid="tweet"]',attributes:["href","data-testid"],text:false,limit:100,contentKey:element=>extractPost(element)?.postId??null},{enter:mount,leave:remove,update:binding=>{const existing=controls.get(binding.id),anchor=binding.element.querySelector('[data-testid="bookmark"],[data-testid="removeBookmark"]')?.closest('[role="group"]');if(!existing||existing.anchor!==anchor){remove(binding);mount(binding);}}});
  const refreshAll=()=>{sequence++;for(const c of controls.values())refresh(c);};
  context.onFocus(refreshAll);context.storage.onChanged(change=>{if(change.changes.some(c=>c.collection==="session"||c.collection==="operations"))refreshAll();});const unsubscribe=repo.subscribe(refreshAll);
  context.onDispose(()=>{sequence++;unsubscribe();for(const c of controls.values()){c.active=false;c.dispose();}controls.clear();queue.clear();});
}
