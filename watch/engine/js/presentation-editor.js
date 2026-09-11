/* In-place editing of the actual rendered slide. Edits are reversible overrides;
 * they never flatten a scene or alter its authored reveal count. Exported .spiral
 * files retain every original slide, including omitted slides and asset paths. */
import { renderMath } from './math.js';
import { migrateRouteEdits } from './route-migrations.js';
const $ = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
const copy = value => structuredClone(value);
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const SCHEMA = "spiral-presentation-edits/v1";
const SELECTABLE = '[data-editor-part], .math-display, [data-block], [data-child], img, video, canvas, svg, h1, h2, h3, p, figcaption, .subtitle, .eyebrow, .mono, .body, .evidence-network-text, .evidence-network-tag, .evidence-network-section-title, .evidence-audience-points li, .evidence-network-figure-caption, .evidence-network-inset-label, .evidence-network-inset-source, .evidence-network-citation-row';
const ICONS = {
  edit:'<path d="m4 16-1 5 5-1L20 8l-4-4L4 16Zm10-10 4 4M3 21h18"/>',
  move:'<path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4"/>',
  remove:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  resize:'<path d="M4 14v6h6M14 4h6v6M4 20l16-16"/>'
};

export class PresentationEditor {
  constructor(deck, source, sourceUrl) {
    this.deck = deck; this.source = copy(source); this.sourceUrl = sourceUrl;
    this.key = `spiral.presentation.edits:${new URL(sourceUrl === 'draft' ? '/draft' : sourceUrl, location.href).pathname}`;
    this.edits = copy(source.presentationEdits?.edits || {});
    this.history = []; this.future = []; this.active = false; this.scope = 'reveal';
    this.base = new WeakMap(); this.selected = null; this.storageOK = true;
    this.baseHash = null;
    this.ready = this.init();
  }
  async init() {
    const canonical = copy(this.source); delete canonical.presentationEdits;
    const bytes = new TextEncoder().encode(JSON.stringify(canonical));
    this.baseHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    try { const saved = JSON.parse(localStorage.getItem(this.key) || 'null'); if (saved && this.compatibleHash(saved.baseDeckHash)) {
      const moved = migrateRouteEdits(this.validate(saved).edits, saved.baseDeckHash, this.source.presentationEdits?.routeMigrations);
      if (moved.changed) localStorage.setItem(this.key+':before-click-sequence-change',JSON.stringify(saved));
      this.edits = moved.edits;this.rebasedDraft=saved.baseDeckHash!==this.baseHash;
    } else if (saved) this.staleDraft = saved; }
    catch { this.storageOK = false; }
    // Repair only a known superseded placement, never a later manual adjustment.
    for(const migration of this.source.presentationEdits?.migrations||[]){
      const current=this.edits[migration.route]?.[migration.selector];
      if(current&&Object.entries(migration.before).every(([key,value])=>current[key]===value)){
        try{if(!this.migratedDraft)localStorage.setItem(this.key+':before-layout-repair',JSON.stringify(this.payload()));}catch{this.storageOK=false;}
        Object.assign(current,migration.after);this.migratedDraft=true;
      }
    }
    this.makeUI();
    if(this.rebasedDraft||this.migratedDraft)this.save();
    this.deck.root.addEventListener('spiral:render', () => this.refresh());
    this.deck.root.addEventListener('spiral:statechange', () => { this.closeText(); this.selected = null; this.refresh(); });
    this.observer = new MutationObserver(() => {
      if (this.pending) return;
      this.pending = requestAnimationFrame(() => { this.pending = null; this.apply(); if (this.active) {this.updateOutline();this.refreshObjectList();} });
    });
    this.observer.observe(this.deck.stage, { childList: true, subtree: true });
    window.addEventListener('keydown', e => this.keydown(e), true);
    window.addEventListener('pointermove', e => this.move(e));
    window.addEventListener('pointerup', () => this.endDrag());
    this.deck.stage.addEventListener('pointerdown', e => this.pick(e), true);
    this.deck.stage.addEventListener('dblclick', e => {if(this.active){e.preventDefault();e.stopImmediatePropagation();this.openText();}},true);
    this.deck.stage.addEventListener('click', e => { if (this.active) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    this.apply();
    if (new URLSearchParams(location.search).get('edit') === '1') this.toggle(true);
  }
  page() { return this.deck.stage.querySelector('.slide.incoming') || this.deck.stage.lastElementChild; }
  route() { return this.deck.currentState().route; }
  scopeKey() { return this.scope === 'slide' ? `${this.deck.currentState().slug}/*` : this.route(); }
  inlineMode() { return true; }
  bounds(node) {
    if(node.matches('.math-display')){
      const runs=[...node.querySelectorAll('.katex-html > .base')].map(n=>n.getBoundingClientRect());
      if(runs.length){const left=Math.min(...runs.map(r=>r.left)),top=Math.min(...runs.map(r=>r.top)),right=Math.max(...runs.map(r=>r.right)),bottom=Math.max(...runs.map(r=>r.bottom));return{x:left,y:top,left,top,right,bottom,width:right-left,height:bottom-top};}
    }
    return node.getBoundingClientRect();
  }
  payload() { return { schema: SCHEMA, deck: this.sourceUrl, baseDeckHash: this.baseHash, updatedAt: new Date().toISOString(), edits: copy(this.edits) }; }
  save() { if(this.staleDraft){this.message('An older draft is preserved. Export your current edits before closing; send both files back for merging.');this.buttons();return} try { localStorage.setItem(this.key, JSON.stringify(this.payload())); } catch { this.storageOK = false; } this.message(this.storageOK ? 'Draft saved in this browser. Export to keep a file.' : 'Storage unavailable. Export changes before closing.'); this.buttons(); }
  snapshot() { this.history.push(copy(this.edits)); if (this.history.length > 80) this.history.shift(); this.future = []; }
  undo() { if (!this.history.length) return; this.future.push(copy(this.edits)); this.edits = this.history.pop(); this.save(); this.refresh(); }
  redo() { if (!this.future.length) return; this.history.push(copy(this.edits)); this.edits = this.future.pop(); this.save(); this.refresh(); }
  selector(node) {
    const path = []; const page = this.page();
    for (let n = node; n && n !== page; n = n.parentElement) {
      if (n.hasAttribute('data-block')) { path.unshift(`[data-block="${CSS.escape(n.dataset.block)}"]`); break; }
      if (n.hasAttribute('data-editor-part')) { path.unshift(`[data-editor-part="${CSS.escape(n.dataset.editorPart)}"]`); continue; }
      const tag = n.localName; const siblings = [...n.parentElement.children].filter(k => k.localName === tag);
      path.unshift(`${tag}:nth-of-type(${siblings.indexOf(n) + 1})`);
    }
    return path.join(' > ');
  }
  candidates() {
    const page = this.page(); if (!page) return [];
    return [...page.querySelectorAll(SELECTABLE)].filter(n => {
      if (n.closest('.sources, .runhead, .annotations, .math-morph-layer')) return false;
      if (n.matches('.math-sequence')) return false;
      if (n.matches('canvas') && n.parentElement.querySelector('[data-editor-part]:not([style*="display: none"])')) return false;
      if (n.matches('[data-block]') && n.querySelector('[data-editor-part]:not([style*="display: none"])')) return false;
      if (n.namespaceURI === 'http://www.w3.org/2000/svg' && n.localName !== 'svg') return false;
      if (n.closest('svg') && n.localName !== 'svg') return false;
      const r = n.getBoundingClientRect(); if (r.width < 5 || r.height < 5) return false;
      for (let p = n; p && p !== page; p = p.parentElement) { const s = getComputedStyle(p); if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < .04) return false; }
      return true;
    });
  }
  label(node) {
    if (node.dataset.editorLabel) return node.dataset.editorLabel;
    if (node.matches('.math-display')) return 'Equation';
    if (node.matches('img')) return `Image: ${node.alt || node.getAttribute('src')?.split('/').pop() || ''}`;
    if (node.matches('video')) return 'Video';
    if (node.matches('canvas,svg,.scene-holder')) return `Scene / graphic (${node.localName})`;
    return (node.textContent || node.dataset.block || node.localName).trim().replace(/\s+/g, ' ').slice(0, 100);
  }
  merged(selector) { const slug = this.deck.currentState().slug; return { ...(this.edits[`${slug}/*`]?.[selector] || {}), ...(this.edits[this.route()]?.[selector] || {}) }; }
  textEditable(n) { return n && (n.hasAttribute('data-editor-text') || n.matches('.math-display') || (!n.hasAttribute('data-editor-part') && !n.matches('img,video,canvas,svg') && !n.querySelector('img,video,canvas,svg,.katex,.scene-holder'))); }
  textValue(n) { return n.hasAttribute('data-editor-text') ? this.merged(this.selector(n)).text ?? n.dataset.editorText : n.matches('.math-display') ? this.merged(this.selector(n)).text ?? n.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? '' : n.textContent; }
  remember(node) {
    if (!this.base.has(node)) this.base.set(node, { translate: node.style.translate, scale: node.style.scale, origin: node.style.transformOrigin, visibility: node.style.getPropertyValue('visibility'), visibilityPriority: node.style.getPropertyPriority('visibility'), fontSize: node.style.fontSize, letterSpacing:node.style.letterSpacing,lineHeight:node.style.lineHeight, html: this.textEditable(node) && !node.hasAttribute('data-editor-part') && !node.matches('.math-display') ? node.innerHTML : null, tex: node.matches('.math-display') ? node.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? '' : null });
    return this.base.get(node);
  }
  apply() {
    const page = this.page(); if (!page) return;
    const rect = page.getBoundingClientRect(); const slug = this.deck.currentState().slug;
    const active = { ...(this.edits[`${slug}/*`] || {}), ...(this.edits[this.route()] || {}) };
    const selectors = new Set([...Object.keys(active), ...[...page.querySelectorAll('[data-editor-applied]')].map(n => n.dataset.editorApplied)]);
    for (const selector of selectors) {
      let node; try { node = page.querySelector(selector); } catch { continue; } if (!node) continue;
      const b = this.remember(node), o = this.merged(selector); node.dataset.editorApplied = selector;
      if (node.hasAttribute('data-editor-part')) node.spiralEdit=o;
      const sx = o.sx ?? 1, sy = o.sy ?? sx;
      node.style.translate = o.dx != null || o.dy != null ? `${(o.dx || 0) * rect.width}px ${(o.dy || 0) * rect.height}px` : b.translate;
      node.style.scale = o.sx != null || o.sy != null ? `${sx} ${sy}` : b.scale;
      node.style.transformOrigin = o.sx != null || o.sy != null ? 'center center' : b.origin;
      if (o.hidden) node.style.setProperty('visibility', 'hidden', 'important'); else if (b.visibility) node.style.setProperty('visibility', b.visibility, b.visibilityPriority); else node.style.removeProperty('visibility');
      node.style.fontSize = o.fontSize ? `calc(${o.fontSize} * var(--u))` : b.fontSize;
      node.style.letterSpacing = o.letterSpacing!=null ? `calc(${o.letterSpacing} * var(--u))` : b.letterSpacing;
      node.style.lineHeight = o.lineHeight!=null ? String(o.lineHeight) : b.lineHeight;
      if (b.tex != null && node.editorCurrentTex !== (o.text ?? b.tex)) { node.editorCurrentTex=o.text ?? b.tex; if(node.editorCurrentTex)renderMath(node,node.editorCurrentTex);else node.replaceChildren(); }
      if (b.html != null) {
        if (typeof o.text === 'string') { if (node.textContent !== o.text) node.textContent = o.text; }
        else if (node.innerHTML !== b.html) node.innerHTML = b.html;
      }
    }
    if (this.active) this.updateOutline();
  }
  change(values, snapshot = true) {
    if (!this.selected) return;
    if (snapshot) this.snapshot(); const key = this.scopeKey(); this.edits[key] ||= {};
    this.edits[key][this.selected] = { ...this.merged(this.selected), ...values };
    this.apply(); this.save();
  }
  pick(e) {
    if (!this.active || e.button !== 0) return;
    e.preventDefault(); e.stopImmediatePropagation();
    this.closeText();
    const hits = this.candidates().filter(n => { const r = this.bounds(n); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; });
    hits.sort((a,b) => { const ar=this.bounds(a), br=this.bounds(b); return ar.width*ar.height-br.width*br.height; });
    let target = hits[0]; if (e.altKey && hits.length > 1) target = hits.find(n => n !== target && n.contains(target)) || hits[1];
    this.selected = target ? this.selector(target) : null; this.refreshControls();
    if (target) this.beginDrag(e, 'move');
  }
  beginDrag(e, kind) {
    if (!this.selected) return; const n = this.page().querySelector(this.selected); if (!n) return;
    e.preventDefault(); e.stopPropagation(); this.snapshot();
    this.drag = { kind, x: e.clientX, y: e.clientY, rect: this.bounds(n), values: this.merged(this.selected), moved: false };
  }
  move(e) {
    if (!this.drag) return; e.preventDefault(); const d = this.drag, dx = e.clientX-d.x, dy=e.clientY-d.y, p=this.page().getBoundingClientRect();
    if (Math.abs(dx)+Math.abs(dy)>2) d.moved=true;
    if (d.kind === 'move') this.change({ dx: clamp((d.values.dx||0)+dx/p.width,-2,2), dy: clamp((d.values.dy||0)+dy/p.height,-2,2) }, false);
    else {
      let sx=clamp((d.values.sx||1)*(d.rect.width+dx)/d.rect.width,.08,10), sy=clamp((d.values.sy||d.values.sx||1)*(d.rect.height+dy)/d.rect.height,.08,10);
      if (this.keepRatio.checked) sy=sx*(d.values.sy||d.values.sx||1)/(d.values.sx||1);
      // Centre-origin scaling: shift by half the size change to keep the upper-left corner fixed.
      const newW=d.rect.width*sx/(d.values.sx||1),newH=d.rect.height*sy/(d.values.sy||d.values.sx||1);
      this.change({sx,sy,dx:(d.values.dx||0)+(newW-d.rect.width)/2/p.width,dy:(d.values.dy||0)+(newH-d.rect.height)/2/p.height}, false);
    }
  }
  endDrag() { if (!this.drag) return; if (!this.drag.moved) this.history.pop(); this.drag=null; this.refreshControls(); }
  updateOutline() {
    const n = this.selected && this.page()?.querySelector(this.selected); this.outline.hidden = !this.active || !n || !!this.partMarkers?.get(this.selected);
    if (!n) return; const r = this.bounds(n); Object.assign(this.outline.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
  }
  refresh() { this.apply(); if (this.active) this.refreshControls(); }
  refreshObjectList(force=false) {
    if(!this.objectList || (!force && document.activeElement===this.objectList))return;
    const nodes=this.candidates(),items=nodes.map(n=>[this.selector(n),this.label(n)]),signature=JSON.stringify(items);
    if(!force && signature===this.objectSignature)return;
    this.objectSignature=signature;this.objectList.replaceChildren(new Option('Select an object on the slide',''));
    for(const [value,label] of items)this.objectList.add(new Option(label,value));
    if(this.selected&&!items.some(([s])=>s===this.selected))this.objectList.add(new Option('[Hidden] selected object',this.selected));
    this.objectList.value=this.selected||'';
  }
  tick() {
    if(!this.active)return;
    const now=performance.now();
    if(!this.lastTick || now-this.lastTick>75){
      this.lastTick=now;this.refreshObjectList();this.updateOutline();this.updateMarkers();
    }
    this.tickFrame=requestAnimationFrame(()=>this.tick());
  }
  updateMarkers() {
    const inline=this.inlineMode();this.partsLayer.hidden=!inline;this.inlineHelp.hidden=!inline;
    if(!inline)return;
    const seen=new Set();
    for(const n of this.candidates()){
      const native=n.matches('[data-editor-part],.math-display');
      const domText=this.textEditable(n)&&n.textContent.trim()&&!n.querySelector('h1,h2,h3,p,figcaption,.math-display,.subtitle,.body');
      if(!native&&!domText)continue;
      const selector=this.selector(n),group=n.hasAttribute('data-editor-part')&&!n.hasAttribute('data-editor-text');
      seen.add(selector);let marker=this.partMarkers.get(selector);
      if(!marker){
        marker=$('div',null,'edit-item'+(group?' is-group':''));marker.dataset.target=selector;
        const controls=$('div',null,'edit-item-tools');
        if(group)controls.append($('span',this.label(n),'edit-item-name'));
        const control=(kind,title,drag,host=controls)=>{
          const b=$('button');b.type='button';b.title=title;b.setAttribute('aria-label',title);b.dataset.action=kind;
          b.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[kind]}</svg>`;
          if(drag)b.onpointerdown=e=>{this.closeText();this.selected=selector;this.refreshControls();this.beginDrag(e,drag)};
          else b.onclick=()=>{this.selected=selector;this.refreshControls();if(kind==='edit')this.openText();else{this.change({hidden:true});this.refreshControls()}};
          host.append(b);return b;
        };
        if(this.textEditable(n))control('edit','Edit '+this.label(n));
        control('move','Move '+this.label(n),'move');control('remove','Remove '+this.label(n));
        marker.append(controls);control('resize','Resize '+this.label(n),'resize',marker).className='edit-item-resize';
        this.partsLayer.append(marker);this.partMarkers.set(selector,marker);
      }
      marker.hidden=false;marker.classList.toggle('selected',this.selected===selector);
      marker.classList.toggle('is-minor',/-tick-|\-unit$/.test(n.dataset.editorPart||''));
      const r=this.bounds(n);Object.assign(marker.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
      marker.classList.toggle('tools-left',!group && (n.dataset.editorPart?.endsWith('-y') || r.right+105>innerWidth-10));
    }
    for(const [selector,marker] of this.partMarkers)if(!seen.has(selector))marker.hidden=true;
  }
  openText() {
    const n=this.page()?.querySelector(this.selected);if(!this.textEditable(n))return;
    this.closeText();this.inlineBefore=copy(this.edits);this.inlinePast=copy(this.history);this.inlineFuture=copy(this.future);this.inlineHistory=false;
    this.popoverLabel.textContent=n.matches('.math-display')?'Equation · LaTeX':this.label(n);
    this.inlineText.value=this.textValue(n);this.textPopover.hidden=false;
    const r=this.bounds(n),width=Math.min(390,innerWidth-24);
    Object.assign(this.textPopover.style,{width:width+'px',left:clamp(r.left,12,innerWidth-width-12)+'px',top:clamp(r.bottom+40,70,innerHeight-240)+'px'});
    this.inlineText.focus();this.inlineText.select();
  }
  closeText(cancel=false) {
    if(!this.textPopover || this.textPopover.hidden)return;
    this.textPopover.hidden=true;
    if(cancel&&this.inlineBefore){this.edits=this.inlineBefore;this.history=this.inlinePast;this.future=this.inlineFuture;this.apply();this.save();}
    this.inlineBefore=null;this.refreshControls();
  }
  refreshControls() {
    this.routeLabel.textContent = `${this.deck.i+1} / ${this.deck.deck.slides.length} · ${this.route()}`;
    this.refreshObjectList(true);
    const n = this.selected && this.page()?.querySelector(this.selected);
    if (n && ![...this.objectList.options].some(o=>o.value===this.selected)) this.objectList.add(new Option('[Hidden] '+this.label(n),this.selected));
    this.objectList.value = this.selected || '';
    const v = this.selected ? this.merged(this.selected) : {};
    this.textBox.disabled = !this.textEditable(n); this.textBox.value = this.textEditable(n) ? this.textValue(n) : '';
    this.textBox.placeholder = n ? 'Text inside a rendered graphic is part of that graphic.' : 'Select a text item';
    this.scaleX.value = Math.round((v.sx || 1)*100); this.scaleY.value = Math.round((v.sy || v.sx || 1)*100);
    this.fontInput.value = v.fontSize || ''; this.fontInput.disabled=!this.textEditable(n);
    this.spacingInput.value=v.letterSpacing??'';this.spacingInput.disabled=!this.textEditable(n);
    this.lineHeightInput.value=v.lineHeight??'';this.lineHeightInput.disabled=!this.textEditable(n)||n?.hasAttribute('data-editor-part')||n?.matches('.math-display');
    this.removeButton.textContent = v.hidden ? 'Restore object' : 'Delete object'; this.removeButton.disabled=!n;
    this.resetButton.disabled=!n; this.updateOutline(); this.buttons();
  }
  buttons() { if (!this.undoButton) return; this.undoButton.disabled=!this.history.length;this.redoButton.disabled=!this.future.length; }
  message(value) { if(this.status)this.status.textContent=value; }
  toggle(on = !this.active) {
    this.active=on;this.deck.editing=on;this.ui.hidden=!on;document.body.classList.toggle('spiral-editing',on);
    if(on){ if(this.deck.busy)this.deck.cancelTransition(); if(window.spiralNarration?.enabled)window.spiralNarration.toggle(); this.refresh();this.message(this.staleDraft ? 'The deck changed since your older draft. Export that draft for merging; it has been preserved.' : 'Pencil: edit · Crossed arrows: move · Corner: resize · Bin: remove'); this.tick(); }
    else { this.closeText();this.selected=null;this.apply();cancelAnimationFrame(this.tickFrame); }
  }
  keydown(e) {
    const typing=e.target.closest?.('input,textarea,select,[contenteditable="true"]');
    if(this.active&&e.key==='Escape'&&this.textPopover&&!this.textPopover.hidden){e.preventDefault();e.stopImmediatePropagation();this.closeText(true);return}
    if(this.active&&(e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();e.stopImmediatePropagation();this.download(false);return}
    if(!typing&&e.key.toLowerCase()==='e'&&!e.metaKey&&!e.ctrlKey){e.preventDefault();e.stopImmediatePropagation();this.toggle();return}
    if(!this.active||typing)return;
    e.stopImmediatePropagation();
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?this.redo():this.undo()}
    else if(e.key==='Escape')this.toggle(false);
    else if(['Delete','Backspace'].includes(e.key)&&this.selected){e.preventDefault();this.change({hidden:true});this.refreshControls()}
    else if(e.key.startsWith('Arrow')&&this.selected){e.preventDefault();const p=this.page().getBoundingClientRect(),v=this.merged(this.selected),amount=e.shiftKey?10:1;this.change({dx:(v.dx||0)+(e.key==='ArrowRight'?amount:e.key==='ArrowLeft'?-amount:0)/p.width,dy:(v.dy||0)+(e.key==='ArrowDown'?amount:e.key==='ArrowUp'?-amount:0)/p.height})}
  }
  compatibleHash(hash) {
    // Only source revisions explicitly certified by a non-destructive deck merge
    // may retain browser drafts (e.g. appending a backup without changing old slides).
    return hash===this.baseHash || (this.source.presentationEdits?.compatibleBaseHashes||[]).includes(hash);
  }
  validate(value) {
    if(value?.schema!==SCHEMA||!this.compatibleHash(value.baseDeckHash)||!value.edits||typeof value.edits!=='object'||Array.isArray(value.edits))throw Error('These edits belong to a different deck revision. Send them back for merging.');
    let count=0;
    for(const [route,items] of Object.entries(value.edits)){
      const split=route.lastIndexOf('/'),slug=route.slice(0,split),step=route.slice(split+1);
      if(!this.deck.deck.slides.some(s=>s._slug===slug)||!(/^(\d+|\*)$/).test(step)||route.length>180||!items||typeof items!=='object'||Array.isArray(items))throw Error('Invalid edit route');
      for(const [selector,o] of Object.entries(items)){
        if(++count>5000||selector.length>1500||!o||typeof o!=='object')throw Error('Invalid edit object');
        if(o.text!=null&&(typeof o.text!=='string'||o.text.length>30000))throw Error('Invalid text');
        if(o.hidden!=null&&typeof o.hidden!=='boolean')throw Error('Invalid visibility');
        for(const k of ['dx','dy','sx','sy','fontSize','letterSpacing','lineHeight'])if(o[k]!=null&&(!Number.isFinite(o[k])||Math.abs(o[k])>400))throw Error('Invalid geometry');
      }
    }return value;
  }
  download(asDeck) {
    let value=this.payload(),name='phd-presentation-my-edits.json';
    if(asDeck){value=copy(this.source);value.presentationEdits=this.payload();name='phd-defense-edited.spiral'}
    const a=$('a');const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.message(`Downloaded ${name}. Send it back to merge your changes.`);
  }
  makeUI() {
    const link=$('link');link.rel='stylesheet';link.href=new URL('../css/presentation-editor.css',import.meta.url);document.head.append(link);
    this.ui=$('div');this.ui.id='spiral-editor';this.ui.hidden=true;const toolbar=$('div',null,'edit-toolbar');toolbar.append($('strong','Edit mode'));
    this.routeLabel=$('span',null,'edit-route');toolbar.append(this.routeLabel);
    const button=(label,fn,host=toolbar,cls)=>{const b=$('button',label,cls);b.type='button';b.onclick=fn;host.append(b);return b};
    button('Previous',()=>this.deck.prev());button('Next',()=>this.deck.next());
    this.undoButton=button('Undo',()=>this.undo());this.redoButton=button('Redo',()=>this.redo());
    button('Import',()=>this.fileInput.click());button('Export edits',()=>this.download(false));button('Export deck',()=>this.download(true));button('Present',()=>this.toggle(false),toolbar,'primary');
    const side=$('aside',null,'edit-sidebar');side.setAttribute('aria-label','Object properties');side.hidden=true;
    button('Properties',()=>side.hidden=!side.hidden);
    const field=(label,node)=>{const l=$('label',label);l.htmlFor='edit-'+label.replace(/\W/g,'').toLowerCase();node.id=l.htmlFor;side.append(l,node);return node};
    this.objectList=field('Object', $('select'));this.objectList.onchange=()=>{this.selected=this.objectList.value||null;this.refreshControls()};
    this.scopeList=field('Apply changes to', $('select'));this.scopeList.add(new Option('This reveal only','reveal'));this.scopeList.add(new Option('Every reveal on this slide','slide'));this.scopeList.onchange=()=>this.scope=this.scopeList.value;
    this.textBox=field('Text', $('textarea'));this.textBox.onfocus=()=>{this.textHistory=false};this.textBox.oninput=()=>{this.change({text:this.textBox.value},!this.textHistory);this.textHistory=true};
    const scales=$('div',null,'pair');this.scaleX=$('input');this.scaleY=$('input');for(const [name,input]of[['Width %',this.scaleX],['Height %',this.scaleY]]){input.type='number';input.min=8;input.max=1000;const label=$('label',name);label.append(input);scales.append(label)}side.append(scales);
    this.keepRatio=$('input');this.keepRatio.type='checkbox';this.keepRatio.checked=true;const check=$('label',null,'check');check.append(this.keepRatio,document.createTextNode(' Keep proportions'));side.append(check);
    const scale=(axis,input)=>{const n=Number(input.value)/100;if(!Number.isFinite(n)||n<.08||n>10)return;const v=this.merged(this.selected);const values={[axis]:n};if(this.keepRatio.checked)values[axis==='sx'?'sy':'sx']=n*(axis==='sx'?(v.sy||v.sx||1)/(v.sx||1):(v.sx||1)/(v.sy||v.sx||1));this.change(values);this.refreshControls()};
    this.scaleX.onchange=()=>scale('sx',this.scaleX);this.scaleY.onchange=()=>scale('sy',this.scaleY);
    this.fontInput=field('Font size (design units)', $('input'));this.fontInput.type='number';this.fontInput.min=6;this.fontInput.max=200;this.fontInput.onchange=()=>{const n=Number(this.fontInput.value);if(n>=6&&n<=200)this.change({fontSize:n})};
    this.spacingInput=field('Letter spacing (design units)', $('input'));this.spacingInput.type='number';this.spacingInput.step='.1';this.spacingInput.min=-5;this.spacingInput.max=30;this.spacingInput.onchange=()=>{const n=Number(this.spacingInput.value);if(n>=-5&&n<=30)this.change({letterSpacing:this.spacingInput.value===''?null:n})};
    this.lineHeightInput=field('Line spacing (multiplier)', $('input'));this.lineHeightInput.type='number';this.lineHeightInput.step='.1';this.lineHeightInput.min=.5;this.lineHeightInput.max=4;this.lineHeightInput.onchange=()=>{const n=Number(this.lineHeightInput.value);if(n>=.5&&n<=4)this.change({lineHeight:n})};
    const actions=$('div',null,'actions');side.append(actions);
    this.removeButton=button('Delete object',()=>{this.change({hidden:!this.merged(this.selected).hidden});this.refreshControls()},actions);
    this.resetButton=button('Reset object',()=>{if(!this.selected)return;this.snapshot();delete(this.edits[this.scopeKey()]||{})[this.selected];this.apply();this.save();this.refreshControls()},actions);
    // Local narration authoring tools are intentionally excluded from the static presentation export.
    side.append($('p','Use the pencil or double-click a text object. Native plot labels are editable. Text baked into an imported photograph or paper figure remains part of that image.', 'note'));
    side.append($('p','Changes stay in this browser until you export. Your original .spiral file is preserved.', 'note'));
    this.status=$('p','', 'note');this.status.setAttribute('role','status');side.append(this.status);
    if(this.staleDraft)button('Export preserved older draft',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(this.staleDraft,null,2)],{type:'application/json'}));const a=$('a');a.href=url;a.download='phd-presentation-older-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)},side);
    this.outline=$('div',null,'edit-selection');this.outline.hidden=true;const mover=$('button','Move','edit-move');mover.onpointerdown=e=>this.beginDrag(e,'move');const handle=$('div',null,'edit-handle');handle.setAttribute('aria-label','Resize selected object');handle.onpointerdown=e=>this.beginDrag(e,'resize');this.outline.append(mover,handle);
    this.partsLayer=$('div',null,'edit-parts');this.partMarkers=new Map();
    this.textPopover=$('div',null,'edit-text-popover');this.textPopover.hidden=true;this.textPopover.setAttribute('role','dialog');this.textPopover.setAttribute('aria-label','Edit object text');
    this.popoverLabel=$('label','Edit text');this.popoverLabel.htmlFor='edit-inline-text';this.inlineText=$('textarea');this.inlineText.id='edit-inline-text';this.inlineText.rows=3;
    this.inlineText.oninput=()=>{let value=this.inlineText.value;const n=this.page()?.querySelector(this.selected);if(n?.hasAttribute('data-editor-part'))value=value.replace(/\s*\n\s*/g,' ');this.change({text:value},!this.inlineHistory);this.inlineHistory=true};
    const popActions=$('div',null,'actions');this.textPopover.append(this.popoverLabel,this.inlineText,popActions);button('Cancel',()=>this.closeText(true),popActions);button('Done',()=>this.closeText(),popActions,'primary');
    this.inlineHelp=$('p','Drag the crossed arrows to move · Drag a corner to resize · Edits apply to this click only','edit-inline-help');
    this.ui.append(this.partsLayer,this.outline,this.inlineHelp,toolbar,side,this.textPopover);document.body.append(this.ui);
    this.fileInput=$('input');this.fileInput.type='file';this.fileInput.accept='.json,.spiral';this.fileInput.hidden=true;this.fileInput.onchange=async()=>{try{const f=this.fileInput.files[0];if(!f)return;if(f.size>8e6)throw Error('Edit file too large');const raw=JSON.parse(await f.text());const value=this.validate(raw.presentationEdits||raw);if(Object.keys(this.edits).length&&!confirm('Replace the current local edits? Export first if you need a separate copy.'))return;const moved=migrateRouteEdits(value.edits,value.baseDeckHash,this.source.presentationEdits?.routeMigrations);if(moved.changed)localStorage.setItem(this.key+':before-click-sequence-change',JSON.stringify(value));this.snapshot();this.edits=moved.edits;this.save();this.refresh()}catch(e){this.message(e.message)}finally{this.fileInput.value=''}};this.ui.append(this.fileInput);
    const launcher=$('button','Edit presentation (E)');launcher.id='spiral-edit-launch';launcher.onclick=()=>this.toggle(true);document.body.append(launcher);
  }
}
