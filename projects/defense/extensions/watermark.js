// Attribution overlay only. Client-side verification is not access control or DRM.
const PASSWORD_DIGEST = 'e618bbf868600c8aea0638545de18cc87d70ba4fa7dcb0467b44b43813dc1667';
const SESSION_KEY = 'spiral.defense.watermark.v1';

export async function verifyWatermarkPassword(password) {
  if (typeof password !== 'string' || !password || password.length > 256) return false;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  const digest = Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
  return digest === PASSWORD_DIGEST;
}

function remembered() {
  try { return sessionStorage.getItem(SESSION_KEY) === PASSWORD_DIGEST; }
  catch { return false; }
}

export async function installDefenseWatermark() {
  const root = document.getElementById('deck');
  if (!root || document.getElementById('defense-watermark')) return;
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = new URL('./watermark.css', import.meta.url).href;
  const styled = new Promise(resolve => {
    style.addEventListener('load', resolve, {once: true});
    style.addEventListener('error', resolve, {once: true});
  });
  document.head.append(style);

  const overlay = document.createElement('aside');
  overlay.id = 'defense-watermark';
  overlay.hidden = true;
  overlay.setAttribute('aria-label', 'Presentation copyright');
  overlay.innerHTML = `
    <div class="defense-watermark-name">© Edis Devin Tireli</div>
    <a class="defense-watermark-source" href="https://github.com/edtireli/presentation" target="_blank" rel="noopener noreferrer">github.com/edtireli/presentation</a>
    <button class="defense-watermark-unlock" type="button">Remove watermark</button>
  `;
  const dialog = document.createElement('dialog');
  dialog.id = 'defense-watermark-dialog';
  dialog.setAttribute('aria-labelledby', 'defense-watermark-heading');
  dialog.innerHTML = `
    <form>
      <h2 id="defense-watermark-heading">Remove watermark</h2>
      <p>Enter the password to hide it for this tab’s session.</p>
      <label for="defense-watermark-password">Password</label>
      <input id="defense-watermark-password" name="password" type="password" autocomplete="off" maxlength="256" required autofocus aria-describedby="defense-watermark-error">
      <p id="defense-watermark-error" role="status" aria-live="polite"></p>
      <div class="defense-watermark-actions">
        <button type="button" data-cancel>Cancel</button>
        <button type="submit">Remove watermark</button>
      </div>
    </form>
  `;
  // Keep these outside #stage, so slide changes never replace the overlay.
  // Inside #deck also keeps them visible when that element enters fullscreen.
  root.append(overlay, dialog);
  const unlock = overlay.querySelector('button');
  const input = dialog.querySelector('input');
  const error = dialog.querySelector('[role="status"]');
  const submit = dialog.querySelector('[type="submit"]');
  const form = dialog.querySelector('form');
  let unlocked = remembered();
  function reflect() { overlay.hidden = unlocked; }
  for (const element of [overlay, dialog]) {
    for (const type of ['click', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'keydown', 'keyup'])
      element.addEventListener(type, event => event.stopPropagation());
  }
  unlock.addEventListener('click', () => {
    error.textContent = '';
    input.value = '';
    input.removeAttribute('aria-invalid');
    dialog.showModal();
    input.focus();
  });
  dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { input.value = ''; });
  input.addEventListener('input', () => {
    error.textContent = '';
    input.removeAttribute('aria-invalid');
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    try {
      if (await verifyWatermarkPassword(input.value)) {
        unlocked = true;
        try { sessionStorage.setItem(SESSION_KEY, PASSWORD_DIGEST); } catch {}
        dialog.close();
        unlock.blur();
        reflect();
      } else {
        error.textContent = 'That password isn’t correct.';
        input.setAttribute('aria-invalid', 'true');
        input.select();
      }
    } catch {
      error.textContent = 'Password check unavailable. Open this presentation over HTTPS or localhost.';
    } finally { submit.disabled = false; }
  });
  // sessionStorage events also reach same-origin frames within this tab, including
  // the mobile landscape view. Separate browser tabs do not share this storage.
  window.addEventListener('storage', event => {
    if (event.key !== SESSION_KEY && event.key !== null) return;
    unlocked = remembered();
    if (unlocked && dialog.open) dialog.close();
    reflect();
  });
  await styled;
  reflect();
}
