import type {AppletContext} from "@genesis/sdk";
const queues=new WeakMap<AppletContext,Promise<unknown>>();
export async function readLocal<T>(context:AppletContext,collection:string,key:string):Promise<T|null>{
  return (await context.storage.get<T>(collection,key)).document?.value??null;
}
export function writeLocal<T>(context:AppletContext,collection:string,key:string,value:T|null):Promise<void>{
  const previous=queues.get(context)??Promise.resolve();
  const next=previous.catch(()=>{}).then(async()=>{
    for(let attempt=0;attempt<3;attempt++){
      if(context.signal.aborted)throw new Error("This page has closed");
      const {document}=await context.storage.get<T>(collection,key);
      if(value===null&&!document)return;
      try{await context.storage.commit({checks:[{collection,key,expectedRevision:document?.revision??null}],puts:value===null?[]:[{collection,key,value}],deletes:value===null&&document?[{collection,key}]:[]});return;}
      catch(error){if((error as {code?:string}).code!=="CONFLICT"||attempt===2)throw error;}
    }
  });queues.set(context,next);return next;
}
