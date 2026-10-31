// Read-only maintainer diagnostic. Requires an existing CDP connection.
const [endpoint, targetId, ...selectors] = process.argv.slice(2);
if (!endpoint || !targetId || !selectors.length || selectors.length > 20) throw Error('Usage: node tools/inspect-ui-surfaces.mjs <http://localhost:port> <target-id> <selector>… (maximum 20)');
const targets = await (await fetch(new URL('/json/list', endpoint))).json();
const matches = targets.filter(t => t.id === targetId);
if (matches.length !== 1) throw Error('Select exactly one explicit CDP target ID');
const socket = new WebSocket(matches[0].webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
function sample(selectors) {
  const properties = ['opacity','background-color','color','filter','backdrop-filter','transform','mix-blend-mode','visibility','display','pointer-events','position','z-index'];
  const roots = [document];
  for (let i=0;i<roots.length && roots.length<200;i++) for (const node of roots[i].querySelectorAll('*')) if (node.shadowRoot && roots.length<200) roots.push(node.shadowRoot);
  return selectors.map(selector => ({selector, matches:roots.flatMap(root=>[...root.querySelectorAll(selector)]).slice(0,20).map(element=>{
    const chain=[]; let node=element, product=1;
    while(node && chain.length<64) {
      const style=getComputedStyle(node), bounds=node.getBoundingClientRect();
      product*=Number(style.opacity);
      chain.push({tag:node.tagName,role:node.getAttribute('role'),testId:node.getAttribute('data-testid'),owner:node.getAttribute('data-genesis-owned'),bounds:{x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height},computed:Object.fromEntries(properties.map(p=>[p,style.getPropertyValue(p)])),inline:Object.fromEntries(properties.map(p=>[p,node.style.getPropertyValue(p)]))});
      node=node.parentElement ?? node.getRootNode().host;
    }
    const causes=[];
    if(Number(chain[0].computed.opacity)<1)causes.push('own-opacity');
    if(chain.slice(1).some(n=>Number(n.computed.opacity)<1))causes.push('ancestor-opacity');
    if(chain.some(n=>n.computed.filter!=='none'||n.computed['mix-blend-mode']!=='normal'))causes.push('filter-or-blend');
    if(chain.some(n=>n.computed.display==='none'||n.computed.visibility!=='visible'))causes.push('hidden');
    if(chain[0].computed['background-color'].startsWith('rgba'))causes.push('alpha-background-may-be-intentional');
    return {chain,truncated:!!node,opacityProductApproximation:product,excludesFilterAndPaint:true,causes};
  })}));
}
let sequence=0;
try {
  for(let i=0;i<11;i++) {
    const id=++sequence;
    const response=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('CDP response timed out')),5000);
      socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id===id){clearTimeout(timer);resolve(message);}};
      socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression:`(${sample.toString()})(${JSON.stringify(selectors)})`,returnByValue:true}}));
    });
    if(response.error||response.result?.exceptionDetails)throw Error('Inspection failed; check selectors and target');
    console.log(JSON.stringify({sample:i,result:response.result.result.value}));
    if(i<10)await new Promise(resolve=>setTimeout(resolve,100));
  }
} finally {socket.close();}
