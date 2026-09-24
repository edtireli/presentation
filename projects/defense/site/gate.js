import {Field} from './gate-field.js';
import {offlineStatus} from './offline.js';
import {ensurePresenterReady} from './presenter-ready.js';

const base=new URL('./',import.meta.url), status=document.querySelector('#status');
const field=new Field(document.querySelector('#gate-field'),{strength:1,gap:22});
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const sync=()=>{field.stop();if(!document.hidden&&!reduced.matches)field.start();else field.frame();};
sync();document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);
addEventListener('pagehide',()=>field.stop(),{once:true});
let opening=false;
async function present(destination){
  if(opening)return;opening=true;status.textContent='Preparing presenter access…';
  try{
    // Install and claim the worker before sign-in requests app/live-config.json.
    await offlineStatus();
    if(await ensurePresenterReady({handoff:true}))location.href=destination.href;
    else status.textContent='';
  }catch(error){status.textContent=error.message||'Could not prepare the presentation. Try again.';}
  finally{opening=false;}
}
document.querySelector('#give-presentation').addEventListener('click',event=>{
  event.preventDefault();present(new URL(event.currentTarget.href));
});
// A prepared copy uses the local package when the network is unavailable.
for(const link of document.querySelectorAll('a[href^="watch/"]')){
  link.addEventListener('click',event=>{
    if(navigator.onLine!==false)return;
    event.preventDefault();const url=new URL(link.href);url.pathname=url.pathname.replace('/watch/','/app/');location.href=url.href;
  });
}
// Preserve bookmarked presenter URLs and the existing recovery page.
const requested=new URLSearchParams(location.search).get('return');
if(requested){
  const url=new URL(requested,base);
  if(url.origin===base.origin && url.pathname.startsWith(base.pathname+'app/')){
    if(url.pathname.endsWith('speaker.html')||url.searchParams.get('broadcast')==='1')present(url);
    else offlineStatus().then(()=>location.replace(url.href)).catch(error=>status.textContent=error.message);
  }
}
