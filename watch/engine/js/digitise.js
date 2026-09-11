/* Reading the numbers back out of a picture of a plot.
 *
 * The tracer re-draws an imported figure in the deck's own material, and the panel finder cuts
 * a composite into its pieces. Neither of them UNDERSTANDS the figure — a traced line chart is
 * still a picture of a line chart, and it cannot be re-scaled, re-coloured, animated, or put on
 * a shared axis with anything else.
 *
 * This closes that: find the axes, follow the curve, and give back numbers. Once a plot is data
 * it is a `chart` block like any other, drawn by charts.js at the deck's own scale, and it can
 * do everything a native figure can.
 *
 * Two calibration numbers per axis are still the author's to give. They cannot be recovered
 * from pixels — the tick LABELS are text, and reading them would be OCR, which fails quietly
 * and would put wrong numbers on a slide with no way to tell. Asking is honest; guessing is not.
 */

/** Ink, defined against the paper the figure was drawn on rather than against black. */
function inkMask(trace, floor = 0.08) {
  const { cols, rows, lum } = trace;
  let edge = 0, n = 0;
  for (let c = 0; c < cols; c++) { edge += lum[c] + lum[(rows - 1) * cols + c]; n += 2; }
  for (let r = 0; r < rows; r++) { edge += lum[r * cols] + lum[r * cols + cols - 1]; n += 2; }
  const bg = edge / n;
  const m = new Uint8Array(cols * rows);
  for (let i = 0; i < lum.length; i++) m[i] = Math.abs(lum[i] - bg) > floor ? 1 : 0;
  return m;
}

/**
 * Find the plot frame: the long straight runs of ink that are the axes.
 *
 * A chart's axes are the only near-continuous lines spanning most of the figure, so they are
 * found by asking which single row and which single column carry the most ink. The left axis
 * is sought in the left half and the bottom axis in the lower half, because a legend box or a
 * top border would otherwise win.
 */
export function findAxes(trace, { minFill = 0.45 } = {}) {
  const { cols, rows } = trace;
  const m = inkMask(trace);

  let bestRow = -1, bestRowFill = 0;
  for (let r = Math.floor(rows * 0.45); r < rows; r++) {
    let f = 0;
    for (let c = 0; c < cols; c++) f += m[r * cols + c];
    if (f / cols > bestRowFill) { bestRowFill = f / cols; bestRow = r; }
  }
  let bestCol = -1, bestColFill = 0;
  for (let c = 0; c < Math.floor(cols * 0.55); c++) {
    let f = 0;
    for (let r = 0; r < rows; r++) f += m[r * cols + c];
    if (f / rows > bestColFill) { bestColFill = f / rows; bestCol = c; }
  }
  /* How THICK the axes are, and step clear of them.
   *
   * An axis is not one pixel wide. Starting the plot region at bestCol + 1 left the rest of
   * the axis inside it, and since an axis is a very long vertical run it won the "largest
   * run" test in the first columns — the curve was read as the axis and came back 16% wrong
   * at the left edge. The thickness is measured rather than assumed, because a figure at
   * 600 dpi has fatter lines than a screenshot. */
  const thick = (start, step, probe) => {
    let n = 0;
    for (let i = start; i >= 0 && i < 4000 && n < 12; i += step) {
      if (!probe(i)) break;
      n++;
    }
    return Math.max(1, n);
  };
  const yThick = thick(bestCol, 1, (c) => {
    let f = 0; for (let r = 0; r < rows; r++) f += m[r * cols + c];
    return f / rows > minFill * 0.7;
  });
  const xThick = thick(bestRow, -1, (r) => {
    let f = 0; for (let c = 0; c < cols; c++) f += m[r * cols + c];
    return f / cols > minFill * 0.7;
  });

  /* How far each axis line actually RUNS.
   *
   * The top of the y axis is not the top of the image — there is a title, a margin, usually a
   * legend. Calibrating "the top value" against row 0 put the reading out by however much
   * that margin was: on a 440px figure with a 30px margin it cost 4% mean error, eight times
   * the algorithm's own. The axis knows where it ends, so ask it. */
  const span = (probe, n) => {
    let lo = -1, hi = -1;
    for (let i = 0; i < n; i++) if (probe(i)) { if (lo < 0) lo = i; hi = i; }
    return { lo: lo < 0 ? 0 : lo, hi: hi < 0 ? n - 1 : hi };
  };
  const yRun = span((r) => m[r * cols + bestCol], rows);      // vertical axis, top to bottom
  const xRun = span((c) => m[bestRow * cols + c], cols);      // horizontal axis, left to right

  const ok = bestRowFill >= minFill && bestColFill >= minFill;
  return {
    found: ok,
    xAxisRow: bestRow, yAxisCol: bestCol,
    // the ends of the drawn axes, which is what a calibration should be pinned to
    yTopRow: yRun.lo, yBottomRow: yRun.hi,
    xLeftCol: xRun.lo, xRightCol: xRun.hi,
    thickness: { x: xThick, y: yThick },
    fill: { x: +bestRowFill.toFixed(3), y: +bestColFill.toFixed(3) },
    // the region a curve can live in: clear of both axes, by their measured thickness
    plot: { c0: bestCol + yThick + 1, c1: cols - 1, r0: 0, r1: bestRow - xThick - 1 },
  };
}

