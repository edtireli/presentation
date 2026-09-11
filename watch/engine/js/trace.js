/* Bring an outside image into the deck's own language.
 *
 * The rule for this project is that nothing is pasted in — a figure either belongs to the
 * talk or it looks like a screenshot someone dropped on a slide. But a real talk has real
 * pictures in it: a scan, a micrograph, a plot from a paper. So rather than showing the image,
 * this reads it and RE-DRAWS it out of the same material as everything else: the field's dots
 * carrying its tones, and its edges as a drawn outline.
 *
 * The reveal is not a separate idea either. Every dot gets an arrival time from the same
 * ARRIVALS functions the page transitions use, so an imported picture assembles exactly the
 * way a slide does.
 */
import { vacuumModes, rampAt, cssVar, ARRIVALS } from "./field.js";

const MODES = vacuumModes();
const TAU = Math.PI * 2;

export const TRACE_MODES = {
  dots:    { label: "dots",    note: "tones only, as field dots" },
  outline: { label: "outline", note: "edges only, drawn in the accent" },
  both:    { label: "both",    note: "dots for the tones, a line where the edges are" },
};

/** Load an image from a path, a data URL, or a File the user dropped in. */
export function loadImage(src) {
  return new Promise((res, rej) => {
    if (src instanceof Blob) {
      /* The URL is NOT revoked on load. Revoking it there kills the image as a src for
       * anything else — which is exactly what a preview needs it for. It is handed back on
       * the image so the caller can release it when it is genuinely finished. */
      const url = URL.createObjectURL(src);
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => { URL.revokeObjectURL(url); rej(new Error("could not decode that file")); };
      im._objectURL = url;
      im.src = url;
      return;
    }
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => res(im);
    im.onerror = () => rej(new Error(`could not load ${src}`));
    im.src = src;
  });
}

/**
 * Read an image into a grid of tones and an edge map.
 *
 * Sampling is done ONCE, at build time, into typed arrays — the draw loop then costs the same
 * as any other figure and does not touch the image again. `cols` is the only quality dial
 * that matters: it is how many dots wide the result is, which is the resolution a person
 * actually sees, not the pixel count of whatever was imported.
 */
export function buildTrace(img, { cols = 90, edgeGain = 1, invert = false } = {}) {
  const aspect = img.naturalHeight / img.naturalWidth;
  const rows = Math.max(2, Math.round(cols * aspect));
  const c = document.createElement("canvas");
  c.width = cols; c.height = rows;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0, cols, rows);

  let data;
  try {
    data = g.getImageData(0, 0, cols, rows).data;
  } catch (e) {
    // a cross-origin image taints the canvas and cannot be read; say so rather than
    // silently drawing nothing
    throw new Error("that image is from another site, so its pixels cannot be read");
  }

  const lum = new Float32Array(cols * rows);
  const alpha = new Float32Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) {
    const p = i * 4;
    // perceptual weights, and premultiplied against alpha so a transparent PNG reads as empty
    const a = data[p + 3] / 255;
    alpha[i] = a;
    const v = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) / 255 * a;
    lum[i] = invert ? a - v : v;
  }

  /* Stretch the range the picture actually occupies to fill 0..1.
   *
   * A published figure is pale — light pinks and blues on white paper — so inverting it leaves
   * every tone bunched just above the floor and the result draws as almost nothing (measured:
   * 0.05% of pixels lit). Rescaling between the 2nd and 98th percentiles of the content puts
   * the picture back across the full range. Percentiles rather than min/max, so one black
   * label or one specular white does not set the scale for the whole image. */
  const content = Array.from(lum).filter((v, i) => alpha[i] > 0.02).sort((a, b) => a - b);
  if (content.length > 8) {
    const lo = content[Math.floor(content.length * 0.02)];
    const hi = content[Math.floor(content.length * 0.98)];
    const span = hi - lo;
    if (span > 0.02) {
      for (let i = 0; i < lum.length; i++) {
        lum[i] = Math.max(0, Math.min(1, (lum[i] - lo) / span));
      }
    }
  }

  /* Sobel, on the downsampled grid rather than the original.
   *
   * Deliberately: edges found at full resolution are far finer than the dot pitch they have
   * to be drawn at, so they come back as noise. Finding them at the resolution the figure is
   * actually drawn at gives an outline that matches the dots it sits with. */
  const edge = new Float32Array(cols * rows);
  const at = (x, y) => lum[Math.min(rows - 1, Math.max(0, y)) * cols + Math.min(cols - 1, Math.max(0, x))];
  let emax = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)
               - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)
               - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      const m = Math.hypot(gx, gy) * edgeGain;
      edge[y * cols + x] = m;
      if (m > emax) emax = m;
    }
  }
  if (emax > 0) for (let i = 0; i < edge.length; i++) edge[i] /= emax;

  return { cols, rows, aspect, lum, edge, ink: inkBounds(lum, cols, rows) };
}

