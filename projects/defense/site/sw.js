const base=new URL('./',self.location),appPrefix=base.pathname+'app/';
const CACHE='spiral-encrypted-v1:'+base.pathname,CONTROL='spiral-offline-control-v1:'+base.pathname,SHELL='spiral-offline-shell-v1:'+base.pathname+':';
let session=null,restoring=null,publicRestore=null,allowRestore=true,sessionEpoch=0;const memory=new Map(),pending=new Map(),downloads=new Map(),revisionSessions=new Map(),clientRevisions=new Map();let memoryBytes=0;
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const sha=async raw=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(x=>x.toString(16).padStart(2,'0')).join('');
const controlURL=name=>new URL('__offline__/'+name,base).href;
async function readControl(name){const c=await caches.open(CONTROL),r=await c.match(controlURL(name));return r?await r.json():null;}
async function writeControl(name,value){const c=await caches.open(CONTROL);await c.put(controlURL(name),new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}}));}
const cipherHash=file=>{const match=/^sealed\/([a-f0-9]{64})\.bin$/.exec(file);if(!match)throw Error('Invalid package asset path.');return match[1];};
const shellPath=file=>typeof file==='string'&&!file.startsWith('/')&&!file.includes('..')&&!/[?#\\:]/.test(file)&&(file==='.nojekyll'||/\.(?:html|js|css|svg|png|gif|jpe?g|webp|ico|txt|md|json|woff2?)$/.test(file))&&!/(?:^|\/)(?:api|complaints|presenter-session|__offline__)(?:\/|\.|$)/.test(file)&&!file.startsWith('app/')&&!file.startsWith('sealed/')&&file!=='access.json';
function metadataOK(meta){try{return meta?.version===1&&typeof meta.revision==='string'&&typeof meta.publicKey==='string'&&bytes(meta.publicKey).length===32&&bytes(meta.iv).length===12&&!!cipherHash(meta.index);}catch{return false;}}
const packageID=meta=>sha(new TextEncoder().encode(JSON.stringify({index:meta.index,iv:meta.iv,publicKey:meta.publicKey,shell:meta.shell})));
const shellCacheName=record=>SHELL+(record.packageRevision||record.revision);
const staticFetch=url=>fetch(url,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(120000)});
async function verifiedResponse(cache,url,expected,{allowNetwork=true}={}){
 const cached=await cache.match(url);
 if(cached){const raw=await cached.clone().arrayBuffer();if((expected.bytes==null||raw.byteLength===expected.bytes)&&await sha(raw)===expected.hash)return{response:cached,bytes:raw.byteLength,reused:true};await cache.delete(url);}
 if(!allowNetwork)throw Error('A saved file is missing or invalid. Connect and prepare offline again.');
 const response=await staticFetch(url);if(!response.ok)throw Error('Download failed ('+response.status+'): '+new URL(url).pathname);
 const raw=await response.arrayBuffer();if((expected.bytes!=null&&raw.byteLength!==expected.bytes)||await sha(raw)!==expected.hash)throw Error('File verification failed: '+new URL(url).pathname);
 const headers=new Headers(response.headers);headers.delete('Content-Encoding');headers.set('Content-Length',String(raw.byteLength));headers.set('X-Spiral-Verified-SHA256',expected.hash);
 const saved=new Response(raw,{status:200,headers});await cache.put(url,saved.clone());return{response:saved,bytes:raw.byteLength,reused:false};
}
async function cipher(file,{allowNetwork=true,expectedBytes=null}={}){
 const key=file+':'+allowNetwork;if(downloads.has(key))return downloads.get(key);
 const promise=(async()=>verifiedResponse(await caches.open(CACHE),new URL(file,base).href,{hash:cipherHash(file),bytes:expectedBytes},{allowNetwork}))();downloads.set(key,promise);try{return await promise;}finally{if(downloads.get(key)===promise)downloads.delete(key);}
}
async function networkMetadata(){const response=await fetch(new URL('access.json',base),{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(3500)});if(!response.ok)throw Error('Package metadata unavailable.');const meta=await response.json();if(!metadataOK(meta))throw Error('Invalid public package.');return meta;}
async function unpack(meta,{allowNetwork=true}={}){
 if(!metadataOK(meta))throw Error('Invalid public package.');
 const key=await crypto.subtle.importKey('raw',bytes(meta.publicKey),'AES-GCM',false,['decrypt']);const result=await cipher(meta.index,{allowNetwork});
 const packed=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(meta.iv)},key,await result.response.arrayBuffer());
 const manifest=await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
 if(manifest.version!==1||!manifest.entries?.['index.html'])throw Error('Invalid presentation manifest.');
 const active={key,manifest,revision:meta.revision,metadata:meta};revisionSessions.set(meta.revision,active);await writeControl('revision/'+meta.revision,meta);return active;
}
function activateSession(active){revisionSessions.set(active.revision,active);if(!session||session.revision!==active.revision)session=active;return session;}
async function pinClient(id,revision){if(!id||!revision)return;clientRevisions.set(id,revision);await writeControl('client/'+id,{revision});}
async function revisionSession(revision){if(revisionSessions.has(revision))return revisionSessions.get(revision);const meta=await readControl('revision/'+revision);if(meta){try{return await unpack(meta,{allowNetwork:false});}catch{}}return null;}
async function sessionForClient(id){const revision=clientRevisions.get(id)||(id?(await readControl('client/'+id))?.revision:null);if(revision){const pinned=await revisionSession(revision);if(pinned)return pinned;}return getSession();}
async function restorePublic(){
 if(publicRestore)return publicRestore;
 const epoch=sessionEpoch;
 const use=active=>allowRestore&&epoch===sessionEpoch?activateSession(active):session;
 const attempt=(async()=>{
  // An explicitly prepared version is the working package until the next
  // successful preparation. A flaky connection cannot delay a saved talk.
  for(const name of ['active','previous']){const saved=await readControl(name);if(saved?.ready&&saved.metadata){try{return use(await unpack(saved.metadata,{allowNetwork:false}));}catch{}}}
  try{return use(await unpack(await networkMetadata()));}catch{}
  return session;
 })();publicRestore=attempt;try{return await attempt;}finally{if(publicRestore===attempt)publicRestore=null;}
}
function finishRestore(value){const attempt=restoring;if(!attempt)return;restoring=null;clearTimeout(attempt.timer);attempt.resolve(value);}
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
async function getSession(){
 if(session)return session;if(!allowRestore)return null;
 const publicSession=await restorePublic();if(publicSession)return publicSession;if(!allowRestore)return null;
 // Compatibility with older, privately sealed tabs. Public/offline packages do
 // not depend on a live tab or sessionStorage to recover their package key.
 if(!restoring){let resolve;const promise=new Promise(done=>{resolve=done;});const attempt={id:crypto.randomUUID(),promise,resolve,timer:null};restoring=attempt;
  attempt.timer=setTimeout(()=>{if(restoring===attempt)finishRestore(session);},1800);
  self.clients.matchAll({type:'window'}).then(clients=>{if(restoring===attempt)for(const client of clients)client.postMessage({type:'restore',requestId:attempt.id});}).catch(()=>{if(restoring===attempt)finishRestore(null);});
 }
 return restoring.promise;
}
function resourcesFor(meta,manifest){
 if(!Array.isArray(meta.shell)||!meta.shell.length)throw Error('This version does not include an offline shell manifest yet.');
 const shells=meta.shell.map(item=>{if(!shellPath(item?.path)||!/^[a-f0-9]{64}$/.test(item.sha256)||!Number.isSafeInteger(item.bytes)||item.bytes<0)throw Error('Invalid offline shell entry.');return{kind:'shell',file:item.path,hash:item.sha256,bytes:item.bytes};});
 for(const file of ['index.html','sw.js','session.js','offline.js'])if(!shells.some(r=>r.file===file))throw Error('Missing offline shell file: '+file);
 const unique=new Map([[meta.index,{kind:'cipher',file:meta.index,hash:cipherHash(meta.index),bytes:Number.isSafeInteger(meta.indexBytes)?meta.indexBytes:null}]]);
 for(const entry of Object.values(manifest.entries)){const hash=cipherHash(entry.file);if(!unique.has(entry.file))unique.set(entry.file,{kind:'cipher',file:entry.file,hash,bytes:Number.isSafeInteger(entry.cipherBytes)?entry.cipherBytes:null});}
 return[...unique.values(),...shells];
}
async function offlineStatus(){
 const active=await readControl('active'),staging=await readControl('staging');if(!active?.ready)return{supported:true,ready:false,verified:false,revision:null,completed:0,total:staging?.resources?.length||0,bytesCompleted:0,bytesTotal:staging?.bytesTotal??null,updatingRevision:staging?.revision||null};
 const cipherKeys=new Set((await(await caches.open(CACHE)).keys()).map(r=>r.url));const shellKeys=new Set((await(await caches.open(shellCacheName(active))).keys()).map(r=>r.url));
 let completed=0,bytesCompleted=0;for(const r of active.resources){if((r.kind==='cipher'?cipherKeys:shellKeys).has(new URL(r.file,base).href)){completed++;bytesCompleted+=r.bytes||0;}}
 const ready=completed===active.resources.length;
 return{supported:true,ready,verified:ready&&active.verified===true,revision:active.revision,packageRevision:active.packageRevision,completed,total:active.resources.length,bytesCompleted,bytesTotal:active.bytesTotal,verifiedAt:active.completedAt,updatingRevision:staging?.revision===active.revision?null:staging?.revision||null,updateAvailable:!!session&&session.revision!==active.revision};
}
async function beginOffline(){
 const meta=await networkMetadata(),active=await unpack(meta),resources=resourcesFor(meta,active.manifest);
 const previous=await readControl('staging');const packageRevision=await packageID(meta);const staging={version:1,revision:meta.revision,packageRevision,metadata:meta,resources,bytesTotal:Number.isSafeInteger(meta.offlineBytes)?meta.offlineBytes:null,startedAt:new Date().toISOString()};
 await writeControl('staging',staging);return{revision:meta.revision,packageRevision,total:resources.length,completed:0,bytesCompleted:0,bytesTotal:staging.bytesTotal,resumed:previous?.packageRevision===packageRevision,ready:false,verified:false};
}
async function batchOffline({revision,packageRevision,offset=0,count=3}){
 const staging=await readControl('staging');if(!staging||staging.revision!==revision||staging.packageRevision!==packageRevision)throw Error('The offline version changed. Please retry.');
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(count)||count<1||count>4)throw Error('Invalid offline batch.');
 const chosen=staging.resources.slice(offset,offset+count),shell=await caches.open(shellCacheName(staging));
 const results=await Promise.all(chosen.map(async r=>{const result=r.kind==='cipher'?await cipher(r.file,{expectedBytes:r.bytes}):await verifiedResponse(shell,new URL(r.file,base).href,r);return{file:r.file,bytes:result.bytes,reused:result.reused};}));
 return{revision,packageRevision,completed:Math.min(offset+count,staging.resources.length),total:staging.resources.length,batchBytes:results.reduce((n,r)=>n+r.bytes,0),resumed:results.some(r=>r.reused),bytesTotal:staging.bytesTotal,ready:false,verified:false};
}
async function finishOffline({revision,packageRevision}){
 const staging=await readControl('staging');if(!staging||staging.revision!==revision||staging.packageRevision!==packageRevision)throw Error('The offline version changed. Please retry.');
 const shell=await caches.open(shellCacheName(staging)),cipherCache=await caches.open(CACHE),verified=[];
 // Re-hash every saved byte at the commit boundary. A partial or corrupt cache
 // never replaces the previously committed, working offline revision.
 for(const r of staging.resources){const result=await verifiedResponse(r.kind==='cipher'?cipherCache:shell,new URL(r.file,base).href,r,{allowNetwork:false});verified.push({...r,bytes:result.bytes});}
 const current=await readControl('staging');if(current?.revision!==revision||current?.packageRevision!==packageRevision)throw Error('The offline version changed during verification. Please retry.');
 const old=await readControl('active');if(old?.ready&&old.packageRevision!==packageRevision)await writeControl('previous',old);
 const active={...staging,resources:verified,bytesTotal:verified.reduce((sum,r)=>sum+r.bytes,0),ready:true,verified:true,completedAt:new Date().toISOString()};
 // One Cache.put is the commit: until this resolves the old active pointer stays.
 await writeControl('active',active);
 return{supported:true,ready:true,verified:true,revision,packageRevision,completed:verified.length,total:verified.length,bytesCompleted:active.bytesTotal,bytesTotal:active.bytesTotal,verifiedAt:active.completedAt};
}
async function checkForUpdates(){
 const saved=await offlineStatus();
 try{const meta=await networkMetadata(),packageRevision=await packageID(meta);return{...saved,online:true,currentRevision:meta.revision,currentPackageRevision:packageRevision,current:saved.ready&&saved.verified&&saved.packageRevision===packageRevision,updateAvailable:!saved.ready||saved.packageRevision!==packageRevision};}
 catch(error){return{...saved,online:false,currentRevision:null,current:false,updateAvailable:null,error:error.message};}
}
async function activatePreparedVersion(clientId){
 const state=await offlineStatus();if(!state.ready||!state.verified)throw Error('Prepare and verify the complete presentation before opening it offline.');
 const saved=await readControl('active'),active=await unpack(saved.metadata,{allowNetwork:false});
 // Existing presentation clients retain their revision. Only a subsequent
 // document navigation (or this gate client) takes the newly prepared one.
 sessionEpoch++;activateSession(active);await pinClient(clientId,active.revision);return{revision:active.revision,available:true};
}
self.addEventListener('message',event=>{
 const data=event.data,port=event.ports[0];
 if(data?.type==='unlock'&&data.key?.type==='secret'&&data.manifest?.entries){
  if(data.restore&&(!allowRestore||(data.requestId&&data.requestId!==restoring?.id))){port?.postMessage({ok:false});return;}
  if(!data.restore){allowRestore=true;sessionEpoch++;}
  if(!session||(!data.restore&&session.revision!==data.revision))activateSession({key:data.key,manifest:data.manifest,revision:data.revision});
  finishRestore(session);if(event.source?.id)event.waitUntil(pinClient(event.source.id,session.revision));port?.postMessage({ok:true});return;
 }
 if(data?.type==='lock'){sessionEpoch++;allowRestore=false;session=null;finishRestore(null);memory.clear();memoryBytes=0;pending.clear();event.waitUntil(self.clients.matchAll().then(clients=>{for(const c of clients)c.postMessage({type:'locked'});}));port?.postMessage({ok:true});return;}
 const actions={'offline-status':offlineStatus,'offline-begin':beginOffline,'offline-batch':()=>batchOffline(data),'offline-finish':()=>finishOffline(data),'offline-check-updates':checkForUpdates,'offline-activate':()=>activatePreparedVersion(event.source?.id),'pin-session':async()=>{const active=await revisionSession(data.revision);if(active)await pinClient(event.source?.id,active.revision);return{available:!!active};},'public-session':async()=>{const s=await getSession();return{revision:s?.revision||null,available:!!s};}};
 if(actions[data?.type])event.waitUntil((async()=>{try{port?.postMessage({ok:true,result:await actions[data.type]()});}catch(error){port?.postMessage({ok:false,error:error.message});}})());
});
async function load(entry,active){
 if(memory.has(entry.file)){const value=memory.get(entry.file);memory.delete(entry.file);memory.set(entry.file,value);return value;}if(pending.has(entry.file))return pending.get(entry.file);
 const promise=(async()=>{const result=await cipher(entry.file);let raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(entry.iv)},active.key,await result.response.arrayBuffer());if(entry.compressed)raw=await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  if(raw.byteLength!==entry.bytes)throw Error('Asset size mismatch');if(session===active&&raw.byteLength<=48*1024*1024){while(memoryBytes+raw.byteLength>96*1024*1024&&memory.size){const first=memory.keys().next().value;memoryBytes-=memory.get(first).byteLength;memory.delete(first);}memory.set(entry.file,raw);memoryBytes+=raw.byteLength;}return raw;})();pending.set(entry.file,promise);try{return await promise;}finally{if(pending.get(entry.file)===promise)pending.delete(entry.file);}
}
async function serve(request,clientId){
 const url=new URL(request.url);let rel;try{rel=decodeURIComponent(url.pathname.slice(appPrefix.length));}catch{return new Response('Invalid path',{status:400});}if(!rel||rel.endsWith('/'))rel+='index.html';// Old audience links also use native static files, including native byte ranges.
 if(self.navigator.onLine!==false&&request.mode==='navigate'&&rel==='index.html'&&!url.searchParams.has('presenterSession')&&url.searchParams.get('presenterPreview')!=='1'&&url.searchParams.get('broadcast')!=='1'){
  const viewer=new URL('watch/index.html',base);viewer.search=url.search;
  if(viewer.searchParams.get('narration')==='1'&&viewer.searchParams.get('live')!=='1')viewer.searchParams.set('deck','decks/phd-defense.recorded.spiral');
  return Response.redirect(viewer.href,302);
 }
 const active=await sessionForClient(clientId);
 if(!active){if(request.mode==='navigate'){const gate=new URL('./',base);gate.searchParams.set('return',url.pathname+url.search+url.hash);return Response.redirect(gate.href,302);}return new Response('Prepare the presentation online before opening it offline.',{status:503});}
 await pinClient(clientId,active.revision);const entry=active.manifest.entries[rel];if(!entry)return new Response('File unavailable',{status:404});if(!['GET','HEAD'].includes(request.method))return new Response('Read only',{status:405});
 try{let raw=await load(entry,active);if(!allowRestore)return new Response('Presentation closed',{status:401});const headers={'Content-Type':entry.type,'Cache-Control':'no-store','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff'};
  if(entry.type.startsWith('text/html')){let html=new TextDecoder().decode(raw).replace('<head>',`<head><script src="${base.pathname}session.js" data-revision="${active.revision}"></script><meta name="robots" content="noindex,nofollow,noarchive">`);const enhancements=`<script src="${base.pathname}fullscreen.js"></script>`+(active.manifest.entries['live.js']?`<script type="module" src="${appPrefix}live.js"></script>`:'');html=html.replace('</body>',enhancements+'</body>');raw=new TextEncoder().encode(html).buffer;}
  let status=200;const size=raw.byteLength,range=request.headers.get('Range');if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||(!match[1]&&!match[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2])),end=match[1]?(match[2]?Math.min(Number(match[2]),size-1):size-1):size-1;if(start>end||start>=size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});raw=raw.slice(start,end+1);headers['Content-Range']=`bytes ${start}-${end}/${size}`;status=206;}
  headers['Content-Length']=raw.byteLength;return new Response(request.method==='HEAD'?null:raw,{status,headers});
 }catch{return new Response('Could not load this asset. Connect and prepare offline again, or reload the saved presentation.',{status:503});}
}
const READER_FILES=['index.html','gate.js','gate.css','acknowledgement-reading.js','acknowledgements.json'];
const READER='spiral-public-reading-v2:'+base.pathname;
let readerRefresh=null;
async function currentReader(){try{const response=await(await caches.open(READER)).match(new URL('__reader_active__',base));return response?await response.json():null;}catch{return null;}}
async function refreshReader(){
 if(readerRefresh)return readerRefresh;
 readerRefresh=(async()=>{
  const meta=await networkMetadata(),entries=READER_FILES.map(file=>meta.shell?.find(e=>e.path===file));
  if(entries.some(e=>!e||!/^[a-f0-9]{64}$/.test(e.sha256)))throw Error('Reading page update incomplete.');
  const generation=await sha(new TextEncoder().encode(JSON.stringify(entries))),cacheName=READER+':'+generation;
  const cache=await caches.open(cacheName);
  // Verify the complete reading shell before changing its active pointer.
  await Promise.all(entries.map(async entry=>{
   const url=new URL(entry.path,base).href;let response=await cache.match(url);
   if(response){const data=await response.clone().arrayBuffer();if(data.byteLength===entry.bytes&&await sha(data)===entry.sha256)return;}
   response=await fetch(url,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(3500)});
   if(!response.ok)throw Error('Reading page download incomplete.');
   const data=await response.clone().arrayBuffer();if(data.byteLength!==entry.bytes||await sha(data)!==entry.sha256)throw Error('Reading page version mismatch.');
   await cache.put(url,response);
  }));
  const record={generation,cacheName};await(await caches.open(READER)).put(new URL('__reader_active__',base),new Response(JSON.stringify(record)));
  return record;
 })().finally(()=>{readerRefresh=null;});return readerRefresh;
}
async function shellResponse(request){
 const url=new URL(request.url);const relative=url.pathname.slice(base.pathname.length),file=(!relative||relative==='index.html')?'index.html':relative;
 // Update the public reader as one complete shell. An interrupted update keeps
 // the previous reader; presentation assets and metadata retain their pinning.
 if(READER_FILES.includes(file)){
  let reader=await currentReader();if(file==='index.html'){try{reader=await refreshReader();}catch{}}
  if(reader){try{const response=await(await caches.open(reader.cacheName)).match(new URL(file,base));if(response)return request.method==='HEAD'?new Response(null,{status:200,headers:response.headers}):response;}catch{}}
 }
 const active=await readControl('active');
 if(file==='access.json'){
  // Return the same committed revision as the cached shell and app. The
  // offline-begin action fetches fresh metadata explicitly for safe updates.
  if(active?.ready)return new Response(request.method==='HEAD'?null:JSON.stringify(active.metadata),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  return fetch(request);
 }
 const entry=active?.resources?.find(r=>r.kind==='shell'&&r.file===file);
 // Only the publisher's explicit static-shell allowlist receives a cached
 // response. API calls, credentials and submission bodies never enter a cache.
 // GitHub caches public scripts for ten minutes; use fresh shell files when
 // no verified offline generation has been selected.
 if(!entry)return fetch(request,{cache:'no-store'});
 const cache=await caches.open(shellCacheName(active));
 try{const result=await verifiedResponse(cache,new URL(file,base).href,entry,{allowNetwork:false});return request.method==='HEAD'?new Response(null,{status:200,headers:result.response.headers}):result.response;}
 catch{return new Response('Offline shell unavailable. Prepare offline again when connected.',{status:503});}
}
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(url.pathname.startsWith(base.pathname+'watch/'))return;if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname)||!['GET','HEAD'].includes(event.request.method)||event.request.headers.has('Authorization'))return;
 if(url.pathname.startsWith(appPrefix)){event.respondWith(serve(event.request,event.resultingClientId||event.clientId));return;}
 const rel=url.pathname.slice(base.pathname.length);
 if(/^sealed\/[a-f0-9]{64}\.bin$/.test(rel)){event.respondWith(cipher(rel).then(r=>event.request.method==='HEAD'?new Response(null,{status:200,headers:r.response.headers}):r.response).catch(()=>new Response('Saved package file unavailable.',{status:503})));return;}
 if(!rel||rel==='access.json'||shellPath(rel))event.respondWith(shellResponse(event.request));
});
