import {defineSourceAdapter} from '@genesis/sdk';
import {currentHandle} from './source-account';
import {extractPost} from './extract-post';
import {safeLink,validHandle,isObject} from './domain';
import {imageUrl,routeKind,screens,type XModel,type XPost,type XEntry} from './view-model';
const text=(element:Element|null|undefined,max=1200)=>(element instanceof HTMLElement?element.innerText:element?.textContent??'').trim().slice(0,max);
const destination=(value:string|null|undefined)=>{try{return value?safeLink(new URL(value,location.href).href):null;}catch{return null;}};
const key=(value:string)=>{let hash=2166136261;for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619);return(hash>>>0).toString(36);};
export default defineSourceAdapter({adapters:screens,activate(context){
  let targets=new Map<string,{element:HTMLElement;text:string}>(),moreTimer:ReturnType<typeof setTimeout>|undefined,publication:ReturnType<typeof setTimeout>|undefined;
  const publish=()=>{
    const kind=routeKind(location.pathname);if(!kind){void context.source.publish({state:'unsupported'});return;}
    const handle=currentHandle(),signedOut=!!document.querySelector('[data-testid="loginButton"]');
    if(context.sourceId==='account'&&location.pathname==='/home'&&handle){location.replace(`https://x.com/${handle}`);return;}
    if(kind==='media'){
      const match=location.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/([0-9]{1,25})\/(photo|video)\/([0-9]+)$/);
      const overlay=document.querySelector('[data-testid="swipe-to-dismiss"]');
      if(match&&overlay&&Number(match[4])>=1&&Number(match[4])<=16){
        const images=[...document.querySelectorAll<HTMLImageElement>('img')].filter(img=>!!imageUrl(img.src)&&new URL(img.src).pathname.startsWith('/media/'));
        const selected=images.find(img=>{const r=img.getBoundingClientRect();return r.width>0&&r.left<innerWidth/2&&r.right>innerWidth/2;});
        const media:XModel={kind:'media',title:'Media',account:{status:handle?'signed-in':signedOut?'signed-out':'unknown',handle},tabs:[],posts:[],entries:[],partial:false,emptyText:null,media:{postUrl:`https://x.com/${match[1]}/status/${match[2]}`,index:Number(match[4]),kind:match[3] as 'photo'|'video',image:selected?imageUrl(selected.src):null,hasNext:images.some(img=>img.getBoundingClientRect().left>=innerWidth-2)}};
        void context.source.publish({state:selected||match[3]==='video'?'ready':'loading',data:media});return;
      }
    }
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
      const metrics=[...article.querySelectorAll<HTMLElement>('[data-testid="reply"],[data-testid="retweet"],[data-testid="unretweet"],[data-testid="like"],[data-testid="unlike"],a[href$="/analytics"]')].filter(e=>e.closest('article')===article).map(e=>({label:(e.getAttribute('data-testid')??'views').replace(/^un/,''),value:text(e,120)||e.getAttribute('aria-label')?.slice(0,120)||'',active:['unlike','unretweet'].includes(e.getAttribute('data-testid')??'')})).slice(0,5);
      const quote=article.querySelector('[role="link"] [data-testid="tweetText"]'),quoteLink=quote?.closest('[role="link"]')?.querySelector<HTMLAnchorElement>('a[href*="/status/"]');
      const item:XPost={...post,time:text(article.querySelector('time'),100),avatar:imageUrl(article.querySelector<HTMLImageElement>('[data-testid="Tweet-User-Avatar"] img')?.src),photos:[...article.querySelectorAll<HTMLImageElement>('[data-testid="tweetPhoto"] img')].filter(i=>{const href=destination(i.closest('a[href]')?.getAttribute('href'));if(!href)return false;const u=new URL(href),m=u.pathname.match(/\/status\/([0-9]+)\/photo\/[0-9]+$/);return u.origin==='https://x.com'&&m?.[1]===post.postId;}).map(i=>imageUrl(i.src)).filter((v):v is string=>!!v).slice(0,4),metrics,quote:quote?{text:text(quote,2500),url:destination(quoteLink?.getAttribute('href'))}:null};
      if(quote&&item.quote){
        const container=quote.closest<HTMLElement>('[role="link"]');
        const name=container?.querySelector('[data-testid="User-Name"]');
        const labels=text(name,400).split('\n').map(s=>s.trim()).filter(Boolean);
        const quotedHandle=labels.find(s=>s.startsWith('@'))?.slice(1);
        item.quote.authorName=labels[0]?.slice(0,200);
        if(validHandle(quotedHandle))item.quote.authorHandle=quotedHandle;
        item.quote.avatar=imageUrl(container?.querySelector<HTMLImageElement>('[data-testid="Tweet-User-Avatar"] img')?.src);
        item.quote.time=text(container?.querySelector('time'),100);
        item.quote.verified=!!name?.querySelector('[data-testid="icon-verified"]');
        if(container){item.quote.key='quote-'+post.postId;nextTargets.set(item.quote.key,{element:container,text:text(container,3200)});}
      }
      const dateTime=article.querySelector('time')?.getAttribute('datetime');if(dateTime&&Number.isFinite(Date.parse(dateTime)))item.dateTime=dateTime;
      item.verified=!!article.querySelector('[data-testid="User-Name"] [data-testid="icon-verified"]');
      const social=article.querySelector('[data-testid="socialContext"]');const socialUrl=destination(social?.closest('a[href]')?.getAttribute('href'));if(social&&socialUrl)item.context={text:text(social,200),url:socialUrl};
      model.posts.push(item);if(model.posts.length>=40){model.partial=true;break;}
    }
    const focusedId=location.pathname.match(/\/status\/([0-9]+)/)?.[1];
    if(focusedId)model.posts.sort((a,b)=>Number(b.postId===focusedId)-Number(a.postId===focusedId));
    const add=(element:Element,type:XEntry['kind'],command=false)=>{
      const label=text(element,type==='notification'?1800:700);if(!label||model.entries.length>=60)return;
      const id=type+'-'+key(label),link=element.matches('a[href]')?element:element.querySelector('a[href]');
      const url=command?null:destination(link?.getAttribute('href'));if(model.entries.some(e=>e.key===id))return;
      model.entries.push({key:id,kind:type,text:label,url,command,avatar:imageUrl(element.querySelector<HTMLImageElement>('img')?.src)});if(command&&element instanceof HTMLElement)nextTargets.set(id,{element,text:label});
    };
    if(kind==='notifications')for(const e of primary.querySelectorAll('[data-testid="notification"]'))add(e,'notification',true);
    if(kind==='discovery')for(const e of primary.querySelectorAll('[data-testid="trend"]'))add(e,'trend',true);
    if(['people','discovery','profile'].includes(kind))for(const e of primary.querySelectorAll('[data-testid="UserCell"]'))add(e,'person');
    if(kind==='collection'){
      model.title=text(primary.querySelector('h1,h2'),200)||'Collections';
      for(const e of primary.querySelectorAll('[data-testid="listCell"][role="link"]'))add(e,'collection',true);
      for(const e of primary.querySelectorAll('[data-testid="cellInnerDiv"]'))if(!e.querySelector('article,[data-testid="listCell"]')&&e.querySelector('a[href]'))add(e,'collection');
    }
    const profileName=primary.querySelector('[data-testid="UserName"]');
    const profileHandle=location.pathname.split('/')[1];
    if(kind==='profile'&&profileName&&validHandle(profileHandle)){
      model.title=text(profileName,200).split('\n')[0];model.profile={handle:profileHandle,name:model.title,description:text(primary.querySelector('[data-testid="UserDescription"]'),4000),details:text(primary.querySelector('[data-testid="UserProfileHeader_Items"]'),1000),links:[...primary.querySelectorAll<HTMLAnchorElement>('a[href]')].filter(a=>new RegExp(`^/${profileHandle}/(following|followers|verified_followers)$`,'i').test(a.getAttribute('href')??'')).slice(0,3).map(a=>({label:text(a,100),url:a.href})),avatar:imageUrl(primary.querySelector<HTMLImageElement>(`a[href="/${profileHandle}/photo"] img`)?.src),banner:imageUrl(primary.querySelector<HTMLImageElement>(`a[href="/${profileHandle}/header_photo"] img`)?.src),verified:!!profileName.querySelector('[data-testid="icon-verified"]')};
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
  const schedule=()=>{if(!publication)publication=setTimeout(()=>{publication=undefined;publish();},300);};
  publish();context.watchElements('x-content',{selector:'body',attributes:['href','src','aria-selected','data-testid'],text:true,limit:1,contentKey:()=>location.href},{enter:schedule,update:schedule});
  context.navigation.onChange(publish);window.addEventListener('DOMContentLoaded',schedule,{signal:context.signal});window.addEventListener('load',schedule,{signal:context.signal});
  context.source.onCommand(command=>{
    if(command.name==='loadMore'){window.scrollBy({top:Math.max(window.innerHeight*2,1000),behavior:'instant'});clearTimeout(moreTimer);moreTimer=setTimeout(publish,1000);return;}
    if(!['selectTab','openEntry','openQuote'].includes(command.name)||!isObject(command.payload)||typeof command.payload.key!=='string')return;
    const target=targets.get(command.payload.key);if(!target||!target.element.isConnected||text(target.element,command.name==='selectTab'?100:command.name==='openQuote'?3200:command.payload.key.startsWith('notification-')?1800:700)!==target.text)return;
    if(command.name==='selectTab'&&target.element.getAttribute('role')!=='tab')return;
    if(command.name==='openEntry'&&!target.element.matches('[data-testid="trend"],[data-testid="notification"],[data-testid="listCell"][role="link"]'))return;
    if(command.name==='openQuote'){
      const article=target.element.closest('article[data-testid="tweet"]');
      if(!article||!target.element.matches('[role="link"]')||!target.element.querySelector('[data-testid="tweetText"]')||'quote-'+extractPost(article)?.postId!==command.payload.key)return;
    }
    target.element.click();clearTimeout(moreTimer);moreTimer=setTimeout(publish,500);
  });
  context.onDispose(()=>{clearTimeout(moreTimer);clearTimeout(publication);});
}});
