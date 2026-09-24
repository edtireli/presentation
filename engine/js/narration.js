/* Optional prerecorded narration for Spiral.
 *
 * This module is deliberately inert unless the URL contains `?narration=1`. The deck can
 * point at a manifest with either
 *
 *   { "narration": { "manifest": "decks/talk.narration.json" } }
 *
 * or the rehearsal URL can override it with `&narrationManifest=...`.
 *
 * A manifest maps stable reveal routes (`slide-slug/zero-based-step`) to audio. Explicit
 * per-state URLs are the simplest form:
 *
 *   { "states": { "opening/0": { "audio": "audio/opening--0.wav" } } }
 *
 * For generated libraries, `audioTemplate` may contain {route}, {slug}, and {step}. Relative
 * audio URLs resolve beside the manifest unless `audioBaseUrl` is supplied.
 */

const ACTIVE_VALUE = "1";
const EVENT_NAME = "spiral:statechange";

function narrationRequested() {
  if (window.spiralNarrationReleaseAt && Date.now() < Date.parse(window.spiralNarrationReleaseAt)) return false;
  const query = new URLSearchParams(location.search);
  return query.get("narration") === ACTIVE_VALUE
    && !query.has("presenterSession") && query.get("presenterPreview") !== "1";
}

function manifestSetting(deck) {
  const query = new URLSearchParams(location.search);
  const override = query.get("narrationManifest") || query.get("narration-manifest");
  if (override) return override;

  const metadata = deck?.deck?.narration;
  if (typeof metadata === "string") return metadata;
  return metadata?.manifest || metadata?.src || deck?.deck?.narrationManifest || "";
}

