import {Field} from './gate-field.js';

// The original presentation Field renderer and bloom, with a page lifecycle.
export function createGateVisuals(canvas) {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const field=new Field(canvas,{strength:1,gap:22});
  let running=false;
  const sync=()=>{const animate=!reduced.matches&&!document.hidden;
    if(animate&&!running){field.start();running=true;}
    else if(!animate&&running){field.stop();running=false;}
    if(!animate)field.frame();
  };
  reduced.addEventListener('change',sync);
  document.addEventListener('visibilitychange',sync);
  const resize=()=>{if(!running)field.frame();};
  addEventListener('resize',resize);
  const dispose=()=>{field.stop();running=false;reduced.removeEventListener('change',sync);document.removeEventListener('visibilitychange',sync);removeEventListener('resize',resize);};
  addEventListener('pagehide',dispose,{once:true});
  sync();
  return {field,dispose,reducedMotion:()=>reduced.matches,
    async bloom(){if(reduced.matches||document.hidden){field.frame();return;}
      canvas.dataset.transition='bloom';
      await field.run({kind:'bloom',ms:1100,originX:.3,originY:.5});
      canvas.dataset.transition='idle';}
  };
}

export async function fileComplaintPaper(paper,bin,{reducedMotion=false}={}) {
  if(reducedMotion)return;
  const from=paper.getBoundingClientRect(),to=bin.getBoundingClientRect();
  const x=to.x+to.width*.5-from.x-from.width*.5;
  const y=to.y+to.height*.38-from.y-from.height*.5;
  const folded='polygon(16% 0,65% 5%,100% 30%,88% 79%,62% 100%,22% 88%,0 49%)';
  const animation=paper.animate([
    {transform:'translate(0,0) rotate(0deg) scale(1)',clipPath:'polygon(0 0,100% 0,100% 100%,0 100%)',opacity:1,offset:0},
    {transform:'translate(0,-10px) rotate(-9deg) scale(.38,.52)',clipPath:folded,opacity:1,offset:.3},
    {transform:'translate(0,-20px) rotate(22deg) scale(.14,.24)',clipPath:folded,opacity:1,offset:.52},
    {transform:`translate(${x}px,${y-35}px) rotate(120deg) scale(.12,.2)`,clipPath:folded,opacity:1,offset:.82},
    {transform:`translate(${x}px,${y+12}px) rotate(145deg) scale(.1,.17)`,clipPath:folded,opacity:0,offset:1}
  ],{duration:1250,easing:'cubic-bezier(.35,0,.65,1)',fill:'forwards'});
  await animation.finished.catch(()=>{});
  bin.animate([{transform:'rotate(0deg)'},{transform:'rotate(6deg)'},{transform:'rotate(-3deg)'},{transform:'rotate(0deg)'}],{duration:330});
}
