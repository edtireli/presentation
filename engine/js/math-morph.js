import {renderMath, fitMath} from './math.js';

// Native, keyed equation transitions. Real math-state elements remain the editable
// source of truth; temporary, inaccessible copies exist only while terms move.
export function mountMathMorph(holder, states, nodes, activate) {
  let previous = null, version = 0, raf = 0, layer = null;
  const animations = new Set();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  holder.classList.add('math-morph-enabled');
  const clean = () => {
    version++;
    cancelAnimationFrame(raf);
    for (const animation of animations) animation.cancel();
    animations.clear();
    layer?.remove(); layer = null;
    holder.classList.remove('math-morph-running');
    delete holder.dataset.morphPhase;
  };
  const animate = (node, frames, options) => {
    const animation = node.animate(frames, {fill:'both', ...options});
    animations.add(animation);
    return animation.finished.catch(() => {}).then(() => animations.delete(animation));
  };
  const annotation = node => node.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
  const matches = (node, state) => annotation(node) === state.tex && node.querySelector('.mm-term');
  const capture = node => ({
    fontSize:getComputedStyle(node).fontSize,
    displayFontSize:node.querySelector('.katex-display') ? getComputedStyle(node.querySelector('.katex-display')).fontSize : '',
    translate:node.style.translate, scale:node.style.scale, transformOrigin:node.style.transformOrigin,
    letterSpacing:node.style.letterSpacing, lineHeight:node.style.lineHeight,
    hidden:node.style.getPropertyPriority('visibility')==='important',
  });
  // Non-uniform editor scaling cannot be represented by a typeset term crop.
  // Keep the user's real, scaled equation in that case, without temporary copies.
  const unscaled = ref => !ref.scale || ref.scale==='none' || ref.scale.split(/\s+/).every(x=>Number(x)===1);
  const coordinate = (node, contents=false) => {
    const bounds = holder.getBoundingClientRect();
    let rect = node.getBoundingClientRect();
    if(contents){
      // KaTeX's outer inline box can be only one line high even when a fraction
      // or an integral extends above and below it. Crop the complete visual term.
      const rects=[rect,...[...node.querySelectorAll('*')].map(n=>n.getBoundingClientRect())]
        .filter(r=>r.width>0&&r.height>0);
      const left=Math.min(...rects.map(r=>r.left)),top=Math.min(...rects.map(r=>r.top));
      const right=Math.max(...rects.map(r=>r.right)),bottom=Math.max(...rects.map(r=>r.bottom));
      rect={left,top,width:right-left,height:bottom-top};
    }
    const sx = bounds.width / holder.offsetWidth || 1, sy = bounds.height / holder.offsetHeight || 1;
    return {x:(rect.left-bounds.left)/sx, y:(rect.top-bounds.top)/sy, w:rect.width/sx, h:rect.height/sy};
  };
  const termMap = frame => new Map([...frame.querySelectorAll('.mm-term')].map(node => {
    const key = [...node.classList].find(c => c.startsWith('mm-key-'))?.slice(7);
    return [key, {node, box:coordinate(node,true), text:node.textContent}];
  }).filter(([key])=>key));
  const frame = (tex, reference) => {
    const node = document.createElement('span');
    node.className = 'mm-frame';
    for(const prop of ['fontSize','translate','scale','transformOrigin','letterSpacing','lineHeight'])node.style[prop]=reference[prop];
    renderMath(node,tex,true);
    if(reference.displayFontSize)node.querySelector('.katex-display').style.fontSize=reference.displayFontSize;
    layer.append(node); fitMath(node);
    return node;
  };
  const ghost = (source, term) => {
    // Clip an exact copy of the typeset frame to one semantic term. This retains
    // KaTeX's fraction bars, baselines and integral limits without redrawing glyphs.
    const box=term.box, full=coordinate(source);
    const node=document.createElement('span');node.className='mm-ghost';
    Object.assign(node.style,{left:`${box.x}px`,top:`${box.y}px`,width:`${box.w}px`,height:`${box.h}px`});
    const copy=source.cloneNode(true);copy.className='mm-copy';
    Object.assign(copy.style,{position:'absolute',left:`${full.x-box.x}px`,top:`${full.y-box.y}px`,
      width:`${full.w}px`,height:`${full.h}px`,translate:'none',scale:'none',opacity:'1',visibility:'visible'});
    node.append(copy);layer.append(node);return node;
  };
  const transition = async (from, to, duration, id) => {
    const a=termMap(from),b=termMap(to),work=[],ghosts=[];
    if(!a.size||!b.size)throw Error('Missing semantic equation terms');
    for(const key of new Set([...a.keys(),...b.keys()])) {
      const old=a.get(key),next=b.get(key),same=old&&next&&old.text===next.text;
      if(old){
        const node=ghost(from,old);ghosts.push(node);
        const target=next?.box||old.box,dx=target.x-old.box.x,dy=target.y-old.box.y;
        const frames=same?[{transform:'translate(0,0)',opacity:1},
          {transform:`translate(${dx}px,${dy}px)`,opacity:1}]:[
          {transform:'translate(0,0)',opacity:1,offset:0},
          {transform:`translate(${dx*.2}px,${dy*.2}px)`,opacity:0,offset:.38},
          {transform:`translate(${dx}px,${dy}px)`,opacity:0,offset:1}];
        work.push(animate(node,frames,
          {duration,easing:'cubic-bezier(.22,.75,.2,1)'}));
      }
      if(next&&!same){
        const node=ghost(to,next);ghosts.push(node);
        const start=old?.box||next.box,dx=start.x-next.box.x,dy=start.y-next.box.y;
        work.push(animate(node,[{transform:`translate(${dx}px,${dy}px)`,opacity:0,offset:0},
          {transform:`translate(${dx*.25}px,${dy*.25}px)`,opacity:0,offset:.42},
          {transform:'translate(0,0)',opacity:1,offset:1}],{duration,easing:'cubic-bezier(.22,.75,.2,1)'}));
      }
    }
    from.style.opacity='0';to.style.opacity='0';
    await Promise.all(work);
    if(id!==version)return;
    ghosts.forEach(n=>n.remove());from.remove();to.style.opacity='1';
  };
  // A completed hold must not keep overriding opacity when the next phase
  // hides this frame and replaces it with individual moving terms.
  const hold = (node, duration) => animate(node,[{opacity:1},{opacity:1}],{duration,fill:'none'});
  const play = async (fromIndex, toIndex, id, source) => {
    const target=nodes[toIndex],targetStyle=capture(target);
    // Route edits are applied synchronously after repaint. Read the real current
    // math only now, and never replace a user's custom equation with stock algebra.
    if(id!==version||!holder.isConnected||!matches(target,states[toIndex])||
      targetStyle.hidden||!unscaled(targetStyle)) {activate(toIndex);return;}
    layer=document.createElement('span');layer.className='math-morph-layer';layer.setAttribute('aria-hidden','true');
    layer.setAttribute('inert','');holder.append(layer);holder.classList.add('math-morph-running');
    activate(toIndex);
    let current=frame(states[fromIndex].tex,source);
    const stages=states[toIndex].morph?.frames||[{tex:states[toIndex].tex,duration:900}];
    try {
      for(const stage of stages){
        if(id!==version||!holder.isConnected)return;
        holder.dataset.morphPhase=stage.phase||'moving';
        if(stage.cancel){
          const strokes=[...current.querySelectorAll('.mm-cancel')].map(node=>{
            const line=document.createElement('span');line.className='mm-cancel-stroke';node.append(line);
            return animate(line,[{transform:'rotate(-25deg) scaleX(0)'},{transform:'rotate(-25deg) scaleX(1)'}],
              {duration:stage.duration||500,easing:'ease-out'});
          });
          await Promise.all(strokes);
        }else{
          const next=frame(stage.tex,targetStyle);next.style.opacity='0';
          await transition(current,next,stage.duration||800,id);current=next;
        }
        if(id!==version)return;
        if(stage.hold)await hold(current,stage.hold);
      }
    } finally {
      if(id===version){clean();activate(toIndex);}
    }
  };
  const dispose=()=>{clean();observer.disconnect();reduced.removeEventListener('change',settle);};
  const observer=new MutationObserver(()=>{if(!holder.isConnected)dispose();});
  let observing=false;
  const settle=()=>{clean();if(previous!==null)activate(previous);};
  reduced.addEventListener('change',settle);
  return (at, nav={}) => {
    if(!observing&&holder.isConnected){observer.observe(document.getElementById('deck')||document.body,{childList:true,subtree:true});observing=true;}
    const from=previous;
    // The editor resets old-route overrides immediately after repaint. Capture
    // the visible source before that reset so its text and position cannot jump.
    const source=from===null?null:capture(nodes[from]);
    const sourceMatches=from!==null&&matches(nodes[from],states[from]);
    previous=at;clean();
    const moving=from!==null&&at===from+1&&!nav.settled&&!nav.backward&&!nav.directEnd&&!reduced.matches&&
      sourceMatches&&!source.hidden&&unscaled(source)&&states[at]?.tex.includes('mm-term');
    if(!moving){activate(at);return;}
    activate(from);
    const id=version;
    raf=requestAnimationFrame(()=>{play(from,at,id,source).catch(()=>{if(id===version){clean();activate(at);}});});
  };
}
