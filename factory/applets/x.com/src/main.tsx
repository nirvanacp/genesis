import {defineSourceAdapter} from '@genesis/sdk';
import {currentHandle} from './source-account';
import {extractPost} from './extract-post';
import {safeLink,validHandle,isObject} from './domain';
import {imageUrl,routeKind,screens,type XModel,type XPost,type XEntry} from './view-model';
const text=(element:Element|null|undefined,max=1200)=>(element?.textContent??'').trim().slice(0,max);
const destination=(value:string|null|undefined)=>value?safeLink(new URL(value,location.href).href):null;
const key=(value:string)=>{let hash=2166136261;for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619);return(hash>>>0).toString(36);};
export default defineSourceAdapter({adapters:screens,activate(context){
  let targets=new Map<string,{element:HTMLElement;text:string}>(),moreTimer:ReturnType<typeof setTimeout>|undefined;
  const publish=()=>{
    const kind=routeKind(location.pathname);if(!kind){void context.source.publish({state:'unsupported'});return;}
    const handle=currentHandle(),signedOut=!!document.querySelector('[data-testid="loginButton"]');
    if(context.sourceId==='account'&&location.pathname==='/home'&&handle){location.replace(`https://x.com/${handle}`);return;}
    const primary=document.querySelector('[data-testid="primaryColumn"]');
    if(!primary){void context.source.publish({state:signedOut?'auth-required':document.readyState==='complete'?'unsupported':'loading'});return;}
    const model:XModel={kind,title:kind==='timeline'?'Home':kind==='saved'?'Saved':kind==='discovery'?'Explore':kind==='conversation'?'Post':kind==='post-metadata'?'Post activity':kind==='media'?'Media':kind==='people'?'People':kind==='collection'?'Collections':kind==='notifications'?'Notifications':'Profile',account:{status:handle?'signed-in':signedOut?'signed-out':'unknown',handle},tabs:[],posts:[],entries:[],partial:false,emptyText:null};
    if(['notifications','saved'].includes(kind)&&signedOut){void context.source.publish({state:'auth-required',data:model});return;}
    const nextTargets=new Map<string,{element:HTMLElement;text:string}>();
    for(const tab of document.querySelectorAll<HTMLElement>('[role="tab"]')){
      const label=text(tab,100);if(!label||model.tabs.length>=16)continue;const id='tab-'+key(label),url=destination(tab.getAttribute('href'));
      model.tabs.push({key:id,label,url,selected:tab.getAttribute('aria-selected')==='true'});nextTargets.set(id,{element:tab,text:label});
    }
    for(const article of primary.querySelectorAll('article[data-testid="tweet"]')){
      const post=extractPost(article);if(!post||model.posts.some(p=>p.postId===post.postId))continue;
      const metrics=[...article.querySelectorAll<HTMLElement>('[data-testid="reply"],[data-testid="retweet"],[data-testid="unretweet"],[data-testid="like"],[data-testid="unlike"],a[href$="/analytics"]')].filter(e=>e.closest('article')===article).map(e=>({label:(e.getAttribute('data-testid')??'Views').replace('un',''),value:e.getAttribute('aria-label')??text(e,120)})).slice(0,5);
      const quote=article.querySelector('[role="link"] [data-testid="tweetText"]'),quoteLink=quote?.closest('[role="link"]')?.querySelector<HTMLAnchorElement>('a[href*="/status/"]');
      const item:XPost={...post,time:text(article.querySelector('time'),100),avatar:imageUrl(article.querySelector<HTMLImageElement>('[data-testid="Tweet-User-Avatar"] img')?.src),photos:[...article.querySelectorAll<HTMLImageElement>('[data-testid="tweetPhoto"] img')].map(i=>imageUrl(i.src)).filter((v):v is string=>!!v).slice(0,4),metrics,quote:quote?{text:text(quote,2500),url:destination(quoteLink?.getAttribute('href'))}:null};
      model.posts.push(item);if(model.posts.length>=40){model.partial=true;break;}
    }
    const focusedId=location.pathname.match(/\/status\/([0-9]+)/)?.[1];
    if(focusedId)model.posts.sort((a,b)=>Number(b.postId===focusedId)-Number(a.postId===focusedId));
    const add=(element:Element,type:XEntry['kind'],command=false)=>{
      const label=text(element,type==='notification'?1800:700);if(!label||model.entries.length>=60)return;
      const id=type+'-'+key(label),link=element.matches('a[href]')?element:element.querySelector('a[href]');
      const url=command?null:destination(link?.getAttribute('href'));if(model.entries.some(e=>e.key===id))return;
      model.entries.push({key:id,kind:type,text:label,url,command});if(command&&element instanceof HTMLElement)nextTargets.set(id,{element,text:label});
    };
    if(kind==='notifications')for(const e of primary.querySelectorAll('[data-testid="notification"]'))add(e,'notification',e.getAttribute('role')==='link');
    if(kind==='discovery')for(const e of primary.querySelectorAll('[data-testid="trend"]'))add(e,'trend',true);
    if(['people','discovery','profile'].includes(kind))for(const e of primary.querySelectorAll('[data-testid="UserCell"]'))add(e,'person');
    if(kind==='collection')for(const e of primary.querySelectorAll('[data-testid="cellInnerDiv"]')){if(!e.querySelector('article')&&(e.querySelector('a[href]')||e.querySelector('[role="link"]')))add(e,'collection');}
    const profileName=primary.querySelector('[data-testid="UserName"]');
    const profileHandle=location.pathname.split('/')[1];
    if(kind==='profile'&&profileName&&validHandle(profileHandle)){
      model.title=text(profileName,200);model.profile={handle:profileHandle,name:model.title,description:text(primary.querySelector('[data-testid="UserDescription"]'),4000),details:text(primary.querySelector('[data-testid="UserProfileHeader_Items"]'),1000),links:[...primary.querySelectorAll<HTMLAnchorElement>('a[href]')].filter(a=>new RegExp(`^/${profileHandle}/(following|followers|verified_followers)$`,'i').test(a.getAttribute('href')??'')).slice(0,3).map(a=>({label:text(a,100),url:a.href}))};
    }
    const empty=primary.querySelector('[data-testid="emptyState"]');if(empty)model.emptyText=text(empty,1800);
    if(!model.emptyText&&!model.posts.length&&!model.entries.length&&!model.profile){
      const heading=[...primary.querySelectorAll('h1,h2,h3')].map(e=>text(e,180)).find(t=>/nothing|no (posts|results|notifications)|haven.t|not (available|exist)|doesn.t exist/i.test(t));if(heading)model.emptyText=heading;
    }
    const errors=[...primary.querySelectorAll('[role="alert"],button')].map(e=>text(e,250)).find(t=>/something went wrong|try again|retry|rate limit/i.test(t));
    if(errors&&!model.posts.length&&!model.entries.length){void context.source.publish({state:'error',data:model,error:{message:errors}});return;}
    if(kind==='post-metadata'&&!model.posts.length){model.information=[...primary.querySelectorAll('[data-testid="cellInnerDiv"],h2')].filter(e=>!e.querySelector('input,textarea,article')).map(e=>text(e,800)).filter(Boolean).slice(0,15).join('\n').slice(0,6000);}
    targets=nextTargets;
    while(new TextEncoder().encode(JSON.stringify(model)).length>150000){model.partial=true;if(model.entries.length)model.entries.pop();else if(model.posts.length>1)model.posts.pop();else break;}
    const ready=model.posts.length||model.entries.length||model.profile||model.information;
    void context.source.publish({state:ready?'ready':model.emptyText?'empty':primary.querySelector('[role="progressbar"]')?'loading':signedOut?'auth-required':'unsupported',data:model});
  };
  publish();context.watchElements('x-content',{selector:'[data-testid="primaryColumn"]',attributes:['href','src','aria-selected','data-testid'],text:true,limit:1,contentKey:()=>location.href},{enter:publish,update:publish});
  context.navigation.onChange(publish);
  context.source.onCommand(command=>{
    if(command.name==='loadMore'){window.scrollBy({top:Math.max(window.innerHeight*2,1000),behavior:'instant'});clearTimeout(moreTimer);moreTimer=setTimeout(publish,1000);return;}
    if(!['selectTab','openEntry'].includes(command.name)||!isObject(command.payload)||typeof command.payload.key!=='string')return;
    const target=targets.get(command.payload.key);if(!target||!target.element.isConnected||text(target.element,command.name==='selectTab'?100:command.payload.key.startsWith('notification-')?1800:700)!==target.text)return;
    if(command.name==='selectTab'&&target.element.getAttribute('role')!=='tab')return;
    if(command.name==='openEntry'&&!target.element.matches('[data-testid="trend"],[data-testid="notification"][role="link"]'))return;
    target.element.click();clearTimeout(moreTimer);moreTimer=setTimeout(publish,500);
  });
  context.onDispose(()=>clearTimeout(moreTimer));
}});