/**
 * Where the picture actually IS inside its own frame, as fractions of each side.
 *
 * A traced image is mostly transparent: a brain on a white sheet is maybe half ink and half
 * nothing. That empty margin is why a traced block may overlap its neighbour — a transparent
 * dot laid over someone else's paragraph costs nothing — while a lit one may not. Knowing the
 * margin turns "no overlaps" from a rule that forbids the useful case into one that allows
 * exactly the harmless part of it.
 */
export function inkBounds(lum, cols, rows, floor = 0.10) {
  let l = cols, r = -1, t = rows, b = -1;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (lum[y * cols + x] <= floor) continue;
      if (x < l) l = x;
      if (x > r) r = x;
      if (y < t) t = y;
      if (y > b) b = y;
    }
  }
  if (r < 0) return { left: 0, right: 0, top: 0, bottom: 0, empty: true };
  return {
    // how much of each side is empty, 0..1
    left: l / cols,
    right: (cols - 1 - r) / cols,
    top: t / rows,
    bottom: (rows - 1 - b) / rows,
    empty: false,
  };
}

/** Arrival times over the trace's own grid, using the deck's transition functions. */
function arrivalsFor(trace, kind, originX = 0.16, originY = 0.84) {
  const { cols, rows } = trace;
  const fn = ARRIVALS[kind] || ARRIVALS.wipe;
  const cx = cols * originX, cy = rows * originY;
  const maxR = Math.hypot(Math.max(cx, cols - cx), Math.max(cy, rows - cy));
  const ctx = { phase: 7.3, warpScale: 0.215, cx, cy, w: cols, h: rows,
                densityAt: (x, y) => trace.lum[Math.min(trace.lum.length - 1,
                  (Math.round(y) * cols + Math.round(x)) | 0)] || 0 };
  const at = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) at[r * cols + c] = fn(c - cx, r - cy, maxR, ctx);
  }
  // ranked, exactly as the field does it, so the reveal is even whatever function produced it
  const order = new Uint32Array(at.length);
  for (let i = 0; i < order.length; i++) order[i] = i;
  const src = Float32Array.from(at);
  order.sort((a, b) => src[a] - src[b]);
  const last = order.length - 1 || 1;
  for (let k = 0; k <= last; k++) at[order[k]] = k / last;
  return at;
}

/**
 * A traced image, drawn on its own canvas.
 *
 * The tones are carried by the SAME twelve modes as the background: a dot's brightness is the
 * image's luminance modulated by the live field, so the picture breathes with everything else
 * instead of sitting on top of it as a still halftone.
 */
