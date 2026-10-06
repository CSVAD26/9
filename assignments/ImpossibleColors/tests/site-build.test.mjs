import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const site = new URL('../../../dist/', import.meta.url);
const full = new URL('assignments/ImpossibleColors/', site);
const classic = new URL('assignments/MiniAssignment2/', site);

test('course homepage links to the classic picker and full spectrum app', async () => {
  const html = await readFile(new URL('index.html', site), 'utf8');
  assert.match(html, /href="\.\/assignments\/MiniAssignment2\/"/);
  assert.match(html, /href="\.\/assignments\/ImpossibleColors\/"[^>]*>Full spectrum<\/a>/);
});
test('classic picker HTML and scripts publish unchanged', async () => {
  for (const name of ['index.html', 'sketch.js', 'style.css']) {
    assert.equal(await readFile(new URL(name, classic), 'utf8'), await readFile(new URL(`../../MiniAssignment2/${name}`, import.meta.url), 'utf8'));
  }
});
test('full app publishes compiled modules and local depth assets without development files', async () => {
  const html = await readFile(new URL('index.html', full), 'utf8');
  assert.match(html, /src="\.\/assets\/[^\"]+\.js"/);
  for (const path of ['models/depth/fastdepth-320x256.onnx', 'models/depth/LICENSE', 'models/depth/runtime/ort-wasm-simd-threaded.asyncify.wasm', 'models/depth/runtime/LICENSE', 'notices/cie-colorimetry.txt']) await access(new URL(path, full));
  for (const path of ['src', 'tests', 'data', 'node_modules', 'package.json', 'package-lock.json', 'tsconfig.json', 'planning', 'dist']) await assert.rejects(access(new URL(path, full)), { code: 'ENOENT' });
  await assert.rejects(access(new URL('planning', site)), { code: 'ENOENT' });
});
