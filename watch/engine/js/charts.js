/* Figures from data.
 *
 * A presentation tool that can only show a picture of a chart makes you keep the chart
 * somewhere else. These are drawn from the numbers, in the deck's palette, at the deck's
 * scale — so a figure re-renders when the accent changes and stays sharp on any projector.
 *
 * Statistics are DECLARED, not invented. A panel plots the q or p it was given, and a test is
 * only run when the deck explicitly asks for one and is labelled with which test it was. A
 * figure that quietly computes its own significance is a figure that will eventually be wrong
 * in a way nobody can see.
 */
import { rampAt, cssVar } from "./field.js";
import { axes, trace } from "./figures.js";

const TAU = Math.PI * 2;
const sc = (k, v) => v * k;
const fontOf = (k, base = 11) => `500 ${Math.max(10, base * k).toFixed(1)}px ui-monospace, SFMono-Regular, monospace`;

export const CHART_KINDS = ["box", "violin", "bar", "line", "scatter", "strip"];

// ── summary statistics ───────────────────────────────────────────────────────
const sorted = (v) => [...v].sort((a, b) => a - b);
function quantile(s, q) {
  if (!s.length) return NaN;
  const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
}
export function summarise(values) {
  const s = sorted(values.filter((v) => Number.isFinite(v)));
  if (!s.length) return null;
  const q1 = quantile(s, 0.25), med = quantile(s, 0.5), q3 = quantile(s, 0.75);
  const iqr = q3 - q1;
  // Tukey whiskers: the furthest point still inside 1.5 IQR, not the fence itself
  const lo = s.find((v) => v >= q1 - 1.5 * iqr) ?? s[0];
  const hi = [...s].reverse().find((v) => v <= q3 + 1.5 * iqr) ?? s[s.length - 1];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, s.length - 1));
  return { n: s.length, min: s[0], max: s[s.length - 1], q1, med, q3, lo, hi, mean, sd, sorted: s };
}

/* A Gaussian KDE, for the violin outline. Silverman's rule for the bandwidth — good enough for
 * a shape on a slide, and it means the author does not have to choose one. */
function kde(s, at) {
  const n = s.length;
  const mean = s.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1)) || 1;
  const h = 1.06 * sd * Math.pow(n, -0.2) || 1;
  return at.map((x) => {
    let d = 0;
    for (const v of s) { const u = (x - v) / h; d += Math.exp(-0.5 * u * u); }
    return d / (n * h * Math.sqrt(TAU));
  });
}

// ── tests, only when asked ───────────────────────────────────────────────────
const erf = (x) => {                                  // Abramowitz & Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t
                 + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
};
const normP = (z) => 2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.SQRT2)));

export const TESTS = {
  /** Welch's t, which does not assume the two groups share a variance. */
  welch(a, b) {
    const A = summarise(a), B = summarise(b);
    const se = Math.sqrt(A.sd ** 2 / A.n + B.sd ** 2 / B.n);
    const t = (A.mean - B.mean) / se;
    // normal approximation to the t distribution; honest for n of this size, and labelled
    return { stat: t, p: normP(t), label: "Welch t (normal approx.)" };
  },
  /** Mann-Whitney U with a normal approximation and tie correction. */
  mw(a, b) {
    const all = [...a.map((v) => [v, 0]), ...b.map((v) => [v, 1])].sort((x, y) => x[0] - y[0]);
    const ranks = new Array(all.length);
    let i = 0;
    while (i < all.length) {
      let j = i;
      while (j + 1 < all.length && all[j + 1][0] === all[i][0]) j++;
      const r = (i + j + 2) / 2;
      for (let k = i; k <= j; k++) ranks[k] = r;
      i = j + 1;
    }
    let R1 = 0;
    all.forEach((row, k) => { if (row[1] === 0) R1 += ranks[k]; });
    const n1 = a.length, n2 = b.length;
    const U = R1 - n1 * (n1 + 1) / 2;
    const mu = n1 * n2 / 2, sd = Math.sqrt(n1 * n2 * (n1 + n2 + 1) / 12);
    return { stat: U, p: normP((U - mu) / sd), label: "Mann–Whitney U (normal approx.)" };
  },
};

