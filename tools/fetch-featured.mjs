/* Refreshes tools/featured-decks.json: the decks the home page shows in Discover
 * before the live list arrives, and the only ones a reader without JavaScript sees.
 *
 *   node tools/fetch-featured.mjs
 *   node tools/build-guides.mjs
 *
 * It runs assets/js/discover.js itself, so the snapshot is picked by the same
 * verification and the same ranking as the live grid: a forged label or a deleted
 * deck cannot get in here any more than it can get in there. Like fetch-decks.mjs,
 * this is the one step that touches the network, and it is run by hand.
 */

import { readFileSync, writeFileSync } from 'node:fs';

export const FEATURED_FILE = 'tools/featured-decks.json';
const HOW_MANY = 12;

if (import.meta.url === `file://${process.argv[1]}`) {
  const src = readFileSync(new URL('../assets/js/discover.js', import.meta.url), 'utf8');
  const { loadDecks, fetchProfile } = new Function(src + '\nreturn { loadDecks, fetchProfile };')();

  const all = await loadDecks();
  if (!all.length) {
    console.error('The indexer returned no decks; keeping the snapshot as it is.');
    process.exit(1);
  }
  const top = all.slice(0, HOW_MANY);

  const names = {};
  for (const author of new Set(top.map((d) => d.author))) {
    const p = await fetchProfile(author);
    names[author] = (p && p.name) || '';
  }

  const decks = top.map((d) => ({
    author: d.author,
    author_name: names[d.author],
    id: d.id,
    title: d.title,
    cards: d.cards,
    emoji: d.emoji,
    topics: d.topics.slice(0, 3),
  }));

  writeFileSync(new URL(`../${FEATURED_FILE}`, import.meta.url),
    JSON.stringify({ of: all.length, decks }, null, 2) + '\n');
  console.log(`${decks.length} of ${all.length} decks written to ${FEATURED_FILE}. Now run: node tools/build-guides.mjs`);
}
