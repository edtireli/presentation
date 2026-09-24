import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {gzipSync, gunzipSync} from 'node:zlib';
import {exportPublicView} from './export-public-view.mjs';

export const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
export const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.spiral':'application/json','.bib':'text/plain; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm','.m4a':'audio/mp4','.mp3':'audio/mpeg','.wav':'audio/wav','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.pdf':'application/pdf','.gz':'application/gzip'};
export async function filesUnder(dir, prefix = '') {
  const out = [];
  for (const item of (await fs.readdir(path.join(dir, prefix), {withFileTypes: true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    if (item.isSymbolicLink()) throw Error(`Symlinks are not packaged: ${prefix}/${item.name}`);
    const name = path.posix.join(prefix, item.name);
    if (item.isDirectory()) out.push(...await filesUnder(dir, name));
    else if (item.isFile()) out.push(name);
  }
  return out;
}
export function decrypt(bytes, iv, key, compressed = false) {
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  d.setAuthTag(bytes.subarray(-16));
  const raw = Buffer.concat([d.update(bytes.subarray(0,-16)), d.final()]);
  return compressed ? gunzipSync(raw) : raw;
}
export async function packagePages(source, output, shellSource, config, reuse = null) {
  if (!/^\/[a-zA-Z0-9_-]+\/$/.test(config.pagesBase)) throw Error('Invalid pagesBase.');
  await fs.mkdir(path.join(output, 'sealed'), {recursive: true});
  let key = crypto.randomBytes(32), salt = crypto.randomBytes(32), previous = null, previousIndex = null;
  const previousRoot = reuse ? path.resolve(reuse) : output;
  try {
    const meta = JSON.parse(await fs.readFile(path.join(previousRoot, 'access.json')));
    const candidate = Buffer.from(meta.publicKey, 'base64');
    previous = JSON.parse(decrypt(await fs.readFile(path.join(previousRoot, meta.index)), meta.iv, candidate, true));
    key = candidate; salt = Buffer.from(meta.salt, 'base64'); previousIndex = meta.index;
    if (previousRoot !== output) {
      // Copy only validated package paths, not old landing pages or removed extras.
      for (const file of new Set([previousIndex, ...Object.values(previous.entries).map(e=>e.file)])) {
        if (!/^sealed\/[a-f0-9]{64}\.bin$/.test(file)) throw Error('Invalid previous package path.');
        await fs.copyFile(path.join(previousRoot, file), path.join(output, file));
      }
    }
  } catch (error) { if (reuse) throw error; }
  const encrypt = raw => {
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
    return {iv: iv.toString('base64'), bytes: Buffer.concat([c.update(raw), c.final(), c.getAuthTag()])};
  };
  const previousByHash = new Map(Object.values(previous?.entries || {}).map(e=>[e.sha256,e]));
  const entries = {}, unique = new Map(); let stored = 0;
  for (const name of await filesUnder(source)) {
    if (name.split('/').some(p=>p.startsWith('.'))) continue;
    const raw = await fs.readFile(path.join(source, name)), hash = sha256(raw);
    let entry = unique.get(hash);
    if (!entry && previousByHash.has(hash)) {
      const old = previousByHash.get(hash);
      try {
        const data = await fs.readFile(path.join(output, old.file));
        if (sha256(data) === path.basename(old.file, '.bin')) entry = {...old, cipherBytes: data.length};
      } catch {}
    }
    if (!entry) {
      const gz = gzipSync(raw, {level: 9}), compressed = gz.length < raw.length * .94;
      const encrypted = encrypt(compressed ? gz : raw);
      const file = `sealed/${sha256(encrypted.bytes)}.bin`;
      await fs.writeFile(path.join(output, file), encrypted.bytes);
      entry = {file, iv: encrypted.iv, compressed, sha256: hash, bytes: raw.length, cipherBytes: encrypted.bytes.length};
    }
    if (!unique.has(hash)) {unique.set(hash, entry); stored += entry.cipherBytes;}
    entries[name] = {...entry, type: mime[path.extname(name)] || 'application/octet-stream'};
  }
  const manifest = {version: 1, created: new Date().toISOString(), entries};
  const encrypted = encrypt(gzipSync(Buffer.from(JSON.stringify(manifest))));
  const index = `sealed/${sha256(encrypted.bytes)}.bin`, revision = sha256(encrypted.bytes).slice(0,20);
  await fs.writeFile(path.join(output, index), encrypted.bytes);
  // Keep the previous generation for already-open presentation tabs.
  const keep = new Set([index, previousIndex, ...Object.values(entries).map(e=>e.file), ...Object.values(previous?.entries || {}).map(e=>e.file)]);
  for (const name of await fs.readdir(path.join(output, 'sealed')))
    if (/^[a-f0-9]{64}\.bin$/.test(name) && !keep.has('sealed/'+name)) await fs.unlink(path.join(output, 'sealed', name));
  const shell = [];
  for (const name of await filesUnder(shellSource)) {
    if (name.includes('/')) throw Error('The defence shell uses root-level assets only.');
    const data = await fs.readFile(path.join(shellSource, name));
    await fs.writeFile(path.join(output, name), data);
    shell.push({path: name, sha256: sha256(data), bytes: data.length});
  }
  await fs.writeFile(path.join(output, 'access.json'), JSON.stringify({version:1, revision, publishedAt:manifest.created, public:true,
    publicKey:key.toString('base64'), iterations:600000, salt:salt.toString('base64'), iv:encrypted.iv, index,
    indexBytes:encrypted.bytes.length, shell, offlineBytes:stored+encrypted.bytes.length+shell.reduce((sum,e)=>sum+e.bytes,0)})+'\n');
  await exportPublicView(source, output, entries, path.join(shellSource, 'fullscreen.js'));
  console.log(`Built dist/pages/: ${Object.keys(entries).length} presentation files; revision ${revision}`);
}
