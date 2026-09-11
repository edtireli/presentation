/* The block registry.
 *
 * A slide is a list of blocks, not a layout. That is the whole design: the file format,
 * the templates and the drag-and-drop builder are all the same thing seen from different
 * angles — the builder writes blocks, a template is a preset that expands to blocks, and
 * the .spiral file is those blocks written down.
 *
 * Adding a block type means adding one entry here. Nothing else needs to know about it.
 */
import { renderMath, fitMath } from "./math.js";
import { mountScene } from "./manim.js";
import { ARRIVALS } from "./field.js";
import { resolveEvidenceStates, paperIds, focusThemesFor } from "./evidence-states.js";
import { mountMathMorph } from "./math-morph.js";
import { mountPatlakCancellation } from "./patlak-cancellation.js";
import { renderPbrainPuzzle } from "./pbrain-puzzle.js";
import { renderDefenseOverview } from './defense-overview.js';
import { renderClinicalSynthesis } from "./clinical-synthesis.js";
import { mountEvidenceCorpus } from "./evidence-corpus.js";
import { mountEvidenceGraph } from "./evidence-graph.js";
import { mountEvidenceDiscussion } from "./evidence-discussion.js";

const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};

/* Large, shared evidence maps appear on several consecutive pages. One promise per URL
 * means the dataset is fetched and parsed once per deck load, then every page reuses it.
 * Bypass the browser HTTP cache so a live-edited network is not silently presented stale. */
const JSON_CACHE = new Map();
function jsonOnce(url, compressedUrl = null) {
  if (!JSON_CACHE.has(url)) {
    JSON_CACHE.set(url, (async()=>{
      if(compressedUrl&&typeof DecompressionStream!=='undefined'){
        try{const r=await fetch(compressedUrl,{cache:'no-store'});if(r.ok)return await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json();}catch{}
      }
      return fetch(url, { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.json();
      });
    })());
  }
  return JSON_CACHE.get(url);
}

/** A block is revealed on a later click when it carries `step: true`. */
function stepped(node, b) {
  if (b.step || (Number.isInteger(b.revealAt) && b.revealAt > 0)) node.classList.add("step");
  if (Number.isInteger(b.revealAt) && b.revealAt > 0) node.dataset.revealAt = String(b.revealAt);
  return node;
}

