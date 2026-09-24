/* The vacuum field — a port of ed.spiral.chat.ui.Theme's VacuumField, constant for constant.
 *
 * Not decoration painted by hand: twelve plane waves with random directions, wavelengths
 * and frequencies are summed and SQUARED, so what the dots show is a density. Islands
 * appear where the modes interfere constructively and dissolve as they beat out of phase,
 * which is why the pattern never repeats and never looks drawn. A slow swell crosses from
 * the lower-left, lifting the modes it passes over.
 *
 * Kept cheap on purpose, because a deck has to run on whatever laptop is plugged into the
 * projector: the trig is separated so it costs two multiplies per dot rather than twelve
 * cosines, dots are bucketed by brightness and drawn as batched paths, and the whole thing
 * ticks at ~30fps rather than the display rate.
 */
export const ACCENTS = [
  { key: "clay",    label: "clay",    base: "#D97757", lite: "#EBA680" },
  { key: "emerald", label: "emerald", base: "#46C46A", lite: "#8AE0A3" },
  { key: "cyan",    label: "cyan",    base: "#49C7DE", lite: "#92E4F1" },
  { key: "violet",  label: "violet",  base: "#A78BFA", lite: "#C9B8FF" },
  { key: "rose",    label: "rose",    base: "#F471B5", lite: "#F9A8D4" },
  { key: "amber",   label: "amber",   base: "#E8B04B", lite: "#F3CE86" },
  { key: "mono",    label: "mono",    base: "#CBC4BA", lite: "#ECE7DF" },
];

export const BACKDROPS = [
  { key: "warm",  label: "warm grey",  page: "#20201F", s1: "#191918", s2: "#131313",
    hair: "#33322E", hi: "#F9F9F7", mid: "#97958D", lo: "#6E6C64" },
  { key: "ink",   label: "ink",        page: "#0B0B0D", s1: "#141417", s2: "#1B1B20",
    hair: "#272730", hi: "#F2F2F5", mid: "#9A9AA5", lo: "#66666F" },
  { key: "slate", label: "slate",      page: "#1B1F24", s1: "#161A1F", s2: "#11151A",
    hair: "#2C333B", hi: "#EFF3F7", mid: "#93A0AD", lo: "#63707C" },
  { key: "sepia", label: "sepia",      page: "#241F1A", s1: "#1D1915", s2: "#161310",
    hair: "#3A322A", hi: "#F7F0E6", mid: "#A2947F", lo: "#71675A" },
  { key: "moss",  label: "moss",       page: "#1B211C", s1: "#161B17", s2: "#111512",
    hair: "#2C352E", hi: "#EFF4EF", mid: "#94A296", lo: "#657168" },
  { key: "black", label: "true black", page: "#000000", s1: "#0C0C0C", s2: "#141414",
    hair: "#232323", hi: "#F5F5F5", mid: "#8E8E8E", lo: "#5C5C5C" },
];

/* dark -> deep rust -> clay -> sand -> cream. The long ramp is what keeps it soft: with
 * only two stops the dots snap between dead and lit. */
const RAMP = [
  [0.00,  58,  52,  50], [0.18,  96,  68,  56], [0.40, 152,  88,  66],
  [0.62, 217, 119,  87], [0.82, 238, 178, 132], [1.00, 250, 228, 206],
];

function rampAt(e) {
  for (let i = 1; i < RAMP.length; i++) {
    if (e <= RAMP[i][0]) {
      const a = RAMP[i - 1], b = RAMP[i];
      const u = (e - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u];
    }
  }
  const l = RAMP[RAMP.length - 1];
  return [l[1], l[2], l[3]];
}

/* fixed seed: the field looks the same on every launch, which makes it feel like part of
 * the app rather than a random effect */
export function vacuumModes() {
  let s = 41;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const out = [];
  for (let i = 0; i < 12; i++) {
    const a = rnd() * Math.PI * 2;
    const k = 0.020 + rnd() * 0.050;          // wavelength: broad islands
    const w = 0.32 + rnd() * 0.83;            // how fast this mode beats
    out.push({ kx: Math.cos(a) * k, ky: Math.sin(a) * k,
               w: w * (rnd() < 0.5 ? -1 : 1), ph: rnd() * Math.PI * 2 });
  }
  return out;
}

