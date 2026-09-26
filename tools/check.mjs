/* Pre-flight for the landing page. No dependencies, no network.
 *
 *   node tools/check.mjs
 *
 * The one that matters is the i18n parity check: adding a string to `en` and
 * forgetting the other ten dictionaries is the mistake this repo invites, and the
 * page falls back to English silently when it happens, so nothing looks broken.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { stamp, PAGES, GUIDES, ALL_PAGES } from './stamp-assets.mjs';

const problems = [];
const notes = [];
const fail = (m) => problems.push(m);
const note = (m) => notes.push(m);

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const html = read('index.html');
/* index.html plus the deck and profile pages a shared link lands on. */
const pages = Object.fromEntries(PAGES.map((p) => [p, read(p)]));
/* The English guide pages. No i18n, no script: they are held to the asset, stamp,
   copy and URL rules below, not to the dictionary ones. */
const guides = Object.fromEntries(GUIDES.map((p) => [p, read(p)]));
const everyPage = { ...pages, ...guides };

/* ---- 1. every script parses ---- */

const scripts = ['assets/js/i18n.js', 'assets/js/discover.js', 'assets/js/app.js', 'assets/js/link.js'];
for (const f of scripts) {
  try {
    execFileSync(process.execPath, ['--check', new URL('../' + f, import.meta.url).pathname],
      { stdio: 'pipe' });
  } catch (e) {
    fail(`${f} does not parse:\n${e.stderr?.toString().trim()}`);
  }
}

/* ---- 2. the eleven dictionaries hold the same keys ---- */

const i18nSrc = read('assets/js/i18n.js');
let I18N, AI_PROMPT;
try {
  // The file is a plain script, so it is evaluated rather than imported.
  ({ I18N, AI_PROMPT } = new Function(i18nSrc + '\nreturn { I18N, AI_PROMPT };')());
} catch (e) {
  fail(`assets/js/i18n.js could not be evaluated: ${e.message}`);
}

const SUPPORTED = ['en', 'pt-BR', 'es', 'fr', 'de', 'it', 'ja', 'ko', 'vi', 'zh-Hans', 'zh-Hant'];

/* The slogan is a brand mark. strings.xml declares it translatable="false" and the
   app shows the English line in every locale, so these two must stay identical
   across all eleven. Checked in both directions: they are exempt from the
   untranslated-string note below, and translating one is an outright failure. */
const BRAND_KEYS = ['hero.title', 'cta.title'];

if (I18N) {
  const enKeys = Object.keys(I18N.en ?? {});
  if (!enKeys.length) fail('I18N.en is empty');

  for (const lang of SUPPORTED) {
    if (!I18N[lang]) { fail(`I18N is missing the "${lang}" dictionary`); continue; }
    const keys = Object.keys(I18N[lang]);
    const missing = enKeys.filter((k) => !(k in I18N[lang]));
    const extra = keys.filter((k) => !enKeys.includes(k));
    if (missing.length) fail(`"${lang}" is missing: ${missing.join(', ')}`);
    if (extra.length) fail(`"${lang}" has keys "en" does not: ${extra.join(', ')}`);

    /* A value copied across without translating is not an error, but it is worth
       seeing. The brand name and the store's own wording are the real exceptions. */
    // Some strings are the same word in another language, or are a brand name.
    const ALLOW_SAME = new Set([
      'foot.play', 'disc.topics', 'it:foot.privacy', 'de:theme.system', 'de:link.decks',
      ...BRAND_KEYS,
    ]);
    if (lang !== 'en') {
      const same = enKeys.filter((k) =>
        typeof I18N[lang][k] === 'string' &&
        I18N[lang][k] === I18N.en[k] &&
        !ALLOW_SAME.has(k) && !ALLOW_SAME.has(`${lang}:${k}`));
      if (same.length) note(`"${lang}" still reads English for: ${same.join(', ')}`);
    }

    /* uses.list is the one array. It has to stay an array in every language. */
    if (!Array.isArray(I18N[lang]['uses.list'])) {
      fail(`"${lang}" has a non-array uses.list`);
    }
  }

  for (const lang of Object.keys(I18N)) {
    if (!SUPPORTED.includes(lang)) fail(`I18N has an unsupported language: "${lang}"`);
  }

  for (const key of BRAND_KEYS) {
    for (const lang of SUPPORTED) {
      if (I18N[lang]?.[key] !== I18N.en?.[key]) {
        fail(`${key} is the slogan and must not be translated, but "${lang}" differs: ` +
          `${JSON.stringify(I18N[lang]?.[key])}`);
      }
    }
  }

  /* ---- 3. the page and the dictionaries agree ---- */

  const used = new Set(Object.values(pages)
    .flatMap((page) => [...page.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1])));
  /* Keys the scripts reach for directly, which never appear as an attribute. */
  const fromJs = new Set();
  for (const f of ['assets/js/app.js', 'assets/js/link.js']) {
    /* t(key) and tf(key, fallback) both count as a use. */
    for (const m of read(f).matchAll(/(?<![\w$])tf?\('([^']+)'\s*[,)]/g)) fromJs.add(m[1]);
  }

  for (const key of [...used, ...fromJs]) {
    if (!(key in I18N.en)) fail(`the page asks for "${key}", which no dictionary defines`);
  }
  const unused = enKeys.filter((k) => !used.has(k) && !fromJs.has(k));
  if (unused.length) note(`defined but never used: ${unused.join(', ')}`);
}

