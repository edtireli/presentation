const base=new URL('./',self.location),appPrefix=base.pathname+'app/',CACHE='spiral-encrypted-v1:'+base.pathname;
let session=null,restoring=null,allowRestore=true;const memory=new Map(),pending=new Map();let memoryBytes=0;
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
function finishRestore(value){const attempt=restoring;if(!attempt)return;restoring=null;clearTimeout(attempt.timer);attempt.resolve(value);}
self.addEventListener('message',event=>{
 const data=event.data;
 if(data?.type==='unlock'&&data.key?.type==='secret'&&data.manifest?.entries){
  // An old restore response must never undo Lock or replace a newer unlock.
  if(data.restore&&(!allowRestore||(data.requestId&&data.requestId!==restoring?.id))){event.ports[0]?.postMessage({ok:false});return;}
  if(!data.restore)allowRestore=true;
  // All windows share this worker. Keep the active object for repeated restores
  // of the same revision so ongoing decryptions remain valid.
  if(!session||(!data.restore&&session.revision!==data.revision)){
   memory.clear();memoryBytes=0;pending.clear();
   session={key:data.key,manifest:data.manifest,revision:data.revision};
  }
  finishRestore(session);event.ports[0]?.postMessage({ok:true});
 }else if(data?.type==='lock'){
  allowRestore=false;session=null;finishRestore(null);memory.clear();memoryBytes=0;pending.clear();
  event.waitUntil(self.clients.matchAll().then(clients=>{for(const client of clients)client.postMessage({type:'locked'});}));
  event.ports[0]?.postMessage({ok:true});
 }
});
async function getSession(){
 if(session)return session;if(!allowRestore)return null;
 if(!restoring){
  let resolve;const promise=new Promise(done=>{resolve=done;});
  const attempt={id:crypto.randomUUID(),promise,resolve,timer:null};restoring=attempt;
  attempt.timer=setTimeout(()=>{if(restoring===attempt)finishRestore(session);},1800);
  self.clients.matchAll({type:'window'}).then(clients=>{
   if(restoring!==attempt)return;
   for(const client of clients)client.postMessage({type:'restore',requestId:attempt.id});
  }).catch(()=>{if(restoring===attempt)finishRestore(null);});
 }
 return restoring.promise;
}
async function load(entry,active){if(memory.has(entry.file)){const value=memory.get(entry.file);memory.delete(entry.file);memory.set(entry.file,value);return value;}if(pending.has(entry.file))return pending.get(entry.file);
 const promise=(async()=>{const cache=await caches.open(CACHE),url=new URL(entry.file,base),cached=await cache.match(url);let response=cached||await fetch(url);if(!response.ok)throw Error('Asset download failed: '+response.status);if(!cached)await cache.put(url,response.clone());let raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(entry.iv)},active.key,await response.arrayBuffer());if(entry.compressed)raw=await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  if(raw.byteLength!==entry.bytes)throw Error('Asset size mismatch');if(session===active&&raw.byteLength<=48*1024*1024){while(memoryBytes+raw.byteLength>96*1024*1024&&memory.size){const first=memory.keys().next().value;memoryBytes-=memory.get(first).byteLength;memory.delete(first);}memory.set(entry.file,raw);memoryBytes+=raw.byteLength;}return raw;})();pending.set(entry.file,promise);try{return await promise;}finally{if(pending.get(entry.file)===promise)pending.delete(entry.file);}}
async function serve(request){const url=new URL(request.url);let rel;try{rel=decodeURIComponent(url.pathname.slice(appPrefix.length));}catch{return new Response('Invalid path',{status:400});}if(!rel||rel.endsWith('/'))rel+='index.html';const active=await getSession();if(!active){if(request.mode==='navigate'){const gate=new URL('./',base);gate.searchParams.set('return',url.pathname+url.search+url.hash);return Response.redirect(gate.href,302);}return new Response('Unlock the presentation first',{status:401});}
 const entry=active.manifest.entries[rel];if(!entry)return new Response('File unavailable',{status:404});if(!['GET','HEAD'].includes(request.method))return new Response('Read only',{status:405});
 try{let raw=await load(entry,active);if(session!==active)return new Response('Session changed; reload the presentation',{status:401});const headers={'Content-Type':entry.type,'Cache-Control':'no-store','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff'};if(entry.type.startsWith('text/html')){let html=new TextDecoder().decode(raw).replace('<head>',`<head><script src="${base.pathname}session.js"></script><meta name="robots" content="noindex,nofollow,noarchive">`);const enhancements=`<script src="${base.pathname}fullscreen.js"></script>`+(active.manifest.entries['live.js']?`<script type="module" src="${appPrefix}live.js"></script>`:'');html=html.replace('</body>',enhancements+'</body>');raw=new TextEncoder().encode(html).buffer;}
 let status=200;const size=raw.byteLength;const range=request.headers.get('Range');if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||(!match[1]&&!match[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));const end=match[1]?(match[2]?Math.min(Number(match[2]),size-1):size-1):size-1;if(start>end||start>=size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});raw=raw.slice(start,end+1);headers['Content-Range']=`bytes ${start}-${end}/${size}`;status=206;}
 headers['Content-Length']=raw.byteLength;return new Response(request.method==='HEAD'?null:raw,{status,headers});}catch{return new Response('Could not load this presentation asset. Refresh to retry.',{status:502});}}
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(url.origin===base.origin&&url.pathname.startsWith(appPrefix))event.respondWith(serve(event.request));});
