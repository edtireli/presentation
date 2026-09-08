export const NARRATION_RELEASE_AT='2026-09-10T15:00:00Z';
export const NARRATION_RELEASE_LABEL='10 September 2026 at 17:00 Copenhagen time';
export function narrationReleased(now=Date.now()){return now>=Date.parse(NARRATION_RELEASE_AT);}

let currentDialog=null,linkTimer=null;
function element(tag,text,className){const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;}
function updateLink(){
 clearTimeout(linkTimer);linkTimer=null;
 const link=document.querySelector('#with-narration');if(!link)return;
 const locked=!narrationReleased();link.removeAttribute('aria-disabled');link.dataset.locked=String(locked);if(locked)link.setAttribute('aria-haspopup','dialog');else link.removeAttribute('aria-haspopup');link.classList.toggle('is-locked',locked);link.title=locked?`Available on ${NARRATION_RELEASE_LABEL}`:'Watch with narration';
 if(locked)linkTimer=setTimeout(updateLink,Math.min(60000,Math.max(1,Date.parse(NARRATION_RELEASE_AT)-Date.now())));
}

/** The gate calls this after preparation, or from an explicit locked link click. */
export function showNarrationRelease(){
 if(currentDialog?.dialog.isConnected){currentDialog.update();return currentDialog.dialog;}
 const existing=document.querySelector('#narration-release-dialog');if(existing?.open)return existing;
 const before=document.activeElement,link=document.querySelector('#with-narration');
 const previous=before&&before!==document.body&&typeof before.focus==='function'?before:link;
 const dialog=element('dialog','', 'narration-release-dialog');dialog.id='narration-release-dialog';
 dialog.setAttribute('aria-labelledby','narration-release-title');dialog.setAttribute('aria-describedby','narration-release-description');
 const heading=element('div','', 'dialog-heading');
 const title=element('h2','Narration opens soon');title.id='narration-release-title';
 const closeButton=element('button','×','close');closeButton.type='button';closeButton.setAttribute('aria-label','Close countdown');heading.append(title,closeButton);
 const description=element('p','', 'narration-release-description');description.id='narration-release-description';
 const date=element('time',NARRATION_RELEASE_LABEL);date.dateTime=NARRATION_RELEASE_AT;description.append(date);
 const countdown=element('div','', 'narration-countdown');countdown.setAttribute('role','timer');countdown.setAttribute('aria-label','Time until narration is available');countdown.setAttribute('aria-live','off');
 const numbers=['days','hours','minutes','seconds'].map(unit=>{
  const cell=element('div','', 'narration-countdown-unit');
  const value=element('span','00','narration-countdown-value');value.dataset.unit=unit;
  cell.append(value,element('span',unit,'narration-countdown-label'));countdown.append(cell);return value;
 });
 const announcement=element('p','', 'narration-release-announcement');announcement.setAttribute('role','status');announcement.setAttribute('aria-live','polite');
 const actions=element('div','', 'narration-release-actions');
 const back=element('button','Back','narration-release-back'),watch=element('button','Watch narration','narration-release-watch');
 back.type=watch.type='button';watch.disabled=true;actions.append(back,watch);
 dialog.append(heading,description,countdown,announcement,actions);document.body.append(dialog);
 let timer=null,closed=false,wasReleased=false;
 function close({restoreFocus=true}={}){
  if(closed)return;closed=true;clearInterval(timer);timer=null;
  removeEventListener('pagehide',leaving);removeEventListener('popstate',backNavigation);
  dialog.close();dialog.remove();if(currentDialog?.dialog===dialog)currentDialog=null;
  if(restoreFocus&&previous?.isConnected)previous.focus({preventScroll:true});
 }
 function leaving(){close({restoreFocus:false});}
 function backNavigation(){close();}
 function update(){
  if(closed)return;
  const remaining=Math.max(0,Date.parse(NARRATION_RELEASE_AT)-Date.now());
  const released=narrationReleased();
  if(released){
   clearInterval(timer);timer=null;countdown.hidden=true;watch.disabled=false;title.textContent='Narration is available';
   if(!wasReleased){announcement.textContent='You can now watch the narrated presentation.';updateLink();}
   wasReleased=true;return;
  }
  const total=Math.ceil(remaining/1000),values=[Math.floor(total/86400),Math.floor(total%86400/3600),Math.floor(total%3600/60),total%60];
  numbers.forEach((node,index)=>{const value=String(values[index]).padStart(2,'0');if(node.textContent!==value)node.textContent=value;});
 }
 closeButton.onclick=()=>close();back.onclick=()=>close();
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 watch.onclick=()=>{if(!narrationReleased())return;close();document.querySelector('#with-narration')?.click();};
 addEventListener('pagehide',leaving,{once:true});addEventListener('popstate',backNavigation,{once:true});
 currentDialog={dialog,update};timer=setInterval(update,1000);update();dialog.showModal();closeButton.focus();return dialog;
}

if(typeof document!=='undefined'){
 updateLink();
 // Query-driven opening belongs to gate.js after preparation. Opening here too
 // would reopen a dismissed countdown when that asynchronous preparation ends.
 addEventListener('pagehide',()=>{clearTimeout(linkTimer);linkTimer=null;});
 addEventListener('pageshow',updateLink);
}
