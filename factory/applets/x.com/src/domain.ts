export interface Library { version:1; libraryId:string; expectedHandle:string; revision:number }
export interface Category { version:1; id:string; name:string; nameKey:string; revision:number; createdAtMs:number; updatedAtMs:number; count:number }
export interface Snapshot {
  authorHandle:string; authorName:string; text:string; textState:"complete"|"excerpt"|"unavailable";
  capturedAtMs:number; media:{kind:"none"|"photo"|"video"|"mixed";count:number};
  links:{text:string;href:string}[]; quotedPostId?:string;
}
export interface Post {postId:string;url:string;snapshot:Snapshot}
export interface Membership {postId:string;revision:number;categoryIds:string[]}
export interface Bookmark extends Post, Membership {version:1;savedAtMs:number;updatedAtMs:number}
export interface Receipt {operationId:string;kind:string;status:"committed";result:unknown;libraryRevision:number;createdAtMs:number}
export interface BookmarkPage {entries:Bookmark[];nextCursor:string|null;libraryRevision:number;filter:{categoryId:string|null;query:string}}
export const normalized = (value:string) => value.normalize("NFKC").trim().replace(/\s+/gu," ").toLowerCase();
export const validHandle = (value:unknown):value is string => typeof value === "string" && /^[A-Za-z0-9_]{1,15}$/.test(value);
export const validId = (value:unknown):value is string => typeof value === "string" && /^[0-9]{1,25}$/.test(value);
export const isObject = (value:unknown):value is Record<string,unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const isNumber = (value:unknown):value is number => Number.isSafeInteger(value) && (value as number)>=0;
export const isUuid = (value:unknown):value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function safeLink(value:unknown):string|null {
  if(typeof value!=="string"||value.length>2048)return null;
  try{const u=new URL(value);return ["https:","http:"].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
export function postUrl(value:unknown):{postId:string;handle:string;url:string}|null {
  if(typeof value!=="string")return null;
  try{const u=new URL(value,"https://x.com"),m=/^\/([A-Za-z0-9_]{1,15})\/status\/([0-9]{1,25})$/.exec(u.pathname);
    return u.origin==="https://x.com"&&!u.username&&!u.password&&m?{postId:m[2],handle:m[1],url:`https://x.com/${m[1]}/status/${m[2]}`}:null;
  }catch{return null;}
}
export function validMembership(value:unknown):value is Membership {
  return isObject(value)&&validId(value.postId)&&isNumber(value.revision)&&value.revision>0&&Array.isArray(value.categoryIds)&&value.categoryIds.length<=10&&value.categoryIds.every(isUuid);
}
export function validSnapshot(value:unknown):value is Snapshot {
  if(!isObject(value)||!validHandle(value.authorHandle)||typeof value.authorName!=="string"||value.authorName.length>800||typeof value.text!=="string"||value.text.length>16000||!isNumber(value.capturedAtMs))return false;
  if(!["complete","excerpt","unavailable"].includes(String(value.textState))||!isObject(value.media)||!["none","photo","video","mixed"].includes(String(value.media.kind))||!isNumber(value.media.count)||value.media.count>16)return false;
  return Array.isArray(value.links)&&value.links.length<=8&&value.links.every(link=>isObject(link)&&typeof link.text==="string"&&!!safeLink(link.href));
}
export function validBookmark(value:unknown):value is Bookmark {
  return validMembership(value)&&isObject(value)&&value.version===1&&validSnapshot(value.snapshot)&&postUrl(value.url)?.postId===value.postId&&isNumber(value.savedAtMs)&&isNumber(value.updatedAtMs);
}
export function validCategory(value:unknown):value is Category {
  return isObject(value)&&value.version===1&&isUuid(value.id)&&typeof value.name==="string"&&value.name.length<=320&&typeof value.nameKey==="string"&&isNumber(value.revision)&&value.revision>0&&isNumber(value.count)&&isNumber(value.createdAtMs)&&isNumber(value.updatedAtMs);
}
export const validLibrary = (v:unknown):v is Library => isObject(v)&&v.version===1&&isUuid(v.libraryId)&&validHandle(v.expectedHandle)&&isNumber(v.revision);
export const validReceipt = (v:unknown):v is Receipt => isObject(v)&&isUuid(v.operationId)&&v.status==="committed"&&typeof v.kind==="string"&&isNumber(v.libraryRevision)&&isNumber(v.createdAtMs)&&isObject(v.result);
