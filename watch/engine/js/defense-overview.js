// Short prompts follow the spoken opening, with one new bullet on each Next.
export function renderDefenseOverview(block = {}) {
  if (!document.querySelector('link[data-defense-overview]')) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = new URL('../css/defense-overview.css', import.meta.url).href;
    css.dataset.defenseOverview = '';
    document.head.append(css);
  }
  const holder = document.createElement('section');
  holder.className = 'defense-overview scene-holder';
  holder.sceneSteps = Math.max(0, (block.bullets || []).length - 1);
  const prompts = createTypedPromptList(holder, block.bullets || [], {visibleClass:'overview-visible'});
  const {list} = prompts;
  holder.append(list);
  holder.repaint = (next = 0, nav = {}) => {
    const step = Math.max(0, Math.min(holder.sceneSteps, Number(next) || 0));
    holder.dataset.overviewStep = step;
    prompts.paint(prompts.rows.map((_, i) => i <= step), nav);
  };
  holder.repaint(0);
  holder.dataset.overviewReady = 'true';
  return holder;
}
import {createTypedPromptList} from './typed-prompts.js';
