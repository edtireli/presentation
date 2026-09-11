/* Schematic 3D thumb and transmissive clip sensor. All surfaces, light paths and
 * the display share one world-space camera. The model is procedural anatomy,
 * not a participant scan or a replica of the study's MRI-compatible sensor. */
const TAU=Math.PI*2;
const power=(x,e)=>Math.sign(x)*Math.abs(x)**e;
const fract=x=>x-Math.floor(x);
const noise=i=>fract(Math.sin(i*127.1+31.7)*43758.5453);
const geometry={faces:[],points:[]};
function surface(point,nu,nv,color,alpha,dots=true){
  const grid=Array.from({length:nv+1},(_,v)=>Array.from({length:nu+1},(_,u)=>point(u/nu,v/nv)));
  for(let v=0;v<nv;v++)for(let u=0;u<nu;u++){
    geometry.faces.push({points:[grid[v][u],grid[v][u+1],grid[v+1][u+1],grid[v+1][u]],color,alpha});
    if(dots){const j=geometry.points.length;geometry.points.push({p:point((u+.2+.6*noise(j))/nu,(v+.2+.6*noise(j+9))/nv),color,alpha:.4+.5*noise(j+17),r:.5+noise(j+8)*1.2});}
  }
}
// Broad thumb pad with a gentle bend and a proximal joint, tapering to a rounded tip.
surface((u,v)=>{
  const y=-1.35+3.05*v,rad=y<-.82?Math.sqrt(Math.max(0,1-((y+.82)/.53)**2)):1,angle=u*TAU;
  const joint=1-.08*Math.exp(-(((y-.42)/.12)**2)),bend=.07*Math.sin((y+.5)*1.5);
  const broadening=1+.30*Math.max(0,(y-.75)/.95);
  return [bend+.40*rad*joint*broadening*Math.cos(angle),y,.03+.32*rad*joint*broadening*Math.sin(angle)];
},38,44,'skin',.10);
// Flat proximal cut, like a cropped anatomy model, rather than a separate bulb at the base.
surface((u,v)=>{
  const angle=u*TAU;return [-.01+.52*v*Math.cos(angle),1.70,.03+.416*v*Math.sin(angle)];
},26,7,'skin',.08);
// Curved nail plate sits on the dorsal surface, beneath the upper sensor jaw.
surface((u,v)=>{
  const x=(u-.5)*.48,y=-1.09+v*.68;
  return [x,y,.22+.055*Math.sin(v*Math.PI)-.06*(x/.24)**2];
},14,16,'nail',.32);
function shell(center,size){
  surface((u,v)=>{
    const lat=(v-.5)*Math.PI,lon=u*TAU,cp=power(Math.cos(lat),.33);
    return [center[0]+size[0]*cp*power(Math.cos(lon),.28),center[1]+size[1]*cp*power(Math.sin(lon),.28),center[2]+size[2]*power(Math.sin(lat),.33)];
  },36,18,'shell',.48);
}
shell([0,-.62,.48],[.56,.79,.14]);
shell([0,-.62,-.43],[.56,.79,.13]);
// Hinge axle across the closed, distal end. Both jaws enclose the thumb pad.
surface((u,v)=>[1.10*(v-.5),-1.30+.11*Math.cos(u*TAU),.015+.12*Math.sin(u*TAU)],22,6,'hinge',.8);
for(const side of [-1,1])surface((u,v)=>[side*.50,-1.26+.15*Math.cos(u*TAU),.02+.45*(v-.5)*2],12,6,'hinge',.42);

export const pulseOximeterGeometry=geometry;
export function drawPulseOximeter(g,box,t,k=1,alpha=1){
  const yaw=.42+.35*Math.sin(t*.22),tilt=-.34+.07*Math.sin(t*.15),roll=-.24;
  const cy=Math.cos(yaw),sy=Math.sin(yaw),ct=Math.cos(tilt),st=Math.sin(tilt),cr=Math.cos(roll),sr=Math.sin(roll);
  const scale=Math.min(box.w/1.95,box.h/3.7);
  const project=p=>{
    const x=p[0]*cy+p[2]*sy,z=-p[0]*sy+p[2]*cy,y=p[1]*ct-z*st,d=p[1]*st+z*ct;
    return {x:box.x+box.w*.5+(x*cr-y*sr)*scale,y:box.y+box.h*.47+(x*sr+y*cr)*scale,d};
  };
  const colors={skin:'#D49A7F',nail:'#EBC8B5',shell:'#90ADB4',hinge:'#C8D5D8'};
  const items=geometry.faces.map(f=>{const ps=f.points.map(project);return {type:'face',ps,color:colors[f.color],alpha:f.alpha,d:ps.reduce((s,p)=>s+p.d/4,0)};});
  for(const p of geometry.points){const projected=project(p.p);items.push({type:'point',p:projected,color:colors[p.color],alpha:p.alpha,r:p.r*(p.color==='skin'?1:.65),d:projected.d});}
  // The screen and its text are attached to the upper jaw in the same 3D coordinates.
  const screen=[[-.39,-1.12,.625],[.39,-1.12,.625],[.39,-.24,.625],[-.39,-.24,.625]].map(project);
  items.push({type:'screen',ps:screen,d:screen.reduce((s,p)=>s+p.d/4,0)});
  for(let i=0;i<14;i++){
    const u=(t*1.1+i/14)%1,world=[.06,-.57,.32-u*.62],p=project(world);
    items.push({type:'light',p,color:i%2?'#F7A582':'#ED4C42',r:1.4,d:p.d,alpha:.9});
  }
  items.sort((a,b)=>a.d-b.d);
  g.save();
  for(const item of items){
    if(item.type==='face'){
      g.globalAlpha=alpha*item.alpha;g.fillStyle=item.color;g.beginPath();item.ps.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.closePath();g.fill();
      g.globalAlpha=alpha*.16;g.strokeStyle=item.color;g.lineWidth=.35*k;g.stroke();
    }else if(item.type==='screen'){
      const [p0,p1,,p3]=item.ps;g.save();g.globalAlpha=alpha*.96;g.fillStyle='#07171B';g.beginPath();item.ps.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.closePath();g.fill();
      // Orthographic projection makes this world-plane affine transform exact.
      g.transform((p1.x-p0.x)/100,(p1.y-p0.y)/100,(p3.x-p0.x)/112,(p3.y-p0.y)/112,p0.x,p0.y);
      g.fillStyle='#B9E1C5';g.font='600 23px ui-monospace,monospace';g.textAlign='center';g.textBaseline='middle';g.fillText('SpO₂',50,29);
      g.strokeStyle='#B9E1C5';g.lineWidth=2;g.beginPath();
      for(let i=0;i<85;i++){const u=((i/85+t*.60)%1),wave=Math.exp(-(((u-.32)/.055)**2))-.24*Math.exp(-(((u-.45)/.09)**2)),x=8+i,y=81-wave*25;i?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();g.restore();
    }else{
      g.globalAlpha=alpha*item.alpha;g.fillStyle=item.color;g.beginPath();g.arc(item.p.x,item.p.y,item.r*k,0,TAU);g.fill();
    }
  }
  g.restore();
  return {project,bounds:box,screen};
}
