import {createGateVisuals,fileComplaintPaper} from './gate-visuals.js';
import {renderAcknowledgementParagraph} from './acknowledgement-names.js';
import {ensurePresenterReady} from './presenter-ready.js';

const base=new URL('./',import.meta.url),storageKey='spiral.private:'+base.pathname;
const status=document.querySelector('#status'),retryButton=document.querySelector('#retry-open');
const visuals=createGateVisuals(document.querySelector('#gate-field'));
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)),b64=a=>btoa(String.fromCharCode(...new Uint8Array(a)));
let unlocked=false,ackData=null,serviceConfig=null,pendingConfig=null,ackTimer=0,ackLoadId=0;
const ack=document.querySelector('#acknowledgements'),landing=document.querySelector('#landing'),complaint=document.querySelector('#complaint-dialog');
const complaintForm=document.querySelector('#complaint-form'),messageInput=document.querySelector('#complaint-message');
const complaintStatus=document.querySelector('#complaint-status'),sendButton=document.querySelector('#send-complaint');
const paper=document.querySelector('#complaint-paper'),done=document.querySelector('#complaint-done');
let sending=false,submission=null;
const returnFocus=new WeakMap();

async function rpc(message){await navigator.serviceWorker.ready;const worker=navigator.serviceWorker.controller;if(!worker)throw Error('The presentation is still preparing. Please try again.');return new Promise((resolve,reject)=>{const channel=new MessageChannel();const timeout=setTimeout(reject,30000,Error('Could not prepare presentation. Please refresh.'));channel.port1.onmessage=({data})=>{clearTimeout(timeout);data.ok?resolve(data):reject(Error(data.error||'Could not prepare the presentation.'));};worker.postMessage(message,[channel.port2]);});}
async function start(){if(!('serviceWorker'in navigator)||!crypto.subtle)throw Error('Please use an up-to-date Chrome, Edge, Safari, or Firefox browser.');await navigator.serviceWorker.register(new URL('sw.js',base),{scope:base.pathname,updateViaCache:'none'});await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));}
const ready=start();
async function openPresentation(saved){
 await ready;
 const response=await fetch(new URL('access.json',base),{cache:'no-store'});
 if(!response.ok)throw Error('The presentation could not be prepared. Please try again.');
 const metadata=await response.json();
 if(typeof metadata.publicKey!=='string')throw Error('The new presentation is still being published. Please try again shortly.');
 const raw=bytes(metadata.publicKey),key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
 let manifest=saved?.revision===metadata.revision&&saved.key===metadata.publicKey?saved.manifest:null;
 if(!manifest){
  const response=await fetch(new URL(metadata.index,base));
  if(!response.ok)throw Error('The presentation could not be downloaded. Please try again.');
  const packed=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(metadata.iv)},key,await response.arrayBuffer());
  manifest=await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
 }
 if(manifest.version!==1||!manifest.entries?.['index.html'])throw Error('Invalid presentation package.');
 const session={revision:metadata.revision,key:b64(raw),manifest};
 sessionStorage.setItem(storageKey,JSON.stringify(session));
 await rpc({type:'unlock',key,manifest,revision:metadata.revision});
 unlocked=true;status.textContent='';document.body.classList.add('is-ready');
 const target=new URLSearchParams(location.search).get('return');
 if(target){const dest=new URL(target,base);if(dest.origin===base.origin&&dest.pathname.startsWith(base.pathname+'app/')){if(!dest.hash&&location.hash)dest.hash=location.hash;if(isPresenterDestination(dest)&&!await ensurePresenterReady({handoff:true}))return;location.replace(dest.href);}}
}
function isPresenterDestination(url){return /speaker\.html$/.test(url.pathname)||url.searchParams.get('broadcast')==='1';}
let preparation,navigating=false;
function prepare(){
 retryButton.hidden=true;
 let saved=null;try{saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{}
 preparation=openPresentation(saved).then(()=>true).catch(error=>{status.textContent=error.message;retryButton.hidden=false;return false;});
 return preparation;
}
retryButton.onclick=prepare;
for(const link of document.querySelectorAll('a[data-presentation]'))link.addEventListener('click',async event=>{
 if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 event.preventDefault();if(navigating)return;navigating=true;
 try{if(!await preparation)return;if(isPresenterDestination(new URL(link.href))&&!await ensurePresenterReady({handoff:true}))return;await visuals.bloom();location.assign(link.href);}finally{navigating=false;}
});

function showDialog(dialog,initial){returnFocus.set(dialog,document.activeElement);dialog.showModal();initial?.focus({preventScroll:true});}
function resetPaper(){for(const animation of paper.getAnimations())animation.cancel();complaint.classList.remove('is-filed');complaintForm.hidden=false;done.hidden=true;complaintStatus.textContent='';complaint.dataset.saveState='idle';}
complaint.addEventListener('close',()=>{const target=returnFocus.get(complaint);if(target?.isConnected&&target.getClientRects().length)target.focus({preventScroll:true});});
document.querySelector('#close-complaint').onclick=()=>complaint.close();
done.onclick=()=>complaint.close();
complaint.addEventListener('close',()=>{for(const animation of paper.getAnimations())animation.cancel();});

function leaveAcknowledgements(){
 if(ack.hidden)return;
 clearTimeout(ackTimer);ackTimer=0;ackLoadId++;
 if(complaint.open)complaint.close();
 document.querySelector('#complaint-offer').hidden=true;
 ack.hidden=true;landing.hidden=false;document.body.classList.remove('is-reading-ack');
 scrollTo({top:0,behavior:'instant'});
 document.querySelector('#read-acknowledgements').focus({preventScroll:true});
}
async function enterAcknowledgements(){
 if(!ack.hidden)return;
 const loading=document.querySelector('#ack-status'),content=document.querySelector('#ack-text'),offer=document.querySelector('#complaint-offer');
 clearTimeout(ackTimer);offer.hidden=true;loading.hidden=!!ackData;loading.textContent='Loading acknowledgements…';
 const loadId=++ackLoadId;
 landing.hidden=true;ack.hidden=false;document.body.classList.add('is-reading-ack');
 scrollTo({top:0,behavior:'instant'});document.querySelector('#ack-title').focus({preventScroll:true});
 ackTimer=setTimeout(()=>{if(!ack.hidden)offer.hidden=false;},5000);
 try{
  if(!await preparation)throw Error(status.textContent||'The acknowledgements could not be prepared. Go back and try again.');
  if(ack.hidden||loadId!==ackLoadId)return;
  if(!ackData){const response=await fetch(new URL('app/acknowledgements.json',base),{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Acknowledgements could not be loaded. Go back and try again.');const data=await response.json();if(!Array.isArray(data.paragraphs)||!data.paragraphs.length||!data.paragraphs.every(p=>typeof p==='string'))throw Error('Acknowledgements are unavailable.');if(!unlocked||loadId!==ackLoadId)return;ackData=data;}
  if(ack.hidden||loadId!==ackLoadId)return;
  document.querySelector('#ack-title').textContent=ackData.title||'Acknowledgements';
  content.replaceChildren(...ackData.paragraphs.map(renderAcknowledgementParagraph));loading.hidden=true;
 }catch(error){if(!ack.hidden&&loadId===ackLoadId){loading.hidden=false;loading.textContent=error.message;}}
}
function syncReadingRoute(){
 if(location.hash==='#acknowledgements')enterAcknowledgements();else leaveAcknowledgements();
}
document.querySelector('#read-acknowledgements').addEventListener('click',event=>{
 if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 event.preventDefault();
 if(location.hash!=='#acknowledgements'){
  const url=new URL(location.href);url.hash='acknowledgements';
  history.pushState({...history.state,spiralAcknowledgementsEntry:true},'',url);
 }
 syncReadingRoute();
});
function backFromAcknowledgements(event){
 event?.preventDefault();
 if(history.state?.spiralAcknowledgementsEntry){history.back();return;}
 // A direct #acknowledgements link has no in-page entry to pop. Stay on this site.
 const url=new URL(location.href);url.hash='';history.replaceState(history.state,'',url);syncReadingRoute();
}
document.querySelector('#close-ack').onclick=backFromAcknowledgements;
document.querySelector('[data-ack-back]').onclick=backFromAcknowledgements;
addEventListener('popstate',syncReadingRoute);addEventListener('hashchange',syncReadingRoute);
addEventListener('keydown',event=>{if(event.key==='Escape'&&!ack.hidden&&!complaint.open)backFromAcknowledgements(event);});

document.querySelector('#open-complaint').onclick=()=>{
 if(!unlocked||ack.hidden)return;
 if(complaint.classList.contains('is-filed')){complaintForm.reset();submission=null;resetPaper();}
 showDialog(complaint,messageInput);
};

async function privateServiceConfig(){
 if(!await preparation)throw Error('The presentation could not be prepared. Please try again.');
 if(serviceConfig)return serviceConfig;
 if(!pendingConfig)pendingConfig=(async()=>{
  const response=await fetch(new URL('app/live-config.json',base),{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('The complaint box is temporarily unavailable. Your text is still here.');
  const data=await response.json();
  if(!unlocked)throw Error('The presentation is still preparing.');
  const url=new URL(data.apiBase);
  if(url.origin!=='https://tireli-presentation-service.nuggedt.chatgpt.site'||!data.viewerToken||typeof data.viewerToken!=='string')throw Error('The complaint box is temporarily unavailable. Your text is still here.');
  serviceConfig={apiBase:url.href.replace(/\/$/,''),viewerToken:data.viewerToken};return serviceConfig;
 })().finally(()=>{pendingConfig=null;});
 return pendingConfig;
}
complaintForm.addEventListener('submit',async event=>{
 event.preventDefault();if(sending||!unlocked)return;
 const message=messageInput.value.trim();if(!message){messageInput.setCustomValidity('Write a complaint first.');messageInput.reportValidity();return;}messageInput.setCustomValidity('');
 if(message.length>3000){complaintStatus.textContent='Please keep your complaint to 3,000 characters.';return;}
 if(!submission||submission.message!==message)submission={message,submissionId:crypto.randomUUID()};
 sending=true;sendButton.disabled=true;messageInput.readOnly=true;complaint.classList.add('is-sending');complaint.dataset.saveState='sending';complaintStatus.textContent='Sending…';
 try{
  const config=await privateServiceConfig();
  const response=await fetch(`${config.apiBase}/complaints`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.viewerToken}`},body:JSON.stringify(submission),signal:AbortSignal.timeout(20000),credentials:'omit'});
  let result;try{result=await response.json();}catch{throw Error('The server did not confirm a save. Your text is still here; you can retry.');}
  if(!response.ok||result.saved!==true||!result.id)throw Error(response.status===429?'A few too many complaints at once. Please try again shortly.':'Your complaint could not be saved. Your text is still here; please try again.');
  // The playful filing animation is downstream of an actual confirmed save.
  if(!unlocked)return;
  complaint.dataset.saveState='saved';complaintStatus.textContent='Complaint saved privately for Edis.';
  if(complaint.open)await fileComplaintPaper(paper,document.querySelector('#complaint-bin'),{reducedMotion:visuals.reducedMotion()});
  complaintForm.hidden=true;complaint.classList.add('is-filed');done.hidden=false;complaintStatus.textContent='Saved for Edis.';
  if(complaint.open)done.focus({preventScroll:true});
 }catch(error){complaint.dataset.saveState='error';complaintStatus.textContent=error.name==='TimeoutError'?'The server has not confirmed a save. Your text is still here; you can retry.':error.message;}
 finally{sending=false;sendButton.disabled=false;messageInput.readOnly=false;complaint.classList.remove('is-sending');}
});
messageInput.addEventListener('input',()=>messageInput.setCustomValidity(''));

addEventListener('pagehide',()=>{clearTimeout(ackTimer);ackTimer=0;serviceConfig=null;});
prepare();
syncReadingRoute();
