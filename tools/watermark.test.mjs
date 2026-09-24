import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {verifyWatermarkPassword} from '../projects/defense/extensions/watermark.js';

test('watermark verification rejects invalid and incorrect passwords', async () => {
  for (const value of ['', null, 123, 'incorrect-password', 'a'.repeat(257)])
    assert.equal(await verifyWatermarkPassword(value), false);
});

test('watermark belongs to the defence extension, not the shared engine', async () => {
  const extension = await fs.readFile(new URL('../projects/defense/extensions/index.js', import.meta.url), 'utf8');
  const engine = await fs.readFile(new URL('../engine/index.html', import.meta.url), 'utf8');
  assert.match(extension, /await installDefenseWatermark\(\)/);
  assert.doesNotMatch(engine, /watermark/);
});
