import {validInteractions,type InteractionModel} from './interactions';
import {isObject,validHandle,validSnapshot,postUrl,safeLink,type Post} from './domain';
export const screens=['timeline','discovery','profile','people','conversation','post-metadata','media','notifications','saved','collection'];
export interface XPost extends Post {context?:{text:string;url:string};time:string;dateTime?:string;verified?:boolean;avatar:string|null;photos:string[];metrics:{label:string;value:string;active?:boolean}[];quote:{text:string;url:string|null;key?:string;authorName?:string;authorHandle?:string;avatar?:string|null;time?:string;verified?:boolean}|null}
export interface XEntry {key:string;kind:'trend'|'person'|'notification'|'collection';text:string;url:string|null;command:boolean;avatar?:string|null;person?:{name:string;handle:string;description:string;verified:boolean}}
export interface XTab {key:string;label:string;url:string|null;selected:boolean}
export interface XModel {
  interactions?:InteractionModel;
  contentIdentity?:{url:string;selectedTabKey:string;postId?:string;profileHandle?:string};
  kind:string;title:string;account:{status:'signed-in'|'signed-out'|'unknown';handle:string|null};
  tabs:XTab[];posts:XPost[];entries:XEntry[];partial:boolean;emptyText:string|null;
  profile?:{handle:string;name:string;description:string;details:string;links:{label:string;url:string}[];avatar?:string|null;banner?:string|null;verified?:boolean};
  information?:string;media?:{postUrl:string;index:number;kind:'photo'|'video';image:string|null;hasNext:boolean};
  postNotice?:{title:string;description:string;help:{label:string;url:string};postUrl:string};
}
export function imageUrl(value:unknown):string|null {
  const safe=safeLink(value);if(!safe)return null;const url=new URL(safe);
  return url.protocol==='https:'&&['pbs.twimg.com','abs.twimg.com'].includes(url.hostname)&&(!url.port||url.port==='443')?url.href:null;
}
export function validModel(value:unknown):value is XModel {
  if(!isObject(value)||!screens.includes(String(value.kind))||typeof value.title!=='string'||value.title.length>300||!isObject(value.account)||!['signed-in','signed-out','unknown'].includes(String(value.account.status)))return false;
  if(value.interactions!==undefined&&!validInteractions(value.interactions))return false;
  if(value.contentIdentity!==undefined){const c=value.contentIdentity;if(!isObject(c)||!safeLink(c.url)||String(c.url).length>8192||typeof c.selectedTabKey!=='string'||c.selectedTabKey.length>500||(c.postId!==undefined&&!/^[0-9]{1,25}$/.test(String(c.postId)))||(c.profileHandle!==undefined&&!validHandle(c.profileHandle)))return false;}
  if(value.media!==undefined&&(!isObject(value.media)||!postUrl(value.media.postUrl)||!Number.isInteger(value.media.index)||Number(value.media.index)<1||Number(value.media.index)>16||!['photo','video'].includes(String(value.media.kind))||(value.media.image!==null&&!imageUrl(value.media.image))))return false;
  if(value.account.handle!==null&&!validHandle(value.account.handle))return false;
  if(value.postNotice!==undefined){const n=value.postNotice;if(!isObject(n)||typeof n.title!=='string'||n.title.length>200||typeof n.description!=='string'||n.description.length>1800||!postUrl(n.postUrl)||!isObject(n.help)||typeof n.help.label!=='string'||n.help.label.length>100||!safeLink(n.help.url))return false;}
  const optionalImage=(url:unknown)=>url===undefined||url===null||!!imageUrl(url);
  if(value.profile!==undefined){const p=value.profile;if(!isObject(p)||!validHandle(p.handle)||typeof p.name!=='string'||p.name.length>300||typeof p.description!=='string'||p.description.length>4000||typeof p.details!=='string'||p.details.length>1000||!optionalImage(p.avatar)||!optionalImage(p.banner)||(p.verified!==undefined&&typeof p.verified!=='boolean')||!Array.isArray(p.links)||p.links.length>3||!p.links.every(l=>isObject(l)&&typeof l.label==='string'&&l.label.length<=100&&!!safeLink(l.url)))return false;}
  if(!Array.isArray(value.posts)||value.posts.length>120||!value.posts.every(p=>isObject(p)&&validSnapshot(p.snapshot)&&postUrl(p.url)?.postId===p.postId&&typeof p.time==='string'&&p.time.length<=100&&optionalImage(p.avatar)&&(p.verified===undefined||typeof p.verified==='boolean')&&(p.dateTime===undefined||typeof p.dateTime==='string'&&p.dateTime.length<=50&&Number.isFinite(Date.parse(p.dateTime)))&&Array.isArray(p.photos)&&p.photos.length<=4&&p.photos.every(imageUrl)&&Array.isArray(p.metrics)&&p.metrics.length<=5&&p.metrics.every(m=>isObject(m)&&typeof m.label==='string'&&m.label.length<=30&&typeof m.value==='string'&&m.value.length<=120&&(m.active===undefined||typeof m.active==='boolean'))&&(p.quote===null||isObject(p.quote)&&typeof p.quote.text==='string'&&p.quote.text.length<=2500&&(p.quote.url===null||!!postUrl(p.quote.url))&&(p.quote.key===undefined||typeof p.quote.key==='string'&&p.quote.key.length<=40)&&(p.quote.authorName===undefined||typeof p.quote.authorName==='string'&&p.quote.authorName.length<=200)&&(p.quote.authorHandle===undefined||validHandle(p.quote.authorHandle))&&optionalImage(p.quote.avatar)&&(p.quote.time===undefined||typeof p.quote.time==='string'&&p.quote.time.length<=100)&&(p.quote.verified===undefined||typeof p.quote.verified==='boolean'))))return false;
  return Array.isArray(value.tabs)&&value.tabs.length<=16&&value.tabs.every(t=>isObject(t)&&typeof t.key==='string'&&typeof t.label==='string'&&(t.url===null||!!safeLink(t.url)))&&Array.isArray(value.entries)&&value.entries.length<=100&&value.entries.every(e=>isObject(e)&&typeof e.key==='string'&&typeof e.text==='string'&&optionalImage(e.avatar)&&(e.person===undefined||isObject(e.person)&&typeof e.person.name==='string'&&e.person.name.length<=200&&validHandle(e.person.handle)&&typeof e.person.description==='string'&&e.person.description.length<=700&&typeof e.person.verified==='boolean')&&(e.url===null||!!safeLink(e.url)));
}
/** Structural validity alone does not prove that a destination has usable content. */
export function hasContent(model:XModel):boolean {
  return !!(model.posts.length||model.entries.length||model.profile||model.information||model.postNotice||model.media||model.emptyText);
}
export function matchesDestination(model:XModel,raw:string,screen?:string):boolean {
  const url=new URL(raw);
  if(screen!==undefined&&model.kind!==screen||model.contentIdentity&&model.contentIdentity.url!==raw)return false;
  if(model.kind==='conversation')return !!model.emptyText||model.posts.some(p=>p.postId===url.pathname.match(/\/status\/([0-9]+)/)?.[1]);
  if(model.kind==='profile')return !!model.emptyText||model.profile?.handle.toLowerCase()===url.pathname.split('/')[1].toLowerCase();
  if(model.kind==='media')return !!model.media&&model.media.postUrl===raw.replace(/\/(photo|video)\/[0-9]+(?:[?#].*)?$/,'')&&model.media.index===Number(url.pathname.split('/').at(-1));
  return true;
}
