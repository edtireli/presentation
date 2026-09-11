import { FIGURES } from "./figures.js";
// Addons are merged in here and nowhere else, so adding one is adding a file.
import { BIOLOGY } from "./addons/biology.js";
import { QUANTUM } from "./addons/quantum.js";
import { mountScenePrompts } from "./scene-prompts.js";
/* Animated mathematics — the drawn-figure idiom (axes appearing, a curve tracing itself,
 * a vector rotating), in the deck's own palette rather than the usual white-on-black.
 *
 * This is not Manim. Manim renders video offline in Python; a deck needs the figure to be
 * alive on the slide, respond to the accent colour, and cost nothing to ship. So: a small
 * scene registry drawing to a canvas, where a scene is a function of time. Adding one means
 * adding an entry to SCENES.
 */
const TAU = Math.PI * 2;

function css(v, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fallback;
}

/** ease-out; the figure should arrive, not slam */
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** Draw a path progressively: 0 shows nothing, 1 the whole thing. */
function tracePath(g, pts, p) {
  const n = Math.max(2, Math.floor(pts.length * ease(p)));
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const [x, y] = pts[i];
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke();
}

function axes(g, W, H, t, { xlabel = "", ylabel = "" } = {}) {
  const pad = 46;
  const p = ease(t / 0.5);
  g.strokeStyle = css("--hair", "#33322E");
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(pad, H - pad);
  g.lineTo(pad + (W - pad * 2) * p, H - pad);
  g.moveTo(pad, H - pad);
  g.lineTo(pad, (H - pad) - (H - pad * 2) * p);
  g.stroke();
  if (p >= 1 && (xlabel || ylabel)) {
    g.fillStyle = css("--lo", "#6E6C64");
    g.font = "12px ui-monospace, monospace";
    if (xlabel) g.fillText(xlabel, W - pad + 6, H - pad + 4);
    if (ylabel) g.fillText(ylabel, pad - 8, pad - 14);
  }
  return { pad, x0: pad, y0: H - pad, w: W - pad * 2, h: H - pad * 2 };
}

export const SCENES = {
  /** y = f(x), drawing itself once the axes are in. */
  plot: {
    label: "plot a function",
    draw(g, W, H, t, a) {
      const A = axes(g, W, H, t, a);
      const f = FUNCS[a.fn] || FUNCS.sine;
      const pts = [];
      for (let i = 0; i <= 240; i++) {
        const u = i / 240;
        const x = A.x0 + u * A.w;
        const y = A.y0 - (0.5 + 0.42 * f(u * (a.span || TAU))) * A.h;
        pts.push([x, y]);
      }
      g.strokeStyle = css("--accent", "#D97757");
      g.lineWidth = 2.6;
      g.lineJoin = "round";
      tracePath(g, pts, (t - 0.45) / 0.55);
    },
  },

  /** The unit circle with a rotating radius, and sine falling out of it. */
  unitCircle: {
    label: "unit circle",
    draw(g, W, H, t, a) {
      const R = Math.min(W, H) * 0.32;
      const cx = W * 0.30, cy = H * 0.5;
      const p = ease(t / 0.4);
      g.strokeStyle = css("--hair", "#33322E");
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + TAU * p); g.stroke();

      const ang = (t - 0.4) * TAU * 0.55;
      if (t <= 0.4) return;
      const px = cx + R * Math.cos(ang), py = cy - R * Math.sin(ang);
      g.strokeStyle = css("--accent", "#D97757");
      g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(px, py); g.stroke();
      g.fillStyle = css("--accent", "#D97757");
      g.beginPath(); g.arc(px, py, 5, 0, TAU); g.fill();

      // the sine curve traced to the right of it, in step with the angle
      const x0 = cx + R + 30, w = W - x0 - 30;
      g.strokeStyle = css("--accent-lite", "#EBA680");
      g.lineWidth = 2;
      g.beginPath();
      for (let i = 0; i <= 200; i++) {
        const u = i / 200;
        const th = u * ang;
        const X = x0 + (w * th) / (TAU * 2);
        const Y = cy - R * Math.sin(th);
        if (X > W - 20) break;
        i === 0 ? g.moveTo(X, Y) : g.lineTo(X, Y);
      }
      g.stroke();
      g.strokeStyle = css("--hair", "#33322E");
      g.setLineDash([3, 4]);
      g.beginPath(); g.moveTo(px, py); g.lineTo(x0, py); g.stroke();
      g.setLineDash([]);
    },
  },

  /** A vector field, arrows fading in by distance from the centre. */
  vectorField: {
    label: "vector field",
    draw(g, W, H, t, a) {
      const step = 46, len = 15;
      const cx = W / 2, cy = H / 2;
      const maxR = Math.hypot(cx, cy);
      for (let y = step; y < H; y += step) {
        for (let x = step; x < W; x += step) {
          const d = Math.hypot(x - cx, y - cy) / maxR;
          const on = ease((t - d * 0.5) / 0.5);
          if (on <= 0.02) continue;
          const th = Math.atan2(y - cy, x - cx) + Math.PI / 2 + (a.curl || 0);
          const ux = Math.cos(th), uy = Math.sin(th);
          g.strokeStyle = css("--accent", "#D97757");
          g.globalAlpha = 0.22 + 0.5 * on;
          g.lineWidth = 1.6;
          g.beginPath();
          g.moveTo(x - ux * len, y - uy * len);
          g.lineTo(x + ux * len, y + uy * len);
          g.stroke();
          g.beginPath();
          g.arc(x + ux * len, y + uy * len, 2.2, 0, TAU);
          g.fillStyle = css("--accent", "#D97757");
          g.fill();
          g.globalAlpha = 1;
        }
      }
    },
  },

  /** A logarithmic spiral drawing itself — the mark, as a figure. */
  spiral: {
    label: "logarithmic spiral",
    draw(g, W, H, t, a) {
      const cx = W / 2, cy = H / 2;
      const b = a.pitch || 0.22;
      const S = Math.min(W, H) * 0.42;
      const arms = a.arms || 3;
      for (let k = 0; k < arms; k++) {
        const phase = (k * TAU) / arms;
        const pts = [];
        for (let i = 0; i <= 200; i++) {
          const th = (i / 200) * 14;
          const r = (S / Math.exp(b * 14)) * Math.exp(b * th);
          pts.push([cx + r * Math.cos(th + phase), cy + r * Math.sin(th + phase)]);
        }
        g.strokeStyle = k === 0 ? css("--accent", "#D97757") : css("--accent-lite", "#EBA680");
        g.lineWidth = 2.4 - k * 0.4;
        g.globalAlpha = 1 - k * 0.22;
        tracePath(g, pts, t - k * 0.12);
        g.globalAlpha = 1;
      }
    },
  },
};

