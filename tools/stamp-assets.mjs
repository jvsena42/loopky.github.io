/* Stamps a content hash onto every stylesheet and script index.html loads.
 *
 *   node tools/stamp-assets.mjs
 *
 * Pages serves the page and its assets with the same `max-age=600` and no
 * fingerprinting, and a browser expires each on its own clock. So a deploy that
 * adds a string can leave a returning visitor holding the new markup and a
 * ten-minute-old i18n.js, which is how `feat.cli.t` ended up painted into a card
 * where its title belonged.
 *
 * A query string keyed to the file's own bytes settles it: new markup names a URL
 * the cache has never seen, and an unchanged file keeps its stamp, so this is safe
 * to run on every commit. tools/check.mjs fails when a stamp and its file disagree.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const htmlPath = new URL('index.html', root);

export function stampFor(file) {
  return createHash('sha256')
    .update(readFileSync(new URL(file, root)))
    .digest('hex')
    .slice(0, 8);
}

/* href/src on a local .css or .js, with or without a stamp already on it. */
export const ASSET_RE = /(?:href|src)="((?:assets\/[^"?]+\.(?:css|js)))(?:\?v=([0-9a-f]{8}))?"/g;

export function stamp(html) {
  return html.replace(ASSET_RE, (whole, file) => {
    const attr = whole.startsWith('href') ? 'href' : 'src';
    return `${attr}="${file}?v=${stampFor(file)}"`;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const before = readFileSync(htmlPath, 'utf8');
  const after = stamp(before);
  if (after === before) {
    console.log('Stamps already current.');
  } else {
    writeFileSync(htmlPath, after);
    for (const [, file] of after.matchAll(ASSET_RE)) console.log(`  ${file}?v=${stampFor(file)}`);
    console.log('\nStamped.');
  }
}
