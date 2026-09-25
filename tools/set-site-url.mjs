/* Rewrites the absolute URLs the page publishes about itself.
 *
 *   node tools/set-site-url.mjs https://loopky.app/
 *
 * Everything the browser loads is a relative path, so the page works under any
 * prefix without this. What needs an absolute address is the part search engines
 * read: the canonical link, the Open Graph and Twitter cards, the eleven hreflang
 * alternates, the JSON-LD, the sitemap, and robots.txt.
 *
 * The repository is named loopky.github.io, which looks like a root domain and is
 * not one: that name only serves at the root when the account owning it is itself
 * called loopky. Under jvsena42 it is an ordinary project page. Point this at a
 * custom domain, or at wherever it really lives, and commit the result.
 */

import { readFileSync, writeFileSync } from 'node:fs';

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

const files = ['index.html', 'sitemap.xml', 'robots.txt', 'README.md'];
/* Any absolute address that points at this site, whatever it is set to today. */
const CURRENT = /https:\/\/(?:loopky\.github\.io|jvsena42\.github\.io\/loopky\.github\.io|[a-z0-9.-]+)\/(?=(?:\?lang=|assets\/img\/og\.png|sitemap\.xml|"|<|\s|$))/g;

let changed = 0;
for (const f of files) {
  const path = new URL('../' + f, import.meta.url);
  const before = readFileSync(path, 'utf8');
  const after = before.replace(CURRENT, base);
  if (after !== before) { writeFileSync(path, after); changed++; }
  console.log(`${after === before ? '  unchanged' : '  rewritten'}  ${f}`);
}
console.log(`\nSite URL is now ${base} (${changed} file${changed === 1 ? '' : 's'} changed).`);
