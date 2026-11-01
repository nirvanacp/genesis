import type {StorySnapshot} from './extract-item';
export interface TextPart {text:string;href?:string;strong?:boolean;code?:boolean;em?:boolean}
export interface Story {snapshot:StorySnapshot;score:string;age:string;comments:string;rank:string}
export interface Comment {id:string;author:string;age:string;depth:number;parts:TextPart[];replyUrl:string|null;contextUrl:string;links:{label:string;url:string}[]}
export interface HnModel {
  kind:'feed'|'discussion'|'profile'|'information'|'account';title:string;
  account:string|null;logoutUrl:string|null;stories:Story[];comments:Comment[];parts:TextPart[];
  profile?:{name:string;fields:{label:string;parts:TextPart[]}[];links:{label:string;url:string}[]};
  nextUrl:string|null;partial:boolean;
}
export function safeUrl(value:string,base:string):string|null {
  try{const url=new URL(value,base);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
/** Allowlisted text model. Source nodes, form fields, tokens and styles never leave the adapter. */
export function richText(node:Node|null,base:string,limit=12000):TextPart[]{
  const result:TextPart[]=[];let length=0;
  const walk=(current:Node,format:Omit<TextPart,'text'>={})=>{
    if(length>=limit)return;
    if(current.nodeType===Node.TEXT_NODE){const text=(current.textContent??'').slice(0,limit-length);length+=text.length;if(text)result.push({text,...format});return;}
    if(!(current instanceof Element))return;
    if(current.matches('script,style,input,textarea,select,button,noscript'))return;
    const next={...format};if(current.tagName==='A'){const href=safeUrl(current.getAttribute('href')??'',base);if(href)next.href=href;}
    if(current.matches('b,strong'))next.strong=true;if(current.matches('i,em'))next.em=true;if(current.matches('code,pre'))next.code=true;
    if(current.matches('p,div,li,br,pre,h1,h2,h3')&&length>0){result.push({text:'\n\n'});length+=2;}
    for(const child of current.childNodes)walk(child,next);
  };
  if(node)walk(node);return result;
}