export class Traced {
  constructor(holder, trace, opts = {}) {
    this.holder = holder;
    this.trace = trace;
    this.mode = opts.mode || "both";
    this.seconds = opts.seconds ?? 2.6;
    this.hold = opts.hold ?? true;       // stay assembled once it has arrived
    this.arrivals = arrivalsFor(trace, opts.arrival || "wipe", opts.originX, opts.originY);
    this.floor = opts.floor ?? 0.10;     // tones below this are background, not subject

    const c = document.createElement("canvas");
    this.c = c;
    holder.replaceChildren(c);
    this.resize();
    this.t0 = performance.now();
    this.loop = this.loop.bind(this);
    /* The image decode is asynchronous, so a trace can finish mounting during the short
     * interval where an incoming grid is still settling. Its first measurement then sees the
     * 480px fallback and the finished slide keeps a postage-stamp canvas in a full-width box.
     * Follow the holder just as a responsive image would; the live loop repaints immediately,
     * while a deliberately still trace gets one explicit redraw. */
    this.ro = new ResizeObserver(() => {
      const width = Math.max(160, this.holder.clientWidth || 480);
      if (Math.abs(width - this.W) < 2) return;
      this.resize();
      if (opts.still) this.draw(0, 1.15);
    });
    this.ro.observe(holder);
    /* A still, drawn once, for anywhere the arrival is not the point.
     *
     * The import previews are a comparison, not a performance — four pictures assembling at
     * once is harder to choose between, and it makes the chooser depend on an animation
     * completing. It does not always: a browser throttles requestAnimationFrame in a
     * background tab, so the previews came up permanently blank while the renderer itself was
     * perfectly correct. A still cannot fail that way. */
    /* Tell the page how far this picture may overstep its box.
     *
     * The rule is "no VISIBLE overlap", not "no overlap": a traced image is mostly empty, and
     * its transparent margin lying over a neighbour costs nothing. So the block is allowed to
     * bleed by exactly the margin the image measured — never further — and the lit dots still
     * stop at the edge of the box they were given. A picture with no margin cannot bleed at
     * all, which is the correct answer for a full-bleed photograph.
     */
    holder.dataset.inkLeft = String(trace.ink?.left ?? 0);
    holder.dataset.inkRight = String(trace.ink?.right ?? 0);
    if (opts.still) { this.draw(0, 1.15); return; }
    this.raf = requestAnimationFrame(this.loop);
    holder.replay = () => { this.t0 = performance.now(); };
  }

  resize() {
    const W = Math.max(160, this.holder.clientWidth || 480);
    const H = Math.round(W * this.trace.aspect);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.W = W; this.H = H;
    this.c.width = W * dpr; this.c.height = H * dpr;
    this.c.style.width = W + "px"; this.c.style.height = H + "px";
    this.g = this.c.getContext("2d");
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  stop() { cancelAnimationFrame(this.raf); this.ro?.disconnect(); }

  loop(ms) {
    if (!this.holder.isConnected) { this.stop(); return; }
    this.raf = requestAnimationFrame(this.loop);
    if (ms - (this.last || 0) < 32) return;      // 30fps, as the field
    this.last = ms;
    const t = (ms - this.t0) / 1000;
    const front = this.hold ? Math.min(1.15, t / this.seconds) : (t / this.seconds) % 1.35;
    this.draw(t, front);
  }

  draw(t, front) {
    const { g, W, H, trace } = this;
    const { cols, rows, lum, edge } = trace;
    const gx = W / cols, gy = H / rows;
    const r0 = Math.min(gx, gy) * 0.42;
    g.clearRect(0, 0, W, H);
    const accent = cssVar("--accent", "#D97757");

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const arrived = front - this.arrivals[i];
        if (arrived <= 0) continue;
        const fade = Math.min(1, arrived / 0.10);           // a soft edge on the front
        const x = (c + 0.5) * gx, y = (r + 0.5) * gy;

        if (this.mode !== "outline") {
          const v = lum[i];
          if (v > this.floor) {
            // the image's tone, modulated by the live field — this is what makes it ours
            let f = 0;
            for (const m of MODES) f += Math.cos(m.kx * x * 1.6 + m.ky * y * 1.6 - m.w * t + m.ph);
            f /= 3.464;
            const breath = 0.62 + 0.38 * Math.min(1, f * f * 2.4);
            const e = Math.min(1, v * breath * 1.15);
            const col = rampAt(e);
            g.fillStyle = `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${(0.14 + 0.62 * e) * fade})`;
            g.beginPath(); g.arc(x, y, r0 * (0.42 + 0.72 * e), 0, TAU); g.fill();
          }
        }
        if (this.mode !== "dots" && edge[i] > 0.20) {
          g.fillStyle = accent;
          g.globalAlpha = Math.min(1, (edge[i] - 0.20) * 1.9) * fade;
          g.beginPath(); g.arc(x, y, r0 * 0.52, 0, TAU); g.fill();
          g.globalAlpha = 1;
        }
      }
    }
  }
}

