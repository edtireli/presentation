import {createGateVisuals,fileComplaintPaper} from './gate-visuals.js';

const base=new URL('./',import.meta.url),storageKey='spiral.private:'+base.pathname;
const status=document.querySelector('#status'),form=document.querySelector('#unlock'),modes=document.querySelector('#modes');
const visuals=createGateVisuals(document.querySelector('#gate-field'));
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)),b64=a=>btoa(String.fromCharCode(...new Uint8Array(a)));
let unlocked=false,ackData=null,serviceConfig=null,pendingConfig=null,ackTimer=0,ackLoadId=0;
const ack=document.querySelector('#acknowledgements'),complaint=document.querySelector('#complaint-dialog');
const complaintForm=document.querySelector('#complaint-form'),messageInput=document.querySelector('#complaint-message');
const complaintStatus=document.querySelector('#complaint-status'),sendButton=document.querySelector('#send-complaint');
const paper=document.querySelector('#complaint-paper'),done=document.querySelector('#complaint-done');
let sending=false,submission=null;
const returnFocus=new WeakMap();

async function rpc(message){await navigator.serviceWorker.ready;const worker=navigator.serviceWorker.controller;if(!worker)throw Error('The presentation is still preparing. Please try again.');return new Promise((resolve,reject)=>{const channel=new MessageChannel();const timeout=setTimeout(reject,30000,Error('Could not prepare presentation. Please refresh.'));channel.port1.onmessage=({data})=>{clearTimeout(timeout);data.ok?resolve(data):reject(Error(data.error||'Could not unlock.'));};worker.postMessage(message,[channel.port2]);});}
async function start(){if(!('serviceWorker'in navigator)||!crypto.subtle)throw Error('Please use an up-to-date Chrome, Edge, Safari, or Firefox browser.');await navigator.serviceWorker.register(new URL('sw.js',base),{scope:base.pathname,updateViaCache:'none'});await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));}
const ready=start();
async function unlock(password,saved){await ready;const metadata=await(await fetch(new URL('access.json',base),{cache:'no-store'})).json();let raw;
 if(saved?.revision===metadata.revision)raw=bytes(saved.key);else{if(!password)throw Error('Enter the password to open the presentation.');const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);raw=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:bytes(metadata.salt),iterations:metadata.iterations},material,256);}
 const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);const response=await fetch(new URL(metadata.index,base));if(!response.ok)throw Error('The presentation could not be downloaded. Please try again.');
 let manifest;try{const packed=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(metadata.iv)},key,await response.arrayBuffer());manifest=await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).json();}catch{throw Error('That password did not unlock the presentation.');}
 if(manifest.version!==1||!manifest.entries?.['index.html'])throw Error('Invalid presentation package.');
 const session={revision:metadata.revision,key:b64(raw),manifest};sessionStorage.setItem(storageKey,JSON.stringify(session));await rpc({type:'unlock',key,manifest,revision:metadata.revision});
 unlocked=true;form.hidden=true;modes.hidden=false;status.textContent='';document.querySelector('#password').value='';document.body.classList.add('is-unlocked');
 const bloom=saved?Promise.resolve():visuals.bloom();
 const target=new URLSearchParams(location.search).get('return');
 if(target){const dest=new URL(target,base);if(dest.origin===base.origin&&dest.pathname.startsWith(base.pathname+'app/')){if(!dest.hash&&location.hash)dest.hash=location.hash;await bloom;location.replace(dest.href);return;}}
 if(!saved){document.querySelector('#watch-live').focus({preventScroll:true});await bloom;}
}
form.addEventListener('submit',async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;status.textContent='Unlocking…';try{await unlock(document.querySelector('#password').value);}catch(e){status.textContent=e.message;}finally{button.disabled=false;}});