// ── value noise, for the turbulent wipe ──────────────────────────────────────
function hash2(i, j) { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.545; return s - Math.floor(s); }
function noise2(x, y) {
  const i = Math.floor(x), j = Math.floor(y);
  const fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  const top = a + (b - a) * u;
  return top + ((c + (d - c) * u) - top) * v;
}
function fbm2(x, y) {
  let sum = 0, amp = 0.5, f = 1;
  for (let i = 0; i < 3; i++) { sum += amp * noise2(x * f, y * f); f *= 2.1; amp *= 0.5; }
  return sum / 0.875;
}

/* How many noise cells fit between the centre and the corner — the FIELD-relative grain.
 *
 * The app writes `px * 0.006` in device pixels; on the 1080x2340 phone it was tuned on that
 * is 0.006 x half-diagonal = 7.73 cells from centre to corner, with the warp dragging every
 * point through 0.34 x half-diagonal ~ 2.6 of those cells. Those two field-relative ratios
 * are the whole look.
 *
 * The first port carried the grain per DOT instead (0.215 of a cell between neighbours) —
 * faithful to what each dot experiences, and wrong about what the room sees: the phone is 30
 * dots across and a projector ~100, so the same per-dot grain meant three times the folds
 * across the picture, and past that the connected ring shatters into scattered islands.
 * Measured at mid-sweep over four curls: the phone's front averages 15.6 islands, the
 * per-dot port 29.3 — which reads as sprinkling, and did. Field-relative lands at 14.8. */
const CELLS_PER_RADIUS = 7.73;

/**
 * A transition is not a special case. It is a function that gives every dot a number in
 * 0..1 saying when the front reaches it, and one machine plays all of them: the crest
 * flares whatever it is currently crossing, the wake behind it drains, and the incoming
 * page is masked in by the same numbers. Adding a transition means adding a line here.
 *
 * Each gets (px, py) relative to the origin, the half-diagonal, and a context carrying
 * the field's own density function and the noise phase.
 */
/* Compose's FastOutSlowInEasing — cubic-bezier(0.4, 0, 0.2, 1) — which is the curve the
 * chat's send front actually runs on (`tween(5000)` uses it by default). The engine ran its
 * front linearly, and that alone reads as a different animation: the send leans in and
 * settles; a linear front just travels. */
function bezier(x1, y1, x2, y2) {
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 5; i++) {
      const mt = 1 - t;
      const xt = 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t;
      const dx = 3 * mt * mt * x1 + 6 * mt * t * (x2 - x1) + 3 * t * t * (1 - x2);
      if (Math.abs(xt - x) < 1e-4 || dx === 0) break;
      t -= (xt - x) / dx;
    }
    const mt = 1 - t;
    return 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t;
  };
}
const CHAT_EASE = bezier(0.4, 0, 0.2, 1);

export const ARRIVALS = {
  /* the app's: displace every point along a slow noise flow field BEFORE measuring how far
   * out it is. Straight lines from the origin become curling ones, so the boundary folds
   * over itself like ink in water instead of expanding as a ring. */
  wipe(px, py, maxR, cx) {
    const warp = maxR * 0.34;
    const a = fbm2(px * cx.warpScale + cx.phase, py * cx.warpScale + cx.phase) * 6.2832;
    const wx = px + Math.cos(a) * warp, wy = py + Math.sin(a) * warp;
    return Math.hypot(wx, wy) / maxR;
  },
  /* the field decides. Bright dots go first, so the picture reassembles out of its own
   * islands rather than being crossed by anything. */
  dissolve(px, py, maxR, cx) { return 1 - cx.densityAt(px + cx.cx, py + cx.cy); },
  /* a plain ring from the origin — the wipe with the warp switched off */
  iris(px, py, maxR) { return Math.hypot(px, py) / maxR; },
  /* the only one with a direction, which is why chapters can use it */
  push(px, py, maxR, cx) { return (px + cx.cx) / cx.w; },
  /* brightness surges first and the page is what is left behind */
  bloom(px, py, maxR, cx) {
    return Math.max(0, Math.min(1, 0.75 - cx.densityAt(px + cx.cx, py + cx.cy) * 0.8
                                  + Math.hypot(px, py) / maxR * 0.55));
  },
  /* instant, for a long deck where anything else becomes a tax */
  cut() { return 0; },
};

/* The wipe is the chat's send, and EXACT means keeping its faults. Marked `raw`, its
 * arrival values are used as the chat uses them — unequalised — and its front runs on the
 * chat's own easing curve. Every other transition stays rank-equalised. */
ARRIVALS.wipe.raw = true;
ARRIVALS.wipe.ease = CHAT_EASE;

