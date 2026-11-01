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
import { SLUGS, LOCALES, HOME_FILES, LEGAL, LEGAL_FILES } from './guides.mjs';
import { DECKS_FILE, LANGS, learnFiles, builtLangs } from './learn-english.mjs';

const problems = [];
const notes = [];
const fail = (m) => problems.push(m);
const note = (m) => notes.push(m);

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const html = read('index.html');
/* index.html plus the deck and profile pages a shared link lands on. */
const pages = Object.fromEntries(PAGES.map((p) => [p, read(p)]));
/* The guide pages, every language. Built from tools/guides/*.json, so they are held
   to the asset, stamp, copy and URL rules below, and the dictionaries to parity. */
const guides = Object.fromEntries(GUIDES.map((p) => [p, read(p)]));
/* The home page's copies in the other ten languages, built from index.html. */
const homes = Object.fromEntries(HOME_FILES.map((p) => [p, read(p)]));
/* The privacy policy, the terms and the support page, English only. */
const legal = Object.fromEntries(LEGAL_FILES.map((p) => [p, read(p)]));
/* The learn-English hub and one page per language with English decks, built from
   the deck snapshot. */
const snapshot = JSON.parse(read(DECKS_FILE));
const learn = Object.fromEntries(learnFiles(snapshot).map((p) => [p, read(p)]));
const everyPage = { ...pages, ...guides, ...homes, ...legal, ...learn };

/* ---- 1. every script parses ---- */