function showDialog(dialog,initial){returnFocus.set(dialog,document.activeElement);dialog.showModal();initial?.focus({preventScroll:true});}
function resetPaper(){for(const animation of paper.getAnimations())animation.cancel();complaint.classList.remove('is-filed');complaintForm.hidden=false;done.hidden=true;complaintStatus.textContent='';complaint.dataset.saveState='idle';}
for(const dialog of [ack,complaint]){
 dialog.addEventListener('close',()=>{const target=returnFocus.get(dialog);if(target?.isConnected&&target.getClientRects().length)target.focus({preventScroll:true});});
}
document.querySelector('#close-ack').onclick=()=>ack.close();
document.querySelector('#close-complaint').onclick=()=>complaint.close();
done.onclick=()=>complaint.close();
ack.addEventListener('close',()=>{clearTimeout(ackTimer);ackTimer=0;ackLoadId++;document.querySelector('#complaint-offer').hidden=true;});
complaint.addEventListener('close',()=>{for(const animation of paper.getAnimations())animation.cancel();});

document.querySelector('#read-acknowledgements').addEventListener('click',async()=>{
 if(!unlocked)return;
 const loading=document.querySelector('#ack-status'),content=document.querySelector('#ack-text'),offer=document.querySelector('#complaint-offer');
 clearTimeout(ackTimer);offer.hidden=true;loading.hidden=!!ackData;loading.textContent='Loading acknowledgements…';
 const loadId=++ackLoadId;
 showDialog(ack,document.querySelector('#close-ack'));
 ackTimer=setTimeout(()=>{if(ack.open&&unlocked)offer.hidden=false;},5000);
 try{
  if(!ackData){const response=await fetch(new URL('app/acknowledgements.json',base),{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Acknowledgements could not be loaded. Close this window and try again.');const data=await response.json();if(!Array.isArray(data.paragraphs)||!data.paragraphs.length||!data.paragraphs.every(p=>typeof p==='string'))throw Error('Acknowledgements are unavailable.');if(!unlocked||loadId!==ackLoadId)return;ackData=data;}
  if(!ack.open||loadId!==ackLoadId)return;
  document.querySelector('#ack-title').textContent=ackData.title||'Acknowledgements';
  content.replaceChildren(...ackData.paragraphs.map(text=>{const p=document.createElement('p');p.textContent=text;return p;}));loading.hidden=true;
 }catch(error){if(ack.open&&loadId===ackLoadId){loading.hidden=false;loading.textContent=error.message;}}
});

document.querySelector('#open-complaint').onclick=()=>{
 if(!unlocked)return;
 if(complaint.classList.contains('is-filed')){complaintForm.reset();submission=null;resetPaper();}
 showDialog(complaint,messageInput);
};

async function privateServiceConfig(){
 if(!unlocked)throw Error('Unlock the presentation before sending a complaint.');
 if(serviceConfig)return serviceConfig;
 if(!pendingConfig)pendingConfig=(async()=>{
  const response=await fetch(new URL('app/live-config.json',base),{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('The complaint box is temporarily unavailable. Your text is still here.');
  const data=await response.json();
  if(!unlocked)throw Error('The presentation was locked.');
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

document.querySelector('#lock').onclick=async()=>{
 unlocked=false;ackData=null;serviceConfig=null;clearTimeout(ackTimer);ackTimer=0;ackLoadId++;
 if(complaint.open)complaint.close();if(ack.open)ack.close();
 document.querySelector('#ack-text').replaceChildren();complaintForm.reset();submission=null;resetPaper();
 sessionStorage.removeItem(storageKey);await rpc({type:'lock'});modes.hidden=true;form.hidden=false;document.body.classList.remove('is-unlocked');status.textContent='Presentation locked.';document.querySelector('#password').focus({preventScroll:true});
};
addEventListener('pagehide',()=>{clearTimeout(ackTimer);ackTimer=0;serviceConfig=null;});
try{const saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(saved){status.textContent='Opening presentation…';await unlock('',saved);}else await ready;}catch(e){sessionStorage.removeItem(storageKey);status.textContent=e.message;}
