/* Pages as boxes.
 *
 * A slide's `layout` is a list of rows naming regions, exactly as CSS grid-template-areas
 * reads, and every block says which region it sits in. Repeating a name across cells joins
 * them into one box, so a heading spanning the top and a figure beside its text is a layout
 * an author can see in the file:
 *
 *     "layout": ["head head",
 *                "fig  text"]
 *
 * That is the whole system. There is no second kind of slide — a slide without a `layout` is
 * one column, which is the flow every template already used.
 *
 * Blocks can also MOVE between regions as the talk steps forward. That is done by FLIP —
 * measure where it is, change the region, measure again, and animate the difference away —
 * so the movement is real layout rather than a hand-typed pair of coordinates that stops
 * being true the moment the text changes.
 */

/** How a block arrives. `none` means it is simply there when the page is. */
export const ENTRANCES = {
  none:  { label: "none",      from: "" },
  fade:  { label: "fade",      from: "opacity:0" },
  rise:  { label: "rise",      from: "opacity:0;transform:translateY(14px)" },
  fall:  { label: "fall",      from: "opacity:0;transform:translateY(-14px)" },
  left:  { label: "from left", from: "opacity:0;transform:translateX(-26px)" },
  right: { label: "from right",from: "opacity:0;transform:translateX(26px)" },
  grow:  { label: "grow",      from: "opacity:0;transform:scale(.90)" },
  settle:{ label: "settle",    from: "opacity:0;transform:scale(1.06)" },
};

/**
 * Build the grid, and a CONTAINER for every named region.
 *
 * The containers are the point. Assigning two blocks the same `grid-area` does not put them
 * in the same box — grid stacks them in the same cell, one printed over the other, and the
 * slide silently becomes unreadable. A region has to be a real element that blocks go inside,
 * so that two of them in the same box lay out as a column the way anything else would.
 *
 * It also makes movement well defined: moving a block between boxes is moving a node between
 * parents, and a box can be asked what is currently in it.
 */
export function applyLayout(inner, slide) {
  const rows = slide.layout;
  if (!rows || !rows.length) return null;
  inner.classList.add("boxed");
  inner.style.gridTemplateAreas = rows.map((r) => `"${r}"`).join(" ");
  const ncols = rows[0].trim().split(/\s+/).length;
  inner.style.gridTemplateColumns = slide.cols || `repeat(${ncols}, 1fr)`;
  if (slide.rows) inner.style.gridTemplateRows = slide.rows;
  if (slide.boxGap) inner.style.gap = slide.boxGap;

  const names = [...new Set(rows.join(" ").trim().split(/\s+/))].filter((n) => n !== ".");
  const grid = rows.map((r) => r.trim().split(/\s+/));
  const lastCol = Math.max(...grid.map((r) => r.length)) - 1;
  const cells = new Map();
  for (const name of names) {
    const c = document.createElement("div");
    c.className = "cell";
    c.dataset.cell = name;
    c.style.gridArea = name;
    /* Which sides of this box face the slide's margin rather than another box. A bleed is
     * only allowed to overstep on those, so a figure in the left-hand column runs out into
     * the margin and stops square against the column beside it. Without this a bleed is just
     * the overlap problem again, wearing a different hat. */
    let free = "";
    if (grid.some((r) => r[0] === name)) free += "l";
    if (grid.some((r) => r[lastCol] === name)) free += "r";
    c.dataset.edges = free;
    const a = (slide.cellAlign || {})[name];
    if (a) c.style.justifyContent = a;
    inner.appendChild(c);
    cells.set(name, c);
  }
  return cells;
}

/**
 * How a block sits in its box.
 *
 * A box says where something goes; this says how it occupies it. `fill` is the honest default,
 * `snug` leaves air around it, and `bleed` lets it run slightly past the edges — which is a
 * real typographic move rather than a mistake: a figure that oversteps its column reads as
 * deliberate, while one that stops exactly on the line reads as a placeholder.
 */
export const FITS = {
  snug:  { label: "snug",  size: 0.82, note: "sits inside its box with air around it" },
  fill:  { label: "fill",  size: 1.00, note: "exactly the box" },
  bleed: { label: "bleed", size: 1.14, note: "runs a little past the edges, on purpose" },
  wide:  { label: "wide",  size: 1.32, note: "well past — for a figure that wants the room" },
};

export const PLACES = ["start", "center", "end"];

