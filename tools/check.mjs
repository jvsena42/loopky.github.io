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

const problems = [];
const notes = [];
const fail = (m) => problems.push(m);
const note = (m) => notes.push(m);

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const html = read('index.html');

/* ---- 1. every script parses ---- */

const scripts = ['assets/js/i18n.js', 'assets/js/discover.js', 'assets/js/app.js'];
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
    const ALLOW_SAME = new Set(['foot.play', 'disc.topics', 'it:foot.privacy']);
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

  /* ---- 3. the page and the dictionaries agree ---- */

  const used = new Set([...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]));
  /* Keys the scripts reach for directly, which never appear as an attribute. */
  const fromJs = new Set();
  for (const f of ['assets/js/app.js']) {
    for (const m of read(f).matchAll(/\bt\('([^']+)'\)/g)) fromJs.add(m[1]);
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

const refs = new Set([
  ...[...html.matchAll(/(?:src|href)="(?!https?:|#|mailto:|data:)([^"]+)"/g)].map((m) => m[1]),
]);
for (const ref of refs) {
  const path = ref.split(/[?#]/)[0];
  if (!path) continue;
  if (!existsSync(new URL('../' + path, import.meta.url))) {
    fail(`index.html points at ${path}, which is not in the repository`);
  }
}

/* ---- 6. the things GitHub Pages and crawlers need ---- */

for (const f of ['.nojekyll', 'robots.txt', 'sitemap.xml']) {
  if (!existsSync(new URL('../' + f, import.meta.url))) fail(`${f} is missing`);
}

const sitemap = read('sitemap.xml');
for (const lang of SUPPORTED) {
  if (!sitemap.includes(`hreflang="${lang}"`)) fail(`sitemap.xml has no hreflang for "${lang}"`);
  if (!html.includes(`hreflang="${lang}"`)) fail(`index.html has no hreflang link for "${lang}"`);
  if (!html.includes(`<option value="${lang}">`)) fail(`the language picker is missing "${lang}"`);
}
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (locs.length !== SUPPORTED.length + 1) {
  fail(`sitemap.xml lists ${locs.length} URLs, expected ${SUPPORTED.length + 1}`);
}

/* ---- 7. copy rules ---- */

/* Em and en dashes read as machine-written, and the app's own strings avoid them.
   Only the parts a visitor reads are checked; source comments are free to use them. */
const visible = html.replace(/<!--[\s\S]*?-->/g, '');
if (/[—–]/.test(visible)) fail('index.html has an em or en dash in visible copy');
if (I18N) {
  for (const [lang, dict] of Object.entries(I18N)) {
    for (const [key, value] of Object.entries(dict)) {
      const text = Array.isArray(value) ? value.join(' ') : String(value);
      if (/[—–]/.test(text)) fail(`"${lang}" has an em or en dash in ${key}`);
    }
  }
}

/* ---- 8. no network value may reach innerHTML ---- */

for (const f of ['assets/js/discover.js', 'assets/js/app.js']) {
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
