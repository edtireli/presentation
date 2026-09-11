import { createCapillaryComparison } from './capillary-comparison.js';
const node=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!=null)n.textContent=text;return n;};
// Reserve the complete line layout while revealing letters. One inline marker
// covers each complete phrase, including spaces and any wrapped line fragments.
export function typedStatement(text,phrases,tag){
  const p=node(tag,'cs-statement'),letters=[],markers=[],ranges=[];
  p.setAttribute('aria-label',text);
  for(const [phrase] of [...(phrases||[])].sort((a,b)=>b[0].length-a[0].length)){
    if(!phrase)continue;
    let at=text.indexOf(phrase);
    while(at>=0){
      const end=at+phrase.length+(text.slice(at+phrase.length).match(/^[.,;:!?]+/u)?.[0].length||0);
      if(!ranges.some(r=>at<r.end&&end>r.start))ranges.push({start:at,end});
      at=text.indexOf(phrase,at+phrase.length);
    }
  }
  const appendText=(parent,copy)=>{
    for(const [token] of copy.matchAll(/\S+|\s+/gu)){
      if(/^\s+$/u.test(token)){parent.append(document.createTextNode(token));continue;}
      const word=node('span','cs-typed-word');
      for(const character of Array.from(token)){const letter=node('span','cs-letter',character);letter.style.visibility='hidden';word.append(letter);letters.push(letter);}
      parent.append(word);
    }
  };
  let cursor=0;
  for(const range of ranges.sort((a,b)=>a.start-b.start)){
    appendText(p,text.slice(cursor,range.start));
    const marker=node('mark','cs-typed-phrase');appendText(marker,text.slice(range.start,range.end));
    markers.push({node:marker,end:letters.length});p.append(marker);cursor=range.end;
  }
  appendText(p,text.slice(cursor));
  p._typing={letters,markers,revealed:0};return p;
}
export function revealStatement(p,count,complete=false){
  const typing=p._typing;if(!typing)return;
  const shown=Math.min(typing.letters.length,Math.max(0,count));
  for(let i=typing.revealed;i<shown;i++)typing.letters[i].style.visibility='visible';
  typing.revealed=shown;
  for(const marker of typing.markers){
    if(complete||count>=marker.end+2)marker.node.classList.add('cs-phrase-marked');
  }
  p.dataset.typing=String(!complete);
}

