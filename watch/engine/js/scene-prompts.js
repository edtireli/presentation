// Short, editable speaking prompts attached to an existing scene's reveal clock.
// They add no steps and never advance the deck or delay its animation.
export function mountScenePrompts(holder, spec) {
  if (!spec?.bullets?.length) return () => {};
  const panel = document.createElement('aside');
  panel.className = 'scene-speaking-prompts';
  const prompts = createTypedPromptList(holder, spec.bullets, {remember:true, visibleClass:'prompt-visible'});
  const {list,rows} = prompts;
  panel.append(list);
  holder.classList.add('has-scene-prompts');
  holder.append(panel);
  let wasVisible = false;
  return (step = 0, nav = {}) => {
    const visible = step >= (spec.from ?? 0) && step <= (spec.until ?? Infinity)
      && !(spec.hiddenSteps || []).includes(step);
    const instant = nav.settled || nav.backward || nav.directEnd
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const returning = visible && !wasVisible;
    // A display:none parent has no interpolated starting opacity. Establish that
    // starting frame before returning the prompts after a full-canvas image aside.
    if (returning && !instant) {
      rows.forEach(li => {
        li.style.transitionDuration = '0s';
        li.style.transitionDelay = '0s';
        li.classList.remove('prompt-visible');
      });
    }
    panel.hidden = !visible;
    if (returning && !instant) void panel.offsetHeight;
    prompts.paint(rows.map((_, i) => visible && step >= (spec.bullets[i].from ?? 0)), nav);
    rows.forEach((li, i) => {
      // Only the already-written return from the movie fades back in. First
      // reveals use the letter/phrase rhythm without an overlapping row fade.
      const fade = returning && !instant && li.dataset.typingInstant === 'true';
      li.style.transitionDuration = fade ? '' : '0s';
      li.style.transitionDelay = fade ? `${0.12 + i * 0.2}s` : '0s';
    });
    wasVisible = visible;
  };
}
import {createTypedPromptList} from './typed-prompts.js';
