// Each word lends its own glyph pixels to one heart. The source DOM never moves
// or changes its text: only its paint is borrowed for the duration of the effect.
const PALETTE = ['#f0eadb', '#c4a46b', '#a8785d', '#ce9cae', '#a293c8'];
const TAU = Math.PI * 2;
const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => {const t = clamp(value);return t * t * (3 - 2 * t);};
const between = (a, b, amount) => a + (b - a) * amount;

function randomFor(text, index) {
  let seed = 2166136261 ^ index;
  for (let i = 0; i < text.length; i++) seed = Math.imul(seed ^ text.charCodeAt(i), 16777619);
  return () => {seed ^= seed << 13;seed ^= seed >>> 17;seed ^= seed << 5;return (seed >>> 0) / 4294967296;};
}

function heartPath(context, size, width, height) {
  // A closed, curved silhouette gives both filled and outlined hearts the same
  // particle destination, with slightly different proportions for every word.
  const x = size * width, y = size * height;
  context.beginPath();
  context.moveTo(0, -.23 * y);
  context.bezierCurveTo(-.26 * x, -.62 * y, -.68 * x, -.37 * y, -.49 * x, -.02 * y);
  context.bezierCurveTo(-.39 * x, .16 * y, -.12 * x, .32 * y, 0, .49 * y);
  context.bezierCurveTo(.12 * x, .32 * y, .39 * x, .16 * y, .49 * x, -.02 * y);
  context.bezierCurveTo(.68 * x, -.37 * y, .26 * x, -.62 * y, 0, -.23 * y);
  context.closePath();
}

function pixels(canvas, step, limit) {
  const context = canvas.getContext('2d', {willReadFrequently: true});
  const {data} = context.getImageData(0, 0, canvas.width, canvas.height), points = [];
  for (let y = 0; y < canvas.height; y += step) {
    for (let x = 0; x < canvas.width; x += step) {
      const alpha = data[(Math.floor(y) * canvas.width + Math.floor(x)) * 4 + 3];
      if (alpha > 45) points.push({x, y, alpha: alpha / 255});
    }
  }
  if (points.length <= limit) return points;
  return Array.from({length: limit}, (_, i) => points[Math.floor(i * points.length / limit)]);
}

function spriteFor(word, style) {
  const padding = 4, canvas = document.createElement('canvas');
  canvas.width = Math.ceil(word.rect.width + padding * 2);
  canvas.height = Math.ceil(word.rect.height + padding * 2);
  const context = canvas.getContext('2d', {willReadFrequently: true});
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  if ('letterSpacing' in context) context.letterSpacing = style.letterSpacing;
  if ('fontKerning' in context) context.fontKerning = style.fontKerning;
  context.textBaseline = 'alphabetic';
  context.fillStyle = word.color;
  let text = word.text;
  if (style.textTransform === 'uppercase') text = text.toLocaleUpperCase();
  if (style.textTransform === 'lowercase') text = text.toLocaleLowerCase();
  const metrics = context.measureText(text);
  const ascent = metrics.fontBoundingBoxAscent ?? parseFloat(style.fontSize) * .8;
  const descent = metrics.fontBoundingBoxDescent ?? parseFloat(style.fontSize) * .2;
  const baseline = padding + (word.rect.height - ascent - descent) / 2 + ascent;
  context.fillText(text, padding, baseline);
  return {canvas, padding};
}

function collectWords(root) {
  const words = [], range = document.createRange(), walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || !node.textContent.trim() || parent.closest('script, style, noscript, textarea, [hidden], [aria-hidden="true"], .acknowledgement-clara')) continue;
    const style = getComputedStyle(parent);
    if (style.visibility !== 'visible' || style.display === 'none' || Number(style.opacity) === 0) continue;
    for (const match of node.textContent.matchAll(/\S+/gu)) {
      if (match[0].replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '') === 'Clara') continue;
      // Standalone ornamental arrows are UI decoration, not words.
      if (!/[\p{L}\p{N}]/u.test(match[0])) continue;
      range.setStart(node, match.index);range.setEnd(node, match.index + match[0].length);
      const measured = range.getBoundingClientRect();
      if (!measured.width || !measured.height) continue;
      // Capture the complete reading page. Scrolling reveals the same word at
      // its current phase rather than cancelling or restarting its animation.
      const rect = {left: measured.left + scrollX, top: measured.top + scrollY,
        width: measured.width, height: measured.height};
      const color = style.webkitTextFillColor && style.webkitTextFillColor !== 'currentcolor' ? style.webkitTextFillColor : style.color;
      words.push({text: match[0], parent, rect, color, style});
    }
  }
  range.detach();return words;
}

