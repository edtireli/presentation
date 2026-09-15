// Fixed absolute window: reloads, repeat clicks and browser restarts never extend it.
export const NICHOLAS_WINDOW = Object.freeze({
  startsAt: '2026-09-15T13:33:49.000Z',
  expiresAt: '2026-09-16T13:33:49.000Z',
  videoId: 'SCirkxKrz5w',
});
export function nicholasRainbowActive(now = Date.now()) {
  return now >= Date.parse(NICHOLAS_WINDOW.startsAt) && now < Date.parse(NICHOLAS_WINDOW.expiresAt);
}
