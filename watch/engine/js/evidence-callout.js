const SVG_NS='http://www.w3.org/2000/svg';
const clamp=(value,min,max)=>Math.min(Math.max(value,min),Math.max(min,max));

// The graph supplies screen coordinates; this layer never changes its camera.
export function mountEvidenceCallout(map){
  let css=document.querySelector('link[data-evidence-callout]');
  if(!css){
    css=document.createElement('link');css.rel='stylesheet';
    css.href=new URL('../css/evidence-callout.css',import.meta.url).href;
    css.setAttribute('data-evidence-callout','');document.head.append(css);
  }
  const layer=document.createElement('div');layer.className='evidence-callout-layer';layer.hidden=true;
  const connector=document.createElementNS(SVG_NS,'svg');
  connector.classList.add('evidence-callout-connector');connector.setAttribute('aria-hidden','true');
  const line=document.createElementNS(SVG_NS,'path');connector.append(line);
  const card=document.createElement('aside');card.className='evidence-callout-card';
  card.setAttribute('aria-label','Selected paper');
  layer.append(connector,card);map.append(layer);

  let current=null,spec=null,anchor=null,animation=null,disposed=false;
  let layoutKey='',cardWidth=0,cardHeight=0;
  const stop=event=>event.stopPropagation();
  const events=['click','dblclick','pointerdown','touchstart','wheel','keydown'];
  for(const type of events)card.addEventListener(type,stop);
  const finish=()=>{animation?.cancel();animation=null;};

  function fit(width,height){
    const key=`${width}:${height}:${current}`;if(key===layoutKey)return;
    const margin=10,available=Math.max(1,height-margin*2);
    // On narrow displays use enough width to keep a short paper summary readable.
    cardWidth=Math.min(410,Math.max(210,width*.36),Math.max(1,width-margin*2));
    card.style.width=`${cardWidth}px`;card.style.maxHeight=`${available}px`;
    let font=height<340?14:height<470?16:17;
    card.style.setProperty('--callout-font',`${font}px`);
    card.style.setProperty('--callout-padding',height<320?'10px':'14px');
    while(card.scrollHeight>available+.5&&font>12){
      font-=.5;card.style.setProperty('--callout-font',`${font}px`);
    }
    cardWidth=card.offsetWidth;cardHeight=card.offsetHeight;layoutKey=key;
  }

  function avoidLabels(left,top,x,y,width,height){
    const mapBounds=map.getBoundingClientRect();
    if(!mapBounds.width||!mapBounds.height)return {left,top};
    const scaleX=width/mapBounds.width,scaleY=height/mapBounds.height,padding=8;
    // Read SVG screen bounds after the graph's camera transform. Incoming labels
    // are protected during their fade too, rather than waiting until fully opaque.
    const boxes=[...map.querySelectorAll(
      '.evidence-satellite-state.active .evidence-satellite-label,'+
      '.evidence-satellite-state.active .evidence-satellite-node,'+
      '.evidence-selected-paper-label,.evidence-selected-paper-mobile-label'
    )].map(element=>{
      const rect=element.getBoundingClientRect();
      if(rect.width<1||rect.height<1)return null;
      return {left:(rect.left-mapBounds.left)*scaleX-padding,
        top:(rect.top-mapBounds.top)*scaleY-padding,
        right:(rect.right-mapBounds.left)*scaleX+padding,
        bottom:(rect.bottom-mapBounds.top)*scaleY+padding};
    }).filter(Boolean);
    boxes.push({left:x-9,top:y-9,right:x+9,bottom:y+9});
    const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*
      Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
    const rectangle=(l,t)=>({left:l,top:t,right:l+cardWidth,bottom:t+cardHeight});
    if(!boxes.some(box=>overlap(rectangle(left,top),box)))return {left,top};
    const xs=new Set([left,10,width-cardWidth-10]),ys=new Set([top,10,height-cardHeight-10]);
    for(const box of boxes){
      xs.add(clamp(box.right,10,width-cardWidth-10));
      xs.add(clamp(box.left-cardWidth,10,width-cardWidth-10));
      ys.add(clamp(box.bottom,10,height-cardHeight-10));
      ys.add(clamp(box.top-cardHeight,10,height-cardHeight-10));
    }
    let best={left,top},bestScore=Infinity;
    for(const l of xs)for(const t of ys){
      const candidate=rectangle(l,t),area=boxes.reduce((sum,box)=>sum+overlap(candidate,box),0);
      // Avoid text before minimizing movement; moving the card never moves the map.
      const score=area*1e6+Math.abs(l-left)+Math.abs(t-top)*1.15;
      if(score<bestScore){bestScore=score;best={left:l,top:t};}
    }
    return best;
  }

  function position(x,y){
    if(disposed||!spec||!Number.isFinite(x)||!Number.isFinite(y))return;
    anchor={x,y};
    const width=map.clientWidth,height=map.clientHeight;
    if(width<1||height<1){layer.style.visibility='hidden';return;}
    fit(width,height);
    const margin=10,gap=16;
    const rightSpace=width-margin-x-gap,leftSpace=x-gap-margin;
    const preferred=spec.side==='left'?'left':spec.side==='right'?'right':null;
    const fits=side=>(side==='left'?leftSpace:rightSpace)>=cardWidth;
    const side=preferred&&fits(preferred)?preferred:
      fits('right')?'right':fits('left')?'left':rightSpace>=leftSpace?'right':'left';
    let left=side==='right'?x+gap:x-gap-cardWidth;
    let top=clamp(y-cardHeight*.4,margin,height-cardHeight-margin);
    left=clamp(left,margin,width-cardWidth-margin);

    // A very narrow map may have no horizontal room: place above/below the node.
    const overlapsNode=x>=left-gap/2&&x<=left+cardWidth+gap/2;
    if(overlapsNode){
      if(y-gap-cardHeight>=margin)top=y-gap-cardHeight;
      else if(y+gap+cardHeight<=height-margin)top=y+gap;
    }
    ({left,top}=avoidLabels(left,top,x,y,width,height));
    card.style.left=`${left.toFixed(1)}px`;card.style.top=`${top.toFixed(1)}px`;
    connector.setAttribute('viewBox',`0 0 ${width} ${height}`);
    const nodeOnMap=x>=0&&x<=width&&y>=0&&y<=height;
    const nodeCovered=x>=left&&x<=left+cardWidth&&y>=top&&y<=top+cardHeight;
    const endX=clamp(x,left,left+cardWidth),endY=clamp(y,top+8,top+cardHeight-8);
    const dx=endX-x,dy=endY-y,length=Math.hypot(dx,dy);
    if(nodeOnMap&&!nodeCovered&&length>8){
      const startX=x+dx/length*6,startY=y+dy/length*6;
      line.setAttribute('d',`M ${startX.toFixed(1)} ${startY.toFixed(1)} L ${endX.toFixed(1)} ${endY.toFixed(1)}`);
      connector.style.visibility='visible';
    }else connector.style.visibility='hidden';
    layer.style.visibility='visible';
  }

  function paint(next,nav={}){
    if(disposed)return;
    const instant=nav.settled||nav.backward||nav.directEnd||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!next){
      finish();layer.hidden=true;layer.style.visibility='hidden';
      spec=null;current=null;anchor=null;layoutKey='';return;
    }
    const key=JSON.stringify(next);
    if(key===current){if(instant)finish();return;}
    const sameNode=spec?.node===next.node;
    finish();spec=next;current=key;layoutKey='';
    layer.hidden=false;layer.style.visibility='hidden';
    layer.style.setProperty('--callout-color',next.color&&CSS.supports('color',next.color)?next.color:'#f2bd76');
    card.replaceChildren();
    const heading=document.createElement('h3');heading.className='evidence-callout-author';
    let url=null;
    try{const parsed=new URL(next.url,document.baseURI);if(next.url&&['https:','http:'].includes(parsed.protocol))url=parsed.href;}catch{}
    const author=document.createElement(url?'a':'span');
    author.className='evidence-group-highlight';author.textContent=next.author||'';
    if(url){author.href=url;author.target='_blank';author.rel='noopener noreferrer';}
    heading.append(author);card.append(heading);
    for(const [index,text] of (next.paragraphs||[]).entries()){
      const paragraph=document.createElement('p');
      if(next.labels?.[index]){const label=document.createElement('strong');label.textContent=next.labels[index]+': ';paragraph.append(label);}
      paragraph.append(document.createTextNode(String(text)));card.append(paragraph);
    }
    card.setAttribute('aria-label',next.author?`Paper details: ${next.author}`:'Selected paper');
    if(sameNode&&anchor)position(anchor.x,anchor.y);else anchor=null;
    if(!instant&&typeof layer.animate==='function')animation=layer.animate([{opacity:0},{opacity:1}],{duration:400,easing:'ease-out'});
  }

  const refresh=()=>{layoutKey='';if(anchor)position(anchor.x,anchor.y);};
  css.addEventListener('load',refresh);
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(refresh):null;
  observer?.observe(map);
  return {paint,position,dispose(){
    if(disposed)return;disposed=true;finish();observer?.disconnect();
    css.removeEventListener('load',refresh);
    for(const type of events)card.removeEventListener(type,stop);
    layer.remove();
  }};
}