const scripts = ['assets/js/i18n.js', 'assets/js/discover.js', 'assets/js/app.js', 'assets/js/webmcp.js', 'assets/js/link.js', 'tools/indexnow.mjs', 'tools/a11y-check.mjs', 'tools/fetch-featured.mjs'];
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
let I18N, AI_PROMPT, IDEAS, aiPrompt, AI_APPS, aiAppUrl;
try {
  // The file is a plain script, so it is evaluated rather than imported.
  ({ I18N, AI_PROMPT, IDEAS, aiPrompt, AI_APPS, aiAppUrl } =
    new Function(i18nSrc + '\nreturn { I18N, AI_PROMPT, IDEAS, aiPrompt, AI_APPS, aiAppUrl };')());
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
      'foot.play', 'disc.topics', 'idea.anime.t', 'it:foot.privacy', 'de:theme.system', 'de:link.decks',
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
  for (const f of ['assets/js/app.js', 'assets/js/link.js', 'assets/js/recap.js']) {
    /* t(key) and tf(key, fallback) both count as a use. */
    for (const m of read(f).matchAll(/(?<![\w$])tf?\('([^']+)'\s*[,)]/g)) fromJs.add(m[1]);
  }
  /* app.js paints each idea's request by building the key from IDEAS. */
  for (const id of IDEAS ?? []) fromJs.add(`idea.${id}.p`);

  for (const key of [...used, ...fromJs]) {
    if (!(key in I18N.en)) fail(`the page asks for "${key}", which no dictionary defines`);
  }
  const unused = enKeys.filter((k) => !used.has(k) && !fromJs.has(k));
  if (unused.length) note(`defined but never used: ${unused.join(', ')}`);
}

/* ---- 4. the AI prompt still points to the plugin and its skill ---- */

if (AI_PROMPT) {
  const required = ['/plugin install loopky@loopky', 'plugins/loopky/skills/loopky/SKILL.md'];
  for (const cmd of required) {
    if (!AI_PROMPT.includes(cmd)) fail(`the AI prompt no longer mentions \`${cmd}\``);
  }
  if (!/install\.sh/.test(AI_PROMPT)) fail('the AI prompt has no install line');
  /* aiPrompt swaps these two lines for a request; reword them and it swaps nothing. */
  if (aiPrompt && aiPrompt('x') === AI_PROMPT) fail('aiPrompt no longer finds the Topic and Cards lines in AI_PROMPT');
}
if (I18N && IDEAS) {
  for (const id of IDEAS) {
    for (const k of [`idea.${id}.t`, `idea.${id}.p`]) if (!(k in I18N.en)) fail(`IDEAS names "${id}", but "${k}" is not defined`);
    if (!html.includes(`data-idea="${id}"`)) fail(`index.html has no button for the idea "${id}"`);
  }
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

/* The iOS counterpart. Same silent failure: an app ID that does not match the
   signed build, or a missing path, just opens Safari on the web page. */
try {
  const aasa = JSON.parse(read('.well-known/apple-app-site-association'));
  const ios = aasa?.applinks?.details?.find((d) =>
    d.appIDs?.includes('WFQWFBS5H7.com.github.jvsena42.loopky'));
  if (!ios) {
    fail('.well-known/apple-app-site-association has no applinks entry for WFQWFBS5H7.com.github.jvsena42.loopky');
  } else {
    const paths = (ios.components ?? []).map((c) => c['/']);
    for (const p of ['/deck/*', '/profile/*']) {
      if (!paths.includes(p)) fail(`.well-known/apple-app-site-association does not cover ${p}`);
    }
  }
  /* The app saves the recovery phrase as a loopky.app password. Without this entry the
     save is refused on the device, and the app's backup button fails with no reason given. */
  if (!aasa?.webcredentials?.apps?.includes('WFQWFBS5H7.com.github.jvsena42.loopky')) {
    fail('.well-known/apple-app-site-association has no webcredentials entry for WFQWFBS5H7.com.github.jvsena42.loopky');
  }
} catch (e) {
  fail(`.well-known/apple-app-site-association is missing or not JSON: ${e.message}`);
}

/* upload-pages-artifact@v4 leaves dotfiles out of the artifact unless told otherwise,
   so bumping it would quietly stop publishing .well-known and every App Link with it. */
const workflow = read('.github/workflows/pages.yml');
const upload = /actions\/upload-pages-artifact@v(\d+)/.exec(workflow);
if (upload && Number(upload[1]) >= 4 && !/include-hidden-files:\s*true/.test(workflow)) {
  fail('upload-pages-artifact v4+ drops .well-known unless the step sets include-hidden-files: true');
}
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
/* One home page per language, one guide page per language and guide, and the three
   English legal pages, and the learn-English pages. */
const expected = SUPPORTED.length + GUIDES.length + LEGAL_FILES.length + Object.keys(learn).length;
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
    ...Object.entries({ ...guides, ...legal, ...learn }).flatMap(([page, src]) => [
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
for (const [page, src] of Object.entries({ ...guides, ...legal })) {
  const url = canonical && canonical + page.replace('index.html', '');
  const own = /<link rel="canonical" href="([^"]+)"/.exec(src)?.[1];
  if (own !== url) fail(`${page} has canonical ${own}, expected ${url}`);
  if (!locs.includes(url)) fail(`sitemap.xml does not list ${url}`);
  if (/noindex/.test(src)) fail(`${page} is a guide and must not carry noindex`);
  if (!/<title>[^<]{10,}<\/title>/.test(src)) fail(`${page} has no real <title>`);
  if (!/<meta name="description" content="[^"]{20,}">/.test(src)) fail(`${page} has no meta description`);
  for (const l of page in legal ? [] : LOCALES) {
    if (!src.includes(`hreflang="${l.code}"`)) fail(`${page} has no hreflang for "${l.code}"`);
  }
  if ((src.match(/<h1[\s>]/g) ?? []).length !== 1) fail(`${page} should have exactly one <h1>`);
}

/* The learn-English pages are held to the same: their own canonical, listed, indexable,
   one <h1>, and an hreflang for every language that has a page. */
const learnCodes = ['x-default', 'en', ...builtLangs(snapshot).map((l) => l.code)];
for (const [page, src] of Object.entries(learn)) {
  const url = canonical && canonical + page.replace('index.html', '');
  const own = /<link rel="canonical" href="([^"]+)"/.exec(src)?.[1];
  if (own !== url) fail(`${page} has canonical ${own}, expected ${url}`);
  if (!locs.includes(url)) fail(`sitemap.xml does not list ${url}`);
  if (/noindex/.test(src)) fail(`${page} must not carry noindex`);
  if (!/<title>[^<]{10,}<\/title>/.test(src)) fail(`${page} has no real <title>`);
  if (!/<meta name="description" content="[^"]{20,}">/.test(src)) fail(`${page} has no meta description`);
  for (const code of learnCodes) {
    if (!src.includes(`hreflang="${code}"`)) fail(`${page} has no hreflang for "${code}"`);
  }
  if ((src.match(/<h1[\s>]/g) ?? []).length !== 1) fail(`${page} should have exactly one <h1>`);
}
/* A deck whose language has no entry in LANGS gets no page, which is easy to miss. */
for (const d of snapshot.decks) {
  const front = String(d.front_lang || '').split('-')[0].toLowerCase();
  if (/^en\b/i.test(d.back_lang || '') && !LANGS.some((l) => l.front === front)) {
    note(`the deck ${d.id} teaches English to "${d.front_lang}" speakers, which has no entry in tools/learn-english.mjs`);
  }
}

