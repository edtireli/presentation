// The supplied comic dance is reconstructed entirely from individual points.
// No picture, sprite, drawImage, raster plane or private person image is drawn.
export function createDancerRenderer(canvas,{reducedMotion=false}={}) {
  const context=canvas.getContext('2d'),controller=new AbortController();let disposed=false,data=null,lastProgress=0;
  canvas.width=360;canvas.height=540;const durationMs=reducedMotion?1500:3600;
  fetch(new URL('./acknowledgement-dance-points.json',import.meta.url),{signal:controller.signal}).then(r=>{if(!r.ok)throw Error('Point motion unavailable');return r.json();}).then(result=>{if(disposed)return;data=result;canvas.dataset.ready='true';canvas.dataset.rendering='individual-points';render(lastProgress);}).catch(e=>{if(!disposed&&e.name!=='AbortError')canvas.dataset.ready='failed';});
  function render(progress){
    if(disposed)return;lastProgress=Math.max(0,Math.min(1,progress));context.clearRect(0,0,canvas.width,canvas.height);if(!data)return;
    const seconds=lastProgress*durationMs,phase=reducedMotion?0:seconds%data.durationMs;
    let index=0,boundary=0;while(index<data.frameCount-1&&phase>=boundary+data.frameDurationsMs[index]){boundary+=data.frameDurationsMs[index];index++;}
    // A short dissolve between the exact five original poses avoids harsh
    // flicker at their 70-ms boundaries; no pose or body shape is invented.
    const next=(index+1)%data.frameCount,u=reducedMotion?0:Math.max(0,Math.min(1,(phase-boundary)/data.frameDurationsMs[index]));
    const blend=u*u*(3-2*u),scale=.94,ox=(canvas.width-data.width*scale)/2,oy=(canvas.height-data.height*scale)/2;
    const envelope=Math.max(0,Math.min(1,lastProgress/.10,(1-lastProgress)/.15));canvas.dataset.frame=String(index);
    for(let k=0;k<data.points.length;k++){
      const p=data.points[k],a=p[2+index]*(1-blend)+p[2+next]*blend;if(a<.02)continue;
      const light=(p[2+data.frameCount+index]*(1-blend)+p[2+data.frameCount+next]*blend)/100;
      const gold=k%7===0,alpha=envelope*a*(.68+light*.30);
      context.fillStyle=gold?`rgba(196,164,107,${alpha})`:`rgba(240,234,219,${alpha})`;
      context.beginPath();context.arc(ox+p[0]*scale,oy+p[1]*scale,(1.03+light*.16)*scale,0,Math.PI*2);context.fill();
    }
  }
  function dispose(){if(disposed)return;disposed=true;controller.abort();data=null;context.clearRect(0,0,canvas.width,canvas.height);canvas.width=canvas.height=0;}
  return{durationMs,render,dispose};
}
