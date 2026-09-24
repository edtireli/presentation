/* Maths, typeset by KaTeX — vendored, so a deck works with no network at all. That matters
 * more here than anywhere else in the system: a conference room's wifi is exactly the thing
 * you cannot rely on, and a presentation that renders its equations from a CDN is one
 * captive portal away from being blank.
 */
export function renderMath(node, tex, display = true) {
  if (!tex) return;
  if (!window.katex) { node.textContent = tex; return; }
  try {
    window.katex.render(tex, node, {
      displayMode: display,
      throwOnError: false,
      // models and humans both emit slightly wrong TeX; showing the source beats an
      // empty box in front of an audience
      errorColor: getComputedStyle(document.documentElement)
        .getPropertyValue("--danger").trim() || "#E5705B",
      strict: false,
      /* Sub-expressions need to be addressable, or an arrow can only ever point at a whole
       * equation. \htmlId{leak}{K_i\int C_a} makes that term a target an annotation can
       * measure. Only the two markup commands are trusted — never \url or \includegraphics,
       * which is what `trust: true` would otherwise hand to whatever wrote the deck. */
      trust: (ctx) => ctx.command === "\\htmlId" || ctx.command === "\\htmlClass",
    });
  } catch (e) {
    node.textContent = tex;
  }
}

/**
 * Shrink a display equation until it fits its column.
 *
 * A slide cannot scroll, so an equation wider than the measure is an equation with its right
 * half missing — and the horizontal scrollbar that appears instead draws a grey bar straight
 * through the middle of the maths. KaTeX lays out in ems, so width is proportional to the
 * font size and one measurement gives the exact ratio; no loop needed.
 *
 * Only ever shrinks. An equation that already fits is left at the size the style asked for.
 */
export function fitMath(node) {
  const inner = node.querySelector(".katex-display") || node.querySelector(".katex");
  if (!inner) return;
  const avail = node.clientWidth;
  const want = inner.scrollWidth || inner.getBoundingClientRect().width;
  if (!avail || !want || want <= avail) return;
  const size = parseFloat(getComputedStyle(inner).fontSize);
  inner.style.fontSize = `${size * (avail / want) * 0.98}px`;
}
