import { cp, mkdir, rm } from 'node:fs/promises';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareVendor } from './prepare-vendor.mjs';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
// Reflection drafts were never part of the public site; keep them local.
const reflectionNotes = fileURLToPath(new URL('assignments/reflections', root));
const assignment2 = new URL('assignments/MiniAssignment2/', root);
const assignment2Path = fileURLToPath(assignment2).replace(/\/$/, '');
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
        source !== assignment2Path &&
        !name.startsWith('.') &&
        !name.includes('.local.') &&
        !['local-data', 'node_modules'].includes(name)
      );
    },
  });
}
// Publish only the current p5 sketch. The local spectral studio archive contains
// ignored source, datasets, tools and old builds that are not part of this stage.
const assignment2Entries = ['index.html', 'sketch.js', 'style.css', 'README.md', 'assets', 'documentation'];
for (const entry of assignment2Entries) {
  await cp(new URL(entry, assignment2), new URL(`assignments/MiniAssignment2/${entry}`, output), {
    recursive: true,
    filter(source) {
      const name = basename(source);
      return !name.startsWith('.') && !name.includes('.local.') && !['local-data', 'node_modules'].includes(name);
    },
  });
}
console.log(`Static site built in ${fileURLToPath(output)}`);
