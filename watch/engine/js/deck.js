/* The runtime.
 *
 * Four registries and one loop. A deck picks a STYLE, every slide picks a WIDTH, a slide is
 * a list of blocks (blocks.js), and the move between two slides picks an ARRIVAL (field.js).
 * None of the four knows about the others, which is the whole point: a new transition is a
 * function, a new block is a registry entry, a new template is a list, and none of them
 * needs the runtime to be touched.
 *
 * A TEMPLATE is not a layout either — it is a preset that expands to blocks. Every template
 * below can be pulled apart in the builder and still be a legal slide afterwards.
 */
import { Field, ACCENTS, BACKDROPS, ARRIVALS } from "./field.js";
import { Progress } from "./progress.js";
import { BLOCKS, renderBlocks, fitMathIn, mountScenesIn, setCitations } from "./blocks.js";
import { applyLayout, applyPlacement, prepareSteps, revealSteps, applyMoves, ENTRANCES } from "./layout.js";
import { drawAnnotations } from "./annotate.js";
import { loadBib, numberDeck, sourcesBubble } from "./cite.js";
import { renderMediaAside } from "./media-aside.js";

/* A style is a set of defaults, not a theme: type scale, air, and how loud the field runs
 * behind the content. Any single slide can override any of it. */
export const STYLES = {
  keynote:   { label: "keynote",   field: 1.00, align: "center", width: "narrow",
               note: "a room and a microphone — the slide captions you" },
  seminar:   { label: "seminar",   field: 0.34, align: "left",   width: "regular", heads: true,
               note: "equations and figures first; running heads on" },
  editorial: { label: "editorial", field: 0.50, align: "left",   width: "wide",
               note: "serif, columns — decks that get read afterwards" },
  board:     { label: "board",     field: 0.45, align: "left",   width: "wide",
               note: "numbers, cards and tables" },
};

export const WIDTHS = { narrow: "46ch", regular: "62ch", wide: "78ch", bleed: "100%" };

/* System stacks only, deliberately. A vendored webfont would be another megabyte to carry
 * and another thing to fail to load in a conference room, and every one of these is already
 * on the machine — the deck picks a voice without shipping anything. */
export const FONTS = {
  system:    { label: "system",    stack: `-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif` },
  grotesk:   { label: "grotesk",   stack: `"Helvetica Neue",Helvetica,Arial,sans-serif` },
  geometric: { label: "geometric", stack: `Futura,"Avenir Next",Avenir,"Century Gothic",sans-serif` },
  humanist:  { label: "humanist",  stack: `Optima,"Avenir Next",Avenir,"Gill Sans",sans-serif` },
  serif:     { label: "serif",     stack: `"Iowan Old Style",Palatino,"Palatino Linotype",Georgia,serif` },
  didone:    { label: "didone",    stack: `Didot,"Bodoni 72","Playfair Display",Georgia,serif` },
  mono:      { label: "mono",      stack: `ui-monospace,"SF Mono",Menlo,Consolas,monospace` },
};

/* What sits between the field and the content.
 *
 * The field is a texture with light in it, and text on top of light is text you have to work
 * to read — which is fine for a phone held at arm's length and not fine for the back of a
 * lecture theatre. A plate holds the animation down under whatever needs reading, without
 * putting it behind an opaque rectangle and losing the thing entirely. */
export const PLATES = {
  scrim: { label: "scrim", note: "a soft, edgeless pool of dark — nothing to see, just easier to read" },
  card:  { label: "card",  note: "a defined panel with a hairline; for figures and tables" },
  blur:  { label: "blur",  note: "the field stays visible but goes out of focus behind the text" },
  none:  { label: "none",  note: "content straight on the field, as it was" },
};

/**
 * Every page turn the engine knows.
 *
 * The field's arrivals plus the two it handles itself: `cut` (no turn at all) and `fade` (the
 * pages simply cross). Those two were spelled out by hand wherever a list of transitions was
 * needed — twice in the builder, once in the settings panel — which is exactly the kind of
 * list that goes stale the day a transition is added. This is the authority; everything else
 * reads it.
 */
export const TRANSITIONS = [...Object.keys(ARRIVALS), "fade"];