/**
 * Apply a block's fit and placement. Used by the runtime and the builder alike.
 *
 * A bleed only oversteps on sides where there is somewhere to go. Left to itself it runs into
 * whatever is in the next box — which is the collision problem again, wearing a different hat.
 * So the cell reports which of its edges are free (the outside of the grid), and the overstep
 * is taken only on those; a figure in the left-hand column bleeds left into the margin and
 * stops square against the column beside it.
 */
export function applyPlacement(node, b, cell) {
  if (b.overlay) {
    const o = typeof b.overlay === "object" ? b.overlay : {};
    node.style.position = "absolute";
    node.style.zIndex = String(o.z ?? 2);
    for (const key of ["left", "right", "top", "bottom", "width", "height"])
      if (o[key] != null) node.style[key] = String(o[key]);
    if (o.pointerEvents === false) node.style.pointerEvents = "none";
  }
  const fit = FITS[b.fit];
  const size = b.size ?? fit?.size;
  if (size != null && size !== 1) {
    let over = (size - 1) * 50;
    let edges = cell?.dataset.edges ?? "lr";        // no grid at all: both sides are free
    /* A traced picture may overstep into a NEIGHBOUR as well, but only across the part of
     * itself that is transparent. It publishes the margin it measured; the overstep is capped
     * to it, so what lands on the neighbour is empty space and never a lit dot. */
    const holder = node.matches?.("[data-trace]") ? node : node.querySelector?.("[data-trace]");
    const inkL = parseFloat(holder?.dataset.inkLeft ?? "NaN");
    const inkR = parseFloat(holder?.dataset.inkRight ?? "NaN");
    if (Number.isFinite(inkL) && Number.isFinite(inkR)) {
      // the margin is a fraction of the image; `over` is a percentage of the box
      over = Math.min(over, Math.min(inkL, inkR) * 100);
      if (over > 0) edges = "lr";                   // safe on both sides now, by construction
    }
    const l = size > 1 ? (edges.includes("l") ? over : 0) : (1 - size) * 50;
    const r = size > 1 ? (edges.includes("r") ? over : 0) : (1 - size) * 50;
    node.style.width = `calc(100% + ${l + r}%)`;
    node.style.maxWidth = "none";
    node.style.marginLeft = `${-l}%`;
    node.style.marginRight = `${-r}%`;
  }
  // remembered, because revealSteps rewrites cssText and would otherwise drop it
  node.dataset.placement = [node.style.position && `position:${node.style.position}`,
                            node.style.zIndex && `z-index:${node.style.zIndex}`,
                            node.style.left && `left:${node.style.left}`,
                            node.style.right && `right:${node.style.right}`,
                            node.style.top && `top:${node.style.top}`,
                            node.style.bottom && `bottom:${node.style.bottom}`,
                            node.style.height && `height:${node.style.height}`,
                            node.style.pointerEvents && `pointer-events:${node.style.pointerEvents}`,
                            node.style.width && `width:${node.style.width}`,
                            node.style.marginLeft && `margin-left:${node.style.marginLeft}`,
                            node.style.marginRight && `margin-right:${node.style.marginRight}`,
                            node.style.maxWidth && `max-width:${node.style.maxWidth}`]
                           .filter(Boolean).join(";");
  if (b.x) node.style.alignSelf = { start: "flex-start", center: "center", end: "flex-end" }[b.x] || b.x;
  if (b.y) node.style.justifySelf = b.y;
  if (b.selfAlign) node.style.alignSelf = b.selfAlign;
}

/** Which blocks are currently visible in a box. */
export function occupants(cell, exclude) {
  return [...cell.children].filter((n) => n !== exclude && n.style.display !== "none"
    && !(n.classList.contains("step") && !n.classList.contains("shown")));
}

/**
 * What happens when a block arrives in a box that is already occupied.
 *
 * `flow` cannot collide — the box is a column and the arrival simply joins it — so it is the
 * default and the honest answer for most slides. The other two exist because sometimes the
 * point of the move IS that the new thing takes the old thing's place, and then the old thing
 * leaving needs to be visible rather than silently painted over.
 */
export const COLLISIONS = {
  flow:    { label: "flow",    note: "the box is a column; the arrival joins it" },
  replace: { label: "replace", note: "whatever is there fades out first, then the arrival lands" },
  swap:    { label: "swap",    note: "the occupant takes the box the mover just left" },
};

/**
 * Prepare every stepped block on a page: stash the entrance it wants, and hide it.
 *
 * The entrance is written as an inline style string rather than a class per variant, because
 * an author can then invent one in the .spiral file — `"enter": "opacity:0;transform:rotate(-3deg)"`
 * is as legal as `"enter": "rise"`.
 */
