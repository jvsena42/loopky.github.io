/* Refreshes the privacy policy and the terms from the app repository, where they
 * are written.
 *
 *   node tools/sync-legal.mjs           fetch PRIVACY.md and TERMS.md from main
 *   node tools/sync-legal.mjs ../loopky read them from a checkout instead
 *   node tools/sync-legal.mjs --check   exit 1 if the copies here have drifted
 *
 * The pages are built from the copies in tools/legal/, so a policy edited in the app
 * repository reaches the site only when this runs. CI runs --check as a warning: the
 * site saying something the policy no longer says is worth seeing in the log, and
 * GitHub being unreachable is not a reason to block a deploy.
 *
 * After a sync, rebuild: node tools/build-guides.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { META } from './legal.mjs';

const RAW = 'https://raw.githubusercontent.com/jvsena42/loopky/main/';

const args = process.argv.slice(2);
const check = args.includes('--check');
const checkout = args.find((a) => !a.startsWith('--'));

const drifted = [];
for (const [slug, { source }] of Object.entries(META)) {
  let upstream;
  if (checkout) {
    upstream = readFileSync(join(checkout, source), 'utf8');
  } else {
    const res = await fetch(RAW + source);
    if (!res.ok) {
      console.error(`${source}: ${RAW + source} answered ${res.status}`);
      process.exit(1);
    }
    upstream = await res.text();
  }
  const copy = new URL(`./legal/${slug}.md`, import.meta.url);
  if (readFileSync(copy, 'utf8') === upstream) continue;
  drifted.push(source);
  if (!check) writeFileSync(copy, upstream);
}

if (!drifted.length) {
  console.log('The privacy policy and the terms match the app repository.');
} else if (check) {
  console.error(`tools/legal/ has drifted from the app repository: ${drifted.join(', ')}\n` +
    'Run: node tools/sync-legal.mjs && node tools/build-guides.mjs');
  process.exit(1);
} else {
  console.log(`Updated from ${drifted.join(', ')}. Now run: node tools/build-guides.mjs`);
}