function prepareWord(word, index, reducedMotion) {
  const random = randomFor(word.text, index), {canvas, padding} = spriteFor(word, word.style);
  const fontSize = parseFloat(word.style.fontSize);
  const size = Math.max(8, Math.min(word.rect.width * .91, fontSize * (1.04 + random() * .36)));
  const width = .86 + random() * .24, height = .87 + random() * .20;
  const tilt = (random() - .5) * .38, filled = random() > .38;
  const color = PALETTE[Math.floor(random() * PALETTE.length)];
  const lineWidth = Math.max(.85, size * .043);
  const mask = document.createElement('canvas'), dimension = Math.ceil(size * 1.65 + 8);
  mask.width = mask.height = dimension;
  const context = mask.getContext('2d', {willReadFrequently: true});
  context.translate(dimension / 2, dimension / 2);context.rotate(tilt);
  heartPath(context, size, width, height);
  context.fillStyle = context.strokeStyle = '#fff';context.lineWidth = lineWidth;
  if (filled) context.fill();else context.stroke();
  const source = reducedMotion ? [] : pixels(canvas, fontSize > 40 ? 1.4 : 1, fontSize > 40 ? 850 : 240);
  const destination = reducedMotion ? [] : pixels(mask, .85, source.length || 1);
  // Sort into neighbouring scan lines so letter strokes gather coherently. The
  // targets are sampled from the actual curved heart, not a bounding rectangle.
  const points = destination.length ? source.map((point, i) => {
    const target = destination[Math.min(destination.length - 1, Math.floor(i * destination.length / source.length))];
    return [point.x - padding - word.rect.width / 2, point.y - padding - word.rect.height / 2,
      target.x - dimension / 2, target.y - dimension / 2, point.alpha];
  }) : [];
  return {...word, sprite: canvas, padding, points, size, width, height, tilt, filled, color,
    sourceColor: word.color, lineWidth, phase: random() * TAU, drift: 2 + random() * 4,
    delay: .025 + random() * .09};
}

function createTulips(width, height) {
  const tulips = [], mobile = width < 600;
  const mix = (hex, other, amount) => {
    const read = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
    return '#' + read(hex).map((v, i) => Math.round(v + (read(other)[i] - v) * amount).toString(16).padStart(2, '0')).join('');
  };
  // Overlapping, staggered cups make a border of flowers, rather than a row of
  // isolated stems. Muted petal pigments belong to the same family as the hearts.
  const pigments = ['#e9dfcc', '#d5adb9', '#c6b4d7', '#c6a36c', '#e5c7cc', '#a991bb', '#c2947e'];
  for (const edge of ['top', 'right', 'bottom', 'left']) {
    const horizontal = edge === 'top' || edge === 'bottom';
    const count = horizontal ? Math.max(6, Math.min(24, Math.ceil(width / (mobile ? 62 : 70))))
      : Math.max(6, Math.min(18, Math.ceil(height / (mobile ? 85 : 82))));
    for (let i = 0; i < count; i++) {
      const random = randomFor(edge, i + 73), pigment = pigments[Math.floor(random() * pigments.length)];
      tulips.push({edge, fraction: (i + .28 + random() * .44) / count,
        length: (mobile ? 13 : 17) + (i % 3) * (mobile ? 15 : 23) + random() * (mobile ? 19 : 29),
        size: (mobile ? 15 : 23) + random() * (mobile ? 12 : 21),
        bend: (random() - .5) * 22, lean: (random() - .5) * .38,
        phase: random() * TAU, delay: .015 + random() * .105,
        opening: .76 + random() * .22, color: pigment,
        light: mix(pigment, '#fff4e4', .50), mid: mix(pigment, '#f0dfd5', .15),
        shade: mix(pigment, '#443047', .36), deep: mix(pigment, '#251e29', .64)});
    }
  }
  // Back flowers are smaller; the larger cups overlap them at the lip of the border.
  return tulips.sort((a, b) => a.size - b.size);
}