/* ---- 6b'. the legal pages are reachable, and the two policies name their source ---- */

/* OpenAI's plugin directory and both app stores are handed these three addresses, so
   a footer that drops one is a submission that points at a page nobody can find. */
for (const [page, src] of Object.entries(everyPage)) {
  for (const slug of LEGAL) {
    if (!new RegExp(`<a href="(?:\\.\\./)*${slug}/"`).test(src)) fail(`${page}'s footer does not link ${slug}/`);
  }
}
for (const [slug, source] of [['privacy', 'PRIVACY.md'], ['terms', 'TERMS.md']]) {
  const src = legal[`${slug}/index.html`];
  if (!src.includes(`https://github.com/jvsena42/loopky/blob/main/${source}`)) {
    fail(`${slug}/index.html does not link back to ${source}, which is its source`);
  }
  const updated = /^\*\*Last updated:\*\* (.+)$/m.exec(read(`tools/legal/${slug}.md`))?.[1];
  if (!updated || !src.includes(`Last updated ${updated}.`)) {
    fail(`${slug}/index.html does not carry the "Last updated" date of tools/legal/${slug}.md`);
  }
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
  for (const slug of SLUGS) {
    if (!read('llms.txt').includes(canonical + slug + '/')) {
      fail(`llms.txt does not list the guide ${slug}`);
    }
  }
}

/* The home page ships the English prompt and topic list in its markup, so a crawler
   or an assistant that runs no script still reads them. app.js repaints both, so
   the markup has to match what it would paint. */
if (AI_PROMPT) {
  const shipped = /<pre id="ai-prompt"><code>([\s\S]*?)<\/code><\/pre>/.exec(html)?.[1]
    ?.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  if (shipped !== aiPrompt(I18N.en[`idea.${IDEAS[0]}.p`])) {
    fail('the AI prompt in index.html differs from aiPrompt() with the first idea; copy it across');
  }
  const want = aiPrompt(I18N.en[`idea.${IDEAS[0]}.p`]);
  for (const [id] of AI_APPS ?? []) {
    const href = new RegExp(`<a class="ai-app" data-ai="${id}" href="([^"]*)"`).exec(html)?.[1]
      ?.replace(/&amp;/g, '&');
    if (href !== aiAppUrl(id, want)) fail(`the ${id} link in index.html does not open the first idea's prompt; copy it across`);
  }
}
if (I18N) {
  const shipped = [.../<ul class="pillrow" id="uses-list">([\s\S]*?)<\/ul>/.exec(html)?.[1]
    ?.matchAll(/<li>([^<]*)<\/li>/g) ?? []].map((m) => m[1]);
  if (JSON.stringify(shipped) !== JSON.stringify(I18N.en['uses.list'])) {
    fail('the topic list in index.html differs from uses.list in i18n.js; copy it across');
  }
}

/* The home page's hreflang points at the language folders, not at ?lang=, which only
   forwards there now. */
for (const l of LOCALES) {
  const want = `hreflang="${l.code}" href="${canonical}${l.dir ? l.dir + '/' : ''}"`;
  for (const [page, src] of Object.entries({ 'index.html': html, ...homes })) {
    if (!src.includes(want)) fail(`${page} lacks <link rel="alternate" ${want}>`);
  }
}

/* IndexNow engines check ownership by fetching the key file at the root. A renamed
   or edited key file makes every announcement fail, quietly, in a warning. */
{
  const key = /export const KEY = '([0-9a-f]{32})'/.exec(read('tools/indexnow.mjs'))?.[1];
  if (!key) fail('tools/indexnow.mjs has no 32-character KEY');
  else if (!existsSync(new URL(`../${key}.txt`, import.meta.url)) || read(`${key}.txt`) !== key) {
    fail(`${key}.txt must sit at the site root and hold exactly the IndexNow key`);
  }
}