/** How a q or p is written on a figure, and how many stars it earns. */
export function sigText(q) {
  if (q == null || !Number.isFinite(q)) return { text: "", stars: "" };
  const stars = q < 0.001 ? "***" : q < 0.01 ? "**" : q < 0.05 ? "*" : q < 0.1 ? "(~)" : "";
  const text = q < 0.001 ? "< .001" : `= ${q.toFixed(3)}`;
  return { text, stars };
}

// ── drawing ──────────────────────────────────────────────────────────────────
/* The groups come out of the FIELD'S OWN RAMP.
 *
 * Yellow against slate is what a journal figure uses, and on this background it looked like a
 * matplotlib export dropped onto the page — a cool blue is the one hue nothing else here has.
 * The ramp already runs from deep rust through clay to sand and cream, which is enough
 * separation for two groups and belongs to the deck. Sand against clay: clearly different at
 * the back of a room, and made of the same light as the dots behind them. */
const rgb = (e) => { const c = rampAt(e); return `${c[0] | 0},${c[1] | 0},${c[2] | 0}`; };
const GROUP_TONES = [0.92, 0.55];          // where each group sits on the ramp
/** A CSS colour at a given alpha, whether it arrived as #rgb, #rrggbb or rgb(). */
function withAlpha(c, a) {
  const h = String(c).trim();
  if (h[0] === "#") {
    const x = h.length === 4 ? h.slice(1).split("").map((d) => d + d).join("") : h.slice(1);
    const n = parseInt(x, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  return h.startsWith("rgb(") ? h.replace("rgb(", "rgba(").replace(")", `,${a})`) : h;
}

/**
 * How firmly a figure is drawn.
 *
 * The box outline, the whiskers and the axis were fixed at low alpha so the subjects inside
 * would carry the panel. On a dark page that turned out to be too quiet — the clay group's
 * outline dissolved into the background and the axis, at --hair, sits at 1.27:1 against the
 * page, which is not a line anyone can see across a room.
 *
 * So it is a choice rather than a constant. `white` draws the structure in the page's own
 * light instead of the group's colour, which keeps the two groups told apart by their dots
 * and their median while the boxes themselves stay quiet and uniform.
 */
export const BOX_LINES = {
  hairline: { box: 0.45, whisker: 0.34, axis: "--hair", white: false },
  firm:     { box: 0.78, whisker: 0.58, axis: "--lo",   white: false },
  solid:    { box: 1.00, whisker: 0.72, axis: "--lo",   white: false },
  white:    { box: 0.62, whisker: 0.42, axis: "--lo",   white: true  },
  outline:  { box: 0.90, whisker: 0.62, axis: "--mid",  white: true  },
};

/** Deterministic jitter, so the dots do not dance every frame. */
function jitter(i, n, width) {
  const s = Math.sin(i * 127.1 + n * 311.7) * 43758.545;
  return (s - Math.floor(s) - 0.5) * width;
}

/**
 * One panel: two or more groups on a categorical x, drawn as boxes, violins, bars or a strip.
 *
 * `box` is the default because it is the one that shows the data and the summary at once —
 * the individual points scattered over the quartiles, which is what a reader of a small-n
 * study actually needs to see.
 */
export function drawPanel(g, box, panel, opts = {}) {
  const k = opts.k ?? 1;
  const kind = panel.kind || opts.kind || "box";
  /* Two kinds of panel, and they are genuinely different shapes of data.
   *
   * `values` is grouped and categorical — HC against PPCS — and belongs in a box or a violin.
   * `series` is x against y, which is what a digitised plot gives back and what a line or a
   * scatter needs. They were listed in CHART_KINDS from the start but only the categorical
   * half was ever implemented, so a recovered curve had nowhere to go. */
  if (panel.series) return drawSeries(g, box, panel, { ...opts, k, kind });
  const hi = cssVar("--hi", "#F9F9F7"), lo = cssVar("--lo", "#6E6C64");
  const hair = cssVar("--hair", "#33322E"), accent = cssVar("--accent", "#D97757");
  const groups = panel.values.map(summarise).filter(Boolean);
  if (!groups.length) return;
  /* `firm` by default: the box keeps its group's own colour, drawn firmly enough to be seen.
   * The figure stays warm and of a piece with the deck, which `white` trades away for a
   * cleaner separation between structure and data. Either is one word in the block. */
  const LN = BOX_LINES[opts.lines || "firm"] || BOX_LINES.firm;

  /* One scale for every panel in the chart, unless told otherwise.
   *
   * Seven tissues each auto-scaled to their own range look comparable and are not — a box that
   * fills its panel in one column and one that hugs the floor in the next can be the same
   * number. Sharing the range is the honest default for a grid of the same measurement, and
   * the ticks are then drawn once, on the left, as the published figure does. */
  const all = (opts.range ? opts.range.all : panel.values.flat()).filter(Number.isFinite);
  let ymin = Math.min(...all), ymax = Math.max(...all);
  const pad = (ymax - ymin) * 0.18 || 1;
  ymin -= pad * 0.35; ymax += pad;                     // headroom for the bracket
  const Y = (v) => box.y + box.h - (v - ymin) / (ymax - ymin) * box.h;

  axes(g, box, { k, axisColour: cssVar(LN.axis, "#6E6C64") });
  const step = niceStep(ymax - ymin);
  if (opts.ticks !== false) {
    g.font = fontOf(k, 10); g.textAlign = "right"; g.textBaseline = "middle";
    for (let v = Math.ceil(ymin / step) * step; v <= ymax; v += step) {
      const py = Y(v);
      if (py < box.y - 1 || py > box.y + box.h + 1) continue;
      g.strokeStyle = hair; g.beginPath(); g.moveTo(box.x - 4 * k, py); g.lineTo(box.x, py); g.stroke();
      g.fillStyle = lo; g.fillText(fmt(v, step), box.x - 6 * k, py);
    }
  }

  const slot = box.w / groups.length;
  const bw = Math.min(slot * 0.46, 44 * k);

  groups.forEach((s, gi) => {
    const cx = box.x + slot * (gi + 0.5);
    const tone = GROUP_TONES[gi % GROUP_TONES.length];
    const colour = `rgb(${rgb(tone)})`;

    /* Points first, box second.
     *
     * The box is the summary and has to stay legible against a cloud of forty-six subjects —
     * drawn underneath, its median line and quartile edges are broken up by every dot that
     * crosses them. The data goes down, the summary goes over it, which is the order the
     * published figure uses and the order that keeps both readable. */
    if (opts.points !== false && kind !== "bar") {
      /* A subject is a dot of the same light as the background, with a soft halo — not a
       * marker with a hard black outline. The outline was what made these read as pasted in. */
      s.sorted.forEach((v, i) => {
        const x = cx + jitter(i, s.n + gi * 97, bw * 0.78);
        const y = Y(v);
        g.fillStyle = `rgba(${rgb(tone)},0.16)`;
        g.beginPath(); g.arc(x, y, 4.6 * k, 0, TAU); g.fill();
        g.fillStyle = `rgba(${rgb(tone)},0.92)`;
        g.beginPath(); g.arc(x, y, 2.1 * k, 0, TAU); g.fill();
      });
    }

    if (kind === "violin") {
      const at = []; const N = 48;
      for (let i = 0; i < N; i++) at.push(ymin + (ymax - ymin) * i / (N - 1));
      const d = kde(s.sorted, at), dmax = Math.max(...d) || 1;
      g.beginPath();
      at.forEach((v, i) => { const x = cx - d[i] / dmax * bw; i ? g.lineTo(x, Y(v)) : g.moveTo(x, Y(v)); });
      for (let i = at.length - 1; i >= 0; i--) g.lineTo(cx + d[i] / dmax * bw, Y(at[i]));
      g.closePath();
      g.fillStyle = colour; g.globalAlpha = 0.10; g.fill(); g.globalAlpha = 1;
      g.strokeStyle = colour; g.lineWidth = 1.4 * k; g.stroke();
    } else if (kind === "bar") {
      g.fillStyle = colour; g.globalAlpha = 0.32;
      g.fillRect(cx - bw / 2, Y(s.mean), bw, box.y + box.h - Y(s.mean));
      g.globalAlpha = 1;
      g.strokeStyle = colour; g.lineWidth = 1.4 * k;
      g.strokeRect(cx - bw / 2, Y(s.mean), bw, box.y + box.h - Y(s.mean));
      g.beginPath();                                    // mean +/- sd
      g.moveTo(cx, Y(s.mean - s.sd)); g.lineTo(cx, Y(s.mean + s.sd));
      g.moveTo(cx - bw * 0.22, Y(s.mean + s.sd)); g.lineTo(cx + bw * 0.22, Y(s.mean + s.sd));
      g.moveTo(cx - bw * 0.22, Y(s.mean - s.sd)); g.lineTo(cx + bw * 0.22, Y(s.mean - s.sd));
      g.stroke();
    } else if (kind === "box") {
      // whiskers first, behind the box, and quiet: they are the extent, not the finding
      g.strokeStyle = LN.white ? withAlpha(hi, LN.whisker) : `rgba(${rgb(tone)},${LN.whisker})`;
      g.lineWidth = Math.max(1, 1 * k);
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(cx, Y(s.hi)); g.lineTo(cx, Y(s.q3));
      g.moveTo(cx, Y(s.lo)); g.lineTo(cx, Y(s.q1));
      g.moveTo(cx - bw * 0.22, Y(s.hi)); g.lineTo(cx + bw * 0.22, Y(s.hi));
      g.moveTo(cx - bw * 0.22, Y(s.lo)); g.lineTo(cx + bw * 0.22, Y(s.lo));
      g.stroke();
      // a whisper of fill, so the box reads as a box without burying the subjects inside it
      g.fillStyle = colour; g.globalAlpha = 0.07;
      g.fillRect(cx - bw / 2, Y(s.q3), bw, Y(s.q1) - Y(s.q3));
      g.globalAlpha = 1;
      g.strokeStyle = LN.white ? withAlpha(hi, LN.box) : `rgba(${rgb(tone)},${LN.box})`;
      g.lineWidth = Math.max(1, (LN.white ? 1 : 1.15) * k);
      if (g.roundRect) {
        g.beginPath();
        g.roundRect(cx - bw / 2, Y(s.q3), bw, Y(s.q1) - Y(s.q3), 3 * k);
        g.stroke();
      } else g.strokeRect(cx - bw / 2, Y(s.q3), bw, Y(s.q1) - Y(s.q3));
      // the median is the only line here that carries weight
      g.strokeStyle = `rgb(${rgb(tone)})`; g.lineWidth = 2.2 * k; g.lineCap = "round";
      g.beginPath();
      g.moveTo(cx - bw / 2 + 1 * k, Y(s.med)); g.lineTo(cx + bw / 2 - 1 * k, Y(s.med));
      g.stroke();
    }

    g.fillStyle = lo; g.font = fontOf(k, 11);
    g.textAlign = "center"; g.textBaseline = "top";
    g.fillText(panel.groups?.[gi] ?? `g${gi + 1}`, cx, box.y + box.h + 6 * k);
  });

  // the significance bracket, spanning the two groups it refers to
  const q = panel.q ?? panel.p;
  if (groups.length === 2 && q != null) {
    const { text, stars } = sigText(q);
    /* The bracket sits above the data but never leaves its own panel. With a shared scale the
     * tall panels would otherwise push their label up into the titles — and a label that
     * drifts into the panel next door reads as belonging to the wrong comparison, which is
     * worse than a cramped one. */
    const wanted = Math.min(Y(groups[0].hi), Y(groups[1].hi)) - 16 * k;
    const top = Math.max(box.y + 13 * k, wanted);
    const x0 = box.x + slot * 0.5, x1 = box.x + slot * 1.5;
    /* Significant comparisons get the accent; the rest stay furniture. A bracket that shouts
     * equally loudly whatever it found is a bracket carrying no information. */
    g.strokeStyle = stars ? `color-mix(in srgb, ${accent} 70%, transparent)` : hair;
    g.lineWidth = Math.max(1, 1 * k);
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(x0, top + 5 * k); g.lineTo(x0, top); g.lineTo(x1, top); g.lineTo(x1, top + 5 * k);
    g.stroke();
    const label = `${panel.qLabel || "q"} ${text}${stars ? " " + stars : ""}`;
    g.fillStyle = stars ? accent : lo;
    g.textAlign = "center"; g.textBaseline = "bottom";
    let fs = 11.5 * k;
    for (; fs > 7; fs -= 0.3) {                       // must fit the panel, not the neighbour
      g.font = `500 ${Math.max(7, fs).toFixed(1)}px ui-monospace, SFMono-Regular, monospace`;
      if (g.measureText(label).width <= box.w * 0.96) break;
    }
    g.fillText(label, box.x + box.w / 2, top - 4 * k);
  }

  if (panel.label) {
    /* One size for every panel title, set by the longest of them.
     * Fitting each independently gives a row of headings at six different sizes, which reads
     * as carelessness rather than as a hierarchy. */
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.font = `500 ${(opts.titleSize ?? Math.max(10, 12.5 * k)).toFixed(1)}px ${cssVar("--sans", "system-ui")}`;
    g.fillStyle = hi;
    g.fillText(panel.label, box.x + box.w / 2, box.y - 10 * k);
  }
}

/**
 * An x-against-y panel: one or more series, as lines or as points.
 *
 * Shares the axes, the tick maths and the palette with the categorical panels, so a digitised
 * curve looks like everything else in the deck rather than like an import.
 */
export function drawSeries(g, box, panel, opts = {}) {
  const k = opts.k ?? 1;
  const kind = opts.kind || "line";
  const hi = cssVar("--hi", "#F9F9F7"), lo = cssVar("--lo", "#6E6C64");
  const hair = cssVar("--hair", "#33322E");
  const series = panel.series.filter((s) => s.x?.length);
  if (!series.length) return;

  const allX = series.flatMap((s) => s.x), allY = series.flatMap((s) => s.y);
  let x0 = panel.xlim?.[0] ?? Math.min(...allX), x1 = panel.xlim?.[1] ?? Math.max(...allX);
  let y0 = panel.ylim?.[0] ?? Math.min(...allY), y1 = panel.ylim?.[1] ?? Math.max(...allY);
  const padY = (y1 - y0) * 0.08 || 1;
  y0 -= padY; y1 += padY;
  const X = (v) => box.x + (v - x0) / (x1 - x0 || 1) * box.w;
  const Y = (v) => box.y + box.h - (v - y0) / (y1 - y0 || 1) * box.h;

  axes(g, box, { k, xlabel: panel.xlabel || "" });
  const stepY = niceStep(y1 - y0), stepX = niceStep(x1 - x0);
  g.font = fontOf(k, 10);
  g.textAlign = "right"; g.textBaseline = "middle"; g.fillStyle = lo;
  for (let v = Math.ceil(y0 / stepY) * stepY; v <= y1; v += stepY) {
    const py = Y(v);
    if (py < box.y - 1 || py > box.y + box.h + 1) continue;
    g.strokeStyle = hair; g.beginPath(); g.moveTo(box.x - 4 * k, py); g.lineTo(box.x, py); g.stroke();
    g.fillStyle = lo; g.fillText(fmt(v, stepY), box.x - 6 * k, py);
  }
  g.textAlign = "center"; g.textBaseline = "top";
  for (let v = Math.ceil(x0 / stepX) * stepX; v <= x1; v += stepX) {
    const px = X(v);
    if (px < box.x - 1 || px > box.x + box.w + 1) continue;
    g.strokeStyle = hair; g.beginPath(); g.moveTo(px, box.y + box.h); g.lineTo(px, box.y + box.h + 4 * k); g.stroke();
    g.fillStyle = lo; g.fillText(fmt(v, stepX), px, box.y + box.h + 6 * k);
  }

  series.forEach((sr, i) => {
    const c = rampAt(0.35 + i * 0.22);
    const colour = sr.colour || `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
    if (kind === "scatter") {
      g.fillStyle = colour;
      for (let j = 0; j < sr.x.length; j++) {
        g.beginPath(); g.arc(X(sr.x[j]), Y(sr.y[j]), sc(k, 2.2), 0, TAU); g.fill();
      }
    } else {
      g.strokeStyle = colour; g.lineWidth = sc(k, 2);
      g.lineJoin = g.lineCap = "round";
      g.beginPath();
      for (let j = 0; j < sr.x.length; j++) {
        const px = X(sr.x[j]), py = Y(sr.y[j]);
        j ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.stroke();
    }
    if (sr.name && series.length > 1) {
      g.fillStyle = colour; g.font = fontOf(k, 10);
      g.textAlign = "left"; g.textBaseline = "top";
      g.fillText(sr.name, box.x + 8 * k, box.y + 6 * k + i * 13 * k);
    }
  });

  if (panel.label) {
    g.fillStyle = hi;
    g.font = `500 ${(opts.titleSize ?? Math.max(10, 12.5 * k)).toFixed(1)}px ${cssVar("--sans", "system-ui")}`;
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.fillText(panel.label, box.x + box.w / 2, box.y - 10 * k);
  }
}

function niceStep(span) {
  const raw = span / 4.5;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
}
const fmt = (v, step) => {
  const dp = Math.max(0, Math.ceil(-Math.log10(step)));
  return v.toFixed(dp);
};

/**
 * A whole chart: one panel, or a grid of them sharing a y label.
 *
 * The grid is what makes this worth having — a seven-tissue comparison is one block and one
 * data file, not seven figures pasted next to each other and re-exported whenever a colour
 * changes.
 */
export function drawChart(g, W, H, spec, opts = {}) {
  const k = opts.k ?? 1;
  const all = spec.panels || [spec];

  /* The figure is a set of objects, so it can be taken apart on the way through.
   *
   * `reveal: "panels"` hands one panel per click — the seven-tissue comparison stops being a
   * wall to point at and becomes something you walk the room through. `focus` goes further and
   * gives the current panel the whole width, which is the version worth having when a single
   * comparison is the argument. Everything below is a layout knob rather than a rewrite,
   * because the numbers are already in the framework. */
  const shown = opts.reveal === "panels"
    ? Math.max(1, Math.min(all.length, (opts.step ?? 0) + 1)) : all.length;
  const focus = spec.focus === true || opts.focus;
  /* Step zero is already a meaningful state: the first comparison is present when the slide
   * arrives, and each click advances to the next one. Keeping zero and one on the same panel
   * made a presenter's first click appear broken and put a synchronized anatomy highlight one
   * state ahead of the data. */
  const at = Math.max(0, Math.min(all.length - 1, opts.step ?? 0));
  const panels = focus ? [all[at]] : all.slice(0, shown);

  /* Presentation knobs come from the BLOCK first, the data second.
   *
   * `gap` and `cols` say how the figure is laid out, not what it shows, so they belong to the
   * slide that presents it — otherwise widening the axis for one talk means editing the data
   * file, and the builder cannot offer it at all. The data may still carry a sensible default. */
  const cols = focus ? 1 : (opts.cols || spec.cols || Math.min(panels.length, 4));
  const rows = Math.ceil(panels.length / cols);
  const left = (spec.left ?? 54) * k, right = (spec.right ?? 12) * k;
  const top = (spec.top ?? 26) * k, bot = (spec.bottom ?? 34) * k;
  // `gap` widens the x axis: more air between comparisons, at the cost of narrower panels
  const gapX = (opts.gap ?? spec.gap ?? 20) * k, gapY = (opts.gapY ?? spec.gapY ?? 46) * k;
  let pw = (W - left - right - gapX * (cols - 1)) / cols;
  const ph = (H - top - bot - gapY * (rows - 1)) / rows;

  /* A panel is not made wider by having room.
   *
   * `focus` hands one comparison the whole slide, and with two groups that puts one box at a
   * quarter of the width and the other at three quarters with a void between them. It reads
   * as a figure coming apart rather than as a comparison being made. So a lone panel is
   * capped at a width that suits the number of groups it holds and centred in what is left.
   * A seven-panel grid is already far narrower than the cap and is untouched. */
  let originX = left;
  if (cols === 1) {
    const widest = Math.max(2, ...panels.map((p) => p?.values?.length || 2));
    const cap = (spec.maxPanel ?? 150) * k * widest;
    if (pw > cap) { originX = left + (pw - cap) / 2; pw = cap; }
  }

  /* Scale and title size are computed over EVERY panel, including the ones not yet revealed.
   * Otherwise the axis rescales and the headings resize as each panel arrives, and the figure
   * appears to be redrawing itself rather than being uncovered. */
  /* A series panel has no `values`, so the shared-range pass must not assume one. This threw
   * "Cannot read properties of undefined (reading 'flat')" and the whole chart came back as an
   * error card — sharing a y range is meaningful for grouped panels and not for x/y ones. */
  const shared = spec.shareY === false || all.some((p) => p.series)
    ? null
    : { all: all.flatMap((p) => (p.values || []).flat()) };
  let titleSize = Math.max(10, 12.5 * k);
  for (; titleSize > 8; titleSize -= 0.5) {
    g.font = `500 ${titleSize.toFixed(1)}px ${cssVar("--sans", "system-ui")}`;
    if (all.every((p) => !p.label || g.measureText(p.label).width <= pw * 0.98)) break;
  }
  panels.forEach((p, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    const fresh = opts.reveal === "panels" && i === shown - 1 ? (opts.ease ?? 1) : 1;
    g.save();
    g.globalAlpha = fresh;
    drawPanel(g, { x: originX + c * (pw + gapX), y: top + r * (ph + gapY), w: pw, h: ph },
              p, { ...opts, k, range: shared, ticks: !shared || c === 0, titleSize });
    g.restore();
  });

  if (spec.ylabel) {
    g.save();
    // beside the axis it labels, not pinned to the canvas edge — a centred lone panel would
    // otherwise leave its own label stranded a long way off to the left
    g.translate(Math.max(16 * k, originX - 44 * k), H / 2); g.rotate(-Math.PI / 2);
    g.fillStyle = cssVar("--mid", "#97958D");
    g.font = fontOf(k, 12);
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(spec.ylabel, 0, 0);
    g.restore();
  }
}

/** How many steps a chart consumes, so the deck can budget its clicks. */
export function chartSteps(spec, reveal) {
  if (reveal !== "panels" && !spec.focus) return 0;
  return Math.max(0, (spec.panels || [spec]).length - 1);
}

/** Run a declared test over a panel's two groups, and say which test it was. */
export function applyTest(panel, name) {
  const fn = TESTS[name];
  if (!fn || !panel.values || panel.values.length !== 2) return panel;
  const r = fn(panel.values[0], panel.values[1]);
  return { ...panel, p: r.p, qLabel: "p", testLabel: r.label };
}
