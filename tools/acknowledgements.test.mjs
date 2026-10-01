import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {renderAcknowledgements} from './render-acknowledgements.mjs';

test('acknowledgements render as literal text, including HTML and dollar characters', () => {
  const rendered = renderAcknowledgements('<div><!-- DEFENSE_ACKNOWLEDGEMENTS --></div>', {
    paragraphs: ['Thanks <friends> & family.', '$& <script>alert("test")</script>'],
  });
  assert.equal(rendered, '<div><p>Thanks &lt;friends&gt; &amp; family.</p>\n        <p>$&amp; &lt;script&gt;alert(&quot;test&quot;)&lt;/script&gt;</p></div>');
  assert.throws(() => renderAcknowledgements('missing', {paragraphs:['text']}), /placeholder/);
  assert.throws(() => renderAcknowledgements('<!-- DEFENSE_ACKNOWLEDGEMENTS -->', {paragraphs:[]}), /paragraphs/);
});

test('defence entrance includes its original acknowledgements without effect scripts', async () => {
  const html = await fs.readFile(new URL('../projects/defense/site/index.html', import.meta.url), 'utf8');
  const data = JSON.parse(await fs.readFile(new URL('../projects/defense/app/acknowledgements.json', import.meta.url), 'utf8'));
  const rendered = renderAcknowledgements(html, data);
  assert.equal((rendered.match(/<p>I would like to thank my main supervisor/g) || []).length, 1);
  assert.match(rendered, /I only want to read the acknowledgements/);
  assert.match(rendered, /download="Edis_Tireli_PhD_Thesis.pdf"/);
  assert.doesNotMatch(rendered, /DEFENSE_ACKNOWLEDGEMENTS|acknowledgement-names|complaint|nicholas-window|hava-nagila/);
});

test('reader cache dependencies exist in the simplified site', async () => {
  const root = new URL('../projects/defense/site/', import.meta.url);
  const worker = await fs.readFile(new URL('sw.js', root), 'utf8');
  const list = worker.match(/const READER_FILES=\[([^\]]+)\]/)?.[1];
  assert.ok(list);
  const paths = [...list.matchAll(/'([^']+)'/g)].map(match => match[1]);
  for (const path of paths) await fs.access(new URL(path, root));
  assert.ok(paths.includes('index.html'));
  assert.ok(paths.includes('gate-field.js'));
  assert.ok(!paths.includes('acknowledgement-reading.js'));
});
