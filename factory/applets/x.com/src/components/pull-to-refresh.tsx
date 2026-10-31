import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Icon} from './icon';

const threshold=64;

/** Refresh only a downward gesture that starts at the document's top edge. */
export function PullToRefresh({enabled,busy,onRefresh,resetKey,children}:{
  enabled:boolean;busy:boolean;onRefresh:()=>void;resetKey:string;children:ReactNode;
}) {
  const root=useRef<HTMLDivElement>(null),refresh=useRef(onRefresh),suppressClickUntil=useRef(0);
  const [distance,setDistance]=useState(0);
  refresh.current=onRefresh;
  useEffect(()=>{
    const element=root.current;if(!element)return;
    let gesture:{x:number;y:number;distance:number}|null=null;
    setDistance(0);
    const start=(event:TouchEvent)=>{
      gesture=null;
      if(!enabled||busy||event.touches.length!==1||window.scrollY>1)return;
      const target=event.composedPath().find(node=>node instanceof Element) as Element|undefined;
      if(!target||target.closest('input,textarea,select,button,a,summary,[role="tablist"],[role="dialog"]'))return;
      for(let node=target;node&&node!==element;node=node.parentElement!){
        if(node.scrollHeight>node.clientHeight+1&&/auto|scroll/.test(getComputedStyle(node).overflowY))return;
      }
      gesture={x:event.touches[0].clientX,y:event.touches[0].clientY,distance:0};
    };
    const move=(event:TouchEvent)=>{
      if(!gesture)return;
      if(event.touches.length!==1){gesture=null;setDistance(0);return;}
      const dx=event.touches[0].clientX-gesture.x,dy=event.touches[0].clientY-gesture.y;
      if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)||dy< -8||window.scrollY>1){gesture=null;setDistance(0);return;}
      if(dy<=8||Math.abs(dx)>dy)return;
      if(!event.cancelable){gesture=null;setDistance(0);return;}
      event.preventDefault();
      suppressClickUntil.current=performance.now()+600;
      gesture.distance=Math.min(96,dy*.4);setDistance(gesture.distance);
    };
    const end=()=>{
      const ready=!!gesture&&gesture.distance>=threshold;gesture=null;setDistance(0);
      if(ready)refresh.current();
    };
    const cancel=()=>{gesture=null;setDistance(0);};
    const click=(event:MouseEvent)=>{
      if(event.detail>0&&performance.now()<suppressClickUntil.current){event.preventDefault();event.stopPropagation();}
    };
    element.addEventListener('touchstart',start,{passive:true});
    element.addEventListener('touchmove',move,{passive:false});
    element.addEventListener('touchend',end,{passive:true});
    element.addEventListener('touchcancel',cancel,{passive:true});
    element.addEventListener('click',click,true);
    return()=>{
      element.removeEventListener('touchstart',start);element.removeEventListener('touchmove',move);
      element.removeEventListener('touchend',end);element.removeEventListener('touchcancel',cancel);element.removeEventListener('click',click,true);
    };
  },[enabled,busy,resetKey]);
  return <div className="refresh-region" ref={root}>
    {(busy||distance>0)&&<div className={'refresh-feedback'+(busy?' refreshing':'')} role="status" style={{top:Math.max(8,distance-32)}}><Icon name="refresh"/><span>{busy?'Refreshing…':distance>=threshold?'Release to refresh':'Pull to refresh'}</span></div>}
    {children}
  </div>;
}
