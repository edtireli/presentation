/* Click-driven, native 3D diagrams. The puzzle illustrates module choices, not
 * dependencies. Filenames and animation timings are illustrative. */
import {createPaperScene} from './pbrain-paper.js';
export const PBRAIN_STATES = {
  modules: [
    ['p-Brain', 'Open source. Modular. Ready to run.', 'One framework. Interchangeable pieces.', 'MIT license · github.com/edtireli/p-brain'],
    ['A complete framework', '', '', ''],
    ['Make it your own', 'Swap the methods that matter to your study', 'Your model. Your signal conversion. Your segmentation.', 'Custom providers fit the same interfaces'],
    ['And keep building', '', '', ''],
    ['An AI input-function module', 'A CNN can localise the vessel for input extraction', 'The input-function piece fits the same interface', 'Next click: see the example from the article'],
    ['Automatic input-function localisation', 'The CNN identifies the superior sagittal sinus', 'The selected voxel supplies the venous concentration–time curve', 'Next click: return to the framework'],
    ['Back to the framework', '', '', ''],
    ['Another method, the same interface', '', 'Cluster analysis', ''],
  ],
  inputs: [
    ['Different files. Different folders.', 'Bring the data you already have', 'Flat folders, BIDS layouts and scanner exports', 'NIfTI · PAR/REC · DICOM · JSON metadata'],
    ['Set up your study', 'Load the files and choose the methods', 'T₁ / M₀ fitting, signal conversion and kinetic models', 'Next click: connect the files and select the methods'],
    ['Load the input files', 'Map each file to its input', 'The files are loaded. The methods are your next choice.', 'Next click: choose the methods and connect analysis'],
    ['Choose the methods for your study', 'Map files → load → choose methods → analysis', 'Select T₁ fitting, signal conversion and kinetic models', 'Example choices · acquisition, study question and required outputs guide the setup'],
    ['Optional local assistance', 'A local assistant reads file names and scan metadata', 'Your methods stay configured for the study', 'Next click: propose DCE, anatomical T1 and IR input mappings'],
    ['Let the assistant map the inputs', 'Identify subjects, folders and the files for each input', 'Review the proposed mappings. Confirm when they are right.', 'T₁/M₀ fitting, signal conversion and kinetic models use your study settings'],
    ['Confirm. Load. Analyse.', 'Load the approved inputs and run the configured methods', 'The quantitative pipeline now computes the maps', 'Confirmed file mappings can be saved for reproducible reuse'],
  ],
  paper: [
    ['Describe a new method', 'A research paper begins with your idea', 'A custom method can become a reusable part of p-Brain', 'From a Methods section to a module'],
    ['Write it into the paper', 'Explain how the analysis uses your method', '“We analysed the data with p-Brain using our custom kinetic model.”', 'A research manuscript · an illustrative example'],
    ['Give the method a reusable form', 'Your custom model becomes a module', 'Defined inputs. Defined outputs. One shared interface.', 'Implemented once, shared with other researchers'],
    ['A new method, ready to reuse', 'Your model fits the framework', 'Shared loading, processing, summaries and diagnostics', 'One module · the same reproducible workflow'],
  ],
  patientPaper: [
    ['A framework for your patient study', 'Another paper, another way to use p-Brain', 'Adapt the input function and tissue regions to your study', 'From a patient-analysis paper to two reusable modules'],
    ['Describe the patient analysis', 'Explain the choices behind the regional estimates', 'A patient cohort analysed with a custom input function and tissue regions', 'Illustrative study · no patient data or results are shown'],
    ['Make the study choices explicit', 'Two contributions become two reusable modules', 'Your input function. Your tissue regions.', 'The researcher supplies compatible implementations'],
    ['Your study, built on p-Brain', 'Both custom pieces fit the same framework', 'Shared loading, conversion, model fitting and summaries', 'Different study requirements · the same modular framework'],
  ],
};
const MODULES = [
  ['load','Load','NIfTI / PAR-REC / DICOM'], ['t1','T₁ / M₀','IR / VFA / precomputed'],
  ['signal','Signal →\nconcentration','S(t) → C(t)'], ['aif','Input function','CNN / manual / curve'],
  ['tissue','Tissue regions','SynthSeg / your labels'], ['normalise','Normalisation','Identity / baseline'],
  ['model','Kinetic models','Patlak / Tikhonov / Tofts'], ['summary','Summaries','Voxels / tissues / parcels'],
  ['qc','Diagnostics','Maps / fit quality'],
];
const CUSTOM = {signal:['Your conversion','Your S(t) → C(t)'],tissue:['Your segmentation','Your tissue labels'],model:['Your model','Your kinetic model']};
const EXTRA = [['diffusion','Diffusion','DTI / DKI / CSD'],['tractography','Tractography','Streamlines'],['connectome','Connectome','Structural connectivity']];
const FOLDERS = [
  {title:'Flat NIfTI',path:'subject_01/',files:['dynamic.nii.gz','mprage.nii.gz','ir.nii.gz'],roles:[0,1,2]},
  {title:'BIDS layout',path:'sub-02 / ses-01 /',files:['perf / *_dce.nii.gz','anat / *_T1w.nii.gz','*.json sidecars'],roles:[0,1,3]},
  {title:'Scanner export',path:'export_03/',files:['hperf.PAR + .REC','DICOM / T1 / *.dcm','TI_*.PAR + .REC'],roles:[0,1,2]},
];
const METHODS = [
  {id:'method-t1',title:'T₁ / M₀ fitting',choices:'IR / VFA / preloaded',selected:'Inversion recovery'},
  {id:'method-conversion',title:'Signal conversion',choices:'SR / SPGR / ratio',selected:'Saturation recovery'},
  {id:'method-models',title:'Kinetic models',choices:'Patlak / Tikhonov / Tofts',selected:'Patlak + Tikhonov'},
];
const INPUT_LAYOUT = {folderX:-10.5,folderScale:.95,loaderX:-4.75,methodX:1.2,confirmX:6.4,analysisX:10.6};
// Presenter clicks can pause a scene for an aside without replaying its arrival.
const INPUT_FLOW_STATES=[0,1,1,1,2,3,4];
const MODULE_FLOW_STATES=[0,1,2,3,4,4,4,5];
const ASIDES={
  modules:{step:5,key:'input-function',src:'decks/assets/defense/pbrain-input-function-rois.png',alt:'Article figure showing CNN localisation of the superior sagittal sinus, the selected voxel and its concentration–time curve'},
};
const clamp=n=>Math.max(0,Math.min(1,n));
const ease=n=>{n=clamp(n);return n*n*(3-2*n);};
const mix=(a,b,t)=>a+(b-a)*t;
const node=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!=null)n.textContent=text;return n;};

