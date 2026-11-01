import type {SourceAdapterContext} from '@genesis/sdk';
import {extractPost} from './extract-post';
import {currentHandle} from './source-account';
import {validRequest,type ActionName,type ActionRef,type ActionResult,type InteractionModel} from './interactions';

/** Live element authority is never recovered from a cached foreground post. */
export function sourceInteractions(context:SourceAdapterContext,changed:()=>void){
  type Target={ref:ActionRef;root:Element;account:string|null;url:string;tabs:string};
  let targets=new Map<string,Target>(),serial=0,revision=0,sequence=0,pending=false,cancelled=false;
  const uncertain=new Set<string>();
  const results:ActionResult[]=[];
  const tabs=()=>[...document.querySelectorAll('[role=tab][aria-selected=true]')].map(e=>e.textContent).join('|');
  const controls:Record<ActionName,[string,string]>={like:['like','unlike'],bookmark:['bookmark','removeBookmark'],repost:['retweet','unretweet'],follow:['follow','unfollow']};
  const control=(root:Element,name:ActionName)=>{
    const [off,on]=controls[name];
    return [...root.querySelectorAll<HTMLElement>('[data-testid]')].find(e=>{
      const id=e.dataset.testid??'';return (name==='follow'?id.endsWith('-'+off)||id.endsWith('-'+on):id===off||id===on)&&(!root.matches('article')||e.closest('article')===root)&&(!root.matches('[data-testid=primaryColumn]')||!e.closest('article,[data-testid=UserCell]'));
    });
  };
  const state=(el:HTMLElement,name:ActionName)=>name==='follow'?el.dataset.testid!.endsWith('-unfollow'):el.dataset.testid===controls[name][1];
  const enabled=(el:HTMLElement)=>!el.matches(':disabled,[aria-disabled=true]');
  const fresh=(target:Target)=>target.root.isConnected&&target.url===location.href&&target.tabs===tabs()&&target.account===currentHandle()&&(target.ref.entity.startsWith('post:')?'post:'+extractPost(target.root)?.postId===target.ref.entity:target.root.matches('[data-testid=UserCell]')?target.root.querySelector('a[href]')?.getAttribute('href')?.toLowerCase()==='/'+target.ref.entity.slice(7):location.pathname.toLowerCase()==='/'+target.ref.entity.slice(7));
  const observe=():InteractionModel=>{
    const next=new Map<string,Target>();
    const add=(root:Element,entity:string,name:ActionName)=>{
      const el=control(root,name);if(!el)return;
      const old=[...targets.values()].find(t=>t.root===root&&t.ref.entity===entity&&t.ref.name===name&&fresh(t));
      const ref:ActionRef={token:old?.ref.token??String(++serial),entity,name,state:state(el,name),available:!!currentHandle()&&enabled(el)&&!uncertain.has(old?.ref.token??'')};
      next.set(ref.token,{ref,root,account:currentHandle(),url:location.href,tabs:tabs()});
    };
    for(const root of document.querySelectorAll('article[data-testid=tweet]')){const post=extractPost(root);if(post)for(const name of ['like','bookmark','repost'] as const)add(root,'post:'+post.postId,name);}
    // Follow controls are registered only when their user ID and profile link share a cell.
    for(const root of document.querySelectorAll('[data-testid=UserCell]')){const link=root.querySelector<HTMLAnchorElement>('a[href]');const handle=link?.getAttribute('href')?.match(/^\/([A-Za-z0-9_]{1,15})$/)?.[1];if(handle)add(root,'person:'+handle.toLowerCase(),'follow');}
    const profile=document.querySelector('[data-testid=primaryColumn]');
    const handle=location.pathname.match(/^\/([A-Za-z0-9_]{1,15})$/)?.[1];
    if(profile&&handle&&profile.querySelector('[data-testid=UserName]'))add(profile,'person:'+handle.toLowerCase(),'follow');
    targets=next;
    return {visitId:context.binding.viewId,revision:++revision,sequence,actions:[...targets.values()].slice(0,256).map(t=>t.ref),results:results.slice(-32)};
  };
  const dispose=context.source.onCommand(command=>{
    if(command.name==='x.cancelInteraction'){cancelled=true;return;}
    if(command.name!=='x.action'||!validRequest(command.payload))return;
    const request=command.payload;
    if(request.visitId!==context.binding.viewId||request.requestId<=sequence)return;
    sequence=request.requestId;
    const result:ActionResult={requestId:request.requestId,status:'rejected'};results.push(result);if(results.length>32)results.shift();
    const target=targets.get(request.token),el=target&&control(target.root,target.ref.name);
    if(pending||uncertain.has(request.token)||!target||!fresh(target)||!el||!enabled(el)||currentHandle()!==request.account){result.message='This control changed. Check the current post before trying again.';changed();return;}
    if(state(el,target.ref.name)===request.desired){result.status='observed';changed();return;}
    if(document.querySelector('[role=menu],[role=dialog]')){result.message='Close the current source dialog before trying this action.';changed();return;}
    pending=true;cancelled=false;result.status='pending';changed();
    let confirmationClicked=false;
    try{el.click();}catch{pending=false;result.status='uncertain';result.message='X could not confirm this action.';changed();return;}
    const start=Date.now();
    const timer=setInterval(()=>{
      const current=control(target.root,target.ref.name);
      if(cancelled||!fresh(target)||context.signal.aborted){result.status='uncertain';result.message='The page changed before the result was confirmed.';}
      else if(current&&state(current,target.ref.name)===request.desired)result.status='observed';
      else if(!confirmationClicked&&target.ref.name==='repost'){
        const menus=[...document.querySelectorAll('[role=menu]')];
        const confirm=menus.length===1?menus[0].querySelector<HTMLElement>('[data-testid="'+(request.desired?'retweetConfirm':'unretweetConfirm')+'"]'):null;
        if(confirm&&enabled(confirm)&&fresh(target)){confirmationClicked=true;confirm.click();}
        if(Date.now()-start<8000)return;
        result.status='uncertain';result.message='X has not confirmed the repost. Check status.';
      }
      else if(Date.now()-start>=8000){result.status='uncertain';result.message='X has not confirmed this action. Check status before trying again.';}
      else return;
      clearInterval(timer);pending=false;if(result.status==='uncertain')uncertain.add(request.token);changed();
    },200);
    context.onDispose(()=>clearInterval(timer));
  });
  context.onDispose(dispose);
  return {observe};
}