/* ---- 6c. the guide dictionaries match, and the pages are built from them ---- */

/* Every language has to hold the same keys and the same number of items as
   English, or a page quietly loses a card or a question in one language. */
const shape = (v, path = '') => Array.isArray(v)
  ? [`${path}[${v.length}]`, ...v.flatMap((x, i) => shape(x, `${path}[${i}]`))]
  : v && typeof v === 'object'
    ? Object.keys(v).sort().flatMap((k) => shape(v[k], `${path}.${k}`))
    : [`${path}:${typeof v}`];
let enShape = null;
for (const l of LOCALES) {
  const file = `tools/guides/${l.code}.json`;
  let dict;
  try { dict = JSON.parse(read(file)); } catch (e) { fail(`${file} is missing or not JSON: ${e.message}`); continue; }
  const s = shape(dict);
  if (!enShape) { enShape = s; continue; }
  const missing = enShape.filter((x) => !s.includes(x));
  const extra = s.filter((x) => !enShape.includes(x));
  if (missing.length || extra.length) {
    fail(`${file} does not match en.json:\n  ` +
      [...missing.map((x) => `missing ${x}`), ...extra.map((x) => `extra ${x}`)].slice(0, 12).join('\n  '));
  }
}

/* The pages and the sitemap are output. A dictionary edit without a rebuild would
   ship the old words, so the build runs in check mode here. */
try {
  execFileSync(process.execPath, [new URL('./build-guides.mjs', import.meta.url).pathname, '--check'], { stdio: 'pipe' });
} catch (e) {
  fail(`the guide pages are stale: ${e.stderr?.toString().trim()}`);
}

/* ---- 6d. what an agent reads: without JavaScript, and in the accessibility tree ---- */

/* What a reader that runs no script gets from <main>, in visible characters: no
   scripts, no tags, no spaces. Characters rather than words, because Japanese and
   Chinese do not put spaces between words. */
const mainText = (src) => (/<main\b[^>]*>([\s\S]*?)<\/main>/.exec(src)?.[1] ?? '')
  .replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, '').length;

/* An assistant handed a shared link fetches it without running anything. Those pages
   are drawn by script, so each carries a note saying where its data can be read with a
   plain GET, and the addresses there are the ones llms.txt gives. */
const STORAGE = 'https://homeserver.pubky.app/storage/';
for (const page of ['deck/index.html', 'profile/index.html', 'recap/index.html']) {
  const note = /<section[^>]*id="agent-note"[^>]*>([\s\S]*?)<\/section>/.exec(pages[page])?.[1];
  if (!note) { fail(`${page} lacks the #agent-note section that explains how to read it without JavaScript`); continue; }
  if (!note.includes(STORAGE)) fail(`${page}'s #agent-note does not give a ${STORAGE} address`);
  if (!note.includes('llms.txt')) fail(`${page}'s #agent-note does not point to llms.txt`);
}
{
  const deckNote = pages['deck/index.html'];
  const manifest = `${STORAGE}{author}/pub/loopky/decks/{id}/manifest.json`;
  if (!deckNote.includes(manifest)) fail(`deck/index.html's note no longer gives ${manifest}`);
  if (!read('llms.txt').includes(manifest)) fail(`llms.txt does not give the deck address ${manifest} the deck page gives`);
}

/* Every indexable page says something on its own. The share pages are noindex and
   are covered by their notes above. */
for (const [page, src] of Object.entries({ 'index.html': html, ...homes, ...guides, ...legal, ...learn })) {
  const n = mainText(src);
  if (n < 300) fail(`${page} has ${n} characters in <main> without JavaScript; a crawler or an assistant reads next to nothing`);
}

/* Discover is live, so the home pages ship a snapshot of decks in the grid for
   whoever reads them before, or without, the network. */
{
  const featured = JSON.parse(read('tools/featured-decks.json'));
  if (!Array.isArray(featured.decks) || featured.decks.length < 6) {
    fail('tools/featured-decks.json holds fewer than 6 decks; run node tools/fetch-featured.mjs');
  }
  for (const [page, src] of Object.entries({ 'index.html': html, ...homes })) {
    const grid = /<!-- featured -->([\s\S]*?)<!-- \/featured -->/.exec(src)?.[1];
    if (grid === undefined) { fail(`${page} lost the <!-- featured --> markers in #disc-grid`); continue; }
    if ((grid.match(/<a class="deck"/g) ?? []).length < 6) fail(`${page} ships fewer than 6 featured decks in Discover`);
  }
}

