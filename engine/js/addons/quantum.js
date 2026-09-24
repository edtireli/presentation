/* Quantum-to-MRI opening.
 *
 * This addon keeps three different objects rigorously separate:
 *   1. position in physical space, represented by an exact hydrogen wavefunction;
 *   2. a spin-1/2 state, represented by a two-component spinor / Bloch vector;
 *   3. bulk nuclear magnetization, the ensemble quantity detected in MR.
 *
 * The hydrogen marks are deterministic samples from the analytic |psi|^2 distributions,
 * not decorative orbital-shaped noise.  The rotating motion is a camera orbit around the
 * probability field.  It does not depict an electron orbiting or an atom spinning.
 *
 * This file is deliberately standalone.  Import QUANTUM into the scene registry when the
 * deck is ready to adopt it; no existing addon needs to know about its implementation.
 */
import { cssVar } from "../field.js";

const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (x) => { const q = clamp01(x); return q * q * (3 - 2 * q); };
const sceneStep = (a = {}) => Math.max(0, Math.min(5, Math.round(Number(a._step ?? a.step ?? 0) || 0)));
const fontOf = (k, base = 11, weight = 500, family = "ui-monospace, SFMono-Regular, monospace") =>
  `${weight} ${Math.max(9, base * k).toFixed(1)}px ${family}`;

function hash01(a, b = 0, c = 0) {
  const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453123;
  return x - Math.floor(x);
}

function palette() {
  return {
    bg: cssVar("--page", "#20201F"),
    hi: cssVar("--hi", "#F9F9F7"),
    mid: cssVar("--mid", "#97958D"),
    lo: cssVar("--lo", "#6E6C64"),
    hair: cssVar("--hair", "#33322E"),
    accent: cssVar("--accent", "#D97757"),
    accentLite: cssVar("--accent-lite", "#EBA680"),
    gold: "#F0C85A",
    cyan: "#67C1D0",
    violet: "#B89CFF",
    green: "#7FC49A",
  };
}

function text(g, value, x, y, color, k, size = 10, alpha = 1, align = "left", weight = 500,
  family = "ui-monospace, SFMono-Regular, monospace") {
  g.save();
  g.fillStyle = color;
  g.globalAlpha = alpha;
  g.font = fontOf(k, size, weight, family);
  g.textAlign = align;
  g.textBaseline = "middle";
  g.fillText(value, x, y);
  g.restore();
}

function serif(g, value, x, y, color, k, size = 19, alpha = 1, align = "left") {
  text(g, value, x, y, color, k, size, alpha, align, 500, "Georgia, 'Times New Roman', serif");
}

function line(g, x0, y0, x1, y1, color, k, alpha = 1, width = .75, dash = []) {
  g.save();
  g.strokeStyle = color;
  g.globalAlpha = alpha;
  g.lineWidth = width * k;
  g.setLineDash(dash.map((d) => d * k));
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  g.restore();
}

function arrow(g, x0, y0, x1, y1, color, k, alpha = 1, width = 1.15, head = 7) {
  line(g, x0, y0, x1, y1, color, k, alpha, width);
  const a = Math.atan2(y1 - y0, x1 - x0), h = head * k;
  g.save();
  g.fillStyle = color;
  g.globalAlpha = alpha;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x1 - Math.cos(a - .52) * h, y1 - Math.sin(a - .52) * h);
  g.lineTo(x1 - Math.cos(a + .52) * h, y1 - Math.sin(a + .52) * h);
  g.closePath();
  g.fill();
  g.restore();
}

function glowDot(g, x, y, r, color, alpha = 1) {
  g.save();
  const halo = g.createRadialGradient(x, y, 0, x, y, r * 4.2);
  halo.addColorStop(0, color + "dd");
  halo.addColorStop(.22, color + "66");
  halo.addColorStop(1, color + "00");
  g.fillStyle = halo;
  g.globalAlpha = alpha;
  g.beginPath();
  g.arc(x, y, r * 4.2, 0, TAU);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.restore();
}

function roundRect(g, x, y, w, h, r, fill, stroke, alpha = 1, k = 1) {
  g.save();
  g.globalAlpha = alpha;
  g.beginPath();
  g.roundRect(x, y, w, h, r * k);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = .75 * k; g.stroke(); }
  g.restore();
}

function stageHeader(g, W, H, k, eyebrow, question, tint) {
  const p = palette();
  text(g, eyebrow.toUpperCase(), W * .045, H * .070, p.lo, k, 7.8, .88, "left", 600);
  serif(g, question, W * .045, H * .135, tint || p.hi, k, 19.5, 1);
  line(g, W * .045, H * .184, W * .955, H * .184, p.hair, k, .55, .60);
}

function equationChip(g, value, x, y, w, k, color, alpha = 1) {
  const p = palette();
  roundRect(g, x - w / 2, y - 17 * k, w, 34 * k, 6, "rgba(20,21,21,.76)", p.hair, alpha, k);
  text(g, value, x, y, color, k, 10.2, alpha, "center", 500, "Cambria Math, STIX Two Math, Georgia, serif");
}

// ── precomputed field-excitation prologue ─────────────────────────────────

let QFT_SADDLE_VIDEO = null;
let qftSaddlePending = null;
let qftSaddlePoster = null;
let qftSaddleLastDraw = 0;
let qftSaddleIdleTimer = 0;

function loadQftSaddle(
  videoUrl = "decks/assets/defense/qft-saddle-bloom.mp4",
  posterUrl = "decks/assets/defense/qft-saddle-bloom-poster.png",
) {
  if (QFT_SADDLE_VIDEO) return Promise.resolve(QFT_SADDLE_VIDEO);
  if (qftSaddlePending) return qftSaddlePending;
  qftSaddlePoster = new Image();
  qftSaddlePoster.decoding = "async";
  qftSaddlePoster.src = posterUrl;
  qftSaddlePending = new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    video.poster = posterUrl;
    const done = () => { QFT_SADDLE_VIDEO = video; resolve(video); };
    video.addEventListener("loadeddata", done, { once: true });
    video.addEventListener("error", () => resolve(null), { once: true });
    video.src = videoUrl;
    video.load();
  });
  return qftSaddlePending;
}

function activateQftSaddle() {
  const video = QFT_SADDLE_VIDEO;
  qftSaddleLastDraw = performance.now();
  if (!qftSaddleIdleTimer) {
    const check = () => {
      if (performance.now() - qftSaddleLastDraw > 480) {
        QFT_SADDLE_VIDEO?.pause?.();
        qftSaddleIdleTimer = 0;
      } else qftSaddleIdleTimer = setTimeout(check, 480);
    };
    qftSaddleIdleTimer = setTimeout(check, 480);
  }
  if (video?.readyState >= 2 && video.paused) void video.play().catch(() => {});
  return video;
}

function drawFieldExcitation(g, W, H, t, k, alpha = 1) {
  const p = palette();
  const frame = { x: W * .035, y: H * .215, w: W * .595, h: H * .600 };
  const video = activateQftSaddle();
  const source = video?.readyState >= 2 ? video :
    (qftSaddlePoster?.complete && qftSaddlePoster.naturalWidth ? qftSaddlePoster : null);

  g.save();
  g.globalAlpha = alpha;
  g.beginPath();
  g.roundRect(frame.x, frame.y, frame.w, frame.h, 8 * k);
  g.clip();
  g.fillStyle = "#020207";
  g.fillRect(frame.x, frame.y, frame.w, frame.h);
  if (source) {
    const sw = source.videoWidth || source.naturalWidth || 640;
    const sh = source.videoHeight || source.naturalHeight || 360;
    const scale = Math.max(frame.w / sw, frame.h / sh);
    const dw = sw * scale, dh = sh * scale;
    g.drawImage(source, frame.x + (frame.w - dw) / 2, frame.y + (frame.h - dh) / 2, dw, dh);
  }
  g.restore();

  const rx = W * .675, rw = W * .285;
  text(g, "A LOCAL SOURCE", rx, H * .285, p.gold, k, 7.2, alpha, "left", 700);
  equationChip(g, "(∂·∂ + m²) φ(x) = J(x)", rx + rw / 2, H * .385, rw, k, p.hi, alpha);
  text(g, "J(x) marks the idealised insertion event.", rx, H * .475, p.mid, k, 7.5, alpha);
  line(g, rx, H * .525, rx + rw, H * .525, p.hair, k, .78 * alpha, .65);
  text(g, "A PHYSICAL STATE", rx, H * .585, p.cyan, k, 7.2, alpha, "left", 700);
  equationChip(g, "|f⟩ ∝ ∫d⁴x f(x)φ(x)|0⟩", rx + rw / 2, H * .680, rw, k, p.hi, alpha);
  text(g, "Finite localisation requires a wavepacket.", rx, H * .765, p.mid, k, 7.5, alpha);

  text(g, "point-like insertion  →  extended field response  →  decay", W * .50, H * .900,
    p.accentLite, k, 8.5, alpha, "center", 650);
  text(g, "visual metaphor · not literal spacetime, a particle surface, or strings", W * .50, H * .955,
    p.lo, k, 7.0, .90 * alpha, "center");
}

/** Full-canvas version used by the defence.
 *
 * The precomputed movie was rendered against black for portable encoding.  `screen` is the
 * mathematically appropriate compositing operation here: black contributes nothing, while
 * the blue field and warm excitation are added to the deck's own paper colour.  The result
 * is one continuous field across the slide, not a video sitting inside a black rectangle. */
function drawFieldFull(g, W, H, t, k, alpha = 1) {
  const p = palette(), video = activateQftSaddle();
  const source = video?.readyState >= 2 ? video :
    (qftSaddlePoster?.complete && qftSaddlePoster.naturalWidth ? qftSaddlePoster : null);
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = p.bg;
  g.fillRect(0, 0, W, H);
  if (source) {
    const sw = source.videoWidth || source.naturalWidth || 1280;
    const sh = source.videoHeight || source.naturalHeight || 720;
    // The portable render includes a generous black safe area.  Crop that encoding margin so
    // the connected field itself, rather than an invisible video rectangle, owns the page.
    const scale = Math.max(W / sw, H / sh) * 1.30;
    const dw = sw * scale, dh = sh * scale;
    g.globalCompositeOperation = "screen";
    g.drawImage(source, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }
  g.restore();
}

/** The classical question stripped to its visual minimum: a point and a rotating frame.
 * There is deliberately no explanatory panel or label.  The presenter asks the question;
 * the following SU(2) slide answers it. */
function drawPointSpinBare(g, W, H, t, k, alpha = 1) {
  const p = palette(), cx = W * .50, cy = H * .50, r = Math.min(W, H) * .31;
  g.save();
  g.fillStyle = p.bg;
  g.fillRect(0, 0, W, H);
  g.translate(cx, cy);
  g.rotate(t * .34);
  g.strokeStyle = p.hair;
  g.globalAlpha = .52 * alpha;
  g.lineWidth = .82 * k;
  g.beginPath(); g.moveTo(-r, 0); g.lineTo(r, 0); g.stroke();
  g.beginPath(); g.moveTo(0, -r); g.lineTo(0, r); g.stroke();
  g.strokeStyle = p.cyan;
  g.globalAlpha = .72 * alpha;
  g.setLineDash([3.0 * k, 5.0 * k]);
  g.beginPath(); g.ellipse(0, 0, r * .68, r * .245, .18, 0, TAU); g.stroke();
  g.setLineDash([]);
  const a = t * .92, x = Math.cos(a) * r * .68, y = Math.sin(a) * r * .245;
  arrow(g, x - 10 * k, y - 3 * k, x, y, p.cyan, k, .92 * alpha, .95, 5.2);
  g.restore();
  glowDot(g, cx, cy, 3.8 * k, p.accent, alpha);
}

if(typeof Image!=="undefined")void loadQftSaddle();

// ── exact hydrogen distributions ───────────────────────────────────────────

/* 1s:
 *   psi_100 = exp(-r/a0) / sqrt(pi a0^3)
 *   p(r,theta,phi) dV = 4 r^2 exp(-2r) dr * dOmega/(4pi), with r in a0.
 * Thus r is Gamma(shape=3, scale=1/2).  A product of three deterministic U(0,1)
 * variates samples it exactly; direction is uniform on S^2.
 */
function buildHydrogen1s(n = 1050) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const u1 = Math.max(1e-7, hash01(i, 11, 1));
    const u2 = Math.max(1e-7, hash01(i, 11, 2));
    const u3 = Math.max(1e-7, hash01(i, 11, 3));
    const r = -.5 * Math.log(u1 * u2 * u3);
    if (r > 5.8) continue;
    const mu = 2 * hash01(i, 11, 4) - 1;
    const phi = TAU * hash01(i, 11, 5);
    const s = Math.sqrt(Math.max(0, 1 - mu * mu));
    out.push({ x: r * s * Math.cos(phi), y: r * s * Math.sin(phi), z: r * mu, r });
  }
  return out;
}

/* 2p_z:
 *   psi_210 = [1/(4 sqrt(2 pi) a0^(3/2))] (r/a0) exp(-r/2a0) cos(theta)
 *   p dV factorises into r^4 exp(-r) dr and cos^2(theta) dOmega.
 * Therefore r is Gamma(shape=5, scale=1), phi is uniform, and
 * |cos(theta)| = U^(1/3) with an equiprobable sign.
 */
function buildHydrogen2pz(n = 1250) {
  const out = [];
  for (let i = 0; i < n; i++) {
    let prod = 1;
    for (let j = 0; j < 5; j++) prod *= Math.max(1e-7, hash01(i, 23, j + 1));
    const r = -Math.log(prod);
    if (r > 13.8) continue;
    const u = hash01(i, 23, 8), mu = (hash01(i, 23, 9) < .5 ? -1 : 1) * Math.cbrt(u);
    const phi = TAU * hash01(i, 23, 10), s = Math.sqrt(Math.max(0, 1 - mu * mu));
    out.push({ x: r * s * Math.cos(phi), y: r * s * Math.sin(phi), z: r * mu, r, lobe: mu >= 0 ? 1 : -1 });
  }
  return out;
}

const H1S = buildHydrogen1s();
const H2PZ = buildHydrogen2pz();

function rotatePoint(q, yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const x1 = q.x * cy + q.z * sy, z1 = -q.x * sy + q.z * cy;
  return { x: x1, y: q.y * cp - z1 * sp, z: q.y * sp + z1 * cp };
}

