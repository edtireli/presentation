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
    if (match[2] === 'Clara') {
      const button = document.createElement('button');
      button.type = 'button';button.className = 'acknowledgement-clara';
      button.textContent = match[2];button.setAttribute('aria-label', 'Clara, show hearts');
      button.addEventListener('click', showClaraHearts);
      mark.append(button);
    } else mark.textContent = match[2];
    paragraph.append(mark);
    cursor = start + match[2].length;
  }
  if (cursor < text.length) paragraph.append(document.createTextNode(text.slice(cursor)));
  return paragraph;
}


let clearHeartField = null;
function showClaraHearts() {
  clearHeartField?.();
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
  let ended = false, timer;
  const hidden = () => {if (document.hidden) cleanup();};
  const cleanup = () => {
    if (ended) return;ended = true;clearTimeout(timer);
    animations.forEach(animation => animation.cancel());field.remove();
    removeEventListener('pagehide', cleanup);removeEventListener('hashchange', cleanup);
    document.removeEventListener('visibilitychange', hidden);
    if (clearHeartField === cleanup) clearHeartField = null;
  };
  clearHeartField = cleanup;
  addEventListener('pagehide', cleanup, {once: true});addEventListener('hashchange', cleanup, {once: true});
  document.addEventListener('visibilitychange', hidden);
  timer = setTimeout(cleanup, reduced ? 900 : 2100);
  Promise.allSettled(animations.map(animation => animation.finished)).then(cleanup);
}
