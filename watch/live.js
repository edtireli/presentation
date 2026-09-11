/* Public audience client. Presenter-only broadcasting uses a short-lived session;
 * local slide navigation remains independent of the live service. */
let requestPresenterAccess, currentPresenterAccess, guardPresenterRouteAccess;

export function parseLiveRoute(route) {
  if (typeof route !== 'string' || route.length > 240) return null;
  const match = /^([a-zA-Z0-9][a-zA-Z0-9_-]*)(?:\/(\d{1,4}))?$/.exec(route);
  if (!match) return null;
  const step = Number(match[2] || 0);
  return {slug: match[1], step, route: `${match[1]}/${step}`};
}

export function validLiveState(value) {
  return !!value && typeof value === 'object'
    && Number.isSafeInteger(value.revision) && value.revision >= 0
    && typeof value.playing === 'boolean'
    && (value.sessionId === null || typeof value.sessionId === 'string')
    && (value.route === null || !!parseLiveRoute(value.route));
}

export function applyLiveRoute(deck, route, settled = false) {
  const parsed = parseLiveRoute(route);
  if (!parsed) return false;
  const index = deck.deck.slides.findIndex(slide => slide._slug === parsed.slug);
  if (index < 0) return false;
  if (deck.currentState().route === parsed.route) return true;
  if (index === deck.i) {
    const backward = parsed.step < deck.step;
    deck.step = parsed.step;
    const page = deck.stage.querySelector('.slide.incoming') || deck.stage.lastElementChild;
    deck.reveal(page, !settled, settled || backward ? {settled: true, backward} : undefined);
    deck.syncBar();
    deck.syncLocation({replace: true});
  } else {
    deck.show(index, {keepStep: parsed.step, instant: settled, settled, replaceUrl: true});
  }
  return true;
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function panel(host = false) {
  if (!document.getElementById('spiral-live-style')) {
    const style = element('style');style.id = 'spiral-live-style';
    style.textContent = `.spiral-live-controls{position:fixed;right:12px;bottom:12px;z-index:100100;display:flex;flex-wrap:wrap;align-items:center;gap:8px;max-width:min(650px,calc(100vw - 24px));padding:9px 12px;border:1px solid #555;border-radius:8px;background:rgba(13,13,13,.94);color:#eee;font:12px/1.4 system-ui,sans-serif;box-shadow:0 3px 20px #0008}.spiral-live-controls button,.spiral-live-controls input{font:inherit;border:1px solid #777;border-radius:5px;padding:7px 9px;background:#191919;color:#fff}.spiral-live-controls button{cursor:pointer}.spiral-live-controls button:disabled{opacity:.5;cursor:default}.spiral-live-controls input{width:170px}.spiral-live-controls label{display:flex;align-items:center;gap:6px}.spiral-live-controls [role=status]{max-width:340px;color:#c9c7c2}.spiral-live-host{position:relative;left:auto;right:auto;bottom:auto;margin:12px;max-width:none}.spiral-live-follow #hint,.spiral-live-follow #bar,.spiral-live-follow #panel,.spiral-live-follow #chapters,.spiral-live-follow #open-speaker,.spiral-live-follow .spiral-narration,.spiral-live-follow #presentation-editor-toggle{display:none!important}`;
    document.head.append(style);
  }
  const section = element('section', '', `spiral-live-controls${host && /speaker\.html$/.test(location.pathname) ? ' spiral-live-host' : ''}`);
  section.setAttribute('aria-label', host ? 'Live broadcast controls' : 'Live presentation status');
  const status = element('span');status.setAttribute('role', 'status');status.setAttribute('aria-live', 'polite');
  section.append(status);
  if (host && /speaker\.html$/.test(location.pathname)) document.body.prepend(section);
  else document.body.append(section);
  let previous = '';
  return {section, status, say(text) {if (text !== previous) {status.textContent = text;previous = text;}}};
}

async function configuration() {
  const response = await fetch(new URL('./live-config.json', import.meta.url), {cache: 'no-store'});
  if (!response.ok) throw Error('Live connection is unavailable.');
  const config = await response.json();
  if (typeof config.apiBase !== 'string' || typeof config.viewerToken !== 'string' || !config.viewerToken) throw Error('Live connection is not configured.');
  const url = new URL(config.apiBase);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw Error('Live connection requires HTTPS.');
  return {...config, apiBase: config.apiBase.replace(/\/$/, '')};
}

async function waitForDeck(timeoutMs = 30000) {
  const started = Date.now();
  while (!window.deck?.currentState) {
    if (Date.now() - started > timeoutMs) throw Error('The presentation did not finish loading.');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return window.deck;
}

export function createLiveFollower({deck, config, ui, fetcher = fetch, documentObject = document, pollMs = 500}) {
  let stopped = false, busy = false, timer = null, controller = null, nextPollAt = 0;
  let lastRevision = -1, lastSession = null, first = true, connected = false;
  const schedule = () => {clearTimeout(timer);if (!stopped && !documentObject.hidden) timer = setTimeout(poll, Math.max(0, nextPollAt - performance.now()));};
  async function poll() {
    if (stopped || busy || documentObject.hidden) return;
    busy = true;nextPollAt = performance.now() + pollMs;controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 7000);
    try {
      const response = await fetcher(`${config.apiBase}/live`, {cache: 'no-store', headers: {Authorization: `Bearer ${config.viewerToken}`}, signal: controller.signal});
      if (!response.ok) throw Error(response.status === 401 || response.status === 403 ? 'Live access was not accepted.' : 'Connection lost · reconnecting…');
      const state = await response.json();
      if (!validLiveState(state)) throw Error('Waiting for a valid presenter update…');
      const wasConnected = connected;connected = true;
      // Server revisions are monotonically increasing, including new sessions.
      // Older responses can never rewind the deck after a newer update.
      if (state.revision > lastRevision) {
        const changedSession = state.sessionId !== lastSession;
        if (state.route && state.playing) {
          const applied = applyLiveRoute(deck, state.route, first || changedSession || !wasConnected);
          if (!applied) {ui.say('The presenter is on a slide unavailable in this version.');return;}
          first = false;
        }
        lastRevision = state.revision;lastSession = state.sessionId;
      }
      ui.say(state.playing ? 'Following the presenter live' : state.sessionId ? 'Broadcast paused · waiting for the presenter' : 'Waiting for the presenter to start');
    } catch (error) {
      connected = false;
      if (!stopped && !documentObject.hidden) ui.say(error.name === 'AbortError' ? 'Connection lost · reconnecting…' : error.message);
    } finally {
      clearTimeout(timeout);controller = null;busy = false;schedule();
    }
  }
  const visibility = () => {clearTimeout(timer);if (documentObject.hidden) controller?.abort();else if (!busy) poll();};
  documentObject.addEventListener('visibilitychange', visibility);
  ui.say('Connecting to the presenter…');poll();
  return {get state() {return {lastRevision, lastSession, connected};}, poll,
    stop() {stopped = true;clearTimeout(timer);controller?.abort();documentObject.removeEventListener('visibilitychange', visibility);}};
}

export function createLivePublisher({config, route, ui, fetcher = fetch, sessionId = () => crypto.randomUUID(), heartbeatMs = 10000}) {
  let key = '', session = null, sequence = 0, desiredRoute = null, desiredPlaying = false;
  let lastRoute = null, lastPlaying = null, active = false, busy = false, force = false;
  let heartbeat = null, retry = null, disposed = false, pendingPacket = null;
  const reflect = () => ui.reflect?.({active, busy, stopping: active && !desiredPlaying});
  function endLocal(message) {active = false;desiredPlaying = false;key = '';clearInterval(heartbeat);clearTimeout(retry);ui.say(message);reflect();}
  async function pump() {
    if (disposed || busy || !active || !desiredRoute) return;
    if (!force && desiredRoute === lastRoute && desiredPlaying === lastPlaying) return;
    clearTimeout(retry);retry = null;busy = true;force = false;reflect();
    // Preserve uncertain packets. Established updates can be retried unchanged;
    // sequence 1 must be reconciled by a read, never automatically replayed.
    const retryingInitial = pendingPacket?.sequence === 1;
    const payload = pendingPacket || {sessionId: session, route: desiredRoute, playing: desiredPlaying, sequence: ++sequence};
    pendingPacket = payload;
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 7000);
    try {
      let state = null;
      if (retryingInitial) {
        // Sequence 1 is an explicit takeover operation. Even an empty GET cannot
        // make a replay safe: a newer host may start between that read and POST.
        // A confirmed own packet can resume at sequence 2; every other outcome
        // requires the presenter to press Start again with a fresh session.
        const unconfirmed = 'The initial connection was not confirmed. Start again only if you intend to broadcast.';
        let current;
        try {
          const read = await fetcher(`${config.apiBase}/live`, {cache: 'no-store', headers: {Authorization: `Bearer ${key}`}, signal: controller.signal});
          if (read.status === 401 || read.status === 403) {endLocal('Presenter session expired or not accepted. Sign in again.');return;}
          if (!read.ok) throw Error('Unconfirmed');
          current = await read.json();
        } catch {endLocal(unconfirmed);return;}
        if (!validLiveState(current) || current.sessionId !== session || current.sequence !== payload.sequence || current.route !== payload.route || current.playing !== payload.playing) {
          endLocal(unconfirmed);return;
        }
        state = current;
      }
      if (!state) {
        const response = await fetcher(`${config.apiBase}/live`, {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${key}`}, body: JSON.stringify(payload), signal: controller.signal});
        if (response.status === 401 || response.status === 403) {endLocal('Presenter session expired or not accepted. Sign in again.');return;}
        if (response.status === 409) {
          let current = null;try {current = await response.json();} catch {}
          // A lost success response makes a safe identical retry stale. Its
          // matching server state is an acknowledgement, not a replacement.
          if (validLiveState(current) && current.sessionId === session && current.sequence === payload.sequence && current.route === payload.route && current.playing === payload.playing) state = current;
          else {endLocal('This broadcast was replaced. Start again only if you intend to take over.');return;}
        } else {
          if (!response.ok) throw Error('Connection lost · retrying the latest slide…');
          state = await response.json();
        }
      }
      if (!validLiveState(state) || state.sessionId !== session) throw Error('Presenter update was not confirmed.');
      pendingPacket = null;
      lastRoute = payload.route;lastPlaying = payload.playing;
      if (!payload.playing && !desiredPlaying) {endLocal('Live broadcast stopped.');return;}
      ui.say('Broadcasting live · slide changes are shared');
    } catch (error) {
      if (!disposed && active) {
        ui.say(desiredPlaying ? 'Connection lost · retrying the latest slide…' : 'Stopping… connection unavailable; the broadcast expires automatically.');
        force = true;clearTimeout(retry);retry = setTimeout(() => {retry = null;pump();}, 1500);
      }
    } finally {
      clearTimeout(timeout);busy = false;reflect();
      if (active && !retry && (force || desiredRoute !== lastRoute || desiredPlaying !== lastPlaying)) queueMicrotask(pump);
    }
  }
  return {
    get active() {return active;},
    start(presenterToken) {
      if (active || disposed) return false;
      const parsed = parseLiveRoute(route());
      if (!parsed) {ui.say('Open the audience presentation first so its current slide can be shared.');return false;}
      if (typeof presenterToken !== 'string' || !presenterToken.trim()) {ui.say('Sign in to start a live broadcast.');return false;}
      key = presenterToken.trim();session = sessionId();sequence = 0;pendingPacket = null;desiredRoute = parsed.route;desiredPlaying = true;
      lastRoute = null;lastPlaying = null;active = true;force = true;
      heartbeat = setInterval(() => {if (active) {force = true;pump();}}, heartbeatMs);
      ui.say('Starting live broadcast…');pump();return true;
    },
    update(value) {const parsed = parseLiveRoute(value);if (parsed && active && parsed.route !== desiredRoute) {desiredRoute = parsed.route;pump();}},
    stop() {if (!active) return;desiredPlaying = false;force = true;clearInterval(heartbeat);ui.say('Stopping live broadcast…');pump();},
    dispose() {disposed = true;clearInterval(heartbeat);clearTimeout(retry);key = '';active = false;},
  };
}

async function audience(config) {
  const ui = panel(), deck = await waitForDeck();
  window.spiralNarration?.suspendForPresenter?.();
  const originalPreview = deck.preview, originalInert = deck.root.inert;
  deck.preview = true;deck.root.inert = true;document.body.classList.add('spiral-live-follow');
  const leave = element('button', 'Explore independently');leave.type = 'button';ui.section.append(leave);
  const follower = createLiveFollower({deck, config, ui});
  leave.onclick = () => {
    follower.stop();deck.preview = originalPreview;deck.root.inert = originalInert;
    document.body.classList.remove('spiral-live-follow');
    const url = new URL(location.href);url.searchParams.delete('live');url.searchParams.delete('narration');
    history.replaceState(null, '', url);ui.say('Independent view');leave.textContent = 'Follow live again';
    leave.onclick = () => {url.searchParams.set('live', '1');location.href = url.href;};
  };
  addEventListener('pagehide', () => follower.stop(), {once: true});
  window.spiralLive = {mode: 'audience', follower};
}

async function presenter() {
  ({requestPresenterAccess, currentPresenterAccess, guardPresenterRouteAccess} = await import(new URL('../presenter-access.js', import.meta.url).href));
  const access = await guardPresenterRouteAccess();
  if (!access) return;
  const {ensurePresenterReady} = await import(new URL('../presenter-ready.js', import.meta.url).href);
  if (!await ensurePresenterReady()) return;
  const ui = panel(true);
  ui.section.setAttribute('aria-label', 'Presenter controls');
  const start = element('button', 'Start live broadcast'), stop = element('button', 'Stop broadcast');
  const download = element('button', 'Download for offline'), storageStatus = element('span', 'Checking offline files…');
  start.type = stop.type = download.type = 'button';stop.disabled = true;download.disabled = true;
  storageStatus.id = 'spiral-offline-status';storageStatus.setAttribute('role', 'status');storageStatus.setAttribute('aria-live', 'polite');
  download.setAttribute('aria-describedby', storageStatus.id);
  const progress = element('progress');progress.hidden = true;progress.setAttribute('aria-label', 'Offline download progress');
  ui.section.append(start, stop, download, progress, storageStatus);
  let latestRoute = window.deck?.currentState?.().route || null;
  let publisher = null, starting = false, disposed = false, offlineAPI = null;
  const isOffline = () => navigator.onLine === false;
  const localStatus = () => isOffline() ? 'Offline · presenting locally. Live broadcast unavailable.'
    : currentPresenterAccess()?.canBroadcast ? 'Broadcast is off' : 'Presenting locally · sign in to broadcast';
  const originalSay = ui.say;
  ui.say = message => originalSay(isOffline() ? localStatus() : message);
  ui.reflect = state => {start.disabled = isOffline() || starting || !!state?.active;stop.disabled = !state?.active || !!state?.stopping;};
  ui.say(localStatus());ui.reflect();
  const session = new URLSearchParams(location.search).get('presenterSession') || window.spiralPresenter?.session;
  const channel = session ? new BroadcastChannel(`spiral-presenter:${session}`) : null;
  const update = value => {if (parseLiveRoute(value)) {latestRoute = value;publisher?.update(value);}};
  const change = event => update(event.detail?.route);
  document.addEventListener('spiral:statechange', change);
  // This local channel carries the host's own deck state. It never consumes
  // audience/server routes, so remote viewers cannot move presenter slides.
  channel?.addEventListener('message', ({data}) => {if (data?.type === 'state') update(data.state?.route);});
  channel?.postMessage({type: 'hello'});
  start.onclick = async () => {
    if (starting || publisher?.active || isOffline()) return;
    starting = true;ui.reflect();
    try {
      const session = await requestPresenterAccess({forBroadcast: true});
      if (disposed || !session?.canBroadcast || !session.token || isOffline()) {ui.say(localStatus());return;}
      const config = await configuration();
      if (disposed || isOffline()) return;
      publisher?.dispose();
      publisher = createLivePublisher({config, route: () => window.deck?.currentState?.().route || latestRoute, ui});
      publisher.start(session.token);
    } catch (error) {ui.say(error.message || 'Live connection unavailable. Local presenting is unaffected.');}
    finally {starting = false;ui.reflect({active: publisher?.active});}
  };
  stop.onclick = () => publisher?.stop();
  const connection = () => {
    // Losing connectivity ends this local publisher. Reconnection never starts
    // it again: the presenter must explicitly press Start and validate access.
    if (isOffline()) {publisher?.dispose();publisher = null;}
    ui.say(localStatus());ui.reflect({active: publisher?.active});
  };
  addEventListener('offline', connection);addEventListener('online', connection);
  const showOffline = state => {
    const ready = state?.ready === true && state?.verified === true;
    download.disabled = ready || state?.supported === false;
    download.textContent = ready ? 'Offline files ready' : 'Download for offline';
    progress.hidden = true;
    storageStatus.textContent = ready ? `Available offline · saved ${new Date(state.verifiedAt).toLocaleDateString()} · version ${state.revision?.slice(0, 8) || 'verified'}`
      : state?.supported === false ? 'This browser does not support offline saving.' : 'Offline files have not been fully downloaded and verified.';
  };
  // The shell API is outside /app/. Importing it and reading status do not start
  // a package download; only the explicit button calls prepareOffline().
  try {
    offlineAPI = await import(new URL('../offline.js', import.meta.url).href);
    const state = await offlineAPI.offlineStatus();if (!disposed) showOffline(state);
  } catch {storageStatus.textContent = 'Offline preparation is unavailable. Local slides remain usable.';download.disabled = false;}
  download.onclick = async () => {
    if (!offlineAPI) {storageStatus.textContent = 'Reload when connected to prepare the presentation offline.';return;}
    download.disabled = true;
    try {
      await offlineAPI.requestPersistentStorage();
      const ready = await offlineAPI.prepareOffline({onProgress: state => {
        if (disposed) return;
        const completed = Number(state.completed) || 0, total = Number(state.total) || 0;
        progress.hidden = false;progress.max = total || 1;progress.value = completed;
        const bytes = Number(state.bytesCompleted) || 0;
        storageStatus.textContent = state.phase === 'verifying' ? 'Verifying every offline file…'
          : state.phase === 'ready' ? 'Checking completed download…'
          : `${state.resumed ? 'Resuming' : 'Downloading'} offline files · ${completed} / ${total || '…'} · ${(bytes / 1048576).toFixed(1)} MB`;
      }});
      if (!disposed) showOffline(ready);
    } catch (error) {
      if (!disposed) {progress.hidden = true;download.disabled = false;download.textContent = 'Download for offline';storageStatus.textContent = error.message || 'Download interrupted. Retry to resume.';}
    }
  };
  addEventListener('pagehide', () => {
    disposed = true;publisher?.dispose();channel?.close();document.removeEventListener('spiral:statechange', change);
    removeEventListener('offline', connection);removeEventListener('online', connection);
  }, {once: true});
  window.spiralLive = {mode: 'presenter', get publisher() {return publisher;}};
}

export async function installLivePresentation() {
  const params = new URLSearchParams(location.search);
  if (params.get('presenterPreview') === '1') return;
  const isAudience = params.get('live') === '1';
  const isPresenter = !isAudience && (/speaker\.html$/.test(location.pathname) || params.get('broadcast') === '1');
  if (!isAudience && !isPresenter) return;
  try {
    // The mobile landscape frame receives authoritative route updates from its
    // outer page. It keeps the live read-only policy without a second poller.
    if (isAudience && params.get('spiralLandscape') === '1' && window.parent !== window) {
      const deck = await waitForDeck();deck.preview = true;deck.root.inert = true;
      document.body.classList.add('spiral-live-follow');
      window.spiralLive = {mode: 'mirrored-audience'};return;
    }
    if (isAudience) await audience(await configuration());else await presenter();
  } catch (error) {panel(isPresenter).say(error.message || 'Live connection unavailable.');}
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => installLivePresentation(), {once: true});
  else installLivePresentation();
}