const FUNCS = {
  sine: (x) => Math.sin(x),
  cosine: (x) => Math.cos(x),
  decay: (x) => Math.exp(-x / 3) * Math.cos(x * 2),
  gauss: (x) => Math.exp(-Math.pow(x - Math.PI, 2) / 1.6) * 2 - 1,
};

/** Mount a scene into a holder element. Replays whenever the slide is entered. */
/** Everything mountable, drawn-maths and simulations alike. */
export const ALL_SCENES = { ...SCENES, ...FIGURES, ...BIOLOGY, ...QUANTUM };

/**
 * Mount a scene into a holder element.
 *
 * Sizing is declared, not guessed. A figure says how much of its box it wants (`size`, a
 * fraction) and what shape it is (`aspect`, w/h), and the height follows — so it cannot end
 * up stretched, and it cannot end up at some arbitrary pixel height that happened to look
 * right in one column and wrong in another.
 *
 * The figure is then told how large it actually came out, as `k` relative to a 640px
 * reference. Everything inside — tick labels, line weights, dot pitch — multiplies by k, so a
 * small figure is a simpler drawing rather than the same drawing at unreadable detail, and a
 * large one is not the same drawing blown up soft. That is the whole of "a person is looking
 * at this with their eyes".
 */
export function mountScene(holder, name, args = {}) {
  const def = SCENES[name] || FIGURES[name] || BIOLOGY[name] || QUANTUM[name] || SCENES.spiral;
  const c = document.createElement("canvas");
  const avail = holder.clientWidth || 640;
  const aspect = args.aspect ?? def.aspect ?? 2.1;
  let W = Math.round(Math.max(180, Math.min(avail, avail * (args.size ?? 1))));
  let H = Math.round(args.height || W / aspect);
  /* Width alone is not a fit.
   *
   * A square or portrait scene can be legal in its column and still run below a projector's
   * frame. Clamp against the slide's usable height, with an optional fractional `maxHeight`
   * for a scene that shares the page with headings or prose. Shrink both dimensions together
   * so anatomy never turns into an egg. */
  const page = holder.closest(".slide");
  if (page) {
    const ps = getComputedStyle(page);
    const usableH = Math.max(180, page.clientHeight - parseFloat(ps.paddingTop || 0) - parseFloat(ps.paddingBottom || 0));
    const declared = args.maxHeight;
    const maxH = declared == null ? usableH : (declared > 0 && declared <= 1 ? usableH * declared : declared);
    if (Number.isFinite(maxH) && H > maxH) {
      H = Math.round(maxH);
      W = Math.round(Math.min(W, H * aspect));
    }
  }
  /* Below its declared minimum a figure is told to go COMPACT rather than being drawn the
   * same way at a size nobody can read. A two-panel plot squeezed into a half-width column is
   * not a small version of itself, it is an unreadable one — so it drops a panel instead. */
  args = { ...args, k: W / 640, compact: W < (args.minWidth ?? def.minWidth ?? 0), _step: 0 };
  // Dense scientific scenes may explicitly render at projector resolution. A DPR-2 canvas
  // quadruples fill and backing-buffer cost without adding visible information at lecture scale.
  const dpr = Math.max(1, Math.min(Number(args.dpr ?? def.dpr ?? devicePixelRatio ?? 1) || 1, 2));
  // Editable subplots can cross the original scene edge. Allocate transparent
  // horizontal overscan while retaining the same layout box and drawing coordinates.
  const padX = Math.round(W * Math.max(0, Number(def.editOverflowX) || 0));
  c.width = (W + 2 * padX) * dpr; c.height = H * dpr;
  c.style.width = (W + 2 * padX) + "px"; c.style.height = H + "px";
  if (padX) { c.style.marginInline = `-${padX}px`; c.style.flexShrink = '0'; c.style.maxWidth = 'none'; }
  c.spiralDrawOffset = {x:padX,y:0};
  if (args.shadow) c.style.filter = "drop-shadow(0 12px 24px rgba(0,0,0,.82))";
  const g = c.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, padX * dpr, 0);
  const clearFrame = () => g.clearRect(-padX, 0, W + 2 * padX, H);
  holder.innerHTML = "";
  holder.appendChild(c);
  const repaintPrompts = mountScenePrompts(holder, args.speakingPrompts);
  repaintPrompts(args._step || 0);

  const dur = (args.seconds || 4) * 1000;
  let start = null, raf = 0, lastPaint = 0;
  const updateStepClocks = (ms) => {
    args._stepElapsed = args._stepChangedAt == null ? 0 : Math.max(0, (ms - args._stepChangedAt) / 1000);
    if (args._stepEnteredAt) {
      const ages = {};
      for (const [step, entered] of Object.entries(args._stepEnteredAt))
        ages[step] = Math.max(0, (ms - entered) / 1000);
      args._stepAges = ages;
    }
  };
  const paintLoopState = (ms) => {
    updateStepClocks(ms);
    clearFrame();
    def.draw(g, W, H, start == null ? 0 : Math.max(0, (ms - start) / 1000), args);
  };
  const maybeAutoAdvance = () => {
    // `null` means that the scene has not requested an advance. Number(null) is zero,
    // which previously made a scene that explicitly cleared this flag advance reveal 0
    // as soon as it mounted. In the REPCon sequence that started participant testing before
    // the presenter clicked. Keep the sentinel distinct from an authored step number.
    if (args._autoAdvanceStep == null) return;
    const requested = Number(args._autoAdvanceStep);
    if (!Number.isFinite(requested) || requested !== args._step) return;
    if (args._stepSettled || args._stepBackward || args._directEnd) return;
    if (args._autoAdvanceEmittedStep === requested) return;
    args._autoAdvanceEmittedStep = requested;
    queueMicrotask(() => {
      if (!holder.isConnected || Number(args._step) !== requested) return;
      holder.dispatchEvent(new CustomEvent("scene-auto-advance", { bubbles: true, detail: { step: requested } }));
    });
  };
  const loop = (ms) => {
    // A looping scene belongs to its slide. Once a transition removes that slide, keeping its
    // detached canvas alive would quietly spend the projector laptop on every brain already
    // visited in the talk.
    if (!holder.isConnected) { cancelAnimationFrame(raf); raf = 0; return; }
    if (start === null) start = ms;
    /* A scene can contain a process that begins on one reveal and must continue through all
     * later reveals (a contrast bolus is the motivating case).  `_stepElapsed` deliberately
     * restarts on every click, so also expose the age of every reveal the presenter has
     * entered.  These timestamps live only in the mounted scene and are never serialized. */
    updateStepClocks(ms);
    // A drawn-maths scene finishes and stops; a simulation keeps running, and gets seconds
    // rather than a 0..1 progress so its own clock means something. Both are capped at 30fps:
    // a figure on a slide is not worth more of a projector laptop than the field is. Heavy
    // evidence-derived meshes can opt into a lower presentation-safe rate with `fps`.
    if (def.loop) {
      raf = requestAnimationFrame(loop);
      const fps = Math.max(1, Math.min(30, Number(args.fps ?? def.fps ?? 30) || 30));
      if (ms - lastPaint < 1000 / fps) return;
      lastPaint = ms;
      clearFrame();
      def.draw(g, W, H, (ms - start) / 1000, args);
      maybeAutoAdvance();
      return;
    }
    const t = Math.min(1.6, (ms - start) / dur);
    clearFrame();
    def.draw(g, W, H, t, args);
    maybeAutoAdvance();
    if (t < 1.6) raf = requestAnimationFrame(loop);
  };
  holder.replay = () => { cancelAnimationFrame(raf); start = null; raf = requestAnimationFrame(loop); };

  /* A figure must never be a blank rectangle.
   *
   * requestAnimationFrame does not tick in a hidden tab, and a scene draws itself entirely
   * from that loop — so a deck loaded in a background tab mounts its scenes and paints none
   * of them. Coming back to the tab does not help either, because `mountScenesIn` sees
   * `mounted === "1"` and leaves them alone. The figure is then blank for the rest of the
   * talk. That is exactly what happens when you open the deck, go and plug in the projector,
   * and come back.
   *
   * So when the document is hidden, the finished state is painted at once — a complete
   * figure, just not an animated one — and the animation is armed to play properly the moment
   * anyone is actually looking. */
  /* A figure whose data arrives over the network cannot draw on its first frame.
   *
   * A looping scene would eventually catch up, but a hidden mount paints exactly once and a
   * finished scene stops — either way the box stays empty for the rest of the talk. A figure
   * that declares `load` gets one more paint when its data lands. */
  if (def.load) {
    def.load(args)?.then?.(() => {
      if (document.hidden) { clearFrame(); def.draw(g, W, H, def.loop ? 0 : 1, args); }
      else if (!def.loop && args._stepSettled) {
        clearFrame(); def.draw(g, W, H, 1.6, args);
      } else holder.replay();
    });
  }

  if (document.hidden) {
    clearFrame();
    def.draw(g, W, H, def.loop ? 0 : 1, args);
    const onShow = () => {
      if (document.hidden) return;
      document.removeEventListener("visibilitychange", onShow);
      holder.replay();
    };
    document.addEventListener("visibilitychange", onShow);
  } else {
    holder.replay();
  }
  /* Scenes can take part in the deck's click rhythm just like charts and equations.
   *
   * `_step` is deliberately runtime-only: the .spiral file declares how many reveals a
   * scene wants (`revealSteps`) and the drawing reads the current state, but no transient
   * presenter state is serialized back into the deck. Looping scenes pick the new state up
   * on their next frame. A finite construction replays so its transition into that state is
   * visible instead of snapping. */
  holder.sceneSteps = Math.max(0, Number(args.revealSteps ?? def.revealSteps ?? 0) || 0);
  holder.repaint = (step = 0, nav = {}) => {
    const next = Math.max(0, Number(step) || 0);
    const previous = args._step;
    const settled = !!nav.settled;
    const explicitState = settled || !!nav.backward || !!nav.directEnd;
    if (previous === next && !explicitState) return;
    const now = performance.now();

    /* Rewinding below a process onset invalidates every later entry time. Re-entering that
     * onset therefore starts a fresh process, while walking among later reveals keeps its
     * original clock. */
    args._stepEnteredAt ||= {};
    if (next < previous) {
      for (const entered of Object.keys(args._stepEnteredAt))
        if (Number(entered) > next) delete args._stepEnteredAt[entered];
    }
    args._previousStep = previous;
    args._step = next;
    args._stepBackward = !!nav.backward;
    args._stepSettled = settled;
    args._directEnd = !!nav.directEnd;
    args._autoAdvanceStep = null;
    args._autoAdvanceEmittedStep = null;
    // Backward navigation lands on the completed target reveal; its ambient loop can continue.
    const settledAge = Math.max(2, Number(nav.settledSeconds ?? args.settledSeconds ?? def.settledSeconds ?? 12) || 12);
    args._stepChangedAt = now - (settled ? settledAge * 1000 : 0);
    if (settled || args._stepEnteredAt[next] == null) args._stepEnteredAt[next] = args._stepChangedAt;
    if (!def.loop) {
      if (settled) {
        cancelAnimationFrame(raf); raf = 0; start = now - dur * 1.6;
        updateStepClocks(now); clearFrame(); def.draw(g, W, H, 1.6, args);
      } else holder.replay();
      repaintPrompts(next, nav);
      return;
    }
    // Prompts and their canvas must cross a reveal boundary together. Otherwise
    // the DOM can expose text over the previous image until a throttled scene
    // draws again (100 ms for the bolus scene). Preserve the ambient scene clock.
    if (document.hidden || args.speakingPrompts) paintLoopState(now);
    if (!document.hidden && !raf) holder.replay();
    repaintPrompts(next, nav);
  };
  return holder;
}
