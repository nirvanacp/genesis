import type {AppletContext,Dispose} from "@genesis/sdk";
import {currentHandle,openLibrary,verifyLibraryReturn} from "./account";
import theme from "./theme.css";
import sourceCss from "./source.css";
export function sourceNavigation(context:AppletContext):void{
  context.styles.add("x-source",sourceCss);
  let state:"detecting"|"ready"|"unsupported"|"retired"="detecting";
  let statusNode:HTMLElement|null=null;
  context.onDispose(()=>{state="retired";document.documentElement.classList.remove("genesis-x");});
  let routeEffects:Dispose[]=[],guard=false;
  const report=(error:unknown)=>{if(statusNode)statusNode.textContent=error instanceof Error?error.message:"This action is temporarily unavailable.";};
  const link=(label:string,path:string)=>{const a=document.createElement("a");a.textContent=label;a.href=new URL(path,"https://x.com").href;return a;};
  const render=()=>{
    for(const dispose of routeEffects)dispose();routeEffects=[];
    document.documentElement.classList.remove("genesis-x");statusNode=null;
    if(state==="retired")return;
    const primary=document.querySelector('[data-testid="primaryColumn"]');
    const content=primary?.firstElementChild;
    if(!primary||!content){state="unsupported";return;}
    const handle=currentHandle();
    if(context.sourceId==="account"&&location.pathname==="/home"&&handle){
      location.replace(`https://x.com/${handle}`);return;
    }
    routeEffects.push(context.ui.mountAt("x-navigation-status",content,{position:"before",css:theme+":host{display:block}p:empty{display:none}p{padding:12px 16px;color:var(--danger)}",render:container=>{statusNode=document.createElement("p");statusNode.setAttribute("role","status");statusNode.setAttribute("aria-live","polite");container.append(statusNode);return()=>{statusNode=null;};}}));
    if(location.pathname==="/home"){
      const profile=document.querySelector('[data-testid="DashButton_ProfileIcon_Link"]');
      const actions=profile?.parentElement;
      if(profile&&actions&&getComputedStyle(actions).flexDirection==="row"&&actions.getBoundingClientRect().height<=56){
        // The inspected mobile header has room beside the profile button. Keep
        // messaging here rather than inserting another row above the timeline.
        routeEffects.push(context.ui.mountAt("x-messages",profile,{position:"after",css:theme+":host{display:flex;align-self:center;margin-inline-start:8px;flex:none}a{display:flex;align-items:center;justify-content:center;width:48px;min-height:48px;border-radius:999px;color:var(--ink)}a:hover{background:var(--line)}",render:container=>{
          const messages=link("","/i/chat");messages.setAttribute("aria-label","Messages");messages.title="Messages";
          messages.innerHTML='<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 6 8 7 8-7"/></svg>';container.append(messages);
        }}));
      }else routeEffects.push(context.ui.mountAt("x-messages",content,{position:"before",css:theme+":host{display:block;width:100%;max-width:680px;background:var(--paper)}nav{display:flex;justify-content:flex-end;padding:0 16px}a{display:flex;align-items:center;min-height:48px;font-weight:650}",render:container=>{
        const nav=document.createElement("nav");nav.setAttribute("aria-label","Messages");nav.append(link("Messages","/i/chat"));container.append(nav);
      }}));
    }
    if(location.pathname==="/i/history"||location.pathname==="/i/history/likes"){
      const tabs=document.querySelector('[role="tablist"]:has(a[href="/i/history"])');
      if(tabs)routeEffects.push(context.ui.mountAt("x-saved-categories",tabs,{position:"append",css:theme+":host{display:flex;flex:1;min-width:110px}button{flex:1;border-radius:0;font-weight:650;color:var(--muted);min-height:50px}",render:container=>{
        container.style.display="contents";
        const button=document.createElement("button");button.textContent="Categories";button.setAttribute("role","tab");button.setAttribute("aria-selected","false");button.onclick=()=>void openLibrary(context).catch(report);container.append(button);
      }}));
    }
    state="ready";
    // Keep source navigation available when signed-in layout detection fails.
    if(handle)document.documentElement.classList.add("genesis-x");
  };
  context.navigation.onChange(render);
  context.watchElements("x-source-layout",{selector:'[data-testid="primaryColumn"],[data-testid="AppTabBar_Profile_Link"],[data-testid="DashButton_ProfileIcon_Link"],[data-testid="AppTabBar_Notifications_Link"],[role="tablist"]:has(a[href="/i/history"])',attributes:["href","aria-label"],text:false,limit:8,contentKey:element=>element.getAttribute("data-testid")??"saved-tabs"},{enter:render,leave:render,update:render});
  const updateGuard=()=>{
    const composer=!!document.querySelector('[role="dialog"] [data-testid^="tweetTextarea"]')||[...document.querySelectorAll('[data-testid^="tweetTextarea"][contenteditable="true"]')].some(element=>!!element.textContent?.trim());
    if(composer!==guard){guard=composer;void context.navigation.setLeaveGuard(composer?{message:"Your post may have unsaved changes. Close it in X to keep a draft, or leave this page."}:null).catch(()=>{});}
  };
  const composerListeners=new Map<string,()=>void>();
  context.watchElements("x-composer",{selector:'[data-testid^="tweetTextarea"][contenteditable="true"]',attributes:["data-testid"],text:false,limit:5,contentKey:()=>"composer"},{enter:binding=>{const listener=()=>updateGuard();binding.element.addEventListener("input",listener);composerListeners.set(binding.id,()=>binding.element.removeEventListener("input",listener));updateGuard();},leave:binding=>{composerListeners.get(binding.id)?.();composerListeners.delete(binding.id);updateGuard();},update:updateGuard});
  context.onDispose(()=>{for(const dispose of composerListeners.values())dispose();composerListeners.clear();});
  context.navigation.onBack(()=>{
    const dialogs=[...document.querySelectorAll<HTMLElement>('[role="dialog"]')].filter(d=>d.getClientRects().length&&!d.closest("[data-genesis-owned]"));
    const active=dialogs.at(-1);
    const close=active?.querySelector<HTMLElement>('[data-testid="app-bar-close"],[aria-label="Close"]');
    if(close){close.click();return true;}
    // X pushes a discovery redirect when entering Communities. Browser history
    // alone can revisit that redirect indefinitely; X's own Back skips it.
    if(/^\/[A-Za-z0-9_]{1,15}\/communities\/explore$/.test(location.pathname)){
      const back=document.querySelector<HTMLElement>('[data-testid="app-bar-back"]');
      if(back?.getClientRects().length){back.click();return true;}
    }
    if(location.pathname==="/i/history"&&document.querySelector('input[aria-label="Search Bookmarks"]')){
      const back=document.querySelector<HTMLElement>('[data-testid="app-bar-back"]');if(back){back.click();return true;}
    }
    return false;
  });
  verifyLibraryReturn(context);render();context.onFocus(render);context.onDispose(()=>{for(const dispose of routeEffects)dispose();});
}
