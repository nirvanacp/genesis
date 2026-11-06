import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { Store } from './store.mjs';
import { ApiError, fail } from './model.mjs';

const token=process.env.X_BACKEND_TOKEN;
if (!token || token.length<32 || /[^\x21-\x7e]/.test(token)) throw new Error('Configure X_BACKEND_TOKEN with at least 32 printable ASCII characters');
const store=new Store(process.env.X_BACKEND_DB??'x-bookmarks.sqlite3',{expectedHandle:process.env.X_EXPECTED_HANDLE});
const authorized=value=>{const a=Buffer.from(value??''),b=Buffer.from(`Bearer ${token}`);return a.length===b.length&&timingSafeEqual(a,b);};
const handler=async(request,response)=>{
  response.setHeader('Content-Type','application/json');response.setHeader('Cache-Control','no-store');
  const send=(status,value)=>{response.writeHead(status);response.end(JSON.stringify(value));};
  if (!authorized(request.headers.authorization)) {send(401,{error:{code:'UNAUTHORIZED',message:'Library authorization failed'}});request.resume();return;}
  try {
    const path=request.url;
    if(request.method==='GET'&&path==='/health'){send(200,{ready:true});return;}
    if(request.method==='GET'&&path==='/v1/library'){send(200,{result:store.library()});return;}
    if(request.method==='GET'&&path==='/v1/categories'){send(200,{result:store.categories()});return;}
    if(request.method==='GET'&&path.startsWith('/v1/operations/')){send(200,{result:store.operation(path.slice('/v1/operations/'.length))});return;}
    if(request.method!=='POST'||!['/v1/bookmarks/lookup','/v1/bookmarks/query','/v1/operations'].includes(path)){request.resume();fail('NOT_FOUND','Unknown library endpoint',404);}
    let bytes=0;const chunks=[];
    for await(const chunk of request){bytes+=chunk.length;if(bytes>262144)fail('TOO_LARGE','Request exceeds 256 KiB',413);chunks.push(chunk);}
    let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('INVALID_ARGUMENT','Invalid JSON',400);}
    const result=path==='/v1/operations'?store.operate(input):path==='/v1/bookmarks/query'?store.query(input):store.lookup(input);
    send(200,{result});
  }catch(error){send(error instanceof ApiError?error.status:503,{error:{code:error instanceof ApiError?error.code:'STORAGE_FAILURE',message:error instanceof ApiError?error.message:'Library unavailable. Check whether the change saved before retrying.',...(error instanceof ApiError && error.details ? {details:error.details}:{})}});}
};
if (!!process.env.GENESIS_TLS_CERT!==!!process.env.GENESIS_TLS_KEY) throw new Error('Configure both TLS certificate and key');
const server=process.env.GENESIS_TLS_CERT?httpsServer({cert:readFileSync(process.env.GENESIS_TLS_CERT),key:readFileSync(process.env.GENESIS_TLS_KEY)},handler):httpServer(handler);
server.requestTimeout=10000;server.headersTimeout=10000;
server.listen(Number(process.env.X_BACKEND_PORT??8788),process.env.X_BACKEND_HOST??'127.0.0.1',()=>console.log('X library service ready'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{store.close();process.exit(0);}));
