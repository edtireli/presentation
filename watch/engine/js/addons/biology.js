/* The biology addon.
 *
 * Everything anatomical the engine can draw, kept out of the core on purpose: a deck about
 * Carrollian energy cones has no use for a segmented brain, and an engine that ships one
 * anyway has to explain why. Adding the addon adds its scenes; removing the file removes
 * them, and nothing else changes.
 *
 * The data is built by tools/brain.py from the FreeSurfer segmentation already installed on
 * this machine — nothing is downloaded, and fsaverage is the standard average subject, so
 * this is the same anatomy every paper in the field draws. Cite Fischl (2012), NeuroImage
 * 62:774 if a figure built from it goes out.
 */
import { rampAt, cssVar } from "../field.js";
import { figureEditParts } from "../figure-edit-parts.js";
import { drawPulseOximeter } from "./pulse-oximeter.js";
import { FSS_STORY } from "./fss-story.js";

const TAU = Math.PI * 2;
const fontOf = (k, base = 11) =>
  `500 ${Math.max(9, base * k).toFixed(1)}px ui-monospace, SFMono-Regular, monospace`;

// ── the brain point cloud ────────────────────────────────────────────────────
/* Loaded once for the whole deck and shared by every slide that shows it. Built by
 * tools/brain.py out of FreeSurfer's fsaverage segmentation; see that file for what is in it
 * and what to cite. */
let BRAIN = null;
let brainPending = null;
const RAMP_ACCENT = -1;                          // "use the deck's accent", not a ramp position

/* Scientific rasters are cached here rather than requested by every scene holder.  They are
 * used only where the pixels are themselves evidence (subject MRI or microscopy); diagrams
 * and annotations remain native canvas marks. */
const RASTERS = new Map();
const RASTER_FRAMES = new WeakMap();
function loadRaster(url) {
  if (RASTERS.has(url)) return Promise.resolve(RASTERS.get(url));
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { RASTERS.set(url, img); resolve(img); };
    img.onerror = () => { console.warn(`biology raster: ${url}`); resolve(null); };
    img.src = url;
  });
}
function raster(url) { return RASTERS.get(url) || null; }

// The animated p-Brain wordmark is decoded as video. Drawing an animated GIF through a
// canvas returns the first decoded frame on some Chromium builds, which made the mark look
// frozen even though the surrounding scene kept rendering. The muted loop remains live while
// this scene is visible and resumes without seeking when a reveal click adds the two maps.
let PBRAIN_MARK_VIDEO=null,pbrainMarkPending=null,pbrainMarkLastDraw=0,pbrainMarkIdleTimer=0;
function loadPbrainMarkVideo(url="decks/assets/defense/pbrain-header-black.webm"){
  if(PBRAIN_MARK_VIDEO)return Promise.resolve(PBRAIN_MARK_VIDEO);if(pbrainMarkPending)return pbrainMarkPending;
  pbrainMarkPending=new Promise(resolve=>{const video=document.createElement("video");video.muted=true;video.loop=true;
    video.playsInline=true;video.defaultMuted=true;video.preload="auto";const ready=()=>{PBRAIN_MARK_VIDEO=video;resolve(video);};
    video.addEventListener("loadeddata",ready,{once:true});video.addEventListener("error",()=>resolve(null),{once:true});
    video.src=url;video.load();});return pbrainMarkPending;
}
function activatePbrainMarkVideo(){const video=PBRAIN_MARK_VIDEO;pbrainMarkLastDraw=performance.now();
  if(!pbrainMarkIdleTimer){const check=()=>{if(performance.now()-pbrainMarkLastDraw>900){PBRAIN_MARK_VIDEO?.pause?.();pbrainMarkIdleTimer=0;}
    else pbrainMarkIdleTimer=setTimeout(check,450);};pbrainMarkIdleTimer=setTimeout(check,450);}
  if(video?.readyState>=2&&video.paused)void video.play().catch(()=>{});return video;
}
function rasterFrame(img) {
  if (!img) return null;
  if (RASTER_FRAMES.has(img)) return RASTER_FRAMES.get(img);
  const c=document.createElement("canvas");c.width=img.naturalWidth;c.height=img.naturalHeight;
  const q=c.getContext("2d",{willReadFrequently:true});q.drawImage(img,0,0);
  const frame={w:c.width,h:c.height,data:q.getImageData(0,0,c.width,c.height).data};
  RASTER_FRAMES.set(img,frame);return frame;
}

/** Translate evidence pixels into Spiral marks while retaining their measured colour channels. */
function drawSpiralRaster(g,img,box,k,a={}){
  const frame=rasterFrame(img);if(!frame)return false;
  const crop=a.crop||[0,0,1,1],sx=Math.round(crop[0]*frame.w),sy=Math.round(crop[1]*frame.h);
  const sw=Math.max(1,Math.round(crop[2]*frame.w)),sh=Math.max(1,Math.round(crop[3]*frame.h));
  const scale=Math.min(box.w/sw,box.h/sh),dw=sw*scale,dh=sh*scale,ox=box.x+(box.w-dw)/2,oy=box.y+(box.h-dh)/2;
  const stride=Math.max(1,Number(a.stride??2)|0),mode=a.mode||"dark",alpha=Number(a.alpha??1);
  const hi=cssVar("--hi","#F9F9F7"),lo=cssVar("--lo","#6E6C64");g.save();
  for(let y=0;y<sh;y+=stride)for(let x=0;x<sw;x+=stride){
    const j=((sy+y)*frame.w+(sx+x))*4,r=frame.data[j],gg=frame.data[j+1],b=frame.data[j+2],aa=frame.data[j+3]/255;
    if(aa<.04)continue;const lum=(.299*r+.587*gg+.114*b)/255,maxc=Math.max(r,gg,b)/255,minc=Math.min(r,gg,b)/255,sat=maxc-minc;
    if(a.chromaOnly&&sat<Number(a.minSaturation??.075)&&lum>.10)continue;
    let density=mode==="ink"?Math.max(sat*.85,1-lum):maxc;
    if(a.monochrome)density=lum;if(density<Number(a.threshold??.055))continue;
    if(hash01(x,y,frame.w)>clamp01(.18+density*.82))continue;
    const flip180=!!a.flip180,
      px=ox+(flip180?sw-x-.5:x+.5)*scale,
      py=oy+(flip180?sh-y-.5:y+.5)*scale,
      rad=(.42+.74*Math.sqrt(density))*k*Number(a.dot??1);
    if(a.monochrome){
      const v=Math.round(mix(Number(a.monoMin??42),Number(a.monoMax??218),Math.pow(lum,.88)));
      g.fillStyle=`rgb(${v},${v},${v})`;
    }else g.fillStyle=mode==="ink"&&sat<.12?hi:`rgb(${r},${gg},${b})`;
    g.globalAlpha=alpha*aa*(.16+.76*density);g.beginPath();g.arc(px,py,rad,0,TAU);g.fill();
  }
  g.restore();return true;
}

let AXIAL_META=null,axialMetaPending=null,axialPending=null,axialLoaded=false;
let orthogonalPending=null,orthogonalLoaded=false;
function loadAxialMeta(base="decks/assets/defense"){
  if(AXIAL_META)return Promise.resolve(AXIAL_META);if(axialMetaPending)return axialMetaPending;
  axialMetaPending=fetch(`${base}/patient-axial-meta.json`).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();})
    .then(meta=>(AXIAL_META=meta)).catch(e=>{axialMetaPending=null;console.warn("axial metadata: "+e.message);return null;});
  return axialMetaPending;
}
function loadAxialStack(base="decks/assets/defense"){
  if(axialLoaded)return Promise.resolve(AXIAL_META);if(axialPending)return axialPending;
  axialPending=loadAxialMeta(base).then(async meta=>{if(!meta)return null;const urls=[];
    for(let z=0;z<meta.slices;z++)urls.push(`${base}/patient-axial-base-z${z}.png`,`${base}/patient-axial-regions-z${z}.png`,`${base}/patient-axial-parcels-z${z}.png`);
    await Promise.all(urls.map(loadRaster));axialLoaded=true;return meta;
  }).catch(e=>{axialPending=null;console.warn("axial stack: "+e.message);return null;});return axialPending;
}
function loadOrthogonalRegions(base="decks/assets/defense"){
  if(orthogonalLoaded)return Promise.resolve(AXIAL_META);if(orthogonalPending)return orthogonalPending;
  orthogonalPending=loadAxialMeta(base).then(async meta=>{if(!meta)return null;const urls=[];
    for(let region=1;region<=7;region++)for(const view of ["axial","coronal","sagittal"])
      urls.push(`${base}/patient-ortho-region-${region}-${view}.png`);
    await Promise.all(urls.map(loadRaster));orthogonalLoaded=true;return meta;
  }).catch(e=>{orthogonalPending=null;console.warn("orthogonal regions: "+e.message);return null;});return orthogonalPending;
}

/* Named surface samples from the open Z-Anatomy / Brain Project arterial and venous models.
 * This is deliberately separate from the stylised microvascular paths below: gross anatomy
 * is evidence-derived, while local exchange is a pedagogical schematic. */
let VESSEL_ATLAS = null, VESSEL_JUNCTIONS = [], vesselAtlasPending = null;
function loadVesselAtlas(url = "decks/data/brainproject-vessels.json") {
  if (VESSEL_ATLAS) return Promise.resolve(VESSEL_ATLAS);
  if (vesselAtlasPending) return vesselAtlasPending;
  vesselAtlasPending = fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => {
      const s = 1 / (d.q || 8192);
      VESSEL_ATLAS = d.groups.map((group) => {
        const P = new Float32Array(group.points.length);
        for (let i = 0; i < P.length; i++) P[i] = group.points[i] * s;
        const indexed=Array.isArray(group.edges),E=indexed?new Uint32Array(group.edges):new Float32Array((group.segments||[]).length);
        if(indexed)E.set(group.edges);else for (let i = 0; i < E.length; i++) E[i] = group.segments[i] * s;
        const U=new Float32Array(group.flow?.length||P.length/3);if(group.flow)for(let i=0;i<U.length;i++)U[i]=group.flow[i]/65535;
        const category=String(group.category).startsWith("vein")?"veins":"arteries";
        const paths=(group.paths||[]).map(path=>{const Q=new Float32Array(path.points.length),R=new Float32Array(path.radii?.length||0),F=new Float32Array(path.flow?.length||path.points.length/3);
          for(let i=0;i<Q.length;i++)Q[i]=path.points[i]*s;for(let i=0;i<R.length;i++)R[i]=path.radii[i]*s;
          if(path.flow)for(let i=0;i<F.length;i++)F[i]=path.flow[i]/65535;
          return{P:Q,R,U:F,n:Q.length/3,sourceDerived:path.sourceDerived!==false,synthetic:!!path.synthetic,traceable:path.traceable!==false};});
        const n=P.length/3;return { label: group.label, category, side: group.side, P, E, U, paths, indexed, n, ne:E.length/(indexed?2:6),sx:new Float32Array(n),sy:new Float32Array(n),sd:new Float32Array(n) };
      });
      VESSEL_JUNCTIONS=(d.junctions||[]).map(j=>{const U=new Float32Array(j.flow?.length||0);if(j.flow)for(let i=0;i<U.length;i++)U[i]=j.flow[i]/65535;
        return{category:String(j.category).startsWith("vein")?"veins":"arteries",a:j.a.map(v=>v*s),b:j.b.map(v=>v*s),
          path:(j.path||[...j.a,...j.b]).map(v=>v*s),radius:Number(j.radius||0)*s,labelA:j.labelA||"",labelB:j.labelB||"",
          sideA:j.sideA||"",sideB:j.sideB||"",traceable:j.traceable!==false,U,u:U.length?(U[0]+U.at(-1))*.5:0};});
      // Junctions are separate atlas objects, so give each bridge the same geodesic flow
      // coordinate as its nearest surface vertices. This lets the contrast packet cross the
      // confluence instead of blinking across a sub-pixel gap between named meshes.
      for(const junction of VESSEL_JUNCTIONS){if(junction.U.length)continue;let sum=0,count=0;
        for(const point of [junction.a,junction.b]){let best=Infinity,bestU=0;
          for(const group of VESSEL_ATLAS){if(group.category!==junction.category)continue;
            for(let i=0;i<group.n;i++){const k=i*3,dx=group.P[k]-point[0],dy=group.P[k+1]-point[1],dz=group.P[k+2]-point[2],dd=dx*dx+dy*dy+dz*dz;
              if(dd<best){best=dd;bestU=group.U[i]??0;}}}
          if(best<Infinity){sum+=bestU;count++;}}
        junction.u=count?sum/count:0;
      }
      return VESSEL_ATLAS;
    }).catch((e) => { vesselAtlasPending = null; console.warn("vessel atlas: " + e.message); return null; });
  return vesselAtlasPending;
}

/* Where each tissue sits on the field's ramp. Spread out, so the classes are told apart when
 * they are all on at once, and ordered roughly outside-in: cortex is the palest thing and the
 * ventricles the darkest, which is the way an anatomist would shade it anyway. */
const BRAIN_TONES = {
  cortex: 0.93, cerebellum: 0.74, wm: 0.60, cerebellum_wm: 0.50,
  subcortex: 0.38, brainstem: 0.28, ventricles: 0.14,
};

/* Public scene arguments use the short keys written into brain.json, but a presentation is
 * often authored from prose. Accept the obvious anatomical spellings too, so a typo such as
 * `white` does not silently produce an empty highlight on stage. Unknown keys are kept: an
 * addon built with a richer segmentation can still use its own names. */
const SEGMENT_ALIASES = {
  cortical: "cortex", cortex: "cortex", "cortical gm": "cortex", grey: "cortex", gray: "cortex",
  white: "wm", wm: "wm", "white matter": "wm",
  subcortical: "subcortex", subcortex: "subcortex", "subcortical gm": "subcortex",
  cerebellar: "cerebellum", cerebellum: "cerebellum", "cerebellar gm": "cerebellum",
  "cerebellar white": "cerebellum_wm", "cerebellar wm": "cerebellum_wm",
  cerebellum_wm: "cerebellum_wm", brainstem: "brainstem", ventricle: "ventricles",
  ventricles: "ventricles",
};

/* Tissue classes peel in different anatomical directions. The vectors are deliberately
 * fixed rather than random: the same click should make the same picture at rehearsal and
 * at the defence, and the exploded state should still be recognisable as anatomy. */
const BRAIN_EXPLODE = {
  cortex:       [ 0.72, -0.04,  0.22],
  wm:           [-0.58, -0.08,  0.14],
  subcortex:    [-0.20,  0.48,  0.06],
  ventricles:   [ 0.06, -0.50,  0.28],
  cerebellum:   [ 0.42,  0.18, -0.54],
  cerebellum_wm:[-0.38,  0.18, -0.48],
  brainstem:    [ 0.02, -0.08, -0.72],
};

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const mix = (a, b, u) => a + (b - a) * u;
const hash01 = (a, b = 0, c = 0) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453123;
  return x - Math.floor(x);
};
const mixRgb = (a, b, u) => [mix(a[0], b[0], u), mix(a[1], b[1], u), mix(a[2], b[2], u)];
const contextAlpha = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? Math.max(0.06, Math.min(0.8, n)) : 0.28;
};

function tissueList(v) {
  if (v == null || v === false) return null;
  return [].concat(v).map((x) => {
    const raw = String(x);
    return SEGMENT_ALIASES[raw.toLowerCase().replace(/[-_]+/g, " ").trim()] || raw;
  });
}

/* A scene holder updates `_step` on every reveal. Array entries are state snapshots; sparse
 * arrays hold the most recent defined state, which makes a long slide pleasant to author. */
function atStep(seq, step, fallback) {
  if (seq == null) return fallback;
  if (!Array.isArray(seq)) return seq;
  for (let i = Math.min(Math.max(0, step | 0), seq.length - 1); i >= 0; i--) {
    if (seq[i] !== undefined) return seq[i];
  }
  return fallback;
}

function sceneStep(a) {
  const n = Number(a._step ?? a.step ?? a.phase ?? 0);
  return Number.isFinite(n) ? Math.max(0, n | 0) : 0;
}

/** Resolve a number that may be static or a replayable `{from,to,delay,seconds}` motion. */
function motionValue(spec, t, fallback, defaults = {}) {
  if (spec == null || spec === false) return fallback;
  if (spec === true) spec = { from: defaults.from ?? fallback, to: defaults.to ?? 1 };
  if (typeof spec === "number") return Number.isFinite(spec) ? spec : fallback;
  if (typeof spec !== "object") return fallback;
  const fromN = Number(spec.from ?? defaults.from ?? fallback);
  const toN = Number(spec.to ?? spec.amount ?? defaults.to ?? fallback);
  const delayN = Number(spec.delay ?? defaults.delay ?? 0);
  const secondsN = Number(spec.seconds ?? spec.duration ?? defaults.seconds ?? 1.2);
  const from = Number.isFinite(fromN) ? fromN : fallback;
  const to = Number.isFinite(toN) ? toN : fallback;
  const delay = Math.max(0, Number.isFinite(delayN) ? delayN : 0);
  const seconds = Math.max(0.001, Number.isFinite(secondsN) ? secondsN : 1.2);
  const u = smooth((t - delay) / seconds);
  return from + (to - from) * u;
}

function explodePoint(x, y, z, key, amount, out = null) {
  const p = out || [0, 0, 0];
  if (!amount) { p[0] = x; p[1] = y; p[2] = z; return p; }
  const v = BRAIN_EXPLODE[key] || [0, 0, 0];
  const swell = 1 + 0.13 * amount;
  const spread = 0.44 * amount;
  p[0] = x * swell + v[0] * spread;
  p[1] = y * swell + v[1] * spread;
  p[2] = z * swell + v[2] * spread;
  return p;
}

function brainPosition(W, H, a) {
  const p = a.center || a.position || [];
  const px = Number(a.centerX ?? a.x ?? p[0] ?? 0.5);
  const py = Number(a.centerY ?? a.y ?? p[1] ?? 0.52);
  // Fractions are convenient in JSON; values outside the slide range are treated as pixels.
  const ox = Number.isFinite(px) ? (Math.abs(px) <= 1.5 ? px * W : px) : W / 2;
  const oy = Number.isFinite(py) ? (Math.abs(py) <= 1.5 ? py * H : py) : H * 0.52;
  return [ox + Number(a.offsetX || 0), oy + Number(a.offsetY || 0)];
}

export function loadBrain(url = "decks/data/brain.json") {
  if (BRAIN) return Promise.resolve(BRAIN);
  if (brainPending) return brainPending;
  brainPending = fetch(url)
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => {
      // Unpacked ONCE into typed arrays. The file holds signed bytes to stay small on disk;
      // dividing seven thousand of them by the quantiser on every frame would not.
      const n = d.seg.length, s = 1 / (d.q || 127);
      const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
      for (let i = 0; i < n * 3; i++) { P[i] = d.pos[i] * s; N[i] = d.nrm[i] * s; }
      BRAIN = {
        n, P, N,
        seg: Int16Array.from(d.seg),
        segments: d.segments,
        tone: d.segments.map((x) => BRAIN_TONES[x.key] ?? 0.6),
        mmPerUnit: d.mm_per_unit, source: d.source,
      };
      return BRAIN;
    })
    .catch((e) => { brainPending = null; console.warn("brain: " + e.message); return null; });
  return brainPending;
}


let MESH = null;
let meshPending = null;

/** The same anatomy as triangles. Built by the same tool, in the same frame as the points. */
export function loadBrainMesh(url = "decks/data/brain-mesh.json") {
  if (MESH) return Promise.resolve(MESH);
  if (meshPending) return meshPending;
  meshPending = fetch(url)
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => {
      const s = 1 / (d.q || 32000);
      const V = new Float32Array(d.vert.length);
      for (let i = 0; i < V.length; i++) V[i] = d.vert[i] * s;
      const F = Int32Array.from(d.face);
      const nf = F.length / 3;
      // which segment each triangle belongs to, flattened out of the per-segment ranges so
      // the draw loop never has to search
      const fseg = new Int16Array(nf);
      d.segments.forEach((seg, i) => fseg.fill(i, seg.f0, seg.f0 + seg.fn));
      // The explode state translates a tissue before projection. Mesh vertices are stored in
      // one flat array, so remember their tissue as well as the faces'. The generated meshes
      // do not share vertices across tissue boundaries; keeping the last value is a safe
      // fallback for a hand-authored mesh that does.
      const vseg = new Int16Array(V.length / 3);
      vseg.fill(-1);
      for (let f = 0, j = 0; f < nf; f++, j += 3) {
        const si = fseg[f];
        vseg[F[j]] = si; vseg[F[j + 1]] = si; vseg[F[j + 2]] = si;
      }
      for (let i = 0; i < vseg.length; i++) if (vseg[i] < 0) vseg[i] = 0;
      MESH = {
        V, F, fseg, vseg, nf, nv: V.length / 3, segments: d.segments,
        tone: d.segments.map((x) => BRAIN_TONES[x.key] ?? 0.6),
        // scratch, kept between frames: allocating four arrays of six thousand floats
        // thirty times a second is more work than the projection it holds
        sx: new Float32Array(V.length / 3),
        sy: new Float32Array(V.length / 3),
        sz: new Float32Array(V.length / 3),
        bins: null,
      };
      return MESH;
    })
    .catch((e) => { meshPending = null; console.warn("brain mesh: " + e.message); return null; });
  return meshPending;
}

// ── microscopy-traced neural and glial morphologies ───────────────────────
// The compact file is derived from CC BY 4.0 NeuroMorpho.Org SWC reconstructions.
// Each retained node stores x,y,z,r,parent,type as signed integers; unpack once so the
// projector loop only rotates typed arrays.  Metadata and original URLs remain in the file.
let MORPHOLOGIES = null;
let morphologyPending = null;

export function loadMorphologies(url = "decks/data/nvu-morphologies.json") {
  if (MORPHOLOGIES) return Promise.resolve(MORPHOLOGIES);
  if (morphologyPending) return morphologyPending;
  morphologyPending = fetch(url)
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => {
      const q = 1 / (d.q || 4096), cells = {};
      Object.entries(d.cells || {}).forEach(([key, raw]) => {
        const n = Math.floor(raw.data.length / 6), P = new Float32Array(n * 3);
        const R = new Float32Array(n), parent = new Int32Array(n), type = new Int8Array(n);
        const children = new Int16Array(n);
        for (let i = 0; i < n; i++) {
          const j = i * 6, p = i * 3;
          P[p] = raw.data[j] * q; P[p + 1] = raw.data[j + 1] * q; P[p + 2] = raw.data[j + 2] * q;
          R[i] = raw.data[j + 3] * q; parent[i] = raw.data[j + 4]; type[i] = raw.data[j + 5];
          if (parent[i] >= 0) children[parent[i]]++;
        }
        cells[key] = { ...raw, n, P, R, parent, type, children };
        delete cells[key].data;
      });
      MORPHOLOGIES = { ...d, cells };
      return MORPHOLOGIES;
    })
    .catch((e) => { morphologyPending = null; console.warn("cell morphologies: " + e.message); return null; });
  return morphologyPending;
}

let NIZARI_NVU = null;
let nizariPending = null;

export function loadNizariNVU(url = "decks/data/nizari2019-nvu-points.json") {
  if (NIZARI_NVU) return Promise.resolve(NIZARI_NVU);
  if (nizariPending) return nizariPending;
  nizariPending = fetch(url)
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => {
      const groups = {};
      Object.entries(d.groups || {}).forEach(([key, points]) => {
        const P = new Float32Array(points.length * 4);
        for (let i = 0; i < points.length; i++) P.set(points[i], i * 4);
        groups[key] = { P, n: points.length };
      });
      NIZARI_NVU = { ...d, groups };
      return NIZARI_NVU;
    })
    .catch((e) => { nizariPending = null; console.warn("Nizari NVU: " + e.message); return null; });
  return nizariPending;
}

// ── H01 human cortical slab ─────────────────────────────────────────────────
// The browser asset is generated from the local article_cth reconstruction.  It contains
// registered H01 somata, real neuron-mesh samples, the repaired whole-slab vascular graph,
// and samples from the released vessel surfaces.  Large arrays stay binary inside JSON so
// opening the defence never inflates the source NumPy unicode members.
let H01_CORTEX = null;
let h01CortexPending = null;
let H01_OXYGEN = null;
let h01OxygenPending = null;
let H01_TURNTABLES = null;
const h01TurntablePending = new Map();
let h01TurntableActive = null;
let h01TurntableLastReady = null;
let h01TurntableFrameCache = null;
let h01TurntableFrameStage = null;
let h01TurntableEpoch = 0;
let h01TurntableLastDraw = 0;
let h01TurntableIdleTimer = 0;
let h01TurntableLastSync = 0;
let h01TurntableGroup = null;

const H01_TURNTABLE_STAGES = ["neurons", "vessel", "mg", "oligo", "astro", "all"];
const H01_TURNTABLE_FILES = [
  ...H01_TURNTABLE_STAGES,
  "vessel-only",
  "vessel-only-black",
  "exchange",
  "exchange-cells",
  "exchange-physical-blue",
  "exchange-cells-physical-blue",
  "exchange-physical-blue-boxes",
];
const H01_TURNTABLE_GROUPS = {
  study: [...H01_TURNTABLE_STAGES, "vessel-only", "exchange", "exchange-cells"],
  oxygen: ["all", "vessel-only", "vessel-only-black", "exchange-physical-blue", "exchange-cells-physical-blue",
    "exchange-physical-blue-boxes"],
};
// A full turn in the source asset is three seconds. Present it at 42% speed so the audience
// can actually inspect vessel/cell relationships; all reveal layers still share one angle.
// A ten-second revolution is slow enough to follow a named surface or a transport front,
// while still completing a full inspection during one explanatory beat.
const H01_TURNTABLE_RATE = .22;

function pauseH01Turntables() {
  if (!H01_TURNTABLES) return;
  for (const video of Object.values(H01_TURNTABLES)) video?.pause?.();
  h01TurntableActive = null;
  h01TurntableGroup = null;
}

/** Keep every reveal state running while the microscope sequence is on screen.
 *
 * Switching a paused VP9 stream required a seek and a fresh decode, which made a click hesitate
 * and then jump to a nearby angle.  These registered loops now start together and remain live for
 * the duration of the sequence.  A reveal is therefore only a source swap—no pause, seek or
 * restart.  The idle watchdog still releases every decoder after navigation leaves the scene. */
function activateH01Turntable(stage, groupName="study") {
  const video = H01_TURNTABLES?.[stage];
  if (!video) return null;
  const now = performance.now();
  h01TurntableLastDraw = now;
  if (!h01TurntableIdleTimer) {
    const check = () => {
      if (performance.now() - h01TurntableLastDraw > 900) {
        pauseH01Turntables();
        h01TurntableIdleTimer = 0;
      } else h01TurntableIdleTimer = setTimeout(check, 450);
    };
    h01TurntableIdleTimer = setTimeout(check, 450);
  }
  const groupStages=H01_TURNTABLE_GROUPS[groupName]||H01_TURNTABLE_GROUPS.study,
    videos=groupStages.map(key=>H01_TURNTABLES?.[key]).filter(Boolean);
  if(h01TurntableGroup!==groupName){
    const prior=Object.values(H01_TURNTABLES).find(v=>v&&!v.paused&&v.readyState>=2),phase=Number(prior?.currentTime)||0;
    for(const other of Object.values(H01_TURNTABLES))if(other&&!other.paused)other.pause();
    for(const other of videos){if(other.readyState>=2){try{other.currentTime=phase;}catch(_){}}}
    h01TurntableGroup=groupName;h01TurntableActive=null;
  }
  if(h01TurntableActive===null||videos.some(v=>v.paused)){
    const reference=videos.find(v=>v.readyState>=2),phase=Number(reference?.currentTime)||0;
    for(const other of videos){
      other.playbackRate=H01_TURNTABLE_RATE;
      // Only align a stream before the group starts. Never seek during a reveal.
      if(other.readyState>=2&&Math.abs((Number(other.currentTime)||0)-phase)>.06){try{other.currentTime=phase;}catch(_){}}
      void other.play().catch(()=>{});
    }
    h01TurntableEpoch=now-phase/H01_TURNTABLE_RATE*1000;
    h01TurntableLastSync=now;
  }
  // Media elements started in one task normally remain frame-locked. Correct only tiny clock
  // drift with playback-rate nudges; a hard currentTime assignment here would recreate the
  // visible stall this path is designed to eliminate.
  if(now-h01TurntableLastSync>500){
    const reference=videos.find(v=>v.readyState>=2&&!v.seeking),duration=Number(reference?.duration),phase=Number(reference?.currentTime)||0;
    if(reference&&Number.isFinite(duration)&&duration>0){for(const other of videos){
      if(other===reference||other.readyState<2||other.seeking){if(other===reference)other.playbackRate=H01_TURNTABLE_RATE;continue;}
      let delta=phase-(Number(other.currentTime)||0);if(delta>duration/2)delta-=duration;else if(delta<-duration/2)delta+=duration;
      other.playbackRate=H01_TURNTABLE_RATE+Math.max(-.028,Math.min(.028,delta*.18));
    }}
    h01TurntableLastSync=now;
  }
  h01TurntableActive=stage;
  if(video.readyState<2||video.seeking)return h01TurntableFrameCache&&h01TurntableFrameStage===stage?h01TurntableFrameCache:null;
  h01TurntableLastReady=stage;
  return video;
}

/**
 * The microscope inset is deliberately pre-rendered.  The former browser renderer rebuilt
 * tens of thousands of projected triangles while the deck was presenting; apart from being
 * expensive, its face-order approximation made cells flicker between opaque and hollow as
 * they turned.  These small, muted WebM loops are the same released H01 surfaces, conservatively
 * remeshed and rendered offline with a fixed upright camera and specimen-locked lighting.
 */
export function loadH01Turntables(
  base = "decks/assets/defense/h01-turntables",
  groupName = "study"
) {
  H01_TURNTABLES ||= {};
  const requested = H01_TURNTABLE_GROUPS[groupName] || H01_TURNTABLE_GROUPS.study;
  const jobs = requested.map((stage) => {
    if (Object.prototype.hasOwnProperty.call(H01_TURNTABLES, stage))
      return Promise.resolve([stage, H01_TURNTABLES[stage]]);
    if (h01TurntablePending.has(stage)) return h01TurntablePending.get(stage);
    const job = new Promise((resolve) => {
      const video = document.createElement("video");
      video.muted = true; video.loop = true; video.playsInline = true; video.preload = "auto";
      const done = () => resolve([stage, video]);
      video.addEventListener("canplay", done, { once: true });
      video.addEventListener("error", () => resolve([stage, null]), { once: true });
      // Version only regenerated passes so replacing a VP9 file cannot leave an old decoded
      // frame in the presentation browser's cache.
      const regenerated = stage.startsWith("vessel-only") || stage === "exchange" || stage === "exchange-cells" || stage.includes("physical-blue");
      video.src = `${base}/${stage}.webm${regenerated?"?v=20260906-oxygen-v6":""}`;
      video.load();
    }).then(([loadedStage, video]) => {
      h01TurntablePending.delete(loadedStage);
      H01_TURNTABLES[loadedStage] = video;
      if (video) {
        try { video.currentTime = 0; video.playbackRate = H01_TURNTABLE_RATE; video.pause(); } catch (_) {}
      }
      return [loadedStage, video];
    });
    h01TurntablePending.set(stage, job);
    return job;
  });
  return Promise.all(jobs).then(() => {
    h01TurntableEpoch = performance.now();
    return H01_TURNTABLES;
  }).catch((e) => {
    console.warn("H01 turntables: " + e.message);
    return null;
  });
}

function unpackBase64(text, Type) {
  const raw = atob(text || ""), bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Type(bytes.buffer);
}

export function loadH01Cortex(url = "decks/data/h01-cortex-slab.json") {
  if (H01_CORTEX) return Promise.resolve(H01_CORTEX);
  if (h01CortexPending) return h01CortexPending;
  h01CortexPending = fetch(url)
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => {
      const cells = {};
      Object.entries(d.cells || {}).forEach(([key, cell]) => {
        cells[key] = { ...cell, P: unpackBase64(cell.pos_b64, Int16Array) };
        delete cells[key].pos_b64;
      });
      const microCells = {};
      Object.entries(d.microdomain?.cells || {}).forEach(([key, cell]) => {
        microCells[key] = { ...cell, P: unpackBase64(cell.pos_b64, Int16Array) };
        delete microCells[key].pos_b64;
      });
      const surfaceMorphologies = d.microdomain?.surface_morphologies ? {
        ...d.microdomain.surface_morphologies,
        meshes: (d.microdomain.surface_morphologies.meshes || []).map((mesh) => {
          const Index = mesh.index_dtype === "uint32" ? Uint32Array : Uint16Array;
          const decoded = {
            ...mesh,
            V: unpackBase64(mesh.vertices_b64, Int16Array),
            F: unpackBase64(mesh.faces_b64, Index),
            E: unpackBase64(mesh.edges_b64, Index),
          };
          delete decoded.vertices_b64; delete decoded.faces_b64; delete decoded.edges_b64;
          return decoded;
        }),
      } : null;
      const microdomain = d.microdomain ? {
        ...d.microdomain,
        cells: microCells,
        neurites: {
          ...d.microdomain.neurites,
          P: unpackBase64(d.microdomain.neurites?.pos_b64, Int16Array),
        },
        vessels: {
          ...d.microdomain.vessels,
          P: unpackBase64(d.microdomain.vessels?.nodes_b64, Int16Array),
          E: unpackBase64(d.microdomain.vessels?.edges_b64, Uint16Array),
          R: unpackBase64(d.microdomain.vessels?.radius_b64, Uint8Array),
          S: unpackBase64(d.microdomain.vessels?.surface_b64, Int16Array),
        },
        surface_morphologies: surfaceMorphologies,
      } : null;
      if (microdomain) {
        delete microdomain.neurites.pos_b64;
        delete microdomain.vessels.nodes_b64;
        delete microdomain.vessels.edges_b64;
        delete microdomain.vessels.radius_b64;
        delete microdomain.vessels.surface_b64;
      }
      H01_CORTEX = {
        ...d,
        cells,
        microdomain,
        neurites: { ...d.neurites, P: unpackBase64(d.neurites?.pos_b64, Int16Array) },
        vessels: {
          ...d.vessels,
          P: unpackBase64(d.vessels?.nodes_b64, Int16Array),
          E: unpackBase64(d.vessels?.edges_b64, Uint16Array),
          R: unpackBase64(d.vessels?.radius_b64, Uint8Array),
          S: unpackBase64(d.vessels?.surface_b64, Int16Array),
        },
        _view: null,
      };
      delete H01_CORTEX.neurites.pos_b64;
      delete H01_CORTEX.vessels.nodes_b64;
      delete H01_CORTEX.vessels.edges_b64;
      delete H01_CORTEX.vessels.radius_b64;
      delete H01_CORTEX.vessels.surface_b64;
      return H01_CORTEX;
    })
    .catch((e) => { h01CortexPending = null; console.warn("H01 cortex: " + e.message); return null; });
  return h01CortexPending;
}

/** Precomputed normalized reaction–diffusion field registered to the released H01
 * microdomain. It is intentionally a small display asset: the browser projects only the
 * selected 4,096 samples and animates particles on one connected explanatory path. */
export function loadH01Oxygen(url = "decks/data/h01-oxygen-transport.json") {
  if (H01_OXYGEN) return Promise.resolve(H01_OXYGEN);
  if (h01OxygenPending) return h01OxygenPending;
  h01OxygenPending = fetch(url)
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => {
      const f=d.field||{},flow=d.flow||{};
      H01_OXYGEN={...d,field:{...f,
        displayIndices:unpackBase64(f.display_indices_u16_b64,Uint16Array),
        normoxia:unpackBase64(f.concentration_normoxia_u8_b64,Uint8Array),
        hypoxia:unpackBase64(f.concentration_hypoxia_u8_b64,Uint8Array),
        gradient:unpackBase64(f.gradient_u8_b64,Uint8Array),
        uptake:unpackBase64(f.uptake_u8_b64,Uint8Array),
        source:unpackBase64(f.source_mask_u8_b64,Uint8Array)},
        flow:{...flow,path:unpackBase64(flow.main_path_i16_b64,Int16Array),
          arc:unpackBase64(flow.main_path_arc_u16_b64,Uint16Array),
          phases:unpackBase64(flow.particle_phases_u16_b64,Uint16Array)},
        uptakePaths:(d.uptake_paths||[]).map(path=>({...path,P:unpackBase64(path.points_i16_b64,Int16Array)}))};
      return H01_OXYGEN;
    }).catch((e)=>{h01OxygenPending=null;console.warn("H01 oxygen: "+e.message);return null;});
  return h01OxygenPending;
}

// ── the defence subject: literal cubes + the same subject's 85 parcels ─────
let PATIENT = null;
let patientPending = null;
let PATIENT_SURFACE = null;
let patientSurfacePending = null;
let STUDY2_PARCELS = null;
let study2ParcelsPending = null;

export function loadPatientBrain(url = "decks/data/patient-parcels.json") {
  if (PATIENT) return Promise.resolve(PATIENT);
  if (patientPending) return patientPending;
  patientPending = fetch(url)
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => {
      const s = 1 / (d.q || 127);
      const P = new Float32Array(d.pos.length), N = new Float32Array(d.nrm.length);
      const V = new Float32Array(d.vox.length);
      for (let i = 0; i < P.length; i++) { P[i] = d.pos[i] * s; N[i] = d.nrm[i] * s; }
      for (let i = 0; i < V.length; i++) V[i] = d.vox[i] * s;
      PATIENT = {
        P, N, V, n: d.seg.length, nv: d.voxSeg.length,
        seg: Int16Array.from(d.seg), voxSeg: Int16Array.from(d.voxSeg),
        segments: d.segments, curves: d.curves || {}, source: d.source,
        voxelSize: Number(d.voxel_stride_native || 9) / Math.max(1, Number(d.mm_per_unit || 90)),
        corrections: d.corrections || [], _selected: new Map(),
      };
      return PATIENT;
    })
    .catch((e) => { patientPending = null; console.warn("patient brain: " + e.message); return null; });
  return patientPending;
}

export function loadPatientSurface(url = "decks/data/patient-parcel-surface.json") {
  if(PATIENT_SURFACE)return Promise.resolve(PATIENT_SURFACE);if(patientSurfacePending)return patientSurfacePending;
  patientSurfacePending=fetch(url).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();}).then(d=>{
    const mesh=d.mesh||{},V=unpackBase64(mesh.positions_b64,Int16Array),N=unpackBase64(mesh.normals_b64,Int8Array),
      F=unpackBase64(mesh.faces_b64,Uint16Array),FS=unpackBase64(mesh.face_segments_b64,Uint8Array),VS=unpackBase64(mesh.vertex_segments_b64,Uint8Array),
      q=Number(d.q||32767),nq=Number(d.normal_q||127),nv=V.length/3,nf=F.length/3,edges=new Map(),boundary=[];
    for(let f=0;f<nf;f++)for(const [a,b] of [[F[f*3],F[f*3+1]],[F[f*3+1],F[f*3+2]],[F[f*3+2],F[f*3]]]){const lo=Math.min(a,b),hi=Math.max(a,b),key=lo+":"+hi,prior=edges.get(key);
      if(prior===undefined)edges.set(key,[lo,hi,FS[f]]);else if(prior[2]!==FS[f])boundary.push(lo,hi,prior[2],FS[f]);}
    const centroids=new Float32Array((d.segments||[]).length*3);for(let i=0;i<(d.segments||[]).length;i++){const c=d.segments[i].centroid_q||[0,0,0];centroids.set([c[0]/q,c[1]/q,c[2]/q],i*3);}
    // The segmentation reveal is parcel-level, not a vertical clipping plane.  Rank each
    // complete anatomical label by its lowest native z vertex (centroid breaks ties), then
    // retain the inverse rank so one click animation can add whole parcels inferior → superior.
    const parcelMinZ=new Float32Array((d.segments||[]).length);parcelMinZ.fill(Infinity);
    for(let i=0;i<nv;i++){const si=VS[i];if(si<parcelMinZ.length)parcelMinZ[si]=Math.min(parcelMinZ[si],V[i*3+2]/q);}
    const parcelOrder=Array.from({length:parcelMinZ.length},(_,i)=>i).sort((a,b)=>(parcelMinZ[a]-parcelMinZ[b])||(centroids[a*3+2]-centroids[b*3+2])||a-b),
      parcelRank=new Uint8Array(parcelOrder.length);parcelOrder.forEach((si,rank)=>{parcelRank[si]=rank;});
    PATIENT_SURFACE={...d,V,N,F,FS,VS,q,nq,nv,nf,centroids,parcelMinZ,parcelOrder,parcelRank,boundary:Uint16Array.from(boundary),sx:new Float32Array(nv),sy:new Float32Array(nv),sd:new Float32Array(nv)};return PATIENT_SURFACE;
  }).catch(e=>{patientSurfacePending=null;console.warn("patient parcel surface: "+e.message);return null;});return patientSurfacePending;
}

/** Cohort-level Study II parcel effects, kept separate from the displayed subject anatomy. */
export function loadStudy2ParcelEffects(url = "decks/data/study2-parcel-effects.json") {
  if (STUDY2_PARCELS) return Promise.resolve(STUDY2_PARCELS);
  if (study2ParcelsPending) return study2ParcelsPending;
  study2ParcelsPending = fetch(url)
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => {
      const parcels = Array.isArray(d.parcels) ? d.parcels : [];
      const byId = new Map(parcels.map((row) => [Number(row.id), row]));
      const scale = {};
      for (const metric of ["ki", "vb"]) {
        scale[metric] = Math.max(1e-9, ...parcels.map((row) =>
          Math.abs(Number(row?.[metric]?.difference) || 0)));
      }
      STUDY2_PARCELS = { ...d, parcels, byId, scale };
      return STUDY2_PARCELS;
    })
    .catch((e) => {
      study2ParcelsPending = null;
      console.warn("Study II parcel effects: " + e.message);
      return null;
    });
  return study2ParcelsPending;
}

// ── anatomical overlays and focus regions ───────────────────────────────────

function normalizeRois(raw) {
  if (!raw) return [];
  if (raw === true) raw = { center: [0.48, -0.18, 0.36], radius: 0.17,
                            segment: "cortex", label: "tissue  Cₜ(t)" };
  if (Array.isArray(raw) && raw.length && typeof raw[0] === "number") raw = { center: raw };
  const items = Array.isArray(raw) ? raw : [raw];
  return items.filter(Boolean).map((r) => {
    const center = r.center || r.at || [0.48, -0.18, 0.36];
    const radius = Number(r.radius ?? 0.17);
    const axes = r.axes || [radius, radius, radius];
    return {
      ...r,
      center: [Number(center[0] || 0), Number(center[1] || 0), Number(center[2] || 0)],
      axes: [Math.max(0.01, Number(axes[0] || radius)), Math.max(0.01, Number(axes[1] || radius)),
             Math.max(0.01, Number(axes[2] || radius))],
      segment: tissueList(r.segment)?.[0] || null,
    };
  });
}

function inRoi(x, y, z, key, rois) {
  for (let i = 0; i < rois.length; i++) {
    const r = rois[i];
    if (r.segment && r.segment !== key) continue;
    const dx = (x - r.center[0]) / r.axes[0];
    const dy = (y - r.center[1]) / r.axes[1];
    const dz = (z - r.center[2]) / r.axes[2];
    if (dx * dx + dy * dy + dz * dz <= 1) return true;
  }
  return false;
}

function projectBrainPoint(p, o, segment = null) {
  let [x, y, z] = explodePoint(p[0], p[1], p[2], segment, o.explode || 0);
  const xr = x * o.cy - y * o.sy;
  const yr0 = x * o.sy + y * o.cy;
  return {
    x: o.ox + xr * o.S,
    y: o.oy - (yr0 * o.st + z * o.ct) * o.S,
    d: -(yr0 * o.ct - z * o.st),
  };
}

function cubic(p0, p1, p2, p3, n = 38) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, v = 1 - u;
    out.push([
      v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0],
      v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1],
      v * v * v * p0[2] + 3 * v * v * u * p1[2] + 3 * v * u * u * p2[2] + u * u * u * p3[2],
    ]);
  }
  return out;
}

/* Stylised vascular anatomy in the fsaverage coordinate frame.
 *
 * This is not a subject angiogram, but it now preserves the hierarchy the explanation needs:
 * carotid siphon -> circle-level trunks -> cortical arteries -> arterioles -> capillary bed ->
 * cortical veins -> superior sagittal sinus. The hierarchy matters pedagogically: a single
 * glowing fork makes the ICA readable but falsely suggests that blood jumps directly from a
 * large artery into tissue. */
const joinCurves = (...rows) => rows.flatMap((r, i) => i ? r.slice(1) : r);
const BRAIN_VESSELS = [];
for (const side of [-1, 1]) {
  const base = [side * 0.13, 0.02, -0.98];
  const knee = [side * 0.20, -0.05, -0.42];
  const top = [side * 0.16, 0.00, -0.08];
  BRAIN_VESSELS.push({
    group: "carotids", kind: "ica", id: `ica-${side}`,
    points: joinCurves(
      cubic(base, [side * 0.11, 0.03, -0.76], [side * 0.25, -0.12, -0.58], knee, 20),
      cubic(knee, [side * 0.23, -0.12, -0.25], [side * 0.12, 0.04, -0.15], top, 20)
    ),
    label: side > 0,
  });

  const mcaEnd = [side * 0.70, 0.00, 0.25];
  const a1End = [side * 0.035, 0.12, -0.01];
  const acaEnd = [side * 0.055, 0.49, 0.60];
  const pcaRoot = [side * 0.13, -0.24, -0.035];
  const pcaEnd = [side * 0.60, -0.36, 0.20];
  BRAIN_VESSELS.push({
    group: "carotids", kind: "artery", id: `mca-${side}`,
    points: cubic(top, [side * 0.31, 0.01, -0.03], [side * 0.52, 0.00, 0.10], mcaEnd),
  });
  BRAIN_VESSELS.push({
    group: "carotids", kind: "circle", id: `a1-${side}`,
    points: cubic(top, [side * 0.12, 0.08, -0.05], [side * 0.07, 0.11, -0.02], a1End, 18),
  });
  BRAIN_VESSELS.push({
    group: "carotids", kind: "artery", id: `a2-${side}`,
    points: cubic(a1End, [side * 0.03, 0.22, 0.12], [side * 0.045, 0.37, 0.38], acaEnd, 28),
  });
  BRAIN_VESSELS.push({
    group: "carotids", kind: "circle", id: `pcom-${side}`,
    points: cubic(top, [side * 0.16, -0.08, -0.07], [side * 0.15, -0.17, -0.05], pcaRoot, 16),
  });
  BRAIN_VESSELS.push({
    group: "carotids", kind: "artery", id: `pca-${side}`,
    points: cubic(pcaRoot, [side * 0.26, -0.29, 0.00],
                  [side * 0.46, -0.35, 0.10], pcaEnd, 28),
  });

  // Cortical arterioles: short tapering branches rather than one schematic fork.
  const arterioleEnds = [
    [side * 0.77, -0.12, 0.48], [side * 0.79, 0.10, 0.25],
    [side * 0.58, -0.30, 0.62], [side * 0.18, 0.38, 0.79],
    [side * 0.40, 0.46, 0.58], [side * 0.67, -0.43, 0.35],
  ];
  const roots = [mcaEnd, mcaEnd, mcaEnd, acaEnd, acaEnd, pcaEnd];
  arterioleEnds.forEach((end, i) => {
    const root = roots[i];
    BRAIN_VESSELS.push({
      group: "carotids", kind: "arteriole", id: `art-${side}-${i}`,
      points: cubic(root,
        [mix(root[0], end[0], 0.36), mix(root[1], end[1], 0.30), mix(root[2], end[2], 0.34) + 0.04],
        [mix(root[0], end[0], 0.73), mix(root[1], end[1], 0.74), mix(root[2], end[2], 0.72)],
        end, 18),
    });
  });

  // Draining cortical veins climb toward the midline sinus.
  arterioleEnds.slice(0, 5).forEach((end, i) => {
    const drain = [side * (0.07 + i * 0.010), end[1], 0.88 - i * 0.030];
    BRAIN_VESSELS.push({
      group: "sss", kind: "vein", id: `vein-${side}-${i}`,
      points: cubic(end,
        [end[0] * 0.78, mix(end[1], drain[1], 0.35), end[2] + 0.10],
        [end[0] * 0.36, mix(end[1], drain[1], 0.72), drain[2] - 0.04], drain, 22),
    });
  });
}

// Posterior circulation: vertebrals converge into the basilar artery, the basilar
// bifurcation supplies the PCAs, and the PComs above close the Circle of Willis.
for (const side of [-1, 1]) {
  BRAIN_VESSELS.push({
    group: "carotids", kind: "vertebral", id: `vertebral-${side}`,
    points: cubic([side * 0.16, -0.31, -1.00], [side * 0.13, -0.33, -0.79],
                  [side * 0.06, -0.30, -0.59], [0, -0.29, -0.46], 20),
  });
}
BRAIN_VESSELS.push({
  group: "carotids", kind: "basilar", id: "basilar",
  points: cubic([0, -0.29, -0.46], [0, -0.30, -0.31], [0, -0.27, -0.13], [0, -0.24, -0.035], 28),
});
BRAIN_VESSELS.push({
  group: "carotids", kind: "circle", id: "acom",
  points: cubic([-0.035, 0.12, -0.01], [-0.012, 0.14, 0], [0.012, 0.14, 0], [0.035, 0.12, -0.01], 8),
});

// A connected local capillary plexus around the cortical sampling voxel. Shared endpoints are
// deliberate: at voxel scale blood moves through a mesh of alternative paths, not four isolated
// tubes. This remains an explanatory microvascular model (not subject-specific angiography).
const capillaryNodes = {
  inlet: [.65, -.31, .52], pre: [.58, -.26, .47], upper: [.49, -.27, .50],
  dorsal: [.41, -.22, .48], crown: [.34, -.13, .45], outlet: [.28, -.06, .42],
  rostral: [.57, -.15, .39], centre: [.48, -.18, .38], lateral: [.39, -.14, .34],
  rim: [.31, -.16, .36], caudal: [.54, -.29, .32], deep: [.45, -.29, .30],
  basal: [.36, -.27, .33], lower: [.30, -.23, .39],
};
const capillaryEdges = [
  ["inlet", "pre", .018, .020], ["pre", "upper", -.016, .022],
  ["pre", "rostral", .020, -.018], ["pre", "caudal", -.018, -.020],
  ["upper", "dorsal", .020, -.016], ["upper", "centre", -.018, -.018],
  ["rostral", "centre", .018, .018], ["rostral", "caudal", -.020, .018],
  ["centre", "dorsal", .018, .020], ["centre", "lateral", -.018, -.020],
  ["centre", "deep", .020, -.018], ["caudal", "deep", -.016, .020],
  ["deep", "basal", .018, -.018], ["deep", "lateral", -.020, .016],
  ["basal", "lateral", .018, .020], ["basal", "lower", -.018, -.016],
  ["dorsal", "crown", .020, -.018], ["dorsal", "lateral", -.016, .018],
  ["lateral", "rim", .018, -.020], ["crown", "rim", -.020, .018],
  ["crown", "outlet", .018, -.016], ["rim", "outlet", -.018, .020],
  ["lower", "rim", .020, -.018], ["lower", "outlet", -.016, .018],
];
for (const side of [-1, 1]) capillaryEdges.forEach(([a, b, bowY, bowZ], i) => {
  const p0 = capillaryNodes[a], p3 = capillaryNodes[b];
  const signed = (p) => [side * p[0], p[1], p[2]];
  const p1 = [mix(p0[0], p3[0], .34), mix(p0[1], p3[1], .34) + bowY,
              mix(p0[2], p3[2], .34) + bowZ];
  const p2 = [mix(p0[0], p3[0], .69), mix(p0[1], p3[1], .69) - bowY * .72,
              mix(p0[2], p3[2], .69) - bowZ * .66];
  BRAIN_VESSELS.push({
    group: "micro", kind: "capillary", id: `cap-${side}-${i}`,
    side,
    points: cubic(signed(p0), signed(p1), signed(p2), signed(p3), 16),
  });
});
// The venular edge of the same local bed. These short branches are visible only at voxel scale;
// the zoomed-out drainage is supplied by the anatomical atlas, never by the old schematic veins.
for (const side of [-1, 1]) {
  const s = (p) => [side * p[0], p[1], p[2]];
  const join = [.28, -.035, .45], exit = [.19, -.01, .56];
  const localVenules = [
    [capillaryNodes.outlet, [.32, -.055, .41], [.30, -.045, .43], join],
    [capillaryNodes.dorsal, [.38, -.065, .46], [.32, -.045, .45], join],
    [join, [.25, -.025, .48], [.22, -.018, .53], exit],
  ];
  localVenules.forEach((p, i) => BRAIN_VESSELS.push({
    group: "micro", kind: "venule", id: `venule-${side}-${i}`,
    side,
    points: cubic(s(p[0]), s(p[1]), s(p[2]), s(p[3]), 16),
  }));
}

BRAIN_VESSELS.push({
  group: "sss", kind: "sinus", id: "sss-crown", label: true,
  points: cubic([0, 0.72, 0.57], [0, 0.42, 0.94], [0, -0.40, 0.98], [0, -0.75, 0.61], 54),
});
/* Posterior dural drainage.  The SSS ends at the occipital confluence; it does not dive
 * through the cerebellum.  Paired transverse sinuses run laterally along the tentorium,
 * turn as sigmoid sinuses behind the posterior fossa, and only then continue as the IJVs.
 * The right side is slightly larger, a common (not universal) adult configuration. */
for (const side of [-1, 1]) {
  const confluence = [0, -0.75, 0.61];
  const transverse = [side * 0.66, -0.78, 0.34];
  const sigmoid = [side * 0.70, -0.68, -0.32];
  const jugular = [side * 0.44, -0.55, -1.02];
  BRAIN_VESSELS.push({
    group: "sss", kind: "sinus", id: `transverse-${side}`,
    points: cubic(confluence, [side * .18, -.78, .57], [side * .48, -.82, .46], transverse, 28),
    calibre: side > 0 ? 1.10 : .88,
  });
  BRAIN_VESSELS.push({
    group: "sss", kind: "sinus", id: `sigmoid-${side}`,
    points: joinCurves(
      cubic(transverse, [side * .76, -.76, .20], [side * .74, -.72, -.02], [side * .65, -.70, -.13], 18),
      cubic([side * .65, -.70, -.13], [side * .57, -.69, -.22], [side * .62, -.66, -.29], sigmoid, 16)
    ),
    calibre: side > 0 ? 1.06 : .86,
  });
  BRAIN_VESSELS.push({
    group: "sss", kind: "jugular", id: `jugular-${side}`,
    points: cubic(sigmoid, [side * .68, -.63, -.50], [side * .54, -.59, -.78], jugular, 24),
    calibre: side > 0 ? 1.08 : .86,
  });
}

const VESSEL_ALIASES = {
  artery: "carotids", arteries: "carotids", carotid: "carotids", carotids: "carotids",
  ica: "carotids", "internal carotid": "carotids", "internal carotids": "carotids",
  vein: "sss", venous: "sss", sinus: "sss", sss: "sss", "sagittal sinus": "sss",
  "superior sagittal sinus": "sss",
};

function vesselNames(v) {
  if (v == null || v === false) return [];
  return [].concat(v).map((x) => {
    const raw = String(x);
    return VESSEL_ALIASES[raw.toLowerCase().trim()] || raw;
  });
}

function normalizeVessels(raw) {
  if (!raw) return null;
  if (raw === true) raw = { show: ["carotids", "sss"] };
  if (typeof raw === "string" || Array.isArray(raw)) raw = { show: raw };
  let show = raw.show ?? raw.only;
  if (show == null) {
    show = [];
    if (raw.carotids || raw.arteries || raw.ica) show.push("carotids");
    if (raw.sss || raw.sinus || raw.veins || raw.venous) show.push("sss");
    if (!show.length) show = ["carotids", "sss"];
  }
  return {
    ...raw,
    show: vesselNames(show),
    highlight: vesselNames(raw.highlight),
    highlightKind: [].concat(raw.highlightKind ?? raw.highlightKinds ?? []).filter(Boolean),
    labels: raw.labels !== false,
    flow: raw.flow !== false,
    arrows: raw.arrows !== false,
  };
}

function sampleScreenPath(points, u) {
  u = ((u % 1) + 1) % 1;
  const q = u * (points.length - 1), i = Math.min(points.length - 2, q | 0), f = q - i;
  return {
    x: points[i].x + (points[i + 1].x - points[i].x) * f,
    y: points[i].y + (points[i + 1].y - points[i].y) * f,
  };
}

// A bolus is not a looping bead. This sampler deliberately clamps at the two ends so a
// packet cannot jump back to the inlet while it is still draining from the venous end.
function sampleScreenPathOnce(points, u) {
  const v = clamp01(u), q = v * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(q)), f = q - i;
  return {
    x: points[i].x + (points[i + 1].x - points[i].x) * f,
    y: points[i].y + (points[i + 1].y - points[i].y) * f,
  };
}

// A compact gamma-variate packet: sharp leading edge, dominant peak, trailing dispersion.
// This is the same qualitative shape used by the Patlak story, mapped onto vascular distance.
function bolusEnvelope(position, front, width) {
  const d=front-position;if(d<=0)return 0;const z=d/Math.max(1e-4,width);
  const primary=z*Math.exp(1-z),tailZ=z/3.1,tail=.18*tailZ*Math.exp(1-tailZ);
  return clamp01(primary+tail);
}

function drawAtlasVessels(g, o, spec = {}) {
  if (!VESSEL_ATLAS) return false;
  const artery = spec.arteryColor || cssVar("--accent", "#D97757");
  const vein = spec.veinColor || "#6FB8C8", tracer = spec.tracerColor || "#B89CFF";
  const shown = new Set(spec.show || ["arteries", "veins"]), alpha = Number(spec.alpha ?? 0.88);
  const cycleAge = Number(spec.cycleAge ?? spec.tracerAge ?? -1),stride=Math.max(1,Number(spec.stride??1)|0);
  const traceAllVeins=!!spec.traceAllVeins,veinIngress=clamp01(Number(spec.veinIngress??0)),veinIngressY=Number(spec.veinIngressY??Infinity),veinRoute=(spec.veinRoute||[
    "superior sagittal sinus","transverse sinus","sigmoid sinus","internal jugular vein",
  ]).map(x=>String(x).toLowerCase());
  const onlyLabels=[].concat(spec.onlyLabels||[]).map(x=>String(x).toLowerCase()).filter(Boolean);
  const onlySides=[].concat(spec.onlySides||[]).map(x=>String(x).toLowerCase()).filter(Boolean);
  const tracerOnlyLabels=[].concat(spec.tracerOnlyLabels||veinRoute).map(x=>String(x).toLowerCase()).filter(Boolean);
  // The v2 atlas stores one ordered, smoothed centreline for each source-derived tube.  Draw
  // those paths once at a small set of anatomical widths instead of repainting every edge of
  // the triangulated surface.  This both joins the anatomy cleanly and removes the old lower-
  // brain overdraw that made superior vessels look faint or disconnected.
  const widths=[.75,1.05,1.45,1.95,2.60,3.45].map(v=>v*(o.k||1)),
    tubes={arteries:widths.map(()=>new Path2D()),veins:widths.map(()=>new Path2D())},
    wires={arteries:new Path2D(),veins:new Path2D()},tracerPaths=Array.from({length:6},()=>new Path2D()),tracerDots=[];
  const project=(x,y,z)=>{const xr=x*o.cy-y*o.sy,yr=x*o.sy+y*o.cy;return{x:o.ox+xr*o.S,y:o.oy-(yr*o.st+z*o.ct)*o.S,d:-(yr*o.ct-z*o.st)};};
  const widthBucket=(radius)=>{const diameter=Math.max(widths[0],Math.min(widths.at(-1),2*Math.max(0,radius)*o.S));
    let best=0,delta=Infinity;for(let i=0;i<widths.length;i++){const d=Math.abs(widths[i]-diameter);if(d<delta){delta=d;best=i;}}return best;};
  const addSmoothPath=(path,points)=>{if(points.length<2)return;path.moveTo(points[0].x,points[0].y);
    if(points.length===2){path.lineTo(points[1].x,points[1].y);return;}
    for(let i=1;i<points.length-1;i++){const q=points[i+1];path.quadraticCurveTo(points[i].x,points[i].y,(points[i].x+q.x)*.5,(points[i].y+q.y)*.5);}
    path.lineTo(points.at(-1).x,points.at(-1).y);};
  const addScreenTubeWire=(path,points,radius)=>{if(points.length<2)return;const r=Math.max(.55*(o.k||1),Math.min(4.2*(o.k||1),radius*o.S)),left=[],right=[];
    for(let i=0;i<points.length;i++){const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b.x-a.x,dy=b.y-a.y,n=Math.max(1e-6,Math.hypot(dx,dy)),nx=-dy/n,ny=dx/n;
      left.push({x:points[i].x+nx*r,y:points[i].y+ny*r});right.push({x:points[i].x-nx*r,y:points[i].y-ny*r});}
    addSmoothPath(path,left);addSmoothPath(path,right);for(let i=0;i<points.length;i++){path.moveTo(left[i].x,left[i].y);path.lineTo(right[i].x,right[i].y);}};
  const traceSegment=(category,p,q,u,seed,label="",junction=false,anatomicalY=null)=>{
    if(cycleAge<0)return;
    // The venous packet enters the SSS beside the selected cortical territory, never at its
    // frontal origin. Only the downstream SSS -> transverse -> sigmoid -> jugular chain
    // carries tracer; all other veins remain visible at the same anatomical weight.
    if(category==="veins"&&!traceAllVeins){
      const lowerLabel=String(label).toLowerCase(),isSss=lowerLabel.includes("superior sagittal sinus");
      if(tracerOnlyLabels.length&&!tracerOnlyLabels.some(name=>lowerLabel.includes(name)))return;
      if(!junction&&isSss){
        if(Number.isFinite(veinIngressY)&&anatomicalY>veinIngressY+.035)return;
        if(u<veinIngress-.010)return;
      }
    }
    // Atlas venous flow coordinates are global: the selected cortical SSS ingress can be
    // well above zero, while the IJV terminus is one. Remap that downstream interval to
    // 0..1 before applying the moving envelope. Otherwise the packet spends the first part
    // of the venous window invisibly travelling through SSS that was intentionally clipped
    // away, which reads as a flash/gap rather than continuous drainage.
    const position=category==="veins"&&!traceAllVeins?clamp01((u-veinIngress)/Math.max(1e-6,1-veinIngress)):u,
      window=category==="arteries"?(spec.arterialWindow||[0,2.65]):(spec.venousWindow||[3.15,5.35]);
    const progress=(cycleAge-window[0])/Math.max(1e-6,window[1]-window[0]),
      head=category==="arteries"?.08+progress*1.12:-.05+progress*1.24;
    if(progress<-.10||progress>1.18)return;const width=category==="veins"?.105:.068,weight=bolusEnvelope(position,head,width);
    if(weight<(category==="veins"?.025:.045))return;const b=Math.min(5,Math.max(0,(weight*6)|0));
    tracerPaths[b].moveTo(p.x,p.y);tracerPaths[b].lineTo(q.x,q.y);
    if(category==="veins"&&hash01(seed,77,13)<.085)tracerDots.push([(p.x+q.x)*.5,(p.y+q.y)*.5,weight]);
  };
  for (const group of VESSEL_ATLAS) {
    if (!shown.has(group.category)) continue;
    if(onlyLabels.length&&!onlyLabels.some(name=>group.label.toLowerCase().includes(name)))continue;
    if(onlySides.length&&!onlySides.includes(String(group.side||"").toLowerCase()))continue;
    if(group.indexed){const P=group.P,E=group.E;for(let i=0;i<group.n;i++){const j=i*3,p=project(P[j],P[j+1],P[j+2]);group.sx[i]=p.x;group.sy[i]=p.y;group.sd[i]=p.d;}
      // v2 edges are not the original noisy triangulation: they are a structured eight-sided
      // tube (circumferential rings plus longitudinal rails), so this is a coherent mesh.
      for(let i=0;i<group.ne;i++){const j=i*2,a=E[j],b=E[j+1];wires[group.category].moveTo(group.sx[a],group.sy[a]);wires[group.category].lineTo(group.sx[b],group.sy[b]);}}
    if(group.paths?.length){for(let pi=0;pi<group.paths.length;pi++){const path=group.paths[pi],screen=[];let radius=0;
        for(let i=0;i<path.n;i++){const j=i*3;screen.push(project(path.P[j],path.P[j+1],path.P[j+2]));radius+=path.R[i]||0;}
        addSmoothPath(tubes[group.category][widthBucket(radius/Math.max(1,path.n))],screen);
        if(path.traceable)for(let i=0;i<screen.length-1;i+=stride){const j=i*3,u=((path.U[i]??0)+(path.U[i+1]??path.U[i]??0))*.5,anatomicalY=(path.P[j+1]+path.P[j+4])*.5;
          traceSegment(group.category,screen[i],screen[i+1],u,i+pi*997+group.label.length*131,group.label,false,anatomicalY);}
      }
    }else{
      // Compatibility fallback for older cached data. v2 assets never take this noisy path.
      const P=group.P,E=group.E,U=group.U;if(group.indexed){for(let i=0;i<group.n;i++){const j=i*3,p=project(P[j],P[j+1],P[j+2]);group.sx[i]=p.x;group.sy[i]=p.y;group.sd[i]=p.d;}}
      for(let i=0;i<group.ne;i+=Math.max(3,stride)){let p,q,u,anatomicalY;
        if(group.indexed){const j=i*2,a=E[j],b=E[j+1];p={x:group.sx[a],y:group.sy[a],d:group.sd[a]};q={x:group.sx[b],y:group.sy[b],d:group.sd[b]};u=(U[a]+U[b])*.5;anatomicalY=(P[a*3+1]+P[b*3+1])*.5;}
        else{const j=i*6;p=project(E[j],E[j+1],E[j+2]);q=project(E[j+3],E[j+4],E[j+5]);u=clamp01(((E[j+2]+E[j+5])*.5+1.05)/2.05);anatomicalY=(E[j+1]+E[j+4])*.5;if(group.category==="veins")u=1-u;}
        tubes[group.category][0].moveTo(p.x,p.y);tubes[group.category][0].lineTo(q.x,q.y);traceSegment(group.category,p,q,u,i+group.label.length*131,group.label,false,anatomicalY);}
    }
  }
  for(let i=0;i<VESSEL_JUNCTIONS.length;i++){const j=VESSEL_JUNCTIONS[i],label=`${j.labelA} ${j.labelB}`.trim();if(!shown.has(j.category))continue;
    if(onlyLabels.length&&!onlyLabels.some(name=>label.toLowerCase().includes(name)))continue;const points=[];for(let q=0;q<j.path.length;q+=3)points.push(project(j.path[q],j.path[q+1],j.path[q+2]));
    if(onlySides.length&&!onlySides.includes(String(j.sideA||j.sideB||"").toLowerCase()))continue;
    addSmoothPath(tubes[j.category][widthBucket(j.radius)],points);addScreenTubeWire(wires[j.category],points,j.radius);
    if(j.traceable)for(let q=0;q<points.length-1;q++){const u=j.U.length?((j.U[q]??j.u)+(j.U[q+1]??j.u))*.5:j.u;
      traceSegment(j.category,points[q],points[q+1],u,900001+i*7+q,label,true);}}
  g.save();g.lineCap="round";g.lineJoin="round";
  for(const category of ["arteries","veins"]){if(!shown.has(category))continue;const color=category==="arteries"?artery:vein;
    g.strokeStyle=color;for(let b=0;b<widths.length;b++){g.globalAlpha=alpha*.14;g.lineWidth=widths[b]+1.45*(o.k||1);g.stroke(tubes[category][b]);
      g.globalAlpha=alpha*.24;g.lineWidth=Math.max(.58*(o.k||1),widths[b]*.62);g.stroke(tubes[category][b]);}
    g.globalAlpha=alpha*.88;g.lineWidth=.43*(o.k||1);g.stroke(wires[category]);}
  if(cycleAge>=0){const gain=Number(spec.tracerGain??1),tracerAlpha=Number(spec.tracerAlpha??1);g.strokeStyle=tracer;g.shadowColor=tracer;g.shadowBlur=3.0*o.k;
    for(let b=0;b<6;b++){g.globalAlpha=tracerAlpha*Math.min(1,(.14+b*.145)*gain);g.lineWidth=(.62+b*.105)*o.k*Math.sqrt(gain);g.stroke(tracerPaths[b]);}
    g.fillStyle=tracer;for(const [x,y,w] of tracerDots){g.globalAlpha=tracerAlpha*Math.min(1,(.30+.48*w)*gain);g.beginPath();g.arc(x,y,(.46+.90*w)*o.k*Math.sqrt(gain),0,TAU);g.fill();}}
  g.restore();return true;
}

function atlasAnchor(o,category,needle){
  if(!VESSEL_ATLAS)return null;const match=String(needle).toLowerCase(),groups=VESSEL_ATLAS.filter(x=>x.category===category&&x.label.toLowerCase().includes(match));
  let x=0,y=0,z=0,n=0;for(const group of groups)for(let i=0;i<group.n;i++){const j=i*3;x+=group.P[j];y+=group.P[j+1];z+=group.P[j+2];n++;}
  return n?projectBrainPoint([x/n,y/n,z/n],o):null;
}

function atlasPoint(category,needle,side=null){
  if(!VESSEL_ATLAS)return null;const match=String(needle).toLowerCase();
  let groups=VESSEL_ATLAS.filter(x=>x.category===category&&x.label.toLowerCase().includes(match));
  if(side){groups=groups.filter(x=>String(x.side).toLowerCase()===String(side).toLowerCase());if(!groups.length)return null;}
  let x=0,y=0,z=0,n=0;for(const group of groups)for(let i=0;i<group.n;i++){const j=i*3;x+=group.P[j];y+=group.P[j+1];z+=group.P[j+2];n++;}
  return n?[x/n,y/n,z/n]:null;
}

/** Select a compact cluster at one projected edge of an anatomically labelled atlas object.
 * The label/side filter establishes anatomical identity; the screen-edge ranking merely keeps
 * the sampling cube visible and centred on the vessel instead of burying it inside the mesh. */
function atlasScreenExtremePoint(o,category,needle,side=null,screenRight=true){
  if(!VESSEL_ATLAS)return null;const match=String(needle).toLowerCase(),wanted=String(side??"").toLowerCase(),points=[];
  for(const group of VESSEL_ATLAS){if(group.category!==category||!group.label.toLowerCase().includes(match)||
      (side&&String(group.side).toLowerCase()!==wanted))continue;
    for(let i=0;i<group.n;i++){const j=i*3,raw=[group.P[j],group.P[j+1],group.P[j+2]],p=projectBrainPoint(raw,o);points.push([p.x,raw]);}}
  if(!points.length)return null;points.sort((a,b)=>screenRight?b[0]-a[0]:a[0]-b[0]);const take=Math.min(36,Math.max(8,Math.ceil(points.length*.035)));
  let x=0,y=0,z=0;for(let i=0;i<take;i++){x+=points[i][1][0];y+=points[i][1][1];z+=points[i][1][2];}
  return[x/take,y/take,z/take];
}

function atlasFlowPoint(category,needle,target,side=null){
  if(!VESSEL_ATLAS)return null;const match=String(needle).toLowerCase(),wanted=String(side??"").toLowerCase();
  const groups=VESSEL_ATLAS.filter(x=>x.category===category&&x.label.toLowerCase().includes(match)&&(!side||String(x.side).toLowerCase()===wanted));
  let best=null,bd=Infinity;for(const group of groups)for(let i=0;i<group.n;i++){const j=i*3,dx=group.P[j]-target[0],dy=group.P[j+1]-target[1],dz=group.P[j+2]-target[2],dd=dx*dx+dy*dy+dz*dz;
    if(dd<bd){bd=dd;best={point:[group.P[j],group.P[j+1],group.P[j+2]],u:group.U[i]??0,label:group.label,side:group.side};}}
  return best;
}

/** Pick a centreline segment locally parallel to scanner z, then use proximity only as a
 * secondary anatomical tie-breaker.  Sampling boxes therefore sit on the intended straight
 * vessel segment rather than merely near a group centroid. */
function atlasZParallelPoint(category,needle,side=null,a={}){
  if(!VESSEL_ATLAS)return null;const match=String(needle).toLowerCase(),wanted=String(side??"").toLowerCase(),target=a.target||null;
  let best=null,bestScore=-Infinity;for(const group of VESSEL_ATLAS){if(group.category!==category||!group.label.toLowerCase().includes(match)||
      (side&&String(group.side).toLowerCase()!==wanted))continue;for(const path of group.paths||[]){for(let i=0;i<path.n-1;i++){const j=i*3,
        p=[(path.P[j]+path.P[j+3])*.5,(path.P[j+1]+path.P[j+4])*.5,(path.P[j+2]+path.P[j+5])*.5];
        if(Number.isFinite(a.minZ)&&p[2]<Number(a.minZ))continue;
        if(Number.isFinite(a.maxZ)&&p[2]>Number(a.maxZ))continue;
        if(Number.isFinite(a.posteriorYMax)&&p[1]>Number(a.posteriorYMax))continue;const dx=path.P[j+3]-path.P[j],dy=path.P[j+4]-path.P[j+1],dz=path.P[j+5]-path.P[j+2],
          parallel=Math.abs(dz)/Math.max(1e-6,Math.hypot(dx,dy,dz)),distance=target?Math.hypot(p[0]-target[0],p[1]-target[1],p[2]-target[2]):0,
          score=parallel*4-distance*.42;if(score>bestScore){bestScore=score;best={point:p,u:((path.U[i]??0)+(path.U[i+1]??0))*.5,label:group.label,side:group.side,parallel};}}}}
  return best;
}

function vesselArrow(g, points, color, alpha, k) {
  const p = sampleScreenPath(points, 0.73), q = sampleScreenPath(points, 0.755);
  const a = Math.atan2(q.y - p.y, q.x - p.x), s = 4.6 * k;
  g.fillStyle = color; g.globalAlpha = alpha;
  g.beginPath();
  g.moveTo(q.x + Math.cos(a) * s, q.y + Math.sin(a) * s);
  g.lineTo(q.x + Math.cos(a + 2.45) * s, q.y + Math.sin(a + 2.45) * s);
  g.lineTo(q.x + Math.cos(a - 2.45) * s, q.y + Math.sin(a - 2.45) * s);
  g.closePath(); g.fill();
}

function drawFlowConnector(g, from, to, color, t, k, reverse = false) {
  const cx = (from.x + to.x) / 2, cy = Math.min(from.y, to.y) - 22 * k;
  g.save();
  g.strokeStyle = color; g.globalAlpha = 0.34; g.lineWidth = 1.15 * k;
  g.setLineDash([3 * k, 5 * k]);
  g.beginPath(); g.moveTo(from.x, from.y); g.quadraticCurveTo(cx, cy, to.x, to.y); g.stroke();
  g.setLineDash([]);
  const u0 = (t * 0.28) % 1;
  for (let i = 0; i < 3; i++) {
    let u = (u0 + i / 3) % 1; if (reverse) u = 1 - u;
    const v = 1 - u;
    const x = v * v * from.x + 2 * v * u * cx + u * u * to.x;
    const y = v * v * from.y + 2 * v * u * cy + u * u * to.y;
    g.globalAlpha = 0.72; g.fillStyle = color;
    g.beginPath(); g.arc(x, y, 2.15 * k, 0, TAU); g.fill();
  }
  g.restore();
}

function drawVessels(g, W, H, t, o, raw, rois) {
  const spec = normalizeVessels(raw);
  if (!spec) return;
  const masterAlpha = clamp01(Number(spec.alpha ?? 1));
  const accent = spec.arteryColor || cssVar("--accent", "#D97757");
  const vein = spec.veinColor || "#6FB8C8";
  const projected = [];

  for (const curve of BRAIN_VESSELS) {
    if (spec.ids?.length && !spec.ids.includes(curve.id)) continue;
    const microShown = curve.group === "micro" && spec.micro !== false &&
      (spec.show.includes("carotids") || spec.show.includes("sss") || spec.show.includes("micro"));
    if (!microShown && !spec.show.includes(curve.group)) continue;
    const points = curve.points.map((p) => projectBrainPoint(p, { ...o, explode: 0 }));
    projected.push({ ...curve, points });
    const color = curve.group === "carotids" ? accent : vein;
    const byKind = spec.highlightKind.length > 0;
    const emphasised = byKind
      ? spec.highlightKind.includes(curve.kind)
      : (!spec.highlight.length || spec.highlight.includes(curve.group) ||
         (curve.group === "micro" && spec.highlight.includes("micro")));
    const alpha = (emphasised ? 0.92 : Number(spec.dimOpacity ?? 0.34)) * masterAlpha;
    const widths = { ica: 3.25, artery: 2.20, arteriole: 1.18, capillary: 0.78,
                     venule: 1.02, vein: 1.15, sinus: 3.05, jugular: 2.65 };
    const width = (widths[curve.kind] ?? 1.8) * Number(curve.calibre ?? 1) * Number(spec.widthScale ?? 1);
    const stroke = curve.kind === "capillary"
      ? (() => {
          const q = g.createLinearGradient(points[0].x, points[0].y,
                                           points.at(-1).x, points.at(-1).y);
          q.addColorStop(0, accent); q.addColorStop(0.48, "#C59A83"); q.addColorStop(1, vein);
          return q;
        })()
      : color;

    g.save();
    g.lineCap = "round"; g.lineJoin = "round";
    g.strokeStyle = stroke; g.globalAlpha = alpha * (curve.kind === "capillary" ? 0.16 : 0.23);
    g.lineWidth = width * 2.75 * o.k;
    g.shadowColor = color; g.shadowBlur = (curve.kind === "capillary" ? 4 : 10) * o.k;
    g.beginPath(); g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
    g.stroke();
    g.shadowBlur = 0; g.globalAlpha = alpha; g.lineWidth = width * o.k;
    g.stroke();
    if (spec.arrows && curve.kind !== "capillary" && curve.kind !== "arteriole")
      vesselArrow(g, points, color, alpha, o.k);
    if (spec.flow) {
      const speed = Number(spec.speed ?? 0.18);
      const beads = curve.kind === "capillary" ? 2 : 4;
      for (let i = 0; i < beads; i++) {
        const p = sampleScreenPath(points, t * speed + i / 4);
        g.globalAlpha = alpha * (0.55 + 0.35 * Math.sin((t + i) * 2.2) ** 2);
        g.fillStyle = curve.kind === "capillary" ? (i ? vein : accent) : color;
        g.beginPath(); g.arc(p.x, p.y, (curve.kind === "capillary" ? 1.25 : 2.35) * o.k, 0, TAU); g.fill();
      }
    }
    g.restore();
  }

  if (spec.connectRoi && rois.length) {
    const roi = projectBrainPoint(rois[0].center, o, rois[0].segment);
    const arterial = projected.find((x) => x.id === "mca-1") || projected.find((x) => x.group === "carotids");
    const venous = projected.find((x) => x.id === "sss-crown") || projected.find((x) => x.group === "sss");
    if (arterial) drawFlowConnector(g, arterial.points.at(-1), roi, accent, t, o.k);
    if (venous) drawFlowConnector(g, roi, venous.points[0], vein, t, o.k);
  }

  if (!spec.labels) return;
  g.save(); g.font = fontOf(o.k, 10.5); g.textBaseline = "middle";
  const ica = projected.find((x) => x.id === "ica-1") || projected.find((x) => x.group === "carotids");
  if (ica) {
    const p = sampleScreenPath(ica.points, 0.24);
    g.fillStyle = accent; g.textAlign = p.x < o.ox ? "right" : "left";
    g.fillText(spec.carotidLabel || "internal carotid  ·  input Cₐ(t)", p.x + (p.x < o.ox ? -8 : 8) * o.k, p.y);
  }
  const sss = projected.find((x) => x.id === "sss-crown") || projected.find((x) => x.group === "sss");
  if (sss) {
    const p = sampleScreenPath(sss.points, 0.54);
    g.fillStyle = vein; g.textAlign = p.x < o.ox ? "right" : "left";
    g.fillText(spec.sinusLabel || "sagittal sinus  ·  venous output", p.x + (p.x < o.ox ? -8 : 8) * o.k, p.y - 9 * o.k);
  }
  g.restore();
}

const BRAIN_MICRO_FLOW=new Map();
function brainMicroFlow(curves,side){
  const key=Number(side)||0;if(BRAIN_MICRO_FLOW.has(key))return BRAIN_MICRO_FLOW.get(key);
  const nodes=[],nodeIndex=new Map(),edges=[],nodeFor=(p)=>{const id=p.map(v=>Math.round(v*1e5)).join(":");
    if(nodeIndex.has(id))return nodeIndex.get(id);const i=nodes.length;nodes.push(p);nodeIndex.set(id,i);return i;};
  for(const curve of curves){const a=nodeFor(curve.points[0]),b=nodeFor(curve.points.at(-1));edges.push([a,b,curve]);}
  const adjacency=Array.from({length:nodes.length},()=>[]);for(const [a,b] of edges){adjacency[a].push(b);adjacency[b].push(a);}
  let source=0,best=-Infinity;for(let i=0;i<nodes.length;i++){const p=nodes[i],score=Math.abs(p[0])*4-p[1]+p[2]*.08;
    if(score>best){best=score;source=i;}}
  const distance=new Int16Array(nodes.length);distance.fill(-1);const queue=new Uint16Array(nodes.length);let head=0,tail=0,maxDistance=0;
  queue[tail++]=source;distance[source]=0;while(head<tail){const u=queue[head++];maxDistance=Math.max(maxDistance,distance[u]);
    for(const v of adjacency[u])if(distance[v]<0){distance[v]=distance[u]+1;queue[tail++]=v;}}
  const denom=Math.max(1,maxDistance),result=new Map();for(const [a,b,curve] of edges)result.set(curve,[distance[a]/denom,distance[b]/denom]);
  BRAIN_MICRO_FLOW.set(key,result);return result;
}

/** The same connected voxel-scale plexus used by the brain scene, with one packet that
 * advances along the declared capillary/venular graph rather than wiping through z planes. */
function drawBrainMicroBolus(g,o,t,age,a={}) {
  const k=a.k??o.k??1,alpha=Number(a.alpha??1),wash=!!a.wash,tracer=a.tracerColor||"#B89CFF";
  const side=Number(a.side??0),microCurves=BRAIN_VESSELS.filter(curve=>curve.group==="micro"&&(!side||curve.side===side));
  drawVessels(g,0,0,t,o,{show:["micro"],ids:microCurves.map(curve=>curve.id),labels:false,flow:false,arrows:false,alpha:.70*alpha,
    widthScale:1.15,arteryColor:cssVar("--accent","#D97757"),veinColor:"#6FB8C8"},[]);
  if(age<0||alpha<=.001)return;
  // Arrival traverses the bed; washout continues from the pial edge and exits beyond it. It
  // must never restart at the deep inlet when the narration changes from uptake to drainage.
  const front=wash?1.10+smooth(Math.max(0,age)/.60)*1.80:-.05+smooth(Math.max(0,age)/1.16)*1.22,
    paths=Array.from({length:6},()=>new Path2D()),flow=brainMicroFlow(microCurves,side);
  for(const curve of microCurves){const P=curve.points.map(p=>projectBrainPoint(p,o));
    const endpoints=flow.get(curve)||[0,1];for(let i=0;i<P.length-1;i++){const u=(i+.5)/(P.length-1),position=mix(endpoints[0],endpoints[1],u);
      const weight=bolusEnvelope(position,front,wash?.115:.085);if(weight<.035)continue;const b=Math.min(5,Math.max(0,(weight*6)|0));
      paths[b].moveTo(P[i].x,P[i].y);paths[b].lineTo(P[i+1].x,P[i+1].y);}}
  g.save();g.strokeStyle=tracer;g.lineCap="round";g.lineJoin="round";g.shadowColor=tracer;g.shadowBlur=3.2*k;
  for(let b=0;b<6;b++){g.globalAlpha=alpha*(.12+b*.14);g.lineWidth=(.54+b*.11)*k;g.stroke(paths[b]);}
  g.restore();
}

function drawRois(g, W, H, t, o, rois) {
  if (!rois.length) return;
  const accent = cssVar("--accent", "#D97757");
  for (const r of rois) {
    const p = projectBrainPoint(r.center, o, r.segment);
    const radius = ((r.axes[0] + r.axes[1] + r.axes[2]) / 3) * o.S;
    const pulse = r.pulse === false ? 1 : 1 + 0.055 * Math.sin(t * 3.1);
    const rr = Math.max(8 * o.k, radius * pulse);
    const color = r.color || accent;
    g.save();
    g.fillStyle = color; g.globalAlpha = Number(r.fillOpacity ?? 0.10);
    g.beginPath(); g.arc(p.x, p.y, rr, 0, TAU); g.fill();
    g.globalAlpha = 0.90; g.strokeStyle = color; g.lineWidth = 1.6 * o.k;
    g.setLineDash([4 * o.k, 3 * o.k]);
    g.beginPath(); g.arc(p.x, p.y, rr, -t * 0.26, TAU - t * 0.26); g.stroke();
    g.setLineDash([]); g.globalAlpha = 0.32; g.lineWidth = 5 * o.k;
    g.beginPath(); g.arc(p.x, p.y, rr, 0, TAU); g.stroke();
    if (r.label) {
      const right = p.x <= o.ox;
      const lx = p.x + (right ? 1 : -1) * (rr + 11 * o.k);
      g.globalAlpha = 0.92; g.strokeStyle = color; g.lineWidth = 1 * o.k;
      g.beginPath(); g.moveTo(p.x + (right ? rr : -rr), p.y);
      g.lineTo(lx, p.y - 9 * o.k); g.stroke();
      g.fillStyle = color; g.font = fontOf(o.k, 10.8); g.textBaseline = "bottom";
      g.textAlign = right ? "left" : "right";
      g.fillText(String(r.label), lx + (right ? 3 : -3) * o.k, p.y - 10 * o.k);
    }
    g.restore();
  }
}

// ── anatomy-anchored kinetic curves ─────────────────────────────────────────

function kineticRows(kind, n = 112) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const first = Math.exp(-Math.pow((u - 0.18) / 0.055, 2));
    const recirc = 0.30 * Math.exp(-Math.pow((u - 0.42) / 0.12, 2));
    const ca = first + recirc + 0.07 * Math.exp(-Math.max(0, u - 0.20) * 3.1);
    const retained = 0.52 * (1 - Math.exp(-Math.max(0, u - 0.12) * 6.2)) * Math.exp(-u * 0.34);
    const ct = 0.58 * ca + retained;
    const q = Math.max(0, u - 0.11);
    const cv = 0.78 * Math.exp(-Math.pow((q - 0.20) / 0.10, 2)) +
               0.28 * Math.exp(-Math.pow((q - 0.44) / 0.17, 2));
    rows.push([u, kind === "arterial" ? ca : kind === "tissue" ? ct : cv]);
  }
  const peak = Math.max(...rows.map((p) => p[1])) || 1;
  return rows.map(([x, y]) => [x, y / peak]);
}

const KINETIC = {
  arterial: kineticRows("arterial"), tissue: kineticRows("tissue"), venous: kineticRows("venous"),
};

function drawSignalPlot(g, box, rows, color, alpha, label, t, k) {
  if (alpha <= 0.005) return;
  g.save(); g.globalAlpha = alpha;
  const hair = cssVar("--mid", "#97958D"), hi = cssVar("--hi", "#F9F9F7");
  g.strokeStyle = hair; g.lineWidth = Math.max(0.7, 0.85 * k);
  g.beginPath(); g.moveTo(box.x, box.y + box.h); g.lineTo(box.x + box.w, box.y + box.h); g.stroke();
  g.font = fontOf(Math.max(k, 0.86), 10.4); g.fillStyle = color;
  g.textAlign = "left"; g.textBaseline = "bottom"; g.fillText(label, box.x, box.y - 6 * k);
  g.strokeStyle = color; g.lineJoin = g.lineCap = "round";
  g.lineWidth = Math.max(1.35, 2.05 * k);
  g.shadowColor = color; g.shadowBlur = 7 * k;
  g.beginPath();
  rows.forEach((p, i) => {
    const x = box.x + p[0] * box.w, y = box.y + box.h - p[1] * box.h;
    if (!i) g.moveTo(x, y); else g.lineTo(x, y);
  });
  g.stroke(); g.shadowBlur = 0;
  const u = (t * 0.19) % 1, q = rows[Math.min(rows.length - 1, Math.floor(u * rows.length))];
  g.fillStyle = hi; g.beginPath();
  g.arc(box.x + q[0] * box.w, box.y + box.h - q[1] * box.h, 2.2 * k, 0, TAU); g.fill();
  g.restore();
}

function drawKineticSignals(g, W, H, t, o, raw, step, rois) {
  if (!raw) return;
  const a = raw === true ? {} : raw;
  const accent = a.arteryColor || cssVar("--accent", "#D97757");
  const tissue = a.tissueColor || cssVar("--hi", "#F9F9F7");
  const vein = a.veinColor || "#6FB8C8";
  const opacity = step <= 0 ? [1, 0, 0]
    : step === 1 ? [0.18, 1, 0]
    : step === 2 ? [0.10, 0.18, 1]
    : [0.82, 0.82, 0.82];
  const pw = Math.min(235 * o.k, W * 0.22), ph = Math.max(58 * o.k, H * 0.115);
  const left = { x: 18 * o.k, y: H * 0.58, w: pw, h: ph };
  const topRight = { x: W - pw - 18 * o.k, y: H * 0.18, w: pw, h: ph };
  const midRight = { x: W - pw - 18 * o.k, y: H * 0.60, w: pw, h: ph };
  const ica = projectBrainPoint([0.13, 0.02, -0.64], o);
  const tissueAt = projectBrainPoint((rois[0]?.center || [0.48, -0.18, 0.36]), o, "cortex");
  const sinus = projectBrainPoint([0, -0.15, 0.88], o);
  const links = [
    [ica, { x: left.x + left.w, y: left.y + left.h * 0.48 }, accent, opacity[0]],
    [tissueAt, { x: midRight.x, y: midRight.y + midRight.h * 0.48 }, tissue, opacity[1]],
    [sinus, { x: topRight.x, y: topRight.y + topRight.h * 0.48 }, vein, opacity[2]],
  ];
  links.forEach(([p, q, color, alpha]) => {
    if (alpha <= 0.01) return;
    g.save(); g.globalAlpha = alpha * 0.48; g.strokeStyle = color;
    g.lineWidth = Math.max(0.8, 1.05 * o.k); g.setLineDash([3 * o.k, 4 * o.k]);
    const cx = (p.x + q.x) / 2;
    g.beginPath(); g.moveTo(p.x, p.y); g.quadraticCurveTo(cx, p.y, q.x, q.y); g.stroke();
    g.restore();
  });
  drawSignalPlot(g, left, KINETIC.arterial, accent, opacity[0], "input  Cₐ(t)", t, o.k);
  drawSignalPlot(g, midRight, KINETIC.tissue, tissue, opacity[1], "tissue  Cₜ(t)", t, o.k);
  drawSignalPlot(g, topRight, KINETIC.venous, vein, opacity[2], "venous  Cᵥ(t)", t, o.k);
}

// ── axial anatomy inset ─────────────────────────────────────────────────────

const AXIAL_REGION_INDEX={cortex:1,subcortex:2,brainstem:3,cerebellum:4,wm:5,cerebellum_wm:6,interface:7};
const AXIAL_REGION_LABEL={cortex:"cortical GM",subcortex:"subcortical GM",brainstem:"brainstem",
  cerebellum:"cerebellar GM",wm:"cerebral white matter",cerebellum_wm:"cerebellar white matter",interface:"GM / WM interface"};

function drawOrthogonalRegionColumn(g,W,H,t,o,a){
  if(!orthogonalLoaded){loadOrthogonalRegions();return;}
  const mode=a.mode||"cortex",region=Number(a.regionIndex??AXIAL_REGION_INDEX[mode]??1),accent=a.color||cssVar("--accent","#D97757");
  const activeAccent=mode==="interface"?(a.interfaceColor||a.color||"#F0C85A"):accent;
  const hi=cssVar("--hi","#F9F9F7"),lo=cssVar("--lo","#6E6C64"),cx=Number(a.center?.[0]??.83)*W;
  const side=Math.min(W*.38,H*.285)*Number(a.scale??1),ys=[H*.185,H*.50,H*.815],views=["axial","coronal","sagittal"];
  g.save();g.strokeStyle=lo;g.globalAlpha=.26;g.lineWidth=.8*o.k;g.setLineDash([3*o.k,5*o.k]);
  g.beginPath();g.moveTo(o.ox+o.S*.56,o.oy);g.lineTo(cx-side*.66,H*.50);g.stroke();g.setLineDash([]);g.restore();
  views.forEach((view,i)=>{const box={x:cx-side*.5,y:ys[i]-side*.5,w:side,h:side};
    const img=raster(`decks/assets/defense/patient-ortho-region-${region}-${view}.png`);
    // Source plates are pre-oriented before export; preserve that anatomical orientation.
    drawSpiralRaster(g,img,box,o.k,{mode:"dark",stride:3,dot:.70,alpha:.98,threshold:.045});
    g.save();g.strokeStyle=activeAccent;g.globalAlpha=.54;g.lineWidth=.85*o.k;g.strokeRect(box.x,box.y,box.w,box.h);
    g.font=fontOf(Math.max(.90,o.k),9.4);g.textAlign="left";g.textBaseline="bottom";g.fillStyle=hi;g.globalAlpha=.94;
    g.fillText(view,box.x+4*o.k,box.y+box.h-4*o.k);g.restore();});
  g.save();g.font=fontOf(Math.max(.90,o.k),9.4);g.textAlign="center";g.textBaseline="top";g.fillStyle=activeAccent;
  g.globalAlpha=.92;g.fillText(`T1w · ${AXIAL_REGION_LABEL[mode]||"region"}`,cx,H*.01);g.restore();
}

function drawIndexedAxial(g,box,k,a={}){
  if(!AXIAL_META){loadAxialStack();return false;}
  const type=a.type||"regions",active=Number(a.active??0),best=type==="regions"?AXIAL_META.regions_best:AXIAL_META.parcels_best;
  const z=Math.max(0,Math.min(AXIAL_META.slices-1,Number(a.slice??best[Math.max(0,active-1)]??5)|0));
  const base=raster(`decks/assets/defense/patient-axial-base-z${z}.png`),index=raster(`decks/assets/defense/patient-axial-${type}-z${z}.png`);
  const bf=rasterFrame(base),ix=rasterFrame(index);if(!bf||!ix)return false;
  const scale=Math.min(box.w/bf.w,box.h/bf.h),dw=bf.w*scale,dh=bf.h*scale,ox=box.x+(box.w-dw)/2,oy=box.y+(box.h-dh)/2;
  const hi=cssVar("--hi","#F9F9F7"),lo=cssVar("--lo","#6E6C64"),accent=a.color||cssVar("--accent","#D97757");
  const current=Math.max(0,active-1),complete=!!a.complete,showAll=!!a.showAll,
    visited=new Set((a.visitedLabels||[]).map(Number)),hasVisited=visited.size>0,
    activeColour=a.activeColor||accent;
  const exceptions=new Set((a.exceptionLabels||[]).map(Number)),
    significantExceptions=new Set((a.significantExceptionLabels||[]).map(Number)),
    significantLabels=new Set((a.significantLabels||[]).map(Number)),finalSignificance=!!a.finalSignificance,
    exceptionColour=a.exceptionColor||"#E45B5B",lowerColour=a.lowerColor||"#5B84A3",
    nonsignificantColour=a.nonsignificantColor||"#686B69";g.save();
  for(let y=0;y<bf.h;y+=2)for(let x=0;x<bf.w;x+=2){
    const j=(y*bf.w+x)*4,lum=(.299*bf.data[j]+.587*bf.data[j+1]+.114*bf.data[j+2])/255;
    if(bf.data[j+3]<12||lum<.025)continue;const flip180=!!a.flip180,
      px=ox+(flip180?bf.w-x-.5:x+.5)*scale,py=oy+(flip180?bf.h-y-.5:y+.5)*scale;
    g.fillStyle=lum>.48?hi:lo;g.globalAlpha=.12+.42*lum;g.beginPath();g.arc(px,py,(.42+.40*lum)*k,0,TAU);g.fill();
    const label=ix.data[j]+256*ix.data[j+1];if(!label)continue;
    let colour=null,alpha=0,rad=0;
    if(type==="regions"&&label===active){colour=accent;alpha=.88;rad=1.05;}
    else if(type==="parcels"){
      if(complete&&finalSignificance){const sig=significantLabels.has(label),high=significantExceptions.has(label);colour=sig?(high?exceptionColour:lowerColour):nonsignificantColour;
        alpha=sig?.96:.68;rad=sig?1.20:.88;}
      else if(complete&&exceptions.has(label)){const sig=significantExceptions.has(label);colour=exceptionColour;alpha=sig?.96:.72;rad=sig?1.36:1.02;}
      else if(complete){colour=lowerColour;alpha=.58;rad=.78;}
      else if(active&&label===active){colour=exceptions.has(label)?exceptionColour:activeColour;alpha=.96;rad=1.18;}
      else if((hasVisited?visited.has(label):active&&label-1<current)&&exceptions.has(label)){const sig=significantExceptions.has(label);colour=exceptionColour;alpha=sig?.82:.68;rad=sig?1.08:.96;}
      else if(hasVisited?visited.has(label):active&&label-1<current){colour=lowerColour;alpha=.54;rad=.76;}
      else if(showAll){const rgb=rampAt(.22+((label*.61803398875)%1)*.72);colour=`rgb(${rgb[0]|0},${rgb[1]|0},${rgb[2]|0})`;alpha=.48;rad=.72;}
    }
    if(colour){g.fillStyle=colour;g.globalAlpha=alpha;g.beginPath();g.arc(px,py,rad*k,0,TAU);g.fill();}
  }
  g.strokeStyle=a.color||accent;g.globalAlpha=.58;g.lineWidth=1.1*k;g.strokeRect(ox,oy,dw,dh);g.restore();return true;
}

function drawAxialSlice(g, W, H, t, o, raw) {
  if (!raw) return;
  const a = typeof raw === "string" ? { mode: raw } : raw;
  if(a.orthogonal){drawOrthogonalRegionColumn(g,W,H,t,o,a);return;}
  const mode = a.mode || "cortex",region=Number(a.regionIndex??AXIAL_REGION_INDEX[mode]??1);
  const accent = a.color || cssVar("--accent", "#D97757");
  const activeAccent = mode === "interface" ? (a.interfaceColor || a.color || "#F0C85A") : accent;
  const hi = cssVar("--hi", "#F9F9F7");
  const c = a.center || [0.78, 0.52];
  const cx = Number(c[0] ?? 0.78) * W, cy = Number(c[1] ?? 0.52) * H;
  const R = Math.min(W, H) * 0.22 * Number(a.scale ?? 1);
  if(!AXIAL_META){loadAxialStack();return;}

  // The plane and image share a subject-level spatial story; no anatomical oval is invented.
  g.save(); g.globalAlpha = 0.52; g.strokeStyle = accent; g.lineWidth = 1.15 * o.k;
  g.setLineDash([4 * o.k, 4 * o.k]); g.beginPath();
  g.ellipse(o.ox, o.oy - o.S * 0.03, o.S * 0.53, o.S * 0.13, -0.08, 0, TAU); g.stroke();
  g.setLineDash([]); g.beginPath(); g.moveTo(o.ox + o.S * 0.52, o.oy - o.S * 0.02);
  g.lineTo(cx - R * 1.22, cy); g.stroke(); g.restore();
  const box={x:cx-R,y:cy-R,w:R*2,h:R*2};drawIndexedAxial(g,box,o.k,{type:"regions",active:region,color:activeAccent});
  g.save();g.strokeStyle=activeAccent;g.globalAlpha=.72;g.lineWidth=1.2*o.k;
  g.strokeRect(box.x,box.y,box.w,box.h);g.font=fontOf(Math.max(o.k,.96),11.0);g.textAlign="center";g.textBaseline="top";
  g.fillStyle=activeAccent;
  g.fillText(`T1w axial · ${AXIAL_REGION_LABEL[mode]||"region"}`,cx,cy+R+6*o.k,box.w*1.12);g.restore();
}

/**
 * The mesh, shaded and drawn back to front.
 *
 * Triangles are what make it read as a solid: a point cloud can only ever suggest a surface,
 * because nothing in it hides anything behind it. Here the far side is genuinely covered.
 *
 * Flat shading, one tone per facet, and no attempt at a smooth normal. Low-poly is not a
 * concession to the frame budget — a faceted surface in the deck's palette belongs next to a
 * field made of discrete dots, and a glossy one would not.
 */

/**
 * The mesh as a wireframe over the dots, breathing.
 *
 * A filled surface hides the point cloud, and the cloud is the thing that says what this is
 * made of. So the triangles are drawn as edges only: the dots read through them, the facets
 * read as facets, and the two together look like the field does — structure implied by
 * something discrete rather than stated by something solid.
 *
 * The breathing is a slow radial swell, low frequency in space so neighbouring triangles
 * move together and the whole surface undulates instead of shimmering. It is applied to the
 * VERTICES, so shared edges stay shared and the mesh never tears.
 *
 * Edges are stroked in shade buckets — one path per bucket, one stroke per bucket. Fifteen
 * thousand triangles is forty-six thousand line segments; as individual strokes that is a
 * projector laptop's whole frame, and as eight paths it is nothing. The field batches its
 * dots by brightness for exactly the same reason.
 */
function drawBrainWire(g, W, H, M, o) {
  const { cy, sy: syaw, ct, st, S, ox, oy, lit, only, k, t } = o;
  const V = M.V, F = M.F, X = M.sx, Y = M.sy, Z = M.sz;
  const rois = o.rois || [];
  const gray = clamp01(o.gray || 0), grayRgb = [145, 145, 142];

  const amp = o.breathe ?? 0.022;
  const w1 = t * 0.55, w2 = t * 0.37;
  const moved = [0, 0, 0];
  for (let i = 0, j = 0; i < M.nv; i++, j += 3) {
    let x = V[j], y = V[j + 1], z = V[j + 2];
    if (amp > 0) {
      // two slow waves at right angles, so the swell travels rather than pulsing in place
      const sw = Math.sin(w1 + x * 2.3 + z * 1.7) * 0.6 + Math.sin(w2 + y * 2.9 - z * 1.1) * 0.4;
      const f = 1 + amp * sw;
      x *= f; y *= f; z *= f;
    }
    explodePoint(x, y, z, M.segments[M.vseg[i]]?.key, o.explode || 0, moved);
    x = moved[0]; y = moved[1]; z = moved[2];
    const xr = x * cy - y * syaw;
    const yr0 = x * syaw + y * cy;
    X[i] = ox + xr * S;
    Y[i] = oy - (yr0 * st + z * ct) * S;
    Z[i] = -(yr0 * ct - z * st);
  }

  const LEVELS = 8;
  const paths = [];
  const meta = [];
  for (let i = 0; i < LEVELS; i++) { paths.push(new Path2D()); meta.push(0); }
  const glassPath = new Path2D();
  let anyGlass = false;

  const LX = -0.42, LY = 0.60, LZ = 0.68;
  for (let f = 0, j = 0; f < M.nf; f++, j += 3) {
    const a = F[j], b = F[j + 1], c = F[j + 2];
    const area = (X[b] - X[a]) * (Y[c] - Y[a]) - (X[c] - X[a]) * (Y[b] - Y[a]);
    if (area <= 0) continue;                       // back of the shell
    const key = M.segments[M.fseg[f]]?.key;
    if (only && !only.includes(key)) continue;
    const cx = (V[a * 3] + V[b * 3] + V[c * 3]) / 3;
    const cy0 = (V[a * 3 + 1] + V[b * 3 + 1] + V[c * 3 + 1]) / 3;
    const cz = (V[a * 3 + 2] + V[b * 3 + 2] + V[c * 3 + 2]) / 3;
    const localLit = rois.length && inRoi(cx, cy0, cz, key, rois);
    const focus = !!lit || rois.length > 0;
    const isLit = !focus || !!localLit || !!lit?.includes(key);

    const ux = X[b] - X[a], uy = -(Y[b] - Y[a]), uz = Z[b] - Z[a];
    const vx = X[c] - X[a], vy = -(Y[c] - Y[a]), vz = Z[c] - Z[a];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    const lam = Math.max(0, (nx * LX + ny * LY + nz * LZ) / len);
    const d = Math.max(Z[a], Z[b], Z[c]);
    const bright = (0.25 + 0.75 * lam) * (0.55 + 0.45 * (d * 0.5 + 0.5));

    const P = isLit ? paths[Math.min(LEVELS - 1, (bright * LEVELS) | 0)] : glassPath;
    if (!isLit) anyGlass = true; else meta[Math.min(LEVELS - 1, (bright * LEVELS) | 0)]++;
    P.moveTo(X[a], Y[a]); P.lineTo(X[b], Y[b]); P.lineTo(X[c], Y[c]); P.closePath();
  }

  g.lineJoin = "round";
  if (anyGlass) {
    const context = contextAlpha(o.contextOpacity);
    g.strokeStyle = `rgba(${rgb3(mixRgb(rampAt(0.5), grayRgb, gray))},${(context * 0.72).toFixed(3)})`;
    g.lineWidth = 0.72 * k;
    g.stroke(glassPath);
  }
  const accent = o.accent || cssVar("--accent", "#D97757");
  for (let i = 0; i < LEVELS; i++) {
    if (!meta[i]) continue;
    const bright = (i + 0.5) / LEVELS;
    if (lit || rois.length) {
      g.strokeStyle = `color-mix(in srgb, ${accent} ${(18 + 78 * bright) | 0}%, transparent)`;
    } else {
      const col = mixRgb(rampAt(0.18 + 0.78 * bright), grayRgb, gray);
      g.strokeStyle = `rgba(${rgb3(col)},${(0.13 + 0.72 * bright).toFixed(3)})`;
    }
    g.lineWidth = (0.5 + 0.65 * bright) * k;
    g.stroke(paths[i]);
  }
}

const rgb3 = (c) => `${c[0] | 0},${c[1] | 0},${c[2] | 0}`;

/** What is being pointed at, named under the figure. */
function labelSegments(g, W, H, B, lit, only, k, x = W / 2) {
  const pick = lit || only;
  if (!pick) return;
  const shown = B.segments.filter((x) => pick.includes(x.key)).map((x) => x.label);
  if (!shown.length) return;
  g.fillStyle = cssVar("--accent", "#D97757");
  g.font = fontOf(k, 11.5);
  g.textAlign = "center"; g.textBaseline = "bottom";
  g.fillText(shown.join(" · "), x, H - 6 * k);
}

function drawBrainMesh(g, W, H, M, o) {
  const { cy, sy: syaw, ct, st, S, ox, oy, lit, only, k } = o;
  const V = M.V, F = M.F, X = M.sx, Y = M.sy, Z = M.sz;
  const rois = o.rois || [];
  const moved = [0, 0, 0];

  for (let i = 0, j = 0; i < M.nv; i++, j += 3) {
    let x = V[j], y = V[j + 1], z = V[j + 2];
    explodePoint(x, y, z, M.segments[M.vseg[i]]?.key, o.explode || 0, moved);
    x = moved[0]; y = moved[1]; z = moved[2];
    const xr = x * cy - y * syaw;
    const yr0 = x * syaw + y * cy;
    X[i] = ox + xr * S;
    Y[i] = oy - (yr0 * st + z * ct) * S;
    Z[i] = -(yr0 * ct - z * st);                 // toward the viewer
  }

  const SLICES = 128;
  const bins = M.bins || (M.bins = Array.from({ length: SLICES }, () => []));
  for (let i = 0; i < SLICES; i++) bins[i].length = 0;

  for (let f = 0, j = 0; f < M.nf; f++, j += 3) {
    const a = F[j], b = F[j + 1], c = F[j + 2];
    // Cull by WINDING, in screen space. The tool orients every surface outward and checks it
    // with the divergence theorem, so a triangle wound clockwise on screen is one we are
    // looking at from behind — and half the mesh costs nothing.
    const area = (X[b] - X[a]) * (Y[c] - Y[a]) - (X[c] - X[a]) * (Y[b] - Y[a]);
    if (area <= 0) continue;
    /* Ordered by the NEAREST corner, not the centroid.
     *
     * A painter's algorithm compares whole triangles by one number, and a centroid is the
     * wrong one when they differ wildly in size. A cortical facet can be twenty millimetres
     * across; stood steeply near the silhouette its middle sits deeper than a thalamus it
     * is nevertheless entirely in front of, so the thalamus drew last and came through the
     * side of the head. Because these surfaces are nested, the near wall of an outer shell
     * has all three corners in front of anything it encloses — so the nearest corner
     * separates them correctly and the centroid does not. */
    const d = Math.max(Z[a], Z[b], Z[c]);
    const s = ((d + 1) * 0.5 * (SLICES - 1)) | 0;
    bins[s < 0 ? 0 : s > SLICES - 1 ? SLICES - 1 : s].push(f);
  }

  // a light up and to the left, slightly in front — the direction everything in this deck
  // is lit from, and the one that reads as "above" to anyone looking at it
  const LX = -0.42, LY = 0.60, LZ = 0.68;
  const accent = o.accent || cssVar("--accent", "#D97757");
  const facets = o.facets ?? true;

  for (let sIdx = 0; sIdx < SLICES; sIdx++) {
    const row = bins[sIdx];
    for (let m = 0; m < row.length; m++) {
      const f = row[m], j = f * 3;
      const a = F[j], b = F[j + 1], c = F[j + 2];
      const key = M.segments[M.fseg[f]]?.key;
      if (only && !only.includes(key)) continue;
      const cx = (V[a * 3] + V[b * 3] + V[c * 3]) / 3;
      const cy0 = (V[a * 3 + 1] + V[b * 3 + 1] + V[c * 3 + 1]) / 3;
      const cz = (V[a * 3 + 2] + V[b * 3 + 2] + V[c * 3 + 2]) / 3;
      const localLit = rois.length && inRoi(cx, cy0, cz, key, rois);
      const focus = !!lit || rois.length > 0;
      const isLit = !focus || !!localLit || !!lit?.includes(key);

      // the facet's normal, in view space, from its own corners
      const ux = X[b] - X[a], uy = -(Y[b] - Y[a]), uz = Z[b] - Z[a];
      const vx = X[c] - X[a], vy = -(Y[c] - Y[a]), vz = Z[c] - Z[a];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const lam = Math.max(0, nx * LX + ny * LY + nz * LZ);
      const shade = 0.30 + 0.85 * lam;

      const tone = M.tone[M.fseg[f]];
      let col, alpha;
      if (isLit && focus) {
        alpha = 0.97;
        col = null;                                // the deck's accent, shaded
      } else if (isLit) {
        alpha = 0.97;
        col = rampAt(tone);
      } else {
        alpha = contextAlpha(o.contextOpacity);
        col = rampAt(tone);
      }
      g.fillStyle = col
        ? `rgba(${Math.min(255, col[0] * shade) | 0},${Math.min(255, col[1] * shade) | 0},${Math.min(255, col[2] * shade) | 0},${alpha})`
        : `color-mix(in srgb, ${accent} ${(shade * 88) | 0}%, #000)`;
      g.beginPath();
      g.moveTo(X[a], Y[a]); g.lineTo(X[b], Y[b]); g.lineTo(X[c], Y[c]);
      g.closePath();
      g.fill();
      /* Hairline on every facet, in its own fill colour.
       *
       * Not decoration: adjacent triangles differ by a shade or two and antialiasing leaves a
       * pale seam along every shared edge, so an unstroked mesh comes out crazed with white
       * cracks. Stroking each facet in its own colour closes them. */
      if (facets && alpha > 0.2) { g.strokeStyle = g.fillStyle; g.lineWidth = 0.7 * k; g.stroke(); }
    }
  }
}

// ── native neurovascular-unit primitives ────────────────────────────────────

function dotPolyline(g, points, color, radius, alpha = 1, gap = 4) {
  g.save(); g.fillStyle = color; g.globalAlpha = alpha;
  for (let j = 1; j < points.length; j++) {
    const a = points[j - 1], b = points[j];
    const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / gap));
    for (let i = 0; i < n; i++) {
      const u = i / n, x = mix(a[0], b[0], u), y = mix(a[1], b[1], u);
      g.beginPath(); g.arc(x, y, radius * (0.82 + 0.35 * hash01(i, j, 7)), 0, TAU); g.fill();
    }
  }
  g.restore();
}

function dottedCell(g, cx, cy, R, color, seed, arms = 9, reach = 2.0, k = 1) {
  g.save(); g.fillStyle = color;
  for (let i = 0; i < 118; i++) {
    const u = hash01(i, seed, 1), a = hash01(i, seed, 2) * TAU;
    const r = Math.sqrt(u) * R;
    g.globalAlpha = 0.42 + 0.55 * (1 - r / R);
    g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r,
                         (0.75 + hash01(i, seed, 3) * 0.7) * k, 0, TAU); g.fill();
  }
  g.globalAlpha = 0.94;
  for (let arm = 0; arm < arms; arm++) {
    const a0 = arm / arms * TAU + seed * 0.37;
    const bend = (hash01(arm, seed, 8) - 0.5) * 0.9;
    const len = R * reach * (0.72 + 0.52 * hash01(arm, seed, 9));
    const p0 = [cx + Math.cos(a0) * R * 0.55, cy + Math.sin(a0) * R * 0.55];
    const p1 = [cx + Math.cos(a0 + bend * 0.35) * len * 0.48,
                cy + Math.sin(a0 + bend * 0.35) * len * 0.48];
    const p2 = [cx + Math.cos(a0 + bend) * len, cy + Math.sin(a0 + bend) * len];
    dotPolyline(g, [p0, p1, p2], color, 0.75 * k, 0.78, 3.2 * k);
    if (arm % 2 === 0) {
      const fork = a0 + bend + (arm % 4 ? 0.48 : -0.48);
      dotPolyline(g, [p2, [p2[0] + Math.cos(fork) * R * 0.66,
                           p2[1] + Math.sin(fork) * R * 0.66]], color, 0.62 * k, 0.60, 3.5 * k);
    }
  }
  g.restore();
}

function microLabel(g, text, from, to, color, k, align = "left") {
  g.save(); g.strokeStyle = color; g.globalAlpha = 0.72; g.lineWidth = 1 * k;
  g.beginPath(); g.moveTo(from[0], from[1]); g.lineTo(to[0], to[1]); g.stroke();
  g.fillStyle = color; g.globalAlpha = 0.96; g.font = fontOf(Math.max(k, 0.88), 10.5);
  g.textAlign = align; g.textBaseline = "middle";
  g.fillText(text, to[0] + (align === "left" ? 5 : -5) * k, to[1]); g.restore();
}

function drawVoxelCube(g, center, size, color, k, alpha=1) {
  const pts = [
    [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],
  ].map(([x,y,z]) => center(x * size, y * size, z * size));
  const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  g.save(); g.strokeStyle = color; g.lineWidth = 1.35 * k; g.globalAlpha = 0.96*alpha;
  g.shadowColor = color; g.shadowBlur = 7 * k;
  g.beginPath(); edges.forEach(([a,b]) => { g.moveTo(pts[a].x, pts[a].y); g.lineTo(pts[b].x, pts[b].y); });
  g.stroke(); g.restore();
  return pts;
}

function drawOrientedVoxelBox(g,project,halfSize,anglesDeg,color,k,alpha=1){
  const h=[Number(halfSize?.[0]??.18),Number(halfSize?.[1]??.18),Number(halfSize?.[2]??.18)],
    ax=Number(anglesDeg?.[0]??0)*Math.PI/180,ay=Number(anglesDeg?.[1]??0)*Math.PI/180,az=Number(anglesDeg?.[2]??0)*Math.PI/180,
    cx=Math.cos(ax),sx=Math.sin(ax),cy=Math.cos(ay),sy=Math.sin(ay),cz=Math.cos(az),sz=Math.sin(az),
    rotate=([x,y,z])=>{const x1=x,y1=y*cx-z*sx,z1=y*sx+z*cx,x2=x1*cy+z1*sy,y2=y1,z2=-x1*sy+z1*cy;return[x2*cz-y2*sz,x2*sz+y2*cz,z2];},
    raw=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
    pts=raw.map(([x,y,z])=>project(rotate([x*h[0],y*h[1],z*h[2]]))),
    faces=[[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]].map(face=>[face.reduce((s,i)=>s+Number(pts[i].d||0),0)/4,face]).sort((a,b)=>a[0]-b[0]),
    edges=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  g.save();for(const [,face] of faces){g.fillStyle=color;g.globalAlpha=.055*alpha;g.beginPath();g.moveTo(pts[face[0]].x,pts[face[0]].y);for(let i=1;i<face.length;i++)g.lineTo(pts[face[i]].x,pts[face[i]].y);g.closePath();g.fill();}
  g.strokeStyle=color;g.globalAlpha=.96*alpha;g.lineWidth=1.45*k;g.shadowColor=color;g.shadowBlur=8*k;g.beginPath();for(const [a,b] of edges){g.moveTo(pts[a].x,pts[a].y);g.lineTo(pts[b].x,pts[b].y);}g.stroke();g.restore();return pts;
}

function drawMicrovascularUnit(g, box, t, alpha, k) {
  if (alpha <= 0.01) return;
  const accent = cssVar("--accent", "#D97757"), vein = "#6FB8C8";
  const green = "#78BA8D", yellow = "#F0C85A", orange = "#E6A05F", teal = "#63B7B1";
  const cx = box.x + box.w * 0.52, top = box.y + box.h * 0.10, bottom = box.y + box.h * 0.90;
  const vesselX = (y) => cx + Math.sin((y - top) / (bottom - top) * Math.PI * 1.35) * box.w * 0.035;
  g.save(); g.globalAlpha = alpha;

  // Capillary lumen and its endothelial wall, both expressed as point bands.
  const grad = g.createLinearGradient(cx, top, cx, bottom);
  grad.addColorStop(0, accent); grad.addColorStop(0.54, "#C49A83"); grad.addColorStop(1, vein);
  g.strokeStyle = grad; g.lineCap = "round"; g.lineWidth = 12 * k; g.globalAlpha = alpha * 0.18;
  g.beginPath();
  for (let i = 0; i <= 80; i++) {
    const y = mix(top, bottom, i / 80), x = vesselX(y);
    if (!i) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke();
  for (let i = 0; i <= 170; i++) {
    const u = i / 170, y = mix(top, bottom, u), x = vesselX(y);
    const c = u < 0.48 ? accent : vein;
    g.fillStyle = c; g.globalAlpha = alpha * (0.68 + 0.28 * Math.sin(i * 1.7) ** 2);
    for (const side of [-1, 1]) {
      g.beginPath(); g.arc(x + side * 7.0 * k, y, (0.82 + hash01(i, side, 4) * 0.62) * k, 0, TAU); g.fill();
    }
    if (i % 5 === 0) { g.beginPath(); g.arc(x, y, 1.25 * k, 0, TAU); g.fill(); }
  }

  // Arteriole/capillary side branches and moving erythrocyte-like signal dots.
  [0.27, 0.49, 0.69].forEach((u, bi) => {
    const y = mix(top, bottom, u), x = vesselX(y), side = bi % 2 ? 1 : -1;
    const branch = [[x, y], [x + side * box.w * 0.10, y - box.h * 0.025],
                    [x + side * box.w * 0.18, y + box.h * (bi - 1) * 0.045]];
    dotPolyline(g, branch, bi < 1 ? accent : bi > 1 ? vein : "#C49A83", 0.82 * k, alpha * 0.86, 3.0 * k);
  });
  for (let i = 0; i < 8; i++) {
    const u = (t * 0.12 + i / 8) % 1, y = mix(top, bottom, u), x = vesselX(y);
    g.fillStyle = u < 0.5 ? accent : vein; g.globalAlpha = alpha * 0.95;
    g.beginPath(); g.ellipse(x, y, 2.5 * k, 1.45 * k, 0, 0, TAU); g.fill();
  }

  // High-resolution dotted astrocytes and their endfeet.
  dottedCell(g, box.x + box.w * 0.25, box.y + box.h * 0.34, 11 * k, green, 2, 10, 2.5, k);
  dottedCell(g, box.x + box.w * 0.76, box.y + box.h * 0.57, 12 * k, green, 5, 11, 2.35, k);
  dottedCell(g, box.x + box.w * 0.31, box.y + box.h * 0.76, 9 * k, green, 8, 8, 2.0, k);
  [0.34, 0.58, 0.76].forEach((u, i) => {
    const y = mix(top, bottom, u), x = vesselX(y), side = i === 1 ? 1 : -1;
    g.fillStyle = green; g.globalAlpha = alpha * 0.72;
    g.beginPath(); g.ellipse(x + side * 10 * k, y, 7 * k, 4 * k, side * 0.25, 0, TAU); g.fill();
  });

  // Pericytes hug the endothelial wall; nuclei make them legible as cells, not decoration.
  [0.42, 0.70].forEach((u, i) => {
    const y = mix(top, bottom, u), x = vesselX(y), side = i ? 1 : -1;
    g.strokeStyle = orange; g.globalAlpha = alpha * 0.9; g.lineWidth = 3.5 * k;
    g.beginPath(); g.arc(x, y, 10 * k, i ? -1.3 : 1.8, i ? 1.0 : 4.1); g.stroke();
    g.fillStyle = orange; g.beginPath(); g.ellipse(x + side * 10 * k, y - 2 * k, 4.4 * k, 3 * k, 0, 0, TAU); g.fill();
  });

  // A neuron and a compact microglial cell complete the local unit without becoming a cell atlas.
  dottedCell(g, box.x + box.w * 0.76, box.y + box.h * 0.25, 8.5 * k, yellow, 11, 7, 1.85, k);
  dottedCell(g, box.x + box.w * 0.13, box.y + box.h * 0.66, 6.8 * k, teal, 14, 12, 1.75, k);

  microLabel(g, "astrocyte", [box.x + box.w * 0.27, box.y + box.h * 0.33],
             [box.x + box.w * 0.07, box.y + box.h * 0.24], green, k, "left");
  microLabel(g, "neuron", [box.x + box.w * 0.76, box.y + box.h * 0.25],
             [box.x + box.w * 0.86, box.y + box.h * 0.14], yellow, k, "left");
  microLabel(g, "pericyte", [vesselX(box.y + box.h * 0.55), box.y + box.h * 0.55],
             [box.x + box.w * 0.67, box.y + box.h * 0.46], orange, k, "left");
  microLabel(g, "microglia", [box.x + box.w * 0.13, box.y + box.h * 0.66],
             [box.x + box.w * 0.03, box.y + box.h * 0.82], teal, k, "left");
  microLabel(g, "capillary", [vesselX(box.y + box.h * 0.31), box.y + box.h * 0.31],
             [box.x + box.w * 0.58, box.y + box.h * 0.16], accent, k, "left");
  g.restore();
}

function drawBarrierUnit(g, box, alpha, k) {
  if (alpha <= 0.01) return;
  const accent = cssVar("--accent", "#D97757"), vein = "#6FB8C8";
  const green = "#78BA8D", orange = "#E6A05F", basement = "#CBBFA6";
  const hi = cssVar("--hi", "#F9F9F7");
  const cx = box.x + box.w * 0.27, cy = box.y + box.h * 0.50;
  const R = Math.min(box.w, box.h) * 0.22;
  g.save(); g.globalAlpha = alpha;
  const ring = (r, color, count, dot, start = 0, end = TAU) => {
    g.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const u = mix(start, end, i / Math.max(1, count - 1));
      const rr = r * (0.985 + (hash01(i, count, 3) - 0.5) * 0.025);
      g.beginPath(); g.arc(cx + Math.cos(u) * rr, cy + Math.sin(u) * rr,
                           dot * (0.78 + hash01(i, 5, count) * 0.45) * k, 0, TAU); g.fill();
    }
  };
  // Lumen, then endothelial tube, then the thin shared basement membrane.
  g.fillStyle = "rgba(190,118,112,0.18)"; g.beginPath(); g.arc(cx, cy, R * 0.63, 0, TAU); g.fill();
  ring(R * 0.72, accent, 112, 1.18);
  ring(R * 0.89, basement, 126, 0.78);

  // Pericytes occupy only part of the abluminal circumference; they are not a full wall.
  g.strokeStyle = orange; g.globalAlpha = alpha * 0.92; g.lineWidth = 7.5 * k; g.lineCap = "round";
  g.beginPath(); g.arc(cx, cy, R * 0.96, -0.70, 0.58); g.stroke();
  g.beginPath(); g.arc(cx, cy, R * 0.96, 2.20, 2.82); g.stroke();
  const pn = [cx + Math.cos(-0.10) * R * 0.98, cy + Math.sin(-0.10) * R * 0.98];
  g.fillStyle = orange; g.beginPath(); g.ellipse(pn[0], pn[1], 7*k, 4*k, -.1, 0, TAU); g.fill();

  // Separate endfeet tiles nearly invest the whole vessel; tiny clefts make the cellular
  // organization visible without implying one continuous astrocyte membrane.
  const pads = 18;
  for (let i = 0; i < pads; i++) {
    if (i === 4) continue;
    const a0 = i / pads * TAU + 0.025, a1 = (i + 0.86) / pads * TAU - 0.025;
    g.strokeStyle = green; g.globalAlpha = alpha * (0.67 + 0.26 * hash01(i, 8, 2));
    g.lineWidth = 8.0 * k; g.lineCap = "round";
    g.beginPath(); g.arc(cx, cy, R * 1.17, a0, a1); g.stroke();
  }
  // Tight junctions as short paired bars between endothelial cells.
  g.strokeStyle = hi; g.lineWidth = 1.15 * k; g.globalAlpha = alpha * 0.86;
  for (let i = 0; i < 14; i++) {
    const u = i / 14 * TAU, x = cx + Math.cos(u) * R * 0.72, y = cy + Math.sin(u) * R * 0.72;
    const tx = -Math.sin(u) * 2.5 * k, ty = Math.cos(u) * 2.5 * k;
    g.beginPath(); g.moveTo(x - tx, y - ty); g.lineTo(x + tx, y + ty); g.stroke();
  }
  const labels = [
    ["astrocyte endfeet", R * 1.17, green, -0.82],
    ["pericyte", R * 0.96, orange, -0.12],
    ["basement membrane", R * 0.89, basement, 0.34],
    ["endothelium + TJs", R * 0.72, accent, 0.67],
    ["lumen", R * 0.30, hi, 0.92],
  ];
  labels.forEach(([text, r, color, ang], i) => {
    const p = [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r];
    // Keep the long biological labels inside the projector-safe edge of the scene.
    const q = [box.x + box.w * 0.51, box.y + box.h * (0.14 + i * 0.17)];
    microLabel(g, text, p, q, color, k, "left");
  });
  // Red-to-blue blood signal crossing the lumen.
  const grad = g.createLinearGradient(cx - R * 0.62, cy, cx + R * 0.62, cy);
  grad.addColorStop(0, accent); grad.addColorStop(1, vein);
  g.strokeStyle = grad; g.globalAlpha = alpha * 0.82; g.lineWidth = 2.2 * k;
  g.beginPath(); g.moveTo(cx - R * 0.62, cy); g.lineTo(cx + R * 0.62, cy); g.stroke();
  g.restore();
}

function patientView(W, H, t, a = {}) {
  const yaw = ((a.yaw ?? 104) * Math.PI) / 180 + (a.still ? 0 : t * (a.spin ?? 0.030) * TAU);
  const tilt = ((a.tilt ?? 12) * Math.PI) / 180;
  const [ox, oy] = brainPosition(W, H, a);
  return {
    cy: Math.cos(yaw), sy: Math.sin(yaw), ct: Math.cos(tilt), st: Math.sin(tilt),
    S: Math.min(W, H) * 0.46 * (a.scale ?? 1.30), ox, oy, k: a.k ?? 1, t,
    contextOpacity: a.contextOpacity ?? 0.32, explode: 0,
  };
}

function nearestPatientVoxel(target = [0.48, -0.18, 0.36]) {
  if (!PATIENT) return -1;
  const key = target.join(",");
  if (PATIENT._selected.has(key)) return PATIENT._selected.get(key);
  let best = -1, bd = Infinity;
  for (let i = 0; i < PATIENT.nv; i++) {
    const j = i * 3, dx = PATIENT.V[j] - target[0], dy = PATIENT.V[j + 1] - target[1];
    const dz = PATIENT.V[j + 2] - target[2], d = dx * dx + dy * dy + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  PATIENT._selected.set(key, best);
  return best;
}

/** Draw the subject as literal low-resolution cubes, not as a square laid over a mesh. */
function drawVoxelBrain(g, W, H, t, a = {}) {
  if (!PATIENT) return null;
  const o = patientView(W, H, t, a);
  const V = PATIENT.V, h = PATIENT.voxelSize * Number(a.cubeScale ?? 0.44);
  const accent = cssVar("--accent", "#D97757"), hair = cssVar("--hair", "#33322E");
  const hi = cssVar("--hi", "#F9F9F7");
  const selected = nearestPatientVoxel(a.selected || [0.48, -0.18, 0.36]);
  const input = a.input ? nearestPatientVoxel(a.input) : -1;
  const cubeRows = [];
  for (let i = 0; i < PATIENT.nv; i++) {
    const j = i * 3, p = projectBrainPoint([V[j], V[j + 1], V[j + 2]], o);
    cubeRows.push([p.d, i]);
  }
  cubeRows.sort((p, q) => p[0] - q[0]);
  const verts = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
  const faces = [[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]];
  let selectedAnchor = null, inputAnchor = null;
  g.save();
  for (const [, i] of cubeRows) {
    const j = i * 3, base = [V[j], V[j + 1], V[j + 2]];
    const pts = verts.map(([x,y,z]) => projectBrainPoint(
      [base[0] + x * h, base[1] + y * h, base[2] + z * h], o));
    const special = i === selected || i === input;
    const tone = (PATIENT.voxSeg[i] * 0.61803398875) % 1;
    const rgb = rampAt(0.34 + tone * 0.58);
    const fill = special ? (i === input ? "#F0C85A" : accent)
      : `rgb(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0})`;
    const order = faces.map((f) => [f.reduce((s, n) => s + pts[n].d, 0) / 4, f])
      .sort((p, q) => p[0] - q[0]);
    for (let fi = 0; fi < order.length; fi++) {
      const f = order[fi][1];
      g.globalAlpha = special ? 0.93 : (0.31 + fi * 0.075) * Number(a.activity ?? 1);
      g.fillStyle = fill; g.strokeStyle = special ? hi : hair;
      g.lineWidth = special ? 1.05 * o.k : 0.45 * o.k;
      g.beginPath(); g.moveTo(pts[f[0]].x, pts[f[0]].y);
      for (let m = 1; m < 4; m++) g.lineTo(pts[f[m]].x, pts[f[m]].y);
      g.closePath(); g.fill(); g.stroke();
    }
    const anchor = projectBrainPoint(base, o);
    if (i === selected) selectedAnchor = anchor;
    if (i === input) inputAnchor = anchor;
  }
  g.restore();
  return { state: o, selected: selectedAnchor, input: inputAnchor };
}

function drawScannerGrid(g, o, t, k, alpha = 1, options = {}) {
  const grid = "#8FA6A8", scan = "#78C5C9";
  const line = (a, b, strong = false) => {
    const p = projectBrainPoint(a, o), q = projectBrainPoint(b, o);
    g.strokeStyle = strong ? (options.scanColor || scan) : grid;
    g.globalAlpha = alpha * (strong ? Number(options.scanLineAlpha ?? .44) : .16);
    g.lineWidth = (strong ? 1.05 : .55) * k;
    if(strong&&options.scanDash)g.setLineDash([5*k,4*k]);
    g.beginPath(); g.moveTo(p.x,p.y); g.lineTo(q.x,q.y); g.stroke();
    if(strong&&options.scanDash)g.setLineDash([]);
  };
  g.save();
  const xs = [-.94,-.70,-.46,-.22,.02,.26,.50,.74,.94];
  const ys = [-.88,-.66,-.44,-.22,0,.22,.44,.66,.88];
  const zs = [-.82,-.61,-.40,-.19,.02,.23,.44,.65,.82];
  // A stack of axial acquisition cells, plus vertical edge lines: unmistakably a 3-D
  // scanner sampling lattice while leaving the anatomical object continuous.
  zs.forEach((z) => {
    line([-.94,-.88,z],[.94,-.88,z]); line([.94,-.88,z],[.94,.88,z]);
    line([.94,.88,z],[-.94,.88,z]); line([-.94,.88,z],[-.94,-.88,z]);
  });
  xs.forEach((x) => { line([x,-.88,-.82],[x,-.88,.82]); line([x,.88,-.82],[x,.88,.82]); });
  ys.forEach((y) => { line([-.94,y,-.82],[-.94,y,.82]); line([.94,y,-.82],[.94,y,.82]); });
  // One brighter plane either follows a scene-owned acquisition cursor or sweeps slowly by
  // default, establishing which grid belongs to the scanner rather than the anatomy.
  const z = Number.isFinite(options.scanZ) ? Number(options.scanZ)
    : .78 - ((t * .070) % 1) * 1.56;
  const quad = [[-.94,-.88,z],[.94,-.88,z],[.94,.88,z],[-.94,.88,z]].map(p=>projectBrainPoint(p,o));
  g.fillStyle = options.scanColor || scan; g.globalAlpha = alpha * Number(options.scanFillAlpha ?? .035); g.beginPath();g.moveTo(quad[0].x,quad[0].y);
  for(let i=1;i<4;i++)g.lineTo(quad[i].x,quad[i].y);g.closePath();g.fill();
  xs.forEach((x)=>line([x,-.88,z],[x,.88,z],true));
  ys.forEach((y)=>line([-.94,y,z],[.94,y,z],true));
  g.restore();
}

/** A continuous wireframe brain inside the scanner's explicit voxel lattice. */
function drawScannerBrain(g, W, H, t, a = {}) {
  if (!BRAIN) return null;
  const o = patientView(W,H,t,a), k=a.k??1, activity=Number(a.activity??1);
  drawScannerGrid(g,o,a.gridStill?0:t,k,Number(a.gridAlpha??1),{
    scanZ:a.gridScanZ,scanColor:a.gridScanColor,scanFillAlpha:a.gridScanFillAlpha,
    scanLineAlpha:a.gridScanLineAlpha,scanDash:a.gridScanDash,
  });
  BIOLOGY.brain3d.draw(g,W,H,t,{render:"wire",scale:a.scale??1.30,center:a.center||[.5,.52],
    yaw:a.yaw??104,tilt:a.tilt??12,spin:a.spin??.030,dot:a.dot??1.22,label:false,
    still:!!a.still,activity,contextOpacity:a.contextOpacity??.40,k});
  const selected=a.selected===false?null:(a.selected||[.48,-.18,.36]),input=a.input||null;
  const cube=(target,color,alpha)=>{const pts=drawVoxelCube(g,(dx,dy,dz)=>projectBrainPoint(
      [target[0]+dx,target[1]+dy,target[2]+dz],o,"cortex"),Number(a.voxelSize??.050),color,k,alpha);
    return pts.reduce((s,p)=>({x:s.x+p.x/8,y:s.y+p.y/8}),{x:0,y:0});};
  const selectedAnchor=selected?cube(selected,cssVar("--accent","#D97757"),Number(a.voxelAlpha??1)):null;
  const inputAnchor=input?cube(input,"#F0C85A",Number(a.inputAlpha??1)):null;
  return {state:o,selected:selectedAnchor,input:inputAnchor};
}

// Deliberately separated in both hue and luminance: these colours have to remain legible when
// several real, interpenetrating cell surfaces are visible at once.
const H01_COLORS={excitatory:"#F1C75B",inhibitory:"#A989FF",other:"#F1C75B",vasculature:"#51C7DA",
  // BLOOD_VESSEL_CELL is an unresolved vessel-associated H01 segment, not a pericyte label.
  // Keeping it in the cyan vessel family avoids fabricating a cell class from that source tag.
  vascular:"#58BFD0",astrocytes:"#72CA8B",microglia_opc:"#E36EAE",oligodendrocytes:"#799DFF"};

/** Build a low-memory geodesic progress coordinate on a released vessel graph.
 * Each disconnected component starts at its deepest node, then a breadth-first wave follows
 * only real graph edges. H01 does not encode arterial/venous identity, so the direction is
 * explanatory; unlike a screen-space wipe, the packet cannot jump between unrelated tubes. */
function vesselGraphFlow(E,n,ne,depthAt) {
  const degree=new Uint32Array(n);for(let e=0;e<ne;e++){degree[E[e*2]]++;degree[E[e*2+1]]++;}
  const offsets=new Uint32Array(n+1);for(let i=0;i<n;i++)offsets[i+1]=offsets[i]+degree[i];
  const cursor=offsets.slice(),neighbors=new Uint32Array(offsets[n]);for(let e=0;e<ne;e++){
    const a=E[e*2],b=E[e*2+1];neighbors[cursor[a]++]=b;neighbors[cursor[b]++]=a;}
  const component=new Int32Array(n),distance=new Int32Array(n),queue=new Uint32Array(n),flow=new Float32Array(n);
  component.fill(-1);distance.fill(-1);let componentId=0,largestComponent=-1,largestSize=0;
  for(let seed=0;seed<n;seed++){if(component[seed]>=0)continue;let head=0,tail=0,source=seed,deepest=-Infinity;const members=[];
    queue[tail++]=seed;component[seed]=componentId;
    while(head<tail){const u=queue[head++],depth=Number(depthAt(u));members.push(u);if(depth>deepest){deepest=depth;source=u;}
      for(let p=offsets[u];p<offsets[u+1];p++){const v=neighbors[p];if(component[v]>=0)continue;component[v]=componentId;queue[tail++]=v;}}
    head=0;tail=0;queue[tail++]=source;distance[source]=0;let maxDistance=0;
    while(head<tail){const u=queue[head++],next=distance[u]+1;maxDistance=Math.max(maxDistance,distance[u]);
      for(let p=offsets[u];p<offsets[u+1];p++){const v=neighbors[p];if(component[v]!==componentId||distance[v]>=0)continue;
        distance[v]=next;queue[tail++]=v;}}
    const denom=Math.max(1,maxDistance);for(const u of members)flow[u]=distance[u]/denom;
    if(members.length>largestSize){largestSize=members.length;largestComponent=componentId;}componentId++;}
  // Released crops contain many boundary-truncated fragments. Launching a fresh packet in every
  // fragment makes the whole slab flash at once and looks like a screen-space wipe. Keep all
  // fragments in the anatomical layer, but animate only the largest genuinely connected graph.
  for(let i=0;i<n;i++)if(component[i]!==largestComponent)flow[i]=-1;
  return flow;
}

/**
 * Project the compact H01 volume with its true physical aspect: cortical depth runs
 * vertically, the tangential axis runs across the slab, and the 174 µm section thickness
 * remains visibly thin.  The fixed camera is intentional—the layer reveals are comparisons,
 * so the tissue must not rotate underneath the audience between clicks.
 */
function h01CortexView(W, H, k, slabXSpec=null, slabScaleSpec=null) {
  if (!H01_CORTEX) return null;
  const slabX=Number.isFinite(Number(slabXSpec))?Number(slabXSpec):.382,
    slabScale=Number.isFinite(Number(slabScaleSpec))?Number(slabScaleSpec):.70,
    key = `${H01_CORTEX.version||1}:${Math.round(W)}:${Math.round(H)}:${Math.round(k * 100)}:${Math.round(slabX*10000)}:${Math.round(slabScale*10000)}`;
  if (H01_CORTEX._view?.key === key) return H01_CORTEX._view;
  const slab=H01_CORTEX,q=Number(slab.q||32767),box=slab.box_um||[3351,2026.5,174];
  const lam=slab.laminar||{},dAxis=lam.depth_axis_xy||[-.70934,.70486],uAxis=lam.tangential_axis_xy||[-.70486,-.70934];
  const dBounds=lam.depth_bounds_um||[-2377,1428],uBounds=lam.tangential_bounds_um||[-3801,0];
  const dMid=(dBounds[0]+dBounds[1])*.5,uMid=(uBounds[0]+uBounds[1])*.5,zMid=Number(box[2])*.5;
  const dSpan=Math.max(1,dBounds[1]-dBounds[0]),scale=H*slabScale/dSpan,ox=W*slabX,oy=H*.50;
  const projectUm=(x,y,z)=>{const depth=x*dAxis[0]+y*dAxis[1],tangent=x*uAxis[0]+y*uAxis[1],zz=z-zMid;
    return {x:ox+(tangent-uMid)*scale*.63+zz*scale*.48,y:oy+(depth-dMid)*scale-zz*scale*.18,
      d:zz/Math.max(1,Number(box[2]))+(depth-dMid)/dSpan*.06};};
  const projectLaminar=(depth,tangent,z=zMid)=>({x:ox+(tangent-uMid)*scale*.63+(z-zMid)*scale*.48,
    y:oy+(depth-dMid)*scale-(z-zMid)*scale*.18,d:(z-zMid)/Math.max(1,Number(box[2]))});
  const projectOne=(x,y,z)=>{
    const px=(x/q*.5+.5)*Number(box[0]),py=(y/q*.5+.5)*Number(box[1]),pz=(z/q*.5+.5)*Number(box[2]);
    return projectUm(px,py,pz);
  };
  const project=(P,n)=>{const out=new Float32Array(n*3);
    for(let i=0;i<n;i++){const j=i*3,p=projectOne(P[j],P[j+1],P[j+2]);out[j]=p.x;out[j+1]=p.y;out[j+2]=p.d;}
    return out;};
  const projected={neurites:project(slab.neurites.P,slab.neurites.n),
    vesselNodes:project(slab.vessels.P,slab.vessels.n),
    vesselSurface:project(slab.vessels.S,slab.vessels.surface_n),cells:{}};
  Object.entries(slab.cells).forEach(([name,cell])=>{projected.cells[name]=project(cell.P,cell.n);});
  const canvas=()=>{const c=document.createElement("canvas");c.width=Math.ceil(W);c.height=Math.ceil(H);return c;};
  const drawDots=(ctx,P,n,color,size,opacity,round=false,stride=1)=>{ctx.save();ctx.fillStyle=color;ctx.globalCompositeOperation="source-over";
    for(let i=0;i<n;i+=stride){const j=i*3,near=clamp01(.50+P[j+2]*.72),r=size*(.82+.28*near)*k;
      ctx.globalAlpha=opacity*(.48+.44*near)*(i%29===0?1:.78);
      if(round){ctx.beginPath();ctx.arc(P[j],P[j+1],r,0,TAU);ctx.fill();}
      else ctx.fillRect(P[j]-r*.5,P[j+1]-r*.5,r,r);}
    ctx.restore();};
  const guides=canvas();{const c=guides.getContext("2d");c.save();c.strokeStyle="#9B887A";c.fillStyle="#C0A58E";c.lineWidth=.55*k;
    c.setLineDash([2*k,5*k]);for(const boundary of lam.boundaries||[]){const samples=boundary.samples_um||[];if(!samples.length)continue;
      c.globalAlpha=.15;c.beginPath();samples.forEach(([u,d],i)=>{const p=projectLaminar(d,u);if(i)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y);});c.stroke();
      c.setLineDash([]);samples.forEach(([u,d],i)=>{if(i%2)return;const p=projectLaminar(d,u);c.globalAlpha=.42;c.beginPath();c.arc(p.x,p.y,.62*k,0,TAU);c.fill();});
      c.setLineDash([2*k,5*k]);}c.restore();}
  const layers={};
  layers.neurons=canvas();{const c=layers.neurons.getContext("2d");
    drawDots(c,projected.neurites,slab.neurites.n,H01_COLORS.other,.34,.13,false,2);
    drawDots(c,projected.cells.excitatory,slab.cells.excitatory.n,H01_COLORS.excitatory,.62,.62,true);
    drawDots(c,projected.cells.inhibitory,slab.cells.inhibitory.n,H01_COLORS.inhibitory,.69,.72,true);}
  layers.vessels=canvas();{const c=layers.vessels.getContext("2d"),P=projected.vesselNodes,E=slab.vessels.E,R=slab.vessels.R;
    c.save();c.lineCap="round";c.lineJoin="round";c.globalCompositeOperation="source-over";
    for(let bucket=0;bucket<3;bucket++){c.beginPath();
      for(let e=0;e<slab.vessels.ne;e++){const weight=R[e],b=weight>122?2:weight>72?1:0;if(b!==bucket)continue;
        const a0=E[e*2]*3,b0=E[e*2+1]*3;c.moveTo(P[a0],P[a0+1]);c.lineTo(P[b0],P[b0+1]);}
      c.strokeStyle=H01_COLORS.vasculature;c.globalAlpha=[.28,.40,.58][bucket];c.lineWidth=[.34,.52,.78][bucket]*k;c.stroke();}
    c.restore();drawDots(c,projected.vesselSurface,slab.vessels.surface_n,H01_COLORS.vasculature,.30,.12,false,2);}
  const cellLayer=(names)=>{const c=canvas(),x=c.getContext("2d");for(const name of names){const cell=slab.cells[name];
    const size={vascular:.82,astrocytes:.72,microglia_opc:.68,oligodendrocytes:.48,other:.42}[name]||.58;
    const opacity={vascular:.72,astrocytes:.60,microglia_opc:.60,oligodendrocytes:.28,other:.20}[name]||.50;
    drawDots(x,projected.cells[name],cell.n,H01_COLORS[name]||cell.colour,size,opacity,true);}return c;};
  layers.vascular=cellLayer(["vascular"]);layers.astrocytes=cellLayer(["astrocytes"]);
  layers.microglia=cellLayer(["microglia_opc"]);layers.oligodendrocytes=cellLayer(["oligodendrocytes","other"]);
  const corners=[];for(const x of [-q,q])for(const y of [-q,q])for(const z of [-q,q])corners.push(projectOne(x,y,z));
  const bounds=corners.reduce((b,p)=>({minX:Math.min(b.minX,p.x),maxX:Math.max(b.maxX,p.x),minY:Math.min(b.minY,p.y),maxY:Math.max(b.maxY,p.y)}),
    {minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});
  const layerY=(lam.layer_centres_um||[]).map(d=>projectLaminar(d,uMid).y),
    vesselFlowU=vesselGraphFlow(slab.vessels.E,slab.vessels.n,slab.vessels.ne,i=>projected.vesselNodes[i*3+1]);
  H01_CORTEX._view={key,projected,layers,guides,corners,bounds,projectOne,projectUm,projectLaminar,
    dAxis,uAxis,dBounds,uBounds,dMid,uMid,zMid,layerY,scale,ox,oy,k,vesselFlowU};return H01_CORTEX._view;
}

function h01LayerVisibility(step,enter) {
  const show={neurons:0,vessels:0,vascular:0,astrocytes:0,microglia:0,oligodendrocytes:0};
  // State 5 is a whole-slab inventory without a microdomain inset. On state 6 the inventory
  // peels back to neurons while the true surface inset appears; every later click then adds
  // exactly one requested layer with no one-click delay.
  if(step===5)for(const key of ["neurons","vessels","microglia","oligodendrocytes","astrocytes"])show[key]=enter;
  else if(step===6){show.neurons=1;for(const key of ["vessels","microglia","oligodendrocytes","astrocytes"])show[key]=1-enter;}
  else if(step>=7){show.neurons=1;show.vessels=step===7?enter:1;
    if(step>=9)show.microglia=step===9?enter:1;
    if(step>=10)show.oligodendrocytes=step===10?enter:1;
    if(step>=11)show.astrocytes=step===11?enter:1;}
  return show;
}

function h01MicrodomainView(W,H,view,k,boxSpec=null) {
  const md=H01_CORTEX?.microdomain,morph=md?.surface_morphologies;if(!md)return null;
  const normalizedBox=Array.isArray(boxSpec)&&boxSpec.length>=4?boxSpec:[.610,.090,.230,.500],
    boxKey=normalizedBox.map(v=>Number(v).toFixed(3)).join(":"),
    key=`${H01_CORTEX.version||1}:${Math.round(W)}:${Math.round(H)}:${Math.round(k*100)}:${boxKey}`;
  if(H01_CORTEX._microView?.key===key)return H01_CORTEX._microView;
  const box={x:W*Number(normalizedBox[0]),y:H*Number(normalizedBox[1]),w:W*Number(normalizedBox[2]),h:H*Number(normalizedBox[3])},
    pad=7*k,q=Number(H01_CORTEX.q||32767),b=H01_CORTEX.box_um;
  const fromPacked=(P,j)=>[(P[j]/q*.5+.5)*b[0],(P[j+1]/q*.5+.5)*b[1],(P[j+2]/q*.5+.5)*b[2]];
  const sourceBounds=morph?.bounds_um||md.bounds_um,toAxes=([x,y,z])=>({u:x*view.uAxis[0]+y*view.uAxis[1],
    d:x*view.dAxis[0]+y*view.dAxis[1],z});
  let u0=Infinity,u1=-Infinity,d0=Infinity,d1=-Infinity,z0=Infinity,z1=-Infinity;
  const include=(p)=>{u0=Math.min(u0,p.u);u1=Math.max(u1,p.u);d0=Math.min(d0,p.d);d1=Math.max(d1,p.d);z0=Math.min(z0,p.z);z1=Math.max(z1,p.z);};
  for(const mesh of morph?.meshes||[])for(let i=0;i<mesh.nv;i++)include(toAxes(fromPacked(mesh.V,i*3)));
  if(!Number.isFinite(u0))for(const x of [sourceBounds[0][0],sourceBounds[1][0]])for(const y of [sourceBounds[0][1],sourceBounds[1][1]])
    for(const z of [sourceBounds[0][2],sourceBounds[1][2]])include(toAxes([x,y,z]));
  const uc=(u0+u1)*.5,dc=(d0+d1)*.5,zc=(z0+z1)*.5;let radius=1;
  for(const mesh of morph?.meshes||[])for(let i=0;i<mesh.nv;i++){const p=toAxes(fromPacked(mesh.V,i*3));radius=Math.max(radius,Math.hypot(p.u-uc,p.z-zc));}
  // Rotation is around cortical depth.  The radial extent in the tangential/section plane is
  // invariant, so one fixed scale keeps the microdomain from breathing as it turns.
  const s=Math.min((box.w-2*pad)/(radius*2+6),(box.h-2*pad)/Math.max(1,d1-d0+6));
  const localArray=(P,n)=>{const out=new Float32Array(n*3);for(let i=0;i<n;i++){const p=toAxes(fromPacked(P,i*3)),j=i*3;
    out[j]=p.u-uc;out[j+1]=p.d-dc;out[j+2]=p.z-zc;}return out;};
  const meshes=(morph?.meshes||[]).map(mesh=>({...mesh,L:localArray(mesh.V,mesh.nv),sx:new Float32Array(mesh.nv),
    sy:new Float32Array(mesh.nv),sd:new Float32Array(mesh.nv)}));
  const cells={};Object.entries(md.cells).forEach(([name,cell])=>{cells[name]={...cell,L:localArray(cell.P,cell.n)};});
  const vesselL=localArray(md.vessels.P,md.vessels.n),vessel={L:vesselL,n:md.vessels.n,E:md.vessels.E,ne:md.vessels.ne,
    sx:new Float32Array(md.vessels.n),sy:new Float32Array(md.vessels.n),sd:new Float32Array(md.vessels.n)};
  vessel.flowU=vesselGraphFlow(vessel.E,vessel.n,vessel.ne,i=>vesselL[i*3+1]);
  H01_CORTEX._microView={key,box,s,radius,meshes,cells,vessel,uc,dc,zc};return H01_CORTEX._microView;
}

function h01TurntableStage(step) {
  // Keep the fully built astrocyte state through the exchange beat.  Swapping to the separately
  // graded `all` asset at the moment the bolus appeared preserved angle but changed luminance;
  // reusing the exact same live stream makes the transition genuinely continuous.
  return ({6:"neurons",7:"vessel",8:"vessel",9:"mg",10:"oligo",11:"astro",12:"astro",13:"astro"})[step] || "all";
}

function h01TurntablePath(box) {
  // Screen-space trace of the continuous cyan trunk in the approved fixed-camera render.
  // The fan is intentionally only 42 degrees, so this remains registered throughout the
  // precomputed turntable without asking the browser to rebuild the vessel mesh.
  return [
    [.430,.980],[.480,.880],[.550,.785],[.595,.685],[.620,.575],
    [.632,.455],[.640,.330],[.642,.210],[.632,.080],
  ].map(([x,y])=>[box.x+x*box.w,box.y+y*box.h]);
}

function pointOnPolyline(points,u) {
  u=clamp01(u);const lengths=[],total=points.slice(1).reduce((sum,p,i)=>{
    const q=points[i],length=Math.hypot(p[0]-q[0],p[1]-q[1]);lengths.push(length);return sum+length;},0);
  let target=u*total;
  for(let i=0;i<lengths.length;i++){if(target<=lengths[i]){const q=points[i],p=points[i+1],f=target/Math.max(1e-6,lengths[i]);return[mix(q[0],p[0],f),mix(q[1],p[1],f)];}target-=lengths[i];}
  return points.at(-1);
}

let H01_PULSE_FRAME=null;
/** Paint contrast only where the current pre-rendered frame contains the cyan vessel surface.
 * This bounded half-resolution mask follows every 360-degree view without rebuilding meshes
 * in the browser, and—critically—cannot draw a free-floating line over neurons or glia. */
function drawH01LumenPulse(g,video,box,age,k,a={}){
  if(!video||video.readyState<2||!Number.isFinite(age)||age<0)return;
  const vw=video.videoWidth||720,vh=video.videoHeight||436,w=Math.max(1,Math.round(Math.min(360,vw))),h=Math.max(1,Math.round(w*vh/vw));
  if(!H01_PULSE_FRAME||H01_PULSE_FRAME.w!==w||H01_PULSE_FRAME.h!==h){const source=document.createElement("canvas"),overlay=document.createElement("canvas");
    source.width=overlay.width=w;source.height=overlay.height=h;H01_PULSE_FRAME={w,h,source,overlay,
      sg:source.getContext("2d",{willReadFrequently:true}),og:overlay.getContext("2d")};}
  const frame=H01_PULSE_FRAME;frame.sg.drawImage(video,0,0,w,h);const src=frame.sg.getImageData(0,0,w,h).data,out=frame.og.createImageData(w,h),dst=out.data,
    color=String(a.color||"#B89CFF").replace("#",""),rr=parseInt(color.slice(0,2),16)||184,rg=parseInt(color.slice(2,4),16)||156,rb=parseInt(color.slice(4,6),16)||255,
    alpha=Number(a.alpha??1),duration=Math.max(.1,Number(a.duration??3.10)),phase=clamp01(age/duration),cycle=!!a.cycle,washed=!!a.wash;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const j=(y*w+x)*4,r=src[j],gg=src[j+1],b=src[j+2];
    // Cyan detection deliberately excludes purple oligodendrocytes and green astrocytes.
    if(gg<42||b<52||gg<r*1.24||b<r*1.34||Math.abs(b-gg)>92)continue;
    const vesselness=clamp01(Math.min((gg-r)/72,(b-r)/82,(gg+b)/250)),u=1-y/Math.max(1,h-1);let level=0;
    if(cycle){const front=-.08+smooth(phase/.46)*1.18,washFront=smooth((phase-.61)/.31)*1.22,
        inflowGate=1-smooth((phase-.43)/.10),outflowGate=smooth((phase-.58)/.12),
        head=Math.exp(-.5*((u-front)/.078)**2),delivered=smooth((front-u+.055)/.17)*Math.exp(-Math.max(0,phase-.34)*1.22),
        remaining=1-smooth((washFront-u+.035)/.145),drainHead=Math.exp(-.5*((u-washFront)/.060)**2)*outflowGate;
      level=clamp01(head*inflowGate+.20*delivered*remaining*outflowGate+.94*drainHead);
    }else{const front=washed?1-smooth(age/.72):smooth(age/1.12),direction=washed?-1:1,d=(front-u)*direction;
      level=d>=0?Math.exp(-.5*(d/.082)**2):0;}
    if(level<.012)continue;dst[j]=rr;dst[j+1]=rg;dst[j+2]=rb;dst[j+3]=Math.round(255*alpha*vesselness*(.22+.76*level));}
  frame.og.putImageData(out,0,0);g.save();g.beginPath();g.rect(box.x,box.y,box.w,box.h);g.clip();
  // Source-over preserves the tracer hue on cyan lumen pixels. Screen blending bleached the
  // same mask toward white, which was geometrically correct but almost invisible in QA.
  // No glow is used here: every altered pixel still belongs to the decoded vessel surface.
  g.globalCompositeOperation="source-over";g.globalAlpha=.94;g.drawImage(frame.overlay,box.x,box.y,box.w,box.h);g.restore();
  return {frame,src,w,h};
}

function h01VesselMaskWeight(mask,x,y){
  if(!mask||x<0||y<0||x>=mask.w||y>=mask.h)return 0;
  const j=(Math.floor(y)*mask.w+Math.floor(x))*4,r=mask.src[j],gg=mask.src[j+1],b=mask.src[j+2];
  if(mask.src[j+3]<12||gg<42||b<52||gg<r*1.24||b<r*1.34||Math.abs(b-gg)>92)return 0;
  return clamp01(Math.min((gg-r)/72,(b-r)/82,(gg+b)/250));
}

function h01VesselEndpoint(mask,box,top){
  // Locate the inlet/outlet on the decoded vessel itself.  A soft corridor around the
  // approved trunk prevents a peripheral branch from stealing either endpoint as the
  // synchronized turntable rotates.
  if(!mask)return null;const y0=top?Math.floor(mask.h*.035):Math.floor(mask.h*.70),
    y1=top?Math.floor(mask.h*.31):Math.floor(mask.h*.985);let sx=0,sy=0,sw=0;
  for(let y=y0;y<y1;y+=2){const yn=y/Math.max(1,mask.h-1),u=1-yn,
      expected=(.430+.210*smooth(u))*mask.w,corridor=mask.w*(top?.145:.165),
      extreme=top?clamp01((.32-yn)/.285):clamp01((yn-.69)/.30);
    for(let x=Math.max(0,Math.floor(expected-corridor));x<Math.min(mask.w,Math.ceil(expected+corridor));x+=2){
      const vessel=h01VesselMaskWeight(mask,x,y);if(vessel<=0)continue;
      const centred=1-clamp01(Math.abs(x-expected)/corridor),weight=vessel*(.18+.82*extreme)*(.30+.70*centred);
      sx+=x*weight;sy+=y*weight;sw+=weight;
    }
  }
  if(sw<1)return top?{x:box.x+box.w*.632,y:box.y+box.h*.080,angle:-Math.PI*.47,width:32}:{x:box.x+box.w*.430,y:box.y+box.h*.965,angle:-Math.PI*.41,width:32};
  const sourceY=sy/sw,expectedAt=yn=>.430*mask.w+.210*mask.w*smooth(1-yn),
    rowAt=yy=>{let rx=0,rw=0,minX=Infinity,maxX=-Infinity;const expected=expectedAt(yy/Math.max(1,mask.h-1)),corridor=mask.w*.16;
      for(let dy=-3;dy<=3;dy++)for(let x=Math.max(0,Math.floor(expected-corridor));x<Math.min(mask.w,Math.ceil(expected+corridor));x++){
        const weight=h01VesselMaskWeight(mask,x,Math.round(yy+dy));if(weight<=0)continue;rx+=x*weight;rw+=weight;minX=Math.min(minX,x);maxX=Math.max(maxX,x);}
      return rw>0?{x:rx/rw,y:yy,width:Math.max(1,maxX-minX)}:null;},
    centre=rowAt(sourceY)||{x:sx/sw,y:sourceY,width:mask.w*.055},before=rowAt(sourceY-9),after=rowAt(sourceY+9),
    xScale=box.w/mask.w,yScale=box.h/mask.h,dx=((after?.x??centre.x)-(before?.x??centre.x))*xScale,
    dy=((after?.y??centre.y)-(before?.y??centre.y))*yScale,
    angle=Math.atan2(dy,dx),width=Math.max(18,Math.min(58,centre.width*xScale));
  return {x:box.x+(centre.x+.5)*xScale,y:box.y+(centre.y+.5)*yScale,angle,width};
}

function drawH01OxygenEgress(g,mask,box,phase,k,alphaScale=1){
  if(!mask)return;const sx=box.w/mask.w,sy=box.h/mask.h,maxDistance=Math.min(box.w,box.h)*.095;
  g.save();g.beginPath();g.rect(box.x,box.y,box.w,box.h);g.clip();g.globalCompositeOperation="screen";
  let drawn=0;
  for(let y=Math.floor(mask.h*.14);y<mask.h*.88&&drawn<34;y+=3){
    for(let x=Math.floor(mask.w*.12);x<mask.w*.90&&drawn<34;x+=3){
      const vessel=h01VesselMaskWeight(mask,x,y);if(vessel<.20||hash01(x,y,41)>.11)continue;
      const gx=h01VesselMaskWeight(mask,x-4,y)-h01VesselMaskWeight(mask,x+4,y),
        gy=h01VesselMaskWeight(mask,x,y-4)-h01VesselMaskWeight(mask,x,y+4),length=Math.hypot(gx,gy);
      if(length<.24)continue;const nx=gx/length,ny=gy/length,life=(phase*2.15+hash01(x,y,73))%1,
        distance=maxDistance*(.06+.94*smooth(life)),px=box.x+(x+.5)*sx+nx*distance,
        py=box.y+(y+.5)*sy+ny*distance,alpha=alphaScale*(1-smooth(life))*(.42+.54*vessel),
        r=(1.50+1.10*(1-life))*k,tangentX=-ny*1.85*k,tangentY=nx*1.85*k;
      // A paired disc is a readable O2 molecule; its path begins on the decoded vessel wall
      // and follows the local outward mask normal.  The physical blue movie underneath carries
      // the continuous concentration field, while these sparse molecules explain its direction.
      g.strokeStyle="#75C7FF";g.globalAlpha=alpha*.62;g.lineWidth=.72*k;g.beginPath();
      g.moveTo(px-tangentX,py-tangentY);g.lineTo(px+tangentX,py+tangentY);g.stroke();
      g.fillStyle="#75C7FF";g.globalAlpha=alpha;g.beginPath();g.arc(px-tangentX,py-tangentY,r,0,TAU);g.arc(px+tangentX,py+tangentY,r,0,TAU);g.fill();drawn++;
    }
  }
  g.restore();
}

function drawH01OxygenEndpointVoxels(g,mask,box,k,phase){
  if(!mask)return;const inlet=h01VesselEndpoint(mask,box,false),outlet=h01VesselEndpoint(mask,box,true);
  const draw=(p,color,label,align)=>{if(!p)return;const size=Math.max(6.4*k,Math.min(10.2*k,p.width*.19)),
      tx=Math.cos(p.angle),ty=Math.sin(p.angle),nx=-ty,ny=tx,
      // One face follows the local centreline and the other spans the local calibre.
      project=(dx,dy,dz)=>({x:p.x+nx*dx+tx*dy+(nx*.42-tx*.20)*dz,y:p.y+ny*dx+ty*dy+(ny*.42-ty*.20)*dz,d:dz});
    drawVoxelCube(g,project,size,color,k,.92);g.save();g.textBaseline="middle";g.textAlign=align;g.font=fontOf(Math.max(k,.90),10.2);
    g.fillStyle=color;g.globalAlpha=.80+.18*Math.sin(phase*TAU+(label.includes("out")?Math.PI:0));g.shadowColor="rgba(0,0,0,.98)";g.shadowBlur=6*k;
    const offset=size*1.85;g.fillText(label,p.x+(align==="left"?offset:-offset),p.y);g.restore();};
  draw(inlet,"#F0C85A","O₂ in","right");draw(outlet,"#63A8FF","O₂ out","left");
}

/** Crossfade to the standalone vessel transport simulation.
 *
 * The offline pass uses the exact released H01 vessel surfaces, transform, camera, 72 angles,
 * and 3-second loop.  It deliberately owns its black background: this validation state isolates
 * the vessel, intravascular bolus, and wall-centred radial diffusion before cells are reintroduced.
 * All turntable media share one clock, so the crossfade never seeks or restarts the specimen. */
function drawH01PrecomputedExchange(g,box,a={}){
  if(!a.enabled)return;const video=H01_TURNTABLES?.exchange,
    cellVideo=H01_TURNTABLES?.["exchange-cells"];
  if(!video||video.readyState<2||video.seeking)return;
  const alpha=clamp01(Number(a.alpha??1));if(alpha<=.001)return;
  g.save();g.beginPath();g.rect(box.x,box.y,box.w,box.h);g.clip();
  g.globalCompositeOperation="source-over";g.globalAlpha=alpha;
  g.drawImage(video,box.x,box.y,box.w,box.h);
  const cellAlpha=clamp01(Number(a.cellAlpha??0));
  if(cellAlpha>.001&&cellVideo?.readyState>=2&&!cellVideo.seeking){
    // The cell-bearing pass has the same 72 camera angles and transport clock.  Crossfading
    // it over the vessel-only validation retains the exact frame while restoring context.
    g.globalAlpha=alpha*cellAlpha;g.drawImage(cellVideo,box.x,box.y,box.w,box.h);
  }
  g.restore();
}

/** Draw the Study III microdomain from synchronized, precomputed H01 turntables.
 *
 * The full-cell, vessel-only, diffusion, and diffusion-plus-cell movies share the exact
 * camera path and frame count. A reveal therefore crossfades registered frames instead of
 * rebuilding or re-solving the geometry in the browser. The diffusion movie is an
 * explanatory reaction-diffusion model on the released vessel surface. It is not measured
 * oxygen, and the released H01 vessel has no arterial/venous identity.
 */
function drawH01OxygenTurntableStack(g,W,H,micro,k,layers,a={}){
  if(!micro?.box)return null;const box=micro.box,prepared=[];
  for(const [stage,rawAlpha] of layers){const alpha=clamp01(Number(rawAlpha)||0);if(alpha<=.001)continue;
    const source=activateH01Turntable(stage,"oxygen");if(!source||source.readyState<2||source.seeking)continue;
    const sw=source.videoWidth||source.width||720,sh=source.videoHeight||source.height||436,
      scale=Math.min(box.w/sw,box.h/sh),dw=sw*scale,dh=sh*scale,x=box.x+(box.w-dw)*.5,y=box.y+(box.h-dh)*.5;
    prepared.push({stage,source,alpha,contentBox:{x,y,w:dw,h:dh}});
  }
  if(!prepared.length)return null;
  g.save();g.fillStyle="#000";g.fillRect(box.x,box.y,box.w,box.h);g.beginPath();g.rect(box.x,box.y,box.w,box.h);g.clip();
  for(const row of prepared){g.globalCompositeOperation="source-over";g.globalAlpha=row.alpha;g.drawImage(row.source,row.contentBox.x,row.contentBox.y,row.contentBox.w,row.contentBox.h);}
  g.restore();
  const dominant=prepared.reduce((best,row)=>row.alpha>=best.alpha?row:best,prepared[0]),accent=String(a.color||"#F9F9F7");
  g.save();g.strokeStyle="#778082";g.globalAlpha=.54;g.lineWidth=.72*k;g.strokeRect(box.x,box.y,box.w,box.h);
  g.fillStyle="rgba(0,0,0,.76)";g.fillRect(box.x+6*k,box.y+5*k,Math.min(box.w-12*k,315*k),20*k);
  g.fillStyle=accent;g.beginPath();g.arc(box.x+13*k,box.y+15*k,2.5*k,0,TAU);g.fill();
  g.fillStyle=cssVar("--hi","#F9F9F7");g.globalAlpha=.94;g.textAlign="left";g.textBaseline="middle";g.font=fontOf(Math.max(k,.88),9.5);
  g.fillText(String(a.title||"H01 Layer-IV microdomain"),box.x+21*k,box.y+15*k);
  const bar=Math.min(76*k,box.w*.18),by=box.y+box.h-11*k;g.strokeStyle="#F9F9F7";g.globalAlpha=.90;g.lineWidth=1.7*k;
  g.beginPath();g.moveTo(box.x+box.w-10*k-bar,by);g.lineTo(box.x+box.w-10*k,by);g.stroke();g.font=fontOf(Math.max(k,.82),8.1);g.textAlign="right";
  g.fillText("20 μm",box.x+box.w-10*k,by-8*k);g.restore();
  return{box,contentBox:dominant.contentBox,video:dominant.source,stage:dominant.stage};
}

function drawH01SinkWeights(g,W,H,k,alpha=1){
  // These labels identify only the returning anatomical surfaces.  The oxygen PDE uses one
  // spatially uniform tissue-demand term; H01 cannot provide cell-resolved uptake weights.
  if(alpha<=.001)return;const y=H*.785,items=[
    ["neuronal surface","#D9C17E"],["astrocyte surface","#78BA8D"],["other glial surfaces","#8EBCD0"],
  ];
  g.save();g.shadowColor="rgba(0,0,0,.95)";g.shadowBlur=5*k;g.textAlign="left";g.textBaseline="middle";g.font=fontOf(Math.max(k,.80),8.0);
  items.forEach(([label,color],i)=>{const x=W*(.22+i*.205);g.fillStyle=color;g.globalAlpha=.94*alpha;g.beginPath();g.arc(x,y,3.0*k,0,TAU);g.fill();g.fillStyle=cssVar("--hi","#F9F9F7");g.globalAlpha=.78*alpha;g.fillText(label,x+9*k,y);});
  g.textAlign="center";g.textBaseline="top";g.fillStyle=cssVar("--lo","#6E6C64");g.globalAlpha=.76*alpha;
  g.fillText("anatomical context · modeled tissue demand is spatially uniform",W*.43,y+12*k);g.restore();
}

/** A smooth screen projection of the precomputed oxygen story, registered to the current
 * 360-degree H01 frame.  The vessel mask comes from the actual cyan surface, so delivery and
 * its diffusion halo turn with the tissue and never become detached XYZ panels. */
function drawH01VideoOxygenField(g,video,box,step,t,k,a={}){
  if(!video||video.readyState<2||step<2)return;const vw=video.videoWidth||720,vh=video.videoHeight||436,
    w=Math.max(1,Math.round(Math.min(360,vw))),h=Math.max(1,Math.round(w*vh/vw)),
    fieldAlpha=clamp01(Number(a.fieldAlpha??1)),fieldProgress=clamp01(Number(a.fieldProgress??fieldAlpha)),
    uptakeAlpha=clamp01(Number(a.uptakeAlpha??fieldAlpha)),phase=clamp01(Number(a.phase??0));
  if(!H01_PULSE_FRAME||H01_PULSE_FRAME.w!==w||H01_PULSE_FRAME.h!==h)return;const frame=H01_PULSE_FRAME;
  if(!frame.mask){frame.mask=document.createElement("canvas");frame.flow=document.createElement("canvas");frame.near=document.createElement("canvas");frame.uptake=document.createElement("canvas");
    for(const c of [frame.mask,frame.flow,frame.near,frame.uptake]){c.width=w;c.height=h;}frame.mg=frame.mask.getContext("2d");frame.fg=frame.flow.getContext("2d");frame.ng=frame.near.getContext("2d");frame.ug=frame.uptake.getContext("2d");}
  frame.sg.drawImage(video,0,0,w,h);const src=frame.sg.getImageData(0,0,w,h).data,mask=frame.mg.createImageData(w,h),md=mask.data,
    flow=frame.fg.createImageData(w,h),fd=flow.data,front=-.10+smooth(phase/.55)*1.22,
    washFront=smooth((phase-.70)/.24)*1.16,deliveryGate=1-smooth((phase-.69)/.16);
  for(let j=0;j<src.length;j+=4){const r=src[j],gg=src[j+1],b=src[j+2];if(gg<42||b<52||gg<r*1.24||b<r*1.34||Math.abs(b-gg)>92)continue;
    const vesselness=clamp01(Math.min((gg-r)/72,(b-r)/82,(gg+b)/250)),y=((j/4/w)|0),u=1-y/Math.max(1,h-1),
      head=Math.exp(-.5*((u-front)/.072)**2)*deliveryGate,reached=smooth((front-u+.045)/.15),remaining=1-smooth((washFront-u+.025)/.16),
      level=clamp01(.94*head+.42*reached*remaining);md[j]=md[j+1]=md[j+2]=255;md[j+3]=Math.round(255*vesselness);
    fd[j]=fd[j+1]=fd[j+2]=255;fd[j+3]=Math.round(255*vesselness*level);}
  frame.mg.putImageData(mask,0,0);frame.fg.putImageData(flow,0,0);const tint=(color,blur,alpha)=>{frame.og.clearRect(0,0,w,h);frame.og.globalCompositeOperation="source-over";frame.og.drawImage(frame.flow,0,0);
    frame.og.globalCompositeOperation="source-in";frame.og.fillStyle=color;frame.og.fillRect(0,0,w,h);frame.og.globalCompositeOperation="source-over";
    g.filter=`blur(${blur*k}px)`;g.globalAlpha=alpha;g.drawImage(frame.overlay,box.x,box.y,box.w,box.h);};
  g.save();g.beginPath();g.rect(box.x,box.y,box.w,box.h);g.clip();g.globalCompositeOperation="screen";
  // Nested smooth bands communicate the modeled fall-off without voxelated cubes.  Their
  // length scale is calibrated to the 20-µm panel bar and remains explicitly normalized.
  // The field expands over almost three seconds instead of appearing everywhere at once.
  // The innermost gold band arrives first; the broader teal/blue bands then spread outward.
  // These bands need to survive projection at auditorium distance.  Keep the broad outer
  // field cool and translucent, but make each newly reached radius visibly distinct from
  // the cyan lumen instead of hiding the diffusion story in a barely perceptible glow.
  tint("#244B78",mix(4,31,fieldProgress),.78*fieldAlpha*smooth((fieldProgress-.16)/.84));
  tint("#5DAEA4",mix(2,16,fieldProgress),.72*fieldAlpha*smooth((fieldProgress-.05)/.76));
  tint("#F0C85A",mix(.8,4.2,fieldProgress),.46*fieldAlpha);
  if(step>=3){frame.ng.clearRect(0,0,w,h);frame.ng.filter="blur(14px)";frame.ng.drawImage(frame.flow,0,0);frame.ng.filter="none";
    const near=frame.ng.getImageData(0,0,w,h).data,uptake=frame.ug.createImageData(w,h),ud=uptake.data,pulse=.72+.28*Math.sin(t*TAU*.48);
    for(let j=0;j<src.length;j+=4){const r=src[j],gg=src[j+1],b=src[j+2],nearness=near[j+3]/255,
        // Robustly select the gold neuronal material after VP9 compression, while excluding
        // cyan vessels, green astrocytes and violet inhibitory/oligodendrocyte surfaces.
        neuron=r>78&&gg>62&&r>b*1.15&&gg>b*1.02&&r>gg*.88&&r<gg*1.65;if(!neuron||nearness<.012)continue;
      ud[j]=217;ud[j+1]=119;ud[j+2]=87;ud[j+3]=Math.round(255*clamp01(nearness*4.2)*pulse*.88);}
    frame.ug.putImageData(uptake,0,0);
    // Uptake is an orange surface-local mark, not another additive light halo.  Returning to
    // source-over here prevents yellow neurons from bleaching to white under screen blending.
    g.globalCompositeOperation="source-over";g.filter=`blur(${1.25*k}px)`;g.globalAlpha=.98*uptakeAlpha;g.drawImage(frame.uptake,box.x,box.y,box.w,box.h);
    g.filter="none";g.globalAlpha=.68*uptakeAlpha;g.drawImage(frame.uptake,box.x,box.y,box.w,box.h);}
  g.filter="none";g.globalCompositeOperation="source-over";g.restore();
}

function drawH01TurntablePulse(g,box,age,k,a={}) {
  if(!Number.isFinite(age)||age<0)return;const color=a.color||"#B89CFF",points=h01TurntablePath(box),alpha=Number(a.alpha??1);
  if(a.cycle){
    // One registered clock carries the bolus from inlet to outlet. The colour remains on the
    // lumen; the only surrounding cue is a tiny, explicitly conceptual exchange bloom.
    const duration=Math.max(.1,Number(a.duration??3.10)),phase=clamp01(age/duration),
      front=-.08+smooth(phase/.46)*1.18,washFront=smooth((phase-.61)/.31)*1.22,
      exchange=smooth((phase-.27)/.16)*(1-smooth((phase-.64)/.15)),
      inflowGate=1-smooth((phase-.43)/.10),outflowGate=smooth((phase-.58)/.12),segments=112;
    g.save();g.lineCap="round";g.lineJoin="round";g.strokeStyle="#67C1D0";g.globalAlpha=.30*alpha;g.lineWidth=2.15*k;
    g.beginPath();g.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)g.lineTo(points[i][0],points[i][1]);g.stroke();
    for(let i=0;i<segments;i++){const u0=i/segments,u1=(i+1)/segments,u=(u0+u1)*.5,
        head=Math.exp(-.5*((u-front)/.078)**2),delivered=smooth((front-u+.055)/.17)*Math.exp(-Math.max(0,phase-.34)*1.22),
        remaining=1-smooth((washFront-u+.035)/.145),drainHead=Math.exp(-.5*((u-washFront)/.060)**2)*outflowGate,
        level=clamp01(head*inflowGate+.28*delivered*exchange+.16*delivered*remaining*outflowGate+.94*drainHead);
      if(level<.014)continue;const p=pointOnPolyline(points,u0),q=pointOnPolyline(points,u1);
      g.strokeStyle=color;g.shadowColor=color;g.shadowBlur=(2+4.5*level)*k;g.globalAlpha=alpha*(.20+.72*level);g.lineWidth=(2.2+3.5*level)*k;
      g.beginPath();g.moveTo(p[0],p[1]);g.lineTo(q[0],q[1]);g.stroke();
      g.strokeStyle="#EEE8FF";g.shadowBlur=0;g.globalAlpha=alpha*(.12+.64*level);g.lineWidth=(.68+1.28*level)*k;
      g.beginPath();g.moveTo(p[0],p[1]);g.lineTo(q[0],q[1]);g.stroke();}
    g.shadowBlur=0;
    if(exchange>.015){g.globalCompositeOperation="screen";
      for(let i=0;i<7;i++){const p=pointOnPolyline(points,.18+i*.105),r=(5.0+1.8*Math.sin(i*2.1))*k,
          gradient=g.createRadialGradient(p[0],p[1],.5*k,p[0],p[1],r);
        gradient.addColorStop(0,`rgba(184,156,255,${.080*exchange*alpha})`);gradient.addColorStop(1,"rgba(184,156,255,0)");
        g.fillStyle=gradient;g.beginPath();g.arc(p[0],p[1],r,0,TAU);g.fill();}
      g.globalCompositeOperation="source-over";g.font=fontOf(Math.max(k,.78),7.2);g.textAlign="left";g.textBaseline="bottom";
      const label="tiny conceptual exchange halo",lx=box.x+7*k,ly=box.y+box.h-6*k,lw=g.measureText(label).width;
      g.fillStyle="rgba(0,0,0,.68)";g.globalAlpha=.82*exchange*alpha;g.fillRect(lx-3*k,ly-11*k,lw+6*k,13*k);
      g.fillStyle="#D9C9FF";g.globalAlpha=.86*exchange*alpha;g.fillText(label,lx,ly);}
    g.restore();return;
  }
  const wash=!!a.wash,front=wash?1-smooth(age/.72):smooth(age/1.12),direction=wash?-1:1;
  g.save();g.lineCap="round";g.lineJoin="round";g.shadowColor=color;g.shadowBlur=7*k;
  for(let i=0;i<12;i++){const u=front-direction*i*.030;if(u<0||u>1)continue;const p=pointOnPolyline(points,u),q=pointOnPolyline(points,clamp01(u-direction*.020));
    g.strokeStyle=color;g.globalAlpha=(.20+.72*(1-i/12))*alpha;g.lineWidth=(1.25+2.0*(1-i/12))*k;
    g.beginPath();g.moveTo(q[0],q[1]);g.lineTo(p[0],p[1]);g.stroke();}
  const p=pointOnPolyline(points,front);g.fillStyle=color;g.globalAlpha=.96*alpha;g.beginPath();g.arc(p[0],p[1],2.7*k,0,TAU);g.fill();g.restore();
}

function drawH01Turntable(g,W,H,micro,a={}) {
  const step=Number(a.step??12),requestedStage=h01TurntableStage(step),video=activateH01Turntable(requestedStage),
    useLive=!!(video&&video.readyState>=2),source=useLive?video:h01TurntableFrameCache,
    stage=useLive?requestedStage:h01TurntableFrameStage;
  if(!source||!stage)return null;const k=a.k??1,alpha=Number(a.alpha??1),box=micro.box,
    vw=source.videoWidth||source.width||720,vh=source.videoHeight||source.height||436,scale=Math.min(box.w/vw,box.h/vh),dw=vw*scale,dh=vh*scale,
    x=box.x+(box.w-dw)*.5,y=box.y+(box.h-dh)*.5,title=a.title??({neurons:"excitatory and inhibitory neurons",
      vessel:"+ capillary",mg:"+ microglia",oligo:"+ oligodendrocyte",
      astro:"+ astrocyte",all:"H01 Layer-IV microdomain"})[stage],
    focusColor=({neurons:H01_COLORS.excitatory,vessel:H01_COLORS.vasculature,
      mg:H01_COLORS.microglia_opc,oligo:H01_COLORS.oligodendrocytes,astro:H01_COLORS.astrocytes,all:"#F9F9F7"})[stage];
  // Keep every official surface in frame.  Empty video pixels are the same ink as the panel,
  // so the specimen reads as one object without a visible inner rectangle.
  g.save();g.globalAlpha=alpha;g.fillStyle="#000";g.fillRect(box.x,box.y,box.w,box.h);
  g.beginPath();g.rect(box.x,box.y,box.w,box.h);g.clip();g.drawImage(source,x,y,dw,dh);g.restore();
  // Hold the last decoded *real* surface frame while the next VP9 reveal state seeks.  This
  // avoids both the obsolete native-triangle fallback and a one-frame black flash.
  if(useLive){if(!h01TurntableFrameCache){h01TurntableFrameCache=document.createElement("canvas");}
    if(h01TurntableFrameCache.width!==vw||h01TurntableFrameCache.height!==vh){h01TurntableFrameCache.width=vw;h01TurntableFrameCache.height=vh;}
    const cg=h01TurntableFrameCache.getContext("2d");cg.setTransform(1,0,0,1,0,0);cg.clearRect(0,0,vw,vh);cg.drawImage(video,0,0,vw,vh);h01TurntableFrameStage=stage;}
  const contentBox={x,y,w:dw,h:dh};
  if(!a.tracerAccumulation)drawH01LumenPulse(g,video,contentBox,Number(a.tracerAge),k,{wash:a.tracerWash,
    cycle:a.tracerCycle,duration:a.tracerDuration,color:a.tracerColor,alpha});
  drawH01PrecomputedExchange(g,contentBox,{enabled:a.tracerAccumulation,
    alpha:alpha*Number(a.tracerAccumulationAlpha??1),cellAlpha:a.exchangeCellsAlpha});
  g.save();g.globalAlpha=.70*alpha;g.strokeStyle="#778082";g.lineWidth=.7*k;g.strokeRect(box.x,box.y,box.w,box.h);
  if(title){g.fillStyle="rgba(0,0,0,.78)";g.fillRect(box.x+6*k,box.y+5*k,Math.min(box.w-12*k,260*k),20*k);
  g.fillStyle=focusColor;g.beginPath();g.arc(box.x+13*k,box.y+15*k,2.5*k,0,TAU);g.fill();
  g.fillStyle=cssVar("--hi","#F9F9F7");g.globalAlpha=.94*alpha;g.textAlign="left";g.textBaseline="middle";g.font=fontOf(Math.max(k,.88),9.5);
  g.fillText(title,box.x+21*k,box.y+15*k);}
  const bar=Math.min(76*k,box.w*.18),by=box.y+box.h-11*k;g.strokeStyle="#F9F9F7";g.globalAlpha=.90*alpha;g.lineWidth=1.7*k;
  g.beginPath();g.moveTo(box.x+box.w-10*k-bar,by);g.lineTo(box.x+box.w-10*k,by);g.stroke();g.font=fontOf(Math.max(k,.82),8.1);g.textAlign="right";g.fillText("20 μm",box.x+box.w-10*k,by-8*k);g.restore();
  const duration=Number(video?.duration)||3,phase=duration>0?(Number(video?.currentTime)||0)/duration:0;
  return{box,contentBox,turntable:true,video:video||source,phase,angleRad:phase*TAU};
}

function drawH01Microdomain(g,W,H,view,show,a={}) {
  const md=H01_CORTEX?.microdomain,micro=h01MicrodomainView(W,H,view,a.k??1,a.microBox);if(!md||!micro)return;
  const turntable=drawH01Turntable(g,W,H,micro,a);if(turntable)return turntable;
  if(H01_TURNTABLES){g.save();g.fillStyle="#000";g.fillRect(micro.box.x,micro.box.y,micro.box.w,micro.box.h);g.restore();return{box:micro.box,turntable:true};}
  const mainG=g,k=a.k??1,alpha=Number(a.alpha??1),step=Number(a.step??4),box=micro.box,now=Number(a.t??0),
    renderInterval=1/Math.max(2,Math.min(10,Number(a.renderFps??6)||6)),cacheX=Math.floor(box.x-8*k),cacheY=Math.floor(box.y-22*k),
    // The heading is intentionally wider than the microscope frame. Keep transparent cache
    // margin for the complete phrase instead of cropping its final word.
    cacheW=Math.ceil(box.w+72*k),cacheH=Math.ceil(box.h+30*k);
  let frame=micro.frameCache;if(!frame||frame.w!==cacheW||frame.h!==cacheH||frame.x!==cacheX||frame.y!==cacheY){
    const canvas=document.createElement("canvas");canvas.width=cacheW;canvas.height=cacheH;
    frame=micro.frameCache={canvas,g:canvas.getContext("2d"),x:cacheX,y:cacheY,w:cacheW,h:cacheH,lastT:-Infinity,step:-1};}
  const redraw=frame.step!==step||now<frame.lastT||now-frame.lastT>=renderInterval;
  if(!redraw){mainG.save();mainG.globalAlpha=1;mainG.drawImage(frame.canvas,frame.x,frame.y);mainG.restore();return{box};}
  g=frame.g;g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,frame.w,frame.h);g.save();g.translate(-frame.x,-frame.y);
  // Cortical depth is the screen-y axis.  Only the tangential/section plane turns, so the
  // microdomain stays upright at twelve o'clock rather than orbiting around a diagonal axis.
  const theta=(Number(a.baseYaw??0)*Math.PI/180)+(a.still?0:now*Number(a.spin??.022)*TAU),ct=Math.cos(theta),st=Math.sin(theta);
  const layerFor=(group)=>({excitatory:"neurons",inhibitory:"neurons",other:"neurons",vasculature:"vessels",vascular:"vascular",
    astrocytes:"astrocytes",microglia_opc:"microglia",oligodendrocytes:"oligodendrocytes"}[group]);
  const focusGroups={6:["excitatory","inhibitory","other"],7:["vasculature"],8:["vasculature"],
    9:["microglia_opc"],10:["oligodendrocytes"],11:["astrocytes"]}[step]||[],
    focusMode=focusGroups.length>0,isFocused=(group)=>focusGroups.includes(group);
  const styleFor=(group)=>({
    // [far-face alpha, near-face alpha, edge alpha, line width, target edge count]
    // The complete simplified H01 faces are retained. Sparse edges add depth without turning
    // every cell back into the unreadable wire cages used by the previous revision.
    vasculature:[.43,.76,.31,.50,1500],excitatory:[.36,.66,.18,.28,900],
    // The released inhibitory crop is a fine Layer-IV process rather than a large soma.
    // Give its true surface enough luminance and edge weight to remain distinguishable from
    // the adjacent excitatory cells without fabricating thickness or topology.
    inhibitory:[.58,.90,.44,.50,1100],other:[.35,.64,.17,.27,850],
    vascular:[.43,.76,.24,.40,1200],astrocytes:[.38,.70,.22,.37,1400],
    microglia_opc:[.42,.74,.24,.38,1050],oligodendrocytes:[.40,.72,.23,.37,1050]
  }[group]||[.36,.66,.18,.30,900]);
  // The inset is explicitly a microscope view.  A modest optical zoom removes the unused
  // perimeter seen in QA renders while the panel clip and scale bar preserve honest framing.
  const frameScale=micro.s*Number(a.microZoom??1.34);
  const project=(L,i)=>{const j=i*3,x=L[j]*ct+L[j+2]*st,z=-L[j]*st+L[j+2]*ct,y=L[j+1];
    return{x:box.x+box.w*.5+x*frameScale,y:box.y+box.h*.5+y*frameScale,d:z};};
  g.save();g.globalAlpha=alpha;g.fillStyle="rgba(18,20,20,.96)";g.fillRect(box.x,box.y,box.w,box.h);
  g.strokeStyle="#6E7778";g.lineWidth=.75*k;g.strokeRect(box.x,box.y,box.w,box.h);g.beginPath();g.rect(box.x+1,box.y+1,box.w-2,box.h-2);g.clip();
  const rows=[];for(const mesh of micro.meshes){const layer=layerFor(mesh.group),baseVisibility=show[layer]??0;if(baseVisibility<=.001)continue;
    const visibility=baseVisibility*(focusMode&&!isFocused(mesh.group)?.66:1);let depth=0;
    for(let i=0;i<mesh.nv;i++){const p=project(mesh.L,i);mesh.sx[i]=p.x;mesh.sy[i]=p.y;mesh.sd[i]=p.d;depth+=p.d;}rows.push([depth/Math.max(1,mesh.nv),mesh,visibility]);}
  rows.sort((p,q)=>p[0]-q[0]);g.lineCap="round";g.lineJoin="round";
  for(const [,mesh,visibility] of rows){const [farFace,nearFace,edgeAlpha,lineWidth,targetEdges]=styleFor(mesh.group),F=mesh.F,E=mesh.E,
      edgeStride=Math.max(1,Math.ceil(mesh.ne/targetEdges)),meshColor=H01_COLORS[mesh.group]||mesh.colour,
      facePaths=[new Path2D(),new Path2D(),new Path2D()];
    for(let f=0;f<mesh.nf;f++){const j=f*3,a0=F[j],b0=F[j+1],c0=F[j+2],depth=(mesh.sd[a0]+mesh.sd[b0]+mesh.sd[c0])/3,
      bucket=Math.min(2,Math.max(0,Math.floor((depth/micro.radius*.5+.5)*3))),path=facePaths[bucket];path.moveTo(mesh.sx[a0],mesh.sy[a0]);
      path.lineTo(mesh.sx[b0],mesh.sy[b0]);path.lineTo(mesh.sx[c0],mesh.sy[c0]);path.closePath();}
    const focused=isFocused(mesh.group),focusGain=focused?1.22:1;g.shadowColor=meshColor;g.shadowBlur=focused?2.8*k:0;
    g.fillStyle=meshColor;for(let bucket=0;bucket<3;bucket++){g.globalAlpha=alpha*visibility*focusGain*mix(farFace,nearFace,bucket/2);g.fill(facePaths[bucket]);}
    const edgePaths=[new Path2D(),new Path2D(),new Path2D()];for(let e=0;e<mesh.ne;e+=edgeStride){const j=e*2,a0=E[j],b0=E[j+1],
      depth=(mesh.sd[a0]+mesh.sd[b0])*.5,bucket=Math.min(2,Math.max(0,Math.floor((depth/micro.radius*.5+.5)*3)));
      edgePaths[bucket].moveTo(mesh.sx[a0],mesh.sy[a0]);edgePaths[bucket].lineTo(mesh.sx[b0],mesh.sy[b0]);}
    g.strokeStyle=meshColor;for(let bucket=0;bucket<3;bucket++){g.globalAlpha=alpha*visibility*edgeAlpha*(focused?1.55:1)*(.42+bucket*.25);
      g.lineWidth=lineWidth*k*(focused?1.26:1)*(.82+bucket*.10);g.stroke(edgePaths[bucket]);}g.shadowBlur=0;}
  const somaMap={microglia_opc:"microglia",oligodendrocytes:"oligodendrocytes"};for(const [name,layer] of Object.entries(somaMap)){
    const cell=micro.cells[name],visibility=show[layer]??0;if(!cell||visibility<=.001)continue;g.strokeStyle=H01_COLORS[name]||cell.colour;g.globalAlpha=alpha*visibility*.34;g.lineWidth=.55*k;
    const stride=Math.max(1,Math.ceil(cell.n/120));for(let i=0;i<cell.n;i+=stride){const p=project(cell.L,i);g.beginPath();g.arc(p.x,p.y,1.05*k,0,TAU);g.stroke();}}
  const tracerAge=Number(a.tracerAge),vesselMesh=micro.meshes.find(mesh=>mesh.group==="vasculature"),vessel=micro.vessel;
  if(vessel&&vesselMesh&&Number.isFinite(tracerAge)&&tracerAge>=0){const wash=!!a.tracerWash,cycle=!!a.tracerCycle,
      tracer=a.tracerColor||"#B89CFF",E=vessel.E,U=vessel.flowU;
    for(let i=0;i<vessel.n;i++){const p=project(vessel.L,i);vessel.sx[i]=p.x;vessel.sy[i]=p.y;vessel.sd[i]=p.d;}
    const cyclePhase=clamp01(tracerAge/Math.max(.1,Number(a.tracerDuration??3.10))),
      front=cycle?-.04+smooth(cyclePhase/.46)*1.22:wash?1.10+smooth(tracerAge/.60)*1.80:-.04+smooth(tracerAge/1.16)*1.22,
      paths=Array.from({length:6},()=>new Path2D());
    for(let e=0;e<vessel.ne;e++){const j=e*2,i0=E[j],i1=E[j+1],position=(U[i0]+U[i1])*.5;if(position<0)continue;
      const weight=bolusEnvelope(position,front,wash?.115:.085);if(weight<.035)continue;const bucket=Math.min(5,Math.max(0,(weight*6)|0));
      paths[bucket].moveTo(vessel.sx[i0],vessel.sy[i0]);paths[bucket].lineTo(vessel.sx[i1],vessel.sy[i1]);}
    g.strokeStyle=tracer;g.shadowColor=tracer;g.shadowBlur=5*k;for(let bucket=0;bucket<6;bucket++){
      g.globalAlpha=alpha*(.22+bucket*.14);g.lineWidth=(.86+bucket*.17)*k;g.stroke(paths[bucket]);}g.shadowBlur=0;
    if(!cycle){
      // Older schematic scenes retain their deterministic molecule marks. The production
      // H01 cycle is the cycle branch above and intentionally draws no scattered particles.
      const clearFront=smooth(tracerAge/.72)*1.20;
      for(let n=0;n<90;n++){const i=(n*37+11)%vessel.n,position=U[i];if(position<0)continue;const reached=smooth((front-position+.06)/.20),
        cleared=smooth((clearFront-position+.04)/.18),remain=wash?mix(1,.24,cleared):reached;if(remain<=.01)continue;const ang=hash01(n,811,3)*TAU,
        rr=(1.8+6.1*hash01(n,811,5))*k,x=vessel.sx[i]+Math.cos(ang)*rr,y=vessel.sy[i]+Math.sin(ang)*rr;
        g.fillStyle=tracer;g.globalAlpha=alpha*remain*(.20+.34*hash01(n,811,7));g.beginPath();g.arc(x,y,(.40+.44*hash01(n,811,9))*k,0,TAU);g.fill();}}}
  g.restore();
  const title=a.title??(step===6?"excitatory and inhibitory neurons":step===7?"+ capillary":step===9?"+ microglia":step===10?"+ oligodendrocyte":step===11?"+ astrocyte":step===12?"gadolinium · inflow → exchange → outflow":"H01 Layer-IV microdomain");
  g.save();g.font=fontOf(Math.max(k,.82),8.2);g.textAlign="left";g.textBaseline="bottom";g.fillStyle=cssVar("--hi","#F9F9F7");g.globalAlpha=alpha*.92;
  g.fillText(title,box.x+7*k,box.y-4*k);const bar=20*frameScale,x0=box.x+box.w-7*k-bar,y0=box.y+box.h-8*k;g.strokeStyle=cssVar("--hi","#F9F9F7");g.lineWidth=1.2*k;
  g.beginPath();g.moveTo(x0,y0);g.lineTo(x0+bar,y0);g.stroke();g.font=fontOf(Math.max(k,.76),7.2);g.textAlign="center";g.textBaseline="top";g.fillText("20 µm",x0+bar*.5,y0+2*k);g.restore();
  g.restore();frame.lastT=now;frame.step=step;mainG.save();mainG.globalAlpha=1;mainG.drawImage(frame.canvas,frame.x,frame.y);mainG.restore();return {box};
}

function drawH01CortexSlab(g,W,H,t,a={}) {
  const view=h01CortexView(W,H,a.k??1,a.slabX,a.slabScale);if(!view)return null;
  const k=a.k??1,step=Number(a.step??4),enter=Number(a.enter??1),alpha=Number(a.alpha??1),
    showMicro=a.showMicro!==false,microAlpha=Number(a.microAlpha??1),show=h01LayerVisibility(step,enter),
    microShow=step===6?{...show,vessels:0,vascular:0,microglia:0,oligodendrocytes:0,astrocytes:0}:show,
    microView=showMicro?h01MicrodomainView(W,H,view,k,a.microBox):null;
  const cropX=Math.max(0,Math.floor(view.bounds.minX-16*k)),cropY=Math.max(0,Math.floor(view.bounds.minY-16*k)),
    cropW=Math.min(Math.ceil(W)-cropX,Math.ceil(view.bounds.maxX-view.bounds.minX+32*k)),
    cropH=Math.min(Math.ceil(H)-cropY,Math.ceil(view.bounds.maxY-view.bounds.minY+32*k)),
    composite=(canvas)=>g.drawImage(canvas,cropX,cropY,cropW,cropH,cropX,cropY,cropW,cropH);
  g.save();
  g.globalAlpha=alpha*.80;composite(view.guides);
  for(const name of ["neurons","vessels","vascular","microglia","oligodendrocytes","astrocytes"]){
    if(show[name]<=.001)continue;g.globalAlpha=alpha*show[name];composite(view.layers[name]);}
  // The thin-volume frame and scale are native marks, not a pasted panel.
  const C=view.corners,edges=[[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]];
  g.strokeStyle="#839396";g.lineWidth=.72*k;g.globalAlpha=alpha*.26;g.beginPath();
  for(const [i,j] of edges){g.moveTo(C[i].x,C[i].y);g.lineTo(C[j].x,C[j].y);}g.stroke();
  const hi=cssVar("--hi","#F9F9F7"),lo=cssVar("--lo","#6E6C64");
  g.font=fontOf(Math.max(k,.80),8.2);g.textAlign="right";g.textBaseline="middle";g.fillStyle="#B8B0A4";g.globalAlpha=alpha*.94;
  (H01_CORTEX.laminar?.layer_names||["I","II","III","IV","V","VI","WM"]).forEach((name,i)=>{const y=view.layerY[i];if(Number.isFinite(y))g.fillText(name,view.bounds.minX-8*k,y);});
  g.font=fontOf(Math.max(k,.76),7.4);g.fillStyle="#B8B0A4";g.globalAlpha=alpha*.86;g.fillText("pia",view.bounds.minX-8*k,view.bounds.minY-7*k);
  const bar=500*view.scale*.63,x0=view.bounds.maxX-bar,y0=view.bounds.maxY+14*k;
  g.strokeStyle=hi;g.lineWidth=1.5*k;g.globalAlpha=alpha*.70;g.beginPath();g.moveTo(x0,y0);g.lineTo(x0+bar,y0);g.stroke();
  g.font=fontOf(Math.max(k,.82),8.3);g.textAlign="center";g.textBaseline="top";g.fillStyle="#B8B0A4";g.globalAlpha=alpha*.86;g.fillText("500 µm",x0+bar*.5,y0+4*k);
  const md=H01_CORTEX.microdomain,
    // The approved turntable uses the newer interior Layer-IV candidate declared in the
    // renderer manifest (96 µm around 2163.891, 1555.776, 76.032 µm), not the earlier
    // prototype crop still retained in the compact slab JSON for the fallback renderer.
    roi=a.roiBounds||[[2115.891,1507.776,28.032],[2211.891,1603.776,124.032]];
  if(showMicro&&roi){const pts=[];for(const x of [roi[0][0],roi[1][0]])for(const y of [roi[0][1],roi[1][1]])for(const z of [roi[0][2],roi[1][2]])pts.push(view.projectUm(x,y,z));
    const rb=pts.reduce((b,p)=>({x0:Math.min(b.x0,p.x),x1:Math.max(b.x1,p.x),y0:Math.min(b.y0,p.y),y1:Math.max(b.y1,p.y)}),{x0:Infinity,x1:-Infinity,y0:Infinity,y1:-Infinity});
    const rw=Math.max(10*k,rb.x1-rb.x0),rh=Math.max(10*k,rb.y1-rb.y0),rx=(rb.x0+rb.x1-rw)*.5,ry=(rb.y0+rb.y1-rh)*.5;
    g.strokeStyle="#78C7D0";g.lineWidth=1.15*k;g.globalAlpha=alpha*microAlpha*.88;g.strokeRect(rx,ry,rw,rh);
    const mb=microView?.box,p1=mb?{x:mb.x-8*k,y:mb.y+mb.h*.64}:{x:W*.48,y:H*.40};
    g.setLineDash([3*k,4*k]);g.globalAlpha=alpha*microAlpha*.46;g.beginPath();g.moveTo(rx+rw,ry+rh*.5);g.lineTo(p1.x,p1.y);if(mb)g.lineTo(mb.x,p1.y);g.stroke();g.setLineDash([]);}
  if(showMicro)drawH01Microdomain(g,W,H,view,microShow,{step,alpha:alpha*microAlpha,k,t:Number(a.microTime??t),spin:.024,
    tracerAge:a.tracerAge,tracerWash:a.tracerWash,tracerCycle:a.tracerCycle,tracerDuration:a.tracerDuration,
    tracerColor:a.tracerColor,tracerAccumulation:a.tracerAccumulation,
    tracerAccumulationAlpha:a.tracerAccumulationAlpha,tracerPassIndex:a.tracerPassIndex,
    tracerRetainedPasses:a.tracerRetainedPasses,tracerResidueAlpha:a.tracerResidueAlpha,
    exchangeCellsAlpha:a.exchangeCellsAlpha,title:a.microTitle,
    microBox:a.microBox,microZoom:a.microZoom});
  if(a.stageLabel!==false){if(step===5){const legend=[
      ["excitatory neurons",H01_COLORS.excitatory],["inhibitory neurons",H01_COLORS.inhibitory],["vasculature",H01_COLORS.vasculature],
      ["astrocytes",H01_COLORS.astrocytes],["microglia",H01_COLORS.microglia_opc],
      ["oligodendrocytes",H01_COLORS.oligodendrocytes]];
    // The introductory slab occupies the middle lane.  Keep its key in a dedicated
    // single column to the right: two columns made the first labels visually merge with
    // the specimen at projection size, while a tall key uses the otherwise empty gutter.
    const lx=W*.755,ly=H*.245;g.textAlign="left";g.textBaseline="middle";g.font=fontOf(Math.max(k,.76),7.65);
    legend.forEach(([text,color],i)=>{const x=lx,y=ly+i*17*k;g.fillStyle=color;g.globalAlpha=alpha*enter*.92;
      g.beginPath();g.arc(x,y,2.05*k,0,TAU);g.fill();g.fillText(text,x+6*k,y);});
  } else {
    if(step===6&&microView?.box){const items=[["excitatory neurons",H01_COLORS.excitatory],["inhibitory neurons",H01_COLORS.inhibitory]],
        mb=microView.box,x0=mb.x+18*k,y=mb.y+mb.h-11*k,gap=Math.min(144*k,mb.w*.42);
      // Share the microscope's black footer, safely left of the 20-µm scale bar.
      g.font=fontOf(Math.max(k,.80),8.1);g.textBaseline="middle";items.forEach(([text,color],i)=>{const x=x0+i*gap;
        g.textAlign="left";g.fillStyle=color;g.globalAlpha=alpha*.96;g.beginPath();g.arc(x,y,2.0*k,0,TAU);g.fill();g.fillText(text,x+6*k,y);});
    }
    // Steps 7–11 already carry a truthful, colour-coded title inside the microscope
    // frame.  Repeating it at the bottom collided with the slab's 500-µm scale bar.
  }}
  g.restore();return view;
}

function drawH01Tracer(g,view,t,a={}) {
  if(!view||!H01_CORTEX)return;const k=a.k??1,age=Math.max(0,Number(a.age??0)),wash=!!a.wash,alpha=Number(a.alpha??1);
  const tracer=a.tracerColor||"#B89CFF",P=view.projected.vesselNodes,E=H01_CORTEX.vessels.E,U=view.vesselFlowU;
  const progress=smooth(age/(wash?.60:1.16));
  const front=wash?1.10+progress*1.80:-.04+progress*1.22,paths=Array.from({length:6},()=>new Path2D());
  // H01 does not provide arterial/venous labels, but its released centreline topology is
  // explicit. The geodesic coordinate keeps each packet on connected branches instead of
  // illuminating unrelated vessels that happen to share one screen-space y position.
  const edgeStride=Math.max(1,Math.ceil(H01_CORTEX.vessels.ne/9000));
  for(let e=0;e<H01_CORTEX.vessels.ne;e+=edgeStride){const i=E[e*2]*3,j=E[e*2+1]*3;
    const position=(U[E[e*2]]+U[E[e*2+1]])*.5;if(position<0)continue;
    const weight=bolusEnvelope(position,front,wash?.11:.085);if(weight<.035)continue;
    const b=Math.min(5,Math.max(0,(weight*6)|0));paths[b].moveTo(P[i],P[i+1]);paths[b].lineTo(P[j],P[j+1]);}
  g.save();g.lineCap="round";g.lineJoin="round";g.strokeStyle=tracer;g.shadowColor=tracer;g.shadowBlur=3*k;
  for(let b=0;b<6;b++){g.globalAlpha=alpha*(.12+b*.135);g.lineWidth=(.46+b*.10)*k;g.stroke(paths[b]);}
  g.shadowBlur=0;
  if(a.extravascular!==false){
    // Deterministic extravascular marks are retained for older schematic scenes. The H01
    // production bolus explicitly disables them so gadolinium remains lumen-bound.
    const n=H01_CORTEX.vessels.n,clearFront=smooth(age/.72)*1.20;
    for(let i=0;i<260;i++){const node=(i*347+71)%n,ix=node*3,position=U[node];if(position<0)continue;const reached=smooth((front-position+.08)/.22),
      cleared=smooth((clearFront-position+.04)/.18),remaining=wash?mix(1,.24,cleared):reached;
      if(remaining<=.01)continue;const ang=hash01(i,509,3)*TAU,reach=(4+18*hash01(i,509,5))*k*(wash?.72:progress);
      const x=P[ix]+Math.cos(ang)*reach,y=P[ix+1]+Math.sin(ang)*reach;
      g.fillStyle=tracer;g.globalAlpha=alpha*remaining*(.12+.36*hash01(i,509,7));g.beginPath();g.arc(x,y,(.40+.52*hash01(i,509,9))*k,0,TAU);g.fill();}}
  g.restore();
}

function drawH01OxygenOverlay(g,W,H,view,t,a={}){
  if(!H01_OXYGEN||!H01_CORTEX||!view)return;const k=a.k??1,step=Number(a.step??0),enter=clamp01(Number(a.enter??1)),
    oxygen=H01_OXYGEN,micro=h01MicrodomainView(W,H,view,k,a.microBox);if(!micro)return;
  const box=micro.box,theta=(Number(a.baseYaw??0)*Math.PI/180)+(a.still?0:t*Number(a.spin??.018)*TAU),
    ct=Math.cos(theta),st=Math.sin(theta),frameScale=micro.s*Number(a.microZoom??1.34),q=Number(H01_CORTEX.q||32767),full=H01_CORTEX.box_um;
  const projectUm=(x,y,z)=>{const u=x*view.uAxis[0]+y*view.uAxis[1]-micro.uc,d=x*view.dAxis[0]+y*view.dAxis[1]-micro.dc,zz=z-micro.zc,
      xr=u*ct+zz*st,zr=-u*st+zz*ct;
    return{x:box.x+box.w*.5+xr*frameScale,y:box.y+box.h*.5+d*frameScale,d:zr};};
  const projectPacked=(P,i)=>{const j=i*3;return projectUm((P[j]/q*.5+.5)*full[0],(P[j+1]/q*.5+.5)*full[1],(P[j+2]/q*.5+.5)*full[2]);};
  const path=[];for(let i=0;i<oxygen.flow.path.length/3;i++)path.push(projectPacked(oxygen.flow.path,i));
  if(path.length<2)return;const high=oxygen.display?.palette?.high_oxygen||"#F0C85A",mid=oxygen.display?.palette?.mid_oxygen||"#5DAEA4",
    low=oxygen.display?.palette?.low_oxygen||"#244B78",cap=oxygen.display?.palette?.capillary||"#67C1D0",used=oxygen.display?.palette?.uptake||"#D97757";
  const rgb=(hex)=>{const s=hex.replace("#","");return[parseInt(s.slice(0,2),16),parseInt(s.slice(2,4),16),parseInt(s.slice(4,6),16)]},loRgb=rgb(low),midRgb=rgb(mid),hiRgb=rgb(high);
  g.save();g.beginPath();g.rect(box.x+1,box.y+1,box.w-2,box.h-2);g.clip();
  // The field is a precomputed normalized explanatory solution, projected into the exact H01
  // coordinate frame. Keeping the cloud sparse preserves the deck's dot language and frame rate.
  const fieldAlpha=a.showField===false?0:step<2?0:step===2?enter:1;if(fieldAlpha>.001){const f=oxygen.field,bounds=oxygen.bounds_um,shape=f.shape,
      nx=shape[0],ny=shape[1],nz=shape[2],indices=f.displayIndices,stride=2;
    for(let n=0;n<indices.length;n+=stride){const index=indices[n],ix=Math.floor(index/(ny*nz)),rem=index-ix*ny*nz,iy=Math.floor(rem/nz),iz=rem-iy*nz,
        x=mix(bounds[0][0],bounds[1][0],ix/Math.max(1,nx-1)),y=mix(bounds[0][1],bounds[1][1],iy/Math.max(1,ny-1)),z=mix(bounds[0][2],bounds[1][2],iz/Math.max(1,nz-1)),
        p=projectUm(x,y,z),c=f.normoxia[index]/255,u=f.uptake[index]/255,blend=c<.55?mixRgb(loRgb,midRgb,c/.55):mixRgb(midRgb,hiRgb,(c-.55)/.45),
        uptakeFocus=step>=3?u:0,r=(.34+.72*c+.26*uptakeFocus)*k;
      g.fillStyle=uptakeFocus>.50?used:`rgb(${blend[0]|0},${blend[1]|0},${blend[2]|0})`;g.globalAlpha=fieldAlpha*(.055+.25*c+.12*uptakeFocus);
      g.beginPath();g.arc(p.x,p.y,r,0,TAU);g.fill();}}
  // One connected released vessel path carries the visible oxygen packet. H01 does not label
  // its arterial and venous ends, so the direction is intentionally presented as explanatory.
  if(step>=1){g.strokeStyle=cap;g.lineCap="round";g.lineJoin="round";g.globalAlpha=.70;g.lineWidth=1.12*k;g.beginPath();g.moveTo(path[0].x,path[0].y);
    for(let i=1;i<path.length;i++)g.lineTo(path[i].x,path[i].y);g.stroke();
    const phaseList=oxygen.flow.phases||[],outflow=step>=4,count=outflow?24:72,speed=outflow?.14:.10;
    for(let i=0;i<count;i++){const phase=(phaseList[(i*(outflow?3:1))%phaseList.length]||0)/65535,u=((t*speed+phase)%1),visible=outflow?smooth((u-.55)/.18):1,p=sampleScreenPath(path,u);
      g.fillStyle=outflow?cap:high;g.globalAlpha=(.38+.58*visible)*(step===1?enter:1);g.beginPath();g.arc(p.x,p.y,(outflow?1.15:1.42)*k,0,TAU);g.fill();}}
  if(step>=3){for(const uptake of oxygen.uptakePaths||[]){const points=[];for(let i=0;i<uptake.P.length/3;i++)points.push(projectPacked(uptake.P,i));
      g.strokeStyle=used;g.globalAlpha=.22;g.lineWidth=.72*k;g.setLineDash([2*k,3*k]);g.beginPath();g.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)g.lineTo(points[i].x,points[i].y);g.stroke();g.setLineDash([]);
      const p=sampleScreenPath(points,(t*.16+Number(uptake.phase||0))%1);g.fillStyle=used;g.globalAlpha=.92;g.beginPath();g.arc(p.x,p.y,1.65*k,0,TAU);g.fill();}}
  g.restore();
  const hi=cssVar("--hi","#F9F9F7"),loText=cssVar("--lo","#6E6C64"),anchors=[path[0],path.at(-1)];g.save();g.font=fontOf(Math.max(k,.82),8.6);g.textBaseline="middle";
  if(step>=1){g.fillStyle=high;g.globalAlpha=.95;g.textAlign=anchors[0].x<box.x+box.w*.5?"right":"left";g.fillText("O₂ in",anchors[0].x+(g.textAlign==="right"?-6:6)*k,anchors[0].y);}
  if(step>=3){g.fillStyle=used;g.textAlign="center";g.fillText("oxygen used by tissue",box.x+box.w*.5,box.y+box.h+17*k);}
  if(step>=4){g.fillStyle=cap;g.textAlign=anchors[1].x<box.x+box.w*.5?"right":"left";g.fillText("less O₂ out",anchors[1].x+(g.textAlign==="right"?-6:6)*k,anchors[1].y);}
  g.fillStyle=loText;g.globalAlpha=.72;g.textAlign="center";g.font=fontOf(Math.max(k,.76),7.3);if(step>=2&&a.showField!==false)g.fillText("normalized explanatory diffusion field",box.x+box.w*.5,box.y+box.h+30*k);g.restore();
}

/** Smooth orthogonal views of the precomputed oxygen field. The browser resamples the
 * 32×32×22 solution into presentation-resolution rasters once, then reuses those rasters;
 * no cubical glyphs are drawn and no diffusion solve runs during the talk. */
function h01OxygenSliceCanvases(withUptake=false){
  if(!H01_OXYGEN)return null;const oxygen=H01_OXYGEN,cache=oxygen._sliceCanvases||(oxygen._sliceCanvases={}),key=withUptake?"uptake":"oxygen";
  if(cache[key])return cache[key];const f=oxygen.field,[nx,ny,nz]=f.shape,palette=oxygen.display?.palette||{},
    low=palette.low_oxygen||"#244B78",mid=palette.mid_oxygen||"#5DAEA4",high=palette.high_oxygen||"#F0C85A",
    cap=palette.capillary||"#67C1D0",sink=palette.uptake||"#D97757";
  const hex=(value)=>{const s=String(value).replace("#","");return[parseInt(s.slice(0,2),16),parseInt(s.slice(2,4),16),parseInt(s.slice(4,6),16)]},
    loRgb=hex(low),midRgb=hex(mid),hiRgb=hex(high),capRgb=hex(cap),sinkRgb=hex(sink),
    at=(A,x,y,z)=>{x=Math.max(0,Math.min(nx-1,x));y=Math.max(0,Math.min(ny-1,y));z=Math.max(0,Math.min(nz-1,z));
      const x0=Math.floor(x),x1=Math.min(nx-1,x0+1),y0=Math.floor(y),y1=Math.min(ny-1,y0+1),z0=Math.floor(z),z1=Math.min(nz-1,z0+1),
        fx=x-x0,fy=y-y0,fz=z-z0,idx=(ix,iy,iz)=>ix*ny*nz+iy*nz+iz,
        v=(ix,iy,iz)=>Number(A[idx(ix,iy,iz)]||0),
        a0=mix(v(x0,y0,z0),v(x1,y0,z0),fx),a1=mix(v(x0,y1,z0),v(x1,y1,z0),fx),
        b0=mix(v(x0,y0,z1),v(x1,y0,z1),fx),b1=mix(v(x0,y1,z1),v(x1,y1,z1),fx);
      return mix(mix(a0,a1,fy),mix(b0,b1,fy),fz);},
    make=(axis)=>{const horizontal=axis==="z",cw=216,ch=horizontal?216:142,c=document.createElement("canvas");c.width=cw;c.height=ch;
      const q=c.getContext("2d"),im=q.createImageData(cw,ch);for(let py=0;py<ch;py++)for(let px=0;px<cw;px++){
        const u=px/Math.max(1,cw-1),v=1-py/Math.max(1,ch-1);let x,y,z;
        if(axis==="x"){x=(nx-1)*.50;y=u*(ny-1);z=v*(nz-1);}else if(axis==="y"){x=u*(nx-1);y=(ny-1)*.50;z=v*(nz-1);}
        else{x=u*(nx-1);y=v*(ny-1);z=(nz-1)*.50;}
        const concentration=at(f.normoxia,x,y,z)/255,source=at(f.source,x,y,z)/255,uptake=withUptake?at(f.uptake,x,y,z)/255:0,
          base=concentration<.55?mixRgb(loRgb,midRgb,concentration/.55):mixRgb(midRgb,hiRgb,(concentration-.55)/.45),
          tissue=uptake>.02?mixRgb(base,sinkRgb,clamp01(uptake*.72)):base,col=source>.10?mixRgb(tissue,capRgb,clamp01(.48+source*.48)):tissue,j=(py*cw+px)*4;
        im.data[j]=col[0]|0;im.data[j+1]=col[1]|0;im.data[j+2]=col[2]|0;im.data[j+3]=255;}
      q.putImageData(im,0,0);return c;};
  cache[key]={x:make("x"),y:make("y"),z:make("z")};return cache[key];
}

/** Seven real axial samples of the same precomputed volume, cached as smooth rasters.  The
 * later oxygen reveal stacks these planes in an isometric cage: a depth cue without a live
 * volume renderer, voxel glyphs, or a second diffusion calculation. */
function h01OxygenStackCanvases(withUptake=false){
  if(!H01_OXYGEN)return null;const oxygen=H01_OXYGEN,cache=oxygen._stackCanvases||(oxygen._stackCanvases={}),key=withUptake?"uptake":"oxygen";
  if(cache[key])return cache[key];const f=oxygen.field,[nx,ny,nz]=f.shape,palette=oxygen.display?.palette||{},
    low=palette.low_oxygen||"#244B78",mid=palette.mid_oxygen||"#5DAEA4",high=palette.high_oxygen||"#F0C85A",
    cap=palette.capillary||"#67C1D0",sink=palette.uptake||"#D97757";
  const hex=(value)=>{const s=String(value).replace("#","");return[parseInt(s.slice(0,2),16),parseInt(s.slice(2,4),16),parseInt(s.slice(4,6),16)]},
    loRgb=hex(low),midRgb=hex(mid),hiRgb=hex(high),capRgb=hex(cap),sinkRgb=hex(sink),
    at=(A,x,y,z)=>{x=Math.max(0,Math.min(nx-1,x));y=Math.max(0,Math.min(ny-1,y));z=Math.max(0,Math.min(nz-1,z));
      const x0=Math.floor(x),x1=Math.min(nx-1,x0+1),y0=Math.floor(y),y1=Math.min(ny-1,y0+1),z0=Math.floor(z),z1=Math.min(nz-1,z0+1),
        fx=x-x0,fy=y-y0,fz=z-z0,idx=(ix,iy,iz)=>ix*ny*nz+iy*nz+iz,v=(ix,iy,iz)=>Number(A[idx(ix,iy,iz)]||0),
        a0=mix(v(x0,y0,z0),v(x1,y0,z0),fx),a1=mix(v(x0,y1,z0),v(x1,y1,z0),fx),
        b0=mix(v(x0,y0,z1),v(x1,y0,z1),fx),b1=mix(v(x0,y1,z1),v(x1,y1,z1),fx);
      return mix(mix(a0,a1,fy),mix(b0,b1,fy),fz);},
    make=(fraction)=>{const cw=216,ch=154,c=document.createElement("canvas");c.width=cw;c.height=ch;const q=c.getContext("2d"),im=q.createImageData(cw,ch);
      for(let py=0;py<ch;py++)for(let px=0;px<cw;px++){const x=px/Math.max(1,cw-1)*(nx-1),y=(1-py/Math.max(1,ch-1))*(ny-1),z=fraction*(nz-1),
          concentration=at(f.normoxia,x,y,z)/255,source=at(f.source,x,y,z)/255,uptake=withUptake?at(f.uptake,x,y,z)/255:0,
          base=concentration<.55?mixRgb(loRgb,midRgb,concentration/.55):mixRgb(midRgb,hiRgb,(concentration-.55)/.45),
          tissue=uptake>.02?mixRgb(base,sinkRgb,clamp01(uptake*.72)):base,col=source>.10?mixRgb(tissue,capRgb,clamp01(.48+source*.48)):tissue,j=(py*cw+px)*4;
        im.data[j]=col[0]|0;im.data[j+1]=col[1]|0;im.data[j+2]=col[2]|0;im.data[j+3]=255;}
      q.putImageData(im,0,0);return c;};
  cache[key]=[.12,.25,.38,.50,.62,.75,.88].map(make);return cache[key];
}

function drawH01OxygenStack(g,W,H,a={}){
  const k=a.k??1,alpha=Number(a.alpha??1),withUptake=!!a.withUptake,stack=h01OxygenStackCanvases(withUptake);if(!stack||alpha<=.001)return;
  const x=W*.615,y=H*.235,pw=W*.235,ph=H*.430,dx=W*.008,dy=-H*.010,
    point=(layer,u,v)=>({x:x+layer*dx+u*pw+v*.38*ph,y:y+layer*dy-u*.16*pw+v*.70*ph});
  g.save();g.beginPath();g.rect(W*.595,H*.035,W*.400,H*.850);g.clip();
  stack.forEach((canvas,i)=>{const depth=i/Math.max(1,stack.length-1);g.save();g.translate(x+i*dx,y+i*dy);g.transform(1,-.16,.38,.70,0,0);
    g.globalCompositeOperation="screen";g.globalAlpha=alpha*(.11+depth*.055);g.drawImage(canvas,0,0,pw,ph);g.globalCompositeOperation="source-over";
    g.strokeStyle=depth>.92?"#F0C85A":"#67C1D0";g.globalAlpha=alpha*(depth>.92?.68:.23);g.lineWidth=(depth>.92?1.15:.65)*k;g.strokeRect(0,0,pw,ph);g.restore();});
  const first=0,last=stack.length-1;g.strokeStyle="#67C1D0";g.globalAlpha=alpha*.40;g.lineWidth=.72*k;
  for(const layer of [first,last]){const p0=point(layer,0,0),p1=point(layer,1,0),p2=point(layer,1,1),p3=point(layer,0,1);g.beginPath();g.moveTo(p0.x,p0.y);g.lineTo(p1.x,p1.y);g.lineTo(p2.x,p2.y);g.lineTo(p3.x,p3.y);g.closePath();g.stroke();}
  for(const [u,v] of [[0,0],[1,0],[1,1],[0,1]]){const p0=point(first,u,v),p1=point(last,u,v);g.beginPath();g.moveTo(p0.x,p0.y);g.lineTo(p1.x,p1.y);g.stroke();}
  g.restore();
  const hi=cssVar("--hi","#F9F9F7"),lo=cssVar("--lo","#6E6C64"),gx=W*.645,gy=H*.780,gw=W*.285,gh=6*k,
    gradient=g.createLinearGradient(gx,gy,gx+gw,gy);gradient.addColorStop(0,"#244B78");gradient.addColorStop(.55,"#5DAEA4");gradient.addColorStop(1,"#F0C85A");
  g.save();g.globalAlpha=alpha;g.fillStyle=gradient;g.fillRect(gx,gy,gw,gh);g.fillStyle=withUptake?"#D97757":hi;g.font=fontOf(Math.max(k,.80),8.2);
  g.textAlign="center";g.textBaseline="bottom";g.fillText(withUptake?"oxygen availability + modeled tissue sink":"seven registered axial oxygen planes",gx+gw*.5,gy-6*k);
  g.fillStyle=lo;g.font=fontOf(Math.max(k,.76),7.3);g.textBaseline="top";g.textAlign="left";g.fillText("low",gx,gy+9*k);g.textAlign="right";g.fillText("high",gx+gw,gy+9*k);g.restore();
}

function drawH01OxygenSlices(g,W,H,a={}){
  const k=a.k??1,alpha=Number(a.alpha??1),withUptake=!!a.withUptake,slices=h01OxygenSliceCanvases(withUptake);if(!slices||alpha<=.001)return;
  const hi=cssVar("--hi","#F9F9F7"),lo=cssVar("--lo","#6E6C64"),hair=cssVar("--hair","#33322E"),
    // Two anatomical side views establish orientation; the axial field is deliberately
    // larger because it exposes the full radial diffusion profile around the lumen.
    panels=[
      ["x","X · sagittal",{x:W*.585,y:H*.045,w:W*.195,h:H*.245}],
      ["y","Y · coronal", {x:W*.785,y:H*.045,w:W*.195,h:H*.245}],
      ["z","Z · axial",   {x:W*.635,y:H*.305,w:W*.295,h:H*.355}],
    ];
  g.save();g.globalAlpha=alpha;panels.forEach(([axis,label,box])=>{const c=slices[axis],scale=Math.min(box.w/c.width,box.h/c.height),dw=c.width*scale,dh=c.height*scale,ox=box.x+(box.w-dw)*.5,oy=box.y+(box.h-dh)*.5;
    g.fillStyle="rgba(12,18,20,.84)";g.fillRect(ox,oy,dw,dh);g.imageSmoothingEnabled=true;g.imageSmoothingQuality="high";g.drawImage(c,ox,oy,dw,dh);
    g.strokeStyle=withUptake?"#D97757":"#67C1D0";g.globalAlpha=alpha*.56;g.lineWidth=.85*k;g.strokeRect(ox,oy,dw,dh);
    g.fillStyle=hi;g.globalAlpha=alpha*.94;g.font=fontOf(Math.max(k,.82),8.2);g.textAlign="left";g.textBaseline="top";g.fillText(label,ox+5*k,oy+4*k);});
  const gx=W*.625,gy=H*.790,gw=W*.325,gh=6*k,gradient=g.createLinearGradient(gx,gy,gx+gw,gy);gradient.addColorStop(0,"#244B78");gradient.addColorStop(.55,"#5DAEA4");gradient.addColorStop(1,"#F0C85A");
  g.globalAlpha=alpha;g.fillStyle=gradient;g.fillRect(gx,gy,gw,gh);g.strokeStyle=hair;g.globalAlpha=alpha*.76;g.strokeRect(gx,gy,gw,gh);
  g.font=fontOf(Math.max(k,.78),7.4);g.globalAlpha=alpha*.90;g.textAlign="center";g.textBaseline="bottom";
  g.fillStyle=withUptake?"#D97757":hi;g.fillText(withUptake?"modelled tissue sink":"normalized oxygen availability",gx+gw*.5,gy-5*k);
  g.fillStyle=lo;g.textBaseline="top";g.textAlign="left";g.fillText("low",gx,gy+9*k);g.textAlign="right";g.fillText("high",gx+gw,gy+9*k);
  g.restore();
}

function niceCurveMaximum(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const decade = 10 ** Math.floor(Math.log10(value)), scaled = value / decade;
  // A few extra 1-2-5-family stops keep a measured 2.58 mM AIF on a 3 mM axis instead of
  // flattening it beneath a needlessly distant 5 mM ceiling.
  const top = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5
    : scaled <= 3 ? 3 : scaled <= 4 ? 4 : scaled <= 5 ? 5 : scaled <= 7.5 ? 7.5 : 10;
  return top * decade;
}

function curveTick(value, axisMax) {
  if (axisMax >= 10) return value.toFixed(0);
  if (axisMax >= 1) return value.toFixed(value === 0 ? 0 : 1);
  if (axisMax >= .1) return value.toFixed(value === 0 ? 0 : 2);
  return value.toFixed(value === 0 ? 0 : 3);
}

function smoothMeasuredCurve(values,passes=2){
  let out=Float64Array.from(values,v=>Number(v)||0);for(let pass=0;pass<passes;pass++){const next=new Float64Array(out.length);
    for(let i=0;i<out.length;i++){const at=(j)=>out[Math.max(0,Math.min(out.length-1,j))];next[i]=(at(i-2)+2*at(i-1)+3*at(i)+2*at(i+1)+at(i+2))/9;}out=next;}
  return out;
}

/** Draw a measured concentration-time curve using its acquisition times and its own y scale. */
function drawNativeCurve(g, box, timeS, values, color, alpha, label, t, k, upto = 1, options = {}) {
  if (!values?.length || alpha <= 0.01) return;
  if(options.edit&&!options.insideEdit){
    options.edit.begin(options.editId+'-plot',options.editName||label,{x:box.x-25*k,y:box.y-30*k,w:box.w+32*k,h:box.h+63*k});
    drawNativeCurve(g,box,timeS,values,color,alpha,label,t,k,upto,{...options,insideEdit:true});
    options.edit.end();return;
  }
  const write=(id,text,x,y)=>options.edit?options.edit.text(options.editId+'-'+id,text,x,y,g.fillStyle,g.font,g.textAlign,g.textBaseline):g.fillText(text,x,y);
  const count = Math.min(values.length, timeS?.length || values.length);
  if (count < 2) return;
  const times = timeS?.length ? timeS : Array.from({length: count}, (_, i) => i);
  const xMin = Number(times[0]), xMax = Math.max(xMin + 1e-6, Number(times[count - 1]));
  const timeOffset=Number(options.timeOffset??0),plotTime=(i)=>Number(times[i])+timeOffset;
  let dataMin = Infinity, dataMax = -Infinity;
  for (let i = 0; i < count; i++) { const v = Number(values[i]); if (Number.isFinite(v)) { dataMin = Math.min(dataMin, v); dataMax = Math.max(dataMax, v); } }
  const yMin = Number(options.yMin ?? Math.min(0, dataMin)), yMax = Number(options.yMax ?? niceCurveMaximum(Math.max(1e-9, dataMax)));
  const ySpan = Math.max(1e-9, yMax - yMin), xSpan = xMax - xMin;
  const X = (value) => box.x + (Number(value) - xMin) / xSpan * box.w;
  const Y = (value) => box.y + box.h - (Number(value) - yMin) / ySpan * box.h;
  const lo = cssVar("--lo", "#6E6C64"), hi = cssVar("--hi", "#F9F9F7");
  g.save(); g.globalAlpha = alpha;
  g.strokeStyle = lo; g.lineWidth = .85 * k;
  g.beginPath(); g.moveTo(box.x, box.y); g.lineTo(box.x, box.y + box.h); g.lineTo(box.x + box.w, box.y + box.h); g.stroke();

  // Peak guides are opt-in.  Live sampling panels already reveal the measured curve in time;
  // dashed peak bars competed with that trace and falsely suggested a discrete trigger.
  if(options.eventLines===true){const events=options.eventTimes||[];g.setLineDash([2*k,4*k]);g.lineWidth=.7*k;
    events.forEach((eventTime)=>{const x=X(eventTime);if(x<box.x||x>box.x+box.w)return;
      g.strokeStyle=color;g.globalAlpha=alpha*.24;g.beginPath();g.moveTo(x,box.y);g.lineTo(x,box.y+box.h);g.stroke();});g.setLineDash([]);}

  // Numeric axes make the independent arterial and tissue scales explicit.
  g.fillStyle = lo; g.globalAlpha = alpha * .86; g.font = fontOf(Math.max(k, .76), 7.2);
  g.textBaseline = "middle"; g.textAlign = "right";
  for (const f of [0, .5, 1]) { const value = yMin + ySpan * f, y = Y(value); write('y-tick-'+f,curveTick(value, yMax), box.x - 5 * k, y); }
  g.textBaseline = "top"; g.textAlign = "center";
  for (const f of [0, .5, 1]) { const value = xMin + xSpan * f; write('x-tick-'+f,String(Math.round(value)), X(value), box.y + box.h + 5 * k); }
  g.textAlign = "right"; write('x',"time (s)", box.x + box.w, box.y + box.h + 17 * k);
  g.textAlign = "left"; if(options.unit)write('unit',options.unit, box.x + 4 * k, box.y + 4 * k);

  const lineValues=options.smooth?smoothMeasuredCurve(values,Number(options.smoothPasses??2)):values;
  g.save();g.beginPath();g.rect(box.x-2*k,box.y-7*k,box.w+4*k,box.h+9*k);g.clip();
  if(options.preview){g.save();g.strokeStyle=color;g.globalAlpha=alpha*Number(options.previewAlpha??.24);g.lineWidth=1.0*k;
    g.setLineDash([4*k,4*k]);g.beginPath();for(let i=0;i<count;i++){const x=X(plotTime(i)),y=Y(lineValues[i]);if(!i)g.moveTo(x,y);else g.lineTo(x,y);}g.stroke();g.restore();}
  const stopTime = xMin + xSpan * clamp01(upto);
  let n = 0; while (n < count && plotTime(n) <= stopTime + 1e-9) n++;
  n = Math.min(count, n);
  if(n>=2){g.globalAlpha = alpha; g.strokeStyle = color; g.shadowColor = color; g.shadowBlur = 6 * k; g.lineWidth = 2.1 * k;
    g.beginPath();for (let i = 0; i < n; i++) { const x = X(plotTime(i)), y = Y(lineValues[i]); if (!i) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke(); g.shadowBlur = 0;}
  if(n>=1){const dotStride=Math.max(1,Math.floor(n/38));g.fillStyle=color;g.globalAlpha=alpha*.58;
    for(let i=0;i<n;i+=dotStride){g.beginPath();g.arc(X(plotTime(i)),Y(values[i]),.62*k,0,TAU);g.fill();}}
  g.restore();
  g.globalAlpha=alpha;g.fillStyle = hi; g.font = fontOf(Math.max(k, 0.86), options.titleSize??10.6); g.textAlign = "left"; g.textBaseline = "bottom";
  write('title',label, box.x, box.y - 7 * k);
  g.restore();
}

/** Display-order proxy for an EPI acquisition: superior slices descend through the volume;
 * within each slice, rows alternate left-to-right and right-to-left.  The ordering is built
 * once from the displayed subject's bounded 1,574-voxel sample, never from the full image. */
function patientEpiSweep() {
  if (!PATIENT) return null;
  if (PATIENT._epiSweep) return PATIENT._epiSweep;
  const V=PATIENT.V,slices=new Map(),keyOf=(v)=>Math.round(v*10000);
  for(let i=0;i<PATIENT.nv;i++){const j=i*3,z=keyOf(V[j+2]);if(!slices.has(z))slices.set(z,[]);slices.get(z).push(i);}
  const order=[],sliceRows=[];
  [...slices.entries()].sort((a,b)=>b[0]-a[0]).forEach(([zKey,indices],sliceIndex)=>{
    const rows=new Map();indices.forEach(i=>{const y=keyOf(V[i*3+1]);if(!rows.has(y))rows.set(y,[]);rows.get(y).push(i);});
    const start=order.length;
    [...rows.entries()].sort((a,b)=>a[0]-b[0]).forEach(([,row],rowIndex)=>{
      row.sort((a,b)=>V[a*3]-V[b*3]);if((rowIndex+sliceIndex)&1)row.reverse();order.push(...row);
    });
    sliceRows.push({z:zKey/10000,start,end:order.length});
  });
  PATIENT._epiSweep={order:Int32Array.from(order),slices:sliceRows};
  return PATIENT._epiSweep;
}

/** Re-express the measured tissue response with the current voxel's real parcelwise Patlak
 * parameters.  This is deliberately a display transform of the measured two-bolus curve—not
 * fabricated patient time-series data—and it reuses one bounded typed-array per trace. */
function fillVoxelTissueResponse(target,voxelIndex,base,timeS) {
  const row=PATIENT?.segments?.[PATIENT.voxSeg[voxelIndex]]||{},ki=Number(row.ki),vb=Number(row.vb),
    kiN=clamp01((Number.isFinite(ki)?ki:0.06)/.24),vbN=clamp01(((Number.isFinite(vb)?vb:2.6)-1.5)/3.7),
    jitter=hash01(voxelIndex,41,7),gain=.72+.47*vbN+.08*(jitter-.5),delay=Math.round((jitter-.5)*3),
    events=PATIENT?.curves?.bolus_peak_time_s||[],peak=Math.max(1e-9,...base.map(v=>Number(v)||0));
  for(let n=0;n<target.length;n++){const source=Math.max(0,Math.min(base.length-1,n-delay)),time=Number(timeS[n]??n);
    let retained=0;for(const event of events){const dt=time-Number(event);if(dt>0)retained+=(1-Math.exp(-dt/10))*Math.exp(-dt/155);}
    target[n]=Math.max(0,(Number(base[source])||0)*gain+peak*(.012+.060*kiN)*retained);
  }
  return {ki:Number.isFinite(ki)?ki:0,vb:Number.isFinite(vb)?vb:0};
}

function drawCurveTraceOnly(g,box,timeS,values,color,alpha,k,yMax){
  if(!values?.length||alpha<=.001)return;const count=Math.min(values.length,timeS?.length||values.length),
    xMin=Number(timeS?.[0]??0),xMax=Math.max(xMin+1e-6,Number(timeS?.[count-1]??count-1)),top=Math.max(1e-9,Number(yMax)||1);
  g.save();g.strokeStyle=color;g.globalAlpha=alpha;g.lineWidth=.72*k;g.beginPath();for(let i=0;i<count;i++){
    const x=box.x+(Number(timeS?.[i]??i)-xMin)/(xMax-xMin)*box.w,y=box.y+box.h-clamp01((Number(values[i])||0)/top)*box.h;
    if(!i)g.moveTo(x,y);else g.lineTo(x,y);}g.stroke();g.restore();
}

function dottedSphere(g, p, R, color, seed, k, alpha = 1) {
  g.save(); g.fillStyle = color;
  for (let i = 0; i < 150; i++) {
    const u = hash01(i, seed, 1), v = hash01(i, seed, 2);
    const rr = Math.sqrt(u) * R, ang = v * TAU;
    const depth = Math.sqrt(Math.max(0, 1 - u));
    g.globalAlpha = alpha * (0.28 + 0.70 * depth);
    g.beginPath(); g.arc(p[0] + Math.cos(ang) * rr, p[1] + Math.sin(ang) * rr,
                         (0.64 + 0.65 * depth) * k, 0, TAU); g.fill();
  }
  g.restore();
}

/** Project and draw one microscopy-traced SWC morphology as a dotted arbor. */
function drawTracedMorphology(g, cell, center, scale, t, color, alpha, k, a = {}) {
  if (!cell || alpha <= .01) return { soma:center, terminals:[] };
  const yaw = Number(a.yaw ?? 0) + (a.still ? 0 : t * Number(a.spin ?? .045) * TAU);
  const tilt = Number(a.tilt ?? -.18), roll = Number(a.roll ?? 0);
  const cy=Math.cos(yaw),sy=Math.sin(yaw),ct=Math.cos(tilt),st=Math.sin(tilt),cr=Math.cos(roll),sr=Math.sin(roll);
  const X=new Float32Array(cell.n),Y=new Float32Array(cell.n),D=new Float32Array(cell.n);
  for(let i=0;i<cell.n;i++){
    const j=i*3,x0=cell.P[j],y0=cell.P[j+1],z0=cell.P[j+2];
    const x1=x0*cr-y0*sr,y1=x0*sr+y0*cr;
    const xr=x1*cy-z0*sy,zr=x1*sy+z0*cy;
    const yr=y1*ct-zr*st,d=y1*st+zr*ct;
    X[i]=center[0]+xr*scale;Y[i]=center[1]-yr*scale;D[i]=d;
  }
  // A fixed screen-space roll is useful for strongly planar reconstructions whose clearest
  // anatomical face is otherwise aligned with the slide gutter.  It never changes with time.
  const screenAngle=Number(a.screenAngle??0);
  if(screenAngle){const cs=Math.cos(screenAngle),ss=Math.sin(screenAngle);
    for(let i=0;i<cell.n;i++){const px=X[i]-center[0],py=Y[i]-center[1];
      X[i]=center[0]+px*cs-py*ss;Y[i]=center[1]+px*ss+py*cs;}}
  const somaIndex=Math.max(0,cell.type.findIndex(v=>v===1));
  /* Attach a real terminal of the reconstructed arbor directly to its target.  Earlier the
   * renderer drew an invented Bézier "arm" between a free-floating reconstruction and the
   * vessel.  Translating the whole 3-D morphology so one of its own terminal processes ends
   * at the endfoot preserves the traced topology: the connection is now intrinsic. */
  let anchorIndex = -1;
  const riggedAnchors=[];
  if(Array.isArray(a.anchorTargets)&&a.anchorTargets.length){
    // Rig several genuine terminal-to-soma paths onto distinct endfoot territories.  The soma
    // remains fixed; displacement grows smoothly along each traced branch and reaches 100% only
    // at its own terminal.  Shared proximal branches average their pulls instead of tearing.
    const direction=String(a.anchorDirection||"down").toLowerCase(),used=new Set();
    const ox=new Float32Array(cell.n),oy=new Float32Array(cell.n),ow=new Float32Array(cell.n);
    for(const target of a.anchorTargets){
      if(!Array.isArray(target))continue;let chosen=-1,best=-Infinity;
      for(let i=0;i<cell.n;i++){
        if(cell.children[i]!==0||used.has(i))continue;
        const reach=direction==="up"?center[1]-Y[i]:Y[i]-center[1];
        const lateral=Math.abs(X[i]-target[0]);
        const score=reach*1.35-lateral*.48;
        if(score>best){best=score;chosen=i;}
      }
      if(chosen<0)continue;used.add(chosen);
      const dx=target[0]-X[chosen],dy=target[1]-Y[chosen],path=[];
      for(let n=chosen;n>=0&&path.length<cell.n;n=cell.parent[n]){path.push(n);if(n===somaIndex)break;}
      const denom=Math.max(1,path.length-1);
      path.forEach((n,j)=>{const w=Math.pow(1-j/denom,1.35);ox[n]+=dx*w;oy[n]+=dy*w;ow[n]+=1;});
      riggedAnchors.push([target[0],target[1],chosen]);
    }
    for(let i=0;i<cell.n;i++)if(ow[i]>0){X[i]+=ox[i]/ow[i];Y[i]+=oy[i]/ow[i];}
  } else if (Array.isArray(a.anchorTarget)) {
    const direction = String(a.anchorDirection || "down").toLowerCase();
    let best = -Infinity;
    for (let i = 0; i < cell.n; i++) {
      if (cell.children[i] !== 0) continue;
      const reach = direction === "up" ? center[1] - Y[i] : Y[i] - center[1];
      const lateral = Math.abs(X[i] - a.anchorTarget[0]);
      const score = reach - lateral * .20;
      if (score > best) { best = score; anchorIndex = i; }
    }
    if (anchorIndex >= 0) {
      const sx = a.anchorTarget[0] - X[anchorIndex], sy = a.anchorTarget[1] - Y[anchorIndex];
      for (let i = 0; i < cell.n; i++) { X[i] += sx; Y[i] += sy; }
    }
  }
  const edges=[];for(let i=0;i<cell.n;i++)if(cell.parent[i]>=0)edges.push(i);
  edges.sort((a0,b0)=>((D[a0]+D[cell.parent[a0]])-(D[b0]+D[cell.parent[b0]])));
  const lineScale=Math.max(.5,Number(a.lineScale??1)),nodeScale=Math.max(.5,Number(a.nodeScale??1));
  g.save();g.lineCap="round";g.lineJoin="round";
  for(const i of edges){const p=cell.parent[i],depth=clamp01(.48+(D[i]+D[p])*.34);
    g.strokeStyle=color;g.globalAlpha=alpha*(.22+.70*depth);
    g.lineWidth=Math.max(.48*k,Math.min(3.0*k,cell.R[i]*scale*.68))*lineScale;
    g.beginPath();g.moveTo(X[p],Y[p]);g.lineTo(X[i],Y[i]);g.stroke();
  }
  // Sparse luminous nodes retain Spiral's point-field language without turning branches into beads.
  g.fillStyle=color;
  for(let i=0;i<cell.n;i+=2){const depth=clamp01(.48+D[i]*.68);g.globalAlpha=alpha*(.24+.64*depth);
    const rr=(cell.type[i]===1?1.75:.55+.45*depth)*k*nodeScale;
    g.beginPath();g.arc(X[i],Y[i],rr,0,TAU);g.fill();}
  const soma=[X[somaIndex],Y[somaIndex]];g.globalAlpha=alpha*.96;g.shadowColor=color;g.shadowBlur=5*k;
  g.beginPath();g.arc(soma[0],soma[1],Number(a.somaRadius??4.6)*k,0,TAU);g.fill();g.shadowBlur=0;g.restore();
  const terminals=[];for(let i=0;i<cell.n;i++)if(cell.children[i]===0)terminals.push([X[i],Y[i],D[i],i]);
  return {soma,terminals,anchor:anchorIndex>=0?[X[anchorIndex],Y[anchorIndex]]:null,anchors:riggedAnchors};
}

/**
 * Native neurovascular unit.  The vessel is deliberately anatomical before it is decorative:
 * flattened endothelial cells form one lumen, a mural pericyte runs longitudinally outside it,
 * and separate astrocytic endfoot territories almost invest the abluminal surface.  Dots supply
 * the deck's texture, while broad silhouettes keep every cell identity readable at projector size.
 */
function drawNVU3D(g, box, t, alpha, k) {
  if (alpha <= 0.01) return;
  const arterial = cssVar("--accent", "#D97757"), venous = "#6FB8C8", green = "#78BA8D";
  const greenDark = "#416F55", orange = "#E6A05F", yellow = "#F0C85A", teal = "#63B7B1";
  const hi = cssVar("--hi", "#F9F9F7"), bg = cssVar("--bg", "#171818");
  // A human capillary is narrow relative to the domains of the surrounding glia.  Keeping
  // this lumen slender gives the traced cells enough visual territory to read at lecture size.
  const R = Math.min(box.w, box.h) * .046;
  const x0 = box.x + box.w * .16, x1 = box.x + box.w * .86;
  const y0 = box.y + box.h * .52, y1 = box.y + box.h * .47;
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  const Q = (u, v = 0) => {
    const bow = Math.sin(u * Math.PI) * 4.0 * k;
    return [x0 + dx * u + nx * (v * R + bow), y0 + dy * u + ny * (v * R + bow)];
  };
  const capsule = (radius, fill, opacity = 1) => {
    const a = Q(0, 0), b = Q(1, 0);
    g.save(); g.globalAlpha = alpha * opacity; g.strokeStyle = fill; g.lineCap = "round";
    g.lineWidth = radius * 2; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.restore();
  };
  const tapered = (from, c1, c2, to, color, width, opacity = 1) => {
    g.save(); g.strokeStyle = color; g.globalAlpha = alpha * opacity; g.lineCap = "round";
    g.lineWidth = width * k; g.beginPath(); g.moveTo(from[0], from[1]);
    g.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], to[0], to[1]); g.stroke();
    g.globalAlpha = alpha * opacity * .78; g.lineWidth = Math.max(.8, width * .15) * k;
    g.setLineDash([1.1*k, 3.1*k]); g.stroke(); g.restore();
  };
  const organicSoma = (p, rx, ry, color, seed, nucleus = true) => {
    g.save(); g.fillStyle = color; g.globalAlpha = alpha * .88;
    g.beginPath();
    const points = 18;
    for (let i = 0; i <= points; i++) {
      const a = i / points * TAU, rr = .84 + hash01(i % points, seed, 2) * .28;
      const x = p[0] + Math.cos(a) * rx * rr * k, y = p[1] + Math.sin(a) * ry * rr * k;
      if (!i) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath(); g.fill();
    if (nucleus) {
      g.fillStyle = bg; g.globalAlpha = alpha * .58; g.beginPath();
      g.ellipse(p[0] - rx*.08*k, p[1], rx*.38*k, ry*.34*k, -.18, 0, TAU); g.fill();
    }
    g.restore();
    dottedSphere(g, p, Math.min(rx, ry) * .90 * k, color, seed + 80, k, alpha * .58);
  };
  const branchCell = (p, color, seed, kind) => {
    const arms = kind === "microglia" ? 8 : 6, base = kind === "microglia" ? 6.2 : 9.2;
    organicSoma(p, base, base * (kind === "microglia" ? .72 : .88), color, seed, true);
    for (let i = 0; i < arms; i++) {
      const a = i / arms * TAU + seed * .19;
      const len = (kind === "microglia" ? 25 : 32) * (.78 + hash01(i, seed, 9) * .44) * k;
      const bend = (hash01(i, seed, 4) - .5) * .55;
      const p1 = [p[0] + Math.cos(a) * len*.42, p[1] + Math.sin(a) * len*.42];
      const p2 = [p[0] + Math.cos(a+bend) * len, p[1] + Math.sin(a+bend) * len];
      dotPolyline(g, [p, p1, p2], color, kind === "microglia" ? .63*k : .76*k, alpha*.83, 3.0*k);
      const forks = kind === "microglia" ? 2 : (i % 2 ? 1 : 2);
      for (let f = 0; f < forks; f++) {
        const fa = a + bend + (f ? .43 : -.43), fl = len * (kind === "microglia" ? .43 : .34);
        dotPolyline(g, [p2, [p2[0]+Math.cos(fa)*fl,p2[1]+Math.sin(fa)*fl]], color,
          kind === "microglia" ? .48*k : .58*k, alpha*.68, 3.25*k);
      }
    }
  };
  const endfoot = (u0, u1, side, seed, opacity = .84) => {
    const outer = 1.40+(hash01(seed,7,3)-.5)*.46,inner=.97+(hash01(seed,2,8)-.5)*.07;
    const wobble = (hash01(seed, 4, 2)-.5)*.22;
    const padColor=["#6EA984","#82BA91","#5F9876"][Math.abs(seed)%3];
    const p0=Q(u0,side*inner),p1=Q(u1,side*inner),p2=Q(u1,side*(outer+wobble)),p3=Q(u0,side*(outer-wobble));
    g.save(); g.fillStyle=padColor; g.globalAlpha=alpha*opacity; g.strokeStyle=greenDark; g.lineWidth=.7*k;
    g.beginPath(); g.moveTo(p0[0],p0[1]);
    g.bezierCurveTo(...Q(mix(u0,u1,.34),side*(.94+wobble)),...Q(mix(u0,u1,.72),side*(1.01-wobble)),p1[0],p1[1]);
    g.quadraticCurveTo(...Q(u1,side*mix(inner,outer,.58)),p2[0],p2[1]);
    g.bezierCurveTo(...Q(mix(u0,u1,.70),side*(outer+.08)),...Q(mix(u0,u1,.30),side*(outer-.04)),p3[0],p3[1]);
    g.quadraticCurveTo(...Q(u0,side*mix(inner,outer,.50)),p0[0],p0[1]);g.closePath(); g.fill(); g.stroke();
    for(let i=0;i<16;i++){
      const u=mix(u0,u1,hash01(i,seed,5)),v=side*mix(1.04,outer,hash01(i,seed,6)),p=Q(u,v);
      g.fillStyle=hi;g.globalAlpha=alpha*.20;g.beginPath();g.arc(p[0],p[1],(.45+hash01(i,seed,7)*.45)*k,0,TAU);g.fill();
    }
    g.restore();
  };
  const label = (text, target, x, y, color, align = "left") => {
    g.save(); g.font=fontOf(Math.max(k,.88),10.2);g.textAlign=align;g.textBaseline="middle";
    const w=g.measureText(text).width, edge=x+(align==="left"?w+8*k:-w-8*k), elbow=edge+(align==="left"?11*k:-11*k);
    g.strokeStyle=color;g.fillStyle=color;g.globalAlpha=alpha*.82;g.lineWidth=1*k;
    g.beginPath();g.moveTo(target[0],target[1]);g.lineTo(elbow,y);g.lineTo(edge,y);g.stroke();
    g.globalAlpha=alpha*.98;g.beginPath();g.arc(target[0],target[1],1.55*k,0,TAU);g.fill();g.fillText(text,x,y);g.restore();
  };

  g.save();
  // Unequal territories from several astrocytes cover the far surface.  Different widths and
  // gaps keep this from reading as one decorative green sleeve.
  [[.03,.48,-1,1,.27],[.54,.98,-1,2,.34]]
    .forEach(d=>endfoot(d[0],d[1],d[2],d[3],d[4]));

  // Basement membrane, endothelial shell and a darker lumen retain the capillary's depth.
  capsule(R*1.02,"#CBBFA6",.36);
  const wall=g.createLinearGradient(x0,y0,x1,y1);wall.addColorStop(0,arterial);wall.addColorStop(.53,"#A68A88");wall.addColorStop(1,venous);
  capsule(R*.91,wall,.63); capsule(R*.59,bg,.54);

  // Six flattened endothelial territories with visible seams and nuclei.
  for(let i=0;i<6;i++){
    const ua=.025+i/6*.95,ub=.025+(i+1)/6*.95,top=i%2===0;
    const a0=Q(ua,top?-.82:.12),a1=Q(ub,top?-.82:.12),b1=Q(ub,top?-.10:.82),b0=Q(ua,top?-.10:.82);
    g.fillStyle=i<3?arterial:venous;g.globalAlpha=alpha*(top?.29:.40);g.beginPath();g.moveTo(...a0);
    g.bezierCurveTo(...Q(mix(ua,ub,.35),top?-.90:.08),...Q(mix(ua,ub,.72),top?-.82:.15),...a1);
    g.lineTo(...b1);g.bezierCurveTo(...Q(mix(ua,ub,.68),top?-.05:.88),...Q(mix(ua,ub,.30),top?-.12:.82),...b0);g.closePath();g.fill();
    const n=Q(mix(ua,ub,.53),top?-.48:.48);g.fillStyle=hi;g.globalAlpha=alpha*.58;g.beginPath();g.ellipse(n[0],n[1],5.2*k,2.15*k,-.08,0,TAU);g.fill();
    if(i){const seam=Q(ua,0);g.strokeStyle=hi;g.globalAlpha=alpha*.64;g.lineWidth=1*k;g.beginPath();g.moveTo(...Q(ua,-.78));g.quadraticCurveTo(seam[0],seam[1],...Q(ua,.78));g.stroke();}
  }

  // Red cells move within the lumen and change colour only to express arterial-to-venous transit.
  for(let i=0;i<8;i++){
    const u=(t*.085+i/8)%1,p=Q(u,(hash01(i,5,2)-.5)*.36);
    g.fillStyle=u<.58?arterial:venous;g.globalAlpha=alpha*.96;g.shadowColor=g.fillStyle;g.shadowBlur=3*k;
    g.beginPath();g.ellipse(p[0],p[1],4.1*k,2.0*k,-.08,0,TAU);g.fill();g.shadowBlur=0;
    g.fillStyle=bg;g.globalAlpha=alpha*.26;g.beginPath();g.ellipse(p[0],p[1],1.45*k,.65*k,-.08,0,TAU);g.fill();
  }

  // One mural pericyte: a compact nucleated soma, two thin longitudinal processes and short
  // circumferential branches that follow—not replace—the endothelial wall.
  const peri=Q(.61,1.10),periL=Q(.27,1.00),periR=Q(.94,1.00);
  tapered(peri,Q(.52,1.15),Q(.38,1.05),periL,orange,2.45,.88);
  tapered(peri,Q(.71,1.16),Q(.83,1.05),periR,orange,2.25,.88);
  [[.51,.08],[.64,-.06],[.76,.05]].forEach(([u,du],i)=>{
    const start=Q(u,1.02),end=Q(u+du,-.93);
    tapered(start,Q(u-.045,1.30),Q(u+du+.045,-1.28),end,orange,1.25,.48+i*.06);
  });
  organicSoma(peri,10.6,6.5,orange,68,true);

  // Four broad foreground endfeet—not evenly spaced beads—make the cellular territories clear.
  [[.02,.34,1,11,.76],[.39,.64,1,12,.86],[.70,.98,1,13,.70]]
    .forEach(d=>endfoot(d[0],d[1],d[2],d[3],d[4]));

  // The endfoot layer partly covers the mural cell in vivo, but its soma must remain visible
  // enough to identify the pericyte.  Re-state only the near surface of the same cell here.
  tapered(Q(.60,1.08),Q(.51,1.18),Q(.39,1.07),Q(.27,1.00),orange,1.85,.94);
  tapered(Q(.63,1.08),Q(.73,1.18),Q(.84,1.07),Q(.94,1.00),orange,1.70,.94);
  g.save();g.fillStyle=orange;g.globalAlpha=alpha*.96;g.strokeStyle=bg;g.lineWidth=.8*k;
  g.beginPath();g.ellipse(peri[0],peri[1],11.5*k,7.0*k,-.08,0,TAU);g.fill();g.stroke();
  g.fillStyle=bg;g.globalAlpha=alpha*.54;g.beginPath();g.ellipse(peri[0],peri[1],4.7*k,2.8*k,-.08,0,TAU);g.fill();g.restore();

  // Peer-reviewed microscopy reconstructions remain fixed in the voxel.  A traced terminal in
  // each astrocyte is anchored directly to an endfoot territory: no decorative connector is
  // added, and only the intravascular contents move.
  const cells=MORPHOLOGIES?.cells||{};
  const aTopCenter=[box.x+box.w*.30,box.y+box.h*.16],aBottomCenter=[box.x+box.w*.75,box.y+box.h*.82];
  const microCenter=[box.x+box.w*.20,box.y+box.h*.80],neuronCenter=[box.x+box.w*.82,box.y+box.h*.15];
  const topFeet=[Q(.16,-1.29),Q(.31,-1.38),Q(.46,-1.28)];
  const bottomFeet=[Q(.70,1.28),Q(.82,1.38),Q(.94,1.25)];
  const aTop=drawTracedMorphology(g,cells.astrocyte,aTopCenter,Math.min(box.w,box.h)*.200,t,green,alpha,k,
    {yaw:.55,tilt:-.30,roll:-.10,still:true,somaRadius:8.4,lineScale:1.15,nodeScale:1.08,
      anchorTargets:topFeet,anchorDirection:"down"});
  const aBottom=drawTracedMorphology(g,cells.astrocyte,aBottomCenter,Math.min(box.w,box.h)*.165,t,green,alpha*.92,k,
    {yaw:.12,tilt:.08,roll:0,screenAngle:3.05,still:true,somaRadius:7.8,lineScale:1.12,nodeScale:1.06,
      anchorTargets:bottomFeet,anchorDirection:"up"});
  // This reconstruction is strongly planar.  A fixed three-quarter projection exposes its
  // ramification; the previous near-edge-on view collapsed it into a misleading vertical line.
  const microMorph=drawTracedMorphology(g,cells.microglia,microCenter,Math.min(box.w,box.h)*.170,t,teal,alpha,k,
    {yaw:.05,tilt:.08,roll:0,screenAngle:-.58,still:true,somaRadius:5.2,lineScale:1.45,nodeScale:1.25});
  const neuronMorph=drawTracedMorphology(g,cells.neuron,neuronCenter,Math.min(box.w,box.h)*.225,t,yellow,alpha*.96,k,
    {yaw:.75,tilt:-.30,roll:-.20,still:true,somaRadius:5.6});

  // Guttered leaders never cross the central anatomy.
  label("astrocyte",aTop.soma,box.x+box.w*.02,box.y+box.h*.025,green,"left");
  label("microglia",microMorph.soma,box.x+box.w*.02,box.y+box.h*.92,teal,"left");
  label("neuron",neuronMorph.soma,box.x+box.w*.98,box.y+box.h*.07,yellow,"right");
  label("endothelium",Q(.91,-.55),box.x+box.w*.98,box.y+box.h*.36,arterial,"right");
  label("pericyte",peri,box.x+box.w*.98,box.y+box.h*.65,orange,"right");
  g.restore();
}

/**
 * CC-BY figure-derived reconstruction from Nizari et al. 2019 Fig. 2B. The published Imaris
 * surfaces are available only from the authors, so this view preserves the labelled projection
 * and uses its luminance shading for slight parallax without claiming recovered z anatomy.
 */
function drawNizariNVU(g,box,t,alpha,k){
  if(alpha<=.01||!NIZARI_NVU)return false;
  const palette={
    basement_membrane:"#5169D8",smooth_muscle:"#78BA8D",
    astrocyte_endfeet:"#63C2BE",cholinergic_fibre:cssVar("--accent","#D97757"),
  },order=["basement_membrane","smooth_muscle","astrocyte_endfeet","cholinergic_fibre"];
  const yaw=.18*Math.sin(t*.17),cy=Math.cos(yaw),sy=Math.sin(yaw),cx=box.x+box.w*.50,mid=box.y+box.h*.49,S=Math.min(box.w*.47,box.h*.48);
  g.save();
  for(const key of order){const group=NIZARI_NVU.groups[key];if(!group)continue;const P=group.P;
    g.fillStyle=palette[key];
    for(let i=0;i<group.n;i++){const j=i*4,x=P[j],y=P[j+1],z=P[j+2],bright=P[j+3],xr=x*cy+z*sy,zr=-x*sy+z*cy;
      const px=cx+xr*S,py=mid-y*S+zr*S*.18,near=clamp01(.48+zr*.95);
      g.globalAlpha=alpha*(.20+.60*bright)*(.58+.42*near);
      g.beginPath();g.arc(px,py,(.38+.92*bright+.24*near)*k,0,TAU);g.fill();}}
  const label=(text,x,y,color,align="left")=>{g.fillStyle=color;g.globalAlpha=alpha*.90;g.font=fontOf(Math.max(.86,k),9.4);g.textAlign=align;g.textBaseline="middle";g.fillText(text,x,y);};
  label("astrocyte + endfeet",box.x+8*k,box.y+13*k,palette.astrocyte_endfeet);
  label("cholinergic fibres",box.x+box.w-8*k,box.y+13*k,palette.cholinergic_fibre,"right");
  label("collagen IV basement membrane",box.x+8*k,box.y+box.h-16*k,palette.basement_membrane);
  label("smooth muscle",box.x+box.w-8*k,box.y+box.h-16*k,palette.smooth_muscle,"right");
  g.fillStyle=cssVar("--lo","#6E6C64");g.globalAlpha=alpha*.60;g.font=fontOf(Math.max(.82,k),8.4);g.textAlign="center";
  g.fillText("figure-derived surface projection · 5 μm scale · Nizari et al. 2019",cx,box.y+box.h-2*k);
  g.restore();return true;
}

function drawPatientParcelSurface(g,W,H,t,a={}){
  if(!PATIENT_SURFACE)return;const M=PATIENT_SURFACE,o=patientView(W,H,t,a),q=M.q,progress=clamp01(Number(a.sweep??0)),complete=progress>=.999,
    heightSweep=!!a.heightSweep,parcelOrderSweep=!!a.parcelOrderSweep,builtCount=complete?85:Math.max(0,Math.min(85,Math.floor(progress*85))),
    current=complete?85:Math.min(84,parcelOrderSweep?(M.parcelOrder?.[builtCount]??builtCount):Math.floor(progress*85)),depthN=12,colourN=18,neutral=colourN-1,
    paths=Array.from({length:depthN*colourN},()=>new Path2D());
  let zMin=Infinity,zMax=-Infinity;
  for(let i=0;i<M.nv;i++){const j=i*3,x=M.V[j]/q,y=M.V[j+1]/q,z=M.V[j+2]/q,p=projectBrainPoint([x,y,z],o);M.sx[i]=p.x;M.sy[i]=p.y;M.sd[i]=p.d;
    if(z<zMin)zMin=z;if(z>zMax)zMax=z;}
  const heightThreshold=mix(zMin,zMax,smooth(progress)),faceIsBuilt=(a0,b0,c0)=>complete||
    ((M.V[a0*3+2]+M.V[b0*3+2]+M.V[c0*3+2])/(3*q)<=heightThreshold);
  for(let f=0;f<M.nf;f++){const j=f*3,a0=M.F[j],b0=M.F[j+1],c0=M.F[j+2],si=M.FS[f],built=parcelOrderSweep?(complete||M.parcelRank[si]<builtCount):(!heightSweep||faceIsBuilt(a0,b0,c0));
    if((heightSweep||parcelOrderSweep)&&!built)continue;const done=heightSweep||parcelOrderSweep||complete||si<current,
      depth=(M.sd[a0]+M.sd[b0]+M.sd[c0])/3,b=Math.min(depthN-1,Math.max(0,Math.floor((depth+1.35)/2.70*depthN))),c=done?si%(colourN-1):neutral,P=paths[b*colourN+c];
    P.moveTo(M.sx[a0],M.sy[a0]);P.lineTo(M.sx[b0],M.sy[b0]);P.lineTo(M.sx[c0],M.sy[c0]);P.closePath();}
  const dark=[22,23,23],warm=[189,171,157],palette=Array.from({length:colourN-1},(_,i)=>rampAt(.10+(i/(colourN-2))*.84));g.save();
  for(let b=0;b<depthN;b++)for(let c=0;c<colourN;c++){const depthLight=.34+.56*b/(depthN-1),raw=c===neutral?warm:palette[c],rgb=raw.map((v,i)=>mix(dark[i],v,depthLight));
    g.fillStyle=`rgb(${rgb[0]|0},${rgb[1]|0},${rgb[2]|0})`;g.globalAlpha=c===neutral?.92:.94;g.fill(paths[b*colourN+c]);
    g.strokeStyle=c===neutral?"#403F3D":"#171919";g.globalAlpha=parcelOrderSweep?.018:(c===neutral?.24:.19);g.lineWidth=(parcelOrderSweep?.12:.30)*o.k;g.stroke(paths[b*colourN+c]);}
  // Before the build there is only a very faint subject-derived exterior guide. During the
  // reveal, even the wire follows the same inferior-to-superior face-height threshold.
  const wire=new Path2D(),wireStride=heightSweep?(progress<=0?7:5):parcelOrderSweep?5:3;for(let f=0;f<M.nf;f+=wireStride){const j=f*3,a0=M.F[j],b0=M.F[j+1],c0=M.F[j+2],si=M.FS[f];
    if(heightSweep&&progress>0&&!faceIsBuilt(a0,b0,c0))continue;wire.moveTo(M.sx[a0],M.sy[a0]);wire.lineTo(M.sx[b0],M.sy[b0]);wire.lineTo(M.sx[c0],M.sy[c0]);wire.closePath();}
  if(!parcelOrderSweep){g.strokeStyle="#D89B7F";g.globalAlpha=heightSweep?(progress<=0?.075:.095):.23;g.lineWidth=(heightSweep&&progress<=0?.34:.44)*o.k;g.stroke(wire);}
  if(progress>0){const boundaries=new Path2D();for(let i=0;i<M.boundary.length;i+=4){const a0=M.boundary[i],b0=M.boundary[i+1],sa=M.boundary[i+2],sb=M.boundary[i+3];
      if(heightSweep){if(!complete&&(M.V[a0*3+2]+M.V[b0*3+2])/(2*q)>heightThreshold)continue;}
      else if(parcelOrderSweep){if(!complete&&(M.parcelRank[sa]>=builtCount||M.parcelRank[sb]>=builtCount))continue;}
      else if(!complete&&Math.max(sa,sb)>=current)continue;boundaries.moveTo(M.sx[a0],M.sy[a0]);boundaries.lineTo(M.sx[b0],M.sy[b0]);}
    g.strokeStyle="#EEE8DE";g.globalAlpha=(heightSweep||parcelOrderSweep)?.30:.54;g.lineWidth=((heightSweep||parcelOrderSweep)?.56:.72)*o.k;g.stroke(boundaries);
    if(!complete&&!heightSweep&&!parcelOrderSweep){const j=current*3,p=projectBrainPoint([M.centroids[j],M.centroids[j+1],M.centroids[j+2]],o);g.strokeStyle="#F0C85A";g.globalAlpha=.96;g.lineWidth=1.2*o.k;
      g.beginPath();g.arc(p.x,p.y,7.5*o.k,0,TAU);g.stroke();}
    if(!complete&&heightSweep){const p0=projectBrainPoint([-1.02,0,heightThreshold],o),p1=projectBrainPoint([1.02,0,heightThreshold],o);g.strokeStyle="#F0C85A";g.globalAlpha=.72;
      g.lineWidth=.9*o.k;g.setLineDash([3*o.k,5*o.k]);g.beginPath();g.moveTo(p0.x,p0.y);g.lineTo(p1.x,p1.y);g.stroke();g.setLineDash([]);}}
  if(a.showLabel!==false){const hi=cssVar("--hi","#F9F9F7");g.textAlign="center";g.textBaseline="top";g.font=fontOf(Math.max(o.k,.88),10.4);
    if(parcelOrderSweep){const si=complete?null:M.parcelOrder?.[Math.max(0,builtCount-1)],name=(M.segments?.[si]?.label||"").replace(/^ctx-[lr]h-/i,"").replace(/[-_]+/g," ");g.fillStyle=hi;g.globalAlpha=progress<=0?0:.96;
      g.fillText(complete?"85 complete parcels · one subject-specific anatomy":`${builtCount} / 85 · ${name}`,W*.5,H*.91);}
    else if(heightSweep){const builtLabels=complete?85:M.segments.reduce((n,s,i)=>n+(M.centroids[i*3+2]<=heightThreshold?1:0),0);g.fillStyle=hi;g.globalAlpha=progress<=0?.58:.96;
      g.fillText(progress<=0?"same participant · faint T1w exterior guide":complete?"85 analysis labels · subject-specific mesh complete":`${builtLabels} / 85 labels reached · inferior → superior`,W*.5,H*.91);}
    else if(progress<=0){g.fillStyle=hi;g.globalAlpha=.64;g.fillText("same participant · continuous T1w-derived exterior",W*.5,H*.91);}
    else {const s=complete?null:M.segments[current],name=(s?.label||"").replace(/^ctx-[lr]h-/i,"").replace(/[-_]+/g," ");g.fillStyle=hi;g.globalAlpha=.96;
      g.fillText(complete?"85 analysis labels · one subject-specific anatomy":`${current+1} / 85 · ${name}`,W*.5,H*.91);}}
  g.restore();return o;
}

/** Reveal parcellation as a soft anatomical registration over an already complete surface.
 *
 * The earlier bridge constructed the brain by adding isolated triangle groups.  Although the
 * labels were real, the moving frontier looked like a low-poly object being assembled.  This
 * version keeps the subject-derived exterior present throughout and cross-fades the complete
 * registered label field over it.  No individual mesh face is ever presented as an anatomical
 * unit, and no triangular construction frontier is drawn. */
function drawPatientSegmentationReveal(g,W,H,t,a={}){
  if(!PATIENT_SURFACE)return;const M=PATIENT_SURFACE,o=patientView(W,H,t,a),q=M.q,
    progress=clamp01(Number(a.progress??0)),depthN=9,colourN=17,alphaN=7,
    basePaths=Array.from({length:depthN},()=>new Path2D()),
    colourPaths=Array.from({length:depthN*colourN*alphaN},()=>new Path2D());
  for(let i=0;i<M.nv;i++){const j=i*3,x=M.V[j]/q,y=M.V[j+1]/q,z=M.V[j+2]/q,p=projectBrainPoint([x,y,z],o);
    M.sx[i]=p.x;M.sy[i]=p.y;M.sd[i]=p.d;}
  const revealAt=()=>progress<=.001?0:smooth(progress),
    addFace=(path,a0,b0,c0)=>{path.moveTo(M.sx[a0],M.sy[a0]);path.lineTo(M.sx[b0],M.sy[b0]);path.lineTo(M.sx[c0],M.sy[c0]);path.closePath();};
  for(let f=0;f<M.nf;f++){const j=f*3,a0=M.F[j],b0=M.F[j+1],c0=M.F[j+2],si=M.FS[f],
      depth=(M.sd[a0]+M.sd[b0]+M.sd[c0])/3,db=Math.min(depthN-1,Math.max(0,Math.floor((depth+1.35)/2.70*depthN)));
    addFace(basePaths[db],a0,b0,c0);const reveal=revealAt();
    if(reveal<=.012)continue;const ab=Math.min(alphaN-1,Math.max(0,Math.round(reveal*(alphaN-1)))),cb=si%colourN;
    addFace(colourPaths[(db*colourN+cb)*alphaN+ab],a0,b0,c0);}
  const dark=[23,24,24],neutral=[156,151,145],palette=Array.from({length:colourN},(_,i)=>rampAt(.10+i/(colourN-1)*.84));
  g.save();
  for(let db=0;db<depthN;db++){const light=.31+.57*db/(depthN-1),rgb=neutral.map((v,i)=>mix(dark[i],v,light));
    g.fillStyle=`rgb(${rgb[0]|0},${rgb[1]|0},${rgb[2]|0})`;g.globalAlpha=.90;g.fill(basePaths[db]);}
  for(let db=0;db<depthN;db++)for(let cb=0;cb<colourN;cb++){const light=.36+.58*db/(depthN-1),raw=palette[cb],rgb=raw.map((v,i)=>mix(dark[i],v,light));g.fillStyle=`rgb(${rgb[0]|0},${rgb[1]|0},${rgb[2]|0})`;
    for(let ab=0;ab<alphaN;ab++){const u=ab/(alphaN-1);if(u<=0)continue;g.globalAlpha=.16+.78*u;g.fill(colourPaths[(db*colourN+cb)*alphaN+ab]);}}
  g.textAlign="center";g.textBaseline="top";g.font=fontOf(Math.max(o.k,.88),10.4);g.fillStyle=cssVar("--hi","#F9F9F7");g.globalAlpha=.94;
  g.fillText(progress<=.001?"same participant · continuous T1w-derived exterior":progress>=.999?"85 registered analysis labels · one continuous anatomy":"registered labels follow the anatomical surface",W*.5,H*.91);
  g.restore();return o;
}

function drawPatientParcels(g, W, H, t, a = {}) {
  if (!PATIENT) return;
  const o = patientView(W, H, t, a), P = PATIENT.P, N = PATIENT.N, seg = PATIENT.seg;
  const layerAlpha = clamp01(Number(a.alpha ?? 1));
  const sweep = clamp01(Number(a.sweep ?? 0)), complete=sweep>=.999;
  const current = complete ? 85 : Math.min(84, Math.floor(sweep * 85));
  const bins = Array.from({length:80},()=>[]);
  for(let i=0;i<PATIENT.n;i++){
    const j=i*3,x=P[j]*o.cy-P[j+1]*o.sy,yr=P[j]*o.sy+P[j+1]*o.cy;
    const z=yr*o.st+P[j+2]*o.ct,d=-(yr*o.ct-P[j+2]*o.st),b=Math.max(0,Math.min(79,((d+1)*39.5)|0));
    bins[b].push(i,x,z,d);
  }
  const accent=cssVar("--accent","#D97757"),exceptionColour=a.exceptionColor||"#E45B5B";
  const exceptionIds=new Set((a.exceptionIds||[]).map(Number));
  const isException=(si)=>exceptionIds.has(Number(PATIENT.segments[si]?.id));
  const metric=a.metric&&["ki","vb","cbf","cbv","mtt","combined"].includes(a.metric)?a.metric:null;
  const effectMetric=a.effectMetric&&["ki","vb"].includes(a.effectMetric)&&STUDY2_PARCELS?a.effectMetric:null;
  const sweepEffect=!!a.sweepEffect&&!!effectMetric;
  const auditEffect=!!a.auditEffect&&!!effectMetric;
  const finalAudit=!!a.finalAudit&&!!effectMetric;
  const range=(key)=>{const v=PATIENT.segments.map(s=>Number(s[key])).filter(Number.isFinite);
    return [v.length?Math.min(...v):0,v.length?Math.max(...v):1];};
  const [kiLo,kiHi]=range("ki"),[vbLo,vbHi]=range("vb"),metricRange=metric&&metric!=="combined"?range(metric):[0,1];
  const metricColours={ki:[217,119,87],vb:[111,184,200],cbf:[240,200,90],cbv:[120,186,141],mtt:[184,156,255]};
  const kiColour=metricColours.ki,vbColour=metricColours.vb,baseColour=[30,31,31];
  // Parcel audit colours must remain readable from the back of a room.  Keep untouched
  // anatomy identical to the baseline, but give visited decreases/increases enough chroma
  // to survive the point-surface shading and projector contrast loss.
  const lowerColour=[63,145,213],significantLowerColour=[42,91,158],higherColour=[235,104,73],zeroColour=[105,108,106];
  const unit=(value,lo,hi)=>Number.isFinite(value)?clamp01((value-lo)/Math.max(1e-9,hi-lo)):.5;
  for(const row of bins)for(let m=0;m<row.length;m+=4){
    const i=row[m],si=seg[i],j=i*3,nx=N[j],ny=N[j+1],nz=N[j+2],nyr=nx*o.sy+ny*o.cy;
    const face=Math.max(0,-(nyr*o.ct-nz*o.st)),seen=.08+.92*face*face;
    const done=sweep>0&&(complete||si<current), active=sweep>0&&!complete&&si===current;
    const hue=(si*.61803398875)%1,baseRgb=rampAt(.24+hue*.72);
    let rgb,effectSig=false,effectDifference=NaN,effectQ=NaN;
    if(effectMetric){
      // These are cohort contrasts painted onto one participant's anatomy, not that
      // participant's measurements. Each metric has its own symmetric zero-centred range.
      const parcelId=Number(PATIENT.segments[si]?.id),effect=STUDY2_PARCELS.byId.get(parcelId)?.[effectMetric];
      const difference=Number(effect?.difference),magnitude=Number.isFinite(difference)
        ?clamp01(Math.abs(difference)/STUDY2_PARCELS.scale[effectMetric]):0;
      effectDifference=difference;effectQ=Number(effect?.q_fdr);effectSig=effectQ<.05;
      const target=difference<0?lowerColour:difference>0?higherColour:zeroColour;
      rgb=mixRgb(zeroColour,target,.66+.34*magnitude);
    }else if(metric==="combined"){
      const ku=unit(Number(PATIENT.segments[si]?.ki),kiLo,kiHi),vu=unit(Number(PATIENT.segments[si]?.vb),vbLo,vbHi);
      const sum=Math.max(.001,ku+vu),mixed=kiColour.map((v,j)=>(v*ku+vbColour[j]*vu)/sum),light=.68+.30*(ku+vu)*.5;
      rgb=mixed.map((v,j)=>mix(baseColour[j],v,light));
    }else if(metric){
      const mv=Number(PATIENT.segments[si]?.[metric]),mu=unit(mv,metricRange[0],metricRange[1]);
      const col=metricColours[metric]||vbColour;rgb=col.map((v,j)=>mix(baseColour[j],v,.52+.48*mu));
    }else rgb=baseRgb;
    const exception=isException(si),auditColour=effectDifference>0&&effectSig?"#F05B56":`rgb(${rgb[0]|0},${rgb[1]|0},${rgb[2]|0})`,
      finalColour=effectSig?(effectDifference<0?significantLowerColour:effectDifference>0?higherColour:zeroColour):zeroColour;
    g.fillStyle=finalAudit?`rgb(${finalColour[0]|0},${finalColour[1]|0},${finalColour[2]|0})`:
      auditEffect?((active||done)?auditColour:`rgb(${baseRgb[0]|0},${baseRgb[1]|0},${baseRgb[2]|0})`):
      sweepEffect&&(active||done)?`rgb(${rgb[0]|0},${rgb[1]|0},${rgb[2]|0})`:
      exception&&(active||done)?exceptionColour:active?accent:done?"#777874":`rgb(${rgb[0]|0},${rgb[1]|0},${rgb[2]|0})`;
    // Entering an audit must not wash out anatomy that has not been visited yet.
    // Statistical confidence modulates only the active/completed parcel, while every
    // untouched parcel retains the exact colour, size and opacity of the baseline brain.
    g.globalAlpha=layerAlpha*(finalAudit?(effectSig?.98:.90):auditEffect?(active?.98:done?(effectSig?.96:.88):.86):
      sweepEffect&&done?.78:exception&&done?.96:active?.98:done?.16:.86)*seen;
    g.beginPath();g.arc(o.ox+row[m+1]*o.S,o.oy-row[m+2]*o.S,(finalAudit?(effectSig?1.76:1.48):auditEffect?(active?2.35:done?(effectSig?1.68:1.48):1.34):
      exception&&done?2.18:active?2.35:sweepEffect&&done?1.62:1.34)*o.k,0,TAU);g.fill();
  }
  g.globalAlpha=1;
  if(sweep>0&&a.sweepLabel!==false){
    const s=complete?null:PATIENT.segments[current],visited=complete?85:current+1;
    const lower=Array.from({length:visited},(_,i)=>i).filter(i=>!isException(i)).length;
    g.fillStyle=cssVar("--hi","#F9F9F7");
    g.globalAlpha=layerAlpha;
    g.font=fontOf(Math.max(o.k,.9),11);g.textAlign="center";g.textBaseline="top";
    if(sweepEffect||auditEffect){let higher=0,lowerEffect=0,significant=0;for(let i=0;i<visited;i++){const id=Number(PATIENT.segments[i]?.id),effect=STUDY2_PARCELS.byId.get(id)?.[effectMetric],d=Number(effect?.difference),q=Number(effect?.q_fdr);
        if(d>0)higher++;else if(d<0)lowerEffect++;if(q<.05)significant++;}
      const activeEffect=s?STUDY2_PARCELS.byId.get(Number(s.id))?.[effectMetric]:null,q=Number(activeEffect?.q_fdr),qText=Number.isFinite(q)?(q>0&&q<.001?"< .001":q.toFixed(3)):"—",name=(s?.label||"").replace(/^ctx-[lr]h-/,"").replace(/[-_]+/g," ");
      const labelY=Number(a.sweepLabelY??Math.min(H-45*o.k,o.oy+o.S*.84));
      g.fillText(complete?`${higher} higher · ${lowerEffect} lower · ${significant} / 85 survive FDR`:
        `${visited} / 85 · ${name} · q = ${qText}`,o.ox,labelY);
    }else {const labelY=Number(a.sweepLabelY??Math.min(H-45*o.k,o.oy+o.S*.84));
      g.fillText(complete?`${lower} / 85 parcels lower`:`${lower} / 85 lower · ${(s?.label||"").replace(/^ctx-[lr]h-/,"").replace(/[-_]+/g," ")}`,o.ox,labelY);}
  }
}

// ── native articulated concussion opening ──────────────────────────────────

let RUNNER_VIDEO=null,runnerVideoPending=null,RUNNER_VIDEO_FRAME=null,RUNNER_VIDEO_STEP=-1;
let RUNNER_HEAD_TRACK=null,runnerHeadTrackPending=null;

function loadRunnerVideo(url="decks/assets/runner-smoke-source.webm"){
  if(RUNNER_VIDEO)return Promise.resolve(RUNNER_VIDEO);
  if(runnerVideoPending)return runnerVideoPending;
  runnerVideoPending=new Promise((resolve)=>{
    const v=document.createElement("video");v.muted=true;v.loop=true;v.playsInline=true;v.preload="auto";
    const ready=()=>{RUNNER_VIDEO=v;RUNNER_VIDEO_FRAME=document.createElement("canvas");RUNNER_VIDEO_FRAME.width=v.videoWidth||596;RUNNER_VIDEO_FRAME.height=v.videoHeight||336;resolve(v);};
    v.addEventListener("loadeddata",ready,{once:true});v.addEventListener("error",()=>resolve(null),{once:true});v.src=url;v.load();
  });return runnerVideoPending;
}

function loadRunnerHeadTrack(url="decks/data/runner-head-track.json"){
  if(RUNNER_HEAD_TRACK)return Promise.resolve(RUNNER_HEAD_TRACK);
  if(runnerHeadTrackPending)return runnerHeadTrackPending;
  runnerHeadTrackPending=fetch(url).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();}).then(track=>{
    if(!Array.isArray(track.frames)||!track.frames.length)throw new Error("empty track");
    RUNNER_HEAD_TRACK=track;return track;
  }).catch(e=>{runnerHeadTrackPending=null;console.warn("runner head track: "+e.message);return null;});
  return runnerHeadTrackPending;
}

function syncRunnerVideo(step,since=0){
  const v=RUNNER_VIDEO;if(!v||v.readyState<2)return;
  if(step===3){
    RUNNER_VIDEO_STEP=step;
    const raw=clamp01(Number(since)/12.5),speed=.08+.38*Math.sin(Math.PI*raw)**2;
    v.playbackRate=speed;
    if(raw>=.998)v.pause();else if(v.paused)void v.play().catch(()=>{});
    return;
  }
  if(step===RUNNER_VIDEO_STEP)return;const previous=RUNNER_VIDEO_STEP;RUNNER_VIDEO_STEP=step;
  if(step===0){
    // The runner is already in motion when the slide arrives.  Entering from outside the
    // scene starts at the clean first stride; navigating back from the head reveal also
    // restores that earlier chronological state rather than leaving a frozen later frame.
    if(previous!==0)try{v.currentTime=.08;}catch{}
    v.playbackRate=1;v.play().catch(()=>{});
  } else v.pause();
}

function runnerHeadForVideo(v=RUNNER_VIDEO,c=RUNNER_VIDEO_FRAME){
  const fallback={cx:(c?.width||596)*.53,cy:(c?.height||336)*.205,rx:(c?.width||596)*.040,ry:(c?.height||336)*.057};
  const track=RUNNER_HEAD_TRACK;if(!track?.frames?.length||!v||!c)return fallback;
  const fps=Number(track.fps)||30,n=track.frames.length,time=Math.max(0,Number(v.currentTime)||0),index=Math.min(n-1,Math.max(0,Math.floor(time*fps)));
  const row=track.frames[index];if(!Array.isArray(row)||row.length<4)return fallback;
  const xs=c.width/Math.max(1,Number(track.width)||c.width),ys=c.height/Math.max(1,Number(track.height)||c.height);
  const config=track.mask||{},spans=Array.isArray(row[4])?row[4]:null,yMin=Number(config.y_min),yMax=Number(config.y_max);
  return {cx:Number(row[0])*xs,cy:Number(row[1])*ys,rx:Number(row[2])*xs,ry:Number(row[3])*ys,index,
    mask:spans?{spans,rows:Number(config.rows)||0,xRadius:Number(config.x_radius)||1,
      yMin:Number.isFinite(yMin)?yMin:-1,yMax:Number.isFinite(yMax)?yMax:1,quant:Number(config.quant)||255}:null};
}

function runnerHeadMaskContains(head,sx,sy){
  const mask=head?.mask,spans=mask?.spans,rows=mask?.rows|0;
  if(spans&&rows>1&&spans.length>=rows*2){
    const yNorm=(sy-head.cy)/Math.max(1,head.ry),span=Math.max(1e-6,mask.yMax-mask.yMin),u=(yNorm-mask.yMin)/span;
    if(u<0||u>1)return false;
    const row=Math.max(0,Math.min(rows-1,Math.round(u*(rows-1)))),left=Number(spans[row*2]),right=Number(spans[row*2+1]);
    if(!Number.isFinite(left)||!Number.isFinite(right)||left>right)return false;
    const q=(((sx-head.cx)/(Math.max(1,head.rx)*mask.xRadius))+1)*.5*mask.quant;
    // One quantisation unit is substantially smaller than the renderer's 2 px sampling
    // stride. A two-unit allowance prevents boundary sparkle without admitting the neck.
    return q>=left-2&&q<=right+2;
  }
  const hx=(sx-head.cx)/Math.max(1,head.rx),hy=(sy-head.cy)/Math.max(1,head.ry),lowerTaper=hy>.35?mix(1,.78,clamp01((hy-.35)/.65)):1;
  return (hx/lowerTaper)**2+hy**2<1;
}

function runnerVideoLayout(W,H,c,head=runnerHeadForVideo()){
  const sx0=Math.round(c.width*.205),sx1=Math.round(c.width*.725);
  const sy0=Math.round(c.height*.035),sy1=Math.round(c.height*.985);
  const scale=H*.92/(sy1-sy0),pivotX=W*.48,pivotY=H*.875,sourceBase=c.height*.94;
  const sourceHead=[head.cx,head.cy];
  return {sx0,sx1,sy0,sy1,scale,pivotX,pivotY,sourceBase,sourceHead,head,
    headScreen:[pivotX+(sourceHead[0]-(sx0+sx1)*.5)*scale,pivotY+(sourceHead[1]-sourceBase)*scale]};
}

/**
 * The supplied smoke runner is a temporal density field, not pasted footage. Luminance
 * samples from each decoded frame become native Spiral marks. A high threshold removes the
 * black plate and faint preview lettering while preserving the original eddies and gait.
 */
function drawRunnerVideoDots(g,W,H,step,since,k,opacity=1){
  const v=RUNNER_VIDEO,c=RUNNER_VIDEO_FRAME;if(!v||!c||v.readyState<2)return false;syncRunnerVideo(step,since);
  const q=c.getContext("2d",{willReadFrequently:true});q.clearRect(0,0,c.width,c.height);q.drawImage(v,0,0,c.width,c.height);
  const frame=q.getImageData(0,0,c.width,c.height).data,hi=cssVar("--hi","#F9F9F7"),lo=cssVar("--lo","#6E6C64"),accent=cssVar("--accent","#D97757");
  const {sx0,sx1,sy0,sy1,scale,pivotX,pivotY,sourceBase,sourceHead,head,headScreen}=runnerVideoLayout(W,H,c);
  const focused=step>=1,zoom=0,camera=1,threshold=32;
  g.save();
  for(let sy=sy0;sy<sy1;sy+=2)for(let sx=sx0;sx<sx1;sx+=2){
    const j=(sy*c.width+sx)*4,r=frame[j],gg=frame[j+1],b=frame[j+2],lum=.299*r+.587*gg+.114*b;
    if(lum<threshold)continue;
    // The preview lettering is thin and locally isolated; smoke remains luminous in neighbours.
    const jl=(sy*c.width+Math.max(sx0,sx-2))*4,jr=(sy*c.width+Math.min(sx1-1,sx+2))*4;
    const local=(lum+(.299*frame[jl]+.587*frame[jl+1]+.114*frame[jl+2])+(.299*frame[jr]+.587*frame[jr+1]+.114*frame[jr+2]))/3;
    if(local<threshold+3)continue;
    const density=clamp01((local-threshold)/118);if(hash01(sx,sy,37)>density*.64+.32)continue;
    const lx=(sx-(sx0+sx1)*.5)*scale,ly=(sy-sourceBase)*scale;
    let x=pivotX+lx,y=pivotY+ly;
    if(zoom>0){x=mix(x,W*.50+(x-headScreen[0])*camera,zoom);y=mix(y,H*.50+(y-headScreen[1])*camera,zoom);}
    const jtr=(1-density)*1.6*k;x+=Math.sin(sx*.31+sy*.17)*jtr;y+=Math.cos(sx*.19-sy*.23)*jtr;
    const inHead=runnerHeadMaskContains(head,sx,sy),dx=(sx-head.cx)/Math.max(1,head.rx),dy=(sy-head.cy)/Math.max(1,head.ry),
      radial=Math.hypot(dx,dy),headDissipation=focused?Math.exp(-Math.max(0,radial-1)*1.72):0;
    const baseColour=lum>178?hi:lum>88?lo:accent;
    // Preserve the decoded body's dark smoke density.  Only the segmented head is solid red;
    // a sparse, distance-weighted red component attenuates radially into the surrounding
    // smoke instead of turning the torso and limbs white.
    const redSample=focused&&(inHead||hash01(sx,sy,613)<headDissipation*.30);
    const bodyColour=focused&&baseColour===hi?lo:baseColour;
    g.fillStyle=redSample?accent:bodyColour;
    g.globalAlpha=opacity*(.18+.74*density)*(lum>82?1:.62)*(redSample&&!inHead?headDissipation:1);
    g.beginPath();g.arc(x,y,(.36+.78*density)*k,0,TAU);g.fill();
  }
  if(focused){
    const [hx,hy]=headScreen,pulse=.76+.24*Math.sin(since*TAU*.42);
    g.globalCompositeOperation="screen";
    const halo=g.createRadialGradient(hx,hy,2*k,hx,hy,H*.135);
    halo.addColorStop(0,`rgba(217,119,87,${.20*pulse*opacity})`);
    halo.addColorStop(.34,`rgba(217,119,87,${.090*pulse*opacity})`);
    halo.addColorStop(1,"rgba(217,119,87,0)");g.fillStyle=halo;g.beginPath();g.arc(hx,hy,H*.135,0,TAU);g.fill();
    g.globalCompositeOperation="source-over";
    for(let i=0;i<56;i++){const ang=hash01(i,334,1)*TAU,rr=H*(.020+.120*hash01(i,334,3)),falloff=(1-rr/(H*.145))**1.6;
      g.fillStyle=accent;g.globalAlpha=opacity*falloff*(.06+.25*hash01(i,334,5))*pulse;
      g.beginPath();g.arc(hx+Math.cos(ang)*rr,hy+Math.sin(ang)*rr,(.42+.72*hash01(i,334,7))*k,0,TAU);g.fill();}
  }
  g.restore();return true;
}

function drawRunnerFloor(g,W,H,t,step,since,k,ground,fade=1){
  const lo=cssVar("--lo","#6E6C64"),accent=cssVar("--accent","#D97757");
  const raw=clamp01(since/12.5),travel=.08*raw+.38*(raw/2-Math.sin(2*Math.PI*raw)/(4*Math.PI));
  const horizon=H*.62,move=step===0?since*.055:step===3?travel*1.7:0;
  g.save();g.strokeStyle=lo;g.globalAlpha=.19*fade;g.lineWidth=.7*k;
  for(let i=-8;i<=8;i++)dotPolyline(g,[[W*.5+i*W*.045,horizon],[W*.5+i*W*.12,H]],lo,.42*k,.23*fade,5.2*k);
  for(let r=0;r<7;r++){
    const u=(r/7+move)%1,y=mix(horizon,H,u*u);
    dotPolyline(g,[[W*.06,y],[W*.94,y]],lo,.40*k,(.16+.18*u)*fade,5.7*k);
  }
  g.strokeStyle=step>=1?accent:lo;g.globalAlpha=(step>=1?.48:.34)*fade;g.lineWidth=1.1*k;
  g.beginPath();g.moveTo(W*.05,ground);g.lineTo(W*.95,ground);g.stroke();g.restore();
}

function drawConcussionTimeArc(g,W,H,step,since,k){
  if(step!==3)return;
  const hi=cssVar("--hi","#F9F9F7"),smooth=v=>{v=clamp01(v);return v*v*(3-2*v);};
  const raw=clamp01(since/12.5),progress=.5-.5*Math.cos(Math.PI*raw),week=1+Math.floor(progress*111.999),clockA=smooth(raw/.12);
  // The clock crosses one shallow background arc, matching the later REPCon time cue. The
  // alternating phase guarantees that two suns can never occupy the arc together.
  for(let j=0;j<8;j++){
    const q=(progress*3.25+j/8)%1,x=mix(W*.035,W*.965,q),y=H*(.065-.032*Math.sin(Math.PI*q)),night=j%2===1,gap=smooth((Math.abs(q-.5)-.10)/.12);
    g.save();g.translate(x,y);g.globalAlpha=.56*clockA*Math.sin(Math.PI*q)*gap;g.strokeStyle=night?"#A78BFA":"#E8BE55";g.fillStyle=night?"#A78BFA":"#E8BE55";g.lineWidth=Math.max(1,1.0*k);
    if(!night){g.beginPath();g.arc(0,0,3.3*k,0,TAU);g.fill();for(let r=0;r<8;r++){const a0=r*TAU/8;g.beginPath();g.moveTo(Math.cos(a0)*5*k,Math.sin(a0)*5*k);g.lineTo(Math.cos(a0)*7.2*k,Math.sin(a0)*7.2*k);g.stroke();}}
    else{g.beginPath();g.arc(0,0,4.9*k,-Math.PI*.44,Math.PI*.44);g.arc(2.6*k,0,4.3*k,Math.PI*.48,-Math.PI*.48,true);g.closePath();g.fill();}
    g.restore();
  }
  g.save();g.fillStyle=hi;g.globalAlpha=.90*clockA;g.textAlign="center";g.textBaseline="middle";g.shadowColor="rgba(0,0,0,.95)";g.shadowBlur=6*k;
  g.font=`650 ${Math.max(9,7.2*k).toFixed(1)}px ui-monospace, SFMono-Regular, monospace`;g.fillText(`week ${week} / 112`,W*.50,H*.035);g.restore();
}

/** Acute labels trickle in around the head, then resolve into literature-supported persistent
 * symptom domains. Shared domains retain the acute orange; persistent-only domains enter in
 * purple; acute-only signs disappear. The movement is visual continuity, not a claim that one
 * symptom biologically transforms into another. */
function drawConcussionSymptomEvolution(g,W,H,step,since,k){
  if(step<2)return;
  const acuteColour=cssVar("--accent","#D97757"),persistentColour="#A78BFA",smooth=v=>{v=clamp01(v);return v*v*(3-2*v);};
  const head=runnerHeadForVideo(),layout=runnerVideoLayout(W,H,RUNNER_VIDEO_FRAME||{width:596,height:336},head),[hx,hy]=layout.headScreen;
  const acute=[
    "headache","dizziness / imbalance","nausea / vomiting","confusion / feeling dazed",
    "memory disturbance","vision problems","light / noise sensitivity","possible brief loss of consciousness",
  ];
  const persistent=[
    "headache","dizziness / imbalance","visual / ocular-motor symptoms","light / noise sensitivity","memory difficulty","neck pain / cervicogenic symptoms",
    "mental fatigue","poor concentration","slowed thinking","sleep disturbance","irritability / mood change","depression / anxiety","exercise intolerance",
  ];
  // Two symmetric fans sit on one ellipse whose origin is the tracked head, rather than on
  // the page centre or torso. The entire upper band is reserved for the day/night clock.
  const acuteAngles=[-165,175,150,125,-15,5,30,55].map(v=>v*Math.PI/180);
  const acutePos=acuteAngles.map((angle,i)=>{
    const left=Math.cos(angle)<0;return {x:hx+Math.cos(angle)*W*.27,y:hy+Math.sin(angle)*H*.22,align:left?"right":"left",left};
  });
  const persistentPos=persistent.map((_,i)=>{
    const left=i<6,row=left?i:i-6,count=left?6:7,spread=.245+.042*Math.sin(Math.PI*row/(count-1));
    return {x:hx+(left?-1:1)*W*spread,y:hy+H*(row*(left?.105:.087)),align:left?"right":"left",left};
  });
  const text=(value,pos,alpha,size=6.7,weight=590,colour=acuteColour)=>{
    if(alpha<=.001)return;g.save();g.fillStyle=colour;g.globalAlpha=alpha;g.textAlign=pos.align;g.textBaseline="middle";
    g.shadowColor="rgba(0,0,0,.96)";g.shadowBlur=6*k;g.font=`${weight} ${Math.max(9,size*k).toFixed(1)}px ui-monospace, SFMono-Regular, monospace`;
    g.fillText(value,pos.x,pos.y);g.restore();
  };
  const leader=(pos,alpha,colour=acuteColour)=>{
    if(alpha<=.001)return;
    const dx=pos.x-hx,dy=pos.y-hy,dist=Math.max(1,Math.hypot(dx,dy)),ux=dx/dist,uy=dy/dist;
    // Only the outer part of each ray is drawn. Its direction still resolves exactly to the
    // head centre, while avoiding a thicket of lines crossing the runner's face and torso.
    const endX=pos.x-ux*9*k,endY=pos.y-uy*9*k,segment=Math.min(dist*.31,74*k),startX=endX-ux*segment,startY=endY-uy*segment;
    g.save();g.strokeStyle=colour;g.globalAlpha=.18*alpha;g.lineWidth=Math.max(.6,.65*k);g.setLineDash([1.2*k,3.0*k]);
    g.beginPath();g.moveTo(startX,startY);g.lineTo(endX,endY);g.stroke();g.restore();
  };
  if(step===2){
    acute.forEach((label,i)=>{const a=smooth((since-i*.18)/.48);leader(acutePos[i],a,acuteColour);text(label,acutePos[i],a,6.9,620,acuteColour);});
    return;
  }

  const raw=clamp01(since/12.5),progress=.5-.5*Math.cos(Math.PI*raw),m=smooth((progress-.18)/.58);
  // Acute indices 2, 3 and 7 (nausea/vomiting, dazed/confused and possible brief LOC)
  // are not carried into the persistent phenotype. The remaining five domains persist and
  // therefore keep their orange identity. Purple is reserved for domains introduced here.
  const destinations=new Map([[0,0],[1,1],[4,4],[5,2],[6,3]]),occupied=new Set(destinations.values());
  acute.forEach((label,i)=>{
    const destination=destinations.get(i),a=acutePos[i];
    if(destination===undefined){
      const vanish=1-smooth((progress-.16)/.34);
      leader(a,vanish,acuteColour);text(label,a,vanish,6.7,610,acuteColour);return;
    }
    const b=persistentPos[destination],pos={x:mix(a.x,b.x,m),y:mix(a.y,b.y,m),align:m<.5?a.align:b.align,left:m<.5?a.left:b.left};
    const oldA=1-smooth((m-.12)/.62),newA=smooth((m-.34)/.62);
    leader(pos,Math.max(oldA,newA),acuteColour);
    text(label,pos,oldA,6.7,610,acuteColour);text(persistent[destination],pos,newA,6.35,600,acuteColour);
  });
  const extras=persistent.map((_,i)=>i).filter(i=>!occupied.has(i));
  extras.forEach((index,j)=>{
    const a=smooth((progress-(.42+j*.035))/.18),pos=persistentPos[index];leader(pos,a,persistentColour);text(persistent[index],pos,a,6.35,580,persistentColour);
  });
}

function drawImpactBrain(g,W,H,t,age,k,head){
  const reveal=smooth(age/1.18);if(reveal<=.001||!BRAIN)return;
  const accent=cssVar("--accent","#D97757"),hi=cssVar("--hi","#F9F9F7"),lo=cssVar("--lo","#6E6C64");
  const start=head||[W*.48,H*.24],cx=mix(start[0],W*.50,reveal),cy=mix(start[1],H*.51,reveal);
  const brainScale=mix(.145,1.46,reveal),clipRx=mix(H*.040,W*.56,reveal),clipRy=mix(H*.055,H*.64,reveal);
  // The same brain first exists inside the red cranial density.  Its scanner lattice expands
  // with it, so the following slide is a continuation of one object rather than a cut to a
  // newly introduced brain.
  g.save();g.beginPath();g.ellipse(cx,cy,clipRx,clipRy,0,0,TAU);g.clip();
  g.globalAlpha=.18+.82*reveal;
  drawScannerBrain(g,W,H,t,{selected:false,center:[cx/W,cy/H],scale:brainScale,yaw:104,tilt:12,
    spin:0,still:true,gridStill:true,k,activity:.72+.28*reveal,gridAlpha:smooth((reveal-.20)/.70)});
  g.restore();
  const scatter=smooth((age-.18)/1.45),rx=mix(H*.050,H*.34,reveal),ry=mix(H*.062,H*.29,reveal);
  g.save();
  for(let i=0;i<280;i++){
    const ang=hash01(i,120,2)*TAU,inside=Math.sqrt(hash01(i,120,5));
    const bx=cx+Math.cos(ang)*rx*inside,by=cy+Math.sin(ang)*ry*inside;
    const outward=Math.pow(hash01(i,120,8),2)*H*.15*scatter;
    const swirl=(hash01(i,120,11)-.5)*H*.045*scatter;
    const x=bx+Math.cos(ang)*outward-Math.sin(ang)*swirl;
    const y=by+Math.sin(ang)*outward+Math.cos(ang)*swirl;
    g.fillStyle=i%9===0?accent:i%3===0?hi:lo;
    g.globalAlpha=reveal*(.20+.62*hash01(i,120,14))*(1-scatter*.58);
    g.beginPath();g.arc(x,y,(.48+1.15*hash01(i,120,17))*k,0,TAU);g.fill();
  }
  g.globalAlpha=(1-reveal)*.54;g.strokeStyle=accent;g.lineWidth=1.05*k;
  g.beginPath();g.ellipse(cx,cy,rx,ry,0,0,TAU);g.stroke();g.restore();
}

// ── quantum-to-image bridge ────────────────────────────────────────────────

/* The water figure is an offline electronic-structure result, not a stochastic cloud of
 * decorative points. Three watertight constant-density surfaces are decoded once, then the
 * presentation only projects their bounded 4,500 triangles. The molecule may be viewed from
 * a slowly changing camera angle; no part of the drawing claims that electrons or a proton
 * are literal little spheres travelling around or rotating. */
let WATER_ELECTRON_DENSITY=null,waterElectronDensityPending=null;
function loadWaterElectronDensity(url="decks/data/water-electron-density.json"){
  if(WATER_ELECTRON_DENSITY)return Promise.resolve(WATER_ELECTRON_DENSITY);
  if(waterElectronDensityPending)return waterElectronDensityPending;
  waterElectronDensityPending=fetch(url).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();}).then(d=>{
    const q=Number(d.q||32767),half=Number(d.half_extent_angstrom||1),centre=(d.centre_angstrom||[0,0,0]).map(Number),
      shells=(d.shells||[]).map(shell=>{const packed=unpackBase64(shell.vertices_b64,Int16Array),V=new Float32Array(packed.length);
        for(let i=0;i<packed.length;i+=3){V[i]=packed[i]/q*half+centre[0];V[i+1]=packed[i+1]/q*half+centre[1];V[i+2]=packed[i+2]/q*half+centre[2];}
        return{...shell,V,F:unpackBase64(shell.faces_b64,Uint16Array),sx:new Float32Array(packed.length/3),
          sy:new Float32Array(packed.length/3),sd:new Float32Array(packed.length/3)};}),
      atoms=(d.atoms||[]).map(atom=>({...atom,position:(atom.position_angstrom||[0,0,0]).map(Number)}));
    WATER_ELECTRON_DENSITY={...d,shells,atoms};return WATER_ELECTRON_DENSITY;
  }).catch(e=>{waterElectronDensityPending=null;console.warn("water electron density: "+e.message);return null;});
  return waterElectronDensityPending;
}

function physicsArrow(g,a,b,color,width=1,alpha=1,head=8){
  const dx=b[0]-a[0],dy=b[1]-a[1],ang=Math.atan2(dy,dx);g.save();g.strokeStyle=color;g.fillStyle=color;g.globalAlpha=alpha;
  g.lineWidth=width;g.beginPath();g.moveTo(...a);g.lineTo(...b);g.stroke();
  g.beginPath();g.moveTo(...b);g.lineTo(b[0]-Math.cos(ang-.52)*head,b[1]-Math.sin(ang-.52)*head);g.lineTo(b[0]-Math.cos(ang+.52)*head,b[1]-Math.sin(ang+.52)*head);g.closePath();g.fill();g.restore();
}

function drawRasterContain(g,img,box,alpha=1){
  if(!img||alpha<=.001)return false;
  const s=Math.min(box.w/img.naturalWidth,box.h/img.naturalHeight),w=img.naturalWidth*s,h=img.naturalHeight*s;
  g.save();g.globalAlpha=alpha;g.drawImage(img,box.x+(box.w-w)/2,box.y+(box.h-h)/2,w,h);g.restore();return true;
}

function physicsLabel(g,text,x,y,color,k,alpha=1,align="center"){
  g.save();g.fillStyle=color;g.globalAlpha=alpha;g.font=fontOf(Math.max(.86,k),10.2);
  g.textAlign=align;g.textBaseline="middle";g.fillText(text,x,y);g.restore();
}

/* Canvas has no reliable Unicode capital-B subscript. Draw the physiological symbol as real
 * typography so it reads as v with a lowered Latin B, never as the visually similar Greek beta. */
function drawVSubB(g,prefix,x,y,color,k,alpha=1,size=12,suffix=""){
  g.save();g.fillStyle=color;g.globalAlpha=alpha;g.textAlign="left";g.textBaseline="alphabetic";
  g.font=fontOf(k,size);const base=`${prefix||""}v`,bw=g.measureText(base).width;
  const suffixWidth=g.measureText(suffix).width;g.font=fontOf(k,size*.68);const sw=g.measureText("B").width,total=bw+sw*.92+suffixWidth,start=x-total*.5;
  g.font=fontOf(k,size);g.fillText(base,start,y);
  g.font=fontOf(k,size*.68);g.fillText("B",start+bw,y+2.7*k);
  g.font=fontOf(k,size);g.fillText(suffix,start+bw+sw*.92,y);g.restore();
}

function waterShade(hex,factor){const s=String(hex).replace("#",""),r=parseInt(s.slice(0,2),16),q=parseInt(s.slice(2,4),16),b=parseInt(s.slice(4,6),16);
  return`rgb(${Math.min(255,r*factor)|0},${Math.min(255,q*factor)|0},${Math.min(255,b*factor)|0})`;}

/* NIST lists water in the yz plane. Re-map y to screen-horizontal, z to vertical and x to
 * depth, then move only the viewpoint. This retains the measured bent geometry. */
function projectWaterPoint(position,view){let x=position[1],y=position[2],z=position[0];const cy=Math.cos(view.yaw),sy=Math.sin(view.yaw),cp=Math.cos(view.pitch),sp=Math.sin(view.pitch),
    x1=x*cy+z*sy,z1=-x*sy+z*cy,y1=y*cp-z1*sp,z2=y*sp+z1*cp;
  return{x:view.cx+x1*view.scale,y:view.cy-y1*view.scale,d:z2};}

function drawWaterElectronDensity(g,view,k,alpha=1,filter=null){if(!WATER_ELECTRON_DENSITY||alpha<=.001)return;
  // Inner first, translucent outer last: the nested levels remain legible as one field.
  const shells=[...WATER_ELECTRON_DENSITY.shells].filter(s=>!filter||filter(s)).reverse();
  for(const shell of shells){const V=shell.V,F=shell.F,X=shell.sx,Y=shell.sy,Z=shell.sd,buckets=Array.from({length:10},()=>new Path2D()),used=new Uint8Array(10);
    for(let i=0,j=0;i<X.length;i++,j+=3){const p=projectWaterPoint([V[j],V[j+1],V[j+2]],view);X[i]=p.x;Y[i]=p.y;Z[i]=p.d;}
    for(let j=0;j<F.length;j+=3){const a0=F[j],b0=F[j+1],c0=F[j+2],area=(X[b0]-X[a0])*(Y[c0]-Y[a0])-(Y[b0]-Y[a0])*(X[c0]-X[a0]);
      if(area>=0)continue;const ux=X[b0]-X[a0],uy=Y[b0]-Y[a0],uz=Z[b0]-Z[a0],vx=X[c0]-X[a0],vy=Y[c0]-Y[a0],vz=Z[c0]-Z[a0],
        nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,len=Math.hypot(nx,ny,nz)||1,
        light=clamp01(.20+.80*Math.abs((-nx*.27-ny*.43+nz*.86)/len)),bucket=Math.min(9,(light*10)|0),path=buckets[bucket];
      used[bucket]=1;path.moveTo(X[a0],Y[a0]);path.lineTo(X[b0],Y[b0]);path.lineTo(X[c0],Y[c0]);path.closePath();}
    for(let bucket=0;bucket<10;bucket++)if(used[bucket]){g.fillStyle=waterShade(shell.colour,.48+bucket/9*.72);g.globalAlpha=alpha*Number(shell.alpha??.4);g.fill(buckets[bucket]);}
  }g.globalAlpha=1;}

function drawWaterNucleus(g,atom,view,k,a={}){const p=projectWaterPoint(atom.position,view),hydrogen=atom.element==="H",radius=(hydrogen?6.3:9.4)*k*Number(a.scale??1),
    colour=hydrogen?"#F0C85A":"#D97757",alpha=Number(a.alpha??1);g.save();
  const halo=g.createRadialGradient(p.x,p.y,0,p.x,p.y,radius*2.7);halo.addColorStop(0,colour+"c8");halo.addColorStop(.28,colour+"55");halo.addColorStop(1,colour+"00");
  g.fillStyle=halo;g.globalAlpha=alpha;g.beginPath();g.arc(p.x,p.y,radius*2.7,0,TAU);g.fill();g.fillStyle=colour;g.globalAlpha=alpha;g.beginPath();g.arc(p.x,p.y,radius,0,TAU);g.fill();
  g.strokeStyle=cssVar("--hi","#F9F9F7");g.globalAlpha=.68*alpha;g.lineWidth=.7*k;g.beginPath();g.arc(p.x,p.y,radius+1.7*k,0,TAU);g.stroke();g.restore();return p;}

function drawWaterLeader(g,text,from,to,color,k,align="left",alpha=1){g.save();g.strokeStyle=color;g.globalAlpha=.58*alpha;g.lineWidth=.72*k;g.beginPath();g.moveTo(from.x,from.y);g.lineTo(to.x+(align==="left"?-7:7)*k,to.y);g.stroke();
  g.fillStyle=color;g.globalAlpha=.94*alpha;g.font=fontOf(Math.max(.84,k),9.2);g.textAlign=align;g.textBaseline="middle";g.fillText(text,to.x,to.y);g.restore();}

function drawWaterLegendRow(g,x,y,color,title,subtitle,k,alpha=1){g.save();g.fillStyle=color;g.globalAlpha=.95*alpha;g.beginPath();g.arc(x,y,3.5*k,0,TAU);g.fill();
  g.textAlign="left";g.textBaseline="middle";g.fillStyle=cssVar("--hi","#F9F9F7");g.font=fontOf(Math.max(.84,k),9.1);g.fillText(title,x+12*k,y);
  g.fillStyle=cssVar("--lo","#6E6C64");g.globalAlpha=.88*alpha;g.font=fontOf(Math.max(.80,k),7.8);g.fillText(subtitle,x+12*k,y+17*k);g.restore();}

function blochProjection(vector,sphere){const[x,y,z]=vector;return{x:sphere.x+sphere.r*(x*.83+y*.38),y:sphere.y+sphere.r*(y*.20-z*.92)};}
function drawSpinBlochSphere(g,sphere,n,m,k,alpha=1){const lo=cssVar("--lo","#6E6C64"),accent=cssVar("--accent","#D97757");g.save();
  g.strokeStyle=lo;g.globalAlpha=.42*alpha;g.lineWidth=.8*k;g.beginPath();g.arc(sphere.x,sphere.y,sphere.r,0,TAU);g.stroke();g.setLineDash([2.5*k,4*k]);
  g.beginPath();g.ellipse(sphere.x,sphere.y,sphere.r,sphere.r*.25,.22,0,TAU);g.stroke();g.beginPath();g.ellipse(sphere.x,sphere.y,sphere.r*.31,sphere.r,-.38,0,TAU);g.stroke();g.setLineDash([]);
  const origin=[sphere.x,sphere.y];for(const[label,vector]of[["x",[1,0,0]],["y",[0,1,0]],["z",[0,0,1]]]){const p=blochProjection(vector,sphere),q=blochProjection(vector.map(v=>-v),sphere);g.strokeStyle=lo;g.globalAlpha=.47*alpha;g.beginPath();g.moveTo(q.x,q.y);g.lineTo(p.x,p.y);g.stroke();physicsLabel(g,label,p.x+6*k,p.y-5*k,lo,k,.70*alpha);}
  const mp=blochProjection(m,sphere),mn=blochProjection(m.map(v=>-v),sphere);g.strokeStyle="#6FB8C8";g.globalAlpha=.76*alpha;g.setLineDash([5*k,4*k]);g.lineWidth=1.05*k;g.beginPath();g.moveTo(mn.x,mn.y);g.lineTo(mp.x,mp.y);g.stroke();g.setLineDash([]);physicsLabel(g,"m",mp.x+7*k,mp.y-4*k,"#6FB8C8",k,.90*alpha);
  const np=blochProjection(n,sphere);physicsArrow(g,origin,[np.x,np.y],accent,2.15*k,.96*alpha,7*k);physicsLabel(g,"n = ⟨σ⟩",np.x+9*k,np.y-2*k,accent,k,.96*alpha,"left");g.restore();}

function drawSpinProbability(g,x,y,w,label,p,color,k,alpha=1){const hi=cssVar("--hi","#F9F9F7"),lo=cssVar("--lo","#6E6C64");g.save();g.textAlign="left";g.textBaseline="middle";g.font=fontOf(Math.max(.84,k),8.8);g.fillStyle=hi;g.globalAlpha=.92*alpha;g.fillText(label,x,y);
  g.fillStyle=lo;g.globalAlpha=.20*alpha;g.fillRect(x+32*k,y-5*k,w,9*k);g.fillStyle=color;g.globalAlpha=.90*alpha;g.fillRect(x+32*k,y-5*k,w*clamp01(p),9*k);
  g.fillStyle=hi;g.globalAlpha=.92*alpha;g.textAlign="right";g.fillText(`${Math.round(p*100)}%`,x+32*k+w+20*k,y);g.restore();}

function drawScientificQuantumSpin(g,W,H,t,a={}){const k=a.k??1,step=sceneStep(a),since=Math.max(0,Number(a._stepElapsed??0)),settled=!!(a._stepSettled||a._stepBackward||a._directEnd),
    hi=cssVar("--hi","#F9F9F7"),lo=cssVar("--lo","#6E6C64"),accent=cssVar("--accent","#D97757"),cyan="#6FB8C8",yellow="#F0C85A",violet="#B89CFF",e=settled?1:smooth(since/.72);
  if(!WATER_ELECTRON_DENSITY){physicsLabel(g,"loading precomputed H₂O electron density…",W*.5,H*.48,lo,k,.82);return;}
  const atoms=WATER_ELECTRON_DENSITY.atoms,hydrogens=atoms.filter(atom=>atom.element==="H"),oxygen=atoms.find(atom=>atom.element==="O");
  const state0=(alpha)=>{if(alpha<=.001)return;g.save();const view={cx:W*.49,cy:H*.46,scale:Math.min(W*.145,H*.235),yaw:.18+Math.sin(t*.16)*.32,pitch:-.18};
    const glow=g.createRadialGradient(view.cx,view.cy,0,view.cx,view.cy,W*.29);glow.addColorStop(0,"rgba(111,184,200,.09)");glow.addColorStop(1,"rgba(111,184,200,0)");g.fillStyle=glow;g.globalAlpha=alpha;g.fillRect(W*.17,H*.03,W*.64,H*.86);
    drawWaterElectronDensity(g,view,k,alpha);for(const atom of atoms)drawWaterNucleus(g,atom,view,k,{alpha:.22*alpha,scale:.62});
    physicsLabel(g,"TOTAL ELECTRON DENSITY  ·  ρ(r)",W*.49,H*.075,cyan,k,.94*alpha);
    physicsLabel(g,"nested constant-density surfaces",W*.49,H*.84,cyan,k,.90*alpha);physicsLabel(g,"viewpoint moves to reveal shape · molecule is not spinning",W*.49,H*.895,lo,k,.82*alpha);
    drawWaterLegendRow(g,W*.78,H*.29,cyan,"ρ = 0.005 e / a₀³","outer molecular extent",k,alpha);
    drawWaterLegendRow(g,W*.78,H*.46,"#E4C8B4","ρ = 0.030 e / a₀³","intermediate density",k,alpha);
    drawWaterLegendRow(g,W*.78,H*.63,accent,"ρ = 0.150 e / a₀³","higher density near nuclei",k,alpha);
    physicsLabel(g,"10 electrons",W*.075,H*.70,hi,k,.96*alpha,"left");physicsLabel(g,"→ one continuous field",W*.075,H*.76,cyan,k,.92*alpha,"left");
    physicsLabel(g,"not ten measured positions",W*.075,H*.82,lo,k,.82*alpha,"left");g.restore();};
  const state1=(alpha)=>{if(alpha<=.001)return;g.save();const view={cx:W*.385,cy:H*.46,scale:Math.min(W*.145,H*.235),yaw:.20,pitch:-.18};drawWaterElectronDensity(g,view,k,.24*alpha);
    const points=atoms.map(atom=>drawWaterNucleus(g,atom,view,k,{alpha:alpha*(atom.element==="H"?1:.55),scale:atom.element==="H"?1.12:.82})),oi=atoms.indexOf(oxygen),hs=atoms.map((atom,i)=>({atom,i})).filter(row=>row.atom.element==="H").sort((p,q)=>points[p.i].x-points[q.i].x);
    drawWaterLeader(g,"oxygen nucleus",points[oi],{x:W*.075,y:H*.27},accent,k,"left",alpha);
    drawWaterLeader(g,"¹H = one proton",points[hs[0].i],{x:W*.075,y:H*.69},yellow,k,"left",alpha);
    drawWaterLeader(g,"¹H = one proton",points[hs[1].i],{x:W*.675,y:H*.29},yellow,k,"right",alpha);
    physicsLabel(g,"nuclear markers enlarged · not to scale",W*.385,H*.855,lo,k,.80*alpha);
    g.strokeStyle=lo;g.globalAlpha=.34*alpha;g.lineWidth=.7*k;g.beginPath();g.moveTo(W*.71,H*.20);g.lineTo(W*.71,H*.78);g.stroke();
    physicsLabel(g,"ELECTRON DENSITY",W*.75,H*.30,cyan,k,.95*alpha,"left");physicsLabel(g,"spatial field",W*.75,H*.37,hi,k,.96*alpha,"left");physicsLabel(g,"10-electron field",W*.75,H*.43,lo,k,.80*alpha,"left");
    physicsLabel(g,"HYDROGEN NUCLEUS",W*.75,H*.57,yellow,k,.95*alpha,"left");physicsLabel(g,"MRI-active proton",W*.75,H*.64,hi,k,.96*alpha,"left");physicsLabel(g,"intrinsic spin  ½",W*.75,H*.70,violet,k,.88*alpha,"left");g.restore();};
  const state2=(alpha)=>{if(alpha<=.001)return;g.save();const view={cx:W*.18,cy:H*.44,scale:Math.min(W*.077,H*.18),yaw:.20,pitch:-.18};
    drawWaterElectronDensity(g,view,k,.10*alpha,shell=>Number(shell.rho_e_per_bohr3)===.005);const selected=drawWaterNucleus(g,hydrogens[0],view,k,{alpha,scale:1.28});drawWaterNucleus(g,hydrogens[1],view,k,{alpha:.20*alpha,scale:.78});
    physicsLabel(g,"one selected ¹H proton",selected.x,selected.y+37*k,yellow,k,.96*alpha);physicsLabel(g,"location in the molecule",selected.x,selected.y+56*k,lo,k,.78*alpha);
    physicsArrow(g,[W*.30,H*.47],[W*.405,H*.47],lo,.75*k,.50*alpha,5*k);physicsLabel(g,"represent its state",W*.352,H*.42,lo,k,.76*alpha);
    const sphere={x:W*.61,y:H*.47,r:Math.min(W*.128,H*.29)},theta=52*Math.PI/180,phi=-27*Math.PI/180,n=[Math.sin(theta)*Math.cos(phi),Math.sin(theta)*Math.sin(phi),Math.cos(theta)],
      ma=24*Math.PI/180,m=[Math.sin(ma),0,Math.cos(ma)],dot=n[0]*m[0]+n[1]*m[1]+n[2]*m[2],pPlus=(1+dot)/2;
    drawSpinBlochSphere(g,sphere,n,m,k,alpha);physicsLabel(g,"STATE SPACE · NOT PHYSICAL SPACE",sphere.x,H*.095,violet,k,.96*alpha);
    physicsLabel(g,"spin state  ρ = ½(I + n·σ)",sphere.x,H*.84,hi,k,.96*alpha);physicsLabel(g,"n stores three expectation values",sphere.x,H*.895,lo,k,.78*alpha);
    physicsLabel(g,"MEASURE ALONG m",W*.78,H*.29,lo,k,.90*alpha,"left");drawSpinProbability(g,W*.78,H*.42,W*.055,"+ ℏ/2",pPlus,accent,k,alpha);drawSpinProbability(g,W*.78,H*.55,W*.055,"− ℏ/2",1-pPlus,cyan,k,alpha);
    physicsLabel(g,"one shot → one outcome",W*.78,H*.68,hi,k,.90*alpha,"left");physicsLabel(g,"probabilities from n·m",W*.78,H*.74,lo,k,.76*alpha,"left");g.restore();};
  const state3=(alpha)=>{if(alpha<=.001)return;const age=settled?3:since,field=smooth((age-.18)/.54),sum=smooth((age-.70)/.72);g.save();
    const x0=W*.085,y0=H*.16,bw=W*.64,bh=H*.63;g.strokeStyle=cyan;g.globalAlpha=.18*alpha;g.lineWidth=.7*k;g.strokeRect(x0,y0,bw,bh);
    for(let i=0;i<17;i++){const ang=hash01(i,223,1)*TAU,len=(9+8*hash01(i,223,2))*k;for(let q=0;q<2;q++){const x=x0+bw*(.08+.84*hash01(i,225,q+1)),y=y0+bh*(.10+.80*hash01(i,227,q+3)),sgn=q?-1:1;
      physicsArrow(g,[x,y],[x+Math.cos(ang)*len*sgn,y+Math.sin(ang)*len*sgn],lo,.62*k,.22*alpha,3*k);}}
    physicsLabel(g,"many water protons · most moments cancel",x0+bw*.5,y0+bh+.055*H,hi,k,.72*alpha);
    physicsArrow(g,[x0-20*k,y0+bh*.82],[x0-20*k,y0+bh*.12],accent,1.20*k,.86*alpha*field,6*k);physicsLabel(g,"B₀",x0-20*k,y0+bh*.05,accent,k,.92*alpha*field);
    for(let i=0;i<5;i++){const x=x0+bw*(.21+.13*i),y=y0+bh*(.34+.16*(i%2));physicsArrow(g,[x,y+9*k],[x,y-12*k],accent,.95*k,.80*alpha*sum,4*k);}
    const mx=W*.85,my=H*.51;physicsArrow(g,[mx,my+42*k],[mx,my-58*k],accent,2.45*k,.96*alpha*sum,9*k);physicsLabel(g,"tiny population excess",mx,my-73*k,hi,k,.92*alpha*sum);
    physicsLabel(g,"net magnetization  M₀",mx,my+61*k,accent,k,.96*alpha*sum);physicsLabel(g,"ensemble signal",mx,my+84*k,lo,k,.76*alpha*sum);
    physicsLabel(g,"What survives after the cancelling?",W*.50,H*.065,hi,k,.92*alpha);g.restore();};
  if(step===0)state0(1);else if(step===1){state0(1-e);state1(e);}else if(step===2){state1(1-e);state2(e);}else{state2(1-e);state3(e);}
}

function drawMRSignal(g,W,H,t,a={}){
  const k=a.k??1,step=sceneStep(a),since=Math.max(0,Number(a._stepElapsed??0));
  const hi=cssVar("--hi","#F9F9F7"),lo=cssVar("--lo","#6E6C64"),accent=cssVar("--accent","#D97757"),cyan="#6FB8C8",e=smooth(since/.72);
  const apparatus=(alpha,mode)=>{if(alpha<=.001)return;const cx=W*.29,cy=H*.48,R=Math.min(H*.25,W*.12),coilX=W*.47;g.save();
    g.strokeStyle=lo;g.globalAlpha=.40*alpha;g.lineWidth=.8*k;g.beginPath();g.ellipse(cx,cy,R,R*.25,0,0,TAU);g.stroke();
    physicsArrow(g,[cx-R*1.20,cy+R*.80],[cx-R*1.20,cy-R*.90],accent,1.25*k,.84*alpha,6*k);physicsLabel(g,"B₀",cx-R*1.20,cy-R*1.04,accent,k,.90*alpha);
    for(let i=0;i<5;i++){g.strokeStyle=hi;g.globalAlpha=alpha*(.22+.060*i);g.lineWidth=.85*k;g.beginPath();g.ellipse(coilX+i*3.3*k,cy,R*.17,R*.70,0,0,TAU);g.stroke();}
    if(mode===0){physicsArrow(g,[cx,cy],[cx,cy-R*.72],cyan,2.45*k,.96*alpha,8*k);physicsLabel(g,"net moment is steady",cx,cy-R*1.05,hi,k,.94*alpha);physicsLabel(g,"nothing changes through the coil",cx,cy+R*1.07,hi,k,.68*alpha);}
    if(mode===1){const tip=smooth(since/1.05),ang=mix(-Math.PI/2,0,tip);physicsArrow(g,[cx,cy],[cx+Math.cos(ang)*R*.76,cy+Math.sin(ang)*R*.76],cyan,2.45*k,.96*alpha,8*k);
      const rx0=W*.06,rx1=cx-R*.30;for(let i=0;i<48;i++){const u=i/47,x=mix(rx0,rx1,u),y=cy+R*.67+Math.sin(u*TAU*4-since*8)*6*k*(1-u);g.fillStyle=accent;g.globalAlpha=.16*alpha*(1-u*.55);g.beginPath();g.arc(x,y,(.45+.34*hash01(i,243,1))*k,0,TAU);g.fill();}
      physicsLabel(g,"brief RF pulse",W*.14,cy+R*.90,accent,k,.92*alpha);physicsLabel(g,"tips the net moment sideways",cx,cy-R*1.05,hi,k,.94*alpha);}
    if(mode===2){const age=since%4.6,amp=Math.exp(-age*.54),ready=1-Math.exp(-age*.72),phi=age*TAU*1.23;
      for(let i=0;i<20;i++){const spread=(1-amp)*(hash01(i,249,1)-.5)*TAU*1.7,a0=phi+spread,len=R*.43;physicsArrow(g,[cx,cy],[cx+Math.cos(a0)*len,cy+Math.sin(a0)*len*.24],lo,.52*k,.13*alpha,2.1*k);}
      physicsArrow(g,[cx,cy],[cx+Math.cos(phi)*R*.72*amp,cy+Math.sin(phi)*R*.20*amp],cyan,2.3*k,.94*alpha,7*k);
      physicsArrow(g,[cx+R*.08,cy],[cx+R*.08,cy-R*.66*ready],accent,1.15*k,.70*alpha,5*k);
      physicsLabel(g,"moments lose step",cx,cy-R*1.07,hi,k,.92*alpha);physicsLabel(g,"alignment with B₀ returns",cx,cy+R*1.07,accent,k,.82*alpha);
      for(let i=0;i<48;i++){const u=i/47,x=mix(cx+R*.52,coilX-R*.08,u),y=cy+Math.sin(phi+u*TAU)*R*.25*amp;g.fillStyle=i%5===0?cyan:lo;g.globalAlpha=alpha*(.07+.24*(1-u))*amp;g.beginPath();g.arc(x,y,(.42+.34*hash01(i,251,2))*k,0,TAU);g.fill();}
    }g.restore();};
  const flatTrace=(alpha)=>{const x0=W*.61,x1=W*.93,y=H*.49;g.save();g.strokeStyle=lo;g.globalAlpha=.64*alpha;g.lineWidth=.8*k;g.beginPath();g.moveTo(x0,H*.25);g.lineTo(x0,H*.73);g.lineTo(x1,H*.73);g.stroke();dotPolyline(g,[[x0,y],[x1,y]],lo,.55*k,.82*alpha,4*k);physicsLabel(g,"voltage in receive coil",x0,H*.19,hi,k,.94*alpha,"left");physicsLabel(g,"time",x1,H*.78,hi,k,.62*alpha,"right");physicsLabel(g,"silent",(x0+x1)/2,y-16*k,hi,k,.64*alpha);g.restore();};
  const liveTrace=(alpha)=>{if(alpha<=.001)return;const x0=W*.59,x1=W*.94,top=H*.15,mid=H*.39,bottom=H*.80,gw=x1-x0;g.save();g.strokeStyle=lo;g.globalAlpha=.48*alpha;g.lineWidth=.8*k;
    g.beginPath();g.moveTo(x0,top);g.lineTo(x0,bottom);g.lineTo(x1,bottom);g.stroke();physicsLabel(g,"voltage in receive coil",x0,top-10*k,hi,k,.92*alpha,"left");physicsLabel(g,"time after the RF pulse",x1,bottom+12*k,lo,k,.84*alpha,"right");
    const pts=[];for(let i=0;i<150;i++){const u=i/149;pts.push([x0+u*gw,mid-Math.sin(u*TAU*7.2)*H*.20*Math.exp(-u*2.65)]);}dotPolyline(g,pts,cyan,.58*k,.94*alpha,3.7*k);
    const rec=[];for(let i=0;i<100;i++){const u=i/99;rec.push([x0+u*gw,bottom-(1-Math.exp(-u*3.3))*H*.18]);}dotPolyline(g,rec,accent,.54*k,.75*alpha,4.0*k);
    physicsLabel(g,"signal fades",x1,mid-4*k,cyan,k,.92*alpha,"right");physicsLabel(g,"ready for the next pulse",x1,bottom-H*.19,accent,k,.88*alpha,"right");
    const u=(since%4.6)/4.6,vmid=mid-Math.sin(u*TAU*7.2)*H*.20*Math.exp(-u*2.65),vrec=bottom-(1-Math.exp(-u*3.3))*H*.18;
    for(const [x,y,c] of [[x0+u*gw,vmid,cyan],[x0+u*gw,vrec,accent]]){g.fillStyle=c;g.globalAlpha=.95*alpha;g.beginPath();g.arc(x,y,2.2*k,0,TAU);g.fill();}
    physicsLabel(g,"the scanner records voltage—not a picture",(x0+x1)/2,H*.91,accent,k,.92*alpha);g.restore();};
  if(step===0){apparatus(1,0);flatTrace(1);}
  else if(step===1){apparatus(1,1);flatTrace(Math.max(.28,1-e));}
  else {apparatus(1,2);liveTrace(e);flatTrace(1-e);}
}

// PubChem CID 6102852, heavy-atom 2D coordinates. The deposited record stores Gd and the
// ligand as separate charged components, so the native drawing places Gd at the macrocycle
// centre and shows its donor coordination as dotted lines. This is a structural cue, not a
// claim that the chelate lies flat in solution.
const GADOBUTROL_ATOMS=[
  [.02,.02,"Gd"],[.3552,-.7535,"O"],[.9956,-.3838,"O"],[.7821,-1,"O"],[.538,1,"O"],[-.7512,-.7482,"O"],[.1436,.8366,"O"],[-.8069,-.3249,"O"],[-.6839,.8745,"O"],[-.7944,.4621,"O"],
  [.3552,-.2606,"N"],[.3323,.3812,"N"],[-.3182,-.2606,"N"],[-.3182,.3345,"N"],[.5687,-.3838,"C"],[.3552,-.0141,"C"],[.1418,-.3838,"C"],[.4555,.1677,"C"],[-.0717,-.2606,"C"],[.5687,-.6303,"C"],[.0942,.445,"C"],[-.4925,-.0863,"C"],[.7821,-.2606,"C"],[-.0801,.2707,"C"],[-.4925,.1602,"C"],[.7821,-.7535,"C"],[.4823,.5767,"C"],[-.4125,-.4883,"C"],[-.382,.5726,"C"],[.388,.8045,"C"],[-.6569,-.5204,"C"],[-.6201,.6364,"C"]
];
const GADOBUTROL_BONDS=[[19,1,1],[2,22,1],[3,25,1],[4,29,1],[5,30,1],[6,29,2],[7,30,2],[8,31,1],[9,31,2],[10,14,1],[10,15,1],[10,16,1],[11,17,1],[11,20,1],[11,26,1],[12,18,1],[12,21,1],[12,27,1],[13,23,1],[13,24,1],[13,28,1],[14,19,1],[14,22,1],[15,17,1],[16,18,1],[19,25,1],[20,23,1],[21,24,1],[26,29,1],[27,30,1],[28,31,1]];
function drawGadobutrol(g,cx,cy,s,k,alpha=1){
  const violet="#B89CFF",cyan="#6FB8C8",accent=cssVar("--accent","#D97757"),lo=cssVar("--lo","#6E6C64"),hi=cssVar("--hi","#F9F9F7");
  const point=(i)=>({x:cx+GADOBUTROL_ATOMS[i][0]*s,y:cy+GADOBUTROL_ATOMS[i][1]*s});
  g.save();g.lineCap="round";g.lineJoin="round";g.strokeStyle=lo;g.globalAlpha=.46*alpha;g.lineWidth=.48*k;
  for(const [a,b,order] of GADOBUTROL_BONDS){const p=point(a),q=point(b),dx=q.x-p.x,dy=q.y-p.y,L=Math.hypot(dx,dy)||1,nx=-dy/L,ny=dx/L,off=order===2?.70*k:0;
    g.beginPath();g.moveTo(p.x+nx*off,p.y+ny*off);g.lineTo(q.x+nx*off,q.y+ny*off);g.stroke();if(order===2){g.beginPath();g.moveTo(p.x-nx*off,p.y-ny*off);g.lineTo(q.x-nx*off,q.y-ny*off);g.stroke();}}
  g.strokeStyle=violet;g.globalAlpha=.44*alpha;g.setLineDash([1.1*k,1.8*k]);for(const i of [10,11,12,13,1,4,5]){const p=point(i);g.beginPath();g.moveTo(cx,cy);g.lineTo(p.x,p.y);g.stroke();}g.setLineDash([]);
  for(let i=1;i<GADOBUTROL_ATOMS.length;i++){const p=point(i),el=GADOBUTROL_ATOMS[i][2];g.fillStyle=el==="O"?accent:el==="N"?cyan:lo;g.globalAlpha=(el==="C"?.60:.92)*alpha;g.beginPath();g.arc(p.x,p.y,(el==="C"?.68:1.18)*k,0,TAU);g.fill();}
  g.fillStyle=violet;g.shadowColor=violet;g.shadowBlur=3*k;g.globalAlpha=.98*alpha;g.beginPath();g.arc(cx,cy,2.55*k,0,TAU);g.fill();g.shadowBlur=0;
  g.fillStyle=hi;g.font=fontOf(Math.max(.60,k*.72),7.0);g.textAlign="center";g.textBaseline="middle";g.globalAlpha=.92*alpha;g.fillText("Gd",cx,cy+.2*k);g.restore();
}

/* Overlay only positive measured change from two jointly-windowed, registered DCE frames.
 * This makes the contrast legible without re-windowing the post-injection image or inventing
 * a heat map.  The original grayscale remains underneath and every violet mark corresponds
 * to a positive pixel-wise signal difference in the supplied data. */
function drawDceSignalIncrease(g,before,after,box,k,alpha=1){
  const a=rasterFrame(before),b=rasterFrame(after);if(!a||!b||a.w!==b.w||a.h!==b.h)return false;
  const scale=Math.min(box.w/a.w,box.h/a.h),dw=a.w*scale,dh=a.h*scale,ox=box.x+(box.w-dw)/2,oy=box.y+(box.h-dh)/2,violet="#B89CFF";
  g.save();g.fillStyle=violet;
  for(let y=0;y<a.h;y+=6)for(let x=0;x<a.w;x+=6){const j=(y*a.w+x)*4;if(b.data[j+3]<12)continue;
    const p=(a.data[j]+a.data[j+1]+a.data[j+2])/765,q=(b.data[j]+b.data[j+1]+b.data[j+2])/765,d=q-p;if(d<.055)continue;
    if(hash01(x,y,271)>clamp01(.22+d*1.4))continue;g.globalAlpha=alpha*clamp01(.10+d*.92);g.beginPath();g.arc(ox+(x+.5)*scale,oy+(y+.5)*scale,(.48+.85*Math.sqrt(d))*k,0,TAU);g.fill();}
  g.restore();return true;
}

// The approved DCE prototype is a pre-rendered movie of the participant's actual 4-D
// acquisition.  Its slice, brain mask and intensity mapping are fixed for the whole film.
// Keep only the first 100 acquired frames in the teaching loop: baseline, first arrival,
// tissue passage and early washout.  The source movie is 12 encoded frames per second.
let REAL_DCE_VIDEO=null,realDcePending=null,realDcePoster=null,realDceLastDraw=0,realDceIdleTimer=0;
const REAL_DCE_LOOP_SECONDS=100/12;
function loadRealDceVideo(url="decks/assets/defense/real-dce-dual.mp4",poster="decks/assets/defense/real-dce-dual-poster.png"){
  if(REAL_DCE_VIDEO)return Promise.resolve(REAL_DCE_VIDEO);if(realDcePending)return realDcePending;
  realDcePoster=new Image();realDcePoster.decoding="async";realDcePoster.src=poster;
  realDcePending=new Promise(resolve=>{const video=document.createElement("video");video.muted=true;video.loop=false;
    video.playsInline=true;video.preload="auto";video.poster=poster;const done=()=>{REAL_DCE_VIDEO=video;resolve(video);};
    video.addEventListener("loadeddata",done,{once:true});video.addEventListener("error",()=>resolve(null),{once:true});video.src=url;video.load();});
  return realDcePending;
}
function activateRealDceVideo(){const video=REAL_DCE_VIDEO;realDceLastDraw=performance.now();
  if(!realDceIdleTimer){const check=()=>{if(performance.now()-realDceLastDraw>520){REAL_DCE_VIDEO?.pause?.();realDceIdleTimer=0;}
    else realDceIdleTimer=setTimeout(check,520);};realDceIdleTimer=setTimeout(check,520);}
  if(video?.readyState>=2){if(video.currentTime>=REAL_DCE_LOOP_SECONDS||video.ended)video.currentTime=0;
    if(video.paused)void video.play().catch(()=>{});}return video;}
function drawRealDceMovie(g,W,H,k,alpha=1,clean=false){if(alpha<=.001)return;const video=activateRealDceVideo(),source=video?.readyState>=2?video:
    (realDcePoster?.complete&&realDcePoster.naturalWidth?realDcePoster:null);if(!source)return;
  const frame=clean?{x:W*.012,y:H*.012,w:W*.976,h:H*.976}:{x:W*.035,y:H*.035,w:W*.930,h:H*.875},sw=source.videoWidth||source.naturalWidth||1280,
    sh=source.videoHeight||source.naturalHeight||720,scale=Math.min(frame.w/sw,frame.h/sh),dw=sw*scale,dh=sh*scale,
    x=frame.x+(frame.w-dw)/2,y=frame.y+(frame.h-dh)/2,lo=cssVar("--lo","#6E6C64"),hi=cssVar("--hi","#F9F9F7");
  g.save();g.globalAlpha=alpha;if(!clean){g.fillStyle="#171818";g.fillRect(frame.x,frame.y,frame.w,frame.h);}g.drawImage(source,x,y,dw,dh);
  if(clean){g.restore();return;}
  g.strokeStyle=lo;g.globalAlpha=.42*alpha;g.lineWidth=.75*k;g.strokeRect(x,y,dw,dh);g.fillStyle="rgba(20,21,21,.82)";
  g.fillRect(W*.315,H*.915,W*.370,H*.060);g.fillStyle=hi;g.globalAlpha=.90*alpha;g.textAlign="center";g.textBaseline="middle";
  g.font=fontOf(Math.max(.84,k),8.4);g.fillText("real 4-D DCE · fixed head mask + fixed grayscale · first 100 frames",W*.50,H*.945);g.restore();}

function drawRealDceOverlay(g,W,H,k,alpha=1){if(alpha<=.001)return;const video=activateRealDceVideo(),source=video?.readyState>=2?video:
    (realDcePoster?.complete&&realDcePoster.naturalWidth?realDcePoster:null);if(!source)return;
  const frame={x:W*.075,y:H*.125,w:W*.850,h:H*.700},sw=source.videoWidth||source.naturalWidth||1180,
    sh=source.videoHeight||source.naturalHeight||552,scale=Math.min(frame.w/sw,frame.h/sh),dw=sw*scale,dh=sh*scale,
    x=frame.x+(frame.w-dw)/2,y=frame.y+(frame.h-dh)/2;
  g.save();g.globalAlpha=alpha;g.imageSmoothingEnabled=true;g.imageSmoothingQuality="high";
  // The source is cropped to the two scientific panels only: the real axial DCE movie and
  // its synchronized concentration trace.  Its near-black field merges into the page; the
  // shadow separates the evidence from the continuously rotating anatomy underneath.
  g.shadowColor="rgba(0,0,0,.94)";g.shadowBlur=38*k;g.shadowOffsetY=14*k;
  g.drawImage(source,x,y,dw,dh);g.restore();}

if(typeof Image!=="undefined")void loadRealDceVideo();

function drawGadoliniumRelaxation(g,W,H,t,a={}){
  const k=a.k??1,step=sceneStep(a),since=Math.max(0,Number(a._stepElapsed??0));
  if(a.movieOnly){drawRealDceMovie(g,W,H,k,1,true);return;}
  const hi=cssVar("--hi","#F9F9F7"),lo=cssVar("--lo","#6E6C64"),accent=cssVar("--accent","#D97757"),violet="#B89CFF",e=smooth(since/.75);
  const baseline=raster("decks/assets/defense/patient-dce-baseline.png"),enhanced=raster("decks/assets/defense/patient-dce-enhanced.png");
  const imageA=step>=2?e:0,poolA=step<2?1:1-e,gdA=step===0?0:step===1?e:1;
  const pool={x:W*.055,y:H*.18,w:W*.365,h:H*.50};
  const drawPool=(alpha)=>{if(alpha<=.001)return;g.save();g.strokeStyle=gdA>.1?violet:lo;g.globalAlpha=.28*alpha;g.lineWidth=.8*k;g.strokeRect(pool.x,pool.y,pool.w,pool.h);
    for(let i=0;i<86;i++){const x=pool.x+pool.w*(.06+.88*hash01(i,283,1)),y=pool.y+pool.h*(.08+.84*hash01(i,283,2)),near=gdA*hash01(i,283,3);g.fillStyle=near>.62?violet:hi;g.globalAlpha=alpha*(.16+.38*hash01(i,283,4));g.beginPath();g.arc(x,y,(.50+.40*hash01(i,283,5))*k,0,TAU);g.fill();}
    if(gdA>.01)for(let j=0;j<3;j++){const x=pool.x+pool.w*(.25+.25*j),y=pool.y+pool.h*(.34+.25*(j%2));drawGadobutrol(g,x,y,8.2*k,k,alpha*gdA);
      const r=(12+5*Math.sin(t*2.2+j))*k;g.strokeStyle=violet;g.globalAlpha=.13*alpha*gdA;g.lineWidth=.65*k;g.beginPath();g.arc(x,y,r,0,TAU);g.stroke();}
    physicsLabel(g,gdA>.1?"water near gadobutrol":"water without gadobutrol",pool.x+pool.w*.50,pool.y+pool.h+16*k,gdA>.1?violet:hi,k,.92*alpha);g.restore();};
  const x0=W*.49,x1=W*.765,yTop=H*.17,yBottom=H*.71,next=.44,ready0=(u)=>1-Math.exp(-u/.52),readyGd=(u)=>1-Math.exp(-u/.22);
  const drawRecovery=(alpha)=>{if(alpha<=.001)return;g.save();g.strokeStyle=lo;g.globalAlpha=.50*alpha;g.lineWidth=.85*k;g.beginPath();g.moveTo(x0,yTop);g.lineTo(x0,yBottom);g.lineTo(x1,yBottom);g.stroke();
    physicsLabel(g,"water ready for the next pulse",x0,yTop-12*k,hi,k,.94*alpha,"left");physicsLabel(g,"time since RF pulse",x1,yBottom+14*k,lo,k,.86*alpha,"right");
    physicsLabel(g,"100%",x0-8*k,yTop,lo,k,.72*alpha,"right");physicsLabel(g,"0",x0-8*k,yBottom,lo,k,.72*alpha,"right");
    const curve=(fn,col,a0)=>{const pts=[];for(let i=0;i<120;i++){const u=i/119;pts.push([mix(x0,x1,u),mix(yBottom,yTop,fn(u))]);}dotPolyline(g,pts,col,.60*k,a0*alpha,3.8*k);};curve(ready0,lo,.84);if(gdA>.01)curve(readyGd,violet,.96*gdA);
    const nx=mix(x0,x1,next);g.strokeStyle=accent;g.globalAlpha=.62*alpha;g.setLineDash([3*k,4*k]);g.beginPath();g.moveTo(nx,yTop);g.lineTo(nx,yBottom);g.stroke();g.setLineDash([]);physicsLabel(g,"next RF pulse",nx+5*k,yBottom-11*k,accent,k,.90*alpha,"left");
    for(const [v,c,a0] of [[ready0(next),lo,.82],[readyGd(next),violet,gdA]]){if(a0<=.01)continue;g.fillStyle=c;g.globalAlpha=.95*alpha*a0;g.beginPath();g.arc(nx,mix(yBottom,yTop,v),2.35*k,0,TAU);g.fill();}
    physicsLabel(g,"without Gd",x1,yTop+H*.11,lo,k,.76*alpha,"right");if(gdA>.08)physicsLabel(g,"with Gd",x1,yTop+H*.02,violet,k,.92*alpha*gdA,"right");g.restore();};
  const drawVoltage=(alpha)=>{if(alpha<=.001||gdA<.08)return;const vx0=W*.815,vx1=W*.965,ym0=H*.38,ym1=H*.59;g.save();physicsLabel(g,"received voltage",vx0,H*.21,hi,k,.90*alpha,"left");
    const wave=(ym,amp,col,a0)=>{const pts=[];for(let i=0;i<70;i++){const u=i/69;pts.push([mix(vx0,vx1,u),ym-Math.sin(u*TAU*4.2)*amp*Math.exp(-u*1.7)]);}dotPolyline(g,pts,col,.55*k,a0*alpha,3.6*k);};
    wave(ym0,7*k,lo,.78);wave(ym1,18*k,violet,.96*gdA);physicsLabel(g,"without Gd",vx0,ym0-17*k,lo,k,.76*alpha,"left");physicsLabel(g,"with Gd",vx0,ym1-26*k,violet,k,.92*alpha*gdA,"left");
    physicsLabel(g,"more recovered water",(vx0+vx1)/2,H*.74,violet,k,.90*alpha*gdA);physicsLabel(g,"→ larger voltage",(vx0+vx1)/2,H*.80,accent,k,.90*alpha*gdA);g.restore();};
  g.save();drawPool(poolA);drawRecovery(step<2?1:poolA);drawVoltage(step===1?e:step<2?1:poolA);
  if(step<2)REAL_DCE_VIDEO?.pause?.();else drawRealDceMovie(g,W,H,k,imageA);g.restore();
}

function drawLiteratureComparator(g,W,H,t,a={}){
  if(!MESH){loadBrainMesh(a.mesh||"decks/data/brain-mesh.json");return;}const k=a.k??1,
    hi=cssVar("--hi","#F9F9F7"),lo=cssVar("--lo","#6E6C64"),hair=cssVar("--hair","#33322E"),
    coral=cssVar("--accent","#D97757"),cyan="#6FB8C8",yaw=((112+t*.012*360)*Math.PI)/180,
    tilt=12*Math.PI/180,cy=Math.cos(yaw),sy=Math.sin(yaw),ct=Math.cos(tilt),st=Math.sin(tilt),S=H*.175;
  const panels=[
    {x:.145,accent:coral,lit:["cortex"],metric:"Kᵗʳᵃⁿˢ  ↑",region:"cortical signal"},
    {x:.375,accent:cyan,lit:["brainstem","cerebellum_wm"],metric:"vₚ  ↓",region:"brainstem + cerebellar WM"},
    {x:.625,accent:coral,lit:["cortex"],metric:"Kᵢ  ↑",region:"cortex + GM/WM interface"},
    {x:.855,accent:cyan,lit:["cortex","subcortex","brainstem","cerebellum","wm","cerebellum_wm","ventricles"],metric:"vᴮ  ↓",region:"all seven tissue classes"},
  ];
  g.save();g.strokeStyle=hair;g.globalAlpha=.72;g.lineWidth=.8*k;g.beginPath();g.moveTo(W*.50,H*.12);g.lineTo(W*.50,H*.84);g.stroke();g.restore();
  g.save();g.textAlign="center";g.textBaseline="middle";g.fillStyle=hi;g.globalAlpha=.96;g.font=fontOf(Math.max(k,.88),12.2);
  g.fillText("Yoen et al. · 2021",W*.26,H*.085);g.fillText("present study",W*.74,H*.085);
  g.font=fontOf(Math.max(k,.82),7.8);g.fillStyle=lo;g.globalAlpha=.80;g.fillText("42 mTBI + PCS · 29 symptomatic comparators",W*.26,H*.135);
  g.fillText("46 PPCS · 15 concurrent controls",W*.74,H*.135);g.restore();
  for(const panel of panels){const state={cy,sy,ct,st,S,ox:W*panel.x,oy:H*.50,lit:panel.lit,only:null,rois:[],k,t,explode:0,
      contextOpacity:.13,facets:true,breathe:0,gray:0,accent:panel.accent};drawBrainMesh(g,W,H,MESH,state);drawBrainWire(g,W,H,MESH,state);
    g.save();g.textAlign="center";g.textBaseline="middle";g.fillStyle=panel.accent;g.globalAlpha=.98;g.font=fontOf(Math.max(k,.90),12.4);
    g.fillText(panel.metric,W*panel.x,H*.775);g.fillStyle=hi;g.globalAlpha=.88;g.font=fontOf(Math.max(k,.82),7.8);g.fillText(panel.region,W*panel.x,H*.825);g.restore();}
  g.save();g.textAlign="center";g.textBaseline="middle";g.fillStyle=lo;g.globalAlpha=.78;g.font=fontOf(Math.max(k,.80),7.6);
  g.fillText("same reference anatomy · reported regions and direction only · Kᵗʳᵃⁿˢ / vₚ are not numerically interchangeable with Kᵢ / vᴮ",W*.50,H*.935);g.restore();
}


export const BIOLOGY = {
  fssStory: FSS_STORY,
  /** The supplied smoke runner, decoded frame-by-frame into native Spiral particles. */
  concussionRunner: {
    aspect: 2.22, loop: true, fps: 16, dpr: 1, minWidth: 680, revealSteps: 3,
    load:(a={})=>Promise.all([loadBrain(a.brain||"decks/data/brain.json"),loadBrainMesh(a.mesh||"decks/data/brain-mesh.json"),loadRunnerVideo(a.video||"decks/assets/runner-smoke-source.webm"),loadRunnerHeadTrack(a.headTrack||"decks/data/runner-head-track.json")]),
    draw(g,W,H,t,a={}){
      const k=a.k??1,step=Math.min(3,sceneStep(a)),since=Math.max(0,Number(a._stepElapsed??0));
      syncRunnerVideo(step,since);
      drawRunnerFloor(g,W,H,t,step,since,k,H*.84,1);
      drawConcussionTimeArc(g,W,H,step,since,k);
      drawRunnerVideoDots(g,W,H,step,since,k,1);
      drawConcussionSymptomEvolution(g,W,H,step,since,k);
    },
  },

  quantumSpin: {
    aspect:2.22,loop:true,fps:8,dpr:1,minWidth:680,revealSteps:3,
    load:(a={})=>loadWaterElectronDensity(a.src||"decks/data/water-electron-density.json"),
    draw:drawScientificQuantumSpin,
  },

  mrSignal: {
    aspect:2.22,loop:true,minWidth:680,revealSteps:2,
    draw:drawMRSignal,
  },

  gadoliniumRelaxation: {
    aspect:2.22,loop:true,minWidth:680,revealSteps:2,
    load:()=>Promise.all([loadRaster("decks/assets/defense/patient-dce-baseline.png"),
      loadRaster("decks/assets/defense/patient-dce-enhanced.png"),loadRealDceVideo()]),
    draw:drawGadoliniumRelaxation,
  },

  literatureComparator: {
    aspect:2.22,loop:true,fps:10,dpr:1,minWidth:720,
    load:(a={})=>loadBrainMesh(a.mesh||"decks/data/brain-mesh.json"),
    draw:drawLiteratureComparator,
  },

  /**
   * Three physiological measurements registered to one continuously rotating anatomy.
   *
   * The click states accumulate instead of replacing one another: an orange cortical pass
   * for the local K_i result, a cyan whole-brain wire pass for diffuse v_B, then a restrained
   * blue surface wash for global CMRO2. Every layer uses the same projection state and clock,
   * so advancing the slide cannot reset the brain angle or imply a causal sequence.
   */
  synthesisBrainPasses: {
    aspect:1.86,loop:true,fps:18,dpr:1,minWidth:720,revealSteps:3,
    load:(a={})=>Promise.all([loadBrain(a.brain||"decks/data/brain.json"),
      loadBrainMesh(a.mesh||"decks/data/brain-mesh.json")]),
    draw(g,W,H,t,a={}){
      if(!BRAIN||!MESH){loadBrain(a.brain);loadBrainMesh(a.mesh);return;}
      const k=a.k??1,step=Math.max(0,Math.min(3,sceneStep(a))),
        since=Math.max(0,Number(a._stepElapsed??0)),settled=!!(a._stepSettled||a._stepBackward||a._directEnd),
        entering=settled?1:smooth(since/.82),shown=(n)=>step<n?0:step===n?entering:1,
        local=shown(1),vascular=shown(2),oxygen=shown(3),
        orange="#EF7654",cyan="#55CBD0",blue="#68A7FF",hi=cssVar("--hi","#F9F9F7"),
        lo=cssVar("--lo","#6E6C64"),pulse=.5+.5*Math.sin(t*TAU*.48),
        viewArgs={center:[.5,.49],scale:1.54,yaw:104,tilt:12,spin:.020,k},
        view={...patientView(W,H,t,viewArgs),lit:null,only:null,rois:[],facets:false,
          breathe:.010,gray:.72,accent:orange,contextOpacity:.16};

      // The figure owns the full field. Literal black prevents the deck's dot texture from
      // reading through the low-opacity scientific overlays.
      g.save();g.fillStyle="#000";g.fillRect(0,0,W,H);

      // A faint organ-centred glow provides depth without becoming a card or a panel.
      const baseGlow=g.createRadialGradient(view.ox,view.oy-view.S*.02,view.S*.08,
        view.ox,view.oy-view.S*.02,view.S*.76);
      baseGlow.addColorStop(0,"rgba(246,245,242,.055)");baseGlow.addColorStop(1,"rgba(246,245,242,0)");
      g.fillStyle=baseGlow;g.fillRect(view.ox-view.S,view.oy-view.S,view.S*2,view.S*2);

      // Existing deck asset, unchanged camera and clock in every state.
      BIOLOGY.brain3d.draw(g,W,H,t,{render:"wire",...viewArgs,label:false,gray:.72,
        activity:.82,contextOpacity:.24,breathe:.010,dot:.92});

      if(local>.001){
        // Cortical surface is the visible proxy for the tissue-level cortical GM and GM/WM
        // result. The layer is a rim rather than a filled lobe, preserving the base anatomy.
        const o={...view,lit:["cortex"],only:["cortex"],accent:orange};
        g.save();g.globalAlpha=.30+.58*local;drawBrainWire(g,W,H,MESH,o);g.restore();
        BIOLOGY.brain3d.draw(g,W,H,t,{render:"dots",...viewArgs,label:false,only:["cortex"],
          highlight:["cortex"],accent:orange,contextOpacity:.06,activity:.46*local,dot:.66,gray:0});
      }

      if(vascular>.001){
        // A sparse wire field spans every tissue class. Its low opacity lets the earlier
        // orange cortical rim remain visible instead of replacing it.
        const all=BRAIN.segments.map(s=>s.key),o={...view,lit:all,only:null,accent:cyan};
        g.save();g.globalAlpha=vascular*(.42+.07*Math.sin(t*TAU*.31));
        drawBrainWire(g,W,H,MESH,o);g.restore();
      }

      if(oxygen>.001){
        // Global CMRO2 is a whole-organ surface wash, clipped by the real mesh rather than an
        // ellipse. The slow pulse expresses scale only; it does not encode a measured rhythm.
        const all=MESH.segments.map(s=>s.key),o={...view,lit:all,only:null,accent:blue,facets:false};
        g.save();g.globalAlpha=oxygen*(.105+.055*pulse);drawBrainMesh(g,W,H,MESH,o);g.restore();
        g.save();g.globalAlpha=oxygen*(.18+.10*pulse);drawBrainWire(g,W,H,MESH,o);g.restore();
      }

      const label=(text,x,y,color,alpha,size=10.2,align="center")=>{if(alpha<=.001)return;g.save();
        g.textAlign=align;g.textBaseline="middle";g.font=fontOf(Math.max(k,.90),size);
        g.fillStyle=color;g.globalAlpha=alpha;g.shadowColor="rgba(0,0,0,.96)";g.shadowBlur=7*k;
        g.fillText(text,x,y);g.restore();};
      label("three measurements  ·  one anatomy",W*.060,H*.070,lo,1,8.4,"left");
      label("Kᵢ  ·  LOCAL EXCHANGE",W*.50,H*.068,orange,local,10.8);
      label("cortex + grey / white boundary",W*.50,H*.103,hi,local*.66,7.8);
      label("vᴮ  ·  DIFFUSE VASCULAR SPACE",W*.50,H*.928,cyan,vascular,10.8);
      label("lower across every tissue class",W*.50,H*.893,hi,vascular*.66,7.8);
      label("CMRO₂  ·  GLOBAL OXYGEN USE",W*.50,H*.485,blue,oxygen,14.4);
      label("lower at rest  ·  fell further during hypoxia",W*.50,H*.525,hi,oxygen*.72,7.8);
      g.restore();
    },
  },

  /**
   * The brain as it is, turned in the hand.
   *
   * 20,600 points on the surface of each tissue class, from FreeSurfer's fsaverage
   * segmentation — the same seven classes the figures plot, so a panel and a piece of anatomy
   * can be the same thing on a slide: name a segment and it lights while the rest of the head
   * goes to glass around it.
   *
   * Rotated and projected here rather than by a 3D library. The deck's whole language is
   * dots, a point cloud IS dots, and the projection is a rotation matrix — importing a
   * renderer to draw seven thousand circles would be the tail wagging the dog.
   *
   * What makes it read as solid rather than as fog is the NORMAL. Every point knows which
   * way its bit of surface faces, so the far wall of a structure is dimmed to near nothing
   * and the near wall is lit. Without that, a hollow shell of dots looks identical from the
   * inside and the outside and the shape never resolves.
   */
  brain3d: {
    aspect: 1.15,
    loop: true,
    minWidth: 260,
    load: (a = {}) => {
      const mode = a.render || "wire";
      const want = [];
      if (mode !== "mesh") want.push(loadBrain(a.src || "decks/data/brain.json"));
      if (mode !== "dots") want.push(loadBrainMesh(a.mesh || "decks/data/brain-mesh.json"));
      if (a.slice || a.sliceByStep || a.slicesByStep) {
        const slices=[a.slice,...(Array.isArray(a.sliceByStep)?a.sliceByStep:[]),...(Array.isArray(a.slicesByStep)?a.slicesByStep:[])].filter(Boolean);
        want.push(slices.some(s=>typeof s==="object"&&s.orthogonal)?loadOrthogonalRegions():loadAxialStack());
      }
      return Promise.all(want);
    },
    draw(g, W, H, t, a = {}) {
      const mode = a.render || "wire";
      const k = a.k ?? 1;
      if (mode !== "mesh" && !BRAIN) loadBrain(a.src || "decks/data/brain.json");
      if (mode !== "dots" && !MESH) loadBrainMesh(a.mesh || "decks/data/brain-mesh.json");
      const B = mode === "mesh" ? MESH : BRAIN;
      if (mode === "wire" && !MESH) { /* dots can draw while the mesh is still coming */ }
      if (!B) {                                  // still arriving: say so, quietly
        g.fillStyle = cssVar("--lo", "#6E6C64");
        g.font = fontOf(k, 10.5);
        g.textAlign = "center"; g.textBaseline = "middle";
        const [x, y] = brainPosition(W, H, a);
        g.fillText("reading the segmentation", x, y);
        return;
      }

      /* Which segments are drawn, and which one is being talked about. `only` is a hard
       * filter; `highlight` keeps everything in context. Steps are snapshots, so a regional
       * result slide can drive the brain and its plot from the same click. */
      const step = sceneStep(a);
      const only = tissueList(atStep(a.onlyByStep ?? a.onlyBySteps, step, a.only));
      const lit = tissueList(atStep(a.highlightsByStep ?? a.highlightByStep, step, a.highlight));
      const roiRaw = atStep(a.roisByStep ?? a.roiByStep, step, a.rois ?? a.roi);
      const rois = normalizeRois(roiRaw);
      const vessels = atStep(a.vesselsByStep ?? a.vesselByStep, step, a.vessels);
      const contextOpacity = Number(atStep(a.contextOpacityByStep, step, a.contextOpacity ?? 0.28));
      // Looping scenes do not restart on a click. The holder records the click's wall-clock
      // time, so a motion object inside a step sequence still gets its own 0 -> duration clock.
      const sinceStep = a._stepChangedAt == null ? t : Math.max(0, Number(a._stepElapsed ?? 0));

      let explodeSpec = atStep(a.explodeByStep, step, a.explode);
      if (explodeSpec === true) {
        explodeSpec = { from: Number(a.explodeFrom ?? 0), to: Number(a.explodeTo ?? 1),
                        delay: Number(a.explodeDelay ?? 0.10), seconds: Number(a.explodeSeconds ?? 1.35) };
      } else if (typeof explodeSpec === "number" && a.explodeFrom != null) {
        explodeSpec = { from: Number(a.explodeFrom), to: explodeSpec,
                        delay: Number(a.explodeDelay ?? 0), seconds: Number(a.explodeSeconds ?? 1.35) };
      }
      const explodeT = a.explodeByStep == null ? t : sinceStep;
      const explode = Math.max(0, motionValue(explodeSpec, explodeT, 0,
                                              { from: 0, to: 1, seconds: 1.35 }));

      let activitySpec = atStep(a.activityByStep, step, a.activity);
      if (typeof activitySpec === "number" && a.activityFrom != null) {
        activitySpec = { from: Number(a.activityFrom), to: activitySpec,
                         delay: Number(a.activityDelay ?? 0), seconds: Number(a.activitySeconds ?? 1.25) };
      }
      const activityT = a.activityByStep == null ? t : sinceStep;
      const activity = clamp01(motionValue(activitySpec, activityT, 1,
                                            { from: 1, to: 1, seconds: 1.25 }));

      let graySpec = atStep(a.grayByStep ?? a.greyscaleByStep ?? a.grayscaleByStep,
                            step, a.gray ?? a.greyscale ?? a.grayscale);
      const grayT = (a.grayByStep ?? a.greyscaleByStep ?? a.grayscaleByStep) == null ? t : sinceStep;
      const gray = clamp01(motionValue(graySpec, grayT, 0,
                                       { from: 0, to: 1, seconds: 1.25 }));
      const slice = atStep(a.sliceByStep ?? a.slicesByStep, step, a.slice);
      const sliceMode = typeof slice === "string" ? slice : slice?.mode;
      const signals = atStep(a.signalsByStep ?? a.signalByStep, step, a.signals);

      const spin = a.spin ?? 0.16;               // turns per second
      const yaw = ((a.yaw ?? 90) * Math.PI) / 180 + (a.still ? 0 : t * spin * TAU);
      const tilt = ((a.tilt ?? 14) * Math.PI) / 180;
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const ct = Math.cos(tilt), st = Math.sin(tilt);

      const S = Math.min(W, H) * 0.46 * (a.scale ?? 1);
      const [ox, oy] = brainPosition(W, H, a);
      const activeAccent = slice?.color || (sliceMode === "interface"
        ? (slice?.interfaceColor || a.interfaceAccent || "#F0C85A")
        : (a.accent || cssVar("--accent", "#D97757")));
      const state = { cy, sy, ct, st, S, ox, oy, lit, only, rois, k, t, explode,
                      contextOpacity, facets: a.facets, breathe: a.breathe, gray,
                      accent: activeAccent };

      if (mode === "mesh") {
        g.save(); g.globalAlpha *= activity;
        drawBrainMesh(g, W, H, MESH, state);
        g.restore();
      } else {
        /* Painter's order by BUCKET, not by sort.
         *
         * Seven thousand points sorted every frame is a hundred thousand comparisons thirty
         * times a second, on the machine that is also driving the projector. Depth only has to
         * be right to within a dot, so points go into 96 depth slices drawn back to front —
         * linear, and indistinguishable at this size. */
        const SLICES = 96;
        const bins = BRAIN._bins || (BRAIN._bins = Array.from({ length: SLICES }, () => []));
        for (let i = 0; i < SLICES; i++) bins[i].length = 0;

        const P = B.P, N = B.N, seg = B.seg;
        const moved = [0, 0, 0];
        for (let i = 0; i < B.n; i++) {
          const j = i * 3, si = seg[i], key = B.segments[si]?.key;
          let x = P[j], y = P[j + 1], z = P[j + 2];
          explodePoint(x, y, z, key, explode, moved);
          x = moved[0]; y = moved[1]; z = moved[2];
          // yaw about the superior axis, then tilt to look slightly down on it
          const xr = x * cy - y * sy;
          const yr0 = x * sy + y * cy;
          const yr = yr0 * ct - z * st;
          const zr = yr0 * st + z * ct;
          const d = -yr;                          // toward the viewer
          const b = ((d + 1) * 0.5 * (SLICES - 1)) | 0;
          bins[b < 0 ? 0 : b > SLICES - 1 ? SLICES - 1 : b].push(i, xr, zr, d);
        }

        const r0 = Math.max(0.95, 1.75 * k * (a.dot ?? 1));
        const accent = state.accent;
        const focus = !!lit || rois.length > 0;
        g.save(); g.globalAlpha *= activity;
        for (let s = 0; s < SLICES; s++) {
          const row = bins[s];
          for (let m = 0; m < row.length; m += 4) {
            const i = row[m], xr = row[m + 1], zr = row[m + 2], d = row[m + 3];
            const si = seg[i], key = B.segments[si]?.key;
            if (only && !only.includes(key)) continue;

            // which way this scrap of surface faces, after the same rotation
            const j = i * 3;
            const nx = N[j], ny = N[j + 1], nz = N[j + 2];
            const nyr0 = nx * sy + ny * cy;
            const face = -(nyr0 * ct - nz * st);  // +1 straight at you, -1 straight away

            /* The far wall is not deleted, only quietened — hard. Surface normal and depth
             * preserve solidity; focus opacity is a separate control and therefore need not
             * make all non-target anatomy disappear. */
            const front = face > 0 ? face : 0;
            const f2 = front * front;
            const seen = 0.035 + 0.965 * f2 * f2;
            const near = 0.42 + 0.58 * (d * 0.5 + 0.5);
            const localLit = rois.length && inRoi(P[j], P[j + 1], P[j + 2], key, rois);
            const isLit = !focus || !!localLit || !!lit?.includes(key);

            let alpha, col;
            if (isLit) {
              col = focus ? RAMP_ACCENT : B.tone[si];
              alpha = (focus ? 1 : 0.95) * seen * near;
            } else {
              col = B.tone[si];
              alpha = contextAlpha(contextOpacity) * seen * near;
            }
            if (alpha < 0.02) continue;

            const c = col === RAMP_ACCENT ? null : mixRgb(rampAt(col), [145, 145, 142], gray);
            g.fillStyle = c
              ? `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`
              : `color-mix(in srgb, color-mix(in srgb, ${accent} ${((1 - gray) * 100) | 0}%, #91918E) ${(alpha * 100) | 0}%, transparent)`;
            g.beginPath();
            g.arc(ox + xr * S, oy - zr * S, r0 * (0.72 + 0.5 * (d * 0.5 + 0.5)), 0, TAU);
            g.fill();
          }
        }

        if (mode === "wire" && MESH) drawBrainWire(g, W, H, MESH, state);
        g.restore();
      }

      const overlayState = { ...state, activity };
      drawVessels(g, W, H, t, overlayState, vessels, rois);
      drawRois(g, W, H, t, overlayState, rois);
      drawAxialSlice(g, W, H, t, overlayState, slice);
      drawKineticSignals(g, W, H, t, overlayState, signals, step, rois);
      if (a.label !== false) labelSegments(g, W, H, B, lit, only, k, ox);
    },
  },

  /**
   * One measured voxel, expanded into the cells and vessel wall it contains.
   *
   * The left side is the same fsaverage wire mesh as `brain3d`, not a silhouette substitute.
   * The magnified unit and barrier are native dotted primitives so they stay sharp on a
   * projector and remain editable without carrying a raster anatomy plate in the deck.
   */
  voxelNVU: {
    aspect: 2.22, loop: true, minWidth: 680, revealSteps: 3,
    load: (a = {}) => {const jobs=[loadBrain(a.brain||"decks/data/brain.json"),
      loadBrainMesh(a.mesh||"decks/data/brain-mesh.json")];
      // The scanner-only use of this scene stops after the voxel-selection reveal. Do not
      // make the opening of the talk download microscopy that is not introduced until Study I.
      if(Number(a.revealSteps??3)>1)jobs.push(loadRaster("decks/assets/defense/nvu-pial-penetrating.png"),
        loadRaster("decks/assets/defense/nvu-confocal-longitudinal.png"));return Promise.all(jobs);},
    draw(g, W, H, t, a = {}) {
      const k = a.k ?? 1, step = sceneStep(a), since = Math.max(0, Number(a._stepElapsed ?? 0));
      if (!BRAIN) { loadBrain(a.brain); loadBrainMesh(a.mesh); g.fillStyle=cssVar("--lo","#6E6C64");
        g.font=fontOf(k,10.5);g.textAlign="center";g.fillText("reading subject anatomy",W/2,H/2);return; }
      const enter = smooth(since / .82), zoom = step < 2 ? 0 : enter, voxel = a.voxel || [.48,-.18,.36];
      const leftW = mix(W, W*.27, zoom), brain = drawScannerBrain(g,leftW,H,t,{selected:step>=1?voxel:false,
        center:a.center||[.49,.50],scale:mix(Number(a.brainScale??1.46),1.04,zoom),yaw:104,tilt:12,spin:.026,k,
        activity:mix(1,.58,zoom),gridAlpha:mix(1,.30,zoom)});
      const hi=cssVar("--hi","#F9F9F7"),lo=cssVar("--lo","#6E6C64"),accent=cssVar("--accent","#D97757"),cyan="#6FB8C8",green="#78BA8D";
      if(a.caption!==false){g.font=fontOf(k,10.3);g.textAlign="center";g.textBaseline="bottom";g.fillStyle=step===1?accent:lo;
        g.fillText(step===0?"continuous anatomy · discrete scanner sampling":step===1?"select one cortical tissue voxel":"one voxel sits inside a vascular hierarchy",leftW*.5,H-4*k);}

      if(step===2){
        const box={x:W*.31,y:H*.035,w:W*.65,h:H*.88};
        if(brain?.selected){g.save();g.strokeStyle=accent;g.globalAlpha=.66*enter;g.setLineDash([4*k,5*k]);g.beginPath();g.moveTo(brain.selected.x,brain.selected.y);g.lineTo(box.x-10*k,H*.50);g.stroke();g.restore();}
        const figure=raster("decks/assets/defense/nvu-pial-penetrating.png");
        drawSpiralRaster(g,figure,{x:box.x,y:box.y,w:box.w*.66,h:box.h},k,{mode:"ink",crop:[0,0,.67,1],stride:4,dot:.96,alpha:enter});
        drawSpiralRaster(g,figure,{x:box.x+box.w*.66,y:box.y+.06*box.h,w:box.w*.34,h:box.h*.88},k,{mode:"dark",crop:[.65,0,.35,1],stride:4,dot:1.0,alpha:enter});
        physicsArrow(g,[box.x+box.w*.32,box.y+box.h*.22],[box.x+box.w*.58,box.y+box.h*.62],accent,1.25*k,enter,6*k);
        physicsLabel(g,"surface vessel → penetrating branch → capillary bed",box.x+box.w*.50,box.y+box.h*.96,hi,k,enter);
      }
      if(step>=3){
        const box={x:W*.315,y:H*.08,w:W*.64,h:H*.76};
        drawSpiralRaster(g,raster("decks/assets/defense/nvu-confocal-longitudinal.png"),box,k,{mode:"dark",stride:4,dot:1.05,alpha:enter});
        const leader=(text,p,q,color,align="left")=>{g.save();g.strokeStyle=color;g.fillStyle=color;g.globalAlpha=.92*enter;g.lineWidth=1.05*k;
          g.beginPath();g.moveTo(p[0],p[1]);g.lineTo(q[0],q[1]);g.stroke();g.font=fontOf(k,10.0);g.textAlign=align;g.textBaseline="middle";
          g.fillText(text,q[0]+(align==="left"?5:-5)*k,q[1]);g.restore();};
        leader("endothelium + basal lamina",[box.x+box.w*.52,box.y+box.h*.48],[box.x+box.w*.92,box.y+box.h*.12],accent,"right");
        leader("pericyte processes",[box.x+box.w*.40,box.y+box.h*.34],[box.x+box.w*.12,box.y+box.h*.13],green,"right");
        leader("AQP4 astrocyte endfeet",[box.x+box.w*.52,box.y+box.h*.29],[box.x+box.w*.92,box.y+box.h*.91],"#6F7FEA","right");
        leader("neurites",[box.x+box.w*.76,box.y+box.h*.16],[box.x+box.w*.92,box.y+box.h*.32],cyan,"right");
        physicsLabel(g,"actual multiplex confocal anatomy · 5 μm scale",box.x+box.w*.50,box.y+box.h+15*k,hi,k,enter);
      }
      g.globalAlpha=1;
    },
  },

  voxelPerfusion: {
    aspect: 2.30, loop: true, fps: 10, dpr: 1, minWidth: 720, revealSteps: 18, editOverflowX: .1,
    load: (a={}) => Promise.all([loadPatientBrain(a.src||"decks/data/patient-parcels.json"),
      loadBrain(a.brain||"decks/data/brain.json"),loadBrainMesh(a.mesh||"decks/data/brain-mesh.json"),
      loadVesselAtlas(a.vesselAtlas||"decks/data/brainproject-vessels.json"),
      loadH01Cortex(a.h01||"decks/data/h01-cortex-slab.json"),
      loadH01Turntables(a.turntables||"decks/assets/defense/h01-turntables"),
      loadRaster(a.pericyteImage||"decks/assets/defense/pericyte-sem.png"),
      loadRealDceVideo(a.dceVideo||"decks/assets/defense/real-dce-dual.mp4",a.dcePoster||"decks/assets/defense/real-dce-dual-poster.png")]),
    draw(g,W,H,t,a={}) {
      const k=a.k??1,presentationStep=sceneStep(a),introSteps=Math.max(0,Math.round(Number(a.introBulletSteps)||0)),
        // Bullet-only clicks keep the same anatomical state and continuous camera clock.
        // Preserve the established physical sequence, including its real-DCE aside.
        rawStep=Math.max(0,presentationStep-introSteps),
        // Logical state 15 restores the registered H01 cells around the already validated
        // vessel-only diffusion pass. Later macro/curve states shift by one click.
        step=rawStep<=3?rawStep:rawStep<=5?3:rawStep<=14?rawStep-2:rawStep-3,
        since=Math.max(0,Number(a._stepElapsed??0)),
        settled=!!(a._stepSettled||a._stepBackward||a._directEnd),enter=settled?1:smooth(since/.78),
        ageOf=(n)=>{const rawIndex=(n<=3?n:n<=12?n+2:n+3)+introSteps,age=Number(a._stepAges?.[rawIndex]);
          return Math.max(0,Number.isFinite(age)?age:presentationStep===rawIndex?since:0);};
      if(!PATIENT||!BRAIN||!H01_CORTEX){loadPatientBrain(a.src);loadBrain(a.brain);loadBrainMesh(a.mesh);
        loadVesselAtlas(a.vesselAtlas);loadH01Cortex(a.h01);return;}
      /* State 2 is deliberately one first pass. State 3 resumes at the exact end of that pass
       * and then remains a gap-free artery -> tissue -> distributed venous-tree loop. Curve
       * states use one uniformly scaled measured-time clock: the interval between
       * the two measured arterial peaks is exactly one anatomical cycle, with no compressed
       * jump through the inter-bolus samples. */
      const c=PATIENT.curves||{},timeS=c.time_s||[],ca=c.aif||[],ct=c.ct_tissue_voxel||c.ct_cortical_gm||[],
        eventTimes=c.bolus_peak_time_s||[],CYCLE=4.55,INTER_BOLUS_GAP=.72,PAIR_GAP=.90,
        PAIR_PERIOD=CYCLE*2+INTER_BOLUS_GAP+PAIR_GAP,ARTERIAL=[-.10,1.30],VENOUS=[1.30,4.48],
        curveClock=step>=14?ageOf(14):0,time0=Number(timeS[0]??0),time1=Number(timeS.at(-1)??1),
        timeSpan=Math.max(1e-6,time1-time0),peakGap=Math.max(1e-6,Number(eventTimes[1]??time1)-Number(eventTimes[0]??time0)),
        traceDuration=CYCLE*timeSpan/peakGap,tracePause=.95,tracePlayback=curveClock%(traceDuration+tracePause),
        eventAnim=(event)=>(Number(event)-time0)/timeSpan*traceDuration,
        measuredCycle=(clock)=>{for(const event of eventTimes.slice(0,2)){const start=eventAnim(event)-.37;
          if(clock>=start&&clock<start+CYCLE)return clock-start;}return -1;};
      const pairedCycleState=(clock)=>{const phase=((clock%PAIR_PERIOD)+PAIR_PERIOD)%PAIR_PERIOD,
          secondStart=CYCLE+INTER_BOLUS_GAP,secondEnd=secondStart+CYCLE;
        if(phase<CYCLE)return{age:phase,passIndex:0,retainedPasses:0,residueAlpha:1};
        // Hold the residue from passage one long enough to read before passage two arrives.
        if(phase<secondStart)return{age:-1,passIndex:0,retainedPasses:1,residueAlpha:1};
        if(phase<secondEnd)return{age:phase-secondStart,passIndex:1,retainedPasses:1,residueAlpha:1};
        // Preserve both retained layers after the second washout, then dissolve them only at
        // the loop boundary so the repeat does not jump from a dense cloud to an empty field.
        return{age:-1,passIndex:1,retainedPasses:2,
          residueAlpha:1-smooth((phase-secondEnd)/PAIR_GAP)};};
      const precomputedPairState=()=>{const video=H01_TURNTABLES?.exchange||H01_TURNTABLES?.all,
          duration=Math.max(.001,Number(video?.duration)||3),phase=((Number(video?.currentTime)||0)/duration)%1,
          firstStart=.025,firstEnd=.365,secondStart=.435,secondEnd=.795,
          active=(progress,passIndex,retainedPasses)=>({age:smooth(progress)*CYCLE,progress,
            microAge:progress*1.16,passIndex,retainedPasses,residueAlpha:1});
        // The vessel-only H01 movie is the master clock.  Its pulse uses smooth(progress), so
        // the macro vascular animation receives that exact eased fraction while both graph-
        // based microvascular views receive the same uneased progress before applying their
        // own identical smooth() front.  No local delay or independent wash clock remains.
        if(phase<firstStart)return{age:-1,progress:-1,microAge:-1,passIndex:0,retainedPasses:0,residueAlpha:1};
        if(phase<firstEnd)return active((phase-firstStart)/(firstEnd-firstStart),0,0);
        if(phase<secondStart)return{age:-1,passIndex:0,retainedPasses:1,residueAlpha:1};
        if(phase<secondEnd)return active((phase-secondStart)/(secondEnd-secondStart),1,1);
        return{age:-1,passIndex:1,retainedPasses:2,residueAlpha:1-smooth((phase-.94)/.06)};};
      let cycleAge=-1,pairState=null;
      if(step===2)cycleAge=Math.min(ARTERIAL[1],ageOf(2)*1.10);
      else if(step>=12&&step<=13){pairState=precomputedPairState();cycleAge=pairState.age;}
      else if(step>=3&&step<=11){pairState=pairedCycleState(ageOf(3)+1.30);cycleAge=pairState.age;}
      else if(step>=14)cycleAge=settled?(curveClock%CYCLE):measuredCycle(tracePlayback);
      const voxel=a.voxel||[.48,-.18,.36];
      // State 4 is a full-brain voxel selection only. State 5 first moves that brain into its
      // own lane and, only once it is essentially there, reveals the slab without a microdomain.
      // State 13 reverses the order—panels disappear before the brain grows—so no object ever
      // travels behind another.
      // Show the atlas-labelled anatomical right side on the audience's screen-right.  The
      // former 104° view used radiological laterality and made the correct right ICA look like
      // the left vessel to the audience.  Adding 180° preserves the same lateral geometry while
      // making the labelled side visually literal throughout this continuously rotating scene.
      const BASE_YAW=284,tilt=12,spin=.024,
        cameraState=a._voxelCamera||(a._voxelCamera={time:t,yaw:BASE_YAW}),
        cameraDt=Math.max(0,Math.min(.25,t-cameraState.time));
      cameraState.yaw=(cameraState.yaw+cameraDt*spin*360)%360;cameraState.time=t;
      const cameraYaw=cameraState.yaw,
        layoutU=step===5?enter:step>5&&step<=12?1:step===13?1-smooth((since-.38)/.50):0,
        panelAlpha=step===5?smooth((since-.68)/.38):step>5&&step<=12?1:step===13?1-smooth(since/.34):0,
        returnU=step===13?smooth((since-.42)/.52):step>13?1:0,
        threeU=step===6?enter:step>6&&step<=12?1:0,
        // Integrate one camera phase on the scene arguments themselves. Reveal clicks change
        // anatomy and layout, never the phase; the brain therefore cannot snap back to a
        // canonical yaw when a voxel, curve, or paper overlay appears.
        brainStill=true,brainTime=t;
      let scale=1.18,center=[.50,.51];
      if(a.speakingPrompts && rawStep <= 5){scale=.90;center=[.74,.51];}
      if(step===5){scale=mix(1.18,.84,layoutU);center=[mix(.50,.22,layoutU),.51];}
      else if(step>5&&step<=12){scale=mix(.84,.68,threeU);center=[mix(.22,.125,threeU),.51];}
      else if(step===13){scale=mix(.68,1.04,returnU);center=[mix(.125,.50,returnU),mix(.51,.49,returnU)];}
      else if(step>=14){scale=1.04;center=[.50,.49];}
      const contextActivity=Math.max(.34,1-.46*layoutU),selectedVisible=step>=4,
        targetClip=step===5?W*.47:W*mix(.47,.295,threeU),clipRight=mix(W,targetClip,layoutU),withBrainClip=(draw)=>{if(clipRight>=W-.5)return draw();g.save();g.beginPath();
          g.rect(0,0,clipRight,H);g.clip();const result=draw();g.restore();return result;},
        brainArgs={selected:selectedVisible?voxel:false,input:null,center,scale,yaw:cameraYaw,tilt,spin:0,k,
          still:brainStill,gridStill:false,activity:contextActivity,voxelAlpha:step===4?enter:selectedVisible?1:0,
          gridAlpha:step===0?1:step>=14?.34:mix(.46,.13,layoutU)};
      // The frozen left-lane brain is cached. Dynamic tracer remains separate and therefore
      // does not force the full brain geometry or the H01 surfaces to be rebuilt every frame.
      const cacheable=false,cacheKey=cacheable?[Math.ceil(W),Math.ceil(H),Math.round(k*100),
        Math.round(scale*1000),Math.round(center[0]*10000),Math.round(center[1]*10000),Math.round(cameraYaw*1000),
        Math.round(contextActivity*1000)].join(":"):"";
      const edit=figureEditParts(g,W,H),brainBounds={x:W*.28,y:H*.02,w:W*.44,h:H*.96};
      if(step>=14)edit.begin('brain','Rotating brain',brainBounds);
      let brain;if(cacheable){let cache=a._h01BrainCache;if(!cache||cache.key!==cacheKey){const canvas=document.createElement("canvas");
          canvas.width=Math.ceil(W);canvas.height=Math.ceil(H);const cg=canvas.getContext("2d"),cachedBrain=drawScannerBrain(cg,W,H,0,brainArgs);
          cache=a._h01BrainCache={key:cacheKey,canvas,brain:cachedBrain};}
        withBrainClip(()=>{g.save();g.globalAlpha=1;g.drawImage(cache.canvas,0,0);g.restore();});brain=cache.brain;
      }else brain=withBrainClip(()=>drawScannerBrain(g,W,H,brainTime,brainArgs));
      if(!brain){if(step>=14)edit.end();edit.finish();return;}

      const tracer="#B89CFF",accent=cssVar("--accent","#D97757");
      const label=(text,p,color)=>{g.save();g.fillStyle=color;g.globalAlpha=.96;g.font=fontOf(Math.max(k,.88),10.3);
        g.textAlign="center";g.textBaseline="bottom";const m=g.measureText(text),lh=13*k;
        g.fillStyle="rgba(20,21,21,.72)";g.fillRect(p.x-m.width*.5-5*k,p.y-9*k-lh,m.width+10*k,lh+4*k);
        g.fillStyle=color;g.shadowColor=color;g.shadowBlur=4*k;g.fillText(text,p.x,p.y-8*k);g.restore();};
      const localFlow=(age)=>{const duration=CYCLE-.52,cycleAge=age-.52;if(cycleAge<0||cycleAge>=duration)return null;
        return{cycle:true,cycleAge,duration,age:cycleAge<duration*.38?cycleAge:cycleAge<duration*.64?cycleAge-duration*.38:-1,
          wash:cycleAge>=duration*.38};};
      const drawWholeCycle=(age,alpha=1,veinAlpha=1,showMicro=false,syncedLocal=null)=>{withBrainClip(()=>{
        const drainFade=age<0?1:1-smooth((age-(CYCLE-.17))/.17);
        drawAtlasVessels(g,brain.state,{show:["arteries"],alpha:.42*alpha,stride:1,cycleAge:age,arterialWindow:ARTERIAL});
        drawAtlasVessels(g,brain.state,{show:["veins"],traceAllVeins:true,
          alpha:.27*alpha*veinAlpha,stride:1,cycleAge:age,venousWindow:VENOUS,
          tracerAlpha:veinAlpha*drainFade,tracerGain:.86});
        const local=showMicro?(syncedLocal||localFlow(age)):null;if(local?.age>=0)drawBrainMicroBolus(g,brain.state,brainTime,local.age,
          {wash:local.wash,alpha:.88*alpha,side:1,k,tracerColor:tracer});
      });};
      if(step===1){
        withBrainClip(()=>drawAtlasVessels(g,brain.state,{show:["arteries"],alpha:.48,stride:1}));
      } else if(step===2){
        withBrainClip(()=>drawAtlasVessels(g,brain.state,{show:["arteries"],alpha:.48,stride:1,cycleAge,arterialWindow:ARTERIAL}));
        label("gadolinium bolus",{x:W*(a.speakingPrompts?.74:.50),y:H*.91},tracer);
      } else if(step===3){drawWholeCycle(cycleAge,1,enter,false);
      } else if(step>=4&&step<12){drawWholeCycle(-1,1,1,false);
      } else if(step>=12){const syncedLocal=pairState?.microAge>=0?{cycle:true,cycleAge:pairState.microAge,
          duration:1.16,age:pairState.microAge,wash:false}:null;
        drawWholeCycle(cycleAge,1,1,step<=13,syncedLocal);}
      if(rawStep===4)drawRealDceOverlay(g,W,H,k,settled?1:smooth(since/.28));
      if(step>=5&&step<=13&&panelAlpha>.001){const local=step>=12&&pairState?.microAge>=0?
          {cycle:true,cycleAge:pairState.microAge,duration:1.16,age:pairState.microAge,wash:false}:null,
        slabStep=step===13?12:step,showMicro=step>=6,
        slab=drawH01CortexSlab(g,W,H,t,{step:slabStep,enter:step===5?panelAlpha:step===6?enter:1,alpha:panelAlpha,k,
          showMicro,microAlpha:step===6?enter:1,microTime:ageOf(6),tracerAge:local?.cycleAge,tracerWash:false,
          tracerCycle:local?.cycle,tracerDuration:local?.duration,tracerColor:tracer,
          tracerAccumulation:step>=12,
          tracerAccumulationAlpha:rawStep===14?enter:1,
          exchangeCellsAlpha:rawStep===15?enter:rawStep>15?1:0,
          tracerPassIndex:pairState?.passIndex??0,
          tracerRetainedPasses:pairState?.retainedPasses??0,tracerResidueAlpha:pairState?.residueAlpha??1,
          // Three explicit scale lanes: macro brain, cortical slab, and a larger microscope
          // view.  The narrow gutters keep the visual causal chain close without overlap.
          slabX:step===5?.66:mix(.66,.405,threeU),slabScale:step===5?.88:mix(.88,.82,threeU),
          microBox:[.525,.035,.470,.825],microZoom:1.38,
          stageLabel:false,microTitle:step>=12?"gadolinium · shared inflow → outflow clock":""});
        if(brain.selected&&slab){g.save();g.strokeStyle=tracer;g.globalAlpha=.44*(step===4?enter:1);
          g.lineWidth=.85*k;g.setLineDash([3*k,5*k]);g.beginPath();g.moveTo(brain.selected.x,brain.selected.y);
          g.lineTo(slab.bounds.minX-8*k,(slab.bounds.minY+slab.bounds.maxY)*.5);g.stroke();g.restore();}
        if(local?.age>=0)drawH01Tracer(g,slab,t,{age:local.age,wash:local.wash,alpha:panelAlpha,k,tracerColor:tracer,extravascular:false});
      }
      if(step===8){
        // Keep the entire capillary state alive underneath. The supplied SEM is a temporary
        // floating overlay; it adds no caption or frame, casts one soft shadow, and vanishes
        // on the next reveal while every turntable stream continues rotating behind it.
        const image=raster(a.pericyteImage||"decks/assets/defense/pericyte-sem.png");
        if(image){const overlayAlpha=settled?1:smooth(since/.24),imageScale=Math.min(W*.62/image.naturalWidth,H*.67/image.naturalHeight),
            dw=image.naturalWidth*imageScale,dh=image.naturalHeight*imageScale,x=(W-dw)*.5,y=(H-dh)*.5;
          g.save();g.globalAlpha=overlayAlpha;g.imageSmoothingEnabled=true;g.imageSmoothingQuality="high";
          g.shadowColor="rgba(0,0,0,.92)";g.shadowBlur=34*k;g.shadowOffsetY=13*k;g.drawImage(image,x,y,dw,dh);g.restore();}
      }
      const voxelHeight=clamp01((Number(voxel[2])+.90)/1.80),
        // Arrival is later in the higher tissue voxel.  One physical delay is used twice:
        // to shift the measured tissue response on the acquisition-time axis and to delay
        // the live reveal by the corresponding fraction of the shared animation clock.
        tissueDelayS=2.0+2.4*voxelHeight,tissueTransit=tissueDelayS/timeSpan*traceDuration,
        inputU=settled?1:clamp01(tracePlayback/traceDuration),tissueU=settled?1:clamp01((tracePlayback-tissueTransit)/traceDuration),
        measuredLevel=(values,upto)=>{if(!values?.length)return 0;const q=upto*(values.length-1),i=Math.min(values.length-2,Math.max(0,Math.floor(q))),f=q-i,
          value=mix(Number(values[i])||0,Number(values[i+1])||0,f);let peak=1e-9;for(const sample of values)peak=Math.max(peak,Number(sample)||0);
          return clamp01(value/peak);},
        tissueHit=Math.sqrt(measuredLevel(ct,tissueU)),inputHit=Math.sqrt(measuredLevel(ca,inputU));
      if(step>=14&&tissueHit>.015)drawVoxelCube(g,(dx,dy,dz)=>projectBrainPoint([voxel[0]+dx,voxel[1]+dy,voxel[2]+dz],brain.state),.056,accent,k,tissueHit);
      if(step>=14)edit.end();
      const curveOptions={unit:c.concentration_unit||"mM",eventTimes,preview:true,edit};
      if(step>=14)drawNativeCurve(g,{x:W*.742,y:H*.255,w:W*.225,h:H*.38},timeS,ct,accent,step===14?enter:1,
        "tissue voxel · Cₜ(t)",t,k,tissueU,{...curveOptions,smooth:true,timeOffset:tissueDelayS,editId:'tissue',editName:'Tissue plot'});
      if(step>=15){const input=atlasZParallelPoint("arteries","internal carotid artery","right",
          {target:[-.133,.344,-.220],minZ:-.235,maxZ:-.214})?.point||
          atlasFlowPoint("arteries","internal carotid artery",[-.133,.344,-.220],"right")?.point||
          atlasPoint("arteries","internal carotid artery","right")||[-.133,.344,-.220];
        // The cube is attached to the superior, locally z-parallel part of the atlas-labelled
        // right-ICA centreline. Repaint only that named side above the context vessels so the
        // audience can see the attachment
        // directly, without adding the anatomical text label the slide intentionally omits.
        // In this fixed lateral camera, the source atlas `right` tag projects to the
        // viewer-right carotid.  A narrow superior-z window keeps the cube on its straight,
        // cranially directed portion instead of the lower curve.
        edit.begin('brain','Rotating brain',brainBounds);
        drawAtlasVessels(g,brain.state,{show:["arteries"],onlyLabels:["internal carotid artery"],onlySides:["right"],
          alpha:.96,arteryColor:"#F0C85A",stride:1});
        const pts=drawVoxelCube(g,(dx,dy,dz)=>projectBrainPoint(
          [input[0]+dx,input[1]+dy,input[2]+dz],brain.state),.040,"#F0C85A",k,enter);
        brain.input=pts.reduce((sum,p)=>({x:sum.x+p.x/8,y:sum.y+p.y/8}),{x:0,y:0});
        if(inputHit>.015)drawVoxelCube(g,(dx,dy,dz)=>projectBrainPoint([input[0]+dx,input[1]+dy,input[2]+dz],brain.state),.050,"#F0C85A",k,inputHit);
        edit.end();
        drawNativeCurve(g,{x:W*.033,y:H*.255,w:W*.225,h:H*.38},timeS,ca,"#F0C85A",enter,
          "right ICA voxel · Cₐ(t)",t,k,inputU,{...curveOptions,editId:'arterial',editName:'Arterial plot'});}
      edit.finish();
      g.globalAlpha=1;
    },
  },

  modelQuestion: {
    aspect:2.30,loop:true,minWidth:700,revealSteps:2,
    load:(a={})=>Promise.all([loadPatientBrain(a.src||"decks/data/patient-parcels.json"),
      loadBrain(a.brain||"decks/data/brain.json"),loadBrainMesh(a.mesh||"decks/data/brain-mesh.json")]),
    draw(g,W,H,t,a={}){
      if(!PATIENT||!BRAIN){loadPatientBrain(a.src);loadBrain(a.brain);loadBrainMesh(a.mesh);return;}const k=a.k??1,step=sceneStep(a),e=smooth(Number(a._stepElapsed??0)/.7);
      drawScannerBrain(g,W,H,t,{selected:[.48,-.18,.36],center:[.5,.52],scale:1.02,yaw:104,tilt:12,spin:.022,k,activity:.72,gridAlpha:.30});
      const curves=PATIENT.curves||{},timeS=curves.time_s||[],curveOptions={unit:curves.concentration_unit||"mM",eventTimes:curves.bolus_peak_time_s||[]};
      drawNativeCurve(g,{x:W*.035,y:H*.25,w:W*.23,h:H*.38},timeS,curves.aif,"#F0C85A",1,"input · Cₐ(t)",t,k,1,curveOptions);
      drawNativeCurve(g,{x:W*.735,y:H*.25,w:W*.23,h:H*.38},timeS,curves.ct_tissue_voxel||curves.ct_cortical_gm,cssVar("--accent","#D97757"),1,"tissue voxel · Cₜ(t)",t,k,1,{...curveOptions,smooth:true});
      const hi=cssVar("--hi","#F9F9F7"),lo=cssVar("--lo","#6E6C64"),acc=cssVar("--accent","#D97757");
      g.textAlign="center";g.textBaseline="middle";g.font=fontOf(k,16);g.fillStyle=hi;g.fillText("Cₜ = 𝓜{Cₐ}",W*.5,H*.15);
      g.font=fontOf(k,12);g.fillStyle=step<2?hi:acc;g.fillText(step<1?"what did tissue do?":"choose a kinetic model",W*.5,H*.82);
      if(step>=1){const opts=["residue / deconvolution","Tofts family","Patlak","plug-in model"];
        g.font=fontOf(k,10.2);opts.forEach((s,i)=>{g.globalAlpha=(step>=2&&i!==2)?.25:e;
          g.fillStyle=i===2?acc:lo;g.fillText(s,W*(.20+i*.20),H*.92);});}g.globalAlpha=1;
    },
  },

  voxelInferenceSweep: {
    aspect:2.24,loop:true,fps:10,dpr:1,minWidth:700,revealSteps:1,
    load:(a={})=>Promise.all([loadPatientBrain(a.src||"decks/data/patient-parcels.json"),
      loadBrain(a.brain||"decks/data/brain.json"),loadBrainMesh(a.mesh||"decks/data/brain-mesh.json")]),
    draw(g,W,H,t,a={}){
      if(!PATIENT||!BRAIN){loadPatientBrain(a.src);loadBrain(a.brain);loadBrainMesh(a.mesh);return;}
      const k=a.k??1,step=sceneStep(a),since=Math.max(0,Number(a._stepElapsed??0)),
        settled=!!(a._stepSettled||a._stepBackward||a._directEnd),duration=11.8,
        progress=step?(settled?1:clamp01(since/duration)):0,complete=step>0&&(settled||progress>=.999),epi=patientEpiSweep();
      if(!epi?.order?.length)return;
      const V=PATIENT.V,order=epi.order,nv=order.length,initial=Math.max(0,nearestPatientVoxel([.24,-.10,.32])),
        count=step?Math.max(1,Math.min(nv,Math.ceil(progress*nv))):1,
        current=step?order[Math.min(nv-1,count-1)]:initial,cj=current*3,currentZ=V[cj+2],
        coral=cssVar("--accent","#D97757"),yellow="#F0C85A",hi=cssVar("--hi","#F9F9F7"),lo=cssVar("--lo","#6E6C64");
      let brain;g.save();g.beginPath();g.rect(W*.255,0,W*.745,H);g.clip();
      // Fit the complete released brain mesh at every yaw, above the progress captions.
      brain=drawScannerBrain(g,W,H,t,{selected:false,center:[.64,.44],scale:.94,yaw:112,tilt:12,spin:.006,k,
        activity:.80,gridAlpha:.32,gridScanZ:currentZ,gridScanColor:yellow,gridScanFillAlpha:.045,gridScanLineAlpha:.68,
        gridScanDash:true});g.restore();
      if(!brain)return;

      // Accumulated fitted locations stay quiet; the latest EPI raster tail and voxel are the
      // only bright marks.  All geometry remains bounded by the 1,574-point display sample.
      g.save();g.beginPath();g.rect(W*.255,0,W*.745,H);g.clip();for(let n=0;n<count;n++){const i=step?order[n]:initial,j=i*3,p=projectBrainPoint([V[j],V[j+1],V[j+2]],brain.state),near=clamp01(.5+p.d*.5),r=(.36+.34*near)*k;
        g.fillStyle=coral;g.globalAlpha=.12+.32*near;g.fillRect(p.x-r,p.y-r,r*2,r*2);}
      if(step&&!complete){const tailStart=Math.max(0,count-72),z0=currentZ;g.strokeStyle=yellow;g.lineWidth=1.05*k;g.lineJoin="round";g.lineCap="round";g.shadowColor=yellow;g.shadowBlur=4*k;
        g.globalAlpha=.72;g.setLineDash([5*k,4*k]);g.beginPath();let pen=false;for(let n=tailStart;n<count;n++){const i=order[n],j=i*3;if(Math.abs(V[j+2]-z0)>.001){pen=false;continue;}
          const p=projectBrainPoint([V[j],V[j+1],V[j+2]],brain.state);if(!pen){g.moveTo(p.x,p.y);pen=true;}else g.lineTo(p.x,p.y);}g.stroke();g.setLineDash([]);g.shadowBlur=0;}
      const base=[V[cj],V[cj+1],V[cj+2]],cubeColor=coral;
      const cubePoints=drawVoxelCube(g,(dx,dy,dz)=>projectBrainPoint([base[0]+dx,base[1]+dy,base[2]+dz],brain.state),PATIENT.voxelSize*.43,cubeColor,k,complete?.58:1),
        voxelAnchor=cubePoints.reduce((sum,p)=>({x:sum.x+p.x/8,y:sum.y+p.y/8}),{x:0,y:0});
      g.restore();

      // One measured arterial input is held fixed while the tissue response changes at the
      // exact rate of the descending EPI cursor.  Three recent traces leave a short visual
      // memory without retaining per-voxel curves in RAM.
      const curves=PATIENT.curves||{},timeS=curves.time_s||[],aif=curves.aif||[],baseCt=curves.ct_tissue_voxel||[],
        inputBox={x:W*.045,y:H*.250,w:W*.205,h:H*.26},plotFoot=66*k,
        outputBox={x:W*.752,y:H*.250,w:W*.205,h:H*.26},
        eventTimes=curves.bolus_peak_time_s||[],curveOptions={unit:curves.concentration_unit||"mM",eventTimes},
        outputTop=niceCurveMaximum(Math.max(1e-6,...baseCt.map(v=>Number(v)||0))*1.48),
        buffers=a._epiCurveBuffers||(a._epiCurveBuffers=Array.from({length:4},()=>new Float32Array(baseCt.length)));
      // The voxel moves, while its curve has one stable address across all fitted locations.
      const attachX=outputBox.x>voxelAnchor.x?outputBox.x:outputBox.x+outputBox.w,
        attachY=Math.max(outputBox.y+7*k,Math.min(outputBox.y+outputBox.h-7*k,voxelAnchor.y));
      g.save();g.strokeStyle=coral;g.globalAlpha=.68;g.lineWidth=1.05*k;g.setLineDash([4*k,4*k]);g.beginPath();g.moveTo(voxelAnchor.x,voxelAnchor.y);
      g.quadraticCurveTo((voxelAnchor.x+attachX)*.5,voxelAnchor.y,attachX,attachY);g.stroke();g.setLineDash([]);
      g.fillStyle="rgba(10,11,12,.94)";g.globalAlpha=.96;g.fillRect(outputBox.x-30*k,outputBox.y-25*k,outputBox.w+40*k,outputBox.h+plotFoot+30*k);
      g.strokeStyle=coral;g.globalAlpha=.36;g.lineWidth=.8*k;g.strokeRect(outputBox.x-30*k,outputBox.y-25*k,outputBox.w+40*k,outputBox.h+plotFoot+30*k);g.restore();
      for(let b=3;b>=1;b--){const n=Math.max(0,count-1-b*19),i=step?order[n]:initial;fillVoxelTissueResponse(buffers[b],i,baseCt,timeS);
        drawCurveTraceOnly(g,outputBox,timeS,buffers[b],coral,.07+(3-b)*.025,k,outputTop);}
      const fit=fillVoxelTissueResponse(buffers[0],current,baseCt,timeS);
      drawNativeCurve(g,inputBox,timeS,aif,yellow,1,"shared input · Cₐ(t)",t,k,1,curveOptions);
      drawNativeCurve(g,outputBox,timeS,buffers[0],coral,1,"tissue · Cₜ(t)",t,k,1,{...curveOptions,titleSize:9.2,yMax:outputTop,smooth:true,smoothPasses:1});

      g.save();g.textAlign="center";g.textBaseline="middle";g.font=fontOf(k,9.4);g.fillStyle=lo;g.globalAlpha=.86;
      g.font=fontOf(k,8.0);g.fillText("one shared input",inputBox.x+inputBox.w*.5,H*.66);
      g.font=fontOf(k,8.9);g.fillStyle=coral;
      g.fillText(`fit ${Math.max(1,count).toLocaleString()}   Kᵢ = ${fit.ki.toFixed(3)}`,outputBox.x+outputBox.w*.5,outputBox.y+outputBox.h+40*k);
      drawVSubB(g,'',outputBox.x+outputBox.w*.5,outputBox.y+outputBox.h+55*k,coral,k,.98,8.9,` = ${fit.vb.toFixed(2)}`);
      if(step){
        g.font=fontOf(k,11.2);g.fillStyle=hi;g.globalAlpha=.96;
        const status=complete?`${nv.toLocaleString()} voxels visited · ${nv.toLocaleString()} model fits`:
          `slice ${Math.min(epi.slices.length,Math.max(1,epi.slices.findIndex(s=>count<=s.end)+1))} / ${epi.slices.length} · voxel ${count.toLocaleString()} / ${nv.toLocaleString()}`;
        g.fillText(status,W*.53,H*.875);
      }
      g.restore();
    },
  },

  studyIIPbrainPipeline: {
    aspect:2.25,loop:true,fps:12,dpr:1,minWidth:720,revealSteps:1,
    load:(a={})=>Promise.all([loadPatientBrain(a.src||"decks/data/patient-parcels.json"),
      loadBrain(a.brain||"decks/data/brain.json"),loadBrainMesh(a.mesh||"decks/data/brain-mesh.json"),
      loadPbrainMarkVideo(a.markVideo||"decks/assets/defense/pbrain-header-black.webm"),
      loadRaster(a.mark||"decks/assets/defense/pbrain-header.gif")]),
    draw(g,W,H,t,a={}){
      if(!PATIENT||!BRAIN){loadPatientBrain(a.src);loadBrain(a.brain);loadBrainMesh(a.mesh);return;}
      const k=a.k??1,step=sceneStep(a),since=Math.max(0,Number(a._stepElapsed??0)),e=step?smooth(since/.85):0,
        hi=cssVar("--hi","#F9F9F7"),mid=cssVar("--mid","#97958D"),lo=cssVar("--lo","#6E6C64"),
        patient=cssVar("--accent","#D97757"),control="#6FB8C8",yellow="#F0C85A",
        // Keep the GIF as a static fallback; Chromium does not reliably advance GIF frames
        // when an Image is redrawn into canvas, so the live mark is a black-matte video.
        mark=activatePbrainMarkVideo()||raster(a.mark||"decks/assets/defense/pbrain-header.gif");
      const txt=(s,x,y,color=hi,size=9,align="center",weight=560,alpha=1)=>{g.save();g.globalAlpha=alpha;g.fillStyle=color;g.textAlign=align;g.textBaseline="middle";g.shadowColor="#000";g.shadowBlur=7*k;g.font=`${weight} ${Math.max(9,size*k).toFixed(1)}px ui-monospace, SFMono-Regular, monospace`;g.fillText(s,x,y);g.restore();};
      const person=(x,y,color,alpha=.94)=>{const s=.48*k;g.save();g.fillStyle=color;g.globalAlpha=alpha;g.beginPath();g.arc(x,y-6.5*s,4.2*s,0,TAU);g.fill();g.beginPath();g.roundRect(x-5.3*s,y-1.2*s,10.6*s,15.8*s,1.8*s);g.fill();g.strokeStyle=color;g.lineWidth=3.4*s;g.beginPath();g.moveTo(x-2.7*s,y+11*s);g.lineTo(x-2.7*s,y+21*s);g.moveTo(x+2.7*s,y+11*s);g.lineTo(x+2.7*s,y+21*s);g.stroke();g.restore();};
      const arrow=(x0,y0,x1,y1,alpha=1)=>{g.save();g.globalAlpha=.78*alpha;g.strokeStyle=mid;g.fillStyle=mid;g.lineWidth=Math.max(1,1.25*k);g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke();const ang=Math.atan2(y1-y0,x1-x0),r=7*k;g.beginPath();g.moveTo(x1,y1);g.lineTo(x1-Math.cos(ang-.55)*r,y1-Math.sin(ang-.55)*r);g.lineTo(x1-Math.cos(ang+.55)*r,y1-Math.sin(ang+.55)*r);g.closePath();g.fill();g.restore();};

      // The analytic cohort remains a population, not a flowchart node.
      const cols=10,x0=W*.060,y0=H*.29,dx=W*.0225,dy=H*.058;
      for(let i=0;i<61;i++)person(x0+(i%cols)*dx,y0+Math.floor(i/cols)*dy,i<46?patient:control);
      txt("STUDY II COHORT",W*.158,H*.175,hi,9.2,"center",650);
      txt("46 PPCS · 15 controls",W*.158,H*.225,mid,7.0);

      arrow(W*.275,H*.48,W*.355,H*.48,1);
      {const sw=mark?.videoWidth||mark?.naturalWidth||0,sh=mark?.videoHeight||mark?.naturalHeight||0;
      if(sw&&sh){const box={x:W*.345,y:H*.25,w:W*.275,h:H*.46},scale=Math.min(box.w/sw,box.h/sh),dw=sw*scale,dh=sh*scale;
        g.save();g.globalAlpha=.98;g.shadowColor="#000";g.shadowBlur=24*k;g.drawImage(mark,box.x+(box.w-dw)/2,box.y+(box.h-dh)/2,dw,dh);g.restore();}
      }

      if(step){
        // One analysis produces both Patlak parameters.  A real fork makes that relationship
        // explicit instead of visually implying that p-Brain only emits the upper Kᵢ map.
        const forkX=W*.648,forkY=H*.48;
        arrow(W*.610,forkY,forkX,forkY,e);
        arrow(forkX,forkY,W*.680,H*.305,e);
        arrow(forkX,forkY,W*.680,H*.695,e);
        g.save();g.fillStyle=mid;g.globalAlpha=.78*e;g.beginPath();g.arc(forkX,forkY,2.2*k,0,TAU);g.fill();g.restore();
        // Zero tilt keeps the patient brain upright. The wider centre separation leaves a
        // visible black interval between the two parameter maps at projector distance.
        drawPatientParcels(g,W,H,t,{center:[.790,.275],scale:.385,metric:"ki",yaw:104,tilt:0,spin:.020,k,alpha:e});
        drawPatientParcels(g,W,H,t,{center:[.790,.700],scale:.385,metric:"vb",yaw:104,tilt:0,spin:.020,k,alpha:e});
        txt("Kᵢ · slope · exchange",W*.790,H*.455,patient,7.4,"center",620,e);
        drawVSubB(g,"",W*.790,H*.875,control,k,e,7.4," · intercept · vascular space");
      }
    },
  },

  voxelMaps: {
    aspect:2.25,loop:true,fps:10,dpr:1,minWidth:700,revealSteps:2,
    load:(a={})=>Promise.all([loadPatientBrain(a.src||"decks/data/patient-parcels.json"),
      loadBrain(a.brain||"decks/data/brain.json"),loadBrainMesh(a.mesh||"decks/data/brain-mesh.json")]),
    draw(g,W,H,t,a={}){
      if(!PATIENT||!BRAIN){loadPatientBrain(a.src);loadBrain(a.brain);loadBrainMesh(a.mesh);return;}const k=a.k??1,step=sceneStep(a),e=smooth(Number(a._stepElapsed??0)/.8),
        hi=cssVar("--hi","#F9F9F7"),hair=cssVar("--hair","#33322E"),ki="#D97757",vb="#6FB8C8",
        metricColours={cbf:"#F0C85A",cbv:"#78BA8D",mtt:"#B89CFF"};
      const frame=(x,y,w,h,label,alpha)=>{g.save();g.globalAlpha=alpha;g.strokeStyle=hair;g.lineWidth=.9*k;
        g.beginPath();g.roundRect(x,y,w,h,12*k);g.stroke();
        g.font=fontOf(k,10.4);g.textAlign="center";g.textBaseline="middle";const tw=g.measureText(label).width+20*k,ty=y+2*k;
        g.fillStyle="#050606";g.fillRect(x+w*.5-tw*.5,ty-8*k,tw,16*k);g.fillStyle=hi;g.globalAlpha=alpha*.82;
        g.fillText(label,x+w*.5,ty);g.restore();};
      if(step===0){drawPatientParcels(g,W,H,t,{center:[.50,.48],scale:1.54,metric:"combined",spin:.020,k});
        g.font=fontOf(k,13);g.textAlign="center";g.textBaseline="bottom";
        g.fillStyle=ki;g.fillText("Kᵢ",W*.46,H*.94);
        g.fillStyle=hi;g.fillText("+",W*.50,H*.94);
        drawVSubB(g,"",W*.55,H*.94,vb,k,.98,13);return;}
      if(step===2){
        // Keep every map on the same participant and the same rotating anatomical pose. The
        // second click reorganises the two Patlak outputs; it does not replace them with a
        // static screenshot. The lower row exposes the three deconvolution maps fitted by the
        // same p-Brain acquisition.
        frame(W*.13,H*.025,W*.74,H*.405,"PATLAK",e);
        frame(W*.065,H*.495,W*.87,H*.465,"DECONVOLUTION",e);
        drawPatientParcels(g,W,H,t,{center:[mix(.24,.34,e),mix(.49,.215,e)],scale:mix(.70,.38,e),metric:"ki",spin:.020,k});
        drawPatientParcels(g,W,H,t,{center:[mix(.76,.66,e),mix(.49,.215,e)],scale:mix(.70,.38,e),metric:"vb",spin:.020,k});
        const lowerScale=mix(.31,.365,e),lowerY=mix(.735,.725,e);
        drawPatientParcels(g,W,H,t,{center:[.255,lowerY],scale:lowerScale,metric:"cbf",spin:.020,k,alpha:e});
        drawPatientParcels(g,W,H,t,{center:[.500,lowerY],scale:lowerScale,metric:"cbv",spin:.020,k,alpha:e});
        drawPatientParcels(g,W,H,t,{center:[.745,lowerY],scale:lowerScale,metric:"mtt",spin:.020,k,alpha:e});
        g.save();g.font=fontOf(k,11);g.textAlign="center";g.textBaseline="middle";
        g.globalAlpha=1-e;g.fillStyle=ki;g.fillText("slope · Kᵢ map",W*.24,H-5*k);
        drawVSubB(g,"intercept · ",W*.76,H-7*k,vb,k,1-e,11," map");
        g.globalAlpha=e;g.fillStyle=ki;g.fillText("Kᵢ · slope",W*.34,H*.405);
        drawVSubB(g,"",W*.66,H*.405,vb,k,e,11," · intercept");
        [[.255,"CBF",metricColours.cbf],[.500,"CBV",metricColours.cbv],[.745,"MTT",metricColours.mtt]].forEach(([x,label,color])=>{
          g.globalAlpha=e;g.fillStyle=color;g.fillText(label,W*x,H*.925);});
        g.restore();return;
      }
      /* One bivariate map does not vanish and get replaced by two unrelated drawings: the
       * same patient anatomy peels apart laterally while the two component colour channels
       * resolve into their own scalar maps. */
      drawPatientParcels(g,W,H,t,{center:[.50,.48],scale:mix(1.54,1.16,e),metric:"combined",spin:.020,k,
        alpha:Math.max(0,1-e*1.22)});
      drawPatientParcels(g,W,H,t,{center:[mix(.50,.24,e),.49],scale:mix(1.54,.70,e),metric:"ki",spin:.020,k,alpha:e});
      drawPatientParcels(g,W,H,t,{center:[mix(.50,.76,e),.49],scale:mix(1.54,.70,e),metric:"vb",spin:.020,k,alpha:e});
      g.font=fontOf(k,12);g.textBaseline="bottom";g.textAlign="center";
      g.globalAlpha=e;g.fillStyle=ki;g.fillText("slope · Kᵢ map",W*.24,H-5*k);
      drawVSubB(g,"intercept · ",W*.76,H-7*k,vb,k,e,12," map");g.globalAlpha=1;
    },
  },

  pbrainPublication: {
    aspect:1.84,loop:true,fps:10,dpr:1,minWidth:650,
    load:(a={})=>Promise.all([loadRaster(a.paper||"assets/defense/pbrain-wiley-header.png"),
      loadRaster(a.mark||"assets/defense/pbrain-header.gif")]),
    draw(g,W,H,t,a={}){
      const paper=raster(a.paper||"assets/defense/pbrain-wiley-header.png"),mark=raster(a.mark||"assets/defense/pbrain-header.gif");if(!paper||!mark)return;
      const k=a.k??1,margin=Math.max(8*k,Math.min(W,H)*.025),scale=Math.min((W-2*margin)/paper.naturalWidth,(H-2*margin)/paper.naturalHeight),
        w=paper.naturalWidth*scale,h=paper.naturalHeight*scale,x=(W-w)*.5,y=(H-h)*.5;
      g.save();g.shadowColor="rgba(0,0,0,.54)";g.shadowBlur=18*k;g.fillStyle="#fff";g.fillRect(x,y,w,h);g.shadowBlur=0;g.drawImage(paper,x,y,w,h);
      // The animated project identity is printed into the article's deliberate white band.
      // Cropping its unused black lead-in keeps the overlay legible without becoming a panel.
      const sx=34,sy=0,sw=Math.max(1,mark.naturalWidth-58),sh=mark.naturalHeight,ow=w*.235,oh=ow*sh/sw,ox=x+w*.395,oy=y+h*.145;
      g.fillStyle="#050606";g.globalAlpha=.96;g.fillRect(ox-4*k,oy-2*k,ow+8*k,oh+4*k);g.globalAlpha=1;g.drawImage(mark,sx,sy,sw,sh,ox,oy,ow,oh);
      g.strokeStyle=cssVar("--accent","#D97757");g.globalAlpha=.72;g.lineWidth=.8*k;g.strokeRect(ox-4*k,oy-2*k,ow+8*k,oh+4*k);g.restore();
    },
  },

  segmentationBridge: {
    aspect:2.06,loop:true,fps:12,dpr:1,minWidth:720,revealSteps:1,
    load:(a={})=>Promise.all([
      loadRaster(a.neutral||"decks/assets/defense/segmentation/patient-surface-neutral.png"),
      loadRaster(a.segmented||"decks/assets/defense/segmentation/patient-surface-segmented.png"),
    ]),
    draw(g,W,H,t,a={}){
      const neutral=raster(a.neutral||"decks/assets/defense/segmentation/patient-surface-neutral.png"),
        segmented=raster(a.segmented||"decks/assets/defense/segmentation/patient-surface-segmented.png");
      if(!neutral||!segmented)return;const k=a.k??1,step=sceneStep(a),since=Math.max(0,Number(a._stepElapsed??0)),
        settled=!!(a._stepSettled||a._stepBackward||a._directEnd),progress=step?(settled?1:smooth(since/2.25)):0,
        sw=neutral.naturalWidth,sh=neutral.naturalHeight,scale=Math.min(W*.88/sw,H*.94/sh),dw=sw*scale,dh=sh*scale,
        x=(W-dw)*.5,y=(H-dh)*.48;
      g.save();g.imageSmoothingEnabled=true;g.imageSmoothingQuality="high";g.drawImage(neutral,x,y,dw,dh);
      if(progress>.001){const cut=sh*(1-progress),remaining=Math.max(0,sh-cut);
        if(remaining>0)g.drawImage(segmented,0,cut,sw,remaining,x,y+cut*scale,dw,remaining*scale);
        const feather=sh*.075,bands=16,start=Math.max(0,cut-feather),bandH=Math.max(0,cut-start)/bands;
        for(let i=0;i<bands&&bandH>.01;i++){const sy=start+i*bandH,alpha=smooth((i+.5)/bands);g.globalAlpha=alpha;
          g.drawImage(segmented,0,sy,sw,bandH+1,x,y+sy*scale,dw,(bandH+1)*scale);}
        g.globalAlpha=1;if(progress<.999){const frontY=y+cut*scale,grad=g.createLinearGradient(x,frontY,x+dw,frontY);
          grad.addColorStop(0,"rgba(217,119,87,0)");grad.addColorStop(.18,"rgba(217,119,87,.72)");grad.addColorStop(.82,"rgba(217,119,87,.72)");grad.addColorStop(1,"rgba(217,119,87,0)");
          g.strokeStyle=grad;g.shadowColor="#D97757";g.shadowBlur=8*k;g.lineWidth=1.1*k;g.beginPath();g.moveTo(x,frontY);g.lineTo(x+dw,frontY);g.stroke();}}
      g.restore();
    },
  },

  parcelSweep: {
    aspect:2.02,loop:true,fps:12,dpr:1,minWidth:720,revealSteps:4,
    load:(a={})=>Promise.all([
      loadPatientBrain(a.src||"decks/data/patient-parcels.json"),
      loadStudy2ParcelEffects(a.effects||"decks/data/study2-parcel-effects.json"),
      loadAxialStack(a.axialBase||"decks/assets/defense"),
    ]),
    draw(g,W,H,t,a={}){
      if(!PATIENT||!STUDY2_PARCELS||!AXIAL_META){loadPatientBrain(a.src);loadStudy2ParcelEffects(a.effects);loadAxialStack(a.axialBase);return;}
      const k=a.k??1,step=sceneStep(a),since=Math.max(0,Number(a._stepElapsed??0)),
        settled=!!(a._stepSettled||a._stepBackward||a._directEnd),auditStep=step===1||step===3,finalStep=step===2||step===4,
        progress=auditStep?(settled?1:smooth(since/5.2)):finalStep?1:0;
      const hi=cssVar("--hi","#F9F9F7"),lo=cssVar("--lo","#6E6C64"),lower="#3F91D5",finalLower="#2A5B9E",higher="#D97757";
      // A level slice axis keeps the subject upright. The former +12° tilt made the
      // anterior pole point down even though the axial reference image stayed level.
      const common={yaw:112,tilt:0,spin:.014,k,center:[.29,.50],scale:1.02},
        complete=finalStep||(auditStep&&progress>=.999),metric=step===1||step===2?"vb":step===3||step===4?"ki":null,
        index=step?(complete?84:Math.min(84,Math.floor(progress*85))):0,
        segment=step?PATIENT.segments[index]:null,id=Number(segment?.id),effect=metric?STUDY2_PARCELS.byId.get(id)?.[metric]:null,
        difference=Number(effect?.difference),activeColor=difference<0?lower:difference>0?higher:"#777874",
        visitedCount=auditStep?(complete?85:index):finalStep?85:0,
        visitedLabels=PATIENT.segments.slice(0,visitedCount).map(s=>AXIAL_META.parcel_ids.indexOf(Number(s.id))+1).filter(label=>label>0),
        higherIds=metric?PATIENT.segments.filter(s=>Number(STUDY2_PARCELS.byId.get(Number(s.id))?.[metric]?.difference)>0).map(s=>Number(s.id)):[],
        significantIds=metric?PATIENT.segments.filter(s=>Number(STUDY2_PARCELS.byId.get(Number(s.id))?.[metric]?.q_fdr)<.05).map(s=>Number(s.id)):[],
        significantHigherIds=metric?PATIENT.segments.filter(s=>{const e=STUDY2_PARCELS.byId.get(Number(s.id))?.[metric];
          return Number(e?.difference)>0&&Number(e?.q_fdr)<.05;}).map(s=>Number(s.id)):[],
        higherLabels=higherIds.map(parcelId=>AXIAL_META.parcel_ids.indexOf(parcelId)+1).filter(label=>label>0),
        significantLabels=significantIds.map(parcelId=>AXIAL_META.parcel_ids.indexOf(parcelId)+1).filter(label=>label>0),
        significantHigherLabels=significantHigherIds.map(parcelId=>AXIAL_META.parcel_ids.indexOf(parcelId)+1).filter(label=>label>0),
        activeLabel=step?AXIAL_META.parcel_ids.indexOf(id)+1:0;

      if(step===0)drawPatientParcels(g,W,H,t,{...common});
      else drawPatientParcels(g,W,H,t,{...common,effectMetric:metric,auditEffect:auditStep,finalAudit:finalStep,sweep:progress,
        exceptionIds:higherIds,sweepLabel:false});

      const plate={x:W*.605,y:H*.17,w:W*.35,h:H*.65},slice=step?Number(AXIAL_META.parcels_best[index]??4):4;
      drawIndexedAxial(g,plate,k,{type:"parcels",slice,active:complete?0:activeLabel,complete,
        visitedLabels,exceptionLabels:higherLabels,significantExceptionLabels:significantHigherLabels,
        significantLabels,finalSignificance:finalStep,nonsignificantColor:"#686B69",flip180:true,
        exceptionColor:higher,lowerColor:finalStep?finalLower:lower,activeColor});

      g.save();g.textBaseline="middle";g.globalAlpha=.98;
      g.font=fontOf(k,9.4);g.fillStyle=lo;g.textAlign="center";
      g.fillText("same participant · parcel surface",W*.29,H*.10);
      g.fillText(auditStep?"T1w slice through the current parcel":finalStep?"same participant · T1w anatomy + FDR result":"same participant · T1w anatomy",W*.78,H*.10);
      g.font=fontOf(k,12.8);g.fillStyle=hi;
      if(step===0)g.fillText("85 analysed parcels",W*.50,H*.91);
      else {
        const upto=complete?85:index+1,rows=PATIENT.segments.slice(0,upto).map(s=>STUDY2_PARCELS.byId.get(Number(s.id))?.[metric]),
          nHigher=rows.filter(e=>Number(e?.difference)>0).length,nLower=rows.filter(e=>Number(e?.difference)<0).length,
          nFdr=rows.filter(e=>Number(e?.q_fdr)<.05).length,q=Number(effect?.q_fdr),qText=q>0&&q<.001?"< .001":Number.isFinite(q)?q.toFixed(3):"—",
          qLabel=qText.startsWith("<")?`q ${qText}`:`q = ${qText}`,
          name=(segment?.label||"").replace(/^ctx-[lr]h-/i,"").replace(/[-_]+/g," ");
        if(step<=2)drawVSubB(g,"",W*.50,H*.055,step===2?finalLower:lower,k,1,13.2,step===1?" · directional audit":" · FDR result");
        else {g.fillStyle=hi;g.fillText(step===3?"Kᵢ · directional audit":"Kᵢ · FDR result",W*.50,H*.055);}
        g.font=fontOf(k,11.0);g.fillStyle=hi;
        g.fillText(finalStep?`${nLower} lower · ${nHigher} higher · ${nFdr} / 85 survive FDR`:complete?`${nLower} lower · ${nHigher} higher · directional audit complete`:
          `${upto} / 85 · ${name} · ${difference<0?"lower":difference>0?"higher":"no difference"} · ${qLabel}`,W*.50,H*.89);
        g.font=fontOf(k,8.9);g.fillStyle=lo;
        g.fillText(step===2?`${nFdr} significant decreases stay dark blue · ${85-nFdr} nonsignificant parcels → grey`:
          step===4?"0 / 85 survive FDR · all parcels grey, subject anatomy remains visible":
          "untouched anatomy stays fixed · lower → blue · higher → coral",W*.50,H*.955);
      }
      g.restore();
    },
  },

  lactateVoxelBrain: {
    aspect:2.08,loop:true,fps:10,dpr:1,minWidth:700,
    load:(a={})=>loadPatientSurface(a.src||"decks/data/patient-parcel-surface.json"),
    draw(g,W,H,t,a={}){
      if(!PATIENT_SURFACE){loadPatientSurface(a.src);return;}const k=a.k??1,viewArgs={center:[.50,.48],scale:1.28,yaw:112,tilt:12,spin:.014,k,showLabel:false},
        view=drawPatientParcelSurface(g,W,H,t,{...viewArgs,sweep:0});if(!view)return;
      const centre=(a.centre||[.02649,-.56973,.31985]).map(Number),half=(a.halfSize||[.21594,.18509,.18509]).map(Number),
        ang=(a.angulation||[37.2627,5.6925,2.3114]).map(Number),yellow="#F0C85A",pulse=.985+.018*Math.sin(t*TAU*.55),
        pts=drawOrientedVoxelBox(g,([dx,dy,dz])=>projectBrainPoint([centre[0]+dx,centre[1]+dy,centre[2]+dz],view),half.map(v=>v*pulse),ang,yellow,k,1),
        anchor=pts.reduce((s,p)=>({x:s.x+p.x/8,y:s.y+p.y/8}),{x:0,y:0}),tx=W*.705,ty=H*.185;
      g.save();g.strokeStyle=yellow;g.globalAlpha=.72;g.lineWidth=1*k;g.beginPath();g.moveTo(anchor.x+8*k,anchor.y-7*k);g.quadraticCurveTo(W*.62,ty,tx-8*k,ty);g.stroke();
      g.fillStyle=yellow;g.globalAlpha=.98;g.textAlign="left";g.textBaseline="middle";g.font=fontOf(Math.max(k,.90),10.2);g.fillText("single-voxel ¹H-MRS",tx,ty);
      g.fillStyle=cssVar("--hi","#F9F9F7");g.font=fontOf(Math.max(k,.86),9.1);g.fillText("precuneus · 35 × 30 × 30 mm",tx,ty+18*k);
      g.fillStyle=cssVar("--hi","#F9F9F7");g.globalAlpha=.62;g.font=fontOf(Math.max(k,.82),8.2);g.fillText("normalized display underlay",tx,ty+35*k);
      g.textAlign="center";g.textBaseline="bottom";g.fillStyle=cssVar("--hi","#F9F9F7");g.globalAlpha=.92;g.font=fontOf(Math.max(k,.86),9.4);
      g.fillText("regional lactate measurement · global CBF and CMRO₂",W*.5,H*.965);g.restore();
    },
  },

  oxygenMicrodomain: {
    aspect:2.18,loop:true,fps:24,dpr:1,minWidth:720,revealSteps:2,
    load:(a={})=>Promise.all([loadH01Cortex(a.h01||"decks/data/h01-cortex-slab.json"),
      loadH01Turntables(a.turntables||"decks/assets/defense/h01-turntables","oxygen")]),
    draw(g,W,H,t,a={}){
      if(!H01_CORTEX){loadH01Cortex(a.h01);return;}
      const k=a.k??1,step=Math.max(0,Math.min(2,sceneStep(a))),since=Math.max(0,Number(a._stepElapsed??0)),
        settled=!!(a._stepSettled||a._stepBackward||a._directEnd),enter=settled?1:smooth(since/.82),
        view=h01CortexView(W,H,k),
        micro=h01MicrodomainView(W,H,view,k,[.055,.015,.890,.825]);
      if(!view||!micro)return;

      // Three camera-locked states: released vessel alone; a time-resolved 3-D pO2 field whose
      // radial arrival obeys d^2/(4D); then two OBBs fitted around complete local sections of
      // that same released vessel surface.  The box movie is rendered from the exact 3-D corners,
      // never inferred from a decoded screen silhouette.
      const vessel=activateH01Turntable("vessel-only-black","oxygen"),
        vesselMask=H01_TURNTABLES?.["vessel-only"],
        field=H01_TURNTABLES?.["exchange-physical-blue"],
        boxed=H01_TURNTABLES?.["exchange-physical-blue-boxes"];
      if(!vessel)return;const box=micro.box,sw=vessel.videoWidth||vessel.width||720,
        sh=vessel.videoHeight||vessel.height||436,scale=Math.min(box.w/sw,box.h/sh),
        dw=sw*scale,dh=sh*scale,contentBox={x:box.x+(box.w-dw)*.5,y:box.y+(box.h-dh)*.5,w:dw,h:dh},
        duration=Number(vessel.duration)||3,phase=((Number(vessel.currentTime)||0)%duration)/duration,
        drawVideo=(video,alpha=1)=>{if(!video||video.readyState<2||video.seeking||alpha<=.001)return;
          // The registered movies are encoded on true black. Screen compositing treats that
          // black as transparent, so the slide never exposes a rectangular video matte.
          g.globalCompositeOperation="screen";g.globalAlpha=alpha;
          g.drawImage(video,contentBox.x,contentBox.y,contentBox.w,contentBox.h);};
      g.save();g.beginPath();g.rect(box.x,box.y,box.w,box.h);g.clip();
      // Suppress the dot field immediately behind the specimen without introducing a hard
      // crop. This vignette fades before every movie edge and therefore remains invisible.
      g.globalCompositeOperation="source-over";g.globalAlpha=1;
      const cx=contentBox.x+contentBox.w*.5,cy=contentBox.y+contentBox.h*.51,
        vignette=g.createRadialGradient(cx,cy,Math.min(contentBox.w,contentBox.h)*.16,
          cx,cy,Math.max(contentBox.w,contentBox.h)*.60);
      vignette.addColorStop(0,"rgba(0,0,0,.96)");vignette.addColorStop(.58,"rgba(0,0,0,.82)");
      vignette.addColorStop(1,"rgba(0,0,0,0)");g.fillStyle=vignette;g.fillRect(box.x,box.y,box.w,box.h);
      // Each click is a registered source crossfade: vessel → exchange → exchange + OBBs.
      // Only one settled movie is visible, which avoids double-brightening the pO2 field.
      if(step===0)drawVideo(vessel,1);
      else if(step===1){drawVideo(vessel,1-enter);drawVideo(field,enter);}
      else {drawVideo(field,1-enter);drawVideo(boxed,enter);}
      g.restore();
      if(step>=1){const decodedMask=drawH01LumenPulse(g,vesselMask,contentBox,phase,k,
        {color:"#F0C85A",alpha:(step===1?enter:1)*.96,duration:1,cycle:true});
        drawH01OxygenEgress(g,decodedMask,contentBox,phase,k,step===1?enter:1);}
    },
  },

  oxygenBalance: {
    aspect:2.25,loop:true,fps:18,dpr:1,minWidth:700,revealSteps:5,
    load:(a={})=>Promise.all([loadPatientBrain(a.src||"decks/data/patient-parcels.json"),
      loadBrain(a.brain||"decks/data/brain.json"),loadBrainMesh(a.mesh||"decks/data/brain-mesh.json"),
      loadVesselAtlas(a.vesselAtlas||"decks/data/brainproject-vessels.json")]),
    draw(g,W,H,t,a={}){
      if(!PATIENT||!BRAIN||!MESH||!VESSEL_ATLAS){loadPatientBrain(a.src);loadBrain(a.brain);loadBrainMesh(a.mesh);loadVesselAtlas(a.vesselAtlas);return;}const k=a.k??1,step=Math.max(0,Math.min(5,sceneStep(a))),since=Math.max(0,Number(a._stepElapsed??0)),
        settled=!!(a._stepSettled||a._stepBackward||a._directEnd),e=settled?1:smooth(since/.9),
        shown=at=>step<at?0:step===at?e:1,
        finger=shown(1),venous=shown(2),arterial=shown(3),
        hyp=step<5?0:e,pulse=.5+.5*Math.sin(t*TAU*(step>=5?.42:.78));
      const vesselPulse=(step>=5?.38:.56)+(step>=5?.07:.09)*pulse;
      g.save();
      if(hyp>0){
        // Keep the hypoxia wash local to the anatomy. Using a width-scaled radius
        // left non-zero colour at the canvas edges on this wide scene, exposing a
        // hard rectangular boundary in the slide transition.
        const wash=g.createRadialGradient(W*.38,H*.56,0,W*.38,H*.56,H*.47);wash.addColorStop(0,`rgba(28,116,218,${.86*hyp})`);wash.addColorStop(.62,`rgba(10,75,165,${.52*hyp})`);wash.addColorStop(1,"rgba(3,24,68,0)");
        g.fillStyle=wash;g.fillRect(0,0,W,H);
        for(let i=0;i<430;i++){const y=((hash01(i,3,2)+t*.028)%1)*H,x=hash01(i,8,4)*W;
          g.fillStyle=i%17===0?"#D9F1FF":"#65B8F7";g.globalAlpha=hyp*(.18+.58*hash01(i,2,9));
          g.beginPath();g.arc(x,y,(.52+hash01(i,5,1)*1.50)*k,0,TAU);g.fill();}
      }
      g.globalAlpha=1;
      const ven="#6FB8C8",hi=cssVar("--hi","#F9F9F7"),
        // A shallow oblique view separates the two internal carotids on screen while keeping
        // the posterior z-parallel SSS segment legible; the old near-sagittal camera collapsed
        // the bilateral inlet cubes into one apparent marker.
        brain=drawScannerBrain(g,W,H,t,{selected:false,center:[.38,.56],scale:.90,yaw:28,tilt:12,
        still:false,gridStill:false,spin:.020,k,activity:1-.78*hyp,contextOpacity:.40-.32*hyp,gridAlpha:.18*(1-hyp)});
      if(!brain){g.restore();return;}
      if(hyp>.001){const all=MESH.segments.map(segment=>segment.key),blue="#398DE8",o={...brain.state,lit:all,only:null,accent:blue,facets:false};
        g.save();g.globalAlpha=hyp*(.42+.20*pulse);drawBrainMesh(g,W,H,MESH,o);g.restore();
        g.save();g.globalAlpha=hyp*(.58+.20*pulse);drawBrainWire(g,W,H,MESH,o);g.restore();}
      // Brain alone, peripheral saturation, venous saturation, then arterial flow.
      // Keep each measurement visible when the next quantity enters the equation.
      if(arterial>.001)drawAtlasVessels(g,brain.state,{show:["arteries"],onlyLabels:["internal carotid artery","basilar artery"],
        alpha:arterial*(.82+.10*pulse),arteryColor:"#F0C85A",stride:1});
      if(venous>.001){drawAtlasVessels(g,brain.state,{show:["veins"],
        alpha:venous*(.82+.10*vesselPulse),veinColor:ven,stride:1});
        drawAtlasVessels(g,brain.state,{show:["veins"],onlyLabels:["superior sagittal sinus"],
          alpha:venous*(.96+.03*vesselPulse),veinColor:ven,stride:1});}
      // The acquisition has three macroscopic arterial inflows and one posterior SSS
      // susceptibility ROI. The cubes are measurement markers, not claims about voxelwise flow.
      const inputs=[
        // Atlas left/right tags are opposite the displayed patient convention.  Map them
        // explicitly so the right ICA marker remains on the same anatomical side as the
        // right-hemisphere tissue voxel used in the perfusion scene.
        // Use the superior straight cervical/petrous segment.  The equally z-parallel
        // inferior tail lies below the projector frame and was why only the basilar cube
        // appeared in QA despite all three markers being computed.
        ["right ICA",atlasZParallelPoint("arteries","internal carotid artery","left",{target:[.26,.08,-.60]})?.point],
        ["left ICA",atlasZParallelPoint("arteries","internal carotid artery","right",{target:[-.26,.08,-.60]})?.point],
        ["basilar artery",atlasZParallelPoint("arteries","basilar artery",null,{target:[.014,.061,-.62]})?.point],
      ].filter(row=>row[1]),
        // Posterior SSS segment whose local centreline is nearly parallel to scanner z. In
        // the defence camera this sits on the posterior/right crown instead of at midline front.
        sss=atlasZParallelPoint("veins","superior sagittal sinus",null,{target:[.18,-.88,.12],posteriorYMax:-.30})?.point;
      const mark=(raw,color,size=.034,alpha=1)=>{const pts=drawVoxelCube(g,(dx,dy,dz)=>projectBrainPoint([raw[0]+dx,raw[1]+dy,raw[2]+dz],brain.state),size,color,k,alpha);
        return pts.reduce((sum,p)=>({x:sum.x+p.x/8,y:sum.y+p.y/8}),{x:0,y:0});};
      const inletMarks=arterial>.001?inputs.map(([name,raw])=>[name,mark(raw,"#F0C85A",.030,arterial)]):[],
        sssMark=venous>.001&&sss?mark(sss,ven,.038,venous):null;
      inletMarks.forEach(([,p],j)=>{for(let i=0;i<5;i++){const ang=i/5*TAU+t*.42+j*.7,r=5*k+(i%2)*3*k;g.fillStyle="#F0C85A";g.globalAlpha=.80*arterial;
          g.beginPath();g.arc(p.x+Math.cos(ang)*r,p.y+Math.sin(ang)*r,1.45*k,0,TAU);g.fill();}
      });
      if(sssMark){for(let i=0;i<3;i++){const ang=i/3*TAU-t*.30,r=6*k+i*2*k;g.fillStyle=ven;g.globalAlpha=.86*venous;g.beginPath();g.arc(sssMark.x+Math.cos(ang)*r,sssMark.y+Math.sin(ang)*r,1.55*k,0,TAU);g.fill();}
      }

      const edit=figureEditParts(g,W,H);
      if(finger>.001){
        const sensor={x:W*.73,y:H*.27,w:W*.24,h:H*.57};
        edit.begin('pulse-oximeter','3D thumb and pulse oximeter',sensor);
        drawPulseOximeter(g,sensor,t,k,finger);edit.end();
      }
      // Flow MRI, venous susceptibility MRI and pulse oximetry are separate sources.
      g.save();g.textAlign="center";g.textBaseline="middle";g.shadowColor="rgba(0,0,0,.95)";g.shadowBlur=5*k;
      if(arterial>.001){g.globalAlpha=.96*arterial;
        edit.text('cbf-label','CBF',W*.28,H*.16,'#F0C85A',fontOf(k,11.4));
        edit.text('cbf-source','phase-contrast MRI',W*.28,H*.195,hi,fontOf(k,8.0));}
      if(finger>.001){g.globalAlpha=.96*finger;
        edit.text('saturation-label','SpO₂ ≈ SₐO₂',W*.85,H*.16,'#B9E1C5',fontOf(k,10.4));
        edit.text('saturation-source','pulse oximetry',W*.85,H*.195,hi,fontOf(k,8.0));}
      if(venous>.001){g.globalAlpha=.96*venous;
        edit.text('venous-label','SᵥO₂',W*.51,H*.16,ven,fontOf(k,11.4));
        edit.text('venous-source','susceptibility MRI',W*.51,H*.195,hi,fontOf(k,8.0));}
      // Reserve the final equation's positions so the revealed terms never slide.
      const runs=[['cmro2','CMRO₂ = ',hi,4],['cbf','CBF','#F0C85A',3],['hb',' × [Hb] × ',hi,3],
        ['open','(',hi,2],['sa','SₐO₂','#B9E1C5',1],['minus',' − ',hi,2],['sv','SᵥO₂',ven,2],['close',')',hi,2]],
        equationFont=fontOf(Math.max(k,.92),15.0);
      g.font=equationFont;g.globalAlpha=.98;
      const widths=runs.map(([,text])=>g.measureText(text).width);let x=W*.5-widths.reduce((sum,w)=>sum+w,0)/2;
      runs.forEach(([id,text,color,at],i)=>{if(step>=at)edit.text(`fick-${id}`,text,x,H*.060,color,equationFont,'left');x+=widths[i];});
      g.textAlign='center';
      if(hyp>.001){g.font=fontOf(Math.max(k,1),20.0);g.fillStyle="#89D4FF";g.globalAlpha=hyp;
        edit.text('hypoxia-label','hypoxia',W*.5,H*.895,'#89D4FF',g.font);}
      Object.assign(g.canvas.parentElement.dataset,{oxygenStep:String(step),oxygenFinger:String(finger),oxygenArteries:String(inletMarks.length),
        oxygenVein:String(!!sssMark),oxygenHypoxia:String(hyp),oxygenEquation:runs.filter(r=>step>=r[3]).map(r=>r[1]).join(''),
        oxygenLayout:'brain:.38,.56,.90;finger:.73,.27,.24,.57'});
      g.restore();edit.finish();g.restore();
    },
  },
};
