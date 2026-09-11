import {SpeakerNoteStore} from './speaker-note-store.js';
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const deckPath=params.get('deck')||'decks/phd-defense.spiral';
const session=params.get('presenterSession')||crypto.randomUUID();
if(!params.has('presenterSession')){params.set('presenterSession',session);history.replaceState(null,'',`${location.pathname}?${params}${location.hash}`);}
const channel=new BroadcastChannel(`spiral-presenter:${session}`);
let slides=[], manifest={states:{}}, state=null, lastSeen=0, audience=null, currentRoute='';
let noteStore=null,speechStore=null,cueStore=null,cueData=null,editingRoute=null,editingBefore=null;
let noteMode=localStorage.getItem('spiral.speaker.noteMode')==='speech'?'speech':'cues';
$('note-mode').value=noteMode;
$('note-mode').onchange=()=>{
  closeEditor();noteMode=$('note-mode').value;localStorage.setItem('spiral.speaker.noteMode',noteMode);render(true);savedStatus();
};
let audienceViewport={width:1600,height:900};
function sizePreview(){
  const frame=$('preview-frame').firstChild;if(!frame)return;
  const {width,height}=audienceViewport,container=$('preview-frame');
  container.style.aspectRatio=`${width} / ${height}`;
  Object.assign(frame.style,{width:`${width}px`,height:`${height}px`,transform:`scale(${container.clientWidth/width})`});
}
new ResizeObserver(sizePreview).observe($('preview-frame'));
let split=localStorage.getItem('spiral.speaker.split')==='1';
function setSplit(){
  document.body.classList.toggle('split',split);$('slide-preview').hidden=!split;
  $('split-toggle').setAttribute('aria-pressed',String(split));$('split-toggle').textContent=split?'Notes only':'Slide + notes';
  localStorage.setItem('spiral.speaker.split',split?'1':'0');
  if(split&&!$('preview-frame').firstChild){
    const frame=document.createElement('iframe');frame.title='Current audience slide (read only)';frame.tabIndex=-1;
    const url=new URL('index.html',location.href);url.searchParams.set('deck',deckPath);url.searchParams.set('presenterSession',session);url.searchParams.set('presenterPreview','1');
    url.hash=state?.route||location.hash.slice(1);frame.src=url.href;$('preview-frame').append(frame);sizePreview();
  }else if(!split)$('preview-frame').replaceChildren();
}
$('split-toggle').onclick=()=>{split=!split;setSplit();};setSplit();
const sequence=()=>Object.keys(manifest.states);
const cueOverrides={}; // Authored per-click pointing cues are the source of truth.
// Emphasis is a display layer. The approved speech and prerecorded audio stay untouched.
const terms=[
  'persistent post-concussion symptoms','spreading depolarisation','spreading depolarization','blood-brain barrier',
  'membrane potential','action potential','electrically negative','less negative','concentration gradients',
  'potassium','sodium','calcium','glutamate','glutamine','GLX','glucose','ATP','glycolysis','mitochondria',
  'neurons','astrocytes','microglia','oligodendrocytes','pericytes','axons','strain',
  'GFAP','UCH-L1','NfL','IL-6','C57BL/6','Yucatan minipigs','zebrafish','humans',
  'healthy controls','historical controls','baseline','randomisation','randomization','Rivermead','RPQ',
  'Patlak','p-Brain','Ki','blood volume','influx constant','perfusion','blood flow','oxygen extraction',
  'hypoxia','oxygen metabolism','gadolinium','arterial input','tissue concentration','voxels','parcels',
  'instantaneous','accumulation','intercept','slope','quality control','uncertainty','association',
  'energy burden','energy use','metabolic crisis','barrier exchange','TSPO','apyrase','Ktrans','PPCS','CBF','CMRO₂',
  'seventy','sixty','forty-six','seventeen percent','twelve percent','three months','two weeks',
  'tenfold','seven minutes','ninety minutes','5,600','extraction fraction','low-extraction',
];
const escaped=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const emphasis=new RegExp(`\\b(${terms.sort((a,b)=>b.length-a.length).map(escaped).join('|')}|\\d+(?:\\.\\d+)?(?:%|\\s+(?:months|weeks|years|minutes|patients|adults|percent)))\\b`,'gi');
function addKeywordEmphasis(node,text){
  let end=0; for(const match of text.matchAll(emphasis)){
    node.append(document.createTextNode(text.slice(end,match.index)));
    const strong=document.createElement('strong');strong.textContent=match[0];node.append(strong);end=match.index+match[0].length;
  }node.append(document.createTextNode(text.slice(end)));
}
function addEmphasis(node,text){
  let end=0;
  for(const match of text.matchAll(/\*\*([^*]+)\*\*/g)){
    addKeywordEmphasis(node,text.slice(end,match.index));
    const strong=document.createElement('strong');strong.textContent=match[1];node.append(strong);
    end=match.index+match[0].length;
  }
  addKeywordEmphasis(node,text.slice(end));
}
function command(action,extra={}){channel.postMessage({type:'command',action,...extra});}
function storeFor(route){return noteMode==='cues'&&cueStore?.manifest.states[route]?cueStore:speechStore;}
function entryFor(route){
  const selected=storeFor(route);
  if(selected===cueStore&&cueStore){
    const base=cueStore.manifest.states[route],edit=cueStore.edits[route];
    return {...base,...edit,cue:true,edited:!!edit};
  }
  if(selected?.edits[route])return {...manifest.states[route],...selected.edits[route],edited:true};
  if(manifest.states[route])return manifest.states[route];
  const [slug,step]=route.split('/'),slide=slides.find(s=>s.slug===slug);
  return {say:slide?.cues?.[Number(step)] || slide?.notes || '',fallback:true,title:slide?.title};
}
function render(force=false){
  if(!state)return;
  const route=state.route,slide=slides.find(s=>s.slug===state.slug);
  $('title').textContent=slide?.title||entryFor(route).title||'PhD defence';
  $('position').textContent=`Slide ${state.index+1}${slides.length?' / '+slides.length:''} · click ${state.step} / ${state.totalSteps}`;
  $('slide-jump').value=state.slug;
  if(route===currentRoute&&!force)return;
  if(editingRoute&&route!==editingRoute)closeEditor();
  noteStore=storeFor(route);
  currentRoute=route;history.replaceState(null,'',`${location.pathname}${location.search}#${route}`);
  const entry=entryFor(route);
  $('note-kind').textContent=entry.cue?(entry.edited?'Edited cues · voice unchanged':'Cue bullets · voice unchanged'):entry.edited?'Edited script · voice unchanged':entry.silent?'Silent beat':entry.fallback?'Backup / slide notes':'Current speech';
  $('export-notes').textContent=entry.cue?'Export cue notes JSON':'Export script JSON';
  $('import-notes').textContent=entry.cue?'Import cue notes JSON':'Import script JSON';
  $('edit-note').disabled=!noteStore||!!editingRoute;
  const cue=entry.cue?cueData.states[route]:null,theme=cue?cueData.themes[cue.theme]:null;
  $('section-purpose').hidden=!theme;$('section-purpose').replaceChildren();
  if(theme){const title=document.createElement('strong');title.textContent=theme.title;$('section-purpose').append(title,document.createTextNode(theme.purpose));}
  $('note-context').hidden=!cue;$('note-context').open=false;$('note-detail').textContent=cue?.detail||'';
  $('note-sources').replaceChildren();
  for(const key of cue?.sources||[]){const ref=cueData.references[key];if(!ref)continue;
    const li=document.createElement('li');if(ref.url&&/^https:\/\//.test(ref.url)){const a=document.createElement('a');a.href=ref.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=ref.label;li.append(a);}else li.textContent=ref.label;$('note-sources').append(li);}
  $('notes').replaceChildren();
  const text=entry.say || (entry.silent?'Pause here. No spoken line for this click.':'No speaker note has been written for this click.');
  // Short paragraphs improve scanning while preserving the words exactly.
  if(entry.cue){const ul=document.createElement('ul');for(const line of text.split('\n').filter(s=>s.trim())){const li=document.createElement('li');addEmphasis(li,line.replace(/^\s*[-•]\s*/,''));ul.append(li);}$('notes').append(ul);}
  else{const sentences=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('en',{granularity:'sentence'}).segment(text)].map(s=>s.segment):[text];
    for(let i=0;i<sentences.length;i+=3){const p=document.createElement('p');addEmphasis(p,sentences.slice(i,i+3).join('').trim());$('notes').append(p);}}
  $('notes').scrollTop=0;
  const keys=sequence(),at=keys.indexOf(route);
  const nextRoute=state.step<state.totalSteps?`${state.slug}/${state.step+1}`:
    slides[state.index+1]?`${slides[state.index+1].slug}/0`:at>=0?keys[at+1]:null;
  $('visual-cue').textContent=cueData?.states?.[route]?.point||cueOverrides[route]||state.labels?.join(' · ')||'';
  $('next-cue').textContent=nextRoute?(cueData?.states?.[nextRoute]?.point||cueOverrides[nextRoute]||entryFor(nextRoute).title||nextRoute):'End of presentation';
  const upcoming=nextRoute?entryFor(nextRoute):{};
  $('next-notes').textContent=(upcoming.say|| (upcoming.silent?'Silent beat.':'')).slice(0,420)+(upcoming.say?.length>420?'…':'');
}
function savedStatus(text){
  const ok=noteStore?.storageOK;$('note-save-status').classList.toggle('warning',!ok);
  $('note-save-status').textContent=!ok?'Browser storage is unavailable. Export notes JSON before closing. Recorded narration is unchanged.':
    text||'Saved in this browser. Export notes JSON to keep a file or send it back. Recorded narration is unchanged.';
}
function closeEditor(){editingRoute=null;editingBefore=null;$('note-editor').hidden=true;$('notes').hidden=false;$('edit-note').disabled=!noteStore;}
$('edit-note').onclick=()=>{
  if(!noteStore||!currentRoute)return;editingRoute=currentRoute;editingBefore=structuredClone(noteStore.edits[currentRoute]||null);
  $('editing-route').textContent=currentRoute;$('note-text').value=entryFor(currentRoute).say||'';
  $('notes').hidden=true;$('note-editor').hidden=false;$('edit-note').disabled=true;$('note-text').focus();
};
$('note-text').oninput=()=>{if(editingRoute){noteStore.set(editingRoute,$('note-text').value);savedStatus();}};
$('save-note').onclick=()=>{if(editingRoute)noteStore.set(editingRoute,$('note-text').value);closeEditor();render(true);savedStatus();};
$('cancel-note').onclick=()=>{if(editingRoute)noteStore.restore(editingRoute,editingBefore);closeEditor();render(true);savedStatus('Restored the note from before this edit. Recorded narration is unchanged.');};
$('export-notes').onclick=()=>{
  if(!noteStore)return;const blob=new Blob([JSON.stringify(noteStore.review(),null,2)+'\n'],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=noteStore.kind==='cues'?'phd-speaker-cue-edits.json':'phd-speaker-notes-edits.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
  savedStatus('Exported notes JSON. Send that file back when you are ready. Recorded narration is unchanged.');
};
$('import-notes').onclick=()=>$('notes-file').click();
$('notes-file').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{
    if(file.size>5_000_000)throw Error('This file is too large for a notes export.');
    const known=route=>noteStore.kind==='cues'?!!cueStore.manifest.states[route]:!!manifest.states[route]||slides.some(s=>route.startsWith(s.slug+'/')&&Number(route.split('/')[1])<=s.totalSteps);
    // Archive the previous browser draft so an import is recoverable.
    try{localStorage.setItem(noteStore.key+':before-import',JSON.stringify(noteStore.review()));}catch{}
    noteStore.import(JSON.parse(await file.text()),known);closeEditor();render(true);savedStatus('Imported notes and saved them in this browser. Recorded narration is unchanged.');
  }catch(error){$('note-save-status').classList.add('warning');$('note-save-status').textContent=error.message;}
  e.target.value='';
};
addEventListener('storage',e=>{for(const store of [speechStore,cueStore])if(store&&e.key===store.key&&e.newValue&&!editingRoute){try{store.edits=store.validate(JSON.parse(e.newValue));render(true);}catch{}}});
channel.addEventListener('message',({data})=>{
  if(data?.type!=='state')return;
  if(Number.isFinite(data.viewport?.width)&&Number.isFinite(data.viewport?.height)&&data.viewport.width>0&&data.viewport.height>0){
    audienceViewport=data.viewport;sizePreview();
  }
  lastSeen=Date.now();state={...data.state,labels:data.labels};
  if(data.slides){slides=data.slides;$('slide-jump').replaceChildren(...slides.map(s=>{const o=document.createElement('option');o.value=s.slug;o.textContent=`${s.index+1}. ${s.title}`;return o;}));}
  $('blackout').textContent=data.blackout?'Restore screen':'Black screen';
  render(!!data.slides);updateConnection();
});
function updateConnection(){
  const connected=Date.now()-lastSeen<4500;
  $('connection').textContent=connected?'Connected · notes stay private':'Audience window disconnected · open or reconnect it';
  $('connection').className=connected?'connected':'disconnected';
  $('open-audience').textContent=connected?'Focus audience window':'Open audience presentation';
  for(const id of ['next','previous','blackout','slide-jump'])$(id).disabled=!connected;
}
$('open-audience').onclick=()=>{
  const url=new URL('index.html',location.href);url.searchParams.set('deck',deckPath);url.searchParams.set('presenterSession',session);
  url.hash=state?.route ||location.hash.slice(1);
  // No narration or edit parameter: the audience gets a clean, silent presentation.
  audience=window.open('',`spiral-audience-${session}`);
  if(!audience){$('connection').textContent='Allow pop-ups for this local presentation, then click again.';return;}
  try{if(!audience.deck)audience.location.href=url.href;}catch{audience.location.href=url.href;}
  audience.focus();channel.postMessage({type:'hello'});
};
$('next').onclick=()=>command('next');$('previous').onclick=()=>command('prev');
$('blackout').onclick=()=>command('blackout');
$('slide-jump').onchange=e=>command('goto',{slug:e.target.value,step:0});
$('end').onclick=()=>{command('end');window.close();};
addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'&&noteStore){e.preventDefault();
    if(editingRoute)noteStore.set(editingRoute,$('note-text').value);else noteStore.save();savedStatus();return;}
  if(e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,textarea,select,[contenteditable="true"]'))return;
  if(e.key===' '&&e.target.closest('button'))return;
  const next=['ArrowRight','ArrowDown','PageDown',' '],prev=['ArrowLeft','ArrowUp','PageUp'];
  if(next.includes(e.key)){e.preventDefault();command('next');}
  else if(prev.includes(e.key)){e.preventDefault();command('prev');}
  else if(e.key.toLowerCase()==='b'){e.preventDefault();command('blackout');}
});
addEventListener('beforeunload',e=>{if([speechStore,cueStore].some(s=>s&&!s.storageOK&&Object.keys(s.edits).length)){e.preventDefault();e.returnValue='Export notes before closing.';}});
let size=Number(localStorage.getItem('spiral.speaker.font'))||27;
function resize(delta=0){size=Math.max(18,Math.min(42,size+delta));document.documentElement.style.setProperty('--note-size',`${size}px`);localStorage.setItem('spiral.speaker.font',size);}
$('smaller').onclick=()=>resize(-2);$('larger').onclick=()=>resize(2);resize();
let elapsed=0,start=0;
$('timer-toggle').onclick=()=>{if(start){elapsed+=Date.now()-start;start=0;}else start=Date.now();$('timer-toggle').textContent=start?'Pause timer':'Start timer';};
$('timer-reset').onclick=()=>{elapsed=0;if(start)start=Date.now();};
setInterval(()=>{
  updateConnection();if(Date.now()-lastSeen>2000)channel.postMessage({type:'hello'});
  const seconds=Math.floor((elapsed+(start?Date.now()-start:0))/1000);$('elapsed').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
},1000);
try{
  const deck=await(await fetch(deckPath,{cache:'no-store'})).json();
  const path=params.get('narrationManifest')||deck.narration?.manifest||deck.narration;
  if(path){const response=await fetch(path,{cache:'no-store'});if(!response.ok)throw Error(response.status);
    const raw=await response.text();manifest=JSON.parse(raw);
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(b=>b.toString(16).padStart(2,'0')).join('');
    speechStore=new SpeakerNoteStore(localStorage,`spiral.speaker.notes:${new URL(deckPath,location.href).pathname}`,manifest,hash);noteStore=speechStore;
    $('export-notes').disabled=false;$('import-notes').disabled=false;
    if(Object.keys(noteStore.edits).length||!noteStore.storageOK)savedStatus(noteStore.rebased?'Saved edits restored over a newer speech file. Review them before exporting. Recorded narration is unchanged.':undefined);
    render(true);}
  if(deck.speakerNotes?.manifest){try{
    const response=await fetch(deck.speakerNotes.manifest,{cache:'no-store'});if(!response.ok)throw Error(response.status);
    const raw=await response.text();cueData=JSON.parse(raw);
    if(cueData.schema!=='spiral-speaker-cues/v1')throw Error('Unknown cue file schema');
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(b=>b.toString(16).padStart(2,'0')).join('');
    const cueManifest={revision:cueData.revision,routeMigrations:cueData.routeMigrations,states:Object.fromEntries(Object.entries(cueData.states).map(([route,entry])=>[route,{say:entry.bullets.map(s=>'- '+s).join('\n'),silent:false}]))};
    cueStore=new SpeakerNoteStore(localStorage,`spiral.speaker.cues:${new URL(deckPath,location.href).pathname}`,cueManifest,hash,'cues');
    $('note-mode-label').hidden=false;render(true);
    if(cueStore.rebased)savedStatus('Your saved cue edits were preserved over updated authored cues. Review them before exporting. Recorded narration is unchanged.');
  }catch(error){$('note-save-status').textContent='Cue bullets could not be loaded. The full script is still available.';console.error(error);}}
}catch(e){$('note-kind').textContent='Speech file unavailable';console.error(e);}
channel.postMessage({type:'hello'});updateConnection();
