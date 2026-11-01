import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {AppletContext} from '@genesis/sdk';
import theme from '../theme.css';
export function openShareSheet(context:AppletContext,url:string){
  let close=()=>{};
  close=context.ui.openModal('Share post',container=>{
    const style=document.createElement('style');style.textContent=theme+'section[role=dialog]{background:var(--paper)!important;color:var(--ink)!important}button{min-height:48px;padding:12px;font:inherit}input{width:100%;font:inherit;margin:12px 0}';container.append(style);
    const target=document.createElement('div');container.append(target);const root=createRoot(target);root.render(<Share context={context} url={url} close={()=>close()}/>);return()=>root.unmount();
  });
}
function Share({context,url,close}:{context:AppletContext;url:string;close:()=>void}){
  const [message,setMessage]=useState('');
  return <><h2>Share post</h2><input aria-label="Post link" readOnly value={url} onFocus={e=>e.target.select()}/><button type="button" onClick={()=>{void navigator.clipboard.writeText(url).then(()=>setMessage('Copied')).catch(()=>setMessage('Could not copy. Select the link to copy it.'));}}>Copy link</button>{context.sharing.supported&&<button type="button" onClick={()=>{void context.sharing.shareUrl({url}).then(()=>setMessage('Share chooser opened')).catch(()=>setMessage('Sharing is unavailable. You can copy the link.'));}}>Share link</button>}<button type="button" onClick={close}>Close</button><p role="status">{message}</p></>;
}
export function openWebsiteOptions(context:AppletContext,url:string){
  let close=()=>{};
  close=context.ui.openModal('Page options',container=>{
    const button=document.createElement('button');button.type='button';button.textContent='Open this page on X website ↗';button.style.minHeight='48px';
    const status=document.createElement('p');status.setAttribute('role','status');
    button.onclick=()=>{button.disabled=true;void(async()=>{let [decision]=await context.navigation.resolve([{kind:'url',url}]);if(decision.kind==='custom')[decision]=await context.navigation.resolve([{kind:'url',url,websiteActionId:'original-x'}]);await context.navigation.activate({decision,intent:decision.kind==='website'||decision.kind==='external'?'open-website':'navigate'});close();})().catch(()=>{status.textContent='Could not open the page. Try again.';button.disabled=false;});};
    const cancel=document.createElement('button');cancel.textContent='Close';cancel.style.minHeight='48px';cancel.onclick=()=>close();container.append(button,cancel,status);
  });
}
