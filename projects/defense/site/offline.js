/* Public offline-package API. Importing this module never downloads the package. */
const base=new URL('./',import.meta.url);
let preparing=null;
const supported=()=>!!(navigator.serviceWorker&&globalThis.caches&&crypto.subtle);
async function worker(){
 if(!supported())throw Error('Offline saving needs a browser with service workers and storage support.');
 let registration=await navigator.serviceWorker.getRegistration(base.href);
 if(!registration)registration=await navigator.serviceWorker.register(new URL('sw.js',base),{scope:base.pathname,updateViaCache:'none'});
 await navigator.serviceWorker.ready;
 if(!navigator.serviceWorker.controller)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{navigator.serviceWorker.removeEventListener('controllerchange',change);reject(Error('Reload this page before preparing offline.'));},15000);function change(){clearTimeout(timer);resolve();}navigator.serviceWorker.addEventListener('controllerchange',change,{once:true});});
 return navigator.serviceWorker.controller||registration.active;
}
async function rpc(type,args={}){const target=await worker();return new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(Error('Offline saving was interrupted. Retry to resume downloaded files.'));},180000);channel.port1.onmessage=({data})=>{clearTimeout(timer);channel.port1.close();data.ok?resolve(data.result):reject(Error(data.error||'Offline saving failed.'));};target.postMessage({type,...args},[channel.port2]);});}
/** Ask the browser to retain this origin under storage pressure; returns boolean. */
export async function requestPersistentStorage(){try{if(await navigator.storage?.persisted?.())return true;return!!await navigator.storage?.persist?.();}catch{return false;}}
export async function offlineStatus(){if(!supported())return{supported:false,ready:false,verified:false,persisted:false};const state=await rpc('offline-status');return{...state,persisted:!!await navigator.storage?.persisted?.()};}
/** Called from an explicit user action. A failed call leaves a prior ready copy intact. */
export async function prepareOffline({onProgress}={}){
 if(preparing)return preparing;
 const progress=state=>{try{onProgress?.(state);}catch{}};
 preparing=(async()=>{const persisted=await requestPersistentStorage();progress({phase:'starting',ready:false,verified:false,persisted,completed:0,total:0,bytesCompleted:0,bytesTotal:null});
  const start=await rpc('offline-begin');let completedBytes=0,resumed=start.resumed;
  progress({...start,phase:'downloading',persisted});
  for(let offset=0;offset<start.total;offset+=3){const result=await rpc('offline-batch',{revision:start.revision,packageRevision:start.packageRevision,offset,count:3});completedBytes+=result.batchBytes;resumed||=result.resumed;progress({...result,bytesCompleted:completedBytes,resumed,phase:'downloading',persisted});}
  progress({...start,completed:start.total,bytesCompleted:completedBytes,bytesTotal:completedBytes,resumed,phase:'verifying',persisted});
  const ready=await rpc('offline-finish',{revision:start.revision,packageRevision:start.packageRevision});const result={...ready,resumed,phase:'ready',persisted};progress(result);return result;
 })();try{return await preparing;}finally{preparing=null;}
}

/** Fresh, bounded metadata check; never silently treats an old copy as current. */
export async function checkForUpdates(){return rpc('offline-check-updates');}
/** Select a verified package for new navigation without replacing running talks. */
export async function activatePreparedVersion(){return rpc('offline-activate');}
