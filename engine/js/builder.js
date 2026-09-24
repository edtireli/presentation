/* The builder.
 *
 * It edits the same objects the runtime reads, and it previews them by calling the same
 * rendering code — there is no second implementation of a slide anywhere in this project. A
 * block dragged out of the palette is literally `BLOCKS[type].make()`, dropped into a region
 * sets its `at`, and the preview is `renderBlocks` + `applyLayout` exactly as a running deck
 * would do it. That is the only way what you build is what you present.
 */
import { Field, ACCENTS, BACKDROPS } from "./field.js";
import { BLOCKS, renderBlocks, fitMathIn, mountScenesIn } from "./blocks.js";
import { applyLayout, applyPlacement, FITS, PLACES, ENTRANCES, COLLISIONS } from "./layout.js";
import { STYLES, WIDTHS, FONTS, PLATES, TEMPLATES, TRANSITIONS, slideBlocks } from "./deck.js";
import { ALL_SCENES } from "./manim.js";

const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};

const BLANK = {
  title: "Untitled", style: "seminar", accent: "clay", backdrop: "warm",
  font: "system", plate: "scrim", transition: "wipe", zoom: 1,
  progress: { style: "fieldbar", side: "bottom", rows: 2 },
  slides: [{ template: "cold-open", eyebrow: "a new deck", title: "Untitled",
             subtitle: "drag a block from the left", align: "center", width: "narrow" }],
};

export class Builder {
  constructor(root) {
    this.root = root;
    this.deck = this.restore() || structuredClone(BLANK);
    this.i = 0;
    this.sel = null;                       // index of the selected block
    // the field canvas and the toast live outside #build, so they are looked up on the document
    this.field = new Field(document.querySelector("#bfield"));
    this.field.strength = 0.45;            // quieter here: this is a workbench, not a talk
    this.field.start();
    this.wire();
    this.renderAll();
  }

  // ── persistence ────────────────────────────────────────────────────────────
  /* Autosaved to the browser, because losing an afternoon's deck to a refresh is the one
   * unforgivable bug in an editor. The file on disk is still the source of truth. */
  save() {
    try { localStorage.setItem("spiral.draft", JSON.stringify(this.deck)); } catch (e) { /* full */ }
  }
  restore() {
    try { const s = localStorage.getItem("spiral.draft"); return s ? JSON.parse(s) : null; }
    catch (e) { return null; }
  }

  get slide() { return this.deck.slides[this.i]; }

  /** Blocks of the current slide, expanded from its template the first time it is edited. */
  blocksOf(slide) {
    if (!slide.blocks) {
      // editing a template turns it into the blocks it stands for — the template was only ever
      // shorthand, and once a person starts moving pieces the shorthand is in the way
      slide.blocks = structuredClone(slideBlocks(slide));
      for (const k of Object.keys(TEMPLATES)) if (slide.template === k) delete slide.template;
    }
    return slide.blocks;
  }

