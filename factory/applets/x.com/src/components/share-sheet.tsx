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
