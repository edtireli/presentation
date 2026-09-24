import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {root} from './build.mjs';
import {filesUnder, decrypt, sha256} from './package-pages.mjs';

let checked=0;
for(const directory of ['engine','projects/defense','examples/starter','tools']){
  for(const name of await filesUnder(path.join(root,directory))){
    const file=path.join(root,directory,name);
    if(/\.(?:js|mjs)$/.test(name)){
      const check=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
      if(check.status!==0)throw Error(check.stderr);
      const source=await fs.readFile(file,'utf8');
      for(const match of source.matchAll(/(?:from\s*|import\s*\(\s*|new URL\(\s*)['"](\.{1,2}\/[^'"]+\.(?:js|mjs|css)(?:\?[^'"]*)?)['"]/g)){
        if(directory==='tools')continue; // Build tools also contain generated HTML/module templates.
        // The hosted live adapter runs below watch/ or virtual app/, beside the site shell.
        const location=directory==='projects/defense'&&name.startsWith('app/')
          ? path.join(root,'dist/pages/watch',name.slice(4)) : file;
        const target=path.resolve(path.dirname(location),match[1].split('?')[0]);
        await fs.access(target).catch(()=>{throw Error(`Missing module: ${file} -> ${match[1]}`);});
      }
      checked++;
    }
    if(/\.(?:json|spiral)$/.test(name)){JSON.parse(await fs.readFile(file,'utf8'));checked++;}
  }
}
const source=path.join(root,'dist/defense'), pages=path.join(root,'dist/pages');
const metadata=JSON.parse(await fs.readFile(path.join(pages,'access.json'),'utf8'));
const key=Buffer.from(metadata.publicKey,'base64');
const manifest=JSON.parse(decrypt(await fs.readFile(path.join(pages,metadata.index)),metadata.iv,key,true));
for(const[name,entry]of Object.entries(manifest.entries)){
  const cipher=await fs.readFile(path.join(pages,entry.file));
  if(sha256(cipher)!==path.basename(entry.file,'.bin'))throw Error(`Damaged blob: ${name}`);
  const raw=decrypt(cipher,entry.iv,key,entry.compressed);
  if(raw.length!==entry.bytes||sha256(raw)!==entry.sha256)throw Error(`Bad decoded asset: ${name}`);
  if(sha256(await fs.readFile(path.join(source,name)))!==entry.sha256)throw Error(`Build differs from offline package: ${name}`);
}
for(const entry of metadata.shell){
  if(sha256(await fs.readFile(path.join(pages,entry.path)))!==entry.sha256)throw Error(`Shell hash mismatch: ${entry.path}`);
}
const starterFiles=await filesUnder(path.join(root,'dist/starter'));
if(starterFiles.some(p=>p.includes('projects/defense/')||p.startsWith('decks/data/')||p==='live-config.json'))throw Error('Starter includes defence assets/services.');
const pagesFiles=await filesUnder(pages);
if(pagesFiles.some(p=>/acknowledgement-(?:nicholas|hava|names|word-hearts|mural|psychedelic|water|dancer|jellyfish)/.test(p)))throw Error('Removed website extras remain in deployment.');
console.log(`Checked ${checked} source modules/JSON files; decrypted and verified ${Object.keys(manifest.entries).length} offline assets and ${metadata.shell.length} shell files.`);
