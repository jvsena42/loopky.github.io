/* Tells Bing, Yandex, Seznam, Naver and the other IndexNow engines which pages a
 * deploy changed, so they recrawl in hours rather than weeks.
 *
 *   node tools/indexnow.mjs <sha before the push>
 *
 * The deploy job runs it after Pages is live. It maps the HTML files the push
 * touched to their addresses and sends those, or every address in sitemap.xml when
 * it cannot tell (a first push, a force push). The engines check ownership by
 * fetching the key file at the site root, which is why 70747e102c8b7c4c31ffdd586a8ea820.txt is there and
 * must keep its name and contents. A failure only warns: search engines being slow
 * to hear about a page is not a reason to fail a deploy.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export const KEY = '70747e102c8b7c4c31ffdd586a8ea820';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const SITE = /<link rel="canonical" href="([^"]+)"/.exec(read('index.html'))[1];
const inSitemap = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

function changed(before) {
  if (!before || /^0+$/.test(before)) return null;
  try {
    return execFileSync('git', ['diff', '--name-only', before, 'HEAD'], { encoding: 'utf8' })
      .split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

/* A changed file's public address, if it has one worth announcing. */
function toUrl(file) {
  if (file === 'index.html') return SITE;
  if (file.endsWith('/index.html')) {
    const url = SITE + file.slice(0, -'index.html'.length);
    return inSitemap.includes(url) ? url : null;
  }
  if (file === 'llms.txt' || file === 'llms-full.txt') return SITE + file;
  return null;
}

const files = changed(process.argv[2]);
const urls = files === null ? inSitemap : [...new Set(files.map(toUrl).filter(Boolean))];

if (!urls.length) {
  console.log('IndexNow: no public page changed.');
  process.exit(0);
}

const host = new URL(SITE).host;
const body = { host, key: KEY, keyLocation: SITE + KEY + '.txt', urlList: urls.slice(0, 10000) };

try {
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  console.log(`IndexNow: sent ${urls.length} address${urls.length === 1 ? '' : 'es'}, answer ${res.status}.`);
  if (res.status >= 300) console.log('::warning::IndexNow did not accept the list: ' + (await res.text()).slice(0, 300));
} catch (e) {
  console.log('::warning::IndexNow could not be reached: ' + e.message);
}