function drawProbabilityCloud(g, points, cx, cy, scale, yaw, pitch, k, opts = {}) {
  const p = palette(), buckets = Array.from({ length: 12 }, () => []);
  for (let i = 0; i < points.length; i++) {
    const q = points[i], r = rotatePoint(q, yaw, pitch);
    const b = Math.max(0, Math.min(11, Math.floor((r.z / (opts.depth || 10) + .5) * 11)));
    buckets[b].push([cx + r.x * scale, cy - r.y * scale, q]);
  }
  g.save();
  for (let b = 0; b < buckets.length; b++) {
    const depth = b / (buckets.length - 1);
    for (const [x, y, q] of buckets[b]) {
      const lobe = q.lobe || 0;
      g.fillStyle = lobe > 0 ? (opts.colorA || p.gold) : lobe < 0 ? (opts.colorB || p.violet) : (opts.color || p.cyan);
      g.globalAlpha = (opts.alpha ?? 1) * (.16 + .50 * depth) * (.70 + .30 * Math.exp(-q.r * .18));
      const rr = (.48 + .50 * depth) * k;
      g.beginPath();
      g.arc(x, y, rr, 0, TAU);
      g.fill();
    }
  }
  g.restore();
}

function gamma3Cdf(r) {
  // CDF of Gamma(k=3, theta=1/2): 1 - exp(-2r)(1 + 2r + 2r^2).
  return 1 - Math.exp(-2 * r) * (1 + 2 * r + 2 * r * r);
}

function radialQuantile1s(probability) {
  let lo = 0, hi = 9;
  for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (gamma3Cdf(m) < probability) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

const H1S_Q50 = radialQuantile1s(.5);
const H1S_Q90 = radialQuantile1s(.9);

function draw1sProbabilityShells(g, cx, cy, scale, k, alpha = 1) {
  const p = palette();
  g.save();
  for (const [r, labelValue, a] of [[H1S_Q50, "50%", .42], [H1S_Q90, "90%", .28]]) {
    g.strokeStyle = p.cyan;
    g.globalAlpha = a * alpha;
    g.lineWidth = .65 * k;
    g.setLineDash([2.2 * k, 3.4 * k]);
    g.beginPath();
    g.ellipse(cx, cy, r * scale, r * scale * .34, 0, 0, TAU);
    g.stroke();
    text(g, labelValue, cx + r * scale * .73, cy - r * scale * .24, p.cyan, k, 6.7, .72 * alpha);
  }
  g.restore();
}

function drawHydrogenOrbitals(g, W, H, t, k, alpha = 1, compact = false) {
  const p = palette(), yaw = t * .17 * TAU, pitch = .23;
  const c1 = compact ? [W * .34, H * .49] : [W * .285, H * .51];
  const c2 = compact ? [W * .68, H * .49] : [W * .690, H * .51];
  // One shared a0 scale preserves the genuine size difference without letting the sparse
  // 2p tail trespass into the question or equation lanes.
  const s = (compact ? 11.8 : 12.8) * k;

  // The same Bohr-radius scale is used in both panels; 2p is genuinely more extended.
  g.save();
  g.beginPath(); g.rect(W * .055, H * .205, W * .405, H * .535); g.clip();
  drawProbabilityCloud(g, H1S, c1[0], c1[1], s, yaw, pitch, k,
    { color: p.cyan, alpha, depth: 6 });
  draw1sProbabilityShells(g, c1[0], c1[1], s, k, alpha);
  glowDot(g, c1[0], c1[1], 2.4 * k, p.accent, alpha);
  g.restore();

  g.save();
  g.beginPath(); g.rect(W * .495, H * .205, W * .455, H * .535); g.clip();
  drawProbabilityCloud(g, H2PZ, c2[0], c2[1], s, yaw, pitch, k,
    { colorA: p.gold, colorB: p.violet, alpha, depth: 16 });
  glowDot(g, c2[0], c2[1], 2.4 * k, p.accent, alpha);
  line(g, c2[0] - 83 * k, c2[1], c2[0] + 83 * k, c2[1], p.lo, k, .46 * alpha, .55, [2, 3]);
  text(g, "nodal plane  ψ = 0", c2[0] + 78 * k, c2[1] + 11 * k, p.lo, k, 6.8, .76 * alpha, "right");
  g.restore();

  text(g, "1s  ·  n=1, ℓ=0, m=0", c1[0], H * .760, p.cyan, k, 8.7, alpha, "center", 600);
  text(g, "2p_z  ·  n=2, ℓ=1, m=0", c2[0], H * .760, p.gold, k, 8.7, alpha, "center", 600);
  equationChip(g, "P(r)d³r = |ψₙₗₘ(r)|² d³r", W * .50, H * .855, 250 * k, k, p.hi, alpha);
  text(g, "exact Coulomb eigenstates · camera moves, electron does not orbit", W * .50, H * .927,
    p.lo, k, 7.6, .88 * alpha, "center");
}

// ── SU(2), spinors, and the Bloch representation ──────────────────────────

function drawPointQuestion(g, W, H, t, k, alpha = 1) {
  const p = palette(), cx = W * .315, cy = H * .515, r = Math.min(W, H) * .26;
  g.save();
  g.translate(cx, cy);
  g.rotate(t * .20);
  line(g, -r, 0, r, 0, p.hair, k, .52 * alpha, .7);
  line(g, 0, -r, 0, r, p.hair, k, .52 * alpha, .7);
  g.strokeStyle = p.cyan;
  g.globalAlpha = .58 * alpha;
  g.lineWidth = .9 * k;
  g.setLineDash([3 * k, 4 * k]);
  g.beginPath();
  g.arc(0, 0, r * .55, -.25, TAU - .25);
  g.stroke();
  g.setLineDash([]);
  arrow(g, r * .52, -r * .16, r * .55, -r * .02, p.cyan, k, .88 * alpha, 1.0, 5.5);
  g.restore();
  glowDot(g, cx, cy, 3.2 * k, p.accent, alpha);
  text(g, "same point", cx, cy + r * .78, p.accentLite, k, 8.1, alpha, "center", 600);
  text(g, "no surface · no marked orientation", cx, cy + r * .96, p.lo, k, 7.2, .90 * alpha, "center");

  const bx = W * .595, by = H * .325, bw = W * .34, bh = H * .40;
  roundRect(g, bx, by, bw, bh, 10, "rgba(20,21,21,.60)", p.hair, alpha, k);
  text(g, "QFT ONE-PARTICLE STATE  ·  |p,s⟩", bx + bw * .08, by + bh * .13, p.lo, k, 7.0, alpha, "left", 650);
  serif(g, "What is rotating?", bx + bw / 2, by + bh * .39, p.hi, k, 16.0, alpha, "center");
  text(g, "Pointlike does not mean a tiny rigid sphere.", bx + bw / 2, by + bh * .60, p.mid, k, 8.0, alpha, "center");
  text(g, "The state has no marked surface to turn.", bx + bw / 2, by + bh * .70, p.mid, k, 8.0, alpha, "center");
  line(g, bx + bw * .10, by + bh * .79, bx + bw * .90, by + bh * .79, p.hair, k, .72 * alpha);
  text(g, "So “spin” cannot mean rigid-body rotation.", bx + bw / 2, by + bh * .90,
    p.gold, k, 8.5, alpha, "center", 600);
}

function drawPauliMatrix(g, cx, cy, k, which, color, alpha = 1) {
  const entries = which === "x" ? [["0", "1"], ["1", "0"]]
    : which === "y" ? [["0", "−i"], ["i", "0"]]
      : [["1", "0"], ["0", "−1"]];
  const x0 = cx - 19 * k, y0 = cy - 12 * k;
  text(g, `σ${which}`, cx - 42 * k, cy, color, k, 8.8, alpha, "center", 600,
    "Cambria Math, STIX Two Math, Georgia, serif");
  g.save();
  g.strokeStyle = color;
  g.globalAlpha = .72 * alpha;
  g.lineWidth = .70 * k;
  g.beginPath();
  g.moveTo(x0 - 4 * k, y0 - 7 * k); g.lineTo(x0 - 9 * k, y0 - 7 * k); g.lineTo(x0 - 9 * k, y0 + 31 * k); g.lineTo(x0 - 4 * k, y0 + 31 * k);
  g.moveTo(x0 + 43 * k, y0 - 7 * k); g.lineTo(x0 + 48 * k, y0 - 7 * k); g.lineTo(x0 + 48 * k, y0 + 31 * k); g.lineTo(x0 + 43 * k, y0 + 31 * k);
  g.stroke();
  g.restore();
  for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++)
    text(g, entries[row][col], x0 + col * 27 * k, y0 + row * 24 * k, color, k, 8.4, alpha, "center", 500,
      "Cambria Math, STIX Two Math, Georgia, serif");
}

function drawBlochSphere(g, cx, cy, r, theta, phi, k, alpha = 1, showState = true) {
  const p = palette();
  g.save();
  g.strokeStyle = p.hair;
  g.lineWidth = .8 * k;
  g.globalAlpha = .74 * alpha;
  g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
  g.setLineDash([2 * k, 3 * k]);
  g.beginPath(); g.ellipse(cx, cy, r, r * .30, 0, 0, TAU); g.stroke();
  g.setLineDash([]);
  arrow(g, cx, cy + r * .77, cx, cy - r * 1.05, p.mid, k, .75 * alpha, .75, 5.5);
  line(g, cx - r * .87, cy, cx + r * .87, cy, p.hair, k, .54 * alpha, .65);
  const sx = Math.sin(theta) * Math.cos(phi), sy = Math.sin(theta) * Math.sin(phi), sz = Math.cos(theta);
  const ex = cx + r * (.82 * sx + .24 * sy), ey = cy - r * (.82 * sz - .18 * sy);
  arrow(g, cx, cy, ex, ey, p.accent, k, alpha, 1.45, 7.5);
  glowDot(g, cx, cy, 2.5 * k, p.accent, .72 * alpha);
  text(g, "z", cx, cy - r * 1.13, p.hi, k, 7.0, alpha, "center");
  text(g, "x", cx + r * .98, cy + 6 * k, p.lo, k, 7.0, .86 * alpha, "center");
  if (showState) text(g, "n = ⟨σ⟩", cx, cy + r * 1.24, p.accentLite, k, 8.5, alpha, "center", 600,
    "Cambria Math, STIX Two Math, Georgia, serif");
  g.restore();
}

function drawSpinSymmetry(g, W, H, t, k, alpha = 1) {
  const p = palette();
  const leftX = W * .225, centerY = H * .49;
  drawBlochSphere(g, leftX, centerY, Math.min(W, H) * .205, .72, t * .45, k, alpha);
  text(g, "STATE SPACE", leftX, H * .795, p.violet, k, 7.4, alpha, "center", 700);
  text(g, "not the proton’s surface", leftX, H * .842, p.lo, k, 7.2, .88 * alpha, "center");

  const mx = W * .515, my = H * .30;
  text(g, "spin-½ generators", mx, my - 31 * k, p.hi, k, 9.4, alpha, "center", 600);
  drawPauliMatrix(g, mx - 68 * k, my + 5 * k, k, "x", p.cyan, alpha);
  drawPauliMatrix(g, mx, my + 5 * k, k, "y", p.violet, alpha);
  drawPauliMatrix(g, mx + 68 * k, my + 5 * k, k, "z", p.gold, alpha);
  equationChip(g, "Jᵢ = (ℏ/2) σᵢ", mx, my + 68 * k, 160 * k, k, p.hi, alpha);
  text(g, "[Jᵢ,Jⱼ] = iℏ εᵢⱼₖ Jₖ", mx, my + 108 * k, p.mid, k, 8.4, alpha, "center", 500,
    "Cambria Math, STIX Two Math, Georgia, serif");

  const rx = W * .79, ry = H * .48, rr = Math.min(W, H) * .17;
  g.save();
  g.strokeStyle = p.hair;
  g.lineWidth = .9 * k;
  g.globalAlpha = .80 * alpha;
  g.beginPath(); g.arc(rx, ry, rr, 0, TAU); g.stroke();
  const phase = (t * .12) % 1, ang = phase * TAU;
  const x = rx + Math.cos(ang) * rr, y = ry + Math.sin(ang) * rr;
  glowDot(g, x, y, 2.4 * k, phase < .5 ? p.gold : p.violet, alpha);
  g.restore();
  text(g, "U(n̂,θ) = exp[−iθ n̂·σ/2]", rx, H * .755, p.hi, k, 8.4, alpha, "center", 500,
    "Cambria Math, STIX Two Math, Georgia, serif");
  text(g, "2π: |χ⟩ → −|χ⟩", rx, H * .805, p.gold, k, 7.8, alpha, "center", 600);
  text(g, "4π: |χ⟩ → |χ⟩", rx, H * .850, p.violet, k, 7.8, alpha, "center", 600);
  text(g, "spin tells us how the state transforms under rotations", W * .50, H * .925,
    p.accentLite, k, 8.9, alpha, "center", 650);
}

// ── bridge from spatial wavefunction to proton MRI ─────────────────────────

