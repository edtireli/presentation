/* FSS distribution from the de-identified REPCon baseline export.
 * Every person is one recorded questionnaire; display bins do not alter statistics.
 */
import { cssVar } from "../field.js";

// English FSS item wording and past-week instructions: NIH FITBIR FSS CDEs.
// https://fitbir.nih.gov/dictionary/publicData/dataStructureAction!view.action?dataStructureName=FSS&publicArea=true&style.key=fitbir-style
const FSS_ITEMS = [
  "My motivation is lower when I am fatigued",
  "Exercise brings on my fatigue",
  "I am easily fatigued",
  "Fatigue interferes with my physical functioning",
  "Fatigue causes frequent problems for me",
  "Fatigue prevents sustained physical functioning",
  "Fatigue interferes with carrying out certain duties and responsibilities",
  "Fatigue is among my three most disabling symptoms",
  "Fatigue interferes in my work, family, or social life",
];

const datasets = new Map();
const pending = new Map();
function loadData(src = "decks/data/repcon-demographics.json") {
  if (datasets.has(src)) return Promise.resolve(datasets.get(src));
  if (pending.has(src)) return pending.get(src);
  const request = fetch(src).then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }).then(data => { datasets.set(src, data); return data; })
    .catch(error => { console.warn(`FSS data: ${error.message}`); return null; })
    .finally(() => pending.delete(src));
  pending.set(src, request);
  return request;
}