/* The accessibility tree is what a browser agent reads, and it is built from names.
   A control with no label, an emoji icon read out as text, and two buttons with the
   same name are all things an agent has to guess around. Only the markup is checked
   here; app.js names the buttons it builds (the copy buttons say what they copy). */
for (const [page, src] of Object.entries(everyPage)) {
  const labelled = new Set([...src.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)].map((m) => m[1]));
  for (const m of src.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
    const attrs = m[2];
    if (/\btype="hidden"/.test(attrs) || /\baria-label(ledby)?="/.test(attrs)) continue;
    const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
    /* A control inside its <label> is named by it. */
    const before = src.slice(0, m.index);
    const wrapped = before.lastIndexOf('<label') > before.lastIndexOf('</label>');
    if (!wrapped && !(id && labelled.has(id))) fail(`${page} has a <${m[1]}${id ? ` id="${id}"` : ''}> with no label`);
  }
  for (const m of src.matchAll(/<span class="ico\b[^"]*"([^>]*)>/g)) {
    if (!/aria-hidden="true"/.test(m[1])) { fail(`${page} has an icon <span class="ico"> that is not aria-hidden`); break; }
  }
  const names = {};
  for (const m of src.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const name = /\baria-label="([^"]*)"/.exec(m[1])?.[1] ?? m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!name) { fail(`${page} has a <button> with no name`); continue; }
    if (names[name]) fail(`${page} has two buttons named "${name}"; give them aria-labels that say what each does`);
    names[name] = true;
  }
}

/* The connector is found in Claude's directory. A line that only says "add a custom
   connector" sends people the long way round, and a model quotes the line it read. */
for (const f of ['llms.txt', 'llms-full.txt']) {
  for (const line of read(f).split('\n')) {
    if (/custom connector/i.test(line) && !line.includes('claude.ai/directory/loopky')) {
      fail(`${f} tells people to add a custom connector without naming the connector directory: "${line.slice(0, 80)}…"`);
    }
  }
}

/* ---- 7. copy rules ---- */

/* Em and en dashes read as machine-written, and the app's own strings avoid them.
   Only the parts a visitor reads are checked; source comments are free to use them. */