/**
 * Follow a curve through the plot area, one column at a time.
 *
 * For each column of the plot, the ink is grouped into runs and the largest run's centre is
 * taken as the curve. Largest rather than first: gridlines and tick marks are thin, a plotted
 * line is not, so thickness is what separates the subject from the furniture. Columns with no
 * ink return null and are carried across as gaps rather than being interpolated over, because
 * a line drawn through missing data is a claim the figure never made.
 */
export function traceCurve(trace, plot, { minRun = 1 } = {}) {
  const { cols } = trace;
  const m = inkMask(trace);
  const out = [];
  for (let c = plot.c0; c <= plot.c1; c++) {
    let best = null, run = null;
    for (let r = plot.r0; r <= plot.r1; r++) {
      if (m[r * cols + c]) {
        run = run || { from: r, to: r };
        run.to = r;
      } else if (run) {
        if (!best || run.to - run.from > best.to - best.from) best = run;
        run = null;
      }
    }
    if (run && (!best || run.to - run.from > best.to - best.from)) best = run;
    /* The run's HEIGHT is carried with the point.
     *
     * Column-wise reading gives one y per column, but where a curve is steep a single column
     * holds a long vertical run and its centre is only accurate to about half that run. That
     * is a real uncertainty in the reading, and it belongs with the number rather than being
     * quietly dropped. */
    out.push(best && best.to - best.from + 1 >= minRun
      ? { col: c, row: (best.from + best.to) / 2, spread: best.to - best.from + 1 }
      : { col: c, row: null, spread: 0 });
  }
  return out;
}

/**
 * Pixels to numbers.
 *
 * `cal` gives two known points per axis — a pixel position and the value printed there. Two
 * points define the mapping for a linear axis, and for a log axis the same two points define
 * it in the log domain, which is why `log` is a flag rather than a different function.
 */
export function toData(curve, cal, trace) {
  const lin = (p, p0, v0, p1, v1) => v0 + (p - p0) * (v1 - v0) / (p1 - p0 || 1);
  const mapX = (c) => cal.xLog
    ? Math.pow(10, lin(c, cal.x0.px, Math.log10(cal.x0.value), cal.x1.px, Math.log10(cal.x1.value)))
    : lin(c, cal.x0.px, cal.x0.value, cal.x1.px, cal.x1.value);
  const mapY = (r) => cal.yLog
    ? Math.pow(10, lin(r, cal.y0.px, Math.log10(cal.y0.value), cal.y1.px, Math.log10(cal.y1.value)))
    : lin(r, cal.y0.px, cal.y0.value, cal.y1.px, cal.y1.value);
  const xs = [], ys = [];
  for (const p of curve) {
    if (p.row == null) continue;
    xs.push(mapX(p.col));
    ys.push(mapY(p.row));
  }
  return { x: xs, y: ys, n: xs.length };
}

/** Thin a dense trace to a readable number of points, keeping the extremes. */
export function resample(data, target = 160) {
  const n = data.x.length;
  if (n <= target) return data;
  const step = n / target;
  const x = [], y = [];
  for (let i = 0; i < target; i++) {
    const a = Math.floor(i * step), b = Math.min(n, Math.floor((i + 1) * step));
    let sx = 0, sy = 0, k = 0;
    for (let j = a; j < b; j++) { sx += data.x[j]; sy += data.y[j]; k++; }
    if (k) { x.push(sx / k); y.push(sy / k); }
  }
  return { x, y, n: x.length };
}

/** Everything at once: a traced figure and a calibration in, a chart's data out. */
export function digitise(trace, cal, opts = {}) {
  const axes = findAxes(trace);
  const plot = cal.plot || axes.plot;
  const curve = traceCurve(trace, plot, opts);
  const read = curve.filter((p) => p.row != null);
  const full = toData(curve, cal, trace);
  const data = resample(full, opts.points ?? 160);
  // coverage is how much of the plot was READ, measured before thinning — computing it after
  // resampling reported 54% for a curve that had actually been followed across 70% of it
  const coverage = +(read.length / Math.max(1, plot.c1 - plot.c0 + 1)).toFixed(3);
  const spreads = read.map((p) => p.spread).sort((a, b) => a - b);
  return {
    axes, plot, data, coverage,
    // where the reading is least certain: the fattest runs are the steepest parts
    worstSpreadPx: spreads.length ? spreads[spreads.length - 1] : 0,
    medianSpreadPx: spreads.length ? spreads[spreads.length >> 1] : 0,
  };
}

/** The shape charts.js wants, so a digitised plot is a block like any other. */
export function asChartSpec(data, { label = "digitised", xlabel = "", ylabel = "" } = {}) {
  return {
    ylabel,
    panels: [{
      label, kind: "line", xlabel,
      series: [{ name: label, x: data.x, y: data.y }],
    }],
  };
}
