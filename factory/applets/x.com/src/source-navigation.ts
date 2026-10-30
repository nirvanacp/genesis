import type {AppletContext,Dispose} from "@genesis/sdk";
import {currentHandle,openLibrary,verifyLibraryReturn} from "./account";
import theme from "./theme.css";
import sourceCss from "./source.css";
export function sourceNavigation(context:AppletContext):void{
  context.styles.add("x-source",sourceCss);
  document.documentElement.classList.add("genesis-x");
  context.onDispose(()=>document.documentElement.classList.remove("genesis-x","genesis-x-hub"));
  let routeEffects:Dispose[]=[],guard=false;
  const report=(error:unknown)=>{const status=document.querySelector<HTMLElement>('[data-genesis-owned="x-navigation-status"]');if(status)status.textContent=error instanceof Error?error.message:"This action is temporarily unavailable.";};
  const link=(label:string,path:string)=>{const a=document.createElement("a");a.textContent=label;a.href=new URL(path,"https://x.com").href;return a;};
  const render=()=>{
    for(const dispose of routeEffects)dispose();routeEffects=[];document.documentElement.classList.remove("genesis-x-hub");
    if(!currentHandle())return;
    const primary=document.querySelector('[data-testid="primaryColumn"]');if(!primary)return;
    if(context.sourceId==="account"&&location.pathname==="/home"){
      const handle=currentHandle()!;
      routeEffects.push(context.ui.mountAt("x-account",primary,{position:"before",css:theme+":host{display:block;width:100%;max-width:680px;background:var(--paper)}.hub{padding:24px 20px}.hub header{padding:4px 0 24px}.hub nav{display:grid}.hub nav a,.hub nav button{display:flex;align-items:center;text-align:start;min-height:56px;border-radius:0;border-bottom:1px solid var(--line);padding:12px 4px;color:var(--ink);font-weight:600}.hub nav a:after{content:'›';margin-inline-start:auto;color:var(--muted)}.handle{margin-top:6px;color:var(--muted)}",render:container=>{
        const main=document.createElement("main");main.className="hub enter";const header=document.createElement("header"),heading=document.createElement("h1"),identity=document.createElement("p");heading.textContent="Your X";identity.textContent=`@${handle}`;identity.className="handle";header.append(heading,identity);main.append(header);
        const nav=document.createElement("nav");nav.setAttribute("aria-label","Account destinations");
        for(const [label,path]of[["Profile",`/${handle}`],["Messages","/i/chat"],["Lists",`/${handle}/lists`],["Communities",`/${handle}/communities`],["X bookmarks","/i/history"],["Settings and privacy","/settings"],["Grok","/i/grok"],["Calls","/i/calls"],["Premium","/i/premium_sign_up"]])nav.append(link(label,path));
        const account=document.createElement("button");account.textContent="Account actions";account.onclick=()=>{const upstream=document.querySelector<HTMLElement>('[data-testid="SideNav_AccountSwitcher_Button"]');if(upstream)upstream.click();else location.assign("https://x.com/settings");};nav.append(account);main.append(nav);container.append(main);
      }}));document.documentElement.classList.add("genesis-x-hub");
    }else if(location.pathname==="/home"){
      routeEffects.push(context.ui.mountAt("x-shortcuts",primary,{position:"before",css:theme+":host{display:block;width:100%;max-width:680px;background:var(--paper);border-bottom:1px solid var(--line)}nav{display:flex;justify-content:flex-end;gap:8px;padding:6px 16px}a{display:flex;align-items:center;min-height:44px;padding:8px 16px;font-weight:650;border-radius:999px}a:last-child{background:var(--ink);color:var(--paper)}",render:container=>{const nav=document.createElement("nav");nav.setAttribute("aria-label","Quick actions");nav.append(link("Messages","/i/chat"),link("Post","/compose/post"));container.append(nav);}}));
    }
    if(location.pathname==="/i/history"||location.pathname==="/i/history/likes"){
      routeEffects.push(context.ui.mountAt("x-saved-modes",primary,{position:"before",css:theme+":host{display:block;width:100%;max-width:680px}",render:container=>{
        const nav=document.createElement("div");nav.className="mode";nav.setAttribute("role","tablist");nav.setAttribute("aria-label","Saved location");
        for(const label of["X bookmarks","Categories"]){const b=document.createElement("button");b.textContent=label;b.setAttribute("role","tab");b.setAttribute("aria-selected",String(label==="X bookmarks"));if(label==="Categories")b.onclick=()=>void openLibrary(context).catch(report);nav.append(b);}container.append(nav);
      }}));
    }
  };
  context.navigation.onChange(render);
  context.watchElements("x-source-layout",{selector:'[data-testid="primaryColumn"],[data-testid="AppTabBar_Profile_Link"]',attributes:["href"],text:false,limit:4,contentKey:element=>element.getAttribute("data-testid")},{enter:render,leave:render,update:render});
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
    if(location.pathname==="/i/history"&&document.querySelector('input[aria-label="Search Bookmarks"]')){
      const back=document.querySelector<HTMLElement>('[data-testid="app-bar-back"]');if(back){back.click();return true;}
    }
    return false;
  });
  verifyLibraryReturn(context);render();context.onFocus(render);context.onDispose(()=>{for(const dispose of routeEffects)dispose();});
}
