/* Presenter sessions authorize broadcasting only. The separate offline verifier
 * unlocks local controls; it never supplies a bearer credential to the service. */
const moduleBase = new URL('./', import.meta.url);
const base = moduleBase.pathname.endsWith('/app/') ? new URL('../', moduleBase) : moduleBase;
const sessionKey = `spiral.presenter.session:${base.pathname}`;
const verifierKey = `spiral.presenter.offline:${base.pathname}`;
const ITERATIONS = 600000, LOCAL_TTL = 8 * 60 * 60 * 1000;
let pending = null, configPromise = null;
const error = (message, kind = 'unavailable') => Object.assign(new Error(message), {kind});
const offline = () => globalThis.navigator?.onLine === false;
function readSession() {
  try {
    const value = JSON.parse(sessionStorage.getItem(sessionKey));
    if (!value || !['online', 'offline'].includes(value.mode) || !(Date.parse(value.expiresAt) > Date.now())) return null;
    if (value.mode === 'online' && (typeof value.token !== 'string' || !value.token)) return null;
    return {...value, token: value.mode === 'online' ? value.token : null, canBroadcast: value.mode === 'online'};
  } catch {return null;}
}
/** Current local access, without introducing a network dependency for the deck. */
export function currentPresenterAccess() {
  const value = readSession();
  return value && offline() ? {...value, mode: 'offline', token: null, canBroadcast: false} : value;
}
function saveSession(value) {
  try {sessionStorage.setItem(sessionKey, JSON.stringify(value));}
  catch {throw error('Browser session storage is unavailable. Allow storage before opening presenter controls.', 'storage');}
  return value;
}
function clearSession() {try {sessionStorage.removeItem(sessionKey);} catch {}}
async function fetchTimed(url, options = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
  try {return await fetch(url, {...options, cache: 'no-store', signal: controller.signal});}
  catch {throw error('The presenter service is unavailable.');}
  finally {clearTimeout(timer);}
}
async function configuration() {
  if (!configPromise) configPromise = (async () => {
    const response = await fetchTimed(new URL('app/live-config.json', base));
    if (!response.ok) throw error('The presenter service is unavailable.');
    const value = await response.json();
    const endpoint = new URL(value.apiBase);
    if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) throw error('Presenter sign-in requires HTTPS.');
    return {apiBase: endpoint.href.replace(/\/$/, '')};
  })().catch(reason => {configPromise = null;throw reason;});
  return configPromise;
}
function rejected(response) {
  if (response.status === 401 || response.status === 403) return error('Password not accepted. Try again.', 'rejected');
  if (response.status === 429) return error('Too many attempts. Please wait a few minutes and try again.', 'rejected');
  if (response.status >= 400 && response.status < 500) return error('Sign-in was not accepted. Please try again.', 'rejected');
  return error('The presenter service is unavailable.');
}
async function validateOnline(session) {
  if (offline()) throw error('You are offline. Live broadcasting requires a connection.');
  const config = await configuration();
  const response = await fetchTimed(`${config.apiBase}/presenter-session`, {headers: {Authorization: `Bearer ${session.token}`}});
  if (!response.ok) {if ([401, 403].includes(response.status)) clearSession();throw rejected(response);}
  const value = await response.json();
  if (value.authenticated !== true || !(Date.parse(value.expiresAt) > Date.now())) {clearSession();throw error('Your presenter session has expired. Sign in again.', 'rejected');}
  return saveSession({...session, expiresAt: value.expiresAt, mode: 'online', canBroadcast: true});
}
const encode = bytes => btoa(String.fromCharCode(...bytes));
const decode = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt, iterations}, key, 256));
}
async function rememberOffline(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const digest = await derive(password, salt, ITERATIONS);
  localStorage.setItem(verifierKey, JSON.stringify({version: 1, kdf: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: encode(salt), verifier: encode(digest), createdAt: new Date().toISOString()}));
}
async function verifyOffline(password) {
  let record, salt, expected;
  try {
    record = JSON.parse(localStorage.getItem(verifierKey));
    if (record?.version !== 1 || record.kdf !== 'PBKDF2' || record.hash !== 'SHA-256' || record.iterations !== ITERATIONS) throw Error();
    salt = decode(record.salt);expected = decode(record.verifier);
    if (salt.length !== 16 || expected.length !== 32) throw Error();
  } catch {throw error('To present offline, connect and sign in on this browser once, then download the presentation for offline use.', 'offline-unprepared');}
  const actual = await derive(password, salt, record.iterations);
  let mismatch = 0;for (let i = 0; i < expected.length; i++) mismatch |= expected[i] ^ actual[i];
  if (mismatch) throw error('Password not accepted for offline access. Try again.', 'rejected');
  return saveSession({mode: 'offline', token: null, canBroadcast: false, expiresAt: new Date(Date.now() + LOCAL_TTL).toISOString()});
}
async function signIn(password, forBroadcast) {
  try {
    if (offline()) throw error('You are offline.');
    const config = await configuration();
    const response = await fetchTimed(`${config.apiBase}/presenter-session`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({password})});
    if (!response.ok) throw rejected(response);
    const value = await response.json();
    if (typeof value.token !== 'string' || !value.token || !(Date.parse(value.expiresAt) > Date.now())) throw error('The presenter session was not confirmed.');
    let offlineVerifierSaved = false;
    try {await rememberOffline(password);offlineVerifierSaved = true;} catch {}
    return saveSession({mode: 'online', token: value.token, expiresAt: value.expiresAt, canBroadcast: true, offlineVerifierSaved});
  } catch (reason) {
    // An explicit online rejection must never be bypassed by a cached verifier.
    if (reason.kind !== 'unavailable' || forBroadcast) throw reason;
    return verifyOffline(password);
  }
}
function node(tag, text, styles = {}) {
  const value = document.createElement(tag);if (text) value.textContent = text;
  Object.assign(value.style, styles);return value;
}
function passwordDialog({forBroadcast = false, message = ''} = {}) {
  return new Promise(resolve => {
    const previous = document.activeElement;
    const dialog = node('dialog', '', {background: '#000', color: '#f0eadb', border: '1px solid #514e40', borderRadius: '0', padding: 'clamp(24px, 5vw, 42px)', width: 'min(430px, calc(100vw - 32px))', maxHeight: 'calc(100dvh - 32px)', boxSizing: 'border-box', boxShadow: '0 20px 90px #000', fontFamily: 'Georgia, serif'});
    dialog.id = 'presenter-access-dialog';dialog.setAttribute('aria-labelledby', 'presenter-access-title');
    const title = node('h2', forBroadcast ? 'Live broadcast' : 'Give presentation', {fontSize: '30px', fontWeight: '400', margin: '0 0 26px'});title.id = 'presenter-access-title';
    const form = node('form');
    const label = node('label', 'Presenter password', {display: 'block', fontSize: '17px'});
    const input = node('input', '', {display: 'block', boxSizing: 'border-box', width: '100%', background: '#080808', color: '#fff', border: '1px solid #777466', padding: '12px', margin: '9px 0 18px', fontSize: '18px', borderRadius: '0'});
    input.id = 'presenter-password';input.type = 'password';input.autocomplete = 'current-password';input.required = true;input.maxLength = 300;label.htmlFor = input.id;
    input.addEventListener('focus', () => {input.style.outline = '2px solid #efdc60';input.style.outlineOffset = '3px';});
    input.addEventListener('blur', () => {input.style.outline = '';});
    const status = node('p', message || (offline() ? 'Offline access is available after a previous sign-in on this browser.' : 'Enter the presenter password to continue.'), {font: '14px/1.5 system-ui, sans-serif', color: '#c9c3b6', minHeight: '42px'});
    status.id = 'presenter-access-status';status.setAttribute('role', 'status');status.setAttribute('aria-live', 'polite');input.setAttribute('aria-describedby', status.id);
    const actions = node('div', '', {display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '22px'});
    const submit = node('button', 'Continue', {background: '#efdc60', color: '#18170b', padding: '11px 20px', border: '1px solid #efdc60', font: '16px Georgia, serif', cursor: 'pointer'});
    const cancel = node('button', 'Cancel', {background: '#000', color: '#f0eadb', padding: '11px 20px', border: '1px solid #666', font: '16px Georgia, serif', cursor: 'pointer'});
    submit.type = 'submit';cancel.type = 'button';actions.append(submit, cancel);form.append(label, input, status, actions);dialog.append(title, form);document.body.append(dialog);
    let finished = false, attempt = 0;
    const done = value => {if (finished) return;finished = true;attempt++;input.value = '';dialog.close();dialog.remove();if (previous?.isConnected) previous.focus?.();resolve(value);};
    cancel.onclick = () => done(null);dialog.addEventListener('cancel', event => {event.preventDefault();done(null);});
    form.onsubmit = async event => {
      event.preventDefault();if (submit.disabled) return;
      const password = input.value, ownAttempt = ++attempt;submit.disabled = true;input.disabled = true;status.textContent = 'Checking access…';
      try {const session = await signIn(password, forBroadcast);if (!finished && ownAttempt === attempt) done(session);}
      catch (reason) {if (!finished && ownAttempt === attempt) {status.textContent = reason.message || 'Sign-in is unavailable.';input.disabled = false;submit.disabled = false;input.select();input.focus();}}
    };
    dialog.showModal();input.focus();
  });
}
/** A cached local session is reused; broadcasting additionally validates online. */
export function requestPresenterAccess(options = {}) {
  if (pending) return pending;
  pending = (async () => {
    const session = currentPresenterAccess();
    if (session && !options.forcePassword) {
      if (!options.forBroadcast) return session;
      if (session.canBroadcast) {
        try {return await validateOnline(session);} catch (reason) {
          if (reason.kind !== 'rejected') return passwordDialog({...options, message: reason.message});
        }
      }
    }
    return passwordDialog(options);
  })();
  return pending.finally(() => {pending = null;});
}
/** Direct host routes use the same prompt/session as the public Give action. */
export async function guardPresenterRouteAccess() {
  const params = new URLSearchParams(location.search);
  if (params.get('presenterPreview') === '1' || params.get('live') === '1' || (!/speaker\.html$/.test(location.pathname) && params.get('broadcast') !== '1')) return null;
  const session = await requestPresenterAccess();
  if (!session) location.replace(base.href);
  return session;
}
