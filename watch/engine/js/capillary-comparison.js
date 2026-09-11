// Anatomy is the released H01 triangle surface, cropped and smoothed in Blender.
// Perfusion and calibre changes are illustrative manipulations of that fixed anatomy.
export async function createCapillaryComparison(T,view,holder){
 const response=await fetch('decks/assets/defense/models/h01-capillary-model.json');if(!response.ok)throw new Error('H01 vessel model unavailable');const asset=await response.json();
 const scene=new T.Scene(),camera=new T.OrthographicCamera(-18,18,5,-5,.1,100);camera.position.set(0,0,30);
 scene.add(new T.HemisphereLight(0xdde8dc,0x152322,1.2));
 for(const [color,power,pos] of [[0xf4d5b8,1.8,[-5,8,14]],[0x65b9c8,.9,[11,-4,8]],[0xa4c8d0,.65,[-13,-1,4]]]){const l=new T.DirectionalLight(color,power);l.position.set(...pos);scene.add(l);}
 const el=(c,t)=>{const n=document.createElement('div');n.className=c;n.textContent=t;return n;};
 const overlay=el('capillary-comparison-labels',''),titles=[el('capillary-side-title capillary-reference',''),el('capillary-side-title capillary-hypothesis','')],captions=[el('capillary-side-caption capillary-reference',''),el('capillary-side-caption capillary-hypothesis','')];
 const source=el('capillary-anatomy-source','Anatomy: H01 human cortex · CC BY 4.0 · Changes are illustrative');overlay.append(...titles,...captions,source);view.append(overlay);
 const data=asset.meshes.map(m=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(m.positions,3));g.setIndex(m.indices);g.computeVertexNormals();g.computeBoundingBox();const c=g.boundingBox.getCenter(new T.Vector3());return{g,c,centres:m.centres,positions:m.positions,name:m.name};});
 const nodes=asset.nodes.map(p=>new T.Vector3(...p));
 const bloodGeo=new T.SphereGeometry(.038,8,6),bloodMat=new T.MeshBasicMaterial({color:0xffc7a2,transparent:true,opacity:.84,depthWrite:false,depthTest:false}),dummy=new T.Object3D();
 const groups=[-8.7,8.7].map(x=>{const g=new T.Group();g.position.set(x,-.1,0);g.rotation.x=-.34;scene.add(g);const parts=data.map((s,i)=>{const material=new T.MeshStandardMaterial({color:0x559899,roughness:.44,metalness:.06,transparent:true,opacity:.87,side:T.DoubleSide,depthWrite:true});const mesh=new T.Mesh(s.g.clone(),material);g.add(mesh);return{mesh,index:i,c:s.c,original:s.positions,centres:s.centres,lastRadius:1};});
 const blood=new T.InstancedMesh(bloodGeo,bloodMat.clone(),asset.edges.length);blood.renderOrder=5;g.add(blood);return{g,parts,blood};});
 // Use one released vessel surface as the enlarged calibre example as well.
 const closeup=await fetch('decks/assets/defense/models/capillary-cutaway.json').then(r=>r.json()).then(d=>d.meshes[0]);
 const cal=[-8.7,8.7].map(x=>{const g=new T.Group();g.position.set(x,0,0);scene.add(g);const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(closeup.positions,3));geo.setIndex(closeup.indices);geo.computeVertexNormals();g.rotation.set(.3,.50,-.15);
 const mesh=new T.Mesh(geo,new T.MeshStandardMaterial({color:0x659f9e,roughness:.4,metalness:.08,side:T.DoubleSide}));g.add(mesh);const ghost=new T.LineSegments(new T.EdgesGeometry(geo,20),new T.LineBasicMaterial({color:0xc9b49c,transparent:true,opacity:.45,depthWrite:false}));g.add(ghost);return{g,mesh,ghost};});
 let mode='network',active=false,start=0,instant=true;
 const smooth=x=>{x=Math.min(1,Math.max(0,x));return x*x*(3-2*x);};
 function perfusion(y,x,side,k){const selected=y>1.0||(y<-.9&&x>-.9);if(mode==='perfused'&&side&&selected)return 1-k;if(mode==='recruitment'&&selected)return side?(x>1.4?k:0):k;return 1;}
 function setState(s,nav={}){mode=s.visual;active=['network','perfused','recruitment','tone','tube','geometry'].includes(mode);overlay.hidden=!active;if(!active)return;start=performance.now();instant=!!(nav.settled||nav.backward||nav.directEnd||matchMedia('(prefers-reduced-motion: reduce)').matches);
 const text={network:['Reference','Same anatomy','Perfused network','Change one feature at a time'],perfused:['Reference','Fewer perfused capillaries','Blood traverses the network','Some paths no longer carry blood'],recruitment:['Recruitment response','Reduced recruitment','More paths become perfused','A smaller increase in perfused paths'],tone:['Reference calibre','Altered vascular tone','Original vessel lumen','Same anatomy · narrower lumen'],tube:['Reference capillary','The same capillary','Original lumen','Calibre as a modelling question'],geometry:['Reference capillary','Reduced calibre','Cylindrical approximation: surface ∝ r','Cylindrical approximation: volume ∝ r²']}[mode];titles.forEach((n,i)=>n.textContent=text[i]);captions.forEach((n,i)=>n.textContent=text[i+2]);source.textContent=['tube','geometry'].includes(mode)?'Modelled capillary cutaway · Cylindrical approximation':'Anatomy: H01 human cortex · CC BY 4.0 · Changes are illustrative';holder.dataset.capillaryMode=mode;holder.dataset.capillaryComparison='true';holder.dataset.capillarySource='H01 released surface';}
 function draw(renderer,now,w,h){if(!active)return false;const k=instant?1:smooth((now-start)/1300),tube=['tube','geometry'].includes(mode);groups.forEach((group,side)=>{group.g.visible=!tube;if(tube)return;
 for(const p of group.parts){const perf=perfusion(p.c.y,p.c.x,side,k),r=mode==='tone'&&side?1-.3*k:1;p.mesh.material.opacity=.11+.76*perf;p.mesh.material.depthWrite=perf>.5;p.mesh.material.color.setHex(perf<.05?0x45514f:0x559899);
 if(Math.abs(r-p.lastRadius)>.002){const a=p.mesh.geometry.attributes.position;for(let j=0;j<a.array.length;j++)a.array[j]=p.centres[j]+(p.original[j]-p.centres[j])*r;a.needsUpdate=true;p.lastRadius=r;}
 }
 for(let i=0;i<asset.edges.length;i++){const [a,b]=asset.edges[i],u=(now*.00023+i*.618)%1,p=nodes[a].clone().lerp(nodes[b],u),perf=perfusion(p.y,p.x,side,k);dummy.position.copy(p);dummy.scale.setScalar(perf>.04&&i%5===0?perf:0);dummy.updateMatrix();group.blood.setMatrixAt(i,dummy.matrix);}group.blood.instanceMatrix.needsUpdate=true;});
 cal.forEach((c,i)=>{c.g.visible=tube;const r=i&&mode==='geometry'?1-.15*k:1;c.mesh.scale.set(1,r,r);c.ghost.visible=mode==='geometry';});holder.dataset.capillaryRadius=String(mode==='tone'?1-.3*k:mode==='geometry'?1-.15*k:1);holder.dataset.capillarySettled=String(k>=1);
 camera.top=18*h/w;camera.bottom=-camera.top;camera.updateProjectionMatrix();renderer.render(scene,camera);return true;}
 return{setState,draw,dispose(){overlay.remove();const gs=new Set(),ms=new Set();scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material)ms.add(o.material);});data.forEach(d=>gs.add(d.g));gs.forEach(x=>x.dispose());ms.forEach(x=>x.dispose());}};
}
