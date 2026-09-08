(()=>{const base=new URL('./',document.currentScript.src),storageKey='spiral.private:'+base.pathname;
 async function checkRevision(){try{
  const saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(!saved)return;
  const response=await fetch(new URL('access.json',base),{cache:'no-store'});if(!response.ok)return;
  const current=await response.json();if(typeof current.revision==='string'&&current.revision!==saved.revision){const gate=new URL(base);gate.searchParams.set('return',location.pathname+location.search+location.hash);location.replace(gate.href);}
 }catch{}}
 async function restore(worker,requestId){try{const saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(!saved)return;const raw=Uint8Array.from(atob(saved.key),c=>c.charCodeAt(0));const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);worker?.postMessage({type:'unlock',restore:true,requestId,key,manifest:saved.manifest,revision:saved.revision});}catch{}}
 navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='restore')restore(event.source,event.data.requestId);if(event.data?.type==='locked'){sessionStorage.removeItem(storageKey);location.replace(base.href);}});
 navigator.serviceWorker.addEventListener('controllerchange',()=>restore(navigator.serviceWorker.controller));restore(navigator.serviceWorker.controller);checkRevision();
})();