for (const [page, src] of Object.entries(everyPage)) {
  /* The policy is PRIVACY.md word for word, and that file is not written here. */
  if (page === 'privacy/index.html') continue;
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

/* ---- WebMCP tools (#39) ---- */

/* webmcp.js runs against a stub modelContext, which records what it registers. Every
   tool needs the four fields an agent reads, and the calls below are the ones that
   must be refused before anything reaches the network. */
{
  const registered = [];
  const stub = { registerTool: (tool, opts) => { registered.push({ tool, opts }); return Promise.resolve(); } };
  const fakeWindow = {
    loopkyPlayUrl: 'https://play.google.com/store/apps/details?id=com.github.jvsena42.loopky',
    loopkyPrompt: { build: (r) => aiPrompt(r), fill: () => '' },
    loopkyDiscover: {},
  };
  try {
    new Function('document', 'window', 'location',
      i18nSrc + '\n' + read('assets/js/discover.js') + '\n' + read('assets/js/webmcp.js'))(
      { modelContext: stub }, fakeWindow, { origin: 'https://loopky.app' });
  } catch (e) {
    fail(`assets/js/webmcp.js threw while registering: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 0));

  const WANT = ['search_decks', 'get_deck', 'build_ai_prompt', 'get_app_links', 'show_decks', 'fill_ai_request'];
  const byName = Object.fromEntries(registered.map(({ tool }) => [tool.name, tool]));
  for (const name of WANT) if (!byName[name]) fail(`webmcp.js does not register ${name}`);
  for (const { tool, opts } of registered) {
    const n = tool.name || '(unnamed)';
    if (!/^[a-z_]+$/.test(tool.name ?? '')) fail(`a WebMCP tool has no snake_case name: ${n}`);
    if (typeof tool.description !== 'string' || tool.description.length < 20) fail(`WebMCP ${n} has no description`);
    if (tool.inputSchema?.type !== 'object') fail(`WebMCP ${n} has no object inputSchema`);
    if (!tool.annotations || typeof tool.annotations.readOnlyHint !== 'boolean') fail(`WebMCP ${n} does not say whether it is read-only`);
    if (typeof tool.execute !== 'function') fail(`WebMCP ${n} has no execute`);
    if (!(opts?.signal)) fail(`WebMCP ${n} is registered without an AbortSignal`);
    if (/untrusted|strangers|Loopky users/i.test(tool.description) !== Boolean(tool.annotations?.untrustedContentHint)) {
      fail(`WebMCP ${n}: a tool returning deck text must carry untrustedContentHint and say so in its description, and only those`);
    }
  }

  const refused = [
    ['get_deck', { author: 'nope', id: 'x' }],
    ['get_deck', { author: 'y'.repeat(52), id: '..' }],
    ['get_deck', {}],
    ['search_decks', { limit: 51 }],
    ['search_decks', { limit: 2.5 }],
    ['search_decks', { topics: 'japanese' }],
    ['search_decks', { query: 7 }],
    ['build_ai_prompt', { request: '   ' }],
    ['fill_ai_request', { idea: 'cooking' }],
    ['fill_ai_request', {}],
    ['show_decks', { topics: [''] }],
  ];
  for (const [name, args] of refused) {
    if (!byName[name]) continue;
    const r = await byName[name].execute(args, { signal: new AbortController().signal });
    if (!r?.isError) fail(`WebMCP ${name} accepted ${JSON.stringify(args)}; it should answer isError`);
  }
  if (byName.build_ai_prompt) {
    const r = await byName.build_ai_prompt.execute({ request: 'Ten Italian verbs' }, { signal: new AbortController().signal });
    const prompt = JSON.parse(r?.content?.[0]?.text ?? '{}').prompt;
    if (prompt !== aiPrompt('Ten Italian verbs')) fail('WebMCP build_ai_prompt does not return aiPrompt()');
  }

  /* The origin-trial token is what turns the tools on outside a flagged browser. It
     lapses silently, so its payload is read here: one token on every home page, for
     this site's origin and the WebMCP feature, failing once expired and noted a
     month ahead. The payload is the JSON after the 69-byte signature header. */
  const tokens = Object.entries({ 'index.html': html, ...homes }).map(([page, src]) =>
    [page, /<meta http-equiv="origin-trial" content="([^"]+)">/.exec(src)?.[1]]);
  for (const [page, t] of tokens) if (!t) fail(`${page} carries no WebMCP origin-trial token`);
  const token = tokens[0][1];
  if (token && tokens.some(([, t]) => t !== token)) fail('the home pages carry different origin-trial tokens; rebuild with node tools/build-guides.mjs');
  if (token) {
    let payload = null;
    try { payload = JSON.parse(Buffer.from(token, 'base64').subarray(69).toString('utf8')); } catch { /* reported below */ }
    if (!payload) fail('the origin-trial token in index.html does not decode');
    else {
      const days = Math.floor((payload.expiry * 1000 - Date.now()) / 86400000);
      const when = new Date(payload.expiry * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
      if (payload.feature !== 'WebMCP') fail(`the origin-trial token is for ${payload.feature}, not WebMCP`);
      if (canonical && new URL(payload.origin).origin !== new URL(canonical).origin) {
        fail(`the origin-trial token is for ${payload.origin}, not ${new URL(canonical).origin}`);
      }
      if (days < 0) fail(`the WebMCP origin-trial token expired on ${when}; renew it (README: WebMCP)`);
      else if (days < 30) note(`the WebMCP origin-trial token expires on ${when}, in ${days} days; renew it (README: WebMCP)`);
    }
  }

  /* Loaded after app.js on every home page, since it reads what app.js exposes. */
  for (const [page, src] of Object.entries({ 'index.html': html, ...homes })) {
    const at = src.search(/assets\/js\/webmcp\.js\?v=/);
    if (at === -1) fail(`${page} does not load assets/js/webmcp.js`);
    else if (at < src.search(/assets\/js\/app\.js\?v=/)) fail(`${page} loads webmcp.js before app.js`);
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