export function renderPbrainPuzzle(block={}) {
  if(!document.querySelector('link[data-pbrain-puzzle]')) {
    const css=document.createElement('link');css.rel='stylesheet';css.dataset.pbrainPuzzle='';
    css.href=new URL('../css/pbrain-puzzle.css',import.meta.url).href;document.head.append(css);
  }
  const mode=['inputs','paper'].includes(block.mode)?block.mode:'modules',scenario=block.scenario==='patients'?'patients':'method',states=block.states||PBRAIN_STATES[mode==='paper'&&scenario==='patients'?'patientPaper':mode];
  const holder=node('div','pbrain-puzzle scene-holder'),header=node('header','pbrain-puzzle-header');
  const kicker=node('div','pbrain-puzzle-kicker',mode==='inputs'?'p-BRAIN / FROM FILES TO ANALYSIS':mode==='paper'?'p-BRAIN / SHARE THE METHOD':'p-BRAIN / THE FRAMEWORK');
  const title=node('h2',''),subtitle=node('p','pbrain-puzzle-subtitle');header.append(kicker,title,subtitle);
  const viewport=node('div','pbrain-puzzle-viewport'),labels=node('div','pbrain-puzzle-labels');
  const loading=node('div','pbrain-puzzle-loading','Preparing the diagram…');viewport.append(loading,labels);
  const footer=node('footer','pbrain-puzzle-footer'),caption=node('p','pbrain-puzzle-caption'),detail=node('div','pbrain-puzzle-detail');
  footer.append(caption,detail);holder.append(header,viewport,footer);
  const aside=node('div','pbrain-aside');aside.hidden=true;aside.setAttribute('role','group');holder.append(aside);
  let asideKey='',asideVisit=0;
  function showAside(){
    const spec=ASIDES[mode],active=spec&&step===spec.step;
    holder.dataset.pbrainAside=active?spec.key:'';
    if(!active){aside.hidden=true;aside.replaceChildren();asideKey='';return;}
    if(asideKey===spec.key)return;asideKey=spec.key;aside.hidden=false;aside.dataset.kind=spec.key;aside.setAttribute('aria-label',spec.alt);
    const picture=node('img','pbrain-aside-image');picture.alt=spec.alt;
    // A new local URL restarts the recorded demo when the presenter revisits it.
    picture.src=spec.src+(mode==='inputs'?`?replay=${++asideVisit}`:'');
    const hint=node('div','pbrain-aside-hint','Next click returns to the flow');
    aside.replaceChildren(picture,...(block.minimalFooter?[]:[hint]));
  }
  for(const [id,n] of Object.entries({title,subtitle,caption,detail}))n.dataset.editorPart=id;
  holder.sceneSteps=states.length-1;holder.dataset.pbrainMode=mode;holder.dataset.pbrainScenario=scenario;holder.dataset.pbrainState='0';
  let step=0,pendingNav={},control=null,disposed=false,seenConnected=false;
  function copy(){
    [title.textContent,subtitle.textContent,caption.textContent,detail.textContent]=states[step];
    const prompt=block.captions?.[step];
    if(block.minimalFooter){caption.textContent='';detail.textContent='';}
    caption.classList.toggle('has-marker',!!prompt);
    if(prompt){
      caption.replaceChildren();
      const text=String(prompt.text||''),matches=(prompt.highlights||[])
        .map(word=>({word,at:text.indexOf(word)})).filter(hit=>hit.at>=0).sort((a,b)=>a.at-b.at);
      let cursor=0;
      for(const {word,at} of matches){
        if(at<cursor)continue;
        const mark=node('mark','',word);caption.append(text.slice(cursor,at),mark);cursor=at+word.length;
      }
      caption.append(text.slice(cursor));
    }
    subtitle.hidden=!subtitle.textContent;caption.hidden=!caption.textContent;detail.hidden=!detail.textContent;
    footer.hidden=caption.hidden&&detail.hidden;
    holder.setAttribute('aria-label',`p-Brain ${mode}, step ${step+1} of ${states.length}: ${states[step][0]}. ${caption.textContent}`);
    showAside();
  }
  holder.repaint=(next=0,nav={})=>{
    const value=Math.min(states.length-1,Math.max(0,Math.round(Number(next)||0)));
    if(value===step&&!nav.settled&&!nav.directEnd&&!nav.backward&&control)return;
    step=value;pendingNav=nav;holder.dataset.pbrainState=String(step);copy();control?.setStep(step,nav);
  };
  copy();
  const observer=new MutationObserver(records=>{
    const removed=records.some(r=>[...r.removedNodes].some(n=>n===holder||n.contains?.(holder)));
    if(holder.isConnected)seenConnected=true;
    else if(seenConnected||removed){disposed=true;control?.dispose();observer.disconnect();}
  });
  observer.observe(document.getElementById('stage')||document.body,{childList:true,subtree:true});
  import('../vendor/three/three.module.min.js').then(T=>{
    if(disposed)return;
    control=mount(T,holder,viewport,labels,mode,scenario);loading.remove();seenConnected=holder.isConnected;
    control.setStep(step,pendingNav);holder.dataset.pbrainReady='true';
    holder.dispatchEvent(new CustomEvent('block-ready',{bubbles:true}));
  }).catch(error=>{
    if(disposed)return;
    console.warn('p-Brain 3D fallback:',error.message);viewport.replaceChildren();
    const fallback=node('div','pbrain-puzzle-fallback');viewport.append(fallback);
    control={setStep(at){
      const manualReady=mode==='inputs'&&at===1,manualLoaded=mode==='inputs'&&at===2;
      at=mode==='inputs'?INPUT_FLOW_STATES[at]:mode==='modules'?MODULE_FLOW_STATES[at]:at;
      const items=mode==='paper'?(scenario==='patients'?(at===0?['Patient-study manuscript']:at===1?['Methods','We analysed the patients with p-Brain using our custom input function and tissue regions.']:at===2?['Patient-study manuscript','Your input function','Your tissue regions']:['Patient-study manuscript','Your input function + Your tissue regions → p-Brain']):(at===0?['Research manuscript']:at===1?['Methods','We analysed the data with p-Brain using our custom kinetic model.']:at===2?['Research manuscript → Your model','A reusable module']:['Research manuscript','Your model → p-Brain','Shared inputs, outputs, summaries and diagnostics'])):mode==='modules'?(at===0?['Click next to assemble the framework']:MODULES.map(([id,text])=>at>=4&&id==='aif'?(at===5?'Cluster analysis · input function':'Robot · CNN input function'):at>=2&&CUSTOM[id]?CUSTOM[id][0]:text).concat(at>=3?EXTRA.map(m=>m[1]):[])):
        at===0?FOLDERS.map(f=>`${f.title}\n${f.files.join('\n')}`):['Files → assigned roles',at===1?'Load':'Robot · AI-assisted input mapping',...METHODS.map(m=>`${m.title}\n${m.selected}${at>=2?' · Study setting':''}`),at===2?'Ready · next click starts input mapping':at===3?'Review input mappings → Confirm':at===4?'Confirmed inputs + study settings → Analysis':'Your choices → Analysis'];
      fallback.replaceChildren(...(manualReady?['Files','Load',...METHODS.map(m=>`${m.title}\n${m.choices}`),'Next click connects the inputs']:manualLoaded?['Files → Load',...METHODS.map(m=>`${m.title}\n${m.choices}`),'Next click chooses methods and connects analysis']:items).map(t=>node('div','',t)));holder.dataset.pbrainAnimating='false';
    },dispose(){}};
    control.setStep(step);holder.dataset.pbrainReady='fallback';
  });
  return holder;
}