function quantile(values, q) {
  const i = (values.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return values[lo] + (values[hi] - values[lo]) * (i - lo);
}

// Same person glyph and warm patient colour as cohortProfile and rpqStory.
function person(g, x, y, color, k) {
  const s = k * 1.34;
  g.save(); g.globalAlpha = .94; g.lineWidth = Math.max(.55, .72 * s);
  g.lineCap = "round"; g.fillStyle = color; g.strokeStyle = color;
  g.beginPath(); g.arc(x, y - 2.9 * s, 1.35 * s, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.roundRect(x - 1.65 * s, y - .9 * s, 3.3 * s, 4.6 * s, .7 * s); g.fill();
  g.beginPath(); g.moveTo(x - .7 * s, y + 3.1 * s); g.lineTo(x - 1.05 * s, y + 6 * s);
  g.moveTo(x + .7 * s, y + 3.1 * s); g.lineTo(x + 1.05 * s, y + 6 * s); g.stroke(); g.restore();
}

export const FSS_STORY = {
  aspect: 1.7777778,
  minWidth: 760,
  loop: false,
  revealSteps: 0,
  load: (a = {}) => loadData(a.src),
  draw(g, W, H, t, a = {}) {
    const src = a.src || "decks/data/repcon-demographics.json";
    const cohort = datasets.get(src)?.overall_baseline_attendees;
    const k = a.k ?? 1;
    const hi = cssVar("--hi", "#F9F9F7"), mid = cssVar("--mid", "#97958D");
    const patient = a.patientColor || "#D97757";
    const txt = (s, x, y, color = hi, size = 7.5, align = "left", weight = 520, family = "ui-monospace, SFMono-Regular, monospace") => {
      g.save(); g.fillStyle = color; g.textAlign = align; g.textBaseline = "middle";
      g.shadowColor = "rgba(0,0,0,.92)"; g.shadowBlur = 7 * k;
      g.font = `${weight} ${Math.max(9, size * k).toFixed(1)}px ${family}`;
      g.fillText(s, x, y); g.restore();
    };
    g.save();
    const shade = g.createRadialGradient(W * .5, H * .5, Math.min(W, H) * .08, W * .5, H * .5, Math.max(W, H) * .68);
    shade.addColorStop(0, "rgba(0,0,0,.55)"); shade.addColorStop(.58, "rgba(0,0,0,.32)"); shade.addColorStop(1, "rgba(0,0,0,.04)");
    g.fillStyle = shade; g.fillRect(0, 0, W, H); g.restore();
    txt("Fatigue Severity Scale", W * .045, H * .055, hi, 15, "left", 520, "Georgia, 'Times New Roman', serif");
    const questionnaire = a.showQuestionnaire === true && Number(a._step ?? a.step ?? 0) < 1;
    const data = g.canvas?.parentElement?.dataset;
    if (data) {
      data.fssPhase = questionnaire ? "questionnaire" : "scores";
      data.fssItems = String(FSS_ITEMS.length);
      if (questionnaire) {
        for (const key of ["fssN", "fssMissing", "fssMean", "fssMedian", "fssPeople", "fssScale"]) delete data[key];
      }
    }
    if (questionnaire) {
      txt("For each statement, rate your experience during the past week.", W * .055, H * .13, hi, 8.1, "left", 500, "Georgia, 'Times New Roman', serif");
      txt("1 = strongly disagree    ·    7 = strongly agree", W * .055, H * .185, mid, 7.1);
      const responseX = value => W * (.75 + (value - 1) * .032);
      FSS_ITEMS.forEach((item, index) => {
        const y = H * (.275 + index * .071);
        txt(String(index + 1).padStart(2, "0"), W * .055, y, patient, 7.8);
        txt(item, W * .095, y, hi, 9.1, "left", 500, "Georgia, 'Times New Roman', serif");
        for (let value = 1; value <= 7; value++) {
          const x = responseX(value);
          g.save(); g.strokeStyle = "rgba(151,149,141,.35)"; g.lineWidth = Math.max(.6, .5 * k);
          g.beginPath(); g.arc(x, y, 7.3 * k, 0, Math.PI * 2); g.stroke(); g.restore();
          txt(String(value), x, y, mid, 6.8, "center");
        }
      });
      txt("Krupp et al. · 1989", W * .055, H * .945, mid, 6.3);
      return;
    }
    txt("Impact of fatigue on daily functioning", W * .055, H * .12, mid, 7);
    txt("9 items rated 1–7 · summed score 9–63", W * .055, H * .18, hi, 7.1);
    if (!cohort) { txt("Loading recorded FSS scores…", W * .5, H * .5, mid, 8, "center"); return; }
    const values = (cohort.fss_total || []).filter(v => typeof v === "number" && Number.isFinite(v)).slice().sort((a, b) => a - b);
    const n = values.length, total = Number(cohort.n), missing = total - n;
    if (!n) { txt("FSS scores unavailable", W * .5, H * .5, mid, 8, "center"); return; }
    txt(`PPCS baseline MRI attendees · n=${n}/${total}`, W * .945, H * .12, mid, 6.7, "right");
    txt(`${missing} missing · 1 person = 1 participant`, W * .945, H * .18, mid, 6.5, "right");

    const B = { x: W * .105, y: H * .28, w: W * .79, h: H * .43 };
    const X = v => B.x + ((v - 9) / 54) * B.w, base = B.y + B.h * .77;
    const bins = new Map();
    values.forEach(value => {
      const key = Math.round(value / 3) * 3, row = bins.get(key) || 0;
      bins.set(key, row + 1);
      person(g, X(key) + (row % 2 ? 3.8 : -3.8) * k, base - Math.floor(row / 2) * 16 * k, patient, k);
    });
    g.save(); g.globalAlpha = .72; g.strokeStyle = mid; g.lineWidth = Math.max(.8, k);
    g.beginPath(); g.moveTo(B.x, base + 13 * k); g.lineTo(B.x + B.w, base + 13 * k); g.stroke();
    [9, 18, 27, 36, 45, 54, 63].forEach(v => {
      const x = X(v); g.beginPath(); g.moveTo(x, base + 7 * k); g.lineTo(x, base + 19 * k); g.stroke();
      txt(String(v), x, base + 32 * k, mid, 6.4, "center");
    });
    g.restore();
    txt("FSS total · 3-point display bins", W * .5, H * .80, mid, 6.6, "center");
    const mean = values.reduce((sum, value) => sum + value, 0) / n;
    txt(`mean ${mean.toFixed(1)}   ·   median ${quantile(values, .5).toFixed(1)}   ·   IQR ${quantile(values, .25).toFixed(1)}–${quantile(values, .75).toFixed(1)}   ·   range ${values[0]}–${values[n - 1]}`, W * .5, H * .885, hi, 7.2, "center", 630);
    if (g.canvas?.parentElement) Object.assign(g.canvas.parentElement.dataset, {
      fssN: String(n), fssMissing: String(missing), fssMean: String(mean), fssMedian: String(quantile(values, .5)),
      fssPeople: String(n), fssScale: "nine-item sum;9–63",
    });
  },
};
