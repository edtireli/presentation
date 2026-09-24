import fs from 'node:fs/promises';
import path from 'node:path';

function safeRelativePath(name) {
  if (typeof name !== 'string' || !name || /[\x00-\x1f\x7f\\%?#:]/.test(name)
      || path.posix.isAbsolute(name)
      || name.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid public presentation path: ${JSON.stringify(name)}`);
  }
  return name;
}

function audienceIndex(html, fullscreenSource) {
  const replaceOnce = (pattern, replacement, label) => {
    const matches = [...html.matchAll(new RegExp(pattern.source, 'g'))];
    if (matches.length !== 1) throw new Error(`Expected one ${label} in presentation index.`);
    html = html.replace(pattern, replacement);
  };
  const authoredLayout = `const { PresentationEditor } = await import("./engine/js/presentation-editor.js");
// Apply the published layout overrides without editor controls or browser drafts.
class PublishedLayout extends PresentationEditor {
  async init() {
    for (const migration of this.source.presentationEdits?.migrations || []) {
      const current = this.edits[migration.route]?.[migration.selector];
      if (current && Object.entries(migration.before).every(([key, value]) => current[key] === value)) {
        Object.assign(current, migration.after);
      }
    }
    const apply = () => this.apply();
    this.deck.root.addEventListener('spiral:render', apply);
    this.deck.root.addEventListener('spiral:statechange', apply);
    this.observer = new MutationObserver(() => {
      if (this.pending) return;
      this.pending = requestAnimationFrame(() => { this.pending = null; this.apply(); });
    });
    this.observer.observe(this.deck.stage, { childList: true, subtree: true });
    this.apply();
  }
}
new PublishedLayout(deck, originalDeckData, url);
`;
  replaceOnce(/const \{ PresentationEditor \} = await import\(["']\.\/engine\/js\/presentation-editor\.js["']\);\s*window\.spiralEditor = new PresentationEditor\(deck, originalDeckData, url\);\s*/, authoredLayout, 'presentation editor block');
  replaceOnce(/const \{ installPresenterBridge \} = await import\(["']\.\/engine\/js\/presenter-bridge\.js["']\);\s*window\.spiralPresenter = installPresenterBridge\(deck, url\);\s*/, '', 'presenter bridge block');
  if (!/^const originalDeckData = structuredClone\(deckData\);\r?$/m.test(html)) {
    throw new Error('Expected original presentation data for published layout overrides.');
  }
  html = html.replace(' · E edit', '').replace(' · P speaker notes', '');
  if (/new PresentationEditor|installPresenterBridge|spiralEditor|spiralPresenter|navigator\.serviceWorker|src=["'][^"']*\bsession\.js/.test(html)) {
    throw new Error('Unexpected presenter or service-worker dependency in public index.');
  }
  if ((html.match(/<\/body>/g) || []).length !== 1) throw new Error('Expected one presentation body.');
  // Keep public fullscreen behavior in this document: an older offline worker
  // may still pin the root fullscreen.js to its saved presentation generation.
  const fullscreen = fullscreenSource.replace(/<\/script/gi, '<\\/script');
  return html.replace('</body>', '<script>\n' + fullscreen + '\n</script>\n<script type="module" src="./live.js"></script>\n</body>');
}

const speakerRedirect = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Opening presenter access</title></head>
<body><p><a href="../">Open presenter access</a></p><script>
const gate = new URL('../', location.href);
const presenter = new URL('../app/speaker.html', location.href);
presenter.search = location.search;
presenter.hash = location.hash;
gate.searchParams.set('return', presenter.pathname + presenter.search + presenter.hash);
location.replace(gate.href);
</script></body></html>
`;

// Only the already-public sealed manifest is an export allowlist. Never walk
// the source tree: it can also contain build records or unpublished source files.
export async function exportPublicView(source, output, entries, fullscreenFile) {
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)
      || !Object.hasOwn(entries, 'index.html')) {
    throw new Error('Public presentation export requires manifest entries with index.html.');
  }
  const names = Object.keys(entries).map(safeRelativePath);
  const sourceRoot = await fs.realpath(source);
  await fs.mkdir(output, {recursive: true});
  const outputRoot = await fs.realpath(output);
  const watchRoot = path.join(outputRoot, 'watch');
  if (sourceRoot === watchRoot || sourceRoot.startsWith(watchRoot + path.sep)) {
    throw new Error('Public presentation output must not contain its source.');
  }
  // This explicit public-shell dependency is separate from the source allowlist.
  const fullscreenSource = await fs.readFile(fullscreenFile, 'utf8');

  // Check every source component before creating an export. Symlinks must not
  // turn a manifest-relative file into a copy from elsewhere on the filesystem.
  const checked = new Map();
  for (const name of names) {
    let current = sourceRoot;
    const parts = name.split('/');
    for (let index = 0; index < parts.length; index++) {
      current = path.join(current, parts[index]);
      let info = checked.get(current);
      if (!info) { info = await fs.lstat(current); checked.set(current, info); }
      if (info.isSymbolicLink() || (index === parts.length - 1 ? !info.isFile() : !info.isDirectory())) {
        throw new Error(`Invalid public presentation source: ${name}`);
      }
    }
  }

  const temporary = await fs.mkdtemp(path.join(outputRoot, '.watch-export-'));
  try {
    for (const name of names) {
      const from = path.join(sourceRoot, name), to = path.join(temporary, name);
      await fs.mkdir(path.dirname(to), {recursive: true});
      if (name === 'index.html') await fs.writeFile(to, audienceIndex(await fs.readFile(from, 'utf8'), fullscreenSource));
      else if (name === 'speaker.html') await fs.writeFile(to, speakerRedirect);
      else await fs.copyFile(from, to);
    }
    // Replacing the directory also removes files absent from the new manifest.
    await fs.rm(watchRoot, {recursive: true, force: true});
    await fs.rename(temporary, watchRoot);
  } catch (error) {
    await fs.rm(temporary, {recursive: true, force: true});
    throw error;
  }
  return {files: names.length, directory: watchRoot};
}