/** Named starting arrangements. `fill` maps the shorthand a .spiral file writes onto blocks. */
export const TEMPLATES = {
  "cold-open":     (d) => [B("eyebrow", d.eyebrow), B("title", d.title), B("subtitle", d.subtitle)],
  "section-head":  (d) => [B("eyebrow", d.eyebrow), B("heading", d.heading), B("rule"), B("body", d.body)],
  "statement":     (d) => [B("title", d.title)],
  "bullets":       (d) => [B("heading", d.heading), { type: "bullets", items: d.items || [], step: d.step }],
  "math-centred":  (d) => [B("eyebrow", d.eyebrow), { type: "math", tex: d.tex, display: true }, B("body", d.body)],
  "math-and-text": (d) => [B("heading", d.heading),
                           { type: "columns", ratio: d.ratio || "1 1",
                             of: [[{ type: "math", tex: d.tex, display: true }], [B("body", d.body)]] }],
  "image-caption": (d) => [{ type: "image", src: d.src, fit: "contain" }, B("body", d.caption)],
  "image-bleed":   (d) => [{ type: "image", src: d.src, fit: "cover", bleed: true }, B("title", d.title)],
  "image-and-text": (d) => [{ type: "columns", ratio: d.ratio || "1 1",
                             of: [[{ type: "image", src: d.src, fit: "contain" }],
                                  [B("heading", d.heading), B("body", d.body)]] }],
  "code":          (d) => [B("eyebrow", d.eyebrow), { type: "code", code: d.code, lang: d.lang }],
  "scene":         (d) => [{ type: "scene", scene: d.scene, args: d.args }, B("body", d.body)],
  "three-up":      (d) => [B("heading", d.heading), { type: "columns", ratio: "1 1 1", of: d.of || [[], [], []] }],
  "quote":         (d) => [{ type: "quote", text: d.text, cite: d.cite }],
  "closing":       (d) => [B("eyebrow", d.eyebrow), B("title", d.title), { type: "code", code: d.code }],
  // structure — the pages that say where you are rather than what the argument is
  "chapter":       (d) => [{ type: "chapnum", text: d.number }, B("heading", d.heading), B("eyebrow", d.eyebrow)],
  "checkpoint":    (d) => [B("eyebrow", d.eyebrow || "so far"), B("heading", d.heading || "Checkpoint"),
                           { type: "checklist", items: d.items || [] }],
  "agenda":        (d) => [B("eyebrow", d.eyebrow || "contents"), { type: "agenda", items: d.items, at: d.at }],
  "breather":      (d) => [{ type: "scene", scene: d.scene, args: d.args }],
  "table":         (d) => [B("heading", d.heading), { type: "table", head: d.head, rows: d.rows }],
};

function B(type, text) { return text == null ? { type } : { type, text }; }

/** Expand whatever a .spiral file wrote into a plain block list. */
export function slideBlocks(slide) {
  if (slide.blocks) return slide.blocks;
  const t = TEMPLATES[slide.template];
  return t ? t(slide).filter((b) => b && (b.type !== "body" || b.text)) : [];
}

