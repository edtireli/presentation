/* Annotations: braces, curved arrows, rings and underlines that attach to things on the page.
 *
 * The point is that they attach to LIVE elements, not to coordinates. A target is a CSS
 * selector, so it can be a whole block or one term inside an equation — KaTeX will emit an id
 * for a sub-expression if you write \htmlId{leak}{K_i \int C_a}, and an arrow can then point
 * at exactly that term. Coordinates typed by hand stop being true the moment the text, the
 * font or the window changes; a selector does not.
 *
 * Drawn into an SVG over the slide, and re-measured whenever the page changes, so the paths
 * follow their targets through a resize or a block that has just moved regions.
 */
import { cssVar } from "./field.js";

export const MARKS = ["brace", "arrow", "ring", "underline", "bar", "link"];

const NS = "http://www.w3.org/2000/svg";
const mk = (t, attrs = {}) => {
  const n = document.createElementNS(NS, t);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

/**
 * Where a target is, in the overlay's own coordinates.
 *
 * Measured as the union of the element AND everything inside it, because an element's own box
 * is not always where its ink is. KaTeX positions an integral's limits with offsets that do
 * not grow the wrapper: on the Patlak equation the span for `\htmlId{ki}{...}` reported a
 * bottom of 372 while the lower limit was actually drawn down to 395, so a brace placed against
 * the wrapper was laid straight through the `0`. Unioning the descendants finds the real
 * extent, and costs one pass over a handful of nodes.
 */
function rectOf(sel, root, origin) {
  const el = typeof sel === "string" ? root.querySelector(sel) : sel;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  let l = r.left, t = r.top, rr = r.right, b = r.bottom;
  for (const kid of el.querySelectorAll("*")) {
    /* Only what can actually carry ink.
     *
     * KaTeX positions things with struts — `.pstrut` and friends are spans of zero width and
     * considerable height, used to push a baseline around. They are invisible, and the test
     * here was `!k.width && !k.height`, which needs BOTH to be zero to skip one. So a strut
     * 60px tall and 0px wide counted as extent, and the ring round the integral came out
     * 194px tall around 86px of actual glyph — a hoop, not a circling. Either dimension
     * being zero means there is nothing to see. */
    if (!kid.getClientRects().length) continue;
    const k = kid.getBoundingClientRect();
    if (!k.width || !k.height) continue;
    if (/\b(pstrut|strut|vlist-s)\b/.test(kid.className)) continue;
    l = Math.min(l, k.left); t = Math.min(t, k.top);
    rr = Math.max(rr, k.right); b = Math.max(b, k.bottom);
  }
  return { x: l - origin.left, y: t - origin.top, w: rr - l, h: b - t,
           cx: (l + rr) / 2 - origin.left, cy: (t + b) / 2 - origin.top };
}

/** The first selector of a target, which may have been written as a list. */
const sel1 = (s) => (Array.isArray(s) ? s[0] : s);

/** The union of several targets, so a brace can span two terms. */
function spanOf(sels, root, origin) {
  const rs = (Array.isArray(sels) ? sels : [sels]).map((s) => rectOf(s, root, origin)).filter(Boolean);
  if (!rs.length) return null;
  const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
  const x2 = Math.max(...rs.map((r) => r.x + r.w)), y2 = Math.max(...rs.map((r) => r.y + r.h));
  return { x, y, w: x2 - x, h: y2 - y, cx: (x + x2) / 2, cy: (y + y2) / 2 };
}

/**
 * A curly brace, as one continuous path.
 *
 * The shape has four parts and all four matter: a terminal hook that turns up at each end, a
 * long run along the span, and a point in the middle where the two arms meet. The earlier
 * version drew two detached curves and a stub between them, which reads as a shallow wave —
 * a brace is recognisable because of the central point, not because it is curved.
 *
 * The hooks and the point are a fixed fraction of the depth rather than of the width, so a
 * brace under two characters and one under half a line are the same brace at the same weight,
 * instead of the short one looking like a squashed copy.
 */
function bracePath(x, y, w, dir = 1, depth = 9) {
  const m = x + w / 2, d = depth * dir;
  const hook = Math.min(w * 0.18, depth * 1.6);   // how far in the end curls before it runs
  const tip = Math.min(w * 0.10, depth * 0.9);    // how sharp the middle point is
  /* The arms run SHALLOW so the point in the middle has somewhere to go.
   *
   * At 0.55 of the depth the arms sat barely above the tip — a 10px brace whose point dropped
   * 4.5px below its own arms, which at reading distance is a straight line with a wobble. The
   * whole reason a brace is legible as a brace is the central point, so the arms are held up
   * near the ends and the tip is given most of the depth to fall through. */
  const run = d * 0.38;                           // the height the long stretch sits at
  return `M ${x} ${y}
          C ${x} ${y + run * 0.85}, ${x + hook} ${y + run * 0.30}, ${m - tip} ${y + run}
          C ${m - tip * 0.35} ${y + run * 1.06}, ${m - tip * 0.18} ${y + d * 0.80}, ${m} ${y + d}
          C ${m + tip * 0.18} ${y + d * 0.80}, ${m + tip * 0.35} ${y + run * 1.06}, ${m + tip} ${y + run}
          C ${x + w - hook} ${y + run * 0.30}, ${x + w} ${y + run * 0.85}, ${x + w} ${y}`;
}

/* An arc between two points that leans out of the straight line, so connectors read as drawn
 * rather than routed. `bend` is how far, as a fraction of the distance. */
function curve(ax, ay, bx, by, bend = 0.28) {
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  const dx = bx - ax, dy = by - ay;
  const qx = mx - dy * bend, qy = my + dx * bend;
  // the control point is not on the curve; the curve's midpoint is halfway to it
  return { d: `M ${ax} ${ay} Q ${qx} ${qy} ${bx} ${by}`, qx, qy,
           cx: (ax + bx) / 4 + qx / 2, cy: (ay + by) / 4 + qy / 2 };
}

const qAt = (a, q, b, u) => (1 - u) * (1 - u) * a + 2 * (1 - u) * u * q + u * u * b;

/** Everything on the slide an arrow ought to go round, rather than through. */
function obstacles(page, origin, exclude) {
  const out = [];
  for (const n of page.querySelectorAll(".slide-inner > *, .cell > *")) {
    if (exclude.some((e) => e && (e === n || n.contains(e) || e.contains(n)))) continue;
    const r = n.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    out.push({ x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height });
  }
  return out;
}

/**
 * Pick the bend that keeps a connector out of the text.
 *
 * A curve with a fixed bend goes wherever the geometry sends it, which on a busy slide means
 * straight across a paragraph — the arrow version of two blocks in the same grid cell. So a
 * spread of bends is sampled, each scored by how much of it lands inside something it is not
 * connecting, and the cleanest wins. Ties break toward the author's requested bend, so asking
 * for a particular curve still gets it whenever that curve is clear.
 */
function routeBend(ax, ay, bx, by, want, obs) {
  if (!obs.length) return want;
  const candidates = [want];
  for (let d = 0.12; d <= 0.62; d += 0.12) candidates.push(want + d, want - d, d, -d);
  let best = want, bestScore = Infinity;
  for (const bend of candidates) {
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const qx = mx - (by - ay) * bend, qy = my + (bx - ax) * bend;
    let hits = 0;
    for (let i = 1; i < 20; i++) {
      const u = i / 20;
      const x = qAt(ax, qx, bx, u), y = qAt(ay, qy, by, u);
      for (const o of obs) {
        if (x > o.x - 4 && x < o.x + o.w + 4 && y > o.y - 4 && y < o.y + o.h + 4) { hits++; break; }
      }
    }
    // a small preference for staying near what was asked for, so clear routes are not
    // rearranged for no reason
    const score = hits + Math.abs(bend - want) * 0.35;
    if (score < bestScore) { bestScore = score; best = bend; }
  }
  return best;
}

/** Point the head of an arrow along the tangent at its end. */
function head(g, bx, by, fromx, fromy, size, colour, put = null) {
  const a = Math.atan2(by - fromy, bx - fromx);
  const attrs = {
    class: "arrowhead",
    d: `M ${bx} ${by} L ${bx - Math.cos(a - 0.42) * size} ${by - Math.sin(a - 0.42) * size}
        L ${bx - Math.cos(a + 0.42) * size} ${by - Math.sin(a + 0.42) * size} Z`,
    fill: colour, stroke: "none",
  };
  if (put) { put(".arrowhead", attrs); return; }
  g.appendChild(mk("path", attrs));
}

/* An annotation is an overlay, so its labels land on whatever the slide already has there.
 * Painting the stroke first and the fill over it gives each label a halo in the page colour —
 * it stays readable over body text, over an equation, over the field, without needing a box
 * drawn round it. */
function label(g, text, x, y, colour, anchor = "middle", put = null) {
  if (!text) return;
  const attrs = { x, y, fill: colour, "text-anchor": anchor,
                         "font-family": "ui-monospace, SFMono-Regular, monospace",
                  "font-size": "13", "font-weight": "500",
                  stroke: cssVar("--page", "#20201F"), "stroke-width": "4",
                  "paint-order": "stroke fill", "stroke-linejoin": "round" };
  const t = put ? put("text", attrs) : mk("text", attrs);
  t.textContent = text;
  if (!put) g.appendChild(t);
}

/**
 * Open up the space a brace and its label need, on the block they hang off.
 *
 * Applied to the BLOCK — the direct child of a cell or of the slide's content — rather than to
 * the target itself, so an equation and the paragraph beneath it separate cleanly instead of
 * the equation's own line-height being stretched. Cleared first every time, so stepping
 * backwards or removing a mark gives the space back rather than leaving a hole.
 */
function reserveRoom(page, marks, step) {
  const blockOf = (el) => el?.closest(".cell > *, .slide-inner > *") || null;
  for (const n of page.querySelectorAll("[data-annot-room]")) {
    n.style.marginBottom = "";
    n.style.marginTop = "";
    delete n.dataset.annotRoom;
  }
  for (const m of marks) {
    if (m.at != null && step < m.at) continue;
    if (m.until != null && step >= m.until) continue;
    if (!["brace", "underline", "bar"].includes(m.kind)) continue;
    const target = page.querySelector(sel1(m.of || m.target));
    const block = blockOf(target);
    if (!block) continue;
    // the brace's depth, the gap above it, and a line for the label beneath
    const need = (m.depth ?? 10) + (m.gap ?? 7) + (m.label ? 22 : 6);
    const side = m.side === "above" ? "marginTop" : "marginBottom";
    const have = parseFloat(getComputedStyle(block)[side]) || 0;
    block.style[side] = `${Math.max(have, need)}px`;
    block.dataset.annotRoom = "1";
  }
}

/**
 * Draw one slide's annotations into its overlay.
 *
 * Called on arrival, on every step, and on resize — it is cheap (a handful of
 * getBoundingClientRect calls and some path strings) and always correct, which is a better
 * trade than caching geometry that goes stale.
 */
export function drawAnnotations(page, marks, step) {
  let svg = page.querySelector(".annot");
  if (!svg) {
    svg = mk("svg", { class: "annot" });
    page.appendChild(svg);
  }
  if (!marks || !marks.length) { svg.replaceChildren(); return; }
  const origin = page.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${origin.width} ${origin.height}`);

  const accent = cssVar("--accent", "#D97757");
  const mid = cssVar("--mid", "#97958D");
  const live = new Set();

  /* Annotations are an overlay, which means nothing on the slide knows they are coming and
   * the paragraph after an equation sits exactly where it always did — under the brace. So
   * the block being annotated is asked to make room: a margin the size of the brace and its
   * label. It is the one place this layer touches layout, it is undone as cleanly as it is
   * applied, and it is what a person would do with the space themselves. */
  reserveRoom(page, marks, step);

  /* A shared baseline for everything hanging off the same side.
   *
   * Two braces under two terms of one equation are at two different depths if each is placed
   * against its own target, because one term has a descender or an integral sign and the other
   * does not. A person drawing them by hand would put both on one line, and so does this: the
   * lowest extent of ALL the targets on that side sets the line, and every brace and every
   * label on that side sits on it. Symmetry, without anyone having to nudge anything. */
  const shown = marks.filter((m) => !(m.at != null && step < m.at)
                                 && !(m.until != null && step >= m.until));
  const rails = { below: -Infinity, above: Infinity };
  for (const m of shown) {
    if (!["brace", "underline", "bar"].includes(m.kind)) continue;
    const r = spanOf(m.of || m.target, page, origin);
    if (!r) continue;
    if (m.side === "above") rails.above = Math.min(rails.above, r.y);
    else rails.below = Math.max(rails.below, r.y + r.h);
  }

  for (const m of marks) {
    const i = marks.indexOf(m);
    if (!shown.includes(m)) continue;
    const colour = m.colour === "quiet" ? mid : accent;
    const key = `k${i}`;
    live.add(key);
    /* Reuse the group if it is already there.
     *
     * Rebuilding the whole overlay on every repaint restarts the draw-on animation, and since
     * a repaint also happens after a move has landed, every mark visibly blinked. Marks are
     * keyed instead: an existing one has its geometry updated in place and does not animate,
     * a new one is created and does. */
    let g = svg.querySelector(`[data-key="${key}"]`);
    const fresh = !g;
    if (fresh) {
      g = mk("g", { class: "annot-mark", "data-key": key });
      svg.appendChild(g);
    }
    const put = (sel, attrs) => {
      let n = g.querySelector(sel);
      // a selector may name a class rather than an element; the arrowhead is a <path>
      if (!n) { n = mk(sel.startsWith(".") ? "path" : sel, attrs); g.appendChild(n); return n; }
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      return n;
    };

    if (m.kind === "brace" || m.kind === "underline" || m.kind === "bar") {
      const r = spanOf(m.of || m.target, page, origin);
      if (!r) continue;
      const below = m.side !== "above";
      const gap = m.gap ?? 7;
      const y = below ? rails.below + gap : rails.above - gap;
      /* Depth follows the TYPE, not a constant.
       *
       * A fixed ten pixels is a reasonable brace under body text and an invisible one under a
       * display equation set three times that size. Taking it from the target's own font size
       * keeps a brace the same weight relative to what it is bracing — and because every term
       * of one equation shares a font size, two braces under two terms still match each other
       * exactly, which is what makes them read as a pair. */
      const el = page.querySelector(sel1(m.of || m.target));
      const fs = el ? parseFloat(getComputedStyle(el).fontSize) || 16 : 16;
      const depth = m.depth ?? Math.max(10, Math.min(24, fs * 0.46));
      const d = m.kind === "brace"
        ? bracePath(r.x, y, r.w, below ? 1 : -1, depth)
        : `M ${r.x} ${y} L ${r.x + r.w} ${y}`;
      put("path", { d, fill: "none", stroke: colour,
                    "stroke-width": m.kind === "bar" ? 3 : 1.8,
                    "stroke-linecap": "round", "stroke-linejoin": "round" });
      label(g, m.label, r.cx, below ? y + depth + 16 : y - depth - 7, colour, "middle", put);

    } else if (m.kind === "ring") {
      const r = spanOf(m.of || m.target, page, origin);
      if (!r) continue;
      // a ring round a tall term (an integral, a fraction) needs to breathe, or it reads as a
      // box drawn too tight rather than as something circled by hand
      const pad = m.pad ?? Math.max(8, r.h * 0.14);
      const ry = r.h / 2 + pad * 0.9;
      put("ellipse", { cx: r.cx, cy: r.cy, rx: r.w / 2 + pad, ry,
                       fill: "none", stroke: colour, "stroke-width": 1.8 });
      label(g, m.label, r.cx, r.cy - ry - 9, colour, "middle", put);

    } else if (m.kind === "arrow" || m.kind === "link") {
      const a = spanOf(m.from, page, origin), b = spanOf(m.to, page, origin);
      if (!a || !b) continue;
      // leave from the edge facing the target, not from the middle of the text
      const dx = b.cx - a.cx, dy = b.cy - a.cy;
      const ax = a.cx + Math.sign(dx) * Math.min(a.w / 2 + 6, Math.abs(dx) / 2);
      const ay = a.cy + Math.sign(dy) * Math.min(a.h / 2 + 6, Math.abs(dy) / 2);
      const bx = b.cx - Math.sign(dx) * Math.min(b.w / 2 + 8, Math.abs(dx) / 2);
      const by = b.cy - Math.sign(dy) * Math.min(b.h / 2 + 8, Math.abs(dy) / 2);
      // route round anything it is not connecting, unless the author pinned the bend
      const want = m.bend ?? 0.24;
      const bend = m.pin ? want
        : routeBend(ax, ay, bx, by, want,
                    obstacles(page, origin, [page.querySelector(sel1(m.from)), page.querySelector(sel1(m.to))]));
      const c = curve(ax, ay, bx, by, bend);
      put("path", { d: c.d, fill: "none", stroke: colour, "stroke-width": 1.8,
                    "stroke-linecap": "round",
                    ...(m.dashed ? { "stroke-dasharray": "4 5" } : { "stroke-dasharray": "none" }) });
      if (m.kind === "arrow") head(g, bx, by, c.cx, c.cy, m.headSize ?? 8, colour, put);
      label(g, m.label, c.cx, c.cy - 9, colour, "middle", put);
    }
  }
  // marks whose step has gone by are taken away; the rest are left exactly as they are
  for (const g of [...svg.children]) if (!live.has(g.dataset.key)) g.remove();
}
