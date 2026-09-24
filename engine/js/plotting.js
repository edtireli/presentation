// Shared plot furniture. No project data or scientific model is loaded here.
import {cssVar} from './field.js';
const TAU = Math.PI * 2;
const sc = (k, base) => base * k;
const fontOf = (k, base = 11) => `500 ${Math.max(10.5, base * k).toFixed(1)}px ui-monospace, SFMono-Regular, monospace`;

export function axes(g, box, o = {}) {
  const { x, y, w, h } = box;
  const k = o.k ?? 1;
  const hair = cssVar("--hair", "#33322E"), lo = cssVar("--lo", "#6E6C64");
  const labelColour = o.labelColour || lo;
  // one hairline, and no box: a frame around a figure is furniture the field already provides.
  // The colour is the caller's, because --hair against the page is 1.27:1 — present in the
  // DOM and absent from the room.
  g.strokeStyle = o.axisColour || hair; g.lineWidth = Math.max(1, sc(k, 1));
  g.lineCap = "round";
  g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + h); g.lineTo(x + w, y + h); g.stroke();
  g.font = fontOf(k, 11);
  g.fillStyle = labelColour;
  if (o.xlabel) { g.textAlign = "center"; g.textBaseline = "top"; g.fillText(o.xlabel, x + w / 2, y + h + sc(k, 17)); }
  if (o.ylabel) {
    g.save(); g.translate(x - sc(k, 27), y + h / 2); g.rotate(-Math.PI / 2);
    g.textAlign = "center"; g.textBaseline = "bottom"; g.fillText(o.ylabel, 0, 0); g.restore();
  }
  if (o.xticks) {
    g.textAlign = "center"; g.textBaseline = "top";
    for (const [v, lab] of o.xticks) {
      const tx = x + v * w;
      g.strokeStyle = hair; g.beginPath(); g.moveTo(tx, y + h); g.lineTo(tx, y + h + 4 * k); g.stroke();
      g.fillStyle = labelColour; g.fillText(lab, tx, y + h + 6 * k);
    }
  }
  if (o.yticks) {
    g.textAlign = "right"; g.textBaseline = "middle";
    for (const [v, lab] of o.yticks) {
      const py = y + h - v * h;
      g.strokeStyle = hair; g.beginPath(); g.moveTo(x - 4, py); g.lineTo(x, py); g.stroke();
      g.fillStyle = labelColour; g.fillText(lab, x - 6 * k, py);
    }
  }
}

/** Draw a curve up to `upto` (0..1 of its length), with an optional lit head. */
export function trace(g, box, pts, { color, width = 2, upto = 1, head = false, glow = 0,
                                     ghost = true } = {}) {
  /* The whole curve, faintly, before the drawn part.
   *
   * Without it a figure mid-animation is an empty pair of axes, and an audience spends the
   * first seconds wondering whether it is broken. With it they see the shape immediately and
   * the animation says where the bolus has got to, which is the thing actually worth showing. */
  if (ghost && upto < 1) {
    g.save(); g.globalAlpha = 0.16; g.strokeStyle = color; g.lineWidth = width * 0.8;
    g.lineJoin = g.lineCap = "round"; g.beginPath();
    g.moveTo(box.x + pts[0][0] * box.w, box.y + box.h - pts[0][1] * box.h);
    for (const p of pts) g.lineTo(box.x + p[0] * box.w, box.y + box.h - p[1] * box.h);
    g.stroke(); g.restore();
  }
  const n = Math.max(2, Math.floor(pts.length * Math.min(1, upto)));
  if (n < 2) return null;
  if (glow > 0) {
    g.strokeStyle = color; g.globalAlpha = 0.18 * glow; g.lineWidth = width * 4.5;
    g.lineJoin = g.lineCap = "round";
    g.beginPath(); g.moveTo(box.x + pts[0][0] * box.w, box.y + box.h - pts[0][1] * box.h);
    for (let i = 1; i < n; i++) g.lineTo(box.x + pts[i][0] * box.w, box.y + box.h - pts[i][1] * box.h);
    g.stroke(); g.globalAlpha = 1;
  }
  g.strokeStyle = color; g.lineWidth = width; g.lineJoin = g.lineCap = "round";
  g.beginPath();
  g.moveTo(box.x + pts[0][0] * box.w, box.y + box.h - pts[0][1] * box.h);
  for (let i = 1; i < n; i++) g.lineTo(box.x + pts[i][0] * box.w, box.y + box.h - pts[i][1] * box.h);
  g.stroke();
  const p = pts[n - 1];
  const hx = box.x + p[0] * box.w, hy = box.y + box.h - p[1] * box.h;
  if (head && upto < 1) {
    g.fillStyle = color;
    g.beginPath(); g.arc(hx, hy, width * 1.7, 0, TAU); g.fill();
    g.globalAlpha = 0.25; g.beginPath(); g.arc(hx, hy, width * 4.5, 0, TAU); g.fill(); g.globalAlpha = 1;
  }
  return [hx, hy];
}