function cleanRoute(route) {
  return String(route || "")
    .replace(/^#/, "")
    .replace(/^\/+|\/+$/g, "");
}

function deckRoute(deck) {
  const slide = deck?.deck?.slides?.[deck.i];
  const slug = slide?._slug || slide?.id;
  if (!slug) return "";
  const step = Number.isFinite(Number(deck.step)) ? Number(deck.step) : 0;
  return `${slug}/${step}`;
}

function eventRoute(detail, deck) {
  const route = cleanRoute(detail?.route);
  if (route) return /\/\d+$/.test(route) ? route : `${route}/${Number(detail?.step) || 0}`;
  if (detail?.slug) return `${cleanRoute(detail.slug)}/${Number(detail.step) || 0}`;
  return deckRoute(deck);
}

function interpolate(template, route) {
  const match = cleanRoute(route).match(/^(.*)\/(\d+)$/);
  const slug = match?.[1] || cleanRoute(route);
  const step = match?.[2] || "0";
  return String(template)
    .replaceAll("{route}", route)
    .replaceAll("{slug}", slug)
    .replaceAll("{step}", step);
}

function relativeBase(manifest, manifestUrl) {
  const declared = manifest?.audioBaseUrl || manifest?.audioBase;
  if (!declared) return new URL(".", manifestUrl);
  const base = new URL(declared, manifestUrl);
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  return base;
}

function audioForRoute(manifest, route, manifestUrl) {
  const entry = manifest?.states?.[route] ?? manifest?.clips?.[route];
  let source = typeof entry === "string"
    ? entry
    : entry?.audio?.src || entry?.audio?.url || entry?.audio || entry?.src || entry?.url;

  if (!source && manifest?.audio?.[route]) source = manifest.audio[route];
  if (!source && manifest?.audioTemplate) source = interpolate(manifest.audioTemplate, route);
  if (!source) return "";

  const base = relativeBase(manifest, manifestUrl);
  return new URL(interpolate(source, route), base).href;
}

function addStyles() {
  if (document.querySelector("style[data-spiral-narration]")) return;
  const style = document.createElement("style");
  style.dataset.spiralNarration = "";
  style.textContent = `
    .spiral-narration {
      position: fixed;
      left: max(14px, env(safe-area-inset-left));
      bottom: max(14px, env(safe-area-inset-bottom));
      z-index: 10000;
      display: flex;
      align-items: center;
      gap: 9px;
      max-width: min(360px, calc(100vw - 28px));
      padding: 7px 9px;
      border: 1px solid color-mix(in srgb, var(--hair, #777) 72%, transparent);
      border-radius: 999px;
      background: color-mix(in srgb, var(--page, #000) 88%, transparent);
      box-shadow: 0 5px 22px rgba(0, 0, 0, .28);
      color: var(--mid, #aaa);
      font: 600 10px/1.2 var(--sans, ui-monospace, monospace);
      letter-spacing: .055em;
      opacity: .72;
      transition: opacity 160ms ease, border-color 160ms ease;
      -webkit-backdrop-filter: blur(8px);
      backdrop-filter: blur(8px);
    }
    .spiral-narration:hover,
    .spiral-narration:focus-within { opacity: 1; }
    .spiral-narration button {
      appearance: none;
      border: 0;
      border-radius: 999px;
      padding: 6px 10px;
      background: var(--accent, #d87552);
      color: var(--page, #000);
      font: inherit;
      letter-spacing: inherit;
      cursor: pointer;
      white-space: nowrap;
    }
    .spiral-narration button:focus-visible {
      outline: 2px solid var(--hi, #fff);
      outline-offset: 2px;
    }
    .spiral-narration button:disabled {
      cursor: wait;
      filter: saturate(.25);
      opacity: .65;
    }
    .spiral-narration-status {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);
}

function makeControl() {
  const host = document.createElement("div");
  host.className = "spiral-narration";
  host.setAttribute("role", "region");
  host.setAttribute("aria-label", "Your documentary narration controls");

  const button = document.createElement("button");
  button.type = "button";
  button.disabled = true;
  button.textContent = "Loading narration";
  button.setAttribute("aria-pressed", "false");

  const status = document.createElement("span");
  status.className = "spiral-narration-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.textContent = "your documentary voice";

  const audio = document.createElement("audio");
  audio.preload = "auto";
  audio.playsInline = true;
  audio.hidden = true;

  host.append(button, status, audio);
  for (const name of ["click", "dblclick", "pointerdown", "pointerup", "keydown", "keyup"]) {
    host.addEventListener(name, (event) => event.stopPropagation());
  }
  document.body.appendChild(host);
  return { host, button, status, audio };
}

export class NarrationController {
  constructor(deck, manifest, manifestUrl) {
    this.deck = deck;
    this.manifest = manifest;
    this.manifestUrl = manifestUrl;
    this.route = deckRoute(deck);
    this.enabled = false;
    this.paused = false;
    this.token = 0;
    this.pendingAutoAdvance = null;
    this.retryTimer = null;
    this.retryAttempt = 0;

    addStyles();
    const ui = makeControl();
    this.host = ui.host;
    this.button = ui.button;
    this.status = ui.status;
    this.audio = ui.audio;

    this.button.disabled = false;
    this.button.textContent = "Start narration";
    this.button.setAttribute("aria-label", "Start your documentary narration");
    this.button.addEventListener("click", () => this.toggle());

    this.audio.addEventListener("play", () => this.reflect("playing"));
    this.audio.addEventListener("pause", () => {
      if (!this._replacing && !this.audio.ended && this.enabled) this.reflect("paused");
    });
    this.audio.addEventListener("ended", () => {
      this.reflect("ended");
      const pending = this.pendingAutoAdvance;
      this.pendingAutoAdvance = null;
      if (pending && pending.route === this.route && Number(this.deck.step) === pending.step) {
        queueMicrotask(() => this.deck.next());
      }
    });
    this.audio.addEventListener("error", () => {
      if (this.audio.src) this.retryMissing(this.route);
    });

    this._onState = (event) => this.stateChanged(event);
    this._onStateWillChange = (event) => {
      const upcoming = eventRoute(event?.detail, this.deck);
      if (!upcoming || upcoming === this.route) return;
      this.cancel();
      this.reflect(this.paused ? "paused" : this.enabled ? "moving" : "ready");
    };
    // Listening on both targets makes the add-on work whether the runtime dispatches from
    // the deck root or from window. Route de-duplication prevents a bubbling event replay.
    this.deck.root?.addEventListener(EVENT_NAME, this._onState);
    window.addEventListener(EVENT_NAME, this._onState);
    this.deck.root?.addEventListener("spiral:statewillchange", this._onStateWillChange);

    // A handful of authored scenes advance themselves after their visual process completes.
    // In narrated rehearsal mode, let a still-speaking sentence finish first. Capture runs
    // before Deck's stage listener; silent mode and already-finished clips pass through.
    this._onSceneAutoAdvance = (event) => {
      const step = Number(event.detail?.step);
      if (!this.enabled || this.paused || this.audio.paused || this.audio.ended
          || !Number.isFinite(step) || step !== Number(this.deck.step)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.pendingAutoAdvance ||= { route: this.route, step };
    };
    this.deck.root?.addEventListener("scene-auto-advance", this._onSceneAutoAdvance, true);
  }

  clip(route = this.route) {
    return audioForRoute(this.manifest, route, this.manifestUrl);
  }

  suspendForPresenter() {
    this.enabled = false;
    this.paused = true;
    this.cancel();
    this.reflect("paused");
  }

  stateChanged(event) {
    const next = eventRoute(event?.detail, this.deck);
    if (!next || next === this.route) return;
    this.route = next;
    this.pendingAutoAdvance = null;
    this.cancel();
    if (this.enabled && !this.paused) this.playCurrent();
    else this.reflect(this.paused ? "paused" : "ready");
  }

  toggle() {
    if (!this.enabled) {
      this.enabled = true;
      this.paused = false;
      this.playCurrent();
      return;
    }
    if (!this.paused && this.audio.ended) {
      this.playCurrent();
      return;
    }
    if (!this.paused) {
      this.paused = true;
      this.audio.pause();
      this.reflect("paused");
      return;
    }
    this.paused = false;
    // Resume a partly played clip; replay the route after completion or replacement.
    if (this.audio.src && this.audio.currentTime > 0 && !this.audio.ended) this.playLoaded();
    else this.playCurrent();
  }

  cancel() {
    this.token += 1;
    this.pendingAutoAdvance = null;
    this.clearRetry();
    this._replacing = true;
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this._replacing = false;
  }

  clearRetry(resetAttempt = true) {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (resetAttempt) this.retryAttempt = 0;
  }

  retryMissing(route = this.route) {
    if (!this.enabled || this.paused || route !== this.route) {
      this.reflect("missing");
      return;
    }
    if (this.retryTimer !== null) return;
    this.reflect("waiting");
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.enabled || this.paused || route !== this.route) return;
      this.retryAttempt += 1;
      this.playCurrent(true);
    }, 1800);
  }

  playCurrent(retrying = false) {
    const source = this.clip();
    if (!source) {
      this.cancel();
      this.reflect("missing");
      return;
    }
    if (!retrying) this.clearRetry();
    const token = ++this.token;
    this._replacing = true;
    this.audio.pause();
    // A rehearsal can begin while the renderer is still producing later clips. A failed
    // request may have been cached as a 404, so retries use a harmless query key while the
    // stable manifest path remains unchanged.
    if (retrying) {
      const retryUrl = new URL(source);
      retryUrl.searchParams.set("spiralNarrationAttempt", String(this.retryAttempt));
      this.audio.src = retryUrl.href;
    } else this.audio.src = source;
    this.audio.currentTime = 0;
    this._replacing = false;
    this.playLoaded(token);
  }

  playLoaded(expectedToken = this.token) {
    const attempt = this.audio.play();
    if (!attempt?.catch) return;
    attempt.catch((error) => {
      if (expectedToken !== this.token) return;
      if (error?.name === "AbortError") return;
      if (error?.name === "NotAllowedError") {
        this.paused = true;
        this.reflect("gesture");
      } else {
        // During a progressive render the next clip may simply not exist yet. Retry this
        // route in place; navigation still cancels the retry immediately.
        this.retryMissing(this.route);
      }
      console.warn("Spiral narration could not play this clip", error);
    });
  }

  reflect(state) {
    const labels = {
      ready: ["Start narration", "Start your documentary narration", "your documentary voice"],
      playing: ["Pause narration", "Pause your documentary narration", "playing"],
      paused: ["Resume narration", "Resume your documentary narration", "paused"],
      ended: ["Replay step", "Replay this narration step", "ready for next step"],
      moving: ["Pause narration", "Pause your documentary narration", "changing step"],
      waiting: ["Pause narration", "Pause your documentary narration", "rendering this step…"],
      missing: [this.paused ? "Resume narration" : this.enabled ? "Pause narration" : "Start narration",
                this.paused ? "Resume your documentary narration"
                  : this.enabled ? "Pause your documentary narration" : "Start your documentary narration",
                "no clip for this step"],
      gesture: ["Resume narration", "Resume your documentary narration", "click to allow audio"],
    };
    const [text, aria, status] = labels[state] || labels.ready;
    this.button.textContent = text;
    this.button.setAttribute("aria-label", aria);
    this.button.setAttribute("aria-pressed", String(state === "playing"));
    this.status.textContent = status;
  }
}

/** One continuous audio clock drives the complete narrated presentation.
 * Reveals never replace/restart audio. A click by the user seeks to that passage;
 * timed reveals keep playing through words, equations, overlays and page turns.
 */
export class TimelineNarrationController {
  constructor(deck, manifest, manifestUrl) {
    this.deck = deck;
    this.manifest = manifest;
    this.manifestUrl = manifestUrl;
    this.timeline = manifest.timeline;
    this.cues = this.timeline.cues;
    this.route = deckRoute(deck);
    this.enabled = false;
    this.paused = false;
    this.token = 0;
    this.currentCueIndex = -1;
    this.seekFloor = -1;
    this.positionChosen = false;
    this.pendingRoute = null;
    this.applying = false;
    this.finished = false;
    this.destroyed = false;
    this._frame = 0;
    this.routeIndexes = new Map(this.cues.map((cue, i) => [cue.route, i]));
    addStyles();
    const ui = makeControl();
    Object.assign(this, ui);
    this.audio.preload = "metadata";
    this.audio.src = this.clip();
    this.audio.preservesPitch = true;
    this.host.classList.add("spiral-narration-timed");
    const style = document.createElement("style");
    style.textContent = `.spiral-narration-timed{max-width:min(480px,calc(100vw - 28px));flex-wrap:wrap;gap:8px}.spiral-narration-timed input{width:110px;accent-color:var(--accent,#d87552)}.spiral-narration-clock{font-variant-numeric:tabular-nums;white-space:nowrap}.spiral-narration-timed .spiral-narration-status{max-width:90px}@media(max-width:600px){.spiral-narration-timed input{width:70px}.spiral-narration-timed .spiral-narration-status{display:none}}`;
    this.host.append(style);
    this.seek = document.createElement("input");
    this.seek.type = "range";
    this.seek.min = "0";
    this.seek.max = String(this.timeline.durationSeconds);
    this.seek.step = ".1";
    this.seek.value = "0";
    this.seek.setAttribute("aria-label", "Narration position");
    this.clock = document.createElement("span");
    this.clock.className = "spiral-narration-clock";
    this.host.insertBefore(this.seek, this.status);
    this.host.insertBefore(this.clock, this.status);
    this.seek.addEventListener("input", () => this.seekTo(Number(this.seek.value)));
    this.button.disabled = false;
    this.button.addEventListener("click", () => this.toggle());
    this.audio.addEventListener("timeupdate", () => this.tick());
    this.audio.addEventListener("seeked", () => this.tick(true));
    this.audio.addEventListener("play", () => { this.reflect("playing"); this.scheduleFrame(); });
    this.audio.addEventListener("ended", () => {
      this.tick(true);
      this.finished = true;
      this.paused = true;
      this.reflect("ended");
      cancelAnimationFrame(this._frame);
    });
    this.audio.addEventListener("waiting", () => this.reflect("buffering"));
    this.audio.addEventListener("playing", () => this.reflect("playing"));
    this.audio.addEventListener("error", () => { this.paused = true; this.reflect("missing"); });
    this._onState = event => this.stateChanged(event);
    this._onWillChange = event => {
      const next = eventRoute(event.detail, this.deck);
      if (this.applying || next === this.pendingRoute) return;
      // A real user page turn stops speaking during navigation, then seeks once settled.
      if (this.enabled) this.audio.pause();
    };
    this._onScene = event => {
      if (!this.enabled || this.inPresenterMode()) return;
      // Scene completion and confirmation tiles must not compete with the audio clock.
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    deck.root.addEventListener(EVENT_NAME, this._onState);
    deck.root.addEventListener("spiral:statewillchange", this._onWillChange);
    deck.root.addEventListener("scene-auto-advance", this._onScene, true);
    this._onPageHide = () => this.dispose();
    window.addEventListener("pagehide", this._onPageHide, { once: true });
    this.reflect("ready");
  }

  inPresenterMode() { return document.body.classList.contains("audience-mode") || this.deck.preview; }

  clip() { return new URL(this.timeline.audio, relativeBase(this.manifest, this.manifestUrl)).href; }

  format(seconds) {
    const n = Math.max(0, Math.floor(seconds || 0));
    return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
  }

  updateClock() {
    const time = this.audio.currentTime || 0;
    this.clock.textContent = `${this.format(time)} / ${this.format(this.timeline.durationSeconds)}`;
    this.seek.value = String(time);
    this.seek.setAttribute("aria-valuetext", `${this.format(time)} of ${this.format(this.timeline.durationSeconds)}`);
  }

  reflect(state) {
    const labels = {
      ready: ["Start narration", "timed playback"],
      playing: ["Pause narration", "playing"],
      paused: ["Resume narration", "paused"],
      ended: ["Replay narration", "finished"],
      buffering: ["Pause narration", "buffering…"],
      gesture: ["Resume narration", "click to play"],
      missing: ["Retry narration", "audio unavailable"],
      outside: ["Start narration", "backup slide"],
    };
    const [button, status] = labels[state] || labels.ready;
    this.button.textContent = button;
    this.button.setAttribute("aria-label", `${button} in your documentary voice`);
    this.button.setAttribute("aria-pressed", String(state === "playing"));
    this.status.textContent = status;
    this.updateClock();
  }

  async playLoaded() {
    if (this.inPresenterMode() || this.destroyed) return;
    const token = ++this.token;
    if (this.audio.error) this.audio.load();
    try { await this.audio.play(); }
    catch (error) {
      if (token !== this.token || error.name === "AbortError") return;
      this.paused = true;
      this.reflect(error.name === "NotAllowedError" ? "gesture" : "missing");
    }
  }

  toggle() {
    if (this.inPresenterMode()) return;
    if (!this.enabled || this.finished) {
      const resumeChosenPosition = !this.enabled && this.positionChosen && !this.finished;
      this.enabled = true;
      this.paused = false;
      const index = this.finished ? 0 : resumeChosenPosition ? this.currentCueIndex
        : this.routeIndexes.get(deckRoute(this.deck));
      this.finished = false;
      if (index == null) {
        this.enabled = false;
        this.reflect("outside");
        return;
      }
      this.seekFloor = resumeChosenPosition ? -1 : index;
      this.currentCueIndex = index;
      if (!resumeChosenPosition)
        this.audio.currentTime = this.cues[index].speechAtSeconds ?? this.cues[index].atSeconds;
      this.navigate(this.cues[index].route, true);
      this.playLoaded();
      return;
    }
    if (!this.paused) {
      this.paused = true;
      this.audio.pause();
      cancelAnimationFrame(this._frame);
      this.reflect("paused");
    } else {
      this.paused = false;
      this.playLoaded();
    }
  }

  seekTo(seconds) {
    this.positionChosen = true;
    this.seekFloor = -1;
    this.currentCueIndex = -1;
    this.finished = false;
    this.audio.currentTime = Math.max(0, Math.min(this.timeline.durationSeconds - .02, seconds));
    this.tick(true);
  }

  stateChanged(event) {
    const next = eventRoute(event.detail, this.deck);
    const previous = this.route;
    this.route = next;
    if (this.applying || next === this.pendingRoute) {
      this.pendingRoute = null;
      return;
    }
    if (next === previous) return;
    if (!this.enabled || this.inPresenterMode()) {
      this.positionChosen = false;
      return;
    }
    const index = this.routeIndexes.get(next);
    if (index == null) {
      this.suspendForPresenter();
      this.reflect("outside");
      return;
    }
    this.seekFloor = index;
    this.currentCueIndex = index;
    this.audio.currentTime = this.cues[index].speechAtSeconds ?? this.cues[index].atSeconds;
    if (!this.paused) this.playLoaded();
    else this.reflect("paused");
  }

  navigate(route, settled = false) {
    if (deckRoute(this.deck) === route) return;
    const [slug, rawStep] = route.split("/");
    const step = Number(rawStep);
    const index = this.deck.deck.slides.findIndex(s => s._slug === slug);
    if (index < 0) return;
    this.applying = true;
    this.pendingRoute = route;
    try {
      if (index === this.deck.i) {
        this.deck.step = step;
        const page = this.deck.stage.querySelector(".slide.incoming") || this.deck.stage.lastElementChild;
        this.deck.reveal(page, !settled, settled ? { settled: true } : undefined);
        this.deck.syncBar();
        this.deck.syncLocation({ replace: true });
      } else {
        this.deck.show(index, { keepStep: step, instant: settled, settled, replaceUrl: true });
      }
    } finally { this.applying = false; }
  }

  tick(settled = false) {
    this.updateClock();
    if ((!this.enabled && !settled) || this.inPresenterMode() || this.destroyed) return;
    const time = this.audio.currentTime;
    if (this.seekFloor >= 0 && time >= this.cues[this.seekFloor].atSeconds) this.seekFloor = -1;
    let low = 0, high = this.cues.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.cues[mid].atSeconds <= time + .015) low = mid + 1;
      else high = mid;
    }
    const index = Math.max(this.seekFloor, 0, low - 1);
    if (index !== this.currentCueIndex) {
      this.currentCueIndex = index;
      this.navigate(this.cues[index].route, settled);
    }
  }

  scheduleFrame() {
    cancelAnimationFrame(this._frame);
    const frame = () => {
      if (this.destroyed || !this.enabled || this.paused || this.audio.paused) return;
      this.tick();
      this._frame = requestAnimationFrame(frame);
    };
    this._frame = requestAnimationFrame(frame);
  }

  suspendForPresenter() {
    this.token += 1;
    this.audio.pause();
    this.enabled = false;
    this.paused = true;
    cancelAnimationFrame(this._frame);
    this.reflect("paused");
  }

  dispose() {
    this.suspendForPresenter();
    this.destroyed = true;
    this.deck.root.removeEventListener(EVENT_NAME, this._onState);
    this.deck.root.removeEventListener("spiral:statewillchange", this._onWillChange);
    this.deck.root.removeEventListener("scene-auto-advance", this._onScene, true);
  }
}

async function waitForDeck(timeoutMs = 10000) {
  const started = performance.now();
  while (!window.deck && performance.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return window.deck;
}

export async function bootNarration() {
  if (!narrationRequested()) return null;
  const deck = await waitForDeck();
  if (!deck) throw new Error("Spiral narration could not find the active deck");

  const setting = manifestSetting(deck);
  if (!setting) {
    addStyles();
    const { button, status } = makeControl();
    button.textContent = "Narration unavailable";
    button.setAttribute("aria-label", "No narration manifest is configured for this deck");
    status.textContent = "no manifest configured";
    return null;
  }

  const requestedUrl = new URL(setting, location.href);
  const response = await fetch(requestedUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Narration manifest returned ${response.status}`);
  const manifest = await response.json();
  const Controller = manifest.timeline?.cues?.length ? TimelineNarrationController : NarrationController;
  return new Controller(deck, manifest, response.url || requestedUrl.href);
}

if (narrationRequested()) {
  bootNarration().then((controller) => {
    if (controller) window.spiralNarration = controller;
  }).catch((error) => {
    console.warn("Spiral narration is unavailable", error);
    addStyles();
    const { button, status } = makeControl();
    button.textContent = "Narration unavailable";
    button.setAttribute("aria-label", "Narration could not be loaded");
    status.textContent = "manifest could not be loaded";
  });
}
