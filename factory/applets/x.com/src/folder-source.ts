import type {AppletContext} from '@genesis/sdk';
import {currentHandle,observeAccount,type AccountSession} from './account';
import {extractPost} from './extract-post';
import {folderController} from './folder-capability';
import {openCategorySheet} from './components/category-sheet';
import {isObject,postUrl,validSnapshot,type Post} from './domain';

const key='x-folder-return',deniedPaths=['/i/verified-get-verified','/i/premium_sign_up'];
interface Capture {post:Post;handle:string;url:string;time:number;article:Element;ambiguous:boolean}
export function folderSource(context:AppletContext):void {
  const controller=folderController(context);
  const status=(value:string)=>{context.root.dataset.folderFlow=value;};status("ready");
  let capture:Capture|null=null,replay:Element|null=null,token:string|null=null,busy=false;
  // Local routing epochs need a numeric identity independent of the host's type.
  let revision=0;
  const cancelGuard=()=>{const old=token;token=null;if(old)void context.navigation.cancelReturn(old).catch(()=>{});};
  const open=(post:Post,account:AccountSession,denied=false)=>{
    if(context.signal.aborted||currentHandle()!==account.handle)return;
    const intent=controller.begin(account,context.sourceId!,location.href,revision,post);
    if(!intent)return;
    if(denied)controller.observe(intent.id,account,revision,'folder-paywall');
    if(controller.openCustom(intent.id,account,revision))openCategorySheet(context,post,undefined,()=>controller.complete(intent.id));
  };
  let restoring=false;
  const restore=()=>{
    if(restoring||!currentHandle()||context.signal.aborted)return;
    restoring=true;
    void context.navigation.takeReturn(key).then(async result=>{
    if(!result||!isObject(result.state))return;
    const state=result.state,post=state.post;
    if(!deniedPaths.includes(result.matchedPath)||!isObject(post)||!validSnapshot(post.snapshot)||postUrl(post.url)?.postId!==post.postId)return;
    const account=await observeAccount(context);
    if(account.handle!==state.handle||account.epoch!==state.epoch)return;
    open(post as unknown as Post,account,true);
    }).catch(()=>{/* Older hosts retain the explicit Categories entry. */});
  };
  context.watchElements('x-folder-account',{selector:'[data-testid="AppTabBar_Profile_Link"],[data-testid="DashButton_ProfileIcon_Link"],[data-testid="AppTabBar_Notifications_Link"]',attributes:['href','aria-label'],text:false,limit:4,contentKey:e=>e.getAttribute('data-testid')},{enter:restore,update:restore});
  restore();
  const click=(event:MouseEvent)=>{
    const target=event.target instanceof Element?event.target.closest('button,[role="button"]'):null;
    if(!(target instanceof HTMLElement)||target.closest('[data-genesis-owned]'))return;
    if(target===replay){replay=null;return;}
    if(target.matches('[data-testid="bookmark"]')){
      cancelGuard();
      const article=target.closest('article[data-testid="tweet"]'),post=article&&extractPost(article),handle=currentHandle();
      const now=Date.now(),ambiguous=!!capture&&now-capture.time<5000;
      capture=article&&post&&handle?{post:structuredClone(post),handle,url:location.href,time:now,article,ambiguous}:null;
      status(capture?"captured":"identity-unavailable");return;
    }
    const toast=target.closest('[data-testid="toast"][role="alert"]');
    if(!toast||target.textContent?.trim()!=='Add to Folder') {cancelGuard();return;}
    status("folder-gesture");
    const saved=capture;
    if(!saved||saved.ambiguous||Date.now()-saved.time>10000||saved.url!==location.href||saved.handle!==currentHandle()||!saved.article.isConnected||extractPost(saved.article)?.postId!==saved.post.postId||!saved.article.querySelector('[data-testid="removeBookmark"]'))return;
    status("matched");event.preventDefault();event.stopImmediatePropagation();
    if(busy)return;
    busy=true;
    void (async()=>{
      const account=await observeAccount(context);
      if(context.signal.aborted||account.handle!==saved.handle||saved.url!==location.href)return;
      if(controller.state(account)==='custom'){open(saved.post,account);return;}
      // Let X decide capability. Only a causally matched denied route returns.
      try {
        const armed=await context.navigation.armReturn({key,destinationPaths:deniedPaths,returnUrl:saved.url,ttlMs:10000,state:{post:saved.post,handle:account.handle,epoch:account.epoch}});
        token=armed.token;status("armed");
      } catch {status("host-unavailable");/* Source action must remain usable on older hosts. */}
      if(context.signal.aborted||currentHandle()!==account.handle||!target.isConnected||location.href!==saved.url){cancelGuard();return;}
      replay=target;target.click();
    })().catch(()=>{
      cancelGuard();
      if(!context.signal.aborted&&currentHandle()===saved.handle&&location.href===saved.url&&target.isConnected){replay=target;target.click();}
    }).finally(()=>{busy=false;});
  };
  document.addEventListener('click',click,true);
  context.navigation.onChange(()=>{revision++;capture=null;});
  context.onFocus(()=>{capture=null;});
  context.storage.onChanged(change=>{if(change.changes.some(c=>c.collection==='session'&&c.key==='account')){capture=null;cancelGuard();}});
  context.onDispose(()=>{document.removeEventListener('click',click,true);capture=null;});
}
