import {typedStatement,revealStatement} from './clinical-synthesis.js';
let contextSequence=0;

// Reading cues stay below the fixed literature map. Shared prefixes remain written
// when a click adds the qualification below an existing interpretation.
export function mountEvidenceDiscussion(holder){
  for(const [name,path] of [['clinical-synthesis','../css/clinical-synthesis.css'],['evidence-discussion','../css/evidence-discussion.css']]){
    if(document.querySelector(`link[data-${name}]`))continue;
    const css=document.createElement('link');css.rel='stylesheet';css.href=new URL(path,import.meta.url).href;css.setAttribute(`data-${name}`,'');document.head.append(css);
  }
  const layer=document.createElement('section');layer.className='evidence-discussion';layer.setAttribute('aria-label','Study discussion');
  const title=document.createElement('h2'),copy=document.createElement('div'),citations=document.createElement('div');
  title.className='ed-title';copy.className='ed-copy';citations.className='ed-citations';layer.append(title,copy,citations);holder.append(layer);
  let current=null,citationKey='',frame=0,disposed=false,connected=false;
  const finish=()=>{cancelAnimationFrame(frame);for(const p of copy.children)revealStatement(p,p._typing.letters.length,true);holder.dataset.discussionTyping='false';};
  const observer=new MutationObserver(()=>{if(holder.isConnected)connected=true;else if(connected){disposed=true;cancelAnimationFrame(frame);observer.disconnect();}});
  observer.observe(document.getElementById('stage')||document.body,{childList:true,subtree:true});
  return {paint(state,nav={}){
    const spec=state.discussionOverlay;
    holder.dataset.discussionVisible=spec?'1':'0';layer.setAttribute('aria-hidden',String(!spec));
    holder.style.setProperty('--discussion-map-dim',String(spec?(state.mapDim??.18):1));
    if(!spec){finish();current=null;citationKey='';return;}
    const instant=nav.settled||nav.backward||nav.directEnd||matchMedia('(prefers-reduced-motion: reduce)').matches;
    const key=JSON.stringify(spec);if(key===current){if(instant)finish();return;}
    finish();const sameTitle=title.textContent===spec.title&&current!=null;
    title.replaceChildren();
    if(spec.titleHighlight){const mark=document.createElement('span');mark.className='evidence-group-highlight';mark.textContent=spec.title||'';title.append(mark);}
    else title.textContent=spec.title||'';
    const previous=[...copy.children];let prefix=0;
    if(sameTitle)while(prefix<previous.length&&prefix<(spec.paragraphs||[]).length&&previous[prefix].getAttribute('aria-label')===spec.paragraphs[prefix]&&(!spec.topics?.[prefix]||previous[prefix].dataset.topicKey===JSON.stringify(spec.topics[prefix])))prefix++;
    for(const p of previous.slice(prefix))p.remove();
    const additions=[];
    for(const [offset,text] of (spec.paragraphs||[]).slice(prefix).entries()){
      const topic=spec.topics?.[prefix+offset];
      let p;
      if(topic){
        p=document.createElement('p');p.className='cs-statement ed-topic-row';p.setAttribute('aria-label',text);p.dataset.topicKey=JSON.stringify(topic);
        const label=typedStatement(topic.label,[[topic.label,'marker']],'span');label.classList.add('ed-topic-label');
        const explanation=typedStatement(topic.text,[],'span');explanation.classList.add('ed-topic-explanation');
        const heading=document.createElement('span');heading.className='ed-topic-heading';heading.append(label);
        if(topic.context?.length){
          const context=document.createElement('small');context.className='ed-topic-context';context.id=`ed-topic-context-${++contextSequence}`;
          for(const text of topic.context){const line=document.createElement('span');line.textContent=text;context.append(line);}
          heading.append(context);p.setAttribute('aria-describedby',context.id);
        }
        p.append(heading,explanation);
        p._typing={letters:[...label._typing.letters,...explanation._typing.letters],markers:label._typing.markers,revealed:0};
      }else p=typedStatement(text,(spec.highlights||[]).map(h=>[h,'marker']),'p');
      copy.append(p);additions.push(p);
    }
    // Keep previous cues in place, but let the current topic carry the emphasis.
    for(const [i,p] of [...copy.children].entries())p.dataset.current=String(i===copy.children.length-1);
    const nextCitationKey=JSON.stringify(spec.citations||[]);
    if(citationKey!==nextCitationKey){
    citations.replaceChildren();
    for(const source of spec.citations||[]){
      const item=document.createElement('div');item.className='ed-citation';
      item.classList.add('ed-reference-arrival');item.style.setProperty('--reference-delay',`${citations.children.length*120+120}ms`);
      item.style.setProperty('--reference-color',state.paperColor||'#f2bd76');
      if(instant)item.style.animation='none';
      const a=document.createElement(source.url?'a':'strong');a.textContent=source.author;
      if(source.url){a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';}
      item.append(a);
      for(const [cls,text] of [['ed-population',source.population],['ed-finding',source.finding]])if(text){const p=document.createElement('p');p.className=cls;p.textContent=text;item.append(p);}
      citations.append(item);
    }
    citationKey=nextCitationKey;
    }
    citations.hidden=!citations.children.length;current=key;
    if(instant){finish();return;}
    const start=performance.now(),rate=82,total=additions.reduce((n,p)=>n+p._typing.letters.length+18,0);
    holder.dataset.discussionTyping=String(!!additions.length);
    function tick(now){
      if(disposed)return;let budget=Math.floor((now-start)*rate/1000);
      for(const p of additions){const length=p._typing.letters.length;revealStatement(p,budget,budget>=length+8);budget-=length+18;}
      if((now-start)*rate/1000<total)frame=requestAnimationFrame(tick);else finish();
    }
    if(additions.length)frame=requestAnimationFrame(tick);
  }};
}