export function prepareSteps(page) {
  const steps = [...page.querySelectorAll(".step")];
  for (const [i, n] of steps.entries()) {
    const key = n.dataset.enter || "rise";
    n.dataset.fromStyle = ENTRANCES[key] ? ENTRANCES[key].from : key;
    // An explicit click can reveal related prose and maths together. Legacy step:true
    // blocks retain their original, one-block-per-click order.
    n.dataset.revealStep = n.dataset.revealAt || String(i + 1);
  }
  steps.revealCount = Math.max(0, ...steps.map(n => Number(n.dataset.revealStep)));
  return steps;
}

/** Show the first `count` stepped blocks; hide the rest. */
export function revealSteps(steps, count, animate = true) {
  steps.forEach((n, i) => {
    const on = Number(n.dataset.revealStep || i + 1) <= count;
    n.classList.toggle("shown", on);
    /* The class alone decides visibility — the stylesheet hides anything not `.shown`, from
     * the first paint. The inline style only carries the FLAVOUR of the entrance (which way
     * it comes from), so clearing it can never make a hidden block visible. */
    const keep = [];
    if (!animate) keep.push("transition:none");
    if (n.dataset.gridArea) keep.push(`grid-area:${n.dataset.gridArea}`);
    if (n.dataset.placement) keep.push(n.dataset.placement);
    n.style.cssText = (on ? "" : (n.dataset.fromStyle || "") + ";") + keep.join(";");
  });
  // Force the target state to commit before transitions are restored on a backward step.
  if (!animate && steps.length) {
    void steps[0].offsetWidth;
    steps.forEach((n) => n.style.removeProperty("transition"));
  }
}

/**
 * Move a block to another region, animating the difference.
 *
 * FLIP: read the rectangle now, make the change, read it again, then start the element at
 * the old position as a transform and let it transition to none. The browser does the layout;
 * we only ever animate a transform, which is why this stays smooth on a slow machine.
 */
export function flipTo(node, cell, ms = 620) {
  const before = node.getBoundingClientRect();
  cell.appendChild(node);
  node.dataset.gridArea = cell.dataset.cell;
  const after = node.getBoundingClientRect();
  const dx = before.left - after.left, dy = before.top - after.top;
  const sx = after.width ? before.width / after.width : 1;
  const sy = after.height ? before.height / after.height : 1;
  if (!dx && !dy && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return;
  node.style.transition = "none";
  node.style.transformOrigin = "top left";
  node.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
  // one frame at the old place, so the browser has something to animate away from
  requestAnimationFrame(() => {
    node.style.transition = `transform ${ms}ms cubic-bezier(.22,.72,.24,1)`;
    node.style.transform = "";
  });
}

/**
 * Apply whatever moves a slide's blocks declared for this step.
 *
 * A block writes `"moveTo": { "2": "aside" }` — at step 2 it travels to the `aside` region.
 * Steps are re-applied from scratch every time so stepping backwards puts everything back.
 */
export function applyMoves(page, blocks, step, cells, animate = true) {
  if (!cells) return;
  page.querySelectorAll("[data-block]").forEach((n) => {
    const b = blocks[+n.dataset.block];
    if (!b || !b.moveTo) return;
    let target = b.at;
    for (const [at, area] of Object.entries(b.moveTo)) if (step >= +at) target = area;
    const cell = cells.get(target);
    if (!cell || n.dataset.gridArea === target) return;

    const from = n.parentElement;
    const policy = b.collision || "flow";
    const there = occupants(cell, n);

    if (policy === "swap" && there.length && from?.dataset.cell) {
      // the two trade places, both animated, so the exchange is legible as an exchange
      const back = from;
      if (animate) { flipTo(n, cell); there.forEach((o) => flipTo(o, back)); }
      else { cell.appendChild(n); there.forEach((o) => back.appendChild(o)); }
      n.dataset.gridArea = target;
      there.forEach((o) => { o.dataset.gridArea = back.dataset.cell; });
      return;
    }

    if (policy === "replace" && there.length && animate) {
      // let the room see the old thing go before the new one arrives in its place
      there.forEach((o) => { o.style.transition = "opacity .3s ease"; o.style.opacity = "0"; });
      setTimeout(() => {
        there.forEach((o) => { o.style.display = "none"; });
        flipTo(n, cell);
      }, 300);
      n.dataset.gridArea = target;
      return;
    }

    if (animate) flipTo(n, cell);
    else { cell.appendChild(n); n.dataset.gridArea = target; }
  });
}
