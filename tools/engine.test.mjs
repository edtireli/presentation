import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {SCENES, ALL_SCENES, registerScenes} from '../engine/js/manim.js';
import {BLOCKS, registerBlocks} from '../engine/js/blocks.js';
import {SpeakerNoteStore} from '../engine/js/speaker-note-store.js';
import {decrypt,sha256} from './package-pages.mjs';

test('core scenes start without anatomy or defence scenes',()=>{
  assert.deepEqual(Object.keys(ALL_SCENES),Object.keys(SCENES));
  assert.ok(!BLOCKS['pbrain-puzzle']);assert.ok(!BLOCKS['defense-overview']);
});
test('scene/block registration validates and rejects collisions',()=>{
  const scene={draw(){}};registerScenes({testScene:scene});assert.equal(ALL_SCENES.testScene,scene);
  assert.throws(()=>registerScenes({testScene:scene}),/already registered/);
  assert.throws(()=>registerScenes({invalidScene:{}}),/needs draw/);
  const block={render(){}};registerBlocks({testBlock:block});assert.equal(BLOCKS.testBlock,block);
  assert.throws(()=>registerBlocks({testBlock:block}),/already registered/);
});
test('ordinary projects can save/export notes without recorded audio',()=>{
  const entries=new Map(),storage={getItem:k=>entries.get(k)||null,setItem:(k,v)=>entries.set(k,v)};
  const store=new SpeakerNoteStore(storage,'test',{states:{}},'deck-hash');
  store.set('welcome/0','My revised opening.');
  assert.equal(store.review().speakerOnlyStates['welcome/0'].say,'My revised opening.');
  assert.equal(new SpeakerNoteStore(storage,'test',{states:{}},'deck-hash').edits['welcome/0'].say,'My revised opening.');
});
test('offline packing retains authenticated byte integrity',()=>{
  const key=crypto.randomBytes(32),iv=crypto.randomBytes(12),raw=Buffer.from('a presentation asset');
  const c=crypto.createCipheriv('aes-256-gcm',key,iv),packed=gzipSync(raw);
  const cipher=Buffer.concat([c.update(packed),c.final(),c.getAuthTag()]);
  assert.deepEqual(decrypt(cipher,iv.toString('base64'),key,true),raw);
  const corrupt=Buffer.from(cipher);corrupt[0]^=1;assert.throws(()=>decrypt(corrupt,iv.toString('base64'),key,true));
  assert.equal(sha256(raw).length,64);
});
test('starter config contains no external service or defence extension',async()=>{
  const config=JSON.parse(await fs.readFile(new URL('../examples/starter/project.json',import.meta.url)));
  assert.equal(config.deck,'decks/starter.spiral');assert.deepEqual(config.extensions,[]);
  assert.ok(!JSON.stringify(config).includes('tireli-presentation-service'));
});