const STEPS = 16;   // brightness buckets; each goes out as one batched path

export class Field {
  constructor(canvas, opts = {}) {
    this.c = canvas;
    this.g = canvas.getContext("2d", { alpha: false });
    this.modes = vacuumModes();
    this.t0 = performance.now();
    this.strength = opts.strength ?? 1;
    this.gapCss = opts.gap ?? 22;   // dot pitch in CSS px — the app's 13dp, opened up for a room
    this.arrivals = null;
    this.phase = 3.7;
    this.frontV = -1;               // 0..1 while a front travels, else -1
    this.wake = 0;                  // how drained the crossed region is, 0..1
    this.buckets = Array.from({ length: STEPS }, () => []);
    this.grey = Array.from({ length: STEPS }, () => []);
    this.mask = document.createElement("canvas");
    this.maskG = this.mask.getContext("2d", { willReadFrequently: false });
    this.onFrame = null;
    this.resize();
    addEventListener("resize", () => this.resize());
  }

  /* Cap the backing store on low-power machines: a 5K panel at devicePixelRatio 2 is four
   * times the pixels of the same field at 1, for a texture nobody can resolve anyway. */
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    this.w = this.c.clientWidth || innerWidth;
    this.h = this.c.clientHeight || innerHeight;
    this.c.width = Math.floor(this.w * dpr);
    this.c.height = Math.floor(this.h * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cols = Math.max(2, Math.floor(this.w / this.gapCss));
    this.rows = Math.max(2, Math.floor(this.h / this.gapCss));
    this.ox = (this.w - (this.cols - 1) * this.gapCss) / 2;
    this.oy = (this.h - (this.rows - 1) * this.gapCss) / 2;
    this.mask.width = this.cols;
    this.mask.height = this.rows;
    this.maskImg = this.maskG.createImageData(this.cols, this.rows);
    this.arrivals = null;
  }

  /* The instantaneous density at a point, which `dissolve` and `bloom` need in order to let
   * the field choose its own order. Same twelve modes, evaluated the slow way — this runs
   * once per wipe over the grid, not per frame. */
  densityAt(x, y) {
    const t = (performance.now() - this.t0) / 1000;
    let f = 0;
    for (const m of this.modes) f += Math.cos(m.kx * x * 0.5 + m.ky * y * 0.5 - m.w * t + m.ph);
    f /= 3.464;
    return Math.min(1, Math.pow(Math.max(0, f * f * 1.6 * 1.45), 0.72));
  }