function mount(T,holder,viewport,labels,mode,scenario) {
  const renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setClearColor(0,0);
  renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  viewport.prepend(renderer.domElement);renderer.domElement.setAttribute('aria-hidden','true');
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-15,15,5,-5,.1,100);
  scene.add(new T.HemisphereLight(0xfff8ea,0x5a4c3f,2.1));
  const key=new T.DirectionalLight(0xffebcd,3.8);key.position.set(-5,4,15);key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-18,right:18,top:12,bottom:-12,near:.5,far:45});
  key.shadow.bias=-.0005;key.shadow.normalBias=.04;key.shadow.radius=3;scene.add(key);
  const rim=new T.DirectionalLight(0xe7d7c4,2);rim.position.set(6,-4,8);scene.add(rim);
  const geometries=new Set(),materials=new Set(),textures=new Set(),objects=new Map(),wires=[];
  const trackG=g=>(geometries.add(g),g),trackM=m=>(materials.add(m),m);
  const floor=new T.Mesh(trackG(new T.PlaneGeometry(70,35)),trackM(new T.ShadowMaterial({opacity:.4})));
  floor.position.z=-.35;floor.receiveShadow=true;scene.add(floor);
  const faceColor='#d0bf9e',sideColor='#66503e',copper='#9e4529',ink='#241d18';
  function extrude(shape,depth=.48,bevel=.052){
    return trackG(new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:bevel*1.44,bevelSize:bevel,bevelSegments:3,steps:1,curveSegments:16}));
  }
  function puzzle(w=4,h=2.42,{left=false,right=false,top=false,bottom=false}={}){
    const s=new T.Shape(),x=w/2,y=h/2,r=.12,a=.28,b=.39;
    s.moveTo(-x+r,-y);s.lineTo(-a,-y);
    if(bottom){s.bezierCurveTo(-a,-y+.12,-b,-y+.17,-b,-y+.27);s.bezierCurveTo(-b,-y+.55,b,-y+.55,b,-y+.27);s.bezierCurveTo(b,-y+.17,a,-y+.12,a,-y);}else s.lineTo(a,-y);
    s.lineTo(x-r,-y);s.quadraticCurveTo(x,-y,x,-y+r);s.lineTo(x,-a);
    if(right){s.bezierCurveTo(x+.12,-a,x+.17,-b,x+.27,-b);s.bezierCurveTo(x+.55,-b,x+.55,b,x+.27,b);s.bezierCurveTo(x+.17,b,x+.12,a,x,a);}else s.lineTo(x,a);
    s.lineTo(x,y-r);s.quadraticCurveTo(x,y,x-r,y);s.lineTo(a,y);
    if(top){s.bezierCurveTo(a,y+.12,b,y+.17,b,y+.27);s.bezierCurveTo(b,y+.55,-b,y+.55,-b,y+.27);s.bezierCurveTo(-b,y+.17,-a,y+.12,-a,y);}else s.lineTo(-a,y);
    s.lineTo(-x+r,y);s.quadraticCurveTo(-x,y,-x,y-r);s.lineTo(-x,a);
    if(left){s.bezierCurveTo(-x+.12,a,-x+.17,b,-x+.27,b);s.bezierCurveTo(-x+.55,b,-x+.55,-b,-x+.27,-b);s.bezierCurveTo(-x+.17,-b,-x+.12,-a,-x,-a);}else s.lineTo(-x,-a);
    s.lineTo(-x,-y+r);s.quadraticCurveTo(-x,-y,-x+r,-y);s.closePath();return extrude(s);
  }
  function folderGeometry(){
    const s=new T.Shape();s.moveTo(-3,-1.22);s.lineTo(3,-1.22);s.lineTo(3,1.02);s.lineTo(-.5,1.02);s.lineTo(-.85,1.38);s.lineTo(-3,1.38);s.closePath();return extrude(s,.26,.05);
  }
  function make(id,title,sub,geometry,w=4,h=2.42,custom=false,kind='module'){
    // Opaque solids resolve occlusion before lettering. No alpha fades or
    // self-shadow acne on faces; old/new pieces take separate paths in a swap.
    const face=trackM(new T.MeshStandardMaterial({color:custom?copper:faceColor,roughness:.55,metalness:.12}));
    const side=trackM(new T.MeshStandardMaterial({color:sideColor,roughness:.48,metalness:.2}));
    const group=new T.Group(),body=new T.Mesh(geometry,[face,side]);body.castShadow=true;group.add(body);scene.add(group);
    const semantic=node('div','pbrain-face-target');semantic.dataset.editorPart=`label-${id}`;
    semantic.dataset.editorLabel=`${title.replaceAll('\n',' ')} label`;semantic.dataset.editorText=[title,sub].filter(Boolean).join('\n');
    semantic.setAttribute('aria-label',semantic.dataset.editorText);labels.append(semantic);
    const canvas=document.createElement('canvas');canvas.width=Math.round(w*240);canvas.height=Math.round(h*240);
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());textures.add(texture);
    const mat=trackM(new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,alphaTest:.015,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,toneMapped:false}));
    const lettering=new T.Mesh(trackG(new T.PlaneGeometry(w,h)),mat);lettering.position.z=kind==='folder'?.36:kind==='paper'?.125:.60;group.add(lettering);
    const obj={id,group,body,face,side,lettering,semantic,canvas,texture,w,h,title,sub,custom,kind,labelKey:null};objects.set(id,obj);drawLabel(obj);return obj;
  }
  function drawLabel(obj){
    const override=obj.semantic.spiralEdit?.text,labelKey=JSON.stringify([override,obj.title,obj.sub,obj.status,obj.custom,obj.selected]);
    if(obj.labelKey===labelKey)return;obj.labelKey=labelKey;
    const {canvas,w,h,kind}=obj,c=canvas.getContext('2d'),scale=canvas.width/w;
    c.clearRect(0,0,canvas.width,canvas.height);c.save();c.scale(scale,scale);c.translate(w/2,h/2);
    const color=ink;c.fillStyle=color;c.textBaseline='middle';c.textAlign='center';
    const text=(str,x,y,size=.36,weight=500,align='center',max=w-.55)=>{
      c.textAlign=align;let font=size;c.font=`${weight} ${font}px "Helvetica Neue",Arial,sans-serif`;
      while(c.measureText(str).width>max&&font>.12){font-=.005;c.font=`${weight} ${font}px "Helvetica Neue",Arial,sans-serif`;}
      c.fillText(str,x,y);
    };
    if(override!=null){
      const lines=String(override).split('\n');lines.forEach((line,i)=>text(line,0,(i-(lines.length-1)/2)*.4,i===lines.length-1&&lines.length>1?.23:.36));
    }else if(kind==='folder'){
      const f=FOLDERS[Number(obj.id.slice(-1))];
      text(f.title,-2.65,-.74,.36,650,'left',5.3);text(f.path,2.65,-.74,.235,400,'right',2.5);
      c.strokeStyle='#8f775a';c.lineWidth=.016;c.beginPath();c.moveTo(-2.65,-.44);c.lineTo(2.65,-.44);c.stroke();
      f.files.forEach((file,i)=>{const y=-.13+i*.39;c.strokeStyle='#79644f';c.lineWidth=.023;c.strokeRect(-2.62,y-.105,.15,.21);text(file,-2.3,y,.265,400,'left',4.65);});
    }else if(kind==='loader'){
      if(obj.custom){
        c.strokeStyle=color;c.lineWidth=.055;c.lineJoin='round';c.strokeRect(.05,-1.45,1.03,.65);
        c.beginPath();c.moveTo(.565,-1.45);c.lineTo(.565,-1.67);c.stroke();c.beginPath();c.arc(.565,-1.73,.065,0,Math.PI*2);c.fill();
        c.fillRect(.26,-1.21,.1,.1);c.fillRect(.77,-1.21,.1,.1);c.fillRect(.39,-.98,.36,.045);
        text('AI-assisted',.5,-.37,.34,650,'center',2.25);text('Setup',.5,.1,.48,550,'center',2.2);text('Optional · local',.5,.71,.225,400,'center',2.25);
      }else{text('Load',.5,-.5,.61,500,'center',2.25);text('Convert to',.5,.2,.265,400,'center',2.25);text('NIfTI',.5,.55,.3,550,'center',2.25);}
      ['DCE','T1','IR','JSON'].forEach((role,i)=>text(role,-1.47,-1.25+i*.79,.24,600,'left',.85));
      text(obj.status||'Input roles',0,1.71,.23,500);
    }else if(kind==='input-ai'){
      c.strokeStyle=color;c.lineWidth=.047;c.lineJoin='round';c.strokeRect(-.47,-.97,.94,.51);
      c.beginPath();c.moveTo(0,-.97);c.lineTo(0,-1.1);c.stroke();c.beginPath();c.arc(0,-1.13,.045,0,Math.PI*2);c.fill();
      c.fillRect(-.26,-.81,.09,.09);c.fillRect(.17,-.81,.09,.09);c.fillRect(-.15,-.59,.3,.035);
      text('Input function',.10,.02,.37,550,'center',w-.95);text('CNN vessel detection',.10,.57,.225,400,'center',w-.8);
    }else if(kind==='cluster'){
      text('Cluster analysis',.10,.12,.37,550,'center',w-.95);
      text('Input function',.10,.65,.225,400,'center',w-.8);
    }else if(kind==='method'){
      text(obj.title,.12,-.60,.38,550,'center',w-.85);
      text(obj.sub,.12,.02,.28,obj.selected?600:400,'center',w-.95);
      text(obj.status||'Choose method',.12,.51,.205,500,'center',w-.85);
      if(obj.selected){
        c.strokeStyle=ink;c.lineWidth=.035;c.beginPath();c.moveTo(-.94,.48);c.lineTo(-.86,.56);c.lineTo(-.70,.39);c.stroke();
      }
    }else{
      const lines=obj.title.split('\n'),size=kind==='confirm'?.36:.39,baseline=obj.sub?-.19:0;
      // Leave the left socket clear: lettering must stay on its own solid face.
      const offset=kind==='module'?.12:0,safeWidth=kind==='module'?w-.95:w-.5;
      lines.forEach((line,i)=>text(line,offset,baseline+(i-(lines.length-1)/2)*.45,size,550,'center',safeWidth));
      if(obj.sub)text(obj.sub,offset,baseline+(lines.length-1)*.225+.52,kind==='confirm'?.19:.225,400,'center',safeWidth);
    }
    c.restore();obj.texture.needsUpdate=true;obj.semantic.setAttribute('aria-label',override??[obj.title,obj.sub,obj.status].filter(Boolean).join('\n'));
  }
  const positions={};let paperScene=null;
  if(mode==='modules'){
    MODULES.forEach(([id,title,sub],i)=>{
      const col=i%3,row=Math.floor(i/3),geometry=puzzle(4,2.42,{left:col>0,right:true,top:row>0,bottom:row<2});
      make(id,title,sub,geometry);positions[id]=[(col-1)*4.13-1.5,(1-row)*2.55,0];
      const socket=new T.Mesh(geometry,trackM(new T.MeshBasicMaterial({color:'#201f1c'})));socket.position.set(...positions[id]);socket.position.z=-.64;scene.add(socket);
      const edge=new T.LineSegments(trackG(new T.EdgesGeometry(geometry,35)),trackM(new T.LineBasicMaterial({color:'#52473b'})));edge.position.copy(socket.position);scene.add(edge);
      if(CUSTOM[id]){make(`custom-${id}`,...CUSTOM[id],geometry,4,2.42,true);positions[`custom-${id}`]=positions[id];}
    });
    EXTRA.forEach(([id,title,sub],i)=>{make(id,title,sub,puzzle(4,2.42,{left:true,top:i>0,bottom:i<2}));positions[id]=[6.76,(1-i)*2.55,0];});
    make('ai-aif','Input function','CNN vessel detection',objects.get('aif').body.geometry,4,2.42,true,'input-ai');positions['ai-aif']=positions.aif;
    const cluster=make('cluster-aif','Cluster analysis','Input function',objects.get('aif').body.geometry,4,2.42,true,'cluster');positions['cluster-aif']=positions.aif;
    // Three separated groups of raised dots make the clustering idea visible
    // on the same module face, without adding a second diagram or camera move.
    const dotGeometry=trackG(new T.SphereGeometry(.065,14,10)),dotMaterial=trackM(new T.MeshStandardMaterial({color:ink,roughness:.55}));
    for(const [cx,cy] of [[-.75,.66],[0,.79],[.75,.66]]){
      const ringPoints=Array.from({length:40},(_,i)=>new T.Vector3(cx+.25*Math.cos(i*Math.PI/20),cy+.205*Math.sin(i*Math.PI/20),.66));
      const ring=new T.LineLoop(trackG(new T.BufferGeometry().setFromPoints(ringPoints)),trackM(new T.LineBasicMaterial({color:ink})));cluster.group.add(ring);
      for(const [dx,dy] of [[-.10,-.06],[.10,-.06],[0,.10]]){
        const dot=new T.Mesh(dotGeometry,dotMaterial);dot.position.set(cx+dx,cy+dy,.71);dot.castShadow=true;cluster.group.add(dot);
      }
    }
  }else if(mode==='paper'){
    paperScene=createPaperScene({T,holder,scene,make,puzzle,extrude,trackG,trackM,modules:MODULES,copper,ink,scenario});
  }else{
    FOLDERS.forEach((f,i)=>make(`folder-${i}`,f.title,f.files.join('\n'),folderGeometry(),6,2.44,false,'folder'));
    const loadGeometry=puzzle(3.8,4.4,{right:true});
    make('loader','Load','Convert to NIfTI',loadGeometry,3.8,4.4,false,'loader');
    make('assistant','AI-assisted Setup','Optional local text model',loadGeometry,3.8,4.4,true,'loader');
    METHODS.forEach((m,i)=>make(m.id,m.title,m.choices,puzzle(4.2,2.42,{left:true,right:true,top:i>0,bottom:i<2}),4.2,2.42,false,'method'));
    make('analysis','Analysis','Maps + summaries',puzzle(4,2.6,{left:true}),4,2.6);
    make('confirm','Confirm','Input mappings',puzzle(2.5,1.55),2.5,1.55,true,'confirm');
    for(const id of ['loader','assistant'])for(let i=0;i<4;i++){
      const port=new T.Mesh(trackG(new T.SphereGeometry(.065,12,8)),trackM(new T.MeshBasicMaterial({color:id==='assistant'?'#ffe6bf':'#8e6244'})));
      port.position.set(-1.78,1.25-i*.79,.63);objects.get(id).group.add(port);
    }
    const wireColors=['#d2ad80','#bfb5a3','#c38c68','#a5bbb5'];
    function wire(id,from,to,color,radius=.029){
      const a=new T.Vector3(...from),b=new T.Vector3(...to),dx=(b.x-a.x)*.53;
      const curve=new T.CubicBezierCurve3(a,new T.Vector3(a.x+dx,a.y,a.z),new T.Vector3(b.x-dx,b.y,b.z),b);
      const geometry=trackG(new T.TubeGeometry(curve,64,radius,6,false));
      const mesh=new T.Mesh(geometry,trackM(new T.MeshBasicMaterial({color})));scene.add(mesh);
      let arrow=null;
      if(['manual-output','to-confirm','confirmed-output'].includes(id)){
        arrow=new T.Mesh(trackG(new T.ConeGeometry(.105,.3,12)),mesh.material);
        arrow.position.copy(curve.getPoint(.86));arrow.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),curve.getTangent(.86));scene.add(arrow);
      }
      const value={id,curve,mesh,arrow,count:geometry.index.count,progress:0};wires.push(value);return value;
    }
    FOLDERS.forEach((f,i)=>f.roles.forEach((role,j)=>wire(`file-${i}-${j}`,[INPUT_LAYOUT.folderX+3.05*INPUT_LAYOUT.folderScale,(1-i)*3.05+(.13-j*.39)*INPUT_LAYOUT.folderScale,.42],[INPUT_LAYOUT.loaderX-1.78,1.25-role*.79,.65],wireColors[role],.026)));
    METHODS.forEach((m,i)=>{
      wire(`method-in-${i}`,[-2.4,0,.3],[-.35,(1-i)*2.55,.3],'#d2ad80',.034);
      wire(`method-out-${i}`,[3.77,(1-i)*2.55,.3],[4.6,0,.3],'#d2ad80',.034);
    });
    wire('manual-output',[4.6,0,.3],[9.15,0,.3],'#d2ad80',.04);
    wire('to-confirm',[4.6,0,.3],[5.14,0,.3],'#efaa72',.04);
    wire('confirmed-output',[7.7,0,.3],[9.15,0,.3],'#efaa72',.04);
  }
  const pointerShape=new T.Shape();pointerShape.moveTo(0,0);pointerShape.lineTo(.14,-.52);pointerShape.lineTo(.27,-.36);pointerShape.lineTo(.5,-.35);pointerShape.closePath();
  const pointer=new T.Mesh(trackG(new T.ShapeGeometry(pointerShape)),trackM(new T.MeshBasicMaterial({color:'#fff4e1',side:T.DoubleSide})));scene.add(pointer);
  const confirmButton=node('button','pbrain-confirm-hit');confirmButton.type='button';confirmButton.setAttribute('aria-label','Confirm input mappings');confirmButton.title='Confirm input mappings, then run the configured analysis';
  confirmButton.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();
    if(state===3&&holder.dataset.pbrainPhase==='awaiting-confirmation')holder.dispatchEvent(new CustomEvent('scene-auto-advance',{bubbles:true,detail:{step:route}}));
  });labels.append(confirmButton);
  let width=1,height=1,state=0,route=0,start=0,raf=0,dead=false,animating=false;
  const durations=mode==='modules'?[0,2100,1900,1450,1800,1800]:mode==='paper'?[0,2200,scenario==='patients'?2400:2000,scenario==='patients'?2600:2200]:[0,6500,1250,1450,1250];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  // Shuffle per visit; piece arrivals never depend on camera movement.
  const arrival=MODULES.map(m=>m[0]);
  for(let i=arrival.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arrival[i],arrival[j]]=[arrival[j],arrival[i]];}
  holder.dataset.pbrainArrivalOrder=arrival.join(',');
  function place(id,xyz,visible=true,rot=0){
    const obj=objects.get(id);obj.group.visible=visible;obj.group.position.set(...xyz);obj.group.rotation.set(rot*.65,rot,rot*.28);
  }
  function stepModules(ms,settled){
    for(const obj of objects.values())obj.group.visible=false;pointer.visible=false;
    MODULES.forEach(([id],i)=>{
      const p=positions[id];if(state===0)return;
      if(state===1&&!settled){
        const rank=arrival.indexOf(id),u=ease((ms-rank*155)/700),direction=i%2?1:-1,row=Math.floor(i/3);
        const lift=[1,2,2.8][row],drift=row===0?-.4:((i%3)-1)*.6;
        place(id,[p[0]+direction*(1-u)*1.8,p[1]+(1-u)*drift,p[2]+(1-u)*lift],ms>=rank*155,(1-u)*direction*.11);
      }else if(state>=4&&id==='aif'){
        const outgoing=state===5?'ai-aif':id,incoming=state===5?'cluster-aif':'ai-aif';
        if(!settled){
          const up=ease(ms/320),out=ease((ms-320)/450),into=ease((ms-820)/700);
          place(outgoing,[p[0]-out*23,p[1],p[2]+up*1.5],ms<790,-up*.075);
          place(incoming,[p[0]+(1-into)*1.8,p[1],p[2]+(1-into)*1.7],ms>=820,(1-into)*.075);
        }else place(incoming,p);
      }else if(state>=2&&CUSTOM[id]){
        const rank=Object.keys(CUSTOM).indexOf(id),t=ms-rank*110;
        if(state===2&&!settled){
          const lift=[1,1.8,2.5][Math.floor(i/3)],up=ease(t/280),out=ease((t-280)/470),into=ease((t-800)/700);
          place(id,[p[0]-out*23,p[1],p[2]+up*lift],t<760,-up*.075);
          place(`custom-${id}`,[p[0]+(1-into)*2.5,p[1],p[2]+(1-into)*lift],t>=800,(1-into)*.075);
        }else place(`custom-${id}`,p);
      }else place(id,p);
    });
    if(state>=3)EXTRA.forEach(([id],i)=>{
      const p=positions[id],u=settled||state>3?1:ease((ms-i*210)/850);
      place(id,[p[0]+(1-u)*2.8,p[1],p[2]+(1-u)*.65],settled||state>3||ms>=i*210,(1-u)*.075);
    });
    holder.dataset.pbrainPhase=['empty','assembled','customised','expanded','cnn-input-function','cluster-input-function'][state];
  }
  function stepInputs(ms,settled){
    for(const obj of objects.values())obj.group.visible=false;
    FOLDERS.forEach((_,i)=>{
      const u=state===0?0:state===1&&route===1&&!settled?ease(ms/750):1;
      place(`folder-${i}`,[mix((i-1)*8.5,INPUT_LAYOUT.folderX,u),mix(0,(1-i)*3.05,u),0]);
      objects.get(`folder-${i}`).group.scale.setScalar(mix(1,INPUT_LAYOUT.folderScale,u));
    });
    holder.dataset.pbrainMethodsSelected='0';holder.dataset.pbrainMethodChoices='{}';
    pointer.visible=false;if(state===0){holder.dataset.pbrainPhase='files';return;}
    place('analysis',[INPUT_LAYOUT.analysisX,0,0]);
    const analysis=objects.get('analysis');analysis.custom=state===4;analysis.face.color.set(state===4?copper:faceColor);
    analysis.sub=state===1&&route===2?'Waiting for methods':state===2?'Waiting for setup':state===3?'Waiting for confirmation':state===4?'Maps + summaries':'Quantitative pipeline';drawLabel(analysis);
    if(state===1){const u=settled||route>=2?1:ease(ms/750);place('loader',[INPUT_LAYOUT.loaderX,0,(1-u)*3.2],true,(1-u)*.12);}
    else if(state===2&&!settled){
      const out=ease(ms/560),into=ease((ms-600)/600);
      place('loader',[INPUT_LAYOUT.loaderX-out*1.7,out*.6,out*3.8],ms<580,-out*.15);
      place('assistant',[INPUT_LAYOUT.loaderX+(1-into),0,(1-into)*3.8],ms>=600,(1-into)*.12);
    }else place('assistant',[INPUT_LAYOUT.loaderX,0,0]);
    const assistant=objects.get('assistant');assistant.status=state===2?'Ready to map inputs':state===4?'Approved inputs':'Proposed inputs';drawLabel(assistant);
    const choices={};
    METHODS.forEach((method,i)=>{
      const obj=objects.get(method.id),progress=methodProgress(i,ms,settled);
      obj.selected=progress>=.85;obj.custom=false;
      obj.sub=obj.selected?method.selected:method.choices;
      obj.status=state>=2?'Study setting':obj.selected?'Selected':'Choose method';
      obj.face.color.set(faceColor);
      place(method.id,[INPUT_LAYOUT.methodX,(1-i)*2.55,0]);drawLabel(obj);
      if(obj.selected)choices[method.id]=method.selected;
    });
    holder.dataset.pbrainMethodsSelected=String(Object.keys(choices).length);holder.dataset.pbrainMethodChoices=JSON.stringify(choices);
    if(state>=3){
      const confirm=objects.get('confirm');confirm.title=state===4?'Confirmed ✓':'Confirm';confirm.sub=state===4?'Approved inputs':'Input mappings';drawLabel(confirm);
      place('confirm',[INPUT_LAYOUT.confirmX,0,0],state===4||settled||ms>=1200);
    }
    holder.dataset.pbrainPhase=state===1?(route===1?'manual-ready':route===2?(settled?'manual-load-complete':'manual-loading'):settled?'manual-complete':'manual-methods'):state===2?(settled?'assistant-ready':'assistant-arriving'):state===3?(settled||ms>=1380?'awaiting-confirmation':'assisted-setup'):'analysing';
  }
  function methodProgress(i,ms,settled){
    if(state===0||route<=2)return 0;
    if(settled||state>=2)return 1;
    return clamp((ms-3800-i*620)/420);
  }
  function drawWires(ms,settled){
    let complete=0;pointer.visible=false;
    if(route===1){
      for(const wire of wires){wire.progress=0;wire.mesh.visible=false;if(wire.arrow)wire.arrow.visible=false;}
      holder.dataset.pbrainWires='0';holder.dataset.pbrainMethodWires='0';holder.dataset.pbrainAnalysisFlow='0';return;
    }
    for(const [i,wire] of wires.entries()){
      let progress=0;
      if((state===1||state>=3)&&wire.id.startsWith('file-')){
        progress=settled||state===4?1:state===1?clamp((ms-850-i*320)/320):clamp((ms-30-(i%3)*35)/280);
        if(state===1&&!settled&&progress>0&&progress<1){pointer.visible=true;pointer.position.copy(wire.curve.getPoint(progress));pointer.position.z+=.45;}
        if(progress===1)complete++;
      }else if(wire.id.startsWith('method-')&&((state===1&&route===3)||state>=3)){
        const [,direction,index]=wire.id.split('-'),m=Number(index);
        progress=settled||state===4?1:state===1?clamp((ms-(direction==='in'?3800:4230)-m*620)/270):clamp((ms-(direction==='in'?420:760)-m*140)/(direction==='in'?160:180));
      }else if(wire.id==='manual-output'&&state===1&&route===3)progress=settled?1:clamp((ms-5900)/500);
      else if(wire.id==='to-confirm'&&state>=3)progress=settled||state===4?1:clamp((ms-1240)/120);
      else if(wire.id==='confirmed-output'&&state===4)progress=settled?1:clamp((ms-200)/650);
      wire.progress=progress;wire.mesh.visible=progress>0;wire.mesh.geometry.setDrawRange(0,Math.floor(wire.count*progress/6)*6);
      if(wire.arrow)wire.arrow.visible=progress>=.86;
    }
    if(state===1&&!settled)METHODS.forEach((method,i)=>{
      const progress=methodProgress(i,ms,settled);
      if(progress>0&&progress<1){pointer.visible=true;pointer.position.set(INPUT_LAYOUT.methodX+1.25,(1-i)*2.55-.05,.85);}
    });
    holder.dataset.pbrainWires=String(complete);
    holder.dataset.pbrainMethodWires=String(wires.filter(w=>w.id.startsWith('method-')&&w.progress>0).length);
    const output=wires.find(w=>w.id===(state===1?'manual-output':'confirmed-output'));holder.dataset.pbrainAnalysisFlow=String(output?.progress||0);
  }
  function projectPoint(obj,x,y,z){return obj.group.localToWorld(new T.Vector3(x,y,z)).project(camera);}
  function layoutLabels(){
    for(const obj of objects.values()){
      const {semantic,w,h}=obj;semantic.style.display=obj.group.visible?'':'none';if(!obj.group.visible)continue;
      const z=obj.lettering.position.z,tl=projectPoint(obj,-w/2,h/2,z),tr=projectPoint(obj,w/2,h/2,z),bl=projectPoint(obj,-w/2,-h/2,z);
      const x=(tl.x+1)*width/2,y=(1-tl.y)*height/2;
      const ax=(tr.x-tl.x)*width/2,ay=(tl.y-tr.y)*height/2,bx=(bl.x-tl.x)*width/2,by=(tl.y-bl.y)*height/2;
      semantic.style.width=`${w*100}px`;semantic.style.height=`${h*100}px`;
      semantic.style.transform=`matrix(${ax/(w*100)},${ay/(w*100)},${bx/(h*100)},${by/(h*100)},${x},${y})`;
      semantic.dataset.faceSlope=String(ay/ax);semantic.dataset.worldPosition=obj.group.position.toArray().join(',');
    }
    const confirm=objects.get('confirm'),ready=mode==='inputs'&&state===3&&holder.dataset.pbrainPhase==='awaiting-confirmation';
    confirmButton.hidden=!ready;confirmButton.disabled=!ready;
    if(ready){confirmButton.style.cssText=confirm.semantic.style.cssText;confirmButton.style.display='block';}
  }
  function paint(now){
    if(dead)return;
    const duration=mode==='inputs'?([0,750,2880,2700,1250,1450,1250][route]):durations[state];
    const elapsed=animating?now-start:duration,settled=!animating||elapsed>=duration;
    const ms=elapsed+(mode==='inputs'?(route===2?850:route===3?3800:0):0);
    if(mode==='modules')stepModules(ms,settled);else if(mode==='paper'){pointer.visible=false;paperScene.paint(state,ms,settled);}else{stepInputs(ms,settled);drawWires(ms,settled);}
    scene.updateMatrixWorld();renderer.render(scene,camera);layoutLabels();holder.dataset.pbrainAnimating=String(!settled);
    holder.dataset.pbrainVisible=[...objects.values()].filter(o=>o.group.visible).map(o=>o.id).join(',');
    if(!settled)raf=requestAnimationFrame(paint);else{raf=0;animating=false;}
  }
  function resize(){
    cancelAnimationFrame(raf);raf=0;const r=viewport.getBoundingClientRect();width=Math.max(1,r.width);height=Math.max(1,r.height);renderer.setSize(width,height,false);
    const aspect=width/height,worldH=Math.max(9.7,(mode==='modules'?23.5:28.8)/aspect),cx=mode==='modules'?.6:0;
    camera.left=-worldH*aspect/2;camera.right=worldH*aspect/2;camera.top=worldH/2;camera.bottom=-worldH/2;
    camera.position.set(cx+2.7,-11,19);camera.lookAt(cx,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    holder.dataset.pbrainCamera=JSON.stringify([camera.left,camera.right,camera.top,camera.bottom,...camera.position.toArray()]);paint(performance.now());
  }
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(viewport);
  // The editor owns spiralEdit; redraw its text onto the actual face texture.
  const editObserver=new MutationObserver(records=>{
    if(dead)return;let changed=false;
    for(const obj of objects.values())if(records.some(r=>r.target===obj.semantic&&r.attributeName==='data-editor-applied')){drawLabel(obj);changed=true;}
    if(changed)renderer.render(scene,camera);
  });editObserver.observe(labels,{attributes:true,subtree:true,attributeFilter:['data-editor-applied']});
  const contextLost=e=>{e.preventDefault();holder.dataset.pbrainReady='context-lost';};
  const contextRestored=()=>{holder.dataset.pbrainReady='true';paint(performance.now());};
  renderer.domElement.addEventListener('webglcontextlost',contextLost);renderer.domElement.addEventListener('webglcontextrestored',contextRestored);
  resize();
  return {
    setStep(next,nav={}){
      if(dead)return;cancelAnimationFrame(raf);raf=0;route=next;
      state=mode==='inputs'?INPUT_FLOW_STATES[next]:mode==='modules'?MODULE_FLOW_STATES[next]:next;
      const asidePause=mode==='modules'&&(next===5||next===6);
      holder.dataset.pbrainFlowState=String(state);
      animating=!!durations[state]&&!asidePause&&!nav.settled&&!nav.directEnd&&!nav.backward&&!reduced.matches;start=performance.now();paint(start);
    },
    dispose(){
      if(dead)return;dead=true;cancelAnimationFrame(raf);resizeObserver.disconnect();editObserver.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost',contextLost);renderer.domElement.removeEventListener('webglcontextrestored',contextRestored);
      for(const texture of textures)texture.dispose();for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();renderer.dispose();renderer.forceContextLoss();
    },
  };
}