function drawScaleBridge(g, W, H, t, k, alpha = 1) {
  const p = palette(), cx = W * .245, cy = H * .50;
  drawProbabilityCloud(g, H1S, cx, cy, 20 * k, t * .13 * TAU, .20, k,
    { color: p.cyan, alpha: .84 * alpha, depth: 6 });
  glowDot(g, cx, cy, 3.0 * k, p.accent, alpha);
  text(g, "electron position distribution", cx, H * .755, p.cyan, k, 8.4, alpha, "center", 600);
  text(g, "scale: a₀ = 5.29 × 10⁻¹¹ m", cx, H * .805, p.lo, k, 7.3, .88 * alpha, "center");

  arrow(g, W * .385, H * .50, W * .525, H * .50, p.mid, k, .72 * alpha, .90, 7);
  text(g, "zoom × 63,000", W * .455, H * .455, p.mid, k, 7.2, .84 * alpha, "center");

  const px = W * .625, py = H * .50;
  const nucleus = g.createRadialGradient(px, py, 0, px, py, 61 * k);
  nucleus.addColorStop(0, p.accent + "cc"); nucleus.addColorStop(.26, p.accent + "45"); nucleus.addColorStop(1, p.accent + "00");
  g.save(); g.fillStyle = nucleus; g.globalAlpha = alpha; g.beginPath(); g.arc(px, py, 61 * k, 0, TAU); g.fill(); g.restore();
  g.save();
  for (let i = 0; i < 56; i++) {
    const q = Math.sqrt(hash01(i, 51, 1)), a = TAU * hash01(i, 51, 2);
    g.fillStyle = i % 3 ? p.accent : p.gold;
    g.globalAlpha = alpha * (.20 + .55 * hash01(i, 51, 3));
    g.beginPath(); g.arc(px + Math.cos(a) * q * 34 * k, py + Math.sin(a) * q * 34 * k,
      (.55 + .75 * hash01(i, 51, 4)) * k, 0, TAU); g.fill();
  }
  g.strokeStyle = p.accentLite; g.globalAlpha = .65 * alpha; g.lineWidth = .75 * k;
  g.beginPath(); g.arc(px, py, 35 * k, 0, TAU); g.stroke(); g.restore();
  text(g, "¹H nucleus: one proton", px, H * .755, p.accentLite, k, 8.4, alpha, "center", 650);
  text(g, "charge radius ≈ 0.84 × 10⁻¹⁵ m", px, H * .805, p.lo, k, 7.3, .88 * alpha, "center");

  const bx = W * .805, by = H * .290, bw = W * .165, bh = H * .410;
  roundRect(g, bx, by, bw, bh, 9, "rgba(20,21,21,.68)", p.hair, alpha, k);
  text(g, "MRI TARGET", bx + bw / 2, by + bh * .12, p.gold, k, 7.2, alpha, "center", 700);
  text(g, "proton", bx + bw / 2, by + bh * .34, p.hi, k, 11.0, alpha, "center", 650);
  text(g, "nuclear spin", bx + bw / 2, by + bh * .50, p.accentLite, k, 8.1, alpha, "center", 600);
  equationChip(g, "I = ½", bx + bw / 2, by + bh * .69, 76 * k, k, p.violet, alpha);
  text(g, "not the", bx + bw / 2, by + bh * .87, p.lo, k, 7.0, .82 * alpha, "center");
  text(g, "electron cloud", bx + bw / 2, by + bh * .95, p.lo, k, 7.0, .82 * alpha, "center");

  text(g, "position state", cx, H * .910, p.cyan, k, 8.1, alpha, "center", 600);
  text(g, "⊗", W * .440, H * .910, p.mid, k, 12.0, alpha, "center", 500,
    "Cambria Math, STIX Two Math, Georgia, serif");
  text(g, "nuclear spin state", px, H * .910, p.violet, k, 8.1, alpha, "center", 600);
}

function drawMiniMoment(g, x, y, angle, color, k, alpha = 1, length = 10) {
  const ex = x + Math.cos(angle) * length * k, ey = y - Math.sin(angle) * length * k;
  arrow(g, x, y, ex, ey, color, k, alpha, .65, 3.8);
  g.save(); g.fillStyle = color; g.globalAlpha = .80 * alpha; g.beginPath(); g.arc(x, y, .95 * k, 0, TAU); g.fill(); g.restore();
}

function drawVoxelEnsemble(g, W, H, t, k, alpha = 1) {
  const p = palette();
  const box = { x: W * .055, y: H * .275, w: W * .50, h: H * .51 };
  roundRect(g, box.x, box.y, box.w, box.h, 10, "rgba(20,21,21,.43)", p.hair, alpha, k);
  text(g, "ONE VOXEL · MANY ¹H NUCLEI", box.x + 16 * k, box.y + 22 * k, p.lo, k, 7.2, alpha, "left", 650);
  // 95 nearly cancelling moments plus a tiny coherent excess represented without pretending
  // that a classroom-sized arrow count is the literal thermal population ratio.
  for (let i = 0; i < 84; i++) {
    const x = box.x + box.w * (.06 + .88 * hash01(i, 61, 1));
    const y = box.y + box.h * (.13 + .80 * hash01(i, 61, 2));
    const paired = i < 78, angle = paired ? ((i >> 1) * 1.618 + (i & 1) * Math.PI) : Math.PI / 2 + (hash01(i, 61, 3) - .5) * .34;
    drawMiniMoment(g, x, y, angle, paired ? p.lo : p.gold, k, alpha * (paired ? .42 : .92), paired ? 7.5 : 10.5);
  }
  arrow(g, box.x + box.w * .92, box.y + box.h * .80, box.x + box.w * .92, box.y + box.h * .22,
    p.gold, k, alpha, 1.8, 8);
  text(g, "B₀", box.x + box.w * .92, box.y + box.h * .14, p.gold, k, 9.2, alpha, "center", 650,
    "Cambria Math, STIX Two Math, Georgia, serif");

  const sx = W * .735, sy = H * .495;
  drawBlochSphere(g, sx, sy, Math.min(W, H) * .16, .40, -.80, k, alpha, false);
  text(g, "ρ = ½(I + n·σ)", sx, H * .735, p.hi, k, 8.9, alpha, "center", 500,
    "Cambria Math, STIX Two Math, Georgia, serif");
  text(g, "single-spin state representation", sx, H * .785, p.violet, k, 7.5, alpha, "center", 600);

  equationChip(g, "Σ μᵢ  →  M₀", W * .50, H * .885, 155 * k, k, p.accentLite, alpha);
  text(g, "almost all moments cancel · a tiny Boltzmann excess survives", W * .50, H * .950,
    p.mid, k, 7.8, .92 * alpha, "center");
}

// ── narrative stages ───────────────────────────────────────────────────────

function drawQuantumOpening(g, W, H, t, a = {}) {
  const k = a.k ?? W / 640, step = sceneStep(a), since = Math.max(0, Number(a._stepElapsed ?? 0));
  const settled = !!(a._stepSettled || a._stepBackward || a._directEnd);
  // State zero has no reveal timestamp: animate it from the scene clock on slide entry.
  // Later states use their reveal clock so backward/forward navigation remains deterministic.
  const initialEntry = step === 0 && a._stepChangedAt == null;
  const enter = settled ? 1 : smooth((initialEntry ? t : since) / .68);
  const p = palette();

  if (step === 0) {
    stageHeader(g, W, H, k, "a qft prologue", "How does a field answer a local excitation?", p.hi);
    drawFieldExcitation(g, W, H, t, k, enter);
  } else if (step === 1) {
    QFT_SADDLE_VIDEO?.pause?.();
    stageHeader(g, W, H, k, "the classical trap", "How can a point spin?", p.hi);
    drawPointQuestion(g, W, H, t, k, enter);
  } else if (step === 2) {
    QFT_SADDLE_VIDEO?.pause?.();
    stageHeader(g, W, H, k, "the quantum answer", "Spin is how a state responds to rotation.", p.hi);
    drawSpinSymmetry(g, W, H, t, k, enter);
  } else if (step === 3) {
    QFT_SADDLE_VIDEO?.pause?.();
    stageHeader(g, W, H, k, "separate the degrees of freedom", "What actually occupies space?", p.hi);
    drawHydrogenOrbitals(g, W, H, t, k, enter, !!a.compact);
  } else if (step === 4) {
    QFT_SADDLE_VIDEO?.pause?.();
    stageHeader(g, W, H, k, "from hydrogen to water", "Which spin does MRI hear?", p.hi);
    drawScaleBridge(g, W, H, t, k, enter);
  } else {
    QFT_SADDLE_VIDEO?.pause?.();
    stageHeader(g, W, H, k, "from one proton to one voxel", "The scanner listens to an ensemble.", p.hi);
    drawVoxelEnsemble(g, W, H, t, k, enter);
  }
}

/** Full six-beat Socratic opening: QFT field excitation through voxel ensemble. */
const quantumOpening = {
  aspect: 2.22,
  loop: true,
  fps: 16,
  dpr: 1,
  minWidth: 720,
  revealSteps: 5,
  draw: drawQuantumOpening,
};

/** Reusable exact-orbital scene when the spatial-state beat deserves its own slide. */
const hydrogenSpatial = {
  aspect: 2.22,
  loop: true,
  fps: 16,
  dpr: 1,
  minWidth: 660,
  revealSteps: 0,
  draw(g, W, H, t, a = {}) {
    const k = a.k ?? W / 640, p = palette();
    stageHeader(g, W, H, k, "exact Coulomb solutions", "A quantum state can occupy space without tracing an orbit.", p.hi);
    drawHydrogenOrbitals(g, W, H, t, k, 1, !!a.compact);
  },
};

/** Reusable SU(2) scene for a technical backup or a slower two-slide opening. */
const spinSU2 = {
  aspect: 2.22,
  loop: true,
  fps: 16,
  dpr: 1,
  minWidth: 660,
  revealSteps: 0,
  draw(g, W, H, t, a = {}) {
    const k = a.k ?? W / 640, p = palette();
    stageHeader(g, W, H, k, "rotation without a rotating surface", "Spin-½ is the smallest non-trivial representation of SU(2).", p.hi);
    drawSpinSymmetry(g, W, H, t, k, 1);
  },
};

// ── equation-led QFT → MRI defence sequence ───────────────────────────────

/* These equation-led scenes deliberately contain no explanatory prose.  The main defence
 * now uses the compact field → S² → double-cover → MRI path; the longer Noether and density-
 * matrix derivations remain available as backup scenes.  The deck overlays one native KaTeX
 * state at a time and the canvas performs the corresponding operation. */

function easeCubic(x) {
  const q = clamp01(x);
  return q < .5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;
}

