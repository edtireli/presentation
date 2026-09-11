// Plain reading works independently of presentation setup, storage and effects.
(() => {
  document.documentElement.dataset.ackRoute = 'ready';
  const ack = document.querySelector('#acknowledgements');
  const landing = document.querySelector('#landing');
  const content = document.querySelector('#ack-text');
  const offer = document.querySelector('#complaint-offer');
  const complaint = document.querySelector('#complaint-dialog');
  const paragraphs = [...content.querySelectorAll('p')].map(p => p.textContent);
  let timer = 0, enhancing = false, enhanced = false;

  async function enhance() {
    if (enhancing || enhanced) return;
    enhancing = true;
    try {
      const {renderAcknowledgementParagraph} = await import('./acknowledgement-names.js');
      const nodes = paragraphs.map(renderAcknowledgementParagraph);
      content.replaceChildren(...nodes);
      enhanced = true;
    } catch (error) {
      // Optional animation support must never replace the readable text with an error.
      console.warn('Acknowledgement effects unavailable:', error);
    } finally { enhancing = false; }
  }

  function sync() {
    const reading = location.hash === '#acknowledgements';
    const changed = reading === ack.hidden;
    ack.hidden = !reading;
    landing.hidden = reading;
    document.body.classList.toggle('is-reading-ack', reading);
    document.querySelector('#ack-status').hidden = true;
    if (!changed) return;
    clearTimeout(timer);
    offer.hidden = true;
    if (complaint.open) complaint.close();
    scrollTo(0, 0);
    if (reading) {
      document.querySelector('#ack-title').focus({preventScroll: true});
      timer = setTimeout(() => { if (!ack.hidden) offer.hidden = false; }, 5000);
      void enhance();
    } else document.querySelector('#read-acknowledgements').focus({preventScroll: true});
  }

  document.querySelector('#read-acknowledgements').addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (location.hash !== '#acknowledgements') {
      const url = new URL(location.href); url.hash = 'acknowledgements';
      history.pushState({...history.state, spiralAcknowledgementsEntry: true}, '', url);
    }
    sync();
  });
  function back(event) {
    event?.preventDefault();
    if (history.state?.spiralAcknowledgementsEntry) { history.back(); return; }
    const url = new URL(location.href); url.hash = '';
    history.replaceState(history.state, '', url); sync();
  }
  document.querySelector('#close-ack').addEventListener('click', back);
  document.querySelector('[data-ack-back]').addEventListener('click', back);
  addEventListener('popstate', sync);
  addEventListener('hashchange', sync);
  addEventListener('keydown', event => {
    if (event.key === 'Escape' && !ack.hidden && !complaint.open) back(event);
  });
  addEventListener('pagehide', () => clearTimeout(timer));
  sync();
})();
