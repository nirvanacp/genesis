import {isObject,validHandle} from './domain';
export type ActionName='like'|'bookmark'|'repost'|'follow';
export interface ActionRef {token:string;entity:string;name:ActionName;state:boolean;available:boolean}
export interface ActionResult {requestId:number;status:'pending'|'observed'|'rejected'|'uncertain';message?:string}
export interface InteractionModel {visitId:string;revision:number;sequence:number;actions:ActionRef[];results:ActionResult[]}
export interface ActionRequest {visitId:string;requestId:number;token:string;account:string;desired:boolean}
export function validInteractions(v:unknown):v is InteractionModel {
  if(!isObject(v)||typeof v.visitId!=='string'||v.visitId.length>200||!Number.isSafeInteger(v.revision)||!Number.isSafeInteger(v.sequence)||!Array.isArray(v.actions)||v.actions.length>256||!Array.isArray(v.results)||v.results.length>32)return false;
  return v.actions.every(a=>isObject(a)&&typeof a.token==='string'&&a.token.length<=80&&typeof a.entity==='string'&&(a.entity.startsWith('post:')?/^post:[0-9]{1,25}$/.test(a.entity):a.entity.startsWith('person:')&&validHandle(a.entity.slice(7)))&&['like','bookmark','repost','follow'].includes(String(a.name))&&typeof a.state==='boolean'&&typeof a.available==='boolean')&&v.results.every(r=>isObject(r)&&Number.isSafeInteger(r.requestId)&&['pending','observed','rejected','uncertain'].includes(String(r.status))&&(r.message===undefined||typeof r.message==='string'&&r.message.length<=200));
}
export function validRequest(v:unknown):v is ActionRequest {
  return isObject(v)&&Object.keys(v).sort().join(',')==='account,desired,requestId,token,visitId'&&typeof v.visitId==='string'&&v.visitId.length<=200&&Number.isSafeInteger(v.requestId)&&Number(v.requestId)>0&&typeof v.token==='string'&&v.token.length<=80&&validHandle(v.account)&&typeof v.desired==='boolean';
}
