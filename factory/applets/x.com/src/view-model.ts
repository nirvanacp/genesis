import {isObject,validHandle,validSnapshot,postUrl,safeLink,type Post} from './domain';
export const screens=['timeline','discovery','profile','people','conversation','post-metadata','media','notifications','saved','collection'];
export interface XPost extends Post {time:string;avatar:string|null;photos:string[];metrics:{label:string;value:string}[];quote:{text:string;url:string|null}|null}
export interface XEntry {key:string;kind:'trend'|'person'|'notification'|'collection';text:string;url:string|null;command:boolean}
export interface XTab {key:string;label:string;url:string|null;selected:boolean}
export interface XModel {
  kind:string;title:string;account:{status:'signed-in'|'signed-out'|'unknown';handle:string|null};
  tabs:XTab[];posts:XPost[];entries:XEntry[];partial:boolean;emptyText:string|null;
  profile?:{handle:string;name:string;description:string;details:string;links:{label:string;url:string}[]};
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
  if(!Array.isArray(value.posts)||value.posts.length>120||!value.posts.every(p=>isObject(p)&&validSnapshot(p.snapshot)&&postUrl(p.url)?.postId===p.postId&&Array.isArray(p.photos)&&p.photos.length<=4&&p.photos.every(imageUrl)&&Array.isArray(p.metrics)))return false;
  return Array.isArray(value.tabs)&&value.tabs.length<=16&&value.tabs.every(t=>isObject(t)&&typeof t.key==='string'&&typeof t.label==='string'&&(t.url===null||!!safeLink(t.url)))&&Array.isArray(value.entries)&&value.entries.length<=100&&value.entries.every(e=>isObject(e)&&typeof e.key==='string'&&typeof e.text==='string'&&(e.url===null||!!safeLink(e.url)));
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
