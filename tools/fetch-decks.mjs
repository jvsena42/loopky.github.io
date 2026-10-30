/* Refreshes tools/learn-english-decks.json from the author's homeserver.
 *
 *   node tools/fetch-decks.mjs
 *   node tools/build-guides.mjs
 *
 * The build never touches the network; this is the one step that does, and it is
 * run by hand when the decks change. It keeps only what the pages show, so the
 * snapshot changes when a title, a description or a card count does, not when the
 * app rewrites a manifest's bookkeeping.
 */

import { writeFileSync } from 'node:fs';
import { AUTHOR, DECKS_FILE } from './learn-english.mjs';

/* The same homeserver discover.js reads. */
const HOMESERVER = 'https://homeserver.pubky.app';
const headers = { 'pubky-host': AUTHOR };

async function get(path) {
  const r = await fetch(HOMESERVER + path, { headers });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r;
}

const listing = await (await get('/pub/loopky/decks/?shallow=true&limit=500')).text();
const ids = listing.split('\n')
  .map((line) => /\/pub\/loopky\/decks\/([^/\s]+)\/$/.exec(line.trim())?.[1])
  .filter(Boolean)
  .sort();

const decks = [];
for (const id of ids) {
  let m;
  try {
    m = await (await get(`/pub/loopky/decks/${encodeURIComponent(id)}/manifest.json`)).json();
  } catch (e) {
    console.warn(`skipped ${id}: ${e.message}`);
    continue;
  }
  if (m.incomplete) { console.warn(`skipped ${id}: still uploading`); continue; }
  decks.push({
    id,
    title: m.title,
    description: m.description ?? '',
    card_count: m.card_count,
    front_lang: m.front_lang ?? null,
    back_lang: m.back_lang ?? null,
    tags: m.tags ?? [],
    updated_at: m.updated_at,
  });
}

writeFileSync(new URL(`../${DECKS_FILE}`, import.meta.url),
  JSON.stringify({ author: AUTHOR, decks }, null, 2) + '\n');
console.log(`${decks.length} decks written to ${DECKS_FILE}. Now run: node tools/build-guides.mjs`);
