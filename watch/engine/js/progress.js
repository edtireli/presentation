/* The progress bar, cut out of the vacuum field.
 *
 * A port of ed.spiral.chat.ui.DotProgress — the strip the app already uses for a research or
 * a build run. Same construction: a small patch of the SAME twelve modes at 2.4x the spatial
 * frequency, because the strip is a fraction of a screen wide and the field has to be denser
 * here to read as texture rather than as a handful of dots. Everything up to the position is
 * lit off the warm ramp; everything past it is the unlit grey.
 *
 * Two differences from the app's, both deliberate. It is two rows rather than four, because a
 * deck wants a hairline and not a status bar. And it can stand on any edge, transposing when
 * it goes vertical so the dots stay square to the screen instead of the strip.
 */
import { vacuumModes, rampAt, cssVar } from "./field.js";

export const PROGRESS_STYLES = [
  "fieldbar",     // the app's strip, dot for dot
  "chaptered",    // the same strip, notched where the chapters divide
  "crest",        // a travelling brightening rides the lit edge, as the wipe's front does
  "swell",        // dot HEIGHT carries the field, so the bar has a horizon
  "ticks",        // a hairline with a tick and a name per chapter
  "hairline", "dots", "segmented", "numeral", "off",
];
export const PROGRESS_SIDES = ["bottom", "top", "left", "right"];

export class Progress {
  constructor(canvas, opts = {}) {
    this.c = canvas;
    this.g = canvas.getContext("2d");
    this.modes = vacuumModes();
    this.t0 = performance.now();
    this.style = opts.style ?? "fieldbar";
    this.side = opts.side ?? "bottom";
    this.rows = opts.rows ?? 2;        // the app uses 4; a deck wants it thinner
    this.gap = opts.gap ?? 7;
    this.value = 0;                    // 0..1
    this.marks = [];                   // chapter boundaries, for `segmented`
    this.resize();
  }

  /** The strip's own thickness, which the page needs in order to leave room for it. */
  thickness() {
    if (this.style === "off" || this.style === "numeral") return 0;
    if (this.style === "hairline") return this.rows;
    if (this.style === "swell") return 16;
    if (this.style === "ticks") return 24;
    if (this.style === "fieldbar" || this.style === "chaptered" || this.style === "crest")
      return (this.rows - 1) * this.gap + 10;
    return 20;
  }

