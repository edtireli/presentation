import {typedStatement,revealStatement} from './clinical-synthesis.js';

// Session-only memory survives a scene being rebuilt after a movie or a revisit.
// Changed wording gets a new key; no progress is saved into the authored deck.
const rememberedPrompts=new Map();

export function createTypedPromptList(holder,bullets,{remember=false,visibleClass}={}){
  if(!document.querySelector('link[data-clinical-synthesis]')){
    const css=document.createElement('link');css.rel='stylesheet';
    css.href=new URL('../css/clinical-synthesis.css',import.meta.url).href;
    css.dataset.clinicalSynthesis='';document.head.append(css);
  }
  const key=JSON.stringify(bullets),seen=remember?(rememberedPrompts.get(key)||new Set()):new Set();
  if(remember)rememberedPrompts.set(key,seen);
  const list=document.createElement('ul');
  const rows=bullets.map(bullet=>{
    const phrases=(bullet.highlights||[bullet.highlight]).filter(Boolean).map(text=>[text,'marker']);
    const li=typedStatement(String(bullet.text||''),phrases,'li');list.append(li);return li;
  });
  let frame=0,signature='',active=[],pending=null,connected=holder.isConnected,disposed=false;
  const complete=row=>{revealStatement(row,row._typing.letters.length,true);if(remember)seen.add(rows.indexOf(row));};
  const finish=()=>{cancelAnimationFrame(frame);pending=null;active.forEach(complete);active=[];holder.dataset.promptsTyping='false';};
  const start=additions=>{
    if(disposed||!additions.length)return;
    if(!holder.isConnected){pending=additions;return;}
    connected=true;pending=null;
    if(remember)for(const row of additions)seen.add(rows.indexOf(row));
    const started=performance.now(),rate=82,total=additions.reduce((sum,row)=>sum+row._typing.letters.length+18,0);
    holder.dataset.promptsTyping='true';
    const tick=now=>{
      if(disposed)return;
      if(!holder.isConnected){finish();return;}
      let budget=Math.floor((now-started)*rate/1000);
      for(const row of additions){const length=row._typing.letters.length;revealStatement(row,budget,budget>=length+8);budget-=length+18;}
      if((now-started)*rate/1000<total)frame=requestAnimationFrame(tick);else finish();
    };
    frame=requestAnimationFrame(tick);
  };
  const observer=new MutationObserver(()=>{
    if(holder.isConnected){connected=true;if(pending)start(pending);}
    else if(connected){disposed=true;finish();observer.disconnect();}
  });
  observer.observe(document.getElementById('stage')||document.body,{childList:true,subtree:true});
  return {list,rows,paint(shown,nav={}){
    const instant=!!(nav.settled||nav.backward||nav.directEnd||matchMedia('(prefers-reduced-motion: reduce)').matches);
    const nextSignature=JSON.stringify(shown);
    if(nextSignature===signature){if(instant){for(const row of rows)row.dataset.typingInstant='true';finish();}return;}
    finish();signature=nextSignature;const additions=[];
    rows.forEach((row,i)=>{
      const visible=!!shown[i],wasVisible=row.dataset.visible==='true';
      row.dataset.visible=String(visible);row.setAttribute('aria-hidden',String(!visible));
      if(visibleClass)row.classList.toggle(visibleClass,visible);
      const written=instant||wasVisible||(remember&&seen.has(i));
      row.dataset.typingInstant=String(written);
      if(!visible)return;
      if(written){complete(row);return;}
      for(const letter of row._typing.letters)letter.style.visibility='hidden';
      for(const marker of row._typing.markers)marker.node.classList.remove('cs-phrase-marked');
      row._typing.revealed=0;additions.push(row);
    });
    active=additions;start(additions);
  }};
}
