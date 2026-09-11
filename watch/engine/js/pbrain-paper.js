/* A manuscript-to-module visual metaphor. The researcher implements the model;
 * this scene does not imply that p-Brain generates executable code from prose. */
const clamp=n=>Math.max(0,Math.min(1,n));
const ease=n=>{n=clamp(n);return n*n*(3-2*n);};
const mix=(a,b,t)=>a+(b-a)*t;

export function createPaperScene({T,holder,scene,make,puzzle,extrude,trackG,trackM,modules,copper,ink,scenario='method'}){
  const pageColor='#eee5d4',paperX=-7.4,paperW=7.6,paperH=8.8,boardX=6.2,boardScale=.72;
  const patients=scenario==='patients';
  const contributions=patients?[
    {id:'aif',phrase:'our custom input function',title:'Your input\nfunction',sub:'Study-specific AIF',floating:[-1.35,1.65,1.35]},
    {id:'tissue',phrase:'our tissue regions',title:'Your tissue\nregions',sub:'Study-specific ROIs',floating:[-1.1,-1.5,1.35]},
  ]:[{id:'model',phrase:'our custom kinetic model',title:'Your model',sub:'Reusable module',floating:[-1.3,0,1.35]}];
  const sheetShape=new T.Shape();
  sheetShape.moveTo(-paperW/2,-paperH/2);sheetShape.lineTo(paperW/2,-paperH/2);
  sheetShape.lineTo(paperW/2,paperH/2);sheetShape.lineTo(-paperW/2,paperH/2);sheetShape.closePath();
  const sheetGeometry=extrude(sheetShape,.06,.018);
  const paper=make('manuscript','Research manuscript','Illustrative Methods section',sheetGeometry,paperW,paperH,false,'paper');
  // The manuscript has a full paper-colored background. Draw it as an opaque
  // surface so later transparent module lettering cannot disturb its depth.
  Object.assign(paper.lettering.material,{transparent:false,depthWrite:true,alphaTest:0,polygonOffset:false});paper.lettering.material.needsUpdate=true;
  paper.group.position.set(paperX,0,0);
  const paperBacks=[];
  for(let i=1;i<=2;i++){
    const sheet=new T.Mesh(sheetGeometry,trackM(new T.MeshStandardMaterial({color:'#a89a81',roughness:.9})));
    sheet.position.set(paperX+i*.10,-i*.07,-i*.055);sheet.rotation.z=-i*.004;sheet.castShadow=true;scene.add(sheet);paperBacks.push(sheet);
  }

  // Draw the manuscript once. Opaque masks reveal actual typeset characters,
  // avoiding a large canvas-texture upload on every frame of the typing effect.
  const c=paper.canvas.getContext('2d'),unit=paper.canvas.width/paperW,margin=-3.25;
  const lines=patients?[
    {text:'Perfusion in a patient cohort',y:-3.43,size:.44,weight:600,serif:true},
    {text:'A study with p-Brain',y:-2.87,size:.44,weight:600,serif:true},
    {text:'PATIENT COHORT STUDY',y:-2.18,size:.20,weight:600},
    {text:'ABSTRACT',y:-1.48,size:.24,weight:650},
    {text:'We studied cerebral perfusion in a patient cohort.',y:-.97,size:.265},
    {text:'Regional estimates followed the study protocol.',y:-.56,size:.265},
    {text:'METHODS',y:.02,size:.25,weight:650},
    {text:'We analysed the patients with p-Brain using',y:.59,size:.30},
    {text:'our custom input function',y:1.04,size:.34,highlight:'aif'},
    {text:'and our tissue regions.',y:1.51,size:.34,highlight:'tissue'},
    {text:'Shared loading, conversion and model fitting.',y:2.25,size:.265},
    {text:'Outputs were summarised within the study regions.',y:2.65,size:.265},
  ]:[
    {text:'A new kinetic model',y:-3.43,size:.50,weight:600,serif:true},
    {text:'for DCE-MRI',y:-2.87,size:.50,weight:600,serif:true},
    {text:'RESEARCH MANUSCRIPT',y:-2.18,size:.20,weight:600},
    {text:'ABSTRACT',y:-1.48,size:.24,weight:650},
    {text:'A modular workflow for quantitative imaging.',y:-.97,size:.265},
    {text:'Analysis methods can be adapted to the study.',y:-.56,size:.265},
    {text:'METHODS',y:.12,size:.25,weight:650},
    {text:'We analysed the data with p-Brain',y:.75,size:.34},
    {text:'using our custom kinetic model.',y:1.23,size:.34,highlight:'model'},
    {text:'The model implements the p-Brain interface.',y:2.13,size:.265},
    {text:'Shared inputs. Reusable outputs.',y:2.55,size:.265},
  ];
  function font(line){return `${line.weight||400} ${line.size}px ${line.serif?'Georgia,serif':'"Helvetica Neue",Arial,sans-serif'}`;}
  c.fillStyle=pageColor;c.fillRect(0,0,paper.canvas.width,paper.canvas.height);
  c.save();c.translate(paper.canvas.width/2,paper.canvas.height/2);c.scale(unit,unit);c.textBaseline='middle';c.textAlign='left';
  const highlights={};
  for(const line of lines){
    c.font=font(line);
    while(c.measureText(line.text).width>6.5){line.size-=.005;c.font=font(line);}
    line.width=c.measureText(line.text).width;
    line.prefixWidths=Array.from({length:line.text.length+1},(_,i)=>c.measureText(line.text.slice(0,i)).width);
    if(line.highlight){
      const contribution=contributions.find(item=>item.id===line.highlight);
      const before=c.measureText(line.text.slice(0,line.text.indexOf(contribution.phrase))).width,wordWidth=c.measureText(contribution.phrase).width;
      const highlight={x:margin+before-.09,y:line.y-line.size*.77,w:wordWidth+.18,h:line.size*1.56};highlights[line.highlight]=highlight;
      c.fillStyle='#da7b49';c.fillRect(highlight.x,highlight.y,highlight.w,highlight.h);
    }
    c.fillStyle=ink;c.fillText(line.text,margin,line.y);
  }
  c.strokeStyle='#bdb09a';c.lineWidth=.012;c.beginPath();c.moveTo(margin,3.36);c.lineTo(-margin,3.36);c.stroke();
  c.fillStyle='#766b5d';c.font='.19px "Helvetica Neue",Arial,sans-serif';c.fillText('Illustrative manuscript',margin,3.67);
  c.restore();paper.texture.needsUpdate=true;
  const totalChars=lines.reduce((sum,line)=>sum+line.text.length,0);
  const maskMaterial=trackM(new T.MeshBasicMaterial({color:pageColor,toneMapped:false}));
  const maskGeometry=trackG(new T.PlaneGeometry(1,1));
  lines.forEach(line=>{
    const mask=new T.Mesh(maskGeometry,maskMaterial);mask.renderOrder=3;paper.group.add(mask);line.mask=mask;
  });
  const caret=new T.Mesh(maskGeometry,trackM(new T.MeshBasicMaterial({color:ink,toneMapped:false,transparent:true,depthWrite:false})));
  caret.renderOrder=4;paper.group.add(caret);
  function typePaper(chars,typing){
    let remaining=chars,cursorPlaced=false;const readable=[];
    for(const line of lines){
      const n=Math.min(line.text.length,Math.max(0,remaining));remaining-=line.text.length;
      const from=margin+line.prefixWidths[n],end=paperW/2-.12;
      line.mask.visible=n<line.text.length;
      line.mask.scale.set(Math.max(.001,end-from),line.size*1.9,1);
      line.mask.position.set((from+end)/2,-line.y,.139);
      if(n)readable.push(line.text.slice(0,n));
      if(!cursorPlaced&&n<line.text.length){
        caret.position.set(from+.015,-line.y,.15);caret.scale.set(.025,line.size*1.13,1);cursorPlaced=true;
      }
    }
    caret.visible=typing&&cursorPlaced;
    holder.dataset.pbrainPaperChars=String(chars);holder.dataset.pbrainPaperTotal=String(totalChars);
    const value=readable.join('\n');if(paper.semantic.getAttribute('aria-label')!==value)paper.semantic.setAttribute('aria-label',value||'Blank research manuscript');
  }

  const board=[],slots=new Map();
  modules.forEach(([id,title],i)=>{
    const col=i%3,row=Math.floor(i/3),geometry=puzzle(4,2.42,{left:col>0,right:col<2,top:row>0,bottom:row<2});
    const position=[boardX+(col-1)*4.13*boardScale,(1-row)*2.55*boardScale,0];
    if(contributions.some(item=>item.id===id)){
      const slot=new T.Group();scene.add(slot);slot.position.set(...position);slot.scale.setScalar(boardScale);
      slots.set(id,{slot,geometry,col,row});
      const socket=new T.Mesh(geometry,trackM(new T.MeshBasicMaterial({color:'#24201a'})));socket.position.z=-.62;slot.add(socket);
      const outline=new T.LineSegments(trackG(new T.EdgesGeometry(geometry,35)),trackM(new T.LineBasicMaterial({color:'#c98957'})));outline.position.z=-.61;slot.add(outline);
    }else{
      const obj=make(`paper-${id}`,title,'',geometry);obj.group.position.set(...position);obj.group.scale.setScalar(boardScale);
      board.push({id,obj,position});
    }
  });
  const boardTitle=make('paper-framework','p-Brain','',trackG(new T.PlaneGeometry(8,.8)),8,.8,false,'caption');
  boardTitle.body.visible=false;boardTitle.group.position.set(boardX,3.28,0);
  const bc=boardTitle.canvas.getContext('2d');bc.clearRect(0,0,boardTitle.canvas.width,boardTitle.canvas.height);
  bc.fillStyle='#e8ddca';bc.textAlign='center';bc.textBaseline='middle';bc.font='500 134px Georgia,serif';bc.fillText('p-Brain',boardTitle.canvas.width/2,boardTitle.canvas.height/2);boardTitle.texture.needsUpdate=true;

  // Each contribution retains one continuous mesh as the highlighted strip
  // grows into its matching puzzle. Edge tabs and sockets flatten into the strip.
  const pieces=contributions.map((contribution,index)=>{
  const {slot,geometry,col,row}=slots.get(contribution.id),highlight=highlights[contribution.id];
  const morphGeometry=trackG(geometry.clone()),original=Float32Array.from(morphGeometry.attributes.position.array);
  const piece=make(`paper-custom-${contribution.id}`,contribution.title,contribution.sub,morphGeometry,4,2.42,true);
  const stripScaleX=highlight.w/4,stripScaleY=highlight.h/2.42;
  const source=[paperX+highlight.x+highlight.w/2,-highlight.y-highlight.h/2,.145],floating=contribution.floating;
  const destination=slot.position.toArray();let lastMorph=-1,lastText=null;
  function morph(value){
    if(lastMorph===value)return;lastMorph=value;
    const positions=morphGeometry.attributes.position;
    for(let i=0;i<positions.count;i++){
      const j=i*3,x=original[j],y=original[j+1],z=original[j+2];
      let flatX=Math.max(-2,Math.min(2,x)),flatY=Math.max(-1.21,Math.min(1.21,y));
      if(col>0&&x<-1.38&&Math.abs(y)<.65)flatX=-2;
      if(row<2&&y<-.59&&Math.abs(x)<.65)flatY=-1.21;
      positions.setXYZ(i,mix(flatX*stripScaleX,x,value),mix(flatY*stripScaleY,y,value),mix(z*.025,z,value));
    }
    positions.needsUpdate=true;morphGeometry.computeVertexNormals();morphGeometry.computeBoundingSphere();
    piece.lettering.scale.set(mix(stripScaleX,1,value),mix(stripScaleY,1,value),1);
    piece.lettering.position.z=mix(.019,.60,value);
  }
  function pieceText(phase){
    if(lastText===phase)return;lastText=phase;
    const pc=piece.canvas.getContext('2d'),u=piece.canvas.width/4;
    pc.clearRect(0,0,piece.canvas.width,piece.canvas.height);pc.save();pc.translate(piece.canvas.width/2,piece.canvas.height/2);
    pc.scale(u/(phase==='phrase'?stripScaleX:1),u/(phase==='phrase'?stripScaleY:1));pc.fillStyle=ink;pc.textAlign='center';pc.textBaseline='middle';
    if(phase==='phrase'){pc.font='.34px "Helvetica Neue",Arial,sans-serif';pc.fillText(contribution.phrase,0,0);}
    else{
      const titles=contribution.title.split('\n');pc.font='550 .43px "Helvetica Neue",Arial,sans-serif';
      titles.forEach((title,i)=>pc.fillText(title,.10,-.17+(i-(titles.length-1)/2)*.45));
      pc.font='.23px "Helvetica Neue",Arial,sans-serif';pc.fillText(contribution.sub,.10,titles.length>1?.65:.38);
    }
    pc.restore();piece.texture.needsUpdate=true;
  }
  return {piece,slot,source,floating,destination,morph,pieceText,get unfold(){return lastMorph;},delay:index*320};
  });
  return {
    paint(state,ms,settled){
      paper.group.visible=true;boardTitle.group.visible=state===3;
      paperBacks.forEach(sheet=>sheet.visible=true);
      const chars=state===0?0:state===1&&!settled?Math.floor(totalChars*clamp(ms/1850)):totalChars;
      typePaper(chars,state===0||(state===1&&!settled));
      for(const [i,item] of board.entries()){
        const land=settled?1:ease((ms-i*65)/400);item.obj.group.visible=state===3&&(settled||ms>=i*65);
        item.obj.group.position.set(item.position[0],item.position[1],state===3?(1-land)*.45:0);
        const pulse=state===3&&!settled?Math.sin(Math.PI*clamp((ms-1650-i*35)/270)):0;
        item.obj.face.emissive.set(copper);item.obj.face.emissiveIntensity=pulse*.24;
      }
      for(const item of pieces){
      const {piece,slot,source,floating,destination,morph,pieceText,delay}=item,t=Math.max(0,ms-delay);
      piece.group.visible=state>=2&&(settled||state===3||ms>=delay);slot.visible=state===3;
      if(state===2){
        const travel=settled?1:ease(t/1650),unfold=settled?1:ease((t-330)/1100);
        piece.group.position.set(mix(source[0],floating[0],travel),mix(source[1],floating[1],travel),mix(source[2],floating[2],travel)+Math.sin(Math.PI*travel)*.35);
        piece.group.rotation.set(Math.sin(Math.PI*unfold)*.19,-Math.sin(Math.PI*unfold)*.28,Math.sin(Math.PI*unfold)*.025);piece.group.scale.setScalar(1);
        morph(unfold);pieceText(unfold<.5?'phrase':'model');
        piece.lettering.material.opacity=unfold<.5?1-ease(unfold/.48):ease((unfold-.5)/.43);
      }else if(state===3){
        const travel=settled?1:ease((t-500)/1200);
        piece.group.position.set(mix(floating[0],destination[0],travel),mix(floating[1],destination[1],travel),mix(floating[2],destination[2],travel)+Math.sin(Math.PI*travel)*.42);
        piece.group.rotation.set(0,Math.sin(Math.PI*travel)*.12,0);piece.group.scale.setScalar(mix(1,boardScale,travel));
        morph(1);pieceText('model');piece.lettering.material.opacity=1;
      }
      }
      holder.dataset.pbrainPhase=['blank-manuscript','typed-manuscript','reusable-module','integrated-module'][state];
      holder.dataset.pbrainPaperUnfold=String(state<2?0:state===2?Math.min(...pieces.map(item=>item.unfold)):1);
      holder.dataset.pbrainPaperDocked=String(state===3&&(settled||ms>=1700+pieces.at(-1).delay));
      holder.dataset.pbrainPaperContributions=contributions.map(item=>item.id).join(',');
    },
  };
}