export class Deck {
  constructor(root, deck) {
    this.root = root;
    this.deck = normalise(deck);
    this.i = 0;
    this.step = 0;

    this.stage = root.querySelector("#stage");
    // a block that finishes loading after the page was revealed asks for a recount
    this.stage.addEventListener("block-ready", () => {
      const page = this.stage.querySelector(".slide.incoming") || this.stage.lastElementChild;
      if (page) this.reveal(page, false);
    });
    // A native scene may finish a presenter-visible process on its own (for example, the
    // seventieth participant clearing a scanner).  Advance exactly one reveal, but only when
    // the request still belongs to the currently visible state.
    this.stage.addEventListener("scene-auto-advance", (e) => {
      if (this.editing || this.preview) return;
      const requested = Number(e.detail?.step);
      if (!Number.isFinite(requested) || requested !== this.step) return;
      this.next();
    });
    this.field = new Field(root.querySelector("#field"));
    this.bar = new Progress(root.querySelector("#bar canvas"), {
      style: this.deck.progress?.style ?? "fieldbar",
      side: this.deck.progress?.side ?? "bottom",
      rows: this.deck.progress?.rows ?? 2,
    });
    this.applyTheme();
    this.buildChapterMenu();
    /* Citations are numbered once, over the WHOLE deck, in reading order — so a paper keeps
     * one number everywhere it appears. Per-slide numbering would make the same source [1]
     * here and [3] later, which is the one thing a reader cannot forgive. */
    this.bib = new Map();
    this.citeNumbers = new Map();
    if (this.deck.bibliography) {
      loadBib(this.deck.bibliography).then((bib) => {
        this.bib = bib;
        this.citeNumbers = numberDeck(this.deck, bib);
        setCitations(this.citeNumbers);
        this.show(this.i, { instant: true, keepStep: this.step, settled: true, syncUrl: false });
      });
    }
    this.field.start();

    const tick = () => { this.bar.frame(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);

    addEventListener("keydown", (e) => this.key(e));
    // A resized column is a different column, and fitMath only ever shrinks — so the slide is
    // rebuilt rather than re-fitted, otherwise it would ratchet smaller on every resize. The
    // step is carried across: plugging into a projector fires a resize, and a presenter who
    // loses four reveals at that moment is a presenter standing in front of a room clicking.
    addEventListener("resize", () => {
      const step = this.step;
      this.bar.resize();
      this.show(this.i, { instant: true, keepStep: step, settled: true, syncUrl: false });
    });
    // The fragment is the rehearsal address.  It deliberately leaves the deck query intact,
    // so a copied URL opens the same .spiral file at the same slide and reveal state.
    this._routeHandler = () => {
      const route = this.routeFromLocation();
      if (route.index === this.i && route.step === this.step) return;
      this.show(route.index, {
        instant: true, keepStep: route.step, settled: true, syncUrl: false,
      });
    };
    addEventListener("popstate", this._routeHandler);
    addEventListener("hashchange", this._routeHandler);
    /* Clicking the page advances; clicking the chrome must not.
     *
     * `closest("#panel")` on the target is not enough, and the way it fails is worth writing
     * down: picking a swatch rebuilds the option list, so the button that was clicked is out
     * of the DOM before the event reaches this handler — and a detached node has no ancestors,
     * so closest() returns null and the deck advances a slide every time a setting is changed.
     * Stopping the event at the chrome itself is immune to that, because it runs first. */
    for (const sel of ["#panel", "#bar", "#chapters"]) {
      root.querySelector(sel)?.addEventListener("click", (e) => e.stopPropagation());
    }
    root.addEventListener("click", () => { if (!this.editing) this.next(); });
    const route = this.routeFromLocation();
    this.show(route.index, {
      instant: true, keepStep: route.step, settled: true, replaceUrl: true,
    });
  }

  applyTheme() {
    const d = document.documentElement;
    const a = ACCENTS.find((x) => x.key === this.deck.accent) || ACCENTS[0];
    const b = BACKDROPS.find((x) => x.key === this.deck.backdrop) || BACKDROPS[0];
    d.style.setProperty("--accent", a.base);
    d.style.setProperty("--accent-lite", a.lite);
    for (const [k, v] of Object.entries({ page: b.page, s1: b.s1, s2: b.s2, hair: b.hair,
                                          hi: b.hi, mid: b.mid, lo: b.lo })) {
      d.style.setProperty(`--${k}`, v);
    }
    d.style.setProperty("--sans", (FONTS[this.deck.font] || FONTS.system).stack);
    // one number that scales the entire composition — type, boxes, figures and all
    d.style.setProperty("--zoom", String(this.deck.zoom ?? 1));
    const st = STYLES[this.deck.style] || STYLES.keynote;
    this.root.dataset.style = this.deck.style;
    this.root.dataset.plate = this.deck.plate || "scrim";
    this.field.strength = st.field;
    this.root.classList.toggle("heads", !!st.heads);
    this.root.dataset.bar = this.bar.side;
    this.root.style.setProperty("--bar-thickness", this.bar.thickness() + "px");
    this.bar.resize();
  }

  /** Build one slide's DOM. Not attached — the transition decides when it lands. */
  build(i) {
    const s = this.deck.slides[i];
    const styleKey = s.style || this.deck.style;
    const st = STYLES[styleKey] || STYLES.keynote;
    const page = document.createElement("section");
    page.className = "slide";
    page.dataset.slideId = s._slug;
    page.dataset.style = styleKey;
    page.dataset.align = s.align || st.align;
    if (s.backup) page.dataset.backup = "true";
    if (s.plate) page.dataset.plate = s.plate;      // per-slide override of the deck's default
    if (s.zoom) page.style.setProperty("--zoom", String(s.zoom));
    page.style.setProperty("--measure", WIDTHS[s.width || st.width] || WIDTHS.regular);
    if (s.width === "bleed") page.classList.add("bleed");
    // the agenda block needs to know which chapter it is standing in
    const blocks = slideBlocks(s).map((b) =>
      b.type === "agenda" ? { ...b, items: b.items || this.deck.chapters.map((c) => c.name),
                              at: b.at ?? this.chapterOf(i) } : b);
    // A full-bleed image is a property of the block, but it necessarily owns the page too.
    if (blocks.some((b) => b.bleed)) page.classList.add("bleed", "image-bleed-slide");
    const inner = renderBlocks({ blocks }, page);
    // tag every block with its index before anything is moved, so moves and annotations have
    // something to hold on to later
    const rendered = [...inner.children];
    rendered.forEach((n, k) => {
      const b = blocks[k];
      if (!b) return;
      n.dataset.block = k;
      if (b.enter) n.dataset.enter = b.enter;
      if (b.selfAlign) n.style.alignSelf = b.selfAlign;
    });
    // then build the boxes and move each block INSIDE the one it named
    const cells = applyLayout(inner, s);
    if (cells) {
      rendered.forEach((n, k) => {
        const cell = cells.get(blocks[k]?.at) || cells.values().next().value;
        cell.appendChild(n);
        n.dataset.gridArea = cell.dataset.cell;
        // after the move, so the box can say which of its edges a bleed may overstep
        if (blocks[k]) applyPlacement(n, blocks[k], cell);
      });
    } else {
      rendered.forEach((n, k) => { if (blocks[k]) applyPlacement(n, blocks[k], null); });
    }
    // the bubble belongs to the PAGE, not to its content: it cannot be dragged into a box
    // or deleted by accident, and it lists only what this slide actually cites
    const bubble = sourcesBubble(s, this.bib || new Map(), this.citeNumbers || new Map());
    if (bubble) page.appendChild(bubble);
    if (s.mediaAside?.src) page.appendChild(renderMediaAside(s.mediaAside));
    page._blocks = blocks;
    page._cells = cells;
    page._marks = s.annotate || [];
    if (st.heads) {
      const h = document.createElement("div");
      h.className = "runhead";
      const ch = this.deck.chapters[this.chapterOf(i)];
      const sub = this.subchapterOf(i);
      const place = [ch?.name, sub?.name].filter(Boolean).join(" · ");
      h.innerHTML = `<span>${place}</span><span>${i + 1} / ${this.deck.slides.length}</span>`;
      page.appendChild(h);
    }
    return page;
  }

  chapterOf(i) {
    let c = 0;
    this.deck.chapters.forEach((ch, k) => { if (ch.from <= i) c = k; });
    return c;
  }

  subchapterOf(i) {
    const chapter = this.deck.chapters[this.chapterOf(i)];
    let sub = null;
    for (const candidate of chapter?.subchapters || []) {
      if (candidate.from <= i) sub = candidate;
    }
    return sub;
  }

  routeFromLocation() {
    const raw = decodeURIComponent(location.hash.replace(/^#/, ""));
    if (!raw) return { index: 0, step: 0 };
    const [slug, rawStep] = raw.split("/");
    let index = this.deck.slides.findIndex((slide) => slide._slug === slug);
    if (index < 0) {
      const numbered = /^slide-(\d+)$/.exec(slug);
      index = numbered ? Number(numbered[1]) - 1 : 0;
    }
    return {
      index: Math.max(0, Math.min(this.deck.slides.length - 1, index)),
      step: Math.max(0, Number.parseInt(rawStep || "0", 10) || 0),
    };
  }

  syncLocation({ replace = false } = {}) {
    const slide = this.deck.slides[this.i];
    if (!slide) return;
    const fragment = `#${encodeURIComponent(slide._slug)}${this.step ? `/${this.step}` : ""}`;
    if (location.hash === fragment) return;
    const url = `${location.pathname}${location.search}${fragment}`;
    history[replace ? "replaceState" : "pushState"]({ spiral: true }, "", url);
  }

  /** A stable, read-only description of the presenter-visible deck state. */
  currentState() {
    const slide = this.deck.slides[this.i];
    const slug = slide?._slug || `slide-${this.i + 1}`;
    const step = Number.isFinite(this.step) ? Math.max(0, this.step) : 0;
    const totalSteps = Number.isFinite(this.steps) ? Math.max(0, this.steps) : 0;
    return { slug, index: this.i, step, totalSteps, route: `${slug}/${step}` };
  }

  /** Notify integrations once per authoritative state, not once per repaint/rebuild. */
  emitStateChange() {
    const state = this.currentState();
    const key = `${state.index}:${state.route}:${state.totalSteps}`;
    if (key === this._emittedStateKey) return;
    this._emittedStateKey = key;
    this.root.dispatchEvent(new CustomEvent("spiral:statechange", {
      detail: state,
      bubbles: true,
    }));
  }

  /**
   * Abandon a transition that is still running.
   *
   * A front takes over a second, and a presenter clicking twice quickly should get the second
   * slide, not be ignored until the wave finishes. Dropping the guard is not enough on its own:
   * the masks and the outgoing page belong to the abandoned wipe and have to go with it, or
   * the deck accumulates half-erased pages behind the live one.
   */
  cancelTransition() {
    // Invalidate both field wipes and timer-based fades before their async tail can commit.
    this._token = (this._token || 0) + 1;
    this.field.onFrame = null;
    this.field.frontV = -1;
    if (this.field._done) { this.field._done(); this.field._done = null; }
    for (const p of this.stage.querySelectorAll(".slide")) {
      p.style.maskImage = p.style.webkitMaskImage = "";
      p.style.opacity = "";
      p.classList.remove("incoming", "outgoing", "fading", "in");
    }
    // the newest page is the one that was arriving; it is the one to keep
    const keep = this.stage.lastElementChild;
    if (keep) { this.stage.replaceChildren(keep); }
    this.busy = false;
    // the abandoned wipe never got to reveal its page, so finish that here — otherwise the
    // click that interrupted it lands on a slide whose steps were never counted
    if (keep) this.reveal(keep, false, keep._sceneNav);
  }

  async show(i, { instant = false, back = false, keepStep = 0, end = false, settled = false,
                  syncUrl = true, replaceUrl = false } = {}) {
    if (this.busy) this.cancelTransition();
    const previousRoute = this.currentState().route;
    const previousI = this.i;
    i = Math.max(0, Math.min(this.deck.slides.length - 1, i));
    const s = this.deck.slides[i];
    const st = STYLES[s.style || this.deck.style] || STYLES.keynote;
    this.field.strength = st.field;
    const from = this.stage.firstElementChild;
    const page = this.build(i);
    page._startAtEnd = !!end;
    // A previous-slide end state is a snapshot, not the first frame of its last entrance.
    const sceneNav = end ? { settled: true, backward: !!back, directEnd: true }
      : settled ? { settled: true } : undefined;
    page._sceneNav = sceneNav;
    this.i = i;
    this.step = keepStep;
    const upcoming = this.currentState();
    if (upcoming.route !== previousRoute) {
      // State narration and other presenter aids must be able to stop old media as soon as a
      // page turn begins, without treating the not-yet-measured step count as authoritative.
      this.root.dispatchEvent(new CustomEvent("spiral:statewillchange", {
        detail: upcoming,
        bubbles: true,
      }));
    }
    this.syncBar();
    if (syncUrl) this.syncLocation({ replace: replaceUrl || previousI === i });

    const kind = s.transition || this.deck.transition || "wipe";
    const isChapter = s.template === "chapter";
    const ms = instant ? 0 : (s.transitionMs || (isChapter ? 2100 : 1250));

    if (instant || !from || kind === "cut") {
      this.stage.replaceChildren(page);
      this.reveal(page, false, sceneNav);
      return;
    }

    /* Not every page turn should be an event. A deck that wipes thirty times is a deck about
     * its own transition, so `fade` is a first-class choice and costs the field nothing —
     * no arrival map, no crest, just the two pages crossing. */
    if (kind === "fade") {
      this.busy = true;
      const token = (this._token = (this._token || 0) + 1);
      // Let an individual page choose a genuinely slow cross-fade.  Previously the timer
      // honoured `transitionMs` but the CSS was fixed at 460 ms; short evidence-page timers
      // could therefore remove the outgoing graph before the visual fade had completed.
      const fadeMs = s.transitionMs || 460;
      page.style.setProperty("--slide-fade-duration", `${fadeMs}ms`);
      if (from) from.style.setProperty("--slide-fade-duration", `${fadeMs}ms`);

      page.classList.add("incoming", "fading");
      // Start from an explicit composited opacity.  On large evidence SVGs Chromium could
      // coalesce the class changes around the async data load and paint a hard replacement
      // even though the CSS transition existed.  The inline start plus layout flush below
      // guarantees that old and new circuits overlap for the authored fade duration.
      page.style.opacity = "0";
      this.stage.appendChild(page);
      fitMathIn(page); mountScenesIn(page);
      if (end) this.reveal(page, false, sceneNav);
      const pendingNetworks = [...page.querySelectorAll('.evidence-network:not([data-ready="1"])')];
      if (pendingNetworks.length) {
        await Promise.race([
          new Promise((resolve) => {
            const ready = () => {
              if (pendingNetworks.every((network) => network.dataset.ready === "1")) resolve();
            };
            page.addEventListener("block-ready", ready);
            ready();
          }),
          new Promise((resolve) => setTimeout(resolve, 1400)),
        ]);
        if (token !== this._token) return;
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (token !== this._token) return;
      void page.offsetWidth;
      requestAnimationFrame(() => {
        page.classList.add("in");
        page.style.opacity = "1";
        if (from) from.style.opacity = "0";
      });
      await new Promise((r) => setTimeout(r, fadeMs));
      if (token !== this._token) return;
      page.classList.remove("incoming", "fading", "in");
      page.style.opacity = "";
      this.stage.replaceChildren(page);
      this.busy = false;
      this.reveal(page, false, sceneNav);
      return;
    }

    this.busy = true;
    const token = (this._token = (this._token || 0) + 1);
    page.classList.add("incoming");
    this.stage.appendChild(page);
    fitMathIn(page); mountScenesIn(page);   // on screen for the whole wipe, not just after
    if (end) this.reveal(page, false, sceneNav);

    // the incoming page is masked in BY THE SAME numbers that drive the crest, which is
    // what makes the wave expose the next page instead of just repainting the background
    const origin = isChapter ? { originX: 0.12, originY: 0.88 }        // the swell's own corner
                             : (back ? { originX: 0.5, originY: 0.5 } : originFor(kind));
    /* The front does not fade the old page out underneath the new one — it REMOVES it.
     *
     * Fading meant both pages were fully laid out and partly visible at once, so mid-wipe the
     * room saw one paragraph printed across another. Masking the outgoing page with the exact
     * complement of the incoming one means a dot is showing either the old slide or the new
     * one and never both: the wave uncovers what is behind it, which is what it looks like it
     * is doing. */
    if (from) from.classList.add("outgoing");
    this.field.onFrame = (f) => {
      if (token !== this._token) return;      // a newer transition owns the field now
      const m = this.field.maskPair(f);
      page.style.webkitMaskImage = page.style.maskImage = `url(${m.in})`;
      if (from) from.style.webkitMaskImage = from.style.maskImage = `url(${m.out})`;
    };
    await this.field.run({ kind, ms, ...origin });
    if (token !== this._token) return;        // abandoned; the newer one will finish up
    this.field.onFrame = null;
    page.style.maskImage = page.style.webkitMaskImage = "";
    if (from) { from.classList.remove("outgoing"); from.style.maskImage = from.style.webkitMaskImage = ""; }
    page.classList.remove("incoming");
    this.stage.replaceChildren(page);
    this.busy = false;
    this.reveal(page, !end, sceneNav);
  }

  /**
   * Light one term of a walkable equation and let the rest recede.
   *
   * Called on every step and on a direct click, so the two routes cannot disagree about what
   * is currently being discussed.
   */
  lightTerm(eq, id) {
    const ids = (eq.dataset.walk || "").split(",").filter(Boolean);
    eq.classList.toggle("walking", !!id);
    for (const t of ids) {
      const n = eq.querySelector(`#${CSS.escape(t)}`);
      if (n) n.classList.toggle("lit", t === id);
    }
    eq.dataset.lit = id || "";
  }

  /** Blocks marked `step` wait for a click. Everything else is there on arrival. */
  reveal(page, animate = true, sceneNav = undefined) {
    fitMathIn(page);
    mountScenesIn(page);
    const steps = page._steps || (page._steps = prepareSteps(page));
    revealSteps(steps, this.step, animate);
    applyMoves(page, page._blocks || [], this.step, page._cells, animate);
    // An annotation can be a step of its own — "click, and now the brace appears" — so the
    // slide runs until the last of BOTH has been shown, not just the last hidden block.
    /* A walkable equation asks for one click per term it wants to visit. */
    let walkWants = 0;
    page.querySelectorAll(".walkable").forEach((eq) => {
      const ids = (eq.dataset.walk || "").split(",").filter(Boolean);
      walkWants = Math.max(walkWants, ids.length);
      this.lightTerm(eq, this.step > 0 ? ids[Math.min(ids.length - 1, this.step - 1)] : null);
      if (!eq.dataset.wired) {
        eq.dataset.wired = "1";
        for (const t of ids) {
          const n = eq.querySelector(`#${CSS.escape(t)}`);
          if (!n) continue;
          n.classList.add("term");
          n.addEventListener("click", (e) => {
            // a question from the floor does not arrive in the order you planned
            e.stopPropagation();
            this.lightTerm(eq, eq.dataset.lit === t ? null : t);
          });
        }
      }
    });
    const lastMark = (page._marks || []).reduce((m, a) => Math.max(m, a.at ?? 0), 0);
    // a chart that reveals a panel per click asks for those clicks too
    let chartWants = 0;
    page.querySelectorAll("[data-chart]").forEach((h) => {
      chartWants = Math.max(chartWants, h.chartSteps || 0);
      h.repaint?.(this.step, sceneNav);
    });
    // Native scenes may also be a click-driven explanation: the same step can illuminate a
    // cortical region while the matching chart panel arrives, so scene and chart counts are
    // combined by maximum rather than added serially.
    let sceneWants = 0;
    page.querySelectorAll(".scene-holder").forEach((h) => {
      const wants = h.sceneSteps || 0;
      sceneWants = Math.max(sceneWants, wants);
      // A finite explanatory figure that has no scene steps must not restart whenever an
      // unrelated equation or text block is revealed on the same slide. Clamp the shared
      // deck step to the number of states the scene actually declared.
      h.repaint?.(Math.min(this.step, wants), sceneNav);
    });
    this.steps = Math.max(steps.revealCount ?? steps.length, lastMark, chartWants, sceneWants, walkWants);
    if (this.step > this.steps) {
      this.step = this.steps;
      this.syncBar();
      this.syncLocation({ replace: true });
    }
    // Inert state metadata gives the visual-QA recorder a stable, read-only contract without
    // reaching into the Deck instance or changing presentation behaviour.
    this.root.dataset.qaSlide = String(this.i + 1);
    this.root.dataset.qaStep = String(this.step);
    this.root.dataset.qaSteps = String(this.steps);
    // Going backwards from a slide's first state lands on the final state of the previous
    // slide. Native scenes and charts only know their reveal counts after mounting, so an
    // end-state request is resolved here, once that count is authoritative.
    if (page._startAtEnd) {
      page._startAtEnd = false;
      if (this.step !== this.steps) {
        this.step = this.steps;
        this.syncBar();
        this.reveal(page, false, sceneNav);
        return;
      }
    }
    // annotations are measured, not remembered, so they follow anything that just moved
    const paint = () => drawAnnotations(page, page._marks, this.step);
    paint();
    this.emitStateChange();
    this.root.dispatchEvent(new CustomEvent("spiral:render", { detail: this.currentState() }));
    setTimeout(paint, 660);        // again once a FLIP has landed
  }

  next() {
    // A presenter clicking twice quickly means "two slides on", not "ignore me for a second".
    if (this.busy) this.cancelTransition();
    if (this.step < (this.steps || 0)) {
      this.step++;
      this.reveal(this.stage.firstElementChild);
      this.syncBar();
      this.syncLocation({ replace: true });
      return;
    }
    if (this.i < this.deck.slides.length - 1) this.show(this.i + 1);
  }

  prev() {
    if (this.busy) this.cancelTransition();
    if (this.step > 0) {
      this.step--;
      this.reveal(this.stage.firstElementChild, false, { settled: true, backward: true });
      this.syncBar();
      this.syncLocation({ replace: true });
      return;
    }
    if (this.i > 0) this.show(this.i - 1, { back: true, end: true });
  }

  syncBar() {
    const slides = this.deck.slides;
    const main = slides.flatMap((slide, i) => slide.backup ? [] : [i]);
    const n = main.length;
    const backup = !!slides[this.i]?.backup;
    const index = Math.max(0, backup ? n - 1 : main.indexOf(this.i));
    // Reveals advance within a main slide; entering its final page completes the talk.
    const within = this.steps ? this.step / (this.steps + 1) : 0;
    const chapters = this.deck.chapters
      .filter((chapter) => main.includes(chapter.from))
      .map((chapter) => ({ name: chapter.name, at: main.indexOf(chapter.from) / Math.max(1, n - 1) }))
      // The final boundary is appended below; a chapter there has no progress span.
      .filter((chapter) => chapter.at < 1);
    this.bar.set(n < 2 || backup ? 1 : Math.min(1, (index + within) / (n - 1)), {
      index, total: Math.max(1, n),
      bounds: chapters.length ? chapters.map((chapter) => chapter.at).concat([1]) : [0, 1],
      names: chapters.map((chapter) => chapter.name),
    });
  }

  /** Jump to a chapter by its number, 1-based. */
  gotoChapter(n) {
    const label = String(n).padStart(2, "0");
    const ch = this.deck.chapters.find((candidate) => candidate.number === label)
      || this.deck.chapters[n - 1];
    if (!ch) return false;
    this.show(ch.from);
    return true;
  }

  key(e) {
    if (this.editing || this.preview || e.defaultPrevented || e.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    const k = e.key;
    /* Typing a number jumps to that chapter — but 1 and 11 start the same way, so a digit
     * waits briefly for a second one before committing. That is the difference between a deck
     * with nine chapters and a deck with nineteen, and it should not need a different key. */
    if (/^[0-9]$/.test(k)) {
      e.preventDefault();
      this._digits = (this._digits || "") + k;
      clearTimeout(this._digitTimer);
      this.flash(`chapter ${this._digits}`);
      const commit = () => {
        const n = parseInt(this._digits, 10);
        this._digits = "";
        if (!this.gotoChapter(n)) this.flash(`no chapter ${n}`);
      };
      // a further digit could not name a chapter that exists, so commit at once
      if (this.deck.chapters.length < parseInt(this._digits + "0", 10)) commit();
      else this._digitTimer = setTimeout(commit, 550);
      return;
    }
    // Every ordinary arrow walks the same chronological state sequence. Shift+vertical keeps
    // the useful rehearsal shortcut for jumping directly between slide starts.
    if (e.shiftKey && k === "ArrowDown") { e.preventDefault(); this.show(this.i + 1); }
    else if (e.shiftKey && k === "ArrowUp") { e.preventDefault(); this.show(this.i - 1, { back: true }); }
    else if (k === "ArrowRight" || k === "ArrowDown" || k === " " || k === "PageDown" || k === "Enter") { e.preventDefault(); this.next(); }
    else if (k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp" || k === "Backspace") { e.preventDefault(); this.prev(); }
    else if (k === "Home") this.show(0, { instant: true });
    else if (k === "End") this.show(this.deck.slides.length - 1, { instant: true, end: true });
    else if (k === "s" || k === "S") this.root.classList.toggle("panel-open");
    else if (k === "c" || k === "C") this.root.classList.toggle("chapters-open");
    else if (k === "f" || k === "F") document.documentElement.requestFullscreen?.();
    else if (k === "Escape") this.root.classList.remove("panel-open", "chapters-open");
  }

  /** A brief word in the corner — which chapter is being typed, and whether it exists. */
  flash(text) {
    let n = this.root.querySelector("#flash");
    if (!n) { n = document.createElement("div"); n.id = "flash"; this.root.appendChild(n); }
    n.textContent = text;
    n.classList.add("on");
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => n.classList.remove("on"), 900);
  }

  /** The chapter list, for clicking rather than typing. */
  buildChapterMenu() {
    const menu = this.root.querySelector("#chapters");
    if (!menu) return;
    menu.replaceChildren();
    this.deck.chapters.forEach((c, i) => {
      const group = document.createElement("section");
      group.className = "chapter-group";
      const b = document.createElement("button");
      b.className = "chapter-link";
      const number = document.createElement("span");
      number.className = "n";
      number.textContent = c.number || (i === 0 && c.from === 0 ? "00" : String(i + 1).padStart(2, "0"));
      const name = document.createElement("span");
      name.textContent = c.name || "—";
      b.append(number, name);
      b.onclick = () => { this.root.classList.remove("chapters-open"); this.show(c.from); };
      group.appendChild(b);
      for (const subchapter of c.subchapters || []) {
        const sub = document.createElement("button");
        sub.className = "subchapter-link";
        const marker = document.createElement("span");
        marker.className = "n";
        marker.textContent = "·";
        const subName = document.createElement("span");
        subName.textContent = subchapter.name;
        sub.append(marker, subName);
        sub.onclick = () => {
          this.root.classList.remove("chapters-open");
          this.show(subchapter.from);
        };
        group.appendChild(sub);
      }
      menu.appendChild(group);
    });
  }

  set(key, value) {
    this.deck[key] = value;
    this.applyTheme();
    if (key === "style") this.show(this.i, { instant: true });
  }
}

/* wipe comes from the lower left, matching the swell gate in the field; the rest have their
 * own natural origin */
function originFor(kind) {
  if (kind === "push") return { originX: 0, originY: 0.5 };
  if (kind === "iris") return { originX: 0.5, originY: 0.5 };
  return { originX: 0.16, originY: 0.84 };
}

function normalise(d) {
  const deck = { style: "keynote", accent: "clay", backdrop: "warm", transition: "wipe",
                 font: "system", plate: "scrim", zoom: 1,
                 progress: { style: "fieldbar", side: "bottom", rows: 2 }, ...d };
  // `omit` keeps a superseded slide in the editable source without presenting or counting it.
  // This is useful while a defence narrative is being cut down: the removed material remains
  // recoverable, but URLs, chapter indices and the progress rail describe only the live talk.
  deck.slides = (deck.slides || [])
    .map((slide, sourceIndex) => ({ slide, sourceIndex }))
    .filter(({ slide }) => !slide?.omit)
    .sort((a, b) => {
      const ao = Number.isFinite(Number(a.slide.order)) ? Number(a.slide.order) : a.sourceIndex;
      const bo = Number.isFinite(Number(b.slide.order)) ? Number(b.slide.order) : b.sourceIndex;
      return ao - bo || a.sourceIndex - b.sourceIndex;
    })
    .map(({ slide }) => slide);
  // Stable, human-readable fragments make every slide directly addressable while editing.
  // Duplicate headings are legal; only the repeated occurrence receives a numeric suffix.
  const usedSlugs = new Map();
  deck.slides.forEach((slide, i) => {
    const blocks = slideBlocks(slide);
    const namedBlock = blocks.find((block) =>
      typeof block?.text === "string" && ["title", "heading", "eyebrow"].includes(block.type));
    const sceneBlock = blocks.find((block) => block?.scene);
    const seed = slide.id || slide.heading || slide.title || namedBlock?.text || sceneBlock?.scene || `slide-${i + 1}`;
    const base = slugify(seed) || `slide-${i + 1}`;
    const count = (usedSlugs.get(base) || 0) + 1;
    usedSlugs.set(base, count);
    slide._slug = count === 1 ? base : `${base}-${count}`;
  });

  // chapters are derived from the chapter slides themselves, so the file never repeats itself
  deck.chapters = [];
  deck.slides.forEach((s, i) => {
    if (s.template === "chapter") deck.chapters.push({ name: s.heading, number: s.number, from: i, subchapters: [] });
  });
  if (!deck.chapters.length) deck.chapters = [{ name: deck.prelude || deck.title || "", from: 0, subchapters: [] }];
  else if (deck.chapters[0].from > 0 && deck.preludeChapter !== false)
    deck.chapters.unshift({ name: deck.prelude || deck.title || "", from: 0, subchapters: [] });
  deck.slides.forEach((slide, i) => {
    if (!slide.subchapter) return;
    let chapter = deck.chapters[0];
    for (const candidate of deck.chapters) if (candidate.from <= i) chapter = candidate;
    if (!chapter.subchapters.some((sub) => sub.name === slide.subchapter)) {
      chapter.subchapters.push({ name: slide.subchapter, from: i, slug: slide._slug });
    }
  });
  return deck;
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

export { BLOCKS };
