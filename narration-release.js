export const NARRATION_RELEASE_AT='2026-09-10T15:00:00Z';
export const NARRATION_RELEASE_LABEL='10 September 2026 at 17:00 Copenhagen time';
export function narrationReleased(now=Date.now()){return now>=Date.parse(NARRATION_RELEASE_AT);}
export function showNarrationRelease(){const status=document.querySelector('#status');if(status)status.textContent=narrationReleased()?'':`The narrated presentation opens on ${NARRATION_RELEASE_LABEL}.`;}
function updateLink(){
 const link=document.querySelector('#with-narration'),note=document.querySelector('#narration-release-note');if(!link)return;
 const locked=!narrationReleased();link.setAttribute('aria-disabled',String(locked));link.classList.toggle('is-locked',locked);link.title=locked?`Available on ${NARRATION_RELEASE_LABEL}`:'Watch with narration';
 if(note)note.hidden=!locked;
 if(locked)setTimeout(updateLink,Math.min(60000,Math.max(1,Date.parse(NARRATION_RELEASE_AT)-Date.now())));
}
if(typeof document!=='undefined'){
 updateLink();
 if(new URLSearchParams(location.search).get('narration')==='locked')showNarrationRelease();
}
