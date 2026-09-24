/* The audience window owns the deck. The speaker window never duplicates its renderer. */
export function installPresenterBridge(deck, deckPath) {
  const params = new URLSearchParams(location.search);
  const session = params.get('presenterSession') || crypto.randomUUID();
  const channel = new BroadcastChannel(`spiral-presenter:${session}`);
  if(params.get('presenterPreview')==='1'){
    document.body.classList.add('audience-mode');
    deck.preview=true;
    channel.addEventListener('message',({data})=>{
      if(data?.type!=='state')return;
      const target=data.state;if(!target || target.route===deck.currentState().route)return;
      const index=deck.deck.slides.findIndex(s=>s._slug===target.slug);
      if(index>=0)deck.show(index,{instant:true,keepStep:target.step,settled:true});
    });
    channel.postMessage({type:'hello'});
    // Read-only preview: no audience events, keyboard actions, audio or auto-advances.
    deck.root.inert=true;
    const style=document.createElement('style');style.textContent='#hint,#bar,#panel,#chapters{display:none!important}';document.head.append(style);
    return {session,preview:true};
  }
  window.name = `spiral-audience-${session}`;
  let speaker = null;
  const slides = () => deck.deck.slides.map((s,i) => ({
    slug:s._slug, index:i, title:s.heading || s.subchapter || s.title || `Slide ${i+1}`,
    backup:!!s.backup, notes:s.notes || '',
    totalSteps:Math.max(0,...(s.blocks||[]).map(b=>Math.max(b.args?.revealSteps||0,(b.states?.length||1)-1,b.revealAt||0))),
    cues:s.speakerCues || null,
  }));
  function publish(withSlides=false) {
    const s = deck.currentState();
    const active = deck.stage.querySelector('.evidence-network-state.active');
    const labels = active ? [...active.querySelectorAll('.evidence-network-figure-label-main')].map(n=>n.textContent) : [];
    channel.postMessage({type:'state',state:s,labels,viewport:{width:innerWidth,height:innerHeight},blackout:document.body.classList.contains('audience-blackout'),
      ...(withSlides?{slides:slides()}:{}),sentAt:Date.now()});
  }
  function openSpeaker() {
    if (deck.editing) { deck.flash('Leave edit mode before presenting'); return; }
    const url = new URL('speaker.html',location.href);
    url.searchParams.set('deck',deckPath);
    url.searchParams.set('presenterSession',session);
    const custom = params.get('narrationManifest');
    if(custom)url.searchParams.set('narrationManifest',custom);
    url.hash=deck.currentState().route;
    speaker=window.open(url.href,`spiral-speaker-${session}`,'popup,width=1050,height=850');
    if(!speaker){deck.flash('Allow pop-ups to open speaker notes');return;}
    window.spiralNarration?.suspendForPresenter?.();
    document.body.classList.add('audience-mode');
    speaker.focus(); publish(true);
  }
  channel.addEventListener('message',({data})=>{
    if(!data || typeof data!=='object')return;
    if(data.type==='hello') { window.spiralNarration?.suspendForPresenter?.();document.body.classList.add('audience-mode');publish(true);return; }
    if(data.type!=='command')return;
    if(deck.editing)return;
    if(data.action==='next')deck.next();
    else if(data.action==='prev')deck.prev();
    else if(data.action==='goto'){
      const index=deck.deck.slides.findIndex(s=>s._slug===data.slug);
      if(index>=0)deck.show(index,{instant:true,keepStep:Math.max(0,Number(data.step)||0),settled:true});
    } else if(data.action==='blackout')document.body.classList.toggle('audience-blackout');
    else if(data.action==='end'){
      document.body.classList.remove('audience-mode','audience-blackout');
    }
    publish();
  });
  deck.root.addEventListener('spiral:statechange',()=>publish());
  addEventListener('keydown',e=>{
    if(e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
    if(e.key.toLowerCase()==='p'){e.preventDefault();openSpeaker();}
  });
  const style=document.createElement('style');
  style.textContent=`.audience-mode #hint,.audience-mode .spiral-narration{display:none!important}.audience-blackout::after{content:'';position:fixed;inset:0;background:#000;z-index:999999;pointer-events:none}`;
  document.head.append(style);
  if(params.has('presenterSession'))document.body.classList.add('audience-mode');
  // Heartbeats allow a reloaded notes window to reconnect and detect a closed audience tab.
  const heartbeat=setInterval(()=>publish(),1000);
  addEventListener('pagehide',()=>{clearInterval(heartbeat);channel.close();});
  publish(true);
  return {open:openSpeaker,publish,session};
}
