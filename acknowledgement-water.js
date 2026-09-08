/** A transparent underwater wash. The caller owns its canvas and animation clock. */
export function createUnderwaterRenderer(canvas, { reducedMotion = false } = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new TypeError('A canvas element is required');
  }
  const context = canvas.getContext('2d');
  if (!context) throw new Error('A 2D canvas context is required');
  const view = canvas.ownerDocument.defaultView;
  canvas.style.pointerEvents = 'none';
  let disposed = false;
  let seed = 27431;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const bubbles = Array.from({ length: 36 }, () => ({
    x: random(), y: random(), radius: 1.2 + random() * 4.2,
    speed: .035 + random() * .035, phase: random() * Math.PI * 2,
  }));
  const smooth = value => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  };

  function surfaceY(x, level, time, width) {
    return level + Math.sin(x / width * Math.PI * 3.2 + time * 1.7) * 5
      + Math.sin(x / width * Math.PI * 7 - time * 1.1) * 2;
  }

  function waterBoundary(width, height, level, time) {
    context.beginPath();
    context.moveTo(-10, height + 10);
    context.lineTo(-10, surfaceY(-10, level, time, width));
    for (let x = 0; x <= width + 16; x += 16) {
      context.lineTo(x, surfaceY(x, level, time, width));
    }
    context.lineTo(width + 10, height + 10);
    context.closePath();
  }

  function drawWater(width, height, level, time, alpha) {
    context.save();
    context.globalAlpha = alpha;
    waterBoundary(width, height, level, time);
    context.clip();

    const wash = context.createLinearGradient(0, 0, 0, height);
    wash.addColorStop(0, 'rgba(19,153,184,.34)');
    wash.addColorStop(.45, 'rgba(11,110,162,.43)');
    wash.addColorStop(1, 'rgba(8,49,119,.55)');
    context.fillStyle = wash;
    context.fillRect(0, 0, width, height);

    // Soft shafts and moving caustic ribbons keep the text readable beneath.
    for (let i = 0; i < 5; i++) {
      const x = width * (i / 4 - .08) + Math.sin(time * .25 + i) * width * .035;
      const shaft = context.createLinearGradient(x, 0, x + width * .12, height);
      shaft.addColorStop(0, 'rgba(144,239,246,.08)');
      shaft.addColorStop(1, 'rgba(108,198,235,0)');
      context.fillStyle = shaft;
      context.beginPath();
      context.moveTo(x, -10);
      context.lineTo(x + width * .045, -10);
      context.lineTo(x + width * .29, height + 10);
      context.lineTo(x + width * .08, height + 10);
      context.closePath();
      context.fill();
    }
    for (let row = 0; row < 8; row++) {
      const baseline = (row + .35) / 8 * height;
      context.beginPath();
      for (let x = -20; x <= width + 20; x += 12) {
        const phase = x / 115 + row * 1.7;
        const y = baseline + Math.sin(phase + time * .8) * 16
          + Math.sin(phase * 1.63 - time * .56) * 9;
        if (x === -20) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = 'rgba(130,236,242,.05)';
      context.lineWidth = 10;
      context.stroke();
      context.strokeStyle = 'rgba(189,250,246,.13)';
      context.lineWidth = 1.4;
      context.stroke();
    }

    for (const bubble of bubbles) {
      const x = bubble.x * width + Math.sin(time * .85 + bubble.phase) * 7;
      const y = ((bubble.y - time * bubble.speed) % 1 + 1) % 1 * (height + 30) - 15;
      const radius = bubble.radius * Math.min(1.25, Math.max(.7, width / 900));
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.strokeStyle = 'rgba(176,232,247,.29)';
      context.lineWidth = .85;
      context.stroke();
      context.beginPath();
      context.arc(x - radius * .25, y - radius * .25, Math.max(.6, radius * .18), 0, Math.PI * 2);
      context.fillStyle = 'rgba(223,250,255,.4)';
      context.fill();
    }
    context.restore();

    // Only the moving waterline receives this narrow, translucent highlight.
    if (!reducedMotion && level > -9 && level < height + 9) {
      context.save();
      context.globalAlpha = alpha;
      context.beginPath();
      for (let x = -10; x <= width + 16; x += 16) {
        const y = surfaceY(x, level, time, width);
        if (x === -10) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = 'rgba(178,239,247,.09)';
      context.lineWidth = 9;
      context.stroke();
      context.strokeStyle = 'rgba(182,239,247,.57)';
      context.lineWidth = 1.4;
      context.stroke();
      context.restore();
    }
  }

  function render(progress) {
    if (disposed) return;
    const fraction = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width || view?.innerWidth || 960);
    const height = Math.max(1, rect.height || view?.innerHeight || 720);
    const dpr = Math.max(1, Math.min(2, view?.devicePixelRatio || 1));
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = 'source-over';
    context.clearRect(0, 0, pixelWidth, pixelHeight);
    context.scale(pixelWidth / width, pixelHeight / height);
    const alpha = reducedMotion
      ? smooth(fraction / .18) * (1 - smooth((fraction - .60) / .40))
      : smooth(fraction / .07) * (1 - smooth((fraction - .84) / .16));
    if (alpha > 0) {
      const rise = smooth(fraction / .36);
      const retreat = smooth((fraction - .67) / .29);
      const coverage = rise * (1 - retreat);
      const level = reducedMotion ? -18 : height + 18 - coverage * (height + 36);
      drawWater(width, height, level, reducedMotion ? 1.8 : fraction * 5.2, alpha);
    }
    context.restore();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
    bubbles.length = 0;
  }

  return { durationMs: reducedMotion ? 1500 : 5200, render, dispose };
}
