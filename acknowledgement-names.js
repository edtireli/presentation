import {narrationReleased} from './narration-release.js';
import {createJellyfishRenderer} from './acknowledgement-jellyfish.js';
import {createUnderwaterRenderer} from './acknowledgement-water.js';
import {createDancerRenderer} from './acknowledgement-dancer.js';
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
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const field = document.createElement('div');
  field.className = 'acknowledgement-hearts';field.id = 'acknowledgement-heart-field';
  field.setAttribute('aria-hidden', 'true');field.inert = true;
  const colors = ['#f0eadb', '#c4a46b', '#a8785d', '#d4c4a0'];
  const columns = innerWidth < 600 ? 5 : 8, rows = 5, animations = [];
  for (let i = 0; i < columns * rows; i++) {
    const heart = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    heart.setAttribute('viewBox', '0 0 48 48');heart.setAttribute('focusable', 'false');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M24 42C20 37 5 27 5 16C5 5 19 1 24 12C29 1 43 5 43 16C43 27 28 37 24 42Z');
    path.setAttribute('fill', i % 3 === 0 ? 'currentColor' : 'none');
    path.setAttribute('stroke', 'currentColor');path.setAttribute('stroke-width', i % 3 === 0 ? '0.7' : '1.25');
    heart.append(path);
    const column = i % columns, row = Math.floor(i / columns);
    const size = 23 + Math.random() * (innerWidth < 600 ? 28 : 46);
    Object.assign(heart.style, {
      left: `${(column + 0.22 + Math.random() * .56) / columns * 100}%`,
      top: `${(row + .25 + Math.random() * .65) / rows * 100}%`,
      width: `${size}px`, height: `${size}px`, color: colors[i % colors.length],
    });
    field.append(heart);
    const opacity = i % 3 === 0 ? .55 : .8;
    const turn = -16 + Math.random() * 32;
    const frames = reduced ? [{opacity: 0}, {opacity, offset: .28}, {opacity: 0}]
      : [{opacity: 0, transform: `translate(-50%, 15px) scale(.55) rotate(${turn}deg)`},
         {opacity, transform: `translate(-50%, -15px) scale(1) rotate(${turn}deg)`, offset: .26},
         {opacity: 0, transform: `translate(-50%, -85px) scale(1.05) rotate(${turn * .65}deg)`}];
    animations.push(heart.animate(frames, {duration: reduced ? 750 : 1500 + Math.random() * 260, delay: reduced ? 0 : Math.random() * 200, easing: 'cubic-bezier(.2,.65,.35,1)', fill: 'both'}));
  }
  document.body.append(field);
  manageEffect({nodes: [field], animations, duration: reduced ? 900 : 2100});
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
}

function showMiriamJellyfish() {
  clearAcknowledgementEffect?.();
  const field = document.createElement('canvas');
  field.className = 'acknowledgement-jellyfish';field.setAttribute('aria-hidden', 'true');field.inert = true;
  document.body.append(field);
  let renderer;
  try {renderer = createJellyfishRenderer(field, {reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches});}
  catch (error) {field.remove();throw error;}
  renderer.render(0);
  manageEffect({nodes: [field], duration: renderer.durationMs, onFrame: progress => renderer.render(progress), onCleanup: () => renderer.dispose()});
}

function showUnderwater() {
  clearAcknowledgementEffect?.();
  const field = document.createElement('canvas');
  field.className = 'acknowledgement-underwater';field.dataset.effect = 'underwater';
  field.setAttribute('aria-hidden', 'true');field.inert = true;
  document.body.append(field);
  let renderer;
  try {renderer = createUnderwaterRenderer(field, {reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches});}
  catch (error) {field.remove();throw error;}
  renderer.render(0);
  manageEffect({nodes: [field], duration: renderer.durationMs, onFrame: progress => renderer.render(progress), onCleanup: () => renderer.dispose()});
}

