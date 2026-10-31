import type {AppletContext,Dispose} from './runtime';
/** A screen lifetime within an owned foreground. Leaving it releases subscriptions,
 * React roots, dialogs and Back handlers without retiring the foreground bridge. */
export function createOwnedScope(parent:AppletContext,root:HTMLElement):{context:AppletContext;dispose:Dispose}{
  const abort=new AbortController(),cleanups=new Set<Dispose>();
  const track=(cleanup:Dispose):Dispose=>{
    let active=true;const dispose=()=>{if(!active)return;active=false;cleanups.delete(dispose);cleanup();};
    if(abort.signal.aborted)dispose();else cleanups.add(dispose);return dispose;
  };
  const dispose=()=>{if(abort.signal.aborted)return;abort.abort();for(const cleanup of [...cleanups])cleanup();parent.signal.removeEventListener('abort',dispose);};
  parent.signal.addEventListener('abort',dispose,{once:true});
  const context:AppletContext={...parent,root,signal:abort.signal,onDispose:callback=>{track(callback);},
    onFocus:callback=>track(parent.onFocus(callback)),
    storage:{...parent.storage,onChanged:callback=>track(parent.storage.onChanged(callback))},
    navigation:{...parent.navigation,onChange:callback=>track(parent.navigation.onChange(callback)),onBack:callback=>track(parent.navigation.onBack(callback))},
    source:{...parent.source,subscribe:callback=>track(parent.source.subscribe(callback)),onCommand:callback=>track(parent.source.onCommand(callback))},
    ui:{...parent.ui,openModal:(key,render)=>track(parent.ui.openModal(key,render)),mountAt:(key,anchor,options)=>track(parent.ui.mountAt(key,anchor,options))},
  };
  if(parent.signal.aborted)dispose();
  return{context,dispose};
}
