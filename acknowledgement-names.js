import {narrationReleased} from './narration-release.js';
import {createMuralRenderer} from './acknowledgement-mural.js';
import {createWordHeartsEffect} from './acknowledgement-word-hearts.js';
import {createPsychedelicTextEffect} from './acknowledgement-psychedelic.js';
import {addEtchedLogo} from './acknowledgement-etched-logo.js';

// Explicit personal mentions in the source acknowledgements. “my dad” identifies
// a person whose name is not supplied; preserve that phrase rather than invent one.
export const ACKNOWLEDGEMENT_PERSONAL_MENTIONS = Object.freeze([
  'Henrik Larsson', 'Mark', 'Ulrich', 'Stig', 'Martine', 'Tanne', 'Bodil',
  'Derya', 'my dad', 'Miriam', 'Nicholas', 'Rikke', 'Clara',
]);

const escapedNames = [...ACKNOWLEDGEMENT_PERSONAL_MENTIONS]
  .sort((a, b) => b.length - a.length)
  .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
// Unicode letter/number boundaries avoid marking names inside unrelated words.
// Capture the leading separator so the matcher also works without lookbehind.
const names = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapedNames.join('|')})(?=$|[^\\p{L}\\p{N}_])`, 'gu');

export function renderAcknowledgementParagraph(text) {
  if (typeof text !== 'string') throw new TypeError('Acknowledgement text must be a string.');
  const paragraph = document.createElement('p');
  let cursor = 0;
  for (const match of text.matchAll(names)) {
    const start = match.index + match[1].length;
    if (start > cursor) paragraph.append(document.createTextNode(text.slice(cursor, start)));
    const mark = document.createElement('mark');
    mark.className = 'acknowledgement-name';
    const action = personalActions[match[2]];
    if (action) {
      const button = document.createElement('button');
      button.type = 'button';button.className = `acknowledgement-person-action acknowledgement-${match[2].toLowerCase()}`;
      button.textContent = match[2];button.setAttribute('aria-label', match[2] === 'Clara' ? 'Clara, show hearts' : match[2]);
      button.addEventListener('click', () => {
        if (match[2] !== 'Clara' && !narrationReleased()) return;
        action.show();
      });
      mark.append(button);
    } else mark.textContent = match[2];
    paragraph.append(mark);
    cursor = start + match[2].length;
  }
  if (cursor < text.length) paragraph.append(document.createTextNode(text.slice(cursor)));
  return paragraph;
}


let clearAcknowledgementEffect = null;
function showClaraHearts() {
  clearAcknowledgementEffect?.();
  manageEffect(createWordHeartsEffect());
}

function manageEffect({nodes, animations = [], duration, onFrame, onCleanup}) {
  let ended = false, timer, frame, readingObserver;
  const started = performance.now();
  const hidden = () => {if (document.hidden) cleanup();};
  const cleanup = () => {
    if (ended) return;ended = true;clearTimeout(timer);cancelAnimationFrame(frame);readingObserver?.disconnect();
    animations.forEach(animation => animation.cancel());nodes.forEach(node => node.remove());
    onCleanup?.();
    removeEventListener('pagehide', cleanup);removeEventListener('hashchange', cleanup);
    document.removeEventListener('visibilitychange', hidden);
    if (clearAcknowledgementEffect === cleanup) clearAcknowledgementEffect = null;
  };
  clearAcknowledgementEffect = cleanup;
  const reading = document.querySelector('#acknowledgements');
  if (reading) {
    readingObserver = new MutationObserver(() => {if (reading.hidden) cleanup();});
    readingObserver.observe(reading, {attributes: true, attributeFilter: ['hidden']});
  }
  addEventListener('pagehide', cleanup, {once: true});addEventListener('hashchange', cleanup, {once: true});
  document.addEventListener('visibilitychange', hidden);
  timer = setTimeout(cleanup, duration + 100);
  if (onFrame) {
    const tick = time => {if (ended) return;const progress = Math.min(1, (time - started) / duration);onFrame(progress);if(progress >= 1){cleanup();return;}frame = requestAnimationFrame(tick);};
    frame = requestAnimationFrame(tick);
  }
  if (animations.length) Promise.allSettled(animations.map(animation => animation.finished)).then(cleanup);
  return cleanup;
}

function showMiriamGraffiti() {
  clearAcknowledgementEffect?.();
  const field = document.createElement('canvas');
  field.className = 'acknowledgement-jellyfish';field.dataset.effect='mural';
  field.setAttribute('aria-hidden', 'true');field.inert = true;
  document.body.append(field);
  const controller = new AbortController();
  let renderer, loadedAt, disposed = false;
  // Loading is part of the same cancellable effect: switching names or leaving
  // the page cannot let a late image decode resurrect the mural.
  const cancel = manageEffect({nodes:[field],duration:60000,onFrame:()=>{
    if(!renderer)return;
    const progress=Math.min(1,(performance.now()-loadedAt)/renderer.durationMs);
    renderer.render(progress);
    if(progress>=1)cancel();
  },onCleanup:()=>{disposed=true;controller.abort();renderer?.dispose();}});
  createMuralRenderer(field,{reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,signal:controller.signal}).then(result=>{
    if(disposed){result.dispose();return;}
    renderer=result;loadedAt=performance.now();field.dataset.ready='true';renderer.render(0);
  }).catch(error=>{if(!disposed){cancel();console.error('Mural could not be loaded.',error);}});
}

let nicholasCycle = 0;
function showNicholasCycle() {
  const effect = nicholasCycle === 0 ? showNicholasSwords : showJakDaxter;
  nicholasCycle = (nicholasCycle + 1) % 2;effect();
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgNode(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}
function showColourWave() {
  clearAcknowledgementEffect?.();
  manageEffect(createPsychedelicTextEffect());
}

function katana(angle) {
  const sword = svgNode('g', {transform: `rotate(${angle})`});sword.classList.add('acknowledgement-katana');
  sword.append(svgNode('path', {d: 'M-8 66C-10-75-2-186 21-236C23-110 22-6 8 66Z', fill: 'url(#acknowledgement-steel)', stroke: '#d7ccb1', 'stroke-width': 1}));
  sword.append(svgNode('path', {d: 'M-8 66C-10-75-2-186 21-236', fill: 'none', stroke: '#fff2d5', 'stroke-width': 1.5}));
  sword.append(svgNode('path', {d: 'M1 65C6-68 9-159 21-236', fill: 'none', stroke: '#a79d88', 'stroke-width': .9}));
  sword.append(svgNode('rect', {x: -10, y: 63, width: 20, height: 19, rx: 1, fill: '#b2945c', stroke: '#ebd29a'}));
  sword.append(svgNode('ellipse', {cx: 0, cy: 84, rx: 27, ry: 8, fill: '#393023', stroke: '#c9aa6c', 'stroke-width': 2}));
  sword.append(svgNode('ellipse', {cx: 0, cy: 84, rx: 20, ry: 4, fill: 'none', stroke: '#927444', 'stroke-width': .8}));
  sword.append(svgNode('path', {d: 'M-9 92H10L8 197H-7Z', fill: '#201b16', stroke: '#a58a5c', 'stroke-width': 1.5}));
  for (let i = 0; i < 8; i++) {
    const y = 95 + i * 12;
    sword.append(svgNode('path', {d: `M-8 ${y}L8 ${y + 11}M8 ${y}L-7 ${y + 11}`, fill: 'none', stroke: '#c5ac7d', 'stroke-width': 2.2}));
  }
  sword.append(svgNode('rect', {x: -8, y: 197, width: 17, height: 8, rx: 2, fill: '#927749', stroke: '#d3ba84'}));
  return sword;
}

function showNicholasSwords() {
  clearAcknowledgementEffect?.();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const swordsEnd = reduced ? 2500 : 3800, logoStart = swordsEnd + 1000, duration = logoStart + 3900;
  const field = document.createElement('div');
  field.className = 'acknowledgement-swords acknowledgement-nicholas-effect';
  field.dataset.effect = 'ichiran';field.dataset.swordsEnd = swordsEnd;field.dataset.logoStart = logoStart;
  field.setAttribute('aria-hidden', 'true');field.inert = true;
  const svg = svgNode('svg', {viewBox: '-360 -280 720 560', focusable: 'false'}), defs = svgNode('defs');
  const gradient = svgNode('linearGradient', {id: 'acknowledgement-steel', x1: 0, y1: 0, x2: 1, y2: .15});
  [[0, '#786f60'], [.27, '#f4eedc'], [.46, '#b8b09b'], [.72, '#eee7d3'], [1, '#756956']].forEach(([offset, color]) => gradient.append(svgNode('stop', {offset, 'stop-color': color})));
  defs.append(gradient);svg.append(defs);
  // Paired poses: entry, feint, clash, recoil, reverse parry, and final disengagement.
  // Each transform belongs to SVG user space, so rotation remains at the grip.
  const poses = [
    [0, -410, 125, 88, 410, 125, -88],
    [.70, -140, 65, -12, 140, 65, 12],
    [1.14, -68, 38, 36, 68, 38, -36],
    [1.43, -155, 66, -26, 155, 48, 26],
    [1.92, -48, -12, 56, 72, 66, -18],
    [2.29, -163, 14, -20, 142, 92, 28],
    [2.77, -80, 62, 18, 48, -16, -56],
    [3.17, -154, 86, -38, 162, 36, 24],
    [3.76, -57, 42, 42, 57, 42, -42],
    [4.10, -155, 38, -34, 155, 80, 34],
    [4.66, -45, -20, 58, 78, 65, -18],
    [5.03, -170, 88, -28, 165, 20, 36],
    [5.59, -78, 62, 18, 45, -20, -58],
    [5.95, -160, 70, -35, 160, 70, 35],
    [6.49, -60, 42, 39, 60, 42, -39],
    [6.83, -110, 76, 16, 110, 76, -16],
    [7.60, -400, 140, -78, 400, 140, 78],
  ];
  const motions = [0, 1].map(() => {const g = svgNode('g');g.append(katana(0));svg.append(g);return g;});
  const arcs = [-1, 1].map(sign => {
    const p=svgNode('path',{d:`M${sign*242} 87 Q${sign*193} -181 ${-sign*135} -164`,fill:'none',stroke:'#c4a46b','stroke-width':1.2,'stroke-linecap':'round'});
    svg.insertBefore(p,motions[0]);return p;
  });
  const sparks = svgNode('g');svg.append(sparks);
  const rays = Array.from({length:18},(_,i)=>{const line=svgNode('path',{stroke:i%3?'#c4a46b':'#f0eadb','stroke-width':i%4?1:1.7,'stroke-linecap':'round'});sparks.append(line);return line;});
  const hits = [1.14,1.92,2.77,3.76,4.66,5.59,6.49];
  field.append(svg);
  const disposeLogo = addEtchedLogo(field, './acknowledgement-ichiran.png', 'acknowledgement-ichiran-logo');
  const logo = field.querySelector('.acknowledgement-logo');logo.style.opacity='0';
  document.body.append(field);
  const ease=u=>{u=Math.max(0,Math.min(1,u));return u*u*(3-2*u);};
  manageEffect({nodes:[field],duration,onCleanup:disposeLogo,onFrame:progress=>{
    const ms=progress*duration,t=ms/(reduced?1000:500);
    svg.style.opacity=String(ease(ms/400)*(1-ease((ms-swordsEnd+500)/500)));
    const glow=ease((ms-logoStart)/650)*(1-ease((ms-duration+700)/700));
    logo.style.opacity=String(glow);
    logo.style.transform=reduced?'none':`scale(${.94+.06*ease((ms-logoStart)/900)})`;
    if(reduced){motions.forEach((g,i)=>g.setAttribute('transform',`translate(${i?60:-60} 42) rotate(${i?-39:39})`));arcs.forEach(p=>p.style.opacity='0');sparks.style.opacity='0';return;}
    let k=0;while(k<poses.length-2&&t>poses[k+1][0])k++;
    const a=poses[k],b=poses[k+1],u=ease((t-a[0])/(b[0]-a[0]));
    motions.forEach((g,i)=>{const j=1+i*3;const v=[0,1,2].map(d=>a[j+d]+(b[j+d]-a[j+d])*u);g.setAttribute('transform',`translate(${v[0]} ${v[1]}) rotate(${v[2]})`);});
    let hit=-10;for(const h of hits)if(h<=t)hit=h;
    const age=t-hit,burst=age>=0&&age<.28?(1-age/.28)**2:0;
    arcs.forEach((p,i)=>{p.style.opacity=String(burst*.3);p.setAttribute('transform',`rotate(${i?-12:12})`);});
    sparks.style.opacity=String(burst);
    rays.forEach((p,i)=>{const angle=i*2.39996+hit,dist=9+age*(100+(i%5)*24),length=4+(i%4)*5,cx=0,cy=-62;
      p.setAttribute('d',`M${cx+Math.cos(angle)*dist} ${cy+Math.sin(angle)*dist} l${Math.cos(angle)*length} ${Math.sin(angle)*length}`);});
  }});
}

function showJakDaxter() {
  clearAcknowledgementEffect?.();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, duration = reduced ? 1500 : 2200;
  const field = document.createElement('div');field.className = 'acknowledgement-jak-daxter acknowledgement-nicholas-effect';
  field.dataset.effect = 'jak-daxter';field.setAttribute('aria-hidden', 'true');field.inert = true;
  const disposeLogo = addEtchedLogo(field, './acknowledgement-jak-daxter.png', 'acknowledgement-jak-daxter-logo', {kind: 'jak-daxter'});
  document.body.append(field);
  const frames = reduced ? [{opacity: 0}, {opacity: .98, offset: .25}, {opacity: .98, offset: .7}, {opacity: 0}]
    : [{opacity: 0, transform: 'translateY(8px) scale(.97)'}, {opacity: .98, transform: 'translateY(0) scale(1)', offset: .25}, {opacity: .98, transform: 'translateY(0) scale(1)', offset: .7}, {opacity: 0, transform: 'translateY(-4px) scale(1)'}];
  const animation = field.querySelector('.acknowledgement-logo').animate(frames, {duration, easing: 'cubic-bezier(.2,.65,.35,1)'});
  manageEffect({nodes: [field], animations: [animation], duration, onCleanup: disposeLogo});
}

const personalActions = Object.freeze({
  Clara: {label: 'show hearts', show: showClaraHearts},
  Miriam: {label: 'spray graffiti', show: showMiriamGraffiti},
  Rikke: {label: 'show a psychedelic colour wave', show: showColourWave},
  Nicholas: {label: 'show a surprise', show: showNicholasCycle},
});
