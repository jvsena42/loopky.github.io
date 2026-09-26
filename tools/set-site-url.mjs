/* Rewrites the absolute URLs the page publishes about itself.
 *
 *   node tools/set-site-url.mjs https://loopky.app/
 *
 * Everything the browser loads is a relative path, so the page works under any
 * prefix without this. What needs an absolute address is the part search engines
 * read: the canonical link, the Open Graph and Twitter cards, the eleven hreflang
 * alternates, the JSON-LD, the sitemap, robots.txt, the guide pages and llms.txt.
 *
 * The repository is named loopky.github.io, which looks like a root domain and is
 * not one: that name only serves at the root when the account owning it is itself
 * called loopky. Under jvsena42 it is an ordinary project page. Point this at a
 * custom domain, or at wherever it really lives, and commit the result.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { GUIDES } from './stamp-assets.mjs';
import { HOME_FILES } from './guides.mjs';

const next = process.argv[2];
if (!next) {
  console.error('usage: node tools/set-site-url.mjs <url>');
  process.exit(2);
}
let base;
try {
  base = new URL(next).href;
} catch {
  console.error(`not a URL: ${next}`);
  process.exit(2);
}
if (!base.endsWith('/')) base += '/';

const files = ['index.html', 'sitemap.xml', 'robots.txt', 'README.md',
  'llms.txt', 'llms-full.txt', ...GUIDES, ...HOME_FILES];
/* The canonical link is the source of truth for where the site is today, and
   tools/check.mjs holds every other published address under it, so moving the site
   is replacing that one prefix wherever it appears. */
const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const current = /<link rel="canonical" href="([^"]+)"/.exec(read('index.html'))?.[1];
if (!current) {
  console.error('index.html has no canonical link to move from');
  process.exit(1);
}

let changed = 0;
for (const f of files) {
  const path = new URL('../' + f, import.meta.url);
  const before = readFileSync(path, 'utf8');
  const after = before.split(current).join(base);
  if (after !== before) { writeFileSync(path, after); changed++; }
  console.log(`${after === before ? '  unchanged' : '  rewritten'}  ${f}`);
}
console.log(`\nSite URL is now ${base} (${changed} file${changed === 1 ? '' : 's'} changed).`);