function drawTulips(context, tulips, progress, reducedMotion, clara, width, height) {
  context.save();
  context.beginPath();context.rect(0, 0, width, height);
  for (const {element} of clara) {
    const rect = element.closest('.acknowledgement-name')?.getBoundingClientRect() ?? element.getBoundingClientRect();
    context.roundRect(rect.left - 17, rect.top - 13, rect.width + 34, rect.height + 26, 12);
  }
  context.clip('evenodd');
  const spring = value => {
    const u = clamp(value);
    // A single soft overshoot at the petal hinge; it settles without oscillating
    // the flower's whole stem or changing its anchor at the edge of the viewport.
    return u === 1 ? 1 : 1 - Math.exp(-7 * u) * (Math.cos(6.5 * u) + .35 * Math.sin(6.5 * u));
  };
  for (const flower of tulips) {
    const enter = ease((progress - flower.delay * .28) / .105);
    const leave = 1 - ease((progress - .81) / .18);
    const opacity = reducedMotion ? ease(progress / .17) * (1 - ease((progress - .77) / .2)) : enter * leave;
    if (opacity < .002) continue;
    context.save();
    const x = flower.edge === 'left' ? -8 : flower.edge === 'right' ? width + 8 : flower.fraction * width;
    const y = flower.edge === 'top' ? -8 : flower.edge === 'bottom' ? height + 8 : flower.fraction * height;
    const orientation = {bottom: 0, top: Math.PI, left: Math.PI / 2, right: -Math.PI / 2}[flower.edge];
    context.translate(x, y);context.rotate(orientation + flower.lean);
    const length = flower.length, bend = flower.bend, size = flower.size;
    // Stems are already in position and only fade in. Petal geometry supplies
    // the blooming motion; no scale-from-zero transform is applied to the plant.
    context.globalAlpha = opacity * .39;context.strokeStyle = '#8e9068';context.lineWidth = .9;
    context.beginPath();context.moveTo(0, 9);
    context.bezierCurveTo(-bend * .2, -length * .3, bend * .6, -length * .8, bend, -length);context.stroke();
    if (length > 38) {
      const side = Math.sin(flower.phase) > 0 ? 1 : -1;
      context.globalAlpha = opacity * .29;
      context.beginPath();context.moveTo(bend * .3, -length * .3);
      context.bezierCurveTo(side * size * .58, -length * .5, side * size * .7, -length * .67, side * size * .72, -length * .9);
      context.bezierCurveTo(side * size * .15, -length * .7, side * size * .12, -length * .38, bend * .3, -length * .3);
      context.fillStyle = '#979577';context.fill();
    }
    context.translate(bend, -length);
    const opening = reducedMotion ? 1 : spring((progress - flower.delay - .015) / .31) * flower.opening;
    const budWidth = .21 + .19 * Math.min(1, opening);
    // Thin rear petals remain tall. The outer two peel outward from the same
    // basal attachment, followed by the foreground cup and its curled light rim.
    function petal(side, layer, lag) {
      const open = reducedMotion ? 1 : spring((progress - flower.delay - lag) / .31) * flower.opening;
      const outward = side * (.07 + open * (layer === 'outer' ? .43 : .20));
      const tall = layer === 'rear' ? 1.55 : layer === 'outer' ? 1.25 : 1.08;
      const petalWidth = layer === 'rear' ? .35 : .50;
      context.save();context.rotate(outward);
      const fill = context.createLinearGradient(-size * .55, -size * 1.65, size * .52, size * .10);
      fill.addColorStop(0, flower.light);fill.addColorStop(.25, flower.mid);
      fill.addColorStop(.6, flower.color);fill.addColorStop(1, layer === 'rear' ? flower.deep : flower.shade);
      context.globalAlpha = opacity * (layer === 'rear' ? .83 : .96);
      context.fillStyle = fill;
      const tipX = side * size * (.05 + open * .14), tipY = -size * (tall - open * .08);
      context.beginPath();context.moveTo(0, size * .12);
      context.bezierCurveTo(-size * petalWidth, -size * .10, -size * (petalWidth + .13 * open), tipY + size * .30, tipX - size * budWidth * .30, tipY);
      context.bezierCurveTo(tipX + size * .14, tipY - size * .06, size * (petalWidth + .15 * open), -size * .73, size * petalWidth * .77, -size * .32);
      context.bezierCurveTo(size * .22, -size * .03, size * .10, size * .07, 0, size * .12);context.fill();
      // A narrow curved highlight reads as the folded petal edge, with faint
      // longitudinal veins contained inside the cupped silhouette.
      context.save();context.clip();
      context.strokeStyle = flower.light;context.lineWidth = .6;context.globalAlpha = opacity * .13;
      for (const vein of [-.19, 0, .19]) {
        context.beginPath();context.moveTo(vein * size * .2, size * .05);
        context.bezierCurveTo(vein * size * 1.3, -size * .4, tipX + vein * size * .5, tipY + size * .28, tipX + vein * size * .2, tipY);context.stroke();
      }
      context.restore();
      context.globalAlpha = opacity * .43;context.strokeStyle = flower.light;context.lineWidth = .8;
      context.beginPath();context.moveTo(-size * petalWidth * .82, -size * .68);
      context.bezierCurveTo(-size * (petalWidth + .13 * open), tipY + size * .30, tipX - size * budWidth * .30, tipY, tipX + size * .06, tipY + size * .015);context.stroke();
      context.restore();
    }
    petal(-1, 'rear', .010);petal(1, 'rear', .043);
    // A shaded interior is exposed gradually as the two front petals unfold.
    context.globalAlpha = opacity * .45 * Math.min(1, opening);
    context.fillStyle = flower.deep;context.beginPath();
    context.ellipse(0, -size * .70, size * (.16 + opening * .24), size * .36, 0, 0, TAU);context.fill();
    petal(-1, 'outer', .054);petal(1, 'outer', .078);
    const cup = context.createLinearGradient(-size * .4, -size, size * .45, size * .15);
    cup.addColorStop(0, flower.light);cup.addColorStop(.33, flower.mid);cup.addColorStop(.78, flower.color);cup.addColorStop(1, flower.shade);
    const spread = .30 + opening * .21, lip = -size * (1.03 - .28 * opening);
    context.globalAlpha = opacity * .97;context.fillStyle = cup;
    context.beginPath();context.moveTo(0, size * .13);
    context.bezierCurveTo(-size * .5, -size * .02, -size * spread * 1.05, -size * .60, -size * spread, lip);
    context.bezierCurveTo(-size * spread * .35, lip + size * .23, size * spread * .35, lip + size * .23, size * spread, lip);
    context.bezierCurveTo(size * spread * 1.05, -size * .60, size * .5, -size * .02, 0, size * .13);context.fill();
    context.globalAlpha = opacity * .59;context.strokeStyle = flower.light;context.lineWidth = .9;
    context.beginPath();context.moveTo(-size * spread, lip);
    context.bezierCurveTo(-size * spread * .35, lip + size * .23, size * spread * .35, lip + size * .23, size * spread, lip);context.stroke();
    context.restore();
  }
  context.restore();
}

