import { renderMath, fitMath } from './math.js';

// A presenter-controlled cancellation: draw over the matching input factors, then
// reveal the already-typeset simplified equation. Nothing moves between positions.
export function mountPatlakCancellation(holder, states, nodes) {
  let previous = null, version = 0, raf = 0, layer = null;
  const animations = new Set();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  holder.classList.add('math-morph-enabled');
  const clean = () => {
    version++;
    cancelAnimationFrame(raf);
    for (const animation of animations) animation.cancel();
    animations.clear();
    layer?.remove(); layer = null;
    holder.classList.remove('math-morph-running');
    delete holder.dataset.cancellationPhase;
  };
  const animate = async (node, frames, options) => {
    const animation = node.animate(frames, { fill: 'forwards', ...options });
    animations.add(animation);
    await animation.finished.catch(() => {});
  };
  const play = async (at, id, source) => {
    const target = nodes[at], spec = states[at].cancelMatchingInput;
    const annotation = target.querySelector('annotation[encoding="application/x-tex"]');
    // A user's replacement equation always takes precedence over authored animation.
    if (id !== version || !holder.isConnected || annotation?.textContent !== states[at].tex ||
      getComputedStyle(target).visibility === 'hidden' ||
      (target.style.scale && target.style.scale !== 'none' && target.style.scale.split(/\s+/).some(x=>Number(x)!==1))) return;
    layer = document.createElement('span');
    layer.className = 'math-morph-layer';
    layer.setAttribute('aria-hidden', 'true'); layer.setAttribute('inert', '');
    layer.style.visibility = 'hidden';
    const frame = document.createElement('span'); frame.className = 'mm-frame';
    for (const prop of ['fontSize', 'letterSpacing', 'lineHeight']) frame.style[prop] = source[prop];
    renderMath(frame, spec.tex, true); layer.append(frame); holder.append(layer); fitMath(frame);
    const display = frame.querySelector('.katex-display');
    if (display && source.displayFontSize) display.style.fontSize = source.displayFontSize;
    const anchor = frame.querySelector('.mm-key-lhs')?.getBoundingClientRect();
    const destination = source.anchor;
    if (anchor && destination) {
      const bounds = holder.getBoundingClientRect();
      const sx = bounds.width / holder.offsetWidth || 1, sy = bounds.height / holder.offsetHeight || 1;
      frame.style.transform = `translate(${(destination.x-anchor.x)/sx}px,${(destination.y-anchor.y)/sy}px)`;
    }
    holder.classList.add('math-morph-running'); layer.style.visibility = 'visible';
    holder.dataset.cancellationPhase = 'strike';
    const strokes = [...frame.querySelectorAll('.mm-cancel')].map(node => {
      const stroke = document.createElement('span'); stroke.className = 'mm-cancel-stroke'; node.append(stroke);
      return animate(stroke, [{transform:'rotate(-25deg) scaleX(0)'}, {transform:'rotate(-25deg) scaleX(1)'}],
        { duration: 480, delay: 100, easing: 'ease-out' });
    });
    await Promise.all(strokes);
    if (id !== version) return;
    holder.dataset.cancellationPhase = 'cancelled';
    await animate(frame, [{opacity:1},{opacity:1}], {duration:360, fill:'none'});
    if (id !== version) return;
    holder.dataset.cancellationPhase = 'remove';
    await animate(frame.querySelector('.mm-key-unit'), [{opacity:1},{opacity:0}], {duration:280,easing:'ease-in'});
    if (id === version) clean();
  };
  const observer = new MutationObserver(() => {
    if (!holder.isConnected) { clean(); observer.disconnect(); reduced.removeEventListener('change', clean); }
  });
  let observing = false;
  reduced.addEventListener('change', clean);
  return (at, nav={}) => {
    if (!observing && holder.isConnected) {
      observer.observe(document.getElementById('deck') || document.body, {childList:true, subtree:true});
      observing = true;
    }
    if (previous === at && !nav.settled && !nav.backward && !nav.directEnd) return;
    const from = previous, forward = from !== null && at === from + 1;
    const node = from === null ? null : nodes[from];
    const style = node && getComputedStyle(node);
    const source = node && {
      matches: node.querySelector('annotation[encoding="application/x-tex"]')?.textContent === states[from].tex,
      anchor: node.querySelector('.mm-key-lhs')?.getBoundingClientRect(),
      fontSize: style.fontSize, letterSpacing: style.letterSpacing, lineHeight: style.lineHeight,
      displayFontSize: node.querySelector('.katex-display') && getComputedStyle(node.querySelector('.katex-display')).fontSize,
      hidden: style.visibility === 'hidden',
      scaled: node.style.scale && node.style.scale !== 'none' && node.style.scale.split(/\s+/).some(x=>Number(x)!==1),
    };
    previous = at; clean();
    if (!forward || !states[at]?.cancelMatchingInput || nav.settled || nav.backward || nav.directEnd || reduced.matches ||
      !source.matches || source.hidden || source.scaled) return;
    const id = version;
    raf = requestAnimationFrame(() => play(at, id, source).catch(() => { if (id === version) clean(); }));
  };
}
