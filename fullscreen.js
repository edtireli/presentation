/* Audience-only fullscreen. A rotated iframe preserves the engine's viewport and
 * pointer coordinates when a mobile browser cannot lock native orientation. */
(()=>{
 'use strict';
 const params=new URLSearchParams(location.search);
 if(!/\/app\/(?:index\.html)?$/.test(location.pathname)||params.get('presenterPreview')==='1')return;
 const child=params.get('spiralLandscape')==='1'&&parent!==window;
 const ROOT='spiral-fullscreen',HOST='spiral-landscape-host',FRAME_W=1280,FRAME_H=720;
 let button,toolbar,overlay,frame,mode='window',busy=false,unlisten=()=>{},layoutFrame=0;
 const style=document.createElement('style');style.textContent=`
 #${ROOT}-controls{position:fixed;right:max(12px,env(safe-area-inset-right));top:max(12px,env(safe-area-inset-top));z-index:2147483647;display:flex;gap:8px;pointer-events:auto;}
 #${ROOT}-controls button{appearance:none;min-height:44px;padding:10px 14px;border:1px solid #c9c0af;border-radius:8px;background:rgba(15,16,17,.88);color:#f9f5eb;font:600 14px/1.2 system-ui,sans-serif;box-shadow:0 2px 10px #0008;cursor:pointer;touch-action:manipulation;}
 #${ROOT}-controls button:focus-visible{outline:3px solid #f3db58;outline-offset:3px;}
 #${ROOT}-controls button[hidden]{display:none;}
 #${ROOT}-overlay{position:fixed;inset:0;z-index:2147483645;background:#000;overflow:hidden;}
 #${ROOT}-overlay iframe{position:absolute;border:0;max-width:none;transform-origin:0 0;background:#000;}
 html.${HOST} #deck,html.${HOST} #open-speaker,html.${HOST} .spiral-narration{display:none!important;}
 html.${HOST} #${ROOT}-controls{visibility:hidden;}
 html.${HOST} #${ROOT}-overlay[data-loading='true']~#${ROOT}-controls{visibility:visible;}
 html.spiral-landscape-child #${ROOT}-controls{right:calc(12px / var(--spiral-fullscreen-scale,1));top:calc(12px / var(--spiral-fullscreen-scale,1));gap:calc(8px / var(--spiral-fullscreen-scale,1));}
 html.spiral-landscape-child #${ROOT}-controls button{font-size:calc(14px / var(--spiral-fullscreen-scale,1));min-height:calc(44px / var(--spiral-fullscreen-scale,1));padding:calc(10px / var(--spiral-fullscreen-scale,1)) calc(14px / var(--spiral-fullscreen-scale,1));}
 html.spiral-landscape-child #open-speaker{display:none!important;}
 `;document.head.append(style);
 const nativeActive=()=>!!(document.fullscreenElement||document.webkitFullscreenElement);
 const portrait=()=>innerHeight>innerWidth;
 const rootController=()=>{try{return parent.spiralFullscreen;}catch{return null;}};
 function reflect(){if(!button)return;const active=child||mode!=='window'||nativeActive();button.textContent=active?'Exit fullscreen':'Fullscreen';button.setAttribute('aria-pressed',String(active));button.title=active?'Return to the normal presentation':'Open the presentation in landscape fullscreen';document.documentElement.dataset.spiralFullscreen=child?'landscape-frame':mode;}
 function mountControls(){toolbar=document.createElement('div');toolbar.id=ROOT+'-controls';toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Presentation display');button=document.createElement('button');button.id=ROOT;button.type='button';button.onclick=e=>{e.stopPropagation();toggle();};toolbar.append(button);document.body.append(toolbar);reflect();
  if(child){const audio=document.createElement('button');audio.id=ROOT+'-narration';audio.type='button';audio.hidden=true;audio.onclick=e=>{e.stopPropagation();rootController()?.toggleNarration();};toolbar.prepend(audio);const update=()=>{const state=rootController()?.narrationState();audio.hidden=!state?.available;audio.textContent=state?.playing?'Pause narration':'Play narration';};update();const timer=setInterval(update,600);addEventListener('pagehide',()=>clearInterval(timer),{once:true});}
 }
 function layout(){if(!frame)return;const w=innerWidth,h=innerHeight,rotated=h>w;const scale=Math.min((rotated?h:w)/FRAME_W,(rotated?w:h)/FRAME_H);frame.style.width=FRAME_W+'px';frame.style.height=FRAME_H+'px';frame.style.left=(rotated?(w+FRAME_H*scale)/2:(w-FRAME_W*scale)/2)+'px';frame.style.top=(rotated?(h-FRAME_W*scale)/2:(h-FRAME_H*scale)/2)+'px';frame.style.transform=(rotated?'rotate(90deg) ':'')+`scale(${scale})`;overlay.dataset.rotated=String(rotated);overlay.dataset.scale=String(scale);try{frame.contentDocument?.documentElement.style.setProperty('--spiral-fullscreen-scale',scale);}catch{}}
 function scheduleLayout(){cancelAnimationFrame(layoutFrame);layoutFrame=requestAnimationFrame(layout);}
 function synchronize(source,target){if(!source||!target)return;const wanted=source.currentState(),current=target.currentState();if(wanted.route===current.route)return;
  if(wanted.slug===current.slug&&wanted.step===current.step+1)target.next();
  else if(wanted.slug===current.slug&&wanted.step===current.step-1)target.prev();
  else{const index=target.deck.slides.findIndex(s=>s._slug===wanted.slug);if(index>=0)target.show(index,{instant:wanted.index===current.index,keepStep:wanted.step,settled:false});}
 }
 function attachMirror(){const childDeck=frame?.contentWindow?.deck,outer=window.deck;if(!childDeck||!outer)return false;const pauseOuter=e=>{e.preventDefault();e.stopImmediatePropagation();},pauseChildForNarration=e=>{if(window.spiralNarration?.enabled){e.preventDefault();e.stopImmediatePropagation();}};outer.stage.addEventListener('scene-auto-advance',pauseOuter,true);childDeck.stage.addEventListener('scene-auto-advance',pauseChildForNarration,true);overlay.dataset.autoAdvanceOwner='landscape-frame';
  const outward=()=>synchronize(childDeck,outer),inward=()=>synchronize(outer,childDeck);outer.root.addEventListener('spiral:statechange',inward);childDeck.root.addEventListener('spiral:statechange',outward);unlisten=()=>{outer.root.removeEventListener('spiral:statechange',inward);childDeck.root.removeEventListener('spiral:statechange',outward);outer.stage.removeEventListener('scene-auto-advance',pauseOuter,true);childDeck.stage.removeEventListener('scene-auto-advance',pauseChildForNarration,true);};synchronize(outer,childDeck);overlay.dataset.loading='false';layout();return true;
 }
 async function landscapeFrame(){if(frame)return;mode='landscape';overlay=document.createElement('div');overlay.id=ROOT+'-overlay';overlay.dataset.loading='true';frame=document.createElement('iframe');frame.title='Landscape presentation';frame.allow='fullscreen';const url=new URL(location.href);for(const key of ['narration','presenterSession','presenterPreview','broadcast'])url.searchParams.delete(key);url.searchParams.set('spiralLandscape','1');url.hash=window.deck.currentState().route;frame.src=url.href;overlay.append(frame);document.body.insertBefore(overlay,toolbar);document.documentElement.classList.add(HOST);frame.addEventListener('load',()=>{let attempts=0;const ready=()=>{if(!frame)return;if(attachMirror())return;if(++attempts<600)requestAnimationFrame(ready);};ready();},{once:true});layout();reflect();}
 async function enter(){if(child){rootController()?.enter();return;}if(busy||mode!=='window')return;busy=true;try{
  const request=document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen;
  if(request){try{await request.call(document.documentElement,{navigationUI:'hide'});}catch{}}
  if(nativeActive()){mode='native';try{await screen.orientation?.lock?.('landscape');}catch{}}
  if(portrait())await landscapeFrame();else if(!nativeActive())await landscapeFrame();reflect();
 }finally{busy=false;}}
 async function exit(){if(child){rootController()?.exit();return;}if(busy)return;busy=true;try{unlisten();unlisten=()=>{};frame=null;overlay?.remove();overlay=null;document.documentElement.classList.remove(HOST);mode='window';try{screen.orientation?.unlock?.();}catch{}if(nativeActive()){try{await(document.exitFullscreen||document.webkitExitFullscreen)?.call(document);}catch{}}reflect();dispatchEvent(new Event('resize'));button?.focus({preventScroll:true});}finally{busy=false;}}
 function toggle(){if(child){rootController()?.exit();return;}return mode==='window'&&!nativeActive()?enter():exit();}
 window.spiralFullscreen={enter,exit,toggle,get mode(){return mode;},get frame(){return frame;},narrationState(){const n=window.spiralNarration;return{available:!!n,playing:!!n?.audio&&!n.audio.paused};},toggleNarration(){window.spiralNarration?.toggle?.();}};
 addEventListener('resize',scheduleLayout);addEventListener('orientationchange',scheduleLayout);
 document.addEventListener('fullscreenchange',()=>{if(!nativeActive()&&mode==='native'){mode='window';reflect();}else reflect();});
 addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||e.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;if((e.key==='Escape'&&(child||mode==='landscape'))||e.key.toLowerCase()==='f'){e.preventDefault();e.stopImmediatePropagation();if(e.key==='Escape')exit();else toggle();}},true);
 if(child)document.documentElement.classList.add('spiral-landscape-child');
 const start=()=>{if(window.deck&&window.spiralPresenter){mountControls();return;}requestAnimationFrame(start);};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