export function createWordHeartsEffect() {
  const root = document.querySelector('#acknowledgements:not([hidden])') ?? document.querySelector('#gate-main') ?? document.body;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let words = collectWords(root).map((word, index) => prepareWord(word, index, reducedMotion));
  const canvas = document.createElement('canvas');
  canvas.id = 'acknowledgement-heart-field';canvas.className = 'acknowledgement-word-hearts';
  canvas.setAttribute('aria-hidden', 'true');canvas.inert = true;
  canvas.dataset.wordCount = String(words.length);
  canvas.dataset.reducedMotion = String(reducedMotion);
  Object.assign(canvas.style, {position: 'fixed', inset: '0', width: '100%', height: '100%',
    zIndex: '100500', pointerEvents: 'none', contain: 'strict'});
  const context = canvas.getContext('2d');
  if (!context || !words.length) return {nodes: [], duration: 1, onFrame() {}, onCleanup() {}};
  let width = innerWidth, height = innerHeight, tulips = createTulips(width, height);
  const resizeCanvas = () => {
    width = innerWidth;height = innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    tulips = createTulips(width, height);canvas.dataset.tulipCount = String(tulips.length);
  };
  resizeCanvas();

  // Save complete style attributes, including absent attributes. Restoring them
  // also preserves authored priorities and keeps repeated triggers exact.
  const savedStyles = new Map(), remember = element => {
    if (!savedStyles.has(element)) savedStyles.set(element, element.getAttribute('style'));
  };
  let clara = [], markers = [], ended = false, layoutDirty = false;
  const restorePaint = () => {
    for (const [element, style] of savedStyles) {
      // Flush Blink's pending CSSOM serialization before removing an originally
      // absent attribute; otherwise it can reappear as an empty style="".
      element.getAttribute('style');
      if (style === null) element.removeAttribute('style');
      else element.style.cssText = style; // setAttribute would be rejected by the gate's style-src CSP.
    }
    savedStyles.clear();
  };
  const borrowPaint = () => {
    clara = [...root.querySelectorAll('.acknowledgement-clara')].map(element => ({element, color: getComputedStyle(element).webkitTextFillColor || getComputedStyle(element).color}));
    markers = [...root.querySelectorAll('.acknowledgement-name')].filter(mark =>
      !mark.querySelector('.acknowledgement-clara') && words.some(word => mark.contains(word.parent)));
    for (const parent of new Set(words.map(word => word.parent))) {
      remember(parent);
      // These painting properties preserve all layout, text, and click targets.
      parent.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
      parent.style.setProperty('text-shadow', 'none', 'important');
    }
    for (const {element, color} of clara) {
      remember(element);element.style.setProperty('-webkit-text-fill-color', color, 'important');
    }
    for (const marker of markers) remember(marker);
    canvas.dataset.wordCount = String(words.length);
  };
  borrowPaint();document.body.append(canvas);
  const markLayoutDirty = () => {layoutDirty = true;};
  const observer = new MutationObserver(markLayoutDirty);
  observer.observe(root, {childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['hidden']});
  addEventListener('resize', markLayoutDirty);
  window.visualViewport?.addEventListener('resize', markLayoutDirty);
  document.fonts?.addEventListener('loadingdone', markLayoutDirty);
  const onCleanup = () => {
    if (ended) return;ended = true;
    restorePaint();canvas.remove();observer.disconnect();
    removeEventListener('resize', markLayoutDirty);
    window.visualViewport?.removeEventListener('resize', markLayoutDirty);
    document.fonts?.removeEventListener('loadingdone', markLayoutDirty);
    words.length = 0;markers.length = 0;clara.length = 0;tulips.length = 0;
  };

  const onFrame = progress => {
    if (ended) return;
    const p = clamp(progress);
    if (layoutDirty || width !== innerWidth || height !== innerHeight) {
      // Re-measure responsive type without changing word seeds or the manager's
      // clock. Restore and borrow happen together, before the browser paints.
      restorePaint();words = collectWords(root).map((word, index) => prepareWord(word, index, reducedMotion));
      borrowPaint();resizeCanvas();layoutDirty = false;
    }
    context.clearRect(0, 0, width, height);
    drawTulips(context, tulips, p, reducedMotion, clara, width, height);
    const markerMorph = reducedMotion ? ease(p / .17) * (1 - ease((p - .77) / .2)) : ease((p - .04) / .25) * (1 - ease((p - .74) / .22));
    for (const marker of markers) marker.style.opacity = String(1 - markerMorph);
    for (const word of words) {
      const left = word.rect.left - scrollX, top = word.rect.top - scrollY;
      if (left + word.rect.width < -16 || left > width + 16 || top + word.rect.height < -16 || top > height + 16) continue;
      const morph = reducedMotion ? markerMorph : ease((p - word.delay) / .265) * (1 - ease((p - .72 - word.delay * .25) / .235));
      const cx = left + word.rect.width / 2, cy = top + word.rect.height / 2;
      const driftX = reducedMotion ? 0 : Math.sin(p * TAU * .8 + word.phase) * word.drift * morph;
      const driftY = reducedMotion ? 0 : (Math.cos(p * TAU * .65 + word.phase) * 2 - 3) * morph;
      const glyphOpacity = reducedMotion ? 1 - morph : 1 - ease(morph / .22);
      if (glyphOpacity > 0) {
        context.globalAlpha = glyphOpacity;
        context.drawImage(word.sprite, left - word.padding, top - word.padding);
      }
      const heartOpacity = reducedMotion ? morph : ease((morph - .72) / .28);
      const particleOpacity = reducedMotion ? 0 : ease(morph / .13) * (1 - heartOpacity);
      if (particleOpacity > .001) {
        context.fillStyle = morph < .1 ? word.sourceColor : word.color;
        const pointSize = between(1.15, word.filled ? Math.max(1.1, word.size / 16) : word.lineWidth, morph);
        for (const [x, y, tx, ty, alpha] of word.points) {
          context.globalAlpha = particleOpacity * between(alpha, .88, morph);
          context.fillRect(cx + between(x, tx, morph) + driftX - pointSize / 2,
            cy + between(y, ty, morph) + driftY - pointSize / 2, pointSize, pointSize);
        }
      }
      if (heartOpacity > 0) {
        context.save();context.globalAlpha = heartOpacity * .94;
        context.translate(cx + driftX, cy + driftY);context.rotate(word.tilt);
        context.fillStyle = context.strokeStyle = word.color;context.lineWidth = word.lineWidth;
        heartPath(context, word.size, word.width, word.height);
        if (word.filled) context.fill();else context.stroke();
        context.restore();
      }
    }
    context.globalAlpha = 1;
    if (p === 1) onCleanup();
  };
  onFrame(0);
  return {nodes: [canvas], duration: reducedMotion ? 3000 : 9300, onFrame, onCleanup};
}