/* ---- 4. the AI prompt still names the real commands ---- */

if (AI_PROMPT) {
  const required = ['loopky login', 'loopky deck create', 'loopky import', '--dry-run', '--json'];
  for (const cmd of required) {
    if (!AI_PROMPT.includes(cmd)) fail(`the AI prompt no longer mentions \`${cmd}\``);
  }
  if (!/install\.sh|install\.ps1/.test(AI_PROMPT)) fail('the AI prompt has no install line');
}

/* ---- 5. every local asset the page references exists ---- */

for (const [page, src] of Object.entries(everyPage)) {
  const base = new URL('../' + page, import.meta.url);
  const refs = new Set([
    ...[...src.matchAll(/(?:src|href)="(?!https?:|#|mailto:|data:)([^"]+)"/g)].map((m) => m[1]),
  ]);
  for (const ref of refs) {
    const path = ref.split(/[?#]/)[0];
    if (!path) continue;
    if (!existsSync(new URL(path, base))) {
      fail(`${page} points at ${path}, which is not in the repository`);
    }
  }
}

/* ---- 5b. every asset URL carries the stamp its file's bytes ask for ---- */

/* An unstamped or stale URL means a visitor can hold this markup next to a
   ten-minute-old script. Run `node tools/stamp-assets.mjs` to settle it. */
for (const [page, src] of Object.entries(everyPage)) {
  if (stamp(src) !== src) {
    fail(`${page} has a stale or missing asset stamp. Run: node tools/stamp-assets.mjs`);
  }
}

/* ---- 5c. the two dark palettes hold the same declarations ---- */

/* The theme switch writes data-theme onto <html>, so dark has to be spelled twice:
   once for the system's media query, once for the attribute. CSS has no way to share
   one block between the two, so this compares them and fails when only one was
   edited, which is the mistake that would leave the switch half a theme behind. */

const css = read('assets/css/style.css');

/* Both blocks are read the same way: from the selector to its closing brace, then
   reduced to the declarations themselves, order and spacing set aside. */
const decls = (selector) => {
  const at = css.indexOf(selector + ' {');
  if (at === -1) return null;
  const end = css.indexOf('}', at);
  return css.slice(at + selector.length + 2, end)
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .sort();
};

const fromMedia = decls(':root:not([data-theme="light"])');
const fromAttr = decls(':root[data-theme="dark"]');
if (!fromMedia) fail('style.css has no :root:not([data-theme="light"]) dark palette');
if (!fromAttr) fail('style.css has no :root[data-theme="dark"] palette');
if (fromMedia && fromAttr) {
  const only = (a, b) => a.filter((d) => !b.includes(d));
  const strays = [
    ...only(fromMedia, fromAttr).map((d) => `only under the media query: ${d}`),
    ...only(fromAttr, fromMedia).map((d) => `only under [data-theme="dark"]: ${d}`),
  ];
  if (strays.length) {
    fail('the two dark palettes in style.css have drifted apart:\n  ' + strays.join('\n  '));
  }
}

/* The light palette is the default, so a visitor who picks light must land back on
   it rather than on an attribute nothing styles. */
if (!/:root:not\(\[data-theme="light"\]\)/.test(css)) {
  fail('the dark media query does not exempt a visitor who picked light');
}

/* ---- 6. the things GitHub Pages and crawlers need ---- */

for (const f of ['.nojekyll', 'robots.txt', 'sitemap.xml', 'llms.txt', 'llms-full.txt']) {
  if (!existsSync(new URL('../' + f, import.meta.url))) fail(`${f} is missing`);
}

const sitemap = read('sitemap.xml');
for (const lang of SUPPORTED) {
  if (!sitemap.includes(`hreflang="${lang}"`)) fail(`sitemap.xml has no hreflang for "${lang}"`);
  if (!html.includes(`hreflang="${lang}"`)) fail(`index.html has no hreflang link for "${lang}"`);
  for (const [page, src] of Object.entries(pages)) {
    if (!src.includes(`<option value="${lang}">`)) fail(`${page}'s language picker is missing "${lang}"`);
  }
}

/* The deck and profile pages answer for every deck and every person through a query
   string, so they stay out of the index and out of the sitemap. */
for (const page of PAGES.filter((p) => p !== 'index.html')) {
  if (!/<meta name="robots" content="noindex">/.test(pages[page])) {
    fail(`${page} should carry <meta name="robots" content="noindex">`);
  }
  if (sitemap.includes(page.replace('index.html', ''))) {
    fail(`sitemap.xml lists ${page}, which is a template rather than a page`);
  }
}

/* Android verifies an App Link against this file before it will open loopky.app in
   the app. A typo here does not fail anything visible: the link just opens the
   browser, which is the web page, which looks like it works. */
try {
  const links = JSON.parse(read('.well-known/assetlinks.json'));
  const android = Array.isArray(links) && links.find((s) =>
    s?.target?.namespace === 'android_app' &&
    s.target.package_name === 'com.github.jvsena42.loopky' &&
    s.relation?.includes('delegate_permission/common.handle_all_urls'));
  if (!android) {
    fail('.well-known/assetlinks.json has no handle_all_urls statement for com.github.jvsena42.loopky');
  } else {
    const prints = android.target.sha256_cert_fingerprints ?? [];
    if (!prints.length) fail('.well-known/assetlinks.json lists no certificate fingerprints');
    for (const fp of prints) {
      if (!/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(fp)) {
        fail(`.well-known/assetlinks.json has a malformed fingerprint: ${fp}`);
      }
    }
  }
} catch (e) {
  fail(`.well-known/assetlinks.json is missing or not JSON: ${e.message}`);
}

/* upload-pages-artifact@v4 leaves dotfiles out of the artifact unless told otherwise,
   so bumping it would quietly stop publishing .well-known and every App Link with it. */
const workflow = read('.github/workflows/pages.yml');
const upload = /actions\/upload-pages-artifact@v(\d+)/.exec(workflow);
if (upload && Number(upload[1]) >= 4 && !/include-hidden-files:\s*true/.test(workflow)) {
  fail('upload-pages-artifact v4+ drops .well-known unless the step sets include-hidden-files: true');
}
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const expected = SUPPORTED.length + 1 + GUIDES.length;
if (locs.length !== expected) {
  fail(`sitemap.xml lists ${locs.length} URLs, expected ${expected}`);
}

/* One site URL, agreed on by everything that publishes one. The canonical link is
   the source of truth; tools/set-site-url.mjs moves them all together, and this is
   what catches a move that only half landed. */
const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
if (!canonical) {
  fail('index.html has no canonical link');
} else {
  if (!canonical.endsWith('/')) fail(`the canonical URL should end in a slash: ${canonical}`);
  const elsewhere = [
    ...[...html.matchAll(/<link rel="alternate" hreflang="[^"]+" href="([^"]+)"/g)]
      .map((m) => ['index.html hreflang', m[1]]),
    ...[...html.matchAll(/<meta property="og:(?:url|image)" content="([^"]+)"/g)]
      .map((m) => ['index.html og', m[1]]),
    ...[...html.matchAll(/<meta name="twitter:image" content="([^"]+)"/g)]
      .map((m) => ['index.html twitter', m[1]]),
    ...locs.map((l) => ['sitemap.xml', l]),
    ...[...sitemap.matchAll(/<xhtml:link[^>]*href="([^"]+)"/g)].map((m) => ['sitemap.xml hreflang', m[1]]),
    ...[...read('robots.txt').matchAll(/^Sitemap:\s*(\S+)/gm)].map((m) => ['robots.txt', m[1]]),
    ...Object.entries(guides).flatMap(([page, src]) => [
      ...src.matchAll(/<link rel="canonical" href="([^"]+)"/g),
      ...src.matchAll(/<meta property="og:(?:url|image)" content="([^"]+)"/g),
    ].map((m) => [page, m[1]])),
  ];
  const strays = [...new Set(elsewhere
    .filter(([, url]) => !url.startsWith(canonical))
    .map(([where, url]) => `${where}: ${url}`))];
  if (strays.length) {
    fail(`these do not sit under the canonical URL ${canonical}:\n  ` + strays.join('\n  '));
  }
}

/* ---- 6b. the guide pages are indexable, listed, and say who they are ---- */

/* The opposite of the deck and profile pages: each guide is one real page, so it
   carries its own canonical, sits in the sitemap, and must not carry noindex. */
for (const [page, src] of Object.entries(guides)) {
  const url = canonical && canonical + page.replace('index.html', '');
  const own = /<link rel="canonical" href="([^"]+)"/.exec(src)?.[1];
  if (own !== url) fail(`${page} has canonical ${own}, expected ${url}`);
  if (!locs.includes(url)) fail(`sitemap.xml does not list ${url}`);
  if (/noindex/.test(src)) fail(`${page} is a guide and must not carry noindex`);
  if (!/<title>[^<]{10,}<\/title>/.test(src)) fail(`${page} has no real <title>`);
  if (!/<meta name="description" content="[^"]{50,}">/.test(src)) fail(`${page} has no meta description`);
  if ((src.match(/<h1[\s>]/g) ?? []).length !== 1) fail(`${page} should have exactly one <h1>`);
}

