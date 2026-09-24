// The layout, similarity links and group membership are computed offline.
// This renderer keeps every paper on the GPU; picking uses a spatial index.
import {resolveEvidenceSelection} from './evidence-states.js';
import {mountEvidenceCallout} from './evidence-callout.js';
const NS='http://www.w3.org/2000/svg';
// Equal paper markers: citation counts and historical seed status do not set size.
const PAPER_RADIUS=1.6;
const COLOR_CACHE=new Map();
const rgb=hex=>{const key=hex||'#aeb4c0';if(!COLOR_CACHE.has(key)){const h=key.replace('#','');COLOR_CACHE.set(key,[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255));}return COLOR_CACHE.get(key);};
const make=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls;if(text!=null)e.textContent=text;return e;};
function shader(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
function program(gl,vertex,fragment){const p=gl.createProgram();gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,vertex));gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,fragment));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;}

export function mountEvidenceGraph(map,svg,data,holder){
  const nodes=data.nodes,edges=data.edges,byId=new Map(nodes.map((n,i)=>[n.id,i]));
  const canvas=make('canvas','evidence-interactive-canvas');map.prepend(canvas);
  canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${nodes.length.toLocaleString()} interactive network records. Hover or select a paper; drag to pan; scroll to zoom. Use Find a paper to search by title or identifier.`);
  const gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true,powerPreference:'low-power'});
  if(!gl)throw Error('WebGL is required for the full interactive literature map.');
  const vertex=`attribute vec4 aPoint; attribute vec4 aFrom; attribute vec4 aTo;
    uniform vec2 uResolution; uniform vec3 uView; uniform float uMix; uniform float uPixelRatio;
    varying vec4 vColor; varying float vShape;
    void main(){vec2 p=aPoint.xy*uView.x+uView.yz;gl_Position=vec4(p/uResolution*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
    gl_PointSize=max(1.25*uPixelRatio,2.*aPoint.z*uView.x);vColor=mix(aFrom,aTo,uMix);vShape=aPoint.w;}`;
  const points=program(gl,vertex,`precision mediump float; varying vec4 vColor; varying float vShape;
    void main(){vec2 p=gl_PointCoord*2.-1.;float d=length(p);
    if(vShape>.5&&vShape<1.5)d=max(abs(p.x)*.866+p.y*.5,-p.y);
    else if(vShape<2.5&&vShape>1.5)d=abs(p.x)+abs(p.y);
    else if(vShape<3.5&&vShape>2.5)d=max(abs(p.x),abs(p.y));
    else if(vShape<4.5&&vShape>3.5)d=max(abs(p.y),abs(p.x)*.866+abs(p.y)*.5);
    else if(vShape<5.5&&vShape>4.5)d=(abs(p.x)+abs(p.y))*(1.+.30*sin(atan(p.y,p.x)*4.));
    if(d>1.)discard;float a=1.-smoothstep(.80,1.,d);
    if(vShape>5.5)a*=smoothstep(.48,.68,d);
    gl_FragColor=vec4(vColor.rgb,vColor.a*a);}`);
  const lines=program(gl,vertex,`precision mediump float;varying vec4 vColor;void main(){gl_FragColor=vColor;}`);
  const pointArray=new Float32Array(nodes.length*4),from=new Float32Array(nodes.length*4),to=new Float32Array(nodes.length*4);
  const shape={human:0,mouse:1,rat:2,pig:3,primate:4,mixed:5,review:0,methods:6,in_vitro:6,postmortem:6,unknown:6,other_animal:4};
  const grid=new Map(),neighbors=Array.from({length:nodes.length},()=>[]),cell=16;
  nodes.forEach((n,i)=>{pointArray.set([n.x,n.y,PAPER_RADIUS,shape[n.evidence]??0],i*4);const key=`${Math.floor(n.x/cell)},${Math.floor(n.y/cell)}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(i);});
  const edgePoints=new Float32Array(edges.length*8),edgeFrom=new Float32Array(edges.length*8),edgeTo=new Float32Array(edges.length*8);
  edges.forEach((e,i)=>{if(!nodes[e.source]||!nodes[e.target])return;edgePoints.set([nodes[e.source].x,nodes[e.source].y,1,0,nodes[e.target].x,nodes[e.target].y,1,0],i*8);neighbors[e.source].push([e.target,i]);neighbors[e.target].push([e.source,i]);});
  const buffer=array=>{const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,array,gl.DYNAMIC_DRAW);return b;};
  const pointBuffers=[buffer(pointArray),buffer(from),buffer(to)],edgeBuffers=[buffer(edgePoints),buffer(edgeFrom),buffer(edgeTo)];
  const write=(b,array)=>{gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferSubData(gl.ARRAY_BUFFER,0,array);};
  const overlay=document.createElementNS(NS,'g');overlay.classList.add('evidence-interactive-overlays');while(svg.firstChild)overlay.append(svg.firstChild);svg.append(overlay);
  const paperLabels=document.createElementNS(NS,'g');paperLabels.classList.add('evidence-selected-paper-labels');overlay.append(paperLabels);
  const counter=make('div','evidence-selection-count');counter.setAttribute('role','status');counter.setAttribute('aria-live','polite');holder.append(counter);
  const toolbar=make('div','evidence-explore-tools'),find=make('button','','Find a paper'),reset=make('button','','Reset view');
  find.type=reset.type='button';toolbar.append(find,reset);holder.append(toolbar);
  const panel=make('section','evidence-paper-panel');panel.hidden=true;panel.setAttribute('aria-label','Explore literature papers');holder.append(panel);
  const tip=make('div','evidence-paper-tip');tip.hidden=true;holder.append(tip);
  const callout=mountEvidenceCallout(map);
  for(const e of [toolbar,panel]){e.addEventListener('click',ev=>ev.stopPropagation());e.addEventListener('keydown',ev=>{if(ev.key==='Escape'){panel.hidden=true;selected=-1;selectedCluster=null;focusTheme=null;paint(tourState,{...tourNav,settled:true});ev.stopPropagation();}else if(ev.target.matches?.('input,textarea,select')||ev.key==='Enter'||ev.key===' ')ev.stopPropagation();});}
  const details=new Map();let selected=-1,selectedCluster=null,hovered=-1,zoom=1,panX=0,panY=0,frame=0,started=0,lastState={},tourState={},tourNav={},lastFocus=[],hiddenIds=new Set(),focusTheme=null,disposed=false;
  let view={scale:1,x:0,y:0,width:1,height:1,ratio:1};
  const transform=()=>{const w=map.clientWidth,h=map.clientHeight,r=Math.min(devicePixelRatio||1,2),s=Math.min(w/1600,h/820);
    view={scale:s*zoom,x:(w-1600*s*zoom)/2+panX,y:(h-820*s*zoom)/2+panY,width:w,height:h,ratio:r};
    if(canvas.width!==Math.round(w*r)||canvas.height!==Math.round(h*r)){canvas.width=Math.round(w*r);canvas.height=Math.round(h*r);}
    overlay.setAttribute('transform',`translate(${800*(1-zoom)+panX/s} ${410*(1-zoom)+panY/s}) scale(${zoom})`);
    const fieldLabels=overlay.querySelector('.evidence-theme-labels');if(fieldLabels)fieldLabels.style.visibility=zoom>2||lastState.studiesOnly?'hidden':'';
    const node=nodes[byId.get(lastState.paperCallout?.node)];
    if(node)callout.position(node.x*view.scale+view.x,node.y*view.scale+view.y);
  };
  function draw(now){frame=0;if(disposed||!holder.isConnected)return;transform();const u=Math.min(1,(now-started)/430);gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    const pass=(p,buffers,count,mode)=>{gl.useProgram(p);['aPoint','aFrom','aTo'].forEach((name,i)=>{const a=gl.getAttribLocation(p,name);if(a<0)return;gl.bindBuffer(gl.ARRAY_BUFFER,buffers[i]);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,4,gl.FLOAT,false,0,0);});
      gl.uniform2f(gl.getUniformLocation(p,'uResolution'),canvas.width,canvas.height);gl.uniform3f(gl.getUniformLocation(p,'uView'),view.scale*view.ratio,view.x*view.ratio,view.y*view.ratio);gl.uniform1f(gl.getUniformLocation(p,'uMix'),u);gl.uniform1f(gl.getUniformLocation(p,'uPixelRatio'),view.ratio);gl.drawArrays(mode,0,count);};
    pass(lines,edgeBuffers,edges.length*2,gl.LINES);pass(points,pointBuffers,nodes.length,gl.POINTS);
    holder.dataset.graphFrameMs=(performance.now()-now).toFixed(2);if(u<1)frame=requestAnimationFrame(draw);
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(draw);}
  function labelSelectedPapers(state,colors,relatedColors=new Map()){
    map.querySelector('.evidence-selected-paper-mobile')?.remove();
    paperLabels.replaceChildren();if(!state.labelCohortPapers||selected>=0||selectedCluster!=null||focusTheme)return;
    const explicit=state.labelPaperIds?new Set(state.labelPaperIds):null;
    const labelColors=new Map([...relatedColors,...colors]);
    if(explicit)for(const id of labelColors.keys())if(!explicit.has(id))labelColors.delete(id);
    if(labelColors.size>18)return;
    const dense=labelColors.size>12,scale=Math.min(map.clientWidth/1600,map.clientHeight/820)||1;
    const narrow=dense&&map.clientWidth<650;
    // The graph keeps its coordinates and camera. Portrait viewports have spare
    // vertical space around its letterboxed field; labels can use that space.
    paperLabels.dataset.layout=dense?'dense':'regular';
    paperLabels.dataset.portrait=String(narrow);
    paperLabels.style.visibility='';
    const occupied=[...overlay.querySelectorAll('.evidence-theme-labels text,.evidence-satellite-state.active .evidence-satellite-label')].map(e=>{const b=e.getBBox();return{x:b.x-8,y:b.y-6,w:b.width+16,h:b.height+12};});
    const intersects=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
    const members=[...labelColors.keys()].map(id=>nodes[byId.get(id)]).filter(n=>n&&!hiddenIds.has(n.id)).sort((a,b)=>a.y-b.y||a.x-b.x);
    // Keep dense captions compact without truncating the measurement being named.
    const wrap=value=>{
      if(!dense)return[value];
      const lines=[''];for(const word of value.split(/\s+/)){
        const last=lines.length-1,next=lines[last]?lines[last]+' '+word:word;
        if(next.length>(narrow?26:34)&&lines[last])lines.push(word);else lines[last]=next;
      }
      return lines;
    };
    if(narrow){
      // An isolated HTML layer keeps portrait labels sharp without changing
      // the SVG field's coordinates or letting its paint obscure the slide copy.
      const layer=make('div','evidence-selected-paper-mobile');Object.assign(layer.style,{position:'absolute',inset:'0',pointerEvents:'none',contain:'layout paint',isolation:'isolate'});map.append(layer);
      const width=map.clientWidth,height=map.clientHeight,originY=(height-820*scale)/2,labelWidth=(width-28)/2;
      const taken=occupied.map(b=>({x:b.x*scale,y:originY+b.y*scale,w:b.w*scale,h:b.h*scale}));
      for(const n of members){
        const label=make('button','evidence-selected-paper-mobile-label');label.type='button';label.dataset.paper=n.id;
        Object.assign(label.style,{position:'absolute',left:'0',top:'0',width:labelWidth+'px',padding:'0',border:'0',background:'none',textAlign:'left',
          font:'500 11px var(--mono)',lineHeight:'1.2',color:labelColors.get(n.id)||'#f0c27b',pointerEvents:'auto',cursor:'pointer',textShadow:'0 1px 2px #000, 0 0 3px #000'});
        label.append(make('span','',n.displayLabel||n.label||n.id));
        const method=n.measurementLabel||(n.studyStatus==='protocol'?'Protocol · planned measurements':'');
        for(const [value,size,color] of [[method,9.5,'#c5cbd0'],[state.paperLabelNotes?.[n.id],8.5,'#a6bac3']])if(value)for(const line of wrap(value)){
          const caption=make('span','',line);Object.assign(caption.style,{display:'block',fontSize:size+'px',fontWeight:'400',lineHeight:'1.25',color});label.append(caption);
        }
        layer.append(label);const h=label.getBoundingClientRect().height+3,w=labelWidth,x=n.x*scale,y=originY+n.y*scale,candidates=[];
        for(const dy of [-h-8,10,-2*h-16,h+18,-3*h-24,2*h+26])for(const side of [1,-1])candidates.push({x:Math.max(8,Math.min(width-w-8,x+(side>0?10:-w-10))),y:Math.max(50,Math.min(height-h-12,y+dy)),w,h});
        let box=candidates.find(b=>!taken.some(o=>intersects(b,o)));
        if(!box){const alternatives=[];for(let yy=50;yy<=height-h-12;yy+=8)for(let xx=8;xx<=width-w-8;xx+=8){const b={x:xx,y:yy,w,h};if(!taken.some(o=>intersects(b,o)))alternatives.push(b);}const distance=b=>Math.hypot(x-Math.max(b.x,Math.min(x,b.x+b.w)),y-Math.max(b.y,Math.min(y,b.y+b.h)));alternatives.sort((a,b)=>distance(a)-distance(b));box=alternatives[0]||candidates[0];}
        taken.push({x:box.x-3,y:box.y-2,w:box.w+6,h:box.h+4});label.style.left=box.x+'px';label.style.top=box.y+'px';
        const endX=Math.max(box.x,Math.min(x,box.x+w)),endY=Math.max(box.y,Math.min(y,box.y+h)),leader=make('span','evidence-paper-mobile-leader');
        Object.assign(leader.style,{position:'absolute',left:x+'px',top:y+'px',width:Math.hypot(endX-x,endY-y)+'px',borderTop:'.5px solid #c5cbd0',opacity:'.5',transformOrigin:'0 0',transform:`rotate(${Math.atan2(endY-y,endX-x)}rad)`});layer.prepend(leader);
        label.onclick=e=>{e.stopPropagation();showPaper(byId.get(n.id));};
      }
      return;
    }
    for(const n of members){
      const related=relatedColors.has(n.id)&&!colors.has(n.id);
      const group=document.createElementNS(NS,'g'),text=document.createElementNS(NS,'text');group.dataset.paper=n.id;group.dataset.related=String(related);text.setAttribute('class','evidence-selected-paper-label');
      if(dense)text.style.fontSize='19px';
      const title=document.createElementNS(NS,'tspan');title.textContent=n.displayLabel||n.label||n.id;title.setAttribute('x','0');text.append(title);
      const addLines=(value,className,dy,size)=>{if(!value)return;for(const line of wrap(value)){const span=document.createElementNS(NS,'tspan');span.textContent=line;span.setAttribute('class',className);span.setAttribute('dy',String(dy));span.setAttribute('x','0');if(dense)span.style.fontSize=size+'px';text.append(span);}};
      const methodText=n.measurementLabel||(n.studyStatus==='protocol'?'Protocol · planned measurements':''),qualification=state.paperLabelNotes?.[n.id];
      addLines(methodText,'evidence-selected-paper-method',dense?18:20,15);
      addLines(qualification,'evidence-selected-paper-qualification',dense?16:18,13);
      group.append(text);paperLabels.append(group);
      const bounds=text.getBBox(),w=Math.max(bounds.width,120),h=dense?Math.ceil(bounds.height)+4:qualification?60:methodText?42:24,candidates=[];
      for(const dy of [-48,18,-88,58,-128,98])for(const side of [n.x>1130?-1:1,n.x>1130?1:-1])candidates.push({x:Math.max(12,Math.min(1588-w,n.x+(side>0?15:-w-15))),y:Math.max(12,Math.min(794-h,n.y+dy)),w,h});
      let box=candidates.find(b=>!occupied.some(o=>intersects(b,o)));
      if(!box){const alternatives=[];for(let y=12;y<=794-h;y+=dense?16:28)for(let x=12;x<=1588-w;x+=dense?24:36){const candidate={x,y,w,h};if(!occupied.some(o=>intersects(candidate,o)))alternatives.push(candidate);}const distance=b=>Math.hypot(n.x-Math.max(b.x,Math.min(n.x,b.x+b.w)),n.y-Math.max(b.y,Math.min(n.y,b.y+b.h)));alternatives.sort((a,b)=>distance(a)-distance(b));box=alternatives[0]||candidates[0];}
      occupied.push({x:box.x-12,y:box.y-5,w:box.w+24,h:box.h+12});text.querySelectorAll('tspan').forEach(span=>span.setAttribute('x',box.x));text.setAttribute('y',box.y+(dense?-bounds.y+2:18));text.style.fill=labelColors.get(n.id)||'#f0c27b';
      const link=document.createElementNS(NS,'line');link.setAttribute('x1',n.x);link.setAttribute('y1',n.y);link.setAttribute('x2',Math.max(box.x,Math.min(n.x,box.x+box.w)));link.setAttribute('y2',box.y>n.y?box.y:box.y+box.h);link.setAttribute('class','evidence-paper-label-leader');group.prepend(link);
      if(state.referenceReveal){const halo=document.createElementNS(NS,'circle');halo.setAttribute('cx',n.x);halo.setAttribute('cy',n.y);halo.setAttribute('r','8');halo.setAttribute('class','evidence-reference-halo');halo.style.color=labelColors.get(n.id)||'#f2bd76';if(tourNav?.settled||tourNav?.backward)halo.style.animation='none';group.prepend(halo);}
      text.style.pointerEvents='auto';text.addEventListener('click',e=>{e.stopPropagation();showPaper(byId.get(n.id));});
    }
  }
  function paint(state={},nav={}){
    const paintStart=performance.now();
    lastState=state;lastFocus=Array.isArray(nav.activeThemes)?nav.activeThemes:lastFocus;
    callout.paint(selected<0&&selectedCluster==null&&!focusTheme?state.paperCallout:null,nav);
    const studiesOnly=Boolean(state.studiesOnly&&selected<0&&selectedCluster==null&&!focusTheme);
    hiddenIds=new Set(nav.hidden||lastState.hiddenNodes||[]);
    // Discussion highlights preserve the surrounding real network as context.
    // Only explicitly hidden records disappear; the selected-paper count still
    // excludes the background when we are discussing our study alone.
    const discussionContext=holder.dataset.discussionMap==='1'&&selected<0&&selectedCluster==null&&!focusTheme;
    if(studiesOnly&&!discussionContext)for(const node of nodes)hiddenIds.add(node.id);
    const colors=new Map(),cohortKeys=state.cohorts||[],cohorts=data.interactiveCohorts||data.cohorts||{};
    const selection=resolveEvidenceSelection(state,data,{hidden:hiddenIds,knownIds:byId});
    for(const key of cohortKeys){const c=cohorts[key];if(c)for(const id of selection.groupMembers.get(key)||[])colors.set(id,state.cohortColors?.[key]||c.color);}
    // Presenter-selected references retain their real positions. Scope is still
    // enforced if the state declares a population boundary.
    if(Array.isArray(state.paperSelection)){
      colors.clear();
      for(const id of state.paperSelection)if(byId.has(id)&&!hiddenIds.has(id)&&(!selection.boundary||selection.boundary.has(id)))colors.set(id,state.paperColor||'#f2bd76');
    }
    const relatedColors=new Map();
    if(selected<0&&selectedCluster==null&&!focusTheme)for(const id of selection.related)relatedColors.set(id,state.relatedColor||'#94bbc9');
    const contextIds=selected<0&&selectedCluster==null&&!focusTheme?selection.context:new Set();
    if(selectedCluster!=null){colors.clear();for(const n of nodes)if(n.cluster===selectedCluster)colors.set(n.id,'#f0c27b');}
    const focus=focusTheme?[focusTheme]:lastFocus,cohort=cohortKeys.length>0||selectedCluster!=null||Array.isArray(state.paperSelection),all=!cohort&&!focus.length;
    const spot=new Set([].concat(state.node||[],state.nodes||[],state.spotlight===true?[]:state.spotlight||[]));
    const adjacent=new Set(selected<0?[]:neighbors[selected].map(p=>p[0]));
    const oldU=Math.min(1,(performance.now()-started)/430);
    for(let i=0;i<to.length;i++)from[i]+=(to[i]-from[i])*oldU;
    for(let i=0;i<edgeTo.length;i++)edgeFrom[i]+=(edgeTo[i]-edgeFrom[i])*oldU;
    nodes.forEach((n,i)=>{const member=colors.get(n.id),active=focus.includes(n.theme);let color=rgb(member||data.themes[n.theme]?.color),alpha=all?.64:member?1:cohort?.083:active?.88:.055;
      if(contextIds.has(n.id)&&!member){alpha=.35;color=rgb('#c1b195');}
      if(relatedColors.has(n.id)&&!member){alpha=.84;color=rgb(relatedColors.get(n.id));}
      if(n.evidence==='review')alpha*=.70;
      if(selected>=0){alpha=i===selected?1:adjacent.has(i)?.90:.055;if(i===selected||adjacent.has(i))color=rgb('#f0c27b');}
    if(spot.has(n.id))alpha=1;
    if(!member&&!relatedColors.has(n.id)&&!spot.has(n.id)){
      if(discussionContext)alpha=n.evidence==='review'?.14:.20;
      else if(state.discussionOverlay)alpha*=state.mapDim??.18;
    }
    if(hiddenIds.has(n.id))alpha=0;const j=i*4;to[j]=color[0];to[j+1]=color[1];to[j+2]=color[2];to[j+3]=alpha;});
    edges.forEach((e,i)=>{const a=nodes[e.source],b=nodes[e.target];if(!a||!b)return;const c=colors.get(a.id),same=c&&c===colors.get(b.id),semantic=e.kind==='semantic';
      let alpha=all?(semantic?.009:.075):same?(semantic?.065:.30):.004,color=rgb(same?c:'#77818b');
      if((relatedColors.has(a.id)||colors.has(a.id))&&(relatedColors.has(b.id)||colors.has(b.id))&&(relatedColors.has(a.id)||relatedColors.has(b.id))){alpha=semantic?.055:.23;color=rgb(state.relatedColor||'#94bbc9');}
      if(!cohort&&focus.includes(a.theme)&&a.theme===b.theme){alpha=semantic?.12:.30;color=rgb(data.themes[a.theme]?.color);}
      if(selected>=0){const hit=e.source===selected||e.target===selected;alpha=hit?(semantic?.32:.85):.003;if(hit)color=rgb(semantic?'#90b3c9':'#f0c27b');}
      if(!same){
        if(discussionContext)alpha=semantic?.009:.04;
        else if(state.discussionOverlay)alpha*=state.mapDim??.18;
      }
      if(hiddenIds.has(a.id)||hiddenIds.has(b.id))alpha=0;const j=i*8;for(let k=0;k<3;k++){edgeTo[j+k]=color[k];edgeTo[j+4+k]=color[k];}edgeTo[j+3]=edgeTo[j+7]=alpha;});
    const instant=nav.settled||nav.backward||matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(instant){from.set(to);edgeFrom.set(edgeTo);}started=performance.now()-(instant?430:0);
    write(pointBuffers[1],from);write(pointBuffers[2],to);write(edgeBuffers[1],edgeFrom);write(edgeBuffers[2],edgeTo);
    const count=selected>=0?adjacent.size+1:studiesOnly?0:cohort?colors.size:nodes.filter(n=>!hiddenIds.has(n.id)&&(!focus.length||focus.includes(n.theme))).length;
    const studyLabels=[...new Set([...(state.studyMarkers||[]),...(state.satellites||[])].map(s=>s.label||s.node))];
    const qualifier=count===1&&!contextIds.size?'paper':'papers';
    counter.textContent=selected>=0?`1 selected paper · ${adjacent.size.toLocaleString()} connected`:`${count.toLocaleString()}${contextIds.size?' of '+contextIds.size.toLocaleString():''} ${qualifier}`;
    if(studiesOnly)counter.textContent=`${studyLabels.length} ${studyLabels.length===1?'study':'studies'} · ${studyLabels.join(' / ')}`;
    if(selected<0&&selectedCluster==null&&!focusTheme){
      const specs=cohortKeys.map(key=>cohorts[key]).filter(Boolean);
      const protocols=new Set(specs.flatMap(c=>c.protocolMembers||[]).filter(id=>colors.has(id)));
      if(protocols.size){const completed=new Set(specs.flatMap(c=>c.completedMembers||[]).filter(id=>colors.has(id)));const exhaustive=completed.size+protocols.size===count;counter.textContent+=` · ${exhaustive&&completed.size?`${completed.size} result ${completed.size===1?'paper':'papers'} + `:'includes '}${protocols.size} ${protocols.size===1?'protocol':'protocols'}`;}
      if(studyLabels.length&&!studiesOnly)counter.textContent+=` · + ${studyLabels.join(' / ')}`;
      if(state.showPublicationTypes){const reviews=new Set(specs.flatMap(c=>c.reviewMembers||[]).filter(id=>colors.has(id)));if(reviews.size)counter.append(make('small','evidence-count-scope',`${reviews.size.toLocaleString()} human-focused syntheses included · not independent patient cohorts`));}
      const mixedSeverity=nodes.filter(n=>colors.has(n.id)&&n.severity?.displayNote);
      if(mixedSeverity.length)counter.append(make('small','evidence-count-scope',`${mixedSeverity.length} mixed-severity ${mixedSeverity.length===1?'report':'reports'} · mild sample/subgroup limits in paper details`));
      const accentCounts=(state.countCohorts||[]).map(key=>{const c=cohorts[key],members=selection.groupMembers.get(key);if(!c||!members)return null;const protocols=(c.protocolMembers||[]).filter(id=>members.has(id)).length;return `${c.label}: ${members.size} papers${protocols?` (${protocols} protocol)`:''}`;}).filter(Boolean);
      if(accentCounts.length)counter.append(make('small','evidence-count-scope',accentCounts.join(' · ')));
      if(state.populationBreakdown){const eligible=new Set((state.populationBreakdown.cohorts||[]).flatMap(key=>cohorts[key]?.members||[]).filter(id=>colors.has(id)));counter.append(make('small','evidence-count-scope',`${eligible.size} ${state.populationBreakdown.label||'clinical PPCS records'} · ${Math.max(0,count-eligible.size)} ${state.populationBreakdown.otherLabel||'related-population records'}`));}
      if(relatedColors.size){const related=make('small','evidence-count-related',`${relatedColors.size} related ${relatedColors.size===1?'paper':'papers'} in ${state.relatedColorName||'blue'} · ${state.relatedLabel||'other populations'}`);related.style.color=state.relatedColor||'#94bbc9';counter.append(related);}
      if(specs.length)counter.append(make('small','evidence-count-scope',state.countScope||'Publications in this map'));
    }
    labelSelectedPapers(state,colors,relatedColors);
    holder.dataset.graphHighlighted=String(count);holder.dataset.graphVisiblePapers=String(nodes.length-hiddenIds.size);holder.dataset.graphHighlightColors=[...new Set(colors.values())].join(',');holder.dataset.graphStudies=String(studyLabels.length);holder.dataset.graphStudiesOnly=String(studiesOnly);holder.dataset.graphRelated=String(relatedColors.size);holder.dataset.graphContext=String(contextIds.size);holder.dataset.graphSelection=selected<0?'':nodes[selected].id;holder.dataset.graphCommunity=selectedCluster==null?'':String(selectedCluster);holder.dataset.graphUpdateMs=(performance.now()-paintStart).toFixed(2);schedule();
  }
  const pick=(x,y)=>{const wx=(x-view.x)/view.scale,wy=(y-view.y)/view.scale,r=7/view.scale,range=Math.ceil(r/cell);let best=-1,distance=Infinity;
    const gx=Math.floor(wx/cell),gy=Math.floor(wy/cell);for(let xx=gx-range;xx<=gx+range;xx++)for(let yy=gy-range;yy<=gy+range;yy++)for(const i of grid.get(`${xx},${yy}`)||[]){const n=nodes[i];if(hiddenIds.has(n.id))continue;const d=Math.hypot(n.x-wx,n.y-wy);if(d<Math.max(r,PAPER_RADIUS*1.2)&&d<distance){best=i;distance=d;}}return best;};
  const location=e=>{const r=map.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
  function header(title){panel.replaceChildren();const row=make('div','evidence-paper-heading'),h=make('strong','',title),close=make('button','','×');close.type='button';close.setAttribute('aria-label','Close paper details');close.onclick=()=>{panel.hidden=true;selected=-1;selectedCluster=null;focusTheme=null;paint(tourState,{...tourNav,settled:true});};row.append(h,close);panel.append(row);panel.hidden=false;}
  function showPaper(i,center=false){selected=i;selectedCluster=null;focusTheme=null;const n=nodes[i];if(center){zoom=Math.max(zoom,3);const s=Math.min(map.clientWidth/1600,map.clientHeight/820),targetX=Math.max(map.clientWidth*.23,(map.clientWidth-Math.min(440,holder.clientWidth*.88)-32)/2);panX=targetX-map.clientWidth/2+(800-n.x)*s*zoom;panY=(410-n.y)*s*zoom;}
    const caption=n.label||n.displayLabel||n.id;header(n.title||caption);const meta=make('p','evidence-paper-meta',`${caption}${n.year&&!caption.includes(String(n.year))?' · '+n.year:''} · Field: ${/unresolved|unknown/i.test(data.themes[n.theme]?.label||n.theme)?'Other research':data.themes[n.theme]?.label||n.theme}`);
    const cited=neighbors[i].filter(([,j])=>edges[j].kind==='citation').length,similar=neighbors[i].length-cited;
    panel.append(meta,make('p','evidence-paper-links',`${cited} citation ${cited===1?'link':'links'} · ${similar} topic-similarity ${similar===1?'link':'links'}`));
    const community=data.meta.semanticCommunities?.find(c=>c.id===n.cluster);
    if(community){const field=make('button','evidence-paper-field',`Explore field · ${community.label}`);field.onclick=()=>{selected=-1;selectedCluster=n.cluster;header(community.label);panel.append(make('p','',`${community.count} papers connected by related language in their titles, abstracts and indexed subjects.`),make('p','evidence-paper-status','An automatically computed literature field; similarity links express related content, not evidence of citation or agreement.'));paint(lastState,{settled:false});};panel.append(field);}
    if(n.measurementLabel)panel.append(make('p','evidence-paper-measurement',n.measurementLabel));
    for(const line of n.presentationSummary||[])panel.append(make('p','evidence-paper-classification',line));
    if(n.severity?.displayNote)panel.append(make('p','evidence-paper-classification',n.severity.displayNote));
    if(n.humanPublicationType==='synthesis')panel.append(make('p','evidence-paper-protocol','Human-focused synthesis · not a new independent patient cohort.'));
    if(n.humanPublicationType==='human-tissue-or-postmortem')panel.append(make('p','evidence-paper-protocol','Human tissue or postmortem research · not necessarily a living-patient cohort.'));
    if(n.studyStatus==='protocol'||n.publicationStatus==='protocol')panel.append(make('p','evidence-paper-protocol','Protocol publication · describes planned measurements.'));
    if(n.publicationStatus==='pilot')panel.append(make('p','evidence-paper-protocol','Pilot study · empirical results.'));
    if(n.trialRegistration){const trial=n.trialRegistration;const description=trial.note||trial.summary||trial.interpretation||[trial.status||trial.overallStatus,trial.completionDate,trial.hasResults===false?'No results posted':null].filter(Boolean).join(' · ');if(description)panel.append(make('p','evidence-paper-classification',description));}
    if(n.sourceReview?.length){const references=make('div','evidence-paper-review-sources'),seen=new Set();for(const source of n.sourceReview){const urls=typeof source==='string'?[source]:source.urls||[source.url||source.href];for(const url of urls){if(!url||seen.has(url))continue;seen.add(url);const a=make('a','evidence-paper-source',`Source ${seen.size}`);a.href=url;a.target='_blank';a.rel='noopener noreferrer';references.append(a);}}panel.append(references);}
    const link=make('a','evidence-paper-source','Open publication');link.target='_blank';link.rel='noopener noreferrer';link.href=n.url||n.source?.url||(/^PMID/.test(n.id)?`https://pubmed.ncbi.nlm.nih.gov/${n.id.slice(4)}/`:'#');panel.append(link);
    if(neighbors[i].length){const connected=make('details','evidence-connected-papers'),summary=make('summary','','Connected papers');connected.append(summary);const seen=new Set();
      for(const [j,k] of [...neighbors[i]].sort((a,b)=>(edges[b[1]].kind==='citation')-(edges[a[1]].kind==='citation')||(edges[b[1]].weight||0)-(edges[a[1]].weight||0))){if(seen.has(j))continue;seen.add(j);const item=make('button','',`${edges[k].kind==='citation'?'Citation':'Similar topic'} · ${nodes[j].title||nodes[j].displayLabel||nodes[j].id}`);item.onclick=()=>showPaper(j,true);connected.append(item);if(seen.size===12)break;}panel.append(connected);}
    const support=make('div','evidence-paper-support');panel.append(support);paint(lastState,{settled:true});
    const spec=data.meta.paperDetails;if(!spec)return;const chunk=Math.floor(i/(spec.chunkSize||256)),url=`${spec.base}${String(chunk).padStart(4,'0')}.json`;
    if(!details.has(url))details.set(url,fetch(url).then(r=>{if(!r.ok)throw Error(r.status);return r.json();}));
    details.get(url).then(rows=>{if(selected!==i)return;const record=Array.isArray(rows)?rows.find(r=>r.id===n.id):rows[n.id];if(!record)return;
      if(record.title)panel.querySelector('strong').textContent=record.title;if(record.url||record.source?.url)link.href=record.url||record.source.url;
      const abstract=record.abstract||record.abstractExcerpt;if(abstract){if(abstract.length>650){support.append(make('p','',abstract.slice(0,500).replace(/\s+\S*$/,'')+'…'));const more=make('details',''),summary=make('summary','','Read the full abstract');more.append(summary,make('p','',abstract));support.append(more);}else support.append(make('p','',abstract));}
      // Show scientific source text, while retaining adjudication notes in the
      // offline audit rather than treating review workflow as slide content.
    }).catch(()=>support.append(make('p','','Source details are available through the publication link.')));
  }
  let drag=null,suppressClick=false;
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;const p=location(e);drag={x:p.x,y:p.y,px:panX,py:panY,moved:false};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{const p=location(e);if(drag){const dx=p.x-drag.x,dy=p.y-drag.y;if(Math.hypot(dx,dy)>4)drag.moved=true;if(drag.moved){panX=drag.px+dx;panY=drag.py+dy;tip.hidden=true;schedule();}return;}
    const i=pick(p.x,p.y);canvas.style.cursor=i<0?'grab':'pointer';if(i===hovered)return;hovered=i;tip.hidden=i<0;if(i>=0){tip.textContent=nodes[i].title||nodes[i].label||nodes[i].id;tip.style.left=`${Math.min(p.x+12,Math.max(8,holder.clientWidth-300))}px`;tip.style.top=`${p.y+map.offsetTop+15}px`;}});
  canvas.addEventListener('pointerup',e=>{suppressClick=!!drag?.moved;drag=null;canvas.releasePointerCapture(e.pointerId);});
  canvas.addEventListener('pointerleave',()=>{tip.hidden=true;hovered=-1;});
  canvas.addEventListener('click',e=>{if(suppressClick){e.stopPropagation();suppressClick=false;return;}const p=location(e),i=pick(p.x,p.y);if(i>=0){e.stopPropagation();showPaper(i);}});
  canvas.addEventListener('wheel',e=>{e.preventDefault();e.stopPropagation();const p=location(e),worldX=(p.x-view.x)/view.scale,worldY=(p.y-view.y)/view.scale;zoom=Math.max(.7,Math.min(15,zoom*Math.exp(-e.deltaY*.0016)));const s=Math.min(map.clientWidth/1600,map.clientHeight/820);panX=p.x-map.clientWidth/2-(worldX-800)*s*zoom;panY=p.y-map.clientHeight/2-(worldY-410)*s*zoom;tip.hidden=true;schedule();},{passive:false});
  reset.onclick=()=>{zoom=1;panX=panY=0;focusTheme=null;selected=-1;selectedCluster=null;panel.hidden=true;paint(tourState,{...tourNav,settled:true});};
  find.onclick=()=>{header('Find a paper');const input=make('input','evidence-paper-search');input.type='search';input.placeholder='Title, author or PMID';input.setAttribute('aria-label','Search the full network');const results=make('div','evidence-paper-results');panel.append(input,results);
    input.oninput=()=>{const query=input.value.toLowerCase().trim();results.replaceChildren();if(query.length<2)return;const matches=[];for(let i=0;i<nodes.length;i++){const n=nodes[i];if(`${n.title||''} ${n.label||n.displayLabel||''} ${n.id}`.toLowerCase().includes(query)){matches.push(i);if(matches.length===12)break;}}for(const i of matches){const button=make('button','',nodes[i].title||nodes[i].label||nodes[i].id);button.onclick=()=>showPaper(i,true);results.append(button);}if(!matches.length)results.append(make('p','','No matching title or identifier.'));};input.focus();};
  svg.querySelectorAll('.evidence-theme-labels text').forEach(label=>{label.style.pointerEvents='auto';label.style.cursor='pointer';label.addEventListener('click',e=>{e.stopPropagation();focusTheme=focusTheme===label.dataset.theme?null:label.dataset.theme;selected=-1;selectedCluster=null;paint({...tourState,cohorts:[]},{activeThemes:focusTheme?[focusTheme]:[],settled:false});});});
  const resize=new ResizeObserver(schedule);resize.observe(map);
  function dispose(){if(disposed)return;disposed=true;callout.dispose();cancelAnimationFrame(frame);resize.disconnect();observer.disconnect();for(const b of [...pointBuffers,...edgeBuffers])gl.deleteBuffer(b);gl.deleteProgram(points);gl.deleteProgram(lines);gl.getExtension('WEBGL_lose_context')?.loseContext();}
  const observer=new MutationObserver(()=>{if(!holder.isConnected)dispose();});observer.observe(holder.parentNode||document.body,{childList:true,subtree:true});
  holder.dataset.corpusRecords=String(nodes.length);holder.dataset.graphNodes=String(nodes.length);holder.dataset.graphEdges=String(edges.length);holder.dataset.graphRenderer='webgl';holder.dataset.graphPaperRadius=String(PAPER_RADIUS);svg.setAttribute('aria-label','Network field labels and highlighted study markers');
  transform();return{paint:(state,nav)=>{tourState=state;tourNav=nav;selected=-1;selectedCluster=null;focusTheme=null;panel.hidden=true;tip.hidden=true;paint(state,nav);},dispose};
}
