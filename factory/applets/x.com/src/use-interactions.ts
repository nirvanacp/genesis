import {useEffect,useRef,useState} from 'react';
import type {AppletContext,SourceSnapshot} from '@genesis/sdk';
import {validModel} from './view-model';
import type {ActionRef,InteractionModel} from './interactions';
export function useInteractions(context:AppletContext){
  const [state,setState]=useState<{snapshot:SourceSnapshot;model:InteractionModel;account:string}|null>(null);
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const latest=useRef<SourceSnapshot|null>(null);
  const sequence=useRef(0),pending=useRef<number|null>(null),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const clear=()=>{clearTimeout(timer.current);pending.current=null;setBusy(false);};
  useEffect(()=>{
    const source=context.source.subscribe(snapshot=>{
      latest.current=snapshot;
      if(!validModel(snapshot.data)||!snapshot.data.interactions||snapshot.state!=='ready'||!snapshot.data.account.handle){setState(null);clear();return;}
      const model=snapshot.data.interactions;sequence.current=Math.max(sequence.current,model.sequence);
      setState({snapshot,model,account:snapshot.data.account.handle});
      const result=model.results.find(r=>r.requestId===pending.current);
      if(result&&result.status!=='pending'){clear();setMessage(result.status==='observed'?'':result.message??'The action could not be confirmed. Check status.');}
    });
    const nav=context.navigation.subscribe(s=>{if(s.mode!=='applet'){const snapshot=latest.current;if(snapshot)void context.source.command({name:'x.cancelInteraction',epoch:snapshot.epoch}).catch(()=>{});setState(null);clear();}});
    return()=>{source();nav();clearTimeout(timer.current);};
  },[context]);
  const perform=(ref:ActionRef)=>{
    if(!state||busy||!ref.available)return;
    setMessage('');setBusy(true);const requestId=++sequence.current;pending.current=requestId;
    timer.current=setTimeout(()=>{clear();setMessage('X has not confirmed the result. Check status before trying again.');},10000);
    void context.source.command({name:'x.action',epoch:state.snapshot.epoch,payload:{visitId:state.model.visitId,requestId,token:ref.token,account:state.account,desired:!ref.state}}).catch(()=>{clear();setMessage('This page changed. Check status before trying again.');});
  };
  return {find:(entity:string,name:ActionRef['name'])=>state?.model.actions.find(a=>a.entity===entity&&a.name===name),perform,busy,message,check:()=>{setMessage('');if(state)void context.sources.open(state.snapshot.sourceId,state.snapshot.url);}};
}
export type Interactions=ReturnType<typeof useInteractions>;