  resize() {
    const vertical = this.side === "left" || this.side === "right";
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    this.w = this.c.clientWidth || 1;
    this.h = this.c.clientHeight || 1;
    // going vertical is a transpose, not a rotation: the run of the bar is always `len`
    this.len = vertical ? this.h : this.w;
    this.across = vertical ? this.w : this.h;
    this.c.width = Math.floor(this.w * dpr);
    this.c.height = Math.floor(this.h * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  set(value, marks) {
    this.value = Math.max(0, Math.min(1, value));
    if (marks) this.marks = marks;
  }

  frame() {
    const g = this.g;
    g.clearRect(0, 0, this.w, this.h);
    if (this.style === "off") return;
    const vertical = this.side === "left" || this.side === "right";
    // draw in bar-space — along the run, then across it — and let one transform put it
    // wherever the strip actually is
    g.save();
    if (vertical) g.setTransform(g.getTransform().a, 0, 0, g.getTransform().d, 0, 0),
                  g.transform(0, 1, 1, 0, 0, 0);
    const fn = { fieldbar: this.fieldbar, chaptered: this.fieldbar, crest: this.fieldbar,
                 swell: this.fieldbar, ticks: this.ticks, hairline: this.hairline,
                 dots: this.dots, segmented: this.segmented, numeral: this.numeral }[this.style];
    if (fn) fn.call(this, g);
    g.restore();
  }

  /** The field's own value at a point on the strip — 2.4x the deck's spatial frequency, as in
   *  the app, because the strip is a fraction of a screen wide and needs to be denser here to
   *  read as texture rather than as a handful of dots. */
  fieldAt(x, y, t) {
    let f = 0;
    for (const m of this.modes) f += Math.cos(m.kx * x * 1.2 + m.ky * y * 1.2 - m.w * t + m.ph);
    f /= 3.464;
    return Math.min(1, Math.pow(Math.max(0, f * f * 1.9), 0.72));
  }

  /**
   * The app's strip, and the three variations on it. They share one loop because they differ
   * only in what the field does to a dot — its brightness, its height, whether the lit edge
   * carries a crest, and whether the chapter boundaries cut a gap in the run.
   */
  fieldbar(g) {
    const t = (performance.now() - this.t0) / 1000;
    const gap = this.gap, r0 = 1.45 * 1.35;
    const cols = Math.max(2, Math.floor(this.len / gap));
    const rows = this.style === "swell" ? 1 : this.rows;
    const oy = (this.across - (rows - 1) * gap) / 2;
    const prog = Math.max(0.04, this.value);
    const unlit = cssVar("--lo", "#6E6C64");
    const bounds = this.marks.bounds || [];
    const notched = this.style === "chaptered";

    for (let ry = 0; ry < rows; ry++) {
      for (let rx = 0; rx < cols; rx++) {
        const at = rx / (cols - 1);
        // a chaptered bar leaves the boundary empty, so the divisions are read as gaps
        if (notched && bounds.some((b) => Math.abs(at - b) < 0.006 && b > 0 && b < 1)) continue;
        const x = rx * gap;
        const e = this.fieldAt(x, oy + ry * gap, t);
        const lit = at <= prog;
        // the crest: the lit edge is not a cut, it is a front, brightening what it has just
        // reached — the same idea as the wipe, at one twentieth the size
        const crest = this.style === "crest" ? Math.max(0, 1 - Math.abs(prog - at) / 0.045) : 0;
        const y = this.style === "swell"
          ? this.across - 2 - e * (this.across - 5)      // dot height carries the field
          : oy + ry * gap;
        if (lit || crest > 0.02) {
          const ce = Math.min(1, e + crest * 0.9);
          const col = rampAt(ce);
          g.fillStyle = `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${
            lit ? 0.10 + 0.62 * ce : crest * 0.55})`;
          circle(g, x, y, r0 + 0.75 * ce * ce + crest * 1.6);
        } else {
          g.fillStyle = hexA(unlit, 0.13 + 0.10 * e);
          circle(g, x, y, r0);
        }
      }
    }
  }

  /** A hairline with the chapters named along it — the only variant that says where you are
   *  in words rather than in proportion. */
  ticks(g) {
    const bounds = this.marks.bounds || [0, 1];
    const names = this.marks.names || [];
    const cy = this.across - 8;
    g.fillStyle = cssVar("--hair", "#33322E");
    g.fillRect(0, cy - 0.5, this.len, 1);
    g.fillStyle = cssVar("--accent", "#D97757");
    g.fillRect(0, cy - 1, this.len * this.value, 2);
    g.font = "500 9px ui-monospace, SFMono-Regular, monospace";
    g.textBaseline = "bottom";
    for (let i = 0; i < bounds.length - 1; i++) {
      const x = bounds[i] * this.len;
      const on = this.value >= bounds[i] && this.value < bounds[i + 1];
      g.fillStyle = on ? cssVar("--accent", "#D97757") : cssVar("--hair", "#33322E");
      g.fillRect(x, cy - 5, 1, 5);
      if (!names[i]) continue;
      g.fillStyle = on ? cssVar("--hi", "#F9F9F7") : cssVar("--lo", "#6E6C64");
      g.textAlign = i === bounds.length - 2 && x > this.len * 0.8 ? "right" : "left";
      g.fillText(names[i], x + (g.textAlign === "right" ? -3 : 4), cy - 6);
    }
  }

  hairline(g) {
    g.fillStyle = cssVar("--hair", "#33322E");
    g.fillRect(0, 0, this.len, this.across);
    g.fillStyle = cssVar("--accent", "#D97757");
    g.fillRect(0, 0, this.len * this.value, this.across);
  }

  dots(g) {
    const n = this.marks.total || 12, cy = this.across / 2;
    const step = this.len / (n + 1), cur = Math.round(this.value * (n - 1));
    for (let i = 0; i < n; i++) {
      const on = i <= cur;
      g.fillStyle = on ? cssVar("--accent", "#D97757") : cssVar("--hair", "#33322E");
      circle(g, step * (i + 1), cy, i === cur ? 3.4 : 2.6);
    }
  }

  segmented(g) {
    const b = this.marks.bounds || [0, 1];       // chapter boundaries, 0..1
    const cy = this.across / 2, pad = 3;
    for (let i = 0; i < b.length - 1; i++) {
      const x0 = b[i] * this.len, x1 = b[i + 1] * this.len;
      g.fillStyle = cssVar("--hair", "#33322E");
      round(g, x0 + pad, cy - 1.5, x1 - x0 - pad * 2, 3);
      const fill = Math.max(0, Math.min(1, (this.value - b[i]) / (b[i + 1] - b[i])));
      if (fill > 0) {
        g.fillStyle = cssVar("--accent", "#D97757");
        round(g, x0 + pad, cy - 1.5, (x1 - x0 - pad * 2) * fill, 3);
      }
    }
  }

  numeral(g) {
    const m = this.marks;
    g.fillStyle = cssVar("--lo", "#6E6C64");
    g.font = "500 12px ui-monospace, SFMono-Regular, monospace";
    g.textAlign = "right"; g.textBaseline = "middle";
    g.fillText(`${(m.index ?? 0) + 1} / ${m.total ?? 1}`, this.len - 14, this.across / 2);
  }
}

function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); }
function round(g, x, y, w, h) {
  if (w <= 0) return;
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, h / 2); else g.rect(x, y, w, h);
  g.fill();
}
function hexA(hex, a) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