  // ── the preview ────────────────────────────────────────────────────────────
  renderStage() {
    const stage = this.root.querySelector("#bstage");
    const s = this.slide;
    const st = STYLES[this.deck.style] || STYLES.keynote;
    const page = el("section", "slide");
    page.dataset.align = s.align || st.align;
    page.style.setProperty("--measure", WIDTHS[s.width || st.width] || WIDTHS.regular);
    if (s.width === "bleed") page.classList.add("bleed");
    if (s.plate) page.dataset.plate = s.plate;

    const blocks = s.blocks ? s.blocks : slideBlocks(s);
    const inner = renderBlocks({ blocks }, page);
    const rendered = [...inner.children];
    rendered.forEach((n, k) => { n.dataset.block = k; });
    const cells = applyLayout(inner, s);
    if (cells) {
      rendered.forEach((n, k) => {
        const cell = cells.get(blocks[k]?.at) || cells.values().next().value;
        cell.appendChild(n);
        if (blocks[k]) applyPlacement(n, blocks[k], cell);
      });
      // an empty region still has to be a drop target, and has to be visible as one
      for (const [name, c] of cells) {
        c.classList.add("drop-cell");
        if (!c.children.length) c.appendChild(el("div", "empty-box", name));
      }
    }
    // everything on the page is selectable, and everything is a drop target
    rendered.forEach((n, k) => {
      n.classList.add("pickable");
      if (k === this.sel && !this.selChild) n.classList.add("picked");
      n.addEventListener("click", (e) => { e.stopPropagation(); this.select(k); });
      // and a block nested inside a column selects itself rather than its parent
      n.querySelectorAll("[data-child]").forEach((kid) => {
        kid.addEventListener("click", (e) => {
          e.stopPropagation();
          this.select(k, kid.dataset.child);
        });
        kid.classList.add("pickable");
        if (k === this.sel && kid.dataset.child === this.selChild) kid.classList.add("picked");
      });
      n.draggable = true;
      n.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("spiral/move", String(k));
        e.stopPropagation();
        this.root.classList.add("dragging");
      });
      n.addEventListener("dragend", () => this.root.classList.remove("dragging"));
    });
    if (!cells) rendered.forEach((n, k) => { if (blocks[k]) applyPlacement(n, blocks[k], null); });
    this.dropGrid(page);
    stage.replaceChildren(page);
    fitMathIn(page);
    mountScenesIn(page);
    this.wireDrops(page, cells);
    this.stagePage = page;
    if (this.pending) { this.repaintGrid?.(); this.askConfirm(); }
  }

  /**
   * The drop grid: a sheet of rounded boxes that appears over the slide while you are dragging.
   *
   * This is the part that makes the boxes feel like boxes. Nothing is visible until a drag
   * starts; then the slide is divided into a uniform grid, you sweep across as many cells as
   * the thing should occupy, and letting go both creates the region and puts the block in it.
   * The layout is a consequence of the gesture rather than something typed beforehand.
   *
   * Sweeping over cells that already belong to a region simply reuses that region, so dropping
   * a second block onto an existing box adds it there instead of carving a new one out.
   */
  dropGrid(page) {
    const N = this.gridN || 6;
    const wrap = el("div", "dropgrid");
    wrap.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
    wrap.style.gridTemplateRows = `repeat(${N}, 1fr)`;
    const existing = this.gridMap(N);
    let anchor = null, down = false;

    const paint = (a, b) => {
      wrap.querySelectorAll(".dg").forEach((n) => n.classList.remove("on"));
      if (!a || !b) return;
      for (let r = Math.min(a.r, b.r); r <= Math.max(a.r, b.r); r++) {
        for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c++) {
          wrap.querySelector(`.dg[data-r="${r}"][data-c="${c}"]`)?.classList.add("on");
        }
      }
    };
    this.repaintGrid = () => paint(this.pending?.a, this.pending?.b);

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const g = el("div", "dg");
        g.dataset.r = r; g.dataset.c = c;
        if (existing[r][c] !== ".") { g.classList.add("taken"); g.textContent = existing[r][c]; }

        /* Click to place, rather than drag to place.
         *
         * You choose the thing first, then say where it goes, then confirm — so the selection
         * is visible and reversible before anything is committed. HTML5 drag hides the target
         * under the cursor, fires unreliably across nested elements, and gives no moment to
         * change your mind; press-sweep-release-confirm has none of those problems. A single
         * click is a one-cell box; press and sweep for a bigger one. */
        g.addEventListener("mousedown", (e) => {
          e.preventDefault(); e.stopPropagation();
          down = true; anchor = { r, c };
          this.pending = { a: anchor, b: anchor, N, existing };
          paint(anchor, anchor);
        });
        g.addEventListener("mouseenter", () => {
          if (!down) return;
          this.pending.b = { r, c };
          paint(anchor, { r, c });
        });
        g.addEventListener("mouseup", (e) => {
          e.stopPropagation();
          down = false;
          this.pending.b = { r, c };
          paint(anchor, { r, c });
          this.askConfirm();
        });

        // dragging still works, for a file coming from the desktop
        g.addEventListener("dragenter", (e) => { e.preventDefault(); if (!anchor) anchor = { r, c }; paint(anchor, { r, c }); });
        g.addEventListener("dragover", (e) => e.preventDefault());
        g.addEventListener("drop", (e) => {
          e.preventDefault(); e.stopPropagation();
          const a = anchor || { r, c };
          anchor = null;
          this.dropInto(e, a, { r, c }, N, existing);
        });
        wrap.appendChild(g);
      }
    }
    page.appendChild(wrap);
    return wrap;
  }

  /** Arm a block type: the grid opens and waits to be told where it goes. */
  arm(type) {
    this.armed = type;
    this.pending = null;
    this.root.classList.add("placing");
    this.renderPalette();
    this.toast(`${BLOCKS[type].label || type} — pick a box, then confirm`);
  }

  disarm() {
    this.armed = null;
    this.pendingImport = null;
    this.pending = null;
    this.root.classList.remove("placing");
    this.root.querySelector("#confirm")?.remove();
    this.renderPalette();
    this.renderStage();
  }

  /** The confirm step: the chosen box stays lit until it is accepted or dropped. */
  askConfirm() {
    let bar = this.root.querySelector("#confirm");
    if (!bar) {
      bar = el("div", null); bar.id = "confirm";
      this.root.querySelector("#bstage").appendChild(bar);
    }
    const { a, b } = this.pending;
    const w = Math.abs(b.c - a.c) + 1, h = Math.abs(b.r - a.r) + 1;
    bar.replaceChildren();
    bar.appendChild(el("span", "cw", `${w}×${h} box`));
    const ok = el("button", "go", "place  ⏎");
    ok.onclick = (e) => { e.stopPropagation(); this.placeArmed(); };
    const no = el("button", null, "cancel  esc");
    no.onclick = (e) => { e.stopPropagation(); this.disarm(); };
    bar.append(ok, no);
  }

  /** Commit the armed block into the pending box. */
  placeArmed() {
    if (!this.pending) return;
    const { a, b, N, existing } = this.pending;
    const type = this.armed;
    this.pending = null;
    this.root.querySelector("#confirm")?.remove();
    this.root.classList.remove("placing");
    this.armed = null;
    if (type) this.dropInto({ dataTransfer: { getData: (k) => (k === "spiral/new" && type !== "__import" ? type : ""), files: [] } },
                            a, b, N, existing);
    else this.renderAll();
  }

  /** The slide's current layout, projected onto an N x N grid. */
  gridMap(N) {
    const rows = this.slide.layout || [];
    const R = rows.length, C = R ? rows[0].trim().split(/\s+/).length : 0;
    const out = [];
    for (let r = 0; r < N; r++) {
      out.push(Array.from({ length: N }, (_, c) => {
        if (!R) return ".";
        const sr = Math.min(R - 1, Math.floor(r * R / N));
        const sc = Math.min(C - 1, Math.floor(c * C / N));
        return rows[sr].trim().split(/\s+/)[sc] || ".";
      }));
    }
    return out;
  }

  /**
   * Land a drag on a swept rectangle of the grid.
   *
   * If the sweep is entirely inside one existing region, the block joins that region — dropping
   * two things in the same box should mean "both in this box", not "cut the box in half".
   * Otherwise the rectangle becomes a new region and the layout grows to N x N to hold it.
   */
  dropInto(e, a, b, N, existing) {
    const r0 = Math.min(a.r, b.r), r1 = Math.max(a.r, b.r);
    const c0 = Math.min(a.c, b.c), c1 = Math.max(a.c, b.c);
    const covered = new Set();
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) covered.add(existing[r][c]);
    covered.delete(".");

    let at;
    if (covered.size === 1) {
      at = [...covered][0];                         // dropped into a box that already exists
    } else {
      const map = this.gridMap(N);
      // name the box after what is going into it, so the grid reads back as the slide's
      // contents rather than as a set of anonymous slots
      const wanted = e.dataTransfer.getData("spiral/new") || this.armed;
      at = this.nextRegionName(map, wanted && (BLOCKS[wanted]?.label || wanted));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) map[r][c] = at;
      this.slide.layout = map.map((row) => row.join(" "));
      this.slide.rows = `repeat(${N}, 1fr)`;        // a real canvas, so the sweep means what it looks like
      this.slide.cols = `repeat(${N}, 1fr)`;
    }

    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) return this.importDialog(file);
    if (this.pendingImport) { this.blocksOf(this.slide); return this.finishImport(at); }
    const type = e.dataTransfer.getData("spiral/new");
    const moving = e.dataTransfer.getData("spiral/move");
    const blocks = this.blocksOf(this.slide);
    if (type && BLOCKS[type]) {
      const nb = BLOCKS[type].make();
      nb.at = at;
      this.autoFit(nb, { r0, r1, c0, c1, N });
      blocks.push(nb);
      this.sel = blocks.length - 1;
      this.commit();
      this.maybePickFor(nb);
      return;
    }
    if (moving !== "") {
      const mb = blocks[+moving];
      if (mb) { mb.at = at; this.sel = +moving; }
    }
    this.commit();
  }

  /**
   * Choose how the thing should sit in the box it was just dropped into.
   *
   * The box's shape is known and the block's natural shape is roughly known, so the obvious
   * call can be made rather than left to the author: something square in a wide box gets air
   * around it, something dropped into a box that reaches the slide's edge is allowed to run
   * out to it. It is only a default — the inspector still has the four fits.
   */
  autoFit(b, box) {
    const wide = (box.c1 - box.c0 + 1) / (box.r1 - box.r0 + 1);
    const touchesEdge = box.c0 === 0 || box.c1 === box.N - 1;
    if (b.type === "traced" || b.type === "image" || b.type === "scene") {
      b.fit = touchesEdge && wide > 1.4 ? "bleed" : wide < 0.8 ? "snug" : "fill";
    } else if (wide > 2.5) {
      b.fit = "snug";                                // a long thin box of text wants a margin
    }
  }

  /* Dropping. A block from the palette lands in whatever region it was dropped on; a block
   * already on the slide is moved there instead. An image file dropped from the desktop
   * becomes a traced block, read into the field's own dots. */
  wireDrops(page, cells) {
    const targets = cells ? [...cells.values()] : [page];
    for (const t of targets) {
      t.addEventListener("dragover", (e) => { e.preventDefault(); t.classList.add("over"); });
      t.addEventListener("dragleave", () => t.classList.remove("over"));
      t.addEventListener("drop", (e) => {
        e.preventDefault(); e.stopPropagation();
        t.classList.remove("over");
        const at = t.dataset.cell;
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith("image/")) return this.dropImage(file, at);
        const type = e.dataTransfer.getData("spiral/new");
        const moving = e.dataTransfer.getData("spiral/move");
        const blocks = this.blocksOf(this.slide);
        if (type && BLOCKS[type]) {
          const b = BLOCKS[type].make();
          if (at) b.at = at;
          blocks.push(b);
          this.sel = blocks.length - 1;
          setTimeout(() => this.maybePickFor(b), 0);
        } else if (moving !== "") {
          const b = blocks[+moving];
          if (!b) return;
          if (at) b.at = at; else delete b.at;
          this.sel = +moving;
        }
        this.commit();
      });
    }
  }

  /* An image dropped from the desktop is stored INSIDE the deck as a data URL. It makes the
   * file bigger, and it means a .spiral is one self-contained thing that will still work on a
   * machine that has never seen the original — which matters more. */
  dropImage(file, at, box) {
    const r = new FileReader();
    r.onload = () => {
      const b = BLOCKS.traced.make();
      b.src = r.result;
      b.name = file.name;
      if (at) b.at = at;
      if (box) this.autoFit(b, box);
      const blocks = this.blocksOf(this.slide);
      blocks.push(b);
      this.sel = blocks.length - 1;
      this.root.classList.remove("dragging");
      this.commit();
      this.toast(`traced ${file.name}`);
    };
    r.readAsDataURL(file);
  }

  // ── the palette ────────────────────────────────────────────────────────────
  renderPalette() {
    const host = this.root.querySelector("#palette");
    host.replaceChildren();
    for (const [type, def] of Object.entries(BLOCKS)) {
      const chip = el("div", "chip");
      chip.draggable = true;
      chip.innerHTML = `<span class="ic">${def.icon || "▪"}</span>${def.label || type}`;
      chip.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("spiral/new", type);
        e.dataTransfer.effectAllowed = "copy";
        this.root.classList.add("dragging");
      });
      chip.addEventListener("dragend", () => this.root.classList.remove("dragging"));
      if (this.armed === type) chip.classList.add("armed");
      chip.addEventListener("click", () => this.armed === type ? this.disarm() : this.arm(type));
      // double-click still drops it straight into the flow, for a quick page of prose
      chip.addEventListener("dblclick", () => {
        this.disarm();
        const blocks = this.blocksOf(this.slide);
        const b = BLOCKS[type].make();
        blocks.push(b);
        this.sel = blocks.length - 1;
        this.commit();
        this.maybePickFor(b);
      });
      host.appendChild(chip);
    }
  }

  // ── the reel ───────────────────────────────────────────────────────────────
  renderReel() {
    const host = this.root.querySelector("#reel");
    host.replaceChildren();
    this.deck.slides.forEach((s, k) => {
      const card = el("div", "sl" + (k === this.i ? " on" : ""));
      card.draggable = true;
      const label = s.template || (s.blocks?.[0]?.text) || `slide ${k + 1}`;
      card.innerHTML = `<span class="n">${String(k + 1).padStart(2, "0")}</span>
                        <span class="t">${String(label).slice(0, 26)}</span>`;
      card.onclick = () => { this.i = k; this.sel = null; this.commit(); };
      card.addEventListener("dragstart", (e) => e.dataTransfer.setData("spiral/slide", String(k)));
      card.addEventListener("dragover", (e) => e.preventDefault());
      card.addEventListener("drop", (e) => {
        e.preventDefault();
        const from = +e.dataTransfer.getData("spiral/slide");
        if (Number.isNaN(from) || from === k) return;
        const [moved] = this.deck.slides.splice(from, 1);
        this.deck.slides.splice(k, 0, moved);
        this.i = k;
        this.commit();
      });
      host.appendChild(card);
    });
  }

  // ── the inspector ──────────────────────────────────────────────────────────
  renderInspector() {
    const host = this.root.querySelector("#inspect");
    host.replaceChildren();
    const blocks = this.slide.blocks || slideBlocks(this.slide);
    const b = this.selected();

    if (b) {
      const def = BLOCKS[b.type] || {};
      host.appendChild(el("h3", null, def.label || b.type));
      const fields = [...(def.fields || [])];
      // the properties every block shares, exposed here rather than repeated in each registry
      fields.push({ k: "at", t: "pick", of: this.regionNames() },
                  { k: "fit", t: "pick", of: Object.keys(FITS) },
                  { k: "x", t: "pick", of: PLACES },
                  { k: "enter", t: "pick", of: Object.keys(ENTRANCES) },
                  { k: "step", t: "bool" },
                  { k: "collision", t: "pick", of: Object.keys(COLLISIONS) });
      if (b.type === "scene") fields.push({ k: "aspect", t: "text" });
      for (const f of fields) host.appendChild(this.field_(b, f));
      const del = el("button", "danger", "delete block");
      del.onclick = () => {
        if (this.selChild) {
          const [ci, ki] = this.selChild.split(".").map(Number);
          blocks[this.sel]?.of?.[ci]?.splice(ki, 1);
          this.selChild = null;
        } else {
          blocks.splice(this.sel, 1);
          this.sel = null;
        }
        this.commit();
      };
      host.appendChild(del);
      host.appendChild(el("div", "rule2"));
    }

    host.appendChild(el("h3", null, "slide"));
    for (const f of [{ k: "width", t: "pick", of: Object.keys(WIDTHS) },
                     { k: "align", t: "pick", of: ["left", "center"] },
                     { k: "transition", t: "pick", of: TRANSITIONS },
                     { k: "plate", t: "pick", of: Object.keys(PLATES) },
                     { k: "zoom", t: "text" },
                     { k: "cols", t: "text" }]) {
      host.appendChild(this.field_(this.slide, f));
    }
    host.appendChild(el("h3", null, "boxes"));
    host.appendChild(this.layoutGrid());
    const dup = el("button", null, "duplicate slide");
    dup.onclick = () => {
      this.deck.slides.splice(this.i + 1, 0, structuredClone(this.slide));
      this.i++; this.commit();
    };
    const rm = el("button", "danger", "delete slide");
    rm.onclick = () => {
      if (this.deck.slides.length < 2) return;
      this.deck.slides.splice(this.i, 1);
      this.i = Math.max(0, this.i - 1); this.sel = null; this.commit();
    };
    host.append(dup, rm, el("div", "rule2"), el("h3", null, "deck"));
    for (const f of [{ k: "title", t: "text" },
                     { k: "style", t: "pick", of: Object.keys(STYLES) },
                     { k: "font", t: "pick", of: Object.keys(FONTS) },
                     { k: "accent", t: "pick", of: ACCENTS.map((a) => a.key) },
                     { k: "backdrop", t: "pick", of: BACKDROPS.map((b2) => b2.key) },
                     { k: "plate", t: "pick", of: Object.keys(PLATES) },
                     { k: "transition", t: "pick", of: TRANSITIONS },
                     { k: "zoom", t: "text" }]) {
      host.appendChild(this.field_(this.deck, f, true));
    }
  }

  /**
   * The layout, drawn instead of typed.
   *
   * `["head head", "fig text"]` is a fine thing for a file to contain and a terrible thing to
   * ask a person to write. This is the same data as a grid you drag across: sweep out a
   * rectangle and it becomes a region, click one to rename or clear it. Regions are rounded
   * boxes rather than grid lines because that is what they are — the boxes blocks go into.
   */
  /**
   * The boxes this slide has, read-only.
   *
   * There used to be a second sweepable grid here, editing the same layout as the one that
   * appears over the slide — two interactions for one thing, in two places, disagreeing about
   * which was the real editor. Boxes are made where they live: press a block, sweep the grid
   * on the slide, confirm. This panel only says what exists, lets a box be renamed or cleared,
   * and offers the way back to a single column.
   */
  layoutGrid() {
    const wrap = el("div", "lay");
    const s = this.slide;
    const names = this.regionNames();
    if (!names.length) {
      wrap.appendChild(el("div", "layhint",
        "No boxes. Press a block on the left, then sweep the slide to place it."));
      return wrap;
    }
    const rows = s.layout || [];
    const grid = rows.map((r) => r.trim().split(/\s+/));
    const list = el("div", "boxlist");
    for (const name of names) {
      let cells = 0;
      grid.forEach((row) => row.forEach((c) => { if (c === name) cells++; }));
      const row = el("div", "boxrow");
      row.appendChild(el("span", "bn", name));
      row.appendChild(el("span", "bc", `${cells} cell${cells === 1 ? "" : "s"}`));
      const ren = el("button", "tiny", "rename");
      ren.onclick = () => {
        const nm = prompt("rename this box", name);
        if (!nm || !nm.trim()) return;
        const to = nm.trim().replace(/[^a-z0-9]+/gi, "").toLowerCase() || name;
        s.layout = rows.map((r) => r.trim().split(/\s+/).map((c) => (c === name ? to : c)).join(" "));
        (s.blocks || []).forEach((b) => { if (b.at === name) b.at = to; });
        this.commit();
      };
      const del = el("button", "tiny", "clear");
      del.onclick = () => {
        s.layout = rows.map((r) => r.trim().split(/\s+/).map((c) => (c === name ? "." : c)).join(" "));
        // whatever lived there falls back to the first remaining box, or to the flow
        const left = this.regionNames().filter((n) => n !== name);
        (s.blocks || []).forEach((b) => { if (b.at === name) { if (left[0]) b.at = left[0]; else delete b.at; } });
        if (!left.length) { delete s.layout; delete s.cols; delete s.rows; }
        this.commit();
      };
      row.append(ren, del);
      list.appendChild(row);
    }
    wrap.appendChild(list);
    const clear = el("button", "tiny", "no boxes (one column)");
    clear.onclick = () => {
      delete s.layout; delete s.cols; delete s.rows;
      (s.blocks || []).forEach((b) => delete b.at);
      this.commit();
    };
    wrap.appendChild(clear);
    return wrap;
  }

  /**
   * Importing a picture is a decision, so it gets a dialog rather than a default.
   *
   * A photograph, a traced drawing and a sheet of eight separate panels all arrive as "an
   * image file", and which of those it is changes what should happen to it. So the file is
   * read once, every option is RENDERED from the real pixels, and the choice is made by
   * looking at them side by side instead of by reading the names of four modes.
   *
   * Nothing is added to the slide until a box is chosen and confirmed, so an import can be
   * abandoned at any point without leaving anything behind.
   */
  async importDialog(file) {
    const { loadImage, buildTrace, Traced, findPanels, cropTrace } = await import("./trace.js");
    const DG = await import("./digitise.js");
    const img = await loadImage(file);
    const dlg = el("div", null); dlg.id = "import";
    const stop = (e) => e.stopPropagation();
    dlg.addEventListener("click", stop);
    document.body.appendChild(dlg);

    const state = { mode: "both", cols: 90, invert: false, arrival: "wipe", choice: "traced", panels: [] };
    // a figure on white paper has to be inverted to read as light-on-dark, so start it that way
    state.invert = await new Promise((res) => {
      const c = document.createElement("canvas"); c.width = c.height = 24;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0, 24, 24);
      const d = g.getImageData(0, 0, 24, 24).data;
      let edge = 0, n = 0;
      for (let i = 0; i < 24; i++) {
        for (const p of [i * 4, (23 * 24 + i) * 4, (i * 24) * 4, (i * 24 + 23) * 4]) {
          edge += (d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114) / 255; n++;
        }
      }
      res(edge / n > 0.6);
    });
    const previews = el("div", "iprev");
    const head = el("div", "ihead");
    head.appendChild(el("h3", null, `import — ${file.name || "image"}`));
    const close = el("button", "x", "✕");
    const release = () => { if (img._objectURL) URL.revokeObjectURL(img._objectURL); };
    close.onclick = () => { release(); dlg.remove(); this.pendingImport = null; };
    head.appendChild(close);

    const controls = el("div", "ictl");
    const detail = el("input"); detail.type = "range"; detail.min = 30; detail.max = 200; detail.value = state.cols;
    const inv = el("input"); inv.type = "checkbox"; inv.checked = state.invert;
    const lab = (t, node) => { const w = el("label", "f"); w.appendChild(el("span", "k", t)); w.appendChild(node); return w; };
    controls.append(lab("detail (dots across)", detail), lab("invert", inv));

    const foot = el("div", "ifoot");
    const note = el("span", "inote", "");
    const go = el("button", "go", "choose where →");
    const cancel = el("button", null, "cancel");
    cancel.onclick = () => { release(); dlg.remove(); this.pendingImport = null; };
    foot.append(note, cancel, go);

    dlg.append(head, controls, previews, foot);

    let trace = null;
    const build = () => {
      trace = buildTrace(img, { cols: +detail.value, invert: inv.checked });
      /* Panels are found on a FINER grid than the one they are drawn on.
       *
       * At display resolution a gap between two slices can be narrower than a single cell, so
       * the seven-slice strip in a real figure came back as one region. Detection gets its own
       * grid — costing one extra downsample of the image, once — and the boxes it returns are
       * then rescaled to whatever resolution the picture is actually drawn at. */
      const fine = buildTrace(img, { cols: 420, invert: inv.checked });
      state.fine = fine;
      const sx = trace.cols / fine.cols, sy = trace.rows / fine.rows;
      state.panels = findPanels(fine).map((p) => ({
        r0: Math.floor(p.r0 * sy), r1: Math.ceil(p.r1 * sy),
        c0: Math.floor(p.c0 * sx), c1: Math.ceil(p.c1 * sx),
        w: Math.ceil(p.w * sx), h: Math.ceil(p.h * sy),
      })).filter((p) => p.w > 1 && p.h > 1);
      previews.replaceChildren();

      const tile = (key, title, sub, paint) => {
        const t = el("div", "itile" + (state.choice === key ? " on" : ""));
        t.appendChild(el("div", "it", title));
        const holder = el("div", "ipane");
        t.appendChild(holder);
        t.appendChild(el("div", "is", sub));
        t.onclick = () => { state.choice = key; build(); showCal(); };
        previews.appendChild(t);
        // rendered after the tile is measured, so each preview knows its own width
        requestAnimationFrame(() => paint(holder));
        return t;
      };

      tile("photo", "keep as a photo", "the file, unchanged", (h) => {
        const im = el("img"); im.src = img.src; h.appendChild(im);
      });
      for (const [k, title, sub] of [["dots", "tones", "the field carries its greys"],
                                     ["outline", "outline", "edges only, in the accent"],
                                     ["both", "tones + outline", "the usual choice"]]) {
        tile("traced:" + k, title, sub, (h) =>
          new Traced(h, trace, { mode: k, arrival: state.arrival, still: true, cols: +detail.value }));
      }
      /* A plot can be READ rather than redrawn.
       *
       * If the picture has axes it is probably a chart, and a chart is worth far more as
       * numbers than as dots — rescalable, recolourable, and able to share an axis with
       * anything else in the deck. Offered only when axes are actually found, so it never
       * appears for a photograph. */
      state.axes = DG.findAxes(fine);
      if (state.axes.found) {
        tile("digitise", "read the plot",
             `axes found · recover the numbers`, (h) => {
          const c = document.createElement("canvas");
          const W = h.clientWidth || 200, H = Math.round(W * fine.rows / fine.cols);
          c.width = W; c.height = H; c.style.width = W + "px"; c.style.height = H + "px";
          const g = c.getContext("2d");
          const acc = getComputedStyle(document.documentElement)
            .getPropertyValue("--accent").trim() || "#D97757";
          g.fillStyle = "#00000040"; g.fillRect(0, 0, W, H);
          const sx = W / fine.cols, sy = H / fine.rows;
          g.strokeStyle = "#7E93A8"; g.lineWidth = 1;
          g.beginPath();
          g.moveTo(0, state.axes.xAxisRow * sy); g.lineTo(W, state.axes.xAxisRow * sy);
          g.moveTo(state.axes.yAxisCol * sx, 0); g.lineTo(state.axes.yAxisCol * sx, H);
          g.stroke();
          const pts = DG.traceCurve(fine, state.axes.plot);
          g.strokeStyle = acc; g.lineWidth = 1.6;
          g.beginPath();
          let on = false;
          for (const q of pts) {
            if (q.row == null) { on = false; continue; }
            const x = q.col * sx, y = q.row * sy;
            on ? g.lineTo(x, y) : g.moveTo(x, y);
            on = true;
          }
          g.stroke();
          h.replaceChildren(c);
        });
      }
      if (state.panels.length > 1) {
        tile("panels", `split into ${state.panels.length} panels`,
             "each piece becomes its own block", (h) => {
          const c = document.createElement("canvas");
          const W = h.clientWidth || 200, H = Math.round(W * trace.aspect);
          c.width = W; c.height = H; c.style.width = W + "px"; c.style.height = H + "px";
          const g = c.getContext("2d");
          g.fillStyle = "#00000030"; g.fillRect(0, 0, W, H);
          for (const p of state.panels) {
            const x = p.c0 / trace.cols * W, y = p.r0 / trace.rows * H;
            const w = p.w / trace.cols * W, hh = p.h / trace.rows * H;
            g.strokeStyle = getComputedStyle(document.documentElement)
              .getPropertyValue("--accent").trim() || "#D97757";
            g.lineWidth = 1.5;
            if (g.roundRect) { g.beginPath(); g.roundRect(x, y, w, hh, 4); g.stroke(); }
            else g.strokeRect(x, y, w, hh);
          }
          h.replaceChildren(c);
        });
      }
      note.textContent = `${img.naturalWidth}×${img.naturalHeight} · ${state.panels.length} region${state.panels.length === 1 ? "" : "s"} detected`;
    };
    /* Calibration is the author's to give.
     *
     * Two numbers per axis cannot be recovered from pixels: the tick labels are text, and
     * reading them would be OCR — which fails quietly and would put wrong numbers on a slide
     * with no way to tell that it had. Four fields is a small price for not being lied to. */
    const cal = el("div", "ical");
    cal.style.display = "none";
    const num = (label, val) => {
      const w = el("label", "f");
      w.appendChild(el("span", "k", label));
      const i = el("input"); i.type = "text"; i.value = val;
      i.oninput = () => showCal();
      w.appendChild(i); cal.appendChild(w);
      return i;
    };
    const xLo = num("x at left axis", "0"), xHi = num("x at right edge", "10");
    const yLo = num("y at bottom axis", "0"), yHi = num("y at top", "1");
    const calNote = el("div", "layhint", "");
    cal.appendChild(calNote);
    dlg.insertBefore(cal, previews);

    const showCal = () => {
      const on = state.choice === "digitise" && state.axes?.found && state.fine;
      cal.style.display = on ? "" : "none";
      if (!on) return;
      /* Pinned to where the AXES END, not to the edges of the picture. A figure has a title
       * and margins, and calibrating the top value against row 0 of the image charges the
       * whole of that margin to the reading. */
      const c = {
        x0: { px: state.axes.yAxisCol, value: +xLo.value || 0 },
        x1: { px: state.axes.xRightCol ?? state.fine.cols - 1, value: +xHi.value || 1 },
        y0: { px: state.axes.xAxisRow, value: +yLo.value || 0 },
        y1: { px: state.axes.yTopRow ?? 0, value: +yHi.value || 1 },
        plot: state.axes.plot,
      };
      const out = DG.digitise(state.fine, c, { points: 200 });
      state.digitised = out;
      calNote.textContent =
        `${out.data.n} points across ${(out.coverage * 100).toFixed(0)}% of the plot · ` +
        `steepest reading uncertain to about ${out.worstSpreadPx}px`;
    };

    detail.oninput = () => { build(); showCal(); };
    inv.onchange = () => { build(); showCal(); };
    build();
    showCal();

    go.onclick = () => {
      dlg.remove();
      // hold the decision, open the grid, and let the usual place-and-confirm finish the job
      this.pendingImport = { file, choice: state.choice, cols: +detail.value,
                             invert: inv.checked, panels: state.panels, trace,
                             digitised: state.digitised };
      this.armed = "__import";
      this.root.classList.add("placing");
      this.toast("pick a box for it, then confirm");
      this.renderStage();
    };
  }

  /** Turn a confirmed import into the block or blocks it asked for. */
  async finishImport(at) {
    const imp = this.pendingImport;
    if (!imp) return;
    this.pendingImport = null;
    const dataUrl = await new Promise((res) => {
      const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(imp.file);
    });
    const blocks = this.blocksOf(this.slide);
    if (imp.choice === "digitise" && imp.digitised) {
      // it stops being a picture entirely: a chart block, drawn by charts.js at the deck's
      // own scale, with the same axes and palette as any figure written by hand
      const b = BLOCKS.chart.make();
      b.kind = "line";
      b.data = {
        ylabel: "",
        panels: [{ label: imp.file.name.replace(/\.[^.]+$/, ""), kind: "line",
                   series: [{ name: "digitised",
                              x: imp.digitised.data.x, y: imp.digitised.data.y }] }],
      };
      if (at) b.at = at;
      blocks.push(b);
      this.sel = blocks.length - 1;
      this.armed = null;
      this.root.classList.remove("placing");
      this.commit();
      this.toast(`read ${imp.digitised.data.n} points`);
      return;
    }
    if (imp.choice === "photo") {
      const b = BLOCKS.image.make();
      b.src = dataUrl; b.name = imp.file.name; if (at) b.at = at;
      blocks.push(b);
    } else if (imp.choice === "panels") {
      /* Each panel becomes its own traced block, carrying the crop box rather than a separate
       * copy of the picture — one data URL in the file however many panels come out of it. */
      imp.panels.forEach((p, i) => {
        const b = BLOCKS.traced.make();
        b.src = dataUrl; b.name = `${imp.file.name} · panel ${i + 1}`;
        b.cols = imp.cols; b.invert = imp.invert; b.crop = { r0: p.r0, r1: p.r1, c0: p.c0, c1: p.c1 };
        if (at) b.at = at;
        blocks.push(b);
      });
    } else {
      const b = BLOCKS.traced.make();
      b.src = dataUrl; b.name = imp.file.name;
      b.mode = imp.choice.split(":")[1] || "both";
      b.cols = imp.cols; b.invert = imp.invert;
      if (at) b.at = at;
      blocks.push(b);
    }
    this.sel = blocks.length - 1;
    this.armed = null;
    this.root.classList.remove("placing");
    this.commit();
    this.toast(imp.choice === "panels" ? `placed ${imp.panels.length} panels` : "placed");
  }
  /** The system file picker, as a promise-ish callback. One input, reused. */
  pickImage(then) {
    let inp = document.querySelector("#pickfile");
    if (!inp) {
      inp = el("input"); inp.type = "file"; inp.id = "pickfile";
      inp.accept = "image/*"; inp.style.display = "none";
      document.body.appendChild(inp);
    }
    inp.value = "";
    inp.onchange = () => {
      const f = inp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => { then(r.result, f.name); this.toast(`loaded ${f.name}`); };
      r.readAsDataURL(f);
    };
    inp.click();
  }

  /** Blocks that are nothing without a picture open the picker as soon as they are added,
   *  rather than sitting on the slide as an empty rectangle waiting to be configured. */
  maybePickFor(b) {
    if ((b.type === "traced" || b.type === "image") && !b.src) {
      // the block is a placeholder until a picture is chosen; the dialog replaces it
      const blocks = this.slide.blocks || [];
      const i = blocks.indexOf(b);
      if (i >= 0) blocks.splice(i, 1);
      this.sel = null;
      this.commit();
      this.pickFile((f) => this.importDialog(f));
    }
  }

  /** Ask for a file and hand it straight to the import dialog. */
  pickFile(then) {
    let inp = document.querySelector("#pickfile");
    if (!inp) {
      inp = el("input"); inp.type = "file"; inp.id = "pickfile";
      inp.accept = "image/*"; inp.style.display = "none";
      document.body.appendChild(inp);
    }
    inp.value = "";
    inp.onchange = () => { const f = inp.files[0]; if (f) then(f); };
    inp.click();
  }

  /** The regions this slide actually has, so `at` is a choice rather than a spelling test. */
  regionNames() {
    const rows = this.slide.layout || [];
    return [...new Set(rows.join(" ").trim().split(/\s+/))].filter((n) => n && n !== ".");
  }

  nextRegionName(cells, hint) {
    const used = new Set(cells.flat().filter((x) => x !== "."));
    // grid-template-areas names cannot contain spaces or punctuation
    const base = (hint || "box").toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (base && !used.has(base)) return base;
    for (let i = 2; i < 60; i++) if (!used.has(base + i)) return base + i;
    return "box" + (used.size + 1);
  }

  /** One editable property. The widget follows the declared type, so a new block's fields
   *  appear here without the inspector needing to know anything about it. */
  field_(obj, f, isDeck = false) {
    const wrap = el("label", "f");
    wrap.appendChild(el("span", "k", f.k));
    let input;
    if (f.t === "file") {
      /* Nobody should be typing a path into a presentation tool. This opens the system picker,
       * reads the file into the deck as a data URL, and shows what is currently loaded. */
      input = el("div", "filepick");
      const btn = el("button", null, obj[f.k] ? (obj.name || "replace image…") : "choose image…");
      btn.onclick = () => this.pickImage((dataUrl, name) => {
        obj[f.k] = dataUrl; obj.name = name; this.commit();
      });
      input.appendChild(btn);
      if (obj[f.k]) {
        const thumb = el("img", "thumb");
        thumb.src = obj[f.k];
        input.appendChild(thumb);
        const rm = el("button", "tiny", "remove");
        rm.onclick = () => { delete obj[f.k]; delete obj.name; this.commit(); };
        input.appendChild(rm);
      }
      wrap.appendChild(input);
      return wrap;
    }
    if (f.t === "bool") {
      input = el("input"); input.type = "checkbox"; input.checked = !!obj[f.k];
      input.onchange = () => { obj[f.k] = input.checked; this.commit(); };
    } else if (f.t === "pick") {
      input = el("select");
      input.appendChild(new Option("—", ""));
      for (const o of f.of) input.appendChild(new Option(o, o));
      input.value = obj[f.k] ?? "";
      input.onchange = () => {
        if (input.value === "") delete obj[f.k]; else obj[f.k] = input.value;
        this.commit();
      };
    } else if (f.t === "json") {
      /* Structured block fields must stay structured.
       *
       * Scene args and chart data used to appear as `[object Object]`; touching the field then
       * replaced the object with that string and silently broke the slide. A JSON editor is
       * still lightweight, but it round-trips arrays and objects without changing their type.
       * Invalid text stays visible for correction and is never committed to the deck. */
      input = el("textarea");
      input.value = obj[f.k] == null ? "" : JSON.stringify(obj[f.k], null, 2);
      input.rows = 7;
      input.oninput = () => {
        const raw = input.value.trim();
        if (!raw) {
          delete obj[f.k];
          input.classList.remove("invalid");
          this.commit(true);
          return;
        }
        try {
          obj[f.k] = JSON.parse(raw);
          input.classList.remove("invalid");
          this.commit(true);
        } catch (_) {
          input.classList.add("invalid");
        }
      };
    } else if (f.t === "area" || f.t === "rows" || f.t === "blocks") {
      input = el("textarea");
      const v = obj[f.k];
      input.value = Array.isArray(v) ? v.join("\n") : (v ?? "");
      input.rows = f.t === "rows" ? 3 : 4;
      input.oninput = () => {
        const lines = input.value.split("\n");
        if (f.t === "rows") obj[f.k] = input.value.trim() ? lines : undefined;
        else if (Array.isArray(obj[f.k]) || f.k === "items") obj[f.k] = lines;
        else obj[f.k] = input.value;
        this.commit(true);
      };
    } else {
      input = el("input"); input.type = "text";
      input.value = obj[f.k] ?? "";
      input.oninput = () => {
        const v = input.value;
        if (v === "") delete obj[f.k];
        else obj[f.k] = /^-?\d+(\.\d+)?$/.test(v) ? +v : v;
        this.commit(true);
      };
    }
    wrap.appendChild(input);
    return wrap;
  }

  // ── plumbing ───────────────────────────────────────────────────────────────
  /** Select a block, or one nested inside a columns block as "col.index". */
  select(k, child = null) {
    this.sel = k;
    this.selChild = child;
    this.renderStage();
    this.renderInspector();
  }

  /** The object the inspector is editing: a block, or a child of a columns block. */
  selected() {
    const blocks = this.slide.blocks || slideBlocks(this.slide);
    const b = blocks[this.sel];
    if (!b || !this.selChild) return b;
    const [ci, ki] = this.selChild.split(".").map(Number);
    return b.of?.[ci]?.[ki] ?? b;
  }

  /** Re-render after a change. `soft` keeps focus in the inspector while typing. */
  commit(soft = false) {
    this.root.classList.remove("dragging");
    this.applyTheme();
    this.renderStage();
    this.renderReel();
    if (!soft) this.renderInspector();
    this.save();
  }

  renderAll() {
    this.applyTheme();
    this.renderPalette();
    this.renderReel();
    this.renderStage();
    this.renderInspector();
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
    d.style.setProperty("--zoom", String(this.deck.zoom ?? 1));
    this.root.dataset.style = this.deck.style;
    this.root.dataset.plate = this.deck.plate || "scrim";
  }

  toast(msg) {
    const n = document.querySelector("#btoast");
    n.textContent = msg; n.classList.add("on");
    clearTimeout(this._t); this._t = setTimeout(() => n.classList.remove("on"), 1600);
  }

  wire() {
    const q = (s) => this.root.querySelector(s);
    q("#add").onclick = () => {
      this.deck.slides.splice(this.i + 1, 0,
        { blocks: [BLOCKS.heading.make()], align: "left", width: "regular" });
      this.i++; this.sel = 0; this.commit();
    };
    q("#save").onclick = () => {
      const blob = new Blob([JSON.stringify(this.deck, null, 2)], { type: "application/json" });
      const a = el("a");
      a.href = URL.createObjectURL(blob);
      a.download = (this.deck.title || "deck").replace(/\s+/g, "-").toLowerCase() + ".spiral";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    q("#open").onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          this.deck = JSON.parse(r.result);
          this.i = 0; this.sel = null; this.renderAll(); this.save();
          this.toast(`opened ${f.name}`);
        } catch (err) { this.toast("that file is not a deck"); }
      };
      r.readAsText(f);
    };
    q("#present").onclick = () => {
      // hand the draft to the runtime through storage rather than the URL: a deck with a
      // traced image in it is far past what a query string can carry
      this.save();
      window.open("index.html?deck=draft", "_blank");
    };
    q("#blank").onclick = () => {
      if (!confirm("Discard this deck and start again?")) return;
      this.deck = structuredClone(BLANK); this.i = 0; this.sel = null; this.renderAll(); this.save();
    };
    // the whole stage is a drop target for images, even where there are no regions
    const stage = q("#bstage");
    stage.addEventListener("dragover", (e) => e.preventDefault());
    stage.addEventListener("drop", (e) => {
      const f = e.dataTransfer.files?.[0];
      if (f && f.type.startsWith("image/")) { e.preventDefault(); this.importDialog(f); }
    });
    stage.addEventListener("click", () => { this.sel = null; this.renderStage(); this.renderInspector(); });
    addEventListener("keydown", (e) => {
      if (e.target.matches("input,textarea,select")) return;
      if (e.key === "Escape" && (this.armed || this.pending)) { e.preventDefault(); return this.disarm(); }
      if (e.key === "Enter" && this.pending) { e.preventDefault(); return this.placeArmed(); }
      if (e.key === "ArrowDown") { this.i = Math.min(this.deck.slides.length - 1, this.i + 1); this.sel = null; this.commit(); }
      if (e.key === "ArrowUp") { this.i = Math.max(0, this.i - 1); this.sel = null; this.commit(); }
      if (e.key === "Backspace" && this.sel != null) {
        (this.slide.blocks || []).splice(this.sel, 1); this.sel = null; this.commit();
      }
    });
    addEventListener("resize", () => this.renderStage());
  }
}

export { ALL_SCENES };