function showDance() {
  clearAcknowledgementEffect?.();
  const field = document.createElement('div');field.className = 'acknowledgement-dance';field.dataset.effect = 'dance';
  field.setAttribute('aria-hidden', 'true');field.inert = true;
  const canvas = document.createElement('canvas');canvas.className = 'acknowledgement-dancer';field.append(canvas);document.body.append(field);
  const renderer = createDancerRenderer(canvas, {reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches});
  renderer.render(0);
  manageEffect({nodes: [field], duration: renderer.durationMs, onFrame: progress => renderer.render(progress), onCleanup: () => renderer.dispose()});
}

let rikkeCycle = 0, nicholasCycle = 0;
function showRikkeCycle() {
  const effects = [showColourWave, showUnderwater, showDance];
  const effect = effects[rikkeCycle];rikkeCycle = (rikkeCycle + 1) % effects.length;effect();
}
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
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const targets = [...document.querySelectorAll('#gate-main, #gate-field')];
  if (!targets.length) targets.push(document.body);
  const animations = [], nodes = [], duration = reduced ? 1500 : 2500;
  let displacement, noise, redOffset, greenOffset;
  if (!reduced) {
    const defsSVG = svgNode('svg', {width: 0, height: 0, 'aria-hidden': 'true'});
    defsSVG.classList.add('acknowledgement-wave-defs');
    const defs = svgNode('defs'), filter = svgNode('filter', {id: 'acknowledgement-colour-wave', x: '-10%', y: '-10%', width: '120%', height: '120%', 'color-interpolation-filters': 'sRGB'});
    noise = svgNode('feTurbulence', {type: 'fractalNoise', baseFrequency: '.012 .026', numOctaves: 2, seed: 8, result: 'noise'});
    displacement = svgNode('feDisplacementMap', {in: 'SourceGraphic', in2: 'noise', scale: 0, xChannelSelector: 'R', yChannelSelector: 'G', result: 'warp'});
    filter.append(noise, displacement);
    filter.append(svgNode('feColorMatrix', {in: 'warp', type: 'matrix', values: '1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0', result: 'red'}));
    redOffset = svgNode('feOffset', {in: 'red', dx: 0, dy: 0, result: 'red-shift'});filter.append(redOffset);
    filter.append(svgNode('feColorMatrix', {in: 'warp', type: 'matrix', values: '0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0', result: 'green'}));
    greenOffset = svgNode('feOffset', {in: 'green', dx: 0, dy: 0, result: 'green-shift'});filter.append(greenOffset);
    filter.append(svgNode('feColorMatrix', {in: 'warp', type: 'matrix', values: '0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0', result: 'blue'}));
    filter.append(svgNode('feBlend', {in: 'red-shift', in2: 'green-shift', mode: 'screen', result: 'red-green'}));
    filter.append(svgNode('feBlend', {in: 'red-green', in2: 'blue', mode: 'screen'}));
    defs.append(filter);defsSVG.append(defs);document.body.append(defsSVG);nodes.push(defsSVG);
  }
  for (const target of targets) {
    const original = getComputedStyle(target), baseFilter = original.filter === 'none' ? '' : original.filter;
    const baseOpacity = Number(original.opacity), baseTransform = original.transform === 'none' ? '' : original.transform;
    const filter = value => `${baseFilter} ${value}`.trim();
    const frames = reduced
      ? [{filter: filter('sepia(0) saturate(1)'), opacity: baseOpacity}, {filter: filter('sepia(.15) saturate(1.15)'), opacity: baseOpacity * .94}, {filter: original.filter, opacity: baseOpacity}]
      : [{filter: filter('url("#acknowledgement-colour-wave") hue-rotate(0deg) saturate(1)'), transform: `${baseTransform} skewX(0deg)`},
         {filter: filter('url("#acknowledgement-colour-wave") hue-rotate(110deg) saturate(1.8)'), transform: `${baseTransform} skewX(.6deg)`, offset: .34},
         {filter: filter('url("#acknowledgement-colour-wave") hue-rotate(240deg) saturate(1.7)'), transform: `${baseTransform} skewX(-.5deg)`, offset: .68},
         {filter: filter('url("#acknowledgement-colour-wave") hue-rotate(360deg) saturate(1)'), transform: `${baseTransform} skewX(0deg)`}];
    animations.push(target.animate(frames, {duration, easing: 'ease-in-out'}));
  }
  manageEffect({nodes, animations, duration, onFrame: reduced ? null : progress => {
    const envelope = Math.sin(Math.PI * progress);
    displacement.setAttribute('scale', String(16 * envelope));
    noise.setAttribute('baseFrequency', `${.012 + .003 * Math.sin(progress * Math.PI)} ${.026 + .006 * Math.sin(progress * Math.PI * 2)}`);
    redOffset.setAttribute('dx', String(4 * envelope));greenOffset.setAttribute('dx', String(-3 * envelope));
  }});
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
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, duration = reduced ? 1100 : 2000;
  const field = document.createElement('div');field.className = 'acknowledgement-swords acknowledgement-nicholas-effect';field.dataset.effect = 'ichiran';field.setAttribute('aria-hidden', 'true');field.inert = true;
  const svg = svgNode('svg', {viewBox: '-360 -280 720 560', focusable: 'false'}), defs = svgNode('defs');
  const gradient = svgNode('linearGradient', {id: 'acknowledgement-steel', x1: 0, y1: 0, x2: 1, y2: .15});
  [[0, '#786f60'], [.27, '#f4eedc'], [.46, '#b8b09b'], [.72, '#eee7d3'], [1, '#756956']].forEach(([offset, color]) => gradient.append(svgNode('stop', {offset, 'stop-color': color})));
  defs.append(gradient);svg.append(defs);
  const animations = [];
  if (!reduced) {
    const swish = svgNode('path', {d: 'M-265 120C-230-110 92-260 260-76', fill: 'none', stroke: '#c6a56b', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-dasharray': 780});svg.append(swish);
    animations.push(swish.animate([{strokeDashoffset: 780, opacity: 0}, {strokeDashoffset: 0, opacity: .55, offset: .3}, {strokeDashoffset: 0, opacity: 0, offset: .65}, {opacity: 0}], {duration, easing: 'ease-out'}));
  }
  [-34, 34].forEach((angle, index) => {
    // SVG's own rotation fixes the crossing at its user-space origin. The outer
    // group's small translation avoids CSS transform-origin differences in SVG.
    const motion = svgNode('g'), sword = katana(angle);motion.append(sword);svg.append(motion);
    const frames = reduced ? [{opacity: 0}, {opacity: .85, offset: .25}, {opacity: .85, offset: .65}, {opacity: 0}]
      : [{opacity: 0, transform: `translate(${index ? 45 : -45}px, 10px)`}, {opacity: .94, transform: 'translate(0px, 0px)', offset: .25}, {opacity: .94, transform: 'translate(0px, 0px)', offset: .72}, {opacity: 0, transform: 'translate(0px, -8px)'}];
    animations.push(motion.animate(frames, {duration, easing: 'cubic-bezier(.2,.65,.35,1)'}));
  });
  field.append(svg);
  const disposeLogo = addEtchedLogo(field, './acknowledgement-ichiran.png', 'acknowledgement-ichiran-logo');
  const logo = field.querySelector('.acknowledgement-logo');
  animations.push(logo.animate([{opacity: 0}, {opacity: 1, offset: .18}, {opacity: 1, offset: .72}, {opacity: 0}], {duration, easing: 'ease-in-out'}));
  document.body.append(field);manageEffect({nodes: [field], animations, duration, onCleanup: disposeLogo});
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
  Miriam: {label: 'spray a jellyfish', show: showMiriamJellyfish},
  Rikke: {label: 'show a surprise', show: showRikkeCycle},
  Nicholas: {label: 'show a surprise', show: showNicholasCycle},
});