/** Convenience: everything from a source to a running figure. */
export async function mountTrace(holder, src, opts = {}) {
  const img = await loadImage(src);
  let trace = buildTrace(img, opts);
  // a panel carries its crop box rather than its own copy of the picture, so one imported
  // sheet becomes eight blocks without eight data URLs in the file
  if (opts.crop) trace = cropTrace(trace, opts.crop);
  return new Traced(holder, trace, opts);
}

/**
 * Find the separate panels in a composite figure.
 *
 * A published figure is usually several pictures on one white sheet, and what you want on a
 * slide is one of them. Rows of the image that contain no ink separate bands; columns with no
 * ink separate the panels within a band. That is the whole algorithm, and it is the right one
 * because it uses the thing the figure's own author relied on to make it readable — the
 * whitespace between panels.
 *
 * Verified against a real submission figure (a 7-slice axial strip, two colourbars and eight
 * inflated cortical surfaces): 15 regions, each on its own boundary.
 */
export function findPanels(trace, { minGap = null, minSize = 8, floor = 0.06 } = {}) {
  const { cols, rows, lum } = trace;

  /* Ink is what DIFFERS from the background, not what is bright.
   *
   * A published figure is dark on white, so testing `luminance > floor` marks the paper as
   * content and returns the whole sheet as one region — which is what happened on a real
   * submission figure: one region instead of fifteen. The background is read off the border,
   * where a figure's margin always is, and ink is anything far enough from it. This then works
   * for a dark figure and a light one without being told which it is. */
  let edgeSum = 0, edgeN = 0;
  for (let c = 0; c < cols; c++) { edgeSum += lum[c] + lum[(rows - 1) * cols + c]; edgeN += 2; }
  for (let r = 0; r < rows; r++) { edgeSum += lum[r * cols] + lum[r * cols + cols - 1]; edgeN += 2; }
  const bg = edgeSum / edgeN;
  const isInk = (v) => Math.abs(v - bg) > floor;
  /* How much blank has to run before it counts as a separator.
   *
   * A fortieth of the image is far too much: on a real figure the bands are parted by gaps of
   * about a hundredth, so a coarse threshold merges them and eight rows of panels come back as
   * four. A hundred-and-twentieth, floored at three cells, matches what the figures actually
   * use — and the floor stops a small thumbnail from splitting on noise. */
  const gapR = minGap ?? Math.max(3, Math.round(rows / 120));
  const gapC = minGap ?? Math.max(3, Math.round(cols / 120));

  const rowHas = new Array(rows).fill(false);
  const colHasIn = (r0, r1) => {
    const out = new Array(cols).fill(false);
    for (let r = r0; r <= r1; r++) {
      for (let c = 0; c < cols; c++) if (isInk(lum[r * cols + c])) out[c] = true;
    }
    return out;
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) if (isInk(lum[r * cols + c])) { rowHas[r] = true; break; }
  }

  const runs = (mask, gap, min) => {
    const out = []; let s = null, run = 0;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) { if (s === null) s = i; run = 0; }
      else if (s !== null && ++run >= gap) { if (i - run - s >= min) out.push([s, i - run]); s = null; run = 0; }
    }
    if (s !== null && mask.length - s >= min) out.push([s, mask.length - 1]);
    return out;
  };

  const panels = [];
  for (const [r0, r1] of runs(rowHas, gapR, minSize)) {
    for (const [c0, c1] of runs(colHasIn(r0, r1), gapC, minSize)) {
      panels.push({ r0, r1, c0, c1, w: c1 - c0 + 1, h: r1 - r0 + 1 });
    }
  }
  return panels;
}

/** A panel of a trace, as a trace in its own right — so it can be drawn like any other. */
export function cropTrace(trace, box) {
  const w = box.c1 - box.c0 + 1, h = box.r1 - box.r0 + 1;
  const lum = new Float32Array(w * h), edge = new Float32Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const src = (box.r0 + r) * trace.cols + (box.c0 + c);
      lum[r * w + c] = trace.lum[src];
      edge[r * w + c] = trace.edge[src];
    }
  }
  return { cols: w, rows: h, aspect: h / w, lum, edge, ink: inkBounds(lum, w, h) };
}
