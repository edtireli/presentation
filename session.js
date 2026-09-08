(()=>{const script=document.currentScript,base=new URL('./',script.src),storageKey='spiral.private:'+base.pathname,loadedRevision=script.dataset.revision;
 const narrationReleaseAt='2026-09-10T15:00:00Z';window.spiralNarrationReleaseAt=narrationReleaseAt;
 if(new URLSearchParams(location.search).get('narration')==='1'&&Date.now()<Date.parse(narrationReleaseAt)){const entry=new URL(base);entry.searchParams.set('narration','locked');location.replace(entry.href);return;}

 // Public packages recover their own key and manifest in the worker. Only
 // legacy private tabs answer the worker's explicit compatibility request.
 async function restore(worker,requestId){try{const saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(!saved)return;const raw=Uint8Array.from(atob(saved.key),c=>c.charCodeAt(0));const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);worker?.postMessage({type:'unlock',restore:true,requestId,key,manifest:saved.manifest,revision:saved.revision});}catch{}}
 function pin(){if(loadedRevision)navigator.serviceWorker.controller?.postMessage({type:'pin-session',revision:loadedRevision});}
 navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='restore')restore(event.source,event.data.requestId);if(event.data?.type==='locked'){sessionStorage.removeItem(storageKey);location.replace(base.href);}});
 navigator.serviceWorker.addEventListener('controllerchange',pin);pin();
})();
