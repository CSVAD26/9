import { cp, mkdir, rm } from 'node:fs/promises';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareVendor } from './prepare-vendor.mjs';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
// Reflection drafts were never part of the public site; keep them local.
const reflectionNotes = fileURLToPath(new URL('assignments/reflections', root));
await prepareVendor();
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// Copy classic scripts and all sketch assets unchanged, preserving relative URLs.
// Only these site folders are published; development files stay in the repo.
const siteEntries = [
  'index.html',
  'shared',
  'assignments',
  'templates',
  'vendor',
  'LICENSE',
];

for (const entry of siteEntries) {
  await cp(new URL(entry, root), new URL(entry, output), {
    recursive: true,
    filter(source) {
      const name = basename(source);
      return (
        source !== reflectionNotes &&
        !name.startsWith('.') &&
        !name.includes('.local.') &&
        !['local-data', 'node_modules'].includes(name)
      );
    },
  });
}
console.log(`Static site built in ${fileURLToPath(output)}`);
