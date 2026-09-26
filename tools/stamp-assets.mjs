/* Stamps a content hash onto every stylesheet and script the pages load.
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

/* The pages that carry the language picker and the i18n dictionaries. The deck and
   profile pages sit one directory down and reach the same files through `../`. */
export const PAGES = ['index.html', 'deck/index.html', 'profile/index.html'];

/* The English guide pages, one per kind of learner. They are plain HTML with no
   script and no language picker, written for search engines and for people who
   arrive from one. They load the same stylesheet, so they are stamped too. */
export const GUIDES = [
  'anki-alternative', 'language-learning', 'medical-students', 'teachers',
  'ai-flashcards', 'spaced-repetition', 'compare', 'faq',
].map((slug) => `${slug}/index.html`);

export const ALL_PAGES = [...PAGES, ...GUIDES];

export function stampFor(file) {
  return createHash('sha256')
    .update(readFileSync(new URL(file, root)))
    .digest('hex')
    .slice(0, 8);
}

/* href/src on a local .css or .js, with or without a stamp already on it. */
export const ASSET_RE = /(?:href|src)="((?:\.\.\/)*assets\/[^"?]+\.(?:css|js))(?:\?v=([0-9a-f]{8}))?"/g;

/* Every page lives at most one level down and every asset under assets/, so the
   `../` only says how to get back to the root. */
export const fromRoot = (file) => file.replace(/^(?:\.\.\/)+/, '');

export function stamp(html) {
  return html.replace(ASSET_RE, (whole, file) => {
    const attr = whole.startsWith('href') ? 'href' : 'src';
    return `${attr}="${file}?v=${stampFor(fromRoot(file))}"`;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let changed = false;
  for (const page of ALL_PAGES) {
    const htmlPath = new URL(page, root);
    const before = readFileSync(htmlPath, 'utf8');
    const after = stamp(before);
    if (after === before) continue;
    changed = true;
    writeFileSync(htmlPath, after);
    console.log(page);
    for (const [, file] of after.matchAll(ASSET_RE)) {
      console.log(`  ${file}?v=${stampFor(fromRoot(file))}`);
    }
  }
  console.log(changed ? '\nStamped.' : 'Stamps already current.');
}
