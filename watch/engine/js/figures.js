/* Native figures, drawn in the deck's own language.
 *
 * Nothing here is an imported image, and nothing here is a screenshot of a plot made
 * somewhere else. Every figure is built from the same twelve modes, the same warm ramp and
 * the same accent as the background, which is the only way a figure ever looks like it
 * belongs to the talk rather than having been pasted into it.
 *
 * The tracer kinetics are the real ones: an arterial input made of gamma variates, and
 * tissue that follows the Patlak model, C_t(t) = v_p·C_a(t) + K_i·∫C_a. The curves are
 * therefore consistent with each other and with the Patlak plot they produce — a figure
 * that lies about its own model is worse than no figure.
 */
import { vacuumModes, rampAt, cssVar } from "./field.js";
import { figureEditParts, hideFigureEditParts } from "./figure-edit-parts.js";
import { makePatlakSchematic } from "./patlak-schematic.js";
import { drawRepconEligibility } from "./repcon-eligibility.js";
const PATLAK_SCHEMATIC = makePatlakSchematic();

/* Sizes inside a figure, scaled to how big the figure actually came out.
 *
 * `k` is its width against a 640px reference. Text additionally has a floor in real pixels:
 * below about eleven it stops being a label and becomes texture, so a small figure drops to
 * a simpler drawing rather than carrying detail nobody in the room can resolve. */
const sc = (k, base) => base * k;
const ftxt = (k, base = 11) => Math.max(10.5, base * k);
const fontOf = (k, base = 11) => `500 ${ftxt(k, base).toFixed(1)}px ui-monospace, SFMono-Regular, monospace`;

const MODES = vacuumModes();
const TAU = Math.PI * 2;
const mix = (a, b, u) => a + (b - a) * u;
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const smooth = (v) => { const u = clamp01(v); return u * u * (3 - 2 * u); };
const RASTER_CACHE = new Map();
const raster = (src) => {
  if (!src || typeof Image === "undefined") return null;
  if (!RASTER_CACHE.has(src)) {
    const image = new Image();
    image.decoding = "async";
    image.src = src;
    RASTER_CACHE.set(src, image);
  }
  return RASTER_CACHE.get(src);
};

// ── the house plotting kit ───────────────────────────────────────────────────

/**
 * Seat a shape on the page so it reads as a form and not as a hole.
 *
 * A figure filled with the field sits on a slide that is ALSO filled with the field, and the
 * two are the same texture — so the silhouette disappears and the arteries look like a bare
 * tree floating in the dark. Laying the page colour down inside the shape first separates it,
 * and everything drawn after reads as being inside something.
 */
export function seat(g, path, { fill = 0.62, stroke = 0.55, width = 1.4 } = {}) {
  const page = cssVar("--page", "#20201F"), mid = cssVar("--mid", "#97958D");
  g.save();
  g.globalAlpha = fill; g.fillStyle = page; g.fill(path);
  g.globalAlpha = stroke; g.strokeStyle = mid; g.lineWidth = width; g.stroke(path);
  g.restore();
}

