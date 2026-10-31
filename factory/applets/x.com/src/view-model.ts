import {isObject,validHandle,validSnapshot,postUrl,safeLink,type Post} from './domain';
export const screens=['timeline','discovery','profile','people','conversation','post-metadata','media','notifications','saved','collection'];
export interface XPost extends Post {context?:{text:string;url:string};time:string;dateTime?:string;verified?:boolean;avatar:string|null;photos:string[];metrics:{label:string;value:string;active?:boolean}[];quote:{text:string;url:string|null;key?:string;authorName?:string;authorHandle?:string;avatar?:string|null;time?:string;verified?:boolean}|null}
export interface XEntry {key:string;kind:'trend'|'person'|'notification'|'collection';text:string;url:string|null;command:boolean;avatar?:string|null}
export interface XTab {key:string;label:string;url:string|null;selected:boolean}
export interface XModel {
  kind:string;title:string;account:{status:'signed-in'|'signed-out'|'unknown';handle:string|null};
  tabs:XTab[];posts:XPost[];entries:XEntry[];partial:boolean;emptyText:string|null;
  profile?:{handle:string;name:string;description:string;details:string;links:{label:string;url:string}[];avatar?:string|null;banner?:string|null;verified?:boolean};
  information?:string;media?:{postUrl:string;index:number;kind:'photo'|'video';image:string|null;hasNext:boolean};
}
export function imageUrl(value:unknown):string|null {
  const safe=safeLink(value);if(!safe)return null;const url=new URL(safe);
  return url.protocol==='https:'&&['pbs.twimg.com','abs.twimg.com'].includes(url.hostname)&&(!url.port||url.port==='443')?url.href:null;
}
export function validModel(value:unknown):value is XModel {
  if(!isObject(value)||!screens.includes(String(value.kind))||typeof value.title!=='string'||value.title.length>300||!isObject(value.account)||!['signed-in','signed-out','unknown'].includes(String(value.account.status)))return false;
  if(value.media!==undefined&&(!isObject(value.media)||!postUrl(value.media.postUrl)||!Number.isInteger(value.media.index)||Number(value.media.index)<1||Number(value.media.index)>16||!['photo','video'].includes(String(value.media.kind))||(value.media.image!==null&&!imageUrl(value.media.image))))return false;
  if(value.account.handle!==null&&!validHandle(value.account.handle))return false;
  const optionalImage=(url:unknown)=>url===undefined||url===null||!!imageUrl(url);
  if(value.profile!==undefined){const p=value.profile;if(!isObject(p)||!validHandle(p.handle)||typeof p.name!=='string'||p.name.length>300||typeof p.description!=='string'||p.description.length>4000||typeof p.details!=='string'||p.details.length>1000||!optionalImage(p.avatar)||!optionalImage(p.banner)||(p.verified!==undefined&&typeof p.verified!=='boolean')||!Array.isArray(p.links)||p.links.length>3||!p.links.every(l=>isObject(l)&&typeof l.label==='string'&&l.label.length<=100&&!!safeLink(l.url)))return false;}
  if(!Array.isArray(value.posts)||value.posts.length>120||!value.posts.every(p=>isObject(p)&&validSnapshot(p.snapshot)&&postUrl(p.url)?.postId===p.postId&&typeof p.time==='string'&&p.time.length<=100&&optionalImage(p.avatar)&&(p.verified===undefined||typeof p.verified==='boolean')&&(p.dateTime===undefined||typeof p.dateTime==='string'&&p.dateTime.length<=50&&Number.isFinite(Date.parse(p.dateTime)))&&Array.isArray(p.photos)&&p.photos.length<=4&&p.photos.every(imageUrl)&&Array.isArray(p.metrics)&&p.metrics.length<=5&&p.metrics.every(m=>isObject(m)&&typeof m.label==='string'&&m.label.length<=30&&typeof m.value==='string'&&m.value.length<=120&&(m.active===undefined||typeof m.active==='boolean'))&&(p.quote===null||isObject(p.quote)&&typeof p.quote.text==='string'&&p.quote.text.length<=2500&&(p.quote.url===null||!!postUrl(p.quote.url))&&(p.quote.key===undefined||typeof p.quote.key==='string'&&p.quote.key.length<=40)&&(p.quote.authorName===undefined||typeof p.quote.authorName==='string'&&p.quote.authorName.length<=200)&&(p.quote.authorHandle===undefined||validHandle(p.quote.authorHandle))&&optionalImage(p.quote.avatar)&&(p.quote.time===undefined||typeof p.quote.time==='string'&&p.quote.time.length<=100)&&(p.quote.verified===undefined||typeof p.quote.verified==='boolean'))))return false;
  return Array.isArray(value.tabs)&&value.tabs.length<=16&&value.tabs.every(t=>isObject(t)&&typeof t.key==='string'&&typeof t.label==='string'&&(t.url===null||!!safeLink(t.url)))&&Array.isArray(value.entries)&&value.entries.length<=100&&value.entries.every(e=>isObject(e)&&typeof e.key==='string'&&typeof e.text==='string'&&optionalImage(e.avatar)&&(e.url===null||!!safeLink(e.url)));
}
export function routeKind(path:string):string|null {
  if(path==='/home')return'timeline';
  if(/^\/(explore|search|hashtag)(\/|$)/.test(path))return'discovery';
  if(/^\/notifications(\/|$)/.test(path))return'notifications';
  if(/^\/i\/(history|bookmarks)(\/|$)/.test(path))return'saved';
  if(/^\/[A-Za-z0-9_]{1,15}\/status\/[0-9]{1,25}\/(photo|video)\/[0-9]{1,2}$/.test(path))return'media';
  if(/^\/[A-Za-z0-9_]{1,15}\/status\/[0-9]{1,25}\/(quotes|analytics)$/.test(path))return'post-metadata';
  if(/^\/[A-Za-z0-9_]{1,15}\/status\/[0-9]{1,25}$/.test(path))return'conversation';
  if(path==='/i/connect_people'||/^\/[A-Za-z0-9_]{1,15}\/(following|followers|verified_followers)$/.test(path))return'people';
  if(/^\/i\/(lists|communities)(\/|$)/.test(path)||/^\/[A-Za-z0-9_]{1,15}\/(lists|communities)(\/|$)/.test(path))return'collection';
  if(/^\/[A-Za-z0-9_]{1,15}(\/(with_replies|reposts|media))?$/.test(path))return'profile';
  return null;
}
