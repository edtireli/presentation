/* Semantic edit targets for a native canvas figure. Transparent DOM bounds mirror
 * the same transforms used by the renderer; the scientific curves remain native,
 * animated drawing commands, not a flattened screenshot. */
export function figureEditParts(g, W, H) {
  const canvas = g.canvas, holder = canvas.parentElement;
  if (!holder) return null;
  const state = canvas.spiralParts ||= { nodes: new Map() };
  holder.style.position ||= 'relative';
  const stack = [], seen = new Set();
  const begin = (id, label, bounds, text) => {
    let node = state.nodes.get(id);
    const parent = stack.at(-1);
    if (!node) {
      node = document.createElement('div');
      node.dataset.editorPart = id;
      node.dataset.editorLabel = label;
      node.setAttribute('aria-hidden', 'true');
      Object.assign(node.style, { position: 'absolute', pointerEvents: 'none', transformOrigin: 'center center' });
      (parent?.node || holder).append(node);
      state.nodes.set(id, node);
    }
    if (text !== undefined) node.dataset.editorText = text;
    node.style.display = '';
    const origin = parent?.bounds || { x: -canvas.offsetLeft-(canvas.spiralDrawOffset?.x||0), y: -canvas.offsetTop-(canvas.spiralDrawOffset?.y||0) };
    Object.assign(node.style, { left: `${bounds.x-origin.x}px`, top: `${bounds.y-origin.y}px`, width: `${bounds.w}px`, height: `${bounds.h}px` });
    seen.add(id);
    const o = node.spiralEdit || {}, page = holder.closest('.slide');
    const content = o.text ?? text;
    g.save();
    const cx=bounds.x+bounds.w/2, cy=bounds.y+bounds.h/2;
    g.translate((o.dx || 0)*(page?.clientWidth || W), (o.dy || 0)*(page?.clientHeight || H));
    g.translate(cx,cy); g.scale(o.sx ?? 1,o.sy ?? o.sx ?? 1); g.translate(-cx,-cy);
    stack.push({node,bounds});
    if (o.hidden) {g.beginPath();g.rect(0,0,0,0);g.clip();}
    return {content,node};
  };
  const end = () => {
    stack.pop();g.restore();
  };
  const part = (id, label, bounds, paint, text) => {
    const {content,node}=begin(id,label,bounds,text);
    if(!node.spiralEdit?.hidden)paint(content,node);
    end();return node;
  };
  const text = (id, original, x, y, color, font, align='center', baseline='middle') => {
    const node=state.nodes.get(id), content=node?.spiralEdit?.text ?? original;
    const size=node?.spiralEdit?.fontSize;
    if(size) font=font.replace(/[\d.]+px/, `${size*W/640}px`);
    g.save();g.font=font;
    if(node?.spiralEdit?.letterSpacing!=null)g.letterSpacing=`${node.spiralEdit.letterSpacing*W/640}px`;
    const metrics=g.measureText(content), height=parseFloat(font.match(/([\d.]+)px/)?.[1] || '14')*1.25;
    const width=Math.max(12,metrics.width), left=align==='left'?x:align==='right'?x-width:x-width/2;
    const top=baseline==='top'?y:baseline==='bottom'?y-height:y-height/2;
    part(id, original, {x:left,y:top,w:width,h:height}, value => {
      g.font=font;g.fillStyle=color;g.textAlign=align;g.textBaseline=baseline;g.fillText(value,x,y);
    }, original);
    g.restore();
  };
  return { begin,end,part,text,finish() { for(const [id,node] of state.nodes) if(!seen.has(id))node.style.display='none'; } };
}

export function hideFigureEditParts(canvas) {
  for(const node of canvas.spiralParts?.nodes.values() || []) node.style.display='none';
}
