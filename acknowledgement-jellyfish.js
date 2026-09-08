/**
 * The approved spray-painted jellyfish and Montana can, as a transparent layer.
 * The caller owns timing, the canvas element, and cleanup. This module performs
 * no DOM work at import time and installs no animation loop or event listeners.
 */
export function createJellyfishRenderer(canvas, { reducedMotion = false } = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new TypeError('A canvas element is required');
  }
  const doc = canvas.ownerDocument;
  const view = doc.defaultView;
  const output = canvas.getContext('2d');
  if (!output) throw new Error('A 2D canvas context is required');
  const W = 960, H = 720;
  const scene = doc.createElement('canvas');
  scene.width = W;
  scene.height = H;
  const ctx = scene.getContext('2d');
  const paint = doc.createElement('canvas');
  paint.width = W;
  paint.height = H;
  const ink = paint.getContext('2d');
  let disposed = false;
  let seed=4173;function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
  function gaussian(){return Math.sqrt(-2*Math.log(Math.max(.00001,rand())))*Math.cos(2*Math.PI*rand())}
  const palette={coral:[237,133,108],ivory:[248,226,182],shadow:[187,91,79]};
  const rgba=(c,a)=>`rgba(${c.join(',')},${a})`;
  // Each contour is a real spray pass, sampled in drawing order. Paint remains
  // where it lands; only the final fade lifts the whole temporary tag away.
  const strokes=[];let next=1.0;
  function stroke(d,duration,width=4,color='coral',mist=1){
   const path=doc.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',d);
   const length=path.getTotalLength(),points=[];
   for(let p=0;p<=length;p+=1.25){const v=path.getPointAtLength(p);points.push({x:v.x,y:v.y});}
   duration*=1.14;
   strokes.push({points,start:next,end:next+duration,width,color:palette[color],mist,done:0});next+=duration+.18;
  }
  // Bell: a slightly asymmetric vaulted cap and scalloped, folded rim.
  stroke('M312 280 C308 208 365 126 454 119 C545 108 619 167 644 251 C650 268 652 282 639 290 C625 303 603 289 591 299 C573 313 553 295 538 303 C516 315 500 304 482 310 C459 314 443 300 427 303 C405 308 393 296 377 299 C355 304 338 293 327 295 C318 294 314 288 312 280',1.00,6.1);
  stroke('M316 276 C349 254 380 274 408 262 C439 252 459 273 485 261 C511 251 534 271 560 260 C587 247 615 269 645 280',.35,4.5,'ivory');
  stroke('M323 277 C368 234 407 248 446 241 C484 232 509 250 548 240 C587 234 617 251 642 276',.24,2.2,'coral',.7);
  stroke('M350 248 C357 192 391 153 436 137',.22,2.3,'ivory',.7);
  stroke('M390 242 C399 194 424 146 459 129',.20,2.0,'coral',.65);
  stroke('M572 245 C563 191 526 144 488 127',.22,2.2,'ivory',.7);
  stroke('M615 260 C603 205 578 170 541 147',.18,2.1,'coral',.7);
  // Long threads keep the loose, gestural movement of a wall-painting.
  stroke('M336 297 C308 340 358 358 337 404 C305 465 333 493 310 527 C299 545 302 569 319 579',.33,2.8,'ivory');
  stroke('M361 300 C386 350 339 382 363 420 C385 456 375 485 350 517 C326 548 331 584 344 598',.34,3.5);
  stroke('M387 304 C370 356 424 354 404 397 C384 441 406 463 391 511 C379 549 397 578 380 614',.36,4.4);
  // Ruffled oral arms: paired contours, not solid shapes covering the text.
  stroke('M431 310 C405 332 449 344 426 363 C409 379 451 394 430 417 C413 437 450 450 430 477 C413 499 449 512 431 541 C423 557 437 571 447 577',.35,5.0,'ivory');
  stroke('M451 313 C432 336 469 346 449 369 C436 387 472 398 452 422 C435 442 472 459 452 480 C435 502 470 520 451 542 C441 557 451 571 447 577',.27,3.5,'coral');
  stroke('M493 314 C524 342 479 363 505 388 C530 411 486 434 508 460 C531 487 491 506 512 537 C525 557 510 577 504 590',.34,5.0);
  stroke('M512 312 C540 338 504 360 527 385 C549 411 509 430 529 458 C550 486 516 509 531 534 C541 557 520 580 504 590',.27,2.7,'ivory');
  stroke('M551 308 C587 350 545 380 570 423 C599 473 554 504 579 542 C598 566 582 595 564 610',.36,3.2,'ivory');
  stroke('M590 302 C610 337 575 371 604 407 C629 439 603 475 622 507 C638 531 623 555 608 560',.34,3.7);
  stroke('M621 297 C658 334 618 352 642 389 C675 437 649 463 667 493',.27,2.4,'ivory');
  // A short final highlight and two small drips finish the spray pass.
  stroke('M366 200 C387 165 419 142 458 139',.18,3.2,'ivory');
  const complete=next,fadeStart=complete+1.05,duration=fadeStart+1.10;
  const dabs=new Map();
  function makeDab(width,color,mist){
   const key=[width,color,mist].join(':');if(dabs.has(key))return dabs.get(key);
   const r=width*3.5,s=doc.createElement('canvas');s.width=s.height=Math.ceil(r*2+2);const c=s.getContext('2d'),mid=s.width/2;
   const g=c.createRadialGradient(mid,mid,0,mid,mid,r);g.addColorStop(0,rgba(color,.40));g.addColorStop(.09,rgba(color,.34));g.addColorStop(.19,rgba(color,.19));g.addColorStop(.32,rgba(color,.018*mist));g.addColorStop(.60,rgba(color,.003*mist));g.addColorStop(1,rgba(color,0));c.fillStyle=g;c.fillRect(0,0,s.width,s.height);dabs.set(key,s);return s;
  }
  function deposit(point,s,index){
   const jitter=Math.sin(index*.83)*.45;
   const dab=makeDab(s.width,s.color,s.mist);ink.drawImage(dab,point.x-dab.width/2+jitter,point.y-dab.height/2);
   ink.fillStyle=rgba(s.color,.50);
   for(let n=0;n<5;n++){const x=point.x+gaussian()*s.width*.32,y=point.y+gaussian()*s.width*.32;ink.beginPath();ink.arc(x,y,.30+rand()*.42,0,Math.PI*2);ink.fill()}
   ink.fillStyle=rgba(s.color,.12);
   for(let n=0;n<8;n++){const dx=gaussian()*s.width*1.7,dy=gaussian()*s.width*1.7,r=.18+rand()*.6;ink.beginPath();ink.arc(point.x+dx,point.y+dy,r,0,Math.PI*2);ink.fill()}
   if(index%6===0){ink.fillStyle=rgba(s.color,.19);const x=point.x+gaussian()*s.width*3,y=point.y+gaussian()*s.width*3;ink.beginPath();ink.arc(x,y,.55+rand()*.8,0,Math.PI*2);ink.fill()}
  }
  seed=7917;let last=-1;
  const smooth=u=>{u=Math.max(0,Math.min(1,u));return u*u*(3-2*u)};
  const lerp=(a,b,u)=>a+(b-a)*u;
  function sprayPose(t){
   const first=strokes[0],final=strokes.at(-1);let point,color,active=false,opacity=1;
   if(t<first.start){const u=smooth((t-.15)/(first.start-.15));point={x:lerp(690,first.points[0].x,u),y:lerp(510,first.points[0].y,u)};color=first.color;opacity=smooth(t/.35);}
   else if(t>=final.end){const u=smooth((t-final.end)/.65),p=final.points.at(-1);point={x:lerp(p.x,815,u),y:lerp(p.y,530,u)};color=final.color;opacity=1-smooth((t-final.end-.12)/.58);}
   else{
    for(let i=0;i<strokes.length;i++){
     const s=strokes[i];if(t>=s.start&&t<s.end){const f=Math.min(s.points.length-1,(t-s.start)/(s.end-s.start)*(s.points.length-1)),j=Math.floor(f),a=s.points[j],b=s.points[Math.min(j+1,s.points.length-1)];point={x:lerp(a.x,b.x,f-j),y:lerp(a.y,b.y,f-j)};color=s.color;active=true;break;}
     const upcoming=strokes[i+1];if(upcoming&&t>=s.end&&t<upcoming.start){const u=smooth((t-s.end)/(upcoming.start-s.end)),a=s.points.at(-1),b=upcoming.points[0];point={x:lerp(a.x,b.x,u),y:lerp(a.y,b.y,u)-Math.sin(u*Math.PI)*14};color=s.color.map((c,j)=>lerp(c,upcoming.color[j],u));break;}
    }
   }
   if(!point)return null;
   const offsetY=Math.max(-55,Math.min(35,35-(point.y-180)*.20));
   const nozzle={x:point.x+105,y:point.y+offsetY};
   let angle=Math.atan2(point.y-nozzle.y,point.x-nozzle.x)-Math.PI;if(angle< -Math.PI)angle+=Math.PI*2;
   return {point,nozzle,angle,color,active,opacity};
  }
  function drawMontana(pose,t){
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
  function renderScene(t){
   if(t<last){ink.clearRect(0,0,W,H);strokes.forEach(s=>s.done=0);seed=7917;}last=t;
   for(const s of strokes){const frac=Math.min(1,Math.max(0,(t-s.start)/(s.end-s.start))),count=Math.floor(frac*s.points.length);while(s.done<count){deposit(s.points[s.done],s,s.done);s.done++}}
   ctx.clearRect(0,0,W,H);
   const fade=Math.min(1,Math.max(0,(t-fadeStart)/.75));ctx.globalAlpha=1-fade;ctx.drawImage(paint,0,0);
   // A few restrained, gravity-led trails remain paint, not moving tentacles.
   const drips=[{x:326,y:295,t:strokes[0].end,len:26,c:palette.coral},{x:588,y:300,t:strokes[0].end+.1,len:20,c:palette.coral},{x:436,y:577,t:strokes[10].end,len:16,c:palette.ivory}];
   for(const d of drips){const v=Math.min(1,Math.max(0,(t-d.t)/2));if(v){ctx.strokeStyle=rgba(d.c,.63);ctx.lineWidth=1.4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(d.x,d.y);ctx.lineTo(d.x+.6,d.y+d.len*v);ctx.stroke();ctx.fillStyle=rgba(d.c,.75);ctx.beginPath();ctx.arc(d.x+.6,d.y+d.len*v,1.5,0,Math.PI*2);ctx.fill()}}
   const active=strokes.find(s=>t>=s.start&&t<s.end);
   if(active&&active.done){const p=active.points[Math.min(active.points.length-1,active.done)];const glow=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,23);glow.addColorStop(0,rgba(active.color,.22));glow.addColorStop(1,rgba(active.color,0));ctx.fillStyle=glow;ctx.fillRect(p.x-24,p.y-24,48,48);ctx.fillStyle=rgba(active.color,.45);for(let n=0;n<28;n++){const a=n*2.4+t*9,r=8+((n*13+t*87)%24);ctx.beginPath();ctx.arc(p.x+Math.cos(a)*r,p.y+Math.sin(a)*r*.55,.3+(n%3)*.22,0,Math.PI*2);ctx.fill()}}
   ctx.globalAlpha=1;if(!reducedMotion)drawMontana(sprayPose(t),t);
  }

  // Reduced motion uses one finished composition. Only the whole layer's
  // opacity changes; the can, deposited paint, and drips remain stationary.
  if (reducedMotion) {
    renderScene(complete);
    drawMontana({ ...sprayPose(6.4), active: false, opacity: 1 }, 0);
  }

  function render(progress) {
    if (disposed) return;
    const fraction = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    if (!reducedMotion) renderScene(fraction * duration);
    const rect = canvas.getBoundingClientRect();
    const cssWidth = rect.width || view?.innerWidth || W;
    const cssHeight = rect.height || view?.innerHeight || H;
    const dpr = Math.max(1, Math.min(2, view?.devicePixelRatio || 1));
    const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
    const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const scale = Math.min(pixelWidth / W, pixelHeight / H);
    const x = (pixelWidth - W * scale) / 2;
    const y = (pixelHeight - H * scale) / 2;
    output.save();
    output.setTransform(1, 0, 0, 1, 0, 0);
    output.globalCompositeOperation = 'source-over';
    output.clearRect(0, 0, pixelWidth, pixelHeight);
    output.globalAlpha = reducedMotion
      ? smooth(fraction / .18) * (1 - smooth((fraction - .60) / .40))
      : 1;
    output.drawImage(scene, x, y, W * scale, H * scale);
    output.restore();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    output.save();
    output.setTransform(1, 0, 0, 1, 0, 0);
    output.clearRect(0, 0, canvas.width, canvas.height);
    output.restore();
    paint.width = paint.height = 0;
    scene.width = scene.height = 0;
    for (const dab of dabs.values()) dab.width = dab.height = 0;
    dabs.clear();
    for (const stroke of strokes) stroke.points.length = 0;
    strokes.length = 0;
  }

  return { durationMs: reducedMotion ? 1500 : duration * 1000, render, dispose };
}