/** Field dots inside an arbitrary shape. This is what ties a figure to the background. */
export function fieldFill(g, path, box, t, { gap = 9, strength = 1 } = {}) {
  const { x, y, w, h } = box;
  for (let py = y + gap / 2; py < y + h; py += gap) {
    for (let px = x + gap / 2; px < x + w; px += gap) {
      if (path && !g.isPointInPath(path, px, py)) continue;
      let f = 0;
      for (const m of MODES) f += Math.cos(m.kx * px * 1.7 + m.ky * py * 1.7 - m.w * t + m.ph);
      f /= 3.464;
      const e = Math.min(1, Math.pow(Math.max(0, f * f * 1.6 * 1.45), 0.72));
      if (e < 0.05) continue;
      const c = rampAt(e);
      g.fillStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${(0.09 + 0.42 * e) * strength})`;
      g.beginPath(); g.arc(px, py, gap * 0.115 + gap * 0.055 * e * e, 0, TAU); g.fill();
    }
  }
}

/** Hairline axes with mono labels — the same furniture on every figure. */
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

// ── the kinetics ─────────────────────────────────────────────────────────────

/** A gamma variate — the standard shape for a bolus passing a point. */
function gamma(t, t0, alpha, beta) {
  if (t <= t0) return 0;
  const u = t - t0;
  return Math.pow(u, alpha) * Math.exp(-u / beta);
}

/**
 * The arterial input, as a double bolus with recirculation — the protocol the real data
 * uses. Normalised to peak 1 so every figure can share it.
 */
export function aif(n = 400, tmax = 600) {
  /* A first pass is NARROW — about fifteen seconds across at half maximum — and what follows
   * it is a distinct recirculation hump, not a shoulder. The earlier parameters had a mode
   * twelve seconds after onset and a hump that merged into the peak, which is why the curve
   * came out as a pair of blobs rather than the shape a bolus actually makes. A gamma variate
   * peaks at alpha*beta after onset, so a tall thin pass wants a large alpha and a small beta. */
  /* Each variate is normalised by its own peak, so the numbers below are the heights they
   * actually reach rather than raw gamma amplitudes — which is what made the first attempt's
   * tail 0.1% of the peak instead of the fifth of it the data shows. alpha and beta were
   * solved for a mode 12s after onset and a 15s width, not chosen by eye. */
  const first  = (t, t0) => gamma(t, t0, 3.7, 3.25) / 2.451e2;
  const recirc = (t, t0) => gamma(t, t0, 2.4, 9.20) / 1.525e2;
  const pass = (t, t0) => first(t, t0) + 0.30 * recirc(t, t0 + 14);
  const raw = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) * tmax;
    let c = 0.82 * pass(t, 30) + 1.00 * pass(t, 140);             // the double-bolus protocol
    // the tail the tracer leaves behind once a pass has gone through: rises over ~25s as it
    // mixes, then clears slowly
    const tail = (t0, amp, clear) =>
      t > t0 ? amp * (1 - Math.exp(-(t - t0) / 25)) * Math.exp(-(t - t0) / clear) : 0;
    c += tail(45, 0.17, 520) + tail(155, 0.20, 640);
    raw.push([t, Math.max(0, c)]);
  }
  const peak = Math.max(...raw.map((p) => p[1])) || 1;
  return raw.map(([t, c]) => [t, c / peak]);
}

/** Patlak tissue: a plasma term that follows the artery, plus an integral that only grows. */
export function tissue(ca, vp, ki) {
  const out = []; let acc = 0;
  for (let i = 0; i < ca.length; i++) {
    if (i) acc += (ca[i][1] + ca[i - 1][1]) / 2 * (ca[i][0] - ca[i - 1][0]);
    out.push([ca[i][0], vp * ca[i][1] + ki * acc]);
  }
  return out;
}

const norm = (pts, tmax, ymax) => pts.map(([t, c]) => [t / tmax, c / ymax]);

let DEFENSE_KINETICS=null,defenseKineticsPending=null;
function loadDefenseKinetics(url="decks/data/patient-parcels.json"){
  if(DEFENSE_KINETICS)return Promise.resolve(DEFENSE_KINETICS);
  if(defenseKineticsPending)return defenseKineticsPending;
  defenseKineticsPending=fetch(url).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();})
    .then(d=>(DEFENSE_KINETICS=d.curves||{})).catch(e=>{defenseKineticsPending=null;console.warn("defense kinetics: "+e.message);return null;});
  return defenseKineticsPending;
}

let REPCON_DEMOGRAPHICS=null,repconDemographicsPending=null;
function loadRepconDemographics(url="decks/data/repcon-demographics.json"){
  if(REPCON_DEMOGRAPHICS)return Promise.resolve(REPCON_DEMOGRAPHICS);
  if(repconDemographicsPending)return repconDemographicsPending;
  repconDemographicsPending=fetch(url).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();})
    .then(d=>(REPCON_DEMOGRAPHICS=d)).catch(e=>{repconDemographicsPending=null;console.warn("REPCon demographics: "+e.message);return null;});
  return repconDemographicsPending;
}

const finiteValues=(values=[])=>values.map(Number).filter(Number.isFinite);
const sampleMean=(values=[])=>{const x=finiteValues(values);return x.length?x.reduce((s,v)=>s+v,0)/x.length:NaN;};
const sampleSd=(values=[])=>{const x=finiteValues(values),m=sampleMean(x);return x.length>1?Math.sqrt(x.reduce((s,v)=>s+(v-m)**2,0)/(x.length-1)):0;};
const sampleQuantile=(values=[],q=.5)=>{
  const x=finiteValues(values).sort((a,b)=>a-b);if(!x.length)return NaN;
  const i=(x.length-1)*Math.max(0,Math.min(1,q)),lo=Math.floor(i),hi=Math.ceil(i);
  return lo===hi?x[lo]:mix(x[lo],x[hi],i-lo);
};
const kdeSeries=(values,min,max,steps=120,bandwidth=null)=>{
  const x=finiteValues(values);if(!x.length)return [];
  const sd=sampleSd(x),span=Math.max(1e-6,max-min);
  const bw=Math.max(span/80,Number(bandwidth)||1.06*Math.max(sd,span/40)*Math.pow(x.length,-.2));
  const inv=1/(x.length*bw*Math.sqrt(2*Math.PI)),out=[];
  for(let i=0;i<steps;i++){
    const at=mix(min,max,i/(steps-1));let d=0;
    for(const v of x){const z=(at-v)/bw;d+=Math.exp(-.5*z*z);}
    out.push([at,d*inv]);
  }
  return out;
};

function shadowSlab(g,x,y,w,h,k=1,radius=12){
  g.save();
  g.shadowColor="rgba(0,0,0,.92)";g.shadowBlur=26*k;g.shadowOffsetY=9*k;
  g.fillStyle="rgba(7,8,10,.86)";g.beginPath();g.roundRect(x,y,w,h,radius*k);g.fill();
  g.shadowColor="transparent";g.strokeStyle="rgba(255,255,255,.075)";g.lineWidth=Math.max(.65,.7*k);
  g.stroke();g.restore();
}

// A borderless wash for data-heavy full-page figures. It quiets the animated field without
// turning the figure into a card or drawing a visible rectangular container around it.
function softPageShadow(g,W,H){
  g.save();
  const radial=g.createRadialGradient(W*.50,H*.50,Math.min(W,H)*.08,W*.50,H*.50,Math.max(W,H)*.68);
  radial.addColorStop(0,"rgba(0,0,0,.55)");
  radial.addColorStop(.58,"rgba(0,0,0,.32)");
  radial.addColorStop(1,"rgba(0,0,0,.04)");
  g.fillStyle=radial;g.fillRect(0,0,W,H);g.restore();
}

function miniPerson(g,x,y,color,k=1,alpha=.82,{outline=false,scale=1}={}){
  const s=k*scale;
  g.save();g.globalAlpha=alpha;g.lineWidth=Math.max(.55,.72*s);g.lineCap="round";
  g.fillStyle=color;g.strokeStyle=color;
  g.beginPath();g.arc(x,y-2.9*s,1.35*s,0,TAU);
  outline?g.stroke():g.fill();
  g.beginPath();g.roundRect(x-1.65*s,y-.9*s,3.3*s,4.6*s,.7*s);
  outline?g.stroke():g.fill();
  g.beginPath();g.moveTo(x-.7*s,y+3.1*s);g.lineTo(x-1.05*s,y+6*s);
  g.moveTo(x+.7*s,y+3.1*s);g.lineTo(x+1.05*s,y+6*s);g.stroke();
  g.restore();
}

function densityOverlay(g,box,groups,{min,max,ticks=[],k=1,label="",bandwidth=null,people=true,alpha=1}={}){
  const hi=cssVar("--hi","#F9F9F7"),mid=cssVar("--mid","#97958D"),hair=cssVar("--hair","#33322E");
  const series=groups.map(group=>({...group,density:kdeSeries(group.values,min,max,140,group.bandwidth??bandwidth)}));
  const dmax=Math.max(1e-12,...series.flatMap(group=>group.density.map(p=>p[1])));
  const X=v=>box.x+(v-min)/(max-min)*box.w,Y=d=>box.y+box.h-d/dmax*box.h*.86;
  g.save();g.lineJoin="round";g.lineCap="round";
  for(const group of series){
    if(!group.density.length)continue;
    g.beginPath();g.moveTo(X(group.density[0][0]),box.y+box.h);
    for(const [v,d] of group.density)g.lineTo(X(v),Y(d));
    g.lineTo(X(group.density[group.density.length-1][0]),box.y+box.h);g.closePath();
    g.fillStyle=group.color;g.globalAlpha=(group.fillAlpha??.16)*alpha;g.fill();
    g.beginPath();g.moveTo(X(group.density[0][0]),Y(group.density[0][1]));
    for(const [v,d] of group.density)g.lineTo(X(v),Y(d));
    g.strokeStyle=group.color;g.globalAlpha=.96*alpha;g.lineWidth=Math.max(1.45,1.9*k);g.stroke();
    if(people){
      const occupied=new Map();
      for(const v of finiteValues(group.values).sort((a,b)=>a-b)){
        if(v<min||v>max)continue;
        const x=X(v),bin=Math.round((x-box.x)/Math.max(4*k,box.w/90));
        const level=occupied.get(bin)||0;occupied.set(bin,level+1);
        miniPerson(g,x,box.y+box.h-5*k-level*5.2*k,group.color,k,.50*alpha,{scale:.62});
      }
    }
  }
  g.globalAlpha=alpha;g.strokeStyle=mid;g.lineWidth=Math.max(.8,.9*k);
  g.beginPath();g.moveTo(box.x,box.y+box.h);g.lineTo(box.x+box.w,box.y+box.h);g.stroke();
  g.fillStyle=mid;g.textAlign="center";g.textBaseline="top";g.font=`500 ${Math.max(9,6.8*k).toFixed(1)}px ui-monospace, SFMono-Regular, monospace`;
  for(const [v,text] of ticks){const x=X(v);g.strokeStyle=hair;g.beginPath();g.moveTo(x,box.y+box.h);g.lineTo(x,box.y+box.h+4*k);g.stroke();g.fillText(text,x,box.y+box.h+6*k);}
  if(label){g.fillStyle=mid;g.font=`500 ${Math.max(9,7*k).toFixed(1)}px ui-monospace, SFMono-Regular, monospace`;g.fillText(label,box.x+box.w/2,box.y+box.h+22*k);}
  g.restore();
}

// ── shapes ───────────────────────────────────────────────────────────────────

/**
 * A sagittal brain, authored rather than traced from anything: cerebrum, cerebellum and
 * brainstem as three bezier blobs in a 100x82 space, so it scales to any figure.
 */
export function brainPath(sx, sy, S) {
  const P = new Path2D();
  const X = (u) => sx + u / 100 * S, Y = (v) => sy + v / 100 * S;
  /* Cerebrum. The profile that makes it read as a brain rather than a balloon is the
   * INFERIOR surface: a temporal lobe hanging forward-down at the lower left, and a notch
   * where the occipital lobe sits over the cerebellum. A closed oval has neither. */
  P.moveTo(X(12), Y(44));
  P.bezierCurveTo(X(12), Y(25), X(27), Y(9),  X(47), Y(8));    // frontal pole → vertex
  P.bezierCurveTo(X(70), Y(7),  X(88), Y(19), X(89), Y(37));   // vertex → parietal
  P.bezierCurveTo(X(90), Y(50), X(84), Y(59), X(75), Y(62));   // occipital, sloping down
  P.bezierCurveTo(X(67), Y(65), X(60), Y(61), X(54), Y(64));   // the notch over the cerebellum
  P.bezierCurveTo(X(47), Y(68), X(42), Y(72), X(33), Y(69));   // temporal lobe, hanging
  P.bezierCurveTo(X(21), Y(66), X(12), Y(57), X(12), Y(44));
  P.closePath();
  // cerebellum, tucked in under the occipital rather than floating beside it
  P.moveTo(X(64), Y(63));
  P.bezierCurveTo(X(75), Y(62), X(84), Y(67), X(84), Y(73));
  P.bezierCurveTo(X(84), Y(80), X(75), Y(84), X(67), Y(81));
  P.bezierCurveTo(X(61), Y(78), X(58), Y(66), X(64), Y(63));
  P.closePath();
  // brainstem — short, and angled back as it descends, the way it actually leaves the skull
  P.moveTo(X(45), Y(63));
  P.bezierCurveTo(X(50), Y(70), X(53), Y(78), X(53), Y(87));
  P.lineTo(X(45), Y(87));
  P.bezierCurveTo(X(45), Y(78), X(42), Y(70), X(39), Y(64));
  P.closePath();
  return P;
}

/** The arteries, as polylines in the same 100-space: internal carotid up the stem, then
 *  the anterior and middle cerebral branches. The bolus travels along these. */
export function arteries(sx, sy, S) {
  const X = (u) => sx + u / 100 * S, Y = (v) => sy + v / 100 * S;
  const curve = (pts) => {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      for (let k = 0; k < 14; k++) {
        const u = k / 14;
        // a little sag, so vessels look drawn by a hand and not by a router
        const mx = (x0 + x1) / 2 + (y1 - y0) * 0.10, my = (y0 + y1) / 2 - (x1 - x0) * 0.10;
        const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
        out.push([X(a * x0 + b * mx + c * x1), Y(a * y0 + b * my + c * y1)]);
      }
    }
    out.push([X(pts[pts.length - 1][0]), Y(pts[pts.length - 1][1])]);
    return out;
  };
  return {
    // up the brainstem to the circle of Willis, then the three territories
    ica: curve([[49, 96], [49, 86], [47, 76], [45, 68], [44, 58]]),
    aca: curve([[44, 58], [37, 49], [29, 37], [24, 26], [27, 16]]),
    mca: curve([[44, 58], [53, 51], [63, 42], [72, 33], [78, 23]]),
    pca: curve([[44, 58], [55, 59], [66, 61], [74, 65], [79, 72]]),
  };
}

/** Walk a polyline by arc length, 0..1. */
function along(poly, u) {
  let total = 0; const seg = [];
  for (let i = 1; i < poly.length; i++) {
    const d = Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
    seg.push(d); total += d;
  }
  let want = Math.max(0, Math.min(1, u)) * total, acc = 0;
  for (let i = 0; i < seg.length; i++) {
    if (acc + seg[i] >= want) {
      const f = seg[i] ? (want - acc) / seg[i] : 0;
      return [poly[i][0] + (poly[i + 1][0] - poly[i][0]) * f,
              poly[i][1] + (poly[i + 1][1] - poly[i][1]) * f];
    }
    acc += seg[i];
  }
  return poly[poly.length - 1];
}

/**
 * A vessel, with a bright bolus somewhere along it.
 *
 * The vessel is ONE stroke at a constant width. Drawing it segment by segment with a varying
 * width — which is what the bolus wants — produces a lumpy tube with a visible seam at every
 * joint, because each segment gets its own round cap. So the bolus is painted instead as a
 * gradient along a sub-path: the window of the vessel it currently occupies, stroked once,
 * with the brightness ramp running through it. One stroke, no seams, and the head still
 * fades in and out along its length.
 */
function vessel(g, poly, { width = 3.4, head = null, conc = 0, dim = 0.42 }) {
  const acc = cssVar("--accent", "#D97757");
  g.save();
  g.lineJoin = g.lineCap = "round";
  g.strokeStyle = acc; g.globalAlpha = dim; g.lineWidth = width;
  g.beginPath(); g.moveTo(poly[0][0], poly[0][1]);
  for (const p of poly) g.lineTo(p[0], p[1]);
  g.stroke(); g.globalAlpha = 1;

  if (head != null && conc > 0.01 && head > -0.2 && head < 1.2) {
    const n = poly.length, half = 0.13;
    const i0 = Math.max(0, Math.round((head - half) * (n - 1)));
    const i1 = Math.min(n - 1, Math.round((head + half) * (n - 1)));
    if (i1 > i0 + 1) {
      const a = poly[i0], b = poly[i1];
      const grad = g.createLinearGradient(a[0], a[1], b[0], b[1]);
      const lit = rampAt(Math.min(1, 0.55 + 0.45 * conc));
      const rgb = `${lit[0] | 0},${lit[1] | 0},${lit[2] | 0}`;
      grad.addColorStop(0, `rgba(${rgb},0)`);
      grad.addColorStop(0.5, `rgba(${rgb},${Math.min(1, conc)})`);
      grad.addColorStop(1, `rgba(${rgb},0)`);
      g.strokeStyle = grad;
      g.lineWidth = width * 1.35;
      g.beginPath();
      g.moveTo(poly[i0][0], poly[i0][1]);
      for (let i = i0; i <= i1; i++) g.lineTo(poly[i][0], poly[i][1]);
      g.stroke();
    }
  }
  g.restore();
}

/** A coloured vessel for the venous side of a circuit. `vessel` deliberately speaks in the
 * deck accent because most anatomy scenes only need arteries; the input/output figure needs
 * artery and vein to remain distinguishable from the back row, so it supplies the colour. */
function colouredVessel(g, poly, { color, width = 3.4, head = null, alpha = 0.6 } = {}) {
  g.save();
  g.lineJoin = g.lineCap = "round";
  g.strokeStyle = color; g.globalAlpha = alpha; g.lineWidth = width;
  g.beginPath(); g.moveTo(poly[0][0], poly[0][1]);
  for (const p of poly) g.lineTo(p[0], p[1]);
  g.stroke();
  if (head != null && head > -0.08 && head < 1.08) {
    const q = along(poly, head);
    g.globalAlpha = Math.min(1, alpha + 0.28);
    g.fillStyle = color;
    g.shadowColor = color; g.shadowBlur = width * 2.8;
    g.beginPath(); g.arc(q[0], q[1], width * 1.15, 0, TAU); g.fill();
  }
  g.restore();
}

/** One quiet scientific leader with an arrowhead. Curves, not boxes, carry the eye through a
 * physiological circuit; a small travelling bead makes direction visible without a caption. */
function leader(g, from, via, to, { color, alpha = 0.58, bead = null, k = 1 } = {}) {
  g.save();
  g.strokeStyle = color; g.fillStyle = color; g.globalAlpha = alpha;
  g.lineWidth = Math.max(1, 1.15 * k); g.setLineDash([3 * k, 5 * k]);
  g.beginPath(); g.moveTo(from[0], from[1]);
  g.quadraticCurveTo(via[0], via[1], to[0], to[1]); g.stroke();
  g.setLineDash([]);
  const ang = Math.atan2(to[1] - via[1], to[0] - via[0]);
  const ah = 7 * k;
  g.beginPath(); g.moveTo(to[0], to[1]);
  g.lineTo(to[0] - ah * Math.cos(ang - 0.42), to[1] - ah * Math.sin(ang - 0.42));
  g.lineTo(to[0] - ah * Math.cos(ang + 0.42), to[1] - ah * Math.sin(ang + 0.42));
  g.closePath(); g.fill();
  if (bead != null) {
    const u = Math.max(0, Math.min(1, bead));
    const om = 1 - u;
    const x = om * om * from[0] + 2 * om * u * via[0] + u * u * to[0];
    const y = om * om * from[1] + 2 * om * u * via[1] + u * u * to[1];
    g.globalAlpha = Math.min(1, alpha + 0.3);
    g.beginPath(); g.arc(x, y, 2.6 * k, 0, TAU); g.fill();
  }
  g.restore();
}

/** A delayed, dispersed vascular output computed from the arterial input. */
function vascularOutput(ca, delaySeconds = 18, dispersionSeconds = 18) {
  const dt = ca.length > 1 ? ca[1][0] - ca[0][0] : 1;
  const lag = Math.max(0, Math.round(delaySeconds / dt));
  const out = ca.map(([time]) => [time, 0]);
  let state = 0;
  const retain = Math.exp(-dt / Math.max(dt, dispersionSeconds));
  for (let i = 0; i < ca.length; i++) {
    const input = i >= lag ? ca[i - lag][1] : 0;
    state = state * retain + input * (1 - retain);
    out[i][1] = state;
  }
  const peak = Math.max(...out.map((p) => p[1])) || 1;
  return out.map(([time, c]) => [time, c / peak]);
}

const hash01 = (x, y, seed = 0) => {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
};


// ── the figures ──────────────────────────────────────────────────────────────

export const FIGURES = {
  /** A bolus passing through a vessel, with the concentration it produces built underneath. */
  /**
   * A bolus passing a detector, and the curve that detector records.
   *
   * The old version was a sine squiggle with a smear of gradient sliding along it, and a
   * hardcoded gamma curve underneath that had nothing to do with the thing above it — the
   * figure asserted a shape rather than showing where it comes from.
   *
   * Now the packet DISPERSES as it travels, which is the actual physics: a tight injection
   * spreads as it goes, its peak falls, and its tail lengthens. A detector partway along
   * records concentration against time, and the gamma-variate shape everything else in this
   * deck is built on simply falls out of it. That is worth a figure; a decorated squiggle
   * is not.
   */
  bolus: {
    aspect: 1.85,
    loop: true,
    draw(g, W, H, t, a = {}) {
      const k = a.k ?? 1;
      const acc = cssVar("--accent", "#D97757"), lo = cssVar("--lo", "#6E6C64");
      const hi = cssVar("--hi", "#F9F9F7"), hair = cssVar("--hair", "#33322E");

      const x0 = W * 0.07, x1 = W * 0.95, vy = H * 0.22;
      const CYCLE = 9.0;                       // seconds for one pass
      // the head runs past the far end, so the tail and its recirculation clear too
      const u = (t % CYCLE) / CYCLE * 1.75;
      const DET = 0.62;                        // where the detector sits, as a fraction

      /* A bolus is a COMET, not a blob.
       *
       * A gaussian packet observed at a fixed point comes back almost symmetric in time —
       * measured, rise 0.104 against fall 0.116 — which is a bell curve, not a bolus. Even
       * proper advection-dispersion only reaches 1.2x. The long tail of a real first pass
       * comes from the spread of transit times through the bed upstream, which is exactly
       * why a gamma variate is the standard model for one.
       *
       * So the packet has a sharp LEADING edge and a trailing tail that lengthens as it
       * travels, and a weaker, broader recirculation follows it round. Measured on this
       * profile: rise 0.096, fall 0.188 — 1.96x skew — with a recirculation hump at 25% of
       * peak, which is the shape the real data shows.
       */
      const A = 2.0;
      const norm = 1 / Math.exp(A * Math.log(A) - A);
      const prof = (d, sp) =>
        d < 0 ? 0 : Math.pow(d / sp, A) * Math.exp(-d / sp) * (norm / sp);
      const spread = (trav) => 0.030 + 0.055 * Math.sqrt(Math.max(0, trav));
      const conc = (p, h) =>
        prof(h - p, spread(h)) + 0.40 * prof(h - p - 0.42, spread(h) * 1.7);

      // the vessel: one tapering tube, drawn as segments coloured by what is in them
      const N = 150;
      const wide = H * 0.085, narrow = H * 0.042;
      g.lineCap = "round";
      for (let i = 0; i < N; i++) {
        const p = i / (N - 1), pn = (i + 1) / (N - 1);
        const wpx = wide + (narrow - wide) * p;
        const c = Math.min(1, conc(p, u));
        const col = rampAt(Math.min(1, 0.10 + 0.9 * c));
        g.strokeStyle = c > 0.02
          ? `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${0.30 + 0.68 * c})`
          : `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},0.22)`;
        g.lineWidth = wpx;
        g.beginPath();
        g.moveTo(x0 + (x1 - x0) * p, vy);
        g.lineTo(x0 + (x1 - x0) * pn, vy);
        g.stroke();
      }

      // the detector, and a dropped line to the curve it produces
      const dx = x0 + (x1 - x0) * DET;
      g.strokeStyle = hair; g.lineWidth = Math.max(1, k);
      g.setLineDash([3 * k, 4 * k]);
      g.beginPath(); g.moveTo(dx, vy + wide * 0.8); g.lineTo(dx, H * 0.46); g.stroke();
      g.setLineDash([]);
      g.fillStyle = lo; g.font = fontOf(k, 10.5);
      g.textAlign = "center"; g.textBaseline = "bottom";
      g.fillText("detector", dx, vy - wide * 0.9);
      g.textAlign = "left";
      g.fillText("injection", x0, vy - wide * 0.9);

      /* What that detector records, as a function of time — computed from the SAME
       * dispersion, so the curve is a consequence of the picture above rather than a
       * separate assertion about it. */
      const box = { x: W * 0.11, y: H * 0.50, w: W * 0.84, h: H * 0.33 };
      axes(g, box, { k, xlabel: "time at the detector" });
      const pts = [];
      let peak = 0;
      for (let i = 0; i <= 260; i++) {
        const tt = i / 260 * 1.75;
        const v = conc(DET, tt);
        peak = Math.max(peak, v);
        pts.push([tt, v]);
      }
      for (const q of pts) { q[0] /= 1.75; q[1] /= peak || 1; }
      trace(g, box, pts, { color: acc, width: sc(k, 2.2),
                           upto: Math.min(1, u / 1.75), head: true, glow: 0.9 });

      // and the reading right now, marked on the curve
      const nowY = box.y + box.h - (conc(DET, u) / (peak || 1)) * box.h;
      g.fillStyle = hi;
      g.beginPath();
      g.arc(box.x + box.w * Math.min(1, u / 1.75), nowY, sc(k, 3), 0, TAU);
      g.fill();
    },
  },

  /** The input function alone, drawing itself in — the double-bolus protocol. */
  aif: {
    aspect: 1.9,
    draw(g, W, H, t, a = {}) {
      const k = a.k ?? 1;
      const acc = cssVar("--accent", "#D97757");
      const box = { x: W * 0.12, y: H * 0.10, w: W * 0.82, h: H * 0.70 };
      axes(g, box, { k, xlabel: "time (s)", ylabel: "C_a (mM)",
                     xticks: [[0, "0"], [0.33, "200"], [0.67, "400"], [1, "600"]],
                     yticks: [[0, "0"], [0.5, "1.2"], [1, "2.4"]] });
      const ca = aif();
      trace(g, box, norm(ca, 600, 1), { color: acc, width: sc(k, 2.4),
                                        upto: Math.min(1, t / 1.05), head: true, glow: 0.8 });
    },
  },

  /**
   * The pedagogical route into Patlak: null model -> vascular term -> retained term -> line.
   * The equation itself stays in KaTeX below this scene; the animation answers the physical
   * question each algebraic state asks instead of turning the canvas into typeset text.
   */
  patlakStory: {
    aspect: 2.75,
    loop: true,
    revealSteps: 6,
    minWidth: 680,
    draw(g, W, H, t, a = {}) {
      const k = a.k ?? 1, step = Math.max(0, Math.round(Number(a._step ?? 0) || 0));
      const ease = Math.min(1, Math.max(0, Number(a._stepElapsed ?? 0)) / 0.58);
      const acc = cssVar("--accent", "#D97757"), hi = cssVar("--hi", "#F9F9F7");
      const mid = cssVar("--mid", "#97958D"), vein = a.veinColor || "#6FB8C8";
      const ca = aif(180, 600), ct = tissue(ca, 0.44, 0.049 / 60);
      const caN = norm(ca, 600, 1);
      // Keep vascular-only and full tissue curves on one scale. Normalising each to its own
      // peak falsely turns retention into a taller first pass; Patlak information is in the
      // late tail after plasma concentration has fallen.
      const commonMax = Math.max(...ca.map((p) => p[1])) || 1;
      const vascularN = ca.map((p) => [p[0] / 600, p[1] * 0.44 / commonMax]);
      const ctN = ct.map((p) => [p[0] / 600, p[1] / commonMax]);
      const left = { x: W * 0.055, y: H * 0.27, w: W * 0.23, h: H * 0.48 };
      const right = { x: W * 0.715, y: H * 0.27, w: W * 0.23, h: H * 0.48 };
      const vx = W * 0.50, vy = H * 0.51, vr = H * 0.245;

      axes(g, left, { k: Math.max(k, 0.86), xlabel: "time", ylabel: "Cₐ(t)",
                       axisColour: mid, labelColour: mid });
      trace(g, left, caN, { color: acc, width: Math.max(2, 2.25 * k), glow: 0.65 });

      // The voxel is a measured volume, not a mysterious black box.
      g.save();
      g.strokeStyle = hi; g.globalAlpha = 0.58; g.lineWidth = 1.2 * k;
      g.strokeRect(vx - vr, vy - vr, vr * 2, vr * 2);
      g.fillStyle = cssVar("--page", "#20201F"); g.globalAlpha = 0.56;
      g.fillRect(vx - vr, vy - vr, vr * 2, vr * 2);
      // A capillary crosses the voxel; in the null model it is only a transparent guide.
      const vesselAlpha = step === 0 ? 0.16 : 0.84;
      const grad = g.createLinearGradient(vx - vr * 0.85, vy, vx + vr * 0.85, vy);
      grad.addColorStop(0, acc); grad.addColorStop(1, vein);
      g.strokeStyle = grad; g.globalAlpha = vesselAlpha; g.lineCap = "round";
      g.lineWidth = (step < 1 ? 2.0 : 8.0) * k;
      g.beginPath(); g.moveTo(vx - vr * 0.86, vy); g.bezierCurveTo(vx - vr * 0.28, vy - vr * 0.18,
        vx + vr * 0.22, vy + vr * 0.15, vx + vr * 0.86, vy); g.stroke();

      // The bolus particles physically cross the volume. Retained dots appear only when Ki
      // enters the model and remain while fresh particles continue through the vessel.
      const phase = (t * 0.18) % 1;
      for (let i = 0; i < 7; i++) {
        const u = (phase + i / 7) % 1, x = mix(vx - vr * 1.42, vx + vr * 1.42, u),
          // Match the exact cubic drawn above.  The previous sine used screen-y with the
          // opposite sign, so particles dipped where the vessel rose and vice versa.
          vesselU=Math.max(0,Math.min(1,(x-(vx-vr*.86))/(vr*1.72))),one=1-vesselU,
          y=vy+3*one*one*vesselU*(-vr*.18)+3*one*vesselU*vesselU*(vr*.15);
        const inside = x > vx - vr && x < vx + vr;
        g.fillStyle = u < 0.5 ? acc : vein; g.globalAlpha = inside ? 0.98 : 0.58;
        g.beginPath(); g.arc(x, y, 2.2 * k, 0, TAU); g.fill();
      }
      if (step >= 2) {
        const retainAlpha = step === 2 ? ease : 1;
        for (let i = 0; i < 64; i++) {
          /* Start every retained particle on the capillary wall and let it spread into
           * the surrounding tissue.  A uniform square cloud reads as decoration; this
           * radial construction makes the blood-to-tissue transfer explicit. */
          const u = .15 + .70 * hash01(i, 4, 2);
          const one = 1 - u;
          const vesselX = mix(vx - vr * .86, vx + vr * .86, u);
          const vesselY = vy + 3 * one * one * u * (-vr * .18)
            + 3 * one * u * u * (vr * .15);
          const side = hash01(i, 7, 5) > .5 ? 1 : -1;
          const spread = (8 + Math.pow(hash01(i, 8, 9), .72) * vr * .54) * retainAlpha;
          const tangent = (hash01(i, 11, 3) - .5) * vr * .20 * retainAlpha;
          const x = vesselX + tangent;
          const y = vesselY + side * spread;
          const c = rampAt(0.30 + 0.58 * hash01(i, 8, 9));
          g.fillStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${0.18 + 0.52 * retainAlpha})`;
          g.beginPath(); g.arc(x, y, (0.8 + hash01(i, 2, 1)) * k, 0, TAU); g.fill();
          if (i % 8 === 0) {
            g.strokeStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${.10 * retainAlpha})`;
            g.lineWidth = Math.max(.55, .65 * k); g.beginPath();
            g.moveTo(vesselX, vesselY); g.lineTo(x, y); g.stroke();
          }
        }
      }
      g.restore();

      // Input and output arrows remain visible, so every model state answers the same
      // question: what did the tissue do to the signal that entered?
      g.save(); g.strokeStyle = mid; g.globalAlpha = 0.52; g.lineWidth = 1.1 * k;
      g.beginPath(); g.moveTo(left.x + left.w + 9 * k, vy); g.lineTo(vx - vr - 9 * k, vy); g.stroke();
      g.beginPath(); g.moveTo(vx + vr + 9 * k, vy); g.lineTo(right.x - 9 * k, vy); g.stroke();
      g.restore();

      if (step < 6) {
        axes(g, right, { k: Math.max(k, 0.86), xlabel: "time", ylabel: "Cₜ(t)",
                         axisColour: mid, labelColour: mid });
        const rows = step === 0 ? caN
          : step === 1 ? vascularN
          : ctN;
        trace(g, right, rows, { color: step < 2 ? acc : hi,
          width: Math.max(2, 2.25 * k), glow: 0.58 });
        if (step >= 2) {
          // Mark the late window where the retained amount separates Ct from the vanishing
          // instantaneous blood term; this is the physical basis for the linearisation.
          const x0 = right.x + right.w * 0.48;
          g.fillStyle = `color-mix(in srgb, ${acc} ${step === 2 ? 13 : 7}%, transparent)`;
          g.fillRect(x0, right.y, right.x + right.w - x0, right.h);
          g.font = fontOf(Math.max(k, .85), 9.5); g.fillStyle = acc; g.globalAlpha = .86;
          g.textAlign = "left"; g.textBaseline = "top"; g.fillText("late tail", x0 + 5*k, right.y + 5*k);
          g.globalAlpha = 1;
        }
      } else {
        g.fillStyle = "rgba(18,18,17,0.58)"; g.fillRect(right.x, right.y, right.w, right.h);
        axes(g, right, { k: Math.max(k, 0.86), xlabel: "∫Cₐ / Cₐ", ylabel: "Cₜ / Cₐ",
                         axisColour: mid, labelColour: hi });
        /* The plotted relation is exactly linear.  Time is encoded by luminance and
         * size—not by bending the early samples into a decorative hook. */
        const pts = Array.from({ length: 30 }, (_, i) => {
          const x = .035 + .93 * i / 29;
          return [x, .16 + .70 * x];
        });
        pts.forEach((p, i) => {
          const late = i / (pts.length - 1);
          const c = rampAt(.20 + .78 * late);
          g.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
          g.globalAlpha = .30 + .70 * late;
          g.beginPath(); g.arc(right.x + p[0] * right.w,
            right.y + right.h - p[1] * right.h, (1.45 + 1.15 * late) * k, 0, TAU); g.fill();
        });
        g.globalAlpha = 1; g.strokeStyle = hi; g.lineWidth = 2.1 * k;
        g.beginPath();
        g.moveTo(right.x + right.w * .035, right.y + right.h - (.16 + .70 * .035) * right.h);
        g.lineTo(right.x + right.w * .965, right.y + right.h - (.16 + .70 * .965) * right.h);
        g.stroke();
        g.font = fontOf(Math.max(k, .86), 8.8); g.textAlign = "center";
        g.fillStyle = mid; g.globalAlpha = .86;
        g.fillText("earlier", right.x + right.w * .12, right.y + right.h - 5 * k);
        g.fillStyle = acc; g.globalAlpha = 1;
        g.fillText("later →", right.x + right.w * .84, right.y + right.h - 5 * k);
        g.font = fontOf(Math.max(k, 0.90), 10.2); g.fillStyle = acc;
        g.textAlign = "left"; g.textBaseline = "bottom";
        g.fillText("slope Kᵢ", right.x + right.w * 0.64, right.y + right.h * 0.27);
        g.fillStyle = hi;
        const interceptX=right.x+8*k,interceptY=right.y+right.h*.76,base="intercept v";
        g.fillText(base,interceptX,interceptY);const baseWidth=g.measureText(base).width;
        g.font=fontOf(Math.max(k,.90),7.1);g.fillText("B",interceptX+baseWidth,interceptY+2.5*k);
      }

      const label = step === 0 ? "identity: tissue repeats the input"
        : step === 1 ? "instantaneous blood term"
        : step === 2 ? "retention lifts the late tail"
        : step === 3 ? "factor out Cₐ(t)"
        : step === 4 ? "divide both sides by Cₐ(t)"
        : step === 5 ? "name y, intercept, slope and x"
        : "late samples become linear";
      g.font = fontOf(Math.max(k, 0.92), 11.2); g.fillStyle = step === 0 ? mid : acc;
      g.globalAlpha = 0.96; g.textAlign = "center"; g.textBaseline = "bottom";
      g.fillText(label, vx, H - 5 * k);
    },
  },

  /** Input and tissue together, then the Patlak plot they imply. Two panels, one model. */
  patlak: {
    aspect: 2.3, minWidth: 430, minWidth: 430, compactAspect: 1.25,
    draw(g, W, H, t, args = {}) {
      const k = args.k ?? 1;
      const acc = cssVar("--accent", "#D97757"), hi = cssVar("--hi", "#F9F9F7");
      const lo = cssVar("--lo", "#6E6C64"), mid = cssVar("--mid", "#97958D");
      const vp = args.vp ?? 0.44, ki = args.ki ?? 0.049;
      const volumeLabel = args.volumeLabel ?? "vp";
      const ca = aif(360, 600), ct = tissue(ca, vp, ki / 60);
      const ctMax = Math.max(...ct.map((p) => p[1])) || 1;

      /* Two panels need room. Below the declared minimum this drops to the single panel that
       * carries the result, rather than drawing the same figure at a size where neither panel
       * can be read — small should mean simpler, not the same thing shrunk. */
      const two = !args.compact;
      const pad = W * 0.11, gap = W * 0.10, bw = two ? (W - pad * 2 - gap) / 2 : W - pad * 2;
      const A = { x: pad, y: H * 0.16, w: bw, h: H * 0.58 };
      const B = two ? { x: pad + bw + gap, y: H * 0.16, w: bw, h: H * 0.58 } : A;

      g.fillStyle = args.plotBackground || "rgba(18,18,17,0.62)";
      g.fillRect(B.x, B.y, B.w, B.h);

      g.font = fontOf(k, 12); g.fillStyle = hi;
      g.textAlign = "left"; g.textBaseline = "bottom";
      if (two) g.fillText("(a) input and tissue", A.x, A.y - 9 * k);
      g.fillText(two ? "(b) Patlak plot" : "Patlak plot", B.x, B.y - 9 * k);

      if (two) {
        axes(g, A, { k, xlabel: "time (s)", axisColour: mid, labelColour: hi });
        trace(g, A, norm(ca, 600, 1), { color: acc, width: sc(k, 2.2), upto: Math.min(1, t / 0.9), glow: 0.7 });
        trace(g, A, norm(ct, 600, ctMax), { color: hi, width: sc(k, 1.8), upto: Math.min(1, t / 0.9) });
      }

      // the transform: x = integral of Ca over Ca, y = Ct over Ca
      axes(g, B, { k, xlabel: "∫Ca dτ / Ca  (s)", ylabel: "Ct / Ca",
                    axisColour: mid, labelColour: hi });
      let accum = 0; const xs = [], ys = [];
      for (let i = 1; i < ca.length; i++) {
        accum += (ca[i][1] + ca[i - 1][1]) / 2 * (ca[i][0] - ca[i - 1][0]);
        if (ca[i][1] < 0.06) continue;                 // the early, non-linear part
        xs.push(accum / ca[i][1]); ys.push(ct[i][1] / ca[i][1]);
      }
      const xm = Math.max(...xs), ym = Math.max(...ys);
      const upto = Math.max(0, Math.min(1, (t - 0.45) / 0.7));
      for (let i = 0; i < xs.length * upto; i++) {
        const c = rampAt(0.25 + 0.7 * (i / xs.length));
        g.fillStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},0.98)`;
        g.beginPath();
        g.arc(B.x + xs[i] / xm * B.w, B.y + B.h - ys[i] / ym * B.h, sc(k, 2.9), 0, TAU);
        g.fill();
      }
      if (upto > 0.45) {                                // the fit, once there is enough of it
        g.strokeStyle = hi; g.lineWidth = Math.max(2, sc(k, 2.4));
        g.globalAlpha = Math.min(1, (upto - 0.45) / 0.3);
        g.beginPath();
        g.moveTo(B.x + xs[0] / xm * B.w, B.y + B.h - ys[0] / ym * B.h);
        g.lineTo(B.x + B.w, B.y + B.h - ys[ys.length - 1] / ym * B.h);
        g.stroke();
        g.font = fontOf(k, 11.5); g.fillStyle = hi;
        g.textAlign = "left"; g.textBaseline = "top";
        g.fillText(`${volumeLabel} = ${vp} ml/100g`, B.x + 10, B.y + 6);
        g.fillText(`Ki = ${ki} ml/100g/min`, B.x + 10, B.y + 20);
        g.globalAlpha = 1;
      }
    },
  },

  /** One unanswered mapping between the measured arterial and tissue curves. */
  kineticTransformStory: {
    aspect: 2.62,
    minWidth: 700,
    loop: true,
    revealSteps: 19,
    load:(a={})=>loadDefenseKinetics(a.src||"decks/data/patient-parcels.json"),
    draw(g, W, H, t, a = {}) {
      if(!DEFENSE_KINETICS){loadDefenseKinetics(a.src);return;}
      const k=a.k??1,step=Math.max(0,Math.min(19,Math.round(Number(a._step??0)||0))),
        rawEnter=smooth(Math.max(0,Number(a._stepElapsed??0))/1.25),
        hi=cssVar("--hi","#F9F9F7"),mid=cssVar("--mid","#97958D"),lo=cssVar("--lo","#6E6C64"),
        tissue=cssVar("--accent","#D97757"),input=a.inputColor||"#F0C85A",time=DEFENSE_KINETICS.time_s||[],
        ca=DEFENSE_KINETICS.aif||[],count=Math.min(time.length,ca.length);
      if(count<2)return;const x0=Number(time[0]),x1=Math.max(x0+1e-6,Number(time[count-1])),span=x1-x0,
        peak=(values)=>Math.max(1e-9,...values.slice(0,count).map(v=>Number(v)||0)),
        disperse=(values,tau=5.8,passes=2)=>{let out=Array.from(values.slice(0,count),v=>Number(v)||0);for(let pass=0;pass<passes;pass++){const src=out.slice();let state=src[0]||0;for(let i=1;i<count;i++){const dt=Math.max(0,Number(time[i])-Number(time[i-1])),alpha=1-Math.exp(-dt/tau);state+=alpha*(src[i]-state);out[i]=state;}}return out;},
        points=(values,offset=0,scale=peak(values))=>values.slice(0,count).map((v,i)=>[(Number(time[i])+offset-x0)/span,(Number(v)||0)/scale]),
        caPeak=peak(ca),caN=points(ca,0,caPeak),capRaw=disperse(ca),capN=points(capRaw,0,caPeak),zeroN=caN.map(p=>[p[0],0]),
        integralRaw=(()=>{let sum=0;const out=[[capN[0][0],0]];for(let i=1;i<count;i++){const dt=Math.max(0,Number(time[i])-Number(time[i-1]));sum+=(capN[i-1][1]+capN[i][1])*.5*dt;out.push([capN[i][0],sum]);}return out;})(),
        integral=(()=>{const top=Math.max(1e-9,...integralRaw.map(p=>p[1]));return integralRaw.map(p=>[p[0],p[1]/top]);})(),
        vascularN=capN.map(p=>[p[0],p[1]*.56]),
        accumulationN=integral.map(p=>[p[0],p[1]*.21]),
        modelN=vascularN.map((p,i)=>[p[0],p[1]+accumulationN[i][1]]),
        patlak=(()=>{let area=0;const pts=[],capPeak=Math.max(1e-9,...capN.map(p=>p[1]));
          for(let i=1;i<count;i++){const dt=Math.max(0,Number(time[i])-Number(time[i-1]));area+=(capN[i-1][1]+capN[i][1])*.5*dt;
            const arterial=capN[i][1],tissueValue=modelN[i][1];if(arterial<=capPeak*.035)continue;
            const x=area/arterial,y=tissueValue/arterial;if(Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&y>=0)pts.push({x,y});}
          const xMax=Math.max(1e-9,...pts.map(p=>p.x)),fitPoints=pts.filter(p=>p.x>=xMax/3),n=Math.max(1,fitPoints.length),
            mx=fitPoints.reduce((s,p)=>s+p.x,0)/n,my=fitPoints.reduce((s,p)=>s+p.y,0)/n,
            den=Math.max(1e-12,fitPoints.reduce((s,p)=>s+(p.x-mx)**2,0)),slope=fitPoints.reduce((s,p)=>s+(p.x-mx)*(p.y-my),0)/den,
            intercept=my-slope*mx,yMax=Math.max(1e-9,...pts.map(p=>p.y),intercept+slope*xMax);
          return{pts,fitPoints,xMax,yMax,slope,intercept};})(),
        L={x:W*.030,y:H*.185,w:W*.245,h:H*.53},R={x:W*.725,y:H*.185,w:W*.245,h:H*.53},
        cx=W*.50,cy=H*.45,box={x:W*.340,y:H*.235,w:W*.320,h:H*.43},
        txt=(s,x,y,color=hi,size=11,align="center",family="ui-monospace, SFMono-Regular, monospace",weight=500,alpha=1)=>{g.save();g.globalAlpha=alpha;g.fillStyle=color;g.textAlign=align;g.textBaseline="middle";g.font=`${weight} ${Math.max(10,size*k).toFixed(1)}px ${family}`;g.fillText(s,x,y);g.restore();},
        arrow=(x0,y0,x1,y1,color=mid)=>{g.save();g.strokeStyle=color;g.fillStyle=color;g.globalAlpha=.88;g.lineWidth=Math.max(1.5,1.75*k);g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke();const ang=Math.atan2(y1-y0,x1-x0),r=8.5*k;g.beginPath();g.moveTo(x1,y1);g.lineTo(x1-Math.cos(ang-.55)*r,y1-Math.sin(ang-.55)*r);g.lineTo(x1-Math.cos(ang+.55)*r,y1-Math.sin(ang+.55)*r);g.closePath();g.fill();g.restore();},
        measuredDots=(B,pts,color)=>{g.save();g.fillStyle=color;g.globalAlpha=.46;for(let i=0;i<pts.length;i+=Math.max(1,Math.floor(pts.length/34))){const p=pts[i];if(p[0]<0||p[0]>1)continue;g.beginPath();g.arc(B.x+p[0]*B.w,B.y+B.h-p[1]*B.h,.72*k,0,TAU);g.fill();}g.restore();},
        morphRows=(from,to,u)=>from.map((p,i)=>[mix(p[0],to[i]?.[0]??p[0],u),mix(p[1],to[i]?.[1]??p[1],u)]),
        physicalStage=step===0?0:step<=2?1:step<=4?2:step<=7?3:step<=18?4:5,
        enter=[1,3,5,8,19].includes(step)?rawEnter:1;
      axes(g,L,{k:Math.max(.82,k),xlabel:"time (s)",ylabel:"",axisColour:mid,labelColour:lo});
      if(step<19)axes(g,R,{k:Math.max(.82,k),xlabel:"time (s)",ylabel:"",axisColour:mid,labelColour:lo});
      g.save();g.beginPath();g.rect(L.x,L.y-3*k,L.w,L.h+5*k);g.clip();trace(g,L,caN,{color:input,width:Math.max(1.6,1.9*k),glow:0});g.restore();measuredDots(L,caN,input);
      const prior=physicalStage===1?zeroN:physicalStage===2?caN:physicalStage===3?capN:physicalStage===4?vascularN:modelN,
        target=physicalStage===0?zeroN:physicalStage===1?caN:physicalStage===2?capN:physicalStage===3?vascularN:modelN,
        outputRows=physicalStage===0?zeroN:morphRows(prior,target,enter),outputColor=physicalStage<=3?input:tissue;
      if(step<19){g.save();g.beginPath();g.rect(R.x,R.y-3*k,R.w,R.h+5*k);g.clip();trace(g,R,outputRows,{color:outputColor,width:Math.max(1.6,1.9*k),glow:0});
        if(physicalStage>=4){g.globalAlpha=.66;trace(g,R,vascularN,{color:input,width:Math.max(1.0,1.18*k),glow:0});g.globalAlpha=.84;trace(g,R,accumulationN,{color:"#B89CFF",width:Math.max(1.0,1.18*k),glow:0});}g.restore();
        if(physicalStage===3)txt("vᴮCₐ,cap(t)",R.x+R.w*.18,R.y+R.h*.46,input,8.7,"left");
        if(physicalStage>=4)txt("Kᵢ∫Cₐ,cap dτ",R.x+R.w*.08,R.y+R.h*.82,"#B89CFF",8.2,"left");}
      txt("Cₐ(t)",L.x,L.y-8*k,lo,9,"left");
      if(step<19)txt("Cₜ(t)",R.x,R.y-8*k,lo,9,"left");
      g.save();g.strokeStyle=mid;g.globalAlpha=.32;g.lineWidth=.8*k;g.strokeRect(box.x,box.y,box.w,box.h);g.restore();
      arrow(L.x+L.w+7*k,cy,box.x-9*k,cy);
      arrow(box.x+box.w+9*k,cy,R.x-7*k,cy);
      if(step===0)txt("?",cx,cy-2*k,hi,66,"center","Georgia, 'Times New Roman', serif",500);
      else {
        g.save();const xA=box.x+box.w*.08,xB=box.x+box.w*.92,yA=cy-4*k,
          grad=g.createLinearGradient(xA,yA,xB,yA);grad.addColorStop(0,input);grad.addColorStop(1,"#6FB8C8");
        const capillaryU=physicalStage===2?enter:physicalStage>2?1:0,vesselWidth=mix(8,3.4,capillaryU);
        g.strokeStyle=grad;g.globalAlpha=.86;g.lineCap="round";g.lineWidth=vesselWidth*k;g.beginPath();g.moveTo(xA,yA);
        g.bezierCurveTo(box.x+box.w*.35,cy-box.h*.11,box.x+box.w*.66,cy+box.h*.10,xB,yA);g.stroke();
        if(capillaryU>.01){g.globalAlpha=.36*capillaryU;g.lineWidth=1.35*k;for(const side of [-1,1]){g.beginPath();g.moveTo(box.x+box.w*.30,yA-side*box.h*.035);g.bezierCurveTo(box.x+box.w*.45,yA+side*box.h*.13,box.x+box.w*.62,yA-side*box.h*.12,box.x+box.w*.78,yA+side*box.h*.035);g.stroke();}}
        const phase=(t*.22)%1;for(let i=0;i<9;i++){const u=(phase+i/9)%1,one=1-u,x=mix(xA,xB,u),
          y=yA+3*one*one*u*(-box.h*.11)+3*one*u*u*(box.h*.10);g.fillStyle=u<.5?input:"#6FB8C8";g.globalAlpha=.94;
          g.beginPath();g.arc(x,y,2.15*k,0,TAU);g.fill();}
        if(physicalStage>=4){const spreadU=step===8?enter:1;for(let i=0;i<78;i++){const u=.12+.76*hash01(i,41,2),one=1-u,
            bx=mix(xA,xB,u),by=yA+3*one*one*u*(-box.h*.11)+3*one*u*u*(box.h*.10),side=hash01(i,44,9)>.5?1:-1,
            age=clamp01(spreadU*1.18-hash01(i,48,4)*.34),distance=(7+Math.pow(hash01(i,47,3),.7)*box.h*.29)*age,
            px=bx+(hash01(i,52,7)-.5)*box.w*.12*age,py=by+side*distance,c=rampAt(.27+.60*hash01(i,49,6));
          g.fillStyle=`rgba(${c[0]|0},${c[1]|0},${c[2]|0},${.12+.66*age})`;g.beginPath();g.arc(px,py,(.65+1.05*hash01(i,53,8))*k,0,TAU);g.fill();}}
        g.restore();
      }
      if(step===19){g.save();g.fillStyle="rgba(12,12,12,.50)";g.fillRect(R.x,R.y,R.w,R.h);g.restore();
        axes(g,R,{k:Math.max(.82,k),xlabel:"∫Cₐ,cap dτ / Cₐ,cap",ylabel:"",axisColour:mid,labelColour:lo});txt("Cₜ / Cₐ,cap",R.x,R.y-8*k,lo,9,"left");
        const show=Math.max(1,Math.floor(patlak.pts.length*enter));
        for(let i=0;i<show;i++){const p=patlak.pts[i],late=p.x>=patlak.xMax/3,c=rampAt(.22+.72*i/Math.max(1,patlak.pts.length-1));g.fillStyle=`rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;g.globalAlpha=late?.82:.22;
          g.beginPath();g.arc(R.x+p.x/patlak.xMax*R.w*.96,R.y+R.h-p.y/patlak.yMax*R.h*.94,(late?1.45:.85)*k,0,TAU);g.fill();}
        if(enter>.55){const lineA=smooth((enter-.55)/.35),xa=patlak.xMax/3,xb=patlak.xMax,ya=patlak.intercept+patlak.slope*xa,yb=patlak.intercept+patlak.slope*xb;
          g.globalAlpha=lineA;g.strokeStyle="#B89CFF";g.lineWidth=Math.max(.75,.90*k);g.beginPath();g.moveTo(R.x+xa/patlak.xMax*R.w*.96,R.y+R.h-ya/patlak.yMax*R.h*.94);g.lineTo(R.x+R.w*.96,R.y+R.h-yb/patlak.yMax*R.h*.94);g.stroke();
          txt("slope = Kᵢ",R.x+R.w*.60,R.y+R.h*.18,"#B89CFF",7.8,"left",undefined,undefined,lineA);
          txt("intercept = vᴮ",R.x+R.w*.08,R.y+R.h*.78,hi,7.8,"left",undefined,undefined,lineA);g.globalAlpha=1;}}
      const stage=step===0?"":physicalStage===1?"if unchanged, Cₜ(t) follows Cₐ(t)":physicalStage===2?"microvascular transit spreads arrival times: lower peak, wider curve":physicalStage===3?"vᴮ scales the capillary-facing curve":physicalStage===4?"Kᵢ adds cumulative retention":"schematic curves transformed into Patlak space";
      if(stage)txt(stage,cx,H-10*k,physicalStage===1?mid:tissue,10.5);
    },
  },

  /**
   * Two-act route into Patlak. The first act supplies physiological intuition for why a
   * tissue curve differs from its arterial input. The second act keeps measured Ca and Ct
   * fixed while revealing the instantaneous and late contributions already composing Ct.
   */
  kineticTransformCompositionStory: {
    aspect: 2.62,
    minWidth: 700,
    loop: true,
    revealSteps: 13,
    load:(a={})=>loadDefenseKinetics(a.src||"decks/data/patient-parcels.json"),
    draw(g,W,H,t,a={}){
      // Keep the established scene phases, while removing the vascular-fraction
      // hold and giving the linear reference its own click before the plot.
      const phases=a.phaseSteps||[0,1,2,3,4,5,6,7,8,9,10,11,12,13];
      const routeStep=Math.max(0,Math.min(phases.length-1,Math.round(Number(a._step??0)||0)));
      const k=a.k??1,step=phases[routeStep],
        elapsed=Math.max(0,Number(a._stepElapsed??0)),settled=!!(a._stepSettled||a._stepBackward||a._directEnd),stepEnter=settled?1:smooth(elapsed/.82),
        delayed=settled?1:smooth((elapsed-1.0)/.62),hi=cssVar("--hi","#F9F9F7"),
        mid=cssVar("--mid","#97958D"),lo=cssVar("--lo","#6E6C64"),
        tissue=cssVar("--accent","#D97757"),input=a.inputColor||"#F0C85A",late="#B89CFF",
        count=PATLAK_SCHEMATIC.time.length;
      const caN=PATLAK_SCHEMATIC.ca,capN=PATLAK_SCHEMATIC.cap,
        capInstantN=PATLAK_SCHEMATIC.instant,
        capAccumulationN=PATLAK_SCHEMATIC.accumulation,
        capTissueN=PATLAK_SCHEMATIC.tissue,
        // Decompose the already-established tissue-shaped curve.  The rapidly reversible
        // contribution retains the dispersed capillary profile; the late contribution is the
        // monotone integral that the earlier version of this scene made visually explicit.
        instantN=capInstantN,
        accumulationN=capAccumulationN,
        tissueN=capTissueN,
        morphRows=(from,to,u)=>from.map((p,i)=>[mix(p[0],to[i]?.[0]??p[0],u),mix(p[1],to[i]?.[1]??p[1],u)]),
        patlak=PATLAK_SCHEMATIC.patlak,
        L={x:W*.026,y:H*.185,w:W*.224,h:H*.53},R={x:W*.750,y:H*.185,w:W*.224,h:H*.53},
        cx=W*.50,cy=H*.45,box={x:W*.330,y:H*.235,w:W*.340,h:H*.43},
        txt=(s,x,y,color=hi,size=11,align="center",family="ui-monospace, SFMono-Regular, monospace",weight=500,alpha=1)=>{g.save();g.globalAlpha=alpha;g.fillStyle=color;g.textAlign=align;g.textBaseline="middle";g.font=`${weight} ${Math.max(10,size*k).toFixed(1)}px ${family}`;g.fillText(s,x,y);g.restore();},
        arrow=(ax,ay,bx,by,color=mid,alpha=.82)=>{g.save();g.strokeStyle=color;g.fillStyle=color;g.globalAlpha=alpha;g.lineWidth=Math.max(1.3,1.55*k);g.beginPath();g.moveTo(ax,ay);g.lineTo(bx,by);g.stroke();const ang=Math.atan2(by-ay,bx-ax),r=7.6*k;g.beginPath();g.moveTo(bx,by);g.lineTo(bx-Math.cos(ang-.55)*r,by-Math.sin(ang-.55)*r);g.lineTo(bx-Math.cos(ang+.55)*r,by-Math.sin(ang+.55)*r);g.closePath();g.fill();g.restore();},
        curvePoint=(B,p)=>({x:B.x+p.x*B.w*.96,y:B.y+B.h-(patlak.intercept+patlak.slope*p.x)*B.h*.86}),
        // Reduce the tissue curve as the branch appears, then hold that complete
        // dispersed, vascular-fraction shape through the next two explanations.
        outputRows=step===0?caN
          :step===1?morphRows(caN,capInstantN,stepEnter)
          :step<=3?capInstantN
          :step===4?morphRows(capInstantN,capTissueN,stepEnter)
          :tissueN;

      const edit=figureEditParts(g,W,H),labelFont=fontOf(Math.max(.82,k),11),smallFont=`500 ${Math.max(10,9*k).toFixed(1)}px ui-monospace, SFMono-Regular, monospace`;
      const plotBounds=B=>({x:B.x-5*k,y:B.y-17*k,w:B.w+10*k,h:B.h+64*k});
      edit.begin('arterial-plot','Arterial plot',plotBounds(L));
      axes(g,L,{k:Math.max(.82,k),xlabel:"",ylabel:"",axisColour:mid,labelColour:lo});
      // The left schematic is a shape reference with an unnumbered vertical axis.
      // Keep its peak height fixed as the effective input is introduced. This is a
      // display normalization only: the right concentrations and Patlak fit are untouched.
      const caPeak=Math.max(...caN.map(p=>p[1])),
        inputShape=step<5?caN:step===5?morphRows(caN,capN,stepEnter):capN,
        inputPeak=Math.max(1e-9,...inputShape.map(p=>p[1])),
        shownInput=inputShape.map(p=>[p[0],p[1]*caPeak/inputPeak]);
      g.save();g.beginPath();g.rect(L.x,L.y-3*k,L.w,L.h+5*k);g.clip();trace(g,L,shownInput,{color:input,width:Math.max(1.6,1.9*k),glow:0});g.restore();
      edit.text('arterial-y','Cₐ(t)',L.x,L.y-8*k,lo,smallFont,'left');
      edit.text('arterial-x','time (s)',L.x+L.w/2,L.y+L.h+17*Math.max(.82,k),lo,labelFont,'center','top');
      if(step>=5)edit.text('effective-input','effective local input',L.x+L.w/2,L.y+L.h+34*k,mid,fontOf(k,7.8),'center','top');
      edit.end();

      if(step<9){
        edit.begin('tissue-plot','Tissue plot',plotBounds(R));
        axes(g,R,{k:Math.max(.82,k),xlabel:"",ylabel:"",axisColour:mid,labelColour:lo});
        g.save();g.beginPath();g.rect(R.x,R.y-3*k,R.w,R.h+5*k);g.clip();
        // All three concentrations share one baseline: yellow + purple = coral.
        // A filled difference alone conceals the time-course of retained tracer.
        trace(g,R,outputRows,{color:step<4?input:tissue,width:Math.max(1.6,1.9*k),glow:0});
        if(step>=5){g.globalAlpha=step===5?.96*stepEnter:.92;trace(g,R,instantN,{color:input,width:Math.max(1.05,1.23*k),glow:0});g.globalAlpha=1;}
        if(step>=6){g.globalAlpha=step===6?stepEnter:1;trace(g,R,accumulationN,{color:late,width:Math.max(1.25,1.45*k),glow:0});g.globalAlpha=1;}
        g.restore();
        edit.text('tissue-y','Cₜ(t)',R.x,R.y-8*k,lo,smallFont,'left');
        edit.text('tissue-x','time (s)',R.x+R.w/2,R.y+R.h+17*Math.max(.82,k),lo,labelFont,'center','top');
        if(step>=5){g.save();g.globalAlpha=step===5?delayed:1;edit.text('instantaneous','instantaneous',R.x+11*k,R.y+15*k,input,fontOf(k,8.4),'left');g.restore();}
        if(step>=6){g.save();g.globalAlpha=step===6?stepEnter:1;edit.text('late-remainder','late remainder',R.x+R.w-10*k,R.y+31*k,late,fontOf(k,8.3),'right');g.restore();}
        edit.end();
      }

      if(step<=4){
        arrow(L.x+L.w+7*k,cy,box.x-8*k,cy);arrow(box.x+box.w+8*k,cy,R.x-7*k,cy);
        edit.begin('vessel','Vessel',box);
        g.save();g.lineCap="round";g.lineJoin="round";
        const xA=box.x+box.w*.055,xSplit=box.x+box.w*.385,xB=box.x+box.w*.95,yA=cy,
          branchU=step===0?0:step===1?stepEnter:1,
          cubic=(p0,p1,p2,p3,q)=>{const n=1-q;return{x:n*n*n*p0.x+3*n*n*q*p1.x+3*n*q*q*p2.x+q*q*q*p3.x,y:n*n*n*p0.y+3*n*n*q*p1.y+3*n*q*q*p2.y+q*q*q*p3.y};},
          trunk=[{x:xA,y:yA},{x:box.x+box.w*.16,y:cy-box.h*.052},{x:box.x+box.w*.29,y:cy+box.h*.035},{x:xSplit,y:cy+box.h*.008}],
          continuation=[{x:xSplit,y:cy+box.h*.008},{x:box.x+box.w*.55,y:cy-box.h*.030},{x:box.x+box.w*.76,y:cy+box.h*.052},{x:xB,y:cy+box.h*.018}],
          branches=[
            [{x:xSplit,y:cy+box.h*.008},{x:box.x+box.w*.47,y:cy-box.h*.020},{x:box.x+box.w*.61,y:cy-box.h*.245},{x:box.x+box.w*.88,y:cy-box.h*.300}],
            continuation,
            [{x:xSplit,y:cy+box.h*.008},{x:box.x+box.w*.56,y:cy-box.h*.018},{x:box.x+box.w*.67,y:cy+box.h*.205},{x:box.x+box.w*.93,y:cy+box.h*.255}]
          ],
          tapered=(path,color,alpha,w0,w1)=>{g.strokeStyle=color;g.globalAlpha=alpha;for(let si=0;si<28;si++){const q0=si/28,q1=(si+1)/28,p0=cubic(...path,q0),p1=cubic(...path,q1);g.lineWidth=mix(w0,w1,q0)*k;g.beginPath();g.moveTo(p0.x,p0.y);g.lineTo(p1.x,p1.y);g.stroke();}};
        tapered(trunk,"#705A2C",.88,mix(13,11,branchU),mix(10,8,branchU));
        if(step===0){const straight=[trunk[3],{x:box.x+box.w*.60,y:cy-box.h*.02},{x:box.x+box.w*.79,y:cy+box.h*.02},{x:xB,y:cy}];tapered(straight,"#705A2C",.88,10,7.4);tapered(trunk,input,.94,mix(9.2,7.6,branchU),mix(7.5,5.8,branchU));tapered(straight,input,.94,7.0,4.8);}
        else {
          for(let bi=0;bi<3;bi++){const bright=bi===1,alpha=(bright?.96:.32)*branchU;tapered(branches[bi],"#705A2C",Math.min(.82,alpha+.13),bright?7.6:5.3,bright?3.9:2.3);}
          tapered(trunk,input,.96,mix(9.2,7.6,branchU),mix(7.5,5.8,branchU));
          for(const bi of [0,2,1]){const bright=bi===1,alpha=(bright?.96:.32)*branchU;tapered(branches[bi],input,alpha,bright?5.4:3.1,bright?2.45:1.25);}
        }
        const phase=(t*.23)%1;for(let i=0;i<18;i++){const u=(phase+i/18)%1,branch=i%3,bright=branch===1,split=.43;let p,alpha=1;
          if(u<split)p=cubic(...trunk,u/split);
          else {const q=(u-split)/(1-split);p=cubic(...branches[branch],q);alpha=step===0?(bright?1:0):(bright?.96:.22)*branchU;}
          const x=p.x,y=p.y;
          g.fillStyle=u<split*.7?input:bright?"#F7D976":input;g.globalAlpha=alpha;g.beginPath();g.arc(x,y,(bright?2.05:1.45)*k,0,TAU);g.fill();}
        if(step===4){const a=stepEnter;for(let i=0;i<32;i++){const q=.16+.72*hash01(i,18,7),p=cubic(...continuation,q),q2=Math.min(1,q+.015),p2=cubic(...continuation,q2),dx=p2.x-p.x,dy=p2.y-p.y,len=Math.max(1e-6,Math.hypot(dx,dy)),side=hash01(i,24,11)>.5?1:-1,dist=(5+28*hash01(i,31,9))*a,x=p.x-side*dy/len*dist,y=p.y+side*dx/len*dist;g.fillStyle=late;g.globalAlpha=(.10+.48*hash01(i,39,12))*a;g.beginPath();g.arc(x,y,(.7+hash01(i,41,4))*k,0,TAU);g.fill();}}
        g.restore();edit.end();
      } else if(step<9) arrow(L.x+L.w+14*k,cy,R.x-14*k,cy,tissue,.78);

      if(step>=9){
        edit.begin('patlak-plot','Patlak plot',plotBounds(R));
        g.save();g.fillStyle="rgba(5,5,5,.78)";g.fillRect(R.x-5*k,R.y-17*k,R.w+10*k,R.h+42*k);g.restore();
        axes(g,R,{k:Math.max(.82,k),xlabel:"",ylabel:"",axisColour:mid,labelColour:lo});
        edit.text('patlak-y','Cₜ / Cₐ',R.x,R.y-8*k,lo,smallFont,'left');
        edit.text('patlak-x','∫Cₐ dτ / Cₐ',R.x+R.w/2,R.y+R.h+17*Math.max(.82,k),lo,labelFont,'center','top');
        const morph=step===9?stepEnter:1;
        if(morph<1){g.save();g.globalAlpha=1-morph;trace(g,R,tissueN,{color:tissue,width:1.9*k,glow:0});g.restore();}
        for(let i=0;i<patlak.pts.length;i++){const p=patlak.pts[i],isLate=p.t>=.64,c=rampAt(.22+.72*i/Math.max(1,patlak.pts.length-1)),
          source=tissueN[Math.round(p.t*(count-1))][1],px=R.x+mix(p.t,p.x*.96,morph)*R.w,py=R.y+R.h-mix(source,p.y*.86,morph)*R.h;
          g.fillStyle=`rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;g.globalAlpha=(isLate?.88:.18)*(.3+.7*morph);g.beginPath();g.arc(px,py,(isLate?1.75:1.0)*k,0,TAU);g.fill();}
        g.globalAlpha=1;
        if(step>=10){const lineAlpha=step===10?stepEnter:1,aP=curvePoint(R,{x:patlak.fitMin}),bP=curvePoint(R,{x:patlak.fitMax});g.save();g.globalAlpha=lineAlpha;g.strokeStyle=late;g.lineWidth=Math.max(.75,.88*k);g.beginPath();g.moveTo(aP.x,aP.y);g.lineTo(bP.x,bP.y);g.stroke();g.restore();}
        if(step>=11){const u=step===11?stepEnter:1,xA=.57,xB=.83,pA=curvePoint(R,{x:xA}),pB=curvePoint(R,{x:xB});g.save();g.globalAlpha=.80;g.strokeStyle=late;g.lineWidth=Math.max(.65,.78*k);g.setLineDash([3*k,4*k]);g.beginPath();g.moveTo(pA.x,pA.y);g.lineTo(mix(pA.x,pB.x,Math.min(1,u*2)),pA.y);if(u>.5)g.lineTo(pB.x,mix(pA.y,pB.y,(u-.5)*2));g.stroke();g.setLineDash([]);g.globalAlpha=u;edit.text('slope-label',step>=13?"slope · Kᵢ":"slope · ε₂",R.x+R.w*.07,R.y+R.h*.18,late,fontOf(k,8.2),'left');g.restore();}
        if(step>=12){const u=step===12?stepEnter:1,p0=curvePoint(R,{x:0}),pA=curvePoint(R,{x:patlak.fitMin});g.save();g.globalAlpha=.76;g.strokeStyle=input;g.lineWidth=Math.max(.60,.72*k);g.setLineDash([2*k,4*k]);g.beginPath();g.moveTo(pA.x,pA.y);g.lineTo(mix(pA.x,p0.x,u),mix(pA.y,p0.y,u));g.stroke();g.setLineDash([]);g.globalAlpha=u;edit.text('intercept-label',step>=13?"intercept · vᴮ":"intercept · ε₁",R.x+R.w*.07,R.y+R.h*.94,input,fontOf(k,8.1),'left');g.restore();}
        edit.end();
      }

      const stage=step===0?"if nothing changed, Cₜ(t) would follow Cₐ(t)":step===1?"blood follows a distribution of microvascular paths":step===2?"convolution across a distribution of transit times":step===3?"transit dispersion and the vascular fraction shape the tissue signal":step===4?"some tracer accumulates in tissue":step===5?"":step===6?"":step===7?"":step===8?"a straight-line form":step===9?"late samples approach a linear regime":step===10?"fit the late linear regime":"";
      if(stage)edit.text('caption',stage,cx,H-10*k,step===0?mid:step>=7?tissue:input,fontOf(k,10.5));
      edit.finish();
    },
  },

  /**
   * Socratic deconvolution/Tikhonov sequence, deliberately parallel to `patlakStory`.
   * States: unknown memory → impulse response → sampled linear system → unstable inverse →
   * regularised compromise → physiological summaries.
   */
  deconvolutionStory: {
    aspect: 2.65,
    minWidth: 720,
    loop: true,
    revealSteps: 5,
    draw(g, W, H, t, a = {}) {
      const k = a.k ?? 1;
      const step = Math.max(0, Math.min(5, Math.round(Number(a._step ?? 0) || 0)));
      const ease = Math.max(0, Math.min(1, Number(a._stepElapsed ?? 0) / .62));
      const acc = cssVar("--accent", "#D97757"), hi = cssVar("--hi", "#F9F9F7");
      const mid = cssVar("--mid", "#97958D"), lo = cssVar("--lo", "#6E6C64");
      const blue = a.blue || "#6FB8C8", gold = a.gold || "#E8BE55";
      const green = a.green || "#7EB892", violet = a.violet || "#A78BFA";
      const txt = (x, y, s, c, size = 10.4, align = "center", alpha = 1, weight = 500) => {
        g.save(); g.globalAlpha = alpha; g.fillStyle = c; g.textAlign = align; g.textBaseline = "middle";
        g.font = `${weight} ${Math.max(10, size * k).toFixed(1)}px ui-monospace, SFMono-Regular, monospace`;
        g.fillText(s, x, y); g.restore();
      };
      const ca = aif(180, 600), caN = norm(ca, 600, 1);
      const residue = Array.from({ length: 180 }, (_, i) => {
        const x = i / 179;
        return [x, x < .13 ? 1 : .76 * Math.exp(-(x - .13) / .24) + .14 * Math.exp(-(x - .13) / .72)];
      });
      const ct = [];
      for (let i = 0; i < ca.length; i++) {
        let sum = 0;
        for (let j = 0; j <= i; j++) sum += ca[j][1] * residue[i - j][1];
        ct.push([ca[i][0], sum]);
      }
      const ctMax = Math.max(...ct.map(p => p[1])) || 1, ctN = norm(ct, 600, ctMax);
      const A = { x: W * .055, y: H * .15, w: W * .25, h: H * .34 };
      const G = { x: W * .375, y: H * .15, w: W * .25, h: H * .34 };
      const C = { x: W * .695, y: H * .15, w: W * .25, h: H * .34 };
      [A, G, C].forEach((b) => { g.fillStyle = "rgba(18,18,17,.40)"; g.fillRect(b.x, b.y, b.w, b.h); });
      axes(g, A, { k: Math.max(.82, k), xlabel: "t", ylabel: "Cₐ", axisColour: mid, labelColour: hi });
      // The impulse-response age is already explicit in g(t); omitting a second x-label
      // leaves a clean reading lane for the forward convolution equation below.
      axes(g, G, { k: Math.max(.82, k), ylabel: "g", axisColour: mid, labelColour: hi });
      axes(g, C, { k: Math.max(.82, k), xlabel: "t", ylabel: "Cₜ", axisColour: mid, labelColour: hi });
      trace(g, A, caN, { color: acc, width: 2.2 * k, glow: .45 });
      trace(g, C, ctN, { color: hi, width: 2.2 * k, glow: .34 });
      txt(A.x + A.w / 2, A.y - 15 * k, "known input", acc, 10.5);
      txt(G.x + G.w / 2, G.y - 15 * k, step ? "tissue memory" : "unknown memory", step ? blue : lo, 10.5);
      txt(C.x + C.w / 2, C.y - 15 * k, "measured output", hi, 10.5);
      if (step === 0) {
        txt(G.x + G.w / 2, G.y + G.h * .49, "?", hi, 30, "center", .84, 650);
      } else {
        const noisy = step === 3;
        const pts = residue.map(([x, y], i) => [x, Math.max(0, Math.min(1.08,
          noisy ? y + .20 * Math.sin(i * 2.73) + .13 * Math.sin(i * 6.1) : y))]);
        trace(g, G, pts, { color: noisy ? acc : blue, width: (noisy ? 1.25 : 2.35) * k,
          glow: noisy ? .08 : .44 });
        if (step >= 1) txt(G.x + G.w * .56, G.y + G.h * .18, "g(t)=CBF·R(t)", blue, 9.5);
      }
      // One compact forward equation keeps the three plots a single composition.
      txt(W * .50, H * .565, "Cₜ(t) = ∫₀ᵗ Cₐ(τ) g(t−τ)dτ", step ? hi : mid, 12.2, "center", step ? 1 : .42, 600);

      if (step === 2) {
        const a2 = .28 + .72 * ease;
        const mx = W * .095, my = H * .645, mw = W * .235, mh = H * .20;
        // Lower-triangular Toeplitz matrix: causality is visible in the empty upper triangle.
        const rows = 12, cols = 15, cw = mw / cols, ch = mh / rows;
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          if (c > r + 2) continue;
          const v = Math.exp(-(r - c + 2) / 4.4) * (.35 + .65 * hash01(r, c, 23));
          g.fillStyle = `rgba(217,119,87,${a2 * (.08 + .62 * v)})`;
          g.fillRect(mx + c * cw, my + r * ch, cw * .84, ch * .84);
        }
        txt(mx - 16 * k, my + mh / 2, "c", hi, 15, "right", a2, 650);
        txt(mx + mw + 15 * k, my + mh / 2, "g + ε", hi, 12, "left", a2, 650);
        txt(mx, my - 13 * k, "Toeplitz A(Cₐ)", acc, 9.2, "left", a2);
        txt(W * .58, H * .69, "c = A(Cₐ) g + ε", hi, 17, "center", a2, 650);
        txt(W * .58, H * .77, "sampling turns convolution", mid, 9.2, "center", a2);
        txt(W * .58, H * .82, "into a causal linear inverse problem", mid, 9.2, "center", a2);
      }

      if (step === 3) {
        const a3 = .30 + .70 * ease;
        txt(W * .50, H * .66, "A = UΣVᵀ  ·  inversion divides by σᵢ", hi, 12.5, "center", a3, 600);
        const sy = H * .79, lx = W * .14, rx = W * .86;
        g.save(); g.globalAlpha = a3; g.lineWidth = 1.5 * k; g.lineCap = "round";
        g.strokeStyle = blue; g.beginPath();
        for (let i = 0; i <= 70; i++) {
          const u = i / 70, x = lx + (W * .31) * u, y = sy - H * .12 * Math.exp(-3.5 * u);
          if (!i) g.moveTo(x, y); else g.lineTo(x, y);
        } g.stroke();
        g.strokeStyle = acc; g.beginPath();
        for (let i = 0; i <= 80; i++) {
          const u = i / 80, x = W * .55 + (rx - W * .55) * u;
          const amp = .05 + .28 * u * u, y = sy + H * amp * .22 * Math.sin(i * 2.8);
          if (!i) g.moveTo(x, y); else g.lineTo(x, y);
        } g.stroke(); g.restore();
        txt(W * .295, H * .86, "σᵢ → small", blue, 9.3, "center", a3, 600);
        txt(W * .705, H * .86, "noise / σᵢ → large", acc, 9.3, "center", a3, 600);
      }

      if (step === 4) {
        const a4 = .28 + .72 * ease;
        g.save(); g.fillStyle = "rgba(18,18,17,.90)"; g.fillRect(W * .17, H * .625, W * .66, H * .265); g.restore();
        txt(W * .50, H * .68, "ĝλ = arg min ‖A g−c‖² + λ²‖L g‖²", hi, 12.3, "center", a4, 600);
        const bx = W * .245, by = H * .755, bw = W * .25, bh = H * .10;
        g.save(); g.strokeStyle = mid; g.globalAlpha = .82 * a4; g.lineWidth = Math.max(1, k);
        g.beginPath();
        for (let i = 0; i <= 60; i++) {
          const u = i / 60, x = bx + bw * u, d = (u - .46) / .54;
          const y = by + bh * (.88 - .65 * d * d);
          if (!i) g.moveTo(x, y); else g.lineTo(x, y);
        } g.stroke();
        const pick = .46, px = bx + bw * pick, py = by + bh * .88;
        g.fillStyle = gold; g.globalAlpha = a4; g.beginPath(); g.arc(px, py, 3.4 * k, 0, TAU); g.fill(); g.restore();
        txt(bx + bw / 2, by + bh + 13 * k, "candidate λ grid", mid, 8.7, "center", a4);
        txt(W * .66, H * .775, "choose min GCV(λ)", gold, 9.6, "center", a4, 600);
        txt(W * .66, H * .825, "‖(I−Hλ)c‖² / tr(I−Hλ)²", mid, 8.8, "center", a4);
      }

      if (step >= 5) {
        const a5 = .30 + .70 * ease;
        txt(W * .50, H * .655, "ideal continuous-time identities", mid, 8.8, "center", a5);
        txt(W * .19, H * .73, "CBF = g(0)", gold, 12.0, "center", a5, 650);
        txt(W * .50, H * .73, "CBV = ∫g(t)dt", green, 12.0, "center", a5, 650);
        txt(W * .81, H * .73, "MTT = CBV / CBF", violet, 12.0, "center", a5, 650);
        txt(W * .19, H * .81, "initial delivery rate", mid, 8.8, "center", a5);
        txt(W * .50, H * .81, "area under recovered response", mid, 8.8, "center", a5);
        txt(W * .81, H * .81, "central-volume relation", mid, 8.8, "center", a5);
        txt(W * .50, H * .885, "p-Brain CBF: max of aligned, constrained ĝλ[0:50]", blue, 8.7, "center", a5, 600);
      }

      const labels = [
        "What tissue memory could produce this output?",
        "Describe the response to one instantaneous delivery.",
        "How does sampled convolution become solvable algebra?",
        "Why not simply invert the matrix?",
        "Which smooth solution still explains the data?",
        "What physiology can the recovered response support?",
      ];
      txt(W * .50, H * .955, labels[step], step < 4 ? mid : blue, 9.2, "center", 1);
    },
  },

  /** Lecture-level map of the assumptions behind a Patlak line. */
  patlakValidityAtlas: {
    aspect: 2.30,
    minWidth: 720,
    loop: false,
    revealSteps: 3,
    draw(g, W, H, t, a = {}) {
      const k = a.k ?? 1, step = Math.max(0, Math.min(3, Math.round(Number(a._step ?? 0) || 0)));
      const e = Math.max(0, Math.min(1, Number(a._stepElapsed ?? 0) / .60));
      const hi = cssVar("--hi", "#F9F9F7"), mid = cssVar("--mid", "#97958D"), lo = cssVar("--lo", "#6E6C64");
      const hair = cssVar("--hair", "#33322E"), acc = cssVar("--accent", "#D97757");
      const blue = a.blue || "#6FB8C8", green = a.green || "#7EB892", violet = a.violet || "#A78BFA";
      const txt = (x, y, s, c, size = 9.7, align = "left", alpha = 1, weight = 500) => {
        g.save(); g.globalAlpha = alpha; g.fillStyle = c; g.textAlign = align; g.textBaseline = "middle";
        g.font = `${weight} ${Math.max(10, size * k).toFixed(1)}px ui-monospace, SFMono-Regular, monospace`;
        g.fillText(s, x, y); g.restore();
      };
      txt(W * .035, H * .065, "GENERAL BIDIRECTIONAL MODEL", mid, 9.2);
      txt(W * .035, H * .125, "Cₜ = vᴮCₐ + Kᵗʳᵃⁿˢ ∫ Cₐ(τ)e⁻ᵏᵉᵖ⁽ᵗ⁻τ⁾dτ", hi, 13.0, "left", 1, 600);
      txt(W * .035, H * .185, "Patlak replaces e⁻ᵏᵉᵖ⁽ᵗ⁻τ⁾ by 1 over a chosen late window.", acc, 9.5);

      const P = { x: W * .07, y: H * .31, w: W * .47, h: H * .46 };
      g.save(); g.fillStyle = "rgba(18,18,17,.48)"; g.fillRect(P.x, P.y, P.w, P.h); g.restore();
      axes(g, P, { k: Math.max(.82, k), xlabel: "backflux during fitted window  ·  kₑₚ Δtfit →",
        ylabel: "reversible pools equilibrated →", axisColour: mid, labelColour: hi });
      const xCut = .28, yCut = .43;
      g.save();
      g.fillStyle = "rgba(126,184,146,.13)"; g.fillRect(P.x, P.y, P.w * xCut, P.h * (1 - yCut));
      g.strokeStyle = hair; g.globalAlpha = .9; g.lineWidth = Math.max(1, k); g.setLineDash([5 * k, 5 * k]);
      g.beginPath(); g.moveTo(P.x + P.w * xCut, P.y); g.lineTo(P.x + P.w * xCut, P.y + P.h); g.stroke();
      g.beginPath(); g.moveTo(P.x, P.y + P.h * yCut); g.lineTo(P.x + P.w, P.y + P.h * yCut); g.stroke();
      g.setLineDash([]); g.restore();
      txt(P.x + P.w * .15, P.y + P.h * .16, "LINEAR REGIME", green, 9.8, "center", 1, 650);
      txt(P.x + P.w * .15, P.y + P.h * .27, "equilibrated pools", green, 8.3, "center");
      txt(P.x + P.w * .15, P.y + P.h * .35, "negligible efflux", green, 8.3, "center");
      txt(P.x + P.w * .67, P.y + P.h * .18, "BACKFLUX", acc, 9.8, "center", step >= 1 ? 1 : .20, 650);
      txt(P.x + P.w * .67, P.y + P.h * .29, "late points curve", acc, 8.3, "center", step >= 1 ? 1 : .20);
      txt(P.x + P.w * .67, P.y + P.h * .37, "below the line", acc, 8.3, "center", step >= 1 ? 1 : .20);
      txt(P.x + P.w * .20, P.y + P.h * .70, "TOO EARLY", violet, 9.8, "center", step >= 2 ? 1 : .20, 650);
      txt(P.x + P.w * .20, P.y + P.h * .81, "delivery + mixing", violet, 8.3, "center", step >= 2 ? 1 : .20);
      txt(P.x + P.w * .72, P.y + P.h * .70, "NO LINEAR WINDOW", lo, 9.2, "center", step >= 2 ? 1 : .18, 650);
      txt(P.x + P.w * .72, P.y + P.h * .81, "persistent backflux", lo, 8.3, "center", step >= 2 ? 1 : .18);

      const Q = { x: W * .635, y: H * .30, w: W * .30, h: H * .20 };
      g.fillStyle = "rgba(18,18,17,.48)"; g.fillRect(Q.x, Q.y, Q.w, Q.h);
      axes(g, Q, { k: Math.max(.78, k), xlabel: "x = ∫Cₐ/Cₐ", ylabel: "y = Cₜ/Cₐ",
        axisColour: mid, labelColour: hi });
      const line = (bend, color, alpha) => {
        g.save(); g.strokeStyle = color; g.globalAlpha = alpha; g.lineWidth = 2 * k; g.beginPath();
        for (let i = 0; i <= 40; i++) {
          const x = i / 40, y = .16 + .68 * x - bend * Math.pow(Math.max(0, x - .45), 2) * 1.8;
          const px = Q.x + x * Q.w, py = Q.y + Q.h - y * Q.h;
          if (!i) g.moveTo(px, py); else g.lineTo(px, py);
        } g.stroke(); g.restore();
      };
      line(0, green, 1); if (step >= 1) line(.30, acc, .35 + .65 * e);
      txt(Q.x + Q.w * .63, Q.y - 14 * k, "observed transformed data", hi, 9.2, "center");

      const rx = W * .635, ry = H * .625, gap = H * .065;
      const a1 = step >= 1 ? (step === 1 ? .30 + .70 * e : 1) : .18;
      const a2 = step >= 2 ? (step === 2 ? .30 + .70 * e : 1) : .18;
      const a3 = step >= 3 ? .30 + .70 * e : .18;
      txt(rx, ry, "1  choose t* from stable transformed linearity", green, 7.8, "left", 1, 600);
      txt(rx, ry + gap, "2  require kₑₚ Δtfit ≪ 1", acc, 8.1, "left", a1, 600);
      txt(rx, ry + gap * 2, "3  low Cₐ ≠ negligible efflux", violet, 8.1, "left", a2, 600);
      txt(rx, ry + gap * 3, "4  audit delay/dispersion · Hct · relaxivity", blue, 7.8, "left", a3, 600);
      txt(rx, ry + gap * 4, "5  intercept = operational reversible volume", mid, 7.8, "left", a3);
      txt(W * .50, H * .945, "validity is a time-window claim, not a property of the equation alone", hi, 9.2, "center", 1, 600);
    },
  },

  /** Spectral anatomy of Tikhonov regularisation for technical backup. */
  tikhonovOperatorLab: {
    aspect: 2.30,
    minWidth: 720,
    loop: false,
    revealSteps: 3,
    draw(g, W, H, t, a = {}) {
      const k = a.k ?? 1, step = Math.max(0, Math.min(3, Math.round(Number(a._step ?? 0) || 0)));
      const e = Math.max(0, Math.min(1, Number(a._stepElapsed ?? 0) / .62));
      const hi = cssVar("--hi", "#F9F9F7"), mid = cssVar("--mid", "#97958D"), lo = cssVar("--lo", "#6E6C64");
      const acc = cssVar("--accent", "#D97757"), blue = a.blue || "#6FB8C8";
      const gold = a.gold || "#E8BE55", green = a.green || "#7EB892", violet = a.violet || "#A78BFA";
      const txt = (x, y, s, c, size = 9.6, align = "left", alpha = 1, weight = 500) => {
        g.save(); g.globalAlpha = alpha; g.fillStyle = c; g.textAlign = align; g.textBaseline = "middle";
        g.font = `${weight} ${Math.max(10, size * k).toFixed(1)}px ui-monospace, SFMono-Regular, monospace`;
        g.fillText(s, x, y); g.restore();
      };
      txt(W * .035, H * .075, "ĝλ = (AᵀWA + λ²LᵀL)⁻¹AᵀWc", hi, 14, "left", 1, 650);
      txt(W * .965, H * .075, "L=I shrinks amplitude · L=D penalises slope · L=D² penalises curvature", mid, 8.9, "right");
      const S = { x: W * .06, y: H * .22, w: W * .37, h: H * .48 };
      axes(g, S, { k: Math.max(.80, k), xlabel: "singular mode i", ylabel: "magnitude",
        axisColour: mid, labelColour: hi });
      const sigma = [], f0 = [], f1 = [], f2 = [];
      for (let i = 0; i < 70; i++) {
        const x = i / 69, s = Math.exp(-5.7 * x);
        sigma.push([x, s]);
        const filt = (lam) => s * s / (s * s + lam * lam);
        f0.push([x, filt(.015)]); f1.push([x, filt(.065)]); f2.push([x, filt(.20)]);
      }
      trace(g, S, sigma, { color: hi, width: 1.7 * k, glow: .15 });
      txt(S.x + S.w * .78, S.y + S.h * .14, "σᵢ(A)", hi, 9.2, "center");
      if (step >= 1) {
        const a1 = step === 1 ? .28 + .72 * e : 1;
        trace(g, S, f0, { color: acc, width: 1.4 * k });
        trace(g, S, f1, { color: gold, width: 1.8 * k });
        trace(g, S, f2, { color: blue, width: 2.0 * k });
        txt(S.x + S.w * .70, S.y + S.h * .44, "φᵢ=σᵢ²/(σᵢ²+λ²)", gold, 9.0, "center", a1);
        txt(S.x + S.w * .19, S.y + S.h * .91, "signal modes retained", green, 8.7, "center", a1);
        txt(S.x + S.w * .80, S.y + S.h * .91, "noise modes suppressed", acc, 8.7, "center", a1);
      }
      const L = { x: W * .58, y: H * .20, w: W * .34, h: H * .27 };
      axes(g, L, { k: Math.max(.80, k), xlabel: "log ‖Ag−c‖", ylabel: "log ‖Lg‖",
        axisColour: mid, labelColour: hi });
      if (step >= 2) {
        const a2 = step === 2 ? .28 + .72 * e : 1;
        g.save(); g.strokeStyle = violet; g.globalAlpha = a2; g.lineWidth = 2.2 * k; g.beginPath();
        for (let i = 0; i <= 80; i++) {
          const u = i / 80, x = L.x + L.w * (.06 + .88 * u);
          const y = L.y + L.h * (.08 + .80 * Math.pow(1 - u, 3.1));
          if (!i) g.moveTo(x, y); else g.lineTo(x, y);
        } g.stroke();
        const px = L.x + L.w * .43, py = L.y + L.h * .23;
        g.fillStyle = gold; g.shadowColor = gold; g.shadowBlur = 10 * k;
        g.beginPath(); g.arc(px, py, 4 * k, 0, TAU); g.fill(); g.restore();
        txt(L.x + L.w * .55, L.y + L.h * .57, "corner: neither residual nor roughness dominates", gold, 8.8, "center", a2);
      }
      const R = { x: W * .58, y: H * .61, w: W * .34, h: H * .22 };
      if (step >= 3) {
        const a3 = .28 + .72 * e;
        txt(R.x, R.y, "resolution matrix", hi, 10.2, "left", a3, 650);
        txt(R.x, H * .68, "Hλ = (AᵀWA+λ²LᵀL)⁻¹AᵀWA", blue, 9.3, "left", a3);
        txt(R.x, H * .75, "diag(Hλ): local recoverability", green, 8.9, "left", a3);
        txt(R.x, H * .82, "off-diagonal spread: temporal blurring", violet, 8.9, "left", a3);
        txt(R.x, H * .89, "cov(ĝλ)=Gλ Σ Gλᵀ: propagated noise", acc, 8.7, "left", a3);
      }
      txt(W * .50, H * .945, "λ changes the estimand: report the operator, penalty, scaling and selection rule", hi, 9.6, "center", 1, 600);
    },
  },

  /** Extended-Tofts compartments and the identifiability regimes they imply. */
  extendedToftsLecture: {
    aspect: 2.30,
    minWidth: 720,
    loop: true,
    revealSteps: 3,
    draw(g, W, H, t, a = {}) {
      const k = a.k ?? 1, step = Math.max(0, Math.min(3, Math.round(Number(a._step ?? 0) || 0)));
      const e = Math.max(0, Math.min(1, Number(a._stepElapsed ?? 0) / .62));
      const hi = cssVar("--hi", "#F9F9F7"), mid = cssVar("--mid", "#97958D"), lo = cssVar("--lo", "#6E6C64");
      const acc = cssVar("--accent", "#D97757"), blue = a.blue || "#6FB8C8";
      const green = a.green || "#7EB892", violet = a.violet || "#A78BFA";
      const txt = (x, y, s, c, size = 9.6, align = "center", alpha = 1, weight = 500) => {
        g.save(); g.globalAlpha = alpha; g.fillStyle = c; g.textAlign = align; g.textBaseline = "middle";
        g.font = `${weight} ${Math.max(10, size * k).toFixed(1)}px ui-monospace, SFMono-Regular, monospace`;
        g.fillText(s, x, y); g.restore();
      };
      txt(W * .50, H * .075, "Cₜ(t)=vᴮCₐ(t)+Kᵗʳᵃⁿˢ∫₀ᵗCₐ(τ)e⁻ᵏᵉᵖ⁽ᵗ⁻τ⁾dτ", hi, 13.0, "center", 1, 650);
      txt(W * .50, H * .125, "kₑₚ = Kᵗʳᵃⁿˢ / vₑ", violet, 10.0);
      const px = W * .19, tx = W * .48, y = H * .42, bw = W * .20, bh = H * .30;
      const box = (x, color, title, sub, alpha) => {
        g.save(); g.globalAlpha = alpha; g.fillStyle = "rgba(18,18,17,.72)"; g.strokeStyle = color;
        g.lineWidth = 1.5 * k; g.beginPath(); g.roundRect(x - bw / 2, y - bh / 2, bw, bh, 12 * k); g.fill(); g.stroke(); g.restore();
        txt(x, y - bh * .20, title, color, 12, "center", alpha, 650);
        txt(x, y + bh * .05, sub, hi, 9.2, "center", alpha);
      };
      box(px, acc, "plasma", "vᴮ · measured input Cₐ", 1);
      const tA = step >= 1 ? (step === 1 ? .30 + .70 * e : 1) : .18;
      box(tx, blue, "EES", "vₑ · well mixed", tA);
      const arrow = (x0, yy, x1, color, lab, alpha, below = false) => {
        g.save(); g.globalAlpha = alpha; g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 2 * k;
        g.beginPath(); g.moveTo(x0, yy); g.lineTo(x1, yy); g.stroke();
        const s = 7 * k, sign = x1 > x0 ? 1 : -1;
        g.beginPath(); g.moveTo(x1, yy); g.lineTo(x1 - sign * s, yy - s * .55); g.lineTo(x1 - sign * s, yy + s * .55); g.closePath(); g.fill(); g.restore();
        txt((x0 + x1) / 2, yy + (below ? 18 : -18) * k, lab, color, 9, "center", alpha, 600);
      };
      arrow(px + bw / 2 + 8 * k, y - 28 * k, tx - bw / 2 - 8 * k, acc, "Kᵗʳᵃⁿˢ", tA);
      arrow(tx - bw / 2 - 8 * k, y + 28 * k, px + bw / 2 + 8 * k, violet, "kₑₚ", tA, true);
      const ox = W * .80, rb = { x: W * .695, y: H * .28, w: W * .23, h: H * .29 };
      if (step >= 2) {
        const a2 = step === 2 ? .30 + .70 * e : 1;
        axes(g, rb, { k: Math.max(.80, k), ylabel: "impulse response",
          axisColour: mid, labelColour: hi });
        const direct = Array.from({ length: 90 }, (_, i) => [i / 89, i < 2 ? 1 : 0]);
        const exch = Array.from({ length: 90 }, (_, i) => [i / 89, Math.exp(-4.0 * i / 89)]);
        trace(g, rb, direct, { color: acc, width: 2.1 * k });
        trace(g, rb, exch, { color: blue, width: 2.1 * k });
        txt(ox, H * .62, "g(t)=vᴮδ(t)+Kᵗʳᵃⁿˢe⁻ᵏᵉᵖᵗ", hi, 10.2, "center", a2, 600);
        txt(ox, H * .68, "direct vascular spike + exchange tail", mid, 8.8, "center", a2);
      }
      if (step >= 3) {
        const a3 = .30 + .70 * e;
        txt(W * .08, H * .78, "IDENTIFIABLE WHEN", green, 9.4, "left", a3, 650);
        txt(W * .08, H * .835, "temporal resolution resolves the vascular spike", hi, 8.2, "left", a3);
        txt(W * .08, H * .88, "and the acquisition samples the exchange tail", hi, 8.2, "left", a3);
        txt(W * .56, H * .78, "DEGENERATE WHEN", acc, 9.4, "left", a3, 650);
        txt(W * .56, H * .835, "Kᵗʳᵃⁿˢ≈0 · kₑₚ window too short", hi, 8.2, "left", a3);
        txt(W * .56, H * .88, "vᴮ ↔ input-scale trade-off", hi, 8.2, "left", a3);
        txt(W * .50, H * .96, "three named parameters do not imply three independently recoverable quantities", violet, 9.1, "center", a3, 600);
      }
    },
  },

  /** The brain itself: silhouette made of the field, arteries over it, bolus running through. */
  brain: {
    aspect: 1.05,
    loop: true,
    draw(g, W, H, t, args = {}) {
      const S = Math.min(W, H / 0.92) * (args.scale ?? 0.94);
      const sx = (W - S) / 2, sy = (H - S * 0.92) / 2;
      const P = brainPath(sx, sy, S);
      g.save();
      seat(g, P);
      fieldFill(g, P, { x: sx, y: sy, w: S, h: S }, t, { gap: Math.max(6, S / 26), strength: 1.25 });
      const v = arteries(sx, sy, S);
      const u = (t * 0.30) % 1.5;
      // the ICA fills first, then the branches — the bolus arrives where the blood does
      vessel(g, v.ica, { width: S * 0.016, head: u * 2.2, conc: 1 });
      for (const k of ["aca", "mca", "pca"]) {
        vessel(g, v[k], { width: S * 0.012, head: (u - 0.30) * 2.0, conc: Math.max(0, Math.min(1, (u - 0.28) * 4)) });
      }
      g.restore();
    },
  },

  /**
   * The whole picture: what goes in, the brain it goes through, and what four tissue classes
   * give back. The bolus travelling up the arteries is the same one that moves the curves.
   */
  inputOutput: {
    aspect: 2.5,
    loop: true,
    draw(g, W, H, t, a = {}) {
      const k = a.k ?? 1;
      const acc = cssVar("--accent", "#D97757"), lo = cssVar("--lo", "#6E6C64");
      const hair = cssVar("--hair", "#33322E");
      const S = H * 0.72, sx = W / 2 - S / 2, sy = H * 0.15;
      const panelW = (W - S) / 2 - W * 0.055;
      const A = { x: W * 0.028, y: H * 0.24, w: panelW, h: H * 0.50 };
      const Bx = { x: W - W * 0.028 - panelW, y: H * 0.24, w: panelW, h: H * 0.50 };

      const cycle = 12;                                  // seconds for one pass
      const u = (t % cycle) / cycle;

      // brain, centre
      const P = brainPath(sx, sy, S);
      seat(g, P);
      fieldFill(g, P, { x: sx, y: sy, w: S, h: S }, t, { gap: Math.max(5.5, S / 24), strength: 1.2 });
      const v = arteries(sx, sy, S);
      vessel(g, v.ica, { width: S * 0.017, head: u * 2.4, conc: 1 });
      for (const k of ["aca", "mca", "pca"])
        vessel(g, v[k], { width: S * 0.013, head: (u - 0.26) * 2.1,
                          conc: Math.max(0, Math.min(1, (u - 0.24) * 4)) });

      // panels
      const ca = aif(320, 600);
      const classes = [
        { name: "cortical GM", vp: 0.62, ki: 0.055 },
        { name: "subcortical GM", vp: 0.44, ki: 0.038 },
        { name: "boundary", vp: 0.38, ki: 0.030 },
        { name: "cortical WM", vp: 0.30, ki: 0.022 },
      ];
      const cts = classes.map((c) => tissue(ca, c.vp, c.ki / 60));
      const ctMax = Math.max(...cts.flat().map((p) => p[1])) || 1;

      g.font = fontOf(k, 11); g.fillStyle = lo;
      g.textAlign = "left"; g.textBaseline = "bottom";
      g.fillText("input function", A.x, A.y - 10);
      g.fillText("output function", Bx.x, Bx.y - 10);

      axes(g, A, { k, xlabel: "time (s)" });
      axes(g, Bx, { k, xlabel: "time (s)" });
      trace(g, A, norm(ca, 600, 1), { color: acc, width: sc(k, 2.2), upto: u, head: true, glow: 0.9 });
      cts.forEach((ct, i) => {
        const c = rampAt(0.35 + i * 0.2);
        trace(g, Bx, norm(ct, 600, ctMax),
              { color: `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`, width: sc(k, 1.7),
                upto: Math.max(0, u - 0.05), head: i === 0 });
      });

      // the dashed leaders, as in the figure this is modelled on
      g.setLineDash([3, 4]); g.strokeStyle = hair; g.lineWidth = 1;
      g.beginPath();
      g.moveTo(A.x + A.w + 6, A.y + A.h * 0.5); g.lineTo(sx + S * 0.44, sy + S * 0.62);
      g.moveTo(Bx.x - 6, Bx.y + Bx.h * 0.4);   g.lineTo(sx + S * 0.72, sy + S * 0.30);
      g.stroke(); g.setLineDash([]);
    },
  },

  /**
   * Study I as a physiological circuit rather than three unrelated plots.
   *
   * The same bolus is visible at three places: the internal carotid supplies C_a(t), a
   * cortical patch produces C_t(t), and the superior sagittal sinus carries a dispersed
   * output. With `revealSteps: 3` the runtime passes `_step` and attention walks from artery
   * to tissue to vein before the whole circuit is lit. Nothing falls below 70% opacity: the
   * audience keeps its map while the presenter points at one part of it.
   */
  perfusionSignals: {
    aspect: 2.12,
    minWidth: 720,
    loop: true,
    draw(g, W, H, t, a = {}) {
      const k = a.k ?? 1;
      const pk = Math.max(0.78, Math.min(1.16, k * 0.76));
      const acc = a.arterialColor || cssVar("--accent", "#D97757");
      const ven = a.venousColor || "#6EA5B8";
      const tissueColor = a.tissueColor || cssVar("--hi", "#F9F9F7");
      const lo = cssVar("--lo", "#6E6C64"), mid = cssVar("--mid", "#97958D");
      const hair = cssVar("--hair", "#33322E");

      const staged = !!a.staged || Number(a.revealSteps || 0) > 0;
      const step = Math.max(0, Math.round(Number(a._step ?? 0) || 0));
      const order = ["arterial", "tissue", "venous", "all"];
      const requested = String(a.focus || "").toLowerCase();
      const aliases = { input: "arterial", aif: "arterial", ca: "arterial",
                        output: "venous", sss: "venous", cv: "venous", ct: "tissue" };
      const focus = aliases[requested] || requested || (staged ? order[Math.min(3, step)] : "all");
      const emphasis = (part) => focus === "all" || focus === part ? 1 : (a.dimOpacity ?? 0.70);
      const ea = emphasis("arterial"), et = emphasis("tissue"), ev = emphasis("venous");

      const cycle = Math.max(6, Number(a.cycleSeconds || 11));
      const u = (t % cycle) / cycle;
      const curveU = Math.min(1, u * 1.12);
      const ca = aif(360, 600);
      const ct = tissue(ca, Number(a.vp ?? 0.44), Number(a.ki ?? 0.049) / 60);
      const cv = vascularOutput(ca, Number(a.venousDelay ?? 22), Number(a.venousDispersion ?? 24));
      const ctPeak = Math.max(...ct.map((p) => p[1])) || 1;
      const caN = norm(ca, 600, 1), ctN = norm(ct, 600, ctPeak), cvN = norm(cv, 600, 1);
      const now = Math.min(ca.length - 1, Math.floor(curveU * (ca.length - 1)));

      /* Beside `brain3d`, anatomy is already doing the spatial work. This mode keeps only the
       * three signals and their direction, so a two-column composition does not show two
       * competing brains. Set a portrait-ish `aspect` (about 0.9) on the block. */
      if (a.curvesOnly) {
        const left = W * 0.17, pw = W * 0.75;
        const entries = [
          { part: "arterial", color: acc, symbol: "Cₐ(t)",
            label: a.arterialLabel || "internal carotid · input", pts: caN },
          { part: "tissue", color: tissueColor, symbol: "Cₜ(t)",
            label: a.tissueLabel || "cortical tissue · response", pts: ctN },
          ...(a.showVenous === false ? [] : [{ part: "venous", color: ven, symbol: "Cᵥ(t)",
            label: a.venousLabel || "SSS · output", pts: cvN }]),
        ];
        const top = H * 0.10, bottom = H * 0.08, row = (H - top - bottom) / entries.length;
        entries.forEach((q, i) => {
          const e = emphasis(q.part);
          const box = { x: left, y: top + row * i + row * 0.19, w: pw, h: row * 0.58 };
          g.save(); g.globalAlpha = e;
          axes(g, box, { k: pk, xlabel: i === entries.length - 1 ? "time" : "",
                         ylabel: q.symbol, axisColour: mid, labelColour: mid,
                         xticks: i === entries.length - 1 ? [[0, "0"], [1, "10 min"]] : null });
          trace(g, box, q.pts, { color: q.color, width: Math.max(1.8, 2.1 * pk),
                                 upto: Math.max(0, curveU - i * 0.025), head: true,
                                 glow: q.part === focus ? 0.72 : 0.16 });
          g.fillStyle = q.color; g.font = fontOf(pk, 11.8);
          g.textAlign = "left"; g.textBaseline = "bottom";
          g.fillText(q.label, box.x, box.y - 8 * pk);
          g.restore();
          if (i < entries.length - 1) {
            const x = W * 0.075;
            leader(g, [x, box.y + box.h * 0.72], [x - W * 0.025, box.y + box.h + row * 0.12],
                   [x, box.y + row * 0.95],
                   { color: entries[i + 1].color, alpha: 0.48, bead: (u * 2.2 + i * 0.22) % 1, k: pk });
          }
        });
        return;
      }

      // One large brain holds the composition together. The plots remain annotations to the
      // anatomy, not three dashboard panels competing with it.
      const S = Math.min(H * 0.96, W * 0.31);
      const sx = W * 0.37, sy = H * 0.055;
      const P = brainPath(sx, sy, S);
      seat(g, P, { fill: 0.68, stroke: 0.68, width: Math.max(1.2, 1.2 * k) });
      fieldFill(g, P, { x: sx, y: sy, w: S, h: S }, t,
                { gap: Math.max(6, S / 27), strength: 1.18 });

      // A few sulcal arcs give the silhouette depth while keeping it diagrammatic.
      g.save(); g.clip(P); g.strokeStyle = hair; g.globalAlpha = 0.42;
      g.lineWidth = Math.max(1, S * 0.0032);
      for (const q of [
        [0.28, 0.27, 0.45, 0.17, 0.58, 0.28],
        [0.51, 0.18, 0.66, 0.18, 0.75, 0.34],
        [0.24, 0.43, 0.40, 0.34, 0.53, 0.45],
        [0.47, 0.50, 0.62, 0.40, 0.75, 0.49],
      ]) {
        g.beginPath(); g.moveTo(sx + q[0] * S, sy + q[1] * S);
        g.quadraticCurveTo(sx + q[2] * S, sy + q[3] * S, sx + q[4] * S, sy + q[5] * S);
        g.stroke();
      }
      g.restore();

      const av = arteries(sx, sy, S);
      const head = (u * 3.05) % 1.42;
      vessel(g, av.ica, { width: S * 0.017, head: head * 1.18, conc: ea,
                          dim: 0.25 + 0.45 * ea });
      for (const key of ["aca", "mca", "pca"]) {
        vessel(g, av[key], { width: S * 0.012, head: (head - 0.27) * 1.16,
                             conc: Math.max(0, Math.min(1, (head - 0.22) * 4)) * ea,
                             dim: 0.18 + 0.34 * ea });
      }

      // Superior sagittal sinus and a cortical draining vein. Both are authored in the same
      // sagittal space, so the tissue-to-output connection is spatially honest.
      const sss = [];
      for (let i = 0; i <= 36; i++) {
        const z = i / 36;
        sss.push([sx + S * (0.27 + 0.53 * z),
                  sy + S * (0.175 - 0.045 * Math.sin(Math.PI * z) + 0.055 * z)]);
      }
      const rx = sx + S * Number(a.regionX ?? 0.675);
      const ry = sy + S * Number(a.regionY ?? 0.39);
      const rr = S * Number(a.regionRadius ?? 0.075);
      const drain = [[rx, ry], [sx + S * 0.70, sy + S * 0.29],
                     [sx + S * 0.72, sy + S * 0.22], sss[Math.floor(sss.length * 0.77)]];
      colouredVessel(g, sss, { color: ven, width: S * 0.011,
                               head: ((u * 2.45) - 0.20) % 1.12, alpha: 0.28 + 0.48 * ev });
      colouredVessel(g, drain, { color: ven, width: S * 0.008,
                                 head: ((u * 3.0) - 0.25) % 1.15, alpha: 0.20 + 0.42 * ev });

      // The tissue sample is a place, not a fourth abstract curve. Its fill follows C_t now.
      const tissueNow = ctN[now]?.[1] || 0;
      g.save(); g.clip(P); g.globalAlpha = 0.34 + 0.60 * et;
      const halo = g.createRadialGradient(rx, ry, 0, rx, ry, rr * 2.0);
      halo.addColorStop(0, `rgba(249,249,247,${0.32 + 0.52 * tissueNow})`);
      halo.addColorStop(0.48, `rgba(217,119,87,${0.16 + 0.36 * tissueNow})`);
      halo.addColorStop(1, "rgba(217,119,87,0)");
      g.fillStyle = halo; g.beginPath(); g.arc(rx, ry, rr * 2.0, 0, TAU); g.fill();
      g.restore();
      g.save(); g.strokeStyle = tissueColor; g.globalAlpha = 0.46 + 0.46 * et;
      g.lineWidth = Math.max(1.2, 1.35 * k);
      g.beginPath(); g.arc(rx, ry, rr * (1 + 0.05 * Math.sin(t * 3.2)), 0, TAU); g.stroke();
      g.restore();

      const A = { x: W * 0.050, y: H * 0.275, w: W * 0.225, h: H * 0.43 };
      const T = { x: W * 0.755, y: H * 0.150, w: W * 0.205, h: H * 0.265 };
      const V = { x: W * 0.755, y: H * 0.610, w: W * 0.205, h: H * 0.245 };

      const plot = (box, pts, part, color, ylabel, upto, headDot) => {
        const e = emphasis(part);
        g.save(); g.globalAlpha = e;
        axes(g, box, { k: pk, xlabel: "time", ylabel, axisColour: mid, labelColour: mid,
                       xticks: [[0, "0"], [1, "10 min"]] });
        trace(g, box, pts, { color, width: Math.max(1.8, 2.0 * pk), upto,
                             head: headDot, glow: part === focus ? 0.72 : 0.18 });
        g.restore();
      };
      plot(A, caN, "arterial", acc, "Cₐ(t)", curveU, true);
      plot(T, ctN, "tissue", tissueColor, "Cₜ(t)", Math.max(0, curveU - 0.025), true);
      if (a.showVenous !== false)
        plot(V, cvN, "venous", ven, "Cᵥ(t)", Math.max(0, curveU - 0.055), true);

      // Local labels are deliberately short: term, anatomical measurement site, nothing else.
      const label = (text, x, y, align, color, alpha) => {
        g.save(); g.fillStyle = color; g.globalAlpha = alpha;
        g.font = fontOf(pk, 12.2); g.textAlign = align; g.textBaseline = "bottom";
        g.fillText(text, x, y); g.restore();
      };
      label(a.arterialLabel || "internal carotid · input", A.x, A.y - 10 * pk, "left", acc, ea);
      label(a.tissueLabel || "cortical tissue · response", T.x, T.y - 10 * pk, "left", tissueColor, et);
      if (a.showVenous !== false)
        label(a.venousLabel || "SSS · output", V.x, V.y - 10 * pk, "left", ven, ev);
      label(a.regionLabel || "tissue sample", rx, ry + rr + 19 * pk, "center", tissueColor, et);

      const beat = (u * 2.25) % 1;
      leader(g, [A.x + A.w + 8 * pk, A.y + A.h * 0.56],
             [W * 0.325, H * 0.69], av.ica[2], { color: acc, alpha: 0.38 + 0.46 * ea, bead: beat, k: pk });
      leader(g, [rx + rr, ry], [W * 0.72, H * 0.20], [T.x - 7 * pk, T.y + T.h * 0.55],
             { color: tissueColor, alpha: 0.35 + 0.43 * et, bead: (beat + 0.28) % 1, k: pk });
      if (a.showVenous !== false)
        leader(g, [sss[sss.length - 1][0], sss[sss.length - 1][1]], [W * 0.72, H * 0.54],
               [V.x - 7 * pk, V.y + V.h * 0.42],
               { color: ven, alpha: 0.35 + 0.44 * ev, bead: (beat + 0.52) % 1, k: pk });
    },
  },

  /**
   * Aggregate desaturation during the Study III challenge, rebuilt as a native plot. The
   * percentile envelopes are points from the Spiral field rather than opaque ribbons, so the
   * cohort spread belongs to the visual language of the deck while the axes remain scientific.
   *
   * Optional `data` rows are `[minute, median, p25, p75, p10, p90]` or objects with those
   * names. If omitted, the declared cohort trajectory from the thesis figure is used.
   */
  hypoxiaTrace: {
    aspect: 1.82,
    minWidth: 620,
    draw(g, W, H, t, a = {}) {
      const k = a.k ?? 1;
      const pk = Math.max(0.78, Math.min(1.22, k * 0.74));
      const acc = a.color || cssVar("--accent", "#D97757");
      const lo = cssVar("--lo", "#6E6C64"), mid = cssVar("--mid", "#97958D");
      const hi = cssVar("--hi", "#F9F9F7");
      const xmin = Number(a.xmin ?? -40), xmax = Number(a.xmax ?? 40);
      const ymin = Number(a.ymin ?? 70), ymax = Number(a.ymax ?? 102);
      const target = Number(a.target ?? 80), onset = Number(a.onset ?? 0);
      const B = { x: W * 0.105, y: H * 0.105, w: W * 0.845, h: H * 0.70 };
      const X = (v) => B.x + (v - xmin) / (xmax - xmin) * B.w;
      const Y = (v) => B.y + B.h - (v - ymin) / (ymax - ymin) * B.h;

      const knots = [
        [-40, 97.2], [-10, 97.0], [-6, 96.7], [-3, 94.5], [0, 90.1],
        [4, 88.6], [8, 85.8], [12, 82.9], [18, 80.8], [24, 80.1],
        [30, 79.5], [35, 78.7], [37, 80.4], [40, 81.0],
      ];
      const lerpKnots = (x) => {
        for (let i = 1; i < knots.length; i++) {
          if (x <= knots[i][0]) {
            const q = (x - knots[i - 1][0]) / (knots[i][0] - knots[i - 1][0]);
            return knots[i - 1][1] + q * (knots[i][1] - knots[i - 1][1]);
          }
        }
        return knots[knots.length - 1][1];
      };
      const generated = [];
      for (let i = 0; i <= 320; i++) {
        const x = xmin + (xmax - xmin) * i / 320;
        const m0 = lerpKnots(x);
        const jitter = (hash01(i, 4, 8) - 0.5) * (x < -6 ? 0.22 : x < 2 ? 0.55 : 0.82);
        const m = m0 + jitter;
        const inner = x < -7 ? 1.05 : 1.55 + Math.min(1.75, Math.max(0, x + 7) * 0.042);
        const outer = x < -7 ? 2.10 : 3.1 + Math.min(3.0, Math.max(0, x + 7) * 0.075);
        generated.push({ x, median: m, p25: m0 - inner, p75: m0 + inner,
                         p10: m0 - outer, p90: m0 + outer });
      }
      const rows = Array.isArray(a.data) && a.data.length ? a.data.map((r) => Array.isArray(r)
        ? { x: +r[0], median: +r[1], p25: +r[2], p75: +r[3], p10: +r[4], p90: +r[5] }
        : { x: +(r.x ?? r.minute), median: +(r.median ?? r.y), p25: +r.p25,
            p75: +r.p75, p10: +r.p10, p90: +r.p90 }) : generated;
      rows.sort((p, q) => p.x - q.x);

      const at = (x, key) => {
        let i = 1;
        while (i < rows.length && rows[i].x < x) i++;
        if (i >= rows.length) return rows[rows.length - 1][key];
        const a0 = rows[i - 1], a1 = rows[i];
        const q = (x - a0.x) / Math.max(1e-6, a1.x - a0.x);
        const v0 = Number.isFinite(a0[key]) ? a0[key] : a0.median;
        const v1 = Number.isFinite(a1[key]) ? a1[key] : a1.median;
        return v0 + q * (v1 - v0);
      };

      // Quiet the live field behind the scientific plotting area so the percentile dots are
      // visibly data rather than being mistaken for the ambient backdrop.
      g.fillStyle = a.plotBackground || "rgba(18,18,17,0.56)";
      g.fillRect(B.x, B.y, B.w, B.h);

      // The two phases are washes on the plotting paper, not framed panels.
      g.fillStyle = a.normoxiaWash || "rgba(92,145,170,0.075)";
      g.fillRect(B.x, B.y, Math.max(0, X(onset) - B.x), B.h);
      g.fillStyle = a.hypoxiaWash || "rgba(180,70,58,0.065)";
      g.fillRect(X(onset), B.y, B.x + B.w - X(onset), B.h);

      // One reveal clock for both the percentile field and the median.  The band describes
      // uncertainty at the same observations; it must never outrun the measured trajectory.
      const revealUpto = Math.max(0, Math.min(1, (t - 0.12) / 0.92));
      const gap = Math.max(5.2, 6.7 * pk);
      const xLimit = B.x + B.w * revealUpto;
      const dotRgb = a.bandColor || "224,119,96";
      for (let ix = 0, px = B.x + gap * 0.5; px <= xLimit; ix++, px += gap) {
        const xv = xmin + (px - B.x) / B.w * (xmax - xmin);
        const p10 = at(xv, "p10"), p90 = at(xv, "p90");
        const p25 = at(xv, "p25"), p75 = at(xv, "p75");
        const py0 = Math.max(B.y, Y(p90)), py1 = Math.min(B.y + B.h, Y(p10));
        for (let iy = 0, py = py0; py <= py1; iy++, py += gap) {
          const yv = ymax - (py - B.y) / B.h * (ymax - ymin);
          const inner = yv >= p25 && yv <= p75;
          const keep = inner ? 0.76 : 0.29;
          if (hash01(ix, iy, inner ? 7 : 3) > keep) continue;
          const jx = (hash01(ix, iy, 13) - 0.5) * gap * 0.48;
          const jy = (hash01(ix, iy, 19) - 0.5) * gap * 0.42;
          g.fillStyle = `rgba(${dotRgb},${inner ? 0.46 : 0.24})`;
          g.beginPath(); g.arc(px + jx, py + jy, (inner ? 1.30 : 0.94) * pk, 0, TAU); g.fill();
        }
      }

      // Reference lines precede the data, so neither hides the median.
      g.save(); g.strokeStyle = mid; g.globalAlpha = 0.72;
      g.lineWidth = Math.max(1, 1.0 * pk); g.setLineDash([5 * pk, 5 * pk]);
      g.beginPath(); g.moveTo(B.x, Y(target)); g.lineTo(B.x + B.w, Y(target)); g.stroke();
      g.beginPath(); g.moveTo(X(onset), B.y); g.lineTo(X(onset), B.y + B.h); g.stroke();
      g.restore();

      axes(g, B, { k: pk, xlabel: "time since hypoxia onset (min)",
                    ylabel: "SpO₂ (%)", axisColour: mid, labelColour: mid,
                    xticks: [[0.125, "−30"], [0.25, "−20"], [0.375, "−10"],
                             [0.5, "0"], [0.625, "10"], [0.75, "20"], [0.875, "30"]],
                    yticks: [[0, "70"], [0.15625, "75"], [0.3125, "80"],
                             [0.46875, "85"], [0.625, "90"], [0.78125, "95"],
                             [0.9375, "100"]] });

      const medianPts = rows.map((r) => [(r.x - xmin) / (xmax - xmin),
                                          (r.median - ymin) / (ymax - ymin)]);
      const lineUpto = revealUpto;
      trace(g, B, medianPts, { color: acc, width: Math.max(2.5, 2.70 * pk),
                               upto: lineUpto, head: lineUpto < 0.99, glow: 0.56 });

      g.save(); g.font = fontOf(pk, 12.2); g.textBaseline = "bottom";
      g.textAlign = "center";
      g.fillStyle = a.normoxiaLabelColor || "#7FA6B7";
      g.fillText(a.normoxiaLabel || "normoxia", (B.x + X(onset)) / 2, B.y - 10 * pk);
      g.fillStyle = a.hypoxiaLabelColor || acc;
      g.fillText(a.hypoxiaLabel || "hypoxia", (X(onset) + B.x + B.w) / 2, B.y - 10 * pk);
      g.font = fontOf(pk, 10.5); g.textBaseline = "bottom"; g.textAlign = "right";
      g.fillStyle = mid; g.fillText(`${target}% target`, B.x + B.w, Y(target) - 5 * pk);

      // A restrained inline legend: two dot weights and the measured trend.
      const ly = H * 0.955, lx = B.x + B.w * 0.08;
      g.textAlign = "left"; g.textBaseline = "middle"; g.font = fontOf(pk, 10.5);
      const legendDot = (x, strong) => {
        for (let j = 0; j < (strong ? 7 : 4); j++) {
        g.fillStyle = `rgba(${dotRgb},${strong ? 0.48 : 0.26})`;
          g.beginPath(); g.arc(x + (j % 4) * 4.0 * pk, ly + (j > 3 ? 3.5 : 0) * pk,
                               (strong ? 1.05 : 0.78) * pk, 0, TAU); g.fill();
        }
      };
      legendDot(lx, false); g.fillStyle = mid; g.fillText("10–90 percentile", lx + 22 * pk, ly);
      const lx2 = lx + B.w * 0.31;
      legendDot(lx2, true); g.fillStyle = mid; g.fillText("25–75 percentile", lx2 + 22 * pk, ly);
      const lx3 = lx + B.w * 0.62;
      g.strokeStyle = acc; g.lineWidth = 2.4 * pk; g.beginPath();
      g.moveTo(lx3, ly); g.lineTo(lx3 + 18 * pk, ly); g.stroke();
      g.fillStyle = mid; g.fillText("cohort median", lx3 + 24 * pk, ly);
      g.restore();
    },
  },

  /**
   * Participant accounting from the thesis flow diagram.  Tiny human silhouettes disappear
   * only at the branch where their exclusion occurred; reasons and denominators therefore
   * stay attached to the actual loss rather than being collapsed into a generic funnel.
   */
  cohortFlow: {
    aspect: 2.30,
    loop: true,
    minWidth: 760,
    revealSteps: 4,
    draw(g, W, H, t, a = {}) {
      const k = a.k ?? 1, step = Math.max(0, Math.min(4, Math.round(Number(a._step ?? 0) || 0)));
      const q = Math.max(0, Math.min(1, Number(a._stepElapsed ?? 0) / .68));
      const ease = q * q * (3 - 2 * q);
      const hi = cssVar("--hi", "#F9F9F7"), mid = cssVar("--mid", "#97958D"), lo = cssVar("--lo", "#6E6C64");
      const hair = cssVar("--hair", "#33322E"), patient = a.patientColor || "#D97757";
      const control = a.controlColor || "#6FB8C8", gold = a.gold || "#E8BE55";
      const txt = (x, y, text, color, size = 9.5, align = "left", alpha = 1, weight = 500) => {
        g.save(); g.globalAlpha = alpha; g.fillStyle = color; g.textAlign = align; g.textBaseline = "middle";
        g.font = `${weight} ${Math.max(10, size * k).toFixed(1)}px ui-monospace, SFMono-Regular, monospace`;
        g.fillText(text, x, y); g.restore();
      };
      const person = (x, y, color, alpha, s = 1) => {
        g.save(); g.strokeStyle = color; g.fillStyle = color; g.globalAlpha = alpha;
        g.lineWidth = Math.max(.8, 1.1 * k * s); g.lineCap = "round";
        g.beginPath(); g.arc(x, y - 3.1 * k * s, 1.6 * k * s, 0, TAU); g.fill();
        g.beginPath(); g.moveTo(x, y - 1.1 * k * s); g.lineTo(x, y + 4.6 * k * s);
        g.moveTo(x - 3.0 * k * s, y + .8 * k * s); g.lineTo(x + 3.0 * k * s, y + .8 * k * s);
        g.moveTo(x, y + 4.3 * k * s); g.lineTo(x - 2.5 * k * s, y + 8.0 * k * s);
        g.moveTo(x, y + 4.3 * k * s); g.lineTo(x + 2.5 * k * s, y + 8.0 * k * s); g.stroke(); g.restore();
      };
      const node = (x, y, n, title, color, alpha = 1, radius = 24) => {
        g.save(); g.globalAlpha = alpha; g.fillStyle = "rgba(18,18,17,.84)"; g.strokeStyle = color;
        g.lineWidth = 1.45 * k; g.beginPath(); g.arc(x, y, radius * k, 0, TAU); g.fill(); g.stroke(); g.restore();
        txt(x, y - 3 * k, String(n), color, 16, "center", alpha, 650);
        txt(x, y + (radius + 9) * k, title, hi, 7.4, "center", alpha);
      };
      const edge = (x0, y0, x1, y1, color, alpha = 1) => {
        g.save(); g.globalAlpha = alpha; g.strokeStyle = color; g.lineWidth = Math.max(1.1, 1.35 * k);
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.restore();
      };
      const loss = (x, y, n, reason, alpha) => {
        txt(x, y, `−${n}`, lo, 9.5, "center", alpha, 650);
        txt(x, y - 16 * k, reason, lo, 7.2, "center", alpha);
      };
      const stageA = (n) => step > n ? 1 : step === n ? .28 + .72 * ease : 0;

      // Shared participant cohort: every exclusion is visible as a person turning grey.
      txt(W * .04, H * .055, "REPCon PPCS cohort", mid, 8.5);
      txt(W * .04, H * .105, "70 enrolled", hi, 13, "left", 1, 650);
      const gx = W * .04, gy = H * .17, dx = W * .0150, dy = H * .044;
      for (let i = 0; i < 70; i++) {
        const col = i % 14, row = Math.floor(i / 14), excluded = i >= 60;
        const fade = excluded && step >= 1 ? 1 - .78 * ease : 1;
        person(gx + col * dx, gy + row * dy, excluded && step >= 1 ? lo : patient, .88 * fade, .78);
      }
      const a1 = stageA(1);
      edge(W * .255, H * .25, W * .295, H * .25, patient, a1);
      node(W * .32, H * .25, 60, "attended baseline", patient, a1, 21);
      loss(W * .27, H * .20, 10, "did not attend", a1);

      // Both patient routes branch together; their distinct control sources arrive one click later.
      const dceA = stageA(2), yD = H * .24;
      txt(W * .40, H * .055, "STUDY II · DCE-MRI", patient, 9.3, "left", dceA, 650);
      edge(W * .34, H * .25, W * .43, yD, patient, dceA);
      edge(W * .49, yD, W * .58, yD, patient, dceA);
      edge(W * .64, yD, W * .73, yD, patient, dceA);
      node(W * .46, yD, 57, "DCE acquired", patient, dceA, 18);
      node(W * .61, yD, 47, "after QC", patient, dceA, 18);
      node(W * .76, yD, 46, "PPCS analysed", patient, dceA, 19);
      loss(W * .405, H * .17, 3, "incomplete DCE", dceA);
      loss(W * .535, H * .17, 10, "signal-quality QC", dceA);
      loss(W * .685, H * .17, 1, "signal-quality QC", dceA);
      const controlsA = stageA(3);
      txt(W * .895, H * .31, "Study II controls", lo, 7.2, "center", controlsA);
      txt(W * .895, H * .355, "6 signal-QC exclusions", lo, 6.8, "center", controlsA);
      edge(W * .865, H * .42, W * .925, H * .42, control, controlsA);
      node(W * .84, H * .42, 21, "control DCE", control, controlsA, 16);
      node(W * .95, H * .42, 15, "HC analysed", control, controlsA, 16);

      // Hypoxia route: separate session and separate historical control cohort.
      const hypA = stageA(2), yH = H * .67;
      txt(W * .40, H * .51, "STUDY III · CONTROLLED HYPOXIA", gold, 9.3, "left", hypA, 650);
      edge(W * .34, H * .27, W * .45, yH, patient, hypA);
      edge(W * .51, yH, W * .63, yH, patient, hypA);
      node(W * .48, yH, 52, "completed hypoxia", patient, hypA, 18);
      node(W * .66, yH, 45, "PPCS session set", patient, hypA, 19);
      loss(W * .405, H * .61, 8, "did not complete", hypA);
      loss(W * .57, H * .61, 7, "anomalous MRI sessions", hypA);
      node(W * .92, yH, 47, "HC session set", control, controlsA, 19);
      txt(W * .92, H * .56, "historical controls", lo, 7.3, "center", controlsA);

      // Metric-level denominators; reactivity requires sufficient desaturation.
      const metA = stageA(4), yM = H * .865;
      const endpoints = [
        [W * .48, "CBF", "PPCS 41 · Δ 39", "HC 47", gold],
        [W * .68, "CMRO₂", "PPCS 41 · Δ 39", "HC 47", control],
        [W * .88, "lactate", "PPCS 38 · Δ 35", "HC 17 · Δ 16", "#A78BFA"],
      ];
      for (const [x, title, ppcs, hc, color] of endpoints) {
        txt(x, yM, title, color, 10.2, "center", metA, 650);
        txt(x, H * .925, ppcs, hi, 7.2, "center", metA);
        txt(x, H * .975, hc, control, 7.2, "center", metA);
      }
      txt(W * .075, H * .96, "two control cohorts—not matched", lo, 7.6, "left", controlsA, 600);
    },
  },

  /** Attendance is the first consequence of the shared 70-person baseline. The grid is
   * deliberately identical to the final frame of repconBaselineFrame. */
  cohortAttendance: {
    aspect: 1.7777778,
    loop: true,
    minWidth: 760,
    revealSteps: 0,
    draw(g,W,H,t,a={}){
      const k=a.k??1,hi=cssVar("--hi","#F9F9F7"),mid=cssVar("--mid","#97958D"),lo=cssVar("--lo","#6E6C64");
      const patient=a.patientColor||"#F06A3C";
      const txt=(s,x,y,color=hi,size=9,align="center",alpha=1,weight=520,family="ui-monospace, SFMono-Regular, monospace")=>{
        g.save();g.fillStyle=color;g.globalAlpha=alpha;g.textAlign=align;g.textBaseline="middle";
        g.font=`${weight} ${Math.max(9,size*k).toFixed(1)}px ${family}`;g.fillText(s,x,y);g.restore();
      };
      const glyph=(x,y,color,alpha=.98,scale=.52)=>{
        const s=scale*k;g.save();g.fillStyle=color;g.globalAlpha=alpha;
        g.beginPath();g.arc(x,y-7.3*s,4.6*s,0,TAU);g.fill();
        g.beginPath();g.roundRect(x-6.2*s,y-1.4*s,12.4*s,18.5*s,2*s);g.fill();
        g.fillRect(x-5.2*s,y+13.5*s,4.2*s,13.5*s);g.fillRect(x+1.0*s,y+13.5*s,4.2*s,13.5*s);g.restore();
      };
      txt("REPCon cohort",W*.055,H*.085,hi,19.5,"left",1,500,"Georgia, 'Times New Roman', serif");
      for(let i=0;i<70;i++){
        const x=W*.305+(i%14)*W*.0300,y=H*.315+Math.floor(i/14)*H*.090;
        glyph(x,y,i<60?patient:lo,i<60?.98:.38);
      }
      txt("60 attended baseline",W*.405,H*.835,patient,7.2,"center",1,650);
      txt("10 did not attend",W*.665,H*.835,mid,7.2,"center",1,600);
    },
  },

  /** People-only cohort account. Every mark is one participant; data/QC exclusions retain
   * their position, turn grey, and receive a red lightning mark. */
  cohortPeople: {
    aspect: 2.30,
    loop: true,
    minWidth: 760,
    revealSteps: 5,
    draw(g, W, H, t, a = {}) {
      const k = a.k ?? 1, step = Math.max(0, Math.min(5, Math.round(Number(a._step ?? 0) || 0)));
      const q = Math.max(0, Math.min(1, Number(a._stepElapsed ?? 0) / .48));
      const enter = q * q * (3 - 2 * q), hi = cssVar("--hi", "#F9F9F7"), mid = cssVar("--mid", "#97958D");
      const lo = cssVar("--lo", "#6E6C64"), patient = a.patientColor || "#D97757", control = a.controlColor || "#6FB8C8";
      const qcRed = a.qcColor || "#ff4f62";
      // Begin loading from the first cohort state, so the evidence overlay is instant when
      // the presenter reaches it several clicks later.
      const qcImage = raster(a.qcImage);
      const qcImageSecond = raster(a.qcImageSecond);
      const txt = (value,x,y,color,size,align="left",family="ui-monospace, SFMono-Regular, monospace",alpha=1,weight=500) => {
        g.save(); g.fillStyle=color; g.globalAlpha=alpha; g.textAlign=align; g.textBaseline="middle";
        g.font=`${weight} ${Math.max(9,size*k).toFixed(1)}px ${family}`; g.fillText(value,x,y); g.restore();
      };
      const glyph = (x,y,color,alpha,scale=1) => {
        const u=scale*k; g.save(); g.fillStyle=color; g.globalAlpha=alpha;
        g.beginPath(); g.arc(x,y-7.3*u,4.6*u,0,TAU); g.fill();
        g.beginPath(); g.roundRect(x-6.2*u,y-1.4*u,12.4*u,18.5*u,2.0*u); g.fill();
        g.fillRect(x-5.2*u,y+13.5*u,4.2*u,13.5*u); g.fillRect(x+1.0*u,y+13.5*u,4.2*u,13.5*u);
        g.restore();
      };
      const bolt = (x,y,alpha,scale=1) => {
        const u=scale*k; g.save(); g.fillStyle=qcRed; g.globalAlpha=alpha;
        g.textAlign="center"; g.textBaseline="middle";
        g.shadowColor="rgba(0,0,0,.92)";g.shadowBlur=3.5*u;
        g.font=`800 ${Math.max(8,7.8*u).toFixed(1)}px ui-sans-serif, system-ui, sans-serif`;
        g.fillText("ϟ",x,y+5.2*u); g.restore();
      };
      // State 0 preserves the complete pre-QC acquisition/session sets. State 1 removes only
      // data/QC failures; non-attendance/non-completion stays grey without a lightning mark.
      {
        const a2=1;
        const studyIIPre=i=>i<60;
        const studyIIFinal=i=>i<46;
        const studyIIIPre=i=>i<43||(i>=46&&i<55);
        const studyIIIFinal=i=>i<36||(i>=46&&i<55);
        const patientQc=step===1?enter:step>1?1:0;
        txt("STUDY II · 60",W*.275,H*.090,patient,15,"center","ui-monospace, SFMono-Regular, monospace",a2*(1-patientQc),650);
        txt("STUDY III · 52",W*.725,H*.090,patient,15,"center","ui-monospace, SFMono-Regular, monospace",a2*(1-patientQc),650);
        txt("STUDY II · 46",W*.275,H*.090,patient,15,"center","ui-monospace, SFMono-Regular, monospace",a2*patientQc,650);
        txt("STUDY III · 45",W*.725,H*.090,patient,15,"center","ui-monospace, SFMono-Regular, monospace",a2*patientQc,650);
        const drawPatientGrid=(x0,pre,final)=>{
          for(let i=0;i<70;i++){
            const x=x0+(i%14)*W*.0245,y=H*.205+Math.floor(i/14)*H*.075;
            const wasIn=pre(i),isIn=final(i),isQc=wasIn&&!isIn;
            if(isQc){
              glyph(x,y,patient,.98*(1-patientQc),.62);
              glyph(x,y,lo,.34*patientQc,.62);
              if(patientQc>0)bolt(x,y,.96*patientQc,.62);
            }else glyph(x,y,wasIn?patient:lo,wasIn?.98:.34,.62);
          }
        };
        drawPatientGrid(W*.105,studyIIPre,studyIIFinal);
        drawPatientGrid(W*.555,studyIIIPre,studyIIIFinal);
        if(patientQc>0){
          txt("14 incomplete / signal / QC exclusions",W*.275,H*.585,qcRed,8.2,"center","ui-monospace, SFMono-Regular, monospace",patientQc,650);
          txt("7 unusable or anomalous MRI sessions",W*.725,H*.585,qcRed,8.2,"center","ui-monospace, SFMono-Regular, monospace",patientQc,650);
        }

        // Show both complete control sets beside the complete patient acquisition sets, then
        // apply every data/QC exclusion together on the following click.
        {
          const controlsA=1;
          const controlQc=step===1?enter:step>1?1:0;
          txt("21 CONTROLS",W*.275,H*.655,control,11,"center","ui-monospace, SFMono-Regular, monospace",controlsA*(1-controlQc),650);
          txt("15 CONTROLS",W*.275,H*.655,control,11,"center","ui-monospace, SFMono-Regular, monospace",controlsA*controlQc,650);
          txt("47 CONTROLS",W*.725,H*.655,control,11,"center","ui-monospace, SFMono-Regular, monospace",controlsA,650);
          const leftX=W*.185,leftY=H*.745,leftDx=W*.030,leftDy=H*.070;
          for(let i=0;i<21;i++){
            const x=leftX+(i%7)*leftDx,y=leftY+Math.floor(i/7)*leftDy;
            if(i<15)glyph(x,y,control,.98*controlsA,.54);
            else{
              glyph(x,y,control,.98*controlsA*(1-controlQc),.54);
              glyph(x,y,lo,.34*controlsA*controlQc,.54);
              if(controlQc>0)bolt(x,y,.96*controlsA*controlQc,.54);
            }
          }
          for(let i=0;i<47;i++)glyph(W*.615+(i%10)*W*.0245,H*.725+Math.floor(i/10)*H*.052,control,.98*controlsA,.47);
          if(controlQc>0)txt("6 excluded after DCE quality review",W*.275,H*.955,qcRed,8.2,"center","ui-monospace, SFMono-Regular, monospace",controlQc,650);
        }
      }

      // The user-supplied QC screenshot is a full-canvas evidence overlay.  It is shown after
      // QC, disappears back to the cohort, then the second supplied image appears on the very
      // next click and disappears once more.
      if(step===2||step===4){
        const image=step===4?qcImageSecond:qcImage;
        g.save();
        if(image?.complete&&image.naturalWidth){
          const scale=Math.min(W*.98/image.naturalWidth,H*.98/image.naturalHeight);
          const dw=image.naturalWidth*scale,dh=image.naturalHeight*scale,x=(W-dw)/2,y=(H-dh)/2;
          g.globalAlpha=enter; g.shadowColor="rgba(0,0,0,.98)"; g.shadowBlur=38*k; g.shadowOffsetY=12*k;
          g.drawImage(image,x,y,dw,dh);
        }
        g.restore();
      }
    },
  },

  /** The REPCon trial as one continuous patient journey rather than a flow diagram. */
  repconBaselineFrame: {
    aspect: 2.36,
    loop: true,
    minWidth: 760,
    revealSteps: 10,
    draw(g,W,H,t,a={}){
      a._autoAdvanceStep=null;
      const k=a.k??1,eligibility=!!a.eligibilitySteps;
      const routeStep=Math.max(0,Math.min(eligibility?12:10,Math.round(Number(a._step??0)||0)));
      const elapsed=Math.max(0,Number(a._stepElapsed??0));
      if(eligibility&&(routeStep===1||routeStep===2)){
        drawRepconEligibility(g,W,H,{step:routeStep,elapsed,k,hi:cssVar("--hi","#F9F9F7")});
        return;
      }
      // Keep the participant journey's internal states and animation clocks unchanged.
      // Only authored routes move around the two click-held eligibility asides.
      const step=eligibility&&routeStep>=3?routeStep-2:routeStep;
      const duration=step===1?9.7:step===3?3.6:step===4?6.4:step===6?10.5:step===7?9.7:step===9?10.5:.85;
      const u=Math.max(0,Math.min(1,elapsed/duration));
      const smooth=v=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
      // Give the card/block shuffle its own readable beat.  The cohort gathers into seven
      // moving decks, the decks visibly cross and hold, and only then do people settle into
      // the two arms.  This is an extra shuffle after the multispiral, not a replacement for it.
      const enter=smooth(u),randomCards=smooth((u-.04)/.58),randomSettle=smooth((u-.78)/.18);
      const hi=cssVar("--hi","#F9F9F7"),mid=cssVar("--mid","#97958D"),lo=cssVar("--lo","#6E6C64");
      const patient=a.patientColor||"#F06A3C",control=a.controlColor||"#3C9DF3",gold=a.gold||"#E8BE55";
      const physical=a.physicalColor||"#70C89B",studyTwo=a.studyTwoColor||"#A78BFA";
      const txt=(s,x,y,color=hi,size=9,align="center",alpha=1,weight=520,family="ui-monospace, SFMono-Regular, monospace")=>{
        g.save();g.fillStyle=color;g.globalAlpha=alpha;g.textAlign=align;g.textBaseline="middle";
        g.font=`${weight} ${Math.max(9,size*k).toFixed(1)}px ${family}`;g.fillText(s,x,y);g.restore();
      };
      const glyph=(x,y,color,alpha=.98,scale=.62,phase=0)=>{
        const s=scale*k,bob=Math.abs(Math.sin(phase))*1.15*s;
        g.save();g.translate(0,-bob);g.fillStyle=color;g.globalAlpha=alpha;
        g.beginPath();g.arc(x,y-7.3*s,4.6*s,0,TAU);g.fill();
        g.beginPath();g.roundRect(x-6.2*s,y-1.4*s,12.4*s,18.5*s,2*s);g.fill();
        const swing=Math.sin(phase)*2.1*s;
        g.beginPath();g.moveTo(x-3.0*s,y+13.5*s);g.lineTo(x-3.0*s-swing*.28,y+26.5*s);
        g.moveTo(x+3.0*s,y+13.5*s);g.lineTo(x+3.0*s+swing*.28,y+26.5*s);
        g.lineWidth=4.2*s;g.lineCap="butt";g.strokeStyle=color;g.stroke();g.restore();
      };
      const line=(x0,y0,x1,y1,color,alpha=.5,width=1)=>{
        g.save();g.strokeStyle=color;g.globalAlpha=alpha;g.lineWidth=Math.max(1,width*k);g.lineCap="round";
        g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke();g.restore();
      };
      const bike=(x,y,color,alpha=1,scale=1,motion=t*5.6)=>{
        const s=scale*k,spin=-motion;
        g.save();g.translate(x,y);g.scale(-1,1);g.strokeStyle=color;g.fillStyle=color;g.globalAlpha=alpha;
        g.lineWidth=Math.max(1.2,1.45*s);g.lineCap="round";g.lineJoin="round";
        for(const wx of [-23,23]){
          g.beginPath();g.arc(wx*s,10*s,15*s,0,TAU);g.stroke();
          g.save();g.translate(wx*s,10*s);g.rotate(spin);g.globalAlpha=.55*alpha;
          for(let r=0;r<8;r++){const a0=r*TAU/8;g.beginPath();g.moveTo(0,0);g.lineTo(Math.cos(a0)*14*s,Math.sin(a0)*14*s);g.stroke();}g.restore();
        }
        // Frame, fork, handlebars and saddle: a moving bicycle with no rider.
        g.beginPath();g.moveTo(-23*s,10*s);g.lineTo(-7*s,-10*s);g.lineTo(7*s,10*s);g.lineTo(-23*s,10*s);g.moveTo(-7*s,-10*s);g.lineTo(9*s,-10*s);g.lineTo(23*s,10*s);g.moveTo(9*s,-10*s);g.lineTo(15*s,-22*s);g.lineTo(23*s,-22*s);g.moveTo(-7*s,-10*s);g.lineTo(-3*s,-19*s);g.stroke();
        g.beginPath();g.moveTo(-9*s,-19*s);g.lineTo(2*s,-19*s);g.stroke();
        g.save();g.translate(7*s,10*s);g.rotate(spin);g.beginPath();g.arc(0,0,4.2*s,0,TAU);g.stroke();g.beginPath();g.moveTo(-8*s,0);g.lineTo(8*s,0);g.stroke();g.restore();
        g.restore();
      };
      const usualLife=(x,y,color,alpha=1,scale=1,motion=t*4.2)=>{
        const s=scale*k,walk=motion;
        // One ordinary walk and one recognisably seated figure; both stay deliberately quiet.
        g.save();g.translate(x-30*s,y+Math.abs(Math.sin(walk))*1.4*s);g.strokeStyle=color;g.fillStyle=color;g.globalAlpha=alpha;
        g.lineWidth=Math.max(1.1,1.4*s);g.lineCap="round";
        g.beginPath();g.arc(0,-21*s,4.2*s,0,TAU);g.fill();
        g.beginPath();g.moveTo(0,-16*s);g.lineTo(0,3*s);g.moveTo(0,-8*s);g.lineTo(-10*s,-1*s);g.moveTo(0,-8*s);g.lineTo(10*s,-3*s);
        g.moveTo(0,3*s);g.lineTo((-8-3*Math.sin(walk))*s,17*s);g.moveTo(0,3*s);g.lineTo((8+3*Math.sin(walk))*s,17*s);g.stroke();g.restore();
        g.save();g.translate(x+26*s,y);g.strokeStyle=color;g.fillStyle=color;g.globalAlpha=alpha;g.lineWidth=Math.max(1.1,1.45*s);g.lineCap="round";g.lineJoin="round";
        // chair: back, seat and two legs
        g.beginPath();g.moveTo(-9*s,-10*s);g.lineTo(-9*s,19*s);g.moveTo(-9*s,5*s);g.lineTo(15*s,5*s);g.moveTo(-6*s,5*s);g.lineTo(-6*s,20*s);g.moveTo(12*s,5*s);g.lineTo(12*s,20*s);g.stroke();
        // seated person: upright torso, horizontal thigh, vertical shin
        g.beginPath();g.arc(-1*s,-21*s,4.2*s,0,TAU);g.fill();
        g.beginPath();g.moveTo(-1*s,-16*s);g.lineTo(0,0);g.lineTo(10*s,5*s);g.lineTo(10*s,18*s);
        g.moveTo(-1*s,-8*s);g.lineTo(9*s,-2*s);g.stroke();g.restore();
      };
      const testingPath=(scannerX,p,start,end)=>{
        const official={x:scannerX-W*.110,y:H*.545},scan={x:scannerX,y:H*.545};
        if(p<.20){const q=smooth(p/.20);return{x:mix(start.x,official.x,q),y:mix(start.y,official.y,q)};}
        if(p<.34)return official;
        if(p<.50){const q=smooth((p-.34)/.16);return{x:mix(official.x,scan.x,q),y:official.y};}
        if(p<.70)return scan;
        const q=smooth((p-.70)/.30);return{x:mix(scan.x,end.x,q),y:mix(scan.y,end.y,q)};
      };
      const testingStation=(x,alpha,active=true)=>{
        if(alpha<=.001)return;

        // The bureaucrat: glasses, tie, clipboard, and an endlessly over-serious stamp.
        const bx=x-W*.060,by=H*.535,stamp=active?Math.abs(Math.sin(t*5.6)):0;
        g.save();g.globalAlpha=alpha;g.strokeStyle=mid;g.fillStyle=mid;g.lineWidth=Math.max(1,1.25*k);g.lineCap="round";g.lineJoin="round";
        g.beginPath();g.arc(bx,by-H*.062,4.6*k,0,TAU);g.fill();
        g.beginPath();g.roundRect(bx-6.3*k,by-H*.047,12.6*k,H*.084,3*k);g.stroke();
        g.beginPath();g.arc(bx-2.1*k,by-H*.063,1.8*k,0,TAU);g.arc(bx+2.1*k,by-H*.063,1.8*k,0,TAU);g.moveTo(bx-.35*k,by-H*.063);g.lineTo(bx+.35*k,by-H*.063);g.stroke();
        g.strokeStyle=physical;g.beginPath();g.moveTo(bx,by-H*.043);g.lineTo(bx-1.8*k,by-H*.029);g.lineTo(bx+1.8*k,by-H*.029);g.closePath();g.stroke();
        const clipX=bx+W*.025,clipY=by-H*.022;
        g.strokeStyle=hi;g.globalAlpha=.82*alpha;g.beginPath();g.roundRect(clipX-7*k,clipY-16*k,14*k,25*k,1.5*k);g.stroke();
        g.strokeStyle=mid;g.beginPath();for(let j=0;j<3;j++){g.moveTo(clipX-4.5*k,clipY-9*k+j*6*k);g.lineTo(clipX+3.5*k,clipY-9*k+j*6*k);}g.stroke();
        g.strokeStyle=patient;g.beginPath();g.moveTo(clipX+6*k,clipY-18*k-stamp*4*k);g.lineTo(clipX+6*k,clipY-9*k-stamp*4*k);g.stroke();g.restore();

        // A deliberately theatrical top-to-toe scanner: overhead dome, tractor cone and sweep.
        const top=H*.500,bottom=H*.590,beamY=mix(top+H*.010,bottom-H*.010,active?(t*1.05)%1:.50);
        g.save();g.globalAlpha=.12*alpha;
        const beam=g.createLinearGradient(x,top,x,bottom);beam.addColorStop(0,physical);beam.addColorStop(1,"rgba(112,200,155,0)");
        g.fillStyle=beam;g.beginPath();g.moveTo(x-W*.010,top);g.lineTo(x+W*.010,top);g.lineTo(x+W*.016,bottom);g.lineTo(x-W*.016,bottom);g.closePath();g.fill();
        g.globalAlpha=.72*alpha;g.strokeStyle=physical;g.lineWidth=Math.max(1,1.2*k);g.beginPath();g.ellipse(x,top,W*.011,H*.009,0,Math.PI,TAU);g.stroke();
        g.beginPath();g.moveTo(x-W*.011,top);g.lineTo(x-W*.016,bottom);g.moveTo(x+W*.011,top);g.lineTo(x+W*.016,bottom);g.stroke();
        g.shadowColor=physical;g.shadowBlur=10*k;g.globalAlpha=.82*alpha;g.beginPath();g.moveTo(x-W*.014,beamY);g.lineTo(x+W*.014,beamY);g.stroke();g.restore();

        txt("BCBT",x-W*.019,H*.657,physical,6.0,"right",alpha,650);
        txt("MRI",x+W*.019,H*.657,studyTwo,6.0,"left",alpha,650);
      };
      const celestialCycle=(alpha,clock=t*.62)=>{
        if(alpha<=.001)return;
        for(let j=0;j<8;j++){
          const q=(clock+j/8)%1,x=mix(W*.31,W*.78,q),y=H*(.062-.022*Math.sin(q*Math.PI)),fade=Math.sin(q*Math.PI);
          g.save();g.translate(x,y);g.globalAlpha=.72*alpha*fade;g.strokeStyle=j%2?studyTwo:gold;g.fillStyle=j%2?studyTwo:gold;g.lineWidth=Math.max(1,1.05*k);
          if(j%2===0){
            g.beginPath();g.arc(0,0,3.6*k,0,TAU);g.fill();
            for(let r=0;r<8;r++){const a0=r*TAU/8;g.beginPath();g.moveTo(Math.cos(a0)*5.2*k,Math.sin(a0)*5.2*k);g.lineTo(Math.cos(a0)*8*k,Math.sin(a0)*8*k);g.stroke();}
          }else{
            g.beginPath();g.arc(0,0,5.2*k,-Math.PI*.44,Math.PI*.44);g.arc(2.7*k,0,4.6*k,Math.PI*.48,-Math.PI*.48,true);g.closePath();g.fill();
          }
          g.restore();
        }
      };
      const introPoint=i=>({x:W*.305+(i%14)*W*.0300,y:H*.315+Math.floor(i/14)*H*.090});
      const intakePoint=i=>({x:W*.070+(i%10)*W*.0200,y:H*.325+Math.floor(i/10)*H*.061});
      const testedPoint=i=>({x:W*.755+(i%10)*W*.0200,y:H*.325+Math.floor(i/10)*H*.061});
      const multiSpiralPoint=i=>{
        const arm=i%4,j=Math.floor(i/4),count=arm<2?18:17,s=j/Math.max(1,count-1);
        const a0=-Math.PI*.52+s*TAU*1.72+arm*TAU/4,r=.08+.92*s,rx=W*.205,ry=H*.292;
        return{x:W*.50+Math.cos(a0)*rx*r,y:H*.535+Math.sin(a0)*ry*r};
      };
      const armRank=Array.from({length:70},(_,i)=>i).sort((i,j)=>hash01(i,7,31)-hash01(j,7,31));
      const train=armRank.slice(0,34),usual=armRank.slice(34),trainRank=new Map(train.map((id,i)=>[id,i])),usualRank=new Map(usual.map((id,i)=>[id,i]));
      const isTraining=i=>trainRank.has(i);
      const splitPoint=i=>{
        const training=isTraining(i),rank=(training?trainRank:usualRank).get(i),cols=training?17:18;
        return{x:W*.245+(rank%cols)*W*.0205,y:(training?H*.355:H*.625)+Math.floor(rank/cols)*H*.048};
      };
      const shuffleBuild=.65,shuffleEvent=.15,shuffleEvents=18,shuffleMaps=[Array.from({length:70},(_,i)=>i)];
      for(let event=0;event<shuffleEvents;event++){
        const previous=shuffleMaps[event],next=previous.slice(),size=[2,3,8,5,4,8][event%6],ids=[];
        for(let j=0;j<size;j++)ids.push((event*13+j*19)%70);
        const shift=1+(event%Math.max(1,size-1));
        ids.forEach((id,j)=>{next[id]=previous[ids[(j+shift)%size]];});
        shuffleMaps.push(next);
      }
      const shuffledSpiralPoint=(i,from,to,q)=>{
        const a0=multiSpiralPoint(from[i]),b0=multiSpiralPoint(to[i]),moving=from[i]!==to[i],arc=moving?Math.sin(q*Math.PI)*(i%2?1:-1):0;
        return{x:mix(a0.x,b0.x,q)+arc*W*.018,y:mix(a0.y,b0.y,q)-Math.abs(arc)*H*.022};
      };
      const multiShufflePoint=(i,e)=>{
        if(e<shuffleBuild){const q=smooth(e/shuffleBuild),a0=testedPoint(i),b0=multiSpiralPoint(i);return{x:mix(a0.x,b0.x,q),y:mix(a0.y,b0.y,q)};}
        const active=Math.max(0,(e-shuffleBuild)/shuffleEvent),event=Math.min(shuffleEvents-1,Math.floor(active));
        if(active>=shuffleEvents)return multiSpiralPoint(shuffleMaps[shuffleEvents][i]);
        return shuffledSpiralPoint(i,shuffleMaps[event],shuffleMaps[event+1],smooth(active-event));
      };
      const multiFinalPoint=i=>multiSpiralPoint(shuffleMaps[shuffleEvents][i]);
      const cardPose=(group,v)=>{
        const centres=[.38,.435,.49,.545,.60,.655,.71],start=group;
        const mid=[5,2,6,0,4,1,3][group],finish=[3,6,1,5,0,4,2][group];
        const from=v<.5?start:mid,to=v<.5?mid:finish,q=smooth(v<.5?v/.5:(v-.5)/.5);
        const direction=group%2?1:-1,arc=Math.sin(q*Math.PI)*H*.105*direction;
        return{
          x:W*mix(centres[from],centres[to],q),
          y:H*.505+arc,
          angle:(group-3)*.035+Math.sin(v*Math.PI*4+group)*.055,
          scale:.88+.22*(.5+.5*Math.sin(v*Math.PI*4+group*1.7)),
        };
      };
      const cardPoint=(i,v)=>{
        const rank=armRank.indexOf(i),group=rank%7,local=Math.floor(rank/7),pose=cardPose(group,v);
        const dx=((local%2)-.5)*W*.018*pose.scale,dy=(Math.floor(local/2)-2)*H*.039*pose.scale;
        const c=Math.cos(pose.angle),s=Math.sin(pose.angle);
        return{x:pose.x+dx*c-dy*s,y:pose.y+dx*s+dy*c};
      };
      const travelPoint=(i,progress=t*.05)=>{
        const training=isTraining(i),rank=(training?trainRank:usualRank).get(i),n=training?34:36;
        const phase=(progress*3.2+rank/n)%1,row=rank%2;
        return{x:mix(W*.16,W*.68,phase),y:(training?H*.345:H*.615)+row*H*.048+Math.sin(progress*TAU*4+rank)*H*.004};
      };
      const returnIntakePoint=i=>({x:W*.070+(armRank.indexOf(i)%10)*W*.0200,y:H*.325+Math.floor(armRank.indexOf(i)/10)*H*.061});
      const followPoint=i=>({x:W*.755+(armRank.indexOf(i)%10)*W*.0200,y:H*.325+Math.floor(armRank.indexOf(i)/10)*H*.061});
      const processPoint=(i,progress,scannerX,start,end)=>{
        const rank=armRank.indexOf(i),q=progress*70-rank;
        if(q<=0)return start;
        if(q>=1)return end;
        return testingPath(scannerX,q,start,end);
      };

      const drawCards=(v,alpha)=>{
        if(alpha<=.001)return;
        const suits=["♠","♥","♣","♦"];
        for(let group=0;group<7;group++){
          const pose=cardPose(group,v),cw=W*.064,ch=H*.300,suit=suits[group%4];
          g.save();g.translate(pose.x,pose.y);g.rotate(pose.angle);g.scale(pose.scale,pose.scale);
          g.globalAlpha=.58*alpha;g.fillStyle="rgba(248,246,238,.13)";g.strokeStyle=group%2?control:patient;
          g.lineWidth=Math.max(1,1.35*k);g.shadowColor="rgba(0,0,0,.94)";g.shadowBlur=13*k;
          g.beginPath();g.roundRect(-cw/2,-ch/2,cw,ch,5*k);g.fill();g.stroke();
          g.globalAlpha=.88*alpha;g.fillStyle=group%2?control:patient;g.textAlign="left";g.textBaseline="top";
          g.font=`650 ${Math.max(9,8*k).toFixed(1)}px Georgia, serif`;g.fillText(suit,-cw/2+6*k,-ch/2+5*k);
          g.textAlign="right";g.textBaseline="bottom";g.fillText(suit,cw/2-6*k,ch/2-5*k);g.restore();
        }
      };
      const drawArms=(alpha)=>{
        line(W*.18,H*.31,W*.70,H*.31,patient,.23*alpha,1);
        line(W*.18,H*.58,W*.70,H*.58,control,.23*alpha,1);
        txt("training · n=34",W*.44,H*.275,patient,8,"center",alpha,650);
        txt("usual activity · n=36",W*.44,H*.545,control,8,"center",alpha,650);
      };
      const drawActivities=(alpha,motion)=>{
        bike(W*.84,H*.43,patient,alpha,.82,motion);
        txt("supervised subsymptom cycling",W*.84,H*.535,mid,6.1,"center",alpha,540);
        usualLife(W*.84,H*.735,control,alpha,.80,motion);
        txt("usual care · same activity level",W*.84,H*.80,mid,6.1,"center",alpha,540);
      };

      txt("REPCon trial design",W*.055,H*.085,hi,19.5,"left",1,500,"Georgia, 'Times New Roman', serif");
      const testingProgress=(e,lead)=>{
        const scanElapsed=Math.max(0,e-lead),slow=Math.min(5,scanElapsed),fast=scanElapsed>5?Math.min(65,(scanElapsed-5)/3.8*65):0;
        return Math.min(1,(slow+fast)/70);
      };
      const firstProgress=step===1?testingProgress(elapsed,.70):step>=2?1:0;
      const weekRaw=step===6?Math.min(1,elapsed/10.5):step>6?1:0,weekQ=.5-.5*Math.cos(Math.PI*weekRaw);
      const returnProgress=step===7?testingProgress(elapsed,.45):step>=8?1:0;
      const reverseR=step===9?Math.min(1,elapsed/10.5):0;
      if(step===1&&firstProgress>=.999)a._autoAdvanceStep=routeStep;
      if(step===3&&elapsed>=3.50)a._autoAdvanceStep=routeStep;
      if(step===4&&elapsed>=6.35)a._autoAdvanceStep=routeStep;
      if(step===6&&weekRaw>=.999)a._autoAdvanceStep=routeStep;
      if(step===7&&returnProgress>=.999)a._autoAdvanceStep=routeStep;

      const reverseWeekQ=reverseR>=.24&&reverseR<.50?smooth((reverseR-.24)/.26):reverseR>=.50?1:0;
      const timelineA=step===0||step===10?0:step===9?smooth((1-reverseR)/.10):1;
      if(timelineA>0){
        line(W*.075,H*.185,W*.925,H*.185,mid,.70*timelineA,1);
        line(W*.075,H*.168,W*.075,H*.202,mid,.70*timelineA,1);line(W*.925,H*.168,W*.925,H*.202,mid,.70*timelineA,1);
        const reverseLabel=reverseR<.24?"Testing":reverseR<.50?"12 weeks":reverseR<.90?"Randomisation":"Baseline";
        const stageLabel=step<=2?"Testing":step<=4?"Randomisation":step===5?"Training / usual activity":step===6?"12 weeks":step<=8?"Testing":reverseLabel;
        txt(stageLabel,W*.50,H*.145,mid,6.6,"center",timelineA,600);
        let cursorX=step===1?mix(W*.085,W*.285,firstProgress):step===2?W*.30:step===3?W*.40:step===4?W*.49:step===5?W*.51:step===6?mix(W*.52,W*.78,weekQ):step===7?mix(W*.80,W*.915,returnProgress):W*.915;
        if(step===9){
          if(reverseR<.24)cursorX=mix(W*.915,W*.80,smooth(reverseR/.24));
          else if(reverseR<.50)cursorX=mix(W*.78,W*.52,reverseWeekQ);
          else if(reverseR<.70)cursorX=mix(W*.49,W*.40,smooth((reverseR-.50)/.20));
          else cursorX=mix(W*.40,W*.085,smooth((reverseR-.70)/.30));
        }
        g.save();g.globalAlpha=timelineA;g.fillStyle=patient;g.beginPath();g.arc(cursorX,H*.185,3.7*k,0,TAU);g.fill();g.restore();
        if(step===6)txt(`week ${1+Math.floor(weekQ*11.999)} / 12`,cursorX,H*.225,mid,5.8,"center",1,560);
        if(step===9&&reverseR>=.24&&reverseR<.50)txt(`week ${12-Math.floor(reverseWeekQ*11.999)} / 12`,cursorX,H*.225,mid,5.8,"center",timelineA,560);
      }

      if(step===6)celestialCycle(1,weekQ*3.2);
      if(step===9&&reverseR>=.24&&reverseR<.50)celestialCycle(1,(1-reverseWeekQ)*3.2);
      if(step===1||step===2)testingStation(W*.50,step===1?smooth(elapsed/.55):1,step===1&&firstProgress<1);
      if(step===7||step===8)testingStation(W*.50,step===7?smooth(elapsed/.55):1,step===7&&returnProgress<1);
      if(step===9&&reverseR<.24)testingStation(W*.50,1-smooth(reverseR/.24),true);

      if(step>=4&&step<=6){
        const armsA=step===4?smooth((randomSettle-.30)/.70):1;
        drawArms(armsA);
      }
      if(step===5)drawActivities(enter,t*.85);
      if(step===6)drawActivities(1,weekQ*TAU*5);
      if(step===9&&reverseR>=.24&&reverseR<.54){
        const a0=smooth((reverseR-.24)/.04)*(1-smooth((reverseR-.50)/.04));
        drawArms(a0);drawActivities(a0,(1-reverseWeekQ)*TAU*5);
      }

      for(let i=0;i<70;i++){
        const intro=introPoint(i),intake=intakePoint(i),tested=testedPoint(i),s=splitPoint(i),returnIntake=returnIntakePoint(i),follow=followPoint(i);
        let p=intro,color=patient,phase=0,glyphScale=.52;
        if(step===1){
          const prep=smooth(elapsed/.70),start={x:mix(intro.x,intake.x,prep),y:mix(intro.y,intake.y,prep)};
          const q=firstProgress*70-i;
          p=q<=0?start:q>=1?tested:testingPath(W*.50,q,start,tested);
          phase=q>0&&q<1?t*5+i*.7:0;
        }else if(step===2){
          p=tested;
        }else if(step===3){
          p=multiShufflePoint(i,elapsed);color=elapsed>.25?(isTraining(i)?patient:control):patient;phase=t*7.5+i*.35;glyphScale=.50;
        }else if(step===4){
          const start=multiFinalPoint(i);
          const cards=cardPoint(i,randomCards);
          const cardEnter=smooth(u/.18),throughCards={x:mix(start.x,cards.x,cardEnter),y:mix(start.y,cards.y,cardEnter)};
          p={x:mix(throughCards.x,s.x,randomSettle),y:mix(throughCards.y,s.y,randomSettle)};
          color=isTraining(i)?patient:control;phase=t*3.0+i*.7;glyphScale=mix(.48,.50,randomSettle);
        }else if(step===5){
          p=s;color=isTraining(i)?patient:control;
        }else if(step===6){
          p=travelPoint(i,weekQ);color=isTraining(i)?patient:control;phase=weekQ*TAU*8+i*.7;
        }else if(step===7){
          const weekEnd=travelPoint(i,1),prep=smooth(elapsed/.45),start={x:mix(weekEnd.x,returnIntake.x,prep),y:mix(weekEnd.y,returnIntake.y,prep)};
          p=processPoint(i,returnProgress,W*.50,start,follow);color=isTraining(i)?patient:control;phase=t*5+i*.7;
        }else if(step===8){
          p=follow;color=isTraining(i)?patient:control;
        }else if(step===9){
          if(reverseR<.24){
            p=processPoint(i,1-smooth(reverseR/.24),W*.50,returnIntake,follow);color=isTraining(i)?patient:control;
          }else if(reverseR<.50){
            const q=reverseWeekQ,dest=travelPoint(i,1-q),join=smooth(q/.16);
            p={x:mix(returnIntake.x,dest.x,join),y:mix(returnIntake.y,dest.y,join)};color=isTraining(i)?patient:control;phase=(1-q)*TAU*8+i*.7;
          }else if(reverseR<.70){
            const q=smooth((reverseR-.50)/.20),travel0=travelPoint(i,0);
            if(q<.30){const z=smooth(q/.30);p={x:mix(travel0.x,s.x,z),y:mix(travel0.y,s.y,z)};}
            else if(q<.60){const z=smooth((q-.30)/.30),card=cardPoint(i,1);p={x:mix(s.x,card.x,z),y:mix(s.y,card.y,z)};}
            else if(q<.88)p=cardPoint(i,1-smooth((q-.60)/.28));
            else{const z=smooth((q-.88)/.12),card=cardPoint(i,0),final=multiFinalPoint(i);p={x:mix(card.x,final.x,z),y:mix(card.y,final.y,z)};}
            color=isTraining(i)?patient:control;phase=t*4+i*.4;
          }else if(reverseR<.90){
            const q=smooth((reverseR-.70)/.20),reverseElapsed=(1-q)*(shuffleBuild+shuffleEvents*shuffleEvent);
            p=multiShufflePoint(i,reverseElapsed);color=q>.82?patient:(isTraining(i)?patient:control);phase=t*7+i*.3;
          }else{
            const q=smooth((reverseR-.90)/.10);p={x:mix(tested.x,intro.x,q),y:mix(tested.y,intro.y,q)};color=patient;
          }
        }else if(step===10){
          p=intro;color=i>=60?lo:patient;
        }
        if(step===10&&i>=60){
          glyph(p.x,p.y,patient,.96*(1-enter),glyphScale,phase);
          glyph(p.x,p.y,lo,.82*enter,glyphScale,phase);
        }else glyph(p.x,p.y,color,.96,glyphScale,phase);
      }

      // Draw the deck after the participant glyphs so the card outline and suits read as a
      // deliberate second shuffle, instead of disappearing underneath the moving cohort.
      if(step===4)drawCards(randomCards,smooth((u-.025)/.045)*(1-smooth((u-.80)/.08)));
      if(step===9&&reverseR>=.50&&reverseR<.70){
        const q=smooth((reverseR-.50)/.20),cardA=smooth((q-.27)/.08)*(1-smooth((q-.90)/.07));
        const cardV=q<.60?1:1-smooth((q-.60)/.28);drawCards(cardV,cardA);
      }

      let phaseText=[
        "70 adults with persistent post-concussion symptoms",
        "each participant completes BCBT and MRI testing",
        "70 participants tested",
        "rapid exchanges reshuffle the same cohort",
        "the cohort is shuffled again, then split",
        "training and usual activity",
        "12 weeks",
        "the same testing is repeated",
        "70 participants tested again",
      ][step];
      if(step===9)phaseText=reverseR>.97?"70 adults with persistent post-concussion symptoms":"rewinding to baseline";
      if(step===10)phaseText="60 attended baseline · 10 did not attend";
      if(a.hideShuffleCaptions&&(step===3||step===4))phaseText="";
      txt(phaseText,W*.50,H*.895,step===0?hi:mid,6.7,"center",1,560);
    },
  },

  /** Four truthful distributions for the same 60 PPCS participants who attended baseline MRI. */
  cohortProfile: {
    aspect: 1.7777778,
    loop: true,
    minWidth: 760,
    revealSteps: 7,
    load:(a={})=>loadRepconDemographics(a.src||"decks/data/repcon-demographics.json"),
    draw(g,W,H,t,a={}){
      if(!REPCON_DEMOGRAPHICS){loadRepconDemographics(a.src);return;}
      const d=REPCON_DEMOGRAPHICS.overall_baseline_attendees,k=a.k??1,step=Math.max(0,Math.min(7,Math.round(Number(a._step??0)||0)));
      // At entry there is no click timestamp yet; use scene age for the first enlarged distribution.
      const elapsed=Math.max(0,Number(a._stepElapsed??0),step===0?(Number(t)||0):0),smooth=v=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);},enter=smooth(elapsed/.72);
      const hi=cssVar("--hi","#F9F9F7"),mid=cssVar("--mid","#97958D"),lo=cssVar("--lo","#6E6C64"),hair=cssVar("--hair","#33322E");
      const patient=a.patientColor||"#D97757",control=a.controlColor||"#6FB8C8",gold=a.gold||"#E8BE55";
      const female=a.femaleColor||"#A78BFA",male=a.maleColor||"#70C89B";
      const txt=(s,x,y,color=hi,size=8,align="left",weight=520,alpha=1)=>{g.save();g.fillStyle=color;g.globalAlpha=alpha;g.textAlign=align;g.textBaseline="middle";g.shadowColor="rgba(0,0,0,.92)";g.shadowBlur=7*k;g.font=`${weight} ${Math.max(9,size*k).toFixed(1)}px ui-monospace, SFMono-Regular, monospace`;g.fillText(s,x,y);g.restore();};
      softPageShadow(g,W,H);
      const monthValues=d.months_since_last_mtbi;
      const months=monthValues.map(v=>Math.log10(v));
      const meanMonths=monthValues.reduce((sum,value)=>sum+value,0)/monthValues.length;
      const large={x:W*.105,y:H*.175,w:W*.790,h:H*.650};
      const small=[
        {x:W*.055,y:H*.145,w:W*.410,h:H*.315},
        {x:W*.535,y:H*.145,w:W*.410,h:H*.315},
        {x:W*.055,y:H*.555,w:W*.410,h:H*.315},
        {x:W*.535,y:H*.555,w:W*.410,h:H*.315},
      ];
      const lerpBox=(a0,b0,q)=>({x:mix(a0.x,b0.x,q),y:mix(a0.y,b0.y,q),w:mix(a0.w,b0.w,q),h:mix(a0.h,b0.h,q)});
      const panelState=index=>{
        const showStep=index*2,settleStep=showStep+1;
        if(step<showStep)return{alpha:0,box:large,big:true};
        if(step===showStep)return{alpha:enter,box:large,big:true};
        if(step===settleStep)return{alpha:1,box:lerpBox(large,small[index],enter),big:enter<.55};
        const activeFocus=step%2===0?step/2:-1,settlingFocus=step%2===1?(step-1)/2:-1;
        if(activeFocus>index)return{alpha:.10,box:small[index],big:false};
        if(settlingFocus>index)return{alpha:mix(.10,1,enter),box:small[index],big:false};
        return{alpha:1,box:small[index],big:false};
      };
      const header=(label,title,meta,box,big,alpha)=>{
        txt(label,box.x,box.y,mid,big?9.0:6.4,"left",700,alpha);
        txt(title,box.x+(big?W*.035:W*.024),box.y,hi,big?13.0:8.0,"left",650,alpha);
        txt(meta,box.x+box.w,box.y,mid,big?7.7:5.8,"right",520,alpha);
      };
      const drawAge=(box,big,alpha)=>{
        header("A","Age","40.3 ± 11.3 years · range 23–66",box,big,alpha);
        densityOverlay(g,{x:box.x+box.w*.04,y:box.y+box.h*.25,w:box.w*.92,h:box.h*.53},[{values:d.age_years,color:patient,fillAlpha:.18}],{min:18,max:70,ticks:[[20,"20"],[30,"30"],[40,"40"],[50,"50"],[60,"60"],[70,"70"]],k:big?k*1.18:k*.83,label:"age (years)",alpha});
      };
      const drawSex=(box,big,alpha)=>{
        header("B","Recorded sex","48 female · 12 male",box,big,alpha);
        const cols=big?20:15,rows=Math.ceil(60/cols),x0=box.x+box.w*.08,x1=box.x+box.w*.92,y0=box.y+box.h*.29,dy=box.h*(big?.15:.12);
        for(let i=0;i<60;i++){
          const x=mix(x0,x1,(i%cols)/(cols-1)),y=y0+Math.floor(i/cols)*dy;
          miniPerson(g,x,y,i<48?female:male,k,.92*alpha,{scale:big?1.45:.78});
        }
        txt("48 F · 80%",x0,box.y+box.h*.88,female,big?9.0:6.0,"left",650,alpha);
        txt("12 M · 20%",x1,box.y+box.h*.88,male,big?9.0:6.0,"right",650,alpha);
      };
      const drawTime=(box,big,alpha)=>{
        header("C","Time since latest mTBI","",box,big,alpha);
        txt(`mean ${meanMonths.toFixed(1)} · median 27.5 months · IQR 14–45.5`,box.x+(big?W*.035:W*.024),box.y+box.h*.115,mid,big?8.0:5.8,"left",520,alpha);
        densityOverlay(g,{x:box.x+box.w*.04,y:box.y+box.h*.25,w:box.w*.92,h:box.h*.53},[{values:months,color:patient,fillAlpha:.18}],{min:Math.log10(3),max:Math.log10(216),ticks:[[Math.log10(3),"3"],[Math.log10(12),"12"],[Math.log10(24),"24"],[Math.log10(60),"60"],[Math.log10(216),"216"]],k:big?k*1.18:k*.83,label:"months since latest mTBI · log scale",alpha});
      };
      const drawInjuries=(box,big,alpha)=>{
        header("D","Number of documented mTBIs","median 1 · range 1–5",box,big,alpha);
        const counts=[1,2,3,4,5].map(v=>d.number_of_mtbi.filter(x=>x===v).length),x0=box.x+box.w*.10,x1=box.x+box.w*.90,base=box.y+box.h*.79;
        g.save();g.strokeStyle=mid;g.globalAlpha=.70*alpha;g.lineWidth=Math.max(.8,k);g.beginPath();g.moveTo(x0,base);g.lineTo(x1,base);g.stroke();g.restore();
        counts.forEach((count,i)=>{
          const x=mix(x0,x1,i/4),pileCols=count>9?(big?7:6):Math.max(1,Math.min(3,count)),gap=(big?7.2:4.8)*k,rowGap=(big?7.8:5.0)*k;
          for(let n=0;n<count;n++){const col=n%pileCols,row=Math.floor(n/pileCols);miniPerson(g,x+(col-(pileCols-1)/2)*gap,base-8*k-row*rowGap,patient,k,.82*alpha,{scale:big?.92:.56});}
          const rows=Math.ceil(count/pileCols);txt(String(count),x,base-15*k-rows*rowGap,hi,big?7.8:5.8,"center",600,alpha);txt(String(i+1),x,base+14*k,mid,big?7.6:5.8,"center",520,alpha);
        });
        txt("mTBIs",(x0+x1)/2,base+(big?38:29)*k,mid,big?7.5:5.8,"center",520,alpha);
      };

      txt("Baseline PPCS cohort",W*.045,H*.065,hi,15.5,"left",520,1);
      txt("the same 60 participants at baseline",W*.955,H*.066,mid,6.4,"right",540,1);
      const states=[panelState(0),panelState(1),panelState(2),panelState(3)];
      const drawers=[drawAge,drawSex,drawTime,drawInjuries];
      // Settled panels are drawn first; the currently enlarged distribution stays visually dominant.
      for(let i=0;i<4;i++)if(states[i].alpha>0&&!states[i].big)drawers[i](states[i].box,false,states[i].alpha);
      for(let i=0;i<4;i++)if(states[i].alpha>0&&states[i].big)drawers[i](states[i].box,true,states[i].alpha);
    },
  },

  /** A quiet, transparent manufacturer bridge after the MRI quality-control sequence. */
  philipsFlash: {
    aspect: 1.7777778,
    loop: true,
    minWidth: 760,
    revealSteps: 0,
    draw(g,W,H,t,a={}){
      // Step zero has no click timestamp in the scene runtime, so use the scene clock until
      // an explicit settled navigation supplies a later state age.
      const k=a.k??1,elapsed=Math.max(0,Number(a._stepElapsed??0),Number(t)||0);
      const smooth=v=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
      const logo=raster(a.logo||"decks/assets/defense/cohort/philips-logo.png");
      const alpha=smooth(elapsed/1.45)*(1-smooth((elapsed-2.65)/1.45));
      if(alpha<=.001||!logo?.complete||!logo.naturalWidth)return;
      const scale=Math.min(W*.26/logo.naturalWidth,H*.36/logo.naturalHeight),dw=logo.naturalWidth*scale,dh=logo.naturalHeight*scale;
      g.save();g.globalAlpha=alpha;g.shadowColor="rgba(0,0,0,.72)";g.shadowBlur=22*k;g.shadowOffsetY=7*k;
      g.drawImage(logo,(W-dw)/2,(H-dh)/2,dw,dh);g.restore();
    },
  },

  /** Age densities and honest categorical sex distributions for both imaging comparisons. */
  studyDemographics: {
    aspect: 1.7777778,
    loop: true,
    minWidth: 760,
    revealSteps: 2,
    load:(a={})=>loadRepconDemographics(a.src||"decks/data/repcon-demographics.json"),
    draw(g,W,H,t,a={}){
      if(!REPCON_DEMOGRAPHICS){loadRepconDemographics(a.src);return;}
      const k=a.k??1,step=Math.max(0,Math.min(2,Math.round(Number(a._step??0)||0))),
        elapsed=Math.max(0,Number(a._stepElapsed??0)),smooth=v=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);},
        patient=a.patientColor||"#D97757",control=a.controlColor||"#6FB8C8",
        female=a.femaleColor||"#A78BFA",male=a.maleColor||"#70C89B";
      const hi=cssVar("--hi","#F9F9F7"),mid=cssVar("--mid","#97958D"),hair=cssVar("--hair","#33322E");
      const txt=(s,x,y,color=hi,size=8,align="left",weight=520,alpha=1)=>{g.save();g.fillStyle=color;g.globalAlpha=alpha;g.textAlign=align;g.textBaseline="middle";g.shadowColor="rgba(0,0,0,.92)";g.shadowBlur=7*k;g.font=`${weight} ${Math.max(9,size*k).toFixed(1)}px ui-monospace, SFMono-Regular, monospace`;g.fillText(s,x,y);g.restore();};
      const sexPlot=(study,box,alpha=1,progress=1)=>{
        const groups=[{name:"PPCS",data:study.ppcs,color:patient},{name:"HC",data:study.control,color:control}];
        groups.forEach((group,gi)=>{
          const nf=group.data.sex.female,nm=group.data.sex.male,n=nf+nm,
            pf=nf/n,barY=box.y+gi*box.h*.50,barH=Math.max(10*k,box.h*.16),shown=box.w*smooth(progress);
          txt(group.name,box.x-13*k,barY+barH*.5,group.color,6.5,"right",650,alpha);
          g.save();g.globalAlpha=.90*alpha;g.beginPath();g.roundRect(box.x,barY,shown,barH,barH*.45);g.clip();
          g.fillStyle=female;g.fillRect(box.x,barY,box.w*pf,barH);
          g.fillStyle=male;g.fillRect(box.x+box.w*pf,barY,box.w*(1-pf),barH);g.restore();
          if(shown>box.w*.96){
            txt(`${nf} F`,box.x+box.w*pf*.50,barY+barH*.5,hi,5.8,"center",650,alpha);
            txt(`${nm} M`,box.x+box.w*(pf+(1-pf)*.50),barY+barH*.5,hi,5.8,"center",650,alpha);
          }
        });
      };
      const row=(study,y,label,meta,alpha=1,progress=1)=>{
        txt(label,W*.055,y+H*.045,hi,8.7,"left",650,alpha);
        txt(meta,W*.945,y+H*.045,mid,6.6,"right",520,alpha);
        txt("Age at MRI (years)",W*.075,y+H*.105,mid,6.3,"left",570,alpha);
        txt("Recorded sex · female / male",W*.735,y+H*.105,mid,6.3,"left",570,alpha);
        densityOverlay(g,{x:W*.075,y:y+H*.145,w:W*.59,h:H*.145},[
          {values:study.ppcs.age_years,color:patient,fillAlpha:.15},
          {values:study.control.age_years,color:control,fillAlpha:.13},
        ],{min:18,max:70,ticks:[[20,"20"],[30,"30"],[40,"40"],[50,"50"],[60,"60"],[70,"70"]],k,label:"years",alpha});
        sexPlot(study,{x:W*.76,y:y+H*.15,w:W*.17,h:H*.14},alpha,progress);
      };
      softPageShadow(g,W,H);
      txt("Study II and Study III analytic cohorts",W*.045,H*.055,hi,15.5,"left",520);
      if(step>=1){const a2=step===1?smooth(elapsed/.72):1,p2=step===1?Math.min(1,elapsed/1.45):1;
        row(REPCON_DEMOGRAPHICS.study2,H*.075,"A   Study II · DCE-MRI","PPCS n=46   ·   HC n=15",a2,p2);}
      if(step>=2){const a3=step===2?smooth(elapsed/.72):1,p3=step===2?Math.min(1,elapsed/1.45):1;
        g.save();g.strokeStyle=hair;g.globalAlpha=.78*a3;g.lineWidth=Math.max(.7,.8*k);g.beginPath();g.moveTo(W*.055,H*.505);g.lineTo(W*.945,H*.505);g.stroke();g.restore();
        row(REPCON_DEMOGRAPHICS.study3,H*.525,"B   Study III · controlled hypoxia","PPCS n=45 (age n=43)   ·   HC n=47",a3,p3);}
    },
  },

  /** Exact RPQ items first; one click replaces them with the cohort's recorded score distribution. */
  rpqStory: {
    aspect: 1.7777778,
    loop: true,
    minWidth: 760,
    revealSteps: 3,
    load:(a={})=>loadRepconDemographics(a.src||"decks/data/repcon-demographics.json"),
    draw(g,W,H,t,a={}){
      if(!REPCON_DEMOGRAPHICS){loadRepconDemographics(a.src);return;}
      const k=a.k??1,step=Math.max(0,Math.min(3,Math.round(Number(a._step??0)||0))),elapsed=Math.max(0,Number(a._stepElapsed??0)),u=Math.max(0,Math.min(1,elapsed/.55)),ease=u*u*(3-2*u);
      const hi=cssVar("--hi","#F9F9F7"),mid=cssVar("--mid","#97958D"),lo=cssVar("--lo","#6E6C64");
      const patient=a.patientColor||"#D97757",control=a.controlColor||"#6FB8C8",gold=a.gold||"#E8BE55";
      const qa=step===3?1-ease:1,da=step===3?ease:0;
      const txt=(s,x,y,color=hi,size=7.5,align="left",weight=520,alpha=1,family="ui-monospace, SFMono-Regular, monospace")=>{g.save();g.fillStyle=color;g.globalAlpha=alpha;g.textAlign=align;g.textBaseline="middle";g.shadowColor="rgba(0,0,0,.92)";g.shadowBlur=7*k;g.font=`${weight} ${Math.max(9,size*k).toFixed(1)}px ${family}`;g.fillText(s,x,y);g.restore();};
      softPageShadow(g,W,H);
      txt("Rivermead Post-Concussion Symptoms Questionnaire",W*.045,H*.055,hi,15.0,"left",520,1,"Georgia, 'Times New Roman', serif");

      const items=[
        ["Headaches"],["Feelings of dizziness"],["Nausea and/or vomiting"],
        ["Noise sensitivity","easily upset by loud noise"],["Sleep disturbance"],["Fatigue","tiring more easily"],["Being irritable","easily angered"],["Feeling depressed","or tearful"],["Feeling frustrated","or impatient"],
        ["Forgetfulness","poor memory"],["Poor concentration"],["Taking longer to think"],["Blurred vision"],["Light sensitivity","easily upset by bright light"],["Double vision"],["Restlessness"],
      ];
      if(qa>0){
        txt("Compared with before the injury: how much of a problem was each symptom during the previous 24 hours?",W*.055,H*.11,mid,6.8,"left",540,qa);
        const rpq3=step>=1?(step===1?smooth(elapsed/.42):1):0,rpq13=step>=2?(step===2?smooth(elapsed/.42):1):0;
        txt("RPQ-3",W*.065,H*.165,gold,7.6,"left",680,qa*rpq3);txt("RPQ-13",W*.64,H*.165,patient,7.6,"center",680,qa*rpq13);
        const drawItems=(start,end,x,y0,dy,color,groupAlpha,localElapsed)=>{for(let i=start;i<end;i++){const itemAlpha=qa*groupAlpha*smooth((localElapsed-(i-start)*.12)/.40),y=y0+(i-start)*dy,lines=items[i];txt(String(i+1).padStart(2,"0"),x,y,color,6.3,"left",650,itemAlpha);if(lines.length===1)txt(lines[0],x+23*k,y,hi,6.7,"left",520,itemAlpha);else{txt(lines[0],x+23*k,y-4.3*k,hi,6.5,"left",550,itemAlpha);txt(lines[1],x+23*k,y+4.6*k,mid,6.0,"left",500,itemAlpha);}}};
        drawItems(0,3,W*.065,H*.245,H*.066,gold,rpq3,step===1?elapsed:9);
        drawItems(3,10,W*.365,H*.245,H*.064,patient,rpq13,step===2?elapsed:9);
        drawItems(10,16,W*.685,H*.245,H*.064,patient,rpq13,step===2?elapsed-.16:9);

        const x0=W*.085,x1=W*.915,y=H*.785;
        g.save();g.globalAlpha=qa;g.strokeStyle=mid;g.lineWidth=Math.max(.8,k);g.beginPath();g.moveTo(x0,y);g.lineTo(x1,y);g.stroke();g.restore();
        const scale=[["0","not present"],["1","present, not worse than before"],["2","mild new / worse"],["3","moderate new / worse"],["4","severe new / worse"]];
        scale.forEach(([n,label],i)=>{const x=mix(x0,x1,i/4);g.save();g.globalAlpha=qa;g.strokeStyle=mid;g.lineWidth=Math.max(.8,k);g.beginPath();g.moveTo(x,y-6*k);g.lineTo(x,y+6*k);g.stroke();g.restore();txt(n,x,y-20*k,hi,7.0,"center",650,qa);txt(label,x,y+25*k,mid,5.9,"center",520,qa);});
        txt("response",x0-W*.022,y-20*k,mid,6.2,"right",560,qa);
      }

      if(da>0){
        const values=REPCON_DEMOGRAPHICS.overall_baseline_attendees.rpq_recorded_full16;
        const mean=values.reduce((sum,value)=>sum+value,0)/values.length;
        const med=sampleQuantile(values,.5),q1=sampleQuantile(values,.25),q3=sampleQuantile(values,.75);
        txt("RPQ score",W*.075,H*.16,hi,9.0,"left",650,da);
        txt("PPCS baseline MRI attendees · n=60",W*.925,H*.16,mid,6.6,"right",520,da);

        // Return to the earlier population display: every glyph is one participant. Four-point
        // bins create readable stacks; summary statistics retain the exact recorded scores.
        const B={x:W*.105,y:H*.255,w:W*.790,h:H*.49},X=v=>B.x+(v/64)*B.w,base=B.y+B.h*.72,
          bins=new Map(),sorted=values.slice().sort((a,b)=>a-b);
        sorted.forEach(v=>{const key=Math.max(0,Math.min(64,Math.round(v/4)*4)),row=bins.get(key)||0;bins.set(key,row+1);
          const col=row%2,level=Math.floor(row/2),x=X(key)+(col?3.8:-3.8)*k,y=base-level*16.0*k;
          miniPerson(g,x,y,patient,k,.94*da,{scale:1.34});});
        g.save();g.globalAlpha=.72*da;g.strokeStyle=mid;g.lineWidth=Math.max(.8,k);g.beginPath();g.moveTo(B.x,base+13*k);g.lineTo(B.x+B.w,base+13*k);g.stroke();g.restore();
        [0,16,32,48,64].forEach(v=>{const x=X(v);g.save();g.globalAlpha=.72*da;g.strokeStyle=mid;g.lineWidth=Math.max(.8,k);g.beginPath();g.moveTo(x,base+7*k);g.lineTo(x,base+19*k);g.stroke();g.restore();txt(String(v),x,base+32*k,mid,6.2,"center",520,da);});
        txt("recorded score",W*.50,base+68*k,mid,6.4,"center",540,da);
        txt(`mean ${mean.toFixed(1)}   ·   median ${med.toFixed(1)}   ·   IQR ${q1.toFixed(0)}–${q3.toFixed(0)}   ·   range ${Math.min(...values)}–${Math.max(...values)}`,W*.50,H*.875,hi,7.2,"center",630,da);
      }
    },
  },

  /**
   * A scan cursor with its tissue curve physically tethered to the active voxel.  This is a
   * lightweight stand-in when the full 3-D subject scene is too expensive; the curve moves
   * with the box and changes continuously along the EPI-style raster.
   */
  voxelSweepAttachment: {
    aspect: 2.24,
    minWidth: 700,
    loop: true,
    revealSteps: 1,
    draw(g, W, H, t, a = {}) {
      const k = a.k ?? 1, step = Math.max(0, Math.min(1, Math.round(Number(a._step ?? 0) || 0)));
      const hi = cssVar("--hi", "#F9F9F7"), mid = cssVar("--mid", "#97958D");
      const lo = cssVar("--lo", "#6E6C64"), hair = cssVar("--hair", "#33322E");
      const acc = cssVar("--accent", "#D97757"), gold = a.gold || "#E8BE55";
      const S = Math.min(H * .77, W * .43), sx = W * .35 - S / 2, sy = H * .12;
      const P = brainPath(sx, sy, S);
      seat(g, P, { fill: .70, stroke: .62, width: 1.25 * k });
      fieldFill(g, P, { x: sx, y: sy, w: S, h: S }, t, { gap: Math.max(5.5, S / 28), strength: .94 });
      const rows = 11, cols = 14, cycle = 7.0;
      const progress = step ? (t % cycle) / cycle : .16;
      const linear = Math.min(rows * cols - 1, Math.floor(progress * rows * cols));
      const row = Math.floor(linear / cols), inRow = linear % cols;
      const col = row % 2 ? cols - 1 - inRow : inRow;
      const gx0 = sx + S * .13, gx1 = sx + S * .87, gy0 = sy + S * .13, gy1 = sy + S * .82;
      const vx = mix(gx0, gx1, col / (cols - 1)), vy = mix(gy0, gy1, row / (rows - 1));
      g.save(); g.clip(P); g.strokeStyle = hair; g.globalAlpha = .36; g.lineWidth = Math.max(.65, .8 * k);
      for (let r = 0; r < rows; r++) {
        const yy = mix(gy0, gy1, r / (rows - 1)); g.beginPath(); g.moveTo(gx0, yy); g.lineTo(gx1, yy); g.stroke();
      }
      for (let c = 0; c < cols; c++) {
        const xx = mix(gx0, gx1, c / (cols - 1)); g.beginPath(); g.moveTo(xx, gy0); g.lineTo(xx, gy1); g.stroke();
      }
      // completed fits stay as quiet orange samples; anatomy is never blanked.
      g.fillStyle = acc;
      for (let i = 0; i < linear; i += 3) {
        const rr = Math.floor(i / cols), cc0 = i % cols, cc = rr % 2 ? cols - 1 - cc0 : cc0;
        const x = mix(gx0, gx1, cc / (cols - 1)), y = mix(gy0, gy1, rr / (rows - 1));
        g.globalAlpha = .24; g.beginPath(); g.arc(x, y, 1.15 * k, 0, TAU); g.fill();
      }
      g.restore();
      const box = Math.max(10, S * .045);
      g.save(); g.strokeStyle = acc; g.lineWidth = 2 * k; g.shadowColor = acc; g.shadowBlur = 9 * k;
      g.strokeRect(vx - box / 2, vy - box / 2, box, box); g.restore();
      // The floating plot follows the voxel but remains inside safe page margins.
      const pw = W * .31, ph = H * .32;
      const px = Math.min(W - pw - W * .055, Math.max(W * .52, vx + W * .10));
      const py = Math.min(H - ph - H * .10, Math.max(H * .12, vy - ph * .48));
      const B = { x: px, y: py, w: pw, h: ph };
      g.save(); g.fillStyle = "rgba(18,18,17,.90)"; g.fillRect(B.x - 12 * k, B.y - 24 * k, B.w + 24 * k, B.h + 44 * k); g.restore();
      axes(g, B, { k: Math.max(.82, k), xlabel: "time", ylabel: "Cₜ", axisColour: mid, labelColour: hi });
      const ca = aif(170, 600), frac = row / (rows - 1), ct = tissue(ca, .25 + .34 * frac, (.018 + .052 * (1 - frac)) / 60);
      const cm = Math.max(...ct.map(p => p[1])) || 1;
      trace(g, B, norm(ct, 600, cm), { color: acc, width: 2.3 * k, glow: .62 });
      g.save(); g.strokeStyle = acc; g.globalAlpha = .70; g.lineWidth = 1.15 * k; g.setLineDash([4 * k, 5 * k]);
      g.beginPath(); g.moveTo(vx + box / 2, vy); g.bezierCurveTo(vx + W * .06, vy, px - W * .025, py + ph * .55, px, py + ph * .55); g.stroke(); g.restore();
      g.font = fontOf(Math.max(.86, k), 9.6); g.fillStyle = acc; g.textAlign = "left"; g.textBaseline = "bottom";
      g.fillText(`voxel ${linear + 1} / ${rows * cols}`, B.x, B.y - 8 * k);
      g.fillStyle = gold; g.textAlign = "center"; g.fillText("one shared input · one changing tissue response", W * .52, H * .965);
    },
  },

  /** Bottom-up anatomical assembly: nothing at rest, contiguous segments rise by height. */
  segmentationAssembly: {
    aspect: 2.06,
    minWidth: 700,
    loop: true,
    revealSteps: 1,
    draw(g, W, H, t, a = {}) {
      const k = a.k ?? 1, step = Math.max(0, Math.min(1, Math.round(Number(a._step ?? 0) || 0)));
      const hi = cssVar("--hi", "#F9F9F7"), mid = cssVar("--mid", "#97958D"), lo = cssVar("--lo", "#6E6C64");
      const acc = cssVar("--accent", "#D97757"), blue = a.blue || "#6FB8C8", violet = a.violet || "#A78BFA";
      const S = Math.min(W * .74, H * .92), sx = W * .50 - S / 2, sy = H * .015;
      const P = brainPath(sx, sy, S);
      const since = Math.max(0, Number(a._stepElapsed ?? 0));
      const u = step ? Math.max(0, Math.min(1, since / 2.8)) : 0;
      // Ease only the motion; preserve a direct height ordering.
      const built = u * u * (3 - 2 * u), cutY = sy + S * (.90 - .84 * built);
      if (!step) {
        g.save(); g.strokeStyle = mid; g.globalAlpha = .12; g.lineWidth = 1.1 * k; g.stroke(P); g.restore();
        g.font = fontOf(Math.max(.86, k), 10); g.fillStyle = lo; g.textAlign = "center";
        g.fillText("anatomy exists before labels", W * .50, H * .90); return;
      }
      g.save(); g.clip(P);
      const rows = 13;
      for (let r = rows - 1; r >= 0; r--) {
        const y0 = sy + S * (.06 + .84 * r / rows), y1 = sy + S * (.06 + .84 * (r + 1) / rows);
        if (y0 < cutY) continue;
        const cols = 5 + (r % 4), base = S * .10;
        for (let c = 0; c < cols; c++) {
          const x0 = sx + S * (.05 + .90 * c / cols), x1 = sx + S * (.05 + .90 * (c + 1) / cols);
          const j0 = (hash01(r, c, 51) - .5) * base * .32, j1 = (hash01(r, c, 52) - .5) * base * .32;
          const hue = (r * 7 + c * 11) / 120;
          const cc = hue < .40 ? rampAt(.20 + hue) : hue < .73 ? [94, 154, 178] : [167, 139, 250];
          g.fillStyle = `rgba(${cc[0] | 0},${cc[1] | 0},${cc[2] | 0},.70)`;
          g.strokeStyle = "rgba(20,20,19,.72)"; g.lineWidth = Math.max(.65, .75 * k);
          g.beginPath(); g.moveTo(x0 + j0, y0); g.lineTo(x1 + j1, y0);
          g.quadraticCurveTo(x1 + j0 * .35, (y0 + y1) / 2, x1 - j1 * .20, y1);
          g.lineTo(x0 - j0 * .20, y1); g.quadraticCurveTo(x0 + j1 * .35, (y0 + y1) / 2, x0 + j0, y0);
          g.closePath(); g.fill(); g.stroke();
        }
      }
      g.restore();
      g.save(); g.strokeStyle = hi; g.globalAlpha = .54; g.lineWidth = 1.25 * k; g.stroke(P); g.restore();
      // A horizontal readout makes the assembly direction unmistakable.
      g.strokeStyle = acc; g.globalAlpha = .75; g.lineWidth = 1.1 * k; g.beginPath();
      g.moveTo(sx - 18 * k, cutY); g.lineTo(sx + S + 18 * k, cutY); g.stroke(); g.globalAlpha = 1;
      g.font = fontOf(Math.max(.86, k), 10); g.textAlign = "left"; g.fillStyle = acc;
      g.fillText(`${Math.round(built * 85)} / 85 anatomical labels`, sx + S + 25 * k, cutY + 3 * k);
      g.textAlign = "center"; g.fillStyle = mid;
      g.fillText(built < .99 ? "inferior → superior" : "one participant · 85 contiguous parcels", W * .50, H * .965);
    },
  },

  /** Direction first, multiplicity second: the same 85 parcels retain their anatomy. */
  parcelEvidenceSweep: {
    aspect: 2.06,
    minWidth: 700,
    loop: true,
    revealSteps: 4,
    draw(g, W, H, t, a = {}) {
      const k = a.k ?? 1, step = Math.max(0, Math.min(4, Math.round(Number(a._step ?? 0) || 0)));
      const since = Math.max(0, Number(a._stepElapsed ?? 0)), scan = Math.max(0, Math.min(1, since / 3.3));
      const hi = cssVar("--hi", "#F9F9F7"), mid = cssVar("--mid", "#97958D"), lo = cssVar("--lo", "#6E6C64");
      const darkBlue = a.lowerColor || "#2D70B7", red = a.higherColor || "#E65D48", neutral = a.neutralColor || "#77766F";
      const S = Math.min(W * .67, H * .91), sx = W * .43 - S / 2, sy = H * .02, P = brainPath(sx, sy, S);
      const parcels = [];
      for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) if (parcels.length < 85) parcels.push({ r, c, i: parcels.length });
      const activeN = step === 1 || step === 3 ? Math.floor(scan * 85) : step ? 85 : 0;
      const metric = step <= 2 ? "vᴮ" : "Kᵢ", significance = step === 2 || step === 4;
      g.save(); g.clip(P);
      for (const p of parcels) {
        const y0 = sy + S * (.07 + .81 * p.r / 10), y1 = sy + S * (.07 + .81 * (p.r + 1) / 10);
        const x0 = sx + S * (.06 + .88 * p.c / 9), x1 = sx + S * (.06 + .88 * (p.c + 1) / 9);
        let color = "#8E776B", alpha = .46;
        if (p.i < activeN) {
          if (metric === "vᴮ") {
            // Two visible interior parcels carry the rare opposite direction; choosing
            // clipped edge cells would make the stated 83/2 split visually look like 84/1.
            const higher = p.i === 13 || p.i === 68;
            const significant = !higher && p.i < 59; // exactly 58 lower parcels survive FDR
            color = significance ? (significant ? darkBlue : neutral) : (higher ? red : darkBlue);
          } else {
            const higher = p.i < 56;
            color = significance ? neutral : (higher ? red : darkBlue);
          }
          alpha = significance && color === neutral ? .50 : .90;
        }
        g.fillStyle = color; g.globalAlpha = alpha; g.strokeStyle = "rgba(20,20,19,.72)"; g.lineWidth = .72 * k;
        const j = (hash01(p.r, p.c, 91) - .5) * S * .012;
        g.beginPath(); g.moveTo(x0 + j, y0); g.lineTo(x1 - j, y0);
        g.lineTo(x1 + j * .25, y1); g.lineTo(x0 - j * .25, y1); g.closePath(); g.fill(); g.stroke();
      }
      g.restore(); g.globalAlpha = 1;
      g.strokeStyle = hi; g.globalAlpha = .48; g.lineWidth = 1.2 * k; g.stroke(P); g.globalAlpha = 1;
      g.font = fontOf(Math.max(.86, k), 12); g.textAlign = "left"; g.textBaseline = "middle";
      g.fillStyle = metric === "vᴮ" ? darkBlue : red; g.fillText(`${metric} · ${significance ? "FDR decision" : "directional audit"}`, W * .68, H * .22);
      g.font = fontOf(Math.max(.84, k), 9.5);
      const rows = metric === "vᴮ"
        ? (significance ? [[darkBlue, "58 significant lower"], [neutral, "27 nonsignificant → grey"]]
          : [[darkBlue, "83 lower"], [red, "2 higher"]])
        : (significance ? [[neutral, "0 / 85 survive FDR"], [lo, "direction is retained in notes"]]
          : [[red, "56 higher"], [darkBlue, "29 lower"]]);
      rows.forEach(([c, s], i) => {
        g.fillStyle = c; g.beginPath(); g.arc(W * .70, H * (.35 + .10 * i), 4 * k, 0, TAU); g.fill();
        g.fillStyle = hi; g.fillText(s, W * .72, H * (.35 + .10 * i));
      });
      g.fillStyle = mid; g.font = fontOf(Math.max(.82, k), 8.8);
      g.fillText(significance ? "grey = not significant, not zero" : `${activeN} / 85 parcels tested`, W * .68, H * .63);
      g.fillStyle = hi; g.fillText("same anatomy throughout", W * .68, H * .75);
    },
  },

  /**
   * One anatomy, three measurement scales.  The previous dashboard of three cards made the
   * findings look unrelated and gave no spatial reason to compare them.  Here each result is
   * registered to the same brain, while unheaded leaders explicitly avoid a causal chain.
   */
  synthesisMap: {
    aspect: 2.24,
    loop: true,
    minWidth: 720,
    revealSteps: 3,
    draw(g, W, H, t, a = {}) {
      const k = a.k ?? 1, step = Math.max(0, Math.min(3, Math.round(Number(a._step ?? 0) || 0)));
      const q = Math.max(0, Math.min(1, Number(a._stepElapsed ?? 0) / .72));
      const enter = q * q * (3 - 2 * q);
      const hi = cssVar("--hi", "#F9F9F7"), mid = cssVar("--mid", "#97958D"), lo = cssVar("--lo", "#6E6C64");
      const hair = cssVar("--hair", "#33322E"), coral = a.coral || "#D97757";
      const blue = a.blue || "#3F8EBA", violet = a.violet || "#A78BFA";
      const txt = (x, y, s, c, size, align = "left", alpha = 1, weight = 500) => {
        g.save(); g.globalAlpha = alpha; g.fillStyle = c; g.textAlign = align; g.textBaseline = "middle";
        g.font = `${weight} ${Math.max(10, size * k).toFixed(1)}px ui-monospace, SFMono-Regular, monospace`;
        g.fillText(s, x, y); g.restore();
      };
      const alpha = (idx) => step > idx ? 1 : step === idx ? .38 + .62 * enter : .12;
      const S = Math.min(H * .82, W * .41), sx = W * .50 - S / 2, sy = H * .08, P = brainPath(sx, sy, S);
      seat(g, P, { fill: .74, stroke: .42, width: 1.2 * k });
      fieldFill(g, P, { x: sx, y: sy, w: S, h: S }, t, { gap: Math.max(6, S / 29), strength: .82 });

      // Layer 1: a restricted cortical/GM-WM ribbon on the same anatomy.
      const a0 = alpha(0);
      g.save(); g.clip(P); g.strokeStyle = coral; g.globalAlpha = a0; g.lineCap = "round";
      g.lineWidth = 5.0 * k; g.beginPath();
      g.moveTo(sx + S * .16, sy + S * .42);
      g.bezierCurveTo(sx + S * .15, sy + S * .20, sx + S * .40, sy + S * .09, sx + S * .66, sy + S * .14);
      g.bezierCurveTo(sx + S * .84, sy + S * .18, sx + S * .88, sy + S * .37, sx + S * .80, sy + S * .51); g.stroke();
      g.setLineDash([4 * k, 5 * k]); g.globalAlpha = a0 * .56; g.lineWidth = 2 * k;
      g.beginPath(); g.moveTo(sx + S * .22, sy + S * .48);
      g.bezierCurveTo(sx + S * .31, sy + S * .34, sx + S * .55, sy + S * .29, sx + S * .75, sy + S * .45); g.stroke(); g.restore();

      // Layer 2: a diffuse vascular-space signature, drawn as a connected mesh rather than dots.
      const a1 = alpha(1);
      g.save(); g.clip(P); g.strokeStyle = blue; g.globalAlpha = a1 * .66; g.lineWidth = 1.25 * k;
      for (let j = 0; j < 15; j++) {
        const y0 = sy + S * (.18 + .045 * j), x0 = sx + S * (.18 + .02 * (j % 3));
        g.beginPath(); g.moveTo(x0, y0);
        g.bezierCurveTo(sx + S * (.36 + .05 * Math.sin(j)), y0 - S * .10,
          sx + S * (.62 + .04 * Math.cos(j * 1.7)), y0 + S * .11, sx + S * .83, y0 - S * .02); g.stroke();
      }
      for (let j = 0; j < 7; j++) {
        const x = sx + S * (.25 + .09 * j); g.beginPath(); g.moveTo(x, sy + S * .18);
        g.bezierCurveTo(x - S * .10, sy + S * .37, x + S * .08, sy + S * .55, x - S * .03, sy + S * .72); g.stroke();
      } g.restore();

      // Layer 3: global oxygen-use reduction as a whole-organ wash/pulse, not a third icon.
      const a2 = alpha(2), pulse = .5 + .5 * Math.sin(t * 2.2);
      if (step >= 2) {
        g.save(); g.clip(P);
        const halo = g.createRadialGradient(sx + S * .52, sy + S * .42, S * .08,
          sx + S * .52, sy + S * .42, S * .47);
        halo.addColorStop(0, `rgba(167,139,250,${(.12 + .08 * pulse) * a2})`);
        halo.addColorStop(1, "rgba(167,139,250,0)"); g.fillStyle = halo; g.fillRect(sx, sy, S, S);
        g.restore(); g.strokeStyle = violet; g.globalAlpha = (.35 + .26 * pulse) * a2;
        g.lineWidth = (1.5 + 1.0 * pulse) * k; g.stroke(P); g.globalAlpha = 1;
      }

      // Leaders converge on one organ but deliberately carry no arrowheads.
      const line = (x0, y0, x1, y1, c, aa) => {
        g.save(); g.strokeStyle = c; g.globalAlpha = aa * .72; g.lineWidth = 1.1 * k;
        g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2, y0, x1, y1); g.stroke(); g.restore();
      };
      line(W * .30, H * .25, sx + S * .23, sy + S * .27, coral, a0);
      line(W * .70, H * .31, sx + S * .78, sy + S * .44, blue, a1);
      line(W * .72, H * .70, sx + S * .70, sy + S * .66, violet, a2);
      txt(W * .045, H * .18, "LOCAL EXCHANGE", coral, 9.2, "left", a0, 650);
      txt(W * .045, H * .26, "Kᵢ ↑", hi, 22, "left", a0, 650);
      txt(W * .045, H * .34, "cortical GM + GM/WM", mid, 9.2, "left", a0);
      txt(W * .045, H * .40, "0 / 85 parcels survive FDR", lo, 8.6, "left", a0);
      txt(W * .725, H * .20, "DIFFUSE VASCULAR SPACE", blue, 9.2, "left", a1, 650);
      txt(W * .725, H * .28, "vᴮ ↓", hi, 22, "left", a1, 650);
      txt(W * .725, H * .36, "7 / 7 tissues lower", mid, 9.2, "left", a1);
      txt(W * .725, H * .42, "58 / 85 parcels survive FDR", blue, 8.7, "left", a1);
      txt(W * .725, H * .61, "GLOBAL OXIDATIVE USE", violet, 9.2, "left", a2, 650);
      txt(W * .725, H * .69, "CMRO₂ ↓", hi, 22, "left", a2, 650);
      txt(W * .725, H * .77, "−16.7 µmol / 100 g / min", mid, 9.0, "left", a2);
      txt(W * .725, H * .83, "CBF and lactate not different", lo, 8.7, "left", a2);
      if (step >= 3) {
        const a3 = .30 + .70 * enter, y = H * .895;
        g.save(); g.strokeStyle = mid; g.globalAlpha = .75 * a3; g.lineWidth = 1.15 * k;
        g.beginPath(); g.moveTo(W * .27, y); g.lineTo(W * .73, y); g.stroke();
        [W * .31, W * .50, W * .69].forEach((x, i) => {
          g.fillStyle = i === 0 ? coral : i === 1 ? blue : violet;
          g.beginPath(); g.arc(x, y, 4.0 * k, 0, TAU); g.fill();
        }); g.restore();
        txt(W * .31, y - 18 * k, "baseline", coral, 8.6, "center", a3, 600);
        txt(W * .50, y - 18 * k, "6 months", blue, 8.6, "center", a3, 600);
        txt(W * .69, y - 18 * k, "24 months", violet, 8.6, "center", a3, 600);
        txt(W * .50, H * .945, "serially co-register Kᵢ · vᴮ · regional CMRO₂ to test temporal order", hi, 9.2, "center", a3, 600);
      }
      txt(W * .50, H * .985, step >= 3
        ? "the next experiment can earn an arrow"
        : "one brain · three spatial scales · cross-sectional overlap is not a causal chain",
        step >= 3 ? violet : hi, 9.3, "center", 1, 600);
    },
  },

  /** The full clinically phenotyped PPCS cohort, with the pulse-intolerant subset retained
   * as people rather than abstracted into another box or miniature chart.  Endpoint-specific
   * MRI denominators are deliberately kept out of the icon count and stated in the notes. */
  pulsePhenotypePeople: {
    aspect: .72,
    loop: true,
    fps: 12,
    minWidth: 210,
    draw(g, W, H, t, a = {}) {
      const k = a.k ?? 1, total = Math.max(1, Number(a.total ?? 45) | 0),
        pulse = Math.max(0, Math.min(total, Number(a.pulseIntolerant ?? 32) | 0));
      const hi = cssVar("--hi", "#F9F9F7"), mid = cssVar("--mid", "#97958D"),
        coral = cssVar("--accent", "#D97757"), violet = "#A78BFA";
      const cols = 6, rows = Math.ceil(total / cols), x0 = W * .15, x1 = W * .85,
        y0 = H * .22, y1 = H * .76, dx = (x1 - x0) / Math.max(1, cols - 1),
        dy = (y1 - y0) / Math.max(1, rows - 1), breathe = .5 + .5 * Math.sin(t * 1.55);
      const person = (x, y, colour, alpha, emphasized) => {
        const s = Math.max(.72, k * .70), swell = emphasized ? 1 + .035 * breathe : 1;
        g.save(); g.translate(x, y); g.scale(swell, swell); g.fillStyle = colour;
        g.strokeStyle = colour; g.globalAlpha = alpha; g.lineWidth = Math.max(1.4, 2.2 * s);
        g.beginPath(); g.arc(0, -6.8 * s, 3.6 * s, 0, TAU); g.fill();
        g.beginPath(); g.roundRect(-4.1 * s, -1.4 * s, 8.2 * s, 12.4 * s, 1.8 * s); g.fill();
        g.beginPath(); g.moveTo(-2.1 * s, 9.4 * s); g.lineTo(-2.1 * s, 17.2 * s);
        g.moveTo(2.1 * s, 9.4 * s); g.lineTo(2.1 * s, 17.2 * s); g.stroke(); g.restore();
      };
      g.save(); g.textAlign = "center"; g.textBaseline = "middle";
      g.fillStyle = hi; g.font = `650 ${Math.max(17, 18 * k).toFixed(1)}px ui-monospace, SFMono-Regular, monospace`;
      g.fillText(`${pulse} / ${total}`, W * .5, H * .085);
      g.fillStyle = coral; g.font = `620 ${Math.max(10, 8.2 * k).toFixed(1)}px ui-monospace, SFMono-Regular, monospace`;
      g.fillText("pulse-intolerant", W * .5, H * .135);
      for (let i = 0; i < total; i++) {
        const col = i % cols, row = Math.floor(i / cols), x = x0 + col * dx, y = y0 + row * dy,
          intolerant = i < pulse;
        person(x, y, intolerant ? coral : violet, intolerant ? .96 : .50, intolerant);
      }
      g.fillStyle = mid; g.font = `520 ${Math.max(9.5, 7.3 * k).toFixed(1)}px ui-monospace, SFMono-Regular, monospace`;
      g.fillText("BCBT phenotype", W * .5, H * .875);
      g.fillStyle = coral; g.globalAlpha = .92; g.beginPath(); g.arc(W * .36, H * .93, 3.0 * k, 0, TAU); g.fill();
      g.fillStyle = violet; g.globalAlpha = .58; g.beginPath(); g.arc(W * .58, H * .93, 3.0 * k, 0, TAU); g.fill();
      g.globalAlpha = .82; g.fillStyle = mid; g.font = `500 ${Math.max(8.5, 6.5 * k).toFixed(1)}px ui-monospace, SFMono-Regular, monospace`;
      g.textAlign = "left"; g.fillText("yes", W * .38, H * .93); g.fillText("no", W * .60, H * .93); g.restore();
    },
  },

  /**
   * Evidence boundary as one argument: measured facts enter a deliberately open inference
   * gap; only experiments that could separate mechanisms leave it.  No hypothesis is drawn
   * as though the cross-sectional studies established a causal arrow.
   */
  claimBoundary: {
    aspect: 2.24,
    loop: false,
    minWidth: 720,
    revealSteps: 2,
    draw(g, W, H, t, a = {}) {
      const k = a.k ?? 1;
      const step = Math.max(0, Math.min(2, Math.round(Number(a._step ?? 0) || 0)));
      const q = Math.max(0, Math.min(1, Number(a._stepElapsed ?? 0) / .72));
      const enter = q * q * (3 - 2 * q);
      const hi = cssVar("--hi", "#F9F9F7"), mid = cssVar("--mid", "#97958D");
      const lo = cssVar("--lo", "#6E6C64"), hair = cssVar("--hair", "#33322E");
      const coral = "#D97757", blue = "#6FB8C8", violet = "#A78BFA", green = "#7EB892";
      const txt = (x, y, s, c, size, align = "left", alpha = 1, weight = 500) => {
        g.save(); g.globalAlpha = alpha; g.fillStyle = c; g.textAlign = align; g.textBaseline = "middle";
        g.font = `${weight} ${Math.max(10, size * k).toFixed(1)}px ui-monospace, SFMono-Regular, monospace`;
        g.fillText(s, x, y); g.restore();
      };
      const leftX = W * .055, centreX = W * .50, rightX = W * .675, top = H * .105;
      txt(leftX, top, "WHAT THE DATA FIX", hi, 11.4, "left", 1, 600);
      txt(centreX, top, "INFERENCE GAP", mid, 11.4, "center", 1, 600);
      txt(rightX, top, "MECHANISMS STILL COMPATIBLE", step >= 1 ? hi : lo, 10.8, "left",
        step >= 1 ? .55 + .45 * enter : .20, 600);
      const rows = [
        [coral, "cortical / GM–WM Kᵢ ↑", "endothelial transfer · surface area"],
        [blue, "diffuse tracer-accessible vᴮ ↓", "rarefaction · stalling · calibre"],
        [violet, "global CMRO₂ ↓; CBF preserved", "oxidative capacity · demand"],
        [green, "lower CMRO₂ in pulse intolerance", "autonomic phenotype · deconditioning"],
      ];
      for (let i = 0; i < rows.length; i++) {
        const y = top + (i + 1) * H * .125, [c, observed, hypothesis] = rows[i];
        g.save(); g.fillStyle = c; g.globalAlpha = .95; g.beginPath(); g.arc(leftX + 3 * k, y, 3.4 * k, 0, TAU); g.fill(); g.restore();
        txt(leftX + 17 * k, y, observed, hi, 9.9);
        const ha = step >= 1 ? (step === 1 ? .45 + .55 * enter : 1) : .18;
        // A question mark, not an arrowhead, marks the unresolved causal step.
        g.save(); g.strokeStyle = c; g.globalAlpha = .28 + .32 * ha; g.lineWidth = 1.05 * k;
        g.beginPath(); g.moveTo(W * .36, y); g.quadraticCurveTo(centreX, y - H * .035, W * .63, y); g.stroke(); g.restore();
        txt(centreX, y - H * .033, "?", c, 10.5, "center", ha, 650);
        txt(rightX, y, hypothesis, c, 9.5, "left", ha);
      }
      const noAssocY = top + 5.05 * H * .125;
      txt(leftX + 17 * k, noAssocY, "no RPQ / FSS association after FDR", mid, 9.0);
      txt(rightX, noAssocY, "not established as a severity biomarker", mid, 8.9, "left", step >= 1 ? .92 : .18);

      const testA = step >= 2 ? .42 + .58 * enter : .16;
      txt(W * .5, H * .80, "WHAT WOULD SEPARATE THEM?", step >= 2 ? hi : lo, 10.5, "center", testA, 600);
      const tests = [
        [coral, "serial DCE", "state vs trait"],
        [blue, "CTH / vessel calibre", "volume vs flow topology"],
        [violet, "regional CMRO₂ + Hb", "delivery vs extraction"],
        [green, "multisite longitudinal", "generalisability + prognosis"],
      ];
      const x0 = W * .12, gap = W * .255;
      tests.forEach(([c, title, question], i) => {
        const x = x0 + i * gap;
        g.save(); g.strokeStyle = c; g.globalAlpha = .75 * testA; g.lineWidth = 1.2 * k;
        g.beginPath(); g.moveTo(x - 35 * k, H * .875); g.lineTo(x + 35 * k, H * .875); g.stroke(); g.restore();
        txt(x, H * .855, title, c, 9.1, "center", testA, 600);
        txt(x, H * .91, question, mid, 8.0, "center", testA);
      });
      txt(W * .50, H * .975, "the conclusion is bounded by the design; the next experiment earns the next arrow", hi, 9.2, "center", 1, 600);
    },
  },

};