  /** Bake one transition's arrival times over the dot grid. Fixed for the whole of one
   *  front — recomputing per frame makes dots flicker back and forth across the boundary. */
  buildArrivals(kind, originX, originY) {
    const fn = ARRIVALS[kind] || ARRIVALS.wipe;
    const { cols, rows, ox, oy, gapCss: gap } = this;
    const cx = this.w * originX, cy = this.h * originY;
    const maxR = Math.hypot(Math.max(cx, this.w - cx), Math.max(cy, this.h - cy));
    const ctx = { phase: this.phase, warpScale: CELLS_PER_RADIUS / maxR, cx, cy, w: this.w, h: this.h,
                  densityAt: (x, y) => this.densityAt(x, y) };
    const at = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        at[r * cols + c] = fn(ox + c * gap - cx, oy + r * gap - cy, maxR, ctx);
      }
    }

    if (fn.raw) {
      /* The chat's distribution, untouched.
       *
       * The warp bunches most of the field into the middle of the sweep — measured, 35% of
       * it inside one crest width — and an earlier version of this file rank-equalised that
       * away as a defect: "not a front, a flash". Wrong call. The flash IS the send: the
       * slow open, the mid-sweep bloom where a third of the field flips at once, then the
       * warped fjords straggling in. Equalising it produced a perfectly even reveal that
       * nobody could mistake for the app. Scaled by the max only — pure rescale, shape
       * untouched — so the sweep provably finishes; the chat leaves its over-1 tail to a
       * final grey snap instead, which a page reveal cannot afford. */
      let mx = 0;
      for (let i = 0; i < at.length; i++) if (at[i] > mx) mx = at[i];
      if (mx > 0) for (let i = 0; i < at.length; i++) at[i] /= mx;
      this.arrivals = at;
      this.frontEase = fn.ease || null;
      return;
    }

    /* Equalise by RANK, not by range.
     *
     * A transition function says which dots go first, not how the numbers are spread — and
     * for the constructed transitions (dissolve, bloom, iris, push) an even spread is what
     * makes them travel at a constant rate, finish on time, and share one crest thickness.
     * The wipe above is exempt because its uneven spread is the point. */
    const order = new Uint32Array(at.length);
    for (let i = 0; i < order.length; i++) order[i] = i;
    const src = Float32Array.from(at);
    order.sort((a, b) => src[a] - src[b]);
    const last = order.length - 1 || 1;
    for (let k = 0; k <= last; k++) at[order[k]] = k / last;
    this.arrivals = at;
    this.frontEase = fn.ease || null;
  }

  /** Start a front. Resolves once it has crossed everything. */
  run({ kind = "wipe", ms = 1400, originX = 0.5, originY = 0.5 } = {}) {
    this.phase = Math.random() * 90;          // a different curl every time
    this.buildArrivals(kind, originX, originY);
    this.frontV = 0;
    this.startedAt = performance.now();
    this.ms = kind === "cut" ? 1 : ms;
    return new Promise((res) => { this._done = res; });
  }

  /** The arrival map as an image the DOM can be masked by: white where the front has already
   *  passed, black where it has not, with a soft edge so the reveal is not a stencil. This is
   *  what makes the wave expose the next PAGE and not just repaint the background. */
  maskURL(front, invert = false) {
    const { cols, rows, arrivals } = this;
    const d = this.maskImg.data;
    for (let i = 0; i < arrivals.length; i++) {
      const v = (front - arrivals[i]) / 0.10 + 0.5;      // 0.10 = softness of the edge
      let a = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255) | 0;
      if (invert) a = 255 - a;
      const p = i * 4;
      d[p] = d[p + 1] = d[p + 2] = 255;
      d[p + 3] = a;
    }
    this.maskG.putImageData(this.maskImg, 0, 0);
    return this.mask.toDataURL();
  }

  /**
   * Both masks for one instant: what the front has uncovered, and what it has not.
   *
   * The outgoing page needs the exact complement of the incoming one, or the two overlap in
   * the band between them and the room sees two paragraphs printed over each other. Built
   * from one pass over the arrivals so the pair can never drift apart.
   */
  maskPair(front) {
    return { in: this.maskURL(front, false), out: this.maskURL(front, true) };
  }

  frame() {
    const g = this.g, { w, h, cols, rows, ox, oy, gapCss: gap } = this;
    const t = (performance.now() - this.t0) / 1000;
    const n = this.modes.length;

    // A plane wave separates: cos(kx·x + ky·y + c) = cos(kx·x)cos(ky·y+c) − sin(kx·x)sin(ky·y+c),
    // so the trig depends on the column OR the row, never the pair. Twelve cosines per dot
    // becomes twelve per row plus two multiplies per dot.
    if (!this._cxs || this._cxs.length !== n * cols) {
      this._cxs = new Float32Array(n * cols); this._sxs = new Float32Array(n * cols);
      this._cys = new Float32Array(n * rows); this._sys = new Float32Array(n * rows);
    }
    const cxs = this._cxs, sxs = this._sxs, cys = this._cys, sys = this._sys;
    for (let m = 0; m < n; m++) {
      const kx = this.modes[m].kx;
      for (let c = 0; c < cols; c++) {
        const a = kx * (ox + c * gap) * 0.5;
        cxs[m * cols + c] = Math.cos(a); sxs[m * cols + c] = Math.sin(a);
      }
      const mo = this.modes[m];
      for (let r = 0; r < rows; r++) {
        const b = mo.ky * (oy + r * gap) * 0.5 - mo.w * t + mo.ph;
        cys[m * rows + r] = Math.cos(b); sys[m * rows + r] = Math.sin(b);
      }
    }

    for (const b of this.buckets) b.length = 0;
    for (const b of this.grey) b.length = 0;

    // the swell: modes it is passing over ride high, the rest stay faint. This is the
    // breathing — without it the field is uniform and reads as a screensaver.
    const swell = (t * 0.16) % 1.8 - 0.4;
    const invW = 1 / w, invH = 1 / h;

    let front = this.frontV;
    if (front >= 0) {
      front = Math.min(1, (performance.now() - this.startedAt) / this.ms);
      if (this.frontEase) front = this.frontEase(front);
      this.wake = 1;
      if (front >= 1) {
        this.frontV = -1;
        if (this._done) { this._done(); this._done = null; }
      }
      if (this.onFrame) this.onFrame(front);
    } else if (this.wake > 0) {
      // Coming back is NOT the front run backwards — that looked like the shockwave being
      // sucked in. The wake just eases out, so warmth returns everywhere at once.
      this.wake = Math.max(0, this.wake - 0.045);
    }

    const crest = [];
    const hasFront = front >= 0 && this.arrivals;
    for (let r = 0; r < rows; r++) {
      const y = oy + r * gap;
      const pY = (1 - y * invH) * 0.5;
      for (let c = 0; c < cols; c++) {
        const x = ox + c * gap;
        let f = 0;
        for (let m = 0; m < n; m++) {
          f += cxs[m * cols + c] * cys[m * rows + r] - sxs[m * cols + c] * sys[m * rows + r];
        }
        f /= 3.464;                               // sqrt(12), keeps the sum in range
        const p = x * invW * 0.5 + pY;
        const gate = Math.max(0.22, 1 - Math.abs(p - swell) / 0.32);
        const e = Math.min(1, Math.pow(Math.max(0, f * f * gate * 1.6 * 1.45), 0.72));

        if (hasFront) {
          const a = this.arrivals[r * cols + c];
          const cr = Math.max(0, 1 - Math.abs(front - a) / 0.075);
          if (cr > 0.02) { crest.push(x, y, Math.min(1, e + cr * 0.95), cr); continue; }
          if (front > a) { this.grey[bucket(e)].push(x, y); continue; }
        } else if (this.wake > 0) {
          this.grey[bucket(e)].push(x, y);
          continue;
        }
        if (e < 0.035) continue;
        this.buckets[bucket(e)].push(x, y);
      }
    }

    g.fillStyle = cssVar("--page", "#20201F");
    g.fillRect(0, 0, w, h);

    // Every radius in the app is a dp measured against a 13dp pitch, so they are carried
    // across as fractions of the pitch rather than as pixels. Getting this wrong is what
    // turns the field into graph paper: at 1.6x the dots touch and the islands stop reading.
    const r0 = gap * (1.35 / 13);
    const blend = hasFront ? 1 : this.wake;
    for (let bi = 0; bi < STEPS; bi++) {
      const be = bi / (STEPS - 1);
      const rad = r0 + gap * (0.7 / 13) * be * be;
      const col = rampAt(be);
      const lit = this.buckets[bi], dim = this.grey[bi];
      if (lit.length) {
        g.fillStyle = `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${(0.055 + 0.30 * be) * this.strength})`;
        blob(g, lit, rad);
      }
      if (dim.length) {
        // Behind the front the colour drained out and the light with it.
        const l = col[0] * 0.34 + col[1] * 0.46 + col[2] * 0.20;
        const gr = [col[0] + (l - col[0]) * blend, col[1] + (l - col[1]) * blend,
                    col[2] + (l - col[2]) * blend];
        g.fillStyle = `rgba(${gr[0] | 0},${gr[1] | 0},${gr[2] | 0},${
          (0.055 + 0.30 * be) * (1 - 0.68 * blend) * this.strength})`;
        blob(g, dim, rad);
      }
    }
    // few enough dots to draw individually, and they need their own size
    for (let i = 0; i < crest.length; i += 4) {
      const ce = crest[i + 2], cr = crest[i + 3];
      const col = rampAt(ce);
      g.fillStyle = `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${(0.075 + 0.42 * ce) * this.strength})`;
      g.beginPath();
      g.arc(crest[i], crest[i + 1], r0 + gap * (0.7 * ce * ce + cr * 2.2) / 13, 0, 6.2832);
      g.fill();
    }
  }

  /* ~30fps by design. The field is a texture, not an animation to be admired frame by
   * frame, and a projector-driving laptop has better things to do with the other 30. */
  start() {
    let last = 0;
    const loop = (ms) => {
      this._raf = requestAnimationFrame(loop);
      if (ms - last < 32) return;
      last = ms;
      this.frame();
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() { cancelAnimationFrame(this._raf); }
}

function bucket(e) { return Math.min(STEPS - 1, Math.max(0, (e * (STEPS - 1)) | 0)); }

function blob(g, pts, rad) {
  g.beginPath();
  for (let i = 0; i < pts.length; i += 2) {
    g.moveTo(pts[i] + rad, pts[i + 1]);
    g.arc(pts[i], pts[i + 1], rad, 0, 6.2832);
  }
  g.fill();
}

export function cssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export { rampAt, fbm2 };