// Readable findings and a restrained, shared interpretation of both clinical studies.
// Only the fewer-perfused-capillaries example mounts a model.
export function renderClinicalSynthesis(block){
  if(!document.querySelector('link[data-clinical-synthesis]')){
    const css=node('link','');css.rel='stylesheet';css.href=new URL('../css/clinical-synthesis.css',import.meta.url).href;css.dataset.clinicalSynthesis='';document.head.append(css);
  }
  const holder=node('section','clinical-synthesis scene-holder');
  holder.dataset.csCopy=block.copyStyle||'';
  holder.dataset.csDimPrevious=String(!!block.dimPrevious);
  const header=node('header','cs-header');header.append(node('h2','cs-section',block.title||block.section));
  const branches=node('div','cs-branches');branches.hidden=!(block.branches||[]).length;
  for(const branch of block.branches||[]){const item=node('div','cs-branch');item.dataset.branch=branch.id;item.append(node('span','cs-branch-name',branch.label));branches.append(item);}
  const body=node('div','cs-body'),copy=node('div','cs-copy'),quote=node('div','cs-quote'),source=node('div','cs-source');copy.append(quote,source);
  const view=node('div','cs-view');view.hidden=true;body.append(copy,view);
  const evidence=node('div','cs-evidence');holder.append(header,branches,body,evidence);
  const states=block.states||[];holder.sceneSteps=Math.max(0,states.length-1);
  let step=0,control,loading,disposed=false,connected=false,pending={},previousStep=-1,typeFrame;
  const finishTyping=()=>{cancelAnimationFrame(typeFrame);for(const p of quote.querySelectorAll('.cs-statement[data-visible=true]'))revealStatement(p,p._typing?.letters.length||0,true);holder.dataset.csTyping='false';};
  const typeStatements=paragraphs=>{
    if(!paragraphs.length)return;
    const started=performance.now(),rate=82;
    const total=paragraphs.reduce((sum,p)=>sum+p._typing.letters.length+18,0);
    holder.dataset.csTyping='true';
    function tick(now){
      if(disposed)return;
      let budget=Math.floor((now-started)*rate/1000);
      for(const p of paragraphs){const length=p._typing.letters.length;revealStatement(p,budget,budget>=length+8);budget-=length+18;}
      if((now-started)*rate/1000<total)typeFrame=requestAnimationFrame(tick);
      else{for(const p of paragraphs)revealStatement(p,p._typing.letters.length,true);holder.dataset.csTyping='false';}
    }
    typeFrame=requestAnimationFrame(tick);
  };
  const observer=new MutationObserver(()=>{if(holder.isConnected)connected=true;else if(connected){disposed=true;cancelAnimationFrame(typeFrame);control?.dispose();observer.disconnect();}});
  observer.observe(document.getElementById('stage')||document.body,{childList:true,subtree:true});
  const showCapillary=()=>states[step]?.visual==='perfused';
  async function updateModel(){
    if(!showCapillary()){control?.dispose();control=null;return;}
    if(control){control.setState(states[step],pending);return;}
    if(loading)return;
    loading=true;
    try{
      const T=await import('../vendor/three/three.module.min.js');
      if(disposed||!showCapillary())return;
      const next=await mountCapillary(T,view,holder);
      if(disposed||!showCapillary()){next.dispose();return;}
      control=next;control.setState(states[step],pending);holder.dataset.csReady='true';
      holder.dispatchEvent(new CustomEvent('block-ready',{bubbles:true}));
    }catch(e){holder.dataset.csError=String(e);console.warn('Capillary illustration:',e);}
    finally{loading=false;}
  }
  holder.repaint=(next=0,nav={})=>{
    if(!states.length)return;
    step=Math.max(0,Math.min(states.length-1,Math.round(Number(next)||0)));pending=nav;
    const s=states[step],visual=showCapillary();
    holder.dataset.csStep=step;holder.dataset.csVisual=s.visual;holder.dataset.capillaryLayout=String(visual);
    const changed=previousStep!==step,instant=nav.settled||nav.backward||nav.directEnd||matchMedia('(prefers-reduced-motion: reduce)').matches;
    view.hidden=!visual;
    const topicMode=block.layout==='topics';
    const paragraphs=topicMode?(s.topics||[]).map(t=>`${t.label}. ${t.text}`):s.displayParagraphs||s.quoteData?.paragraphs||[];
    holder.dataset.csTopics=String(topicMode);
    const cumulative=!!block.cumulative;
    if(changed||instant)finishTyping();
    if((!cumulative&&changed)||!quote.children.length){
      quote.replaceChildren();
      const template=cumulative?states[states.length-1]:s;
      if(topicMode){
        for(const [i,topic] of (template.topics||[]).entries()){
          const row=node('div','cs-topic-row');row.dataset.topicIndex=i;
          // Overlay the possible copies in one grid slot. Its size is reserved
          // for the longest version, so a later click can refine a topic without
          // moving the other rows or exposing the later wording early.
          const variants=new Map((cumulative?states:[s]).map(state=>state.topics?.[i]).filter(Boolean).map(t=>[JSON.stringify([t.label,t.text]),t]));
          row.dataset.variants=String(variants.size>1);
          for(const [key,version] of variants){
            const label=typedStatement(version.label,[[version.label,'marker']],'h3');label.classList.add('cs-topic-label');
            const explanation=typedStatement(version.text,[],'p');explanation.classList.add('cs-topic-explanation');
            for(const p of [label,explanation]){p.dataset.topicIndex=i;p._topicKey=key;}
            if(variants.size>1){const variant=node('div','cs-topic-variant');variant.append(label,explanation);row.append(variant);}
            else row.append(label,explanation);
          }
          quote.append(row);
        }
      }else{
        const texts=template.displayParagraphs||template.quoteData?.paragraphs||[];
        const list=template.layout==='bullets'?node('ul','cs-bullets'):quote;
        for(const text of texts)list.append(typedStatement(text,template.quoteData?.highlights,list===quote?'p':'li'));
        if(list!==quote)quote.append(list);
      }
    }
    const toType=[];
    for(const [i,p] of [...quote.querySelectorAll('.cs-statement')].entries()){
      const currentTopic=topicMode?s.topics?.[Number(p.dataset.topicIndex)]:null;
      const visible=topicMode?!!currentTopic&&p._topicKey===JSON.stringify([currentTopic.label,currentTopic.text]):!cumulative||i<paragraphs.length,wasVisible=p.dataset.visible==='true';
      p.dataset.visible=String(visible);p.setAttribute('aria-hidden',String(!visible));
      p.dataset.current=String(visible&&(topicMode?Number(p.dataset.topicIndex):i)===paragraphs.length-1);
      if(visible){
        if(instant||changed&&cumulative&&wasVisible)revealStatement(p,p._typing.letters.length,true);
        else if(changed)toType.push(p);
      }else{
        for(const letter of p._typing.letters)letter.style.visibility='hidden';
        for(const marker of p._typing.markers)marker.node.classList.remove('cs-phrase-marked');
        p._typing.revealed=0;
      }
    }
    if(!instant&&changed)typeStatements(toType);
    holder.dataset.csEmpty=String(!paragraphs.length);holder.dataset.csInstant=String(!!instant);
    holder.dataset.csBullets=String(s.layout==='bullets');
    [...branches.children].forEach(item=>{const active=s.activeBranch==='all'||s.activeBranch===item.dataset.branch;item.dataset.active=String(active);});
    copy.dataset.words=paragraphs.join(' ').split(/\s+/).length>70?'long':'short';
    source.textContent=s.sourceLabel??block.sourceLabel??'Tireli et al. · Discussion';source.hidden=!source.textContent||!paragraphs.length;
    const citations=topicMode?states[states.length-1].evidence||[]:s.evidence||[];
    evidence.replaceChildren();evidence.hidden=!citations.length;holder.dataset.csEvidence=String(!evidence.hidden);
    evidence.dataset.columns=Math.min(3,citations.length);
    for(const citation of citations){
      const item=node('div','cs-evidence-item'),author=node(citation.url?'a':'span','cs-evidence-author');
      const visible=!topicMode||(s.evidence||[]).some(c=>c.id===citation.id);
      item.dataset.visible=String(visible);item.setAttribute('aria-hidden',String(!visible));
      author.textContent=citation.author;author.title=[citation.fullTitle||citation.title,citation.method,citation.reviewBasis].filter(Boolean).join(' · ');
      if(citation.url){author.href=citation.url;author.target='_blank';author.rel='noopener noreferrer';}
      const finding=node('span','cs-evidence-finding',citation.displayFinding||citation.finding);
      item.append(author,node('span','cs-evidence-population',citation.displayPopulation||citation.population),finding);
      if(citation.displayCaveat)item.append(node('span','cs-evidence-caveat',citation.displayCaveat));
      for(const extra of citation.additionalUrls||[]){const link=node('a','cs-evidence-extra',extra.label);link.href=extra.url;link.target='_blank';link.rel='noopener noreferrer';item.append(link);}
      evidence.append(item);
    }
    holder.setAttribute('aria-label',`${block.title||block.section}. ${paragraphs.join(' ')}`);
    previousStep=step;holder.dataset.csReady=String(!visual||!!control);updateModel();
  };
  holder.repaint(0);
  return holder;
}

async function mountCapillary(T,host,holder){
  const renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;host.append(renderer.domElement);
  let comparison;
  try{comparison=await createCapillaryComparison(T,host,holder);}catch(e){renderer.dispose();renderer.domElement.remove();throw e;}
  let frame,disposed=false;
  const resize=()=>{const w=host.clientWidth,h=host.clientHeight;if(w&&h)renderer.setSize(w,h,false);};
  const ro=new ResizeObserver(resize);ro.observe(host);resize();
  function draw(now){if(disposed)return;frame=requestAnimationFrame(draw);if(!document.hidden&&host.clientWidth&&host.clientHeight)comparison.draw(renderer,now,host.clientWidth,host.clientHeight);}
  frame=requestAnimationFrame(draw);
  return{setState:(s,nav)=>comparison.setState(s,nav),dispose(){disposed=true;cancelAnimationFrame(frame);ro.disconnect();comparison.dispose();renderer.dispose();renderer.domElement.remove();}};
}
