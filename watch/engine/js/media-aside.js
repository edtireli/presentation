// A presenter-controlled image or GIF over an otherwise unchanged slide.
let replay = 0;
export function renderMediaAside(spec) {
  const holder = document.createElement('div');
  holder.className = 'media-aside scene-holder';
  holder.hidden = true;
  holder.setAttribute('role', 'group');
  holder.setAttribute('aria-label', spec.alt || 'Media aside');
  const showAt = spec.showAt ?? 1, resumeAt = spec.resumeAt ?? showAt + 1;
  holder.sceneSteps = resumeAt;
  let showing = false;
  holder.repaint = (step = 0) => {
    const active = step >= showAt && step < resumeAt;
    holder.dataset.asideVisible = String(active);
    if (active === showing) return;
    showing = active;
    holder.hidden = !active;
    holder.replaceChildren();
    if (!active) return;
    const img = document.createElement('img');
    img.className = 'media-aside-image';
    img.alt = spec.alt || '';
    const src = new URL(spec.src, document.baseURI);
    src.searchParams.set('replay', String(++replay));
    img.src = src.href;
    const hint = document.createElement('div');
    hint.className = 'media-aside-hint';
    hint.textContent = 'Next click returns to the slide';
    holder.append(img, hint);
  };
  return holder;
}
