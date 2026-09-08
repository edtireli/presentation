// Reconstruct the supplied letterforms as engraved metal relief. The original
// pixels supply glyph geometry only; color, lighting, hatch and seal are drawn.
export function addEtchedLogo(field, filename, className, {kind='ichiran'}={}) {
  const canvas=document.createElement('canvas');canvas.className=`acknowledgement-logo ${className}`;
  canvas.width=kind==='ichiran'?760:1000;canvas.height=kind==='ichiran'?760:580;
  const context=canvas.getContext('2d'),image=new Image();let disposed=false;
  image.onload=()=>{
    if(disposed)return;
    const glyphs=document.createElement('canvas');glyphs.width=canvas.width;glyphs.height=canvas.height;
    const gc=glyphs.getContext('2d',{willReadFrequently:true});
    const box=kind==='ichiran'?{x:30,y:30,w:700,h:700}:{x:65,y:12,w:870,h:556};
    gc.drawImage(image,box.x,box.y,box.w,box.h);
    const data=gc.getImageData(0,0,canvas.width,canvas.height),d=data.data,mask=new Float32Array(canvas.width*canvas.height);
    for(let i=0;i<mask.length;i++){
      const j=i*4,r=d[j],g=d[j+1],b=d[j+2],a=d[j+3]/255;
      // Green/ivory contains the original Japanese and Latin glyphs. The red
      // center/background is intentionally replaced by an engraved seal.
      const coverage=kind==='ichiran'?Math.max(Math.min(1,Math.max(0,(g-r-3)/26)),Math.min(1,Math.max(0,(Math.min(r,g,b)-150)/70))):Math.min(1,Math.max(0,(r-b-30)/65))*Math.min(1,Math.max(0,(r-75)/85));
      mask[i]=a*coverage;
    }
    context.clearRect(0,0,canvas.width,canvas.height);
    if(kind==='ichiran')drawSeal(context,canvas.width);
    else drawFacet(context,canvas.width,canvas.height);
    const relief=context.createImageData(canvas.width,canvas.height),p=relief.data,w=canvas.width,h=canvas.height;
    for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
      const i=y*w+x,v=mask[i],j=i*4;
      const dx=(mask[i+2]+mask[i+1]-mask[i-1]-mask[i-2])*.5,dy=(mask[i+2*w]+mask[i+w]-mask[i-w]-mask[i-2*w])*.5;
      // Fine crossed tool marks and deterministic speckle are confined inside
      // the actual glyphs, while edge gradients produce ivory bevels.
      const hatch=((x+y*2)%9===0?-.23:0)+((x*2-y+10000)%19===0?-.10:0);
      const grain=(Math.sin(x*12.9898+y*78.233)*43758.5453)%1*.035;
      const metal=.37+.19*Math.sin(x/w*Math.PI*2-.8)+.08*Math.cos(y/h*Math.PI*2)+.17*Math.exp(-(((x/w-y/h*.2-.34)/.07)**2));
      const light=Math.max(.04,Math.min(1,metal*.62-dx*1.3-dy*1.8+hatch*.5+grain));
      if(v>.01){p[j]=Math.round(75+175*light);p[j+1]=Math.round(48+187*light);p[j+2]=Math.round(20+187*light);p[j+3]=Math.round(v*255);}
      else if(mask[i-w-1]>.4){p[j]=3;p[j+1]=3;p[j+2]=2;p[j+3]=190;}
    }
    gc.putImageData(relief,0,0);
    context.save();context.shadowColor='#000';context.shadowBlur=10;context.shadowOffsetY=5;context.drawImage(glyphs,0,0);context.restore();
    canvas.dataset.ready='true';canvas.dataset.style='engraved-relief';glyphs.width=glyphs.height=0;
  };
  image.onerror=()=>{if(!disposed)canvas.dataset.ready='failed';};
  image.src=new URL(filename,import.meta.url).href;field.append(canvas);
  return()=>{disposed=true;image.onload=image.onerror=null;image.removeAttribute('src');canvas.width=canvas.height=0;};
}
function drawSeal(c,size){
  const m=size/2,r=size*.459;
  const fill=c.createRadialGradient(m-r*.3,m-r*.35,0,m,m,r);fill.addColorStop(0,'#242016');fill.addColorStop(.75,'#0f100d');fill.addColorStop(1,'#080908');
  c.fillStyle=fill;c.beginPath();c.arc(m,m,r,0,Math.PI*2);c.fill();
  const gold=c.createLinearGradient(0,0,size,size);gold.addColorStop(0,'#f0eadb');gold.addColorStop(.35,'#ac8a4d');gold.addColorStop(.68,'#534121');gold.addColorStop(1,'#dcc48e');
  for(const [radius,line]of[[r+8,2],[r,5],[r-9,1],[r-17,.7]]){c.strokeStyle=gold;c.lineWidth=line;c.beginPath();c.arc(m,m,radius,0,Math.PI*2);c.stroke();}
  for(let i=0;i<144;i++){const a=i*Math.PI/72;c.strokeStyle=i%6?'#c4a46b66':'#efe5cbbb';c.lineWidth=i%6?.5:1;c.beginPath();c.moveTo(m+Math.cos(a)*(r-4),m+Math.sin(a)*(r-4));c.lineTo(m+Math.cos(a)*(r-(i%6?8:13)),m+Math.sin(a)*(r-(i%6?8:13)));c.stroke();}
  c.strokeStyle='#a68c5420';c.lineWidth=.7;
  for(let k=0;k<17;k++){c.beginPath();for(let i=0;i<=240;i++){const a=i*Math.PI/120,rr=r*(.46+.014*k)+5*Math.sin(a*13+k*.36);const x=m+Math.cos(a)*rr,y=m+Math.sin(a)*rr;i?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();}
}
function drawFacet(c,w,h){
  c.save();c.translate(w/2,h/2);c.strokeStyle='#c4a46b80';c.lineWidth=1;
  for(let k=0;k<2;k++){const s=k?1:.93;c.beginPath();c.moveTo(-w*.45*s,0);c.lineTo(0,-h*.39*s);c.lineTo(w*.45*s,0);c.lineTo(0,h*.39*s);c.closePath();c.stroke();}
  c.strokeStyle='#f0eadb70';for(const sign of[-1,1]){c.beginPath();c.moveTo(sign*w*.45-7,0);c.lineTo(sign*w*.45+7,0);c.moveTo(sign*w*.45,-7);c.lineTo(sign*w*.45,7);c.stroke();}
  c.restore();
}
