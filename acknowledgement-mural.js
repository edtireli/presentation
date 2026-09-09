/**
 * Photo-derived mural jellyfish, lettering and Montana BLACK spray can.
 * Artwork/paths/pigment ordering match the corrected mural preview of 2026-09-08.
 * Transparent source-over output: black matte is removed from paint only, so the
 * can remains solid and deposited pigment actually covers acknowledgement text.
 *
 * await createMuralRenderer(canvas, { reducedMotion, signal? }) returns:
 *   durationMs, completeProgress, render(progress 0..1), dispose().
 * The caller owns the animation clock and canvas. render() fits the original
 * 960×720 scene without stretching, resizes for DPR, and supports backward seeks.
 * AbortError means initialization was cancelled or replaced on the same canvas.
 * No RAF, timers, resize listeners or DOM nodes are installed by this module.
 */
const W=960,H=720;
const rgba=(c,a)=>`rgba(${c.join(',')},${a})`;
const palette={blue:[47,132,211],gold:[246,218,132],violet:[164,82,153]};
const smooth=u=>{u=Math.max(0,Math.min(1,u));return u*u*(3-2*u)};
const lerp=(a,b,u)=>a+(b-a)*u;
const models=new WeakMap();
const owners=new WeakMap();
const abortError=()=>new DOMException('Mural renderer was cancelled or replaced','AbortError');
function awaitWithSignal(promise,signal){
 if(!signal)return promise;
 if(signal.aborted)return Promise.reject(abortError());
 return new Promise((resolve,reject)=>{
  const stop=()=>{cleanup();reject(abortError())};
  const cleanup=()=>signal.removeEventListener('abort',stop);
  signal.addEventListener('abort',stop,{once:true});
  promise.then(value=>{cleanup();resolve(value)},error=>{cleanup();reject(error)});
 });
}
function modelFor(doc){
 if(!models.has(doc)){
  const pending=buildModel(doc);
  models.set(doc,pending);
  pending.catch(()=>{if(models.get(doc)===pending)models.delete(doc)});
 }
 return models.get(doc);
}
async function buildModel(doc){
 const makeCanvas=()=>{const c=doc.createElement('canvas');c.width=W;c.height=H;return c};
const SX=.55,OX=32,OY=64;
const strokes=[];let next=.8;
function stroke(d,duration,width,layer){
 const path=doc.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',d);
 const length=path.getTotalLength(),points=[];
 for(let p=0;p<=length;p+=2.0){const v=path.getPointAtLength(p);points.push({x:OX+v.x*SX,y:OY+v.y*SX});}
 duration*=.73;
 strokes.push({points,start:next,end:next+duration,width:width*SX*(layer==='violet'?(width>100?1.45:2.05):layer==='gold'?1.5:1.32),layer,color:palette[layer],done:0});next+=duration+.07;
}
// Blue: the vaulted bell, then each sweeping arm and curl.
stroke('M453 180 C253 78 51 197 74 373 C87 491 287 512 429 509',1.10,150,'blue');
stroke('M383 221 C169 184 180 479 378 448 C437 426 367 318 241 328 C150 341 237 413 364 381',.68,150,'blue');
stroke('M605 280 C830 224 892 111 1051 172 C1114 197 1050 304 1040 392 C1027 456 1078 477 1146 487',1.05,160,'blue');
stroke('M1111 155 C1220 -4 1332 67 1310 103',.50,94,'blue');
stroke('M1104 224 C1191 431 1324 413 1353 205 C1365 124 1432 120 1478 152',.70,110,'blue');
stroke('M1171 434 C1281 306 1402 361 1416 457',.50,95,'blue');
stroke('M626 384 C815 364 884 238 1009 233',.65,80,'blue');
stroke('M630 429 C756 432 857 435 929 490',.40,85,'blue');
stroke('M635 481 C825 670 855 498 904 355 C938 267 972 244 1011 235',.72,94,'blue');
stroke('M639 548 C800 663 887 537 1009 556 C1074 559 997 657 1119 598 C1300 435 1427 525 1321 652',.88,95,'blue');
stroke('M1110 491 C1240 494 1500 479 1480 602 C1460 656 1372 626 1337 605',.60,100,'blue');
stroke('M1310 548 C1260 642 1175 766 1230 811 C1280 842 1435 738 1424 828 C1413 876 1404 912 1397 942',.72,120,'blue');
stroke('M598 90 C505 158 650 232 508 287 C504 325 631 391 511 465 L600 580',.65,260,'blue');
// Violet folds retain the source mural's uneven ruffled opening.
stroke('M613 81 C496 171 636 179 473 273 C447 306 574 328 480 416 C445 461 558 489 507 579',.64,145,'violet');
stroke('M650 174 C491 267 683 255 617 352 C574 390 698 413 620 472 C581 516 659 557 598 605',.58,165,'violet');
// Gold follows the rims and tentacle highlights in separate paint passes.
stroke('M418 190 C173 93 31 244 78 414 C124 509 337 537 437 522',.70,82,'gold');
stroke('M411 214 C249 230 419 275 397 299 C371 316 304 313 352 343 C370 360 427 360 415 393 C367 421 347 408 393 446 C431 468 426 500 454 569',.75,58,'gold');
stroke('M563 103 C520 195 479 239 484 339 C470 424 531 440 502 535',.62,110,'gold');
stroke('M627 187 C518 236 657 283 611 318 M616 366 C486 332 507 406 586 428 M567 473 C650 509 643 583 569 564',.55,100,'gold');
stroke('M673 269 C839 186 909 120 1044 176 C1108 191 1048 351 1071 451',.78,95,'gold');
stroke('M1124 145 C1204 39 1285 50 1313 93',.34,70,'gold');
stroke('M1111 247 C1179 410 1317 387 1344 258 C1361 218 1354 174 1379 151',.62,95,'gold');
stroke('M1181 444 C1316 326 1399 375 1414 454',.40,86,'gold');
stroke('M655 385 C791 365 887 258 1008 237 M638 429 L861 441',.60,72,'gold');
stroke('M651 482 C780 597 848 562 899 356 C929 283 959 256 1005 244',.55,74,'gold');
stroke('M930 436 C934 491 985 509 1040 504',.32,82,'gold');
stroke('M659 550 C823 641 890 538 1008 550 C1070 553 1009 646 1111 612 C1221 551 1237 489 1310 553',.65,87,'gold');
stroke('M1105 488 C1251 505 1461 467 1481 569 C1508 659 1414 648 1377 622',.61,88,'gold');
stroke('M1303 576 C1233 673 1177 792 1241 824 C1317 848 1441 755 1415 861',.66,107,'gold');
// Lettering is painted character by character, preserving ImageGen's faithful
// photograph-derived letterforms. Each pass reveals only pigment under its tip.
const letters=[
 ['M40 625 L128 600 M88 620 L88 731',.28,48],
 ['M116 633 L117 716 M143 634 L148 728 M117 675 L148 675',.24,38],
 ['M191 598 L168 604 L173 735 L204 730 M172 668 L201 662',.28,37],
 ['M287 607 C276 769 330 768 324 597',.25,35],
 ['M343 624 L349 735 L367 629',.20,32],
 ['M373 601 L385 738 C457 761 419 660 390 670 C460 623 400 578 373 601',.32,38],
 ['M442 684 L483 671 C430 605 415 765 493 735',.27,38],
 ['M515 651 C566 653 557 735 506 724 C475 709 538 668 545 679 M548 674 L555 733',.26,38],
 ['M575 624 L576 737 M577 628 C632 600 590 670 580 675 C625 713 635 780 665 821',.30,38],
 ['M641 635 C694 620 679 746 639 731 C593 717 657 674 675 684 M678 672 L687 740',.28,42],
 ['M696 606 L707 742 C790 772 750 674 708 677 C772 637 731 600 697 606',.32,40],
 ['M758 636 L759 751 L794 743',.22,38],
 ['M801 687 L837 681 C800 594 766 767 850 744',.26,40],
 ['M132 799 L120 921 L162 918',.23,42],
 ['M177 830 L171 920 M177 797 L177 805',.20,36],
 ['M233 792 C169 831 180 946 220 927 C244 920 240 865 220 864 L240 866',.26,40],
 ['M264 785 L251 930 M287 783 L285 930 M252 855 L291 855',.26,37],
 ['M311 849 L357 841 M334 848 L332 931',.24,40],
 ['M379 795 L379 958 M379 799 L405 943 L405 797',.28,39],
 ['M435 885 L463 879 C441 801 405 941 471 927',.22,36],
 ['M525 793 C434 791 483 851 520 874 C557 911 522 972 493 952 L495 915',.26,43],
 ['M585 799 C511 789 552 848 599 880 C640 922 601 984 577 952 L589 916',.26,43],
 ['M719 848 C676 821 676 940 716 934 C759 929 750 854 719 848',.24,37],
 ['M771 843 L769 936 M752 845 L795 841 M771 875 L791 874',.22,37],
 ['M866 785 L866 948 C960 984 932 872 870 871 C946 827 917 772 866 785',.31,63],
 ['M958 779 L957 953 L1006 951 M958 858 L1003 858 M959 776 L1003 840 L963 840',.30,60],
 ['M1036 796 L1044 958 M1004 742 L1004 749',.23,48],
 ['M1067 804 L1073 960 M1067 804 L1098 948 L1111 800',.28,54],
 ['M1147 800 C1066 736 1095 985 1153 952 L1150 882 L1180 882',.31,58]
];
for(const [d,duration,width] of letters)stroke(d,duration,width,'violet');
// The gold strike-through is the final deliberate gesture.
stroke('M254 613 L361 758',.27,60,'gold');
stroke('M340 620 L276 752',.25,57,'gold');
const complete=next,fadeStart=complete+2.0,duration=fadeStart+1.6;

 const sources={};
 const src=new doc.defaultView.Image();
 src.src=new URL('./acknowledgement-mural.png',import.meta.url).href;
 await src.decode();
 const master=makeCanvas(),mc=master.getContext('2d',{willReadFrequently:true});
 mc.drawImage(src,OX,OY,src.width*SX,src.height*SX);
 const original=mc.getImageData(0,0,W,H),delayedBlueHighlights=[];
 for(const key of ['blue','violet','gold']){
  const colorCanvas=makeCanvas(),cc=colorCanvas.getContext('2d');
  const pixels=new ImageData(new Uint8ClampedArray(original.data),W,H);
  for(let i=0;i<pixels.data.length;i+=4){
   const r=original.data[i],g=original.data[i+1],b=original.data[i+2];
   const px=((i/4)%W-OX)/SX,py=(Math.floor(i/4/W)-OY)/SX;
   const lettering=(py>765&&px<(py<870?1175:1212))||(py>620&&px<872)||(py>580&&px<418)||(py>720&&px>970&&px<1030);
   const isGold=r>b+3&&g>b+1;
   const band=lettering?((isGold&&px>225&&px<380&&py<780)?'gold':'violet'):isGold?'gold':(r>b*.67&&b>g*1.13&&r>g*1.10)?'violet':'blue';
   const undercoat=key==='blue'&&!lettering;
   if(undercoat){
    // Dark and saturated blue texture stays native. Bright pale-cyan flecks
    // are finish highlights too: give them saturated blue until the gold pass.
    const nativeBlue=g>r+6&&b>g+6;
    const paleBlue=nativeBlue&&Math.max(r,g,b)>150&&Math.min(r,g,b)/Math.max(r,g,b)>.40;
    if(paleBlue&&original.data[i+3]>0)delayedBlueHighlights.push({x:(i/4)%W,y:Math.floor(i/4/W)});
    if(!nativeBlue||paleBlue){const value=Math.max(r,g,b)/255;pixels.data[i]=Math.round(47*value);pixels.data[i+1]=Math.round(132*value);pixels.data[i+2]=Math.round(211*value);}
   }
   // The gold spray restores the original pigment under its own moving mask,
   // including pale ivory flecks and their soft transitions into nearby blue.
   // Lettering remains independent and still appears one character at a time.
   const nativeGoldFinish=key==='gold'&&!lettering;
   pixels.data[i+3]=(undercoat||nativeGoldFinish||band===key)?original.data[i+3]*Math.max(0,Math.min(1,(Math.max(r,g,b)-8)/24)):0;
  }
  cc.putImageData(pixels,0,0);
  sources[key]=colorCanvas;
 }
 // Some pale flecks lie inside a blue arm, beyond the soft rim mask. Map
 // each one to the nearest moving gold tip, so all return during gold painting
 // (never in a global end fade or during the initial blue undercoat).
 const finishingPoints=strokes.filter(s=>s.layer==='gold').slice(0,-2).flatMap(s=>s.points);
 let furthestHighlight=0;
 for(const pixel of delayedBlueHighlights){
  let point=null,distance=Infinity;
  for(const p of finishingPoints){const d=(pixel.x-p.x)**2+(pixel.y-p.y)**2;if(d<distance){distance=d;point=p;}}
  (point.finishHighlights??=[]).push(pixel);furthestHighlight=Math.max(furthestHighlight,Math.sqrt(distance));
 }
 const highlightAudit={delayedBlueHighlights:delayedBlueHighlights.length,furthestGoldTipDistance:furthestHighlight,paleThreshold:{maxAbove:150,minMaxRatioAbove:.40}};

 return {strokes,sources,complete,fadeStart,duration,highlightAudit};
}
function sprayPose(strokes,t){
 const first=strokes[0],final=strokes.at(-1);let point,color,active=false,opacity=1;
 if(t<first.start){const u=smooth(t/first.start);point={x:lerp(720,first.points[0].x,u),y:lerp(540,first.points[0].y,u)};color=first.color;opacity=smooth(t/.35);}
 else if(t>=final.end){const u=smooth((t-final.end)/.8),p=final.points.at(-1);point={x:lerp(p.x,790,u),y:lerp(p.y,475,u)};color=final.color;opacity=1-smooth((t-final.end-.15)/.6);}
 else for(let i=0;i<strokes.length;i++){const s=strokes[i];if(t>=s.start&&t<s.end){const f=Math.min(s.points.length-1,(t-s.start)/(s.end-s.start)*(s.points.length-1)),j=Math.floor(f),a=s.points[j],b=s.points[Math.min(j+1,s.points.length-1)];point={x:lerp(a.x,b.x,f-j),y:lerp(a.y,b.y,f-j)};color=s.color;active=true;break;}const n=strokes[i+1];if(n&&t>=s.end&&t<n.start){const u=smooth((t-s.end)/(n.start-s.end)),a=s.points.at(-1),b=n.points[0];point={x:lerp(a.x,b.x,u),y:lerp(a.y,b.y,u)-Math.sin(u*Math.PI)*12};color=s.color.map((v,j)=>lerp(v,n.color[j],u));break;}}
 if(!point)return null;const nozzle={x:Math.min(W-145,point.x+105),y:Math.max(32,Math.min(H-185,point.y+35-(point.y-180)*.20))};let aim=Math.atan2(point.y-nozzle.y,point.x-nozzle.x)-Math.PI;if(aim< -Math.PI)aim+=Math.PI*2;const angle=Math.max(-.45,Math.min(.45,aim));return {point,nozzle,angle,color,active,opacity};
}
function drawMontana(ctx,pose,t){
 if(!pose||pose.opacity<=0)return;
 const {point:p,nozzle:n,color,angle,active,opacity}=pose;
 ctx.save();ctx.globalAlpha=opacity;
 if(active){
  const dx=p.x-n.x,dy=p.y-n.y,length=Math.hypot(dx,dy),nx=-dy/length,ny=dx/length;
  const mist=ctx.createLinearGradient(n.x,n.y,p.x,p.y);mist.addColorStop(0,rgba(color,.19));mist.addColorStop(.42,rgba(color,.075));mist.addColorStop(1,rgba(color,.025));
  ctx.fillStyle=mist;ctx.beginPath();ctx.moveTo(n.x,n.y);ctx.quadraticCurveTo(n.x+dx*.6+nx*4,n.y+dy*.6+ny*4,p.x+nx*17,p.y+ny*17);ctx.quadraticCurveTo(p.x-dx*.06,p.y-dy*.06,p.x-nx*17,p.y-ny*17);ctx.quadraticCurveTo(n.x+dx*.6-nx*4,n.y+dy*.6-ny*4,n.x,n.y);ctx.fill();
  for(let i=0;i<74;i++){const u=(i*.618033+t*4.7)%1,spread=Math.sin(i*37.2+t*3)*(1+u*12);ctx.fillStyle=rgba(color,.18+Math.sin(u*Math.PI)*.3);ctx.beginPath();ctx.arc(n.x+dx*u+nx*spread,n.y+dy*u+ny*spread,.24+(i%4)*.17,0,Math.PI*2);ctx.fill();}
 }
 ctx.translate(n.x,n.y);ctx.rotate(angle);
 ctx.shadowColor='#000b';ctx.shadowBlur=13;ctx.shadowOffsetX=5;ctx.shadowOffsetY=7;
 // Silhouette and cylindrical shading follow the Montana BLACK 400ml can.
 const body=ctx.createLinearGradient(-16,0,43,0);body.addColorStop(0,'#08090a');body.addColorStop(.18,'#36373a');body.addColorStop(.39,'#171819');body.addColorStop(.69,'#08090b');body.addColorStop(.89,'#202124');body.addColorStop(1,'#080809');
 ctx.fillStyle=body;ctx.beginPath();ctx.roundRect(-16,33,60,126,[7,7,10,10]);ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetX=ctx.shadowOffsetY=0;
 ctx.strokeStyle='#76716a';ctx.lineWidth=.55;ctx.stroke();
 // Coloured shoulder, exposed actuator and pressed nozzle.
 const dome=ctx.createLinearGradient(-11,9,37,33);dome.addColorStop(0,rgba(color.map(c=>Math.min(255,c*1.2)),1));dome.addColorStop(.50,rgba(color,1));dome.addColorStop(1,rgba(color.map(c=>c*.51),1));
 ctx.fillStyle=dome;ctx.beginPath();ctx.moveTo(-13,34);ctx.bezierCurveTo(-10,19,-3,13,11,13);ctx.bezierCurveTo(29,13,38,23,41,34);ctx.closePath();ctx.fill();
 const steel=ctx.createLinearGradient(-17,0,45,0);steel.addColorStop(0,'#898a87');steel.addColorStop(.26,'#f1eee3');steel.addColorStop(.50,'#8a8983');steel.addColorStop(.72,'#ebe8de');steel.addColorStop(1,'#656560');
 ctx.fillStyle=steel;ctx.beginPath();ctx.ellipse(14,34,30,3.5,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#dad7ce';ctx.beginPath();ctx.ellipse(12,14,14,3,0,0,Math.PI*2);ctx.fill();
 const cap=ctx.createLinearGradient(0,0,25,0);cap.addColorStop(0,'#0c0d0e');cap.addColorStop(.35,'#44474a');cap.addColorStop(.6,'#171819');cap.addColorStop(1,'#040505');
 ctx.fillStyle=cap;ctx.beginPath();ctx.roundRect(0,-7,25,19,[3,3,1,1]);ctx.fill();ctx.strokeStyle='#9b9b95';ctx.lineWidth=.6;ctx.beginPath();ctx.ellipse(12.5,-6,11.5,2.3,0,0,Math.PI*2);ctx.stroke();
 ctx.fillStyle=rgba(color,1);ctx.beginPath();ctx.ellipse(.2,.2,2.4,3,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#19191a';ctx.beginPath();ctx.arc(-.3,.2,1.0,0,Math.PI*2);ctx.fill();
 // Recognisable vertical BLACK lettering and the small Montana wordmark.
 ctx.save();ctx.translate(8,97);ctx.rotate(-Math.PI/2);ctx.fillStyle='#e7e7e4';ctx.textAlign='center';ctx.font='900 24px Arial, sans-serif';ctx.fillText('BLACK',0,0);ctx.restore();
 ctx.save();ctx.translate(27,81);ctx.rotate(-Math.PI/2);ctx.fillStyle='#c6c7c4';ctx.textAlign='center';ctx.font='800 6.5px Arial, sans-serif';ctx.fillText('NC FORMULA',0,0);ctx.restore();
 ctx.fillStyle='#c4a360';ctx.textAlign='left';ctx.font='bold 3.6px Arial, sans-serif';ctx.fillText('MONTANA BLACK',19,110,21);ctx.font='3px Arial, sans-serif';for(let i=0;i<5;i++)ctx.fillText(['SPRAY PAINT','HIGH PRESSURE','MATTE FINISH','MADE IN GERMANY','400 ML'][i],19,116+i*3.6,21);
 ctx.save();ctx.translate(13,144);ctx.transform(1,-.12,-.13,1,0,0);ctx.textAlign='center';ctx.fillStyle='#e5e2da';ctx.font='900 italic 7px Arial, sans-serif';ctx.fillText('MONTANA',0,0);ctx.restore();ctx.font='bold 4.9px Arial, sans-serif';ctx.textAlign='center';ctx.fillText('400 ML',14,153);
 ctx.fillStyle=steel;ctx.beginPath();ctx.ellipse(14,158,29,3,0,0,Math.PI*2);ctx.fill();ctx.restore();
}

export async function createMuralRenderer(canvas,{reducedMotion=false,signal}={}){
 if(!canvas||typeof canvas.getContext!=='function')throw new TypeError('A canvas element is required');
 if(signal?.aborted)throw abortError();
 const doc=canvas.ownerDocument,view=doc.defaultView,output=canvas.getContext('2d');
 if(!output)throw new Error('A 2D canvas context is required');
 owners.get(canvas)?.dispose();
 const buffers=new Set();
 let disposed=false;
 const owner={dispose};
 owners.set(canvas,owner);
 const stop=()=>dispose();
 signal?.addEventListener('abort',stop,{once:true});
 const makeCanvas=()=>{const c=doc.createElement('canvas');c.width=W;c.height=H;buffers.add(c);return c};
 function dispose(){
  if(disposed)return;
  disposed=true;
  signal?.removeEventListener('abort',stop);
  if(owners.get(canvas)===owner){
   owners.delete(canvas);
   output.save();output.setTransform(1,0,0,1,0,0);output.clearRect(0,0,canvas.width,canvas.height);output.restore();
  }
  for(const c of buffers)c.width=c.height=0;
  buffers.clear();
 }
 let model;
 try{
  model=await awaitWithSignal(modelFor(doc),signal);
  if(disposed||owners.get(canvas)!==owner||signal?.aborted)throw abortError();
 }catch(error){dispose();throw error}
 const {complete,fadeStart,duration}=model;
 const strokes=model.strokes.map(s=>({...s,done:0}));
 const scene=makeCanvas(),ctx=scene.getContext('2d');
 const art=makeCanvas(),artCtx=art.getContext('2d');
 const layers={};
 for(const [key,source] of Object.entries(model.sources)){
  const mask=makeCanvas(),composite=makeCanvas();
  layers[key]={source,mask,mc:mask.getContext('2d'),composite,cc:composite.getContext('2d'),dirty:true};
 }
const dabs=new Map();
function deposit(p,s){
 const r=s.width*.5,key=s.width;
 if(!dabs.has(key)){const c=doc.createElement('canvas');c.width=c.height=Math.ceil(r*2+4);const d=c.getContext('2d'),m=c.width/2,g=d.createRadialGradient(m,m,0,m,m,r);g.addColorStop(0,'rgba(255,255,255,.82)');g.addColorStop(.5,'rgba(255,255,255,.66)');g.addColorStop(.8,'rgba(255,255,255,.14)');g.addColorStop(1,'rgba(255,255,255,0)');d.fillStyle=g;d.fillRect(0,0,c.width,c.height);dabs.set(key,c);buffers.add(c);}
 const c=dabs.get(key),mask=layers[s.layer].mc;layers[s.layer].dirty=true;mask.drawImage(c,p.x-c.width/2,p.y-c.height/2);
 if(p.finishHighlights){mask.fillStyle='#fff';for(const q of p.finishHighlights)mask.fillRect(q.x,q.y,1,1);}
}

 // Spray dabs are instance-owned. Cached immutable source layers survive only
 // with this document, avoiding repeated decode/pixel classification on clicks.
 let last=-1;
 function renderScene(t){
  if(t<last){for(const l of Object.values(layers)){l.mc.clearRect(0,0,W,H);l.dirty=true}strokes.forEach(s=>s.done=0)}
  last=t;
  for(const s of strokes){
   const f=Math.min(1,Math.max(0,(t-s.start)/(s.end-s.start))),count=Math.floor(f*s.points.length);
   while(s.done<count){deposit(s.points[s.done],s);s.done++}
  }
  artCtx.clearRect(0,0,W,H);artCtx.globalAlpha=1-smooth((t-fadeStart)/1.2);
  for(const l of Object.values(layers)){
   if(l.dirty){
    l.cc.clearRect(0,0,W,H);l.cc.globalCompositeOperation='source-over';l.cc.drawImage(l.source,0,0);
    l.cc.globalCompositeOperation='destination-in';l.cc.drawImage(l.mask,0,0);l.dirty=false;
   }
   artCtx.drawImage(l.composite,0,0);
  }
  ctx.clearRect(0,0,W,H);ctx.globalAlpha=1;ctx.drawImage(art,0,0);
  if(!reducedMotion)drawMontana(ctx,sprayPose(strokes,t),t);
 }
 if(reducedMotion){
  renderScene(complete);
  drawMontana(ctx,{...sprayPose(strokes,complete+.7),active:false,opacity:1},0);
 }
 function render(progress){
  if(disposed||owners.get(canvas)!==owner)return;
  const fraction=Number.isFinite(progress)?Math.max(0,Math.min(1,progress)):0;
  if(!reducedMotion)renderScene(fraction*duration);
  const rect=canvas.getBoundingClientRect();
  const width=rect.width||view?.innerWidth||W,height=rect.height||view?.innerHeight||H;
  const dpr=Math.max(1,Math.min(2,view?.devicePixelRatio||1));
  const pw=Math.max(1,Math.round(width*dpr)),ph=Math.max(1,Math.round(height*dpr));
  if(canvas.width!==pw)canvas.width=pw;
  if(canvas.height!==ph)canvas.height=ph;
  const scale=Math.min(pw/W,ph/H),x=(pw-W*scale)/2,y=(ph-H*scale)/2;
  output.save();output.setTransform(1,0,0,1,0,0);output.globalCompositeOperation='source-over';
  output.clearRect(0,0,pw,ph);
  output.globalAlpha=reducedMotion?smooth(fraction/.18)*(1-smooth((fraction-.65)/.35)):1;
  output.drawImage(scene,x,y,W*scale,H*scale);output.restore();
 }
 // makeCanvas() tracks all large buffers. Dabs also need explicit release.
 const release=()=>{for(const c of dabs.values()){c.width=c.height=0}dabs.clear();dispose()};
 owner.dispose=release;
 return Object.freeze({
  durationMs:reducedMotion?2600:duration*1000,
  completeProgress:reducedMotion ? .18 : complete/duration,
  render,
  dispose:release
 });
}
