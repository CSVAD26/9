import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function prepareVendor() {
  const root = new URL('../', import.meta.url);
  await mkdir(new URL('vendor/', root), { recursive: true });
  for (const [source, destination] of [
    ['lib/p5.min.js', 'p5.min.js'],
    ['lib/addons/p5.sound.min.js', 'p5.sound.min.js'],
    ['license.txt', 'p5-LICENSE.txt'],
  ]) {
    await copyFile(
      new URL(`node_modules/p5/${source}`, root),
      new URL(`vendor/${destination}`, root),
    );
  }
  console.log('Local p5.js and optional sound library ready in vendor/.');
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  await prepareVendor();
}