function rgba(hex, alpha) {
  const h = String(hex || "#ffffff").replace("#", "");
  const n = Number.parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function blendHex(a, b, q) {
  const aa = Number.parseInt(a.replace("#", ""), 16), bb = Number.parseInt(b.replace("#", ""), 16);
  const c = [16, 8, 0].map((s) => Math.round(mix((aa >> s) & 255, (bb >> s) & 255, clamp01(q))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function qStep(a, max = 8) {
  return Math.max(0, Math.min(max, Math.round(Number(a?._step ?? 0) || 0)));
}

function qSince(a) {
  return Math.max(0, Number(a?._stepElapsed ?? 0) || 0);
}

function qSettled(a) {
  return !!(a?._stepSettled || a?._stepBackward || a?._directEnd);
}

function qEnter(a, seconds = .85) {
  return qSettled(a) ? 1 : easeCubic(qSince(a) / seconds);
}

function clearQuantum(g, W, H) {
  const p = palette();
  g.save();
  g.fillStyle = p.bg;
  g.fillRect(0, 0, W, H);
  const wash = g.createRadialGradient(W * .52, H * .36, 0, W * .52, H * .36, W * .72);
  wash.addColorStop(0, "rgba(32,46,58,.20)");
  wash.addColorStop(.55, "rgba(30,27,39,.08)");
  wash.addColorStop(1, "rgba(20,19,19,0)");
  g.fillStyle = wash;
  g.fillRect(0, 0, W, H);
  g.restore();
}

function surfaceHeight(x, y, t, amplitude, centre = [-.42, .12]) {
  const saddle = .075 * (x * x - .72 * y * y) / (1 + .16 * (x * x + y * y));
  const breath = .048 * Math.sin(.78 * x + .24 * t) * Math.cos(.66 * y - .17 * t);
  const dx = x - centre[0], dy = y - centre[1];
  const r2 = dx * dx + dy * dy;
  const packet = amplitude * Math.exp(-r2 / .19);
  const shoulder = amplitude * .18 * Math.exp(-r2 / .90);
  return { z: saddle + breath + packet + shoulder, packet: Math.exp(-r2 / .19) };
}

function projectFieldPoint(x, y, z, W, H, yaw, scale) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const xr = c * x - s * y, yr = s * x + c * y;
  return {
    x: W * .50 + xr * scale,
    y: H * .455 + yr * scale * .36 - z * scale * 1.08,
    d: yr,
  };
}

function drawSpinorFibre(g, x, y, height, phase, k, alpha = 1, size = 1) {
  const p = palette(), h = height * k * size, r = 2.1 * k * size;
  g.save();
  g.lineWidth = .82 * k;
  for (let c = 0; c < 2; c++) {
    const color = c ? p.violet : p.gold;
    g.strokeStyle = color;
    g.globalAlpha = .46 * alpha;
    g.beginPath();
    for (let i = 0; i <= 22; i++) {
      const u = i / 22, a = phase + c * Math.PI + u * TAU * .72;
      const px = x + Math.cos(a) * r * (1 - .28 * u);
      const py = y - h * u + Math.sin(a) * r * .38;
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.stroke();
    glowDot(g, x + Math.cos(phase + c * Math.PI) * r, y - h, 1.05 * k * size, color, .78 * alpha);
  }
  g.restore();
}

function drawSpinorManifold(g, W, H, t, k, opts = {}) {
  const p = palette();
  const nx = opts.nx || 56, ny = opts.ny || 40;
  const yaw = opts.yaw ?? -.34;
  const scale = Math.min(W / 8.8, H / 5.0);
  const amplitude = opts.amplitude ?? 1.28;
  const centre = opts.centre || [-.42, .12];
  const cells = [];
  for (let j = 0; j < ny - 1; j++) {
    const y0 = mix(-2.55, 2.55, j / (ny - 1)), y1 = mix(-2.55, 2.55, (j + 1) / (ny - 1));
    for (let i = 0; i < nx - 1; i++) {
      const x0 = mix(-3.7, 3.7, i / (nx - 1)), x1 = mix(-3.7, 3.7, (i + 1) / (nx - 1));
      const h00 = surfaceHeight(x0, y0, t, amplitude, centre);
      const h10 = surfaceHeight(x1, y0, t, amplitude, centre);
      const h11 = surfaceHeight(x1, y1, t, amplitude, centre);
      const h01 = surfaceHeight(x0, y1, t, amplitude, centre);
      const pts = [
        projectFieldPoint(x0, y0, h00.z, W, H, yaw, scale),
        projectFieldPoint(x1, y0, h10.z, W, H, yaw, scale),
        projectFieldPoint(x1, y1, h11.z, W, H, yaw, scale),
        projectFieldPoint(x0, y1, h01.z, W, H, yaw, scale),
      ];
      const packet = (h00.packet + h10.packet + h11.packet + h01.packet) / 4;
      const slope = clamp01(.5 + (h10.z - h00.z) * .48 - (h01.z - h00.z) * .22);
      cells.push({ pts, packet, slope, depth: pts.reduce((s0, q) => s0 + q.d, 0) / 4 });
    }
  }
  cells.sort((a, b) => a.depth - b.depth);
  g.save();
  for (const cell of cells) {
    const warm = clamp01(Math.pow(cell.packet, .72) * (opts.warm ?? 1));
    const base = blendHex("#263D58", "#536D8C", cell.slope);
    // Matte two-stage palette: cool field body, warm excitation, no specular component.
    g.fillStyle = warm > .03
      ? `rgb(${Math.round(mix(49, 224, warm))},${Math.round(mix(70, 113, warm))},${Math.round(mix(94, 79, warm))})`
      : base;
    g.globalAlpha = .82 + .14 * warm;
    g.beginPath();
    g.moveTo(cell.pts[0].x, cell.pts[0].y);
    for (let n = 1; n < 4; n++) g.lineTo(cell.pts[n].x, cell.pts[n].y);
    g.closePath();
    g.fill();
    g.strokeStyle = warm > .10 ? rgba(p.accentLite, .055 + .065 * warm) : "rgba(119,154,188,.045)";
    g.lineWidth = .22 * k;
    g.stroke();
  }
  g.restore();

  if (opts.fibres !== false) {
    for (let j = 2; j < ny - 2; j += 4) for (let i = 2; i < nx - 2; i += 5) {
      const x = mix(-3.7, 3.7, i / (nx - 1)), y = mix(-2.55, 2.55, j / (ny - 1));
      const h = surfaceHeight(x, y, t, amplitude, centre);
      const q = projectFieldPoint(x, y, h.z, W, H, yaw, scale);
      const local = .18 + .82 * Math.pow(h.packet, .42);
      drawSpinorFibre(g, q.x, q.y, 8 + 17 * local, opts.phase ?? t * .46, k, (.12 + .58 * local) * (opts.fibreAlpha ?? 1), .78 + .32 * local);
    }
  }
  return { scale, yaw, centre };
}

// A closed field-volume glyph used by the shortened QFT opening.  The boundary is an
// isodensity surface, not a material membrane.  Its low-order radial modes make the first
// state visibly generic; setting `deform` to zero gives an exact S² while preserving the
// same localized excitation density and coordinate grid.
function rotateFieldVolume(q, yaw, pitch, roll = 0) {
  let [x, y, z] = q;
  const cz = Math.cos(yaw), sz = Math.sin(yaw);
  [x, y] = [cz * x - sz * y, sz * x + cz * y];
  const cx = Math.cos(pitch), sx = Math.sin(pitch);
  [y, z] = [cx * y - sx * z, sx * y + cx * z];
  const cy = Math.cos(roll), sy = Math.sin(roll);
  [x, z] = [cy * x + sy * z, -sy * x + cy * z];
  return [x, y, z];
}

function projectFieldVolume(q, cx, cy, scale) {
  const perspective = 3.8 / Math.max(2.85, 3.8 - .34 * q[1]);
  return { x: cx + q[0] * scale * perspective, y: cy - q[2] * scale * perspective, d: q[1] };
}

function fieldVolumeSample(theta, phi, t, opts = {}) {
  const deform = clamp01(opts.deform ?? 1);
  const excitation = clamp01(opts.excitation ?? 1);
  const complexity = clamp01(opts.complexity ?? 0);
  const quantized = clamp01(opts.quantized ?? 0);
  const configuration = Number(opts.configuration ?? 0) || 0;
  const motion = Math.max(0, Number(opts.motion ?? 1) || 0);
  const tt = t * motion;
  const st = Math.sin(theta), ct = Math.cos(theta);
  const cp = Math.cos(phi), sp = Math.sin(phi);
  const direction = [st * cp, st * sp, ct];
  const breath = 1 + (opts.breathAmp ?? .024) * Math.sin(tt * .72);
  const modes =
    .155 * Math.sin(2 * phi + .31 * tt) * st * st +
    .102 * Math.cos(3 * theta - phi - .18 * tt) * st +
    .072 * Math.sin(3 * phi + .44) * st +
    .054 * Math.cos(theta + 2 * phi - .16 * tt) * st;
  // Higher harmonics are a visual encoding of additional EFT operators and coupled
  // mode content.  They remain smooth: quantisation does not pixelate space.
  const fineModes =
    .068 * Math.sin(7 * theta + 3 * phi - .84 * tt) * st +
    .052 * Math.cos(5 * theta - 6 * phi + .57 * tt) * st * st +
    .036 * Math.sin(9 * phi + 2 * theta - .41 * tt) * st;
  // Once the field is quantised, coherent standing-mode bands become legible.  This
  // is a representation of discrete fermionic mode occupations, not a spatial lattice.
  const modeSignal = Math.sin(6 * theta - 4 * phi + .48 * tt) *
    Math.cos(3 * theta + 5 * phi - .31 * tt);
  // Occupation number is carried by the overlaid mode labels, not by a tessellated
  // deformation of physical space.  Keep the underlying field manifold continuous.
  const modeRelief = 0;
  const focus = [.40, .35, .847];
  const dot = clamp01((direction[0] * focus[0] + direction[1] * focus[1] + direction[2] * focus[2] + 1) / 2) * 2 - 1;
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
  const density = Math.exp(-(angle * angle) / (.35 * .35));
  // q_lambda is one real configuration-space coordinate. Positive and negative
  // values deform the complete configuration in opposite directions.
  const uLambda = .62 * st * ct * cp + .38 * st * st * Math.cos(2 * phi);
  const configurationRelief = .145 * configuration * uLambda;
  // Excitation produces a broad, smooth lobe.  It never becomes a needle or separates from
  // the field volume, which would falsely suggest a delta-localised particle surface.
  const packetRelief = opts.packetRelief ?? deform;
  const localBloom = .085 * excitation * density * packetRelief;
  const r = breath * (1 + deform * modes + complexity * fineModes + modeRelief +
    configurationRelief + localBloom);
  return {
    q: [r * direction[0], r * direction[1], r * direction[2]],
    density, direction, modeSignal, uLambda,
  };
}

function fieldVolumeColor(p, depth, density, excitation, modeSignal = 0, quantized = 0, complexity = 0) {
  const d = clamp01(.44 + .34 * depth);
  const warm = clamp01(excitation * Math.pow(density, .58));
  const cool0 = [
    mix(24, 90, d),
    mix(48, 113, d),
    mix(73, 137, d),
  ];
  // A global mode function can be visualised as a continuous phase texture over the
  // level surface.  It is emphatically not a set of local occupation pixels.
  const phase = clamp01(.5 + .5 * modeSignal);
  const bandTarget = [
    mix(109, 64, phase),
    mix(84, 169, phase),
    mix(174, 194, phase),
  ];
  const bandMix = quantized * (.08 + .24 * Math.abs(modeSignal));
  const cool = [
    mix(cool0[0], bandTarget[0], bandMix + .05 * complexity),
    mix(cool0[1], bandTarget[1], bandMix + .05 * complexity),
    mix(cool0[2], bandTarget[2], bandMix + .05 * complexity),
  ];
  const coreQ = Math.pow(density, 1.35);
  const core = [mix(213, 241, coreQ), mix(109, 184, coreQ), mix(85, 107, coreQ)];
  const rgb = cool.map((v, i) => Math.round(mix(v, core[i], warm)));
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

function drawFieldVolumeGrid(g, cx, cy, scale, t, k, opts = {}) {
  const p = palette(), yaw = opts.yaw ?? 0, pitch = opts.pitch ?? -.28, roll = opts.roll ?? .08;
  const deform = opts.deform ?? 0, excitation = opts.excitation ?? 1;
  const complexity = opts.complexity ?? 0, quantized = opts.quantized ?? 0;
  const configuration = opts.configuration ?? 0, motion = opts.motion ?? 1;
  const packetRelief = opts.packetRelief, breathAmp = opts.breathAmp;
  const alpha = opts.gridAlpha ?? .62;
  const drawCurve = (samples) => {
    g.save();
    g.strokeStyle = rgba(p.cyan, alpha);
    g.lineWidth = .56 * k;
    g.beginPath();
    let active = false;
    for (const [theta, phi] of samples) {
      const s = fieldVolumeSample(theta, phi, t, {
        deform, excitation, complexity, quantized, configuration, motion, packetRelief, breathAmp,
      });
      const q = rotateFieldVolume(s.q, yaw, pitch, roll);
      const pt = projectFieldVolume(q, cx, cy, scale);
      const visible = q[1] > -.055;
      if (!visible) { active = false; continue; }
      if (!active) { g.moveTo(pt.x, pt.y); active = true; } else g.lineTo(pt.x, pt.y);
    }
    g.stroke();
    g.restore();
  };
  for (let li = 0; li < 12; li++) {
    const phi = li / 12 * TAU;
    drawCurve(Array.from({ length: 85 }, (_, i) => [Math.PI * i / 84, phi]));
  }
  for (let la = 1; la < 9; la++) {
    const theta = Math.PI * la / 9;
    drawCurve(Array.from({ length: 121 }, (_, i) => [theta, TAU * i / 120]));
  }
}

function drawFieldVolume(g, W, H, t, k, opts = {}) {
  const p = palette(), cx = opts.cx ?? W * .50, cy = opts.cy ?? H * .435;
  const scale = opts.scale ?? H * .315;
  const yaw = opts.yaw ?? t * .10, pitch = opts.pitch ?? -.28, roll = opts.roll ?? .08;
  const deform = clamp01(opts.deform ?? 1), excitation = clamp01(opts.excitation ?? 1);
  const complexity = clamp01(opts.complexity ?? 0), quantized = clamp01(opts.quantized ?? 0);
  const configuration = Number(opts.configuration ?? 0) || 0;
  const motion = Math.max(0, Number(opts.motion ?? 1) || 0);
  const packetRelief = opts.packetRelief, breathAmp = opts.breathAmp;
  const surfaceAlpha = clamp01(opts.surfaceAlpha ?? 1);
  const surfaceTint = opts.surfaceTint ?? null;
  const showTexture = opts.showTexture !== false;
  const showGrid = opts.showGrid !== false;
  if (surfaceAlpha < .001) return { cx, cy, scale, yaw, pitch, roll };
  const nTheta = opts.nTheta ?? 42, nPhi = opts.nPhi ?? 72, cells = [];
  for (let j = 0; j < nTheta; j++) {
    const t0 = Math.PI * j / nTheta, t1 = Math.PI * (j + 1) / nTheta;
    for (let i = 0; i < nPhi; i++) {
      const p0 = TAU * i / nPhi, p1 = TAU * (i + 1) / nPhi;
      const samples = [[t0, p0], [t0, p1], [t1, p1], [t1, p0]].map(([th, ph]) => {
        const s = fieldVolumeSample(th, ph, t, {
          deform, excitation, complexity, quantized, configuration, motion, packetRelief, breathAmp,
        });
        const q = rotateFieldVolume(s.q, yaw, pitch, roll);
        return { ...projectFieldVolume(q, cx, cy, scale), q, density: s.density, modeSignal: s.modeSignal };
      });
      const depth = samples.reduce((sum, s) => sum + s.d, 0) / 4;
      const density = samples.reduce((sum, s) => sum + s.density, 0) / 4;
      const modeSignal = samples.reduce((sum, s) => sum + s.modeSignal, 0) / 4;
      cells.push({ samples, depth, density, modeSignal });
    }
  }
  cells.sort((a, b) => a.depth - b.depth);
  g.save();
  for (const cell of cells) {
    const tinted = !!surfaceTint;
    const fill = tinted ? surfaceTint
      : fieldVolumeColor(p, cell.depth, cell.density, excitation, cell.modeSignal, quantized, complexity);
    g.fillStyle = fill;
    g.strokeStyle = fill;
    g.globalAlpha = surfaceAlpha * (tinted
      ? (.60 + .36 * clamp01(.5 + .35 * cell.depth))
      : (.86 + .11 * clamp01(.5 + .35 * cell.depth)));
    g.lineWidth = .36 * k;
    g.beginPath();
    g.moveTo(cell.samples[0].x, cell.samples[0].y);
    for (let i = 1; i < 4; i++) g.lineTo(cell.samples[i].x, cell.samples[i].y);
    g.closePath();
    g.fill();
    g.stroke();
  }
  g.restore();

  // Sparse fixed texture gives the camera orbit a visible reference without specular shine.
  if (showTexture) {
    g.save();
    const textureCount = Math.max(0, Math.floor(opts.textureCount ?? 240));
    for (let i = 0; i < textureCount; i++) {
      const theta = Math.acos(1 - 2 * hash01(i, 932, 1));
      const phi = TAU * hash01(i, 932, 2);
      const s = fieldVolumeSample(theta, phi, t, {
        deform, excitation, complexity, quantized, configuration, motion, packetRelief, breathAmp,
      });
      const q = rotateFieldVolume(s.q, yaw, pitch, roll);
      if (q[1] < -.03) continue;
      const pt = projectFieldVolume(q, cx, cy, scale);
      const modeGlow = quantized * (.5 + .5 * s.modeSignal);
      g.fillStyle = s.density > .18
        ? rgba(p.gold, .12 + .26 * s.density * excitation)
        : rgba(modeGlow > .58 ? p.violet : p.cyan, .08 + .16 * modeGlow + .05 * complexity);
      g.beginPath(); g.arc(pt.x, pt.y, (.34 + .38 * hash01(i, 932, 3)) * k, 0, TAU); g.fill();
    }
    g.restore();
  }
  if (showGrid) {
    drawFieldVolumeGrid(g, cx, cy, scale, t, k, {
      yaw, pitch, roll, deform, excitation, complexity, quantized,
      configuration, motion, packetRelief, breathAmp,
      gridAlpha: (opts.gridAlpha ?? .48) * surfaceAlpha,
    });
  }
  return { cx, cy, scale, yaw, pitch, roll };
}

// A low-dimensional slice through bosonic configuration space. Each translucent
// surface is one complete field configuration phi(x); its opacity is proportional
// to the state weight on that configuration. This is intentionally separate from
// the fermionic proton field, whose Schrödinger wavefunctional is Grassmann-valued.
function drawWavefunctionalCloud(g, W, H, t, k, opts = {}) {
  const p = palette();
  const excitation = clamp01(opts.excitation ?? 0);
  const alpha = clamp01(opts.alpha ?? 1);
  const spread = clamp01(opts.spread ?? 1);
  const yaw = opts.yaw ?? -.48, pitch = opts.pitch ?? -.30, roll = opts.roll ?? .09;
  const qValues = [-1.70, 1.70, -1.15, 1.15, -.62, .62, 0];
  const centreScale = H * .225;
  const cloudScale = mix(H * .175, H * .145, excitation);
  const scale = mix(centreScale, cloudScale, spread);
  g.save();
  for (const q of qValues) {
    const vacuumWeight = Math.exp(-q * q);
    const oneWeight = q === 0 ? 0 : q * q * Math.exp(1 - q * q);
    const weight = mix(vacuumWeight, oneWeight, excitation);
    const signColor = q < 0 ? p.cyan : q > 0 ? p.gold : "#71809B";
    const tint = blendHex("#526985", signColor, excitation);
    const shellAlpha = alpha * (mix(.020, 0, excitation) + .280 * clamp01(weight));
    if (shellAlpha < .006) continue;
    const branchGap = Math.sign(q) * H * .075 * excitation * spread;
    drawFieldVolume(g, W, H, 0, k, {
      cx: W * .50 + q * H * .090 * spread + branchGap,
      cy: H * .475 + q * H * .012 * spread,
      scale: scale * (1 - .018 * Math.abs(q) * spread),
      yaw, pitch, roll,
      deform: .58,
      complexity: 0,
      quantized: 0,
      excitation: 0,
      configuration: q * mix(.64, .82, excitation) * spread,
      motion: 0,
      breathAmp: 0,
      nTheta: 12,
      nPhi: 24,
      showTexture: false,
      showGrid: false,
      surfaceTint: tint,
      surfaceAlpha: shellAlpha,
    });
  }
  g.restore();
}

function drawFockOccupationOverlay(g, W, H, t, k, opts = {}) {
  const p = palette();
  const cx = opts.cx ?? W * .50, cy = opts.cy ?? H * .435, scale = opts.scale ?? H * .315;
  const yaw = opts.yaw ?? 0, pitch = opts.pitch ?? -.28, roll = opts.roll ?? .08;
  const deform = opts.deform ?? 1, complexity = opts.complexity ?? 1;
  const qAlpha = clamp01(opts.alpha ?? 1), excited = clamp01(opts.excited ?? 0);
  const basisOnly = opts.basisOnly ?? false;
  g.save();
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `650 ${9.2 * k}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  for (let i = 0; i < 132; i++) {
    const theta = Math.acos(1 - 2 * hash01(i, 974, 1));
    const phi = TAU * hash01(i, 974, 2);
    const s = fieldVolumeSample(theta, phi, t, {
      deform, complexity, quantized: 1, excitation: excited,
    });
    const q = rotateFieldVolume(s.q, yaw, pitch, roll);
    if (q[1] < .015) continue;
    const pt = projectFieldVolume(q, cx, cy, scale);
    // Before a creation operator acts, show the chosen Fock vacuum: every displayed
    // mode is empty.  Afterwards, only the wavepacket support carries a warm "1";
    // there are no unrelated occupied modes elsewhere on the field.
    const chosen = s.density > .12 && hash01(i, 974, 3) < .88 * s.density;
    const digit = basisOnly ? "0" : (chosen ? "1" : "0");
    const isOne = digit === "1";
    const warmOne = isOne && excited > .05;
    const color = warmOne ? p.gold : p.cyan;
    const densityWeight = basisOnly ? .74 : (.34 + .64 * (warmOne ? s.density : 1 - s.density));
    if (warmOne) {
      g.fillStyle = rgba(p.gold, qAlpha * (.08 + .17 * s.density));
      g.beginPath();
      g.arc(pt.x, pt.y, (4.5 + 4.5 * s.density) * k, 0, TAU);
      g.fill();
    }
    g.fillStyle = rgba(color, qAlpha * densityWeight * (.65 + .35 * Math.max(0, q[1])));
    g.fillText(digit, pt.x, pt.y);
  }
  g.restore();
}

function drawSpinorPhaseHalo(g, cx, cy, radius, theta, k, alpha = 1) {
  const p = palette(), phase = theta / 2;
  g.save();
  g.strokeStyle = rgba(p.hi, .18 * alpha);
  g.lineWidth = .62 * k;
  g.beginPath(); g.ellipse(cx, cy, radius, radius * .24, -.13, 0, TAU); g.stroke();
  const nodes = [[phase, p.gold], [phase + Math.PI, p.violet]];
  for (const [a, color] of nodes) {
    const x = cx + Math.cos(a) * radius, y = cy + Math.sin(a) * radius * .24;
    glowDot(g, x, y, 2.15 * k, color, alpha);
  }
  g.restore();
}

function drawGeneratorRings(g, cx, cy, radius, t, k, alpha = 1) {
  const p = palette();
  const rings = [
    { rx: radius * 1.10, ry: radius * .25, rot: -.12, color: p.accent },
    { rx: radius * .30, ry: radius * 1.04, rot: .18, color: p.cyan },
    { rx: radius * .72, ry: radius * .96, rot: -.74, color: p.gold },
  ];
  g.save();
  rings.forEach((ring, i) => {
    const pulse = .56 + .28 * Math.sin(t * 1.25 - i * 1.9);
    g.strokeStyle = rgba(ring.color, alpha * pulse);
    g.lineWidth = .72 * k;
    g.setLineDash([2.5 * k, 4.2 * k]);
    g.beginPath(); g.ellipse(cx, cy, ring.rx, ring.ry, ring.rot, 0, TAU); g.stroke();
    const a = t * .34 + i * 1.77;
    const ca = Math.cos(a), sa = Math.sin(a), cr = Math.cos(ring.rot), sr = Math.sin(ring.rot);
    const x = cx + ring.rx * ca * cr - ring.ry * sa * sr;
    const y = cy + ring.rx * ca * sr + ring.ry * sa * cr;
    glowDot(g, x, y, 1.15 * k, ring.color, alpha * .78);
  });
  g.setLineDash([]);
  g.restore();
}

function drawComplexDisc(g, cx, cy, r, phase, color, k, alpha = 1) {
  const p = palette();
  g.save();
  g.strokeStyle = p.hair; g.globalAlpha = .78 * alpha; g.lineWidth = .72 * k;
  g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
  line(g, cx - r, cy, cx + r, cy, p.hair, k, .34 * alpha, .48);
  line(g, cx, cy - r, cx, cy + r, p.hair, k, .34 * alpha, .48);
  const x = cx + Math.cos(phase) * r, y = cy - Math.sin(phase) * r;
  line(g, cx, cy, x, y, color, k, .72 * alpha, 1.0);
  glowDot(g, x, y, 2.3 * k, color, alpha);
  g.restore();
}

function rotate3(v, axis, theta) {
  const [x, y, z] = v, [u, v0, w] = axis, c = Math.cos(theta), s = Math.sin(theta);
  const dot = u * x + v0 * y + w * z;
  return [
    x * c + (v0 * z - w * y) * s + u * dot * (1 - c),
    y * c + (w * x - u * z) * s + v0 * dot * (1 - c),
    z * c + (u * y - v0 * x) * s + w * dot * (1 - c),
  ];
}

function project3(v, cx, cy, s) {
  const [x, y, z] = v;
  return [cx + s * (x + .34 * y), cy - s * (z - .22 * y)];
}

function drawFrame3(g, cx, cy, r, theta, k, alpha = 1) {
  const p = palette(), axis = [.32, .84, .44];
  const basis = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], colors = [p.accent, p.cyan, p.gold];
  g.save();
  g.strokeStyle = p.hair; g.globalAlpha = .42 * alpha; g.lineWidth = .65 * k;
  g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
  basis.forEach((b, i) => {
    const q = project3(rotate3(b, axis, theta), cx, cy, r * .77);
    arrow(g, cx, cy, q[0], q[1], colors[i], k, .92 * alpha, 1.05, 5.7);
  });
  g.restore();
}

function drawWavePacket(g, x, y, radius, phase, k, color, alpha = 1) {
  g.save();
  for (let n = 7; n >= 0; n--) {
    const rr = radius * (.25 + n / 9);
    const a = alpha * (.035 + .045 * (8 - n));
    g.fillStyle = rgba(color, a);
    g.beginPath(); g.ellipse(x, y, rr * (1 + .08 * Math.sin(phase + n)), rr * .46, -.18, 0, TAU); g.fill();
  }
  glowDot(g, x, y, 2.0 * k, color, .72 * alpha);
  g.restore();
}

function drawBlochAxes(g, cx, cy, r, vector, k, alpha = 1, sphereAlpha = 1) {
  const p = palette();
  g.save();
  g.strokeStyle = p.hair; g.lineWidth = .72 * k; g.globalAlpha = .62 * alpha * sphereAlpha;
  g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
  g.setLineDash([2.2 * k, 3.2 * k]);
  g.beginPath(); g.ellipse(cx, cy, r, r * .28, 0, 0, TAU); g.stroke();
  g.beginPath(); g.ellipse(cx, cy, r * .28, r, 0, 0, TAU); g.stroke();
  g.setLineDash([]);
  const q = project3(vector, cx, cy, r * .84);
  arrow(g, cx, cy, q[0], q[1], p.accentLite, k, alpha, 1.55, 7.2);
  glowDot(g, q[0], q[1], 2.0 * k, p.accent, alpha);
  g.restore();
}

function drawMomentumModeSpace(g, W, H, t, k, opts = {}) {
  const p = palette();
  const alpha = clamp01(opts.alpha ?? 1);
  const oneParticle = clamp01(opts.oneParticle ?? 0);
  const x0 = W * .145, x1 = W * .855, cy = H * .475;
  const sigma = .235, centre = .13;

  // Fock occupation belongs to momentum modes, not to points painted on a
  // spatial field surface.  The rings are a sparse sampling of the mode basis;
  // the continuous curve is the normalised wavepacket envelope f(p).
  arrow(g, x0, cy, x1, cy, p.mid, k, .54 * alpha, .72, 4.8);
  text(g, "p", x1 + 10 * k, cy, p.mid, k, 9.0, .82 * alpha, "left", 550,
    "Cambria Math, STIX Two Math, Georgia, serif");

  const points = [];
  for (let i = 0; i < 31; i++) {
    const u = -1 + 2 * i / 30;
    const x = mix(x0 + 7 * k, x1 - 7 * k, (u + 1) / 2);
    const amp = Math.exp(-.5 * ((u - centre) / sigma) ** 2);
    points.push({ u, x, amp });
    g.save();
    g.strokeStyle = rgba(p.cyan, alpha * (.22 + .30 * (1 - oneParticle)));
    g.lineWidth = .62 * k;
    g.beginPath(); g.arc(x, cy, 2.25 * k, 0, TAU); g.stroke();
    if (oneParticle > 0) {
      const phase = 3.0 * u + .22 * Math.sin(t * .35);
      const r = (1.25 + 2.35 * amp) * k;
      line(g, x, cy, x + Math.cos(phase) * r, cy - Math.sin(phase) * r,
        p.gold, k, alpha * oneParticle * (.12 + .80 * amp), .70);
      g.fillStyle = rgba(p.gold, alpha * oneParticle * (.06 + .64 * amp));
      g.beginPath(); g.arc(x, cy, (1.05 + 2.8 * amp) * k, 0, TAU); g.fill();
    }
    g.restore();
  }

  if (oneParticle > 0) {
    const base = cy - H * .038;
    const height = H * .225;
    g.save();
    g.beginPath();
    g.moveTo(points[0].x, base);
    for (const q of points) g.lineTo(q.x, base - q.amp * height);
    g.lineTo(points.at(-1).x, base);
    g.closePath();
    const fill = g.createLinearGradient(0, base - height, 0, base);
    fill.addColorStop(0, rgba(p.gold, .25 * alpha * oneParticle));
    fill.addColorStop(1, rgba(p.gold, .015));
    g.fillStyle = fill; g.fill();
    g.strokeStyle = rgba(p.gold, .90 * alpha * oneParticle);
    g.lineWidth = 1.15 * k;
    g.beginPath();
    points.forEach((q, i) => {
      const y = base - q.amp * height;
      if (i === 0) g.moveTo(q.x, y); else g.lineTo(q.x, y);
    });
    g.stroke();
    g.restore();
    text(g, "|f(p)|²", x0 + 5 * k, base - height * .78, p.gold, k, 9.4,
      .94 * alpha * oneParticle, "left", 550, "Cambria Math, STIX Two Math, Georgia, serif");
  }
}

function drawGeneratorFrames(g, W, H, t, k, alpha = 1) {
  const p = palette();
  const centres = [W * .285, W * .50, W * .715];
  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const colors = [p.accent, p.cyan, p.gold];
  for (let i = 0; i < 3; i++) {
    const [cx, cy] = [centres[i], H * .47];
    const r = H * .135;
    g.save();
    g.strokeStyle = rgba(colors[i], .34 * alpha);
    g.lineWidth = .72 * k;
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
    const theta = .58 * Math.sin(t * .72 + i * 1.35);
    const basis = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    basis.forEach((b, j) => {
      const q = project3(rotate3(b, axes[i], theta), cx, cy, r * .74);
      arrow(g, cx, cy, q[0], q[1], j === i ? colors[i] : p.mid, k,
        alpha * (j === i ? .95 : .42), j === i ? 1.05 : .68, j === i ? 5.2 : 4.0);
    });
    glowDot(g, cx, cy, 1.35 * k, colors[i], .74 * alpha);
    g.restore();
  }
}

function drawTwoToOneCover(g, W, H, t, k, alpha = 1) {
  const p = palette();
  const lx = W * .285, rx = W * .72, cy = H * .47;
  const phase = .55 * t;
  drawComplexDisc(g, lx, cy - H * .105, H * .075, phase, p.cyan, k, alpha);
  drawComplexDisc(g, lx, cy + H * .105, H * .075, phase + Math.PI, p.gold, k, alpha);
  text(g, "U", lx - H * .105, cy - H * .105, p.cyan, k, 10, alpha, "right", 600,
    "Cambria Math, STIX Two Math, Georgia, serif");
  text(g, "−U", lx - H * .105, cy + H * .105, p.gold, k, 10, alpha, "right", 600,
    "Cambria Math, STIX Two Math, Georgia, serif");
  const junctionX = W * .505;
  arrow(g, lx + H * .092, cy - H * .105, junctionX, cy, p.cyan, k, .70 * alpha, .80, 5.0);
  arrow(g, lx + H * .092, cy + H * .105, junctionX, cy, p.gold, k, .70 * alpha, .80, 5.0);
  arrow(g, junctionX, cy, rx - H * .135, cy, p.hi, k, .64 * alpha, .84, 5.0);
  drawFrame3(g, rx, cy, H * .135, .52 * Math.sin(t * .58), k, alpha);
  text(g, "R", rx, cy + H * .185, p.hi, k, 10, .90 * alpha, "center", 600,
    "Cambria Math, STIX Two Math, Georgia, serif");
}

const qftSpinorExcitation = {
  aspect: 16 / 9, loop: true, fps: 18, dpr: 1, minWidth: 720, revealSteps: 4,
  draw(g, W, H, t, a = {}) {
    const k = a.k ?? W / 640, step = qStep(a, 4), enter = qEnter(a, 1.35);
    clearQuantum(g, W, H);
    const yaw = -.48 + .22 * Math.sin(t * .18);
    const pitch = -.30 + .025 * Math.sin(t * .27);
    const camera = { yaw, pitch, roll: .09 };

    // One level surface of a coarse-grained local observable in a localized QCD state.
    if (step === 0) {
      drawFieldVolume(g, W, H, t, k, {
        ...camera, cy: H * .475, scale: H * .225,
        deform: 1, excitation: 0, complexity: 1, quantized: 0,
        gridAlpha: .16, textureCount: 96,
      });
      return;
    }

    // EFT matching is shown as a loss of resolvable short-distance structure. The
    // camera, centre, scale and breathing phase remain continuous across the click.
    if (step === 1) {
      drawFieldVolume(g, W, H, t, k, {
        ...camera, cy: H * .475, scale: H * .225,
        deform: 1, excitation: 0, complexity: 1 - enter, quantized: 0,
        gridAlpha: mix(.16, .12, enter), textureCount: Math.round(mix(96, 54, enter)),
      });
      return;
    }

    // One surface fans into a weighted family of complete bosonic configurations:
    // the visual statement Psi[phi] = <phi|Psi>.
    if (step === 2) {
      drawFieldVolume(g, W, H, t, k, {
        ...camera, cy: H * .475, scale: H * .225,
        deform: 1, excitation: 0, complexity: 0, quantized: 0,
        gridAlpha: .12 * (1 - enter), textureCount: Math.round(54 * (1 - enter)),
        surfaceAlpha: 1 - enter,
      });
      drawWavefunctionalCloud(g, W, H, t, k, {
        ...camera, excitation: 0, alpha: enter, spread: enter,
      });
      return;
    }

    // The first normal-mode excitation has a node at q_lambda = 0 and opposite
    // wavefunctional sign on the positive and negative deformation families.
    if (step === 3) {
      drawWavefunctionalCloud(g, W, H, t, k, {
        ...camera, excitation: enter, alpha: 1, spread: 1,
      });
      return;
    }

    // Return from the bosonic teaching analogue to the actual one-proton sector.
    // The final surface is an isodensity surface of < :N^dagger N: >.
    drawWavefunctionalCloud(g, W, H, t, k, {
      ...camera, excitation: 1, alpha: 1 - enter, spread: 1 - enter,
    });
    drawFieldVolume(g, W, H, 0, k, {
      ...camera, cy: H * .475, scale: H * .245,
      deform: .30, excitation: enter, complexity: 0, quantized: 0,
      packetRelief: 1, motion: 0, breathAmp: 0,
      gridAlpha: .20, showTexture: false,
      surfaceAlpha: enter,
    });
  },
};

function drawStateSpaceSphere(g, cx, cy, R, k, alpha = 1) {
  const p = palette();
  g.save();
  g.strokeStyle = rgba(p.hi, .34 * alpha);
  g.lineWidth = .72 * k;
  g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
  g.strokeStyle = rgba(p.cyan, .34 * alpha);
  g.setLineDash([2.2 * k, 3.2 * k]);
  g.beginPath(); g.ellipse(cx, cy, R, R * .27, 0, 0, TAU); g.stroke();
  g.beginPath(); g.ellipse(cx, cy, R * .27, R, 0, 0, TAU); g.stroke();
  g.setLineDash([]);
  g.restore();
}

function drawDoubleCoverProjection(g, cx, cy, R, progress, k) {
  const p = palette();
  const first = clamp01(progress * 2);
  const second = clamp01(progress * 2 - 1);
  const sheet = (q, color, radiusOffset, phaseOffset) => {
    if (q <= 0) return;
    const rr = R + radiusOffset;
    const top = cy + rr - 2 * rr * q;
    g.save();
    g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.clip();
    g.beginPath(); g.rect(cx - rr - 2*k, top, 2 * rr + 4*k, cy + rr - top + 2*k); g.clip();
    g.fillStyle = rgba(color, .055 + .055 * q);
    g.fillRect(cx - rr, cy - rr, 2 * rr, 2 * rr);
    g.strokeStyle = rgba(color, .60);
    g.lineWidth = .72 * k;
    for (let b = 1; b < 12; b++) {
      const lat = -Math.PI / 2 + Math.PI * b / 12;
      const y = cy + rr * Math.sin(lat);
      const rx = rr * Math.cos(lat);
      g.beginPath(); g.ellipse(cx, y, Math.max(1, rx), Math.max(1, rx * .20), phaseOffset, 0, TAU); g.stroke();
    }
    for (let m = -4; m <= 4; m++) {
      const u = m / 4;
      g.globalAlpha = .30 + .34 * (1 - Math.abs(u));
      g.beginPath(); g.ellipse(cx, cy, rr * (.13 + .19 * Math.abs(u)), rr, u * .19 + phaseOffset, 0, TAU); g.stroke();
    }
    g.restore();
  };
  sheet(first, p.cyan, 0, 0);
  sheet(second, p.gold, 6.5 * k, .035);
}

const qftSpinorTransform = {
  aspect: 16 / 9, loop: true, fps: 20, dpr: 1, minWidth: 720, revealSteps: 2,
  draw(g, W, H, t, a = {}) {
    const p = palette(), k = a.k ?? W / 640, step = qStep(a, 2);
    const enter = qEnter(a, 1.25);
    clearQuantum(g, W, H);

    // Physical rotations act on space through SO(3).  Spinors carry the lifted
    // SU(2) action.  Never represent either group by an ordinary Bloch/S² sphere.
    if (step === 0) {
      const cx = W * .50, cy = H * .47;
      drawWavePacket(g, cx, cy, H * .16, t * .32, k, p.accentLite, .88);
      drawFrame3(g, cx, cy, H * .205, .50 * Math.sin(t * .55), k, 1);
      return;
    }
    if (step === 1) {
      drawGeneratorFrames(g, W, H, t, k, enter);
      return;
    }
    drawTwoToOneCover(g, W, H, t, k, enter);
  },
};

const qftDoubleCover = {
  aspect: 16 / 9, loop: true, fps: 20, dpr: 1, minWidth: 720, revealSteps: 3,
  draw(g, W, H, t, a = {}) {
    const k = a.k ?? W / 640, step = qStep(a, 3), since = qSince(a), settled = qSettled(a);
    clearQuantum(g, W, H);
    let theta = .22 * Math.sin(t * .36);
    if (step === 1) theta = .34 * Math.sin(t * .30);
    if (step === 2) theta = TAU * (settled ? 1 : easeCubic(since / 3.6));
    if (step >= 3) theta = TAU + TAU * (settled ? 1 : easeCubic(since / 3.6));
    const volume = drawFieldVolume(g, W, H, t, k, {
      deform: 0,
      excitation: 1,
      complexity: .22,
      quantized: 1,
      yaw: -.42 + theta,
      pitch: -.27,
      roll: .08,
      gridAlpha: .74,
      scale: H * .305,
    });
    // The outer phase marker advances by θ/2.  The ordinary S² grid returns after 2π,
    // whereas this spinorial marker is antipodal and returns only after 4π.
    drawSpinorPhaseHalo(g, volume.cx, volume.cy, volume.scale * 1.25, theta, k, .92);
  },
};

const qftNoetherWigner = {
  aspect: 16 / 9, loop: true, fps: 18, dpr: 1, minWidth: 720, revealSteps: 2,
  draw(g, W, H, t, a = {}) {
    const p = palette(), k = a.k ?? W / 640, step = qStep(a, 2), enter = qEnter(a, 1.05);
    clearQuantum(g, W, H);
    const origin = [W * .47, H * .425], orbitR = H * .23;
    g.save(); g.strokeStyle = p.hair; g.globalAlpha = .52; g.lineWidth = .68 * k; g.setLineDash([3 * k, 5 * k]);
    g.beginPath(); g.ellipse(origin[0], origin[1], orbitR * 1.42, orbitR * .56, -.12, 0, TAU); g.stroke(); g.restore();
    let x = origin[0], y = origin[1];
    if (step === 0) {
      const ang = t * .52;
      x += Math.cos(ang) * orbitR * 1.42; y += Math.sin(ang) * orbitR * .56;
      arrow(g, origin[0], origin[1], x, y, p.cyan, k, .50, .82, 5.4);
    } else if (step === 1) {
      x = mix(origin[0] + orbitR * 1.15, origin[0], enter);
      y = mix(origin[1] - orbitR * .24, origin[1], enter);
    } else {
      x = mix(W * .37, W * .58, enter); y = H * .425;
      arrow(g, W * .27, y, W * .70, y, p.cyan, k, .55, .9, 6.2);
    }
    drawWavePacket(g, x, y, 62 * k, t, k, p.accent, 1);
    drawSpinorFibre(g, x, y + 16 * k, 56, step === 0 ? t * .42 : t * .86, k, 1, 1.35);
    if (step >= 2) {
      const ghostX = W * .37, ghostY = H * .425;
      drawWavePacket(g, ghostX, ghostY, 48 * k, t, k, p.cyan, .28 * (1 - enter));
    }
  },
};

const qftBlochConstruct = {
  aspect: 16 / 9, loop: true, fps: 18, dpr: 1, minWidth: 720, revealSteps: 4,
  draw(g, W, H, t, a = {}) {
    const p = palette(), k = a.k ?? W / 640, step = qStep(a, 4), enter = qEnter(a, .9);
    clearQuantum(g, W, H);
    const theta = .74 + .10 * Math.sin(t * .34), phi = t * .33;
    const alphaPhase = -.18 * t, betaPhase = phi - .18 * t;
    const left = W * .30, right = W * .70, cy = H * .41, rr = 70 * k;
    const phasorFade = step <= 1 ? 1 : step === 2 ? mix(1, .16, enter) : .05;
    drawComplexDisc(g, left, cy, rr, alphaPhase, p.gold, k, phasorFade);
    drawComplexDisc(g, right, cy, rr, betaPhase, p.violet, k, phasorFade);
    if (step >= 1 && step <= 3) {
      const q = step === 1 ? enter : step === 2 ? 1 : 1 - enter, mx = W * .50, my = H * .41, cell = 52 * k;
      for (let r0 = 0; r0 < 2; r0++) for (let c0 = 0; c0 < 2; c0++) {
        const x = mx + (c0 - .5) * cell, y = my + (r0 - .5) * cell;
        const col = r0 === c0 ? p.accent : (r0 ? p.violet : p.gold);
        g.save(); g.fillStyle = rgba(col, .08 + .16 * q); g.strokeStyle = rgba(col, .48 * q); g.lineWidth = .8 * k;
        g.fillRect(x - cell * .42, y - cell * .42, cell * .84, cell * .84); g.strokeRect(x - cell * .42, y - cell * .42, cell * .84, cell * .84); g.restore();
      }
    }
    const vx = Math.sin(theta) * Math.cos(phi), vy = Math.sin(theta) * Math.sin(phi), vz = Math.cos(theta);
    if (step >= 2 && step <= 3) {
      const q = step === 2 ? enter : 1 - enter, cx = W * .50, base = H * .47;
      [[vx, p.accent], [vy, p.cyan], [vz, p.gold]].forEach(([v, col], i) => {
        const x = cx + (i - 1) * 82 * k;
        line(g, x, base - 70 * k, x, base + 70 * k, p.hair, k, .35 * q, .62);
        arrow(g, x, base, x, base - v * 63 * k, col, k, q, 1.12, 6.0);
      });
    }
    if (step >= 3) {
      const q = step === 3 ? enter : 1;
      drawBlochAxes(g, W * .50, H * .405, H * .235, [vx, vy, vz], k, q, q);
    }
    if (step >= 4) {
      const q = enter;
      for (let i = 0; i < 48; i++) {
        const th = Math.acos(1 - 2 * hash01(i, 404, 1)), ph = TAU * hash01(i, 404, 2) + t * (.05 + .08 * hash01(i, 404, 3));
        const len = .18 + .66 * hash01(i, 404, 4);
        const v = [len * Math.sin(th) * Math.cos(ph), len * Math.sin(th) * Math.sin(ph), len * Math.cos(th)];
        const pt = project3(v, W * .50, H * .405, H * .235 * .84);
        glowDot(g, pt[0], pt[1], .65 * k, i % 2 ? p.cyan : p.violet, .10 * q);
      }
    }
  },
};

const qftZeemanProton = {
  aspect: 16 / 9, loop: true, fps: 20, dpr: 1, minWidth: 720, revealSteps: 2,
  draw(g, W, H, t, a = {}) {
    const p = palette(), k = a.k ?? W / 640, step = qStep(a, 2), enter = qEnter(a, 1.25);
    clearQuantum(g, W, H);
    const bAmp = step === 0 ? 0 : step === 1 ? enter : 1;
    const splitQ = bAmp;
    const cx = W * .50, cy = H * .455;
    const split = H * .145 * splitQ;

    // B0 grows as the initially degenerate cloud resolves into the two Jz energy
    // eigenspaces.  These are states, not two spatial beams of protons.
    for (let i = -10; i <= 10; i++) {
      const x = cx + i * 22 * k;
      const fieldHeight = mix(H * .49, H * .63, bAmp);
      arrow(g, x, cy + fieldHeight * .48, x, cy - fieldHeight * .48, p.cyan, k,
        bAmp * (.08 + .19 * (1 - Math.abs(i) / 14)), .55, 3.8);
    }

    if (splitQ > .02) {
      line(g, W * .22, cy - split, W * .78, cy - split, p.gold, k, .30 + .50 * splitQ, 1.08);
      line(g, W * .22, cy + split, W * .78, cy + split, p.violet, k, .30 + .50 * splitQ, 1.08);
      // Energy names arrive with—and remain attached to—the splitting rails.
      text(g, "E₋z = +½ℏγₚB₀", W * .795, cy - split, p.gold, k, 7.2,
        .18 + .82 * splitQ, "left", 650);
      text(g, "E₊z = −½ℏγₚB₀", W * .795, cy + split, p.violet, k, 7.2,
        .18 + .82 * splitQ, "left", 650);
    }

    const n = 112;
    for (let i = 0; i < n; i++) {
      const initialX = cx + (hash01(i, 608, 1) - .5) * W * .46;
      const initialY = cy + (hash01(i, 608, 2) - .5) * H * .34;
      const excessLower = step >= 2 && i === 1;
      const lower = i % 2 === 0 || excessLower;
      const targetX = W * .245 + (i % 56) / 55 * W * .51;
      const targetY = cy + (lower ? split : -split) + (hash01(i, 608, 4) - .5) * 8 * k;
      const x = mix(initialX, targetX, splitQ);
      const y = mix(initialY, targetY, splitQ);
      const th = Math.acos(1 - 2 * hash01(i, 608, 5));
      const ph = TAU * hash01(i, 608, 6) + t * .11;
      const randomDx = Math.sin(th) * Math.cos(ph) * 8.5 * k;
      const randomDy = -Math.cos(th) * 8.5 * k;
      const targetDy = (lower ? -1 : 1) * 9.2 * k;
      const dx = mix(randomDx, 0, splitQ);
      const dy = mix(randomDy, targetDy, splitQ);
      const col = splitQ < .30 ? p.hi : lower ? p.violet : p.gold;
      glowDot(g, x, y, .75 * k, col, .24 + .35 * splitQ);
      arrow(g, x, y, x + dx, y + dy, col, k, .28 + .48 * splitQ, .60, 3.3);
    }

    if (step >= 2) {
      // The visible single-dot excess is only a cue; the equation below carries the
      // physically correct parts-per-million population imbalance.
      glowDot(g, W * .50, cy + split, 2.0 * k, p.accent, .42 + .38 * enter);
      arrow(g, W * .82, cy + 13 * k, W * .82, cy - 27 * k, p.accent, k, .48 * enter, 1.05, 5.2);
    }
  },
};

function ensembleState(i, age) {
  const off = (hash01(i, 710, 1) - .5) * 7.2;
  const t2 = .95 + .60 * hash01(i, 710, 2), t1 = 2.4 + 1.1 * hash01(i, 710, 3);
  const transverse = Math.exp(-age / t2), phase = off * age;
  return [transverse * Math.cos(phase), transverse * Math.sin(phase), 1 - Math.exp(-age / t1)];
}

const qftRfEnsemble = {
  aspect: 16 / 9, loop: true, fps: 20, dpr: 1, minWidth: 720, revealSteps: 5,
  draw(g, W, H, t, a = {}) {
    const p = palette(), k = a.k ?? W / 640, step = qStep(a, 5), since = qSince(a), settled = qSettled(a);
    clearQuantum(g, W, H);
    const ensembleLayout = step < 3 ? 0 : step === 3 ? qEnter(a, 1.05) : 1;
    const cx = mix(W * .50, W * .38, ensembleLayout), cy = H * .39;
    const R = mix(H * .292, H * .245, ensembleLayout);
    if (step <= 2) {
      let v;
      if (step === 0) {
        // A single ray in C² represented on CP¹ ≅ S².  This sphere is a state-space
        // coordinate system, not the field manifold and not the SU(2) group manifold.
        v = [.67, -.29, .68];
      } else if (step === 1) {
        const polar = .64, phase = t * 1.55;
        v = [Math.sin(polar) * Math.cos(phase), Math.sin(polar) * Math.sin(phase), Math.cos(polar)];
      } else {
        const pulseAge = settled ? 1.55 : Math.min(1.55, since);
        const theta = Math.min(Math.PI / 2, pulseAge * Math.PI / 3.10);
        v = [0, -Math.sin(theta), Math.cos(theta)];
      }
      drawBlochAxes(g, cx, cy, R, v, k, 1, 1);
      if (step === 1) {
        arrow(g, cx, cy + R * .70, cx, cy - R * .70, p.cyan, k, .54, .82, 5.0);
        g.save(); g.strokeStyle = rgba(p.accent, .42); g.lineWidth = .72 * k; g.setLineDash([3*k,4*k]);
        g.beginPath(); g.ellipse(cx, cy - R * .25, R * .50, R * .14, 0, 0, TAU); g.stroke(); g.restore();
      }
      if (step === 2) {
        const q = project3([1, 0, 0], cx, cy, R * .82);
        arrow(g, cx, cy, q[0], q[1], p.cyan, k, .90, 1.05, 6.2);
        for (let i = 0; i < 20; i++) {
          const ang = i / 20 * TAU + t * .16;
          const x = cx + Math.cos(ang) * R * .82, y = cy + Math.sin(ang) * R * .26;
          glowDot(g, x, y, .68 * k, p.cyan, .10);
        }
      }
    } else {
      const age = settled ? 2.6 : Math.max(.05, since);
      const n = 156, sphereAlpha = step === 3 ? .78 : .34;
      g.save(); g.strokeStyle = p.hair; g.globalAlpha = sphereAlpha; g.lineWidth = .75 * k;
      g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke(); g.restore();
      let sx = 0, sy = 0, sz = 0;
      for (let i = 0; i < n; i++) {
        const v = ensembleState(i, age);
        sx += v[0]; sy += v[1]; sz += v[2];
        const pt = project3(v, cx, cy, R * .80);
        glowDot(g, pt[0], pt[1], .58 * k, i % 3 ? p.cyan : p.violet, step === 3 ? .30 : .18);
      }
      sx /= n; sy /= n; sz /= n;
      drawBlochAxes(g, cx, cy, R, [sx, sy, sz], k, 1, .20);
      const plot = { x: W * .62, y: H * .23, w: W * .31, h: H * .33 };
      line(g, plot.x, plot.y + plot.h, plot.x + plot.w, plot.y + plot.h, p.hair, k, .58, .72);
      line(g, plot.x, plot.y, plot.x, plot.y + plot.h, p.hair, k, .58, .72);
      g.save(); g.strokeStyle = step >= 5 ? p.accentLite : p.cyan; g.lineWidth = 1.55 * k; g.globalAlpha = .92; g.beginPath();
      const samples = 170;
      for (let i = 0; i < samples; i++) {
        const u = i / (samples - 1), tt = u * Math.max(3.8, age);
        let mx = 0, my = 0;
        for (let j = 0; j < 72; j++) { const v = ensembleState(j, tt); mx += v[0]; my += v[1]; }
        const env = Math.hypot(mx, my) / 72;
        const carrier = step >= 5 ? Math.sin(tt * 23) : 1;
        const val = env * carrier;
        const x = plot.x + u * plot.w, y = plot.y + plot.h * .50 - val * plot.h * .42;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke(); g.restore();
      if (step >= 5) {
        const coilX = W * .545, coilY = H * .405;
        g.save(); g.strokeStyle = p.gold; g.globalAlpha = .78; g.lineWidth = 1.35 * k;
        for (let n0 = 0; n0 < 4; n0++) { g.beginPath(); g.ellipse(coilX, coilY, (18 + 8 * n0) * k, 71 * k, -.08, 0, TAU); g.stroke(); }
        g.restore();
      }
    }
  },
};

// ── quantum ensemble → MRI measurement bridge ──────────────────────────────

/* These three scenes deliberately begin only after the Zeeman population slide.  They
 * describe the reduced spin ensemble and the macroscopic magnetisation, not a proton body
 * rotating in space and not the proton QFT field.  The visual grammar stays equation-led:
 * the canvas carries vectors, fields, phases and induced voltage; the deck supplies names.
 */

function drawSampleVolume(g, cx, cy, rx, ry, k, alpha = 1) {
  const p = palette(), dx = -11 * k, dy = -9 * k;
  g.save();
  g.strokeStyle = p.hair;
  g.globalAlpha = .64 * alpha;
  g.lineWidth = .72 * k;
  g.strokeRect(cx - rx + dx, cy - ry + dy, 2 * rx, 2 * ry);
  g.strokeRect(cx - rx, cy - ry, 2 * rx, 2 * ry);
  [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([sx, sy]) => {
    g.beginPath();
    g.moveTo(cx + sx * rx + dx, cy + sy * ry + dy);
    g.lineTo(cx + sx * rx, cy + sy * ry);
    g.stroke();
  });
  const wash = g.createRadialGradient(cx, cy, 0, cx, cy, rx);
  wash.addColorStop(0, rgba(p.cyan, .055 * alpha));
  wash.addColorStop(1, rgba(p.cyan, 0));
  g.fillStyle = wash;
  g.globalAlpha = 1;
  g.fillRect(cx - rx, cy - ry, 2 * rx, 2 * ry);
  g.restore();
}

function vectorEnd(v, x, y, scale) {
  return project3(v, x, y, scale);
}

function drawRfOrbit(g, cx, cy, R, phase, k, alpha = 1) {
  const p = palette();
  g.save();
  g.strokeStyle = rgba(p.cyan, .62 * alpha);
  g.lineWidth = .78 * k;
  g.setLineDash([3 * k, 4 * k]);
  g.beginPath();
  g.ellipse(cx, cy, R, R * .255, 0, 0, TAU);
  g.stroke();
  g.setLineDash([]);
  const v = [Math.cos(phase), Math.sin(phase), 0];
  const q = vectorEnd(v, cx, cy, R);
  arrow(g, cx, cy, q[0], q[1], p.cyan, k, .92 * alpha, 1.18, 6.2);
  glowDot(g, q[0], q[1], 1.7 * k, p.cyan, .82 * alpha);
  g.restore();
}

const qftEnsembleRfBridge = {
  aspect: 16 / 9, loop: true, fps: 20, dpr: 1, minWidth: 720, revealSteps: 2,
  draw(g, W, H, t, a = {}) {
    const p = palette(), k = a.k ?? W / 640, step = qStep(a, 2), enter = qEnter(a, 1.15);
    clearQuantum(g, W, H);
    const cx = W * .50, cy = H * .455, rx = W * .29, ry = H * .255;
    drawSampleVolume(g, cx, cy, rx, ry, k, 1);

    const rfPhase = t * 1.05;
    const tip = step === 0 ? 0 : step === 1 ? .34 * enter : mix(.34, Math.PI / 2, enter);
    const labPhase = step < 2 ? 0 : t * .52;
    const axis = [Math.sin(tip) * Math.cos(labPhase), Math.sin(tip) * Math.sin(labPhase), Math.cos(tip)];

    // Each physical position carries an exactly cancelling pair plus the tiny thermal excess
    // represented by the large ensemble arrow.  This avoids pretending that every proton is
    // a classical compass needle pointing in the same direction.
    for (let i = 0; i < 30; i++) {
      const col = i % 6, row = Math.floor(i / 6);
      const x = cx + (col - 2.5) * rx * .265 + (hash01(i, 844, 1) - .5) * 7 * k;
      const y = cy + (row - 2) * ry * .30 + (hash01(i, 844, 2) - .5) * 6 * k;
      const qa = vectorEnd(axis, x - 1.3 * k, y, 10.5 * k);
      const qb = vectorEnd(axis.map((v) => -v), x + 1.3 * k, y, 10.5 * k);
      arrow(g, x - 1.3 * k, y, qa[0], qa[1], p.gold, k, .31, .58, 3.0);
      arrow(g, x + 1.3 * k, y, qb[0], qb[1], p.violet, k, .27, .58, 3.0);
    }

    const M = vectorEnd(axis, cx, cy, H * .205);
    arrow(g, cx, cy, M[0], M[1], p.accentLite, k, .96, 1.65, 8.2);
    glowDot(g, M[0], M[1], 2.25 * k, p.accent, .92);

    // B0 remains the quantisation axis; the transverse co-rotating RF component arrives on
    // the first click.  The displayed orbit is deliberately slowed by many orders of magnitude.
    arrow(g, cx + rx * .83, cy + ry * .72, cx + rx * .83, cy - ry * .72,
      p.cyan, k, .28, .82, 5.0);
    if (step >= 1) drawRfOrbit(g, cx, cy, H * .205, rfPhase, k, step === 1 ? enter : mix(1, .42, enter));

    if (step >= 2) {
      // A thin transverse coherence ring makes the common phase visible without introducing
      // a second Bloch sphere or implying a spatial orbit of the proton.
      g.save();
      g.strokeStyle = rgba(p.accent, .34 * enter);
      g.lineWidth = .72 * k;
      g.beginPath(); g.ellipse(cx, cy, H * .215, H * .055, 0, 0, TAU); g.stroke();
      for (let i = 0; i < 28; i++) {
        const ph = i / 28 * TAU;
        glowDot(g, cx + Math.cos(ph) * H * .215, cy + Math.sin(ph) * H * .055,
          .55 * k, p.accentLite, .10 * enter);
      }
      g.restore();
    }
  },
};

function relaxationAge(t) {
  // The reset is the next RF excitation.  It is intentionally visible as a short cyan flash,
  // so the repeating teaching loop never looks like spontaneous reverse relaxation.
  const period = 5.2;
  return ((t % period) + period) % period;
}

function drawRelaxationPlot(g, W, H, age, step, enter, k) {
  const p = palette(), plot = { x: W * .615, y: H * .245, w: W * .31, h: H * .39 };
  line(g, plot.x, plot.y + plot.h, plot.x + plot.w, plot.y + plot.h, p.hair, k, .72, .72);
  line(g, plot.x, plot.y, plot.x, plot.y + plot.h, p.hair, k, .72, .72);
  const tMax = 5.2, xNow = plot.x + clamp01(age / tMax) * plot.w;
  line(g, xNow, plot.y, xNow, plot.y + plot.h, p.mid, k, .24, .58, [2.2, 3.4]);
  const curve = (fn, color, alpha, dash = []) => {
    g.save();
    g.strokeStyle = color; g.globalAlpha = alpha; g.lineWidth = 1.32 * k; g.setLineDash(dash.map((d) => d * k));
    g.beginPath();
    for (let i = 0; i < 150; i++) {
      const u = i / 149, val = fn(u * tMax);
      const x = plot.x + u * plot.w, y = plot.y + plot.h * (1 - .11 - .78 * val);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke(); g.restore();
    const val = fn(age), y = plot.y + plot.h * (1 - .11 - .78 * val);
    glowDot(g, xNow, y, 1.45 * k, color, alpha);
  };
  if (step >= 1) curve((u) => Math.exp(-u / 2.25), p.cyan, step === 1 ? .95 : .70);
  if (step >= 2) curve((u) => Math.exp(-u / .92), p.violet, step === 2 ? .96 * enter : .88, [4.0, 3.0]);
  if (step >= 3) curve((u) => 1 - Math.exp(-u / 3.25), p.accentLite, .96 * enter);
}

const qftBlochRelaxation = {
  aspect: 16 / 9, loop: true, fps: 20, dpr: 1, minWidth: 720, revealSteps: 3,
  draw(g, W, H, t, a = {}) {
    const p = palette(), k = a.k ?? W / 640, step = qStep(a, 3), enter = qEnter(a, 1.0);
    clearQuantum(g, W, H);
    const cx = W * .335, cy = H * .445, R = H * .235;
    const age = step === 0 ? 0 : relaxationAge(t);
    const pulseFlash = step === 0 ? 0 : Math.exp(-Math.pow(age / .11, 2));
    const basePhase = t * .72;
    const t2 = step >= 1 ? Math.exp(-age / 2.25) : 1;
    const z = step >= 3 ? (1 - Math.exp(-age / 3.25)) * enter : 0;
    const spread = step >= 2 ? age * 2.15 * (step === 2 ? enter : 1) : 0;

    g.save();
    g.strokeStyle = p.hair; g.globalAlpha = .67; g.lineWidth = .72 * k;
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
    g.setLineDash([2.4 * k, 3.6 * k]);
    g.beginPath(); g.ellipse(cx, cy, R, R * .27, 0, 0, TAU); g.stroke();
    g.beginPath(); g.ellipse(cx, cy, R * .27, R, 0, 0, TAU); g.stroke();
    g.setLineDash([]); g.restore();

    let sx = 0, sy = 0, sz = 0;
    const count = 48;
    for (let i = 0; i < count; i++) {
      // A narrow, deterministic bundle remains visible even at t=0; a perfectly coincident
      // set of 78 tips would look like one proton rather than one coherent ensemble.
      const off = (hash01(i, 932, 1) - .5) * (spread + .24);
      const phase = basePhase + off;
      const amp = t2 * (.95 + .10 * hash01(i, 932, 2));
      const v = [amp * Math.cos(phase), amp * Math.sin(phase), z];
      sx += v[0]; sy += v[1]; sz += v[2];
      const ang = i * 2.399963229728653;
      const rad = Math.sqrt((i + .55) / count) * R * .63;
      const bx = cx + Math.cos(ang) * rad, by = cy + Math.sin(ang) * rad;
      const q = vectorEnd(v, bx, by, 8.6 * k);
      const color = i % 4 ? p.cyan : p.violet;
      arrow(g, bx, by, q[0], q[1], color, k, step >= 2 ? .36 : .42, .62, 3.0);
      glowDot(g, q[0], q[1], .42 * k, color, step >= 2 ? .28 : .24);
    }
    const mean = [sx / count, sy / count, sz / count];
    const M = vectorEnd(mean, cx, cy, R * .82);
    arrow(g, cx, cy, M[0], M[1], p.accentLite, k, .94, 1.55, 7.4);
    glowDot(g, M[0], M[1], 2.0 * k, p.accent, .90);
    arrow(g, cx + R * .82, cy + R * .66, cx + R * .82, cy - R * .66,
      p.cyan, k, .22, .72, 4.7);

    if (pulseFlash > .01) {
      g.save(); g.strokeStyle = rgba(p.cyan, .75 * pulseFlash); g.lineWidth = 1.15 * k;
      g.beginPath(); g.arc(cx, cy, R * (1.02 + .12 * pulseFlash), 0, TAU); g.stroke(); g.restore();
    }
    drawRelaxationPlot(g, W, H, age, step, enter, k);
  },
};

function drawReceiveCoil(g, cx, cy, rx, ry, k, color, alpha = 1) {
  g.save();
  g.strokeStyle = color; g.globalAlpha = alpha; g.lineWidth = 1.05 * k;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.ellipse(cx, cy, rx + i * 4.2 * k, ry + i * 1.5 * k, -.06, 0, TAU);
    g.stroke();
  }
  g.restore();
}

function drawReceiveTrace(g, x0, y0, w, amp, phase, k, color, alpha = 1) {
  const p = palette();
  line(g, x0, y0, x0 + w, y0, p.hair, k, .55 * alpha, .62);
  g.save();
  g.strokeStyle = color; g.globalAlpha = alpha; g.lineWidth = 1.22 * k; g.beginPath();
  for (let i = 0; i < 150; i++) {
    const u = i / 149;
    const y = y0 - amp * Math.sin(u * TAU * 5.3 + phase) * Math.exp(-u * 1.45);
    const x = x0 + u * w;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke(); g.restore();
}

const qftGradientEncoding = {
  aspect: 16 / 9, loop: true, fps: 20, dpr: 1, minWidth: 720, revealSteps: 3,
  draw(g, W, H, t, a = {}) {
    const p = palette(), k = a.k ?? W / 640, step = qStep(a, 3), enter = qEnter(a, 1.05);
    clearQuantum(g, W, H);
    const cx = W * .36, cy = H * .455, rx = W * .245, ry = H * .225;
    drawSampleVolume(g, cx, cy, rx, ry, k, .92);
    const gradientQ = step === 0 ? 0 : step === 1 ? enter : 1;
    const phaseRamp = step === 0 ? 0 : step === 1 ? 1.7 * enter : 3.9;
    const carrier = t * .72;
    let sx = 0, sy = 0;

    for (let i = 0; i < 40; i++) {
      const col = i % 8, row = Math.floor(i / 8);
      const xn = (col - 3.5) / 3.5, yn = (row - 2) / 2;
      const x = cx + xn * rx * .78 + (hash01(i, 1044, 1) - .5) * 5 * k;
      const y = cy + yn * ry * .66 + (hash01(i, 1044, 2) - .5) * 5 * k;
      const ph = carrier + xn * phaseRamp;
      const v = [Math.cos(ph), Math.sin(ph), 0];
      sx += v[0]; sy += v[1];
      const q = vectorEnd(v, x, y, 10.5 * k);
      const color = col < 4 ? p.cyan : p.gold;
      arrow(g, x, y, q[0], q[1], color, k, .48, .67, 3.2);
      glowDot(g, q[0], q[1], .55 * k, color, .30);
    }

    // Linear field strength across the sample.  Arrow height, not colour, carries G·r.
    if (step >= 1) for (let i = 0; i < 9; i++) {
      const u = i / 8, x = cx + mix(-rx * .86, rx * .86, u);
      const h = mix(.42, 1.0, u) * ry;
      arrow(g, x, cy + h * .68, x, cy - h * .68, p.cyan, k,
        (.06 + .19 * u) * gradientQ, .65, 4.2);
    }

    const sumMag = Math.hypot(sx, sy) / 40;
    const resultant = [sx / 40, sy / 40, 0];
    const R = vectorEnd(resultant, cx, cy, H * .17);
    arrow(g, cx, cy, R[0], R[1], p.accentLite, k, .50, 1.18, 6.0);

    const coilX = W * .79, coilY = H * .49;
    drawReceiveCoil(g, coilX, coilY, H * .065, H * .13, k, p.gold,
      step >= 3 ? .88 * enter : .24);
    drawReceiveTrace(g, W * .69, H * .665, W * .245, H * .072 * Math.max(.08, sumMag),
      carrier, k, step >= 3 ? p.accentLite : p.mid, step >= 3 ? .95 * enter : .52);

    if (step >= 2) {
      const kcx = W * .79, kcy = H * .275, kr = H * .084;
      line(g, kcx - kr, kcy, kcx + kr, kcy, p.hair, k, .58 * enter, .66);
      line(g, kcx, kcy - kr, kcx, kcy + kr, p.hair, k, .58 * enter, .66);
      g.save(); g.strokeStyle = rgba(p.violet, .66 * enter); g.lineWidth = .88 * k;
      g.beginPath(); g.moveTo(kcx - kr * .78, kcy); g.lineTo(kcx + kr * .78, kcy); g.stroke(); g.restore();
      const ku = .72 * Math.sin(t * .40);
      glowDot(g, kcx + ku * kr, kcy, 2.0 * k, p.violet, .92 * enter);
    }
  },
};

export const QUANTUM = {
  quantumOpening, hydrogenSpatial, spinSU2,
  qftSpinorExcitation, qftSpinorTransform, qftDoubleCover, qftNoetherWigner,
  qftBlochConstruct, qftZeemanProton, qftRfEnsemble,
  qftEnsembleRfBridge, qftBlochRelaxation, qftGradientEncoding,
};

/* Full-text / official-source record for deck notes and citation plumbing. */
export const QUANTUM_SOURCES = Object.freeze([
  {
    key: "tongqft",
    citation: "Tong D. Quantum Field Theory, §§4–5: The Dirac Equation and Quantizing the Dirac Field. Cambridge lecture notes.",
    doi: null,
    url: "https://www.damtp.cam.ac.uk/user/tong/qft.htm",
    supports: "Spinor fields transform in a representation of the Lorentz group; quantization produces fermionic one-particle states through creation operators.",
  },
  {
    key: "feynmanwaveparticle",
    citation: "Feynman RP, Leighton RB, Sands M. The Feynman Lectures on Physics, Vol. I, Ch. 38.",
    doi: null,
    url: "https://www.feynmanlectures.caltech.edu/I_38.html",
    supports: "Wave and particle descriptions are connected through amplitudes for localized events; a finite localized state has wavepacket extent.",
  },
  {
    key: "demikhovskii2010",
    citation: "Demikhovskii VY, Maksimova GM, Perov AA, Frolova EV. Space-time evolution of Dirac wave packets. Phys Rev A. 2010;82:052115.",
    doi: "10.1103/PhysRevA.82.052115",
    url: "https://arxiv.org/abs/1007.1566",
    supports: "Localized Dirac one-particle wave packets have evolving spatial probability and spin-density distributions rather than point-supported particle surfaces.",
  },
  {
    key: "hegerfeldt1974",
    citation: "Hegerfeldt GC. Remark on causality and particle localization. Phys Rev D. 1974;10:3320–3321.",
    doi: "10.1103/PhysRevD.10.3320",
    url: "https://journals.aps.org/prd/abstract/10.1103/PhysRevD.10.3320",
    supports: "Strict positive-energy localization in relativistic quantum theory has nontrivial causality constraints; the visual therefore uses a finite wavepacket with soft tails rather than a delta spike.",
  },
  {
    key: "wigner1939",
    citation: "Wigner E. On unitary representations of the inhomogeneous Lorentz group. Ann Math. 1939;40:149–204.",
    doi: "10.2307/1968551",
    url: "https://www.math.utoronto.ca/mgualt/courses/25-QM/docs/Wigner-1939.pdf",
    supports: "Quantum states transform by (projective) unitary representations of spacetime symmetries; spin is a representation label, not a classical surface motion.",
  },
  {
    key: "pauli1927",
    citation: "Pauli W. Zur Quantenmechanik des magnetischen Elektrons. Z Phys. 1927;43:601–623.",
    doi: "10.1007/BF01397326",
    url: "https://doi.org/10.1007/BF01397326",
    supports: "The spin-1/2 degree of freedom has two components; the Pauli matrices furnish its generators.",
  },
  {
    key: "nistHydrogen",
    citation: "NIST Digital Library of Mathematical Functions, §18.39(ii): A 3D separable quantum system, the hydrogen atom.",
    doi: null,
    url: "https://dlmf.nist.gov/18.39.ii",
    supports: "Exact Coulomb Schrödinger equation, separation ψ=RnlYlm, normalized radial functions and hydrogen energies used by the rendered 1s and 2p_z distributions.",
  },
  {
    key: "pdgProton2025",
    citation: "Particle Data Group. Proton listing. Review of Particle Physics 2024 with 2025 update.",
    doi: "10.1103/PhysRevD.110.030001",
    url: "https://pdg.lbl.gov/2025/listings/rpp2025-list-p.pdf",
    supports: "The proton has J^P=1/2+ and a finite measured charge radius; it is not literally a zero-dimensional elementary ball.",
  },
  {
    key: "bloch1946",
    citation: "Bloch F. Nuclear Induction. Phys Rev. 1946;70:460–474.",
    doi: "10.1103/PhysRev.70.460",
    url: "https://doi.org/10.1103/PhysRev.70.460",
    supports: "Nuclear magnetic moments form a bulk polarization in B0; RF produces transverse polarization and an observable induced voltage.",
  },
]);

/* Speaker-note-ready guardrails.  These are intentionally more explicit than the slide. */
export const QUANTUM_SPEAKER_NOTES = Object.freeze({
  0: "The Saddle Bloom is an aesthetic embedding of a connected field response, not literal spacetime, a particle surface or a string. The warm point is the source J(x). An exact local field insertion is distributional; a physical localized excitation is a smeared wavepacket. The spike therefore stages local preparation, extended response and decay without claiming that a particle peels off the manifold.",
  1: "Now pose the paradox, but correct its premise aloud: relativistic quantum field theory is a theory of fields and excitations, not a claim that every object is literally a zero-dimensional bead. An elementary excitation may be pointlike in an effective theory; the proton is composite and has a measured finite charge radius. Either way, a point has no classical surface whose motion could explain spin.",
  2: "The answer is symmetry. Under a spatial rotation the state is transformed by U(n,θ)=exp[−iθ n·σ/2], generated by J_i=ℏσ_i/2. This is the spin-1/2 representation of SU(2), the double cover of SO(3), and for a massive relativistic state it is the representation of the Poincaré little group. A 2π rotation changes a spinor's sign and 4π returns it; the isolated sign is a global phase, so physical content appears through relative phase. The Bloch sphere is a coordinate picture of a two-level state, not a drawing of a proton rotating in the room.",
  3: "Now separate position from spin. The rendered marks are deterministic samples from the exact nonrelativistic Coulomb probabilities: ψ_100∝exp(−r/a0) and ψ_210∝r exp(−r/2a0)cosθ. The 2p_z state is shown to make spatial structure and its nodal plane visible; it is an excited state, not the hydrogen ground state. Camera rotation reveals a stationary three-dimensional probability distribution. Do not call the marks little electrons or trajectories.",
  4: "The electron cloud and nuclear spin are different degrees of freedom. In water, isolated-hydrogen orbitals are replaced by molecular electronic states, so the atomic 1s image is a conceptual bridge, not a water electron-density calculation. Clinical proton MRI predominantly detects the magnetic moments of 1H nuclei—the protons—not the electronic position cloud. The scale comparison is also a warning: the proton is finite and composite, about 0.84 fm in charge radius, while a0 is about 5.29×10^−11 m.",
  5: "A voxel contains an enormous ensemble. Most nuclear magnetic moments cancel. B0 creates a minute Boltzmann population difference—of order 10^−5 at clinical field and body temperature—so the vector sum is a small longitudinal magnetization M0. Individual Bloch vectors encode spin-state expectations; Bloch's macroscopic M is the experimentally useful ensemble polarization. Neither requires a rigid proton sphere to rotate.",
});