export const BLOCKS = {
  "defense-overview": {
    label: "Opening research overview", icon: "◉", fields: [],
    make: () => ({type:"defense-overview"}),
    render: b => stepped(renderDefenseOverview(b),b),
  },
  "clinical-synthesis": {
    label: "Clinical findings and interpretation", icon: "◈",
    fields: [{ k: "section", t: "text" }, { k: "states", t: "json" }],
    make: () => ({ type: "clinical-synthesis", states: [] }),
    render: (b) => stepped(renderClinicalSynthesis(b), b),
  },
  "pbrain-puzzle": {
    label: "p-Brain 3D modules", icon: "◇",
    fields: [{ k: "mode", t: "text" }, { k: "states", t: "json" }],
    make: () => ({ type: "pbrain-puzzle", mode: "modules", args: { revealSteps: 3 } }),
    render: (b) => stepped(renderPbrainPuzzle(b), b),
  },
  eyebrow: {
    label: "eyebrow", icon: "▁",
    fields: [{ k: "text", t: "text" }],
    make: () => ({ type: "eyebrow", text: "section" }),
    render: (b) => stepped(el("div", "eyebrow", b.text), b),
  },

  title: {
    label: "title", icon: "H",
    fields: [{ k: "text", t: "text" }],
    make: () => ({ type: "title", text: "Title" }),
    render: (b) => stepped(el("h1", "title", b.text), b),
  },

  subtitle: {
    label: "subtitle", icon: "h",
    fields: [{ k: "text", t: "text" }],
    make: () => ({ type: "subtitle", text: "A line underneath" }),
    render: (b) => stepped(el("h2", "subtitle", b.text), b),
  },

  heading: {
    label: "heading", icon: "T",
    fields: [{ k: "text", t: "text" }],
    make: () => ({ type: "heading", text: "Heading" }),
    render: (b) => stepped(el("h2", "heading", b.text), b),
  },

  body: {
    label: "paragraph", icon: "¶",
    fields: [{ k: "text", t: "area" }],
    make: () => ({ type: "body", text: "Some prose." }),
    render: (b) => {
      const p = el("p", "body");
      p.innerHTML = inline(b.text);
      return stepped(p, b);
    },
  },

  bullets: {
    label: "bullets", icon: "·",
    fields: [{ k: "items", t: "list" }, { k: "step", t: "bool" }],
    make: () => ({ type: "bullets", items: ["First", "Second"], step: true }),
    render: (b) => {
      const ul = el("ul", "bullets");
      (b.items || []).forEach((it) => {
        const li = el("li");
        const span = el("span");
        span.innerHTML = inline(it);
        li.appendChild(span);
        // each bullet is its own step, so a list arrives a line at a time
        if (b.step) li.classList.add("step");
        ul.appendChild(li);
      });
      return ul;
    },
  },

  math: {
    label: "maths", icon: "∑",
    fields: [{ k: "tex", t: "area" }, { k: "display", t: "bool" }, { k: "walk", t: "list" }],
    make: () => ({ type: "math", tex: "e^{i\\pi} + 1 = 0", display: true }),
    render: (b) => {
      const d = el("div", b.display === false ? "" : "math-display");
      renderMath(d, b.tex, b.display !== false);
      /* Walking an equation.
       *
       * `walk` names \htmlId terms in the order you want to talk about them. On each click
       * the next one lights and everything else recedes — the way a lecturer's hand moves
       * across a board, rather than the whole formula arriving and daring the room to find
       * the bit being discussed. Any term is also clickable directly, because a question
       * from the floor never arrives in the order you planned.
       */
      if (b.walk?.length) {
        d.classList.add("walkable");
        d.dataset.walk = b.walk.join(",");
      }
      return stepped(d, b);
    },
  },

  /* One equation occupying one address while its model grows click by click.
   *
   * Stacking several ordinary maths blocks makes a derivation look like a worksheet and
   * leaves every previous line competing with the current idea. A sequence keeps the same
   * visual seat, cross-fades between valid KaTeX states, and participates in the deck's
   * shared reveal clock exactly like a native scene. */
  "math-sequence": {
    label: "math sequence", icon: "∑→",
    fields: [{ k: "states", t: "json" }],
    make: () => ({ type: "math-sequence", states: [
      "C_t(t)\\equiv C_a(t)",
      "C_t(t)=v_{\\mathrm B}C_a(t)",
    ] }),
    render: (b) => {
      const holder = el("div", "math-sequence scene-holder");
      if (b.stateTransition === "none") holder.classList.add("math-sequence-static");
      holder.style.width = "100%";
      const states = (b.states || []).map((x) => typeof x === "string" ? { tex: x } : x);
      states.forEach((state, i) => {
        const d = el("div", "math-display math-state" + (i === 0 ? " active" : ""));
        renderMath(d, state.tex || "", state.display !== false);
        d.dataset.state = i;
        holder.appendChild(d);
      });
      holder.sceneSteps = Math.max(0, states.length - 1);
      const mathNodes=[...holder.querySelectorAll('.math-state')];
      const activateMath=at=>mathNodes.forEach((node,i)=>node.classList.toggle('active',i===at));
      const morph=b.morph==='match-terms'?mountMathMorph(holder,states,mathNodes,activateMath):null;
      const cancellation=states.some(state=>state.cancelMatchingInput)?mountPatlakCancellation(holder,states,mathNodes):null;
      let previousMathState=null,termFades=[],termFadeFrame=0;
      holder.repaint = (step = 0, nav = {}) => {
        const at = Math.min(states.length - 1, Math.max(0, Number(step) || 0));
        if(morph){morph(at,nav);return;}
        cancellation?.(at,nav);
        if(previousMathState===at&&!nav.settled&&!nav.backward&&!nav.directEnd)return;
        const forward=previousMathState!==null&&at===previousMathState+1;
        previousMathState=at;
        cancelAnimationFrame(termFadeFrame);
        termFades.forEach(animation=>animation.cancel());termFades=[];
        if (nav.settled) holder.querySelectorAll(".math-state").forEach((d) => { d.style.transition = "none"; });
        holder.querySelectorAll(".math-state").forEach((d, i) =>
          d.classList.toggle("active", i === at));
        if (nav.settled) {
          void holder.offsetWidth;
          holder.querySelectorAll(".math-state").forEach((d) => { d.style.transition = ""; });
        }
        // An explicitly marked reference can fade without moving or reanimating the
        // equation already being discussed. Direct seeks and backward clicks settle it.
        if(forward&&states[at]?.fadeIn&&!nav.settled&&!nav.backward&&!nav.directEnd&&
          !matchMedia('(prefers-reduced-motion: reduce)').matches)
          termFadeFrame=requestAnimationFrame(()=>{
            // Route-specific edits are applied synchronously after repaint and can
            // re-typeset the real frame. Animate its final terms, not detached copies.
            termFades=[...mathNodes[at].querySelectorAll(states[at].fadeIn)].map(node=>
              node.animate([{opacity:0},{opacity:1}],{duration:450,easing:'ease-out'}));
          });
      };
      return stepped(holder, b);
    },
  },

  /* A fixed evidence frame whose paper figure and one-line reading change together.
   * All images are inserted up front so advancing a state never waits on a new request,
   * and the frame itself never moves between populations or modalities. */
  "image-sequence": {
    label: "image sequence", icon: "▣→",
    fields: [{ k: "states", t: "json" }],
    make: () => ({ type: "image-sequence", states: [
      { src: "", alt: "", tag: "population · method · time", text: "One sentence." },
      { src: "", alt: "", tag: "next population · method · time", text: "Next sentence." },
    ] }),
    render: (b) => {
      const holder = el("div", "image-sequence scene-holder");
      const frame = el("div", "image-sequence-frame");
      const copy = el("div", "image-sequence-copy");
      const states = (b.states || []).filter((state) => state?.src);

      states.forEach((state, i) => {
        const figure = el("figure", "image-sequence-state" + (i === 0 ? " active" : ""));
        figure.dataset.fit = state.fit || "contain";
        const img = el("img");
        img.src = state.src;
        img.alt = state.alt || "";
        img.loading = "eager";
        img.decoding = "async";
        img.fetchPriority = i === 0 ? "high" : "auto";
        if (state.position) img.style.objectPosition = state.position;
        figure.appendChild(img);
        frame.appendChild(figure);

        const meta = el("div", "image-sequence-meta" + (i === 0 ? " active" : ""));
        if (state.tag) meta.appendChild(el("div", "image-sequence-tag", state.tag));
        if (state.text) meta.appendChild(el("div", "image-sequence-text", state.text));
        copy.appendChild(meta);
      });

      holder.append(frame, copy);
      holder.sceneSteps = Math.max(0, states.length - 1);
      holder.repaint = (step = 0, nav = {}) => {
        const at = Math.min(states.length - 1, Math.max(0, Number(step) || 0));
        const nodes = holder.querySelectorAll(".image-sequence-state, .image-sequence-meta");
        if (nav.settled) nodes.forEach((node) => { node.style.transition = "none"; });
        holder.querySelectorAll(".image-sequence-state").forEach((node, i) =>
          node.classList.toggle("active", i === at));
        holder.querySelectorAll(".image-sequence-meta").forEach((node, i) =>
          node.classList.toggle("active", i === at));
        if (nav.settled) {
          void holder.offsetWidth;
          nodes.forEach((node) => { node.style.transition = ""; });
        }
      };
      return stepped(holder, b);
    },
  },

  /* A frozen citation/semantic network with paper figures that grow out of selected nodes.
   * Graphviz computes the coordinates offline; this block only draws those coordinates and
   * changes opacity.  That keeps the field continuous and makes every reveal instantaneous. */
  "evidence-network": {
    label: "evidence network", icon: "•—•",
    fields: [{ k: "title", t: "text" }, { k: "src", t: "text" }, { k: "states", t: "json" }, { k: "audienceStory", t: "json" }],
    make: () => ({
      type: "evidence-network", src: "decks/data/ppcs-field-network.json",
      states: [{ focus: "all", heading: "What does the field actually know?" }],
    }),
    render: (b) => {
      const NS = "http://www.w3.org/2000/svg";
      const holder = el("div", "evidence-network scene-holder");
      holder.dataset.plainHeadings = b.plainHeadings ? "1" : "0";
      holder.dataset.showMapLabels = b.showMapLabels ? "1" : "0";
      if (b.plainHeadings) holder.appendChild(el("div", "evidence-literature-label", "The literature"));
      const map = el("div", "evidence-network-map");
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", "0 0 1600 820");
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", b.alt || "Literature evidence network");
      map.appendChild(svg);

      const stateLayer = el("div", "evidence-network-state-layer");
      const legend = el("div", "evidence-network-legend");
      const cohortLegend = el("div", "evidence-cohort-legend");
      cohortLegend.hidden = true;
      // The highlighted neighbourhood can change inside one slide, so the section heading must
      // be stateful too.  `state.title` wins, otherwise the graph's own theme label is used once
      // the JSON has loaded; `b.title` remains a backwards-compatible fallback.
      const sectionHeader = el("div", "evidence-network-section-header");
      const sectionTitle = el("div", "evidence-network-section-title");
      const sectionSubtitle = el("div", "evidence-network-section-subtitle");
      sectionHeader.append(sectionTitle, sectionSubtitle);
      const timeline = el("div", "evidence-network-timeline");
      const timelineTrack = el("div", "evidence-network-timeline-track");
      const timelineCurrent = el("div", "evidence-network-timeline-current");
      timeline.append(timelineTrack, timelineCurrent);
      const states = resolveEvidenceStates(b);
      holder.dataset.audienceStory = states.some(state => state.audienceStory) ? "1" : "0";
      holder.dataset.synchronizedReveal = b.synchronizedReveal ? "1" : "0";
      holder.dataset.networkSrc = b.src || "";
      holder.dataset.initialFocus = states[0]?.focus || "all";
      holder.dataset.paperSequence = b.paperSequence ? "1" : "0";
      holder.dataset.overviewTour = b.overviewTour ? "1" : "0";
      holder.dataset.speakingPrompts = b.speakingPrompts ? "1" : "0";
      holder.dataset.studyPlacement = states.some(state => state.studyMarkers?.length) ? "1" : "0";
      const stateEls = [];
      // The opening full-paper overview is a picture of a fixed graph, not an editing surface.
      // Render it as one lightweight canvas build instead of keeping 2,160 filtered SVG
      // elements live. Detail slides retain the SVG so their exact paper nodes and footprints
      // can still be selected and animated.
      const progressiveOverview = states.length === 1 && states[0].overview && states[0].progressive;
      if (progressiveOverview) holder.dataset.progressive = "1";

      const cssSize = (value, fallbackUnit = "%") => {
        if (value == null || value === "") return "";
        return typeof value === "number" ? `${value}${fallbackUnit}` : String(value);
      };
      const citationsFor = (state) => {
        const raw = state.citations ?? state.citation ?? [];
        return [].concat(raw || []).filter(Boolean);
      };
      const focusCoordinate = (value, span, units) => {
        const n = Number(value) || 0;
        if (units === "pixel" || units === "pixels" || units === "px")
          return span > 0 ? n / span * 100 : 0;
        if (units === "fraction" || units === "normalised" || units === "normalized") return n * 100;
        return n;
      };
      const attachFocusBoxes = (mediaBox, media, boxes) => {
        if (!boxes?.length) return;
        const overlay = el("div", "evidence-network-focus-layer");
        boxes.forEach((spec) => {
          const box = el("div", "evidence-network-focus-box");
          const x = spec.x ?? spec.left ?? 0, y = spec.y ?? spec.top ?? 0;
          const w = spec.w ?? spec.width ?? 0, h = spec.h ?? spec.height ?? 0;
          const values = [x, y, w, h].map(Number);
          const units = spec.units || (values.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)
            ? "fraction" : "percent");
          box.dataset.units = units;
          box.dataset.x = String(x); box.dataset.y = String(y);
          box.dataset.w = String(w); box.dataset.h = String(h);
          box.style.setProperty("--focus-color", spec.color || "#f2a07f");
          if (spec.label) box.appendChild(el("span", "evidence-network-focus-label", spec.label));
          overlay.appendChild(box);
        });
        mediaBox.appendChild(overlay);

        // `object-fit: contain` introduces letterboxing.  Measure the actual rendered image
        // rectangle, then put the overlay on that rectangle rather than on the outer figure.
        const align = () => {
          const nw = media.naturalWidth || media.videoWidth || 0;
          const nh = media.naturalHeight || media.videoHeight || 0;
          const cw = mediaBox.clientWidth, ch = mediaBox.clientHeight;
          if (!nw || !nh || !cw || !ch) return;
          const scale = Math.min(cw / nw, ch / nh);
          const rw = nw * scale, rh = nh * scale;
          const position = getComputedStyle(media).objectPosition.trim().split(/\s+/);
          const positionRatio = (token, start, end) => {
            if (token === start) return 0;
            if (token === "center") return .5;
            if (token === end) return 1;
            if (String(token).endsWith("%")) return Math.max(0, Math.min(1, parseFloat(token) / 100));
            return .5;
          };
          const ox = positionRatio(position[0] || "50%", "left", "right");
          const oy = positionRatio(position[1] || "50%", "top", "bottom");
          overlay.style.left = `${(cw - rw) * ox}px`;
          overlay.style.top = `${(ch - rh) * oy}px`;
          overlay.style.width = `${rw}px`;
          overlay.style.height = `${rh}px`;
          overlay.querySelectorAll(".evidence-network-focus-box").forEach((box) => {
            const units = box.dataset.units;
            box.style.left = `${focusCoordinate(box.dataset.x, nw, units)}%`;
            box.style.top = `${focusCoordinate(box.dataset.y, nh, units)}%`;
            box.style.width = `${focusCoordinate(box.dataset.w, nw, units)}%`;
            box.style.height = `${focusCoordinate(box.dataset.h, nh, units)}%`;
          });
        };
        media.addEventListener(media.tagName === "VIDEO" ? "loadedmetadata" : "load", align);
        if (typeof ResizeObserver !== "undefined") {
          const observer = new ResizeObserver(align);
          observer.observe(mediaBox);
        }
        requestAnimationFrame(align);
      };
      const attachFocusCrop = (mediaBox, media, spec) => {
        if (!spec) return;
        const x = Number(spec.x ?? spec.left ?? 0), y = Number(spec.y ?? spec.top ?? 0);
        const w = Math.max(.1, Number(spec.w ?? spec.width ?? 100));
        const h = Math.max(.1, Number(spec.h ?? spec.height ?? 100));
        const crop = el("div", "evidence-network-focus-crop");
        crop.style.setProperty("--focus-color", spec.color || "#f2a07f");
        crop.style.backgroundImage = `url(${JSON.stringify(media.currentSrc || media.src || "")})`;
        crop.style.backgroundSize = `${10000 / w}% ${10000 / h}%`;
        crop.style.backgroundPosition = `${100 * x / Math.max(.1, 100 - w)}% ${100 * y / Math.max(.1, 100 - h)}%`;
        crop.setAttribute("role", "img");
        crop.setAttribute("aria-label", spec.alt || spec.label || "Enlarged source-figure panel");
        const label = el("div", "evidence-network-focus-crop-label", spec.label || "");
        if (spec.label) crop.appendChild(label);
        const setAspect = () => {
          const nw = media.naturalWidth || 1, nh = media.naturalHeight || 1;
          const aspect = Math.max(.4, Math.min(4.2, (nw * w) / (nh * h)));
          crop.style.aspectRatio = String(aspect);
          crop.style.backgroundImage = `url(${JSON.stringify(media.currentSrc || media.src || "")})`;
          const cw = mediaBox.clientWidth, ch = mediaBox.clientHeight;
          if (!cw || !ch) return;
          const scale = Math.min(cw / nw, ch / nh), rw = nw * scale, rh = nh * scale;
          const imageX = (cw - rw) * .5, imageY = (ch - rh) * .5;
          const sourceCenterX = imageX + (x + w * .5) / 100 * rw;
          const sourceCenterY = imageY + (y + h * .5) / 100 * rh;
          const finalWidth = Math.min(cw * .91, 920), finalHeight = finalWidth / aspect;
          const sourceWidth = rw * w / 100, sourceHeight = rh * h / 100;
          crop.style.setProperty("--crop-from-x", `${sourceCenterX - cw * .5}px`);
          crop.style.setProperty("--crop-from-y", `${sourceCenterY - ch * .47}px`);
          crop.style.setProperty("--crop-from-scale", String(Math.max(.035,
            Math.min(sourceWidth / Math.max(1, finalWidth), sourceHeight / Math.max(1, finalHeight)))));
        };
        media.addEventListener("load", setAspect);
        if (media.complete) setAspect();
        if (typeof ResizeObserver !== "undefined") new ResizeObserver(setAspect).observe(mediaBox);
        mediaBox.classList.add("has-focus-crop");
        mediaBox.appendChild(crop);
      };
      const figureItem = (raw, fallback = {}, focusBoxes = []) => {
        const spec = typeof raw === "string" ? { src: raw } : { ...(raw || {}) };
        const item = el("div", "evidence-network-figure-item");
        if (spec.role) item.dataset.role = spec.role;
        const mediaBox = el("div", "evidence-network-media");
        const media = spec.video ? el("video") : el("img");
        if (spec.video) {
          media.src = spec.video;
          const playback = spec.videoPlayback || spec.playback || fallback.videoPlayback || "auto";
          media.dataset.playback = playback;
          media.autoplay = playback === "auto"; media.loop = true; media.muted = true; media.playsInline = true;
          media.preload = "auto";
          media.setAttribute("aria-label", spec.alt || fallback.alt || "");
          media.addEventListener("loadeddata", () => requestAnimationFrame(() => {
            media.classList.add("loaded");
            if (playback === "pause") { media.currentTime = 0; media.pause(); }
            else if (playback === "play" && media.closest(".evidence-network-state")?.classList.contains("active"))
              void media.play().catch(() => {});
          }), { once: true });
        } else {
          media.src = spec.src || fallback.src || "";
          media.alt = spec.alt || fallback.alt || "";
          media.loading = "eager";
          media.decoding = "async";
          if (spec.position || fallback.position) media.style.objectPosition = spec.position || fallback.position;
          media.addEventListener("load", () => requestAnimationFrame(() => media.classList.add("loaded")), { once: true });
          if (media.complete && media.naturalWidth) requestAnimationFrame(() => media.classList.add("loaded"));
        }
        if (spec.fit) media.style.objectFit = spec.fit;
        if (spec.zoom) {
          media.style.transform = `scale(${Math.max(1,Math.min(3,Number(spec.zoom)||1))})`;
          media.style.transformOrigin = spec.zoomOrigin || "center";
          mediaBox.style.overflow = "hidden";
        }
        mediaBox.appendChild(media);
        attachFocusBoxes(mediaBox, media, focusBoxes);
        attachFocusCrop(mediaBox, media, spec.focusCrop || fallback.focusCrop);
        item.appendChild(mediaBox);
        const label = spec.label ?? fallback.label;
        const source = spec.sourceLabel ?? spec.source ?? fallback.sourceLabel;
        if (label || source) {
          const caption = el("div", "evidence-network-figure-label");
          if (label) caption.appendChild(el("span", "evidence-network-figure-label-main", label));
          if (source) caption.appendChild(el("span", "evidence-network-figure-label-source", source));
          item.appendChild(caption);
        }
        return item;
      };
      states.forEach((state, i) => {
        const layer = el("div", "evidence-network-state" + (i === 0 ? " active" : ""));
        if (state.speakingPrompt) {
          const prompt = el("aside", "evidence-speaking-prompt");
          if (state.groupLabel) {
            const label = el("div", "evidence-group-label");
            label.appendChild(el("mark", "evidence-group-highlight", state.groupLabel));
            prompt.appendChild(label);
          }
          if (!b.plainHeadings) prompt.appendChild(el("div", "evidence-speaking-kicker", `${String(i + 1).padStart(2, "0")} / THE LITERATURE`));
          if (!b.plainHeadings) prompt.appendChild(el("h2", "evidence-speaking-title", state.speakingPrompt.title));
          for (const text of state.speakingPrompt.lines) {
            const line = el("p", "evidence-speaking-line"); line.innerHTML = inline(text); prompt.appendChild(line);
          }
          layer.appendChild(prompt);
        }
        layer.dataset.side = state.side || "right";
        if (state.audienceStory) {
          layer.classList.add("audience-story-state");
          if (state.audienceStory.columns?.length) layer.classList.add("audience-story-columns");
          layer.dataset.storyPosition = state.audienceStory.position || "below";
          if (state.audienceStory.definitions?.length) layer.classList.add("has-story-definitions");
        }
        if (state.figures?.length) layer.classList.add("has-multiple-figures");
        if (state.figureLayout === "source-single" && state.figures?.some(spec => spec.video))
          layer.classList.add("movie-story-state");
        const hasPaperMedia = !!(state.figure || state.video || state.figures?.length);
        const paperStage = hasPaperMedia ? el("div", "evidence-network-paper-stage") : null;
        if (hasPaperMedia) layer.classList.add("paper-state");
        if (state.inset && paperStage) {
          const insetSpec = typeof state.inset === "string" ? { src: state.inset } : state.inset;
          paperStage.classList.add("has-inset");
          paperStage.dataset.insetSide = insetSpec.side || (state.side === "left" ? "right" : "left");
        }
        if (state.heading || state.kicker || state.metric) {
          const intro = el("div", "evidence-network-intro");
          if (state.kicker) intro.appendChild(el("div", "evidence-network-kicker", state.kicker));
          if (state.heading) intro.appendChild(el("div", "evidence-network-heading", state.heading));
          if (state.metric) {
            const spec = typeof state.metric === "string" || typeof state.metric === "number"
              ? { text: String(state.metric) } : state.metric;
            const metric = el("div", "evidence-network-metric", spec.text || spec.label || "");
            if (spec.color) metric.style.setProperty("--metric-color", spec.color);
            intro.appendChild(metric);
          }
          if (state.subhead) intro.appendChild(el("div", "evidence-network-subhead", state.subhead));
          layer.appendChild(intro);
        }
        if (state.figure || state.video || state.figures?.length) {
          const figure = el("figure", "evidence-network-figure");
          if (state.staticFigure || state.focusCrop) figure.classList.add("static");
          figure.dataset.fit = state.fit || "contain";
          if (state.figureLayout) figure.dataset.layout = state.figureLayout;
          if (state.figureWidth != null) figure.style.setProperty("--figure-width", cssSize(state.figureWidth));
          if (state.figureMaxWidth != null) figure.style.setProperty("--figure-max-width", cssSize(state.figureMaxWidth, "px"));
          if (state.figureCenter != null) figure.style.setProperty("--figure-center", cssSize(state.figureCenter));
          if (state.figureTop != null) figure.style.setProperty("--figure-top", cssSize(state.figureTop));
          if (state.figureBottom != null) figure.style.setProperty("--figure-bottom", cssSize(state.figureBottom));
          if (state.figures?.length) {
            figure.classList.add("multiple");
            state.figures.forEach((spec) => figure.appendChild(figureItem(spec, {
              alt: state.alt, videoPlayback: state.videoPlayback,
            })));
          } else if (state.video) {
            figure.appendChild(figureItem(
              { video: state.video, alt: state.alt, label: state.figureLabel, sourceLabel: state.figureSource,
                videoPlayback: state.videoPlayback },
            ));
          } else {
            const spec = typeof state.figure === "string" ? { src: state.figure } : state.figure;
            figure.appendChild(figureItem(spec, {
              alt: state.alt, position: state.position, label: state.figureLabel,
              sourceLabel: state.figureSource, focusCrop: state.focusCrop,
            }, spec?.focusBoxes || state.focusBoxes || []));
          }
          paperStage.appendChild(figure);
        }
        if (state.inset) {
          const spec = typeof state.inset === "string" ? { src: state.inset } : state.inset;
          const inset = el("figure", "evidence-network-inset");
          inset.dataset.side = spec.side || (state.side === "left" ? "right" : "left");
          if (spec.left != null) inset.style.left = cssSize(spec.left);
          if (spec.right != null) inset.style.right = cssSize(spec.right);
          if (spec.top != null) inset.style.top = cssSize(spec.top);
          if (spec.width != null) {
            inset.style.width = cssSize(spec.width);
            inset.style.setProperty("--inset-width", cssSize(spec.width));
          }
          const img = el("img");
          img.src = spec.src || "";
          img.alt = spec.alt || "";
          img.loading = "eager";
          img.decoding = "async";
          img.addEventListener("load", () => requestAnimationFrame(() => img.classList.add("loaded")), { once: true });
          if (img.complete && img.naturalWidth) requestAnimationFrame(() => img.classList.add("loaded"));
          if (spec.position) img.style.objectPosition = spec.position;
          inset.appendChild(img);
          if (spec.label || spec.sourceLabel || spec.source) {
            const caption = el("figcaption", "evidence-network-inset-caption");
            if (spec.label) caption.appendChild(el("span", "evidence-network-inset-label", spec.label));
            if (spec.sourceLabel || spec.source)
              caption.appendChild(el("span", "evidence-network-inset-source", spec.sourceLabel || spec.source));
            inset.appendChild(caption);
          }
          (paperStage || layer).appendChild(inset);
        }
        if (paperStage) layer.appendChild(paperStage);
        if (state.tag || state.text || state.audienceStory) {
          const copy = el("div", "evidence-network-copy");
          if (state.tag) copy.appendChild(el("div", "evidence-network-tag", state.tag));
          if (state.text) copy.appendChild(el("div", "evidence-network-text", state.text));
          if (state.audienceStory) {
            const story = el("div", "evidence-audience-copy");
            if (state.audienceStory.columns?.length) {
              story.classList.add("evidence-audience-columns");
              state.audienceStory.columns.forEach((column) => {
                const section = el("section", "evidence-audience-column");
                section.appendChild(el("h3", "evidence-audience-column-title", column.title));
                const list = el("ul", "evidence-audience-points");
                (column.points || []).forEach((point) => {
                  const item = el("li"); item.innerHTML = inline(point); list.appendChild(item);
                });
                section.appendChild(list); story.appendChild(section);
              });
            }
            if (state.audienceStory.points?.length) {
              const list = el("ul", "evidence-audience-points");
              state.audienceStory.points.forEach((point) => {
                const item = el("li");
                item.innerHTML = inline(point);
                list.appendChild(item);
              });
              story.appendChild(list);
            }
            if (state.audienceStory.bridge) {
              const bridge = el("p", "evidence-audience-bridge");
              bridge.innerHTML = inline(state.audienceStory.bridge);
              story.appendChild(bridge);
            }
            if (state.audienceStory.definitions?.length) {
              const definitions = el("div", "evidence-audience-definitions");
              state.audienceStory.definitions.forEach((text) => {
                const line = el("p"); line.innerHTML = inline(text); definitions.appendChild(line);
              });
              story.appendChild(definitions);
            }
            copy.appendChild(story);
          }
          layer.appendChild(copy);
        }
        if (state.questions?.length) {
          const questions = el("div", "evidence-network-questions");
          state.questions.forEach((question) => questions.appendChild(el("div", "evidence-network-question", question)));
          layer.appendChild(questions);
        }
        const citations = citationsFor(state);
        if (citations.length) {
          const citation = el("div", "evidence-network-citation");
          citations.forEach((item) => {
            const spec = typeof item === "string" ? { text: item } : item;
            const row = spec.url ? el("a", "evidence-network-citation-row") : el("span", "evidence-network-citation-row");
            row.innerHTML = inline(spec.text || spec.label || "");
            if (spec.url) {
              row.href = spec.url;
              row.target = "_blank";
              row.rel = "noreferrer";
            }
            citation.appendChild(row);
          });
          layer.appendChild(citation);
        }
        // Keep the conclusion inside the same fading composition as its images and points.
        if (!b.plainHeadings && b.synchronizedReveal && state.audienceStory?.title)
          layer.appendChild(el("h2", "evidence-audience-title", state.audienceStory.title));
        if (b.synchronizedReveal && hasPaperMedia) {
          const media = [...layer.querySelectorAll("img,video")];
          const ready = () => {
            if (media.every(node => node.dataset.loadFailed || (node.tagName === "VIDEO"
              ? node.readyState >= 2 : node.complete && node.naturalWidth > 0))) layer.classList.add("media-ready");
          };
          for (const node of media) {
            node.addEventListener(node.tagName === "VIDEO" ? "loadeddata" : "load", ready);
            node.addEventListener("error", () => { node.dataset.loadFailed="1"; ready(); });
          }
          ready();
        }
        // Keep the current and next reveal warm, but do not decode every large paper figure
        // when the subfield first opens. Deferred media are hydrated one step ahead below.
        if(i>1)layer.querySelectorAll("img[src],video[src]").forEach((media)=>{
          media.dataset.src=media.getAttribute("src")||"";media.removeAttribute("src");
        });
        stateLayer.appendChild(layer);
        stateEls.push(layer);
      });
      holder.append(map, stateLayer, legend, sectionHeader, timeline, cohortLegend);
      holder.dataset.discussionMap = b.discussionMap ? "1" : "0";
      holder.dataset.discussionCopy = b.discussionCopy || "";
      const discussion = states.some(state => state.discussionOverlay) ? mountEvidenceDiscussion(holder) : null;
      holder.sceneSteps = Math.max(0, states.length - 1);

      let pendingStep = 0;
      let nodeEls = [];
      let labelEls = [];
      let edgeEls = [];
      let regionEls = [];
      let satelliteEls = [];
      let cohortEls = [];
      let themeLabelEls = [];
      let graph = null;
      let interactiveGraph = null;
      let timelineMarks = [];
      let timelineOrder = [];
      const hasStateCitations = states.some((state) => citationsFor(state).length);
      holder.dataset.localCitations = hasStateCitations ? "1" : "0";

      const displayNodeLabel = (node) => {
        if (node.displayLabel) return node.displayLabel;
        const raw = node.label || node.id || "";
        if (/^Study\b/i.test(raw)) return raw;
        const author = String(raw)
          .replace(/(?:19|20)\d{2}[a-z]?(?:[_-].*)?$/i, "")
          .replace(/\s+et\s+al\.?$/i, "")
          .replace(/[_-]+$/g, "")
          .trim();
        return author ? `${author} et al.` : String(raw);
      };
      const displayNodeYearLabel = (node, publicationYear = null) => {
        const label = displayNodeLabel(node);
        const year = Number(publicationYear ?? node.year);
        return Number.isFinite(year) && year > 0 ? `${label} · ${year}` : label;
      };

      const buildTimeline = (data) => {
        const specs = data.meta?.timeline || {};
        const byId = new Map((data.nodes || []).map((node) => [node.id, node]));
        const minDays = 1 / (24 * 60), maxDays = 3650;
        const position = (days) => {
          const value = Math.max(minDays, Math.min(maxDays, Number(days) || minDays));
          return (Math.log(value) - Math.log(minDays)) / (Math.log(maxDays) - Math.log(minDays)) * 100;
        };
        timelineTrack.replaceChildren();
        const axis = el("div", "evidence-network-timeline-axis");
        [
          [1 / (24 * 60), "impact"], [1 / 24, "1 h"], [1, "1 d"], [7, "1 wk"], [30, "1 mo"],
          [90, "3 mo"], [365, "1 y"], [3650, "10 y"],
        ].forEach(([days, label]) => {
          const tick = el("span", "evidence-network-timeline-tick", label);
          tick.style.left = `${position(days)}%`;
          axis.appendChild(tick);
        });
        timelineTrack.appendChild(axis);
        timelineOrder = Object.keys(specs);
        timelineMarks = Object.entries(specs).map(([id, spec], order) => {
          const node = byId.get(id);
          if (!node) return null;
          const start = spec.days == null ? NaN : Number(spec.days);
          const endRaw = spec.daysEnd ?? spec.endDays;
          const end = endRaw == null ? NaN : Number(endRaw);
          const item = { id, order, node, spec, marks: [], range: null };
          if (Number.isFinite(start)) {
            const addMark = (days, kind) => {
              const mark = el("span", `evidence-network-timeline-mark ${kind}`);
              mark.dataset.id = id;
              mark.dataset.theme = node.theme || "";
              mark.style.left = `${position(days)}%`;
              mark.style.setProperty("--timeline-color", data.themes?.[node.theme]?.color || "#f2f3f5");
              mark.title = spec.label || displayNodeYearLabel(node);
              timelineTrack.appendChild(mark);
              item.marks.push(mark);
            };
            addMark(start, "start");
            if (Number.isFinite(end) && end > start) {
              const range = el("span", "evidence-network-timeline-range");
              const x0 = position(start), x1 = position(end);
              range.dataset.id = id;
              range.dataset.theme = node.theme || "";
              range.style.left = `${x0}%`;
              range.style.width = `${Math.max(.2, x1 - x0)}%`;
              range.style.setProperty("--timeline-color", data.themes?.[node.theme]?.color || "#f2f3f5");
              range.title = spec.label || displayNodeYearLabel(node);
              timelineTrack.appendChild(range);
              item.range = range;
              addMark(end, "end");
            }
          }
          return item;
        }).filter(Boolean);
      };

      const paintTimeline = (state) => {
        if (!b.paperSequence || !graph) {
          timeline.hidden = true;
          return;
        }
        timeline.hidden = false;
        const stateIds = paperIds(state);
        const spec = graph.meta?.timeline?.[state.node];
        const seen = new Set([].concat(b.timelineVisitedBefore || []).filter(Boolean));
        const activeThemes = focusThemesFor(state);
        states.slice(0, pendingStep + 1).forEach((item) => {
          paperIds(item).forEach((id) => seen.add(id));
        });
        timelineMarks.forEach((item) => {
          const visited = seen.has(item.id), current = stateIds.includes(item.id);
          [...item.marks, item.range].filter(Boolean).forEach((mark) => {
            mark.classList.toggle("visited", visited);
            mark.classList.toggle("in-circuit", visited && activeThemes.includes(mark.dataset.theme));
            mark.classList.toggle("current", current);
          });
        });
        const node = graph.nodes?.find((item) => item.id === state.node);
        const theme = graph.themes?.[state.focus] || graph.themes?.[activeThemes[0]];
        timeline.style.setProperty("--timeline-color", theme?.color || "#f2f3f5");
        timelineCurrent.textContent = state.timelineLabel || (node
          ? (spec?.label || displayNodeYearLabel(node, state.publicationYear))
          : "post-injury time");
        const indexed = spec?.days != null && Number.isFinite(Number(spec.days));
        timelineCurrent.classList.toggle("unindexed", Boolean(node && !indexed));
        if (node && !indexed) timelineCurrent.textContent += " · no single indexed injury time";
      };

      const progressiveOrder = (data) => {
        const nodes=data.nodes||[],adj=Array.from({length:nodes.length},()=>[]);
        for(const edge of data.edges||[]){const a=Number(edge.source),z=Number(edge.target);if(!nodes[a]||!nodes[z])continue;adj[a].push(z);adj[z].push(a);}
        const themes=Object.keys(data.themes||{}),seeds=themes.map(theme=>{
          let best=-1;for(let i=0;i<nodes.length;i++)if(nodes[i].theme===theme&&(best<0||adj[i].length>adj[best].length))best=i;return best;
        }).filter(i=>i>=0),seen=new Set(),order=[],queue=[...seeds],
          remaining=nodes.map((_,i)=>i).sort((a,z)=>adj[z].length-adj[a].length||a-z);
        let head=0,remainingAt=0;
        const enqueueNeighbours=(i)=>{
          const local=adj[i].filter(j=>!seen.has(j)).sort((a,z)=>(nodes[a].theme===nodes[i].theme?-1:1)-(nodes[z].theme===nodes[i].theme?-1:1)||adj[z].length-adj[a].length||a-z);
          queue.push(...local);
        };
        while(order.length<nodes.length){
          if(head>=queue.length){while(remainingAt<remaining.length&&seen.has(remaining[remainingAt]))remainingAt++;if(remainingAt>=remaining.length)break;queue.push(remaining[remainingAt++]);}
          const i=queue[head++];if(seen.has(i))continue;seen.add(i);order.push(i);enqueueNeighbours(i);
        }
        return order;
      };

      const startProgressiveOverview = (data,state) => {
        const coordinate=data.meta?.coordinateSystem||[1600,820],vw=Number(coordinate[0])||1600,vh=Number(coordinate[1])||820;
        const canvas=document.createElement("canvas");canvas.className="evidence-network-progressive";canvas.width=vw;canvas.height=vh;
        canvas.setAttribute("role","img");canvas.setAttribute("aria-label",b.alt||"Concussion evidence network building paper by paper");
        map.insertBefore(canvas,svg);
        const visible=canvas.getContext("2d"),edgeBuffer=document.createElement("canvas"),nodeBuffer=document.createElement("canvas");
        edgeBuffer.width=nodeBuffer.width=vw;edgeBuffer.height=nodeBuffer.height=vh;
        const eg=edgeBuffer.getContext("2d"),ng=nodeBuffer.getContext("2d"),style=getComputedStyle(holder);
        const lo=style.getPropertyValue("--lo").trim()||"#777770",page=style.getPropertyValue("--page").trim()||"#000";
        const mixHex=(a,b,u)=>{
          const rgb=value=>{const raw=String(value).trim().replace(/^#/,"");if(raw.length!==6)return[128,128,128];return[0,2,4].map(i=>parseInt(raw.slice(i,i+2),16));};
          const x=rgb(a),z=rgb(b);return`rgb(${x.map((v,i)=>Math.round(v+(z[i]-v)*u)).join(",")})`;
        };
        const nodes=data.nodes||[],excluded=new Set([].concat(b.hiddenNodes||[],state.hiddenNodes||[])),order=progressiveOrder(data).filter(index=>!excluded.has(nodes[index]?.id)),rank=new Int32Array(nodes.length);order.forEach((index,i)=>{rank[index]=i;});
        const arrivals=(data.edges||[]).filter(edge=>!excluded.has(nodes[Number(edge.source)]?.id)&&!excluded.has(nodes[Number(edge.target)]?.id)).map(edge=>({edge,at:Math.max(rank[Number(edge.source)]||0,rank[Number(edge.target)]||0)})).sort((a,z)=>a.at-z.at);
        const pathNode=(q,node,r,dx=0,dy=0)=>{
          const x=Number(node.x)+dx,y=Number(node.y)+dy;q.beginPath();
          if(node.evidence==="pig")q.roundRect(x-r,y-r,2*r,2*r,Math.max(1,r*.24));
          else if(node.evidence==="mouse"){q.moveTo(x,y-r*1.22);q.lineTo(x+r*1.08,y+r*.82);q.lineTo(x-r*1.08,y+r*.82);q.closePath();}
          else if(node.evidence==="rat"){q.moveTo(x,y-r*1.18);q.lineTo(x+r*1.02,y);q.lineTo(x,y+r*1.18);q.lineTo(x-r*1.02,y);q.closePath();}
          else if(node.evidence==="primate"){for(let j=0;j<6;j++){const a=Math.PI/3*j-Math.PI/2,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;j?q.lineTo(px,py):q.moveTo(px,py);}q.closePath();}
          else if(node.evidence==="mixed"){for(let j=0;j<8;j++){const a=Math.PI/4*j-Math.PI/2,d=r*(j%2?.43:1.35),px=x+Math.cos(a)*d,py=y+Math.sin(a)*d;j?q.lineTo(px,py):q.moveTo(px,py);}q.closePath();}
          else if(node.evidence==="other_animal"){for(let j=0;j<5;j++){const a=Math.PI*2/5*j-Math.PI/2,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;j?q.lineTo(px,py):q.moveTo(px,py);}q.closePath();}
          else if(node.evidence==="methods"||node.evidence==="postmortem")q.rect(x-r,y-r,2*r,2*r);
          else q.arc(x,y,r,0,Math.PI*2);
        };
        const drawEdge=(edge)=>{
          const a=nodes[Number(edge.source)],z=nodes[Number(edge.target)];if(!a||!z)return;
          // Match the former SVG's effective alpha: the 64% colour mix was multiplied by
          // .16 for citations and .09 for semantic neighbours.
          eg.save();eg.strokeStyle=lo;eg.globalAlpha=edge.kind==="semantic"?.058:.102;eg.lineWidth=.72;eg.setLineDash(edge.kind==="semantic"?[1.4,3.2]:[]);eg.beginPath();eg.moveTo(Number(a.x),Number(a.y));eg.lineTo(Number(z.x),Number(z.y));eg.stroke();eg.restore();
        };
        const drawNode=(node)=>{
          const r=node.auditStatus==='automated-screening'?1.1:Math.max(2.2,Number(node.size)||3),color=data.themes?.[node.theme]?.color||"#aeb4c0",review=node.evidence==="review";
          ng.save();pathNode(ng,node,r+.72,.55,1.05);ng.fillStyle="#000";ng.globalAlpha=.25;ng.fill();
          pathNode(ng,node,r);ng.strokeStyle=mixHex(color,"#ffffff",.40);ng.lineWidth=node.evidence==="in_vitro"?1.15:.55;ng.globalAlpha=review?.46:.64;
          if(!["in_vitro","methods","postmortem","unknown"].includes(node.evidence)){ng.fillStyle=review?mixHex(color,page,.66):color;ng.fill();}ng.stroke();ng.restore();
        };
        const labelOffsets={biomarkers:[-48,50],clinical:[78,-30],challenge:[54,20]};
        const drawThemeLabels=(alpha)=>{
          visible.save();visible.globalAlpha=alpha;visible.font="600 13px ui-monospace, SFMono-Regular, Menlo, monospace";visible.textAlign="center";visible.textBaseline="alphabetic";visible.lineJoin="round";
          for(const [key,spec] of Object.entries(data.themes||{})){if(!spec.centroid)continue;const [dx,dy]=labelOffsets[key]||[0,0],x=Number(spec.centroid.x)+dx,y=Number(spec.centroid.y)+dy,label=`${/unresolved|unknown/i.test(spec.label)?"Other research":spec.label}${data.meta?.themeCounts?.[key]?` · ${data.meta.themeCounts[key]}`:""}`;
            visible.strokeStyle=page;visible.lineWidth=5;visible.globalAlpha=alpha*.88;visible.strokeText(label,x,y);visible.fillStyle=spec.color;visible.globalAlpha=alpha;visible.fillText(label,x,y);}
          visible.restore();
        };
        let nodeAt=0,edgeAt=0,started=0;const duration=Math.max(.8,Number(state.buildSeconds)||3.2)*1000;
        const frame=(now)=>{
          if(!holder.isConnected)return;if(!started)started=now;const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches,u=reduced?1:Math.min(1,(now-started)/duration),target=Math.min(order.length,Math.floor(order.length*u));
          while(edgeAt<arrivals.length&&arrivals[edgeAt].at<target)drawEdge(arrivals[edgeAt++].edge);
          while(nodeAt<target)drawNode(nodes[order[nodeAt++]]);
          visible.clearRect(0,0,vw,vh);visible.drawImage(edgeBuffer,0,0);visible.drawImage(nodeBuffer,0,0);drawThemeLabels(Math.max(0,Math.min(1,(u-.72)/.22)));
          if(u<1)requestAnimationFrame(frame);else{canvas.dataset.complete="1";holder.dataset.progressiveComplete="1";edgeBuffer.width=edgeBuffer.height=nodeBuffer.width=nodeBuffer.height=1;}
        };
        requestAnimationFrame(frame);
      };

      const paintLegend = (data) => {
        const evidence=data.meta.evidenceCounts||{},evidenceRow=el("div","evidence-network-legend-row");
        [["●","human",evidence.human],["▲","mouse",evidence.mouse],["◆","rat",evidence.rat],["■","pig",evidence.pig],["⬡","NHP",evidence.primate],["⬟","other animal",evidence.other_animal],["✦","mixed arms/species",evidence.mixed],["○","in vitro",evidence.in_vitro],["□","postmortem",evidence.postmortem],["□","methods",evidence.methods],["◌","synthesis/commentary",evidence.review],["?","unreviewed",evidence.unknown]].forEach(([mark,label,count])=>{
          if(!count)return;const item=el("span","evidence-network-legend-item");item.append(el("b","evidence-network-legend-mark",mark),document.createTextNode(` ${label} ${count}`));evidenceRow.appendChild(item);
        });
        const methods=data.meta.methodCounts||{},imaging=["MRI","DCE-MRI","DCE-MRI pipeline","MRI oxygen physiology","perfusion MRI","MR spectroscopy","PET"].reduce((sum,key)=>sum+Number(methods[key]||0),0),cellular=["experimental pathology","histology / IHC","electron microscopy","intravital microscopy","patch clamp","electrophysiology","electrophysiology + laser-speckle CBF"].reduce((sum,key)=>sum+Number(methods[key]||0),0);
        const counts=data.meta.methodFamilyCounts;
        legend.replaceChildren(evidenceRow,el("div","evidence-network-legend-methods",counts
          ?`methods (overlap) · imaging ${counts.imaging||0} · cellular/pathology ${counts.cellular||0} · blood/fluid ${counts.fluid||0} · physiology ${counts.physiology||0}`
          :`methods · imaging ${imaging} · cellular/pathology ${cellular} · blood ${methods["blood assay"]||0} · challenge ${methods["physiological challenge"]||0}`));
      };

      const shape = (node) => {
        const group = document.createElementNS(NS, "g");
        group.setAttribute("class", "evidence-node");
        group.dataset.id = node.id;
        group.dataset.theme = node.theme;
        group.dataset.evidence = node.evidence;
        group.setAttribute("transform", `translate(${node.x} ${node.y})`);
        const r = Math.max(2.2, Number(node.size) || 3);
        let mark;
        if (["pig","methods","postmortem"].includes(node.evidence)) {
          mark = document.createElementNS(NS, "rect");
          mark.setAttribute("x", -r); mark.setAttribute("y", -r);
          mark.setAttribute("width", 2 * r); mark.setAttribute("height", 2 * r);
          mark.setAttribute("rx", Math.max(1, r * .24));
        } else if (node.evidence === "mouse" || node.evidence === "rat") {
          mark = document.createElementNS(NS, "path");
          if (node.evidence === "mouse") mark.setAttribute("d", `M0 ${-r * 1.22} L${r * 1.08} ${r * .82} L${-r * 1.08} ${r * .82} Z`);
          else mark.setAttribute("d", `M0 ${-r * 1.18} L${r * 1.02} 0 L0 ${r * 1.18} L${-r * 1.02} 0 Z`);
        } else if (["primate","other_animal","mixed"].includes(node.evidence)) {
          mark = document.createElementNS(NS, "path");
          const count=node.evidence==="mixed"?8:node.evidence==="other_animal"?5:6;
          const pts = Array.from({ length: count }, (_, j) => {
            const a = Math.PI * 2 / count * j - Math.PI / 2;
            const radius=node.evidence==="mixed"?r*(j%2?.43:1.35):r;
            return `${Math.cos(a) * radius},${Math.sin(a) * radius}`;
          }).join(" ");
          mark.setAttribute("d", `M${pts.replaceAll(" ", " L")} Z`);
        } else {
          mark = document.createElementNS(NS, "circle");
          mark.setAttribute("r", r);
        }
        mark.setAttribute("class", "evidence-node-mark");
        mark.style.setProperty("--node-color", graph.themes[node.theme]?.color || "#aeb4c0");
        group.appendChild(mark);
        const title = document.createElementNS(NS, "title");
        title.textContent = `${displayNodeLabel(node)} · ${node.method || ""}\n${node.title || ""}`
          + (node.classification?`\n${node.classification.design.replaceAll('_',' ')} · ${node.classification.context}\n${node.classification.basis}`:'')
          + (node.source?.url?`\n${node.source.url}`:'');
        group.appendChild(title);
        return group;
      };

      const makeRegionState = (state, data) => {
        const layer = document.createElementNS(NS, "g");
        layer.setAttribute("class", "evidence-region-state");
        const byId = new Map(data.nodes.map((node) => [node.id, node]));
        (state.regions || []).forEach((region) => {
          const footprint = region.footprint ? data.footprints?.[region.footprint] : null;
          const ids = [].concat(region.nodes || []).filter(Boolean);
          const points = ids.map((id) => byId.get(id)).filter(Boolean);
          if (!footprint?.path && !points.length && region.x == null && region.cx == null) return;

          const xs = points.map((point) => Number(point.x) || 0);
          const ys = points.map((point) => Number(point.y) || 0);
          const padding = Array.isArray(region.padding)
            ? region.padding : [region.padding ?? 56, region.padding ?? 44];
          const px = Number(padding[0]) || 0, py = Number(padding[1] ?? padding[0]) || 0;
          const minX = xs.length ? Math.min(...xs) : Number(region.x ?? region.cx) || 0;
          const maxX = xs.length ? Math.max(...xs) : minX;
          const minY = ys.length ? Math.min(...ys) : Number(region.y ?? region.cy) || 0;
          const maxY = ys.length ? Math.max(...ys) : minY;
          const cx = Number(region.cx ?? region.x) || (minX + maxX) / 2;
          const cy = Number(region.cy ?? region.y) || (minY + maxY) / 2;
          const rx = Math.max(Number(region.rx) || 0, (Number(region.width) || maxX - minX + px * 2) / 2, 42);
          const ry = Math.max(Number(region.ry) || 0, (Number(region.height) || maxY - minY + py * 2) / 2, 30);

          const group = document.createElementNS(NS, "g");
          group.setAttribute("class", "evidence-region" + (region.paper || region.solid ? " paper" : ""));
          if (region.footprint) group.dataset.footprint = region.footprint;
          if (footprint?.areaPercent != null) group.dataset.areaPercent = footprint.areaPercent;
          group.style.setProperty("--region-color", region.color || "#78a8ff");
          group.style.setProperty("--region-opacity", String(region.opacity ?? (region.paper || region.solid ? .17 : .12)));
          let shape;
          if (footprint?.path) {
            shape = document.createElementNS(NS, "path");
            shape.setAttribute("d", footprint.path);
          } else {
            if (region.rotate) group.setAttribute("transform", `rotate(${Number(region.rotate) || 0} ${cx} ${cy})`);
            shape = document.createElementNS(NS, "ellipse");
            shape.setAttribute("cx", cx); shape.setAttribute("cy", cy);
            shape.setAttribute("rx", rx); shape.setAttribute("ry", ry);
          }
          shape.setAttribute("class", "evidence-region-shape");
          group.appendChild(shape);
          const labelText = region.label ?? region.paper ?? footprint?.label;
          if (labelText) {
            const labelBaseX = Number(footprint?.labelX ?? cx) || cx;
            const labelBaseY = Number(footprint?.labelY ?? cy) || cy;
            const labelX = labelBaseX + (Number(region.labelX) || 0);
            const labelY = labelBaseY + (Number(region.labelY) || 0);
            const text = document.createElementNS(NS, "text");
            text.setAttribute("class", "evidence-region-label");
            text.setAttribute("x", labelX);
            text.setAttribute("y", labelY);
            String(labelText).split("\n").forEach((line, index, lines) => {
              const tspan = document.createElementNS(NS, "tspan");
              tspan.setAttribute("x", labelX);
              tspan.setAttribute("dy", index ? 17 : -((lines.length - 1) * 8.5));
              tspan.textContent = line;
              text.appendChild(tspan);
            });
            group.appendChild(text);
          }
          layer.appendChild(group);
        });
        return layer;
      };

      const cohortSpecs = (state, data) => (state.cohorts || []).map(key => (data?.interactiveCohorts||data?.cohorts)?.[key]).filter(Boolean);
      const makeCohortState = (state, data) => {
        const layer = document.createElementNS(NS, "g");
        layer.setAttribute("class", "evidence-cohort-state");
        const byId = new Map(data.nodes.map(node => [node.id, node]));
        cohortSpecs(state, data).forEach(spec => {
          // Local overlapping washes follow actual members across topic boundaries. A
          // single convex hull would wrongly imply that all enclosed papers belong.
          const wash = document.createElementNS(NS, "g");
          wash.setAttribute("class", "evidence-cohort-wash");
          wash.style.setProperty("--cohort-color", spec.color);
          for (const id of spec.members) {
            const node = byId.get(id); if (!node) continue;
            const patch = document.createElementNS(NS, "circle");
            patch.setAttribute("cx", node.x); patch.setAttribute("cy", node.y);
            patch.setAttribute("r", 46);
            wash.appendChild(patch);
          }
          layer.appendChild(wash);
        });
        return layer;
      };

      const makeSatelliteState = (state, data) => {
        const layer = document.createElementNS(NS, "g");
        layer.setAttribute("class", "evidence-satellite-state");
        const byId = new Map(data.nodes.map((node) => [node.id, node]));
        [...(state.studyMarkers || []), ...(state.satellites || [])].forEach((spec) => {
          const source = byId.get(spec.node || spec.id);
          const target = byId.get(spec.connectTo);
          if (!source || (spec.connectTo && !target)) return;
          const x = Number(spec.x ?? source.x) || 0;
          const y = Number(spec.y ?? source.y) || 0;
          const color = spec.color || data.themes?.[source.theme]?.color || "#78a8ff";
          if (target) {
            const link = document.createElementNS(NS, "line");
            link.setAttribute("class", "evidence-satellite-link");
            link.setAttribute("x1", target.x); link.setAttribute("y1", target.y);
            link.setAttribute("x2", x); link.setAttribute("y2", y);
            link.style.setProperty("--satellite-color", color);
            layer.appendChild(link);
          }

          const group = document.createElementNS(NS, "g");
          group.setAttribute("class", "evidence-satellite-node");
          group.dataset.study = source.id;
          group.setAttribute("transform", `translate(${x} ${y})`);
          group.style.setProperty("--satellite-color", color);
          const halo = document.createElementNS(NS, "circle");
          halo.setAttribute("class", "evidence-satellite-halo"); halo.setAttribute("r", 18);
          const mark = document.createElementNS(NS, "circle");
          mark.setAttribute("class", "evidence-satellite-mark"); mark.setAttribute("r", 6);
          group.append(halo, mark);
          layer.appendChild(group);

          const label = document.createElementNS(NS, "text");
          label.setAttribute("class", "evidence-satellite-label");
          const anchorEnd = x > 1240;
          label.setAttribute("text-anchor", anchorEnd ? "end" : "start");
          label.setAttribute("x", x + (anchorEnd ? -14 : 14));
          label.setAttribute("y", y - 4);
          label.style.setProperty("--satellite-color", color);
          const title = document.createElementNS(NS, "tspan");
          title.setAttribute("x", x + (anchorEnd ? -14 : 14));
          title.textContent = spec.label || displayNodeYearLabel(source);
          const sub = document.createElementNS(NS, "tspan");
          sub.setAttribute("x", x + (anchorEnd ? -14 : 14)); sub.setAttribute("dy", 16);
          sub.setAttribute("class", "evidence-satellite-kind");
          sub.textContent = spec.role ?? "software · methods";
          label.append(title, sub);
          layer.appendChild(label);
        });
        return layer;
      };

      const paintState = (step = 0, nav = {}) => {
        pendingStep = Math.min(states.length - 1, Math.max(0, Number(step) || 0));
        const state = states[pendingStep];
        discussion?.paint(state, nav);
        const hydrateMedia=(index)=>stateEls[index]?.querySelectorAll("[data-src]").forEach((media)=>{
          const src=media.dataset.src;if(!src)return;media.setAttribute("src",src);delete media.dataset.src;
          if(media.tagName==="VIDEO")media.load();
        });
        hydrateMedia(pendingStep);
        const warmNext=()=>hydrateMedia(pendingStep+1);
        if("requestIdleCallback" in window)requestIdleCallback(warmNext,{timeout:650});else setTimeout(warmNext,120);
        const activeThemes = focusThemesFor(state);
        holder.dataset.focus = activeThemes.length > 1 ? "multi" : (state.focus || "all");
        holder.dataset.focusThemes = activeThemes.join(" ");
        const cohorts = cohortSpecs(state, graph);
        holder.dataset.cohortView = cohorts.length ? "1" : "0";
        holder.dataset.cohorts = (state.cohorts || []).join(" ");
        const cohortColor = new Map();
        cohorts.forEach(spec => spec.members.forEach(id => cohortColor.set(id, spec.color)));
        cohortLegend.hidden = state.cohortLegend === false || cohorts.length < 2;
        cohortLegend.replaceChildren(...cohorts.map(spec => {
          const label = el("span", "", spec.label);
          label.style.setProperty("--cohort-color", spec.color);
          return label;
        }));
        holder.dataset.overview = state.overview || state.focus === "all" ? "1" : "0";
        const theme = graph?.themes?.[state.focus] || graph?.themes?.[activeThemes[0]];
        holder.dataset.circuitLabel = activeThemes.some((key) => graph?.themes?.[key]) ? "1" : "0";
        const fallbackTitle = graph || state.focus === "all" ? (b.title || "") : "";
        const stateTitle = state.audienceStory ? state.audienceStory.title || ""
          : state.title === false ? "" : (state.title ?? theme?.label ?? fallbackTitle);
        holder.dataset.storyColumns = state.audienceStory?.columns?.length ? "1" : "0";
        holder.dataset.hasSpeakingPrompt = state.speakingPrompt ? "1" : "0";
        const stateSubtitle = state.audienceStory ? ""
          : state.subtitle === false ? "" : (state.subtitle ?? b.subtitle ?? "");
        sectionTitle.textContent = stateTitle;
        sectionSubtitle.textContent = stateSubtitle;
        sectionHeader.hidden = b.plainHeadings || (b.synchronizedReveal && !!state.audienceStory) || (!stateTitle && !stateSubtitle);
        holder.dataset.paperVisible = state.figure || state.video || state.figures?.length ? "1" : "0";
        sectionHeader.style.setProperty("--section-color", state.titleColor || theme?.color || "#f2f3f5");
        paintTimeline(state);
        const stateCitations = citationsFor(state);
        holder.dataset.stateCitation = stateCitations.length ? "1" : "0";
        holder.closest(".slide")?.querySelector(".sources")
          ?.classList.toggle("evidence-sources-suppressed", hasStateCitations);
        const animatedEls = [...stateEls, ...regionEls, ...cohortEls, ...satelliteEls, ...nodeEls, ...edgeEls, ...labelEls, ...themeLabelEls];
        if (nav.settled) animatedEls.forEach((element) => { element.style.transition = "none"; });
        stateEls.forEach((layer, i) => {
          layer.classList.toggle("active", i === pendingStep);
          layer.querySelectorAll("video").forEach((video) => {
            const playback = video.dataset.playback || "auto";
            if (i !== pendingStep || playback === "pause") video.pause();
            else if (playback === "play" || playback === "auto") void video.play().catch(() => {});
          });
        });
        regionEls.forEach((layer, i) => layer.classList.toggle("active", i === pendingStep));
        cohortEls.forEach((layer, i) => layer.classList.toggle("active", i === pendingStep));
        satelliteEls.forEach((layer, i) => layer.classList.toggle("active", i === pendingStep));
        themeLabelEls.forEach((label) => label.classList.toggle("active", activeThemes.includes(label.dataset.theme)));
        const activeLayer = stateEls[pendingStep];
        requestAnimationFrame(() => {
          const copy = activeLayer?.querySelector(".evidence-network-copy");
          activeLayer?.style.setProperty("--copy-height", `${Math.ceil(copy?.getBoundingClientRect().height || 0)}px`);
          const circuitLabel = themeLabelEls.find((label) => label.classList.contains("active"));
          if (circuitLabel) {
            const circuitRect = circuitLabel.getBoundingClientRect();
            labelEls.filter((label) => label.classList.contains("active")).forEach((label) => {
              const paperRect = label.getBoundingClientRect();
              const intersects = Math.min(circuitRect.right, paperRect.right) > Math.max(circuitRect.left, paperRect.left)
                && Math.min(circuitRect.bottom, paperRect.bottom) > Math.max(circuitRect.top, paperRect.top);
              if (intersects) label.setAttribute("y", Number(label.dataset.baseY) + 30);
            });
          }
        });
        const footprintSpecs = (state.regions || []).map((region) => {
          const footprint = graph?.footprints?.[region.footprint];
          if (!footprint) return null;
          return {
            footprint,
            members: new Set(footprint.members || []),
            color: region.color || graph?.themes?.[graph.nodes.find((node) => node.id === footprint.anchor)?.theme]?.color || "#78a8ff",
          };
        }).filter(Boolean);
        const footprintColor = new Map();
        footprintSpecs.forEach(({ members, color }) => members.forEach((id) => footprintColor.set(id, color)));
        const regionNodes = (state.regions || []).flatMap((region) => [].concat(region.nodes || []));
        const markedRegionNodes = (state.regions || []).filter((region) => region.spotlight)
          .flatMap((region) => [].concat(region.nodes || []));
        const explicitSpot = state.spotlight === true
          ? regionNodes : [].concat(state.spotlight || [], markedRegionNodes);
        const spot = new Set([].concat(state.node || [], state.nodes || [], explicitSpot).filter(Boolean));
        const hidden = new Set([].concat(b.hiddenNodes || [], state.hiddenNodes || []).filter(Boolean));
        interactiveGraph?.paint(state,{...nav,activeThemes,hidden});
        const hiddenLabels = new Set([].concat(state.hiddenLabels || []).filter(Boolean));
        nodeEls.forEach((node) => {
          const color = cohortColor.get(node.dataset.id);
          node.classList.toggle("cohort-member", Boolean(color) && !hidden.has(node.dataset.id));
          if (color) node.style.setProperty("--cohort-color", color);
          else node.style.removeProperty("--cohort-color");
          const contextColor = footprintColor.get(node.dataset.id);
          node.classList.toggle("footprint-context", Boolean(contextColor) && !hidden.has(node.dataset.id));
          if (contextColor) node.style.setProperty("--footprint-color", contextColor);
          else node.style.removeProperty("--footprint-color");
          node.classList.toggle("spotlight", spot.has(node.dataset.id) && !hidden.has(node.dataset.id));
          node.classList.toggle("concealed", hidden.has(node.dataset.id));
        });
        labelEls.forEach((label) => {
          label.setAttribute("y", label.dataset.baseY);
          const labelNode = graph?.nodes?.find((node) => node.id === label.dataset.id);
          if (labelNode) label.textContent = state.nodeLabelYear
            ? displayNodeYearLabel(labelNode, paperIds(state).length === 1 ? state.publicationYear : null) : displayNodeLabel(labelNode);
          label.classList.toggle("active", spot.has(label.dataset.id) && !hidden.has(label.dataset.id) && !hiddenLabels.has(label.dataset.id));
          label.classList.toggle("concealed", hidden.has(label.dataset.id));
        });
        edgeEls.forEach((edge) => {
          const color = cohortColor.get(edge.dataset.sourceId);
          const sameCohort = color && color === cohortColor.get(edge.dataset.targetId);
          edge.classList.toggle("cohort-member", Boolean(sameCohort));
          if (sameCohort) edge.style.setProperty("--cohort-color", color);
          else edge.style.removeProperty("--cohort-color");
          const footprintSpec = footprintSpecs.find(({ members }) =>
            members.has(edge.dataset.sourceId) && members.has(edge.dataset.targetId));
          const isContext = Boolean(footprintSpec);
          const isAnchorEdge = Boolean(footprintSpec) && (
            edge.dataset.sourceId === footprintSpec.footprint.anchor
            || edge.dataset.targetId === footprintSpec.footprint.anchor
          );
          const touchesHidden = hidden.has(edge.dataset.sourceId) || hidden.has(edge.dataset.targetId);
          edge.classList.toggle("footprint-context", isContext);
          edge.classList.toggle("prospective", isContext && isAnchorEdge && touchesHidden);
          if (isContext) edge.style.setProperty("--footprint-color", footprintSpec.color);
          else edge.style.removeProperty("--footprint-color");
          edge.classList.toggle("concealed", touchesHidden && !(state.keepHiddenEdges && isContext && isAnchorEdge));
        });
        if (graph && spot.size) {
          const first = graph.nodes.find((node) => spot.has(node.id));
          if (first) {
            const layer = stateEls[pendingStep];
            const figure = layer.querySelector(".evidence-network-figure");
            const matrix = svg.getScreenCTM();
            if (figure && matrix) {
              const point = svg.createSVGPoint();
              point.x = first.x; point.y = first.y;
              const screen = point.matrixTransform(matrix);
              const frame = holder.getBoundingClientRect();
              const originX = (screen.x - frame.left - figure.offsetLeft) / Math.max(1, figure.offsetWidth) * 100;
              const originY = (screen.y - frame.top - figure.offsetTop) / Math.max(1, figure.offsetHeight) * 100;
              layer.style.setProperty("--origin-x", `${originX}%`);
              layer.style.setProperty("--origin-y", `${originY}%`);
            }
          }
        }
        if (nav.settled) {
          void holder.offsetWidth;
          animatedEls.forEach((element) => { element.style.transition = ""; });
        }
      };
      holder.repaint = paintState;

      jsonOnce(b.src,b.compressedSrc).then((data) => {
        if(data.meta?.interactive&&Array.isArray(data.edges?.[0]))data.edges=data.edges.map(([source,target,kind,weight])=>({source,target,kind,weight}));
        graph = data;
        buildTimeline(data);
        if(progressiveOverview&&!data.meta?.interactive) {
          // The overview is already painted progressively into one stable canvas.  Keeping a
          // second full-node / full-edge SVG beneath it costs a large compositor layer and, on
          // Chromium, could intermittently erase both layers.  The following circuit slides
          // still use the exact same frozen graph coordinates in SVG for interaction.
          startProgressiveOverview(data,states[0]);
          paintLegend(data);
          holder.dataset.ready = "1";
          paintState(pendingStep, { settled: true });
          holder.dispatchEvent(new CustomEvent("block-ready", { bubbles: true }));
          return;
        }
        // Network-derived footprints live beneath the graph itself.  Edges and nodes are
        // painted afterward so the highlighted volume never reads as a pasted-on blob.
        if(!data.meta?.interactive)mountEvidenceCorpus(svg, data, holder);
        else {holder.dataset.progressive='0';holder.dataset.interactive='1';}
        const regions = document.createElementNS(NS, "g");
        regions.setAttribute("class", "evidence-regions");
        states.forEach((state) => regions.appendChild(makeRegionState(state, data)));
        svg.appendChild(regions);
        regionEls = [...regions.children];

        const cohortLayer = document.createElementNS(NS, "g");
        cohortLayer.setAttribute("class", "evidence-cohorts");
        if(!data.meta?.interactive)states.forEach(state => cohortLayer.appendChild(makeCohortState(state, data)));
        svg.appendChild(cohortLayer);
        cohortEls = [...cohortLayer.children];

        const satellites = document.createElementNS(NS, "g");
        satellites.setAttribute("class", "evidence-satellites");
        states.forEach((state) => satellites.appendChild(makeSatelliteState(state, data)));
        svg.appendChild(satellites);
        satelliteEls = [...satellites.children];

        const edgeLayer = document.createElementNS(NS, "g");
        edgeLayer.setAttribute("class", "evidence-edges");
        (data.meta?.interactive?[]:data.edges).forEach((edge) => {
          const a = data.nodes[edge.source], z = data.nodes[edge.target];
          if (!a || !z) return;
          const line = document.createElementNS(NS, "line");
          line.setAttribute("x1", a.x); line.setAttribute("y1", a.y);
          line.setAttribute("x2", z.x); line.setAttribute("y2", z.y);
          line.setAttribute("class", `evidence-edge ${edge.kind}`);
          line.dataset.theme = a.theme === z.theme ? a.theme : "cross";
          line.dataset.sourceId = a.id;
          line.dataset.targetId = z.id;
          if (edge.scope) line.dataset.scope = edge.scope;
          if (edge.curated) line.dataset.curated = "1";
          edgeLayer.appendChild(line);
        });
        svg.appendChild(edgeLayer);
        edgeEls = [...edgeLayer.children];

        const nodeLayer = document.createElementNS(NS, "g");
        nodeLayer.setAttribute("class", "evidence-nodes");
        (data.meta?.interactive?[]:data.nodes).filter(node => node.auditStatus !== 'automated-screening')
          .forEach((node) => nodeLayer.appendChild(shape(node)));
        svg.appendChild(nodeLayer);
        nodeEls = [...nodeLayer.children];

        const labels = document.createElementNS(NS, "g");
        labels.setAttribute("class", "evidence-node-labels");
        const stateNodeIds = new Set(states.flatMap((state) => [].concat(state.node || [], state.nodes || [])));
        data.nodes.filter((node) => node.highlight || stateNodeIds.has(node.id)).forEach((node) => {
          const text = document.createElementNS(NS, "text");
          const anchorEnd = Number(node.x) > 1320;
          text.setAttribute("x", Number(node.x) + (anchorEnd ? -8 : 8)); text.setAttribute("y", node.y - 8);
          text.dataset.baseY = String(Number(node.y) - 8);
          if (anchorEnd) text.setAttribute("text-anchor", "end");
          text.setAttribute("class", "evidence-node-label");
          text.dataset.id = node.id;
          text.textContent = displayNodeLabel(node);
          labels.appendChild(text);
        });
        svg.appendChild(labels);
        labelEls = [...labels.children];

        const themes = document.createElementNS(NS, "g");
        themes.setAttribute("class", "evidence-theme-labels");
        const labelOffsets = { biomarkers: [-48, 50], clinical: [78, -30], challenge: [54, 20] };
        Object.entries(data.themes).forEach(([key, spec]) => {
          if (!spec.centroid) return;
          const text = document.createElementNS(NS, "text");
          const [dx, dy] = labelOffsets[key] || [0, 0];
          text.setAttribute("x", spec.centroid.x + dx);
          text.setAttribute("y", spec.centroid.y + dy);
          text.dataset.theme = key;
          text.style.setProperty("--theme-color", spec.color);
          text.textContent = /unresolved|unknown/i.test(spec.label) ? 'Other research' : spec.label;
          const count = data.meta.themeCounts[key];
          if (count) text.appendChild(document.createTextNode(` · ${count}`));
          themes.appendChild(text);
        });
        svg.appendChild(themes);
        themeLabelEls = [...themes.children];
        // Satellites are explanatory outboard nodes and must remain legible above the dimmed map.
        svg.appendChild(satellites);

        paintLegend(data);

        if(data.meta?.interactive)interactiveGraph=mountEvidenceGraph(map,svg,data,holder);

        holder.dataset.ready = "1";
        paintState(pendingStep, { settled: true });
        holder.dispatchEvent(new CustomEvent("block-ready", { bubbles: true }));
      }).catch((err) => {
        holder.classList.add("error");
        holder.appendChild(el("div", "evidence-network-error", `Literature network unavailable: ${err.message}`));
      });
      return stepped(holder, b);
    },
  },

  code: {
    label: "code", icon: "{}",
    fields: [{ k: "code", t: "area" }, { k: "lang", t: "text" }],
    make: () => ({ type: "code", lang: "python", code: "def spiral(r, b, t):\n    return r * exp(b * t)" }),
    render: (b) => {
      const pre = el("pre", "code");
      pre.innerHTML = highlight(b.code || "", b.lang);
      return stepped(pre, b);
    },
  },

  image: {
    label: "image", icon: "▣",
    fields: [{ k: "src", t: "file" }, { k: "caption", t: "text" }, { k: "alt", t: "text" },
             { k: "fit", t: "pick", of: ["contain", "cover", "fill"] },
             { k: "framed", t: "bool" }, { k: "bleed", t: "bool" }],
    make: () => ({ type: "image", src: "", caption: "" }),
    render: (b) => {
      const fig = el("figure", "shot" + (b.framed ? " framed" : "") + (b.bleed ? " bleed-image" : ""));
      fig.dataset.fit = b.fit || "contain";
      const img = el("img");
      img.src = b.src || "";
      img.alt = b.alt || b.caption || "";
      fig.appendChild(img);
      if (b.caption) fig.appendChild(el("figcaption", null, b.caption));
      return stepped(fig, b);
    },
  },

  rule: {
    label: "rule", icon: "—",
    fields: [],
    make: () => ({ type: "rule" }),
    render: (b) => stepped(el("div", "rule"), b),
  },

  scene: {
    label: "animation", icon: "◎",
    fields: [{ k: "scene", t: "text" }, { k: "args", t: "json" }],
    make: () => ({ type: "scene", scene: "unitCircle" }),
    render: (b) => {
      const holder = el("div", "scene-holder");
      holder.style.cssText = "width:100%;display:flex;justify-content:center";
      // mounted after the slide is in the DOM, so it can measure itself
      holder.dataset.scene = b.scene || "";
      holder.dataset.args = JSON.stringify(b.args || {});
      return stepped(holder, b);
    },
  },

  spacer: {
    label: "spacer", icon: "␣",
    fields: [{ k: "size", t: "text" }],
    make: () => ({ type: "spacer", size: "4vh" }),
    render: (b) => {
      const d = el("div");
      d.style.height = b.size || "4vh";
      return d;
    },
  },

  /* A figure drawn from data — box, violin, bar, line, scatter or strip, single or gridded.
   * `data` is inline, or `src` points at a JSON file the deck loads. */
  chart: {
    label: "chart", icon: "▤",
    fields: [{ k: "kind", t: "pick", of: ["box", "violin", "bar", "line", "scatter", "strip"] },
             { k: "src", t: "text" }, { k: "data", t: "json" },
             { k: "where", t: "json" }, { k: "ylabel", t: "text" },
             { k: "test", t: "pick", of: ["", "welch", "mw"] }, { k: "aspect", t: "text" },
             { k: "reveal", t: "pick", of: ["", "panels"] }, { k: "focus", t: "bool" },
             { k: "gap", t: "text" }, { k: "cols", t: "text" },
             { k: "lines", t: "pick", of: ["", "hairline", "firm", "solid", "white", "outline"] }],
    make: () => ({ type: "chart", kind: "box",
                   data: { ylabel: "value", panels: [
                     { label: "example", groups: ["A", "B"],
                       values: [[1, 2, 2, 3, 3, 4], [2, 3, 3, 4, 5, 5]] }] } }),
    render: (b) => {
      const holder = el("div", "chart-holder");
      holder.dataset.chart = "1";
      holder.dataset.chartSpec = JSON.stringify({
        kind: b.kind || "box", src: b.src || "", data: b.data || null,
        where: b.where || null, ylabel: b.ylabel || "",
        reveal: b.reveal || "", focus: !!b.focus,
        test: b.test || "", aspect: +b.aspect || null, points: b.points !== false,
        lines: b.lines || "",
        gap: b.gap === "" || b.gap == null ? null : +b.gap,
        cols: b.cols === "" || b.cols == null ? null : +b.cols,
      });
      return stepped(holder, b);
    },
  },

  /* An outside image, re-drawn out of the field rather than pasted on top of it. The block
   * only marks the spot; the reading and the animation happen once it is on screen. */
  traced: {
    label: "traced image", icon: "◨",
    fields: [{ k: "src", t: "file" }, { k: "mode", t: "pick", of: ["dots", "outline", "both"] },
             { k: "cols", t: "text" }, { k: "arrival", t: "pick", of: Object.keys(ARRIVALS) }],
    make: () => ({ type: "traced", src: "", mode: "both", cols: 90, arrival: "wipe" }),
    render: (b) => {
      const holder = el("div", "trace-holder");
      holder.dataset.trace = b.src || "";
      holder.dataset.traceOpts = JSON.stringify({
        mode: b.mode || "both", cols: +b.cols || 90, arrival: b.arrival || "wipe",
        seconds: b.seconds ?? 2.6, invert: !!b.invert, edgeGain: b.edgeGain ?? 1,
        floor: b.floor ?? 0.10, hold: b.hold ?? true, crop: b.crop || null,
      });
      return stepped(holder, b);
    },
  },

  /* Set in the body face rather than the display one, so it reads as speech and not as
   * another heading competing with the slide's own. */
  quote: {
    label: "quote", icon: "❞",
    fields: [{ k: "text", t: "area" }, { k: "cite", t: "text" }],
    make: () => ({ type: "quote", text: "Something worth repeating.", cite: "— source" }),
    render: (b) => {
      const fig = el("figure", "quote");
      const p = el("blockquote");
      p.innerHTML = inline(b.text);
      fig.appendChild(p);
      if (b.cite) fig.appendChild(el("figcaption", "eyebrow", b.cite));
      return stepped(fig, b);
    },
  },

  /* The checkpoint page's list. Items carry a `done` flag rather than being two different
   * block types, so a deck can reuse one list and tick more of it off as the talk goes. */
  checklist: {
    label: "checklist", icon: "✓",
    fields: [{ k: "items", t: "area" }],
    make: () => ({ type: "checklist", items: ["+ established", "- still to come"] }),
    render: (b) => {
      const ul = el("ul", "checklist");
      for (const raw of b.items || []) {
        const done = /^\s*\+/.test(raw);
        const li = el("li", done ? "done" : "");
        li.appendChild(el("span", "box", done ? "✓" : ""));
        const t = el("span");
        t.innerHTML = inline(String(raw).replace(/^\s*[+-]\s*/, ""));
        li.appendChild(t);
        ul.appendChild(li);
      }
      return stepped(ul, b);
    },
  },

  /* Side by side. `of` holds child block lists, so a column can contain anything the slide
   * can — which is how maths-and-text, image-and-text and three-up are all one block. */
  columns: {
    label: "columns", icon: "▥",
    fields: [{ k: "ratio", t: "text" }, { k: "of", t: "json" }],
    make: () => ({ type: "columns", ratio: "1 1", of: [[], []] }),
    render: (b) => {
      const wrap = el("div", "columns");
      wrap.style.gridTemplateColumns = (b.ratio || "1 1")
        .split(/\s+/).map((n) => `${n}fr`).join(" ");
      (b.of || []).forEach((col, ci) => {
        const c = el("div", "column");
        c.dataset.column = ci;
        col.forEach((child, ki) => {
          const def = BLOCKS[child.type];
          if (!def) return;
          const node = def.render(child);
          // A child of a column had no address, so the builder could not select it: clicking
          // one picked the whole columns block and its fields were unreachable. This is that
          // address — column index and position within it.
          node.dataset.child = `${ci}.${ki}`;
          c.appendChild(node);
        });
        wrap.appendChild(c);
      });
      return stepped(wrap, b);
    },
  },

  table: {
    label: "table", icon: "▦",
    fields: [{ k: "head", t: "json" }, { k: "rows", t: "json" }],
    make: () => ({ type: "table", head: ["a", "b"], rows: [["1", "2"]] }),
    render: (b) => {
      const t = el("table", "table");
      if (b.head) {
        const tr = el("tr");
        for (const h of b.head) { const th = el("th"); th.innerHTML = inline(h); tr.appendChild(th); }
        t.appendChild(tr);
      }
      for (const row of b.rows || []) {
        const tr = el("tr");
        for (const c of row) { const td = el("td"); td.innerHTML = inline(c); tr.appendChild(td); }
        t.appendChild(tr);
      }
      return stepped(t, b);
    },
  },

  /* The large numeral on a chapter divider. Its own block rather than a styled title,
   * because the chapter's number is structure the deck already knows. */
  chapnum: {
    label: "chapter no.", icon: "№",
    fields: [{ k: "text", t: "text" }],
    make: () => ({ type: "chapnum", text: "01" }),
    render: (b) => stepped(el("div", "chapnum", b.text), b),
  },

  /* The contents list, with the current chapter lit. `at` is filled in by the deck at
   * render time, so the same block on every divider shows the right thing. */
  agenda: {
    label: "agenda", icon: "≣",
    fields: [{ k: "items", t: "area" }],
    make: () => ({ type: "agenda", items: [] }),
    render: (b) => {
      const ol = el("ol", "agenda");
      (b.items || []).forEach((it, i) => {
        const li = el("li", i === b.at ? "on" : "");
        li.appendChild(el("span", "n", String(i + 1).padStart(2, "0")));
        li.appendChild(el("span", "", it));
        ol.appendChild(li);
      });
      return stepped(ol, b);
    },
  },
};

/** `**bold**`, `*italic*`, `` `code` `` and `$maths$` inside a line of prose. */
let CITE_NUMBERS = new Map();
/** The deck hands its numbering here once, so `inline` can mark up prose as it renders. */
export function setCitations(numbers) { CITE_NUMBERS = numbers || new Map(); }

function inline(s) {
  if (!s) return "";
  let out = escapeHtml(s);
  // [@key] -> [1] in the accent, exactly where it was written
  out = out.replace(/\[@([^\]]+)\]/g, (_, keys) => {
    // every key after the first carries its own '@' in the `[@a; @b]` form
    const ns = keys.split(/[;,]/).map((k) => k.trim().replace(/^@+/, "")).filter(Boolean)
      .map((k) => CITE_NUMBERS.get(k)).filter(Boolean);
    return ns.length ? `<span class="cite">[${ns.join(",")}]</span>` : "";
  });
  out = out.replace(/\$([^$]+)\$/g, (_, tex) => {
    const span = document.createElement("span");
    renderMath(span, tex, false);
    return span.innerHTML;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/`([^`]+)`/g, '<code class="mono">$1</code>');
  return out;
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* Deliberately crude: enough to give code a shape at the back of a room, and no more.
 * A real tokeniser would be a dependency, a build step and a bug surface for something
 * nobody reads word by word from twenty feet away. */
function highlight(code, lang) {
  let s = escapeHtml(code);
  s = s.replace(/(#[^\n]*|\/\/[^\n]*)/g, '<span class="com">$1</span>');
  s = s.replace(/(&quot;[^&]*&quot;|'[^']*')/g, '<span class="str">$1</span>');
  s = s.replace(/\b(def|class|return|import|from|if|else|elif|for|while|in|fun|val|var|const|let|function|async|await|new)\b/g,
                '<span class="kw">$1</span>');
  return s;
}

/** Render a slide's blocks into a container. */
export function renderBlocks(slide, into) {
  const inner = el("div", "slide-inner");
  for (const b of slide.blocks || []) {
    const def = BLOCKS[b.type];
    if (!def) continue;
    inner.appendChild(def.render(b));
  }
  into.appendChild(inner);
  return inner;
}

/** Fit every equation under `root` to its column.
 *
 * Deliberately NOT part of renderBlocks: a slide is built detached and attached later by the
 * transition, and a detached column measures zero, so fitting there silently does nothing.
 * The runtime calls this once the page is actually in the stage, and again on resize. */
export function fitMathIn(root) {
  root.querySelectorAll(".math-display").forEach(fitMath);
}

/**
 * Mount every scene under `root`, once it is on screen.
 *
 * Same reason as fitMathIn, and a worse failure: a detached holder measures 0, mountScene
 * falls back to a 900px canvas, and then `max-width:100%` squeezes the element's WIDTH while
 * leaving its height alone. The result is a figure scaled non-uniformly — a brain drawn as an
 * egg — which looks like bad artwork rather than the layout bug it is.
 */
export function mountScenesIn(root) {
  root.querySelectorAll("[data-scene]").forEach((h) => {
    if (h.dataset.mounted === "1" && Math.abs(h.clientWidth - +h.dataset.mountedAt) < 2) return;
    h.dataset.mounted = "1";
    h.dataset.mountedAt = h.clientWidth;
    mountScene(h, h.dataset.scene, JSON.parse(h.dataset.args || "{}"));
  });
  root.querySelectorAll("[data-chart]").forEach((h) => {
    if (h.dataset.mounted === "1" && Math.abs(h.clientWidth - +h.dataset.mountedAt) < 2) return;
    h.dataset.mounted = "1";
    h.dataset.mountedAt = h.clientWidth;
    const spec = JSON.parse(h.dataset.chartSpec || "{}");
    import("./charts.js").then(async ({ drawChart, applyTest }) => {
      let data = spec.data;
      if (spec.src) data = await (await fetch(spec.src, { cache: "no-store" })).json();
      if (!data) throw new Error("no data");
      /* Keep shared result files shared.
       *
       * A defense slide often needs two panels from a fourteen-panel analysis. Copying those
       * values into the .spiral makes the presentation large and creates a second source of
       * truth. `where` selects panels by declared metadata instead: a scalar means equality,
       * an array means membership. The original JSON remains the only data file. */
      if (spec.where && data.panels) {
        const matches = (p) => Object.entries(spec.where).every(([key, want]) =>
          Array.isArray(want) ? want.includes(p[key]) : p[key] === want);
        data = { ...data, panels: data.panels.filter(matches) };
      }
      if (spec.ylabel) data = { ...data, ylabel: spec.ylabel };
      if (data.panels && !data.panels.length) throw new Error("no panels match chart.where");
      if (spec.test) data = { ...data, panels: (data.panels || [data]).map((p) => applyTest(p, spec.test)) };
      const W = Math.max(220, h.clientWidth);
      const H = Math.round(W / (spec.aspect || (data.panels?.length > 4 ? 2.0 : 1.5)));
      const c = document.createElement("canvas");
      const dpr = Math.min(devicePixelRatio || 1, 2);
      c.width = W * dpr; c.height = H * dpr;
      c.style.width = W + "px"; c.style.height = H + "px";
      const g = c.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      h.replaceChildren(c);
      /* Redrawn on demand rather than every frame — a chart is static until something changes.
       * `step` comes from the deck, so a figure can be walked through a panel at a time, and a
       * newly arrived panel eases up instead of snapping in. */
      h.chartSteps = (await import("./charts.js")).chartSteps(data, spec.reveal);
      let raf = 0;
      const paint = (step, ease) => {
        g.clearRect(0, 0, W, H);
        drawChart(g, W, H, data, { k: W / 640, kind: spec.kind, points: spec.points,
                                   reveal: spec.reveal, focus: spec.focus,
                                   gap: spec.gap ?? undefined, cols: spec.cols ?? undefined,
                                   lines: spec.lines || undefined,
                                   step, ease });
      };
      h.repaint = (step = 0, nav = {}) => {
        cancelAnimationFrame(raf);
        if (!spec.reveal && !spec.focus) return paint(step, 1);
        if (nav.settled) return paint(step, 1);
        // Nobody is watching a hidden tab ease anything, and rAF does not tick there — so the
        // easing loop would never run and the figure would stay blank. Draw it arrived.
        if (document.hidden) return paint(step, 1);
        const t0 = performance.now();
        const tick = (ms) => {
          const u = Math.min(1, (ms - t0) / 380);
          paint(step, 1 - Math.pow(1 - u, 3));
          if (u < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      };
      h.repaint(0);
      /* Charts load their data asynchronously, so the deck has already counted this slide's
       * clicks by the time one exists. Say so, and let it count again — otherwise a figure
       * that wants seven steps silently gets none. */
      h.dispatchEvent(new CustomEvent("block-ready", { bubbles: true }));
    }).catch((e) => h.replaceChildren(el("div", "trace-error", `chart: ${e.message}`)));
  });
  root.querySelectorAll("[data-trace]").forEach((h) => {
    if (!h.dataset.trace) return;
    if (h.dataset.mounted === "1" && Math.abs(h.clientWidth - +h.dataset.mountedAt) < 2) return;
    h.dataset.mounted = "1";
    h.dataset.mountedAt = h.clientWidth;
    // async, and imported lazily so a deck with no traced images never loads the tracer
    import("./trace.js").then(({ mountTrace }) =>
      mountTrace(h, h.dataset.trace, JSON.parse(h.dataset.traceOpts || "{}"))
    ).catch((e) => {
      // say what went wrong on the slide itself; a blank rectangle in front of a room is worse
      h.replaceChildren(el("div", "trace-error", `image: ${e.message}`));
    });
  });
}

export { inline };
