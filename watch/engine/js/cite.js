/* Citations: a bibliography, numbered markers in the text, and the sources named on the page.
 *
 * A talk that states something should be able to say where it comes from without breaking the
 * line to do it. So the deck loads a .bib once, prose writes `[@key]`, and the marker becomes a
 * small accent number exactly where it was written. What that number refers to sits in a
 * rounded bubble at the foot of the slide, in type small enough to be there without competing —
 * readable by anyone who looks, invisible to anyone who does not.
 *
 * Numbering is PER DECK and assigned in reading order, so [1] is the first thing cited in the
 * talk and stays [1] on every slide it appears on. Numbering per slide would mean the same
 * paper is [1] here and [3] later, which is the one thing a reader cannot forgive.
 */

/**
 * The keys inside one `[@…]`.
 *
 * Written pandoc-style, several sources share a marker as `[@a; @b]` — so every key after the
 * first arrives with its own `@` still attached. Left on, `@krogh1919` became a separate
 * source from `krogh1919` and the same paper appeared twice with two numbers.
 */
export function splitKeys(inside) {
  return inside.split(/[;,]/).map((k) => k.trim().replace(/^@+/, "")).filter(Boolean);
}

/** A small BibTeX reader: enough for the fields a slide shows, and forgiving of the rest. */
export function parseBib(text) {
  const out = new Map();
  // @type{key, field = {value}, field = "value", ...}
  const entry = /@(\w+)\s*\{\s*([^,\s]+)\s*,([\s\S]*?)\n\}/g;
  let m;
  while ((m = entry.exec(text))) {
    const [, type, key, body] = m;
    const fields = {};
    // a value is {braced, possibly {nested}}, "quoted", or bare
    const f = /(\w+)\s*=\s*(\{(?:[^{}]|\{[^{}]*\})*\}|"[^"]*"|[^,\n]+)/g;
    let g;
    while ((g = f.exec(body))) {
      let v = g[2].trim().replace(/^[{"]|[}"]$/g, "").trim();
      v = v.replace(/\s+/g, " ").replace(/[{}]/g, "");
      fields[g[1].toLowerCase()] = v;
    }
    out.set(key, { key, type, ...fields });
  }
  return out;
}

/** How one entry reads on a slide: short, and enough to find the paper. */
export function shortForm(e) {
  if (!e) return "";
  const authors = (e.author || "").split(/\s+and\s+/).filter(Boolean);
  const surname = (a) => (a.includes(",") ? a.split(",")[0] : a.split(/\s+/).pop() || a).trim();
  const who =
    authors.length === 0 ? "" :
    authors.length === 1 ? surname(authors[0]) :
    authors.length === 2 ? `${surname(authors[0])} & ${surname(authors[1])}` :
    `${surname(authors[0])} et al.`;
  const where = e.journal || e.booktitle || e.publisher || e.school || "";
  const bits = [who, e.year, e.title, where].filter(Boolean);
  return bits.join(", ");
}

/**
 * Walk the deck once and give every cited key its number.
 *
 * Reading order over the whole deck, so a key keeps one number everywhere. Anything the .bib
 * does not have still gets a number and is shown as the key itself — a missing entry should
 * be visible on the slide, not silently dropped, because a citation nobody can follow is
 * worse than an ugly one.
 */
export function numberDeck(deck, bib) {
  const order = new Map();
  const CITE = /\[@([^\]]+)\]/g;
  const scan = (s) => {
    if (typeof s !== "string") return;
    let m;
    while ((m = CITE.exec(s))) {
      for (const key of splitKeys(m[1])) {
        if (!order.has(key)) order.set(key, order.size + 1);
      }
    }
  };
  const walk = (v) => {
    if (typeof v === "string") scan(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(deck.slides || []);
  return order;
}

/** Replace `[@key]` with accent markers. Returns HTML; the caller has already escaped. */
export function markers(html, numbers) {
  return html.replace(/\[@([^\]]+)\]/g, (_, keys) => {
    const ns = splitKeys(keys).map((k) => numbers.get(k)).filter(Boolean);
    if (!ns.length) return "";
    return `<span class="cite">[${ns.join(",")}]</span>`;
  });
}

/** Which keys a slide actually cites, in the order they appear on it. */
export function keysOn(slide) {
  const found = [];
  const CITE = /\[@([^\]]+)\]/g;
  const scan = (s) => {
    if (typeof s !== "string") return;
    let m;
    while ((m = CITE.exec(s))) {
      for (const k of splitKeys(m[1])) {
        if (!found.includes(k)) found.push(k);
      }
    }
  };
  const walk = (v) => {
    if (typeof v === "string") scan(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(slide);
  return found;
}

/**
 * The bubble at the foot of the page.
 *
 * Only the sources cited ON THIS SLIDE, so it stays short enough to be worth glancing at.
 * Built as an element rather than a block so it cannot be dragged into a box or accidentally
 * deleted — it belongs to the page, not to its content.
 */
export function sourcesBubble(slide, bib, numbers) {
  const keys = keysOn(slide);
  if (!keys.length) return null;
  const box = document.createElement("div");
  box.className = "sources";
  for (const k of keys) {
    const n = numbers.get(k);
    const row = document.createElement("span");
    row.className = "src";
    const num = document.createElement("span");
    num.className = "cite";
    num.textContent = `[${n}]`;
    row.appendChild(num);
    const txt = document.createElement("span");
    // an entry the bibliography does not have is shown as its key, not hidden
    txt.textContent = bib.has(k) ? shortForm(bib.get(k)) : `${k} — not in the bibliography`;
    if (!bib.has(k)) txt.className = "missing";
    row.appendChild(txt);
    box.appendChild(row);
  }
  return box;
}

/** Load a .bib beside the deck. A deck without one simply has no citations. */
export async function loadBib(url) {
  if (!url) return new Map();
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return new Map();
    return parseBib(await r.text());
  } catch (e) {
    return new Map();
  }
}