/* Structured data that does not parse is ignored by every reader, silently. */
for (const [page, src] of Object.entries(everyPage)) {
  for (const m of src.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (e) { fail(`${page} has JSON-LD that does not parse: ${e.message}`); }
  }
}

/* llms.txt and llms-full.txt are what an assistant reads instead of the page. Every
   address on this site they name has to exist, or the model is sent to a 404. */
if (canonical) {
  for (const f of ['llms.txt', 'llms-full.txt']) {
    const text = read(f);
    if (!text.startsWith('# ')) fail(`${f} should open with a "# " title`);
    for (const [, found] of text.matchAll(/(https?:\/\/[^\s)"'<>`]+)/g)) {
      /* A sentence may end right after an address. */
      const url = found.replace(/[.,;:]+$/, '');
      if (!url.startsWith(canonical)) continue;
      const path = url.slice(canonical.length).split(/[?#]/)[0];
      const file = !path ? 'index.html' : path.endsWith('/') ? path + 'index.html' : path;
      if (!existsSync(new URL('../' + file, import.meta.url))) {
        fail(`${f} links ${url}, which is not in the repository`);
      }
    }
  }
  for (const page of GUIDES) {
    if (!read('llms.txt').includes(canonical + page.replace('index.html', ''))) {
      fail(`llms.txt does not list the guide ${page}`);
    }
  }
}

/* The home page ships the English prompt and topic list in its markup, so a crawler
   or an assistant that runs no script still reads them. app.js repaints both, so
   the markup has to match what it would paint. */
if (AI_PROMPT) {
  const shipped = /<pre id="ai-prompt"><code>([\s\S]*?)<\/code><\/pre>/.exec(html)?.[1]
    ?.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  if (shipped !== AI_PROMPT) {
    fail('the AI prompt in index.html differs from AI_PROMPT in i18n.js; copy it across');
  }
}
if (I18N) {
  const shipped = [.../<ul class="pillrow" id="uses-list">([\s\S]*?)<\/ul>/.exec(html)?.[1]
    ?.matchAll(/<li>([^<]*)<\/li>/g) ?? []].map((m) => m[1]);
  if (JSON.stringify(shipped) !== JSON.stringify(I18N.en['uses.list'])) {
    fail('the topic list in index.html differs from uses.list in i18n.js; copy it across');
  }
}

/* ---- 7. copy rules ---- */

/* Em and en dashes read as machine-written, and the app's own strings avoid them.
   Only the parts a visitor reads are checked; source comments are free to use them. */
for (const [page, src] of Object.entries(everyPage)) {
  const visible = src.replace(/<!--[\s\S]*?-->/g, '');
  if (/[—–]/.test(visible)) fail(`${page} has an em or en dash in visible copy`);
}
for (const f of ['llms.txt', 'llms-full.txt']) {
  if (/[—–]/.test(read(f))) fail(`${f} has an em or en dash`);
}
if (I18N) {
  for (const [lang, dict] of Object.entries(I18N)) {
    for (const [key, value] of Object.entries(dict)) {
      const text = Array.isArray(value) ? value.join(' ') : String(value);
      if (/[—–]/.test(text)) fail(`"${lang}" has an em or en dash in ${key}`);
    }
  }
}

/* ---- 8. no network value may reach innerHTML ---- */

for (const f of ['assets/js/discover.js', 'assets/js/app.js', 'assets/js/link.js']) {
  const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  if (/\.innerHTML\s*=/.test(src) || /insertAdjacentHTML/.test(src)) {
    fail(`${f} writes HTML from a string. Deck data comes from strangers, so it must not.`);
  }
}

/* ---- report ---- */

for (const n of notes) console.log(`note: ${n}`);
if (problems.length) {
  console.error('\n' + problems.map((p) => `FAIL: ${p}`).join('\n'));
  console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}.`);
  process.exit(1);
}
console.log(`\nOK. ${SUPPORTED.length} languages, ${Object.keys(I18N?.en ?? {}).length} strings each.`);
